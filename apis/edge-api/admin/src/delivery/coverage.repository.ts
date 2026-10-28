// Maintains the list (`delivery_zone_postcode`) and its optional groups (`delivery_zone`); it does not
// decide coverage, which is `coverageForPostcode`. Every mutation writes its audit row in the same
// transaction, with before and after.
import type pg from "pg";

import { limitOffsetClause, orderBy, prefixPattern, query, runOffsetPage, withTransaction } from "@effy/edge-shared";

import { COVERAGE_LIST, type CoverageListRequest } from "./coverage.list";

type Client = pg.PoolClient;

const AUDIT_TARGET = "coverage";

async function audit(client: Client, actorSub: string, action: string, detail: Record<string, unknown>, targetId: string | null = null): Promise<void> {
  await client.query(
    `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail) VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [actorSub, action, AUDIT_TARGET, targetId, JSON.stringify(detail)],
  );
}

/**
 * Drivers who could take a delivery to a group (`groupId` null: ungrouped postcodes), by the planner's
 * rule: a clearance covers the group it names, or every group when it names none.
 */
const DRIVERS_FOR = (groupExpr: string): string => `
  (SELECT count(DISTINCT d.id)
     FROM public.driver_zone_capability c
     JOIN public.driver d ON d.id = c.driver_id
    WHERE c.function = 'delivery' AND d.status = 'active'
      AND (c.zone_id IS NULL OR c.zone_id = ${groupExpr}))`;

export interface PostcodeRow {
  postcode: string;
  places: string[];
  state: string | null;
  groupId: string | null;
  distanceKm: string;
  distanceSource: "computed" | "manual";
  needsReview: boolean;
  todayOffered: boolean;
}

/** Most addresses first; the first stands for the postcode. */
const PLACES = `
  (SELECT array_agg(l.name ORDER BY l.address_count DESC, l.name) FROM public.locality l WHERE l.postcode = zp.postcode)`;
const STATE = `
  (SELECT l.state FROM public.locality l WHERE l.postcode = zp.postcode ORDER BY l.address_count DESC, l.name LIMIT 1)`;

/** One page of the postcode list with its exact total (103). */
export async function listPostcodes(req: CoverageListRequest): Promise<{ rows: PostcodeRow[]; total: number; page: number }> {
  const f = req.filters;
  const r = await runOffsetPage(req, async (read) => {
    const where: string[] = [];
    const args: unknown[] = [];
    const arg = (v: unknown): string => `$${args.push(v)}`;

    if (f.group === "none") where.push(`z.id IS NULL`);
    else if (f.group) where.push(`z.id = ${arg(f.group)}::uuid`);
    if (f.source) where.push(`zp.distance_source = ${arg(f.source)}`);
    if (f.review) where.push(`zp.distance_review`);
    if (f.today) where.push(`zp.today_offered = ${arg(f.today === "offered")}`);
    if (f.minKm !== undefined) where.push(`zp.distance_km >= ${arg(f.minKm)}::numeric`);
    if (req.q) {
      // A number is a postcode prefix (delivery_zone_postcode_prefix_idx); words are a place-name prefix.
      where.push(
        /^[0-9]+$/.test(req.q)
          ? `zp.postcode LIKE ${arg(prefixPattern(req.q))}`
          : `EXISTS (SELECT 1 FROM public.locality l WHERE l.postcode = zp.postcode AND lower(l.name) LIKE lower(${arg(prefixPattern(req.q))}))`,
      );
    }
    const paging = limitOffsetClause(read, args);
    const res = await query<{
      postcode: string; places: string[] | null; state: string | null; group_id: string | null;
      distance_km: string; distance_source: "computed" | "manual"; distance_review: boolean; today_offered: boolean;
      full_count: string;
    }>(
      `SELECT zp.postcode, ${PLACES} AS places, ${STATE} AS state, z.id::text AS group_id,
              zp.distance_km::text AS distance_km, zp.distance_source, zp.distance_review, zp.today_offered,
              count(*) OVER () AS full_count
         FROM public.delivery_zone_postcode zp
         -- A removed group ('disabled') is no group: its postcodes read as ungrouped.
         LEFT JOIN public.delivery_zone z ON z.id = zp.zone_id AND z.status = 'active'
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ${orderBy(COVERAGE_LIST, req)}
        ${paging}`,
      args,
    );
    return res.rows;
  });
  return {
    rows: r.rows.map((x) => ({
      postcode: x.postcode,
      places: x.places ?? [],
      state: x.state,
      groupId: x.group_id,
      distanceKm: x.distance_km,
      distanceSource: x.distance_source,
      needsReview: x.distance_review,
      todayOffered: x.today_offered,
    })),
    total: r.total,
    page: r.page,
  };
}

export interface GroupRow { id: string; name: string; postcodeCount: number; driverCount: number }

export async function listGroups(): Promise<GroupRow[]> {
  const res = await query<{ id: string; name: string; n: string; drivers: string }>(
    `SELECT z.id::text AS id, z.name,
            (SELECT count(*) FROM public.delivery_zone_postcode zp WHERE zp.zone_id = z.id)::text AS n,
            ${DRIVERS_FOR("z.id")}::text AS drivers
       FROM public.delivery_zone z
      WHERE z.status = 'active'
      ORDER BY z.name`,
  );
  return res.rows.map((r) => ({ id: r.id, name: r.name, postcodeCount: Number(r.n), driverCount: Number(r.drivers) }));
}

export interface Totals {
  listed: number; manualDistance: number; needsReview: number;
  ungrouped: number; ungroupedDrivers: number;
  todayNotOffered: number;
}

export async function totals(): Promise<Totals> {
  const r = (
    await query<{ listed: string; manual: string; review: string; ungrouped: string; drivers: string; not_today: string }>(
      `SELECT count(*)::text AS listed,
              count(*) FILTER (WHERE zp.distance_source = 'manual')::text AS manual,
              count(*) FILTER (WHERE zp.distance_review)::text AS review,
              count(*) FILTER (WHERE z.id IS NULL)::text AS ungrouped,
              count(*) FILTER (WHERE NOT zp.today_offered)::text AS not_today,
              ${DRIVERS_FOR("NULL::uuid")}::text AS drivers
         FROM public.delivery_zone_postcode zp
         LEFT JOIN public.delivery_zone z ON z.id = zp.zone_id AND z.status = 'active'`,
    )
  ).rows[0]!;
  return {
    listed: Number(r.listed), manualDistance: Number(r.manual), needsReview: Number(r.review),
    ungrouped: Number(r.ungrouped), ungroupedDrivers: Number(r.drivers),
    todayNotOffered: Number(r.not_today),
  };
}

export async function driversFor(groupId: string | null): Promise<number> {
  const res = await query<{ n: string }>(`SELECT ${DRIVERS_FOR("$1::uuid")}::text AS n`, [groupId]);
  return Number(res.rows[0]?.n ?? 0);
}

export interface CourierSettings {
  offered: boolean;
  whenNoWindows: boolean;
  collectionDefault: "hub" | "supplier";
  defaultService: { id: string; label: string; estimateText: string } | null;
  /** `public.courier_delivery_state`, asked, never rebuilt. */
  state: "courier_off" | "courier_not_ready" | "courier_offered";
}

export async function courierSettings(): Promise<CourierSettings> {
  const row = (
    await query<{
      courier_offered: boolean; courier_when_no_windows: boolean; state: CourierSettings["state"];
      courier_collection_default: "hub" | "supplier"; default_id: string | null; default_label: string | null; default_estimate: string | null;
    }>(
      `SELECT s.courier_offered, s.courier_when_no_windows, s.courier_collection_default,
              public.courier_delivery_state() AS state,
              d.id::text AS default_id, d.courier_name || ' · ' || d.service_name AS default_label, d.estimate_text AS default_estimate
         FROM public.delivery_settings s
    LEFT JOIN public.courier_service d ON d.is_default AND d.status = 'active'
        WHERE s.id = 1`,
    )
  ).rows[0];
  return {
    offered: row?.courier_offered ?? false,
    whenNoWindows: row?.courier_when_no_windows ?? false,
    collectionDefault: row?.courier_collection_default ?? "hub",
    defaultService: row?.default_id ? { id: row.default_id, label: row.default_label!, estimateText: row.default_estimate! } : null,
    state: row?.state ?? "courier_off",
  };
}

export interface ExclusionRow { postcode: string; places: string[]; reason: string }

export async function listExclusions(): Promise<ExclusionRow[]> {
  const res = await query<{ postcode: string; places: string[] | null; reason: string }>(
    `SELECT x.postcode, x.reason,
            (SELECT array_agg(l.name ORDER BY l.address_count DESC, l.name) FROM public.locality l WHERE l.postcode = x.postcode) AS places
       FROM public.courier_excluded_postcode x
      ORDER BY x.postcode`,
  );
  return res.rows.map((r) => ({ postcode: r.postcode, places: r.places ?? [], reason: r.reason }));
}

export interface PlaceResult {
  postcode: string; state: string | null; matched: string; places: string[];
  listed: boolean; computedDistanceKm: string | null;
}

/** One result per postcode. `lower(name) LIKE … || '%'` uses `locality_name_prefix_idx`. */
export async function searchPlaces(q: string, limit: number): Promise<PlaceResult[]> {
  const byPostcode = /^[0-9]+$/.test(q);
  const res = await query<{
    postcode: string; state: string | null; matched: string; places: string[]; listed: boolean; km: string | null;
  }>(
    `WITH hit AS (
       SELECT DISTINCT ON (l.postcode) l.postcode, l.name AS matched
         FROM public.locality l
        WHERE ${byPostcode ? `l.postcode LIKE $1 || '%'` : `lower(l.name) LIKE lower($1) || '%'`}
        ORDER BY l.postcode, l.address_count DESC, l.name
     )
     SELECT h.postcode, h.matched,
            (SELECT l.state FROM public.locality l WHERE l.postcode = h.postcode ORDER BY l.address_count DESC, l.name LIMIT 1) AS state,
            (SELECT array_agg(l.name ORDER BY l.address_count DESC, l.name) FROM public.locality l WHERE l.postcode = h.postcode) AS places,
            EXISTS (SELECT 1 FROM public.delivery_zone_postcode zp WHERE zp.postcode = h.postcode) AS listed,
            public.coverage_computed_distance_km(h.postcode)::text AS km
       FROM hit h
      ORDER BY h.matched, h.postcode
      LIMIT $2`,
    [q, limit],
  );
  return res.rows.map((r) => ({
    postcode: r.postcode, state: r.state, matched: r.matched, places: r.places, listed: r.listed, computedDistanceKm: r.km,
  }));
}

export async function postcodeFacts(postcodes: string[]): Promise<Map<string, { known: boolean; listed: boolean; computedKm: string | null }>> {
  const res = await query<{ postcode: string; known: boolean; listed: boolean; km: string | null }>(
    `SELECT p.postcode,
            EXISTS (SELECT 1 FROM public.locality l WHERE l.postcode = p.postcode) AS known,
            EXISTS (SELECT 1 FROM public.delivery_zone_postcode zp WHERE zp.postcode = p.postcode) AS listed,
            public.coverage_computed_distance_km(p.postcode)::text AS km
       FROM unnest($1::text[]) AS p (postcode)`,
    [postcodes],
  );
  return new Map(res.rows.map((r) => [r.postcode, { known: r.known, listed: r.listed, computedKm: r.km }]));
}

export async function placesOf(postcode: string): Promise<{ places: string[]; state: string | null }> {
  const res = await query<{ name: string; state: string }>(
    `SELECT name, state FROM public.locality WHERE postcode = $1 ORDER BY address_count DESC, name`,
    [postcode],
  );
  return { places: res.rows.map((r) => r.name), state: res.rows[0]?.state ?? null };
}

export async function postcodesForPlace(name: string, limit: number): Promise<string[]> {
  const res = await query<{ postcode: string }>(
    `SELECT DISTINCT postcode FROM public.locality WHERE lower(name) LIKE lower($1) || '%' ORDER BY postcode LIMIT $2`,
    [name, limit],
  );
  return res.rows.map((r) => r.postcode);
}

export async function listedRow(postcode: string): Promise<{ distanceSource: "computed" | "manual" } | null> {
  const res = await query<{ distance_source: "computed" | "manual" }>(
    `SELECT distance_source FROM public.delivery_zone_postcode WHERE postcode = $1`,
    [postcode],
  );
  return res.rows[0] ? { distanceSource: res.rows[0].distance_source } : null;
}

export async function exclusionReason(postcode: string): Promise<string | null> {
  const res = await query<{ reason: string }>(`SELECT reason FROM public.courier_excluded_postcode WHERE postcode = $1`, [postcode]);
  return res.rows[0]?.reason ?? null;
}

export async function groupById(id: string): Promise<{ id: string; name: string } | null> {
  const res = await query<{ id: string; name: string }>(
    `SELECT id::text AS id, name FROM public.delivery_zone WHERE id = $1::uuid AND status = 'active'`,
    [id],
  );
  return res.rows[0] ?? null;
}

export async function groupNameTaken(name: string, exceptId: string | null): Promise<boolean> {
  const res = await query(
    `SELECT 1 FROM public.delivery_zone
      WHERE lower(name) = lower($1) AND status = 'active' AND ($2::uuid IS NULL OR id <> $2::uuid)`,
    [name, exceptId],
  );
  return (res.rowCount ?? 0) > 0;
}

export interface NewPostcode { postcode: string; distanceKm: string; source: "computed" | "manual" }

/** One row per postcode (unique); says which were added. */
export async function addPostcodes(items: NewPostcode[], groupId: string | null, todayOffered: boolean, actorSub: string): Promise<string[]> {
  return withTransaction(async (client) => {
    const added: string[] = [];
    for (const item of items) {
      const res = await client.query(
        `INSERT INTO public.delivery_zone_postcode (zone_id, postcode, distance_km, distance_source, today_offered, added_by)
         VALUES ($1::uuid, $2, $3::numeric, $4, $5, $6)
         ON CONFLICT (postcode) DO NOTHING`,
        [groupId, item.postcode, item.distanceKm, item.source, todayOffered, actorSub],
      );
      if ((res.rowCount ?? 0) > 0) {
        added.push(item.postcode);
        await audit(client, actorSub, "coverage.postcode.add", {
          postcode: item.postcode,
          before: null,
          after: { groupId, distanceKm: item.distanceKm, distanceSource: item.source, todayOffered },
        });
      }
    }
    return added;
  });
}

/** `false` when not listed. Orders already placed never read the list. */
export async function removePostcode(postcode: string, actorSub: string): Promise<boolean> {
  return withTransaction(async (client) => {
    const res = await client.query<{ zone_id: string | null; distance_km: string; distance_source: string }>(
      `DELETE FROM public.delivery_zone_postcode WHERE postcode = $1
       RETURNING zone_id::text AS zone_id, distance_km::text AS distance_km, distance_source`,
      [postcode],
    );
    const was = res.rows[0];
    if (!was) return false;
    await audit(client, actorSub, "coverage.postcode.remove", {
      postcode,
      before: { groupId: was.zone_id, distanceKm: was.distance_km, distanceSource: was.distance_source },
      after: null,
    });
    return true;
  });
}

/** Returns how many moved. */
export async function assignGroup(postcodes: string[], groupId: string | null, actorSub: string): Promise<number> {
  return withTransaction(async (client) => {
    const before = await client.query<{ postcode: string; zone_id: string | null }>(
      `SELECT postcode, zone_id::text AS zone_id FROM public.delivery_zone_postcode WHERE postcode = ANY($1::text[]) FOR UPDATE`,
      [postcodes],
    );
    const res = await client.query(
      `UPDATE public.delivery_zone_postcode SET zone_id = $2::uuid, updated_at = now()
        WHERE postcode = ANY($1::text[]) AND zone_id IS DISTINCT FROM $2::uuid`,
      [postcodes, groupId],
    );
    if ((res.rowCount ?? 0) > 0) {
      await audit(client, actorSub, "coverage.postcode.group", {
        before: Object.fromEntries(before.rows.map((r) => [r.postcode, r.zone_id])),
        after: groupId,
      }, groupId);
    }
    return res.rowCount ?? 0;
  });
}

/**
 * All or nothing (`"not_listed"`). Unchanged postcodes are not audited; one audit row records the rest.
 * Places already held and orders already placed keep what they bought.
 */
export async function setTodayOffered(postcodes: string[], offered: boolean, actorSub: string): Promise<"not_listed" | number> {
  return withTransaction(async (client) => {
    const before = await client.query<{ postcode: string; today_offered: boolean }>(
      `SELECT postcode, today_offered FROM public.delivery_zone_postcode WHERE postcode = ANY($1::text[]) FOR UPDATE`,
      [postcodes],
    );
    if (before.rows.length < postcodes.length) return "not_listed";
    const changing = before.rows.filter((r) => r.today_offered !== offered);
    if (changing.length === 0) return 0;
    await client.query(
      `UPDATE public.delivery_zone_postcode SET today_offered = $2, updated_at = now() WHERE postcode = ANY($1::text[])`,
      [changing.map((r) => r.postcode), offered],
    );
    await audit(client, actorSub, "coverage.postcode.today", {
      before: Object.fromEntries(changing.map((r) => [r.postcode, r.today_offered])),
      after: offered,
    });
    return changing.length;
  });
}

export type DistanceChange = { source: "manual"; km: string } | { source: "computed" };

/** Saving clears the review flag. */
export async function setDistance(postcode: string, change: DistanceChange, actorSub: string): Promise<"not_listed" | "not_computable" | { km: string }> {
  return withTransaction(async (client) => {
    const cur = (
      await client.query<{ distance_km: string; distance_source: string }>(
        `SELECT distance_km::text AS distance_km, distance_source FROM public.delivery_zone_postcode WHERE postcode = $1 FOR UPDATE`,
        [postcode],
      )
    ).rows[0];
    if (!cur) return "not_listed";

    let km: string;
    if (change.source === "manual") {
      km = change.km;
    } else {
      const computed = (await client.query<{ km: string | null }>(`SELECT public.coverage_computed_distance_km($1)::text AS km`, [postcode])).rows[0]?.km ?? null;
      if (computed === null) return "not_computable";
      km = computed;
    }
    const saved = (
      await client.query<{ km: string }>(
        `UPDATE public.delivery_zone_postcode
            SET distance_km = $2::numeric, distance_source = $3, distance_review = false, updated_at = now()
          WHERE postcode = $1
          RETURNING distance_km::text AS km`,
        [postcode, km, change.source],
      )
    ).rows[0]!;
    await audit(client, actorSub, "coverage.postcode.distance", {
      postcode,
      before: { distanceKm: cur.distance_km, distanceSource: cur.distance_source },
      after: { distanceKm: saved.km, distanceSource: change.source },
    });
    return { km: saved.km };
  });
}

/** `code` is unique and never shown, derived from the name with a suffix. */
export async function createGroup(name: string, actorSub: string): Promise<string> {
  return withTransaction(async (client) => {
    const res = await client.query<{ id: string }>(
      `INSERT INTO public.delivery_zone (code, name, status, updated_by)
       VALUES (upper(regexp_replace($1, '[^A-Za-z0-9]+', '-', 'g')) || '-' || substr(gen_random_uuid()::text, 1, 8),
               $1, 'active', $2)
       RETURNING id::text AS id`,
      [name, actorSub],
    );
    const id = res.rows[0]!.id;
    await audit(client, actorSub, "coverage.group.create", { before: null, after: { name } }, id);
    return id;
  });
}

export async function renameGroup(id: string, name: string, actorSub: string): Promise<void> {
  await withTransaction(async (client) => {
    const was = (await client.query<{ name: string }>(`SELECT name FROM public.delivery_zone WHERE id = $1::uuid FOR UPDATE`, [id])).rows[0];
    await client.query(`UPDATE public.delivery_zone SET name = $2, updated_by = $3, updated_at = now() WHERE id = $1::uuid`, [id, name, actorSub]);
    await audit(client, actorSub, "coverage.group.rename", { before: { name: was?.name ?? null }, after: { name } }, id);
  });
}

/** Postcodes stay listed, ungrouped. Retired, not deleted: past rounds and clearances name the group. */
export async function removeGroup(id: string, actorSub: string): Promise<number> {
  return withTransaction(async (client) => {
    const was = (await client.query<{ name: string }>(`SELECT name FROM public.delivery_zone WHERE id = $1::uuid FOR UPDATE`, [id])).rows[0];
    const moved = await client.query<{ postcode: string }>(
      `UPDATE public.delivery_zone_postcode SET zone_id = NULL, updated_at = now() WHERE zone_id = $1::uuid RETURNING postcode`,
      [id],
    );
    await client.query(`UPDATE public.delivery_zone SET status = 'disabled', updated_by = $2, updated_at = now() WHERE id = $1::uuid`, [id, actorSub]);
    await audit(client, actorSub, "coverage.group.remove", {
      before: { name: was?.name ?? null, postcodes: moved.rows.map((r) => r.postcode).sort() },
      after: null,
    }, id);
    return moved.rowCount ?? 0;
  });
}

/** `undefined` leaves a setting as it is. */
export interface CourierChange {
  offered?: boolean;
  whenNoWindows?: boolean;
  collectionDefault?: "hub" | "supplier";
}

/** Decided under the settings row's lock. */
export type CourierRefusal = "courier_plan_missing" | "courier_service_missing";

type CourierRow = { courier_offered: boolean; courier_when_no_windows: boolean; courier_collection_default: "hub" | "supplier" };

/** Each change audited on its own; "on" needs a fee table and a default courier service, checked under the lock. */
export async function changeCourier(change: CourierChange, actorSub: string): Promise<{ refused: CourierRefusal } | { settings: Pick<CourierSettings, "offered" | "whenNoWindows" | "collectionDefault"> }> {
  return withTransaction(async (client) => {
    const was = (
      await client.query<CourierRow>(
        `SELECT courier_offered, courier_when_no_windows, courier_collection_default FROM public.delivery_settings WHERE id = 1 FOR UPDATE`,
      )
    ).rows[0];
    const before = {
      offered: was?.courier_offered ?? false,
      whenNoWindows: was?.courier_when_no_windows ?? false,
      collectionDefault: was?.courier_collection_default ?? ("hub" as const),
    };
    const after = {
      offered: change.offered ?? before.offered,
      whenNoWindows: change.whenNoWindows ?? before.whenNoWindows,
      collectionDefault: change.collectionDefault ?? before.collectionDefault,
    };

    if (after.offered && !before.offered) {
      // Never on without a price.
      const plan = await client.query(`SELECT 1 FROM public.delivery_fee_plan WHERE is_active AND kind = 'courier'`);
      if ((plan.rowCount ?? 0) === 0) return { refused: "courier_plan_missing" as const };
      // Nor without a courier service whose timeframe the customer is told.
      const service = await client.query(`SELECT 1 FROM public.courier_service WHERE is_default AND status = 'active'`);
      if ((service.rowCount ?? 0) === 0) return { refused: "courier_service_missing" as const };
    }

    await client.query(
      `UPDATE public.delivery_settings
          SET courier_offered = $1, courier_when_no_windows = $2, courier_collection_default = $3,
              updated_by = $4, updated_at = now()
        WHERE id = 1`,
      [after.offered, after.whenNoWindows, after.collectionDefault, actorSub],
    );
    if (after.offered !== before.offered) await audit(client, actorSub, "coverage.courier.switch", { before: before.offered, after: after.offered });
    if (after.whenNoWindows !== before.whenNoWindows) await audit(client, actorSub, "coverage.courier.when_no_windows", { before: before.whenNoWindows, after: after.whenNoWindows });
    if (after.collectionDefault !== before.collectionDefault) await audit(client, actorSub, "coverage.courier.collection_default", { before: before.collectionDefault, after: after.collectionDefault });
    return { settings: after };
  });
}

/** `false` when already excluded. */
export async function addExclusion(postcode: string, reason: string, actorSub: string): Promise<boolean> {
  return withTransaction(async (client) => {
    const res = await client.query(
      `INSERT INTO public.courier_excluded_postcode (postcode, reason, added_by) VALUES ($1, $2, $3) ON CONFLICT (postcode) DO NOTHING`,
      [postcode, reason, actorSub],
    );
    if ((res.rowCount ?? 0) === 0) return false;
    await audit(client, actorSub, "coverage.courier.exclude", { postcode, before: null, after: { reason } });
    return true;
  });
}

export async function removeExclusion(postcode: string, actorSub: string): Promise<boolean> {
  return withTransaction(async (client) => {
    const res = await client.query<{ reason: string }>(`DELETE FROM public.courier_excluded_postcode WHERE postcode = $1 RETURNING reason`, [postcode]);
    if (!res.rows[0]) return false;
    await audit(client, actorSub, "coverage.courier.include", { postcode, before: { reason: res.rows[0].reason }, after: null });
    return true;
  });
}

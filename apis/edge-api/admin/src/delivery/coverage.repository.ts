// Repository for Effy's delivery coverage (076). SQL only — no HTTP, no validation (Principle VI).
//
// ⚠ THE LIST IS `public.delivery_zone_postcode` AND A GROUP IS `public.delivery_zone`. The names are
// historical (047 "zones") and change at the delivery-model cutover; since 076 the first is the one
// flat list of postcodes Effy delivers to and the second is an optional label. The migration's
// header says why they were evolved in place rather than copied.
//
// ⚠ THIS FILE MAINTAINS THE LIST. IT DOES NOT DECIDE COVERAGE. "Does Effy deliver to X?" is
// `public.coverage_for_postcode`, read through `coverageForPostcode` — here, in checkout and in the
// address book alike. `coverage.guard.test.ts` lists this file among the few allowed to touch the
// table at all.
//
// ⚠ Every mutation writes an `admin.audit_log` row inside the SAME transaction as the change (009
// pattern), with what it was and what it became (FR-027).
import type pg from "pg";

import { query, withTransaction } from "@effy/edge-shared";

type Client = pg.PoolClient;

/** Target type of every coverage audit row. */
const AUDIT_TARGET = "coverage";

async function audit(client: Client, actorSub: string, action: string, detail: Record<string, unknown>, targetId: string | null = null): Promise<void> {
  await client.query(
    `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail) VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [actorSub, action, AUDIT_TARGET, targetId, JSON.stringify(detail)],
  );
}

/**
 * How many drivers could be given a delivery to a group — or, for `groupId` null, to a postcode in
 * no group.
 *
 * ⚠ THE SAME RULE THE PLANNER APPLIES (`shared/src/lib/driver-eligibility.ts`): a clearance covers a
 * group it names, or every group when it names none. An ungrouped postcode matches only the second.
 * Until the driver-operations feature (E8) this is the one way a group is more than a label, which
 * is why the console shows the number and asks before leaving postcodes with zero.
 */
const DRIVERS_FOR = (groupExpr: string): string => `
  (SELECT count(DISTINCT d.id)
     FROM public.driver_zone_capability c
     JOIN public.driver d ON d.id = c.driver_id
    WHERE c.function = 'delivery' AND d.status = 'active'
      AND (c.zone_id IS NULL OR c.zone_id = ${groupExpr}))`;

// ── reads ───────────────────────────────────────────────────────────────────────────────────────

export interface PostcodeRow {
  postcode: string;
  places: string[];
  state: string | null;
  groupId: string | null;
  distanceKm: string;
  distanceSource: "computed" | "manual";
  needsReview: boolean;
}

export interface ListFilters {
  /** A group id, `"none"` for postcodes in no group, or undefined for all. */
  group?: string;
  /** A postcode prefix (digits) or a place-name prefix. */
  q?: string;
  source?: "computed" | "manual";
  review?: boolean;
  /** Keyset: the last postcode of the previous page. */
  after?: string;
  limit: number;
}

/** Places of a postcode, most addresses first — the first is the one that stands for it. */
const PLACES = `
  (SELECT array_agg(l.name ORDER BY l.address_count DESC, l.name) FROM public.locality l WHERE l.postcode = zp.postcode)`;
const STATE = `
  (SELECT l.state FROM public.locality l WHERE l.postcode = zp.postcode ORDER BY l.address_count DESC, l.name LIMIT 1)`;

export async function listPostcodes(f: ListFilters): Promise<PostcodeRow[]> {
  const where: string[] = [];
  const args: unknown[] = [];
  const arg = (v: unknown): string => `$${args.push(v)}`;

  if (f.group === "none") where.push(`z.id IS NULL`);
  else if (f.group) where.push(`z.id = ${arg(f.group)}::uuid`);
  if (f.source) where.push(`zp.distance_source = ${arg(f.source)}`);
  if (f.review) where.push(`zp.distance_review`);
  if (f.after) where.push(`zp.postcode > ${arg(f.after)}`);
  if (f.q) {
    where.push(
      /^[0-9]+$/.test(f.q)
        ? `zp.postcode LIKE ${arg(f.q)} || '%'`
        : `EXISTS (SELECT 1 FROM public.locality l WHERE l.postcode = zp.postcode AND lower(l.name) LIKE lower(${arg(f.q)}) || '%')`,
    );
  }

  const res = await query<{
    postcode: string; places: string[] | null; state: string | null; group_id: string | null;
    distance_km: string; distance_source: "computed" | "manual"; distance_review: boolean;
  }>(
    `SELECT zp.postcode, ${PLACES} AS places, ${STATE} AS state, z.id::text AS group_id,
            zp.distance_km::text AS distance_km, zp.distance_source, zp.distance_review
       FROM public.delivery_zone_postcode zp
       -- A removed group ('disabled') is no group: its postcodes read as ungrouped.
       LEFT JOIN public.delivery_zone z ON z.id = zp.zone_id AND z.status = 'active'
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY zp.postcode
      LIMIT ${arg(f.limit)}`,
    args,
  );
  return res.rows.map((r) => ({
    postcode: r.postcode,
    places: r.places ?? [],
    state: r.state,
    groupId: r.group_id,
    distanceKm: r.distance_km,
    distanceSource: r.distance_source,
    needsReview: r.distance_review,
  }));
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
}

export async function totals(): Promise<Totals> {
  const r = (
    await query<{ listed: string; manual: string; review: string; ungrouped: string; drivers: string }>(
      `SELECT count(*)::text AS listed,
              count(*) FILTER (WHERE zp.distance_source = 'manual')::text AS manual,
              count(*) FILTER (WHERE zp.distance_review)::text AS review,
              count(*) FILTER (WHERE z.id IS NULL)::text AS ungrouped,
              ${DRIVERS_FOR("NULL::uuid")}::text AS drivers
         FROM public.delivery_zone_postcode zp
         LEFT JOIN public.delivery_zone z ON z.id = zp.zone_id AND z.status = 'active'`,
    )
  ).rows[0]!;
  return {
    listed: Number(r.listed), manualDistance: Number(r.manual), needsReview: Number(r.review),
    ungrouped: Number(r.ungrouped), ungroupedDrivers: Number(r.drivers),
  };
}

/** Drivers who can deliver to a group, or (`null`) to ungrouped postcodes. */
export async function driversFor(groupId: string | null): Promise<number> {
  const res = await query<{ n: string }>(`SELECT ${DRIVERS_FOR("$1::uuid")}::text AS n`, [groupId]);
  return Number(res.rows[0]?.n ?? 0);
}

/** What staff have set for courier delivery, and where that leaves it right now. */
export interface CourierSettings {
  offered: boolean;
  whenNoWindows: boolean;
  /** 080 */
  collectionDefault: "hub" | "supplier";
  defaultService: { id: string; label: string; estimateText: string } | null;
  /**
   * `public.courier_delivery_state` — the one definition of whether a courier order can be placed.
   * ⚠ Asked, never rebuilt here: "pending" depends on the delivery-model switch, which has one reader.
   */
  state: "courier_off" | "courier_not_ready" | "courier_pending" | "courier_offered";
}

export async function courierSettings(): Promise<CourierSettings> {
  const row = (
    await query<{
      courier_offered: boolean; courier_when_no_windows: boolean; state: CourierSettings["state"];
      courier_collection_default: "hub" | "supplier"; default_id: string | null; default_label: string | null; default_estimate: string | null;
    }>(
      `SELECT s.courier_offered, s.courier_when_no_windows, s.courier_collection_default,
              public.courier_delivery_state(now()) AS state,
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

/**
 * The add dialog's search: places (or postcodes) → one result PER POSTCODE, because the postcode is
 * what gets listed. Two places of one name in two states are two results; two places in one
 * postcode are one.
 *
 * ⚠ `lower(name) LIKE … || '%'` is served by `locality_name_prefix_idx` (text_pattern_ops, 030).
 */
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

/** What the platform knows about some postcodes before they are added. */
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

/** Postcodes a place name resolves to (the checker accepts a name as well as a postcode). */
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

// ── writes ──────────────────────────────────────────────────────────────────────────────────────

export interface NewPostcode { postcode: string; distanceKm: string; source: "computed" | "manual" }

/** Adds what is not already listed (one row per postcode, by the UNIQUE constraint) and says which. */
export async function addPostcodes(items: NewPostcode[], groupId: string | null, actorSub: string): Promise<string[]> {
  return withTransaction(async (client) => {
    const added: string[] = [];
    for (const item of items) {
      const res = await client.query(
        `INSERT INTO public.delivery_zone_postcode (zone_id, postcode, distance_km, distance_source, added_by)
         VALUES ($1::uuid, $2, $3::numeric, $4, $5)
         ON CONFLICT (postcode) DO NOTHING`,
        [groupId, item.postcode, item.distanceKm, item.source, actorSub],
      );
      if ((res.rowCount ?? 0) > 0) {
        added.push(item.postcode);
        await audit(client, actorSub, "coverage.postcode.add", {
          postcode: item.postcode,
          before: null,
          after: { groupId, distanceKm: item.distanceKm, distanceSource: item.source },
        });
      }
    }
    return added;
  });
}

/** `false` when it was not listed. ⚠ Touches nothing but the list: an order already placed never reads it. */
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

/** Moves listed postcodes to a group, or to none. Returns how many moved. */
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

export type DistanceChange = { source: "manual"; km: string } | { source: "computed" };

/** `"not_listed"`, `"not_computable"`, or the saved distance. Saving clears the review flag. */
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

/** `code` is unique and never shown; it is derived from the name with a suffix that makes it so. */
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

/**
 * Removes a group: its postcodes stay LISTED, in no group; the row is retired, not deleted.
 *
 * ⚠ RETIRED, NOT DELETED. Past delivery rounds name the group they were ordered by
 * (`round_stop.zone_id`) and drivers hold clearances for it; deleting the row would blank the first
 * and silently drop the second. `status = 'disabled'` is what "a removed group" has meant to every
 * reader since 062, and none of them reads it to decide coverage any more.
 */
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

/** The three courier settings a person can change. `undefined` = leave as it is. */
/** The courier settings a person can change. `undefined` = leave as it is. */
export interface CourierChange {
  offered?: boolean;
  whenNoWindows?: boolean;
  /** 080 */
  collectionDefault?: "hub" | "supplier";
}

/** Why a courier change was refused — decided under the settings row's lock. */
export type CourierRefusal = "courier_plan_missing" | "courier_service_missing";

type CourierRow = { courier_offered: boolean; courier_when_no_windows: boolean; courier_collection_default: "hub" | "supplier" };

/**
 * Change the courier settings, each change audited on its own.
 *
 * ⚠ THE RULES ARE CHECKED HERE, UNDER THE ROW LOCK: "on only with a fee table and a default courier
 * service" is about the row as it will be (080 — the default service's timeframe replaced 079's one
 * estimate text).
 */
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
      // 077 FR-013 — never on without a price: every courier order would fail to price.
      const plan = await client.query(`SELECT 1 FROM public.delivery_fee_plan WHERE is_active AND kind = 'courier'`);
      if ((plan.rowCount ?? 0) === 0) return { refused: "courier_plan_missing" as const };
      // 080 — and never without a courier service whose timeframe the customer is told.
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

/** `false` when it was already excluded. */
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

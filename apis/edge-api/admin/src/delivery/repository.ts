// Repository layer for back-office delivery-zones & pricing: raw parameterized SQL + explicit row →
// domain mapping (constitution Principle VI, no ORM). Reads/writes the customer-operational delivery
// tables (public.delivery_zone*, public.delivery_offering, public.shop.postcode) and the back-office
// audit log (admin.audit_log, 009). Every mutation writes an audit row inside the SAME transaction
// as the change it records (FR-018). Mirrors the 009 shops/repository.ts structure.
import type { PoolClient } from "pg";

import { query, withTransaction } from "@effy/edge-shared";

import {
  type AuditEntry,
  type DeliveryError,
  DeliveryError as DeliveryErr,
  type DeliveryMethod,
  type DeliveryStatus,
  type DeliveryZone,
  type Offering,
  type Paged,
  type ShopLocation,
  type ZonePostcode,
} from "./types";

// ── Wire row shapes (internal; never exported) ───────────────────────────────────────────────

interface ZoneRow {
  id: string;
  code: string;
  name: string;
  status: DeliveryStatus;
  postcode_count: string; // pg bigint → string
  created_at: Date;
  updated_at: Date;
  total: string;
}

interface PostcodeRow {
  id: string;
  postcode: string;
  total: string;
}

interface OfferingRow {
  id: string;
  origin_zone_id: string;
  origin_zone_name: string;
  destination_zone_id: string;
  destination_zone_name: string;
  method: DeliveryMethod;
  price_amount: string; // pg numeric → string
  lead_days_min: number;
  lead_days_max: number;
  same_day_cutoff: string | null; // pg time → 'HH:MM:SS'
  status: DeliveryStatus;
  created_at: Date;
  updated_at: Date;
  total: string;
}

interface ShopLocationRow {
  id: string;
  code: string;
  name: string;
  postcode: string | null;
}

interface AuditRow {
  id: string;
  actor_sub: string;
  action: string;
  target_type: string;
  target_id: string | null;
  detail: Record<string, unknown>;
  created_at: Date;
  total: string;
}

// ── Mappers ──────────────────────────────────────────────────────────────────────────────────

function mapZone(row: ZoneRow): DeliveryZone {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.status,
    postcodeCount: Number(row.postcode_count),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapOffering(row: OfferingRow): Offering {
  return {
    id: row.id,
    originZoneId: row.origin_zone_id,
    originZoneName: row.origin_zone_name,
    destinationZoneId: row.destination_zone_id,
    destinationZoneName: row.destination_zone_name,
    method: row.method,
    priceAmount: row.price_amount,
    leadDaysMin: row.lead_days_min,
    leadDaysMax: row.lead_days_max,
    // Normalise pg 'HH:MM:SS' → the DTO's 'HH:mm'; NULL stays null.
    sameDayCutoff: row.same_day_cutoff ? row.same_day_cutoff.slice(0, 5) : null,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

// ── Audit (written inside the mutation's transaction) ────────────────────────────────────────

async function insertAudit(
  client: PoolClient,
  actorSub: string,
  action: string,
  targetType: "delivery_zone" | "delivery_offering" | "shop",
  targetId: string | null,
  detail: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail)
          VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [actorSub, action, targetType, targetId, JSON.stringify(detail)],
  );
}

// Map a Postgres unique_violation (23505) to a domain conflict, else rethrow.
function asConflict(err: unknown, message: string): DeliveryError {
  if (typeof err === "object" && err !== null && (err as { code?: string }).code === "23505") {
    return new DeliveryErr("conflict", message);
  }
  throw err;
}

// ── Zone reads ─────────────────────────────────────────────────────────────────────────────

export async function listZones(params: {
  page: number;
  pageSize: number;
  status: DeliveryStatus | null;
  q: string | null;
}): Promise<Paged<DeliveryZone>> {
  const { page, pageSize, status, q } = params;
  const res = await query<ZoneRow>(
    `SELECT z.id, z.code, z.name, z.status, z.created_at, z.updated_at,
            count(p.id) AS postcode_count,
            count(*) OVER() AS total
       FROM public.delivery_zone z
       LEFT JOIN public.delivery_zone_postcode p ON p.zone_id = z.id
      WHERE ($1::text IS NULL OR z.status = $1)
        AND ($2::text IS NULL OR z.code ILIKE '%' || $2 || '%' OR z.name ILIKE '%' || $2 || '%')
      GROUP BY z.id
      ORDER BY z.code
      LIMIT $3 OFFSET $4`,
    [status, q, pageSize, (page - 1) * pageSize],
  );
  const total = res.rows[0] ? Number(res.rows[0].total) : 0;
  return { items: res.rows.map(mapZone), total, page, pageSize };
}

/** Full zone (with postcode count). Null when the zone does not exist (→ 404). */
export async function readZone(zoneId: string): Promise<DeliveryZone | null> {
  const res = await query<ZoneRow>(
    `SELECT z.id, z.code, z.name, z.status, z.created_at, z.updated_at,
            count(p.id) AS postcode_count,
            0 AS total
       FROM public.delivery_zone z
       LEFT JOIN public.delivery_zone_postcode p ON p.zone_id = z.id
      WHERE z.id = $1
      GROUP BY z.id`,
    [zoneId],
  );
  const row = res.rows[0];
  return row ? mapZone(row) : null;
}

export async function zoneStatus(zoneId: string): Promise<DeliveryStatus | null> {
  const res = await query<{ status: DeliveryStatus }>(
    `SELECT status FROM public.delivery_zone WHERE id = $1`,
    [zoneId],
  );
  return res.rows[0]?.status ?? null;
}

export async function listZonePostcodes(
  zoneId: string,
  page: number,
  pageSize: number,
): Promise<Paged<ZonePostcode>> {
  const res = await query<PostcodeRow>(
    `SELECT id, postcode, count(*) OVER() AS total
       FROM public.delivery_zone_postcode
      WHERE zone_id = $1
      ORDER BY postcode
      LIMIT $2 OFFSET $3`,
    [zoneId, pageSize, (page - 1) * pageSize],
  );
  const total = res.rows[0] ? Number(res.rows[0].total) : 0;
  return {
    items: res.rows.map((r) => ({ id: r.id, postcode: r.postcode })),
    total,
    page,
    pageSize,
  };
}

/** The zone's change history, newest first (FR-018). */
export async function listZoneHistory(
  zoneId: string,
  page: number,
  pageSize: number,
): Promise<Paged<AuditEntry>> {
  const res = await query<AuditRow>(
    `SELECT a.id, a.actor_sub, a.action, a.target_type, a.target_id, a.detail, a.created_at,
            count(*) OVER() AS total
       FROM admin.audit_log a
      WHERE a.target_type = 'delivery_zone' AND a.target_id = $1
      ORDER BY a.created_at DESC
      LIMIT $2 OFFSET $3`,
    [zoneId, pageSize, (page - 1) * pageSize],
  );
  const total = res.rows[0] ? Number(res.rows[0].total) : 0;
  return {
    items: res.rows.map((r) => ({
      id: r.id,
      actorSub: r.actor_sub,
      action: r.action,
      targetType: r.target_type,
      targetId: r.target_id,
      detail: r.detail,
      createdAt: r.created_at.toISOString(),
    })),
    total,
    page,
    pageSize,
  };
}

// ── Zone writes ──────────────────────────────────────────────────────────────────────────────

export async function createZone(
  input: { code: string; name: string },
  actorSub: string,
): Promise<DeliveryZone> {
  const zoneId = await withTransaction(async (client) => {
    let id: string;
    try {
      const ins = await client.query<{ id: string }>(
        `INSERT INTO public.delivery_zone (code, name) VALUES ($1, $2) RETURNING id`,
        [input.code, input.name],
      );
      id = ins.rows[0]!.id;
    } catch (err) {
      throw asConflict(err, "a zone with this code already exists");
    }
    await insertAudit(client, actorSub, "delivery_zone.create", "delivery_zone", id, {
      code: input.code,
      name: input.name,
    });
    return id;
  });
  const zone = await readZone(zoneId);
  if (!zone) throw new DeliveryErr("not_found", "zone vanished after creation");
  return zone;
}

/** Rename and/or change status. Code is immutable and never touched. */
export async function updateZone(
  zoneId: string,
  values: { name: string; status: DeliveryStatus },
  actorSub: string,
): Promise<DeliveryZone> {
  await withTransaction(async (client) => {
    const res = await client.query<{ id: string }>(
      `UPDATE public.delivery_zone SET name = $2, status = $3, updated_at = now()
        WHERE id = $1 RETURNING id`,
      [zoneId, values.name, values.status],
    );
    if (!res.rows[0]) throw new DeliveryErr("not_found", "zone not found");
    await insertAudit(client, actorSub, "delivery_zone.update", "delivery_zone", zoneId, {
      name: values.name,
      status: values.status,
    });
  });
  return (await readZone(zoneId))!;
}

/** Add one or more postcodes to a zone in ONE transaction; a postcode already zoned → 409 (23505). */
export async function addZonePostcodes(
  zoneId: string,
  postcodes: string[],
  actorSub: string,
): Promise<ZonePostcode[]> {
  return withTransaction(async (client) => {
    const zone = await client.query<{ id: string }>(
      `SELECT id FROM public.delivery_zone WHERE id = $1`,
      [zoneId],
    );
    if (!zone.rows[0]) throw new DeliveryErr("not_found", "zone not found");

    const added: ZonePostcode[] = [];
    for (const postcode of postcodes) {
      try {
        const ins = await client.query<{ id: string; postcode: string }>(
          `INSERT INTO public.delivery_zone_postcode (zone_id, postcode) VALUES ($1, $2)
                RETURNING id, postcode`,
          [zoneId, postcode],
        );
        added.push({ id: ins.rows[0]!.id, postcode: ins.rows[0]!.postcode });
      } catch (err) {
        throw asConflict(err, `postcode ${postcode} already belongs to a zone`);
      }
    }
    await insertAudit(client, actorSub, "delivery_zone.postcode_add", "delivery_zone", zoneId, {
      postcodes,
    });
    return added;
  });
}

export async function removeZonePostcode(
  zoneId: string,
  postcode: string,
  actorSub: string,
): Promise<void> {
  await withTransaction(async (client) => {
    const res = await client.query<{ id: string }>(
      `DELETE FROM public.delivery_zone_postcode WHERE zone_id = $1 AND postcode = $2 RETURNING id`,
      [zoneId, postcode],
    );
    if (!res.rows[0]) throw new DeliveryErr("not_found", "postcode not found in this zone");
    await insertAudit(client, actorSub, "delivery_zone.postcode_remove", "delivery_zone", zoneId, {
      postcode,
    });
  });
}

// ── Offering reads ─────────────────────────────────────────────────────────────────────────

export async function listOfferings(params: {
  page: number;
  pageSize: number;
  originZoneId: string | null;
  destinationZoneId: string | null;
}): Promise<Paged<Offering>> {
  const { page, pageSize, originZoneId, destinationZoneId } = params;
  const res = await query<OfferingRow>(
    `SELECT o.id, o.origin_zone_id, oz.name AS origin_zone_name,
            o.destination_zone_id, dz.name AS destination_zone_name,
            o.method, o.price_amount, o.lead_days_min, o.lead_days_max,
            o.same_day_cutoff, o.status, o.created_at, o.updated_at,
            count(*) OVER() AS total
       FROM public.delivery_offering o
       JOIN public.delivery_zone oz ON oz.id = o.origin_zone_id
       JOIN public.delivery_zone dz ON dz.id = o.destination_zone_id
      WHERE ($1::uuid IS NULL OR o.origin_zone_id = $1)
        AND ($2::uuid IS NULL OR o.destination_zone_id = $2)
      ORDER BY oz.code, dz.code, o.method
      LIMIT $3 OFFSET $4`,
    [originZoneId, destinationZoneId, pageSize, (page - 1) * pageSize],
  );
  const total = res.rows[0] ? Number(res.rows[0].total) : 0;
  return { items: res.rows.map(mapOffering), total, page, pageSize };
}

async function readOffering(offeringId: string): Promise<Offering | null> {
  const res = await query<OfferingRow>(
    `SELECT o.id, o.origin_zone_id, oz.name AS origin_zone_name,
            o.destination_zone_id, dz.name AS destination_zone_name,
            o.method, o.price_amount, o.lead_days_min, o.lead_days_max,
            o.same_day_cutoff, o.status, o.created_at, o.updated_at,
            0 AS total
       FROM public.delivery_offering o
       JOIN public.delivery_zone oz ON oz.id = o.origin_zone_id
       JOIN public.delivery_zone dz ON dz.id = o.destination_zone_id
      WHERE o.id = $1`,
    [offeringId],
  );
  const row = res.rows[0];
  return row ? mapOffering(row) : null;
}

export async function offeringFields(
  offeringId: string,
): Promise<{ priceAmount: string; leadDaysMin: number; leadDaysMax: number; sameDayCutoff: string | null; status: DeliveryStatus } | null> {
  const o = await readOffering(offeringId);
  if (!o) return null;
  return {
    priceAmount: o.priceAmount,
    leadDaysMin: o.leadDaysMin,
    leadDaysMax: o.leadDaysMax,
    sameDayCutoff: o.sameDayCutoff,
    status: o.status,
  };
}

// ── Offering writes ──────────────────────────────────────────────────────────────────────────

export async function createOffering(
  input: {
    originZoneId: string;
    destinationZoneId: string;
    method: DeliveryMethod;
    priceAmount: string;
    leadDaysMin: number;
    leadDaysMax: number;
    sameDayCutoff: string | null;
  },
  actorSub: string,
): Promise<Offering> {
  const offeringId = await withTransaction(async (client) => {
    let id: string;
    try {
      const ins = await client.query<{ id: string }>(
        `INSERT INTO public.delivery_offering
              (origin_zone_id, destination_zone_id, method, price_amount,
               lead_days_min, lead_days_max, same_day_cutoff)
              VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
        [
          input.originZoneId,
          input.destinationZoneId,
          input.method,
          input.priceAmount,
          input.leadDaysMin,
          input.leadDaysMax,
          input.sameDayCutoff,
        ],
      );
      id = ins.rows[0]!.id;
    } catch (err) {
      // 23503 = FK violation → a referenced zone does not exist.
      if (typeof err === "object" && err !== null && (err as { code?: string }).code === "23503") {
        throw new DeliveryErr("not_found", "origin or destination zone not found");
      }
      throw asConflict(err, "an offering for this origin, destination, and method already exists");
    }
    await insertAudit(client, actorSub, "delivery_offering.create", "delivery_offering", id, {
      originZoneId: input.originZoneId,
      destinationZoneId: input.destinationZoneId,
      method: input.method,
      priceAmount: input.priceAmount,
    });
    return id;
  });
  const offering = await readOffering(offeringId);
  if (!offering) throw new DeliveryErr("not_found", "offering vanished after creation");
  return offering;
}

export async function updateOffering(
  offeringId: string,
  values: {
    priceAmount: string;
    leadDaysMin: number;
    leadDaysMax: number;
    sameDayCutoff: string | null;
    status: DeliveryStatus;
  },
  actorSub: string,
): Promise<Offering> {
  await withTransaction(async (client) => {
    const res = await client.query<{ id: string }>(
      `UPDATE public.delivery_offering
          SET price_amount = $2, lead_days_min = $3, lead_days_max = $4,
              same_day_cutoff = $5, status = $6, updated_at = now()
        WHERE id = $1 RETURNING id`,
      [
        offeringId,
        values.priceAmount,
        values.leadDaysMin,
        values.leadDaysMax,
        values.sameDayCutoff,
        values.status,
      ],
    );
    if (!res.rows[0]) throw new DeliveryErr("not_found", "offering not found");
    await insertAudit(client, actorSub, "delivery_offering.update", "delivery_offering", offeringId, {
      priceAmount: values.priceAmount,
      status: values.status,
    });
  });
  return (await readOffering(offeringId))!;
}

// ── Shop location ─────────────────────────────────────────────────────────────────────────────

/** Set (or clear) a shop's origin postcode. Null clears it → the shop's packages become
 *  undeliverable (FR-017). Audited as shop.location_set. */
export async function setShopLocation(
  shopId: string,
  postcode: string | null,
  actorSub: string,
): Promise<ShopLocation> {
  const row = await withTransaction(async (client) => {
    const res = await client.query<ShopLocationRow>(
      `UPDATE public.shop SET postcode = $2, updated_at = now()
        WHERE id = $1 RETURNING id, code, name, postcode`,
      [shopId, postcode],
    );
    if (!res.rows[0]) throw new DeliveryErr("not_found", "shop not found");
    await insertAudit(client, actorSub, "shop.location_set", "shop", shopId, { postcode });
    return res.rows[0];
  });
  return { shopId: row.id, shopCode: row.code, shopName: row.name, postcode: row.postcode };
}

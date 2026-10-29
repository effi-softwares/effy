// UPDATE reads a key's presence (null clears, absent leaves alone), and the concurrency token carries
// microseconds: `toISOString` truncates to ms, so `WHERE updated_at = $2` would never match.

import { query, withTransaction, likePattern, limitOffsetClause, orderBy, runOffsetPage } from "@effy/edge-shared";
import { VEHICLE_VIEWS, VEHICLE_LIST, type VehicleListRequest, type VehicleView } from "./list";
import type {
  VehicleComplianceIssue,
  VehicleDetail,
  VehicleListItem,
} from "@effy/shared-types";
import type pg from "pg";

import { COMPLIANCE_ISSUES, CURRENT_HOLDING_JOIN } from "./sql";

interface ListRow {
  id: string;
  registration_plate: string;
  make: string;
  model: string;
  body_type: string;
  ownership: string;
  can_carry_chilled: boolean;
  can_carry_frozen: boolean;
  status: string;
  holder_driver_id: string | null;
  holder_name: string | null;
  compliance: string[] | null;
}

interface DetailRow extends ListRow {
  year: number | null;
  fuel_type: string | null;
  payload_kg: number | null;
  load_volume_litres: number | null;
  crate_capacity: number | null;
  registration_expires_on: Date | null;
  insurance_policy_reference: string | null;
  insurance_expires_on: Date | null;
  roadworthy_expires_on: Date | null;
  odometer_km: number | null;
  status_reason: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: string;
}

/** A date column carries no time and must not grow one in transit. */
function dateOnly(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

const LIST_COLUMNS = `
  v.id, v.registration_plate, v.make, v.model, v.body_type, v.ownership,
  v.can_carry_chilled, v.can_carry_frozen, v.status,
  vh.driver_id AS holder_driver_id,
  hd.name      AS holder_name,
  ${COMPLIANCE_ISSUES} AS compliance`;

function toListItem(r: ListRow): VehicleListItem {
  return {
    id: r.id,
    registrationPlate: r.registration_plate,
    make: r.make,
    model: r.model,
    bodyType: r.body_type as VehicleListItem["bodyType"],
    ownership: r.ownership as VehicleListItem["ownership"],
    canCarryChilled: r.can_carry_chilled,
    canCarryFrozen: r.can_carry_frozen,
    status: r.status as VehicleListItem["status"],
    currentHolderDriverId: r.holder_driver_id,
    currentHolderName: r.holder_name,
    complianceIssues: (r.compliance ?? []) as VehicleComplianceIssue[],
  };
}

const VIEW_SQL: Record<VehicleView, string> = {
  fleet: "v.status <> 'retired'",
  active: "v.status = 'active'",
  off_road: "v.status = 'off_road'",
  retired: "v.status = 'retired'",
};

/** Search and every filter but the view, shared by the page and its view counts. */
function vehicleWhere(req: Pick<VehicleListRequest, "q" | "filters">, args: unknown[]): string[] {
  const f = req.filters;
  const where: string[] = [];
  if (req.q) {
    args.push(likePattern(req.q));
    where.push(`(v.registration_plate ILIKE $${args.length} OR (v.make || ' ' || v.model) ILIKE $${args.length})`);
  }
  if (f.refrigeration === "chilled") where.push(`v.can_carry_chilled`);
  if (f.refrigeration === "frozen") where.push(`v.can_carry_frozen`);
  if (f.owner) {
    args.push(f.owner);
    where.push(`v.ownership = $${args.length}`);
  }
  if (f.nonCompliant) where.push(`cardinality(${COMPLIANCE_ISSUES}) > 0`);
  return where;
}

/** One page of the register with its exact total (103). */
export async function listVehicles(req: VehicleListRequest): Promise<{ items: VehicleListItem[]; total: number; page: number }> {
  const r = await runOffsetPage(req, async (read) => {
    const args: unknown[] = [];
    const where = [...vehicleWhere(req, args), VIEW_SQL[req.filters.view ?? "fleet"]];
    const paging = limitOffsetClause(read, args);
    const res = await query<ListRow & { full_count: string }>(
      `SELECT ${LIST_COLUMNS}, count(*) OVER () AS full_count
         FROM public.vehicle v
         ${CURRENT_HOLDING_JOIN}
        WHERE ${where.join(" AND ")}
        ${orderBy(VEHICLE_LIST, req)}
        ${paging}`,
      args,
    );
    return res.rows;
  });
  return { items: r.rows.map(toListItem), total: r.total, page: r.page };
}

/** Every view's count for the search and filters, in one statement (103 FR-017). */
export async function vehicleViewCounts(req: Pick<VehicleListRequest, "q" | "filters">): Promise<Record<VehicleView, number>> {
  const args: unknown[] = [];
  const where = vehicleWhere(req, args);
  const res = await query<Record<VehicleView, number>>(
    `SELECT ${VEHICLE_VIEWS.map((v) => `count(*) FILTER (WHERE ${VIEW_SQL[v]})::int AS ${v}`).join(", ")}
       FROM public.vehicle v
      ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}`,
    args,
  );
  return res.rows[0]!;
}

export async function getVehicle(id: string): Promise<VehicleDetail | null> {
  const res = await query<DetailRow>(
    `SELECT ${LIST_COLUMNS},
            v.year, v.fuel_type, v.payload_kg, v.load_volume_litres, v.crate_capacity,
            v.registration_expires_on, v.insurance_policy_reference, v.insurance_expires_on,
            v.roadworthy_expires_on, v.odometer_km, v.status_reason, v.notes, v.created_at,
            -- ⚠ MICROSECOND precision, rendered in UTC. See the header: toISOString() would
            -- truncate to milliseconds and no edit could ever succeed.
            to_char(v.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at
       FROM public.vehicle v
       ${CURRENT_HOLDING_JOIN}
      WHERE v.id = $1`,
    [id],
  );
  const r = res.rows[0];
  if (!r) return null;

  return {
    ...toListItem(r),
    year: r.year,
    fuelType: r.fuel_type as VehicleDetail["fuelType"],
    payloadKg: r.payload_kg,
    loadVolumeLitres: r.load_volume_litres,
    crateCapacity: r.crate_capacity,
    registrationExpiresOn: dateOnly(r.registration_expires_on),
    insurancePolicyReference: r.insurance_policy_reference,
    insuranceExpiresOn: dateOnly(r.insurance_expires_on),
    roadworthyExpiresOn: dateOnly(r.roadworthy_expires_on),
    odometerKm: r.odometer_km,
    statusReason: r.status_reason,
    notes: r.notes,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at,
  };
}

const INSERT_COLUMNS: Record<string, string> = {
  registrationPlate: "registration_plate",
  make: "make",
  model: "model",
  bodyType: "body_type",
  ownership: "ownership",
  year: "year",
  fuelType: "fuel_type",
  payloadKg: "payload_kg",
  loadVolumeLitres: "load_volume_litres",
  crateCapacity: "crate_capacity",
  canCarryChilled: "can_carry_chilled",
  canCarryFrozen: "can_carry_frozen",
  registrationExpiresOn: "registration_expires_on",
  insurancePolicyReference: "insurance_policy_reference",
  insuranceExpiresOn: "insurance_expires_on",
  roadworthyExpiresOn: "roadworthy_expires_on",
  odometerKm: "odometer_km",
  notes: "notes",
};

const COLUMN_CAST: Record<string, string> = {
  registration_expires_on: "::date",
  insurance_expires_on: "::date",
  roadworthy_expires_on: "::date",
};

export async function insertVehicle(body: Record<string, unknown>): Promise<string> {
  const cols: string[] = [];
  const vals: string[] = [];
  const args: unknown[] = [];
  for (const [key, col] of Object.entries(INSERT_COLUMNS)) {
    if (!(key in body)) continue;
    args.push(body[key] ?? null);
    cols.push(col);
    vals.push(`$${args.length}${COLUMN_CAST[col] ?? ""}`);
  }
  const res = await query<{ id: string }>(
    `INSERT INTO public.vehicle (${cols.join(", ")}) VALUES (${vals.join(", ")}) RETURNING id`,
    args,
  );
  return res.rows[0]!.id;
}

export type UpdateOutcome = "updated" | "not_found" | "stale";

/** Presence, not value: null clears, absent leaves alone. */
export async function updateVehicle(
  id: string,
  body: Record<string, unknown>,
  expectedUpdatedAt: string,
  write: (tx: pg.PoolClient, vehicleId: string) => Promise<void>,
): Promise<UpdateOutcome> {
  return withTransaction(async (tx) => {
    const sets: string[] = [];
    const args: unknown[] = [id, expectedUpdatedAt];
    for (const [key, col] of Object.entries(INSERT_COLUMNS)) {
      if (!(key in body)) continue;
      args.push(body[key] ?? null);
      sets.push(`${col} = $${args.length}${COLUMN_CAST[col] ?? ""}`);
    }
    if (sets.length === 0) sets.push("updated_at = now()");
    else sets.push("updated_at = now()");

    const res = await tx.query<{ id: string }>(
      `UPDATE public.vehicle SET ${sets.join(", ")}
        WHERE id = $1
          AND to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') = $2
        RETURNING id`,
      args,
    );
    if (res.rows[0]) {
      await write(tx, id);
      return "updated";
    }
    const exists = await tx.query<{ ok: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM public.vehicle WHERE id = $1) AS ok`,
      [id],
    );
    return exists.rows[0]?.ok ? "stale" : "not_found";
  });
}

export async function setStatus(
  id: string,
  status: string,
  reason: string,
  write: (tx: pg.PoolClient, vehicleId: string) => Promise<void>,
): Promise<boolean> {
  return withTransaction(async (tx) => {
    const res = await tx.query<{ id: string }>(
      `UPDATE public.vehicle
          SET status = $2, status_reason = $3, updated_at = now()
        WHERE id = $1
        RETURNING id`,
      [id, status, reason],
    );
    if (!res.rows[0]) return false;
    await write(tx, id);
    return true;
  });
}

/** Case-insensitive. */
export async function plateInUse(plate: string, excludeId?: string): Promise<string | null> {
  const args: unknown[] = [plate];
  let sql = `SELECT registration_plate FROM public.vehicle
              WHERE upper(registration_plate) = upper($1) AND status <> 'retired'`;
  if (excludeId) {
    args.push(excludeId);
    sql += ` AND id <> $${args.length}`;
  }
  const res = await query<{ registration_plate: string }>(sql + " LIMIT 1", args);
  return res.rows[0]?.registration_plate ?? null;
}

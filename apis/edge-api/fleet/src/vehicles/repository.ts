// Repository for the vehicle register (061): raw parameterized SQL, no ORM (Principle VI).
//
// Row shapes stay in this file and are mapped explicitly at the boundary; they never leak past the
// mapper. Two rules from 056 are carried over deliberately, because each was a fixed defect:
//   1. UPDATE reads the PRESENCE of a key, never COALESCE($n, col) — which cannot distinguish
//      "leave alone" from "clear", and is why a driver's zone could once never be un-assigned.
//   2. The optimistic-concurrency token is rendered with MICROSECOND precision. toISOString() on a
//      pg Date truncates to milliseconds, so `WHERE updated_at = $2` would never match its own row
//      and every save would report "changed by someone else". Invisible to tsc (both strings) and to
//      a mocked test; only a container test finds it.

import { query, withTransaction } from "@effy/edge-shared";
import type {
  VehicleComplianceIssue,
  VehicleDetail,
  VehicleHolding,
  VehicleListItem,
} from "@effy/shared-types";
import type pg from "pg";

import { COMPLIANCE_ISSUES, CURRENT_HOLDING_JOIN } from "./sql";

// ── Row shapes (data layer only) ─────────────────────────────────────────────────────────────────

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

interface HoldingRow {
  id: string;
  driver_id: string;
  driver_name: string;
  started_at: Date;
  ended_at: Date | null;
  odometer_start_km: number | null;
  odometer_end_km: number | null;
  note: string | null;
}

/** `YYYY-MM-DD` or null — a date column carries no time and must not grow one in transit. */
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

export interface ListParams {
  status?: string;
  refrigeration?: "chilled" | "frozen";
  nonCompliantOnly?: boolean;
  cursor?: string;
  limit?: number;
}

/**
 * The register. Keyset-paginated on (registration_plate, id).
 *
 * ⚠ The cursor is minted from the SAME columns the ORDER BY uses. 053 shipped a console that ordered
 * on one column and cut its cursor from another, so rows re-appeared on the next page — and the first
 * test written for it passed, because it supplied its own cursor and never touched the minting.
 */
export async function listVehicles(p: ListParams): Promise<{ items: VehicleListItem[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(p.limit ?? 50, 1), 100);
  const args: unknown[] = [];
  const where: string[] = [];

  if (p.status) {
    args.push(p.status);
    where.push(`v.status = $${args.length}`);
  } else {
    where.push(`v.status <> 'retired'`);
  }
  if (p.refrigeration === "chilled") where.push(`v.can_carry_chilled`);
  if (p.refrigeration === "frozen") where.push(`v.can_carry_frozen`);
  if (p.nonCompliantOnly) where.push(`cardinality(${COMPLIANCE_ISSUES}) > 0`);
  if (p.cursor) {
    args.push(p.cursor);
    where.push(`(upper(v.registration_plate) || ':' || v.id::text) > $${args.length}`);
  }
  args.push(limit + 1);

  const res = await query<ListRow>(
    `SELECT ${LIST_COLUMNS}
       FROM public.vehicle v
       ${CURRENT_HOLDING_JOIN}
      WHERE ${where.join(" AND ")}
      ORDER BY upper(v.registration_plate) ASC, v.id ASC
      LIMIT $${args.length}`,
    args,
  );

  const rows = res.rows.slice(0, limit);
  const last = rows[rows.length - 1];
  return {
    items: rows.map(toListItem),
    nextCursor:
      res.rows.length > limit && last ? `${last.registration_plate.toUpperCase()}:${last.id}` : null,
  };
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

  const holdings = await listHoldings(id);
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
    holdings,
  };
}

/** Every holding period for a vehicle, newest first (FR-016). ⚠ Includes periods whose driver has
 *  since been offboarded — history is what this list is for. */
export async function listHoldings(vehicleId: string): Promise<VehicleHolding[]> {
  const res = await query<HoldingRow>(
    `SELECT h.id, h.driver_id, d.name AS driver_name, h.started_at, h.ended_at,
            h.odometer_start_km, h.odometer_end_km, h.note
       FROM public.vehicle_holding h
       JOIN public.driver d ON d.id = h.driver_id
      WHERE h.vehicle_id = $1
      ORDER BY h.started_at DESC`,
    [vehicleId],
  );
  return res.rows.map((r) => ({
    id: r.id,
    driverId: r.driver_id,
    driverName: r.driver_name,
    startedAt: r.started_at.toISOString(),
    endedAt: r.ended_at ? r.ended_at.toISOString() : null,
    odometerStartKm: r.odometer_start_km,
    odometerEndKm: r.odometer_end_km,
    note: r.note,
  }));
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

/** Date columns need an explicit cast when the value can be null. */
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

/**
 * ⚠ PRESENCE, NOT VALUE. A key present with `null` CLEARS the column; a key absent leaves it alone.
 * `COALESCE($n, col)` collapses those two into one, which is exactly the defect 056 fixed on drivers
 * and the reason a zone could never be un-assigned before it.
 */
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

/** Does a non-retired vehicle already use this plate? ⚠ Case-insensitive, because `abc123` and
 *  `ABC123` are the same plate to everyone except a database. */
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

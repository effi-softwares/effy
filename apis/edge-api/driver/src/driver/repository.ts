// Repository for the driver record + duty (049): raw parameterized SQL, no ORM, no query builder.
//
// The driver record is authoritative for the access decision (Principle IV). This module reads the
// record keyed on the token's `sub`; it NEVER creates one — drivers are back-office-provisioned
// (FR-002), and a JIT upsert here would mint a zone-less record that assignment could not use
// (research I2). Duty transitions use guarded/partial-unique writes so "on duty" is exactly one open
// session.

import { query } from "@effy/edge-shared";

import { type DriverRecord, type DriverStatus } from "./types";

interface DriverRow {
  id: string;
  cognito_sub: string;
  name: string;
  work_email: string;
  zone_id: string | null;
  zone_name: string | null;
  vehicle_type: string | null;
  vehicle_plate: string | null;
  status: DriverStatus;
  on_duty_since: Date | null;
  expected_end_at: Date | null;
}

const SELECT_BY_SUB = `
  SELECT d.id,
         d.cognito_sub,
         d.name,
         d.work_email,
         d.delivery_zone_id AS zone_id,
         z.name             AS zone_name,
         -- ⚠ 061: what the driver drives is the vehicle behind their OPEN holding, not two
         -- free-text columns on the driver row that nobody maintained. NULL is ordinary: they hold
         -- nothing right now.
         hv.body_type          AS vehicle_type,
         hv.registration_plate AS vehicle_plate,
         d.status,
         s.started_at       AS on_duty_since,
         s.expected_end_at  AS expected_end_at
    FROM public.driver d
    LEFT JOIN public.delivery_zone z ON z.id = d.delivery_zone_id
    LEFT JOIN public.driver_duty_session s
           ON s.driver_id = d.id AND s.ended_at IS NULL
    LEFT JOIN public.vehicle_holding vh ON vh.driver_id = d.id AND vh.ended_at IS NULL
    LEFT JOIN public.vehicle          hv ON hv.id = vh.vehicle_id
   WHERE d.cognito_sub = $1
`;

function mapRow(row: DriverRow): DriverRecord {
  return {
    id: row.id,
    subject: row.cognito_sub,
    name: row.name,
    workEmail: row.work_email,
    zoneId: row.zone_id,
    zoneName: row.zone_name,
    vehicleType: row.vehicle_type,
    vehiclePlate: row.vehicle_plate,
    status: row.status,
    dutyStatus: row.on_duty_since ? "on_duty" : "off_duty",
    onDutySince: row.on_duty_since ? row.on_duty_since.toISOString() : null,
    // ⚠ NULL means the driver did not say. It is NOT a defaulted shift length (FR-033).
    expectedEndAt: row.expected_end_at ? row.expected_end_at.toISOString() : null,
  };
}

/** Load the provisioned driver record for a token subject, or null if none exists. */
export async function findBySubject(sub: string): Promise<DriverRecord | null> {
  const result = await query<DriverRow>(SELECT_BY_SUB, [sub]);
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

/** Open a duty session (idempotent: the partial-unique index means a second open is a no-op). */
export async function goOnDuty(driverId: string, expectedEndAt: string | null): Promise<void> {
  await query(
    `INSERT INTO public.driver_duty_session (driver_id, started_at, expected_end_at)
         VALUES ($1, now(), $2::timestamptz)
    ON CONFLICT DO NOTHING`,
    [driverId, expectedEndAt],
  );
}

/** Close the open duty session, if any (idempotent). */
export async function goOffDuty(driverId: string): Promise<void> {
  await query(
    `UPDATE public.driver_duty_session
        SET ended_at = now()
      WHERE driver_id = $1 AND ended_at IS NULL`,
    [driverId],
  );
}

// ⚠ `recordLocation` STOOD HERE. The three `last_location_*` columns it wrote were dropped by
// db/migrations/20260920143000_fleet_foundations.sql — Effy does not track driver position (D20).

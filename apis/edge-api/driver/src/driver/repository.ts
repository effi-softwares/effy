// Reads the driver record by token `sub` and never creates one: drivers are provisioned by back-office.
// A partial unique index keeps exactly one open duty session.

import {
  coverageAggregateSql,
  coverageLabel,
  query,
} from "@effy/edge-shared";
import { vehicleCheckStateSql } from "@effy/edge-shared/delivery";

import { type DriverRecord, type DriverStatus } from "./types";

interface DriverRow {
  id: string;
  cognito_sub: string;
  name: string;
  work_email: string;
  cov_every: boolean | null;
  cov_names: string[] | null;
  cov_n: string;
  vehicle_type: string | null;
  vehicle_plate: string | null;
  vehicle_id: string | null;
  vehicle_label: string | null;
  vehicle_check: "none" | "ok" | "due" | "unsafe";
  status: DriverStatus;
  on_duty_since: Date | null;
  expected_end_at: Date | null;
}

const SELECT_BY_SUB = `
  SELECT d.id,
         d.cognito_sub,
         d.name,
         d.work_email,
         -- Coverage is DERIVED from clearances, not read from a column.
         cov.every AS cov_every,
         cov.names AS cov_names,
         cov.n     AS cov_n,
         -- ⚠ what the driver drives is the vehicle behind their OPEN holding, not two
         -- free-text columns on the driver row that nobody maintained. NULL is ordinary: they hold
         -- nothing right now.
         hv.body_type          AS vehicle_type,
         hv.registration_plate AS vehicle_plate,
         -- The vehicle to check, and today's check of it.
         hv.id                 AS vehicle_id,
         CASE WHEN hv.id IS NULL THEN NULL ELSE concat_ws(' ', hv.make, hv.model) || ' · ' || hv.registration_plate END AS vehicle_label,
         ${vehicleCheckStateSql("d", "hv")} AS vehicle_check,
         d.status,
         s.started_at       AS on_duty_since,
         s.expected_end_at  AS expected_end_at
    FROM public.driver d
    LEFT JOIN LATERAL (
      ${coverageAggregateSql("d.id")}
    ) cov ON true
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
    coverageLabel: coverageLabel({ every: row.cov_every, names: row.cov_names, n: row.cov_n }),
    vehicleType: row.vehicle_type,
    vehiclePlate: row.vehicle_plate,
    vehicleId: row.vehicle_id,
    vehicleLabel: row.vehicle_label,
    vehicleCheck: row.vehicle_check,
    status: row.status,
    dutyStatus: row.on_duty_since ? "on_duty" : "off_duty",
    onDutySince: row.on_duty_since ? row.on_duty_since.toISOString() : null,
    // Null means the driver did not say; never a defaulted shift length.
    expectedEndAt: row.expected_end_at ? row.expected_end_at.toISOString() : null,
  };
}

export async function findBySubject(sub: string): Promise<DriverRecord | null> {
  const result = await query<DriverRow>(SELECT_BY_SUB, [sub]);
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

/** Idempotent: the partial unique index makes a second open a no-op. */
export async function goOnDuty(driverId: string, expectedEndAt: string | null): Promise<void> {
  await query(
    `INSERT INTO public.driver_duty_session (driver_id, started_at, expected_end_at)
         VALUES ($1, now(), $2::timestamptz)
    ON CONFLICT DO NOTHING`,
    [driverId, expectedEndAt],
  );
}

/** Idempotent. */
export async function goOffDuty(driverId: string): Promise<void> {
  await query(
    `UPDATE public.driver_duty_session
        SET ended_at = now()
      WHERE driver_id = $1 AND ended_at IS NULL`,
    [driverId],
  );
}


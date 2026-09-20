// Repository for vehicle holdings (061): raw parameterized SQL, no ORM (Principle VI).
//
// ⚠⚠ THIS MODULE DOES NOT CHECK WHETHER A VEHICLE OR DRIVER IS FREE. THAT IS DELIBERATE.
//
// "At most one open holding per vehicle, and per driver" (FR-012/FR-013) is a CONCURRENCY claim, and
// a read-then-write check cannot make it true: two operators clicking at the same moment both read
// "free" and both write. The guarantee is `vehicle_holding_open_vehicle_uq` and
// `vehicle_holding_open_driver_uq` — two partial unique indexes on `WHERE ended_at IS NULL` — and
// this module's job is to let the INSERT fail and hand the violation up with enough information for
// the service to name it. `driver_duty_session_open_uq` is the same shape and has held since 049.

import { query, withTransaction } from "@effy/edge-shared";
import type pg from "pg";

/** Which of the two partial unique indexes a violation came from. */
export type HoldingClash = "vehicle" | "driver" | null;

/** PostgreSQL's unique_violation. */
const UNIQUE_VIOLATION = "23505";
/** PostgreSQL's check_violation — the odometer rule (FR-018) lives in the schema. */
const CHECK_VIOLATION = "23514";

export class HoldingConflictError extends Error {
  constructor(readonly clash: HoldingClash) {
    super(`vehicle holding conflict: ${clash}`);
    this.name = "HoldingConflictError";
  }
}

export class OdometerError extends Error {
  constructor() {
    super("odometer reading is below the opening reading");
    this.name = "OdometerError";
  }
}

function classify(err: unknown): never {
  const e = err as { code?: string; constraint?: string };
  if (e?.code === UNIQUE_VIOLATION) {
    if (e.constraint === "vehicle_holding_open_vehicle_uq") throw new HoldingConflictError("vehicle");
    if (e.constraint === "vehicle_holding_open_driver_uq") throw new HoldingConflictError("driver");
    throw new HoldingConflictError(null);
  }
  if (e?.code === CHECK_VIOLATION && e.constraint === "vehicle_holding_odo_ck") {
    throw new OdometerError();
  }
  throw err;
}

export interface IssueInput {
  vehicleId: string;
  driverId: string;
  odometerStartKm?: number | null;
  note?: string | null;
  issuedBySub: string;
}

/**
 * Open a holding. Throws `HoldingConflictError` when either index refuses it.
 *
 * ⚠ The odometer is ALSO written onto the vehicle, so `vehicle.odometer_km` is the last reading
 * anybody recorded rather than a figure that drifts from the holdings beneath it.
 */
export async function issue(input: IssueInput, write: (tx: pg.PoolClient, holdingId: string) => Promise<void>): Promise<string> {
  return withTransaction(async (tx) => {
    try {
      const res = await tx.query<{ id: string }>(
        `INSERT INTO public.vehicle_holding
           (vehicle_id, driver_id, odometer_start_km, note, issued_by_sub)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [input.vehicleId, input.driverId, input.odometerStartKm ?? null, input.note ?? null, input.issuedBySub],
      );
      const id = res.rows[0]!.id;
      if (input.odometerStartKm != null) {
        await tx.query(`UPDATE public.vehicle SET odometer_km = $2, updated_at = now() WHERE id = $1`, [
          input.vehicleId,
          input.odometerStartKm,
        ]);
      }
      await write(tx, id);
      return id;
    } catch (err) {
      classify(err);
    }
  });
}

export type ReturnOutcome = "returned" | "not_held";

export async function returnCurrent(
  vehicleId: string,
  odometerEndKm: number | null,
  note: string | null,
  returnedBySub: string,
  write: (tx: pg.PoolClient, holdingId: string) => Promise<void>,
): Promise<ReturnOutcome> {
  return withTransaction(async (tx) => {
    try {
      const res = await tx.query<{ id: string }>(
        `UPDATE public.vehicle_holding
            SET ended_at = now(), odometer_end_km = $2, returned_by_sub = $3,
                note = COALESCE($4, note)
          WHERE vehicle_id = $1 AND ended_at IS NULL
          RETURNING id`,
        [vehicleId, odometerEndKm, returnedBySub, note],
      );
      const id = res.rows[0]?.id;
      if (!id) return "not_held";
      if (odometerEndKm != null) {
        await tx.query(`UPDATE public.vehicle SET odometer_km = $2, updated_at = now() WHERE id = $1`, [
          vehicleId,
          odometerEndKm,
        ]);
      }
      await write(tx, id);
      return "returned";
    } catch (err) {
      classify(err);
    }
  });
}

export interface HeldVehicleRow {
  vehicleId: string;
  registrationPlate: string;
  make: string;
  model: string;
  since: string;
}

/**
 * What this driver is currently holding, if anything.
 *
 * ⚠ Used to NAME a refusal and to warn before a stand-down (FR-014, FR-019) — never to decide
 * whether an insert may proceed. The indexes decide that.
 */
export async function heldByDriver(driverId: string): Promise<HeldVehicleRow | null> {
  const res = await query<{
    vehicle_id: string;
    registration_plate: string;
    make: string;
    model: string;
    started_at: Date;
  }>(
    `SELECT h.vehicle_id, v.registration_plate, v.make, v.model, h.started_at
       FROM public.vehicle_holding h
       JOIN public.vehicle v ON v.id = h.vehicle_id
      WHERE h.driver_id = $1 AND h.ended_at IS NULL
      LIMIT 1`,
    [driverId],
  );
  const r = res.rows[0];
  return r
    ? {
        vehicleId: r.vehicle_id,
        registrationPlate: r.registration_plate,
        make: r.make,
        model: r.model,
        since: r.started_at.toISOString(),
      }
    : null;
}

/** Who holds this vehicle, if anyone. Same rule: for the message, not for the invariant. */
export async function holderOf(vehicleId: string): Promise<{ driverId: string; driverName: string } | null> {
  const res = await query<{ driver_id: string; name: string }>(
    `SELECT h.driver_id, d.name
       FROM public.vehicle_holding h
       JOIN public.driver d ON d.id = h.driver_id
      WHERE h.vehicle_id = $1 AND h.ended_at IS NULL
      LIMIT 1`,
    [vehicleId],
  );
  const r = res.rows[0];
  return r ? { driverId: r.driver_id, driverName: r.name } : null;
}

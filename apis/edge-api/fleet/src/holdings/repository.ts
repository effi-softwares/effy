// Does not check whether a vehicle or driver is free: two partial unique indexes on
// `WHERE ended_at IS NULL` guarantee one open holding each, and this lets the INSERT fail and hands
// the violation up for the service to name.

import { query, withTransaction } from "@effy/edge-shared";
import type pg from "pg";

export type HoldingClash = "vehicle" | "driver" | null;

const UNIQUE_VIOLATION = "23505";
/** check_violation: the odometer rule lives in the schema. */
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

/** Throws `HoldingConflictError` when either index refuses. Also writes the odometer onto the vehicle. */
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

/** To name a refusal and warn before a stand-down; never to decide whether an insert proceeds. */
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

/** For the message, not the invariant. */
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

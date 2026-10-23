// Once per vehicle per Melbourne day; an unsafe answer means no work until dispatch clears it. Always
// the vehicle the driver holds now, never one named by the request.

import { withTransaction } from "@effy/edge-shared";
import { VEHICLE_CHECK_ITEMS, type VehicleCheckEntry } from "@effy/shared-types";

export class VehicleCheckError extends Error {
  constructor(readonly code: "no_vehicle" | "invalid", readonly sentence: string) {
    super(code);
    this.name = "VehicleCheckError";
  }
}

const ANSWERS = new Set(["ok", "minor", "unsafe"]);

/** Every item once, each a known answer; a note of at most 500 characters. */
export function validateAnswers(answers: unknown): VehicleCheckEntry[] {
  if (!Array.isArray(answers)) throw new VehicleCheckError("invalid", "Answer every item of the check.");
  const byItem = new Map<string, VehicleCheckEntry>();
  for (const a of answers as VehicleCheckEntry[]) {
    if (!a || !VEHICLE_CHECK_ITEMS.includes(a.item) || !ANSWERS.has(a.answer) || byItem.has(a.item)) {
      throw new VehicleCheckError("invalid", "Answer every item of the check, once.");
    }
    const note = typeof a.note === "string" ? a.note.trim() : "";
    if (note.length > 500) throw new VehicleCheckError("invalid", "Keep each note under 500 characters.");
    byItem.set(a.item, { item: a.item, answer: a.answer, note: note || null });
  }
  if (byItem.size !== VEHICLE_CHECK_ITEMS.length) throw new VehicleCheckError("invalid", "Answer every item of the check.");
  return VEHICLE_CHECK_ITEMS.map((item) => byItem.get(item)!);
}

/** A second check of the same vehicle today answers with the first. */
export async function submitVehicleCheck(driverId: string, changeId: string, answers: VehicleCheckEntry[]): Promise<{ state: "ok" | "unsafe"; recorded: boolean }> {
  return withTransaction(async (tx: any) => {
    const held = await tx.query(
      `SELECT vehicle_id FROM public.vehicle_holding WHERE driver_id = $1 AND ended_at IS NULL LIMIT 1`,
      [driverId],
    );
    const vehicleId = held.rows[0]?.vehicle_id as string | undefined;
    if (!vehicleId) throw new VehicleCheckError("no_vehicle", "You don't hold a vehicle. Ask dispatch to give you one.");

    const unsafe = answers.some((a) => a.answer === "unsafe");
    const minor = answers.some((a) => a.answer === "minor");
    const ins = await tx.query(
      `INSERT INTO public.vehicle_check (driver_id, vehicle_id, local_date, answers, unsafe, minor, change_id)
       VALUES ($1, $2, (now() AT TIME ZONE 'Australia/Melbourne')::date, $3::jsonb, $4, $5, $6)
       ON CONFLICT DO NOTHING
       RETURNING unsafe`,
      [driverId, vehicleId, JSON.stringify(answers), unsafe, minor, changeId],
    );
    if ((ins.rowCount ?? 0) > 0) return { state: unsafe ? "unsafe" : "ok", recorded: true };

    const prior = await tx.query(
      `SELECT unsafe, cleared_at FROM public.vehicle_check
        WHERE driver_id = $1 AND vehicle_id = $2 AND local_date = (now() AT TIME ZONE 'Australia/Melbourne')::date`,
      [driverId, vehicleId],
    );
    const p = prior.rows[0];
    return { state: p && p.unsafe && !p.cleared_at ? "unsafe" : "ok", recorded: false };
  });
}

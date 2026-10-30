// Waive the cross-run gate for one run, decide a held package, clear an unsafe vehicle check, and the
// Exceptions screen's lists. Each action asserts something about the physical world, so it is audited
// in the same transaction.

import { query, withTransaction, type Queryable } from "@effy/edge-shared";
import { stageOfRound, type RoundStageRow } from "@effy/edge-shared/delivery";
import type { HeldPackageDTO, OverdueRunDTO, VehicleCheckDTO } from "@effy/shared-types";

import { recordAudit } from "../shared/audit";
import { HELD_PACKAGES, OVERDUE_CROSSED_SINCE, OVERDUE_RUNS, VEHICLE_CHECKS_TODAY } from "./sql";

/** With one line a person can read. */
export class SequenceActionError extends Error {
  constructor(readonly status: 404 | 409, readonly code: string, readonly sentence: string) {
    super(code);
    this.name = "SequenceActionError";
  }
}

const iso = (v: Date | string) => (v instanceof Date ? v : new Date(v)).toISOString();

export async function waiveSequence(roundId: string, reason: string, actorSub: string): Promise<{ message: string; driverId: string }> {
  return withTransaction(async (tx: any) => {
    const round = await tx.query(
      `SELECT dr.driver_id, dr.status, d.name AS driver_name
         FROM public.driver_round dr JOIN public.driver d ON d.id = dr.driver_id
        WHERE dr.id = $1 FOR UPDATE OF dr`,
      [roundId],
    );
    const r = round.rows[0] as { driver_id: string; status: string; driver_name: string } | undefined;
    if (!r) throw new SequenceActionError(404, "not_found", "That run no longer exists.");
    if (r.status !== "planned" && r.status !== "in_progress") {
      throw new SequenceActionError(409, "finished", "That run is already finished.");
    }
    const ins = await tx.query(
      `INSERT INTO public.round_sequence_waiver (round_id, reason, staff_sub) VALUES ($1, $2, $3)
       ON CONFLICT (round_id) DO NOTHING`,
      [roundId, reason.trim(), actorSub],
    );
    if ((ins.rowCount ?? 0) > 0) {
      await recordAudit(
        { actorSub, action: "dispatch.sequence_waived", targetType: "driver_round", driverId: roundId, detail: { reason: reason.trim() } },
        tx,
      );
    }
    return { message: `${r.driver_name} can go ahead with this run.`, driverId: r.driver_id };
  });
}

export async function resolveHold(holdId: string, resolution: "found" | "lost", actorSub: string): Promise<{ message: string }> {
  return withTransaction(async (tx: any) => {
    const upd = await tx.query(
      `UPDATE public.package_hold SET resolution = $2, resolved_by_sub = $3, resolved_at = now()
        WHERE id = $1 AND resolution IS NULL
        RETURNING shop_fulfillment_id`,
      [holdId, resolution, actorSub],
    );
    if ((upd.rowCount ?? 0) === 0) {
      const exists = await tx.query(`SELECT resolution FROM public.package_hold WHERE id = $1`, [holdId]);
      if ((exists.rowCount ?? 0) === 0) throw new SequenceActionError(404, "not_found", "That package is no longer held.");
      return { message: "Already decided." };
    }
    await recordAudit(
      { actorSub, action: "dispatch.hold_resolved", targetType: "package_hold", driverId: holdId, detail: { resolution } },
      tx,
    );
    return {
      message: resolution === "found" ? "Back in planning - it goes on the next run." : "Recorded as lost. It will not be planned again.",
    };
  });
}

export async function clearVehicleCheck(checkId: string, note: string, actorSub: string): Promise<{ message: string; driverId: string }> {
  return withTransaction(async (tx: any) => {
    const upd = await tx.query(
      `UPDATE public.vehicle_check vc SET cleared_by_sub = $2, cleared_at = now(), clear_note = $3
        WHERE vc.id = $1 AND vc.unsafe AND vc.cleared_at IS NULL
        RETURNING vc.driver_id, (SELECT name FROM public.driver WHERE id = vc.driver_id) AS driver_name`,
      [checkId, actorSub, note.trim()],
    );
    const r = upd.rows[0] as { driver_id: string; driver_name: string } | undefined;
    if (!r) {
      const exists = await tx.query(`SELECT driver_id, unsafe FROM public.vehicle_check WHERE id = $1`, [checkId]);
      if ((exists.rowCount ?? 0) === 0) throw new SequenceActionError(404, "not_found", "That vehicle check no longer exists.");
      if (!exists.rows[0].unsafe) throw new SequenceActionError(409, "not_unsafe", "That check found nothing unsafe.");
      return { message: "Already cleared.", driverId: exists.rows[0].driver_id as string };
    }
    await recordAudit(
      { actorSub, action: "vehicle.check_cleared", targetType: "vehicle_check", driverId: checkId, detail: { note: note.trim() } },
      tx,
    );
    return { message: `Cleared - ${r.driver_name} can take work from the next planning pass.`, driverId: r.driver_id };
  });
}

export async function heldPackages(): Promise<HeldPackageDTO[]> {
  const res = await query<any>(HELD_PACKAGES);
  return res.rows.map((r) => ({
    holdId: r.hold_id,
    packageId: r.package_id,
    orderNumber: r.order_number,
    shopName: r.shop_name,
    driverName: r.driver_name,
    roundId: r.round_id,
    step: r.step,
    reason: r.reason,
    note: r.note ?? null,
    createdAt: iso(r.created_at),
    parcel: r.parcel_code ? { code: r.parcel_code, seq: Number(r.parcel_seq), of: Number(r.parcel_of), zone: r.parcel_zone } : null,
  }));
}

export async function overdueRuns(now = new Date()): Promise<OverdueRunDTO[]> {
  const res = await query<any>(OVERDUE_RUNS);
  return res.rows.map((r) => {
    const stage = stageOfRound(r.kind, r.status, r as RoundStageRow);
    return {
      roundId: r.round_id,
      kind: r.kind,
      driverName: r.driver_name,
      stage: stage.stage,
      stageLabel: stage.label,
      since: iso(r.due_at),
      minutes: Math.max(0, Math.floor((now.getTime() - new Date(r.due_at).getTime()) / 60_000)),
    };
  });
}

/** Rounds that crossed into overdue since `since`; the planner pass announces when > 0. */
export async function overdueCrossedSince(db: Queryable, since: Date): Promise<number> {
  const res = await db.query<{ n: number }>(OVERDUE_CROSSED_SINCE, [since.toISOString()]);
  return Number(res.rows[0]?.n ?? 0);
}

export async function vehicleChecksToday(): Promise<VehicleCheckDTO[]> {
  const res = await query<any>(VEHICLE_CHECKS_TODAY);
  return res.rows.map((r) => ({
    checkId: r.check_id,
    driverName: r.driver_name,
    vehicleLabel: r.vehicle_label,
    answers: (Array.isArray(r.answers) ? r.answers : []).map((a: any) => ({ item: String(a.item), answer: String(a.answer), note: a.note ?? null })),
    unsafe: r.unsafe === true,
    createdAt: iso(r.created_at),
    clearedAt: r.cleared_at ? iso(r.cleared_at) : null,
    clearNote: r.clear_note ?? null,
  }));
}

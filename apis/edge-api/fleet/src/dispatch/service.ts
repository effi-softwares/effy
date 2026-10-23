// A dispatcher may override a preference, never a fact: reassigning to a driver ranked lower is the
// point; one unlicensed, stood down or without a suitable vehicle is refused by name.

import {
  eligibilityReasons,
  endOfLocalDay,
  nextRunInstant,
  query,
  withTransaction,
  type ExclusionReason,
  orderRoundStops,
} from "@effy/edge-shared";

import { TO_RETURN_SQL, nonDeliveryDates, stageOfRound, type RoundStageRow } from "@effy/edge-shared/delivery";
import type { RoundWaiverDTO } from "@effy/shared-types";

import { loadCandidates, loadSchedule } from "../planner/repository";
import { dueRun, isoDateOf } from "../planner/service";
import { recordAudit, type DispatchAuditAction } from "../shared/audit";
import { enqueueRoundChanged, enqueueRunAssigned } from "../shared/driver-push";
import {
  DAY_ROUNDS,
  FAILED_PARCEL_COUNTS,
  ROUND_DETAIL_STOPS,
  ROUND_FOR_UPDATE,
  ROUND_STAGE_AND_WAIVER,
  ROUND_WORK,
  UNASSIGNED_WORK,
} from "./sql";

export class DispatchError extends Error {
  constructor(
    readonly kind: "not_found" | "stale" | "ineligible" | "invalid" | "parcels_to_return",
    readonly detail: string,
    readonly reasons: ExclusionReason[] = [],
  ) {
    super(kind);
    this.name = "DispatchError";
  }
}

/** A round with failed parcels still in its van cannot be moved or ended. */
async function refuseWhileParcelsToReturn(tx: any, roundId: string): Promise<void> {
  const held = await tx.query(
    `SELECT 1 FROM public.round_package rp
       JOIN public.round_stop   rs ON rs.id = rp.stop_id
       JOIN public.driver_round dr ON dr.id = rs.round_id
      WHERE dr.id = $1 AND ${TO_RETURN_SQL}
      LIMIT 1`,
    [roundId],
  );
  if ((held.rowCount ?? 0) > 0) {
    throw new DispatchError(
      "parcels_to_return",
      "Parcels from a failed delivery are still with this driver. Record their return first.",
    );
  }
}

export async function readDay() {
  const [rounds, unassigned, schedule, failed] = await Promise.all([
    query<any>(DAY_ROUNDS),
    // $1: the end of the local day. A hub parcel for a later day is waiting, not unassigned.
    query<any>(UNASSIGNED_WORK, [endOfLocalDay(new Date())]),
    loadSchedule(),
    query<{ with_drivers: number; returned_awaiting_decision: number }>(FAILED_PARCEL_COUNTS),
  ]);

  const now = Date.now();
  // What each unassigned package waits for: the next collection run (`nextRunInstant`), or its window's end (else the day's).
  const nextRun = nextRunInstant(schedule.runs, new Date(now));
  const endOfDay = endOfLocalDay(new Date(now));
  const targetOf = (u: { stage: string; window_end: Date | null }): string | null => {
    if (u.stage === "collection") return nextRun ? nextRun.toISOString() : null;
    const end = u.window_end && u.window_end.getTime() > now ? u.window_end : endOfDay;
    return end.toISOString();
  };
  // The planner's own `dueRun`: a parcel not due on the next run is left out; one whose run has gone is late.
  const calendar = {
    noWeekdays: schedule.settings.noDeliveryWeekdays,
    noDates: await nonDeliveryDates({ query: (t, v) => query(t, v) }, isoDateOf(new Date(now), -8)),
  };
  const dueOf = (u: { stage: string; delivered_by: "effy" | "courier"; window_start: Date | null }): Date | null =>
    u.stage === "collection" ? dueRun({ deliveredBy: u.delivered_by, windowStart: u.window_start }, schedule.runs, schedule.settings, calendar) : null;
  const listed = unassigned.rows.filter((u: any) => {
    const due = dueOf(u);
    return due === null || nextRun === null || due.getTime() <= nextRun.getTime();
  });
  return {
    rounds: rounds.rows.map((r) => ({
      round: {
        id: r.id,
        kind: r.kind,
        status: r.status,
        deadlineAt: r.deadline_at.toISOString(),
        // null means open; a past instant is sent as it is.
        opensAt: r.opens_at ? (r.opens_at as Date).toISOString() : null,
        changedNote: r.changed_note,
        stops: [],
      },
      driverId: r.driver_id,
      driverName: r.driver_name,
      stopsRemaining: Number(r.stops_remaining),
      packagesRemaining: Number(r.packages_remaining),
      // Derived on read, never stored.
      isLate: r.status !== "completed" && r.status !== "cancelled" && r.deadline_at.getTime() < now,
      // Where the run is, in the driver app's words, and any waiver of the gate.
      ...stageFields(r),
    })),
    unassigned: listed.map((u: any) => ({
      packageId: u.package_id,
      orderNumber: u.order_number,
      shopName: u.shop_name,
      zoneName: u.zone_name,
      readySince: u.ready_since.toISOString(),
      collectLate: (() => {
        const due = dueOf(u);
        return due !== null && nextRun !== null && due.getTime() < nextRun.getTime();
      })(),
      // Empty means no candidate existed at all: a staffing problem.
      reasons: u.no_candidate ? [] : (u.reasons ?? []),
      stage: u.stage,
      targetAt: targetOf(u),
    })),
    failedParcels: {
      withDrivers: Number(failed.rows[0]?.with_drivers ?? 0),
      returnedAwaitingDecision: Number(failed.rows[0]?.returned_awaiting_decision ?? 0),
    },
  };
}

function stageFields(r: any): { stage: string; stageLabel: string; waiver: RoundWaiverDTO | null } {
  const stage = stageOfRound(r.kind, r.status, r as RoundStageRow);
  return {
    stage: stage.stage,
    stageLabel: stage.label,
    waiver: r.waiver_reason
      ? { reason: r.waiver_reason, staffName: r.waiver_staff ?? "a staff member", at: (r.waiver_at as Date).toISOString() }
      : null,
  };
}

/** Shown, never prevented: the finishing order (`completed_at`) against the shared display order. */
function workedOutOfOrder(orderedStops: Array<{ kind: string; completed_at: Date | null }>): boolean {
  const finished = orderedStops
    .map((s, i) => ({ i, at: s.completed_at, kind: s.kind }))
    .filter((s): s is { i: number; at: Date; kind: string } => s.at !== null && s.kind !== "hub_checkin");
  for (let k = 1; k < finished.length; k++) {
    if (finished[k]!.at.getTime() < finished[k - 1]!.at.getTime()) return true;
  }
  return false;
}

export async function readRound(roundId: string) {
  const [round, stops, stageRow] = await Promise.all([
    query<any>(ROUND_FOR_UPDATE.replace("FOR UPDATE", ""), [roundId]),
    query<any>(ROUND_DETAIL_STOPS, [roundId]),
    query<any>(ROUND_STAGE_AND_WAIVER, [roundId]),
  ]);
  const r = round.rows[0];
  if (!r) throw new DispatchError("not_found", "That round does not exist.");
  const orderedRows = orderRoundStops(
    stops.rows.map((s) => ({
      id: s.stop_id as string,
      seq: s.seq as number | null,
      status: s.status,
      dueAt: (s.window_start as Date | null) ?? null,
      zoneId: s.zone_id as string | null,
      shopId: s.shop_id as string | null,
      row: s,
    })),
  ).map(({ row }) => row);
  return {
    ...(stageRow.rows[0] ? stageFields(stageRow.rows[0]) : {}),
    outOfOrder: workedOutOfOrder(orderedRows),
    id: r.id,
    kind: r.kind,
    status: r.status,
    driverId: r.driver_id,
    updatedAt: r.updated_at,
    deadlineAt: (r.deadline_at as Date).toISOString(),
    opensAt: r.opens_at ? (r.opens_at as Date).toISOString() : null,
    // Ordered by the shared rule, the same as the driver's app.
    stops: orderRoundStops(
      stops.rows.map((s) => ({
        id: s.stop_id as string,
        seq: s.seq as number | null,
        status: s.status,
        dueAt: (s.window_start as Date | null) ?? null,
        zoneId: s.zone_id as string | null,
        shopId: s.shop_id as string | null,
        row: s,
      })),
    ).map(({ row: s }) => ({
      stopId: s.stop_id,
      seq: s.seq,
      kind: s.kind,
      status: s.status,
      zoneName: s.zone_name,
      label: s.shop_name ?? s.destination_suburb ?? "",
      orderNumber: s.order_number,
      // The window the customer was sold, as instants.
      deliveryWindow:
        s.window_start && s.window_end
          ? { startAt: (s.window_start as Date).toISOString(), endAt: (s.window_end as Date).toISOString() }
          : null,
      // Scanned / typed / by hand, for this stop on this round; absent when none was recorded.
      ...(s.handovers_scan + s.handovers_typed + s.handovers_manual > 0
        ? { handovers: { scan: s.handovers_scan, typed: s.handovers_typed, manual: s.handovers_manual } }
        : {}),
    })),
  };
}

/** Optimistic lock, compared at microsecond precision (see ROUND_FOR_UPDATE). */
function assertFresh(actual: string, expected: string) {
  if (actual !== expected) {
    throw new DispatchError("stale", "Somebody else changed this round. Reload and try again.");
  }
}

/** Refuses an ineligible driver by name. */
export async function reassign(
  roundId: string,
  toDriverId: string,
  expectedUpdatedAt: string,
  actorSub: string,
): Promise<void> {
  const candidates = await loadCandidates();
  const target = candidates.find((c) => c.driverId === toDriverId);
  if (!target) throw new DispatchError("not_found", "That driver does not exist.");

  await withTransaction(async (tx: any) => {
    const cur = await tx.query(ROUND_FOR_UPDATE, [roundId]);
    const r = cur.rows[0];
    if (!r) throw new DispatchError("not_found", "That round does not exist.");
    assertFresh(r.updated_at, expectedUpdatedAt);
    await refuseWhileParcelsToReturn(tx, roundId);

    // The planner's own rule, asked about the round as it really is (refrigeration, deadline, stops, zones).
    const work: {
      rows: Array<{
        zone_id: string | null;
        weight_grams: string;
        requires_chilled: boolean;
        requires_frozen: boolean;
        stops: number;
      }>;
    } = await tx.query(ROUND_WORK, [roundId]);
    const settings: { rows: Array<{ per_stop_allowance_min: number }> } = await tx.query(
      `SELECT per_stop_allowance_min FROM public.delivery_settings WHERE id = 1`,
    );
    const perStopAllowanceMin = settings.rows[0]?.per_stop_allowance_min ?? 12;

    const now = new Date();
    const deadlineAt = r.deadline_at as Date;
    const stops = Number(work.rows[0]?.stops ?? 0);
    // A late round can still be moved: only the driver's shift end limits it.
    const late = deadlineAt.getTime() <= now.getTime();
    const effectiveDeadline = late ? new Date(now.getTime() + stops * perStopAllowanceMin * 60_000) : deadlineAt;
    // An unstarted round cannot be worked before it opens; one under way starts now.
    const startAt = r.status === "planned" && r.opens_at ? (r.opens_at as Date) : now;

    // One question per distinct area (a driver must be cleared for all), each with the round's weight, stops and refrigeration.
    const units =
      work.rows.length > 0
        ? work.rows
        : [{ zone_id: null, weight_grams: "0", requires_chilled: false, requires_frozen: false, stops: 0 }];
    const found = new Set<ExclusionReason>();
    for (const u of units) {
      for (const reason of eligibilityReasons({
        driver: target,
        work: {
          function: r.kind,
          zoneId: u.zone_id,
          totalWeightGrams: Number(u.weight_grams),
          requiresChilled: u.requires_chilled,
          requiresFrozen: u.requires_frozen,
          stopCount: stops,
          deadlineAt: effectiveDeadline,
        },
        now,
        perStopAllowanceMin,
        startAt,
      })) {
        // An empty round has no zone to be cleared for.
        if (work.rows.length === 0 && reason === "not_cleared") continue;
        found.add(reason);
      }
    }
    const reasons = [...found];

    if (reasons.length > 0) {
      throw new DispatchError(
        "ineligible",
        "That driver cannot take this round.",
        reasons,
      );
    }

    await tx.query(
      `UPDATE public.driver_round SET driver_id = $2, updated_at = now() WHERE id = $1`,
      [roundId, toDriverId],
    );
    await enqueueRunAssigned(tx, roundId);
    if (r.driver_id && r.driver_id !== toDriverId) await enqueueRoundChanged(tx, roundId, r.driver_id);
    await audit(tx, actorSub, "dispatch.reassign", roundId, { toDriverId });
  });
}

/** Work goes back to the pool for the next wave. */
export async function unassign(roundId: string, expectedUpdatedAt: string, actorSub: string): Promise<void> {
  await withTransaction(async (tx: any) => {
    const cur = await tx.query(ROUND_FOR_UPDATE, [roundId]);
    const r = cur.rows[0];
    if (!r) throw new DispatchError("not_found", "That round does not exist.");
    assertFresh(r.updated_at, expectedUpdatedAt);
    await refuseWhileParcelsToReturn(tx, roundId);

    // Only work still in the round: a `picked_up` package is in a van, and releasing it would send a second driver.
    await tx.query(
      `DELETE FROM public.round_package rp
        USING public.round_stop rs
        WHERE rs.id = rp.stop_id AND rs.round_id = $1 AND rp.state = 'assigned'`,
      [roundId],
    );
    await tx.query(
      `UPDATE public.driver_round SET status = 'cancelled', updated_at = now() WHERE id = $1`,
      [roundId],
    );
    if (r.driver_id) await enqueueRoundChanged(tx, roundId, r.driver_id);
    await audit(tx, actorSub, "dispatch.unassign", roundId, {});
  });
}

export async function reorder(
  roundId: string,
  stopIds: string[],
  expectedUpdatedAt: string,
  actorSub: string,
): Promise<void> {
  await withTransaction(async (tx: any) => {
    const cur = await tx.query(ROUND_FOR_UPDATE, [roundId]);
    const r = cur.rows[0];
    if (!r) throw new DispatchError("not_found", "That round does not exist.");
    assertFresh(r.updated_at, expectedUpdatedAt);

    const own = await tx.query(`SELECT id FROM public.round_stop WHERE round_id = $1`, [roundId]);
    const owned = new Set(own.rows.map((s: any) => s.id));
    if (stopIds.length !== owned.size || stopIds.some((id) => !owned.has(id))) {
      // Every stop exactly once, or manual and derived orders would mix.
      throw new DispatchError("invalid", "The order must list every stop on this round exactly once.");
    }

    for (const [i, id] of stopIds.entries()) {
      await tx.query(`UPDATE public.round_stop SET seq = $2 WHERE id = $1`, [id, i]);
    }
    await tx.query(`UPDATE public.driver_round SET updated_at = now() WHERE id = $1`, [roundId]);
    if (r.driver_id) await enqueueRoundChanged(tx, roundId, r.driver_id);
    await audit(tx, actorSub, "dispatch.reorder", roundId, { stops: stopIds.length });
  });
}

/** Every manual change is recorded through the shared audit writer, which redacts PII values. */
async function audit(tx: any, actorSub: string, action: DispatchAuditAction, targetId: string, detail: Record<string, unknown>) {
  await recordAudit({ actorSub, action, targetType: "driver_round", driverId: targetId, detail }, tx);
}

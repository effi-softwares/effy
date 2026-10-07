// Returning work nobody can do (072, research R10).
//
// ⚠ 063 REQUIRED THIS AND NOTHING DID IT. FR-035 there says work assigned to a driver who goes off
// duty returns to the pool; the tasks were ticked; `goOffDuty` ends the duty session and touches
// nothing else. The gap was narrow while a round existed for the last 45 minutes before it was due.
// Since 072 a round is assigned the moment a driver can take it — a driver given tomorrow's run at
// 18:00 goes home, and without this step keeps it, with every query that looks for unassigned work
// skipping the packages because they ARE assigned.
//
// ⚠ IT RUNS IN THE PLANNING PASS, NOT IN THE ROUTES THAT END A SHIFT. There are two of those (the
// driver's own, and back-office ending a session), plus standing a driver down and offboarding them.
// Four call sites each remembering to release is four chances to forget; one sweep at the start of
// every pass covers all of them and is at most one pass late.

import { instantAtLocalTime, localDateParts, type CollectionRun, type Queryable } from "@effy/edge-shared";
import type pg from "pg";

import { recordAudit } from "../shared/audit";
import { PLANNED_COLLECTION_ROUNDS, RELEASE_ASSIGNED, UNWORKABLE_ROUNDS } from "./sql";

/** The audit actor for something the platform did by itself. */
const SYSTEM_ACTOR = "system:planner";

export interface ReleaseResult {
  /** Packages returned to be assigned again. */
  released: number;
  /** Drivers whose work changed — their apps are told after the pass commits. */
  driverIds: string[];
}

/** Does this instant fall on an active run, on its own local date? */
function isScheduled(deadlineAt: Date, runs: readonly CollectionRun[]): boolean {
  const { year, month, day } = localDateParts(deadlineAt);
  return runs.some((r) => instantAtLocalTime(year, month, day, r.hour, r.minute).getTime() === deadlineAt.getTime());
}

async function releaseRound(
  tx: Queryable,
  round: { id: string; driver_id: string; status: string },
  why: "driver_unavailable" | "run_removed",
): Promise<number> {
  const gone = await tx.query(RELEASE_ASSIGNED, [round.id]);
  const released = gone.rowCount ?? 0;

  if (round.status === "planned") {
    // Not begun: nothing of it is in anybody's hands, so the round itself is over.
    await tx.query(`UPDATE public.driver_round SET status = 'cancelled', updated_at = now() WHERE id = $1`, [round.id]);
  } else if (released > 0) {
    // Under way: the driver keeps what they collected and the round goes on to the hub with it.
    await tx.query(
      `UPDATE public.round_stop rs
          SET status = 'skipped', completed_at = now()
        WHERE rs.round_id = $1
          AND rs.kind = 'shop_pickup'
          AND rs.status NOT IN ('done', 'skipped')
          AND NOT EXISTS (SELECT 1 FROM public.round_package rp WHERE rp.stop_id = rs.id)`,
      [round.id],
    );
    await tx.query(`UPDATE public.driver_round SET updated_at = now() WHERE id = $1`, [round.id]);
  }

  if (released > 0 || round.status === "planned") {
    await recordAudit(
      {
        actorSub: SYSTEM_ACTOR,
        action: "driver.work_released",
        driverId: round.driver_id,
        detail: { roundId: round.id, packages: released, why },
      },
      tx as unknown as pg.PoolClient,
    );
  }
  return released;
}

/**
 * Take back uncollected work from drivers who cannot do it, and end not-yet-begun rounds for a
 * collection run that no longer exists. Released packages are simply unassigned again; the rest of
 * the same pass reconsiders them.
 *
 * ⚠ LOCKED ROUNDS ARE NEVER TOUCHED (FR-019) — both queries exclude them. A dispatcher who decided a
 * round owns that decision, including when the driver they chose has gone home.
 *
 * ⚠ A DELIVERY ROUND UNDER WAY IS NEVER TOUCHED EITHER. Its packages read `assigned` until they are
 * delivered, but they left the hub in a van; releasing them would send a second driver to the hub
 * for goods that are not there.
 */
export async function releaseUnworkable(
  tx: Queryable,
  runs: readonly CollectionRun[],
): Promise<ReleaseResult> {
  let released = 0;
  const driverIds = new Set<string>();
  const handled = new Set<string>();

  const unworkable = await tx.query<{ id: string; driver_id: string; kind: string; status: string }>(UNWORKABLE_ROUNDS);
  for (const round of unworkable.rows) {
    if (round.kind === "delivery" && round.status === "in_progress") continue;
    released += await releaseRound(tx, round, "driver_unavailable");
    handled.add(round.id);
    driverIds.add(round.driver_id);
  }

  // FR-014 — a round not yet begun follows the schedule as it now stands. Runs are created and
  // deleted, never edited, so "this round's run is gone" is "its deadline is on no active run".
  const planned = await tx.query<{ id: string; driver_id: string; deadline_at: Date }>(PLANNED_COLLECTION_ROUNDS);
  for (const round of planned.rows) {
    if (handled.has(round.id) || isScheduled(round.deadline_at, runs)) continue;
    released += await releaseRound(tx, { ...round, status: "planned" }, "run_removed");
    driverIds.add(round.driver_id);
  }

  return { released, driverIds: [...driverIds] };
}

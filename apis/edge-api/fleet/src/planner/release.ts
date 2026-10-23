// Returns work nobody can do: a driver given tomorrow's run who goes off duty would otherwise keep it.
// Runs at the start of every planning pass rather than in the four routes that end a shift, so it
// cannot be forgotten and is at most one pass late.

import { instantAtLocalTime, localDateParts, type CollectionRun, type Queryable } from "@effy/edge-shared";
import type pg from "pg";

import { recordAudit } from "../shared/audit";
import { PLANNED_COLLECTION_ROUNDS, RELEASE_ASSIGNED, UNWORKABLE_ROUNDS } from "./sql";
import { enqueueRoundChanged } from "../shared/driver-push";

const SYSTEM_ACTOR = "system:planner";

export interface ReleaseResult {
  released: number;
  /** Their apps are told after the pass commits. */
  driverIds: string[];
}

/** On its own local date. */
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
    // Not begun: nothing is in anyone's hands, so the round is over.
    await tx.query(`UPDATE public.driver_round SET status = 'cancelled', updated_at = now() WHERE id = $1`, [round.id]);
  } else if (released > 0) {
    // Under way: the driver keeps what they collected and goes on to the hub.
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
    // Ended: "Run removed"; under way and shorter: "Run updated".
    await enqueueRoundChanged(tx, round.id, round.driver_id);
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
 * Takes back uncollected work from drivers who cannot do it, and ends unstarted rounds for a run that
 * no longer exists. A delivery round under way is never touched: its goods left the hub.
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

  // Runs are created and deleted, never edited, so a gone run is a deadline on no active run.
  const planned = await tx.query<{ id: string; driver_id: string; deadline_at: Date }>(PLANNED_COLLECTION_ROUNDS);
  for (const round of planned.rows) {
    if (handled.has(round.id) || isScheduled(round.deadline_at, runs)) continue;
    released += await releaseRound(tx, { ...round, status: "planned" }, "run_removed");
    driverIds.add(round.driver_id);
  }

  return { released, driverIds: [...driverIds] };
}

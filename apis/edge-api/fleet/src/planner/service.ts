// The wave planner (063) — the service that turns ready packages into a driver's day.

import {
  collectionDeadline,
  endOfLocalDay,
  nextPlanningTime,
  runsDueForPlanning,
  wavePlanningTime,
  type CollectionRun,
} from "@effy/edge-shared";

import { planWave } from "./assign";
import {
  commitWave,
  findOpenStopForShop,
  gatherCollectionWork,
  gatherDeliveryWork,
  loadCandidates,
  loadSchedule,
} from "./repository";
import type { WavePlan } from "./types";

export interface WaveOutcome {
  kind: "collection" | "delivery";
  waveId: string | null;
  considered: number;
  assigned: number;
  unassigned: number;
  /** Null when there was simply nothing to do — not an error, and not worth an alarm. */
  skippedReason: string | null;
  /** Set only on a `no_run_due` skip: when the next collection wave will be planned. */
  nextPlanningAt?: Date | null;
}

/**
 * Plan every wave that is due right now.
 *
 * ⚠ THE SCHEDULED TICK IS NOT THE WAVE (contracts/routes.md). This runs every few minutes and plans
 * only when a collection run has actually reached `run_time − buffer − lead`. The collection schedule
 * decides when work is created; the cron expression decides only how often we check. That is what
 * makes this a wave planner rather than 049's one-minute scavenger, which had no notion of a deadline
 * and therefore no reason to batch (D12).
 */
export async function runDuePlanning(now = new Date()): Promise<WaveOutcome[]> {
  const { runs, settings } = await loadSchedule();

  if (runs.length === 0) {
    // ⚠ Not an error. A platform with no collection runs configured has no waves, and inventing one
    // would put work on a van nobody scheduled.
    return [{ kind: "collection", waveId: null, considered: 0, assigned: 0, unassigned: 0, skippedReason: "no_active_collection_runs" }];
  }

  const due = runsDueForPlanning(runs, settings.prepBufferMin, settings.planningLeadMin, now);
  const outcomes: WaveOutcome[] = [];

  if (due.length === 0) {
    // ⚠ REPORTED, NOT PASSED OVER IN SILENCE. The loop below simply does not execute when nothing is
    // due, so collection previously emitted no log line whatsoever — and "no run is due yet" became
    // indistinguishable from "the planner is dead". It cost a live investigation: 14 packages ready,
    // an on-duty driver, an empty app, and nothing anywhere connecting the three. The next planning
    // instant rides along so the log answers "then when?" without anyone recomputing the schedule.
    const next = nextPlanningTime(runs, settings.prepBufferMin, settings.planningLeadMin, now);
    outcomes.push({
      kind: "collection",
      waveId: null,
      considered: 0,
      assigned: 0,
      unassigned: 0,
      skippedReason: "no_run_due",
      nextPlanningAt: next,
    });
  }

  for (const run of due) {
    outcomes.push(await planCollectionWave(run, settings, now, "schedule", null));
  }

  // The delivery wave follows the same tick but a different precondition: packages at the hub, not a
  // run time. It is run whenever there is anything to deliver.
  outcomes.push(await planDeliveryWave(settings, now, "schedule", null));
  return outcomes;
}

/** Plan collection for one run. Exported so a dispatcher can force a pass (FR-005 / `POST /plan`). */
export async function planCollectionWave(
  run: CollectionRun,
  settings: { prepBufferMin: number; planningLeadMin: number; perStopAllowanceMin: number },
  now: Date,
  trigger: "schedule" | "manual",
  triggeredBySub: string | null,
): Promise<WaveOutcome> {
  const deadlineAt = collectionDeadline(run, settings.prepBufferMin, now);
  const plannedFor = wavePlanningTime(run, settings.prepBufferMin, settings.planningLeadMin, now);

  const [packages, candidates] = await Promise.all([gatherCollectionWork(), loadCandidates()]);
  if (packages.length === 0) {
    return { kind: "collection", waveId: null, considered: 0, assigned: 0, unassigned: 0, skippedReason: "nothing_ready" };
  }

  // FR-004a — which shops still have an outstanding stop a late package could join.
  const openStops = new Map<string, { stopId: string; driverId: string; deadlineAt: Date; locked: boolean }>();
  for (const shopId of new Set(packages.map((p) => p.shopId))) {
    const open = await findOpenStopForShop(shopId);
    if (open) openStops.set(shopId, open);
  }

  const plan = planWave({
    kind: "collection",
    packages,
    candidates,
    plannedFor,
    deadlineAt,
    now,
    perStopAllowanceMin: settings.perStopAllowanceMin,
    openStops,
  });

  return commitAndSummarise(plan, trigger, triggeredBySub);
}

/** Plan the same-day delivery wave over whatever has reached the hub. */
export async function planDeliveryWave(
  settings: { prepBufferMin: number; planningLeadMin: number; perStopAllowanceMin: number },
  now: Date,
  trigger: "schedule" | "manual",
  triggeredBySub: string | null,
): Promise<WaveOutcome> {
  const [packages, candidates] = await Promise.all([gatherDeliveryWork(), loadCandidates()]);
  if (packages.length === 0) {
    return { kind: "delivery", waveId: null, considered: 0, assigned: 0, unassigned: 0, skippedReason: "nothing_at_hub" };
  }

  // ⚠ A same-day package is due TODAY. With no delivery window in the data model (052 R4 — the
  // promise is date-granular), end of the local day is the only honest deadline, and it is not
  // invented: it is the last moment the promise can still be kept.
  const deadlineAt = endOfLocalDay(now);

  const plan = planWave({
    kind: "delivery",
    packages,
    candidates,
    plannedFor: now,
    deadlineAt,
    now,
    perStopAllowanceMin: settings.perStopAllowanceMin,
    openStops: new Map(),
  });

  return commitAndSummarise(plan, trigger, triggeredBySub);
}

async function commitAndSummarise(
  plan: WavePlan,
  trigger: "schedule" | "manual",
  triggeredBySub: string | null,
): Promise<WaveOutcome> {
  const { waveId, assigned } = await commitWave(plan, trigger, triggeredBySub, null);
  return {
    kind: plan.kind,
    waveId,
    considered: plan.considered,
    assigned,
    unassigned: plan.considered - assigned,
    skippedReason: null,
  };
}

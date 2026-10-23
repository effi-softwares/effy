import { collectionRunFor, endOfLocalDay, localDateParts, nextRunInstant, withTransaction, type Queryable } from "@effy/edge-shared";
import { nonDeliveryDates } from "@effy/edge-shared/delivery";

import { planWave } from "./assign";
import { releaseUnworkable } from "./release";
import {
  commitWave,
  gatherCollectionWork,
  gatherDeliveryWork,
  loadBucketRounds,
  loadCandidates,
  loadSchedule,
  replaceExclusions,
  roundOpensAt,
  tryPassLock,
} from "./repository";
import type { PlannedExclusion, PlannerSettings, WavePlan } from "./types";
import { deadlineFor, groupByWindow } from "./windows";
import { enqueueRoundsOpeningSoon } from "../shared/driver-push";

export interface KindOutcome {
  kind: "collection" | "delivery";
  considered: number;
  assigned: number;
  unassigned: number;
  /** Unassigned packages whose round would already be open: what the alarm watches. */
  unassignedPastOpening: number;
  /** Why the kind was not planned; null when it was. */
  skippedReason: "no_active_collection_runs" | null;
  /** Collection only: parcels still at a supplier after the run that would have made their window. */
  collectLate?: number;
}

export interface PassOutcome {
  /** Another pass held the lock. */
  skipped: "pass_in_progress" | null;
  collection: KindOutcome;
  delivery: KindOutcome;
  /** Taken back from drivers who could not do them, or from a removed run. */
  released: number;
  reasonsChanged: boolean;
  /** Told after the pass commits, by the caller. */
  driverIds: string[];
}

const nothing = (kind: "collection" | "delivery"): KindOutcome => ({
  kind,
  considered: 0,
  assigned: 0,
  unassigned: 0,
  unassignedPastOpening: 0,
  skippedReason: null,
});

/** The caller announces only then. */
export function passChangedAnything(o: PassOutcome): boolean {
  return o.released > 0 || o.reasonsChanged || o.collection.assigned > 0 || o.delivery.assigned > 0;
}

/**
 * One pass: every package a driver can take goes to a driver now; the round's opening time stops early
 * action. First come, first served: nothing assigned is moved. Release, assign and record reasons in
 * one transaction under one lock, which makes "find or create this driver's round" safe.
 */
export async function runPass(now = new Date()): Promise<PassOutcome> {
  return withTransaction(async (tx: Queryable) => {
    if (!(await tryPassLock(tx))) {
      return {
        skipped: "pass_in_progress" as const,
        collection: nothing("collection"),
        delivery: nothing("delivery"),
        released: 0,
        reasonsChanged: false,
        driverIds: [],
      };
    }

    const { runs, settings } = await loadSchedule(tx);
    const driverIds = new Set<string>();

    // 1. Work nobody can do goes back first, so this pass can place it.
    const release = await releaseUnworkable(tx, runs);
    for (const id of release.driverIds) driverIds.add(id);

    // 2. Collection: everything ready at a shop, for the next run.
    const collection = await planCollection(tx, runs, settings, now);
    for (const id of collection.driverIds) driverIds.add(id);

    // 3. Delivery: everything at the hub, per window.
    const delivery = await planDelivery(tx, settings, now);
    for (const id of delivery.driverIds) driverIds.add(id);

    // 4. The standing reasons, rewritten only where they changed.
    const collectionReasons = await replaceExclusions(tx, "collection", collection.exclusions);
    const deliveryReasons = await replaceExclusions(tx, "delivery", delivery.exclusions);

    // 5. Tell drivers whose round opens in the next few minutes.
    await enqueueRoundsOpeningSoon(tx, now);

    return {
      skipped: null,
      collection: collection.outcome,
      delivery: delivery.outcome,
      released: release.released,
      reasonsChanged: collectionReasons || deliveryReasons,
      driverIds: [...driverIds],
    };
  });
}

interface Planned {
  outcome: KindOutcome;
  exclusions: PlannedExclusion[];
  driverIds: string[];
}

const isOpen = (opensAt: Date | null, now: Date) => opensAt === null || opensAt.getTime() <= now.getTime();

async function planCollection(
  tx: Queryable,
  runs: Awaited<ReturnType<typeof loadSchedule>>["runs"],
  settings: PlannerSettings,
  now: Date,
): Promise<Planned> {
  // Which run: the next one not passed. A package readied just before a run fails the deadline gate and moves on next pass.
  const deadlineAt = nextRunInstant(runs, now);
  if (deadlineAt === null) {
    // No collection runs configured: no rounds.
    return { outcome: { ...nothing("collection"), skippedReason: "no_active_collection_runs" }, exclusions: [], driverIds: [] };
  }

  // An Effy parcel sold a window travels on the latest run that still makes it (`collectionRunFor`), and
  // on every later run if missed. Courier parcels via the hub and windowless parcels take the next run.
  const ready = await gatherCollectionWork(tx);
  const calendar = { noWeekdays: settings.noDeliveryWeekdays, noDates: await nonDeliveryDates(tx, isoDateOf(now, -8)) };
  let collectLate = 0;
  const packages = ready.filter((p) => {
    const due = dueRun(p, runs, settings, calendar);
    if (due === null) return true;
    if (due.getTime() > deadlineAt.getTime()) return false;
    if (due.getTime() < deadlineAt.getTime()) collectLate += 1;
    return true;
  });
  if (packages.length === 0) return { outcome: { ...nothing("collection"), collectLate }, exclusions: [], driverIds: [] };

  const candidates = await loadCandidates(tx);
  const rounds = await loadBucketRounds(tx, "collection", deadlineAt, null);
  const opensAt = await roundOpensAt(tx, "collection", deadlineAt, null);

  const plan = planWave({
    kind: "collection",
    packages,
    candidates,
    plannedFor: now,
    deadlineAt,
    now,
    perStopAllowanceMin: settings.perStopAllowanceMin,
    opensAt,
    rounds,
  });
  const done = await commitAndSummarise(tx, plan, isOpen(opensAt, now));
  return { ...done, outcome: { ...done.outcome, collectLate } };
}

/** The run an Effy parcel with a window is due on; null means the next run. Used by the dispatch day view too. */
export function dueRun(
  p: { deliveredBy: "effy" | "courier"; windowStart: Date | null },
  runs: Awaited<ReturnType<typeof loadSchedule>>["runs"],
  settings: Pick<PlannerSettings, "hubTurnaroundMin">,
  calendar: { noWeekdays: readonly number[]; noDates: ReadonlySet<string> },
): Date | null {
  if (p.deliveredBy !== "effy" || p.windowStart === null) return null;
  return collectionRunFor(p.windowStart, runs, settings.hubTurnaroundMin, calendar);
}

export function isoDateOf(at: Date, offsetDays = 0): string {
  const { year, month, day } = localDateParts(at);
  return new Date(Date.UTC(year, month - 1, day + offsetDays, 12)).toISOString().slice(0, 10);
}

/**
 * One plan per window whose day has come, against the window's end, assigned at once; the round
 * waits for its opening time. Windowless packages are planned against the end of the day.
 */
async function planDelivery(tx: Queryable, settings: PlannerSettings, now: Date): Promise<Planned> {
  const packages = await gatherDeliveryWork(tx, null, endOfLocalDay(now));
  const total: Planned = { outcome: nothing("delivery"), exclusions: [], driverIds: [] };
  if (packages.length === 0) return total;

  const endOfDay = endOfLocalDay(now);
  // Earliest window first gets first call on drivers.
  for (const group of groupByWindow(packages)) {
    const deadlineAt = deadlineFor(group, now, endOfDay);
    // A window already closed is delivered late against the end of the day, open now.
    const windowStartAt = group.windowEnd !== null && deadlineAt.getTime() === group.windowEnd.getTime() ? group.windowStart : null;

    // Candidates are re-read per window, carrying the load just given.
    const candidates = await loadCandidates(tx);
    const rounds = await loadBucketRounds(tx, "delivery", deadlineAt, windowStartAt);
    const opensAt = await roundOpensAt(tx, "delivery", deadlineAt, windowStartAt);

    const plan = planWave({
      kind: "delivery",
      packages: group.packages,
      candidates,
      plannedFor: now,
      deadlineAt,
      now,
      perStopAllowanceMin: settings.perStopAllowanceMin,
      opensAt,
      windowStartAt,
      rounds,
    });
    const one = await commitAndSummarise(tx, plan, isOpen(opensAt, now));

    total.outcome.considered += one.outcome.considered;
    total.outcome.assigned += one.outcome.assigned;
    total.outcome.unassigned += one.outcome.unassigned;
    total.outcome.unassignedPastOpening += one.outcome.unassignedPastOpening;
    total.exclusions.push(...one.exclusions);
    total.driverIds.push(...one.driverIds);
  }
  return total;
}

async function commitAndSummarise(tx: Queryable, plan: WavePlan, open: boolean): Promise<Planned> {
  const { assigned, driverIds } = await commitWave(plan, "schedule", null, null, tx);
  const unassigned = plan.considered - assigned;
  return {
    outcome: {
      kind: plan.kind,
      considered: plan.considered,
      assigned,
      unassigned,
      unassignedPastOpening: open ? unassigned : 0,
      skippedReason: null,
    },
    exclusions: plan.exclusions,
    driverIds,
  };
}

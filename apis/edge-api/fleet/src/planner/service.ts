// The planner (063, reshaped by 072) — the service that turns ready packages into a driver's day.

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

/** What one pass did for one kind of work. */
export interface KindOutcome {
  kind: "collection" | "delivery";
  considered: number;
  assigned: number;
  unassigned: number;
  /**
   * Unassigned packages whose round would ALREADY BE OPEN — the number an alarm should watch
   * (research R12). A package readied at 20:00 for tomorrow's run with nobody on duty is unassigned
   * and is not a failure; one whose run has opened and has nobody is.
   */
  unassignedPastOpening: number;
  /** Set when the kind was not planned at all — and why. Null when it was. */
  skippedReason: "no_active_collection_runs" | null;
  /**
   * 082 — collection only: parcels still at a supplier AFTER the run that would have reached the hub
   * in time for their window. They are on this pass's run (or unassigned); the window is at risk.
   */
  collectLate?: number;
}

export interface PassOutcome {
  /** Set when the whole pass did nothing: another pass held the lock. */
  skipped: "pass_in_progress" | null;
  collection: KindOutcome;
  delivery: KindOutcome;
  /** Packages taken back from drivers who could not do them, or from a run that was removed. */
  released: number;
  /** Whether the standing "nobody can take this" facts changed. */
  reasonsChanged: boolean;
  /** Drivers whose work changed. Their apps are told AFTER the pass has committed, by the caller. */
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

/** Whether anything a screen shows changed — the caller announces only then. */
export function passChangedAnything(o: PassOutcome): boolean {
  return o.released > 0 || o.reasonsChanged || o.collection.assigned > 0 || o.delivery.assigned > 0;
}

/**
 * One planning pass: give every package a driver can take to a driver, now.
 *
 * ⚠ THERE IS NO PLANNING WINDOW ANY MORE (072). Until this feature a pass assigned collection work
 * only between `run − lead` and the run, and delivery work only from `window start − lead` — so a
 * package a shop finished at 09:00 for a 14:00 run had nobody's name on it until 13:15, and its
 * driver learned the shape of the run 45 minutes before it had to be finished. Every pass now
 * assigns. What stops a driver acting on a 14:00 run at 09:00 is no longer that they cannot see it;
 * it is that the round has not OPENED (`public.round_opens_at`, enforced in the driver service).
 *
 * ⚠ FIRST COME, FIRST SERVED (FR-009). Nothing here moves work that is already assigned. A driver
 * who clocks on at midday gets what becomes ready from midday; the morning's work stays with whoever
 * was given it. That imbalance was chosen over rebalancing, and a dispatcher can still move a round.
 *
 * ⚠ ONE TRANSACTION, UNDER ONE LOCK. Release, assign and record reasons either all happen or none
 * do, and two passes cannot interleave — which is what makes "find this driver's round for the run,
 * or create it" safe without a unique index (research R4).
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

    // 1. Work nobody can do goes back first, so the rest of this pass can place it.
    const release = await releaseUnworkable(tx, runs);
    for (const id of release.driverIds) driverIds.add(id);

    // 2. Collection — everything ready at a shop, for the next run.
    const collection = await planCollection(tx, runs, settings, now);
    for (const id of collection.driverIds) driverIds.add(id);

    // 3. Same-day delivery — everything at the hub, per window.
    const delivery = await planDelivery(tx, settings, now);
    for (const id of delivery.driverIds) driverIds.add(id);

    // 4. The standing reasons, rewritten only where they changed.
    const collectionReasons = await replaceExclusions(tx, "collection", collection.exclusions);
    const deliveryReasons = await replaceExclusions(tx, "delivery", delivery.exclusions);

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

/** Is a round with this opening time already workable? */
const isOpen = (opensAt: Date | null, now: Date) => opensAt === null || opensAt.getTime() <= now.getTime();

async function planCollection(
  tx: Queryable,
  runs: Awaited<ReturnType<typeof loadSchedule>>["runs"],
  settings: PlannerSettings,
  now: Date,
): Promise<Planned> {
  // ⚠ WHICH RUN, NOT WHETHER (research R2). The next run whose time has not passed — today's, or
  // tomorrow's first once today's last has gone. A package readied a minute before a run still
  // targets it, fails every driver's deadline gate, and moves to the next run on the pass after.
  const deadlineAt = nextRunInstant(runs, now);
  if (deadlineAt === null) {
    // ⚠ Not an error. A platform with no collection runs configured has no rounds, and inventing a
    // deadline would put work on a van nobody scheduled.
    return { outcome: { ...nothing("collection"), skippedReason: "no_active_collection_runs" }, exclusions: [], driverIds: [] };
  }

  // ⚠ 082 — NOT BEFORE IT NEEDS TO. An Effy parcel sold a window travels on the LATEST run that still
  // reaches the hub in time (`collectionRunFor`): chilled goods stay at the supplier, and the hub holds
  // as little as it can. It is taken from the run it is due on, and from every run after if it was
  // missed — never from an earlier one. A courier parcel via the hub, and a parcel sold no window, go
  // on the next run as they always did.
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

/**
 * The run an Effy parcel sold a window is DUE on; null = no rule applies (the next run).
 * Exported for the dispatch day view, which must call a parcel "late" by the planner's own rule.
 */
export function dueRun(
  p: { deliveredBy: "effy" | "courier"; windowStart: Date | null },
  runs: Awaited<ReturnType<typeof loadSchedule>>["runs"],
  settings: Pick<PlannerSettings, "hubTurnaroundMin">,
  calendar: { noWeekdays: readonly number[]; noDates: ReadonlySet<string> },
): Date | null {
  if (p.deliveredBy !== "effy" || p.windowStart === null) return null;
  return collectionRunFor(p.windowStart, runs, settings.hubTurnaroundMin, calendar);
}

/** yyyy-mm-dd of the local date `offsetDays` from `at`. */
export function isoDateOf(at: Date, offsetDays = 0): string {
  const { year, month, day } = localDateParts(at);
  return new Date(Date.UTC(year, month - 1, day + offsetDays, 12)).toISOString().slice(0, 10);
}

/**
 * Effy delivery over whatever has reached the hub and is due today — one plan per delivery window.
 *
 * ⚠ 082 — ONLY WINDOWS WHOSE DAY HAS COME (`gatherDeliveryWork(…, end of today)`). A parcel for a later
 * day is at the hub and on no round until that day's first pass.
 *
 * ⚠ ONE PLAN PER WINDOW (069), ASSIGNED AT ONCE (072). A customer is sold a window, so each window's
 * packages are planned together against the window's END. Until 072 they then waited at the hub,
 * unassigned, until the lead time before the window; they are now assigned on the next pass after
 * check-in and the ROUND waits instead — visible to its driver, and refused until it opens, so
 * nobody is sent to a customer's door three hours early.
 *
 * Packages with no window — orders placed before 069 — are planned against the end of the day and
 * are open immediately, exactly as before.
 */
async function planDelivery(tx: Queryable, settings: PlannerSettings, now: Date): Promise<Planned> {
  const packages = await gatherDeliveryWork(tx, null, endOfLocalDay(now));
  const total: Planned = { outcome: nothing("delivery"), exclusions: [], driverIds: [] };
  if (packages.length === 0) return total;

  const endOfDay = endOfLocalDay(now);
  // Earliest window first, so the earliest window gets first call on drivers.
  for (const group of groupByWindow(packages)) {
    const deadlineAt = deadlineFor(group, now, endOfDay);
    // ⚠ A window that has ALREADY CLOSED is delivered late against the end of the day (069), and
    // such a round has no window to wait for: it belongs with the windowless work and is open now.
    const windowStartAt = group.windowEnd !== null && deadlineAt.getTime() === group.windowEnd.getTime() ? group.windowStart : null;

    // Candidates are re-read per window: a driver given the 5–7 pm round is carrying that load when
    // the 7–9 pm round is planned in the same pass.
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

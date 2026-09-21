// Who gets what (063) — a pure function over gathered work and loaded candidates.
//
// ⚠ PURE ON PURPOSE. No database, no clock of its own, no I/O. Every hard case this feature has —
// a driver cleared for every zone, a van that cannot take frozen, a round that cannot finish before
// the cutoff, two drivers with unequal loads — is then a table-driven unit test rather than a
// container fixture. The repository decides WHAT IS TRUE; this decides WHAT TO DO.

import { eligibilityReasons, pickByLoad, type ExclusionReason } from "@effy/edge-shared";

import type { PlannablePackage, PlannedExclusion, PlannerCandidate, WavePlan } from "./types";

export interface AssignInput {
  kind: "collection" | "delivery";
  packages: PlannablePackage[];
  candidates: PlannerCandidate[];
  plannedFor: Date;
  deadlineAt: Date;
  now: Date;
  perStopAllowanceMin: number;
  /** shopId → an in-flight stop a late package may join (FR-004a). */
  openStops: Map<string, { stopId: string; driverId: string; deadlineAt: Date; locked: boolean }>;
}

/** Running totals per driver, so a wave's own assignments count toward the next decision. */
interface Running {
  candidate: PlannerCandidate;
  taken: PlannablePackage[];
  weightGrams: number;
  stops: Set<string>;
}

function stopKey(kind: "collection" | "delivery", p: PlannablePackage): string {
  return kind === "collection" ? p.shopId : (p.orderId ?? p.packageId);
}

/**
 * Plan one wave.
 *
 * ⚠ PACKAGES ARE PLACED IN READINESS ORDER, oldest first. What has been waiting longest is placed
 * first, so a busy wave degrades by making the newest work wait rather than by making an arbitrary
 * package wait — which is the behaviour a dispatcher can explain to a shop.
 */
export function planWave(input: AssignInput): WavePlan {
  const { kind, packages, candidates, plannedFor, deadlineAt, now, perStopAllowanceMin, openStops } = input;

  const running = new Map<string, Running>(
    candidates.map((c) => [
      c.driverId,
      { candidate: c, taken: [], weightGrams: 0, stops: new Set<string>() },
    ]),
  );

  const assignments = new Map<string, PlannablePackage[]>();
  const lateJoins = new Map<string, PlannablePackage[]>();
  const unassigned: PlannablePackage[] = [];
  const exclusions: PlannedExclusion[] = [];

  for (const pkg of packages) {
    // ── FR-004a: a package whose shop is still to be visited joins that round ──────────────────
    const open = kind === "collection" ? openStops.get(pkg.shopId) : undefined;
    if (open && !open.locked) {
      const r = running.get(open.driverId);
      const fits = r
        ? fitsInRound(r, pkg, open.deadlineAt, now, perStopAllowanceMin, kind)
        : { ok: false as const, reason: "over_capacity" as ExclusionReason };

      if (fits.ok) {
        const list = lateJoins.get(open.stopId);
        if (list) list.push(pkg);
        else lateJoins.set(open.stopId, [pkg]);
        if (r) {
          r.taken.push(pkg);
          r.weightGrams += pkg.weightGrams;
          r.stops.add(stopKey(kind, pkg));
        }
        continue;
      }
      // ⚠ FR-004c — it does NOT quietly go on the round anyway. It waits for the next wave, and the
      // reason is recorded so "why is this still sitting here?" has an answer.
      exclusions.push({ packageId: pkg.packageId, driverId: open.driverId, reason: fits.reason });
    }

    // ── The hard gates, then load balance ──────────────────────────────────────────────────────
    const eligible: Running[] = [];
    const perDriverReasons: PlannedExclusion[] = [];

    for (const r of running.values()) {
      const projectedStops = new Set(r.stops);
      projectedStops.add(stopKey(kind, pkg));

      // ⚠ THE LOAD FIGURE IS NOT PASSED HERE, AND THAT IS DELIBERATE. `eligibilityReasons` decides
      // whether a driver MAY do the work; how much they are already carrying is a tie-break, not a
      // gate (FR-010). An earlier draft computed the running load and handed it to this call, which
      // ignores the field — and a negative proof aimed at that line passed happily, proving nothing.
      // The count is computed once, at the `pickByLoad` call below, where it is actually read.
      const reasons = eligibilityReasons({
        driver: r.candidate,
        work: {
          function: kind,
          method: pkg.method,
          zoneId: pkg.zoneId,
          totalWeightGrams: r.weightGrams + pkg.weightGrams,
          requiresChilled: pkg.requiresChilled,
          requiresFrozen: pkg.requiresFrozen,
          stopCount: projectedStops.size,
          deadlineAt,
        },
        now,
        perStopAllowanceMin,
      });

      if (reasons.length === 0) eligible.push(r);
      else {
        for (const reason of reasons) {
          perDriverReasons.push({ packageId: pkg.packageId, driverId: r.candidate.driverId, reason });
        }
      }
    }

    const winner = pickByLoad(
      eligible.map((r) => ({
        driverId: r.candidate.driverId,
        packagesAssignedToday: r.candidate.packagesAssignedToday + r.taken.length,
      })),
    );

    if (winner === null) {
      unassigned.push(pkg);
      // ⚠ FR-015 — EVERY unassigned package carries a reason. A swallowed exclusion still produces a
      // plan and still looks like success, which is why NP12 exists.
      if (perDriverReasons.length > 0) {
        exclusions.push(...perDriverReasons);
      } else {
        // ⚠ No candidate at all — a different and more urgent problem than a named driver failing a
        // named condition, and `driverId: null` is how the console tells them apart.
        exclusions.push({ packageId: pkg.packageId, driverId: null, reason: "not_on_duty" });
      }
      continue;
    }

    const chosen = running.get(winner.driverId)!;
    chosen.taken.push(pkg);
    chosen.weightGrams += pkg.weightGrams;
    chosen.stops.add(stopKey(kind, pkg));

    const list = assignments.get(winner.driverId);
    if (list) list.push(pkg);
    else assignments.set(winner.driverId, [pkg]);
  }

  return {
    kind,
    plannedFor,
    deadlineAt,
    assignments,
    lateJoins,
    unassigned,
    exclusions,
    considered: packages.length,
  };
}

/** Whether a late package can join a round already under way without breaching it (FR-004c). */
function fitsInRound(
  r: Running,
  pkg: PlannablePackage,
  deadlineAt: Date,
  now: Date,
  perStopAllowanceMin: number,
  kind: "collection" | "delivery",
): { ok: true } | { ok: false; reason: ExclusionReason } {
  const projectedStops = new Set(r.stops);
  projectedStops.add(stopKey(kind, pkg));
  const reasons = eligibilityReasons({
    driver: r.candidate,
    work: {
      function: kind,
      method: pkg.method,
      zoneId: pkg.zoneId,
      totalWeightGrams: r.weightGrams + pkg.weightGrams,
      requiresChilled: pkg.requiresChilled,
      requiresFrozen: pkg.requiresFrozen,
      stopCount: projectedStops.size,
      deadlineAt,
    },
    now,
    perStopAllowanceMin,
  });
  return reasons.length === 0 ? { ok: true } : { ok: false, reason: reasons[0]! };
}

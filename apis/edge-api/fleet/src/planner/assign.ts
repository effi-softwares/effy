// Who gets what (063, reshaped by 072) — a pure function over gathered work and loaded candidates.
//
// ⚠ PURE ON PURPOSE. No database, no clock of its own, no I/O. Every hard case this feature has —
// a driver cleared for every zone, a van that cannot take frozen, a round that cannot finish before
// the cutoff, two drivers with unequal loads — is then a table-driven unit test rather than a
// container fixture. The repository decides WHAT IS TRUE; this decides WHAT TO DO.
//
// ⚠ 072 — IT NOW RUNS ALL DAY, NOT FOR 45 MINUTES BEFORE A RUN. Two things follow, and both live
// here. Work for one run arrives across many passes, so a pass must ADD to the round a driver
// already holds for that run and judge capacity over the WHOLE of it, not over this pass's handful
// of packages. And a round planned hours ahead cannot be worked until it opens, so "can it finish in
// time" is asked from the opening time — never from the moment it happened to be planned.

import { eligibilityReasons, pickByLoad, type ExclusionReason } from "@effy/edge-shared";

import type { BucketRound, PlannablePackage, PlannedExclusion, PlannerCandidate, WavePlan } from "./types";

export interface AssignInput {
  kind: "collection" | "delivery";
  packages: PlannablePackage[];
  candidates: PlannerCandidate[];
  plannedFor: Date;
  deadlineAt: Date;
  now: Date;
  perStopAllowanceMin: number;
  /** 072 — when a round for this run or window opens. Null or past means it can be worked now. */
  opensAt?: Date | null;
  /** 072 — the delivery window being planned. Null for collection and for windowless delivery. */
  windowStartAt?: Date | null;
  /** 072 — the rounds that already exist for this run or window, oldest first. */
  rounds?: readonly BucketRound[];
}

/** Running totals for one round — existing or about to be created — as the pass adds to it. */
interface Running {
  candidate: PlannerCandidate;
  /** Null for a round this pass would create. */
  roundId: string | null;
  status: "planned" | "in_progress";
  taken: PlannablePackage[];
  weightGrams: number;
  /** Every stop the driver still has to make on it. */
  stops: Set<string>;
}

function stopKey(kind: "collection" | "delivery", p: PlannablePackage): string {
  return kind === "collection" ? p.shopId : (p.orderId ?? p.packageId);
}

/**
 * Plan one run or one delivery window.
 *
 * ⚠ PACKAGES ARE PLACED IN READINESS ORDER, oldest first. What has been waiting longest is placed
 * first, so a busy pass degrades by making the newest work wait rather than by making an arbitrary
 * package wait — which is the behaviour a dispatcher can explain to a shop.
 */
export function planWave(input: AssignInput): WavePlan {
  const { kind, packages, candidates, plannedFor, deadlineAt, now, perStopAllowanceMin } = input;
  const opensAt = input.opensAt ?? null;
  const rounds = input.rounds ?? [];
  const byDriver = new Map(candidates.map((c) => [c.driverId, c]));

  // ── What each driver already holds for this run or window ────────────────────────────────────
  //
  // `target` is where NEW work for a driver goes: their not-yet-begun round if they have one,
  // otherwise a round this pass creates. ⚠ The OLDEST planned round wins when a dispatcher's move
  // has left a driver with two — `rounds` arrives oldest first and the first one seen is kept.
  const target = new Map<string, Running>();
  // Every existing round by id, including ones under way, which accept work only at a stop that is
  // still outstanding (FR-004a) and are never a target for anything else.
  const existing = new Map<string, Running>();

  for (const round of rounds) {
    const candidate = byDriver.get(round.driverId);
    if (!candidate) continue; // its driver is not a candidate at all; nothing may be added to it
    const running: Running = {
      candidate,
      roundId: round.roundId,
      status: round.status,
      taken: [],
      weightGrams: round.weightGrams,
      stops: new Set(round.stops.filter((s) => s.outstanding).map((s) => s.key)),
    };
    existing.set(round.roundId, running);
    if (round.status === "planned" && !target.has(round.driverId)) target.set(round.driverId, running);
  }
  for (const c of candidates) {
    if (!target.has(c.driverId)) {
      target.set(c.driverId, { candidate: c, roundId: null, status: "planned", taken: [], weightGrams: 0, stops: new Set() });
    }
  }

  /** Which existing round, if any, still has this package's stop to make. */
  const roundVisiting = (key: string): Running | null => {
    for (const round of rounds) {
      // ⚠ A delivery round under way has left the hub. The package is at the hub. Nothing joins it.
      if (kind === "delivery" && round.status === "in_progress") continue;
      if (round.stops.some((s) => s.key === key && s.outstanding)) return existing.get(round.roundId) ?? null;
    }
    return null;
  };

  /** A round's finish is judged from when it can be started — now, if it is already under way. */
  const reasonsFor = (r: Running, pkg: PlannablePackage): ExclusionReason[] => {
    const projectedStops = new Set(r.stops);
    projectedStops.add(stopKey(kind, pkg));

    // ⚠ THE LOAD FIGURE IS NOT PASSED HERE, AND THAT IS DELIBERATE. `eligibilityReasons` decides
    // whether a driver MAY do the work; how much they are already carrying is a tie-break, not a
    // gate (FR-010). An earlier draft computed the running load and handed it to this call, which
    // ignores the field — and a negative proof aimed at that line passed happily, proving nothing.
    // The count is computed once, at the `pickByLoad` call below, where it is actually read.
    return eligibilityReasons({
      driver: r.candidate,
      work: {
        function: kind,
        method: pkg.method,
        zoneId: pkg.zoneId,
        // ⚠ 072 — THE WHOLE ROUND, not this pass's share of it. `r.weightGrams` and `r.stops` are
        // seeded from what the round already holds; without that, a van filled across six passes
        // would pass the capacity gate six times, a few kilograms at a time.
        totalWeightGrams: r.weightGrams + pkg.weightGrams,
        requiresChilled: pkg.requiresChilled,
        requiresFrozen: pkg.requiresFrozen,
        stopCount: projectedStops.size,
        deadlineAt,
      },
      now,
      perStopAllowanceMin,
      ...(r.status === "planned" && opensAt !== null ? { startAt: opensAt } : {}),
    });
  };

  const take = (r: Running, pkg: PlannablePackage) => {
    r.taken.push(pkg);
    r.weightGrams += pkg.weightGrams;
    r.stops.add(stopKey(kind, pkg));
  };

  const assignments = new Map<string, PlannablePackage[]>();
  const additions = new Map<string, PlannablePackage[]>();
  const unassigned: PlannablePackage[] = [];
  const exclusions: PlannedExclusion[] = [];
  const notes = new Map<string, string>();

  const place = (r: Running, pkg: PlannablePackage) => {
    take(r, pkg);
    const into = r.roundId === null ? assignments : additions;
    const key = r.roundId ?? r.candidate.driverId;
    const list = into.get(key);
    if (list) list.push(pkg);
    else into.set(key, [pkg]);
  };

  /** How many packages a driver has been given today, counting this pass's own decisions. */
  const loadOf = (driverId: string): number => {
    let n = byDriver.get(driverId)!.packagesAssignedToday;
    const t = target.get(driverId);
    if (t) n += t.taken.length;
    for (const r of existing.values()) {
      if (r !== t && r.candidate.driverId === driverId) n += r.taken.length;
    }
    return n;
  };

  for (const pkg of packages) {
    const perDriverReasons: PlannedExclusion[] = [];

    // ── A round already going to this shop (or this order) takes the package ───────────────────
    //
    // FR-004a, and since 072 the same rule for a round not yet begun: work for a stop somebody is
    // already going to make goes on that stop.
    const visiting = roundVisiting(stopKey(kind, pkg));
    if (visiting) {
      const reasons = reasonsFor(visiting, pkg);
      if (reasons.length === 0) {
        place(visiting, pkg);
        notes.set(
          pkg.packageId,
          kind === "collection"
            ? "Auto-assigned — this driver is already collecting at this shop"
            : "Auto-assigned — this driver is already delivering to this address",
        );
        continue;
      }
      // ⚠ FR-004c — it does NOT quietly go on the round anyway. It is placed like any other
      // package below; the reason is kept in case nobody else can take it either.
      for (const reason of reasons) {
        perDriverReasons.push({ packageId: pkg.packageId, driverId: visiting.candidate.driverId, reason });
      }
    }

    // ── The hard gates, then load balance ──────────────────────────────────────────────────────
    const eligible: Running[] = [];
    for (const r of target.values()) {
      if (r === visiting) continue; // already refused above, for the reasons recorded
      const reasons = reasonsFor(r, pkg);
      if (reasons.length === 0) eligible.push(r);
      else {
        for (const reason of reasons) {
          perDriverReasons.push({ packageId: pkg.packageId, driverId: r.candidate.driverId, reason });
        }
      }
    }

    const loads = eligible.map((r) => ({
      driverId: r.candidate.driverId,
      packagesAssignedToday: loadOf(r.candidate.driverId),
    }));
    const winner = pickByLoad(loads);

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

    place(target.get(winner.driverId)!, pkg);
    // ⚠ 073 — THE RULE IN WORDS A DRIVER COULD BE TOLD (063 FR-014a). No score, no formula.
    notes.set(
      pkg.packageId,
      loads.length === 1
        ? "Auto-assigned — the only driver who could take it"
        : `Auto-assigned — fewest packages today (${winner.packagesAssignedToday})`,
    );
  }

  return {
    kind,
    plannedFor,
    deadlineAt,
    windowStartAt: input.windowStartAt ?? null,
    assignments,
    additions,
    unassigned,
    notes,
    exclusions,
    considered: packages.length,
  };
}

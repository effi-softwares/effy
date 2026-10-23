// Who gets what: pure over gathered work and loaded candidates (no database, clock or I/O); the
// repository decides what is true, this decides what to do. It runs all day, so a pass adds to the
// round a driver already holds for a run and judges capacity over the whole round, and "can it finish"
// is asked from the round's opening time.

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
  /** When a round for this run or window opens; null or past means now. */
  opensAt?: Date | null;
  /** Null for collection and windowless delivery. */
  windowStartAt?: Date | null;
  /** Oldest first. */
  rounds?: readonly BucketRound[];
}

/** Running totals for one round, existing or about to be created. */
interface Running {
  candidate: PlannerCandidate;
  /** Null for a round this pass would create. */
  roundId: string | null;
  status: "planned" | "in_progress";
  taken: PlannablePackage[];
  weightGrams: number;
  /** Every stop still to make. */
  stops: Set<string>;
}

function stopKey(kind: "collection" | "delivery", p: PlannablePackage): string {
  return kind === "collection" ? p.shopId : (p.orderId ?? p.packageId);
}

/** Packages are placed oldest first, so a busy pass makes the newest work wait. */
export function planWave(input: AssignInput): WavePlan {
  const { kind, packages, candidates, plannedFor, deadlineAt, now, perStopAllowanceMin } = input;
  const opensAt = input.opensAt ?? null;
  const rounds = input.rounds ?? [];
  const byDriver = new Map(candidates.map((c) => [c.driverId, c]));

  // `target` is where new work goes: the driver's unstarted round (the oldest, if a move left two), else a new one.
  const target = new Map<string, Running>();
  // Rounds under way accept work only at a stop still outstanding, and are never a target.
  const existing = new Map<string, Running>();

  for (const round of rounds) {
    const candidate = byDriver.get(round.driverId);
    if (!candidate) continue;
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

  const roundVisiting = (key: string): Running | null => {
    for (const round of rounds) {
      // A delivery round under way has left the hub.
      if (kind === "delivery" && round.status === "in_progress") continue;
      if (round.stops.some((s) => s.key === key && s.outstanding)) return existing.get(round.roundId) ?? null;
    }
    return null;
  };

  /** Judged from when it can start: now, if under way. */
  const reasonsFor = (r: Running, pkg: PlannablePackage): ExclusionReason[] => {
    const projectedStops = new Set(r.stops);
    projectedStops.add(stopKey(kind, pkg));

    // No load here: eligibility decides may; load is a tie-break, counted at `pickByLoad`.
    return eligibilityReasons({
      driver: r.candidate,
      work: {
        function: kind,
        zoneId: pkg.zoneId,
        // The whole round, seeded from what it already holds.
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

  /** Counting this pass's own decisions. */
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

    // A round already going to this shop (or order) takes the package at that stop.
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
      // It does not go on the round anyway: placed like any other, the reason kept.
      for (const reason of reasons) {
        perDriverReasons.push({ packageId: pkg.packageId, driverId: visiting.candidate.driverId, reason });
      }
    }

    const eligible: Running[] = [];
    for (const r of target.values()) {
      if (r === visiting) continue;
      const reasons = reasonsFor(r, pkg);
      if (reasons.length === 0) eligible.push(r);
      else {
        for (const reason of reasons) {
          perDriverReasons.push({ packageId: pkg.packageId, driverId: r.candidate.driverId, reason });
        }
      }
    }

    // One trip: the driver who brought it to the hub takes it on, if they pass every gate (eligibility is
    // never bent), after keeping an order's packages together.
    if (kind === "delivery" && pkg.collectedBy) {
      const collector = eligible.find((r) => r.candidate.driverId === pkg.collectedBy);
      if (collector) {
        place(collector, pkg);
        notes.set(pkg.packageId, "Auto-assigned — collected it, continuing to delivery");
        continue;
      }
    }

    const loads = eligible.map((r) => ({
      driverId: r.candidate.driverId,
      packagesAssignedToday: loadOf(r.candidate.driverId),
    }));
    const winner = pickByLoad(loads);

    if (winner === null) {
      unassigned.push(pkg);
      // Every unassigned package carries a reason.
      if (perDriverReasons.length > 0) {
        exclusions.push(...perDriverReasons);
      } else {
        // No candidate at all: `driverId: null` lets the console tell it apart.
        exclusions.push({ packageId: pkg.packageId, driverId: null, reason: "not_on_duty" });
      }
      continue;
    }

    place(target.get(winner.driverId)!, pkg);
    // The rule in words a driver could be told; no score or formula.
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

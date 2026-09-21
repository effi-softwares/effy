// May this driver do this work? — ONE definition (063).
//
// ⚠ WHY THIS IS SHARED. Two callers ask it: the wave planner, choosing whom to assign; and the
// dispatcher's reassign route, refusing a person who directs work at somebody who cannot do it
// (FR-034). If they answer differently, a dispatcher can do what the planner would not — which is
// not a UI inconsistency but a way to put an unlicensed driver in a van.
//
// ⚠ THESE ARE FILTERS, NEVER WEIGHTS (FR-010). A driver who cannot legally drive, or cannot reach the
// cutoff, is not "a worse candidate" — they are not a candidate. D14 recorded this from the industry
// survey and D3 found it independently for capabilities. The moment one of these becomes a score, a
// sufficiently attractive driver can outrank their own expired licence.
//
// ⚠ EVERY FAILING CONDITION IS RETURNED, NOT THE FIRST (FR-026). A driver can be suspended AND holding
// a van with lapsed registration; sending an operator to fix only one of those wastes the trip. 056
// established the rule; this applies it.

/** Why a driver cannot be given a piece of work. Mirrors `assignment_exclusion.reason`. */
export type ExclusionReason =
  | "not_on_duty"
  | "not_employable"
  | "licence_expired"
  | "no_vehicle"
  | "not_cleared"
  | "no_refrigeration"
  | "over_capacity"
  | "cannot_meet_deadline";

/** A candidate driver, as the planner and the reassign route both load them. */
export interface CandidateDriver {
  driverId: string;
  /** 061/056: only `active` may hold a session or receive work. */
  status: "active" | "suspended" | "offboarded";
  onDuty: boolean;
  licenceExpiresOn: string | null;
  expectedEndAt: string | null;
  /** The vehicle behind their OPEN holding, or null when they hold none (061). */
  vehicle: {
    vehicleId: string;
    payloadKg: number | null;
    canCarryChilled: boolean;
    canCarryFrozen: boolean;
  } | null;
  /** Clearances (062). ⚠ `zoneId: null` means EVERY zone, including zones created later. */
  clearances: ReadonlyArray<{
    function: "collection" | "delivery";
    method: "standard" | "same_day";
    zoneId: string | null;
  }>;
  /** Packages already assigned to them today — the load balance input (FR-014, research R7). */
  packagesAssignedToday: number;
}

/** The work being considered. */
export interface WorkUnit {
  function: "collection" | "delivery";
  method: "standard" | "same_day";
  zoneId: string | null;
  totalWeightGrams: number;
  requiresChilled: boolean;
  requiresFrozen: boolean;
  /** Stops the driver would have to make, including what they already carry. */
  stopCount: number;
  deadlineAt: Date;
}

export interface EligibilityInput {
  driver: CandidateDriver;
  work: WorkUnit;
  now: Date;
  perStopAllowanceMin: number;
}

/**
 * ⚠ A clearance with `zoneId === null` covers EVERY zone, including zones created after the grant
 * (062 FR-011). This is the single most important line of the matching rule: enumerating today's
 * zones instead is correct when written and quietly wrong the first time a zone is added.
 */
function isCleared(driver: CandidateDriver, work: WorkUnit): boolean {
  return driver.clearances.some(
    (c) =>
      c.function === work.function &&
      c.method === work.method &&
      (c.zoneId === null || c.zoneId === work.zoneId),
  );
}

function licenceExpired(driver: CandidateDriver, now: Date): boolean {
  if (driver.licenceExpiresOn === null) return false; // not recorded is not expired (061)
  return new Date(`${driver.licenceExpiresOn}T23:59:59.999Z`).getTime() < now.getTime();
}

/**
 * Every reason this driver may not do this work. **Empty means eligible.**
 *
 * ⚠ RETURNS REASONS AS DATA, and never throws and never returns a bare boolean: FR-015 needs the
 * reason recorded against the wave, and FR-034 needs it shown to a dispatcher. A boolean carries
 * neither, and an exception would make "no eligible driver" — an ordinary, expected outcome — into an
 * error path.
 */
export function eligibilityReasons(input: EligibilityInput): ExclusionReason[] {
  const { driver, work, now, perStopAllowanceMin } = input;
  const reasons: ExclusionReason[] = [];

  if (driver.status !== "active") reasons.push("not_employable");
  if (!driver.onDuty) reasons.push("not_on_duty");
  if (licenceExpired(driver, now)) reasons.push("licence_expired");
  if (driver.vehicle === null) reasons.push("no_vehicle");
  if (!isCleared(driver, work)) reasons.push("not_cleared");

  if (driver.vehicle !== null) {
    if (
      (work.requiresChilled && !driver.vehicle.canCarryChilled) ||
      (work.requiresFrozen && !driver.vehicle.canCarryFrozen)
    ) {
      reasons.push("no_refrigeration");
    }
    // ⚠ WEIGHT ONLY (research R8). The vehicle also records load_volume_litres and crate_capacity, and
    // neither can be evaluated because the catalogue describes no product volume. Inventing a
    // per-product volume would produce a gate that LOOKS enforced and is arithmetic over a guess.
    // A van full by volume and light by weight will be over-assigned; the dispatcher sees it (D15).
    if (driver.vehicle.payloadKg !== null && work.totalWeightGrams > driver.vehicle.payloadKg * 1000) {
      reasons.push("over_capacity");
    }
  }

  // ⚠ The feasibility estimate has no travel-time input by design (D20), so it is stop count times a
  // configured allowance — and it is SHOWN to the dispatcher rather than silently trusted (R11).
  const finishBy = new Date(now.getTime() + work.stopCount * perStopAllowanceMin * 60_000);
  const shiftEnd = driver.expectedEndAt ? new Date(driver.expectedEndAt) : null;
  if (finishBy.getTime() > work.deadlineAt.getTime()) {
    reasons.push("cannot_meet_deadline");
  } else if (shiftEnd !== null && finishBy.getTime() > shiftEnd.getTime()) {
    reasons.push("cannot_meet_deadline");
  }

  return reasons;
}

/** Convenience for call sites that only branch. Never use it where a reason must be recorded. */
export function isEligible(input: EligibilityInput): boolean {
  return eligibilityReasons(input).length === 0;
}

/**
 * Choose between eligible drivers (FR-014): fewest packages assigned **today** wins.
 *
 * ⚠ ASSIGNED TODAY, NOT CURRENTLY OUTSTANDING (research R7). Counting outstanding work makes the
 * driver who has just FINISHED a round the emptiest candidate, so the fastest worker is handed the
 * most work all day — a fairness failure that looks like a bug and cannot be explained to them.
 * FR-014a requires the rule be explainable: "you had the fewest today" is; "you were momentarily
 * emptiest" is not.
 *
 * ⚠ THE TIE-BREAK UNDER THE TIE-BREAK IS STABLE, NOT ARBITRARY. FR-014 requires identical inputs to
 * produce an identical choice, or the planner is untestable and "why did this happen?" unanswerable.
 *
 * ⚠ NO DISTANCE, NO LOCATION, NO PROXY FOR EITHER (FR-014b). The research's original tie-break was
 * proximity and it was cut with all location data; this is the function where it would try to return.
 */
export function pickByLoad<T extends { driverId: string; packagesAssignedToday: number }>(
  eligible: readonly T[],
): T | null {
  if (eligible.length === 0) return null;
  return [...eligible].sort((a, b) =>
    a.packagesAssignedToday !== b.packagesAssignedToday
      ? a.packagesAssignedToday - b.packagesAssignedToday
      : a.driverId < b.driverId
        ? -1
        : a.driverId > b.driverId
          ? 1
          : 0,
  )[0]!;
}

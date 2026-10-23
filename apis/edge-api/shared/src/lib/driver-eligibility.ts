// May this driver do this work? One definition for the planner (choosing) and the reassign route
// (refusing). Filters, never weights: an expired licence is not a worse score. Every failing condition
// is returned, not just the first.

/** Mirrors `assignment_exclusion.reason`. */
export type ExclusionReason =
  | "not_on_duty"
  | "not_employable"
  | "licence_expired"
  | "no_vehicle"
  | "not_cleared"
  | "no_refrigeration"
  | "over_capacity"
  | "cannot_meet_deadline"
  // Vehicle not checked today, or found unsafe and not cleared.
  | "vehicle_check_due"
  | "vehicle_unsafe";

export interface CandidateDriver {
  driverId: string;
  /** Only `active` may hold a session or receive work. */
  status: "active" | "suspended" | "offboarded";
  onDuty: boolean;
  licenceExpiresOn: string | null;
  expectedEndAt: string | null;
  /** Behind their open holding, or null. */
  vehicle: {
    vehicleId: string;
    payloadKg: number | null;
    canCarryChilled: boolean;
    canCarryFrozen: boolean;
  } | null;
  /** `zoneId: null` means every zone, including later ones. */
  clearances: ReadonlyArray<{
    function: "collection" | "delivery";
    zoneId: string | null;
  }>;
  /** Assigned to them today: the load-balance input. */
  packagesAssignedToday: number;
  /** `ok`, `due` or `unsafe`; absent means not loaded by this caller, and is not a reason. */
  vehicleCheck?: "ok" | "due" | "unsafe";
}

export interface WorkUnit {
  function: "collection" | "delivery";
  /** null when in no group. */
  zoneId: string | null;
  totalWeightGrams: number;
  requiresChilled: boolean;
  requiresFrozen: boolean;
  /** Including what they already carry. */
  stopCount: number;
  deadlineAt: Date;
}

export interface EligibilityInput {
  driver: CandidateDriver;
  work: WorkUnit;
  now: Date;
  perStopAllowanceMin: number;
  /** When the work can start; omitted means now. A round planned ahead is estimated from its opening time. */
  startAt?: Date;
}

/**
 * A clearance with `zoneId === null` covers every area, including later ones. A clearance is
 * (function, area). Work in no area (`work.zoneId === null`) is cleared by any clearance for the function.
 */
function isCleared(driver: CandidateDriver, work: WorkUnit): boolean {
  return driver.clearances.some(
    (c) => c.function === work.function && (work.zoneId === null || c.zoneId === null || c.zoneId === work.zoneId),
  );
}

function licenceExpired(driver: CandidateDriver, now: Date): boolean {
  if (driver.licenceExpiresOn === null) return false;
  return new Date(`${driver.licenceExpiresOn}T23:59:59.999Z`).getTime() < now.getTime();
}

/** Every reason, as data; empty means eligible. Never throws: "nobody eligible" is ordinary. */
export function eligibilityReasons(input: EligibilityInput): ExclusionReason[] {
  const { driver, work, now, perStopAllowanceMin } = input;
  // Never earlier than now.
  const startAt = input.startAt && input.startAt.getTime() > now.getTime() ? input.startAt : now;
  const reasons: ExclusionReason[] = [];

  if (driver.status !== "active") reasons.push("not_employable");
  if (!driver.onDuty) reasons.push("not_on_duty");
  if (licenceExpired(driver, now)) reasons.push("licence_expired");
  if (driver.vehicle === null) reasons.push("no_vehicle");
  if (!isCleared(driver, work)) reasons.push("not_cleared");
  // A vehicle unchecked today, or found unsafe, takes no work.
  if (driver.vehicle !== null && driver.vehicleCheck === "due") reasons.push("vehicle_check_due");
  if (driver.vehicle !== null && driver.vehicleCheck === "unsafe") reasons.push("vehicle_unsafe");

  if (driver.vehicle !== null) {
    if (
      (work.requiresChilled && !driver.vehicle.canCarryChilled) ||
      (work.requiresFrozen && !driver.vehicle.canCarryFrozen)
    ) {
      reasons.push("no_refrigeration");
    }
    // Weight only: the catalogue has no product volume, so volume and crates cannot be gated honestly.
    if (driver.vehicle.payloadKg !== null && work.totalWeightGrams > driver.vehicle.payloadKg * 1000) {
      reasons.push("over_capacity");
    }
  }

  // No travel time by design: stops × a configured allowance, shown to the dispatcher.
  const finishBy = new Date(startAt.getTime() + work.stopCount * perStopAllowanceMin * 60_000);
  const shiftEnd = driver.expectedEndAt ? new Date(driver.expectedEndAt) : null;
  if (finishBy.getTime() > work.deadlineAt.getTime()) {
    reasons.push("cannot_meet_deadline");
  } else if (shiftEnd !== null && finishBy.getTime() > shiftEnd.getTime()) {
    reasons.push("cannot_meet_deadline");
  }

  return reasons;
}

/**
 * Fewest packages assigned today wins (not currently outstanding, which would hand the fastest worker
 * the most). The tie-break below it is stable, so identical inputs choose identically. No distance or
 * location, ever.
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

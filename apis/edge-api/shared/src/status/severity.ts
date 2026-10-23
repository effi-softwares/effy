// What a person may override, and how a reason reads. A manager assigning by hand may accept the area
// clearance and the deadline estimate; the rest are facts (stood down, off duty, unlicensed, no van or
// a van that cannot carry the goods).

import type { ExclusionReason } from "../lib/driver-eligibility";

export type ReasonSeverity = "cannot" | "concern";

const SEVERITY: Record<ExclusionReason, ReasonSeverity> = {
  not_employable: "cannot",
  not_on_duty: "cannot",
  licence_expired: "cannot",
  no_vehicle: "cannot",
  no_refrigeration: "cannot",
  over_capacity: "cannot",
  not_cleared: "concern",
  cannot_meet_deadline: "concern",
  // Vehicle facts: check it, or clear it on Exceptions.
  vehicle_check_due: "cannot",
  vehicle_unsafe: "cannot",
};

const WORDS: Record<ExclusionReason, string> = {
  not_employable: "Not currently employed",
  not_on_duty: "Off duty",
  licence_expired: "Licence expired",
  no_vehicle: "No vehicle",
  no_refrigeration: "Van can't carry chilled or frozen",
  over_capacity: "Van too full",
  not_cleared: "Not cleared for this area",
  cannot_meet_deadline: "Round may run late",
  vehicle_check_due: "Vehicle not checked today",
  vehicle_unsafe: "Vehicle found unsafe",
};

export function reasonSeverity(reason: ExclusionReason): ReasonSeverity {
  return SEVERITY[reason];
}

/** The reason in a few plain words, never the code. */
export function reasonWords(reason: ExclusionReason): string {
  return WORDS[reason];
}

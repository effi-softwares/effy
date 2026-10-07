// What a person may override, and how a reason reads (073).
//
// The planner treats every condition as a filter. A PERSON assigning by hand may knowingly accept
// two of them — the area clearance and the deadline estimate are judgements a manager on the phone
// to the driver can make — and may not accept the rest, which are facts about the world: someone
// stood down, off duty, unlicensed, without a van, or with a van that cannot carry these goods.

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
};

export function reasonSeverity(reason: ExclusionReason): ReasonSeverity {
  return SEVERITY[reason];
}

/** The reason in a few plain words — never the code. */
export function reasonWords(reason: ExclusionReason): string {
  return WORDS[reason];
}

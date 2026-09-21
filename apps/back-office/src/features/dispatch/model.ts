import type { ExclusionReasonDTO } from "@effy/shared-types";

// Presentation vocabulary for the dispatcher console (063).

/**
 * ⚠ ONE SENTENCE PER REASON, WRITTEN FOR A PERSON WHO HAS TO FIX IT. FR-015 exists so an unassigned
 * package is explainable; a raw enum on screen ("not_cleared") explains nothing to the operator who
 * has to decide whether to grant a clearance or call somebody in.
 */
export const REASON_TEXT: Record<ExclusionReasonDTO, string> = {
  not_on_duty: "Not on duty",
  not_employable: "Stood down or no longer employed",
  licence_expired: "Licence expired",
  no_vehicle: "Holding no vehicle",
  not_cleared: "Not cleared for this work",
  no_refrigeration: "Vehicle cannot carry these goods",
  over_capacity: "Round too heavy for the vehicle",
  cannot_meet_deadline: "Cannot finish in time",
};

/**
 * ⚠ AN EMPTY REASON LIST MEANS SOMETHING DIFFERENT, AND THE SCREEN MUST SAY SO. "Nobody is cleared
 * for this area" is a staffing decision; "everyone cleared failed a condition" is a fixable list.
 * Rendering both as "could not be assigned" would hide which of the two is happening.
 */
export function describeReasons(reasons: ExclusionReasonDTO[]): string {
  if (reasons.length === 0) return "No driver is cleared for this work at all";
  return reasons.map((r) => REASON_TEXT[r]).join(" · ");
}

export function roundLabel(kind: string): string {
  return kind === "collection" ? "Collection" : "Same-day delivery";
}

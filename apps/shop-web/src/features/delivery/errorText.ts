import { isDomainError } from "@effy/api-client";

/**
 * Copy for the 032 same-day declaration refusals.
 *
 * ⚠ EACH ONE SAYS WHAT IS WRONG AND WHAT TO DO, not that something is "invalid". Several of these
 * fail silently if misunderstood: declaring same-day with no cutoff would leave the withdrawal rule
 * undecidable, and an unmappable shop location would produce an approval screen where every distance
 * is blank — so the admin decides blind, which is the exact failure FR-023 exists to prevent.
 *
 * ⚠ The `field` on the problem carries a stable CODE, not a form field path. The server's own message
 * is never rendered verbatim — this is the console's copy.
 */
const REFUSALS: Record<string, string> = {
  shop_location_required:
    "No location is recorded for this shop, so how far a customer is cannot be judged. Ask Effy to set the shop's postcode.",
  shop_location_unmappable:
    "This shop's postcode has no known location on the map, so the distance to a customer cannot be worked out. Ask Effy to check the shop's postcode.",
  unknown_postcode:
    "One of the areas is not a postcode any Australian suburb uses. Search for the suburb by name and pick it from the list.",
  areas_required: "Choose at least one area this shop can reach the same day.",
  cutoff_required:
    "Set a cutoff time. After it, same-day is no longer offered for that day — without one there is no way to stop promising it.",
  areas_not_applicable:
    "Same-day is switched off, so areas and a cutoff do not apply. Switch it on, or clear them.",
};

/** The message to show when a declaration fails to save. */
export function declarationError(err: unknown): string {
  if (isDomainError(err)) {
    if (err.status === 422) {
      for (const f of err.fields ?? []) {
        const copy = REFUSALS[f.field];
        if (copy) return copy;
      }
    }
    if (err.kind === "forbidden")
      return "Only a shop manager can change what this shop delivers same-day.";
    if (err.kind === "unavailable")
      return "The service is waking up or unreachable. Try again in a moment.";
    if (err.status === 400) return "Please check the fields and try again.";
  }
  return "Something went wrong. Please try again.";
}

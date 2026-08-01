import { isDomainError } from "@effy/api-client";

// Uniform, non-leaking mutation-failure copy for the delivery dialogs. Keys off DomainError.kind and
// the HTTP status only (never raw `detail`) — the ErrorState contract's rule, applied to inline form
// errors. 409 maps to DomainErrorKind "unknown", so conflicts are detected by status.
export function deliveryMutationError(err: unknown, conflictMessage?: string): string {
  if (isDomainError(err)) {
    if (err.kind === "forbidden") return "You don't have permission to perform this action.";
    if (err.kind === "not-found") return "That item no longer exists.";
    if (err.kind === "unavailable")
      return "The service is waking up or unreachable. Try again in a moment.";
    if (err.status === 409) return conflictMessage ?? "That change conflicts with existing data.";
    if (err.status === 400 || err.status === 422)
      return "Please check the fields and try again.";
  }
  return "Something went wrong. Please try again.";
}

/**
 * Copy for the 032 delivery-pricing refusals.
 *
 * ⚠ EACH ONE SAYS WHAT WOULD HAPPEN, NOT THAT SOMETHING IS "INVALID". Every rule here fails
 * SILENTLY in production if an operator does not understand it — a cap below the floor makes every
 * delivery cost the cap forever, an empty band set prices a 200 g parcel to the next suburb the same
 * as 20 kg to Perth, and neither throws anything. Naming the consequence is the point.
 *
 * ⚠ The `field` on the problem carries a stable CODE, not a form field path (see ProblemFieldIssue).
 * The message from the server is never rendered verbatim — FR-008 — this is the console's own copy.
 */
const PRICING_REFUSALS: Record<string, string> = {
  bands_required:
    "Add at least one distance band and one weight band. Without them every order costs the base amount — a small parcel to the next suburb and a heavy one to the other side of the state would be priced the same.",
  duplicate_band:
    "Two bands share an upper bound, so there are two answers for the same distance or weight. Remove one.",
  invalid_rounding: "The rounding step must be greater than zero.",
  cap_below_floor:
    "The maximum is below the cheapest fee these rules can produce, so every delivery would cost the maximum and distance and weight would stop affecting the price at all. Raise the maximum, or lower the base.",
  cap_not_rounded:
    "The maximum is not a multiple of the rounding step, so a capped fee would come out as an odd amount — and only on the most expensive orders, where it is hardest to notice.",
};

/** Refusal copy for a failed pricing save, or null when this is not a recognised refusal. */
export function pricingRefusalText(err: unknown): string | null {
  if (!isDomainError(err) || err.status !== 422) return null;
  for (const f of err.fields ?? []) {
    const copy = PRICING_REFUSALS[f.field];
    if (copy) return copy;
  }
  return null;
}

/** The message to show when a pricing save fails: the specific refusal, else the generic fallback. */
export function pricingMutationError(err: unknown): string {
  return pricingRefusalText(err) ?? deliveryMutationError(err);
}

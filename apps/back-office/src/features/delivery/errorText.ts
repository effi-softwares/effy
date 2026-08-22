import { isDomainError } from "@effy/api-client";

// Uniform, non-leaking mutation-failure copy for the delivery screens. Keyed off DomainError.kind and
// status (never a raw detail), matching the promotions/ErrorState convention.
export function deliveryMutationError(err: unknown, conflictMessage?: string): string {
  if (isDomainError(err)) {
    if (err.kind === "forbidden") return "You don't have permission to change delivery configuration.";
    if (err.kind === "not-found") return "That item no longer exists.";
    if (err.kind === "unavailable")
      return "The service is waking up or unreachable. Try again in a moment.";
    if (err.status === 409) return conflictMessage ?? "That change conflicts with existing data.";
    if (err.status === 422) return conflictMessage ?? "That can't be applied yet — check the details.";
    if (err.status === 400) return "Please check the fields and try again.";
  }
  return "Something went wrong. Please try again.";
}

// Activation-specific copy: a plan must price every ring and carry a weight band before it can go live.
export const PLAN_INCOMPLETE =
  "This plan can't price every served zone yet. Price every ring and add at least one weight band, then activate.";

export const POSTCODE_IN_ZONE = "That postcode already belongs to another zone.";

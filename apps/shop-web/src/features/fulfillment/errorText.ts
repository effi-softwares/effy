import { isDomainError } from "@effy/api-client";

// Uniform, non-leaking mutation-failure copy for fulfillment actions. Mirrors the catalog slice's
// `errorText` idiom: key off `DomainError.kind` and the HTTP status only, never the raw `detail`.

/**
 * A 409 conflict — the portion moved under us.
 *
 * `@effy/api-client` maps 409 to `DomainErrorKind "unknown"`, so a conflict is detected by STATUS,
 * not kind. Every 409 in this slice means the same thing: another operator (or the implicit
 * `received` transition) changed the state between our read and our write. The answer is always to
 * RELOAD and look again — never a blind retry, which would just re-apply a decision made against a
 * state that no longer exists.
 */
export function isConflict(err: unknown): boolean {
  return isDomainError(err) && err.status === 409;
}

/** Copy for a stale transition/progress write (FR-014, SC-005). */
export const STALE_STATE_MESSAGE =
  "This order changed elsewhere — someone else may be working it. Reload to see its current state.";

/** Inline copy for a failed fulfillment write. Conflicts get their own, louder treatment. */
export function fulfillmentMutationError(err: unknown): string {
  if (isConflict(err)) return STALE_STATE_MESSAGE;
  if (isDomainError(err)) {
    if (err.kind === "forbidden") return "You don't have access to this order.";
    if (err.kind === "unavailable")
      return "The service is waking up or unreachable. Try again in a moment.";
    if (err.status === 400 || err.status === 422)
      return "That quantity is more than was ordered. Check the numbers and try again.";
  }
  return "Something went wrong. Please try again.";
}

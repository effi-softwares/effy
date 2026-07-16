import { isDomainError } from "@effy/api-client";

// Uniform, non-leaking mutation-failure copy for the catalog create flow. Keys off DomainError.kind
// and the HTTP status only (never raw `detail`) — the ErrorState contract's rule, applied to inline
// form errors. 409 (dup SKU) maps to DomainErrorKind "unknown", so conflicts are detected by status.
export function productMutationError(err: unknown, conflictMessage?: string): string {
  if (isDomainError(err)) {
    if (err.kind === "forbidden") return "You don't have permission to perform this action.";
    if (err.kind === "not-found") return "That product no longer exists.";
    if (err.kind === "unavailable")
      return "The service is waking up or unreachable. Try again in a moment.";
    if (err.status === 409) return conflictMessage ?? "That SKU is already used in your shop.";
    if (err.status === 400 || err.status === 422)
      return "Please check the fields and try again.";
  }
  return "Something went wrong. Please try again.";
}

/**
 * A 409 conflict — the discriminator for BOTH catalog conflicts: a stale focused edit
 * (`expectedUpdatedAt` moved under us, FR-023a) and a refused hard-delete of a published product
 * (R8). The caller decides which copy to show; the message never leaks server `detail`.
 */
export function isConflict(err: unknown): boolean {
  return isDomainError(err) && err.status === 409;
}

/** Copy for a stale focused edit (FR-023a) — the row changed elsewhere; the operator must reload. */
export const STALE_EDIT_MESSAGE =
  "This product changed elsewhere. Reload to see the latest, then re-apply your edit.";

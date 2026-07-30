import { isDomainError } from "@effy/api-client";

/**
 * Uniform, non-leaking mutation-failure copy for the promotions screens.
 *
 * ⚠ Two conflicts matter enough to name (FR-068/FR-070), because the operator's next move differs:
 * a redeemed code's value cannot be rewritten (edit the window instead), and a redeemed code cannot
 * be deleted (disable it instead). "That conflicts with existing data" would leave them re-trying the
 * thing that will never work. Everything else keys off `DomainError.kind` and the status only — never
 * a raw `detail` (the ErrorState contract's rule, applied to inline form errors).
 */
export function promotionMutationError(err: unknown, conflictMessage?: string): string {
  if (isDomainError(err)) {
    if (err.kind === "forbidden") return "You don't have permission to perform this action.";
    if (err.kind === "not-found") return "That code no longer exists.";
    if (err.kind === "unavailable")
      return "The service is waking up or unreachable. Try again in a moment.";
    if (err.status === 409) return conflictMessage ?? "That change conflicts with existing data.";
    if (err.status === 400 || err.status === 422)
      return "Please check the fields and try again.";
  }
  return "Something went wrong. Please try again.";
}

/** The conflict copy for editing a code that has already been redeemed. */
export const USED_CODE_CONFLICT =
  "This code has already been redeemed. Its window, caps and status can change — its value cannot.";

/** The conflict copy for deleting a code that has already been redeemed. */
export const DELETE_BLOCKED_CONFLICT =
  "This code has already been redeemed, so it can't be deleted. Disable it instead.";

/** The conflict copy for a code name that is already taken. */
export const DUPLICATE_CODE_CONFLICT = "A code with that name already exists.";

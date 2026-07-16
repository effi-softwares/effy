import { isDomainError } from "@effy/api-client";

// Uniform, non-leaking mutation-failure copy for the catalog schema dialogs. Keys off
// DomainError.kind and the HTTP status only (never raw `detail`) — the ErrorState contract's rule,
// applied to inline form errors. 409 maps to DomainErrorKind "unknown", so conflicts (a duplicate
// key, or retiring/removing something still in use — FR-006) are detected by status and given the
// caller's specific message (mirrors features/shops/errorText.ts).
export function catalogMutationError(err: unknown, conflictMessage?: string): string {
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

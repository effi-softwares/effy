import { isDomainError } from "@effy/api-client";

/** A refusal a person can act on, keyed on status like `dispatchActionError`; never from `err.message`. */
export function exceptionMutationError(err: unknown): string {
  if (!isDomainError(err)) {
    return "Something went wrong. Nothing was changed — try again.";
  }

  if (err.status === 403) {
    return "You do not have permission to close a delivery exception. Ask an admin or a manager.";
  }
  if (err.status === 404) {
    // Two people triage this list at once, so "gone" is ordinary rather than alarming.
    return "That exception is no longer there — somebody may have closed it already. Reload to see.";
  }

  return "That could not be closed. Nothing was changed.";
}

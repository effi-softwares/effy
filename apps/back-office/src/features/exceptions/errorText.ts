import { isDomainError } from "@effy/api-client";

/**
 * Turn a refusal into something a person can act on (064).
 *
 * ⚠ NEVER RENDERED FROM `err.message`. `DomainError`'s own documentation forbids it, and 053 shipped
 * a console where every refusal collapsed to one generic sentence because the screen tested
 * `e instanceof Error` while the api-client throws a PLAIN OBJECT — so the named refusal the server
 * had correctly produced was discarded at the last step. The cases below are the ones this screen can
 * actually provoke, keyed on status the way `dispatchActionError` is.
 */
export function exceptionMutationError(err: unknown): string {
  if (!isDomainError(err)) {
    return "Something went wrong. Nothing was changed — try again.";
  }

  if (err.status === 403) {
    return "You do not have permission to close a delivery exception. Ask an admin or a manager.";
  }
  if (err.status === 404) {
    // ⚠ Two people triage this list at once, so "gone" is ordinary rather than alarming.
    return "That exception is no longer there — somebody may have closed it already. Reload to see.";
  }

  return "That could not be closed. Nothing was changed.";
}

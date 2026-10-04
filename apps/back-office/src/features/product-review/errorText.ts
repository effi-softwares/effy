import { isDomainError } from "@effy/api-client";

/**
 * What a refused decision means to a reviewer (067).
 *
 * ⚠ The api-client throws a PLAIN OBJECT, not an Error — `e instanceof Error` discards every named
 * refusal the server got right (053 shipped that and every refusal collapsed to one sentence).
 */
export function reviewActionError(err: unknown): string {
  if (isDomainError(err)) {
    if (err.kind === "forbidden") return "Deciding this needs a manager or an administrator.";
    if (err.kind === "not-found") return "This is no longer waiting for review.";
    if (err.kind === "unavailable") return "The service is waking up or unreachable. Try again in a moment.";
    // 409 — the shop edited it, or a colleague decided it, after this page loaded (FR-014).
    if (err.status === 409) {
      return "This changed after you opened it — the shop edited it, or someone else decided it. It has been reloaded; look again before deciding.";
    }
    if (err.status === 400) {
      // ⚠ Our OWN copy, keyed on the field the contract names — never the server's free-form detail.
      const field = err.fields?.[0]?.field;
      if (field === "margin") return "Enter the margin as a percentage or an amount. It cannot be negative.";
      if (field === "reason") return "Say why this is being sent back, in under 500 characters.";
      return "This cannot be approved as it stands — the category or product type it proposes may have been retired. Send it back to the shop.";
    }
  }
  return "Something went wrong. Please try again.";
}

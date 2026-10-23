import { isDomainError } from "@effy/api-client";

/**
 * Console copy for a refund refusal: the server's reason in our words, keyed off `status` and the problem
 * `type` (never `detail`). Never one generic sentence: the operator is holding money and needs to know
 * whether to retry, try smaller, or stop.
 */
export function refundActionError(err: unknown): string {
  if (!isDomainError(err)) return "Something went wrong. The refund was not issued.";

  if (err.status === 400 || err.status === 422) {
    // The server states the remaining amount in `detail` for the ceiling case specifically, and
    // that number is the one thing an operator cannot work out for themselves. It is contract, not
    // free prose — the service formats it — so it is the one detail worth surfacing.
    if (err.detail && /remains refundable/i.test(err.detail)) return err.detail;
    return "That refund is not valid. Check the items and amount.";
  }
  if (err.status === 409) return "Those units have already been refunded.";
  if (err.kind === "forbidden") {
    return "You don't have permission to issue refunds. Ask an admin or manager.";
  }
  if (err.kind === "not-found") return "That order no longer exists.";
  if (err.kind === "unavailable") {
    // Distinct from a refusal, and the distinction matters more here than anywhere: the refund may
    // have reached the provider. Telling an operator to "try again" on an ambiguous failure is how a
    // customer gets refunded twice — so the copy says to check, not to retry.
    return "The refund service is unreachable. Check the order before trying again — the refund may already have been submitted.";
  }
  return "Something went wrong. The refund was not issued.";
}

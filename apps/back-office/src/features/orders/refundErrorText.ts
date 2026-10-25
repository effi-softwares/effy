import { isDomainError } from "@effy/api-client"

export function refundActionError(err: unknown): string {
  if (!isDomainError(err)) return "Something went wrong. The refund was not issued."

  if (err.status === 400 || err.status === 422) {
    if (err.detail && /remains refundable/i.test(err.detail)) return err.detail
    return "That refund is not valid. Check the items and amount."
  }
  if (err.status === 409) return "Those units have already been refunded."
  if (err.kind === "forbidden") {
    return "You don't have permission to issue refunds. Ask an admin or manager."
  }
  if (err.kind === "not-found") return "That order no longer exists."
  if (err.kind === "unavailable") {
    return "The refund service is unreachable. Check the order before trying again — the refund may already have been submitted."
  }
  return "Something went wrong. The refund was not issued."
}

import { isDomainError } from "@effy/api-client"

export function productMutationError(err: unknown, conflictMessage?: string): string {
  if (isDomainError(err)) {
    if (err.kind === "forbidden") return "You don't have permission to perform this action."
    if (err.kind === "not-found") return "That product no longer exists."
    if (err.kind === "unavailable") return "The service is waking up or unreachable. Try again in a moment."
    if (err.status === 409) return conflictMessage ?? "That SKU is already used in your shop."
    if (err.status === 400 || err.status === 422) return "Please check the fields and try again."
  }
  return "Something went wrong. Please try again."
}

export function isConflict(err: unknown): boolean {
  return isDomainError(err) && err.status === 409
}

export const STALE_EDIT_MESSAGE = "This product changed elsewhere. Reload to see the latest, then re-apply your edit."

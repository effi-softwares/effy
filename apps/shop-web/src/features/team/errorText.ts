import { isDomainError } from "@effy/api-client"

import { productMutationError } from "@/features/catalog/errorText"

/** The team's refusals, in the console's own words (the server's `detail` is never shown raw). */
export function teamError(err: unknown): string {
  if (isDomainError(err) && err.status === 409) {
    const detail = err.detail ?? ""
    if (detail.includes("no manager"))
      return "This shop needs at least one active manager. Make someone else a manager first."
    if (detail.includes("stand yourself down")) return "You can't stand yourself down. Ask another manager."
    if (detail.includes("stood down here"))
      return "That person was stood down. Find them in the list and reinstate them."
    if (detail.includes("already on your team")) return "That email is already on your team."
    if (detail.includes("already in use")) return "That email is already in use on Effy. Use another address."
  }
  if (isDomainError(err) && err.kind === "not-found") return "That person is no longer on this shop's team."
  return productMutationError(err, "That change couldn't be made. Reload and try again.")
}

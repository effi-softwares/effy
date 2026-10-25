import { isDomainError } from "@effy/api-client"

export function deliverabilityError(err: unknown): string {
  if (isDomainError(err)) {
    if (err.status === 404) return "No delivery record exists for that address."
    if (err.status === 403) return "You don't have permission to repair delivery for this address."
    if (err.status === 400) return "A note explaining the repair is required."
    if (err.status === 503) return "The mail service couldn't be reached. Nothing was changed — try again."
  }
  return "Something went wrong. Please try again."
}

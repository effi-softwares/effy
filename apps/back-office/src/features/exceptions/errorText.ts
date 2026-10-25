import { isDomainError } from "@effy/api-client"

export function exceptionMutationError(err: unknown): string {
  if (!isDomainError(err)) {
    return "Something went wrong. Nothing was changed — try again."
  }

  if (err.status === 403) {
    return "You do not have permission to close a delivery exception. Ask an admin or a manager."
  }
  if (err.status === 404) {
    return "That exception is no longer there — somebody may have closed it already. Reload to see."
  }

  return "That could not be closed. Nothing was changed."
}

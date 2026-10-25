import type { BackOfficeRole } from "@effy/shared-types"

export function canReplyFeedback(roles: readonly BackOfficeRole[]): boolean {
  return roles.includes("admin") || roles.includes("manager")
}

import type { BackOfficeRole } from "@effy/shared-types"

/** Administrators and managers write and send any message; customer support sends a direct message to one person (112 R13). */
export function canManageMessages(roles: readonly BackOfficeRole[]): boolean {
  return roles.includes("admin") || roles.includes("manager")
}

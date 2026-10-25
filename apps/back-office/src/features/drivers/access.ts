import type { BackOfficeRole } from "@effy/shared-types"

export function canManageDrivers(roles: readonly BackOfficeRole[]): boolean {
  return roles.includes("admin") || roles.includes("manager")
}

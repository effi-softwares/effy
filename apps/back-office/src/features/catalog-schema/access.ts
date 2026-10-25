import type { BackOfficeRole } from "@effy/shared-types"

export function canManageCatalog(roles: readonly BackOfficeRole[]): boolean {
  return roles.includes("admin") || roles.includes("manager")
}

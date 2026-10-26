import type { BackOfficeRole } from "@effy/shared-types"

/** Changing the taxonomy: admin or manager. Reading it: any active staff (101). */
export function canManageTaxonomy(roles: readonly BackOfficeRole[]): boolean {
  return roles.includes("admin") || roles.includes("manager")
}

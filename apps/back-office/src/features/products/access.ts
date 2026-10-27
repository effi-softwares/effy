import type { BackOfficeRole } from "@effy/shared-types"

/** Admin and manager act on products; customer service reads only (102 FR-010). The server decides; this hides. */
export function canManageProducts(roles: readonly BackOfficeRole[]): boolean {
  return roles.includes("admin") || roles.includes("manager")
}

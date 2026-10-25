import type { BackOfficeRole } from "@effy/shared-types"

export { displayName, initialsOf } from "@effy/web-kit/console"

const ROLE_LABEL: Record<BackOfficeRole, string> = {
  admin: "Admin",
  manager: "Manager",
  csa: "Support",
}

export function roleLabel(roles: readonly BackOfficeRole[]): string | null {
  for (const r of ["admin", "manager", "csa"] as const) if (roles.includes(r)) return ROLE_LABEL[r]
  return null
}

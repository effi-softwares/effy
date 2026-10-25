import type { BackOfficeRole } from "@effy/shared-types";

// The name and initials the shell shows are shared with shop-web (one definition, in the kit).
export { displayName, initialsOf } from "@effy/web-kit/console";

const ROLE_LABEL: Record<BackOfficeRole, string> = {
  admin: "Admin",
  manager: "Manager",
  csa: "Support",
};

/** The highest role held — admin, then manager, then support. Null for a role-less account. */
export function roleLabel(roles: readonly BackOfficeRole[]): string | null {
  for (const r of ["admin", "manager", "csa"] as const) if (roles.includes(r)) return ROLE_LABEL[r];
  return null;
}

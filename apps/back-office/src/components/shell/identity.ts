import type { BackOfficeRole } from "@effy/shared-types";

/**
 * How the shell names the person signed in.
 *
 * The session and the staff record carry an email, roles and a status — no display name. Until the
 * record has one, the email's local part stands in ("alex.chen" → "Alex Chen"); it is never sent
 * anywhere, only shown back to the person it belongs to.
 */
export function displayName(email: string): string {
  const local = email.split("@")[0] ?? "";
  if (!local) return "Signed in";
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function initialsOf(name: string): string {
  const parts = name.split(" ").filter(Boolean);
  const letters = parts.length > 1 ? parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0) : name.slice(0, 2);
  return letters.toUpperCase();
}

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

import type { BackOfficeRole } from "@effy/shared-types";

/**
 * Capability check for the driver console. Reading is open to every role including `csa` (register,
 * profile, duty, history, change trail); mutating is admin/manager, since a driver record is a credential.
 * The backend enforces it from `admin.staff`; this only decides which controls are shown.
 */
export function canManageDrivers(roles: readonly BackOfficeRole[]): boolean {
  return roles.includes("admin") || roles.includes("manager");
}

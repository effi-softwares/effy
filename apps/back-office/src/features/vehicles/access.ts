import type { BackOfficeRole } from "@effy/shared-types";

/**
 * Who may change the vehicle register.
 *
 * The same gate as driver management, deliberately. Reading the fleet is open to every signed-in
 * back-office role including csa — a CSA is exactly who is asked "where is that order" and needs to
 * see which van is out with whom. Changing it is admin/manager only.
 *
 * This is a courtesy, not the decision. The gate that matters is the one in `edge-fleet`, enforced
 * per route by the back-office authorizer and the service's own `guard(…, "mutate")`. Hiding a button
 * from a csa is good manners; it is not security, and this file must never be the only check.
 */
export function canManageVehicles(roles: readonly BackOfficeRole[]): boolean {
  return roles.includes("admin") || roles.includes("manager");
}

import type { BackOfficeRole } from "@effy/shared-types";

/**
 * Who may override the wave planner (063).
 *
 * ⚠ THE SAME SPLIT AS THE FLEET AND DRIVER REGISTERS. Reading the day is open to every signed-in
 * back-office role INCLUDING csa — a CSA is exactly who is asked "where is that order", and seeing
 * what is stuck is not the same as changing it. Moving physical work is admin/manager, on 053's
 * reasoning: it asserts something about the world rather than looking something up.
 *
 * ⚠ THIS IS A COURTESY, NOT THE DECISION. The gate that matters is in `edge-fleet`, per route,
 * behind the back-office authorizer and the service's own `guard(…, "mutate")`. Hiding a control
 * from a csa is good manners; this file must never be the only check.
 */
export function canDispatch(roles: readonly BackOfficeRole[]): boolean {
  return roles.includes("admin") || roles.includes("manager");
}

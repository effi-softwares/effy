import type { BackOfficeRole } from "@effy/shared-types";

/**
 * Who may override the wave planner. Reading the day is open to every role including csa (who is asked
 * "where is that order"); moving work is admin/manager. A courtesy: the gate is `guard(…, "mutate")` per
 * route in the fleet service.
 */
export function canDispatch(roles: readonly BackOfficeRole[]): boolean {
  return roles.includes("admin") || roles.includes("manager");
}

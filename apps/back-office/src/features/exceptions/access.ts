import type { BackOfficeRole } from "@effy/shared-types";

/**
 * Who may close a delivery exception. Reading is open to everyone including csa (who is asked "where is
 * my order"); closing asserts something about the physical world and takes the item off everyone's list.
 * A courtesy: the gate is `guard(…, "mutate")` per route in the fleet service.
 */
export function canResolveExceptions(roles: readonly BackOfficeRole[]): boolean {
  return roles.includes("admin") || roles.includes("manager");
}

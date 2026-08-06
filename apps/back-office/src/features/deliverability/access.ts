import type { BackOfficeRole } from "@effy/shared-types";

/**
 * Who may repair (037 FR-034).
 *
 * ⚠ REFLECTS the backend gate; it is never a second source of truth. The backend decides from
 * `admin.staff` + `admin.staff_role` and refuses regardless of what this returns — this only avoids
 * showing a CSA a control they would be refused.
 *
 * ⚠ CSA can READ. A CSA is exactly who is on the phone to the person who cannot sign in, and seeing
 * that the address is broken is the whole answer to that call. What they cannot do is re-enable mail
 * to an address that hard-failed, because a fresh bounce spends the platform's shared sending
 * reputation — and a paused sender is a total sign-in outage for four audiences.
 */
export function canRepairDelivery(roles: readonly BackOfficeRole[]): boolean {
  return roles.includes("admin") || roles.includes("manager");
}

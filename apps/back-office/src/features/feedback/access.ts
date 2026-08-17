import type { BackOfficeRole } from "@effy/shared-types"

/**
 * Who may REPLY (046 US3 / research D7).
 *
 * ⚠ REFLECTS the backend gate; never a second source of truth. The backend decides from `admin.staff`
 * + `admin.staff_role` and refuses regardless of what this returns — this only avoids showing a CSA a
 * control they would be refused.
 *
 * ⚠ CSA can READ, SEARCH, TRIAGE and NOTE — feedback is diagnostic and a CSA is exactly who fields the
 * shopper contact it represents. What they cannot do is SEND a reply: that is an outward, brand-facing
 * message to a real person, a judgement call with blast radius beyond the console.
 */
export function canReplyFeedback(roles: readonly BackOfficeRole[]): boolean {
  return roles.includes("admin") || roles.includes("manager")
}

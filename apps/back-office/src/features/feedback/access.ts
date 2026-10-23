import type { BackOfficeRole } from "@effy/shared-types"

/**
 * Who may reply.
 *
 * Reflects the backend gate; never a second source of truth. The backend decides from `admin.staff`
 * + `admin.staff_role` and refuses regardless of what this returns — this only avoids showing a CSA a
 * control they would be refused.
 *
 * CSA can read, search, triage and note — feedback is diagnostic and a CSA is exactly who fields the
 * shopper contact it represents. What they cannot do is send a reply: that is an outward, brand-facing
 * message to a real person, a judgement call with blast radius beyond the console.
 */
export function canReplyFeedback(roles: readonly BackOfficeRole[]): boolean {
  return roles.includes("admin") || roles.includes("manager")
}

// Back-office authorization for the feedback console.
//
// ⚠ THE GATES THEMSELVES MOVED to `@effy/edge-shared` (053, research R7) when `edge-api/orders`
// became their third consumer — Principle II forbids copy-pasting cross-cutting logic across
// surfaces. This file keeps the feedback-specific NAMES and the reasoning behind them; the SQL now
// has exactly one home.
//
//   isActiveStaff      — read/search/detail/status/notes: any active back-office staff, INCLUDING
//                        csa. Feedback is diagnostic and a CSA is exactly who fields the shopper
//                        contact it represents (deliverability's reasoning).
//   canReplyFeedback   — reply (an outward, brand-facing email to a real person): active AND
//                        role ∈ {admin, manager}. That is a judgement call with blast radius beyond
//                        the console, the same reason deliverability gates its outward `repair`.
//
// Fail-closed: a throw propagates to the handler, which returns 503 — never an implicit allow.
import { hasStaffRole, isActiveStaff, OUTWARD_ACTION_ROLES, query } from "@effy/edge-shared"

import type { StaffActor } from "./types"

export { isActiveStaff }

export async function canReplyFeedback(sub: string): Promise<boolean> {
  return hasStaffRole(sub, OUTWARD_ACTION_ROLES)
}

/** The staff display name, snapshotted onto a reply/note at write time. Null when unset. */
export async function staffActor(sub: string): Promise<StaffActor> {
  const res = await query<{ name: string | null }>(
    `SELECT s.name FROM admin.staff s WHERE s.cognito_sub = $1`,
    [sub],
  )
  return { sub, name: res.rows[0]?.name ?? null }
}

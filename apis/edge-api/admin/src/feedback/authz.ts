// Back-office authorization for the feedback console, decided from the admin.staff platform record —
// never from the token claim (005 pattern; constitution Principle IV; mirrors deliverability/authz.ts).
//
//   isActiveStaff      — read/search/detail/status/notes: any active back-office staff, INCLUDING csa.
//                        Feedback is diagnostic and a CSA is exactly who fields the shopper contact it
//                        represents (deliverability's reasoning).
//   canReplyFeedback   — reply (an outward, brand-facing email to a real person): active AND
//                        role ∈ {admin, manager}. That is a judgement call with blast radius beyond the
//                        console, the same reason deliverability gates its outward `repair`.
//
// Fail-closed: a throw propagates to the handler, which returns 503 — never an implicit allow.
import { query } from "@effy/edge-shared"

import type { StaffActor } from "./types"

export async function isActiveStaff(sub: string): Promise<boolean> {
  const res = await query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM admin.staff s WHERE s.cognito_sub = $1 AND s.status = 'active'
     ) AS ok`,
    [sub],
  )
  return res.rows[0]?.ok ?? false
}

export async function canReplyFeedback(sub: string): Promise<boolean> {
  const res = await query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM admin.staff s
         JOIN admin.staff_role sr ON sr.staff_id = s.id
        WHERE s.cognito_sub = $1
          AND s.status = 'active'
          AND sr.role_key IN ('admin', 'manager')
     ) AS ok`,
    [sub],
  )
  return res.rows[0]?.ok ?? false
}

/** The staff display name, snapshotted onto a reply/note at write time. Null when unset. */
export async function staffActor(sub: string): Promise<StaffActor> {
  const res = await query<{ name: string | null }>(
    `SELECT s.name FROM admin.staff s WHERE s.cognito_sub = $1`,
    [sub],
  )
  return { sub, name: res.rows[0]?.name ?? null }
}

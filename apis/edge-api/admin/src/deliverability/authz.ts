// Back-office authorization for the deliverability view, decided from the admin.staff platform
// record — never from the token claim (005 pattern; constitution Principle IV).
//
//   isActiveStaff       — read: any active back-office staff, including csa. Seeing that an address
//                         is broken is diagnostic, and a CSA is exactly who is on the phone to the
//                         person who cannot sign in.
//   canRepairDelivery   — mutate: active AND role ∈ {admin, manager}.
//
// ⚠ WHY THE REPAIR IS NOT A CSA ACTION. It re-enables mail to an address that previously HARD
// failed, which means it can re-introduce a bounce against the platform's shared sending
// reputation — and on this platform a paused sender is a total sign-in outage for four audiences.
// That is a judgement call with blast radius beyond one customer.
//
// Fail-closed: a throw propagates to the handler, which returns 503 — never an implicit allow.
import { query } from "@effy/edge-shared"

export async function isActiveStaff(sub: string): Promise<boolean> {
  const res = await query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM admin.staff s WHERE s.cognito_sub = $1 AND s.status = 'active'
     ) AS ok`,
    [sub],
  )
  return res.rows[0]?.ok ?? false
}

export async function canRepairDelivery(sub: string): Promise<boolean> {
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

// Back-office authorization for promotions & order rules, decided from the admin.staff platform record
// (005/009 pattern) — never from the token claim alone. Two levels:
//   isActiveStaff       — read: any active back-office staff, incl. csa (they answer questions about codes).
//   canManagePromotions — mutate: active AND role ∈ {admin, manager} (FR-052).
// Fail-closed: a throw propagates to the handler, which returns 503 rather than an implicit allow.
import { query } from "@effy/edge-shared";

// The read gate is the same active-staff predicate every back-office read surface uses.
export { isActiveStaff } from "../shops/authz";

export async function canManagePromotions(sub: string): Promise<boolean> {
  const res = await query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM admin.staff s
         JOIN admin.staff_role sr ON sr.staff_id = s.id
        WHERE s.cognito_sub = $1
          AND s.status = 'active'
          AND sr.role_key IN ('admin', 'manager')
     ) AS ok`,
    [sub],
  );
  return res.rows[0]?.ok ?? false;
}

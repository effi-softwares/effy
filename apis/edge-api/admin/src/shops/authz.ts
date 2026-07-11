// Back-office authorization for shop management, decided from the admin.staff platform record
// (005 pattern; research R6) — never from the token claim. Two levels:
//   isActiveStaff   — read access (browse/view): any active back-office staff, incl. csa.
//   canManageShops  — mutate access: active AND role ∈ {admin, manager} (spec A1 / FR-014).
// Fail-closed: a throw propagates to the handler, which returns 503 (never an implicit allow).
import { query } from "@effy/edge-shared";

export async function isActiveStaff(sub: string): Promise<boolean> {
  const res = await query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM admin.staff s WHERE s.cognito_sub = $1 AND s.status = 'active'
     ) AS ok`,
    [sub],
  );
  return res.rows[0]?.ok ?? false;
}

export async function canManageShops(sub: string): Promise<boolean> {
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

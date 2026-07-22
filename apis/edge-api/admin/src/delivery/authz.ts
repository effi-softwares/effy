// Back-office authorization for delivery-zones & pricing management, decided from the admin.staff
// platform record (005 pattern; research R6) — never from the token claim. Two levels:
//   isActiveStaff     — read access (browse/view): any active back-office staff, incl. csa.
//   canManageDelivery — mutate access: active AND role ∈ {admin, manager} (spec FR-013/US4).
// Fail-closed: a throw propagates to the handler, which returns 503 (never an implicit allow).
import { query } from "@effy/edge-shared";

// Read gate is identical to the shops slice — one active-staff predicate serves every read surface.
export { isActiveStaff } from "../shops/authz";

export async function canManageDelivery(sub: string): Promise<boolean> {
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

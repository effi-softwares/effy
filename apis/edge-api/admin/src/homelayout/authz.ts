// Back-office authorization for the home layout (042), decided from the `admin.staff` platform record
// (005/009 pattern) — never from the token claim alone. Two levels:
//   isActiveStaff    — read: any active back-office staff, incl. csa. Seeing what the storefront says
//                      is support work, and a read discloses nothing a shopper cannot already see.
//   canComposeHome   — mutate: active AND role ∈ {admin, manager} (FR-016).
//
// ⚠ The mutate gate matters more here than on most admin surfaces: this slice's output is the front
// page of the platform's only public surface. Fail-closed — a throw propagates to the handler, which
// returns 503 rather than an implicit allow.
import { query } from "@effy/edge-shared";

// The read gate is the same active-staff predicate every back-office read surface uses.
export { isActiveStaff } from "../shops/authz";

export async function canComposeHome(sub: string): Promise<boolean> {
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

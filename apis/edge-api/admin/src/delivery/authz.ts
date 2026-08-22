// Back-office authorization for delivery configuration, decided from the admin.staff platform record
// (005/009 pattern) — never the token claim alone. read = any active staff (incl. csa); mutate =
// admin/manager (FR-046/FR-052). ⚠ Fees + same-day config are back-office ONLY; there is no shop-side
// write path anywhere (FR-045).
import { query } from "@effy/edge-shared";

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

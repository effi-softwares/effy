// Decided from admin.staff. Read: any active staff; mutate: admin/manager. No shop-side write path exists.
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

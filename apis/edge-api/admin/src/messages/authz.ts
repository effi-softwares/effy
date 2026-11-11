// Who may do what with messages (112 R13), decided from admin.staff. Read and direct messages: any active staff, CSA
// included. Every other kind, and stop, cancel and withdraw: an administrator or a manager. A throw propagates.
import { query } from "@effy/edge-shared";

export { isActiveStaff } from "../shops/authz";

export async function canManageMessages(sub: string): Promise<boolean> {
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

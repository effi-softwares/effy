// Back-office authorization for driver management (049), decided from the admin.staff platform
// record (005/009 pattern) — never the token claim. Two levels:
//   isActiveStaff    — read access: any active back-office staff, incl. csa.
//   canManageDrivers — mutate access: active AND role ∈ {admin, manager}.
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

export async function canManageDrivers(sub: string): Promise<boolean> {
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

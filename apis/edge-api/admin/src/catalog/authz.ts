// Decided from admin.staff, never the token. Read: any active staff, csa included. Manage: admin or
// manager. A throw propagates, never an implicit allow.
import { query } from "@effy/edge-shared";

export async function canReadCatalog(sub: string): Promise<boolean> {
  const res = await query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM admin.staff s WHERE s.cognito_sub = $1 AND s.status = 'active'
     ) AS ok`,
    [sub],
  );
  return res.rows[0]?.ok ?? false;
}

export async function canManageCatalog(sub: string): Promise<boolean> {
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

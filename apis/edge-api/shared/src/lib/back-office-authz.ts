// Back-office authorization from the `admin.staff` record, never the token claim:
//  isActiveStaff read and triage: any active staff, csa included.
//  hasStaffRole an action whose effect leaves the console: active and holding an allowed role.
// A throw propagates, never an implicit allow.
import { query } from "./db";

/** The read gate. */
export async function isActiveStaff(sub: string): Promise<boolean> {
  const res = await query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM admin.staff s WHERE s.cognito_sub = $1 AND s.status = 'active'
     ) AS ok`,
    [sub],
  );
  return res.rows[0]?.ok ?? false;
}

/** The write gate: status and role in one predicate. */
export async function hasStaffRole(sub: string, roles: readonly string[]): Promise<boolean> {
  if (roles.length === 0) return false;
  const res = await query<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM admin.staff s
         JOIN admin.staff_role sr ON sr.staff_id = s.id
        WHERE s.cognito_sub = $1
          AND s.status = 'active'
          AND sr.role_key = ANY($2::text[])
     ) AS ok`,
    [sub, roles],
  );
  return res.rows[0]?.ok ?? false;
}

/** For an action whose effect leaves the console; `csa` is deliberately absent. */
export const OUTWARD_ACTION_ROLES = ["admin", "manager"] as const;

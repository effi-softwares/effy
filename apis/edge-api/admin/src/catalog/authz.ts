// Back-office authorization for catalog schema authority (016), decided from the admin.staff
// platform record (005/009 `shops/authz.ts` pattern, research R5) — never from the token claim.
// Two levels, exactly the shops guard:
//   canReadCatalog   — read (browse/view the schema): any active back-office staff, incl. csa.
//   canManageCatalog — mutate (types/attributes/categories): active AND role ∈ {admin, manager}.
// Fail-closed: a throw propagates to the handler, which returns 503 (never an implicit allow).
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

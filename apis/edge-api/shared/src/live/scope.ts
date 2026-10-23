import { pooled, type Queryable } from "../lib/db";

/**
 * Whose updates a signed-in person may hear: one rule, read by the audience's service and by the live
 * authorizer. Each rule names the permitted state (`= 'active'`), so a new status is refused by
 * default. The platform record decides; no token claim is consulted. A customer's scope is their own
 * subject, checked with no database read.
 */

const SHOP_SCOPE = `
SELECT st.id AS scope_id
  FROM public.shop_staff ss
  JOIN public.shop st ON st.id = ss.shop_id
 WHERE ss.cognito_sub = $1
   AND ss.status = 'active'
   AND st.status = 'active'`;

const DRIVER_SCOPE = `
SELECT d.id AS scope_id
  FROM public.driver d
 WHERE d.cognito_sub = $1
   AND d.status = 'active'`;

const OPS_SCOPE = `
SELECT 1 AS present
  FROM admin.staff s
 WHERE s.cognito_sub = $1
   AND s.status = 'active'`;

/** The shop an active operator at an active shop belongs to; `null` for anyone else. */
export async function shopScope(sub: string, db: Queryable = pooled): Promise<string | null> {
  const { rows } = await db.query<{ scope_id: string }>(SHOP_SCOPE, [sub]);
  return rows[0]?.scope_id ?? null;
}

/** An active driver's own id; `null` for anyone else. */
export async function driverScope(sub: string, db: Queryable = pooled): Promise<string | null> {
  const { rows } = await db.query<{ scope_id: string }>(DRIVER_SCOPE, [sub]);
  return rows[0]?.scope_id ?? null;
}

/** Whether this subject is an active back-office account. */
export async function opsScope(sub: string, db: Queryable = pooled): Promise<boolean> {
  const { rows } = await db.query(OPS_SCOPE, [sub]);
  return rows.length > 0;
}

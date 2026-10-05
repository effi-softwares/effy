import { pooled, type Queryable } from "../lib/db";

/**
 * 071 — whose updates a signed-in person may hear. ONE rule, read twice: by the audience's own
 * service when it tells an app which channel is its own, and by the live authorizer when the app
 * subscribes to it. If the two disagreed an app would be handed a channel it is then refused, or —
 * worse — refused nothing.
 *
 * Each rule NAMES THE PERMITTED STATE (`= 'active'`) rather than excluding forbidden ones: a status
 * added later is refused by default instead of admitted by default (the 055 / 056 lesson).
 *
 * The platform record is authoritative (constitution Principle IV). No token claim is consulted —
 * a shop id is not a claim, and a group claim outlives the suspension that should end it.
 *
 * A customer has no entry here on purpose: their scope is their own token subject, checked by
 * equality with no database read, so shopper traffic cannot reach the database through this.
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

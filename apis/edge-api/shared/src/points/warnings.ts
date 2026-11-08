/**
 * The one warning before points expire. One statement decides and records it: the notice insert (ON
 * conflict do nothing on customer and date) decides who is told, so a customer is told once per date. The
 * date is the last usable day in Melbourne; a customer with no email is not mailed.
 */
import { OPERATING_TZ } from "@effy/shared-types";
import type { Queryable } from "../lib/db";
import { notify } from "../notifications/notify";
import { loadSettings } from "./settings";

const TZ = OPERATING_TZ;

/** Queue warnings for lots that stop within the warning period. Returns how many were queued. */
export async function queueExpiryWarnings(q: Queryable, now: Date): Promise<number> {
  const { warningDays } = await loadSettings(q);
  const res = await q.query(
    `
WITH due AS (
    SELECT e.customer_id,
           ((e.expires_at - interval '1 second') AT TIME ZONE '${TZ}')::date AS last_day,
           SUM(e.points - COALESCE((SELECT SUM(a.points) FROM public.points_allocation a WHERE a.credit_entry_id = e.id), 0))::int AS points
      FROM public.points_entry e
     WHERE e.points > 0
       AND e.expires_at > $1
       AND e.expires_at <= $1::timestamptz + make_interval(days => $2)
     GROUP BY 1, 2
), noticed AS (
    INSERT INTO public.points_expiry_notice (customer_id, expiry_date, points)
    SELECT customer_id, last_day, points FROM due WHERE points > 0
    ON CONFLICT (customer_id, expiry_date) DO NOTHING
    RETURNING id, customer_id, expiry_date
)
SELECT n.id::text AS id, n.expiry_date::text AS expiry_date, c.cognito_sub AS sub, c.email
  FROM noticed n
  JOIN public.customer c ON c.id = n.customer_id`,
    [now, warningDays],
  );
  // One notification per notice, by push and email (110 R10). Kept even for a customer with no address or device (the inbox).
  let queued = 0;
  for (const r of res.rows as Array<{ id: string; expiry_date: string; sub: string; email: string | null }>) {
    queued += await notify(q, {
      type: "points_expiring", recipients: [{ sub: r.sub, email: r.email }], subject: { entityId: r.id },
      dedupeScope: r.expiry_date, channels: ["push", "email"],
    });
  }
  return queued;
}

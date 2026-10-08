/**
 * The one warning before points expire (074 FR-023, SC-007).
 *
 * ⚠ ONE STATEMENT DECIDES AND RECORDS IT. The notice row is inserted with ON CONFLICT DO NOTHING on
 * (customer, expiry date), and the email intent is created only FROM the rows that insert produced —
 * so however many lots expire on a day, and however many times the job runs, a customer is told once.
 *
 * ⚠ The date is the LAST DAY THE POINTS CAN BE USED, in Melbourne: the same date the account page
 * shows. The email address is snapshotted here (052's rule); a customer with none is simply not mailed.
 */
import type { Queryable } from "../lib/db";
import { loadSettings } from "./settings";

const TZ = "Australia/Melbourne";

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
INSERT INTO public.notification_request (recipient_sub, audience, type, channel, recipient_email, payload, dedupe_key)
SELECT c.cognito_sub, 'customer', 'points_expiring', 'email', c.email,
       jsonb_build_object('entityId', n.id::text, 'deepLink', 'effy://points'),
       'points_expiring:' || c.cognito_sub || ':' || n.expiry_date::text
  FROM noticed n
  JOIN public.customer c ON c.id = n.customer_id
 WHERE c.email IS NOT NULL
ON CONFLICT (dedupe_key) DO NOTHING`,
    [now, warningDays],
  );
  return res.rowCount ?? 0;
}

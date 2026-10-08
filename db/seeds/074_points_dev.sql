-- 074 customer points — dev seed. Gives ONE existing dev customer some points to see and spend.
--
-- ⚠ THE CUSTOMER IS NAMED BY THE OPERATOR, NEVER GUESSED (constitution: Real-World Identifiers). Run:
--
--     psql "$DSN" -v customer_email='<a dev customer you own>' -f db/seeds/074_points_dev.sql
--
-- With no -v customer_email it STOPS, having written nothing. So does an email that matches no
-- customer: a seed that silently credits nobody would look like a broken feature.
--
-- Idempotent: every row carries a `seed:074:` dedupe key, so re-running adds nothing.
-- ⚠ Written with plain INSERTs because a seed is not a service — but in the ledger's own shape
--   (credits are lots with an expiry; nothing is updated or deleted). Dev only; never run in production.
--
-- What it creates, relative to today:
--   • 1,500 points  "Sorry your order was late"   — expires in 12 months
--   •   500 points  "A thank-you from Effy"        — expires in 20 days (inside the 30-day warning)

-- Stop at the first error rather than running on inside an aborted transaction.
\set ON_ERROR_STOP on

\if :{?customer_email}
\else
  \echo '074 seed: pass -v customer_email=<a dev customer you own>. Nothing was written.'
  \quit
\endif

BEGIN;


SELECT set_config('seed.customer_email', :'customer_email', true);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.customer WHERE email = current_setting('seed.customer_email')::citext) THEN
        RAISE EXCEPTION '074 seed: no customer with that email. Nothing was written.';
    END IF;
END
$$;

INSERT INTO public.points_account (customer_id)
SELECT id FROM public.customer WHERE email = :'customer_email'::citext
ON CONFLICT (customer_id) DO NOTHING;

INSERT INTO public.points_entry (customer_id, kind, points, reason, author_kind, author_sub, dedupe_key, expires_at)
SELECT c.id, 'staff_credit', v.points, v.reason, 'staff', 'seed:074', 'seed:074:' || c.id::text || ':' || v.tag, v.expires_at
  FROM public.customer c
 CROSS JOIN (VALUES
    (1500, 'late_delivery', 'late',
     ((now() AT TIME ZONE 'Australia/Melbourne')::date + interval '12 months' + interval '1 day') AT TIME ZONE 'Australia/Melbourne'),
    ( 500, 'goodwill',      'soon',
     ((now() AT TIME ZONE 'Australia/Melbourne')::date + interval '20 days'   + interval '1 day') AT TIME ZONE 'Australia/Melbourne')
 ) AS v(points, reason, tag, expires_at)
 WHERE c.email = :'customer_email'::citext
ON CONFLICT (dedupe_key) DO NOTHING;

COMMIT;

SELECT c.email, public.points_usable(c.id, now()) AS usable_points
  FROM public.customer c WHERE c.email = :'customer_email'::citext;

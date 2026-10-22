-- 098-product-variants — DEV ONLY. Empty the catalogue, every order and every cart, so 098's
-- migration (which refuses a non-empty catalogue) can run. The operator decided to start the
-- catalogue fresh rather than migrate it (specs/098-product-variants/research.md R14).
--
--     psql "$DSN" -f db/reset/098_purge_catalogue_dev.sql
--
-- ⚠ NEVER RUN THIS IN PRODUCTION. It deletes every product, order, payment record, package, parcel,
--   refund, cart, saved item, stock movement and everything else that hangs off them. Shops, staff,
--   customers, drivers, categories, product types, delivery settings and promotions' own rows (not
--   their product targets or uses) are kept unless they reference one of the emptied tables.
--
-- What it does, in one transaction:
--   1. Lists every table that will be emptied — the three roots and everything that references them,
--      transitively, through a foreign key (exactly what TRUNCATE … CASCADE empties) — with its rows.
--   2. Refuses unless the database name contains "dev" (override: \set confirm_any_db yes).
--   3. TRUNCATE public.product, public."order", public.cart … CASCADE.

\set ON_ERROR_STOP on

BEGIN;

-- ── 1. What will be emptied ─────────────────────────────────────────────────────────────────────

CREATE TEMP TABLE purge_098 ON COMMIT DROP AS
WITH RECURSIVE hit(rel) AS (
    SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname IN ('product', 'order', 'cart')
    UNION
    SELECT con.conrelid FROM pg_constraint con JOIN hit ON con.confrelid = hit.rel
     WHERE con.contype = 'f'
)
SELECT n.nspname || '.' || c.relname AS table_name, c.oid AS rel
  FROM hit JOIN pg_class c ON c.oid = hit.rel JOIN pg_namespace n ON n.oid = c.relnamespace;

-- +rows per table, so the operator sees what goes before it goes.
CREATE TEMP TABLE purge_098_counts (table_name text, row_count bigint) ON COMMIT DROP;
DO $$
DECLARE r record; n bigint;
BEGIN
    FOR r IN SELECT table_name FROM purge_098 ORDER BY table_name LOOP
        EXECUTE format('SELECT count(*) FROM %s', r.table_name) INTO n;
        INSERT INTO purge_098_counts VALUES (r.table_name, n);
    END LOOP;
END $$;

\echo 'Tables 098 purge will EMPTY (TRUNCATE ... CASCADE):'
SELECT table_name, row_count FROM purge_098_counts ORDER BY table_name;

-- ── 2. Dev only ─────────────────────────────────────────────────────────────────────────────────

\if :{?confirm_any_db}
\else
SELECT current_database() ~* 'dev' AS is_dev_db \gset
\if :is_dev_db
\else
\echo 'Refusing: the database name does not contain "dev". If this really is a dev database, re-run with -v confirm_any_db=yes.'
ROLLBACK;
\quit
\endif
\endif

-- ── 3. Empty ────────────────────────────────────────────────────────────────────────────────────

TRUNCATE public.product, public."order", public.cart CASCADE;

\echo 'Emptied. Next: make db-up ENV=dev (098), then the 084 and 098 seeds.'

COMMIT;

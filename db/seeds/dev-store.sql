-- 007-shop-web: seed one dev store.
--
-- Stores are OPERATOR-SEEDED this slice — no store-management interface ships (FR-019).
-- Creating and editing stores from the back-office console is a later slice.
--
-- Idempotent: safe to re-run. Applied by `make shop-seed-store CODE=… NAME=… ENV=dev`,
-- or directly:  psql "$(infra/scripts/db-dsn.sh dev)" -f db/seeds/dev-store.sql

INSERT INTO public.store (code, name)
VALUES ('CMB-01', 'Colombo 01')
ON CONFLICT (code) DO NOTHING;

-- +goose Up
-- 070-retire-core-api: a database role for the SHOPPER-FACING services, with a connection limit.
--
-- ⚠ WHY A ROLE AND NOT A CONFIGURATION VALUE. Every serverless function holds one database
-- connection per warm container, the instance accepts about 85, and function concurrency is not
-- capped. Until 070 that did not matter: all shopper traffic went through one always-on process that
-- shared ten connections. With shoppers on serverless too, a burst of browsing could take every
-- connection and lock out the shop console, the driver app and the back office at once.
--
-- A CONNECTION LIMIT on the role the shopper services connect as is the one cap that holds no matter
-- how many functions or containers exist: when it is reached the DATABASE refuses the next
-- connection (SQLSTATE 53300), immediately, and the service answers a retryable 503. Staff, shop and
-- driver services connect as a different role and are untouched (specs/070-retire-core-api/research.md R4).
--
-- ⚠ NO PASSWORD HERE, AND THE ROLE CANNOT LOG IN YET. A migration is committed to the repository and
-- a secret must never be. The operator runs `make db-shopper-role ENV=<env>` afterwards, which
-- generates a password, stores it in Secrets Manager and enables login. Until then this role is
-- inert, and nothing connects as it.
--
-- ⚠ THE LIMIT IS 40 OF ~85. It leaves more than half the instance for everything else and is far
-- above any plausible pre-launch shopper concurrency. It is a setting on the role, not a schema
-- fact: `ALTER ROLE effy_shopper CONNECTION LIMIT <n>` changes it with no migration and no deploy.
--
-- ⚠ GRANTS ARE DML ON `public` ONLY — NO DDL, NO `admin` SCHEMA. The shopper services read the
-- catalogue and write carts, orders, payments and refunds, all of which live in `public`. They have
-- no business reading back-office staff records: the routes that decide a staff member's authority
-- (back-office and shop refunds) run in the `orders` and `shop` services, under the existing role.
-- This is strictly LESS than those routes had before 070, when they ran as the master user.
--
-- ⚠ DEFAULT PRIVILEGES make the grant cover tables a LATER migration creates. Without them, the next
-- feature to add a table would work in every test (which run as the owner) and fail in production
-- with "permission denied" the first time a shopper touched it.

-- +goose StatementBegin
DO $$
BEGIN
    -- Guarded because a role belongs to the whole cluster, not to one database: creating it twice
    -- (a second database on one server, a re-run after a partial failure) must not be an error.
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'effy_shopper') THEN
        CREATE ROLE effy_shopper NOLOGIN CONNECTION LIMIT 40;
    END IF;
END
$$;
-- +goose StatementEnd

COMMENT ON ROLE effy_shopper IS
    'The role shopper-facing services (edge storefront, commerce) connect as (070). Connection-limited so a shopper burst cannot starve staff, shop and driver services. DML on public only.';

GRANT USAGE ON SCHEMA public TO effy_shopper;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO effy_shopper;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO effy_shopper;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO effy_shopper;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO effy_shopper;

-- +goose Down
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE USAGE, SELECT ON SEQUENCES FROM effy_shopper;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM effy_shopper;

REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM effy_shopper;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM effy_shopper;
REVOKE USAGE ON SCHEMA public FROM effy_shopper;

DROP ROLE IF EXISTS effy_shopper;

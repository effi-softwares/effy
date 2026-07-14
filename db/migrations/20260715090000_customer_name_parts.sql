-- +goose Up
-- 011 amendment (2026-07-15): a customer has a FIRST name and a LAST name, not a "display name".
--
-- WHY THIS IS A NEW MIGRATION AND NOT AN EDIT
-- The platform is FORWARD-ONLY (constitution: Goose, no down migrations relied upon), and
-- 20260714120000_customer.sql is already committed and applied to dev. A shipped migration is
-- history; mistakes in it are corrected by a new one, never by rewriting the old one.
--
-- WHY IT IS SAFE TO DROP THE COLUMN
-- `public.customer` is EMPTY (0 rows in dev, verified before writing this) — nobody has completed
-- a sign-up yet. There is no data to preserve, and no name to split heuristically. Had there been
-- rows, this would have needed a backfill and a two-phase drop instead; it does not.
--
-- WHY TWO COLUMNS AND NOT ONE
-- The two parts map 1:1 onto Cognito's STANDARD attributes `given_name` / `family_name`, so the
-- names ride on the ID token and land here without a bespoke claim or a custom attribute. They are
-- also what a delivery label, an order confirmation and a support conversation actually need. A
-- single free-text "display name" cannot be split back into parts reliably (ask anyone with two
-- surnames, or one name) — so the parts are captured at source and never inferred.

ALTER TABLE public.customer
    ADD COLUMN given_name  text,
    ADD COLUMN family_name text;

COMMENT ON COLUMN public.customer.given_name IS
    'First name. Captured at registration (011 FR-009a); maps to Cognito standard attribute given_name.';
COMMENT ON COLUMN public.customer.family_name IS
    'Last name. Captured at registration (011 FR-009a); maps to Cognito standard attribute family_name.';

-- Both stay NULLABLE. The federated route (Google, parked) supplies whatever the provider asserts
-- and may assert neither — the platform must not invent a name it was never given.

ALTER TABLE public.customer
    DROP COLUMN display_name;

-- +goose Down
ALTER TABLE public.customer
    ADD COLUMN display_name text;

ALTER TABLE public.customer
    DROP COLUMN given_name,
    DROP COLUMN family_name;

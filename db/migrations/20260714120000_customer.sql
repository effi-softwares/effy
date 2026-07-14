-- +goose Up
-- 011-customer-storefront-web: the platform's own record of a CUSTOMER.
--
-- This is the platform's first record of a person Effy does NOT employ. It lives in `public`
-- (the operational schema, beside `shop`) and not in `admin`, whose designated purpose is
-- back-office staff accounts and audit.
--
-- The record is distinct from the customer's Cognito credential, and it is AUTHORITATIVE for the
-- access decision (FR-025): a `barred` customer is refused no matter how valid their token is.
-- The claim is the ORIGIN of identity; the record is the AUTHORITY on access.

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE public.customer (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- The join key, and it is deliberately `sub` rather than email.
    --
    -- `sub` SURVIVES ACCOUNT LINKING: once a Google identity is linked into the native profile,
    -- Cognito issues the SAME `sub` no matter which of the three credential routes the customer
    -- used. That is what makes "one person, one record" (FR-011) true at the database level.
    --
    -- Keying on email instead would be a security bug: a customer who could change their own
    -- email could walk onto another customer's row. (The app client also forbids writing `email`
    -- for exactly this reason.)
    cognito_sub  text        NOT NULL UNIQUE,

    -- citext: Cognito treats email as a case-insensitive sign-in alias, so the database must too,
    -- or `Shopper@x.com` and `shopper@x.com` become two customers.
    email        citext      NOT NULL UNIQUE,

    -- Nullable by design: the email-OTP and Google routes never ask for a name.
    display_name text,

    -- PLATFORM-OWNED. Never written from token data, and never reset by a sign-in.
    status       text        NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active', 'barred')),

    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.customer IS
    'The platform''s record of a self-registered customer. Authoritative for access (011 FR-025).';
COMMENT ON COLUMN public.customer.cognito_sub IS
    'Cognito subject id. Survives federated-identity linking, so it is stable across all three credential routes.';
COMMENT ON COLUMN public.customer.status IS
    'Platform-owned. A valid credential NEVER overrides a barred status.';

-- +goose Down
DROP TABLE IF EXISTS public.customer;

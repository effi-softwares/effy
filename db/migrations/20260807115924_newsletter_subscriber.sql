-- 039-customer-home-redesign — newsletter subscribers (US6).
--
-- ⚠ A SUBSCRIBER IS NOT A CUSTOMER, and this table is deliberately standalone: no foreign key to
-- public.customer, no cognito_sub, no join. Three reasons, in order of weight:
--
--   1. Most of a newsletter list never becomes a customer. Modelling subscription as a column on
--      `customer` would exclude the majority of the list by construction.
--   2. Coupling the two leaks account existence. If a subscribe touched `customer`, the subscribe
--      path would become an oracle for "does this address have an Effy account?" — exactly what
--      FR-032 forbids. Keeping the tables apart makes that property STRUCTURAL rather than a rule
--      somebody has to remember while writing a query.
--   3. Marketing consent and account state are different facts with different lifetimes. A closed
--      account does not imply an unsubscribe, and an unsubscribe does not imply account closure.
--
-- Forward-only (003). The Down drops the table — dev-only, single-step.

-- +goose Up

-- ⚠ Case-insensitive email, enforced by the TYPE rather than by remembering to LOWER() at every call
-- site. `A@b.com` and `a@b.com` are one person and must be one row; a UNIQUE index on a plain `text`
-- column would happily hold both and then send two confirmation emails to the same inbox.
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE public.newsletter_subscriber (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    email               citext NOT NULL UNIQUE,

    status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'confirmed', 'unsubscribed')),

    -- ⚠ THE HASH, NEVER THE TOKEN. The plaintext token exists only in the email we send and in the
    -- link the subscriber clicks. A database leak must not hand an attacker the ability to confirm
    -- other people's subscriptions — the same posture 035 took for its OTP.
    confirm_token_hash  text,

    -- ⚠ THE COOLDOWN CLOCK, and it is NOT `updated_at`. It moves only when an email actually goes
    -- out. `updated_at` bumps on every write including the no-op upsert a repeat submission performs,
    -- so a window keyed on it would reset itself on each attempt and cap nothing at all. This column
    -- is the whole of FR-035's abuse resistance.
    confirm_sent_at     timestamptz,

    confirmed_at        timestamptz,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ⚠ No further index. The unique constraint on `email` already provides the only lookup this table
-- has (subscribe is keyed on email; confirm is keyed on the token hash, which at newsletter scale is
-- a sequential scan over a tiny table). An index added "just in case" is a write cost with no reader.

COMMENT ON TABLE  public.newsletter_subscriber IS
    'Standalone newsletter interest (039). Deliberately unrelated to public.customer — see the migration header.';
COMMENT ON COLUMN public.newsletter_subscriber.confirm_token_hash IS
    'Hash of the single-use double-opt-in token. Never the plaintext.';
COMMENT ON COLUMN public.newsletter_subscriber.confirm_sent_at IS
    'When the last confirmation email was actually sent. Drives the resend cooldown (FR-035). Not updated_at.';

-- +goose Down

DROP TABLE IF EXISTS public.newsletter_subscriber;

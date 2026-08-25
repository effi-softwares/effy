-- +goose Up
-- 051-customer-payment-experience: the platform's first reference to a customer's payment-provider
-- record, which is what lets a shopper pay with a card they have already used.
--
-- ⚠ THIS IS THE WHOLE SCHEMA CHANGE. One nullable column, and deliberately no `payment_method` table.
-- Mirroring kept cards into Postgres would create a copy that silently rots: a card removed at the
-- provider, expired, or replaced by the issuer's auto-updater would keep being offered from Effy's
-- stale row, and FR-023 ("an unusable card says why and is not selectable") would be unmeetable. The
-- provider is the system of record for cards; Effy stores the pointer to their owner and nothing more.
-- See specs/051-customer-payment-experience/data-model.md § 2.
--
-- ⚠ NO CARD DATA IS STORED BY THIS FEATURE, here or anywhere (FR-025 / SC-012). There is deliberately
-- no column that could hold a number, a security code, or a cardholder name.

ALTER TABLE public.customer
    ADD COLUMN stripe_customer_id text UNIQUE;

COMMENT ON COLUMN public.customer.stripe_customer_id IS
    '051 — reference to this customer''s payment-provider record. NULLABLE BY DESIGN: a customer has no provider record until their first payment, and backfilling one for everybody would create provider objects for people who may never pay. UNIQUE is load-bearing: two Effy customers sharing one provider customer would let one shopper see another''s kept cards (FR-026), so the constraint is the enforcement, not the service code. It is a REFERENCE, not a credential — it grants nothing on its own, but it has no business in a client payload either, and no response carries it.';

-- +goose Down
-- Dev-only single-step down (003 policy; forward-only in anger).
-- ⚠ Dropping this strands every provider customer record it pointed at: the rows survive at the
-- provider with nothing in Effy able to reach them. Acceptable in dev, never in anger.
ALTER TABLE public.customer
    DROP COLUMN IF EXISTS stripe_customer_id;

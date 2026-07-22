-- +goose Up
-- 023-checkout-shipping-billing: give every order a distinct billing address alongside shipping.
--
-- The order already snapshots the SHIPPING address as `delivery_address` (019). This adds a nullable
-- BILLING snapshot. NULL means "billing is the same as the shipping address" — so the common case
-- stores nothing extra, the receipt's "same as shipping" text is `billing_address IS NULL`, and a
-- customer toggling "same as shipping" back ON simply writes NULL. A value is a divergent, immutable
-- billing snapshot (no FK to customer_address — a later address edit/delete never changes a receipt).
--
-- ⚠ NEVER exposed to the shop (023 FR-018): billing is its own column, and the shop fulfilment query
-- selects only `delivery_address`, so billing is structurally unreachable from any shop surface. A
-- guard test locks it. House style (019/020/021): raw SQL, COMMENT ON everything.
-- See specs/023-checkout-shipping-billing/data-model.md.

ALTER TABLE public."order" ADD COLUMN billing_address jsonb;

COMMENT ON COLUMN public."order".billing_address IS
  'Immutable billing snapshot at placement. NULL means "same as the shipping (delivery_address)". A value is a divergent billing address; a later address edit/delete never changes it. NEVER exposed to the shop (023 FR-018).';

-- +goose Down
-- Forward-only by policy; the down path exists for dev single-step only. Dropping the column loses any
-- divergent billing snapshots (orders revert to "billing = shipping", the pre-023 state).
ALTER TABLE public."order" DROP COLUMN IF EXISTS billing_address;

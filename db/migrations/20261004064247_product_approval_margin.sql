-- +goose Up
-- 067-product-approval-margin — Effy approves what shops sell, and adds its margin.
--
-- Spec: specs/067-product-approval-margin/spec.md. Data model: ../data-model.md. Research: ../research.md.
--
-- A shop used to publish straight to the storefront and edit freely afterwards. Now a new product is
-- SUBMITTED and an Effy admin approves it, setting the margin; and a change to an approved product
-- is a PROPOSAL that waits for the same approval.
--
-- ⚠ `price_amount` KEEPS ITS MEANING: WHAT THE CUSTOMER PAYS. It is read in 33 places on the hot
-- path and by five cold-path services, every one of which means exactly that. The shop's own price
-- gets a NEW column, and approval writes `price_amount = shop price + margin`. Changing what the
-- existing column means would leave 33 reads quietly wrong until each was found — the reverse of
-- 054, which spent a slice consolidating one rule out of 14 places.
--
-- ⚠ A NEVER-APPROVED PRODUCT IS STILL A `draft`. The one availability rule already refuses
-- everything but `active`; the CHECK at the bottom of section 1 makes `active` unreachable without
-- an approval. So "not purchasable, not searchable, not viewable" needs no hot-path change, and it
-- is the database's guarantee rather than a service's.
--
-- ⚠ THE ORDER OF THE STATEMENTS IN SECTION 1 IS LOAD-BEARING: columns, then the BACKFILL, then the
-- constraints. Adding the status CHECK before `approved_at` is backfilled fails the migration on
-- every product already on sale.

-- ── 1. public.product ──────────────────────────────────────────────────────────────────────────

ALTER TABLE public.product
    ADD COLUMN shop_price_amount      numeric(12, 2),
    ADD COLUMN shop_compare_at_amount numeric(12, 2),
    ADD COLUMN margin_kind            text,
    ADD COLUMN margin_value           numeric(12, 4),
    ADD COLUMN approved_at            timestamptz,
    ADD COLUMN review_state           text NOT NULL DEFAULT 'none',
    ADD COLUMN review_reason          text,
    ADD COLUMN submitted_at           timestamptz;

-- The backfill. Nothing a customer sees moves: `price_amount`, `compare_at_amount` and `status` are
-- not touched. Every product already past `draft` is treated as approved with NO margin set — it
-- keeps selling at the price it had, and appears in Effy's queue as "margin not set".
UPDATE public.product
   SET shop_price_amount      = price_amount,
       shop_compare_at_amount = compare_at_amount;

UPDATE public.product
   SET approved_at = created_at
 WHERE status <> 'draft';

-- ⚠ `shop_price_amount` STAYS NULLABLE, AND NULL MEANS "THE SAME AS price_amount". A NOT NULL here
-- would fail every INSERT that predates this column — an edge-shop still running the previous
-- build between `db-up` and its own deploy, and every test fixture in the repo — for a value that
-- has an exact, honest default. Readers use COALESCE(shop_price_amount, price_amount); the shop
-- service always writes it.
ALTER TABLE public.product
    ADD CONSTRAINT product_shop_price_check
        CHECK (shop_price_amount IS NULL OR shop_price_amount >= 0),
    ADD CONSTRAINT product_shop_compare_at_check
        CHECK (shop_compare_at_amount IS NULL OR shop_compare_at_amount >= 0),
    ADD CONSTRAINT product_margin_kind_check
        CHECK (margin_kind IS NULL OR margin_kind IN ('percent', 'amount')),
    -- Both or neither: a kind with no value, or a value with no kind, means nothing.
    ADD CONSTRAINT product_margin_pair_check
        CHECK ((margin_kind IS NULL) = (margin_value IS NULL)),
    ADD CONSTRAINT product_margin_value_check
        CHECK (margin_value IS NULL OR margin_value >= 0),
    ADD CONSTRAINT product_review_state_check
        CHECK (review_state IN ('none', 'in_review', 'sent_back')),
    -- `review_state` describes a NEVER-APPROVED product. Once approved, a product's review lives in
    -- `product_change`; letting both carry state would be two answers to "is this waiting on Effy?".
    ADD CONSTRAINT product_review_state_only_before_approval_check
        CHECK (review_state = 'none' OR approved_at IS NULL),
    ADD CONSTRAINT product_sent_back_has_reason_check
        CHECK (review_state <> 'sent_back' OR review_reason IS NOT NULL),
    ADD CONSTRAINT product_in_review_has_submitted_at_check
        CHECK (review_state <> 'in_review' OR submitted_at IS NOT NULL),
    -- ⚠ LAST, AND THE ONE THAT MATTERS. A product cannot be on sale without an approval, whatever a
    -- service does. FR-001 as a property of the table.
    ADD CONSTRAINT product_active_requires_approval_check
        CHECK (status <> 'active' OR approved_at IS NOT NULL);

COMMENT ON COLUMN public.product.price_amount IS
    'What the CUSTOMER pays — unchanged in meaning by 067. From 067 it is WRITTEN only by an Effy approval or margin change, as customerPrice(shop_price_amount, margin); a shop writes shop_price_amount. With no margin set the two are equal.';
COMMENT ON COLUMN public.product.shop_price_amount IS
    'What the SHOP wants to be paid (067). The live, approved value; a proposed new one waits in product_change. ⚠ NULL = the same as price_amount (a row written by code older than 067); read it as COALESCE(shop_price_amount, price_amount).';
COMMENT ON COLUMN public.product.shop_compare_at_amount IS
    'The shop''s own "was" price (067). compare_at_amount is the customer-facing one, with the same margin applied.';
COMMENT ON COLUMN public.product.margin_kind IS
    'How Effy''s margin is expressed (067): percent | amount. NULL with margin_value NULL = "margin not set" — the product sells at its shop price. ⚠ NEVER selected by any shop-pool query (FR-039); a guard test fails naming a shop file that references it.';
COMMENT ON COLUMN public.product.margin_value IS
    'The margin (067): a percentage as entered (12.5 = 12.5%) or an amount, per margin_kind. >= 0. Zero is a deliberate entry and is NOT the same as unset.';
COMMENT ON COLUMN public.product.approved_at IS
    'When Effy first approved this product (067). NULL = never approved, and such a product cannot be active. Products already past draft when 067 shipped were backfilled with created_at.';
COMMENT ON COLUMN public.product.review_state IS
    'Where a NEVER-APPROVED product stands with Effy (067): none | in_review | sent_back. Always none once approved_at is set.';
COMMENT ON COLUMN public.product.review_reason IS
    'Why Effy sent a new product back (067). Shown to the shop. Carries NO staff identity — who decided is in admin.audit_log.';

CREATE INDEX product_in_review_idx ON public.product (submitted_at)
    WHERE review_state = 'in_review';
CREATE INDEX product_margin_not_set_idx ON public.product (shop_id)
    WHERE approved_at IS NOT NULL AND margin_kind IS NULL;

-- ── 2. A proposed change to an approved product ────────────────────────────────────────────────
--
-- ⚠ BESIDE THE LIVE ROW, NEVER IN IT. `product`, `product_attribute_value` and `product_media` are
-- always the last APPROVED version, so every existing read keeps returning it with no predicate
-- added anywhere. A `pending` flag on the live tables would need `AND NOT pending` on every hot-path
-- read, and missing one shows customers an unapproved photo with nothing failing.

CREATE TABLE public.product_change (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id    uuid NOT NULL REFERENCES public.product (id) ON DELETE CASCADE,
    shop_id       uuid NOT NULL REFERENCES public.shop (id) ON DELETE CASCADE,
    proposed      jsonb NOT NULL DEFAULT '{}'::jsonb,
    media_changed boolean NOT NULL DEFAULT false,
    state         text NOT NULL DEFAULT 'in_review',
    reason        text,
    submitted_at  timestamptz NOT NULL DEFAULT now(),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),

    -- ⚠ ONE open change per product, as a fact (FR-017). A second edit updates this row.
    CONSTRAINT product_change_product_uq UNIQUE (product_id),
    CONSTRAINT product_change_state_check CHECK (state IN ('in_review', 'sent_back')),
    CONSTRAINT product_change_sent_back_has_reason_check
        CHECK (state <> 'sent_back' OR reason IS NOT NULL),
    CONSTRAINT product_change_proposed_is_object_check
        CHECK (jsonb_typeof(proposed) = 'object')
);
CREATE INDEX product_change_queue_idx ON public.product_change (submitted_at) WHERE state = 'in_review';
CREATE INDEX product_change_shop_idx ON public.product_change (shop_id);

COMMENT ON TABLE public.product_change IS
    'A shop''s proposed new version of an APPROVED product''s details (067). At most one per product. Holds only what DIFFERS from the live product; a proposal that no longer differs is deleted, not stored. Applied to the live rows in one transaction on approval, then deleted. ⚠ jsonb deliberately: it is never queried by field — only diffed for a reviewer and applied whole.';
COMMENT ON COLUMN public.product_change.updated_at IS
    'The VERSION a reviewer''s decision must echo. ⚠ Compared as text (::text), never through a JS Date — milliseconds versus microseconds made every edit fail in 056.';

CREATE TABLE public.product_change_media (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    change_id       uuid NOT NULL REFERENCES public.product_change (id) ON DELETE CASCADE,
    storage_key     text NOT NULL,
    source_media_id uuid,
    is_primary      boolean NOT NULL DEFAULT false,
    display_order   int NOT NULL DEFAULT 0,
    alt_text        text,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_change_media_change_idx ON public.product_change_media (change_id);
CREATE UNIQUE INDEX product_change_media_primary_uq ON public.product_change_media (change_id) WHERE is_primary;

COMMENT ON TABLE public.product_change_media IS
    'The COMPLETE proposed image set of a pending change (067), present only when product_change.media_changed. source_media_id names the live product_media row a proposed image keeps; NULL is a new upload. ⚠ Customers never read this table: a proposed image reaches product_media only inside the approval transaction.';

-- ── 3. The two prices on an order ──────────────────────────────────────────────────────────────
--
-- Once a margin exists, "the price" of a sold line is two numbers: what the customer paid and what
-- the shop is owed. Both are snapshotted at placement. The existing columns keep meaning CUSTOMER
-- money, so receipts, refunds, the payment amount and back-office are untouched.

ALTER TABLE public.order_item
    ADD COLUMN shop_unit_price_amount    numeric(12, 2) CHECK (shop_unit_price_amount IS NULL OR shop_unit_price_amount >= 0),
    ADD COLUMN shop_line_subtotal_amount numeric(12, 2) CHECK (shop_line_subtotal_amount IS NULL OR shop_line_subtotal_amount >= 0);

ALTER TABLE public.shop_fulfillment
    ADD COLUMN shop_subtotal_amount numeric(12, 2) CHECK (shop_subtotal_amount IS NULL OR shop_subtotal_amount >= 0);

-- Every order placed before 067: the shop was owed what the customer paid (FR-047).
UPDATE public.order_item
   SET shop_unit_price_amount    = unit_price_amount,
       shop_line_subtotal_amount = line_subtotal_amount;
UPDATE public.shop_fulfillment
   SET shop_subtotal_amount = subtotal_amount;

COMMENT ON COLUMN public.order_item.shop_unit_price_amount IS
    'What the SHOP is owed per unit, as it stood at placement (067). unit_price_amount beside it is what the CUSTOMER paid. ⚠ NULL means "same as the customer price" — a line written by a core-api older than 067 — so every shop-facing reader uses COALESCE(shop_unit_price_amount, unit_price_amount).';
COMMENT ON COLUMN public.shop_fulfillment.shop_subtotal_amount IS
    'The portion''s goods at SHOP prices (067). subtotal_amount is at customer prices and is what the customer''s own order page reads. NULL = same as subtotal_amount.';

-- ── 4. Two new shop notifications ──────────────────────────────────────────────────────────────
--
-- ⚠ READER AUDIT (research R9), because 053, 056, 057 and 059 each shipped a defect through an
-- enum widening: this CHECK; `ShopNotificationType` + `SHOP_NOTIFICATION_TYPES` in
-- edge-shared/lib/notification-types.ts; `NotificationType` + the exhaustive copy Record in
-- edge-notifications/worker/copy.ts. shop-web's service worker and shop-mobile route on the
-- payload's own path/tag, not on the type name.

ALTER TABLE public.notification_request DROP CONSTRAINT notification_request_type_check;
ALTER TABLE public.notification_request ADD CONSTRAINT notification_request_type_check
    CHECK (type IN (
        'order_paid', 'order_ready', 'order_out_for_delivery', 'order_delivered',
        'shop_new_order', 'run_assigned',
        'shop_awaiting_pick', 'shop_out_of_stock', 'shop_low_stock', 'shop_refund_proposed',
        'shop_product_approved', 'shop_product_sent_back'
    ));

-- +goose Down
-- Dev single-step rollback only; lossy (margins, approvals and pending changes are discarded, and
-- price_amount keeps whatever margin was applied).
DELETE FROM public.notification_request WHERE type IN ('shop_product_approved', 'shop_product_sent_back');
ALTER TABLE public.notification_request DROP CONSTRAINT notification_request_type_check;
ALTER TABLE public.notification_request ADD CONSTRAINT notification_request_type_check
    CHECK (type IN (
        'order_paid', 'order_ready', 'order_out_for_delivery', 'order_delivered',
        'shop_new_order', 'run_assigned',
        'shop_awaiting_pick', 'shop_out_of_stock', 'shop_low_stock', 'shop_refund_proposed'
    ));
ALTER TABLE public.shop_fulfillment DROP COLUMN IF EXISTS shop_subtotal_amount;
ALTER TABLE public.order_item
    DROP COLUMN IF EXISTS shop_line_subtotal_amount,
    DROP COLUMN IF EXISTS shop_unit_price_amount;
DROP TABLE IF EXISTS public.product_change_media;
DROP TABLE IF EXISTS public.product_change;
DROP INDEX IF EXISTS public.product_margin_not_set_idx;
DROP INDEX IF EXISTS public.product_in_review_idx;
ALTER TABLE public.product
    DROP CONSTRAINT IF EXISTS product_active_requires_approval_check,
    DROP CONSTRAINT IF EXISTS product_in_review_has_submitted_at_check,
    DROP CONSTRAINT IF EXISTS product_sent_back_has_reason_check,
    DROP CONSTRAINT IF EXISTS product_review_state_only_before_approval_check,
    DROP CONSTRAINT IF EXISTS product_review_state_check,
    DROP CONSTRAINT IF EXISTS product_margin_value_check,
    DROP CONSTRAINT IF EXISTS product_margin_pair_check,
    DROP CONSTRAINT IF EXISTS product_margin_kind_check,
    DROP CONSTRAINT IF EXISTS product_shop_compare_at_check,
    DROP CONSTRAINT IF EXISTS product_shop_price_check,
    DROP COLUMN IF EXISTS submitted_at,
    DROP COLUMN IF EXISTS review_reason,
    DROP COLUMN IF EXISTS review_state,
    DROP COLUMN IF EXISTS approved_at,
    DROP COLUMN IF EXISTS margin_value,
    DROP COLUMN IF EXISTS margin_kind,
    DROP COLUMN IF EXISTS shop_compare_at_amount,
    DROP COLUMN IF EXISTS shop_price_amount;

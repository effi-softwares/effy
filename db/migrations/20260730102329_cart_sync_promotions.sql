-- +goose Up
-- 027-customer-cart-sync: a durable, synced, complete cart — plus the platform's first promotional lever.
--
-- The cart the customer builds was the one thing in Effy that could not be rebuilt, and the one thing the
-- platform kept losing: mobile held it in memory only, web in one browser, and the server cart (019) was
-- written by a checkout snapshot and never read. This migration is the data half of making the PLATFORM
-- authoritative for a signed-in shopper's cart: a revision so a client can tell whether what it holds is
-- current, an add-time price so a price change can be REPORTED rather than sprung at payment, a dedupe log
-- so a retried change cannot apply twice, set-aside items kept structurally away from anything that
-- computes money, and promotional codes with the redemption record that makes their caps countable.
--
-- ⚠ It REVERSES 019 research R8 "Option B" (device-local as the source of truth). What R8 got right —
-- stop sending non-idempotent bulk mutations — is kept and generalised: every cart write is now idempotent
-- by construction. See specs/027-customer-cart-sync/research.md R0.
--
-- House style (007/009/019/020/021): everything operational in `public`; raw SQL; text CHECK enums (no
-- native PG enums, no triggers); an index on every FK; COMMENT ON everything. Audit reuses
-- admin.audit_log. See specs/027-customer-cart-sync/data-model.md.

-- ── Promotional codes (operator-created in the back-office; read + redeemed by the hot path) ────

CREATE TABLE public.promo_code (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code                    text NOT NULL,
    kind                    text NOT NULL CHECK (kind IN ('percentage', 'fixed')),
    percent_off             int NULL CHECK (percent_off > 0 AND percent_off <= 100),
    amount_off              numeric(12, 2) NULL CHECK (amount_off > 0),
    currency                char(3) NOT NULL DEFAULT 'AUD',
    minimum_subtotal_amount numeric(12, 2) NOT NULL DEFAULT 0 CHECK (minimum_subtotal_amount >= 0),
    starts_at               timestamptz NULL,
    ends_at                 timestamptz NULL,
    max_redemptions         int NULL CHECK (max_redemptions > 0),
    max_per_customer        int NULL CHECK (max_per_customer > 0),
    status                  text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    created_by              text NOT NULL,
    updated_by              text NULL,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT promo_code_kind_value_chk CHECK (
        (kind = 'percentage' AND percent_off IS NOT NULL AND amount_off IS NULL) OR
        (kind = 'fixed' AND amount_off IS NOT NULL AND percent_off IS NULL)
    ),
    CONSTRAINT promo_code_window_chk CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at)
);
COMMENT ON TABLE public.promo_code IS 'An operator-created promotional code (027). Written by the cold path (back-office), read and redeemed by the hot path (cart + checkout) — the same split public.shop already has. Never deletable once redeemed; disabling is the removal path (FR-070).';
COMMENT ON COLUMN public.promo_code.code IS 'The literal code a shopper types. Unique case-insensitively (promo_code_code_uq on upper(code)) so SPRING20 and spring20 are one code.';
COMMENT ON COLUMN public.promo_code.kind IS 'percentage | fixed. promo_code_kind_value_chk makes an ill-formed promotion UNREPRESENTABLE rather than merely rejected by a service.';
COMMENT ON COLUMN public.promo_code.minimum_subtotal_amount IS 'Minimum PAYABLE subtotal for the code to apply. 0 = no minimum.';
COMMENT ON COLUMN public.promo_code.starts_at IS 'NULL = no lower bound; an open-ended promotion is legitimate.';
COMMENT ON COLUMN public.promo_code.ends_at IS 'NULL = no upper bound.';
COMMENT ON COLUMN public.promo_code.max_redemptions IS 'Overall cap across all shoppers. NULL = uncapped. COUNTED from promo_redemption, never from a mutable counter column — a counter and a redemption row can disagree and then nobody knows which is true.';
COMMENT ON COLUMN public.promo_code.max_per_customer IS 'Per-shopper cap. NULL = uncapped. Also why a code cannot be applied by a guest: without an identity the cap is unenforceable.';
COMMENT ON COLUMN public.promo_code.status IS 'active | disabled. Platform-owned. Disabling stops NEW uses immediately and never affects orders already paid for (FR-051).';
COMMENT ON COLUMN public.promo_code.created_by IS 'The operator cognito_sub who created it (FR-071); an admin.audit_log row is written alongside.';

CREATE UNIQUE INDEX promo_code_code_uq ON public.promo_code (upper(code));
CREATE INDEX promo_code_status_idx ON public.promo_code (status);

CREATE TABLE public.promo_redemption (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    promo_code_id uuid NOT NULL REFERENCES public.promo_code (id) ON DELETE RESTRICT,
    customer_id   uuid NOT NULL REFERENCES public.customer (id) ON DELETE RESTRICT,
    order_id      uuid NOT NULL UNIQUE REFERENCES public."order" (id) ON DELETE RESTRICT,
    amount        numeric(12, 2) NOT NULL CHECK (amount >= 0),
    redeemed_at   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.promo_redemption IS 'One row per PAID order that used a code (027). The sole source of truth for both usage caps. Inserted inside checkout''s existing status-guarded FinalizeSucceeded transaction.';
COMMENT ON COLUMN public.promo_redemption.order_id IS 'UNIQUE — the load-bearing constraint. It makes "counted once per paid order, even if payment is attempted repeatedly" a DATABASE guarantee rather than a code discipline (FR-048), including under duplicated Stripe webhooks.';
COMMENT ON COLUMN public.promo_redemption.amount IS 'The discount actually granted, as computed at payment. Financial history — ON DELETE RESTRICT throughout.';

CREATE INDEX promo_redemption_code_idx ON public.promo_redemption (promo_code_id);
CREATE INDEX promo_redemption_customer_idx ON public.promo_redemption (promo_code_id, customer_id);
CREATE INDEX promo_redemption_order_idx ON public.promo_redemption (order_id);

-- ── Order rules (one row; the minimum spend and the two cart ceilings) ──────────────────────────

CREATE TABLE public.order_policy (
    singleton               boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    minimum_subtotal_amount numeric(12, 2) NOT NULL DEFAULT 0 CHECK (minimum_subtotal_amount >= 0),
    currency                char(3) NOT NULL DEFAULT 'AUD',
    max_line_quantity       int NOT NULL DEFAULT 99 CHECK (max_line_quantity BETWEEN 1 AND 99),
    max_distinct_items      int NOT NULL DEFAULT 100 CHECK (max_distinct_items BETWEEN 1 AND 500),
    updated_by              text NULL,
    updated_at              timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.order_policy IS 'The platform''s order rules (027), one row. Read by the hot path on every cart read; written by the cold path (back-office). A purpose-named table rather than a generic key/value setting: an invalid minimum is a constraint violation here, not a runtime surprise.';
COMMENT ON COLUMN public.order_policy.singleton IS 'A one-row table enforced by the SCHEMA: only true passes the CHECK and only one true fits the primary key, so no application code can create a second policy to disagree with the first.';
COMMENT ON COLUMN public.order_policy.minimum_subtotal_amount IS 'Minimum PAYABLE subtotal before checkout is allowed (FR-053). 0 = no minimum in force, and the cart then shows nothing at all (FR-057). Enforced again at checkout intent so a client that ignores it cannot bypass it (FR-056).';
COMMENT ON COLUMN public.order_policy.max_line_quantity IS 'Configurable per-line ceiling. Bounded 1..99 so it can never exceed cart_item''s structural CHECK (quantity <= 99) — that 019 check is deliberately KEPT as the hard ceiling.';
COMMENT ON COLUMN public.order_policy.max_distinct_items IS 'Configurable cart-size ceiling, default 100. Well below Shopify''s 500-line cap because Effy re-prices EVERY line on every cart read; 500 is the absolute guard.';

-- ── Set-aside items (a TABLE, not a flag — see below) ───────────────────────────────────────────

CREATE TABLE public.cart_saved_item (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id           uuid NOT NULL REFERENCES public.cart (id) ON DELETE CASCADE,
    product_id        uuid NOT NULL REFERENCES public.product (id) ON DELETE RESTRICT,
    quantity          int NOT NULL CHECK (quantity > 0 AND quantity <= 99),
    unit_price_at_add numeric(12, 2) NULL CHECK (unit_price_at_add >= 0),
    added_at          timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (cart_id, product_id)
);
COMMENT ON TABLE public.cart_saved_item IS 'Items set aside for later (027 FR-028..FR-031). ⚠ A SEPARATE TABLE, not a `saved` flag on cart_item, and deliberately so: cart_item is read by checkout''s order-line build, by the delivery quote and by the paid-order finalizer, and a flag would put "charged for an item the shopper set aside, and a shop sent to pick it" one forgotten WHERE clause away. A query that does not name this table cannot see saved items. Contributes to NO total; untouched by clearing the cart and by order completion.';
COMMENT ON COLUMN public.cart_saved_item.unit_price_at_add IS 'The price when set aside, for the same price-change reporting cart_item does. Never what is charged.';

CREATE INDEX cart_saved_item_cart_idx ON public.cart_saved_item (cart_id);
CREATE INDEX cart_saved_item_product_idx ON public.cart_saved_item (product_id);

-- ── The exactly-once guard for queued client changes ────────────────────────────────────────────

CREATE TABLE public.cart_change_log (
    cart_id    uuid NOT NULL REFERENCES public.cart (id) ON DELETE CASCADE,
    change_id  uuid NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (cart_id, change_id)
);
COMMENT ON TABLE public.cart_change_log IS 'Client-generated change ids already applied to a cart (027 FR-018). Inserted IN THE SAME TRANSACTION as the mutation it guards — checking first and mutating second is a race. A duplicate means "already applied": the mutation is skipped and the CURRENT cart is returned, so a retry after an ambiguous failure is indistinguishable from the first attempt succeeding. Retained 7 days, pruned opportunistically. The composite PK is the uniqueness constraint; nothing references a row here so there is no surrogate id.';
COMMENT ON COLUMN public.cart_change_log.applied_at IS 'Indexed for the 7-day prune, not for reads.';

CREATE INDEX cart_change_log_applied_idx ON public.cart_change_log (applied_at);

-- ── Alterations to the 019 cart and order ───────────────────────────────────────────────────────

ALTER TABLE public.cart
    ADD COLUMN revision         bigint NOT NULL DEFAULT 0,
    ADD COLUMN promo_code_id    uuid NULL REFERENCES public.promo_code (id) ON DELETE SET NULL,
    ADD COLUMN promo_applied_at timestamptz NULL;
COMMENT ON COLUMN public.cart.revision IS 'Monotonic, bumped by EVERY mutation (027 R1). Returned on every cart response; the client mirror adopts a response only when its revision exceeds what the mirror holds, which is how an out-of-order reply cannot overwrite a newer cart. bigint because it increments per tap.';
COMMENT ON COLUMN public.cart.promo_code_id IS 'The currently applied code, at most one (FR-046). The DISCOUNT AMOUNT is deliberately NOT stored: it is recomputed from the code definition and the current payable subtotal on every read, because a stored amount is a stale amount. ON DELETE SET NULL is safe precisely because a redeemed code can never be deleted, and an unredeemed one cannot be sitting on a paid cart.';

CREATE INDEX cart_promo_code_idx ON public.cart (promo_code_id);

ALTER TABLE public.cart_item
    ADD COLUMN unit_price_at_add numeric(12, 2) NULL CHECK (unit_price_at_add >= 0);
COMMENT ON COLUMN public.cart_item.unit_price_at_add IS 'The price this line was added at — the ONLY reason a price-change notice is possible (027 FR-023). shared-types/src/cart.ts has declared `priceChangedFrom` since 019 and the backend never populated it because there was nothing to compare against; this column is that missing half. NULLABLE on purpose: rows predating 027 have no add-time price, and inventing one would fabricate a "price changed" notice. NEVER what the shopper is charged — every total still comes from public.product at read time.';

ALTER TABLE public."order"
    ADD COLUMN discount_amount numeric(12, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    ADD COLUMN promo_code_id   uuid NULL REFERENCES public.promo_code (id) ON DELETE RESTRICT,
    ADD COLUMN promo_code      text NULL;
COMMENT ON COLUMN public."order".discount_amount IS 'The platform''s discount computation at the moment of payment (027 FR-049) — so a receipt is explainable years later without re-deriving it from a code that has since changed. DEFAULT 0 keeps every pre-027 order valid and its total arithmetic true. Invariant: grand_total_amount = item_subtotal_amount + delivery_fee_amount - discount_amount.';
COMMENT ON COLUMN public."order".promo_code IS 'The literal code, denormalised beside the id ON PURPOSE: the receipt must still say SPRING20 independently of the promotion record. ON DELETE RESTRICT on the id, because an order''s discount must always be explainable.';

CREATE INDEX order_promo_code_idx ON public."order" (promo_code_id);

-- ── Seed the single order-rules row ─────────────────────────────────────────────────────────────
-- Defaults only: no minimum in force (so nothing is shown to anyone), max_line_quantity 99 which is
-- EXACTLY the constant core-api hard-coded before this slice — so applying this migration changes no
-- behaviour on its own.
INSERT INTO public.order_policy (singleton) VALUES (true);

-- +goose Down
-- Dev single-stepping only (003: forward-only everywhere else). Reverse order of the Up half.
ALTER TABLE public."order" DROP COLUMN IF EXISTS promo_code;
ALTER TABLE public."order" DROP COLUMN IF EXISTS promo_code_id;
ALTER TABLE public."order" DROP COLUMN IF EXISTS discount_amount;
ALTER TABLE public.cart_item DROP COLUMN IF EXISTS unit_price_at_add;
ALTER TABLE public.cart DROP COLUMN IF EXISTS promo_applied_at;
ALTER TABLE public.cart DROP COLUMN IF EXISTS promo_code_id;
ALTER TABLE public.cart DROP COLUMN IF EXISTS revision;
DROP TABLE IF EXISTS public.cart_change_log;
DROP TABLE IF EXISTS public.cart_saved_item;
DROP TABLE IF EXISTS public.order_policy;
DROP TABLE IF EXISTS public.promo_redemption;
DROP TABLE IF EXISTS public.promo_code;

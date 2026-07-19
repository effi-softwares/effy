-- +goose Up
-- 019-customer-commerce-flow: the platform's first commerce tables.
--
-- The customer's browse→cart→checkout→order journey, served by the Go hot path (core-api),
-- reading the 016 catalog (public.product/media/category/attribute_value) and the 011/007 identity +
-- shop tables. Everything lives in `public` (operational); raw SQL, text CHECK enums (no native PG
-- enums, no triggers), an index on every FK, COMMENT ON everything. Money is numeric(12,2) AUD,
-- converted to integer minor units only at the Stripe boundary. No card data is ever stored (SC-012).
-- See specs/019-customer-commerce-flow/data-model.md.

-- ── Delivery addresses ─────────────────────────────────────────────────────────────────────────

CREATE TABLE public.customer_address (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id    uuid NOT NULL REFERENCES public.customer (id) ON DELETE CASCADE,
    label          text,
    recipient_name text NOT NULL,
    phone          text,
    line1          text NOT NULL,
    line2          text,
    city           text NOT NULL,
    region         text,
    postal_code    text NOT NULL,
    country        char(2) NOT NULL DEFAULT 'AU',
    is_default     boolean NOT NULL DEFAULT false,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.customer_address IS 'Customer delivery addresses (019). The chosen one is SNAPSHOT onto the order at placement, so edits/deletes never mutate a historical receipt.';
COMMENT ON COLUMN public.customer_address.is_default IS 'Platform-owned; at most one default per customer (partial unique index).';
COMMENT ON COLUMN public.customer_address.country IS 'ISO-3166-1 alpha-2. Single-country (AU) in this slice.';
CREATE INDEX customer_address_customer_idx ON public.customer_address (customer_id);
CREATE UNIQUE INDEX customer_address_default_uq ON public.customer_address (customer_id) WHERE is_default;

-- ── Server cart (one active cart per customer; the hybrid model's server half, R8) ─────────────

CREATE TABLE public.cart (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id uuid NOT NULL UNIQUE REFERENCES public.customer (id) ON DELETE CASCADE,
    currency    char(3) NOT NULL DEFAULT 'AUD',
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.cart IS 'One active server cart per customer (019). A guest cart is device-local and merged here on sign-in (R8).';

CREATE TABLE public.cart_item (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id    uuid NOT NULL REFERENCES public.cart (id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES public.product (id) ON DELETE RESTRICT,
    quantity   int NOT NULL CHECK (quantity > 0 AND quantity <= 99),
    added_at   timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (cart_id, product_id)
);
COMMENT ON TABLE public.cart_item IS 'A cart line: product + quantity only. NO price stored — price/availability are re-read from public.product at every read (authoritative). Add merges quantity (UNIQUE cart_id,product_id).';
CREATE INDEX cart_item_cart_idx ON public.cart_item (cart_id);
CREATE INDEX cart_item_product_idx ON public.cart_item (product_id);

-- ── Order (the single thing the customer sees; one per successful checkout) ─────────────────────

CREATE TABLE public."order" (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id          uuid NOT NULL REFERENCES public.customer (id) ON DELETE RESTRICT,
    order_number         text NOT NULL UNIQUE,
    status               text NOT NULL DEFAULT 'pending_payment'
                             CHECK (status IN ('pending_payment', 'paid', 'failed', 'canceled')),
    currency             char(3) NOT NULL DEFAULT 'AUD',
    item_subtotal_amount numeric(12, 2) NOT NULL CHECK (item_subtotal_amount >= 0),
    delivery_fee_amount  numeric(12, 2) NOT NULL CHECK (delivery_fee_amount >= 0),
    grand_total_amount   numeric(12, 2) NOT NULL CHECK (grand_total_amount >= 0),
    delivery_address     jsonb NOT NULL,
    placed_at            timestamptz,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public."order" IS 'A placed customer purchase (019). ONE order per successful checkout even across multiple shops. All amounts platform-computed; delivery_address is an immutable jsonb snapshot.';
COMMENT ON COLUMN public."order".order_number IS 'Human-facing reference (e.g. EFY-2G7K9Q). Platform-owned, unique.';
COMMENT ON COLUMN public."order".status IS 'pending_payment → paid (webhook/confirm) | failed. canceled reserved for housekeeping. paid transition is idempotent (WHERE status=pending_payment).';
COMMENT ON COLUMN public."order".delivery_address IS 'Immutable snapshot of the chosen customer_address at placement — a later address edit/delete never changes this receipt.';
CREATE INDEX order_customer_created_idx ON public."order" (customer_id, created_at DESC);
CREATE INDEX order_status_idx ON public."order" (status);

CREATE TABLE public.order_item (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id            uuid NOT NULL REFERENCES public."order" (id) ON DELETE CASCADE,
    product_id          uuid NOT NULL REFERENCES public.product (id) ON DELETE RESTRICT,
    shop_id             uuid NOT NULL REFERENCES public.shop (id) ON DELETE RESTRICT,
    product_name        text NOT NULL,
    unit_price_amount   numeric(12, 2) NOT NULL CHECK (unit_price_amount >= 0),
    quantity            int NOT NULL CHECK (quantity > 0),
    line_subtotal_amount numeric(12, 2) NOT NULL CHECK (line_subtotal_amount >= 0),
    created_at          timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.order_item IS 'An order line (019). product_name + unit_price are SNAPSHOTS (immutable receipt). shop_id is denormalized from product at placement — the fan-out key.';
COMMENT ON COLUMN public.order_item.shop_id IS 'Denormalized from public.product.shop_id at placement. Groups items into per-shop fulfillment portions.';
CREATE INDEX order_item_order_idx ON public.order_item (order_id);
CREATE INDEX order_item_shop_idx ON public.order_item (shop_id);

-- ── Multi-shop fan-out: one portion per (order, shop) ──────────────────────────────────────────

CREATE TABLE public.shop_fulfillment (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        uuid NOT NULL REFERENCES public."order" (id) ON DELETE CASCADE,
    shop_id         uuid NOT NULL REFERENCES public.shop (id) ON DELETE RESTRICT,
    status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'received')),
    item_count      int NOT NULL CHECK (item_count >= 1),
    subtotal_amount numeric(12, 2) NOT NULL CHECK (subtotal_amount >= 0),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (order_id, shop_id)
);
COMMENT ON TABLE public.shop_fulfillment IS 'The per-shop order portion (019 fan-out). EXACTLY ONE per (order,shop) (SC-005, idempotent). Created in the same tx as the paid transition, one row per distinct order_item.shop_id. Shop identity is NEVER exposed to the customer.';
COMMENT ON COLUMN public.shop_fulfillment.subtotal_amount IS 'This shop items subtotal (excludes the order-level flat delivery fee). Σ over the order = order.item_subtotal_amount.';
COMMENT ON COLUMN public.shop_fulfillment.status IS 'pending at creation; received reserved for the later shop-surfacing slice (no consumer flips it here).';
CREATE INDEX shop_fulfillment_shop_idx ON public.shop_fulfillment (shop_id);

-- ── Payment (Stripe references only — never card data) ─────────────────────────────────────────

CREATE TABLE public.payment (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id                 uuid NOT NULL UNIQUE REFERENCES public."order" (id) ON DELETE CASCADE,
    provider                 text NOT NULL DEFAULT 'stripe',
    stripe_payment_intent_id text UNIQUE,
    amount                   numeric(12, 2) NOT NULL CHECK (amount >= 0),
    currency                 char(3) NOT NULL DEFAULT 'AUD',
    status                   text NOT NULL DEFAULT 'requires_payment'
                                 CHECK (status IN ('requires_payment', 'requires_action', 'succeeded', 'failed', 'canceled')),
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.payment IS 'One payment per order (019). Stores ONLY Stripe references + status — NO card data ever (SC-012). status mirrors the PaymentIntent.';
CREATE INDEX payment_order_idx ON public.payment (order_id);

-- ── Stripe webhook dedup (idempotency guard #3, R5) ────────────────────────────────────────────

CREATE TABLE public.stripe_event (
    event_id    text PRIMARY KEY,
    type        text NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.stripe_event IS 'Webhook dedup (019, R5 guard #3). A redelivered Stripe event.ID is a no-op (INSERT … ON CONFLICT DO NOTHING) so the paid transition never double-applies.';

-- ── Favorites (idempotent save) ────────────────────────────────────────────────────────────────

CREATE TABLE public.customer_favorite (
    customer_id uuid NOT NULL REFERENCES public.customer (id) ON DELETE CASCADE,
    product_id  uuid NOT NULL REFERENCES public.product (id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (customer_id, product_id)
);
COMMENT ON TABLE public.customer_favorite IS 'A saved (customer, product) pair (019). Idempotent save (PK). Listed most-recent-first via created_at.';
CREATE INDEX customer_favorite_customer_idx ON public.customer_favorite (customer_id);

-- ── Transactional outbox: the "event" half of the fan-out (R6) ─────────────────────────────────

CREATE TABLE public.event_outbox (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type     text NOT NULL,
    event_id       uuid NOT NULL DEFAULT gen_random_uuid(),
    dedup_key      text NOT NULL UNIQUE,
    aggregate_type text NOT NULL,
    aggregate_id   uuid NOT NULL,
    payload        jsonb NOT NULL,
    occurred_at    timestamptz NOT NULL DEFAULT now(),
    published_at   timestamptz
);
COMMENT ON TABLE public.event_outbox IS 'Transactional outbox (019, R6). Written in the order paid tx so an order.placed event can never be lost/double-emitted. Envelope matches ARCHITECTURE.md so the future SNS/SQS backbone reuses it unchanged; published_at NULL until a future drainer dispatches.';
COMMENT ON COLUMN public.event_outbox.dedup_key IS 'e.g. order.placed:<order_id> — UNIQUE, so the fan-out event is emitted exactly once per order.';
COMMENT ON COLUMN public.event_outbox.payload IS 'Order summary + per-shop breakdown (the fan-out fact).';
CREATE INDEX event_outbox_unpublished_idx ON public.event_outbox (occurred_at) WHERE published_at IS NULL;

-- +goose Down
DROP TABLE IF EXISTS public.event_outbox;
DROP TABLE IF EXISTS public.customer_favorite;
DROP TABLE IF EXISTS public.stripe_event;
DROP TABLE IF EXISTS public.payment;
DROP TABLE IF EXISTS public.shop_fulfillment;
DROP TABLE IF EXISTS public.order_item;
DROP TABLE IF EXISTS public."order";
DROP TABLE IF EXISTS public.cart_item;
DROP TABLE IF EXISTS public.cart;
DROP TABLE IF EXISTS public.customer_address;

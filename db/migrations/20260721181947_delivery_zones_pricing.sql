-- +goose Up
-- 021-delivery-zones-pricing: per-shop split delivery, priced by origin→destination zone.
--
-- Replaces 019's flat per-order fee (pricing.DeliveryFeeCents = 500) with a real delivery map. A
-- multi-shop order becomes one anonymous package per shop; each package is priced and timed from its
-- shop's origin zone to the customer's destination zone; the customer pays once, and each shop portion
-- carries its own real ready-by (which 020's queue already orders by — the seam it was built for).
--
-- House style (007/009/020): everything operational in `public`; raw SQL; text CHECK enums (no native
-- PG enums, no triggers); an index on every FK; COMMENT ON everything. Audit reuses admin.audit_log.
-- See specs/021-delivery-zones-pricing/data-model.md.

-- ── Serviced areas (postcode sets) ─────────────────────────────────────────────────────────────

CREATE TABLE public.delivery_zone (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code       text NOT NULL UNIQUE,
    name       text NOT NULL,
    status     text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.delivery_zone IS 'A named serviced area (021). Both a shop origin and a customer destination resolve to a zone by postcode. Never exposed to customers (FR-019).';
COMMENT ON COLUMN public.delivery_zone.code IS 'Operator handle, e.g. MEL-METRO.';
COMMENT ON COLUMN public.delivery_zone.status IS 'disabled = not offered as an origin or destination for NEW quotes; historical orders untouched (FR-016).';

CREATE TABLE public.delivery_zone_postcode (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_id    uuid NOT NULL REFERENCES public.delivery_zone (id) ON DELETE CASCADE,
    postcode   text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.delivery_zone_postcode IS 'Postcode -> zone (021). The UNIQUE(postcode) is load-bearing: a postcode belongs to AT MOST one zone. A postcode in no row = no zone = undeliverable (FR-017).';
CREATE INDEX delivery_zone_postcode_zone_idx ON public.delivery_zone_postcode (zone_id);

-- ── The rate grid: per (origin zone -> destination zone, method) ───────────────────────────────

CREATE TABLE public.delivery_offering (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    origin_zone_id      uuid NOT NULL REFERENCES public.delivery_zone (id) ON DELETE RESTRICT,
    destination_zone_id uuid NOT NULL REFERENCES public.delivery_zone (id) ON DELETE RESTRICT,
    method              text NOT NULL CHECK (method IN ('same_day', 'scheduled', 'standard')),
    price_amount        numeric(12, 2) NOT NULL CHECK (price_amount >= 0),
    lead_days_min       int NOT NULL DEFAULT 0 CHECK (lead_days_min >= 0),
    lead_days_max       int NOT NULL DEFAULT 0 CHECK (lead_days_max >= lead_days_min),
    same_day_cutoff     time,
    status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (origin_zone_id, destination_zone_id, method)
);
COMMENT ON TABLE public.delivery_offering IS 'The rate table (021). One price + window per (origin zone -> destination zone, method). Absence of an active row for a package leg-method = that method (or the package) is undeliverable. Same-day exists only where a same_day row exists for the pair — the premise made data, never keyed on shop identity.';
COMMENT ON COLUMN public.delivery_offering.lead_days_min IS 'Window lower bound. 0/0 = same-day; 2/3 = "in 2-3 days". Drives the promised ready-by.';
COMMENT ON COLUMN public.delivery_offering.same_day_cutoff IS 'Time-of-day after which same_day is withdrawn from a NEW quote. Only meaningful for method=same_day; NULL otherwise.';
CREATE INDEX delivery_offering_origin_idx ON public.delivery_offering (origin_zone_id);
CREATE INDEX delivery_offering_dest_idx   ON public.delivery_offering (destination_zone_id);
CREATE INDEX delivery_offering_lookup_idx ON public.delivery_offering (origin_zone_id, destination_zone_id);

-- ── Shops gain an origin location ──────────────────────────────────────────────────────────────
-- 007 made public.shop deliberately locationless ("no address, hours, capacity, zones ... those arrive
-- with the slice that needs them"). 021 is that slice.

ALTER TABLE public.shop ADD COLUMN postcode text;
COMMENT ON COLUMN public.shop.postcode IS 'Origin location (021). Resolves to an origin delivery_zone via delivery_zone_postcode. NULL = the shop has no location set -> its packages are undeliverable (FR-017). NEVER exposed to customers (FR-019).';

-- ── The captured per-package quote (pending -> finalize) ───────────────────────────────────────
-- shop_fulfillment rows do not exist until finalization (the 019 fan-out runs on payment_intent.succeeded),
-- so the per-package selection must be captured pre-payment here and copied into shop_fulfillment at
-- finalize. Lifecycle mirrors order_item: deleted + reinserted on every intent call.

CREATE TABLE public.order_package_delivery (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id            uuid NOT NULL REFERENCES public."order" (id) ON DELETE CASCADE,
    shop_id             uuid NOT NULL REFERENCES public.shop (id) ON DELETE RESTRICT,
    service_level       text NOT NULL,
    method              text NOT NULL CHECK (method IN ('same_day', 'scheduled', 'standard')),
    delivery_fee_amount numeric(12, 2) NOT NULL CHECK (delivery_fee_amount >= 0),
    promised_ready_at   timestamptz NOT NULL,
    scheduled_date      date,
    created_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (order_id, shop_id)
);
COMMENT ON TABLE public.order_package_delivery IS 'The captured per-package delivery quote (021, R3). Written at intent time (delete+reinsert, like order_item); consumed into shop_fulfillment delivery columns inside the 019 FinalizeSucceeded transaction. order.delivery_fee_amount = SUM of these fees.';
COMMENT ON COLUMN public.order_package_delivery.scheduled_date IS 'Set only when method=scheduled (the customer picked a date).';
CREATE INDEX order_package_delivery_order_idx ON public.order_package_delivery (order_id);
CREATE INDEX order_package_delivery_shop_idx  ON public.order_package_delivery (shop_id);

-- The quote validity window (R7). order.delivery_fee_amount keeps its name; its VALUE is now the summed
-- per-package fee (no schema change to that column).
ALTER TABLE public."order" ADD COLUMN delivery_quote_expires_at timestamptz;
COMMENT ON COLUMN public."order".delivery_quote_expires_at IS 'The captured quote validity (021, R7). Intent honors captured per-package fees while now() < this; on expiry the customer re-quotes. NULL for pre-021 orders.';

-- The captured quote itself (021, R7/SC-004): the per-package options + fees the customer was SHOWN,
-- persisted at quote time so intent can honor the displayed fee within the validity window WITHOUT the
-- client ever sending a fee. Cleared/overwritten on each quote. NULL for pre-021 orders.
ALTER TABLE public."order" ADD COLUMN delivery_quote jsonb;
COMMENT ON COLUMN public."order".delivery_quote IS 'The captured per-package quote the customer was shown (021). Intent validates selections against it and uses ITS fees (honored within the window), so no fee is ever client-supplied.';

-- ── shop_fulfillment gains real per-portion delivery (read by 020 queue) ───────────────────────
-- Populated at finalize from order_package_delivery. All nullable so pre-021 portions stay valid.

ALTER TABLE public.shop_fulfillment
    ADD COLUMN delivery_service_level text,
    ADD COLUMN delivery_method        text CHECK (delivery_method IN ('same_day', 'scheduled', 'standard')),
    ADD COLUMN delivery_fee_amount    numeric(12, 2) CHECK (delivery_fee_amount >= 0),
    ADD COLUMN promised_ready_at      timestamptz;
COMMENT ON COLUMN public.shop_fulfillment.promised_ready_at IS 'The real per-portion ready-by (021), from the customer chosen package method. 020 queue ordering reads this when present (replacing its uniform placed_at derivation). Shown to the shop as the promise.';
COMMENT ON COLUMN public.shop_fulfillment.delivery_service_level IS 'Shown to the shop operator (021 FR-021a) so they can prioritise/pack.';
COMMENT ON COLUMN public.shop_fulfillment.delivery_fee_amount IS 'The per-package delivery fee. NEVER shown to the shop (FR-021a walls off the payment amount); recorded for the customer receipt and future refunds/payout slices.';

-- +goose Down
-- Forward-only platform (003); dev single-step rollback only. FK-safe order. LOSSY: drops all zone/rate
-- config and per-package delivery. Reinstate pricing.DeliveryFeeCents in Go if rolling back.
ALTER TABLE public.shop_fulfillment
    DROP COLUMN IF EXISTS promised_ready_at,
    DROP COLUMN IF EXISTS delivery_fee_amount,
    DROP COLUMN IF EXISTS delivery_method,
    DROP COLUMN IF EXISTS delivery_service_level;
ALTER TABLE public."order" DROP COLUMN IF EXISTS delivery_quote_expires_at;
DROP TABLE IF EXISTS public.order_package_delivery;
ALTER TABLE public.shop DROP COLUMN IF EXISTS postcode;
DROP TABLE IF EXISTS public.delivery_offering;
DROP TABLE IF EXISTS public.delivery_zone_postcode;
DROP TABLE IF EXISTS public.delivery_zone;

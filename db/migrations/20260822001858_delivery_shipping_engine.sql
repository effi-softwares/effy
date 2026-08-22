-- +goose Up
-- 047-delivery-shipping-engine: serviceability, distance rings, a versioned shipping-fee engine, same-day
-- eligibility + per-shop exceptions, a collection schedule, and per-order delivery capture.
--
-- ⚠ REBUILD, deliberately simpler than the withdrawn 021/030/031/032. The governing rule (spec FR-001):
-- serviceability is decided by ONE fact — is the address's postcode in an active delivery_zone — and a
-- served zone can never fail to produce a standard fee. Same-day is a strictly additive offer on top.
--
-- House style (007/009/019/021/027/029/030/031/032): everything operational in `public`; raw SQL; text
-- CHECK enums (no native PG enums, no triggers); an index on every FK; numeric(12,2) money; COMMENT ON
-- everything. Audit reuses admin.audit_log. See specs/047-delivery-shipping-engine/data-model.md.
--
-- ⚠ Shop location is intentionally NOT re-added: the fee is destination-ring based, identical for every
-- shop serving a customer (SC-017 + hidden fulfilment). See plan.md R2.

-- ── The place record (reference data; rows loaded by cmd/load-localities, never by migration) ──────────

CREATE TABLE public.locality (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name          text NOT NULL,
    state         text NOT NULL CHECK (state IN ('ACT','NSW','NT','QLD','SA','TAS','VIC','WA')),
    postcode      text NOT NULL CHECK (postcode ~ '^[0-9]{4}$'),
    latitude      numeric(9, 6),
    longitude     numeric(9, 6),
    address_count int NOT NULL DEFAULT 0 CHECK (address_count >= 0),
    CONSTRAINT locality_triple_uq UNIQUE (name, state, postcode)
);
COMMENT ON TABLE  public.locality IS 'Every Australian locality (047). G-NAF-derived, loaded by cmd/load-localities. The natural key is the (name,state,postcode) triple: a locality spans postcodes, a postcode covers localities.';
COMMENT ON COLUMN public.locality.latitude IS 'Nullable — the G-NAF locality point is not universal; a null simply does not contribute to a zone ring suggestion.';
COMMENT ON COLUMN public.locality.address_count IS 'Addresses at this locality; used to pick a postcode primary locality for display.';
CREATE INDEX locality_postcode_idx    ON public.locality (postcode);
CREATE INDEX locality_name_prefix_idx ON public.locality (lower(name) text_pattern_ops);

-- ── Distance rings (ordered tiers; standing config priced by the plan) ─────────────────────────────────

CREATE TABLE public.delivery_ring (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code             text NOT NULL UNIQUE,
    name             text NOT NULL,
    ordinal          int  NOT NULL UNIQUE CHECK (ordinal > 0),
    suggest_upper_km numeric(7, 2) CHECK (suggest_upper_km > 0),
    status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    updated_by       text NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE  public.delivery_ring IS 'A distance tier (047). Zones belong to a ring; the ring is what the fee distance factor is priced on. ordinal is distance order (1 = nearest hub). suggest_upper_km is used ONLY to auto-suggest a zone ring; the quote never reads it.';
COMMENT ON COLUMN public.delivery_ring.suggest_upper_km IS 'NULL on exactly one ring — the furthest, open-ended tier.';
-- Exactly one open-ended (furthest) ring.
CREATE UNIQUE INDEX delivery_ring_open_top_uq ON public.delivery_ring ((suggest_upper_km IS NULL))
    WHERE suggest_upper_km IS NULL;

-- ── Zones & serviceability ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.delivery_zone (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code               text NOT NULL UNIQUE,
    name               text NOT NULL,
    ring_id            uuid NOT NULL REFERENCES public.delivery_ring (id) ON DELETE RESTRICT,
    ring_is_overridden boolean NOT NULL DEFAULT false,
    suggested_ring_id  uuid REFERENCES public.delivery_ring (id) ON DELETE SET NULL,
    hub_distance_km    numeric(7, 2),
    sameday_eligible   boolean NOT NULL DEFAULT false,
    status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    updated_by         text NOT NULL,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE  public.delivery_zone IS 'A served area (047), composed of postcodes chosen by place. Serviceability is decided solely by whether a postcode belongs to an ACTIVE zone. Never shown to shoppers by name.';
COMMENT ON COLUMN public.delivery_zone.ring_is_overridden IS 'true = an admin overrode the auto-suggested ring (FR-016).';
COMMENT ON COLUMN public.delivery_zone.hub_distance_km IS 'Computed representative straight-line distance from the hub. INTERNAL ONLY — never in a customer DTO (FR-018).';
COMMENT ON COLUMN public.delivery_zone.sameday_eligible IS 'Platform baseline: when true, every shop offers same-day here by default (FR-037), subject to per-shop exceptions.';
COMMENT ON COLUMN public.delivery_zone.status IS 'disabled = configured but not served (distinct from a postcode in no zone at all — FR-005).';
CREATE INDEX delivery_zone_ring_idx ON public.delivery_zone (ring_id);

CREATE TABLE public.delivery_zone_postcode (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_id    uuid NOT NULL REFERENCES public.delivery_zone (id) ON DELETE CASCADE,
    postcode   text NOT NULL UNIQUE CHECK (postcode ~ '^[0-9]{4}$'),
    created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE  public.delivery_zone_postcode IS 'Postcode -> zone (047). ⚠ UNIQUE(postcode) is the serviceability guarantee: a postcode belongs to AT MOST one zone; a postcode in no row = not served (FR-001/002/009). No FK to locality — a PO-box postcode may have no locality row.';
CREATE INDEX delivery_zone_postcode_zone_idx ON public.delivery_zone_postcode (zone_id);

-- ── Hub, buffer & the collection schedule (same-day timing) ────────────────────────────────────────────

CREATE TABLE public.delivery_settings (
    id                      int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    hub_latitude            numeric(9, 6) NOT NULL,
    hub_longitude           numeric(9, 6) NOT NULL,
    sameday_prep_buffer_min int NOT NULL DEFAULT 60 CHECK (sameday_prep_buffer_min >= 0),
    updated_by              text NOT NULL,
    updated_at              timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE  public.delivery_settings IS 'Singleton (id=1) delivery configuration (047): the operating hub (ring-suggestion origin) and the same-day prep/pick buffer. Hub coordinates are operational config, never shown to shoppers.';

CREATE TABLE public.delivery_collection_run (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_time   time NOT NULL,
    label      text,
    status     text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    updated_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT delivery_collection_run_time_uq UNIQUE (run_time)
);
COMMENT ON TABLE  public.delivery_collection_run IS 'A daily driver collection run (047). One or many; the same-day cutoff is DERIVED (never stored): same-day is offered iff an active run today still satisfies now <= run_time - prep_buffer.';
COMMENT ON COLUMN public.delivery_collection_run.run_time IS '⚠ Wall-clock in Australia/Melbourne, never UTC/device (FR-041). time carries no zone by design — it describes Effy''s working day.';

-- ── Fee plans — many, exactly one active (the pricing SSOT) ────────────────────────────────────────────

CREATE TABLE public.delivery_fee_plan (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text NOT NULL UNIQUE,
    is_active       boolean NOT NULL DEFAULT false,
    rounding_step   numeric(12, 2) NOT NULL DEFAULT 0.50 CHECK (rounding_step > 0),
    floor_amount    numeric(12, 2) NOT NULL CHECK (floor_amount >= 0),
    cap_amount      numeric(12, 2) NOT NULL CHECK (cap_amount > 0),
    same_day_factor numeric(6, 3)  NOT NULL CHECK (same_day_factor > 0),
    standard_factor numeric(6, 3)  NOT NULL CHECK (standard_factor > 0),
    created_by      text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    activated_by    text,
    activated_at    timestamptz,
    -- ⚠ a >= b (FR-022); every fee lands on the step grid incl. a capped/floored one (SC-005); cap >= floor.
    CONSTRAINT delivery_fee_plan_factor_ck    CHECK (same_day_factor >= standard_factor),
    CONSTRAINT delivery_fee_plan_cap_step_ck   CHECK (mod(cap_amount,   rounding_step) = 0),
    CONSTRAINT delivery_fee_plan_floor_step_ck CHECK (mod(floor_amount, rounding_step) = 0),
    CONSTRAINT delivery_fee_plan_cap_floor_ck  CHECK (cap_amount >= floor_amount)
);
COMMENT ON TABLE  public.delivery_fee_plan IS 'A complete, named shipping-fee rule set (047). Many exist; EXACTLY ONE is active. Fee = clamp(roundUpToStep(factor*(ring_price+weight_add), step), floor, cap). Owned by the platform; invisible to shops.';
-- ⚠ EXACTLY ONE active plan (FR-048), enforced in the database, not a service.
CREATE UNIQUE INDEX delivery_fee_plan_one_active_uq ON public.delivery_fee_plan (is_active)
    WHERE is_active = true;

CREATE TABLE public.delivery_ring_price (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id      uuid NOT NULL REFERENCES public.delivery_fee_plan (id) ON DELETE CASCADE,
    ring_id      uuid NOT NULL REFERENCES public.delivery_ring (id) ON DELETE RESTRICT,
    price_amount numeric(12, 2) NOT NULL CHECK (price_amount >= 0),
    CONSTRAINT delivery_ring_price_uq UNIQUE (plan_id, ring_id)
);
COMMENT ON TABLE public.delivery_ring_price IS 'The distance slab value per ring, within a plan (047). Activation refuses a plan where an active ring has no price (FR-051).';
CREATE INDEX delivery_ring_price_plan_idx ON public.delivery_ring_price (plan_id);

CREATE TABLE public.delivery_weight_band (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id     uuid NOT NULL REFERENCES public.delivery_fee_plan (id) ON DELETE CASCADE,
    upper_grams int NOT NULL CHECK (upper_grams > 0),
    add_amount  numeric(12, 2) NOT NULL CHECK (add_amount >= 0),
    CONSTRAINT delivery_weight_band_uq UNIQUE (plan_id, upper_grams)
);
COMMENT ON TABLE public.delivery_weight_band IS 'Weight slabs within a plan (047). Upper-bound bands matched by smallest upper_grams >= package grams; a package heavier than the top band takes the TOP band (a pure-engine rule — the schema cannot express "and beyond"). Storing only the upper bound makes a gap unrepresentable (FR-028).';
CREATE INDEX delivery_weight_band_plan_idx ON public.delivery_weight_band (plan_id, upper_grams);

-- ── Same-day per-shop exceptions (back-office only; no propose/approve workflow) ────────────────────────

CREATE TABLE public.shop_sameday_exception (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id    uuid NOT NULL REFERENCES public.shop (id) ON DELETE CASCADE,
    zone_id    uuid NOT NULL REFERENCES public.delivery_zone (id) ON DELETE CASCADE,
    mode       text NOT NULL CHECK (mode IN ('on', 'off')),
    updated_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT shop_sameday_exception_uq UNIQUE (shop_id, zone_id)
);
COMMENT ON TABLE  public.shop_sameday_exception IS 'Per-(shop,zone) same-day override (047), set ONLY by back-office. Effective rule: exception ? mode=''on'' : zone.sameday_eligible. No shop-facing write path (FR-045). The whole 032 propose/approve lifecycle is deliberately gone.';
CREATE INDEX shop_sameday_exception_shop_idx ON public.shop_sameday_exception (shop_id);
CREATE INDEX shop_sameday_exception_zone_idx ON public.shop_sameday_exception (zone_id);

-- ── Product weight (measured vs assumed) ───────────────────────────────────────────────────────────────

ALTER TABLE public.product
    ADD COLUMN weight_grams      int     NOT NULL DEFAULT 500 CHECK (weight_grams > 0),
    ADD COLUMN weight_is_assumed boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN public.product.weight_grams IS 'Logistics weight (047), drives the fee weight slab. ⚠ >0 not >=0 (a zero weight is free-delivery-by-arithmetic). Default 500 + assumed=true is the honest backfill.';
COMMENT ON COLUMN public.product.weight_is_assumed IS 'true = nobody has weighed it (assumed default); false = a real measured weight (FR-055). Distinguishes "we weighed it" from "nobody has said".';

-- Backfill measured weights from the existing catalogue net_weight attribute (016 EAV).
-- ⚠ Assert the row count in quickstart §7-1: neither 0 nor ALL products should become measured, or the
-- attribute key/column is wrong and this ran clean while updating nothing.
UPDATE public.product p
   SET weight_grams = v.value_number::int, weight_is_assumed = false
  FROM public.product_attribute_value v
  JOIN public.attribute_definition d ON d.id = v.attribute_definition_id
 WHERE v.product_id = p.id AND d.key = 'net_weight' AND v.value_number > 0;

-- ── Per-order delivery capture (re-added; the withdrawal dropped these) ─────────────────────────────────

ALTER TABLE public."order"
    ADD COLUMN delivery_fee_amount       numeric(12, 2) CHECK (delivery_fee_amount >= 0),
    ADD COLUMN delivery_quote            jsonb,
    ADD COLUMN delivery_quote_expires_at timestamptz;
COMMENT ON COLUMN public."order".delivery_fee_amount IS 'SUM of the per-package captured delivery fees (047). NULL for pre-047 orders (delivery was withdrawn, then reintroduced).';
COMMENT ON COLUMN public."order".delivery_quote IS 'The captured per-package quote the shopper was shown (047). Intent validates the selection against it and uses ITS fees — the client never sends a fee (FR-036).';
COMMENT ON COLUMN public."order".delivery_quote_expires_at IS 'Captured-quote validity. Intent honours the captured fees while now() < this; on expiry the shopper re-quotes.';

CREATE TABLE public.order_package_delivery (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id            uuid NOT NULL REFERENCES public."order" (id) ON DELETE CASCADE,
    shop_id             uuid NOT NULL REFERENCES public.shop (id) ON DELETE RESTRICT,
    method              text NOT NULL CHECK (method IN ('same_day', 'standard')),
    delivery_fee_amount numeric(12, 2) NOT NULL CHECK (delivery_fee_amount >= 0),
    promised_from       date,
    promised_to         date,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT order_package_delivery_uq UNIQUE (order_id, shop_id)
);
COMMENT ON TABLE  public.order_package_delivery IS 'The captured per-package delivery quote (047). Written at intent time (delete+reinsert, like order_item); consumed into shop_fulfillment inside the 019 finalize transaction. order.delivery_fee_amount = SUM of these.';
CREATE INDEX order_package_delivery_order_idx ON public.order_package_delivery (order_id);
CREATE INDEX order_package_delivery_shop_idx  ON public.order_package_delivery (shop_id);

ALTER TABLE public.shop_fulfillment
    ADD COLUMN delivery_method     text CHECK (delivery_method IN ('same_day', 'standard')),
    ADD COLUMN delivery_fee_amount numeric(12, 2) CHECK (delivery_fee_amount >= 0),
    ADD COLUMN promised_ready_at   timestamptz;
COMMENT ON COLUMN public.shop_fulfillment.delivery_method IS 'The per-portion method chosen (047). NULL for pre-047 portions.';
COMMENT ON COLUMN public.shop_fulfillment.delivery_fee_amount IS 'The per-package delivery fee (047). ⚠ NEVER shown to the shop; recorded for the customer receipt and future payout slices.';
COMMENT ON COLUMN public.shop_fulfillment.promised_ready_at IS 'The per-portion ready-by (047). 020 queue ordering reads this when present.';

-- +goose Down
-- ⚠⚠ LOSSY, forward-only platform (003); dev single-step rollback only. This DESTROYS every zone, ring,
-- fee plan, same-day exception, collection run, locality row and per-order delivery capture. A rollback
-- that silently produces an EMPTY delivery configuration is more dangerous than none — reinstate with care.
-- FK-safe order.
ALTER TABLE public.shop_fulfillment
    DROP COLUMN IF EXISTS promised_ready_at,
    DROP COLUMN IF EXISTS delivery_fee_amount,
    DROP COLUMN IF EXISTS delivery_method;
DROP TABLE IF EXISTS public.order_package_delivery;
ALTER TABLE public."order"
    DROP COLUMN IF EXISTS delivery_quote_expires_at,
    DROP COLUMN IF EXISTS delivery_quote,
    DROP COLUMN IF EXISTS delivery_fee_amount;
ALTER TABLE public.product
    DROP COLUMN IF EXISTS weight_is_assumed,
    DROP COLUMN IF EXISTS weight_grams;
DROP TABLE IF EXISTS public.shop_sameday_exception;
DROP TABLE IF EXISTS public.delivery_weight_band;
DROP TABLE IF EXISTS public.delivery_ring_price;
DROP TABLE IF EXISTS public.delivery_fee_plan;
DROP TABLE IF EXISTS public.delivery_collection_run;
DROP TABLE IF EXISTS public.delivery_settings;
DROP TABLE IF EXISTS public.delivery_zone_postcode;
DROP TABLE IF EXISTS public.delivery_zone;
DROP TABLE IF EXISTS public.delivery_ring;
DROP TABLE IF EXISTS public.locality;

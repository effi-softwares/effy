-- +goose Up
-- 094 — Promotions rebuilt (stage A). A promotion is no longer "a code": it is an offer of one of four
-- kinds (cart, item, buy X get Y, delivery), applied automatically or by a code, limited by audience,
-- spend, quantity, delivery type, dates, days and hours, capped by uses and a budget, and shown in
-- display groups the customer clients ask for by key.
--
-- ⚠ THE OLD MODEL IS COPIED, NOT ALTERED. `promo_code` and `promo_redemption` stay exactly as they are,
-- written by nothing from the deploy of this feature on, so a code reading them during the deploy still
-- works and every old order's foreign key still resolves. A later migration (stage C) removes them once
-- nothing reads them.
--
-- ⚠ USES ARE HELD AT THE PAYMENT INTENT AND CONFIRMED AT PAYMENT (research R5). The 027 model counted
-- only paid orders, so two shoppers paying at the same moment could both take the last use. Counting
-- held + confirmed rows under a lock on the promotion row is what makes the caps and the budget hold.

-- ── promotion ────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.promotion (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                  text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
    kind                  text NOT NULL CHECK (kind IN ('cart', 'item', 'bxgy', 'delivery')),
    trigger               text NOT NULL CHECK (trigger IN ('automatic', 'code')),
    value_type            text NOT NULL CHECK (value_type IN ('percent', 'amount', 'free')),
    percent_off           numeric(5, 2) NULL CHECK (percent_off > 0 AND percent_off <= 100),
    amount_off            numeric(12, 2) NULL CHECK (amount_off > 0),
    max_discount_amount   numeric(12, 2) NULL CHECK (max_discount_amount > 0),
    bxgy_buy_qty          int NULL CHECK (bxgy_buy_qty > 0),
    bxgy_get_qty          int NULL CHECK (bxgy_get_qty > 0),
    bxgy_max_per_order    int NULL CHECK (bxgy_max_per_order > 0),
    applies_to            text NOT NULL CHECK (applies_to IN ('cart', 'products', 'categories', 'brands')),
    delivery_types        text[] NOT NULL DEFAULT ARRAY['effy', 'courier']
        CHECK (cardinality(delivery_types) > 0 AND delivery_types <@ ARRAY['effy', 'courier']),
    audience              text NOT NULL DEFAULT 'everyone'
        CHECK (audience IN ('everyone', 'first_order', 'new_customers', 'chosen')),
    min_subtotal_amount   numeric(12, 2) NOT NULL DEFAULT 0 CHECK (min_subtotal_amount >= 0),
    min_quantity          int NULL CHECK (min_quantity > 0),
    starts_at             timestamptz NULL,
    ends_at               timestamptz NULL,
    days_of_week          int[] NULL CHECK (days_of_week IS NULL OR (cardinality(days_of_week) > 0 AND days_of_week <@ ARRAY[1,2,3,4,5,6,7])),
    time_from             time NULL,
    time_to               time NULL,
    max_uses              int NULL CHECK (max_uses > 0),
    max_uses_per_customer int NULL CHECK (max_uses_per_customer > 0),
    budget_amount         numeric(12, 2) NULL CHECK (budget_amount > 0),
    combinable            boolean NOT NULL DEFAULT false,
    published_at          timestamptz NULL,
    paused                boolean NOT NULL DEFAULT false,
    ended_at              timestamptz NULL,
    archived_at           timestamptz NULL,
    headline              text NULL CHECK (headline IS NULL OR length(btrim(headline)) BETWEEN 1 AND 80),
    supporting_line       text NULL CHECK (supporting_line IS NULL OR length(supporting_line) <= 160),
    label                 text NULL CHECK (label IS NULL OR length(label) <= 24),
    legacy_promo_code_id  uuid NULL UNIQUE REFERENCES public.promo_code (id) ON DELETE RESTRICT,
    created_by            text NOT NULL,
    updated_by            text NULL,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT promotion_value_chk CHECK (
        (value_type = 'percent' AND percent_off IS NOT NULL AND amount_off IS NULL) OR
        (value_type = 'amount'  AND amount_off IS NOT NULL AND percent_off IS NULL AND max_discount_amount IS NULL) OR
        (value_type = 'free'    AND percent_off IS NULL AND amount_off IS NULL AND max_discount_amount IS NULL
                                AND kind IN ('delivery', 'bxgy'))
    ),
    CONSTRAINT promotion_bxgy_chk CHECK (
        (kind = 'bxgy') = (bxgy_buy_qty IS NOT NULL AND bxgy_get_qty IS NOT NULL)
        AND (kind = 'bxgy' OR bxgy_max_per_order IS NULL)
    ),
    CONSTRAINT promotion_applies_to_chk CHECK (
        (kind IN ('cart', 'delivery')) = (applies_to = 'cart')
    ),
    CONSTRAINT promotion_window_chk CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at),
    CONSTRAINT promotion_hours_chk CHECK (
        (time_from IS NULL) = (time_to IS NULL) AND (time_from IS NULL OR time_to > time_from)
    )
);
COMMENT ON TABLE public.promotion IS 'An offer (094). Written by back-office (admin) only; read by the one candidate query in @effy/edge-shared/promotions. Its state is never stored — read it through public.promotion_state().';
COMMENT ON COLUMN public.promotion.name IS 'Internal, staff-facing. Shoppers read headline / supporting_line / label.';
COMMENT ON COLUMN public.promotion.kind IS 'cart (money off eligible goods) | item (per qualifying unit) | bxgy (buy X get Y) | delivery (the order''s one delivery fee).';
COMMENT ON COLUMN public.promotion.trigger IS 'automatic (applies when the cart qualifies) | code (only when a shopper enters one of its promotion_code rows).';
COMMENT ON COLUMN public.promotion.value_type IS 'percent | amount | free. free only for delivery (free delivery) and bxgy (the "get" items are free).';
COMMENT ON COLUMN public.promotion.max_discount_amount IS 'A cap on a percent discount for the whole promotion on one order ("20% off, up to $15").';
COMMENT ON COLUMN public.promotion.applies_to IS 'cart for cart and delivery; products / categories / brands for item and bxgy, with the chosen ones in promotion_target.';
COMMENT ON COLUMN public.promotion.delivery_types IS 'Which deliveries it is for: effy, courier or both (order.delivery_type).';
COMMENT ON COLUMN public.promotion.audience IS 'everyone | first_order (no paid order yet) | new_customers (account created on or after the start) | chosen (promotion_customer).';
COMMENT ON COLUMN public.promotion.min_subtotal_amount IS 'Judged on the qualifying goods after the reductions worked out before this one (R3). 0 = no minimum.';
COMMENT ON COLUMN public.promotion.days_of_week IS 'ISO days 1 (Mon) – 7 (Sun) in Melbourne; NULL = every day. Not part of state: a lunchtime promotion is Active at 3 pm, it simply does not apply then.';
COMMENT ON COLUMN public.promotion.time_from IS 'Melbourne local time of day; with time_to, the hours it applies.';
COMMENT ON COLUMN public.promotion.max_uses IS 'Total uses, counted from promotion_use rows held (unexpired) or confirmed — never a counter column.';
COMMENT ON COLUMN public.promotion.budget_amount IS 'Total discount (goods + delivery) it may give, counted like max_uses. A use is held only if its whole discount fits (FR-014).';
COMMENT ON COLUMN public.promotion.published_at IS 'NULL = draft: never shown, never applied.';
COMMENT ON COLUMN public.promotion.ended_at IS '"End now". The effective end is the earlier of ends_at and ended_at.';
COMMENT ON COLUMN public.promotion.legacy_promo_code_id IS 'The 027 promo_code this promotion was copied from. Stage C drops it with the old table.';

CREATE INDEX promotion_live_idx ON public.promotion (trigger) WHERE published_at IS NOT NULL AND archived_at IS NULL;

-- ── codes ────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.promotion_code (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    promotion_id uuid NOT NULL REFERENCES public.promotion (id) ON DELETE CASCADE,
    code         text NOT NULL CHECK (length(btrim(code)) BETWEEN 1 AND 64),
    single_use   boolean NOT NULL DEFAULT false,
    batch_id     uuid NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT promotion_code_batch_chk CHECK (single_use = (batch_id IS NOT NULL))
);
COMMENT ON TABLE public.promotion_code IS 'A code that triggers a code promotion (094): the one shared code, or one of a batch of single-use codes. Never deleted once used (promotion_use references it).';
COMMENT ON COLUMN public.promotion_code.code IS 'Unique case-insensitively across EVERY code ever issued (promotion_code_code_uq), so an archived promotion''s code can never come back meaning something else.';
CREATE UNIQUE INDEX promotion_code_code_uq ON public.promotion_code (upper(code));
CREATE INDEX promotion_code_promotion_idx ON public.promotion_code (promotion_id);
CREATE UNIQUE INDEX promotion_code_one_shared_uq ON public.promotion_code (promotion_id) WHERE NOT single_use;

-- ── what an item / bxgy promotion applies to ─────────────────────────────────────────────────────
CREATE TABLE public.promotion_target (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    promotion_id uuid NOT NULL REFERENCES public.promotion (id) ON DELETE CASCADE,
    target_type  text NOT NULL CHECK (target_type IN ('product', 'category', 'brand')),
    product_id   uuid NULL REFERENCES public.product (id) ON DELETE RESTRICT,
    category_id  uuid NULL REFERENCES public.category (id) ON DELETE RESTRICT,
    brand        text NULL CHECK (brand IS NULL OR length(btrim(brand)) BETWEEN 1 AND 120),
    CONSTRAINT promotion_target_one_chk CHECK (
        (target_type = 'product'  AND product_id IS NOT NULL AND category_id IS NULL AND brand IS NULL) OR
        (target_type = 'category' AND category_id IS NOT NULL AND product_id IS NULL AND brand IS NULL) OR
        (target_type = 'brand'    AND brand IS NOT NULL AND product_id IS NULL AND category_id IS NULL)
    )
);
COMMENT ON TABLE public.promotion_target IS 'The products, categories (and their sub-categories) or brands an item / bxgy promotion covers (094). Brand is compared as lower(btrim(product.brand)).';
CREATE INDEX promotion_target_promotion_idx ON public.promotion_target (promotion_id);
CREATE UNIQUE INDEX promotion_target_product_uq  ON public.promotion_target (promotion_id, product_id)  WHERE product_id IS NOT NULL;
CREATE UNIQUE INDEX promotion_target_category_uq ON public.promotion_target (promotion_id, category_id) WHERE category_id IS NOT NULL;
CREATE UNIQUE INDEX promotion_target_brand_uq    ON public.promotion_target (promotion_id, lower(btrim(brand))) WHERE brand IS NOT NULL;

CREATE TABLE public.promotion_customer (
    promotion_id uuid NOT NULL REFERENCES public.promotion (id) ON DELETE CASCADE,
    customer_id  uuid NOT NULL REFERENCES public.customer (id) ON DELETE CASCADE,
    added_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (promotion_id, customer_id)
);
COMMENT ON TABLE public.promotion_customer IS 'The customers a promotion with audience = chosen is limited to (094).';
CREATE INDEX promotion_customer_customer_idx ON public.promotion_customer (customer_id);

-- ── uses ─────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.promotion_use (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    promotion_id    uuid NOT NULL REFERENCES public.promotion (id) ON DELETE RESTRICT,
    code_id         uuid NULL REFERENCES public.promotion_code (id) ON DELETE RESTRICT,
    single_use      boolean NOT NULL DEFAULT false,
    customer_id     uuid NOT NULL REFERENCES public.customer (id) ON DELETE RESTRICT,
    order_id        uuid NOT NULL REFERENCES public."order" (id) ON DELETE RESTRICT,
    goods_amount    numeric(12, 2) NOT NULL DEFAULT 0 CHECK (goods_amount >= 0),
    delivery_amount numeric(12, 2) NOT NULL DEFAULT 0 CHECK (delivery_amount >= 0),
    status          text NOT NULL CHECK (status IN ('held', 'confirmed', 'released')),
    hold_expires_at timestamptz NULL,
    release_reason  text NULL CHECK (release_reason IN ('payment_failed', 'expired', 'superseded', 'cancelled')),
    created_at      timestamptz NOT NULL DEFAULT now(),
    confirmed_at    timestamptz NULL,
    released_at     timestamptz NULL,
    CONSTRAINT promotion_use_once_per_order UNIQUE (order_id, promotion_id),
    CONSTRAINT promotion_use_status_chk CHECK (
        (status = 'held' AND hold_expires_at IS NOT NULL AND released_at IS NULL) OR
        (status = 'confirmed' AND confirmed_at IS NOT NULL AND released_at IS NULL) OR
        (status = 'released' AND released_at IS NOT NULL AND release_reason IS NOT NULL)
    )
);
COMMENT ON TABLE public.promotion_use IS 'One order''s use of one promotion (094). held at the payment intent, confirmed at payment, released on payment failure, expiry, a newer intent or cancellation before fulfilment. The ONLY source of every cap and the budget. Written only by @effy/edge-shared/promotions/uses.ts.';
COMMENT ON COLUMN public.promotion_use.single_use IS 'Copied from the code so the partial unique index below can see it (an index cannot join).';
COMMENT ON COLUMN public.promotion_use.hold_expires_at IS 'A held use counts only until this instant. A late payment still confirms it: the shopper was charged the discounted price.';
CREATE UNIQUE INDEX promotion_use_code_once ON public.promotion_use (code_id)
    WHERE single_use AND status IN ('held', 'confirmed');
CREATE INDEX promotion_use_promotion_idx ON public.promotion_use (promotion_id, status);
CREATE INDEX promotion_use_customer_idx ON public.promotion_use (promotion_id, customer_id, status);
CREATE INDEX promotion_use_order_idx ON public.promotion_use (order_id);

-- ── display groups ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.promotion_group (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key         text NOT NULL UNIQUE CHECK (key ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(key) <= 40),
    name        text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
    description text NULL CHECK (description IS NULL OR length(description) <= 240),
    sort        int NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.promotion_group IS 'A place promotions are shown (094). The customer website and app ask for a group by key; the key never changes (the admin service never writes it after creation).';

CREATE TABLE public.promotion_group_member (
    group_id     uuid NOT NULL REFERENCES public.promotion_group (id) ON DELETE CASCADE,
    promotion_id uuid NOT NULL REFERENCES public.promotion (id) ON DELETE CASCADE,
    position     int NOT NULL CHECK (position >= 0),
    PRIMARY KEY (group_id, promotion_id)
);
COMMENT ON TABLE public.promotion_group_member IS 'A promotion''s place in a group, in position order. A promotion may be in many groups. Removing a group never removes a promotion.';
CREATE INDEX promotion_group_member_promotion_idx ON public.promotion_group_member (promotion_id);

-- ── what an order keeps ──────────────────────────────────────────────────────────────────────────
CREATE TABLE public.order_promotion (
    order_id        uuid NOT NULL REFERENCES public."order" (id) ON DELETE RESTRICT,
    promotion_id    uuid NOT NULL REFERENCES public.promotion (id) ON DELETE RESTRICT,
    code_id         uuid NULL REFERENCES public.promotion_code (id) ON DELETE RESTRICT,
    code_text       text NULL,
    name            text NOT NULL,
    headline        text NULL,
    kind            text NOT NULL CHECK (kind IN ('cart', 'item', 'bxgy', 'delivery')),
    goods_amount    numeric(12, 2) NOT NULL DEFAULT 0 CHECK (goods_amount >= 0),
    delivery_amount numeric(12, 2) NOT NULL DEFAULT 0 CHECK (delivery_amount >= 0),
    PRIMARY KEY (order_id, promotion_id)
);
COMMENT ON TABLE public.order_promotion IS 'Each promotion applied to an order, as it was sold (094 FR-038): snapshots of its name, words, code and amounts. Receipts, refunds and reports read this — they never re-derive a discount. A shop never reads it.';

ALTER TABLE public.order_item
    ADD COLUMN discount_amount numeric(12, 2) NOT NULL DEFAULT 0
        CHECK (discount_amount >= 0 AND discount_amount <= unit_price_amount * quantity);
COMMENT ON COLUMN public.order_item.discount_amount IS 'What promotions took off this line, in cents exactly as allocated at sale (094 R3). A refund of the line returns its paid share: unit × quantity − this (R8).';

ALTER TABLE public."order"
    ADD COLUMN delivery_discount_amount numeric(12, 2) NOT NULL DEFAULT 0 CHECK (delivery_discount_amount >= 0);
COMMENT ON COLUMN public."order".delivery_discount_amount IS 'What delivery promotions took off the delivery fee (094). discount_amount stays the GOODS discount total, so its existing readers keep working.';

ALTER TABLE public.cart
    ADD COLUMN promotion_code_id uuid NULL REFERENCES public.promotion_code (id) ON DELETE SET NULL;
COMMENT ON COLUMN public.cart.promotion_code_id IS 'The code the shopper entered (094). Replaces promo_code_id, which stage C drops.';

-- ── state: one definition ────────────────────────────────────────────────────────────────────────
-- +goose StatementBegin
CREATE FUNCTION public.promotion_state(p_id uuid, p_at timestamptz DEFAULT now())
RETURNS text
LANGUAGE sql STABLE AS $$
    SELECT CASE
        WHEN p.archived_at IS NOT NULL THEN 'archived'
        WHEN p.published_at IS NULL THEN 'draft'
        WHEN (p.ended_at IS NOT NULL AND p.ended_at <= p_at) OR (p.ends_at IS NOT NULL AND p.ends_at <= p_at) THEN 'ended'
        WHEN p.paused THEN 'paused'
        WHEN p.starts_at IS NOT NULL AND p.starts_at > p_at THEN 'scheduled'
        WHEN p.max_uses IS NOT NULL AND u.uses >= p.max_uses THEN 'used_up'
        WHEN p.budget_amount IS NOT NULL AND u.given >= p.budget_amount THEN 'out_of_budget'
        ELSE 'active'
    END
    FROM public.promotion p
    CROSS JOIN LATERAL (
        SELECT count(*) AS uses, coalesce(sum(x.goods_amount + x.delivery_amount), 0) AS given
          FROM public.promotion_use x
         WHERE x.promotion_id = p.id
           AND (x.status = 'confirmed' OR (x.status = 'held' AND x.hold_expires_at > p_at))
    ) u
    WHERE p.id = p_id
$$;
-- +goose StatementEnd
COMMENT ON FUNCTION public.promotion_state(uuid, timestamptz) IS 'THE state of a promotion (094 R9): archived, draft, ended, paused, scheduled, used_up, out_of_budget or active. Never stored. Every reader — admin lists, the storefront, the candidate query, the preview — calls this.';

-- ── once used, what it gives and who it is for are fixed (FR-020) ────────────────────────────────
-- +goose StatementBegin
CREATE FUNCTION public.promotion_is_used(p_id uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM public.promotion_use WHERE promotion_id = p_id AND status IN ('held', 'confirmed'))
$$;
-- +goose StatementEnd

-- ⚠ FR-020 (fixed once used), FR-022 (a group's key never changes) and FR-024 (a headline to be shown)
-- are enforced by the admin service INSIDE the writing transaction, under the promotion row lock the
-- payment intent also takes — not by triggers: the platform's trigger guard forbids a trigger that can
-- abort another service's write.

-- ── the shopper role reads definitions and writes only uses and order records ────────────────────
-- 070's default privileges hand every new table to effy_shopper; checkout (commerce) holds uses and
-- writes order_promotion (replacing it when a pending order is re-priced), and nothing customer-facing
-- may write a promotion's definition. A use is never deleted — it is released.
REVOKE INSERT, UPDATE, DELETE ON public.promotion, public.promotion_code, public.promotion_target,
    public.promotion_customer, public.promotion_group, public.promotion_group_member FROM effy_shopper;
REVOKE DELETE ON public.promotion_use FROM effy_shopper;

-- ── carry over the 027/028/029 model ─────────────────────────────────────────────────────────────
INSERT INTO public.promotion (
    name, kind, trigger, value_type, percent_off, amount_off, applies_to, min_subtotal_amount,
    starts_at, ends_at, max_uses, max_uses_per_customer, combinable, published_at, paused,
    headline, supporting_line, legacy_promo_code_id, created_by, updated_by, created_at, updated_at)
SELECT pc.code, 'cart', 'code',
       CASE pc.kind WHEN 'percentage' THEN 'percent' ELSE 'amount' END,
       pc.percent_off, pc.amount_off, 'cart', pc.minimum_subtotal_amount,
       pc.starts_at, pc.ends_at, pc.max_redemptions, pc.max_per_customer, false, pc.created_at,
       pc.status = 'disabled',
       pc.banner_title, pc.banner_subtitle, pc.id, pc.created_by, pc.updated_by, pc.created_at, pc.updated_at
  FROM public.promo_code pc;

INSERT INTO public.promotion_code (promotion_id, code, single_use, created_at)
SELECT p.id, pc.code, false, pc.created_at
  FROM public.promo_code pc
  JOIN public.promotion p ON p.legacy_promo_code_id = pc.id;

INSERT INTO public.promotion_use (promotion_id, code_id, single_use, customer_id, order_id, goods_amount,
                                  status, created_at, confirmed_at)
SELECT p.id, c.id, false, r.customer_id, r.order_id, r.amount, 'confirmed', r.redeemed_at, r.redeemed_at
  FROM public.promo_redemption r
  JOIN public.promotion p ON p.legacy_promo_code_id = r.promo_code_id
  JOIN public.promotion_code c ON c.promotion_id = p.id AND NOT c.single_use;

UPDATE public.cart ct
   SET promotion_code_id = c.id
  FROM public.promotion p
  JOIN public.promotion_code c ON c.promotion_id = p.id AND NOT c.single_use
 WHERE p.legacy_promo_code_id = ct.promo_code_id;

INSERT INTO public.promotion_group (key, name, description, sort) VALUES
    ('home-hero',    'Home hero',             'The carousel at the top of Home.', 10),
    ('home-side',    'Home side cards',       'The cards beside the Home carousel (website) and under it (app).', 20),
    ('home-between', 'Between Home sections', 'Banners between the rails on Home.', 30),
    ('offers',       'Offers page',           'Everything on the Offers page.', 40),
    ('cart',         'Cart suggestions',      'Offers suggested in the cart.', 50);

-- Advertised codes keep their place: the carousel → Home hero and the Offers page; between sections →
-- Between Home sections. In their old order.
INSERT INTO public.promotion_group_member (group_id, promotion_id, position)
SELECT g.id, p.id, row_number() OVER (PARTITION BY g.id ORDER BY pc.banner_position, pc.created_at) - 1
  FROM public.promo_code pc
  JOIN public.promotion p ON p.legacy_promo_code_id = pc.id
  JOIN public.promotion_group g
    ON (g.key IN ('home-hero', 'offers') AND pc.banner_placement = 'carousel')
    OR (g.key = 'home-between' AND pc.banner_placement = 'inline')
 WHERE pc.is_advertised AND pc.banner_title IS NOT NULL;

-- +goose Down
DROP FUNCTION IF EXISTS public.promotion_is_used(uuid);
DROP FUNCTION IF EXISTS public.promotion_state(uuid, timestamptz);
ALTER TABLE public.cart DROP COLUMN IF EXISTS promotion_code_id;
ALTER TABLE public."order" DROP COLUMN IF EXISTS delivery_discount_amount;
ALTER TABLE public.order_item DROP COLUMN IF EXISTS discount_amount;
DROP TABLE IF EXISTS public.order_promotion;
DROP TABLE IF EXISTS public.promotion_group_member;
DROP TABLE IF EXISTS public.promotion_group;
DROP TABLE IF EXISTS public.promotion_use;
DROP TABLE IF EXISTS public.promotion_customer;
DROP TABLE IF EXISTS public.promotion_target;
DROP TABLE IF EXISTS public.promotion_code;
DROP TABLE IF EXISTS public.promotion;

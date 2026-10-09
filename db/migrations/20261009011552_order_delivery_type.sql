-- +goose Up
-- 079 — every order is delivered one of two ways: by Effy, or by a courier.
--
-- ⚠ ADDITIVE. The services running when this is applied read none of it: the new columns are
-- nullable, and public.coverage_for_postcode keeps answering a one-argument call. Nothing here
-- turns anything on — a courier order can be placed only once the new delivery model is on
-- (public.delivery_model_v2_at), and nothing sets that switch before the cutover.
--
-- ⚠ NO BACKFILL. An order placed before this has no delivery type and is never given one: who
-- delivered it is read through public.package_delivered_by, which gives the answer a backfill
-- would have — without writing a decision nobody made onto a real order.

-- ── 1. The order's delivery type ─────────────────────────────────────────────────────────────────

ALTER TABLE public."order"
    ADD COLUMN delivery_type        text
        CONSTRAINT order_delivery_type_ck CHECK (delivery_type IN ('effy', 'courier')),
    ADD COLUMN delivery_type_reason text
        CONSTRAINT order_delivery_type_reason_ck
            CHECK (delivery_type_reason IN ('in_coverage', 'out_of_coverage', 'no_window', 'staff_change')),
    ADD COLUMN courier_estimate     text,
    -- A type and its reason together, or neither.
    ADD CONSTRAINT order_delivery_type_pair_ck
        CHECK ((delivery_type IS NULL) = (delivery_type_reason IS NULL)),
    -- The estimate exactly when a courier delivers.
    ADD CONSTRAINT order_courier_estimate_ck
        CHECK ((delivery_type IS NOT DISTINCT FROM 'courier') = (courier_estimate IS NOT NULL));
COMMENT ON COLUMN public."order".delivery_type IS 'WHO DELIVERS the order (079): effy | courier. One per order, whatever number of shops fill it. ⚠ NULL = placed before 079 and never backfilled — read who delivers a package through public.package_delivered_by, never from this column alone. Written at the payment-intent call (the customer may change address between attempts) and fixed at payment; after that only @effy/edge-shared/delivery recordDeliveryType changes it.';
COMMENT ON COLUMN public."order".delivery_type_reason IS 'Why the order has its delivery type (079): in_coverage (address on Effy''s list) | out_of_coverage (not on it; a courier reaches it) | no_window (on the list, but no Effy window was available and the business allows courier instead) | staff_change (changed by back-office after payment).';
COMMENT ON COLUMN public."order".courier_estimate IS 'The courier timeframe AS SOLD (079), e.g. "2–4 business days" — a copy of delivery_settings.courier_estimate_text at the payment-intent call. ⚠ An estimate, never a promise. Changing the setting never changes this.';

CREATE INDEX order_delivery_type_idx ON public."order" (delivery_type, placed_at DESC)
    WHERE delivery_type IS NOT NULL;

-- ── 2. Its history ───────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.order_delivery_type_change (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id   uuid NOT NULL REFERENCES public."order"(id) ON DELETE CASCADE,
    from_type  text CHECK (from_type IN ('effy', 'courier')),
    to_type    text NOT NULL CHECK (to_type IN ('effy', 'courier')),
    reason     text NOT NULL CHECK (reason IN ('in_coverage', 'out_of_coverage', 'no_window', 'staff_change')),
    actor_kind text NOT NULL CHECK (actor_kind IN ('checkout', 'staff')),
    actor_sub  text,
    note       text CHECK (note IS NULL OR length(note) <= 500),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT order_delivery_type_change_moves_ck CHECK (from_type IS DISTINCT FROM to_type),
    CONSTRAINT order_delivery_type_change_actor_ck CHECK ((actor_kind = 'staff') = (actor_sub IS NOT NULL))
);
-- One first entry per order: what makes the payment-time insert safe to repeat.
CREATE UNIQUE INDEX order_delivery_type_change_first_uq ON public.order_delivery_type_change (order_id)
    WHERE from_type IS NULL;
CREATE INDEX order_delivery_type_change_order_idx ON public.order_delivery_type_change (order_id, created_at);
COMMENT ON TABLE public.order_delivery_type_change IS 'The history of an order''s delivery type (079). APPEND-ONLY: the first row (from_type NULL, actor checkout) is written when the order is paid; each later row is a change by staff, with who and why. ⚠ ONE WRITER — recordDeliveryType in @effy/edge-shared/delivery (delivery-type.guard.test.ts). An order placed before 079 has no rows: its history is not invented.';
COMMENT ON COLUMN public.order_delivery_type_change.actor_sub IS 'The staff member''s auth subject; NULL when the checkout decided.';

-- The shopper role (070) gets DML on new tables through its default privileges. Checkout and the
-- paid transition run as it and INSERT here; nothing ever rewrites history.
REVOKE UPDATE, DELETE ON public.order_delivery_type_change FROM effy_shopper;

-- ── 3. Courier settings ──────────────────────────────────────────────────────────────────────────

ALTER TABLE public.delivery_settings
    ADD COLUMN courier_estimate_text   text
        CONSTRAINT delivery_settings_courier_estimate_ck CHECK (
            courier_estimate_text = btrim(courier_estimate_text)
            AND length(courier_estimate_text) BETWEEN 3 AND 60
            AND courier_estimate_text !~ '[\n\r]'),
    ADD COLUMN courier_when_no_windows boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.delivery_settings.courier_estimate_text IS 'The courier''s usual timeframe (079), completing "Usually arrives in …" — e.g. "2–4 business days". One for the platform until courier services exist. NULL = not set, and then no courier order can be placed (public.courier_reaches_postcode). ⚠ An estimate a customer is shown, never a promise; a placed order keeps the text it was sold ("order".courier_estimate).';
COMMENT ON COLUMN public.delivery_settings.courier_when_no_windows IS 'When an address on Effy''s list has NO delivery window open on any offered day, may the order be sent by courier instead (079 FR-011)? false by default: the customer is told there are no windows and cannot pay.';

-- ── 4. Can a courier order be placed? ────────────────────────────────────────────────────────────

-- +goose StatementBegin
CREATE FUNCTION public.courier_delivery_state(p_at timestamptz)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    s public.delivery_settings%ROWTYPE;
BEGIN
    SELECT * INTO s FROM public.delivery_settings WHERE id = 1;
    IF NOT COALESCE(s.courier_offered, false) THEN
        RETURN 'courier_off';
    END IF;

    -- Switched on, but nothing can sell it yet: no price, or nothing to tell the customer.
    IF s.courier_estimate_text IS NULL
       OR NOT EXISTS (SELECT 1 FROM public.delivery_fee_plan p WHERE p.kind = 'courier' AND p.is_active) THEN
        RETURN 'courier_not_ready';
    END IF;

    -- Switched on and ready, waiting for the new delivery model: the checkout customers are using
    -- today sells same-day and standard, and has no courier order to sell.
    IF NOT public.delivery_model_v2_at(p_at) THEN
        RETURN 'courier_pending';
    END IF;

    RETURN 'courier_offered';
END
$$;
-- +goose StatementEnd
COMMENT ON FUNCTION public.courier_delivery_state(timestamptz) IS 'Where courier delivery stands at an instant, for the whole platform (079): courier_off | courier_not_ready (on, but no active courier fee table or no estimate text) | courier_pending (on and ready; the new delivery model is not on yet, so no customer is offered it) | courier_offered. ⚠ The one definition; public.courier_reaches_postcode adds the postcode''s own facts to it, and the back-office console shows it.';

-- +goose StatementBegin
CREATE FUNCTION public.courier_reaches_postcode(p_postcode text, p_at timestamptz)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_state text;
BEGIN
    -- A courier cannot be booked to a place the country's place data does not know.
    IF NOT EXISTS (SELECT 1 FROM public.locality l WHERE l.postcode = p_postcode) THEN
        RETURN 'unknown_postcode';
    END IF;

    v_state := public.courier_delivery_state(p_at);
    IF v_state = 'courier_off' THEN
        RETURN v_state;
    END IF;

    IF EXISTS (SELECT 1 FROM public.courier_excluded_postcode x WHERE x.postcode = p_postcode) THEN
        RETURN 'courier_excluded';
    END IF;

    RETURN v_state;
END
$$;
-- +goose StatementEnd
COMMENT ON FUNCTION public.courier_reaches_postcode(text, timestamptz) IS '⚠ THE ONE DEFINITION of "a courier order can be placed to this postcode at this instant" (079 FR-010). Returns courier_offered when it can; otherwise why not, for staff: unknown_postcode | courier_off | courier_excluded | courier_not_ready | courier_pending (see public.courier_delivery_state). ⚠ It never looks at Effy''s list: public.coverage_for_postcode asks it for an unlisted postcode, and the checkout asks it for a listed one that has no window left.';

-- ── 5. The coverage answer, now true only when it can be sold ────────────────────────────────────
-- A second argument (the instant) with a default: every existing one-argument call still resolves.

DROP FUNCTION public.coverage_for_postcode(text);
-- +goose StatementBegin
CREATE FUNCTION public.coverage_for_postcode(p_postcode text, p_at timestamptz DEFAULT now())
RETURNS TABLE (kind text, reason text, distance_km numeric, group_id uuid, group_name text)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_reason text;
BEGIN
    -- On Effy's list: Delivered by Effy. Nothing else is consulted - not the group's status, not a
    -- courier exclusion, not a shop.
    RETURN QUERY
        SELECT 'effy'::text, 'listed'::text, zp.distance_km, z.id, z.name
          FROM public.delivery_zone_postcode zp
          LEFT JOIN public.delivery_zone z ON z.id = zp.zone_id AND z.status = 'active'
         WHERE zp.postcode = p_postcode;
    IF FOUND THEN
        RETURN;
    END IF;

    v_reason := public.courier_reaches_postcode(p_postcode, p_at);
    RETURN QUERY SELECT CASE WHEN v_reason = 'courier_offered' THEN 'courier' ELSE 'none' END,
                        v_reason, NULL::numeric, NULL::uuid, NULL::text;
END
$$;
-- +goose StatementEnd
COMMENT ON FUNCTION public.coverage_for_postcode(text, timestamptz) IS '⚠ THE ONLY PLACE COVERAGE IS DECIDED (076 FR-020). For a postcode at an instant: kind = effy | courier | none, with the reason staff are shown (listed, or public.courier_reaches_postcode''s). Always exactly one row. ⚠ Since 079 "courier" means a courier order CAN BE PLACED there now - the new delivery model is on, courier delivery is on, a courier fee table is active and an estimate is set - so the address book and the checkout cannot disagree, and courier delivery can be armed before the cutover without promising anything. Worked out when asked and NEVER stored against an address (FR-021). It reads no shop table, by design (FR-024).';

-- ── 6. Who takes a package ───────────────────────────────────────────────────────────────────────

-- +goose StatementBegin
CREATE FUNCTION public.package_delivered_by(p_delivery_type text, p_method text, p_slot_id uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT COALESCE(
        p_delivery_type,
        CASE WHEN p_method = 'same_day' OR p_slot_id IS NOT NULL THEN 'effy' ELSE 'courier' END);
$$;
-- +goose StatementEnd
COMMENT ON FUNCTION public.package_delivered_by(text, text, uuid) IS '⚠ THE ONE DEFINITION of who takes a package to the customer (079): effy | courier. The order''s delivery type when it has one; for an order placed before 079, same-day or sold a window = effy, anything else (standard for a carrier, or no method at all) = courier. Carrier handover, "needs handover", the on-time check, the shop''s label and the back-office column all call this - 078''s "a standard package with a window is Effy''s" lives here and nowhere else.';

COMMENT ON COLUMN public.order_package_delivery.method IS 'ROUTING DETAIL since 079, no longer who delivers. same_day = a window today; standard = a later-day Effy window, OR a courier package (no window, no day). ⚠ Who delivers is "order".delivery_type, read through public.package_delivered_by. Customers of an Effy order still read this word ("Same-day delivery" / "Standard delivery").';
COMMENT ON COLUMN public.shop_fulfillment.delivery_method IS 'A copy of order_package_delivery.method (047). ⚠ Since 079 shops are shown public.package_delivered_by ("Effy driver" / "Courier"), never this. NULL for pre-047 portions.';

-- +goose Down
-- Dev-only single-step reversal. ⚠ Refuses rather than strip a delivery type an order was sold.
-- +goose StatementBegin
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public."order" WHERE delivery_type IS NOT NULL) THEN
        RAISE EXCEPTION '079 down: an order carries a delivery type; refusing to drop it';
    END IF;
END
$$;
-- +goose StatementEnd
DROP FUNCTION public.package_delivered_by(text, text, uuid);
DROP FUNCTION public.coverage_for_postcode(text, timestamptz);
DROP FUNCTION public.courier_reaches_postcode(text, timestamptz);
DROP FUNCTION public.courier_delivery_state(timestamptz);
-- +goose StatementBegin
CREATE FUNCTION public.coverage_for_postcode(p_postcode text)
RETURNS TABLE (kind text, reason text, distance_km numeric, group_id uuid, group_name text)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
        SELECT 'effy'::text, 'listed'::text, zp.distance_km, z.id, z.name
          FROM public.delivery_zone_postcode zp
          LEFT JOIN public.delivery_zone z ON z.id = zp.zone_id AND z.status = 'active'
         WHERE zp.postcode = p_postcode;
    IF FOUND THEN
        RETURN;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.locality l WHERE l.postcode = p_postcode) THEN
        RETURN QUERY SELECT 'none'::text, 'unknown_postcode'::text, NULL::numeric, NULL::uuid, NULL::text;
        RETURN;
    END IF;

    IF NOT COALESCE((SELECT s.courier_offered FROM public.delivery_settings s WHERE s.id = 1), false) THEN
        RETURN QUERY SELECT 'none'::text, 'courier_off'::text, NULL::numeric, NULL::uuid, NULL::text;
        RETURN;
    END IF;

    IF EXISTS (SELECT 1 FROM public.courier_excluded_postcode x WHERE x.postcode = p_postcode) THEN
        RETURN QUERY SELECT 'none'::text, 'courier_excluded'::text, NULL::numeric, NULL::uuid, NULL::text;
        RETURN;
    END IF;

    RETURN QUERY SELECT 'courier'::text, 'courier_offered'::text, NULL::numeric, NULL::uuid, NULL::text;
END
$$;
-- +goose StatementEnd
ALTER TABLE public.delivery_settings
    DROP COLUMN courier_when_no_windows,
    DROP COLUMN courier_estimate_text;
DROP TABLE public.order_delivery_type_change;
DROP INDEX public.order_delivery_type_idx;
ALTER TABLE public."order"
    DROP COLUMN courier_estimate,
    DROP COLUMN delivery_type_reason,
    DROP COLUMN delivery_type;

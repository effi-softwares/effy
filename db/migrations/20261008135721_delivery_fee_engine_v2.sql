-- +goose Up
-- 077-delivery-fee-engine-v2 — one delivery fee per order, built from distance, weight, basket value
-- and window; and a simpler table for courier delivery.
--
-- ⚠ THIS MIGRATION IS ADDITIVE, ON PURPOSE (specs/077-delivery-fee-engine-v2/research.md R1, R10).
-- The services running when it is applied still price from `delivery_ring_price`. Nothing here drops,
-- renames or tightens anything they read, so checkout keeps selling between "migrate" and "deploy".
-- The tier tables are dropped by the NEXT migration, applied after the deploy — which is why this
-- feature is applied with `make db-up-one`, never `make db-up`.
--
-- ⚠ IT ASKS FOR ONE NUMBER AND REFUSES TO RUN WITHOUT IT. The old fee multiplied a same-day order by
-- a factor. The new one adds a fixed amount to a delivery today. A multiplier cannot be turned into
-- an amount without choosing a basket to measure it on, so the amount is the operator's:
--
--     EFFY_TODAY_PREMIUM=3.00 make db-up-one ENV=dev
--
-- Unset, not an amount, or off the plan's rounding step → the migration raises and changes nothing.

-- ── 1. The plan ──────────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.delivery_fee_plan
    ADD COLUMN kind                     text NOT NULL DEFAULT 'effy'
        CONSTRAINT delivery_fee_plan_kind_ck CHECK (kind IN ('effy', 'courier')),
    ADD COLUMN base_amount              numeric(12, 2) NOT NULL DEFAULT 0
        CONSTRAINT delivery_fee_plan_base_ck CHECK (base_amount >= 0),
    ADD COLUMN free_over_amount         numeric(12, 2)
        CONSTRAINT delivery_fee_plan_free_over_ck CHECK (free_over_amount > 0),
    ADD COLUMN small_order_under_amount numeric(12, 2)
        CONSTRAINT delivery_fee_plan_small_under_ck CHECK (small_order_under_amount > 0),
    ADD COLUMN small_order_fee_amount   numeric(12, 2)
        CONSTRAINT delivery_fee_plan_small_fee_ck CHECK (small_order_fee_amount > 0),
    ADD COLUMN today_premium_amount     numeric(12, 2) NOT NULL DEFAULT 0
        CONSTRAINT delivery_fee_plan_today_premium_ck CHECK (today_premium_amount >= 0),
    ADD COLUMN updated_by               text,
    ADD COLUMN updated_at               timestamptz NOT NULL DEFAULT now(),
    -- Both halves of the small-order rule, or neither.
    ADD CONSTRAINT delivery_fee_plan_small_pair_ck
        CHECK ((small_order_under_amount IS NULL) = (small_order_fee_amount IS NULL)),
    -- A basket cannot be both small and free.
    ADD CONSTRAINT delivery_fee_plan_small_below_free_ck
        CHECK (small_order_under_amount IS NULL OR free_over_amount IS NULL
               OR small_order_under_amount < free_over_amount),
    -- Everything a customer is charged lands on the step grid.
    ADD CONSTRAINT delivery_fee_plan_small_fee_step_ck
        CHECK (small_order_fee_amount IS NULL OR mod(small_order_fee_amount, rounding_step) = 0),
    ADD CONSTRAINT delivery_fee_plan_today_premium_step_ck
        CHECK (mod(today_premium_amount, rounding_step) = 0),
    -- A courier table is a flat amount plus weight: no small-order fee, no window.
    ADD CONSTRAINT delivery_fee_plan_courier_shape_ck
        CHECK (kind = 'effy' OR (small_order_under_amount IS NULL AND today_premium_amount = 0));

-- The two multipliers are no longer read or written. They keep a value so a new plan need not
-- mention them, and are dropped at the cutover.
ALTER TABLE public.delivery_fee_plan
    ALTER COLUMN same_day_factor SET DEFAULT 1,
    ALTER COLUMN standard_factor SET DEFAULT 1;

-- One active plan PER KIND: an Effy plan and a courier table are each "the one in force".
DROP INDEX public.delivery_fee_plan_one_active_uq;
CREATE UNIQUE INDEX delivery_fee_plan_one_active_uq ON public.delivery_fee_plan (kind)
    WHERE is_active;

COMMENT ON TABLE public.delivery_fee_plan IS 'A complete, named set of delivery prices (047, rebuilt by 077). Many exist; EXACTLY ONE is active per kind. kind=effy: fee = clamp(roundUp(base + distance band + weight band + window premium, step), floor, cap); 0 at or above free_over; + small_order_fee below small_order_under. kind=courier: the same without distance, window or small-order fee — base is the flat amount per order. ⚠ The sum is computed ONLY by the engine (apis/edge-api/shared/src/delivery/engine.ts). State is derived: draft = never activated, active = is_active, retired = activated once. An activated plan cannot be edited (held by the admin service). Owned by the platform; invisible to shops.';
COMMENT ON COLUMN public.delivery_fee_plan.kind IS 'effy = Delivered by Effy; courier = the courier fee table (077). One active plan per kind.';
COMMENT ON COLUMN public.delivery_fee_plan.base_amount IS 'Effy: the base every delivery starts from. Courier: the flat amount per order.';
COMMENT ON COLUMN public.delivery_fee_plan.free_over_amount IS 'Delivery is free for a basket worth this or more — window surcharge included. NULL = never free. ⚠ An Effy plan''s amount never applies to a courier order: each kind has its own.';
COMMENT ON COLUMN public.delivery_fee_plan.small_order_under_amount IS 'A basket worth LESS than this pays small_order_fee_amount on top of delivery. Effy plans only. NULL = no small-order fee.';
COMMENT ON COLUMN public.delivery_fee_plan.today_premium_amount IS 'Added when the chosen delivery window is TODAY — what makes a same-day delivery a bit dearer (077; replaces same_day_factor). Effy plans only.';
COMMENT ON COLUMN public.delivery_fee_plan.same_day_factor IS 'UNREAD since 077 (replaced by today_premium_amount). Dropped at the delivery-model cutover.';
COMMENT ON COLUMN public.delivery_fee_plan.standard_factor IS 'UNREAD since 077. Dropped at the delivery-model cutover.';

-- ── 2. Distance bands and window premiums ────────────────────────────────────────────────────────

CREATE TABLE public.delivery_distance_band (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id    uuid NOT NULL REFERENCES public.delivery_fee_plan (id) ON DELETE CASCADE,
    upper_km   numeric(7, 2) CHECK (upper_km > 0),
    add_amount numeric(12, 2) NOT NULL CHECK (add_amount >= 0),
    CONSTRAINT delivery_distance_band_uq UNIQUE (plan_id, upper_km)
);
-- At most one open-ended band per plan (UNIQUE treats NULLs as distinct, so it needs its own index).
CREATE UNIQUE INDEX delivery_distance_band_open_uq ON public.delivery_distance_band (plan_id)
    WHERE upper_km IS NULL;
COMMENT ON TABLE public.delivery_distance_band IS 'Distance slabs within an Effy fee plan (077): a delivery up to upper_km from the hub adds add_amount. Matched by the smallest upper_km >= the postcode''s distance, so a distance on a boundary takes the LOWER band. upper_km IS NULL on exactly one row — "and beyond" — which is what makes a postcode added to the list later priceable without touching the plan. Storing only the upper bound makes a gap or an overlap unrepresentable. Replaces delivery_ring_price.';

CREATE TABLE public.delivery_slot_premium (
    plan_id    uuid NOT NULL REFERENCES public.delivery_fee_plan (id) ON DELETE CASCADE,
    slot_id    uuid NOT NULL REFERENCES public.delivery_slot (id) ON DELETE CASCADE,
    add_amount numeric(12, 2) NOT NULL CHECK (add_amount > 0),
    PRIMARY KEY (plan_id, slot_id)
);
CREATE INDEX delivery_slot_premium_slot_idx ON public.delivery_slot_premium (slot_id);
COMMENT ON TABLE public.delivery_slot_premium IS 'What an Effy fee plan adds for one delivery window (077) — a busy evening window, say. ⚠ It belongs to the PLAN, not to the window: replacing a plan never edits a delivery_slot. A switched-off window keeps its row and the premium simply never applies; a deleted window takes its rows with it.';

-- Checkout runs as effy_shopper and reads the active plan. 070's default privileges hand a new table
-- full DML; prices are staff-maintained, so the shopper keeps read only.
REVOKE INSERT, UPDATE, DELETE ON public.delivery_distance_band FROM effy_shopper;
REVOKE INSERT, UPDATE, DELETE ON public.delivery_slot_premium  FROM effy_shopper;

-- ── 3. What a draft is missing, and the one way a plan goes live ─────────────────────────────────

-- +goose StatementBegin
CREATE FUNCTION public.delivery_plan_gaps(p_plan uuid)
RETURNS TABLE (code text, blocking boolean, detail jsonb)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_plan public.delivery_fee_plan%ROWTYPE;
BEGIN
    SELECT * INTO v_plan FROM public.delivery_fee_plan WHERE id = p_plan;
    IF NOT FOUND THEN
        RETURN;
    END IF;

    IF v_plan.kind = 'effy' THEN
        IF NOT EXISTS (SELECT 1 FROM public.delivery_distance_band b WHERE b.plan_id = p_plan) THEN
            RETURN QUERY SELECT 'distance_bands_missing'::text, true, '{}'::jsonb;
        ELSIF NOT EXISTS (SELECT 1 FROM public.delivery_distance_band b WHERE b.plan_id = p_plan AND b.upper_km IS NULL) THEN
            RETURN QUERY SELECT 'distance_open_band_missing'::text, true,
                jsonb_build_object('lastUpperKm', (SELECT max(b.upper_km) FROM public.delivery_distance_band b WHERE b.plan_id = p_plan));
        END IF;

        -- A farther delivery may not cost less than a nearer one (077 FR-007).
        RETURN QUERY
            SELECT 'distance_not_monotonic'::text, true,
                   jsonb_build_object('lowerKm', o.prev_km, 'lowerAmount', o.prev_amount,
                                      'upperKm', o.upper_km, 'upperAmount', o.add_amount)
              FROM (SELECT b.upper_km, b.add_amount,
                           lag(b.upper_km)   OVER w AS prev_km,
                           lag(b.add_amount) OVER w AS prev_amount
                      FROM public.delivery_distance_band b
                     WHERE b.plan_id = p_plan
                    WINDOW w AS (ORDER BY b.upper_km NULLS LAST)) o
             WHERE o.prev_amount IS NOT NULL AND o.add_amount < o.prev_amount;

        RETURN QUERY
            SELECT 'premium_on_disabled_slot'::text, false,
                   jsonb_build_object('slotId', s.id, 'start', to_char(s.start_time, 'HH24:MI'), 'end', to_char(s.end_time, 'HH24:MI'))
              FROM public.delivery_slot_premium p
              JOIN public.delivery_slot s ON s.id = p.slot_id
             WHERE p.plan_id = p_plan AND s.status <> 'active';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.delivery_weight_band b WHERE b.plan_id = p_plan) THEN
        RETURN QUERY SELECT 'weight_bands_missing'::text, true, '{}'::jsonb;
    END IF;

    -- A heavier basket may not cost less than a lighter one.
    RETURN QUERY
        SELECT 'weight_not_monotonic'::text, true,
               jsonb_build_object('lowerGrams', o.prev_grams, 'lowerAmount', o.prev_amount,
                                  'upperGrams', o.upper_grams, 'upperAmount', o.add_amount)
          FROM (SELECT b.upper_grams, b.add_amount,
                       lag(b.upper_grams) OVER w AS prev_grams,
                       lag(b.add_amount)  OVER w AS prev_amount
                  FROM public.delivery_weight_band b
                 WHERE b.plan_id = p_plan
                WINDOW w AS (ORDER BY b.upper_grams)) o
         WHERE o.prev_amount IS NOT NULL AND o.add_amount < o.prev_amount;

    -- Not a gap in the pricing — a thing a person must have meant. Delivery can then be $0 without
    -- the free-delivery amount, so activation asks for it to be confirmed.
    IF v_plan.floor_amount = 0 THEN
        RETURN QUERY SELECT 'floor_is_zero'::text, false, '{}'::jsonb;
    END IF;
END
$$;
-- +goose StatementEnd
COMMENT ON FUNCTION public.delivery_plan_gaps(uuid) IS 'What a fee plan is missing before it can go live (077 FR-017/FR-018): one row per gap, with the facts staff need to fix it. blocking=false rows (floor_is_zero, premium_on_disabled_slot) need a person''s attention only. ⚠ VALUE errors are not gaps — an amount off the step or a small-order amount above the free one is refused by a CHECK and, before that, by the admin service as a field error.';

-- +goose StatementBegin
CREATE FUNCTION public.delivery_plan_is_complete(p_plan uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT EXISTS (SELECT 1 FROM public.delivery_fee_plan WHERE id = p_plan)
       AND NOT EXISTS (SELECT 1 FROM public.delivery_plan_gaps(p_plan) g WHERE g.blocking);
$$;
-- +goose StatementEnd
COMMENT ON FUNCTION public.delivery_plan_is_complete(uuid) IS 'True when a fee plan can price every distance and every weight (077): it exists and has no blocking gap.';

-- +goose StatementBegin
CREATE FUNCTION public.delivery_plan_activate(p_plan uuid, p_actor text, p_confirm_zero_floor boolean)
RETURNS TABLE (plan_id uuid, retired_id uuid)
LANGUAGE plpgsql
AS $$
DECLARE
    v_plan    public.delivery_fee_plan%ROWTYPE;
    v_gaps    jsonb;
    v_retired uuid;
BEGIN
    SELECT * INTO v_plan FROM public.delivery_fee_plan WHERE id = p_plan;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'plan_not_found';
    END IF;

    -- One activation at a time per kind. Two managers pressing Activate together queue here; the
    -- second sees the first's result.
    PERFORM pg_advisory_xact_lock(hashtext('delivery_fee_plan:' || v_plan.kind));
    SELECT * INTO v_plan FROM public.delivery_fee_plan WHERE id = p_plan;

    IF v_plan.is_active THEN
        RAISE EXCEPTION 'plan_already_active';
    END IF;
    -- A retired plan is copied to a new draft, never brought back: the record of what was in force
    -- and when stays one line per plan.
    IF v_plan.activated_at IS NOT NULL THEN
        RAISE EXCEPTION 'plan_retired';
    END IF;

    SELECT jsonb_agg(jsonb_build_object('code', g.code, 'blocking', g.blocking, 'detail', g.detail))
      INTO v_gaps
      FROM public.delivery_plan_gaps(p_plan) g
     WHERE g.blocking;
    IF v_gaps IS NOT NULL THEN
        RAISE EXCEPTION 'plan_incomplete' USING DETAIL = v_gaps::text;
    END IF;

    IF v_plan.floor_amount = 0 AND NOT COALESCE(p_confirm_zero_floor, false) THEN
        RAISE EXCEPTION 'zero_floor_unconfirmed';
    END IF;

    -- ⚠ Deactivate FIRST, as its own statement: a partial unique index is checked row by row, so one
    -- UPDATE that swaps both can fail on row order. Nobody can observe the moment in between — it is
    -- inside this function's transaction.
    UPDATE public.delivery_fee_plan f
       SET is_active = false
     WHERE f.kind = v_plan.kind AND f.is_active
    RETURNING f.id INTO v_retired;

    UPDATE public.delivery_fee_plan f
       SET is_active = true, activated_by = p_actor, activated_at = now()
     WHERE f.id = p_plan;

    RETURN QUERY SELECT p_plan, v_retired;
END
$$;
-- +goose StatementEnd
COMMENT ON FUNCTION public.delivery_plan_activate(uuid, text, boolean) IS '⚠ THE ONLY WAY A FEE PLAN GOES LIVE (077 FR-019). Under a lock: refuses plan_not_found / plan_already_active / plan_retired / plan_incomplete (DETAIL = the blocking gaps as JSON) / zero_floor_unconfirmed, then retires the plan in force and activates this one in one transaction — so there is never a moment with zero or two active plans of a kind. Returns the plan and the one it retired.';

-- ── 4. Carry today''s prices across ──────────────────────────────────────────────────────────────

-- +goose StatementBegin
DO $$
DECLARE
    v_factor  numeric;
    v_skipped int;
BEGIN
    -- The old fee was factor × (tier price + weight add), rounded afterwards. A per-band copy
    -- reproduces it only when the standard factor is exactly 1. Anything else would move EVERY fee,
    -- and nothing downstream would show it — so stop here and say so.
    SELECT standard_factor INTO v_factor FROM public.delivery_fee_plan WHERE is_active;
    IF v_factor IS NOT NULL AND v_factor <> 1 THEN
        RAISE EXCEPTION '077: the active fee plan has a standard multiplier of %, not 1. Copying its tier prices would change every delivery fee. Make a plan with multiplier 1 active first (folding the multiplier into its prices), then run this again.', v_factor;
    END IF;

    -- Each tier price becomes a distance band on the same boundary; the open-ended tier becomes the
    -- open-ended band. For every plan, so a draft or a retired plan stays readable.
    INSERT INTO public.delivery_distance_band (plan_id, upper_km, add_amount)
    SELECT rp.plan_id, r.suggest_upper_km, rp.price_amount
      FROM public.delivery_ring_price rp
      JOIN public.delivery_ring r ON r.id = rp.ring_id
     WHERE r.status = 'active';

    SELECT count(*) INTO v_skipped
      FROM public.delivery_ring_price rp
      JOIN public.delivery_ring r ON r.id = rp.ring_id
     WHERE r.status <> 'active';
    IF v_skipped > 0 THEN
        RAISE NOTICE '077: % tier price(s) belonged to a DISABLED tier and were not carried across — no postcode was priced on them.', v_skipped;
    END IF;
END
$$;
-- +goose StatementEnd

-- The same-day amount. A helper, so the one statement goose substitutes into has no dollar-quoting
-- in it: with substitution on, goose rewrites `$`.
-- +goose StatementBegin
CREATE FUNCTION public._077_today_premium(p_raw text, p_step numeric)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v numeric;
BEGIN
    -- Empty = goose ran with the variable unset. The literal placeholder = something other than
    -- goose ran this file without substituting it.
    IF p_raw IS NULL OR btrim(p_raw) = '' OR p_raw LIKE '%EFFY_TODAY_PREMIUM%' THEN
        RAISE EXCEPTION '077: EFFY_TODAY_PREMIUM is not set. It is how much dearer a delivery TODAY is than one on a later day (for example 3.00), and it replaces the old same-day multiplier. Run:  EFFY_TODAY_PREMIUM=3.00 make db-up-one ENV=<env>';
    END IF;
    IF btrim(p_raw) !~ '^[0-9]+(\.[0-9]{1,2})?$' THEN
        RAISE EXCEPTION '077: EFFY_TODAY_PREMIUM must be an amount like 3.00, not "%".', p_raw;
    END IF;
    v := btrim(p_raw)::numeric;
    IF mod(v, p_step) <> 0 THEN
        RAISE EXCEPTION '077: EFFY_TODAY_PREMIUM (%) must be a multiple of the active plan''s rounding step (%).', v, p_step;
    END IF;
    RETURN v;
END
$$;
-- +goose StatementEnd

-- ⚠ No active plan (a fresh database) → no row → the helper is never called and nothing is asked for.
-- +goose ENVSUB ON
UPDATE public.delivery_fee_plan SET today_premium_amount = public._077_today_premium('${EFFY_TODAY_PREMIUM}', rounding_step) WHERE is_active;
-- +goose ENVSUB OFF

DROP FUNCTION public._077_today_premium(text, numeric);

-- +goose StatementBegin
DO $$
DECLARE
    v_active uuid;
    v_gaps   text;
BEGIN
    SELECT id INTO v_active FROM public.delivery_fee_plan WHERE is_active AND kind = 'effy';
    IF v_active IS NULL THEN
        RETURN;
    END IF;

    -- An address Effy delivers to must never come back "no price". If the carried-over plan cannot
    -- price everything, the release stops here rather than at a customer's checkout.
    IF NOT public.delivery_plan_is_complete(v_active) THEN
        SELECT string_agg(g.code || ' ' || g.detail::text, '; ') INTO v_gaps
          FROM public.delivery_plan_gaps(v_active) g WHERE g.blocking;
        RAISE EXCEPTION '077: the active fee plan would not be complete after this migration: %', v_gaps;
    END IF;

    INSERT INTO admin.audit_log (actor_sub, action, target_type, target_id, detail)
    SELECT 'migration:077', 'pricing.migrate_077', 'pricing', v_active,
           jsonb_build_object(
               'todayPremium', f.today_premium_amount,
               'replacedSameDayFactor', f.same_day_factor,
               'distanceBands', (SELECT jsonb_agg(jsonb_build_object('upperKm', b.upper_km, 'addAmount', b.add_amount) ORDER BY b.upper_km NULLS LAST)
                                   FROM public.delivery_distance_band b WHERE b.plan_id = f.id))
      FROM public.delivery_fee_plan f
     WHERE f.id = v_active;
END
$$;
-- +goose StatementEnd

-- ── 5. An activated plan is a record, not a setting ──────────────────────────────────────────────
-- ⚠ Held by the ADMIN SERVICE, not by a trigger: `pricing.repository.ts` locks the plan row and
-- refuses to change one that has ever been active, and no route deletes a plan. A trigger was built
-- and withdrawn — the platform allows triggers only to mark analytics buckets, never to raise inside
-- another writer's transaction (`shop/src/db/triggers.guard.test.ts`, 058 research R6).

-- ── 6. What an order keeps ───────────────────────────────────────────────────────────────────────

ALTER TABLE public."order" ADD COLUMN delivery_fee_breakdown jsonb;
COMMENT ON COLUMN public."order".delivery_fee_breakdown IS 'How delivery_fee_amount was built, exactly as sold (077 FR-034): the plan, the inputs, every step, and the lines the customer was shown. Written at the payment-intent call and NEVER recomputed, so a receipt reads the same after the business changes its prices. NULL on an order placed before 077. ⚠ plan/inputs/parts are staff-only; a customer or shop response may select `lines` and nothing else.';
COMMENT ON COLUMN public."order".delivery_fee_amount IS 'The delivery TOTAL charged for the order (077): one fee per order, small-order fee included, so grand_total = items − discount + this. Before 077: the SUM of per-package fees. NULL for pre-047 orders.';
COMMENT ON COLUMN public."order".delivery_quote IS 'The delivery options the shopper was shown, captured at the intent call (047; order-level fees since 077).';

-- One fee per order: nobody reads a per-package share, and from here nobody writes one.
ALTER TABLE public.order_package_delivery ALTER COLUMN delivery_fee_amount DROP NOT NULL;
COMMENT ON COLUMN public.order_package_delivery.delivery_fee_amount IS 'UNWRITTEN since 077 — delivery is priced once per order ("order".delivery_fee_amount). Rows before 077 keep their per-package share. Dropped at the delivery-model cutover.';
COMMENT ON COLUMN public.shop_fulfillment.delivery_fee_amount IS 'UNWRITTEN since 077 — delivery is priced once per order. ⚠ NEVER shown to a shop. Dropped at the delivery-model cutover.';

-- +goose Down
-- Dev only. Forward-only everywhere else (constitution: Database). ⚠ LOSSY: fee plans created since
-- 077 lose their distance bands, basket rules and premiums.
ALTER TABLE public."order" DROP COLUMN IF EXISTS delivery_fee_breakdown;
DROP FUNCTION IF EXISTS public.delivery_plan_activate(uuid, text, boolean);
DROP FUNCTION IF EXISTS public.delivery_plan_is_complete(uuid);
DROP FUNCTION IF EXISTS public.delivery_plan_gaps(uuid);
DROP TABLE IF EXISTS public.delivery_slot_premium;
DROP TABLE IF EXISTS public.delivery_distance_band;
DELETE FROM public.delivery_fee_plan WHERE kind = 'courier';
DROP INDEX IF EXISTS public.delivery_fee_plan_one_active_uq;
CREATE UNIQUE INDEX delivery_fee_plan_one_active_uq ON public.delivery_fee_plan (is_active) WHERE is_active = true;
ALTER TABLE public.delivery_fee_plan
    ALTER COLUMN same_day_factor DROP DEFAULT,
    ALTER COLUMN standard_factor DROP DEFAULT,
    DROP CONSTRAINT IF EXISTS delivery_fee_plan_courier_shape_ck,
    DROP CONSTRAINT IF EXISTS delivery_fee_plan_today_premium_step_ck,
    DROP CONSTRAINT IF EXISTS delivery_fee_plan_small_fee_step_ck,
    DROP CONSTRAINT IF EXISTS delivery_fee_plan_small_below_free_ck,
    DROP CONSTRAINT IF EXISTS delivery_fee_plan_small_pair_ck,
    DROP COLUMN IF EXISTS updated_at,
    DROP COLUMN IF EXISTS updated_by,
    DROP COLUMN IF EXISTS today_premium_amount,
    DROP COLUMN IF EXISTS small_order_fee_amount,
    DROP COLUMN IF EXISTS small_order_under_amount,
    DROP COLUMN IF EXISTS free_over_amount,
    DROP COLUMN IF EXISTS base_amount,
    DROP COLUMN IF EXISTS kind;

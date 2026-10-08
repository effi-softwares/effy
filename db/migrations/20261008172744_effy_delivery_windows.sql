-- +goose Up
-- 078 — Effy delivery windows: today and the next delivery days.
--
-- ⚠ ADDITIVE. The services running when this is applied read none of it, and the one constraint
-- that changes only WIDENS what a row may hold. Nothing here turns anything on: the switch is
-- created NULL and no route, seed or migration sets it (the cutover does, behind its checks).
--
-- Capacity needs no change: `delivery_slot_booking` and `delivery_slot_load` have been per
-- (slot, delivery_date) since 069. What was today-only was every caller.

ALTER TABLE public.delivery_settings
    ADD COLUMN delivery_model_v2_from timestamptz,
    ADD COLUMN effy_lookahead_days    int NOT NULL DEFAULT 3
        CONSTRAINT delivery_settings_effy_lookahead_ck CHECK (effy_lookahead_days BETWEEN 1 AND 14);
COMMENT ON COLUMN public.delivery_settings.delivery_model_v2_from IS 'THE SWITCH (078). NULL = the new delivery model is off. From this instant a checkout sells ONE window for the order — today''s under "Same-day delivery", a later delivery day''s under "Standard delivery" — instead of a same-day slot or a standard day. ⚠ Read ONLY through public.delivery_model_v2_at(); a second reader is a second opinion about which checkout a customer is in. ⚠ Nothing sets it before the cutover: until drivers can hold a parcel at the hub for a later day, a later-day order has nobody to deliver it.';
COMMENT ON COLUMN public.delivery_settings.effy_lookahead_days IS 'How many Effy DELIVERY days after today a customer may choose a window on (078 FR-002). Non-delivery weekdays and dates are skipped and do not count. Used once the new delivery model is on; standard_lookahead_days keeps driving the old day picker until then.';

-- +goose StatementBegin
CREATE FUNCTION public.delivery_model_v2_at(p_at timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(
        (SELECT delivery_model_v2_from IS NOT NULL AND p_at >= delivery_model_v2_from
           FROM public.delivery_settings WHERE id = 1),
        false);
$$;
-- +goose StatementEnd
COMMENT ON FUNCTION public.delivery_model_v2_at(timestamptz) IS 'Whether the new delivery model is on at an instant (078). The ONE definition; false while the switch is NULL or the settings row does not exist.';

-- A window on either method, still all-or-nothing. 069 allowed one only on a same-day package; a
-- later-day Effy delivery is sold a window too.
ALTER TABLE public.order_package_delivery
    DROP CONSTRAINT order_package_delivery_window_ck,
    ADD CONSTRAINT order_package_delivery_window_ck CHECK (
        (slot_id IS NULL AND window_start IS NULL AND window_end IS NULL)
        OR (slot_id IS NOT NULL AND window_start IS NOT NULL AND window_end IS NOT NULL)
    );
COMMENT ON COLUMN public.order_package_delivery.method IS 'The customer''s word for the delivery. From 078: same_day = a window TODAY; standard = a later day. ⚠ A standard package WITH a window (slot_id) is delivered by EFFY; one WITHOUT is a carrier package sold before the new model. The checkout feature''s order-level delivery type makes this explicit.';
COMMENT ON COLUMN public.order_package_delivery.window_start IS 'The window the customer was sold, as an INSTANT (069; on either method since 078). NULL for a carrier package and for every order placed before 069. ⚠ A snapshot: editing or disabling the slot never changes it.';

-- +goose Down
-- Dev-only single-step reversal. ⚠ Refuses rather than strip a window a customer was sold.
-- +goose StatementBegin
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.order_package_delivery WHERE method <> 'same_day' AND slot_id IS NOT NULL) THEN
        RAISE EXCEPTION '078 down: a standard package carries a delivery window; refusing to drop it';
    END IF;
END
$$;
-- +goose StatementEnd
ALTER TABLE public.order_package_delivery
    DROP CONSTRAINT order_package_delivery_window_ck,
    ADD CONSTRAINT order_package_delivery_window_ck CHECK (
        (slot_id IS NULL AND window_start IS NULL AND window_end IS NULL)
        OR (slot_id IS NOT NULL AND window_start IS NOT NULL AND window_end IS NOT NULL
            AND method = 'same_day')
    );
DROP FUNCTION public.delivery_model_v2_at(timestamptz);
ALTER TABLE public.delivery_settings
    DROP COLUMN effy_lookahead_days,
    DROP COLUMN delivery_model_v2_from;

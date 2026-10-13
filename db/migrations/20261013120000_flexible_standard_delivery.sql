-- +goose Up
-- 085 — Standard delivery without a time: a day only, or "as soon as possible".
--
-- ⚠ THE WHOLE FEATURE IS ONE FLAG ON A WINDOW. An order with no time is an order in the delivery
-- window staff mark "Any time". Its capacity, its hold, its cutoff, the collection run that serves
-- it, the round it rides and when that round opens are all the rules a window already has — none of
-- them changes here, and none of them learns about this column.
--
-- ⚠ ADDITIVE. Every new column is nullable or defaulted, and the services running when this is
-- applied read none of it. Nothing here turns anything on: no customer is offered a day without a
-- time until staff create an Any-time window, nor "as soon as possible" until they enter its estimate.
--
-- ⚠ NO BACKFILL. An order placed before this has no delivery_promise and is never given one — it
-- was sold a window and reads as one (the 079 rule for delivery_type).

-- ── 1. The "Any time" window ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.delivery_slot
    ADD COLUMN any_time boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.delivery_slot.any_time IS 'TRUE for the one window that sells a DAY WITH NO TIME (085). Its start and end are the hours untimed deliveries go out; its cutoff and capacity mean what they mean on any window — capacity is the day''s own limit for untimed orders. ⚠ A LABEL, NOT A RULE: judgeWindow, the hold, the collection run and the planner treat it as the window it is. ⚠ Never offered for today by a customer''s own choice — only an "as soon as possible" order may land in today''s.';

-- At most one ACTIVE Any-time window: two would be two "any time"s for one day.
CREATE UNIQUE INDEX delivery_slot_any_time_uq
    ON public.delivery_slot ((true))
    WHERE any_time AND status = 'active';

-- ── 2. What the order was sold ───────────────────────────────────────────────────────────────────

ALTER TABLE public."order"
    ADD COLUMN delivery_promise text
        CONSTRAINT order_delivery_promise_ck CHECK (delivery_promise IN ('window', 'day', 'asap')),
    ADD COLUMN asap_estimate    text,
    -- The estimate exactly when the order was sold "as soon as possible".
    ADD CONSTRAINT order_asap_estimate_ck
        CHECK ((delivery_promise IS NOT DISTINCT FROM 'asap') = (asap_estimate IS NOT NULL)),
    -- Only an order Effy delivers was promised a window, a day or "as soon as possible".
    ADD CONSTRAINT order_delivery_promise_effy_ck
        CHECK (delivery_promise IS NULL OR delivery_type IS NOT DISTINCT FROM 'effy');
COMMENT ON COLUMN public."order".delivery_promise IS 'WHAT AN EFFY ORDER WAS SOLD (085): window (a time on a day) | day (a day, any time) | asap ("as soon as possible" — the customer was told an estimate, never the day). ⚠ NULL = a courier order, or one placed before 085 and never backfilled — an Effy order with NULL reads as window. ⚠ KEPT AS SOLD: editing or disabling the window never changes it. ⚠ TWO WRITERS: checkout (with delivery_type) and @effy/edge-shared/delivery override.ts (a staff move or re-timing).';
COMMENT ON COLUMN public."order".asap_estimate IS 'The "as soon as possible" estimate AS SOLD (085), e.g. "usually within 2–3 days" — a copy of delivery_settings.asap_estimate at the payment-intent call. ⚠ An estimate, never a promise, and never a day: the day the order was planned for is on its packages and is staff''s and drivers'' business.';

-- ── 3. The estimate the business gives ───────────────────────────────────────────────────────────

ALTER TABLE public.delivery_settings
    ADD COLUMN asap_estimate text
        CONSTRAINT delivery_settings_asap_estimate_ck
            CHECK (asap_estimate IS NULL OR (btrim(asap_estimate) <> '' AND char_length(asap_estimate) <= 80));
COMMENT ON COLUMN public.delivery_settings.asap_estimate IS 'What a customer choosing "as soon as possible" is told to expect (085), e.g. "usually within 2–3 days". Operator-entered, NEVER SEEDED. ⚠ NULL = "as soon as possible" is not offered at checkout.';

-- +goose Down
-- Dev-only single-step reversal. ⚠ Refuses rather than strip what a customer was sold.
-- +goose StatementBegin
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public."order" WHERE delivery_promise IN ('day', 'asap')) THEN
        RAISE EXCEPTION '085 down: an order was sold a day without a time or "as soon as possible"; refusing to drop it';
    END IF;
END
$$;
-- +goose StatementEnd
ALTER TABLE public.delivery_settings DROP COLUMN asap_estimate;
ALTER TABLE public."order"
    DROP CONSTRAINT order_delivery_promise_effy_ck,
    DROP CONSTRAINT order_asap_estimate_ck,
    DROP COLUMN asap_estimate,
    DROP COLUMN delivery_promise;
DROP INDEX public.delivery_slot_any_time_uq;
ALTER TABLE public.delivery_slot DROP COLUMN any_time;

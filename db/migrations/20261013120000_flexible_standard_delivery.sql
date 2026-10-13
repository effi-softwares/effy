-- +goose Up
-- 085 — Standard delivery without a time: a day only, or "as soon as possible".
--
-- ⚠ THE WHOLE FEATURE IS ONE FLAG ON A WINDOW. An order with no time is an order in the delivery
-- window staff mark "Any time". Its capacity, its hold, its cutoff, the collection run that serves
-- it, the round it rides and when that round opens are all the rules a window already has — none of
-- them changes here, and none of them learns about this column.
--
-- ⚠ ADDITIVE for the services running when this is applied: every new column is nullable or
-- defaulted and they read none of it.
--
-- ⚠ THIS IS HOW STANDARD DELIVERY WORKS FROM HERE — NOT A SWITCH. The Any time window is CREATED
-- BELOW and can never be switched off or unmarked; the "as soon as possible" estimate has a default
-- and can never be emptied. Staff change its hours, its limit and the wording — nothing else.
--
-- ⚠ NO BACKFILL. An order placed before this has no delivery_promise and is never given one — it
-- was sold a window and reads as one (the 079 rule for delivery_type).

-- ── 1. The "Any time" window ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.delivery_slot
    ADD COLUMN any_time boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.delivery_slot.any_time IS 'TRUE for THE window that sells a DAY WITH NO TIME (085) — exactly one, created by the migration, always active, never unmarked. Its start and end are the hours untimed deliveries go out; its cutoff and capacity mean what they mean on any window — capacity is the day''s own limit for untimed orders. ⚠ A LABEL, NOT A RULE: judgeWindow, the hold, the collection run and the planner treat it as the window it is. ⚠ Never offered for today by a customer''s own choice — only an "as soon as possible" order may land in today''s.';

-- Exactly one, always on: there is no second "any time" for a day, and it cannot be disabled.
CREATE UNIQUE INDEX delivery_slot_any_time_uq ON public.delivery_slot ((true)) WHERE any_time;
ALTER TABLE public.delivery_slot
    ADD CONSTRAINT delivery_slot_any_time_active_ck CHECK (NOT any_time OR status = 'active');

-- THE Any time window. Its hours span the delivery windows that exist today (earliest start to latest
-- end; 09:00–21:00 where there are none yet), it closes for a day when the earliest of them does, and
-- it has no limit until staff set one. ⚠ A start, an end and a cutoff the business can change in
-- Delivery › Windows like any window's — these are a starting point, not a rule.
-- +goose StatementBegin
DO $$
DECLARE
    s time; e time; c time;
BEGIN
    SELECT COALESCE(min(start_time), '09:00'), COALESCE(max(end_time), '21:00'), COALESCE(min(cutoff_time), '09:00')
      INTO s, e, c
      FROM public.delivery_slot WHERE status = 'active';
    IF c > s THEN c := s; END IF;
    -- (start, end) is unique among windows: step the end back a minute until it is free.
    WHILE EXISTS (SELECT 1 FROM public.delivery_slot WHERE start_time = s AND end_time = e) LOOP
        e := e - interval '1 minute';
        IF e <= s THEN RAISE EXCEPTION '085: no free hours for the Any time window from % — add it by hand', s; END IF;
    END LOOP;
    INSERT INTO public.delivery_slot (start_time, end_time, cutoff_time, capacity, status, any_time, updated_by)
    VALUES (s, e, c, NULL, 'active', true, 'migration:085');
END
$$;
-- +goose StatementEnd

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
    ADD COLUMN asap_estimate text NOT NULL DEFAULT 'usually within 2–3 days'
        CONSTRAINT delivery_settings_asap_estimate_ck
            CHECK (btrim(asap_estimate) <> '' AND char_length(asap_estimate) <= 80);
COMMENT ON COLUMN public.delivery_settings.asap_estimate IS 'What a customer choosing "as soon as possible" is told to expect (085), e.g. "usually within 2–3 days". ⚠ Always set: the business may reword it, never empty it. An ESTIMATE in the customer''s eyes — never a promise, never a day.';

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
-- ⚠ The Any time window itself goes too — unless an order still points at it (old window orders are
-- untouched; only a booking in THIS window would block, and the check above already refused those).
DELETE FROM public.delivery_slot WHERE any_time;
DROP INDEX public.delivery_slot_any_time_uq;
ALTER TABLE public.delivery_slot
    DROP CONSTRAINT delivery_slot_any_time_active_ck,
    DROP COLUMN any_time;

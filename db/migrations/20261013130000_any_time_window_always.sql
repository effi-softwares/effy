-- +goose Up
-- 085 (second step) — Standard delivery without a time is HOW IT WORKS, not a switch.
--
-- The first step (20261013120000) added the "Any time" flag and left it to back-office to create
-- such a window and to enter the "as soon as possible" estimate. The operator's direction the same
-- day: no switch. This step CREATES the window, gives the estimate its words, and makes both
-- impossible to remove. ⚠ A separate file because the first was already applied to dev.
--
-- ⚠ ADDITIVE for the services running when this is applied. With the 085 services deployed, the
-- new choices appear at checkout the moment this commits.

-- ── 1. Exactly one Any time window, always on ────────────────────────────────────────────────────

-- If back-office created one under the first step's rules, it is THE window: switch it on if it was
-- switched off, and keep only the earliest should there somehow be two.
UPDATE public.delivery_slot SET status = 'active', updated_at = now() WHERE any_time AND status <> 'active';
UPDATE public.delivery_slot s SET any_time = false, updated_at = now()
 WHERE s.any_time
   AND s.id <> (SELECT id FROM public.delivery_slot WHERE any_time ORDER BY created_at, id LIMIT 1);

DROP INDEX public.delivery_slot_any_time_uq;
CREATE UNIQUE INDEX delivery_slot_any_time_uq ON public.delivery_slot ((true)) WHERE any_time;
ALTER TABLE public.delivery_slot
    ADD CONSTRAINT delivery_slot_any_time_active_ck CHECK (NOT any_time OR status = 'active');
COMMENT ON COLUMN public.delivery_slot.any_time IS 'TRUE for THE window that sells a DAY WITH NO TIME (085) — exactly one, created by migration, always active, never unmarked. Its start and end are the hours untimed deliveries go out; its cutoff and capacity mean what they mean on any window — capacity is the day''s own limit for untimed orders. ⚠ A LABEL, NOT A RULE: judgeWindow, the hold, the collection run and the planner treat it as the window it is. ⚠ Never offered for today by a customer''s own choice — only an "as soon as possible" order may land in today''s.';

-- THE Any time window, where none exists yet. Its hours span the delivery windows that exist today
-- (earliest start to latest end; 09:00–21:00 where there are none), it closes for a day when the
-- earliest of them does, and it has no limit until staff set one. ⚠ A starting point the business
-- changes in Delivery › Windows like any window's hours — not a rule.
-- +goose StatementBegin
DO $$
DECLARE
    s time; e time; c time;
BEGIN
    IF EXISTS (SELECT 1 FROM public.delivery_slot WHERE any_time) THEN RETURN; END IF;
    SELECT COALESCE(min(start_time), '09:00'), COALESCE(max(end_time), '21:00'), COALESCE(min(cutoff_time), '09:00')
      INTO s, e, c
      FROM public.delivery_slot WHERE status = 'active';
    IF c > s THEN c := s; END IF;
    -- (start, end) is unique among windows: step the end back a minute until it is free.
    WHILE EXISTS (SELECT 1 FROM public.delivery_slot WHERE start_time = s AND end_time = e) LOOP
        e := e - interval '1 minute';
        IF e <= s THEN RAISE EXCEPTION '085: no free hours for the Any time window from %', s; END IF;
    END LOOP;
    INSERT INTO public.delivery_slot (start_time, end_time, cutoff_time, capacity, status, any_time, updated_by)
    VALUES (s, e, c, NULL, 'active', true, 'migration:085');
END
$$;
-- +goose StatementEnd

-- ── 2. The estimate is always set ────────────────────────────────────────────────────────────────

UPDATE public.delivery_settings SET asap_estimate = 'usually within 2–3 days' WHERE asap_estimate IS NULL;
ALTER TABLE public.delivery_settings
    DROP CONSTRAINT delivery_settings_asap_estimate_ck,
    ALTER COLUMN asap_estimate SET DEFAULT 'usually within 2–3 days',
    ALTER COLUMN asap_estimate SET NOT NULL,
    ADD CONSTRAINT delivery_settings_asap_estimate_ck
        CHECK (btrim(asap_estimate) <> '' AND char_length(asap_estimate) <= 80);
COMMENT ON COLUMN public.delivery_settings.asap_estimate IS 'What a customer choosing "as soon as possible" is told to expect (085), e.g. "usually within 2–3 days". ⚠ Always set: the business may reword it, never empty it. An ESTIMATE in the customer''s eyes — never a promise, never a day.';

-- +goose Down
-- Dev-only single-step reversal, back to the first step's shape. ⚠ Refuses rather than strand an
-- order sold a day without a time or "as soon as possible": such an order holds a place in the window.
-- +goose StatementBegin
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.delivery_slot_booking b JOIN public.delivery_slot s ON s.id = b.slot_id WHERE s.any_time) THEN
        RAISE EXCEPTION '085 down: an order holds a place in the Any time window; refusing to remove it';
    END IF;
END
$$;
-- +goose StatementEnd
DELETE FROM public.delivery_slot WHERE any_time AND updated_by = 'migration:085';
ALTER TABLE public.delivery_settings
    DROP CONSTRAINT delivery_settings_asap_estimate_ck,
    ALTER COLUMN asap_estimate DROP NOT NULL,
    ALTER COLUMN asap_estimate DROP DEFAULT,
    ADD CONSTRAINT delivery_settings_asap_estimate_ck
        CHECK (asap_estimate IS NULL OR (btrim(asap_estimate) <> '' AND char_length(asap_estimate) <= 80));
ALTER TABLE public.delivery_slot DROP CONSTRAINT delivery_slot_any_time_active_ck;
DROP INDEX public.delivery_slot_any_time_uq;
CREATE UNIQUE INDEX delivery_slot_any_time_uq ON public.delivery_slot ((true)) WHERE any_time AND status = 'active';

-- +goose Up
-- 069-delivery-slots-dates — a time window for same-day, a chosen day for standard.
--
-- Spec: specs/069-delivery-slots-dates/spec.md. Data model: ../data-model.md. Research: ../research.md.
--
-- ⚠ THIS IS THE FIRST SLICE THAT WRITES A DELIVERY PROMISE AT ALL (research R1). `promised_from` /
-- `promised_to` on order_package_delivery have had eleven readers and no writer since 047, so every
-- order has said "we'll confirm your delivery date". Checkout now writes them — both the delivery day
-- — and adds the same-day WINDOW below. Nothing here rewrites an order that already exists (FR-049).
--
-- ⚠ EVERY `time` COLUMN IS AUSTRALIA/MELBOURNE WALL-CLOCK, like delivery_collection_run.run_time.
-- `time` carries no zone by design: these describe Effy's working day. The hot path turns a slot into
-- INSTANTS exactly once, when a place is held, and stores those — nothing downstream rebuilds an
-- instant from wall-clock fields (research R5), which is what 058's two DST defects were made of.

-- ── A daily same-day delivery window ─────────────────────────────────────────────────────────────
CREATE TABLE public.delivery_slot (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    start_time  time NOT NULL,
    end_time    time NOT NULL,
    cutoff_time time NOT NULL,
    capacity    int  NOT NULL,
    status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    updated_by  text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    -- FR-037, in the database. The service repeats these only to give a named refusal.
    CONSTRAINT delivery_slot_window_ck   CHECK (end_time > start_time),
    CONSTRAINT delivery_slot_cutoff_ck   CHECK (cutoff_time <= start_time),
    CONSTRAINT delivery_slot_capacity_ck CHECK (capacity >= 1),
    CONSTRAINT delivery_slot_window_uq   UNIQUE (start_time, end_time)
);
COMMENT ON TABLE  public.delivery_slot IS 'A same-day delivery window the back-office defines (069). Repeats every delivery day. ⚠ NEVER DELETED, only disabled: a booking references it, and a placed order must always be able to say which window it was sold. Editing a slot changes what NEW orders are offered and nothing a placed order shows (FR-026) — the window is snapshotted onto the booking and the package.';
COMMENT ON COLUMN public.delivery_slot.cutoff_time IS 'The last moment this slot can be chosen. ⚠ Not the only gate: a slot is also closed once no collection run can bring the goods to the hub before start_time (research R5).';
COMMENT ON COLUMN public.delivery_slot.capacity IS 'How many DELIVERIES the slot takes — one per order per address, whatever the number of packages (FR-008). Platform-wide, not per zone.';

-- ── One order's place in one slot on one day ─────────────────────────────────────────────────────
CREATE TABLE public.delivery_slot_booking (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slot_id       uuid NOT NULL REFERENCES public.delivery_slot (id) ON DELETE RESTRICT,
    delivery_date date NOT NULL,
    order_id      uuid NOT NULL REFERENCES public."order" (id) ON DELETE CASCADE,
    state         text NOT NULL CHECK (state IN ('held', 'confirmed', 'released')),
    held_until    timestamptz,
    window_start  timestamptz NOT NULL,
    window_end    timestamptz NOT NULL,
    over_capacity boolean NOT NULL DEFAULT false,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    -- ⚠ ONE ORDER NEVER HOLDS TWO PLACES. A customer who changes slot at the payment step MOVES this
    -- row; without the constraint each change of mind would eat a place until its hold lapsed.
    CONSTRAINT delivery_slot_booking_order_uq UNIQUE (order_id),
    CONSTRAINT delivery_slot_booking_hold_ck  CHECK (state <> 'held' OR held_until IS NOT NULL),
    CONSTRAINT delivery_slot_booking_span_ck  CHECK (window_end > window_start)
);
COMMENT ON TABLE  public.delivery_slot_booking IS 'An order''s place in a same-day slot (069). HELD at the payment-intent call, CONFIRMED when payment succeeds, RELEASED when the order is cancelled. ⚠ A hold is the only way "never charged for a slot you did not get" can be true: the client confirms payment with the provider directly, so the intent call is the last server moment before the money moves (research R3).';
COMMENT ON COLUMN public.delivery_slot_booking.held_until IS '⚠ A LAPSED HOLD IS NOT SWEPT — IT SIMPLY STOPS COUNTING. The row stays `held`; delivery_slot_load ignores it once held_until has passed. A sweeper would be a second place that decides what counts.';
COMMENT ON COLUMN public.delivery_slot_booking.over_capacity IS 'TRUE only for a LATE PAYER: payment landed after the hold lapsed and the slot had since filled or closed. The customer paid for this window, so the order keeps it (FR-009b) and staff are told. Never set by any other path.';
CREATE INDEX delivery_slot_booking_slot_idx ON public.delivery_slot_booking (slot_id, delivery_date);

-- ⚠ "A BOOKING COUNTS" IS DEFINED HERE, ONCE. Checkout (Go) and the back-office console (TypeScript)
-- both read this view. Two services each writing their own WHERE clause for one rule is the shape
-- 029, 033 and 052 each shipped a defect through.
CREATE VIEW public.delivery_slot_load AS
SELECT b.slot_id,
       b.delivery_date,
       count(*) FILTER (
           WHERE b.state = 'confirmed' OR (b.state = 'held' AND b.held_until > now())
       )::int AS booked,
       count(*) FILTER (WHERE b.state = 'confirmed' AND b.over_capacity)::int AS over_capacity
  FROM public.delivery_slot_booking b
 GROUP BY b.slot_id, b.delivery_date;
COMMENT ON VIEW public.delivery_slot_load IS 'How full each slot is on each day (069): confirmed bookings plus holds that have not lapsed. The ONE definition of "a booking counts".';

-- ── Dates with no standard delivery ──────────────────────────────────────────────────────────────
CREATE TABLE public.delivery_non_delivery_date (
    day        date PRIMARY KEY,
    label      text,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.delivery_non_delivery_date IS 'An individual date on which no standard delivery arrives (069), e.g. a public holiday. Checkout never offers it. ⚠ Adding one changes NO placed order (FR-043); the console shows how many already carry it.';

-- ── Settings ─────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.delivery_settings
    ADD COLUMN slot_hold_min                 int NOT NULL DEFAULT 10
        CONSTRAINT delivery_settings_slot_hold_ck CHECK (slot_hold_min > 0),
    ADD COLUMN sameday_hub_turnaround_min    int NOT NULL DEFAULT 60
        CONSTRAINT delivery_settings_turnaround_ck CHECK (sameday_hub_turnaround_min >= 0),
    ADD COLUMN standard_lookahead_days       int NOT NULL DEFAULT 7
        CONSTRAINT delivery_settings_lookahead_ck CHECK (standard_lookahead_days BETWEEN 1 AND 30),
    ADD COLUMN standard_no_delivery_weekdays smallint[] NOT NULL DEFAULT '{}'
        CONSTRAINT delivery_settings_weekdays_ck CHECK (
            standard_no_delivery_weekdays <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::smallint[]
            -- ⚠ Never all seven: a served address must always be offered a standard day (FR-020).
            AND NOT (standard_no_delivery_weekdays @> ARRAY[1, 2, 3, 4, 5, 6, 7]::smallint[])
        ),
    ADD COLUMN carrier_lead_days             int NOT NULL DEFAULT 1
        CONSTRAINT delivery_settings_carrier_lead_ck CHECK (carrier_lead_days >= 0);
COMMENT ON COLUMN public.delivery_settings.slot_hold_min IS 'How long a same-day place is held from the payment-intent call (069 FR-009a).';
COMMENT ON COLUMN public.delivery_settings.sameday_hub_turnaround_min IS 'Collection run time → the goods are ready to leave the hub (069 research R5). A slot is offered only while a makeable run satisfies run_time + this <= slot start. ⚠ Default 60 is a STATED ASSUMPTION awaiting one real timed round, never a measurement.';
COMMENT ON COLUMN public.delivery_settings.standard_lookahead_days IS 'How many DELIVERABLE days a customer may choose from (069 FR-041). Non-delivery days do not count toward it.';
COMMENT ON COLUMN public.delivery_settings.standard_no_delivery_weekdays IS 'ISO weekdays (1 = Monday … 7 = Sunday) with no standard delivery (069 FR-042).';
COMMENT ON COLUMN public.delivery_settings.carrier_lead_days IS 'Hub handover → delivered by the outside carrier (069 research R6). Decides the earliest standard day and when a package is due for handover. ⚠ Default 1 is a STATED ASSUMPTION: there is no carrier contract to read it from.';

-- ── The window, as sold ──────────────────────────────────────────────────────────────────────────
ALTER TABLE public.order_package_delivery
    ADD COLUMN slot_id      uuid REFERENCES public.delivery_slot (id) ON DELETE RESTRICT,
    ADD COLUMN window_start timestamptz,
    ADD COLUMN window_end   timestamptz,
    ADD CONSTRAINT order_package_delivery_window_ck CHECK (
        (slot_id IS NULL AND window_start IS NULL AND window_end IS NULL)
        OR (slot_id IS NOT NULL AND window_start IS NOT NULL AND window_end IS NOT NULL
            AND method = 'same_day')
    );
COMMENT ON COLUMN public.order_package_delivery.window_start IS 'The same-day window the customer was sold (069), as an INSTANT. NULL for standard packages and for every order placed before 069. ⚠ A snapshot: editing or disabling the slot never changes it (FR-026).';
COMMENT ON COLUMN public.order_package_delivery.promised_from IS 'The delivery DAY (Melbourne date). ⚠ Unwritten from 047 until 069 (research R1). From 069: equal to promised_to — today for same-day, the customer''s chosen day for standard.';

-- +goose Down
-- Dev single-step rollback only; lossy — destroys every slot, booking and chosen window.
ALTER TABLE public.order_package_delivery
    DROP CONSTRAINT IF EXISTS order_package_delivery_window_ck,
    DROP COLUMN IF EXISTS window_end,
    DROP COLUMN IF EXISTS window_start,
    DROP COLUMN IF EXISTS slot_id;
ALTER TABLE public.delivery_settings
    DROP COLUMN IF EXISTS carrier_lead_days,
    DROP COLUMN IF EXISTS standard_no_delivery_weekdays,
    DROP COLUMN IF EXISTS standard_lookahead_days,
    DROP COLUMN IF EXISTS sameday_hub_turnaround_min,
    DROP COLUMN IF EXISTS slot_hold_min;
DROP TABLE IF EXISTS public.delivery_non_delivery_date;
DROP VIEW  IF EXISTS public.delivery_slot_load;
DROP TABLE IF EXISTS public.delivery_slot_booking;
DROP TABLE IF EXISTS public.delivery_slot;

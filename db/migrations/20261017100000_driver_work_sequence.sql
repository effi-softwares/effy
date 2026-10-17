-- +goose Up
-- 093 — driver work in one order, and trips that join up.
--
-- Three facts the order of work needs that the round rows cannot state: a package declared missing at
-- loading or check-in (and what a dispatcher decided), a dispatcher's waiver of the cross-run gate for
-- one run, and the driver's daily check of their vehicle. Everything else (a run's stage, whether it is
-- overdue, whether it was worked out of order) is derived from the round rows on read.

CREATE TABLE public.package_hold (
    id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_fulfillment_id  uuid        NOT NULL REFERENCES public.shop_fulfillment (id),
    step                 text        NOT NULL CHECK (step IN ('load', 'checkin')),
    reason               text        NOT NULL
                                     CHECK (reason IN ('not_at_hub', 'damaged', 'wrong_temperature', 'not_in_van', 'other')),
    note                 text        NULL,
    driver_id            uuid        NOT NULL REFERENCES public.driver (id),
    round_id             uuid        NOT NULL REFERENCES public.driver_round (id),
    -- The declaring request's changeId: a retried load or check-in holds each package once.
    change_id            uuid        NOT NULL,
    created_at           timestamptz NOT NULL DEFAULT now(),
    resolution           text        NULL CHECK (resolution IN ('found', 'lost')),
    resolved_by_sub      text        NULL,
    resolved_at          timestamptz NULL,
    CONSTRAINT package_hold_once UNIQUE (change_id, shop_fulfillment_id),
    CONSTRAINT package_hold_other_note CHECK (reason <> 'other' OR length(btrim(coalesce(note, ''))) > 0),
    CONSTRAINT package_hold_reason_step CHECK ((reason = 'not_in_van') = (step = 'checkin')),
    CONSTRAINT package_hold_resolved CHECK ((resolution IS NULL) = (resolved_at IS NULL))
);
-- One open hold per package.
CREATE UNIQUE INDEX package_hold_open_idx ON public.package_hold (shop_fulfillment_id) WHERE resolution IS NULL;
CREATE INDEX package_hold_package_idx ON public.package_hold (shop_fulfillment_id);

COMMENT ON TABLE public.package_hold IS
    '093 — a package declared missing by a driver at loading (step load: its delivery round_package row is removed) or at hub check-in (step checkin: never arrived). While open, or once resolved lost, the planner does not gather it. Resolved found, it is planned again.';

CREATE TABLE public.round_sequence_waiver (
    round_id    uuid        PRIMARY KEY REFERENCES public.driver_round (id),
    reason      text        NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
    staff_sub   text        NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.round_sequence_waiver IS
    '093 — a dispatcher allowed this run to skip the cross-run gate (load while still holding collected or to-return parcels; collect while deliveries are open), with a reason. One per run.';

CREATE TABLE public.vehicle_check (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id      uuid        NOT NULL REFERENCES public.driver (id),
    vehicle_id     uuid        NOT NULL REFERENCES public.vehicle (id),
    -- The Melbourne day the check covers.
    local_date     date        NOT NULL,
    answers        jsonb       NOT NULL,
    unsafe         boolean     NOT NULL,
    minor          boolean     NOT NULL,
    change_id      uuid        NOT NULL UNIQUE,
    created_at     timestamptz NOT NULL DEFAULT now(),
    cleared_by_sub text        NULL,
    cleared_at     timestamptz NULL,
    clear_note     text        NULL,
    CONSTRAINT vehicle_check_once_a_day UNIQUE (driver_id, vehicle_id, local_date),
    CONSTRAINT vehicle_check_cleared CHECK ((cleared_at IS NULL) = (cleared_by_sub IS NULL))
);
COMMENT ON TABLE public.vehicle_check IS
    '093 — a driver''s pre-trip check of the vehicle they hold, once a day. An unsafe answer not yet cleared by a dispatcher means the driver is given no work (eligibility reason vehicle_unsafe); no check today means vehicle_check_due.';

ALTER TABLE public.delivery_settings
    ADD COLUMN load_overdue_min       int     NOT NULL DEFAULT 20 CHECK (load_overdue_min BETWEEN 5 AND 240),
    ADD COLUMN checkin_overdue_min    int     NOT NULL DEFAULT 30 CHECK (checkin_overdue_min BETWEEN 5 AND 240),
    -- Off until the operator turns it on: enforced before the driver app can answer it, every driver
    -- would be given no work.
    ADD COLUMN vehicle_check_required boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.delivery_settings.load_overdue_min IS
    '093 — dispatch is told when a delivery run has been open this many minutes and is not loaded.';
COMMENT ON COLUMN public.delivery_settings.vehicle_check_required IS
    '093 — drivers must check the vehicle they hold once a day before they are given work. Off by default so it can be switched on once the driver app that asks for it is installed.';
COMMENT ON COLUMN public.delivery_settings.checkin_overdue_min IS
    '093 — dispatch is told when a collection run has had every shop settled this many minutes with no hub check-in.';

-- +goose Down
ALTER TABLE public.delivery_settings DROP COLUMN vehicle_check_required, DROP COLUMN checkin_overdue_min, DROP COLUMN load_overdue_min;
DROP TABLE public.vehicle_check;
DROP TABLE public.round_sequence_waiver;
DROP TABLE public.package_hold;

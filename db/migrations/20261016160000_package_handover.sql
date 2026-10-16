-- +goose Up
-- 090 — how each package was handed over at each step: scanned, typed, or ticked by hand (driver
-- backlog H6–H10, read by H12). Append-only: a package collected, checked in, loaded and delivered has
-- four rows. Written by the driver service inside each hand-over's own transaction.

CREATE TABLE public.package_handover (
    id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_fulfillment_id  uuid        NOT NULL REFERENCES public.shop_fulfillment (id),
    round_id             uuid        NOT NULL REFERENCES public.driver_round (id),
    driver_id            uuid        NOT NULL REFERENCES public.driver (id),
    step                 text        NOT NULL CHECK (step IN ('collect', 'checkin', 'load', 'deliver', 'return')),
    -- ⚠ Not `method`: that name belonged to a column the delivery model removed (083), and the
    -- schema-drift guard tracks dropped names across the whole schema.
    handover_method      text        NOT NULL CHECK (handover_method IN ('scan', 'typed', 'manual')),
    -- The hand-over's own changeId: a retried hand-over records each package once.
    change_id            uuid        NOT NULL,
    recorded_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT package_handover_once UNIQUE (change_id, shop_fulfillment_id)
);
CREATE INDEX package_handover_package_idx ON public.package_handover (shop_fulfillment_id);

COMMENT ON TABLE public.package_handover IS
    '090 — one row per package per hand-over (collect, checkin, load, deliver, return) and how it was done (scan, typed, manual). Append-only.';

-- +goose Down
DROP TABLE public.package_handover;

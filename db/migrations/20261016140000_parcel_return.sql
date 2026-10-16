-- +goose Up
-- 088 — return failed parcels to the hub (driver backlog A4).
--
-- A parcel on a failed drop stays `assigned` on its delivery round — it is in the driver's van — until
-- it is checked back in at the hub. The return moves it to `returned` (freeing the open-assignment
-- index, so it can be planned again once staff choose its next step) and records who returned it.
-- "To return" is derived, never stored (research R1); only the return itself is a fact.

ALTER TABLE public.round_package DROP CONSTRAINT round_package_state_check;
ALTER TABLE public.round_package ADD CONSTRAINT round_package_state_check
    CHECK (state IN ('assigned', 'picked_up', 'not_available', 'delivered', 'failed', 'returned'));

CREATE TABLE public.parcel_return (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id         uuid        NOT NULL REFERENCES public.driver_round (id),
    driver_id        uuid        NOT NULL REFERENCES public.driver (id),
    -- A driver at the hub, or a staff member on their behalf (FR-012).
    recorded_by      text        NOT NULL CHECK (recorded_by IN ('driver', 'staff')),
    recorded_by_sub  text        NOT NULL,
    package_count    int         NOT NULL CHECK (package_count > 0),
    returned_at      timestamptz NOT NULL DEFAULT now(),
    -- One driver or staff action, however many times it is sent (FR-005).
    change_id        uuid        NOT NULL UNIQUE
);
CREATE INDEX parcel_return_round_idx ON public.parcel_return (round_id);

ALTER TABLE public.round_package
    ADD COLUMN return_id uuid NULL REFERENCES public.parcel_return (id);

COMMENT ON TABLE public.parcel_return IS
    '088 — parcels from a failed delivery checked back in at the hub: who, when, which round. The parcels are the round_package rows carrying this return_id.';
COMMENT ON COLUMN public.round_package.return_id IS
    '088 — the return that brought this parcel back to the hub after a failed delivery; set with state = returned.';

-- +goose Down
-- +goose StatementBegin
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.round_package WHERE state = 'returned') THEN
        RAISE EXCEPTION '088 down: parcels have been returned; refusing to drop their record';
    END IF;
END
$$;
-- +goose StatementEnd
ALTER TABLE public.round_package DROP COLUMN return_id;
DROP TABLE public.parcel_return;
ALTER TABLE public.round_package DROP CONSTRAINT round_package_state_check;
ALTER TABLE public.round_package ADD CONSTRAINT round_package_state_check
    CHECK (state IN ('assigned', 'picked_up', 'not_available', 'delivered', 'failed'));

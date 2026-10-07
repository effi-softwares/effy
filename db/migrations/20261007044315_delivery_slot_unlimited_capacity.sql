-- +goose Up
-- 069 amendment — a same-day slot has NO capacity limit unless the back-office sets one.
--
-- NULL means "no limit": the slot never fills and is closed only by its cutoff and the collection
-- schedule. A number is a limit an operator chose. ⚠ Additive: existing slots keep the number they
-- have. delivery_slot_capacity_ck (capacity >= 1) is unchanged and passes NULL.
ALTER TABLE public.delivery_slot ALTER COLUMN capacity DROP NOT NULL;
COMMENT ON COLUMN public.delivery_slot.capacity IS 'How many DELIVERIES the slot takes — one per order per address, whatever the number of packages (FR-008). Platform-wide, not per zone. ⚠ NULL = NO LIMIT, which is the default: a limit exists only where the back-office set one.';

-- +goose Down
-- Dev single-step rollback only; lossy — an unlimited slot has no number to go back to, so it is
-- given one large enough never to fill.
UPDATE public.delivery_slot SET capacity = 100000 WHERE capacity IS NULL;
ALTER TABLE public.delivery_slot ALTER COLUMN capacity SET NOT NULL;
COMMENT ON COLUMN public.delivery_slot.capacity IS 'How many DELIVERIES the slot takes — one per order per address, whatever the number of packages (FR-008). Platform-wide, not per zone.';

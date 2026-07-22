-- +goose Up
-- Add the `delivered` state to the shop fulfilment lifecycle — the second half of the DEV-ONLY driver
-- stub (020). The placeholder driver flow is now: ready_for_pickup → collected (picked up) → delivered.
-- Both collected and delivered are written ONLY by the dev stub scripts (no deployed route); they are
-- removed together when the real driver slice ships. Widen the status CHECK; nothing else changes.
-- See specs/020-shop-order-fulfillment/data-model.md §1 (amended).

ALTER TABLE public.shop_fulfillment DROP CONSTRAINT shop_fulfillment_status_check;
ALTER TABLE public.shop_fulfillment ADD CONSTRAINT shop_fulfillment_status_check
    CHECK (status IN ('pending', 'received', 'picking', 'ready_for_pickup', 'collected', 'delivered'));

COMMENT ON COLUMN public.shop_fulfillment.status IS
  'The shop working lifecycle (020) + dev driver-stub tail: pending -> received (implicit on first open) -> picking -> ready_for_pickup (TERMINAL for the shop) -> collected (dev stub: picked up) -> delivered (dev stub: delivered). Forward-only except the single permitted reversal ready_for_pickup -> picking. collected/delivered are immutable and written only by the dev stubs.';

-- +goose Down
-- Forward-only platform (003); dev single-step rollback only. LOSSY: any `delivered` portion is reset to
-- `collected` before the CHECK is narrowed, since the pre-amendment machine has no `delivered`.
UPDATE public.shop_fulfillment SET status = 'collected' WHERE status = 'delivered';

ALTER TABLE public.shop_fulfillment DROP CONSTRAINT shop_fulfillment_status_check;
ALTER TABLE public.shop_fulfillment ADD CONSTRAINT shop_fulfillment_status_check
    CHECK (status IN ('pending', 'received', 'picking', 'ready_for_pickup', 'collected'));

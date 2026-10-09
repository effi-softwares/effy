-- +goose Up
-- 081 — back-office moves an order between "Delivered by Effy" and "Courier delivery", and makes it
-- right with the customer.
--
-- ⚠ ADDITIVE. One new table, two CHECKs widened on public.refund, one notification type. The services
-- running when this is applied read none of it. Nothing here moves an order: an order is moved only by
-- @effy/edge-shared/delivery override.ts, and only an order with a recorded delivery type (079) — so
-- until the new delivery model is switched on there is nothing to move.

-- ── 1. A move, and what the customer received for it ─────────────────────────────────────────────

CREATE TABLE public.delivery_override (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- ⚠ The move ITSELF — from, to, who, when, the staff reason — is 079's history row, written by its
    -- one writer (recordDeliveryType). This row holds what E7 adds to it: the window, the courier, the
    -- money. One per staff change, never more.
    change_id           uuid NOT NULL UNIQUE REFERENCES public.order_delivery_type_change (id) ON DELETE RESTRICT,
    order_id            uuid NOT NULL REFERENCES public."order" (id) ON DELETE RESTRICT,
    to_type             text NOT NULL CHECK (to_type IN ('effy', 'courier')),
    -- The window RELEASED (to courier) or TAKEN (back to Effy). All four or none.
    slot_id             uuid REFERENCES public.delivery_slot (id) ON DELETE RESTRICT,
    delivery_date       date,
    window_start        timestamptz,
    window_end          timestamptz,
    courier_service_id  uuid REFERENCES public.courier_service (id) ON DELETE RESTRICT,
    collection          text CHECK (collection IN ('hub', 'supplier')),
    paid_delivery_cents int  NOT NULL CHECK (paid_delivery_cents >= 0),
    courier_fee_cents   int  CHECK (courier_fee_cents >= 0),
    difference_cents    int  CHECK (difference_cents >= 0),
    compensation        text NOT NULL CHECK (compensation IN (
                            'points_difference', 'free_delivery_points', 'free_delivery_refund',
                            'refund_difference', 'none')),
    amount_cents        int  NOT NULL CHECK (amount_cents >= 0),
    points              int  CHECK (points >= 0),
    points_entry_id     uuid UNIQUE REFERENCES public.points_entry (id) ON DELETE RESTRICT,
    refund_id           uuid UNIQUE REFERENCES public.refund (id) ON DELETE RESTRICT,
    compensation_note   text CHECK (compensation_note IS NULL OR length(compensation_note) <= 500),
    actor_sub           text NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT delivery_override_window_ck CHECK (
        (slot_id IS NULL) = (delivery_date IS NULL)
        AND (slot_id IS NULL) = (window_start IS NULL)
        AND (slot_id IS NULL) = (window_end IS NULL)),
    -- A move to courier names the courier and is priced against it; a move back names neither.
    CONSTRAINT delivery_override_courier_ck CHECK (
        (to_type = 'courier') = (courier_service_id IS NOT NULL)
        AND (to_type = 'courier') = (collection IS NOT NULL)
        AND (to_type = 'courier') = (courier_fee_cents IS NOT NULL)
        AND (to_type = 'courier') = (difference_cents IS NOT NULL)),
    -- ⚠ Moving back gives nothing and takes nothing (spec FR-014).
    CONSTRAINT delivery_override_back_ck CHECK (
        to_type = 'courier' OR (compensation = 'none' AND amount_cents = 0)),
    -- A points kind is points and only points; a refund kind is a refund and only a refund.
    CONSTRAINT delivery_override_means_ck CHECK (
        (compensation IN ('points_difference', 'free_delivery_points') AND refund_id IS NULL AND points IS NOT NULL)
        OR (compensation IN ('free_delivery_refund', 'refund_difference') AND points_entry_id IS NULL AND points IS NULL)
        OR (compensation = 'none' AND points_entry_id IS NULL AND refund_id IS NULL AND points IS NULL AND amount_cents = 0)),
    -- Nothing given to a customer whose order was moved must say why (FR-007).
    CONSTRAINT delivery_override_none_note_ck CHECK (
        compensation <> 'none' OR to_type = 'effy'
        OR (compensation_note IS NOT NULL AND btrim(compensation_note) <> ''))
);
CREATE INDEX delivery_override_order_idx ON public.delivery_override (order_id, created_at);
COMMENT ON TABLE public.delivery_override IS 'Every move of an order between Effy and courier delivery made by back-office (081), 1:1 with its order_delivery_type_change row: the window released or taken, the courier given, what the customer paid for delivery, the courier fee, and the compensation staff chose. APPEND-ONLY. ⚠ ONE WRITER — @effy/edge-shared/delivery override.ts (override.guard.test.ts).';
COMMENT ON COLUMN public.delivery_override.paid_delivery_cents IS 'order.delivery_fee_amount at the move — what the customer paid for delivery, small-order charge and window surcharge included.';
COMMENT ON COLUMN public.delivery_override.courier_fee_cents IS 'What the active courier fee table charges this basket at the move (courierFee over the order''s stored weight and basket). ⚠ STAFF ONLY: never on a customer or shop contract.';
COMMENT ON COLUMN public.delivery_override.difference_cents IS 'max(0, paid − courier fee). Never negative: a dearer courier is Effy''s cost, never the customer''s (FR-010).';
COMMENT ON COLUMN public.delivery_override.amount_cents IS 'What was given: the points'' value, or the refund''s amount. 0 for none, and for a points/refund kind whose amount came to zero (nothing is then written to the ledger or the provider).';
COMMENT ON COLUMN public.delivery_override.refund_id IS 'The refund (kind delivery) recorded IN the move''s transaction and submitted after it commits (055''s record-then-submit).';

-- Back-office runs as the platform's own role; the shopper role must never rewrite it.
REVOKE UPDATE, DELETE ON public.delivery_override FROM effy_shopper;

-- ── 2. A refund that is a delivery compensation says so ──────────────────────────────────────────
-- ⚠ READER AUDIT for refund.kind / refund.reason: every reader SELECTs them as strings (orders
-- refunds.ts, shop insights, the customer's refund lines) — none switches exhaustively and fails on a
-- new value. ⚠ `courier_override` is NOT an operator reason: no refund dialog offers it.

ALTER TABLE public.refund DROP CONSTRAINT refund_kind_check;
ALTER TABLE public.refund ADD CONSTRAINT refund_kind_check
    CHECK (kind IN ('item', 'goodwill', 'cancellation', 'external', 'delivery'));
ALTER TABLE public.refund DROP CONSTRAINT refund_reason_check;
ALTER TABLE public.refund ADD CONSTRAINT refund_reason_check
    CHECK (reason IN ('item_not_supplied', 'item_unusable', 'order_cancelled', 'goodwill', 'external', 'courier_override'));
-- The two go together and only together.
ALTER TABLE public.refund ADD CONSTRAINT refund_delivery_reason_ck
    CHECK ((kind = 'delivery') = (reason = 'courier_override'));
COMMENT ON CONSTRAINT refund_delivery_reason_ck ON public.refund IS '081 — a delivery refund is the compensation for a move to courier (public.delivery_override.refund_id), and nothing else carries its reason.';

-- ── 3. The customer is told ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.notification_request DROP CONSTRAINT notification_request_type_check;
ALTER TABLE public.notification_request ADD CONSTRAINT notification_request_type_check
    CHECK (type IN (
        'order_paid', 'order_ready', 'order_out_for_delivery', 'order_delivered',
        'shop_new_order', 'run_assigned',
        'shop_awaiting_pick', 'shop_out_of_stock', 'shop_low_stock', 'shop_refund_proposed',
        'shop_product_approved', 'shop_product_sent_back',
        'points_credited', 'points_expiring',
        'order_with_courier',
        'order_delivery_changed'
    ));

-- +goose Down
-- Dev-only single-step reversal. ⚠ Refuses rather than throw away a record that money moved.
-- +goose StatementBegin
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.delivery_override) THEN
        RAISE EXCEPTION '081 down: an order has been moved; refusing to drop its record';
    END IF;
    IF EXISTS (SELECT 1 FROM public.refund WHERE kind = 'delivery') THEN
        RAISE EXCEPTION '081 down: a delivery refund exists; refusing to narrow refund.kind';
    END IF;
END
$$;
-- +goose StatementEnd
ALTER TABLE public.notification_request DROP CONSTRAINT notification_request_type_check;
DELETE FROM public.notification_request WHERE type = 'order_delivery_changed';
ALTER TABLE public.notification_request ADD CONSTRAINT notification_request_type_check
    CHECK (type IN (
        'order_paid', 'order_ready', 'order_out_for_delivery', 'order_delivered',
        'shop_new_order', 'run_assigned',
        'shop_awaiting_pick', 'shop_out_of_stock', 'shop_low_stock', 'shop_refund_proposed',
        'shop_product_approved', 'shop_product_sent_back',
        'points_credited', 'points_expiring',
        'order_with_courier'
    ));
ALTER TABLE public.refund DROP CONSTRAINT refund_delivery_reason_ck;
ALTER TABLE public.refund DROP CONSTRAINT refund_reason_check;
ALTER TABLE public.refund ADD CONSTRAINT refund_reason_check
    CHECK (reason IN ('item_not_supplied', 'item_unusable', 'order_cancelled', 'goodwill', 'external'));
ALTER TABLE public.refund DROP CONSTRAINT refund_kind_check;
ALTER TABLE public.refund ADD CONSTRAINT refund_kind_check
    CHECK (kind IN ('item', 'goodwill', 'cancellation', 'external'));
DROP TABLE public.delivery_override;

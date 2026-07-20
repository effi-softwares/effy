-- +goose Up
-- 020-shop-order-fulfillment: give the 019 fan-out a consumer.
--
-- 019 writes one public.shop_fulfillment row per (order, shop) and NOTHING has ever read it — its
-- status has never left 'pending' because no code path could change it. This migration opens that
-- lifecycle and adds the two tables the shop floor needs: what has actually been gathered, and who
-- did what. Everything lives in `public` (operational); raw SQL, text CHECK enums (no native PG
-- enums, no triggers), an index on every FK, COMMENT ON everything.
--
-- Deliberately NOT here:
--   * public.order_item is UNTOUCHED. It is a receipt line — an immutable record of what was bought
--     and charged. Picking progress lives in its own table so a shop-floor action can never mutate a
--     financial record (research R4).
--   * public."order" is UNTOUCHED. The delivery promise is a domain seam derived from placed_at, not
--     a column; 021-delivery-zones-pricing owns the real model and may key it per-shop (research R7).
-- See specs/020-shop-order-fulfillment/data-model.md.

-- ── The state machine: widen the portion's status ──────────────────────────────────────────────
-- 019 shipped CHECK (status IN ('pending','received')) with the comment "received reserved for the
-- later shop-surfacing slice (no consumer flips it here)". This slice IS that consumer, so the enum
-- grows rather than being replaced — no data migration, no rename, no rewrite of the fan-out.

ALTER TABLE public.shop_fulfillment DROP CONSTRAINT shop_fulfillment_status_check;
ALTER TABLE public.shop_fulfillment ADD CONSTRAINT shop_fulfillment_status_check
    CHECK (status IN ('pending', 'received', 'picking', 'ready_for_pickup', 'collected'));

COMMENT ON COLUMN public.shop_fulfillment.status IS
    'The shop working lifecycle (020): pending (fan-out, nobody has looked) -> received (a human acknowledged, implicit on first open) -> picking -> ready_for_pickup (TERMINAL for the shop) -> collected (dev-only pickup stub, immutable). Forward-only except the single permitted reversal ready_for_pickup -> picking.';

-- Time-in-state, so an order sitting unacknowledged or half-picked is identifiable rather than
-- invisible. A column and not a derivation from fulfillment_event: the queue re-renders on every
-- poll, and making that an aggregate over append-only history is needlessly expensive. Written in
-- the same statement as every transition, so it cannot drift.
ALTER TABLE public.shop_fulfillment
    ADD COLUMN state_changed_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.shop_fulfillment.state_changed_at IS
    'When status last changed (020). Powers time-in-state and at-risk escalation. Backfilled to the migration time for pre-existing rows, which is harmless: no shop has ever seen those orders.';

-- ── Pick progress and shortfall ────────────────────────────────────────────────────────────────

CREATE TABLE public.fulfillment_item (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_fulfillment_id  uuid NOT NULL REFERENCES public.shop_fulfillment (id) ON DELETE CASCADE,
    order_item_id        uuid NOT NULL REFERENCES public.order_item (id) ON DELETE CASCADE,
    ordered_quantity     int NOT NULL CHECK (ordered_quantity >= 1),
    gathered_quantity    int NOT NULL DEFAULT 0 CHECK (gathered_quantity >= 0),
    unavailable_quantity int NOT NULL DEFAULT 0 CHECK (unavailable_quantity >= 0),
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    UNIQUE (shop_fulfillment_id, order_item_id),
    CONSTRAINT fulfillment_item_accounted_ck
        CHECK (gathered_quantity + unavailable_quantity <= ordered_quantity)
);

COMMENT ON TABLE public.fulfillment_item IS
    'Pick progress for one order line within one shop portion (020). Rows are created lazily on entry to picking, one per order_item of the portion. Deliberately NOT columns on order_item: that is a receipt line, and a picking action must never mutate a financial record.';
COMMENT ON COLUMN public.fulfillment_item.ordered_quantity IS
    'Copied from order_item.quantity at row creation. Denormalized so the accounting CHECK is enforceable in-row and the receipt is never read to validate a pick.';
COMMENT ON COLUMN public.fulfillment_item.unavailable_quantity IS
    'The SHORTFALL — paid for, not supplied. Carries NO financial effect in 020 (no refund is issued). ordered_quantity - gathered_quantity on a terminal portion is the outstanding obligation the refunds slice must resolve; it is stored as a quantity precisely so that debt stays queryable rather than reconstructed.';
COMMENT ON CONSTRAINT fulfillment_item_accounted_ck ON public.fulfillment_item IS
    'Cannot account for more than were ordered. Under-accounting is legal — that is simply "still picking".';

CREATE INDEX fulfillment_item_portion_idx ON public.fulfillment_item (shop_fulfillment_id);
CREATE INDEX fulfillment_item_order_item_idx ON public.fulfillment_item (order_item_id);

-- ── Audit: the sole accountability control ─────────────────────────────────────────────────────
-- No fulfilment action is role-restricted (both shop_manager and shop_staff have full access), so
-- this table is not decorative — it is the ONLY thing that makes an action attributable. Written in
-- the same transaction as the change it records, so it can never disagree with the current state.

CREATE TABLE public.fulfillment_event (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_fulfillment_id uuid NOT NULL REFERENCES public.shop_fulfillment (id) ON DELETE CASCADE,
    actor_staff_id      uuid REFERENCES public.shop_staff (id) ON DELETE SET NULL,
    event_type          text NOT NULL CHECK (event_type IN (
                            'state_changed', 'item_gathered', 'item_unavailable', 'item_restored')),
    from_status         text,
    to_status           text,
    order_item_id       uuid REFERENCES public.order_item (id) ON DELETE SET NULL,
    quantity            int,
    occurred_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.fulfillment_event IS
    'Append-only fulfilment audit (020). Rows are never updated or deleted. Because no fulfilment action is manager-gated, this is the sole accountability control — including the reversal trail, so a prematurely-completed-then-rewound order leaves visible evidence.';
COMMENT ON COLUMN public.fulfillment_event.actor_staff_id IS
    'NULLABLE + ON DELETE SET NULL by design: the audit record must survive the operator record being removed. NULL means "the person is gone", never "nobody did it".';
COMMENT ON COLUMN public.fulfillment_event.from_status IS
    'Populated for state_changed, including the single permitted reversal.';
COMMENT ON COLUMN public.fulfillment_event.quantity IS
    'Populated for the item events — the absolute quantity recorded, not a delta.';

CREATE INDEX fulfillment_event_portion_idx
    ON public.fulfillment_event (shop_fulfillment_id, occurred_at DESC);
CREATE INDEX fulfillment_event_actor_idx ON public.fulfillment_event (actor_staff_id);

-- +goose Down
-- Forward-only platform (constitution): this exists for dev single-step rollback only and is LOSSY.
-- It cannot restore rows already written to the widened states, so portions left in 'picking',
-- 'ready_for_pickup' or 'collected' are reset to 'received' before the CHECK is narrowed — which is
-- exactly why the platform does not rely on down migrations.
DROP TABLE IF EXISTS public.fulfillment_event;
DROP TABLE IF EXISTS public.fulfillment_item;

ALTER TABLE public.shop_fulfillment DROP COLUMN IF EXISTS state_changed_at;

UPDATE public.shop_fulfillment
   SET status = 'received'
 WHERE status IN ('picking', 'ready_for_pickup', 'collected');

ALTER TABLE public.shop_fulfillment DROP CONSTRAINT shop_fulfillment_status_check;
ALTER TABLE public.shop_fulfillment ADD CONSTRAINT shop_fulfillment_status_check
    CHECK (status IN ('pending', 'received'));

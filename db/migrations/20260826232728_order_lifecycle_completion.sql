-- +goose Up
-- 053-order-lifecycle-completion: letting an order actually finish.
--
-- ⚠ THE DEFECT THIS CLOSES. Since 049 a package collected from a shop is checked in at the hub, and
-- there the two delivery methods diverge: a SAME-DAY package goes on to a delivery run and is closed
-- with proof, while a STANDARD package simply stops. Nothing in the platform could record that it
-- went any further, so `shop_fulfillment.status` stayed 'collected' forever, `orders/stage.go` mapped
-- that to "on the way" forever, and the order never finished. Standard is the DEFAULT method
-- (same-day needs a zone flag and a pre-cutoff order, 047), so this is what happened to most orders.
--
-- Three changes, all in `public` (house style: raw SQL, text CHECK enums, an index on every FK,
-- COMMENT ON everything; no native PG enums, no triggers). See
-- specs/053-order-lifecycle-completion/data-model.md.
--
--   • carrier_handoff   — a standard package left Effy's care for an outside carrier.
--   • package_arrival   — a package reached the customer, WHATEVER route it took.
--   • notification_request.channel — one intent, delivered by push AND/OR email.
--
-- ⚠ WHAT THIS MIGRATION DELIBERATELY DOES NOT DO: it does not touch
-- `shop_fulfillment.status`. No new state, no widened CHECK. Research R3: a package in a carrier's
-- van and a package on the hub floor are the SAME FACT to a shopper — both "on the way" — so a
-- `handed_over` status would exist only to be mapped, and it would be a second source of truth that
-- can disagree with the handoff row. The row's EXISTENCE is the precondition on `collected →
-- delivered`. The platform already works this way: `collection_task_issue` for a shortfall,
-- `proof_of_delivery` alongside a `delivery_task`.

-- ── public.carrier_handoff — the package left, and we know who has it ────────────────────────────

CREATE TABLE public.carrier_handoff (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_fulfillment_id uuid NOT NULL REFERENCES public.shop_fulfillment (id) ON DELETE RESTRICT,
    -- ⚠ NULLABLE BY DESIGN, and this is a FIRST-CLASS state, not a gap (FR-003). Effy has no carrier
    -- contract yet, so most handovers genuinely have no reference to record. A NULL here must never
    -- be rendered as missing data, a warning, or an unfinished step.
    reference           text,
    carrier_name        text,
    handed_over_at      timestamptz NOT NULL DEFAULT now(),
    -- The back-office subject who recorded it. A SNAPSHOT, not an FK: `admin.staff` lives in another
    -- schema and a staff record may later be removed without rewriting history (046's `staff_sub`).
    recorded_by_sub     text NOT NULL,
    note                text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    -- A package is handed over exactly ONCE. A UNIQUE makes a double handover UNREPRESENTABLE rather
    -- than merely refused by code that could be bypassed or could race.
    CONSTRAINT carrier_handoff_package_uq UNIQUE (shop_fulfillment_id)
);
COMMENT ON TABLE  public.carrier_handoff IS 'One row per package handed to an outside carrier at the hub (053). Its EXISTENCE is the precondition for the collected → delivered transition on a standard package (FR-006); there is deliberately no `handed_over` status on shop_fulfillment (research R3). No carrier table exists because no carrier contract exists — modelling one would invent an operator decision the constitution forbids inferring.';
COMMENT ON COLUMN public.carrier_handoff.reference IS '⚠ The carrier consignment/tracking reference WHERE KNOWN. NULL is an ordinary, COMPLETE state (FR-003) — never a fault, never a warning. NEVER shown to a customer (FR-022): references are per-package and packages are per-shop, so listing them would disclose how many shops served the order, which FR-021 forbids.';
COMMENT ON COLUMN public.carrier_handoff.recorded_by_sub IS 'Snapshot of the acting back-office subject. No cross-schema FK (046 pattern).';

-- ── public.package_arrival — it got there, and we know how we learned that ───────────────────────

CREATE TABLE public.package_arrival (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_fulfillment_id uuid NOT NULL REFERENCES public.shop_fulfillment (id) ON DELETE RESTRICT,
    arrived_at          timestamptz NOT NULL DEFAULT now(),
    -- ⚠ HOW WE LEARNED IT (FR-008). `carrier_signal` is DECLARED AND UNUSED on purpose: it is the
    -- seat FR-009 reserves, so the day a real carrier integration lands it is a new VALUE rather than
    -- a new design. It also makes the audit question answerable — which of these arrivals did a
    -- human assert, and which were observed?
    source              text NOT NULL CHECK (source IN ('driver_proof', 'staff_recorded', 'carrier_signal')),
    -- The staff subject for `staff_recorded`. NULL for `driver_proof`, where the driver is already
    -- attributable through delivery_task → proof_of_delivery.
    recorded_by_sub     text,
    delivery_task_id    uuid REFERENCES public.delivery_task (id) ON DELETE SET NULL,
    note                text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    -- A package arrives exactly ONCE. This is the SECOND, INDEPENDENT guarantee behind FR-005: the
    -- code's status-guarded UPDATE is the first, and the database refuses a double arrival even if
    -- that code were ever called twice or raced against itself.
    CONSTRAINT package_arrival_package_uq UNIQUE (shop_fulfillment_id),
    -- An unattributable staff assertion must be UNREPRESENTABLE (SC-010). With no carrier signal,
    -- "arrived" is a CLAIM a person made about a package they never saw — the one thing that must
    -- always be traceable to whoever made it.
    CONSTRAINT package_arrival_staff_attributed CHECK (
        source <> 'staff_recorded' OR recorded_by_sub IS NOT NULL
    )
);
COMMENT ON TABLE  public.package_arrival IS 'One row per package that reached the customer (053), whatever route it took — an Effy driver''s same-day drop or a back-office record of a carrier delivery. ⚠ The DRIVER path writes this too (research R6): without that, every same-day arrival — the only kind the platform had ever recorded before this slice — would be unattributable and SC-010 false.';
COMMENT ON COLUMN public.package_arrival.source IS 'How the arrival was learned. driver_proof = an Effy driver closed a same-day drop with proof. staff_recorded = a back-office admin/manager asserted it (FR-015). carrier_signal = RESERVED and unused; the seat a future carrier integration takes (FR-009).';
CREATE INDEX package_arrival_delivery_task_idx ON public.package_arrival (delivery_task_id);
CREATE INDEX package_arrival_arrived_at_idx    ON public.package_arrival (arrived_at DESC);

-- ── public.notification_request — one intent, one row per channel ────────────────────────────────
--
-- ⚠ PURELY ADDITIVE, and the DEFAULT is what makes it so. Every existing row and every existing
-- producer (order_paid, order_ready, order_out_for_delivery, order_delivered, shop_new_order,
-- run_assigned — all push) keeps its exact current meaning without being touched. Existing
-- `dedupe_key` values have no channel segment and are NOT rewritten: they are already unique and
-- already drained, and rewriting a drained outbox key is how you re-send a message.
--
-- ⚠ WHY HERE AND NOT A NEW TABLE. Telling a customer their order arrived is ONE INTENT delivered on
-- TWO CHANNELS, not two messages. Modelling it this way puts "does this person have the app?" at
-- DELIVERY time, where it belongs, instead of at PRODUCTION time, where the arrival transition would
-- have to know and care. It also reuses the exactly-once dedupe_key that already works, the existing
-- drain schedule, and the existing pending|sent|failed|skipped vocabulary. (Research R8.)

ALTER TABLE public.notification_request
    ADD COLUMN channel         text NOT NULL DEFAULT 'push' CHECK (channel IN ('push', 'email')),
    -- ⚠ SNAPSHOTTED AT ENQUEUE, never resolved at send (052's rule). A customer who later changes
    -- their account email must not retroactively redirect a message about an order that has already
    -- arrived.
    ADD COLUMN recipient_email text;

ALTER TABLE public.notification_request
    ADD CONSTRAINT notification_request_email_addressed CHECK (
        channel <> 'email' OR recipient_email IS NOT NULL
    );

COMMENT ON COLUMN public.notification_request.channel IS 'How this intent is delivered (053). One event produces one row per channel it should reach. push = FCM/APNs to registered devices (skipped when there is no token — not a failure). email = SES via @effy/email-kit. ⚠ 053 uses the email channel for order_delivered ONLY; order_ready and order_out_for_delivery stay push-only, and order_paid MUST NOT gain one — it already has 052''s receipt via receipt_dispatch, and a second email for one event is a defect, not coverage.';
COMMENT ON COLUMN public.notification_request.recipient_email IS 'Snapshotted at enqueue for channel=email; NULL for push. A CHECK makes an email intent with nowhere to send unrepresentable.';

CREATE INDEX notification_request_channel_status_idx
    ON public.notification_request (channel, status)
    WHERE status = 'pending';

-- +goose Down
-- Dev-only single step-back (003). Forward-only in every other environment.
DROP INDEX IF EXISTS public.notification_request_channel_status_idx;
ALTER TABLE public.notification_request DROP CONSTRAINT IF EXISTS notification_request_email_addressed;
ALTER TABLE public.notification_request DROP COLUMN IF EXISTS recipient_email;
ALTER TABLE public.notification_request DROP COLUMN IF EXISTS channel;
DROP TABLE IF EXISTS public.package_arrival;
DROP TABLE IF EXISTS public.carrier_handoff;

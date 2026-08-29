-- +goose Up
-- 055-refunds-cancellation: giving the platform a way to give money back.
--
-- ⚠ THE DEFECT THIS CLOSES (gap register G3). Effy can take money and cannot return it. There is no
-- refund record, no way for staff to issue one, and no way for a shopper to ask. The shop's own
-- shortfall handler says so at the top of the file: a customer is charged for "something they will not
-- receive, and that debt is left queryable for a later refunds slice." This is that slice.
--
-- ⚠ AND EFFY ALREADY PUBLISHES A POLICY IT CANNOT HONOUR. The Refunds, Returns & Cancellations policy
-- is live on both customer surfaces, promises four outcomes, tells shoppers "to cancel, use the app" —
-- a control that does not exist — and invokes Australian Consumer Law guarantees that "cannot be
-- excluded". A published promise the product cannot keep is a different kind of defect from a missing
-- feature.
--
-- House style: raw SQL, text CHECK enums, an index on every FK, COMMENT ON everything; no native PG
-- enums, no triggers. See specs/055-refunds-cancellation/data-model.md.
--
-- ⚠ WHAT THIS MIGRATION DELIBERATELY DOES NOT DO:
--   * NO `refunded_amount` column on public."order". What was refunded is SUMMED from the rows on every
--     read (data-model §5). This is 027's rule and its reasoning transfers exactly: "a counter and the
--     rows can disagree, and then nobody knows which is true." It is also what makes FR-024 automatic —
--     the receipt keeps its numbers because nothing overwrites them.
--   * NO proposals table. A proposed refund is DERIVED from a pick shortfall with no covering refund
--     line; storing it means it can go stale when a picker corrects a quantity. Only the exception —
--     a human dismissed it — is recorded (data-model §4).
--   * NO new member on public."order".status. 'canceled' has been permitted since 019 and never
--     written; this slice is its first writer, which is why the gap register could say "nothing in the
--     codebase ever writes it."
--   * public.order_item and public.payment are UNTOUCHED. The receipt is a historical record of what
--     was charged; a refund is a later row, never an edit.

-- ── public.refund — one attempt to return money ─────────────────────────────────────────────────

CREATE TABLE public.refund (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- ⚠ RESTRICT, not CASCADE — the only child of an order that does not cascade. Every other one is
    -- a detail of the order; this is a record that MONEY MOVED, and it must not vanish with the row it
    -- points at. Deleting a refunded order should be impossible, and this is what makes it so.
    order_id           uuid NOT NULL REFERENCES public."order" (id) ON DELETE RESTRICT,
    -- ⚠ `external` is a refund the PLATFORM DID NOT ISSUE — returned by hand in the payment provider's
    -- own dashboard, which is a real thing that happens during an incident. It is recorded rather than
    -- discarded (FR-010): dropping it leaves the order claiming money it no longer holds, the ceiling
    -- wrong, and the same money refundable a second time.
    -- ⚠ `cancellation` is its own kind rather than a goodwill refund with a telling note. It names no
    -- lines (the amount includes delivery, which is not a line), so it LOOKS like goodwill — but the
    -- kind is what staff read, and "Goodwill" describes a gesture the business did not make.
    kind               text NOT NULL CHECK (kind IN ('item', 'goodwill', 'cancellation', 'external')),
    amount             numeric(12, 2) NOT NULL CHECK (amount > 0),
    currency           char(3) NOT NULL DEFAULT 'AUD',
    reason             text NOT NULL CHECK (reason IN (
                           'item_not_supplied', 'item_unusable', 'order_cancelled', 'goodwill',
                           'external')),
    note               text,
    status             text NOT NULL DEFAULT 'submitting' CHECK (status IN (
                           'submitting', 'submitted', 'succeeded', 'failed', 'refused')),
    failure_reason     text,
    provider_refund_id text UNIQUE,
    idempotency_key    text NOT NULL UNIQUE,
    -- ⚠ `system` means NOBODY AT EFFY DID THIS — it arrived from the provider unattributed. Inventing
    -- a staff actor to satisfy a NOT NULL would be a false statement in the one record that exists to
    -- say who moved money.
    actor_kind         text NOT NULL CHECK (actor_kind IN ('back_office', 'customer', 'system')),
    actor_sub          text,
    created_at         timestamptz NOT NULL DEFAULT now(),
    settled_at         timestamptz,
    -- The two vocabularies must not blur: only a goodwill refund may carry the goodwill reason.
    CONSTRAINT refund_goodwill_reason_ck
        CHECK (kind = 'goodwill' OR reason <> 'goodwill'),
    -- ⚠ FR-003c: an amount with no line and no explanation is unaccountable. Nobody reading the record
    -- later can tell what it was for, and "we gave someone $20" is exactly the entry that needs to say.
    CONSTRAINT refund_goodwill_needs_note_ck
        CHECK (kind <> 'goodwill' OR (note IS NOT NULL AND btrim(note) <> '')),
    -- A failure that cannot say why is not a failure anyone can act on.
    CONSTRAINT refund_failure_has_reason_ck
        CHECK (status <> 'failed' OR failure_reason IS NOT NULL),
    -- ⚠ A person or nobody, never a blank. `system` must NOT carry a subject (there is no one to
    -- name), and every other actor kind MUST — an unattributable staff refund is the audit gap this
    -- table exists to close.
    CONSTRAINT refund_actor_sub_ck
        CHECK ((actor_kind = 'system') = (actor_sub IS NULL)),
    -- An external refund names no lines and no staff reason, so its note is the only thing that can
    -- explain it.
    CONSTRAINT refund_external_needs_note_ck
        CHECK (kind <> 'external' OR (note IS NOT NULL AND btrim(note) <> '')),
    -- A cancellation returns the whole remaining amount, so it can only ever carry that reason.
    CONSTRAINT refund_cancellation_reason_ck
        CHECK (kind <> 'cancellation' OR reason = 'order_cancelled')
);

COMMENT ON TABLE public.refund IS
    'One attempt to return money for an order (055). Append-only: status, failure_reason, provider_refund_id and settled_at change as the money moves; nothing else does, and no row is ever deleted. Several may exist per order.';
COMMENT ON COLUMN public.refund.status IS
    'FIVE states, because each is a different answer to "did the money go?" (FR-005f): submitting (we have no answer from the provider yet) -> submitted (the provider has it, the bank does not) -> succeeded | failed (the bank rejected it, possibly WEEKS later). refused = the provider would not accept the request at all. ⚠ Collapsing submitting/submitted loses whether a retry is safe; collapsing failed/refused loses whether retrying could ever help.';
COMMENT ON COLUMN public.refund.idempotency_key IS
    '⚠ THE WHOLE OF FR-005, and it is DERIVED — from the order, the lines and the issuing action — never random. A double-click, a retry and a redelivered instruction all resolve to this one row. It is ALSO the key sent to the payment provider, so an ambiguous retry cannot create a second refund there either.';
COMMENT ON COLUMN public.refund.reason IS
    '⚠ EFFY''S vocabulary, not the provider''s. The provider offers three values describing a payments concern; the business needs to tell "never supplied" from "arrived unusable" from "cancelled" from "goodwill". Mapped on the way out. ⚠ The provider''s `fraudulent` is NEVER sent — its own documentation says it blocklists the payer''s card and email, a consequence for a person beyond this order.';
COMMENT ON COLUMN public.refund.provider_refund_id IS
    'Null until the provider accepts. UNIQUE so a webhook can find its refund and cannot attach to two.';
COMMENT ON COLUMN public.refund.failure_reason IS
    'The provider''s own words, for STAFF. ⚠ Never shown to a customer — "your bank rejected the refund" invites a shopper to argue with a message they cannot act on.';

CREATE INDEX refund_order_idx ON public.refund (order_id, created_at DESC);
-- The stuck-refund alert reads exactly this set: money the provider has not settled either way.
CREATE INDEX refund_unsettled_idx ON public.refund (status)
    WHERE status IN ('submitting', 'submitted');

-- ── public.refund_line — what an item-derived refund covered ────────────────────────────────────

CREATE TABLE public.refund_line (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    refund_id     uuid NOT NULL REFERENCES public.refund (id) ON DELETE CASCADE,
    order_item_id uuid NOT NULL REFERENCES public.order_item (id) ON DELETE RESTRICT,
    quantity      int NOT NULL CHECK (quantity > 0),
    amount        numeric(12, 2) NOT NULL CHECK (amount > 0),
    UNIQUE (refund_id, order_item_id)
);

COMMENT ON TABLE public.refund_line IS
    'Which order lines an ITEM-DERIVED refund covered, and how many units (055). ⚠ ABSENT ENTIRELY for a goodwill refund — that is what makes FR-003b''s distinction structural rather than a flag someone can forget to set.';
COMMENT ON COLUMN public.refund_line.amount IS
    'Stored, not recomputed: a product''s price can change after the order, and the price that matters is the one on the receipt line. Recomputing would refund today''s price for yesterday''s purchase.';
COMMENT ON COLUMN public.refund_line.quantity IS
    '⚠ The per-line ceiling (FR-003a) is SUM(quantity) across all of an order item''s refund lines vs order_item.quantity — the same unit can never be refunded twice.';

CREATE INDEX refund_line_order_item_idx ON public.refund_line (order_item_id);

-- ── public.refund_request — the customer's ask ──────────────────────────────────────────────────

CREATE TABLE public.refund_request (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- ⚠ CASCADE here, unlike public.refund: a request is a MESSAGE about an order, not a record of
    -- money that moved.
    order_id     uuid NOT NULL REFERENCES public."order" (id) ON DELETE CASCADE,
    customer_id  uuid NOT NULL REFERENCES public.customer (id) ON DELETE CASCADE,
    message      text NOT NULL CHECK (btrim(message) <> ''),
    status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'refunded', 'declined')),
    outcome_note text,
    decided_by   text,
    decided_at   timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.refund_request IS
    'A customer''s ask for a refund, against one order (055 US3). ⚠ IT IS NOT A REFUND AND MUST NEVER BE MISTAKEN FOR ONE: it carries no amount and no provider reference, and it moves no money (FR-005r). It replaces "email support and hope" — today "Get help" opens a generic feedback form with NO order reference attached. ⚠ Deliberately NOT a message thread: one statement, one outcome.';

-- ⚠ FR-005r4 as a DATABASE rule, not a check-then-write two taps can slip between.
CREATE UNIQUE INDEX refund_request_one_open_uq ON public.refund_request (order_id)
    WHERE status = 'open';
CREATE INDEX refund_request_customer_idx ON public.refund_request (customer_id, created_at DESC);

CREATE TABLE public.refund_request_item (
    request_id    uuid NOT NULL REFERENCES public.refund_request (id) ON DELETE CASCADE,
    order_item_id uuid NOT NULL REFERENCES public.order_item (id) ON DELETE CASCADE,
    quantity      int NOT NULL CHECK (quantity > 0),
    PRIMARY KEY (request_id, order_item_id)
);
COMMENT ON TABLE public.refund_request_item IS
    'The lines a customer named in their request (055). ⚠ No amount — what those items are worth is the platform''s arithmetic, and what to return is a staff decision.';
CREATE INDEX refund_request_item_order_item_idx ON public.refund_request_item (order_item_id);

-- ── public.refund_proposal_dismissal — the exception to a derived proposal ──────────────────────
-- ⚠ THERE IS NO PROPOSALS TABLE. A proposed refund is DERIVED: a pick shortfall with no refund line
-- covering it. Storing proposals means they can disagree with the shortfall they came from — a picker
-- correcting a quantity would leave a stale one behind, which FR-004b forbids ("at most once per
-- shortfall, however many times the shortfall is edited"). Deriving makes that requirement free.
--
-- The one fact the derivation cannot hold is "a human looked and said no". That is this table.

CREATE TABLE public.refund_proposal_dismissal (
    shop_fulfillment_id uuid NOT NULL REFERENCES public.shop_fulfillment (id) ON DELETE CASCADE,
    order_item_id       uuid NOT NULL REFERENCES public.order_item (id) ON DELETE CASCADE,
    dismissed_by        text NOT NULL,
    reason              text NOT NULL CHECK (btrim(reason) <> ''),
    dismissed_at        timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (shop_fulfillment_id, order_item_id)
);
COMMENT ON TABLE public.refund_proposal_dismissal IS
    'A person looked at a proposed refund and decided against it (055 FR-004b). Recording only the EXCEPTION keeps the happy path derived. A shortfall is sometimes resolved another way — the item was substituted, the customer declined a refund, the picker corrected a mistake — and none of those should leave money moving.';

-- ── Two existing CHECKs widen ───────────────────────────────────────────────────────────────────

-- 054 wrote, in this exact table: "⚠ `reason` deliberately has no `cancellation` or `refund` member.
-- Neither capability exists (order-flow gap register, Tier 2), and a value nothing can produce implies
-- a capability we do not have. The CHECK grows when the slice that needs it lands." This is that slice.
ALTER TABLE public.stock_movement DROP CONSTRAINT stock_movement_reason_check;
ALTER TABLE public.stock_movement ADD CONSTRAINT stock_movement_reason_check
    CHECK (reason IN (
        'received', 'correction', 'damage', 'expiry',
        'order_paid', 'pick_shortfall', 'refund',
        'tracking_enabled', 'tracking_disabled'));

COMMENT ON COLUMN public.stock_movement.reason IS
    'Why the count moved. A closed set. ⚠ `refund` (055) returns stock ONLY where the platform can know it should: an item-derived refund on a portion that has NOT been collected. A goodwill refund names no items, and a collected portion has physically gone — inventing stock is worse than not returning it.';

-- ⚠ THE THIRD WIDENING of this CHECK: 019 -> 020 (the shop lifecycle) -> 20260722160000 (`delivered`).
-- NOT 053 — that slice deliberately added no state, on the grounds that a package in a carrier's van
-- and one on the hub floor are the same fact to a shopper. Widen, never replace: no data migration,
-- and no rewrite of the fan-out.
ALTER TABLE public.shop_fulfillment DROP CONSTRAINT shop_fulfillment_status_check;
ALTER TABLE public.shop_fulfillment ADD CONSTRAINT shop_fulfillment_status_check
    CHECK (status IN ('pending', 'received', 'picking', 'ready_for_pickup', 'collected',
                      'delivered', 'unfulfillable', 'withdrawn'));

COMMENT ON COLUMN public.shop_fulfillment.status IS
    'The shop working lifecycle. pending -> received -> picking -> ready_for_pickup -> collected -> delivered. ⚠ `unfulfillable` (055) is the exit a shop that cannot supply its portion previously lacked — the last state with no way out. Permitted only BEFORE collection: once the goods have left the shop it is no longer their call, and it moves NO money (FR-031). ⚠ `withdrawn` (055, FR-014) is a DIFFERENT fact and deliberately a separate state: the ORDER was cancelled, so the shop''s work is called off. Conflating the two would tell a shop it failed to supply something nobody ever wanted, and would make shop-reliability reporting count cancellations as shop failures.';

-- +goose Down
ALTER TABLE public.shop_fulfillment DROP CONSTRAINT shop_fulfillment_status_check;
ALTER TABLE public.shop_fulfillment ADD CONSTRAINT shop_fulfillment_status_check
    CHECK (status IN ('pending', 'received', 'picking', 'ready_for_pickup', 'collected', 'delivered'));
ALTER TABLE public.stock_movement DROP CONSTRAINT stock_movement_reason_check;
ALTER TABLE public.stock_movement ADD CONSTRAINT stock_movement_reason_check
    CHECK (reason IN ('received', 'correction', 'damage', 'expiry', 'order_paid', 'pick_shortfall',
                      'tracking_enabled', 'tracking_disabled'));
DROP TABLE IF EXISTS public.refund_proposal_dismissal;
DROP TABLE IF EXISTS public.refund_request_item;
DROP TABLE IF EXISTS public.refund_request;
DROP TABLE IF EXISTS public.refund_line;
DROP TABLE IF EXISTS public.refund;

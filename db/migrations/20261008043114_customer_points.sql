-- +goose Up
-- 074-customer-points: a points balance per customer — store credit Effy gives and the customer spends.
--
-- ⚠ THE BALANCE IS NEVER STORED. It is what the ledger adds up to, computed by ONE function,
-- public.points_usable, and read nowhere else (research R1). A stored figure and the rows it summarises
-- can disagree, and then nobody knows which is true — 055 refused a stored refund total for the same
-- reason.
--
-- ⚠ THE LEDGER IS APPEND-ONLY. points_entry and points_allocation are never updated and never deleted
-- (FR-003); a mistake is corrected by a further, opposite entry. Every write goes through
-- @effy/edge-shared/points, and points-append-only.guard.test.ts holds every service to it.
--
-- ⚠ POINTS ARE A MEANS OF PAYMENT, NOT A DISCOUNT (FR-018). order.grand_total_amount keeps its meaning;
-- the card pays grand total − points value, and that is what payment.amount records (research R4).
--
-- The tables:
--   points_settings / points_settings_change — the business rules and their audit trail
--   points_account     — one row per customer; locking it serialises every change to that customer
--   points_entry       — every change: credits are LOTS (they carry expires_at), debits are negative
--   points_allocation  — which lots a debit consumed (FIFO), so a lot's remainder is derivable
--   points_hold        — points set aside for one checkout, as delivery_slot_booking is for a window
--   points_expiry_notice — one warning per customer per expiry date

-- ── Settings ───────────────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.points_settings (
    id                      smallint    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    cents_per_point         int         NOT NULL DEFAULT 1 CHECK (cents_per_point > 0),
    expiry_months           int         NOT NULL DEFAULT 12 CHECK (expiry_months BETWEEN 1 AND 120),
    csa_credit_limit_points int         NOT NULL DEFAULT 2000 CHECK (csa_credit_limit_points >= 0),
    warning_days            int         NOT NULL DEFAULT 30 CHECK (warning_days BETWEEN 1 AND 365),
    hold_minutes            int         NOT NULL DEFAULT 30 CHECK (hold_minutes BETWEEN 5 AND 240),
    updated_by              text        NOT NULL DEFAULT 'migration',
    updated_at              timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.points_settings (id) VALUES (1);

COMMENT ON TABLE  public.points_settings IS 'The points rules (074), one row (id = 1). Only a back-office admin changes them, and every change is written to points_settings_change (FR-025). A change applies from that moment: lots already credited keep their expires_at, orders already paid keep their snapshotted cents_per_point (FR-026).';
COMMENT ON COLUMN public.points_settings.cents_per_point IS 'The money value of one point, in cents. Default 1 (operator decision Q2, 2026-10-08). Snapshotted onto each order that uses points.';
COMMENT ON COLUMN public.points_settings.expiry_months IS 'How long a credited lot stays usable, counted from the Melbourne date it was credited; it stops at 00:00 Melbourne the following day (research R2).';
COMMENT ON COLUMN public.points_settings.csa_credit_limit_points IS 'The most a customer-service agent (csa) may credit in ONE credit (FR-007). Admins and managers have no limit.';
COMMENT ON COLUMN public.points_settings.warning_days IS 'How many days before a lot expires the customer is warned, once (FR-023).';
COMMENT ON COLUMN public.points_settings.hold_minutes IS 'How long points chosen at checkout stay set aside after the payment-intent call (research R3). Longer than the slot hold on purpose: a lapsed points hold costs Effy a shortfall it absorbs, not an oversold window.';

CREATE TABLE public.points_settings_change (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    field      text        NOT NULL,
    old_value  text        NOT NULL,
    new_value  text        NOT NULL,
    changed_by text        NOT NULL,
    changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX points_settings_change_at_idx ON public.points_settings_change (changed_at DESC);
COMMENT ON TABLE public.points_settings_change IS 'One row per changed points setting (074 FR-025): who, when, old and new value. Append-only.';

-- ── The lock row ───────────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.points_account (
    customer_id uuid        PRIMARY KEY REFERENCES public.customer (id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.points_account IS 'One row per customer who has ever had points (074). It holds NO figure: its only job is to be locked (SELECT … FOR UPDATE) so every change to one customer''s points is serialised. ⚠ Not the customer row: profile edits, device registration and closure write that row and must not queue behind a checkout (research R1).';

-- ── The ledger ─────────────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.points_entry (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id uuid        NOT NULL REFERENCES public.customer (id) ON DELETE CASCADE,
    kind        text        NOT NULL CHECK (kind IN (
                                'staff_credit', 'auto_credit', 'returned',
                                'staff_debit', 'spent', 'expired', 'forfeited')),
    points      int         NOT NULL,
    reason      text        NOT NULL CHECK (reason IN (
                                'late_delivery', 'missing_item', 'quality_issue', 'goodwill', 'correction', 'other',
                                'credited_in_error', 'courier_override_compensation',
                                'spent', 'returned', 'expired', 'forfeited')),
    note        text,
    -- ⚠ RESTRICT: an entry is a record that value moved; it must not vanish with the order it names.
    order_id    uuid        REFERENCES public."order" (id) ON DELETE RESTRICT,
    refund_id   uuid        UNIQUE REFERENCES public.refund (id) ON DELETE RESTRICT,
    author_kind text        NOT NULL CHECK (author_kind IN ('staff', 'system', 'customer')),
    author_sub  text,
    author_flow text,
    dedupe_key  text        UNIQUE,
    expires_at  timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now(),

    -- A credit is a positive lot with an expiry; a debit is negative and has none.
    CONSTRAINT points_entry_sign_ck CHECK (
        (kind IN ('staff_credit', 'auto_credit', 'returned') AND points > 0 AND expires_at IS NOT NULL)
        OR (kind IN ('staff_debit', 'spent', 'expired', 'forfeited') AND points < 0 AND expires_at IS NULL)
    ),
    CONSTRAINT points_entry_note_ck CHECK (reason <> 'other' OR (note IS NOT NULL AND btrim(note) <> '')),
    -- Who did it: a staff member or a customer by subject, or a named platform flow (FR-002, FR-009).
    CONSTRAINT points_entry_author_ck CHECK (
        (author_kind = 'system' AND author_flow IS NOT NULL)
        OR (author_kind IN ('staff', 'customer') AND author_sub IS NOT NULL)
    ),
    -- A returned entry is always tied to the refund that returned it, and only it is.
    CONSTRAINT points_entry_refund_ck CHECK ((kind = 'returned') = (refund_id IS NOT NULL))
);

CREATE INDEX points_entry_history_idx ON public.points_entry (customer_id, created_at DESC, id DESC);
CREATE INDEX points_entry_lots_idx ON public.points_entry (customer_id, expires_at) WHERE points > 0;
-- An order spends points once. The paid transition is guarded already; this is the second, independent guarantee.
CREATE UNIQUE INDEX points_entry_spent_uq ON public.points_entry (order_id) WHERE kind = 'spent';
CREATE INDEX points_entry_order_idx ON public.points_entry (order_id) WHERE order_id IS NOT NULL;

COMMENT ON TABLE  public.points_entry IS 'Every change to a customer''s points (074). ⚠ APPEND-ONLY: never updated, never deleted (FR-003). A credit (staff_credit, auto_credit, returned) is a LOT with its own expires_at; a debit (staff_debit, spent, expired, forfeited) is negative and records which lots it took in points_allocation.';
COMMENT ON COLUMN public.points_entry.points IS 'Signed whole points: > 0 for credits, < 0 for debits (points_entry_sign_ck).';
COMMENT ON COLUMN public.points_entry.reason IS 'Effy''s vocabulary (research R11). The customer sees words derived from it, never the code and never the note.';
COMMENT ON COLUMN public.points_entry.note IS '⚠ INTERNAL. Staff-only context; required when reason = other. Never sent to a customer, a log line or an analytics event.';
COMMENT ON COLUMN public.points_entry.order_id IS 'The order the change relates to, if any. The service checks it belongs to customer_id under the account lock (FR-010).';
COMMENT ON COLUMN public.points_entry.refund_id IS 'For kind = returned only: the refund that returned these points. UNIQUE — a refund returns points once, however many times its outcome is recorded (research R5).';
COMMENT ON COLUMN public.points_entry.author_flow IS 'For author_kind = system: which platform flow made the change (refund, points_expiry, courier_override …).';
COMMENT ON COLUMN public.points_entry.dedupe_key IS 'Lets an automatic flow credit idempotently (FR-009): the same key twice is one credit.';
COMMENT ON COLUMN public.points_entry.expires_at IS 'Credits only: the instant this lot stops counting — 00:00 Australia/Melbourne on the day after (credit date + expiry_months). ⚠ Expiry is decided HERE, by points_usable reading it; the daily sweep only writes the history line (research R2).';

CREATE TABLE public.points_allocation (
    debit_entry_id  uuid NOT NULL REFERENCES public.points_entry (id) ON DELETE RESTRICT,
    credit_entry_id uuid NOT NULL REFERENCES public.points_entry (id) ON DELETE RESTRICT,
    points          int  NOT NULL CHECK (points > 0),
    PRIMARY KEY (debit_entry_id, credit_entry_id)
);
CREATE INDEX points_allocation_credit_idx ON public.points_allocation (credit_entry_id);
COMMENT ON TABLE public.points_allocation IS 'Which lots a debit consumed and how many points from each (074), oldest-expiring first (FR-016). ⚠ APPEND-ONLY. A lot''s remainder = its points − Σ its allocations; nothing stores it.';

-- ── Checkout holds ─────────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.points_hold (
    order_id    uuid        PRIMARY KEY REFERENCES public."order" (id) ON DELETE CASCADE,
    customer_id uuid        NOT NULL REFERENCES public.customer (id) ON DELETE CASCADE,
    points      int         NOT NULL CHECK (points > 0),
    state       text        NOT NULL CHECK (state IN ('held', 'spent', 'released')),
    held_until  timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT points_hold_until_ck CHECK ((state = 'held') = (held_until IS NOT NULL))
);
CREATE INDEX points_hold_customer_idx ON public.points_hold (customer_id) WHERE state = 'held';
COMMENT ON TABLE public.points_hold IS 'Points set aside for one checkout (074, research R3). HELD at the payment-intent call — the last server moment before the client confirms payment with the provider — SPENT inside the paid transition, RELEASED when payment fails. ⚠ A LAPSED HOLD IS NOT SWEPT: it stays held and simply stops counting once held_until passes, exactly as delivery_slot_booking does (069).';

-- ── Expiry warnings ────────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.points_expiry_notice (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id uuid        NOT NULL REFERENCES public.customer (id) ON DELETE CASCADE,
    expiry_date date        NOT NULL,
    points      int         NOT NULL CHECK (points > 0),
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT points_expiry_notice_uq UNIQUE (customer_id, expiry_date)
);
COMMENT ON TABLE public.points_expiry_notice IS 'One expiry warning per customer per Melbourne expiry date (074 FR-023, SC-007), however many lots expire that day and however many times the job runs.';
COMMENT ON COLUMN public.points_expiry_notice.expiry_date IS 'The last Melbourne date the points are usable — the date the customer is told.';

-- ── Orders and refunds ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public."order"
    ADD COLUMN points_used             int           NOT NULL DEFAULT 0 CHECK (points_used >= 0),
    ADD COLUMN points_cents_per_point  int           CHECK (points_cents_per_point > 0),
    ADD COLUMN points_value_amount     numeric(12, 2) NOT NULL DEFAULT 0 CHECK (points_value_amount >= 0),
    ADD COLUMN points_shortfall_amount numeric(12, 2) NOT NULL DEFAULT 0 CHECK (points_shortfall_amount >= 0);

COMMENT ON COLUMN public."order".points_used IS 'Points the customer chose to pay with (074). 0 = none. ⚠ grand_total_amount is UNCHANGED by points: the card pays grand_total_amount − points_value_amount, which is payment.amount.';
COMMENT ON COLUMN public."order".points_cents_per_point IS 'The value of a point when this order was placed — a snapshot, so a later settings change never re-prices it (FR-026). NULL when no points were used.';
COMMENT ON COLUMN public."order".points_value_amount IS 'points_used × points_cents_per_point, in dollars.';
COMMENT ON COLUMN public."order".points_shortfall_amount IS 'The LATE PAYER (research R3): payment arrived after the points hold lapsed and the points had since been spent or debited. The order stands, the customer is never charged again, and Effy absorbs this amount. > 0 raises the PointsHoldShortfall alarm.';

ALTER TABLE public.refund
    ADD COLUMN card_amount         numeric(12, 2) CHECK (card_amount >= 0),
    ADD COLUMN points_returned     int           NOT NULL DEFAULT 0 CHECK (points_returned >= 0),
    ADD COLUMN points_value_amount numeric(12, 2) NOT NULL DEFAULT 0 CHECK (points_value_amount >= 0),
    ADD CONSTRAINT refund_points_split_ck CHECK (card_amount IS NULL OR card_amount + points_value_amount = amount);

COMMENT ON COLUMN public.refund.card_amount IS 'The part of this refund returned to the card (074). ⚠ NULL ON EVERY ROW WRITTEN BEFORE 074, meaning the whole amount went to the card. Only this part is ever sent to the payment provider. Written at INSERT only.';
COMMENT ON COLUMN public.refund.points_returned IS 'Whole points returned to the customer''s balance by this refund (074), split in the same proportion the order was paid (FR-019, research R5). The points come back as a points_entry of kind returned when the card part is accepted — or at once when there is no card part.';
COMMENT ON COLUMN public.refund.points_value_amount IS 'points_returned at the order''s snapshotted cents_per_point. card_amount + points_value_amount = amount.';

-- ── Notifications ──────────────────────────────────────────────────────────────────────────────────
-- ⚠ READER AUDIT (067's rule for every widening of this CHECK): NotificationType + the exhaustive copy
-- Record in edge-notifications/worker/copy.ts, and EMAIL_TEMPLATES in worker/email-sender.ts.

ALTER TABLE public.notification_request DROP CONSTRAINT notification_request_type_check;
ALTER TABLE public.notification_request ADD CONSTRAINT notification_request_type_check
    CHECK (type IN (
        'order_paid', 'order_ready', 'order_out_for_delivery', 'order_delivered',
        'shop_new_order', 'run_assigned',
        'shop_awaiting_pick', 'shop_out_of_stock', 'shop_low_stock', 'shop_refund_proposed',
        'shop_product_approved', 'shop_product_sent_back',
        'points_credited', 'points_expiring'
    ));

-- ── The one function ───────────────────────────────────────────────────────────────────────────────

-- +goose StatementBegin
CREATE FUNCTION public.points_usable(p_customer uuid, p_at timestamptz, p_except_order uuid DEFAULT NULL)
RETURNS int
LANGUAGE sql STABLE AS $$
    SELECT (
        COALESCE((
            SELECT SUM(e.points - COALESCE((SELECT SUM(a.points) FROM public.points_allocation a
                                             WHERE a.credit_entry_id = e.id), 0))
              FROM public.points_entry e
             WHERE e.customer_id = p_customer
               AND e.points > 0
               AND e.expires_at > p_at
        ), 0)
        - COALESCE((
            SELECT SUM(h.points)
              FROM public.points_hold h
             WHERE h.customer_id = p_customer
               AND h.state = 'held'
               AND h.held_until > p_at
               AND h.order_id IS DISTINCT FROM p_except_order
        ), 0)
    )::int
$$;
-- +goose StatementEnd

COMMENT ON FUNCTION public.points_usable(uuid, timestamptz, uuid) IS 'THE usable points balance (074) — the only place it is computed (research R1). = unexpired lots'' remainders − live holds, optionally ignoring one order''s own hold (so refreshing a checkout is not refused by itself). ⚠ NOT floored at zero: a negative result is an invariant violation the reconciliation must see, not hide.';

-- ── Grants ─────────────────────────────────────────────────────────────────────────────────────────
-- The shopper role (070) gets DML on new tables through its default privileges; commerce runs checkout
-- and the paid transition as that role and needs them. It never needs to rewrite history.
REVOKE UPDATE, DELETE ON public.points_entry, public.points_allocation, public.points_settings_change FROM effy_shopper;

-- +goose Down
-- Dev single-step rollback only; lossy (every point ever credited is discarded).
ALTER TABLE public.notification_request DROP CONSTRAINT notification_request_type_check;
DELETE FROM public.notification_request WHERE type IN ('points_credited', 'points_expiring');
ALTER TABLE public.notification_request ADD CONSTRAINT notification_request_type_check
    CHECK (type IN (
        'order_paid', 'order_ready', 'order_out_for_delivery', 'order_delivered',
        'shop_new_order', 'run_assigned',
        'shop_awaiting_pick', 'shop_out_of_stock', 'shop_low_stock', 'shop_refund_proposed',
        'shop_product_approved', 'shop_product_sent_back'
    ));
DROP FUNCTION IF EXISTS public.points_usable(uuid, timestamptz, uuid);
ALTER TABLE public.refund
    DROP CONSTRAINT IF EXISTS refund_points_split_ck,
    DROP COLUMN IF EXISTS points_value_amount,
    DROP COLUMN IF EXISTS points_returned,
    DROP COLUMN IF EXISTS card_amount;
ALTER TABLE public."order"
    DROP COLUMN IF EXISTS points_shortfall_amount,
    DROP COLUMN IF EXISTS points_value_amount,
    DROP COLUMN IF EXISTS points_cents_per_point,
    DROP COLUMN IF EXISTS points_used;
DROP TABLE IF EXISTS public.points_expiry_notice;
DROP TABLE IF EXISTS public.points_hold;
DROP TABLE IF EXISTS public.points_allocation;
DROP TABLE IF EXISTS public.points_entry;
DROP TABLE IF EXISTS public.points_account;
DROP TABLE IF EXISTS public.points_settings_change;
DROP TABLE IF EXISTS public.points_settings;

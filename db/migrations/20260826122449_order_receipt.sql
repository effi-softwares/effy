-- +goose Up
-- 052-order-confirmation-invoice: the emailed receipt's data plane.
--
-- Two changes, both in `public` (house style: raw SQL, text CHECK enums, an index on every lookup
-- path, COMMENT ON everything; no native PG enums, no triggers). See
-- specs/052-order-confirmation-invoice/data-model.md.
--
--   • payment.method_*   — how an order was paid, in a form safe to show on a receipt. NOTHING stored
--                          this before: public.payment held only the provider reference, the amount
--                          and the status, so the receipt could not say "Visa ending 4242" at all.
--   • receipt_dispatch   — simultaneously the OUTBOX the notifications worker drains, the RATE-LIMIT
--                          ledger the resend route counts, and the AUDIT TRAIL an operator reads when
--                          a customer says no receipt arrived.
--
-- ⚠ WHY NOT public.notification_request (050)? Three concrete mismatches, recorded in research R2:
-- its `type` CHECK is a closed PUSH vocabulary; its `payload` is contractually no-PII because a push
-- payload traverses FCM, while a receipt email is entirely PII by nature; and its UNIQUE `dedupe_key`
-- is exactly what makes push exactly-once and exactly what would FORBID a deliberate resend.

-- ── public.payment — how it was paid ─────────────────────────────────────────────────────────────
-- All three nullable BY DESIGN. They are written best-effort AFTER the finalize transaction commits
-- (research R3): the webhook's `latest_charge` is an id string, so capturing this needs an extra
-- Stripe round trip, and putting a network call inside finalize would let a slow provider strand a
-- PAID order — 027's defect, deliberately not reintroduced. NULL means "not captured": a pre-052
-- order, or a failed follow-up. The receipt omits the line. Data, not a gap.

ALTER TABLE public.payment
    ADD COLUMN method_type  text,
    ADD COLUMN method_brand text,
    ADD COLUMN method_last4 text;

-- ⚠ NO CHECK on method_type, and that is deliberate. A closed constraint here would turn an
-- unrecognised provider method into a FAILED WRITE ON A PAID ORDER. The mapping to Effy's four
-- families happens in Go and anything unmatched becomes 'other'.
COMMENT ON COLUMN public.payment.method_type  IS '052 — Effy''s own family: card | wallet | pay_over_time | other. NOT the provider''s string. Nullable: captured best-effort after finalize commits.';
COMMENT ON COLUMN public.payment.method_brand IS '052 — network or wallet for the receipt label (visa, mastercard, amex, apple_pay). Nullable.';
COMMENT ON COLUMN public.payment.method_last4 IS '052 — the ONLY part of a card number permitted to leave the provider (051 payment.ts). No other card field may ever be added to this table.';

-- ⚠ No index: these are only ever read through the already-indexed payment_order_idx join.

-- ── public.receipt_dispatch — the receipt email outbox + ledger ──────────────────────────────────

CREATE TABLE public.receipt_dispatch (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id     uuid        NOT NULL REFERENCES public."order" (id) ON DELETE CASCADE,
    -- What asked for this send. It is what separates the exactly-once rule (order_paid) from the
    -- rate-limited one (customer_request), and it is the first thing an operator reads.
    reason       text        NOT NULL CHECK (reason IN ('order_paid', 'customer_request')),
    -- ⚠ SNAPSHOTTED AT ENQUEUE TIME. A customer who later changes their account email must not
    -- retroactively change where an already-sent receipt went. citext matches public.customer.email.
    recipient    citext      NOT NULL,
    status       text        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
    attempts     int         NOT NULL DEFAULT 0,
    last_error   text,
    -- The provider message id on success, so a dispatch joins to public.email_delivery_event (037)
    -- and a bounce can be traced back to the order.
    message_id   text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    processed_at timestamptz
);

COMMENT ON TABLE  public.receipt_dispatch IS '052 — outbox + rate-limit ledger + audit trail for the order-receipt email. Drained by the scheduled edge-notifications receipts worker.';
COMMENT ON COLUMN public.receipt_dispatch.reason     IS 'order_paid = the automatic send (exactly-once, see receipt_dispatch_auto_uq); customer_request = a resend (rate-limited, deliberately unconstrained).';
COMMENT ON COLUMN public.receipt_dispatch.recipient  IS 'The address resolved AT ENQUEUE TIME, snapshotted — never re-resolved at send.';
COMMENT ON COLUMN public.receipt_dispatch.status     IS 'pending → sent | failed | skipped. skipped = no address on the account, a valid outcome and NOT a failure (050 no_token precedent).';
COMMENT ON COLUMN public.receipt_dispatch.message_id IS 'Provider message id on success; join to public.email_delivery_event (037) for the delivery outcome.';

-- ⚠ FR-020 IN ONE LINE. A PARTIAL unique index makes a second automatic send UNREPRESENTABLE, so
-- re-processing the paid fact — a redelivered Stripe webhook, a replayed confirm — inserts nothing.
-- It deliberately does NOT constrain customer_request: a resend is a legitimate second send. Same
-- "one guarantee per genuine rule" shape as promo_redemption.order_id (027).
CREATE UNIQUE INDEX receipt_dispatch_auto_uq
    ON public.receipt_dispatch (order_id) WHERE reason = 'order_paid';

-- The drain: WHERE status='pending' ORDER BY created_at ... FOR UPDATE SKIP LOCKED.
CREATE INDEX receipt_dispatch_pending_idx ON public.receipt_dispatch (status, created_at);

-- Both the rate-limit count and the operator's "what happened to this order's receipt".
CREATE INDEX receipt_dispatch_order_idx ON public.receipt_dispatch (order_id, created_at DESC);

-- +goose Down
-- Dev-only single-step down (003 policy; forward-only in anger). LOSSY: discards all dispatch history.
DROP TABLE IF EXISTS public.receipt_dispatch;
ALTER TABLE public.payment
    DROP COLUMN IF EXISTS method_last4,
    DROP COLUMN IF EXISTS method_brand,
    DROP COLUMN IF EXISTS method_type;

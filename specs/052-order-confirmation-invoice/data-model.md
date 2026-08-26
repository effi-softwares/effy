# Data Model: 052 — Order Confirmation & Emailed Receipt

**Date**: 2026-08-26 · **Spec**: [spec.md](./spec.md) · **Research**: [research.md](./research.md)

House style (003 / Principle VI): raw SQL, one forward-only Goose migration, `text` + `CHECK` in
place of native enums, an index on every lookup path, `COMMENT ON` everything. No ORM, no triggers.

---

## 1. `public.payment` — three new columns

The payment-method summary the receipt shows (FR-006). Nothing equivalent exists today: `payment`
stores only the provider reference, the amount and the status.

```
ALTER TABLE public.payment
    ADD COLUMN method_type  text,
    ADD COLUMN method_brand text,
    ADD COLUMN method_last4 text;
```

| Column | Type | Notes |
|---|---|---|
| `method_type` | `text` NULL | The family: `card`, `wallet`, `pay_over_time`, `other`. Deliberately Effy's own vocabulary, matching the telemetry taxonomy 051 established — not the provider's method-type string. |
| `method_brand` | `text` NULL | Network or wallet name for the label (`visa`, `mastercard`, `amex`, `apple_pay`). |
| `method_last4` | `text` NULL | ⚠ The **only** part of a card number permitted to leave the provider (051 `payment.ts` header). No other card field may ever be added here. |

**All three are nullable, and that is the design.** They are written **after** the finalize
transaction commits (research R3), so a Stripe hiccup leaves them NULL rather than stranding a paid
order. NULL means "not captured" — pre-052 orders, or a failed follow-up — and the receipt omits the
line. It is the same shape as `email_delivery_event.template_id` being NULL for pre-038 mail: data,
not a gap.

**No `CHECK` on `method_type`.** A closed constraint here would turn an unrecognised provider method
into a **failed write on a paid order**. The mapping to the four families happens in Go, and anything
unmatched becomes `other`.

⚠ **No index.** These are read only via the already-indexed `payment_order_idx` join.

---

## 2. `public.receipt_dispatch` — new table

The record that a receipt email was wanted, attempted, and what came of it. It is simultaneously the
**outbox** the worker drains, the **rate-limit ledger** the resend route counts, and the **audit
trail** an operator reads when a customer says no receipt arrived (FR-026).

Research R2 records why this is not `public.notification_request`.

```
CREATE TABLE public.receipt_dispatch (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id      uuid        NOT NULL REFERENCES public."order" (id) ON DELETE CASCADE,
    reason        text        NOT NULL CHECK (reason IN ('order_paid', 'customer_request')),
    recipient     citext      NOT NULL,
    status        text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
    attempts      int         NOT NULL DEFAULT 0,
    last_error    text,
    message_id    text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    processed_at  timestamptz
);
```

| Column | Purpose |
|---|---|
| `order_id` | The order this receipt is of. `ON DELETE CASCADE` — a deleted order has no receipt to send. |
| `reason` | `order_paid` = the automatic send; `customer_request` = a resend (FR-027). It is what separates the exactly-once rule from the rate-limited one, and it is what an operator reads first. |
| `recipient` | ⚠ **The address resolved AT ENQUEUE TIME**, snapshotted. A customer who changes their account email must not retroactively change where an already-sent receipt went. `citext` matches `public.customer.email`. |
| `status` | `pending → sent \| failed \| skipped`. `skipped` = the customer had no address on file — a valid outcome, not a failure (050's `no_token` precedent). |
| `attempts` | Drives the attempt cap; the drain marks `failed` at the cap rather than retrying forever. |
| `message_id` | The provider message id on success, so a dispatch can be joined to `public.email_delivery_event` (037) and a bounce traced to the order. |

### Indexes and constraints

```
CREATE UNIQUE INDEX receipt_dispatch_auto_uq
    ON public.receipt_dispatch (order_id) WHERE reason = 'order_paid';

CREATE INDEX receipt_dispatch_pending_idx ON public.receipt_dispatch (status, created_at);
CREATE INDEX receipt_dispatch_order_idx   ON public.receipt_dispatch (order_id, created_at DESC);
```

- **`receipt_dispatch_auto_uq` is FR-020 in one line.** A partial unique index makes a second
  automatic send **unrepresentable**, so re-processing the paid fact — a redelivered webhook, a
  replayed confirm — inserts nothing. It deliberately does **not** constrain `customer_request`,
  because a resend is a legitimate second send. That is the "one guarantee per genuine rule" shape
  `promo_redemption.order_id` already uses.
- **`receipt_dispatch_pending_idx`** serves the drain's `WHERE status='pending' ORDER BY created_at
  … FOR UPDATE SKIP LOCKED`.
- **`receipt_dispatch_order_idx`** serves both the rate-limit count and the operator's "what happened
  to this order's receipt" question.

### State transitions

```
                    ┌── no address on file ──▶ skipped (terminal)
  pending ──drain───┼── send ok ─────────────▶ sent    (terminal, message_id set)
                    └── send failed ─────────▶ pending (attempts+1)  ──at cap──▶ failed (terminal)
```

⚠ Only `pending` rows are ever claimed, so a re-run never re-sends a terminal row — the same
idempotency-by-construction the 050 drain relies on.

---

## 3. What this feature deliberately does NOT store

- **The rendered receipt.** It is derived from the order on every render, so a stored copy could
  disagree with the order it claims to describe. The order's own snapshot columns (`product_name`,
  `unit_price_amount`) are already the immutable record — that is what 019 built them for.
- **A tax amount, a taxable/GST-free flag, or an ABN.** FR-031. Both prerequisites are recorded in
  research R13; adding a column that could only hold a guess is exactly what the constitution's
  Real-World Identifiers section forbids.
- **The customer-facing stage.** Derived from `shop_fulfillment.status` on read (research R5). A
  stored copy is a cache that goes stale the moment a shop advances a portion.
- **A delivery time window.** ⚠ The platform has no such data — `promised_from`/`promised_to` are
  `date` (research R4). Storing one would mean inventing it.
- **Anything in `notification_request`.** Untouched by this slice.

---

## 4. Read model — the receipt fact set (FR-001)

One canonical set, served by the hot path, rendered by three surfaces. New fields marked **NEW**.

| Fact | Source |
|---|---|
| order number, status, placed timestamp | `public."order"` — existing |
| line: product id, name, **unit price**, quantity, line total | `public.order_item` — existing, and `unitPriceAmount` is **already on the DTO** (research R9) |
| line: image | **NEW** — `LEFT JOIN public.product_media` on `is_primary`, presigned like every other product image |
| items subtotal, discount + code, delivery fee, grand total, currency | `public."order"` — existing |
| payment method summary | **NEW** — `public.payment.method_*` (§1) |
| delivery + billing address | `public."order"` — existing |
| delivery method, promised date range | **NEW on the DTO** — `public.order_package_delivery.method`, `.promised_from`, `.promised_to` (⚠ dates, research R4) |
| customer-facing stage | **NEW** — derived in Go from all `public.shop_fulfillment.status` (research R5) |
| terminal shortfalls | `public.fulfillment_item` — existing, existing disclosure rule unchanged |
| seller identity | `packages/legal-content` identifiers — existing, placeholders honoured |

⚠ **No shop identity, count, distance or ring enters this model** (FR-009). `order_package_delivery`
is keyed by `shop_id`; the read aggregates over it and the id never reaches a DTO field.

---

## 5. Migration

One forward-only file, `db/migrations/<timestamp>_order_receipt.sql`, containing §1 and §2 only.

**Down** is a dev-only single step (003 policy): drop `receipt_dispatch`, drop the three `payment`
columns. Lossy by definition — it discards dispatch history.

⚠ **Backfill: none, deliberately.** Existing paid orders get no `receipt_dispatch` row, so no
historical receipt is mailed out when the worker first runs. Enqueuing on payment means only orders
paid **after** deploy are sent automatically; every older order remains reachable through the resend
action. Mailing a year of back-receipts on first deploy is the failure mode a backfill would create.

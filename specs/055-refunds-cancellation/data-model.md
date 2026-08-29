# Data Model — 055 Refunds & Cancellation

**Migration**: one forward-only Goose file, `<timestamp>_refunds_cancellation.sql`. Raw SQL, text CHECK
enums, an index on every FK, `COMMENT ON` everything — the platform's standing shape.

---

## 1. `public.refund` — one attempt to return money

```
id                  uuid PK
order_id            uuid NOT NULL REFERENCES public."order"(id) ON DELETE RESTRICT
kind                text NOT NULL CHECK (kind IN ('item', 'goodwill'))
amount              numeric(12,2) NOT NULL CHECK (amount > 0)
currency            char(3) NOT NULL
reason              text NOT NULL CHECK (reason IN (
                        'item_not_supplied','item_unusable','order_cancelled','goodwill'))
note                text
status              text NOT NULL DEFAULT 'submitting' CHECK (status IN (
                        'submitting','submitted','succeeded','failed','refused'))
failure_reason      text
provider_refund_id  text UNIQUE
idempotency_key     text NOT NULL UNIQUE
actor_kind          text NOT NULL CHECK (actor_kind IN ('back_office','customer'))
actor_sub           text NOT NULL
created_at          timestamptz NOT NULL DEFAULT now()
settled_at          timestamptz
CHECK (kind = 'goodwill' OR reason <> 'goodwill')
CHECK (kind <> 'goodwill' OR note IS NOT NULL)     -- FR-003: a free amount must explain itself
CHECK (status <> 'failed' OR failure_reason IS NOT NULL)
```

- ⚠ **`ON DELETE RESTRICT`, not CASCADE.** Every other child of an order cascades; a record of money
  that moved must not vanish with the row it points at. Deleting an order that has been refunded should
  be impossible, and this is what makes it so.
- ⚠ **`status` distinguishes FIVE states, and each is a different answer to "did the money go?"**
  (FR-005f): `submitting` (we have not got an answer from the provider yet), `submitted` (the provider
  has it, the bank does not yet), `succeeded`, `failed` (the bank rejected it — up to 30 days later),
  `refused` (the provider would not accept the request at all). Collapsing `submitting`/`submitted`
  would lose the distinction R1 is built on; collapsing `failed`/`refused` would lose whether retrying
  could ever help (FR-005d).
- **`idempotency_key` is UNIQUE and is the whole of FR-005.** Derived from the order, the lines and the
  issuing action — never random — so a double-click, a retry and a redelivered instruction all resolve
  to the same row. It is also the key sent to the provider, so an ambiguous retry cannot create a second
  refund *there* either.
- **`provider_refund_id` is UNIQUE and nullable**: null until the provider accepts. Unique so a webhook
  can find its refund and cannot attach to two.
- **`reason` is OURS, not the provider's** (research R5). It is mapped to the provider's smaller
  vocabulary on the way out; ⚠ `fraudulent` is never sent, because it blocklists the payer beyond this
  order.
- **Append-only.** `status`, `failure_reason`, `provider_refund_id` and `settled_at` change as the money
  moves; nothing else does, and no row is ever deleted.

**Indexes**: `(order_id, created_at DESC)`; `(status)` partial `WHERE status IN ('submitting','submitted')`
— the stuck-refund alert reads exactly that set.

---

## 2. `public.refund_line` — what an item-derived refund covered

```
id           uuid PK
refund_id    uuid NOT NULL REFERENCES public.refund(id) ON DELETE CASCADE
order_item_id uuid NOT NULL REFERENCES public.order_item(id) ON DELETE RESTRICT
quantity     int NOT NULL CHECK (quantity > 0)
amount       numeric(12,2) NOT NULL CHECK (amount > 0)
UNIQUE (refund_id, order_item_id)
```

Absent entirely for a goodwill refund — which is what makes FR-003b's distinction structural rather than
a flag. The per-line `amount` is stored rather than recomputed because a product's price can change
after the order; the receipt's price is the one that matters and it is on `order_item`.

⚠ **The per-line ceiling (FR-003a) is `SUM(quantity)` across all of an item's refund lines vs
`order_item.quantity`** — the same unit cannot be refunded twice.

---

## 3. `public.refund_request` — the customer's ask

```
id           uuid PK
order_id     uuid NOT NULL REFERENCES public."order"(id) ON DELETE CASCADE
customer_id  uuid NOT NULL REFERENCES public.customer(id) ON DELETE CASCADE
message      text NOT NULL
status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open','refunded','declined'))
outcome_note text
decided_by   text
decided_at   timestamptz
created_at   timestamptz NOT NULL DEFAULT now()
```

Plus `refund_request_item (request_id, order_item_id, quantity)` for the lines the customer named.

- ⚠ **A request is not a refund and must never be mistaken for one.** It carries no amount and no
  provider reference. FR-005a: it moves no money.
- **Partial unique index** `(order_id) WHERE status = 'open'` — FR-005c's "one open request per order",
  enforced by the database rather than by a check-then-write that two taps can slip between.
- ⚠ `CASCADE` here, unlike `refund`: a request is a message about an order, not a record of money.

---

## 4. Proposed refunds — ⚠ derived, not a table

FR-004a's proposal has **no table**. An order awaits a decision when it has a pick shortfall with no
refund line covering it, or an open request — both computable from rows that already exist.

⚠ **Why not a table**: a proposal is a *view of other facts*, and storing it means it can disagree with
them. A picker correcting a shortfall would leave a stale proposal behind, which is precisely what
FR-004b forbids ("at most once per shortfall, however many times the shortfall is edited"). Deriving it
makes that requirement free instead of a reconciliation job. This is 027's counted-not-stored rule
(research R7) applied a second time.

**Dismissal** (FR-004b) needs one fact the derivation lacks — "a human looked and said no". That is a
single `public.refund_proposal_dismissal (shop_fulfillment_id, order_item_id, dismissed_by, reason,
dismissed_at)` row, which suppresses the derived proposal. ⚠ Recording only the *exception* keeps the
happy path derived.

---

## 5. Totals are DERIVED, never stored (FR-022, FR-024)

There is **no `refunded_amount` column on `public."order"`**. What was refunded is
`SUM(amount) WHERE order_id = ? AND status IN ('submitted','succeeded')`, and what the customer
ultimately paid is the payment amount minus that.

⚠ **This is 027's rule, and its reasoning transfers exactly**: *"`redemptionCount` is COUNTED from
`promo_redemption` on every read, never stored — a counter and the rows can disagree, and then nobody
knows which is true."* It also makes **FR-024 automatic**: the receipt keeps its numbers because nothing
overwrites them.

⚠ **`submitting` is excluded from the sum** (FR-005e): until the provider has it, no money is on its way,
so it must not count against the ceiling or appear to the customer.

⚠ **The ceiling is the PAID amount, not the order total** (research R10): `payment.amount`, not
`order.grand_total_amount`. They can differ, and refunding against the wrong one returns money that
never arrived.

---

## 6. What changes in existing tables

**`public."order".status`** — no new member. `'canceled'` has been permitted since 019 and never
written; this slice is its first writer. ⚠ No migration needed for it, which is why the gap register
could say *"nothing in the codebase ever writes it."*

**`public.stock_movement.reason`** (054) — widen the CHECK with `refund`. 054's data-model wrote:
*"deliberately has no `cancellation` or `refund` member… The CHECK grows when the slice that needs it
lands."* This is that slice.

**`public.shop_fulfillment.status`** — widen with a terminal `unfulfillable` (US6). ⚠ **The third
widening of this CHECK: 019 → `20260720093119` (020) → `20260722160000` (the `delivered` state).** An
earlier draft of this document credited the third to 053; that is wrong — 053's own migration says in
its header *"it does not touch `shop_fulfillment.status`. No new state, no widened CHECK"*, because a
package in a carrier's van and one on the hub floor are the same fact to a shopper. The instruction
stands: **widen, never replace**, so there is no data migration and no rewrite of the fan-out.

**Untouched**: `public.order_item` and `public.payment`. The receipt is a historical record (FR-024) and
the payment records what was charged. Refunds are later rows.

---

## 7. State transitions

```
refund:   submitting ──▶ submitted ──▶ succeeded
              │              └────────▶ failed        (bank rejected, up to 30 days later)
              └──────────────────────▶ refused        (provider would not accept it at all)

request:  open ──▶ refunded | declined

order:    paid ──▶ canceled          (only while no shop has begun preparing, or by staff)
```

⚠ `submitting → submitted` is the only edge a retry may traverse (FR-005d, ambiguous failure).
`refused` is terminal and never retried — retrying a decision cannot change it.

# Data Model: Shop Order Fulfillment (020)

**Date**: 2026-07-20 · **Feeds**: [plan.md](./plan.md) · **Decisions**: [research.md](./research.md)

One forward-only Goose migration: `db/migrations/<ts>_shop_order_fulfillment.sql`. Constitution
Technology Standards — PostgreSQL 16, Goose, forward-only, raw SQL, no ORM.

**Everything here is `public` schema** (operational). Nothing touches `admin`.

---

## Change summary

| Object | Change | Why |
|---|---|---|
| `public.shop_fulfillment` | **ALTER** — widen `status` CHECK; add `state_changed_at` | R3 — the reserved `received` value finally gets a consumer |
| `public.fulfillment_item` | **NEW** | R4 — pick progress + shortfall, kept off the receipt line |
| `public.fulfillment_event` | **NEW** | R6 — append-only audit; the sole accountability control |
| `public.order_item` | **untouched** | R4 — it is a receipt line and stays immutable |
| `public."order"` | **untouched** | R7 — the delivery promise is a domain seam, not a column |

---

## 1. `public.shop_fulfillment` — ALTER

The per-shop portion already exists from 019, uniquely keyed `(order_id, shop_id)`. 019 shipped it with:

```sql
status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'received')),
```
> *"pending at creation; received reserved for the later shop-surfacing slice (no consumer flips it here)."*

This slice is that consumer.

```sql
ALTER TABLE public.shop_fulfillment DROP CONSTRAINT shop_fulfillment_status_check;
ALTER TABLE public.shop_fulfillment ADD CONSTRAINT shop_fulfillment_status_check
    CHECK (status IN ('pending', 'received', 'picking', 'ready_for_pickup', 'collected'));

ALTER TABLE public.shop_fulfillment
    ADD COLUMN state_changed_at timestamptz NOT NULL DEFAULT now();
```

**Fields (post-change)**

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | existing |
| `order_id` | uuid FK → `order` | existing, `ON DELETE CASCADE` |
| `shop_id` | uuid FK → `shop` | existing, `ON DELETE RESTRICT` |
| `status` | text | **widened** — the five-state machine below |
| `item_count` | int | existing, ordered item count (never mutated by picking) |
| `subtotal_amount` | numeric(12,2) | existing, **never mutated** — a shortfall does not change what was charged (FR-010b) |
| `state_changed_at` | timestamptz | **new** — powers time-in-state (FR-011c) and at-risk escalation (FR-001a) |
| `created_at` / `updated_at` | timestamptz | existing |

**Why `state_changed_at` and not a derivation from `fulfillment_event`**: the queue renders on every poll
(R8); making the list query aggregate over an append-only history to find "how long in this state" is
correct but needlessly expensive and harder to index. The column is written in the same statement as the
transition, so it cannot drift.

**Backfill**: none required. Existing rows are `pending`, and `DEFAULT now()` gives them a
`state_changed_at`. This is slightly untrue for historical rows (it records the migration time, not the
fan-out time) and that is acceptable — no shop has ever seen those orders, and no live order exists yet
(019 carry-forward 2: no live purchase has ever run).

### State machine (FR-011)

```
pending ──▶ received ──▶ picking ──▶ ready_for_pickup ──▶ collected
                              ▲            │                (stub only,
                              └────────────┘                 FR-030)
                              the ONE permitted
                              reversal (FR-011d)
```

| State | Meaning | Entered by |
|---|---|---|
| `pending` | Created by the 019 fan-out; nobody has looked at it | 019 checkout finalizer |
| `received` | A human at the shop acknowledged it | **implicitly**, on first open by an operator of that shop (FR-011a) |
| `picking` | Actively gathering | deliberate operator action |
| `ready_for_pickup` | Gathered, awaiting collection. **Terminal for the shop** | deliberate operator action |
| `collected` | Placeholder driver took it | **dev-only stub** (FR-030); immutable thereafter (FR-011f) |

**Enforcement**: transitions are guarded in SQL, not only in code —
`UPDATE … WHERE id = $1 AND status = $expected` (R5). Zero rows affected means another operator already
applied it, which is a benign no-op, not an error (FR-014, SC-005). Backward transitions other than the
single permitted reversal are unreachable because no `$expected`/`$next` pair admits them.

---

## 2. `public.fulfillment_item` — NEW

Pick progress and shortfall for one order line within one portion. **Deliberately not columns on
`order_item`** — that is a receipt line, and letting a picking action mutate a financial record is the
coupling 019 designed against (R4).

```sql
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
CREATE INDEX fulfillment_item_portion_idx ON public.fulfillment_item (shop_fulfillment_id);
```

| Field | Notes |
|---|---|
| `ordered_quantity` | Copied from `order_item.quantity` at row creation. Denormalised so the accounting CHECK is enforceable in-row, and so the receipt line is never read to validate a pick. |
| `gathered_quantity` | How many were actually picked. |
| `unavailable_quantity` | The **shortfall** — paid for, not supplied (FR-010a). |
| `fulfillment_item_accounted_ck` | You cannot account for more than were ordered. Under-accounting is legal — that is simply "still picking". |

**Shortfall is the queryable debt** (Assumptions):
`ordered_quantity − gathered_quantity` on a terminal portion is what the customer paid for and did not
receive. The refunds slice inherits a ledger, not a reconstruction job.

**Rows are created lazily** — on the transition into `picking`, one row per `order_item` of that portion,
in one statement. They are not created by the 019 fan-out (which must not know about this slice).

**Reversibility** (FR-010d): un-flagging is `unavailable_quantity` decreasing. No row is deleted, so the
audit trail stays coherent.

---

## 3. `public.fulfillment_event` — NEW

Append-only audit. FR-019b makes this **load-bearing**: because no fulfilment action is role-restricted
(both `shop_manager` and `shop_staff` have full access), this table is the *only* accountability control
in the feature.

```sql
CREATE TABLE public.fulfillment_event (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_fulfillment_id uuid NOT NULL REFERENCES public.shop_fulfillment (id) ON DELETE CASCADE,
    actor_staff_id      uuid REFERENCES public.shop_staff (id) ON DELETE SET NULL,
    event_type          text NOT NULL
        CHECK (event_type IN ('state_changed', 'item_gathered', 'item_unavailable', 'item_restored')),
    from_status         text,
    to_status           text,
    order_item_id       uuid REFERENCES public.order_item (id) ON DELETE SET NULL,
    quantity            int,
    occurred_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fulfillment_event_portion_idx
    ON public.fulfillment_event (shop_fulfillment_id, occurred_at DESC);
```

| Field | Notes |
|---|---|
| `actor_staff_id` | **Nullable + `ON DELETE SET NULL`** — the audit record must survive the operator record being removed. A null actor means "the person is gone", not "nobody did it". |
| `from_status` / `to_status` | Populated for `state_changed`, including the reversal (FR-011e), so a prematurely-completed-then-rewound order leaves visible evidence. |
| `order_item_id` / `quantity` | Populated for the item events. |
| `occurred_at` | Append-only; rows are never updated or deleted. |

**Written in the same transaction as the change it records** (R6), so it can never disagree with
`shop_fulfillment.status`.

**Not reused: `admin.audit_log` (009)** — that lives in the `admin` schema and is back-office-scoped;
these are `public`-schema operational events at far higher volume.

---

## 4. Delivery promise — modelled, not stored (R7)

No schema change. The domain exposes:

```
DeliveryPromise { serviceLevel: string, readyBy: timestamp }
```

Today `serviceLevel` is the platform default and `readyBy` is derived from `order.placed_at` plus a
constant offset. Because the offset is uniform, **ordering by `readyBy` is ordering by `placed_at`** —
so FR-001's promise-ordering is *identical* to FIFO (SC-020) by construction rather than by a branch.

The queue's `ORDER BY` is the **single documented seam** 021 repoints:

```sql
-- 020: uniform promise ⇒ this IS strict FIFO (SC-020).
-- 021 replaces the sort expression with the real promised-ready column. Nothing else changes.
ORDER BY o.placed_at ASC, sf.id ASC
```

`sf.id` is the stable tiebreaker so the order is total and keyset-stable — two orders placed in the same
millisecond must not swap position between polls (FR-001, SC-018: position never changes).

**No `promised_ready_at` column is added here.** It would be a column this slice never populates, shaped
by guesses about a spec that does not exist — and 021 may model the promise per-shop rather than
per-order, an open question already recorded in [NEXT-021-delivery-zones.md](./NEXT-021-delivery-zones.md).

---

## 5. Authorization join (FR-019, R11)

`shop_id` is **never** accepted from a client. It is resolved from the authenticated subject:

```sql
SELECT ss.id, ss.shop_id
FROM public.shop_staff ss
JOIN public.shop s ON s.id = ss.shop_id
WHERE ss.cognito_sub = $1
  AND ss.status = 'active'      -- operator not disabled
  AND ss.shop_id IS NOT NULL    -- operator assigned to a shop
  AND s.status = 'active'       -- shop itself active (009's 3-value status)
```

All three terms in one predicate, fail-closed, and a uniform refusal that never discloses which term
failed (FR-020, SC-008). This mirrors 007's manager gate and 016's `authorizeShopMember`; **the role term
is deliberately absent** — clarification 2 gives both `shop_manager` and `shop_staff` full fulfilment
access (FR-019a).

Every subsequent query is then scoped `AND sf.shop_id = $resolvedShopId`, making cross-shop reads
structurally impossible rather than merely checked.

---

## 6. Customer-side projection (US5, hot path — R2)

**No schema change.** `apis/core-api/internal/features/orders` already selects the portions
shop-blind:

```sql
SELECT status, item_count, subtotal_amount
FROM public.shop_fulfillment WHERE order_id = $1 ORDER BY created_at ASC
```

Two additive changes:
1. `status` now carries richer values (FR-017) — no projection change needed.
2. A shortfall projection joined from `fulfillment_item`, **gated on terminal state** (FR-018b) so
   mid-pick churn never reaches the customer:

```sql
-- only when sf.status IN ('ready_for_pickup','collected')
SELECT oi.name, fi.unavailable_quantity
FROM public.fulfillment_item fi
JOIN public.order_item oi ON oi.id = fi.order_item_id
WHERE fi.shop_fulfillment_id = $1 AND fi.unavailable_quantity > 0
```

Shop identity remains absent from the projection entirely — the customer guarantee (FR-018, SC-009) is
inherited from 019's design rather than re-implemented.

---

## Validation rules (traceable to FRs)

| Rule | Source |
|---|---|
| Portion status ∈ the five states | FR-011 · CHECK constraint |
| Only `ready_for_pickup → picking` may go backward | FR-011d · guarded UPDATE (no other `$expected`/`$next` pair) |
| `collected` is immutable | FR-011f · every guarded UPDATE excludes it as `$expected` |
| `gathered + unavailable ≤ ordered` | FR-010a · CHECK constraint |
| Shortfall never alters money | FR-010b · `subtotal_amount` is never written by this slice |
| A portion completes even if fully unavailable | FR-010c, SC-012 · no CHECK requires `gathered > 0` |
| One portion per (order, shop) | 019 · existing UNIQUE |
| One progress row per (portion, line) | R4 · UNIQUE (shop_fulfillment_id, order_item_id) |
| Operator acts only on own shop | FR-019 · resolved server-side, never client input |
| Audit survives operator deletion | FR-015 · `ON DELETE SET NULL` |

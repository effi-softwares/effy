# Data Model: Customer Points (store credit)

**Feature**: 074-customer-points · **Migration**: one forward-only Goose migration,
`db/migrations/<ts>_customer_points.sql`. Research references: [research.md](research.md).

All amounts of money are `numeric(12,2)` like the rest of the order tables; all point counts are
`int` (whole points). Times are `timestamptz`.

---

## New tables

### `public.points_settings` — singleton (`id = 1`)

| Column | Type | Default | Rule |
|---|---|---|---|
| `id` | smallint PK | 1 | `CHECK (id = 1)` |
| `cents_per_point` | int | 1 | `> 0` |
| `expiry_months` | int | 12 | `BETWEEN 1 AND 120` |
| `csa_credit_limit_points` | int | 2000 | `>= 0` |
| `warning_days` | int | 30 | `BETWEEN 1 AND 365` |
| `hold_minutes` | int | 30 | `BETWEEN 5 AND 240` (R3) |
| `updated_by` | text | `'migration'` | acting staff sub |
| `updated_at` | timestamptz | now() | |

Seeded with one row by the migration.

### `public.points_settings_change` — audit of every settings change (FR-025)

`id uuid PK`, `field text`, `old_value text`, `new_value text`, `changed_by text NOT NULL`,
`changed_at timestamptz`. Append-only.

### `public.points_account` — the lock row

| Column | Type | Rule |
|---|---|---|
| `customer_id` | uuid PK → `customer(id)` ON DELETE CASCADE | |
| `created_at` | timestamptz | |

Created on first use (`INSERT … ON CONFLICT DO NOTHING`), then `SELECT … FOR UPDATE`. Holds no
figure — locking is its only job (R1).

### `public.points_entry` — every change to a balance (append-only)

| Column | Type | Rule |
|---|---|---|
| `id` | uuid PK | |
| `customer_id` | uuid → `customer(id)` | |
| `kind` | text | `staff_credit`, `auto_credit`, `returned` (credits) · `staff_debit`, `spent`, `expired`, `forfeited` (debits) |
| `points` | int | `<> 0`; **> 0 for credit kinds, < 0 for debit kinds** (CHECK ties sign to kind) |
| `reason` | text | closed vocabulary per kind (R11); `spent`/`returned`/`expired`/`forfeited` carry their kind as reason |
| `note` | text NULL | internal, staff only; required when `reason = 'other'` (CHECK) |
| `order_id` | uuid NULL → `order(id)` | must belong to `customer_id` (checked in the service under the lock, FR-010) |
| `refund_id` | uuid NULL → `refund(id)` | set on `returned` only; **UNIQUE** — one return per refund |
| `author_kind` | text | `staff` · `system` · `customer` (`spent` is the customer's own act) |
| `author_sub` | text NULL | staff sub or customer sub; NULL for `system` |
| `author_flow` | text NULL | required for `system`: e.g. `courier_override`, `points_expiry`, `refund` |
| `dedupe_key` | text NULL UNIQUE | lets an automatic flow credit idempotently (FR-009) |
| `expires_at` | timestamptz NULL | **NOT NULL for credit kinds, NULL for debits** (CHECK) |
| `created_at` | timestamptz | |

Indexes: `(customer_id, created_at DESC)` for history; partial `(customer_id, expires_at) WHERE
points > 0` for lots; UNIQUE `(order_id) WHERE kind = 'spent'`.

⚠ No UPDATE or DELETE is ever issued; `points-append-only.guard.test.ts` (new) scans every service
for one, as `refund-append-only.guard.test.ts` does for refunds.

### `public.points_allocation` — which lots a debit consumed (append-only)

| Column | Type | Rule |
|---|---|---|
| `debit_entry_id` | uuid → `points_entry(id)` | the debit |
| `credit_entry_id` | uuid → `points_entry(id)` | the lot |
| `points` | int | `> 0` |
| PK | `(debit_entry_id, credit_entry_id)` | |

Invariant (checked by the reconciliation, R13): for every lot, Σ allocations ≤ its points; for every
debit, Σ allocations = −its points.

### `public.points_hold` — points set aside for one checkout (R3)

| Column | Type | Rule |
|---|---|---|
| `order_id` | uuid PK → `order(id)` ON DELETE CASCADE | one hold per order |
| `customer_id` | uuid → `customer(id)` | |
| `points` | int | `> 0` |
| `state` | text | `held` → `spent` \| `released` |
| `held_until` | timestamptz NULL | NULL once spent/released |
| `created_at`, `updated_at` | timestamptz | |

Not history — a working record, like `delivery_slot_booking`. A lapsed `held` row is **not swept**;
it stops counting (R3).

### `public.points_expiry_notice` — one warning per customer per expiry date (SC-007)

`id uuid PK`, `customer_id uuid`, `expiry_date date` (Melbourne), `points int`, `created_at`;
UNIQUE `(customer_id, expiry_date)`.

---

## Changed tables

### `public."order"`

| Column | Type | Default | Meaning |
|---|---|---|---|
| `points_used` | int | 0 | points the customer chose and that were spent |
| `points_cents_per_point` | int NULL | | the setting at intent time; NULL when no points used |
| `points_value_amount` | numeric(12,2) | 0 | `points_used × cents_per_point / 100` |
| `points_shortfall_amount` | numeric(12,2) | 0 | late-payer gap Effy absorbed (R3); > 0 raises the alarm |

`grand_total_amount` is unchanged in meaning; **card paid = `payment.amount`** =
`grand_total_amount − points_value_amount` (R4).

### `public.payment`

No schema change. A points-only order has `provider = 'points'`, `amount = 0`,
`stripe_payment_intent_id = NULL`, `status = 'succeeded'`.

### `public.refund`

| Column | Type | Default | Meaning |
|---|---|---|---|
| `card_amount` | numeric(12,2) NULL | | the part returned to the card; **NULL on pre-074 rows = all of `amount`** |
| `points_returned` | int | 0 | whole points returned |
| `points_value_amount` | numeric(12,2) | 0 | their money value at the order's `points_cents_per_point` |

CHECK: `card_amount IS NULL OR card_amount + points_value_amount = amount`. These are written at
INSERT only; `refund-append-only.guard.test.ts` keeps its list of updatable columns unchanged.

### `public.notification_request`

`type` CHECK gains `points_credited`, `points_expiring`.

---

## The one function

```
public.points_usable(p_customer uuid, p_at timestamptz, p_except_order uuid DEFAULT NULL) RETURNS int
```

= Σ over the customer's credit lots with `expires_at > p_at` of (lot points − Σ its allocations)
− Σ `points_hold.points` with `state = 'held' AND held_until > p_at AND order_id IS DISTINCT FROM
p_except_order`. `GREATEST(0, …)` is **not** applied — a negative result is an invariant violation the
reconciliation must see, not hide.

Read by: checkout quote/intent, finalize, staff debit, the customer balance route, the back-office
customer view. No other code computes a balance.

---

## State transitions

**Hold** (`points_hold.state`)

```
          intent (account locked, usable ≥ points)
 (none) ─────────────────────────────────────────► held ──paid──► spent   (writes a `spent` entry)
                                                     │
                                                     ├─ payment failed / order cancelled unpaid ─► released
                                                     └─ held_until passes ─► (still `held`, no longer counts)
```

**Refund** (055 machine, unchanged) with points:

```
card part = 0  ──► inserted `succeeded`  + `returned` entry in the same transaction
card part > 0  ──► submitting ──► submitted (+ `returned` entry, same transaction) ──► succeeded | failed
                        └─────► refused  (no points returned)
```

---

## Validation rules (from the spec)

| Rule | Where enforced |
|---|---|
| Balance never negative (FR-004) | account lock + `points_usable` check before every debit/hold; reconciliation alarm |
| Reason required; note required for `other` (FR-006/008) | service validation + CHECK |
| CSA per-credit limit (FR-007) | service, from `points_settings` read under the lock |
| Only admin/manager debit (FR-008) | `requireWriter` |
| Order belongs to customer (FR-010) | service, under the lock |
| Points ≤ min(usable, order total) (FR-012) | commerce `createIntent` |
| Card remainder 0 or ≥ A$0.50 (R4) | commerce `createIntent` |
| Refund never returns more points or card than paid (FR-019) | refund `record`, under the payment lock |
| One `returned` per refund; one `spent` per order | UNIQUE indexes |
| Settings only by admin; audited (FR-025) | `hasStaffRole('admin')` + `points_settings_change` |

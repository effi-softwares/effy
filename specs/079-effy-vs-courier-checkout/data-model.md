# Data Model: Delivered by Effy vs Courier Delivery

**Feature**: 079 · One forward-only, additive migration: `db/migrations/<ts>_order_delivery_type.sql`.
Nothing is dropped. The running services keep working between migrate and deploy: the new columns are
nullable, and `coverage_for_postcode` keeps answering a one-argument call.

## Changed: `public."order"`

| Column | Type | Rule | Meaning |
|---|---|---|---|
| `delivery_type` | `text NULL` | `CHECK (delivery_type IN ('effy','courier'))` | Who delivers the order. **NULL = placed before 079** — never backfilled (R2). Written at the intent (pending) and fixed at payment. |
| `delivery_type_reason` | `text NULL` | `IN ('in_coverage','out_of_coverage','no_window','staff_change')`; NULL iff `delivery_type` is NULL | Why. `staff_change` is written only by E7. |
| `courier_estimate` | `text NULL` | `CHECK ((delivery_type IS NOT DISTINCT FROM 'courier') = (courier_estimate IS NOT NULL))` — set exactly when the order is a courier order | The estimate text exactly as sold (FR-014). |

Index: `order_delivery_type_idx ON "order" (delivery_type, placed_at DESC) WHERE delivery_type IS NOT NULL`
(the back-office filter).

## New: `public.order_delivery_type_change` (append-only)

| Column | Type | Rule |
|---|---|---|
| `id` | `uuid PK DEFAULT gen_random_uuid()` | |
| `order_id` | `uuid NOT NULL REFERENCES "order"(id)` | |
| `from_type` | `text NULL` | NULL only on the first entry |
| `to_type` | `text NOT NULL` | `IN ('effy','courier')`; `<> from_type` |
| `reason` | `text NOT NULL` | same four values as the order's |
| `actor_kind` | `text NOT NULL` | `IN ('checkout','staff')` |
| `actor_sub` | `text NULL` | NOT NULL iff `actor_kind = 'staff'` |
| `note` | `text NULL` | ≤ 500 chars |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | |

- `UNIQUE (order_id) WHERE from_type IS NULL` — one first entry; makes `finalize`'s insert idempotent.
- Index `(order_id, created_at)`.
- ⚠ `REVOKE UPDATE, DELETE` from `effy_shopper` — the one restricted role the platform has (074's
  pattern, F9); the other services connect as the owner and are held by the guard test. One writer:
  `recordDeliveryType` in `@effy/edge-shared/delivery`.

## Changed: `public.delivery_settings` (singleton)

| Column | Type | Default | Rule | Meaning |
|---|---|---|---|---|
| `courier_estimate_text` | `text NULL` | NULL | trimmed length 3–60 | "2–4 business days" — completes "Usually arrives in …". Platform-wide until E6's courier services. |
| `courier_when_no_windows` | `boolean NOT NULL` | `false` | — | Offer courier to an Effy-area address when no window is open on any offered day (FR-011). |

## New function: `public.courier_delivery_state(p_at timestamptz) RETURNS text`

`STABLE`. Where courier delivery stands for the whole platform: `courier_off` | `courier_not_ready` |
`courier_pending` | `courier_offered`. `courier_reaches_postcode` adds the postcode's own facts to it;
the back-office console reads it to say "pending" without reading the model switch itself (which has
one TypeScript reader, 078's guard).

## New function: `public.courier_reaches_postcode(p_postcode text, p_at timestamptz) RETURNS text`

`STABLE`. Returns the staff reason: `courier_offered` (yes) or why not — `unknown_postcode`,
`courier_off`, `courier_excluded`, `courier_pending` (on, new model not yet on at `p_at`),
`courier_not_ready` (no active courier fee table, or no estimate text). ⚠ The one definition of "a
courier order can be placed to this postcode"; it never looks at Effy's list.

## Replaced: `public.coverage_for_postcode(p_postcode text, p_at timestamptz DEFAULT now())`

Same result columns. Listed → `effy` (unchanged, nothing else consulted). Otherwise
`courier_reaches_postcode` decides: `courier_offered` → `courier`; any other reason → `none` with that
reason. Dropped and recreated (a signature change); the one-argument call still resolves. Grants as 076.

## New function: `public.package_delivered_by(p_delivery_type text, p_method text, p_slot_id uuid) RETURNS text`

`IMMUTABLE`. `COALESCE(p_delivery_type, CASE WHEN p_method = 'same_day' OR p_slot_id IS NOT NULL THEN
'effy' ELSE 'courier' END)`. ⚠ The one definition of who takes a package, for old and new orders —
handover, "needs handover", on-time, the shop label and the back-office column all call it (R2).

## Unchanged, written differently

| Object | For a courier order |
|---|---|
| `order_package_delivery` | one row per shop: `method = 'standard'`, no slot, no window, `promised_from/to` NULL (R3) |
| `shop_fulfillment.delivery_method` | `'standard'` (copied by `finalize`); shops are shown `package_delivered_by`, not this |
| `delivery_slot_booking` | no row (FR-012); a row left by an earlier Effy attempt on the same pending order is deleted by the intent |
| `order.delivery_fee_amount` / `delivery_fee_breakdown` | the courier fee and its breakdown (`kind: "courier"`, 077) |
| `order.delivery_quote` | `{serviced:true, coverage:"courier", fee, estimate, reason}` |

Column comments on `order_package_delivery.method` and `shop_fulfillment.delivery_method` are rewritten:
*routing detail since 079; who delivers is `order.delivery_type` via `package_delivered_by`.*

## Domain shapes (TypeScript)

```text
DeliveryType        "effy" | "courier"
DeliveryTypeReason  "in_coverage" | "out_of_coverage" | "no_window" | "staff_change"
QuoteResult         … | { serviced: true, coverage: "courier", fee: PricedFee, estimate: string,
                          reason: "out_of_coverage" | "no_window", freeDeliveryRemainingCents: number | null }
DeliverySummary     { heading: string, lines: string[] }         (shared-types, R6)
```

## Validation rules

- A courier quote exists only when `courier_reaches_postcode` says `courier_offered` (FR-010).
- An intent whose `deliveryType` differs from the quote's — or omits it for a courier quote — is refused
  `delivery_type_changed`; nothing is written (FR-005).
- A courier intent ignores `deliveryWindow` and the 069 fields; it never takes a hold (FR-012).
- `estimateText`: 3–60 characters after trimming, no line breaks; cannot be cleared while
  `courier_offered` is true. The active courier fee table cannot be deactivated while it is true.
- `courier_offered` may be set true only with an active courier table and an estimate (it may be set
  before the model switch; it then reads `courier_pending`).

## State: an order's delivery type

```
(intent)  ── pending: type/reason/estimate rewritten on every intent ──►
(payment) ── fixed; history entry #1 {from: —, to, reason, actor: checkout} ──►
(E7 only) ── staff change: columns + entry {from, to, staff_change, actor, note}
```

# Data Model: Shop Console — Today & Insights (058)

One forward-only Goose migration, `db/migrations/<ts>_shop_insights.sql`. House style: raw SQL, `public`
schema, text `CHECK` enums, an index on every FK, a `COMMENT` on every table explaining why it exists.

Nothing here changes an existing column's meaning. Operational figures (Today) read **existing** tables
only; the new tables serve Insights (FR-026) and carry the realtime signal (research R6).

---

## 1. `public.shop.timezone` (new column)

| Column | Type | Rule |
|---|---|---|
| `timezone` | `text NOT NULL DEFAULT 'Australia/Melbourne'` | An IANA zone name. Validated on read against `pg_timezone_names`; an unknown value falls back to the default with a logged warning (research R11). |

Defines the shop's "today", hours, days and Monday-start weeks (FR-023). No editor in this slice.

---

## 2. Rollups (Insights' only data source)

### 2.1 `public.shop_sales_hour`

One row per shop per local hour that had any activity.

| Column | Type | Meaning |
|---|---|---|
| `shop_id` | `uuid NOT NULL → shop(id) ON DELETE CASCADE` | |
| `bucket_start` | `timestamptz NOT NULL` | The UTC instant at which this local hour began in the shop's timezone (research R5; architecture doc §1.3). |
| `gross_goods` | `numeric(12,2) NOT NULL DEFAULT 0` | Σ this shop's `order_item.line_subtotal_amount` on orders paid in the hour. |
| `refunds` | `numeric(12,2) NOT NULL DEFAULT 0` | Σ refunds attributed to this shop issued in the hour (research R7). |
| `refunded_orders` | `int NOT NULL DEFAULT 0` | Distinct orders those refunds belong to. |
| `orders` | `int NOT NULL DEFAULT 0` | This shop's portions whose order was paid in the hour. |
| `units` | `int NOT NULL DEFAULT 0` | Σ `order_item.quantity` on those portions. |
| `cant_supply` | `int NOT NULL DEFAULT 0` | Portions moved to `unfulfillable` in the hour (from `fulfillment_event`). |
| `cant_supply_units` | `int NOT NULL DEFAULT 0` | Σ unavailable units on them. |
| `cancelled` | `int NOT NULL DEFAULT 0` | Portions moved to `withdrawn` in the hour. |
| `computed_at` | `timestamptz NOT NULL DEFAULT now()` | When this row was last recomputed. |

`PRIMARY KEY (shop_id, bucket_start)`. Revenue for any window is `Σ gross_goods − Σ refunds`. All counts
`CHECK (>= 0)`.

### 2.2 `public.shop_product_sales_day`

| Column | Type | Meaning |
|---|---|---|
| `shop_id` | `uuid NOT NULL → shop(id) ON DELETE CASCADE` | |
| `local_date` | `date NOT NULL` | In the shop's timezone. |
| `product_id` | `uuid NOT NULL → product(id) ON DELETE CASCADE` | |
| `units` | `int NOT NULL` | Units sold that day. |
| `gross_goods` | `numeric(12,2) NOT NULL` | Goods value sold that day. |

`PRIMARY KEY (shop_id, local_date, product_id)`; index `(product_id)` for the FK. Name, SKU and
thumbnail are joined from `product` at read time (a renamed product shows its current name).

### 2.3 `public.insights_dirty` — the work queue

| Column | Type |
|---|---|
| `shop_id` | `uuid NOT NULL → shop(id) ON DELETE CASCADE` |
| `bucket_start` | `timestamptz NOT NULL` |
| `marked_at` | `timestamptz NOT NULL DEFAULT now()` |

`PRIMARY KEY (shop_id, bucket_start)`; written `ON CONFLICT DO NOTHING` (the first mark's `marked_at` is
kept, so backlog age measures the oldest unserved correction). Index `(marked_at)` for the job's claim
order and the backlog alarm. **This table is the durable queue** — there is no DLQ because a failed run
leaves the row for the next one (architecture doc §3).

### 2.4 `public.insights_state` — per-shop watermark

| Column | Type | Meaning |
|---|---|---|
| `shop_id` | `uuid PRIMARY KEY → shop(id) ON DELETE CASCADE` | |
| `timezone` | `text NOT NULL` | The timezone the rollups were built under. ≠ `shop.timezone` ⇒ full rebuild. |
| `computed_at` | `timestamptz NOT NULL` | The payload's `computedAt`: the last time this shop's dirty set was drained. |

---

## 3. Triggers (research R6)

A single function per concern; each does **only** `pg_notify('shop_ops', …)` and/or an
`INSERT INTO public.insights_dirty … ON CONFLICT DO NOTHING`.

| Trigger function | On | Emits |
|---|---|---|
| `shop_ops_poke_portion()` | `shop_fulfillment` AFTER INSERT, AFTER UPDATE OF `status` | poke(shop); dirty(shop, hour of `now()`) when `NEW.status IN ('unfulfillable','withdrawn')` |
| `shop_ops_poke_item()` | `fulfillment_item` AFTER INSERT, AFTER UPDATE OF `gathered_quantity`, `unavailable_quantity` | poke(shop of the portion) |
| `shop_ops_poke_product()` | `product` AFTER UPDATE OF `stock_on_hand`, `low_stock_threshold`, `stock_tracked`, `status` | poke(`product.shop_id`) |
| `shop_ops_order_status()` | `order` AFTER UPDATE OF `status` when it changes | poke + dirty(shop, hour of `placed_at`) for each distinct `order_item.shop_id` |
| `shop_ops_refund()` | `refund` AFTER INSERT, AFTER UPDATE OF `status` | poke + dirty(shop, hour of `refund.created_at`) for each shop with goods on the order |
| `shop_ops_poke_dismissal()` | `refund_proposal_dismissal` AFTER INSERT | poke(shop of `NEW.shop_fulfillment_id`) |

**Hour of an instant** in SQL, for the shop's timezone `tz`:
`(date_trunc('hour', ts AT TIME ZONE tz)) AT TIME ZONE tz` — the UTC instant at which that local hour
began. Shared as one SQL function `public.shop_local_hour(ts timestamptz, tz text) RETURNS timestamptz
IMMUTABLE`, used by the triggers, the job and the reads, so the three can never bucket differently.

**Notify payload**: the shop id as text (≤ 36 bytes; the 8,000-byte limit is irrelevant). Postgres
collapses identical payloads within one transaction (architecture doc [S17]), so a 20-line pick in one
transaction is one poke.

---

## 4. Read shapes (derived, not stored)

### 4.1 Today snapshot — computed per request from live tables

- **backlog.awaitingPick** — portions of this shop in `pending`/`received`: count, Σ units, min
  `COALESCE(placed_at, created_at)`. The single source for FR-006 (research R8).
- **readyForPickup** — count in `ready_for_pickup`.
- **attention[]** — research R12 (awaiting pick, out of stock, below threshold, refund proposals for
  managers). Proposals via the promoted `@effy/edge-shared` rule, scoped by `order_item.shop_id`.
- **live[]** — this shop's 5 most recently paid portions: portion id, order number, recipient name,
  paid-at, item count (Σ quantity on this shop's lines), delivery method, the order's total. Every row
  is a stored portion (FR-009).
- **glance** — *not* in this payload: the Today screen reads `GET /shop/v1/insights?range=today` for its
  first three glance cells, which is what makes them equal Insights' Today values by construction
  (FR-014).
- **now**, **timezone**, **etag**.

### 4.2 Insights payload — from rollups only

For a range, the service computes the window `[from, to)` and the comparison window in the shop's
timezone, then reads:

1. `Σ` over `shop_sales_hour` for both windows (≤ 2 × 720 rows for 30 days),
2. the chart series by bucketing those rows by hour / local day / ISO week,
3. top 5 from `shop_product_sales_day` for the window, joined to `product`.

It never touches `order` or `order_item` (FR-026 — a guard test greps the insights repository for those
table names outside comments).

### 4.3 Team activity — computed per request

Newest 50 from the last 14 days: `fulfillment_event` ∪ `stock_movement` (shop actor) ∪ `refund` (shop
actor), each scoped to this shop, actor resolved per research R14.

---

## 5. Entities (from the spec) → storage

| Spec entity | Where it lives |
|---|---|
| Shop operating timezone | `shop.timezone` (§1) |
| Operational snapshot | Derived per request (§4.1) from `shop_fulfillment`, `order_item`, `product`, `stock_movement`, refund proposals |
| Live order entry | A row of §4.1 `live[]` — always a stored `shop_fulfillment` |
| Period figures | `shop_sales_hour`, `shop_product_sales_day` (§2), watermark `insights_state` |
| Team activity entry | Derived per request (§4.3) from existing audit tables |

---

## 6. Validation rules

- `range ∈ {today, 7d, 30d}`; anything else → `400` problem with `errors.range`.
- Every read is scoped by the gate's shop id; no request parameter carries a shop id (the 020/057 rule,
  enforced by the existing `no-shop-id-in-request` guard, which gains the new handlers).
- Refund-proposal attention items are included only when the gate's operator holds `shop_manager`
  (057 FR-014); the server filters, not the client.
- `pick-lists` returns at most 100 portions; the response says how many more exist.

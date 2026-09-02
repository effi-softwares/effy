# Phase 1 Data Model: Shop Console Redesign

Conventions follow the platform's existing standard: PostgreSQL 16, raw SQL via Goose migrations,
`public` schema, UUID primary keys, `created_at`/`updated_at` timestamps unless noted. Exact
column names/types are refined at task-breakdown time against the real committed schemas this
model references (see research.md R8 for the one deferred item).

## Existing entities touched (no new tables)

### `public.product` (054)

- **Adds**: `supplier_id uuid NULL REFERENCES supplier(id)` — nullable, since supplier assignment
  is optional (FR-016's "unassigned" grouping in the restock queue depends on this being NULL-able).
- No other columns change. Customer-facing price fields are untouched (FR-018b).

### `public.stock_movement` (054, append-only)

- **Adds**: `purchase_order_line_id uuid NULL REFERENCES purchase_order_line(id)` — nullable, set
  only when a movement originates from a purchase-order receipt (FR-018); the existing manual
  "receive stock" path continues to leave this NULL, unchanged.

### Refund/cancellation entity (055 — exact table name confirmed at task time, research R8)

- **Adds**: an initiator reference, shape TBD at task time but minimally: an `initiated_by` enum
  discriminator (`customer` / `back_office` / `shop`) and a nullable `initiated_by_shop_staff_id`
  (and implicitly the shop, via the existing order→shop_fulfilment relationship) when
  `initiated_by = 'shop'`. This is additive and nullable — every existing refund row (customer-
  or back-office-initiated) is unaffected, and FR-014a's requirement that the shop console shows
  the *same* record as the customer/back-office views (never a second one) is what this column
  makes possible without a parallel table.

### `public.shop_staff` / `public.shop_staff_role` (007/009)

- **No schema change.** This redesign adds a **second write path** (shop-web, own-shop-scoped,
  manager-only) onto the same tables back-office's `edge-api/admin` already writes, via the same
  provisioning mechanism (research R5). One system of record, two authorized writers.

## New entities

### `public.supplier`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `shop_id` | uuid, NOT NULL, FK → `shop(id)` | shop-scoped (research R4) |
| `name` | text, NOT NULL | |
| `contact_email` | text, NULL | |
| `contact_phone` | text, NULL | |
| `created_at` / `updated_at` | timestamptz | |

- **Validation**: `name` non-empty; uniqueness of `name` scoped to `(shop_id)` (a shop should not
  create the same supplier twice, but two shops may each have a supplier of the same name — no
  cross-shop identity is implied).

### `public.purchase_order`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `shop_id` | uuid, NOT NULL, FK → `shop(id)` | shop-scoped |
| `supplier_id` | uuid, NOT NULL, FK → `supplier(id)` | one supplier per PO, matching the restock queue's supplier-grouped build flow (US6) |
| `status` | text, NOT NULL, CHECK IN (`draft`,`submitted`,`received`,`partially_received`) | FR-018a |
| `reference` | text, NULL | free-text external reference, e.g. `"PO-2091"` — matches the mockup's own reference field |
| `created_by_staff_id` | uuid, NOT NULL, FK → `shop_staff(id)` | audit trail |
| `created_at` / `submitted_at` / `received_at` | timestamptz, nullable except `created_at` | state-transition timestamps |

- **State machine**: `draft → submitted → (partially_received) → received`. A PO with any line's
  `received_qty < ordered_qty` after a receive action is `partially_received`, not `received`
  (FR-018a's "outstanding quantity remains visible" requirement).

### `public.purchase_order_line`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `purchase_order_id` | uuid, NOT NULL, FK → `purchase_order(id)` ON DELETE CASCADE | |
| `product_id` | uuid, NOT NULL, FK → `product(id)` | |
| `ordered_qty` | integer, NOT NULL, CHECK > 0 | |
| `received_qty` | integer, NOT NULL, DEFAULT 0, CHECK >= 0 AND <= ordered_qty | partial receipt (FR-018a) |
| `unit_cost` | numeric(10,2), NOT NULL, CHECK >= 0 | the shop's purchase cost — never the customer-facing price (FR-018b) |

- **Behavior**: marking a purchase order (fully or partially) received creates one
  `stock_movement` row per line for the newly-received delta (not the cumulative total), each
  tagged with `purchase_order_line_id` (FR-018) and increases `product.stock_on_hand` by that
  delta, reusing 054's existing stock-increment mechanism rather than a new one.

## Key Entities (spec cross-reference)

This section restates the spec's Key Entities with their concrete backing, for traceability:

- **Shop Fulfilment** — unchanged; `public.shop_fulfillment` (020/053), presentation-only rework.
- **Product** — `public.product` (054/016), gains `supplier_id` only.
- **Stock Movement** — `public.stock_movement` (054), gains `purchase_order_line_id` only.
- **Supplier** — new, `public.supplier`.
- **Purchase Order** — new, `public.purchase_order` + `public.purchase_order_line`.
- **Refund / Cancellation Request** — existing 055 entity, gains an initiator reference only; no
  new state machine, no new settlement path.
- **Shop Staff / Roster** — unchanged schema (`public.shop_staff`/`shop_staff_role`, 007/009),
  gains a second authorized writer (shop-web, own-shop-scoped, manager-only).

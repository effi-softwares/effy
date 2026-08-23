# Data Model: Driver Delivery App (049)

One forward-only Goose migration `<ts>_driver_delivery.sql`, everything in `public`, raw SQL, text CHECK
enums (house style, no native PG enums, no triggers), an index on every FK, `numeric(12,2)` never used for
counts, `COMMENT ON` for intent. **Reuses** existing tables; adds the driver-side tables below.

## Reused (not created) — see [research.md](./research.md) R3

| Existing table | Role here |
|---|---|
| `public.shop_fulfillment` (`UNIQUE(order_id, shop_id)`) | **The package** the driver collects. Status advances `ready_for_pickup → collected → delivered` (020 widened the enum for the dev stubs; this slice makes those transitions real and guards them). |
| `public.order_package_delivery` (`UNIQUE(order_id, shop_id)`, `method`) | The package's **method** (`same_day`\|`standard`) — the hub-check-in split. Joined to `shop_fulfillment` by `(order_id, shop_id)`. |
| `public."order"`, `public.order_item` | Order ref, customer, line items → the manifest. |
| `public.customer_address` | The **drop** address + instructions. |
| `public.delivery_settings` (singleton) | The **hub** (lat/lng). Single central hub (v1). |
| `public.delivery_collection_run` | The **collection schedule** (run times, Melbourne wall-clock). |
| `public.delivery_zone` | Zone assignment is scoped to. |

## New tables

### `driver`
The driver record — authoritative for the access decision (Principle IV).
- `id uuid pk`, `cognito_sub text UNIQUE NOT NULL` (driver pool sub), `name text NOT NULL`,
  `work_email citext UNIQUE NOT NULL`, `delivery_zone_id uuid NULL REFERENCES delivery_zone`,
  `vehicle_type text NULL`, `vehicle_plate text NULL`,
  `status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled'))`,
  `created_at`, `updated_at`.
- Hub is the singleton `delivery_settings` in v1 (no per-driver hub column yet — recorded for multi-hub).
- Provisioned by back-office (`admin/drivers`); status/zone are platform-owned, never written from a claim.

### `driver_duty_session`
- `id uuid pk`, `driver_id uuid NOT NULL REFERENCES driver`, `started_at timestamptz NOT NULL`,
  `ended_at timestamptz NULL`, plus a **partial unique index** ensuring at most one open session per driver
  (`WHERE ended_at IS NULL`). "On duty" = an open session; gates assignment (FR-005).
- Optional `last_location_lat/lng numeric`, `last_location_at timestamptz` — the **snapshot** for
  nearest-driver preference (R2); nullable, never streamed.

### `driver_run`
A collection run or a same-day delivery run (groups tasks; powers the phase-aware home + history).
- `id uuid pk`, `driver_id uuid NOT NULL REFERENCES driver`,
  `type text NOT NULL CHECK (type IN ('collection','same_day_delivery'))`,
  `status text NOT NULL CHECK (status IN ('assigned','active','checked_in','completed','cancelled'))`,
  `business_date date NOT NULL` (Melbourne), `assigned_at`, `completed_at NULL`.
- `checked_in` applies to a collection run at hub check-in; a delivery run goes `assigned → active →
  completed`.

### `collection_task`
One package to collect from a shop (a stop belongs to a shop; a run's stops are ordered by `sequence`).
- `id uuid pk`, `run_id uuid NOT NULL REFERENCES driver_run`,
  `shop_fulfillment_id uuid NOT NULL REFERENCES shop_fulfillment`,
  `shop_id uuid NOT NULL REFERENCES shop`, `sequence int NOT NULL`,
  `status text NOT NULL CHECK (status IN ('assigned','en_route','collected','short'))`,
  `collected_at NULL`.
- `UNIQUE(shop_fulfillment_id)` — a package is collected by exactly one task (no double-assign, R10).
- Missing/short reporting lives in `collection_task_issue` (below); a `short` status marks a partial pickup.

### `collection_task_issue`
Reported missing/short package/item at a shop (FR-015) — does not block collecting the rest.
- `id uuid pk`, `collection_task_id uuid NOT NULL REFERENCES collection_task`,
  `order_item_id uuid NULL REFERENCES order_item`, `kind text CHECK (kind IN ('missing','short'))`,
  `note text NULL`, `reported_at`.

### `delivery_task`  (a drop)
One customer drop = an order's same-day packages (FR-018, SC-006).
- `id uuid pk`, `run_id uuid NOT NULL REFERENCES driver_run`,
  `order_id uuid NOT NULL REFERENCES "order"`,
  `customer_address_id uuid NOT NULL REFERENCES customer_address`, `sequence int NOT NULL`,
  `status text NOT NULL CHECK (status IN ('staged','out_for_delivery','en_route','arrived','delivered','failed'))`,
  `delivered_at NULL`.
- `UNIQUE(order_id)` per active delivery — one open drop per order at a time.

### `delivery_task_package`
Join: the same-day packages that make up a drop.
- `delivery_task_id uuid NOT NULL REFERENCES delivery_task`,
  `shop_fulfillment_id uuid NOT NULL REFERENCES shop_fulfillment`,
  `PRIMARY KEY (delivery_task_id, shop_fulfillment_id)`, `UNIQUE(shop_fulfillment_id)`.

### `proof_of_delivery`
1:1 with a `delivered` drop; a drop cannot reach `delivered` without one (FR-026).
- `id uuid pk`, `delivery_task_id uuid NOT NULL UNIQUE REFERENCES delivery_task`,
  `method text NOT NULL CHECK (method IN ('photo','code','signature','contactless'))`,
  `media_key text NULL` (private S3 key for photo/signature), `code_verified boolean NULL`,
  `note text NULL`, `captured_at timestamptz NOT NULL`.

### `delivery_failure`
Undeliverable record (FR-028) — for back-office follow-up.
- `id uuid pk`, `delivery_task_id uuid NOT NULL REFERENCES delivery_task`,
  `reason text NOT NULL CHECK (reason IN ('nobody_home','wrong_address','customer_refused','access_blocked','other'))`,
  `note text NULL`, `failed_at`.

### `driver_task_event`
Append-only status timeline (powers history detail, FR-034). Written in the same tx as each transition.
- `id uuid pk`, `run_id uuid NULL`, `collection_task_id uuid NULL`, `delivery_task_id uuid NULL`,
  `status text NOT NULL`, `at timestamptz NOT NULL`, `change_id uuid NULL` (idempotency, R10).
- Exactly one of the three FKs is set (CHECK).

### `driver_activity`
In-app activity feed (FR-032) — also the source for push when the notifications path lands.
- `id uuid pk`, `driver_id uuid NOT NULL REFERENCES driver`,
  `type text CHECK (type IN ('run_assigned','packages_ready','sameday_window','reminder','issue_ack'))`,
  `run_id uuid NULL`, `delivery_task_id uuid NULL`, `body text NOT NULL`, `created_at`, `read_at NULL`.

## State machines

- **Package** (`shop_fulfillment.status`): `ready_for_pickup → collected` (collection_task) `→ delivered`
  (delivery_task, same-day only). Standard packages stop at `collected` (checked in at hub → external
  carrier; a `carrier_staged` marker may be added if needed, else `collected` + method=standard suffices).
- **Collection run**: `assigned → active → checked_in`. Hub check-in requires every `collection_task` in
  `collected`/`short`.
- **Delivery run**: `assigned → active → completed` (all drops terminal).
- **Drop** (`delivery_task.status`): `staged → out_for_delivery → en_route → arrived → delivered` | `failed`.

## Idempotency & integrity (R10)

- Per-action `change_id` on every write; a repeated `change_id` is a no-op returning the current state.
- Assignment worker claims candidate packages/orders `FOR UPDATE SKIP LOCKED`; `UNIQUE(shop_fulfillment_id)`
  on `collection_task`/`delivery_task_package` makes a double-assign impossible.
- Returning ineligible-driver work to the pool = delete/void the open task rows for that driver's
  not-yet-collected packages so the next sweep re-assigns them; already-`collected`/in-progress work is not
  yanked mid-step (FR-011 edge case).

## Not modeled (recorded)

- No per-driver **hub** column (single hub v1; multi-hub deferred).
- No **return-to-hub** for undelivered packages (design carry-forward).
- No **carrier integration** table beyond staging standard packages (external carrier is out of scope).

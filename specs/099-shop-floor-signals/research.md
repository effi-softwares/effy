# Research: Shop Floor Signals (099)

Decisions for the four "Needs backend" parts of the shop console redesign. Each records what was
found in the code on 2026-10-24.

## R1 - An order's collection run is derived on read, by the planner's own rule

**Found**: `delivery_collection_run` holds the schedule (wall-clock `run_time`, `active`/`disabled`).
The fleet planner (`fleet/src/planner/service.ts`) collects every package ready at a shop on the
**next run** (`nextRunInstant`), except an Effy parcel sold a window, which waits for the **latest run
that still makes its window** (`dueRun` → `collectionRunFor`, with the hub turnaround and the
no-delivery calendar). A parcel whose due run has passed goes on the next run.

**Decision**: the shop service computes each open Effy portion's run on read with the same rule:
`run = max(nextRunInstant(now), dueRun(portion) ?? nextRunInstant(now))`. `dueRun` moves from
`fleet/src/planner/service.ts` into `@effy/edge-shared` (`lib/collection-deadline.ts`, beside
`collectionRunFor`) and the planner imports it from there - **one rule, two readers**, never a copy.
No table is added: the run is a function of facts that already exist.

**Alternatives rejected**: storing the run on the portion (a second fact to keep in step with the
schedule and the window; it goes stale when back-office edits runs); asking the planner's last wave
(only covers packages already ready, and the shop needs the run while still picking).

**Privacy**: the computation reads the window's start server-side; only the run instant leaves the
server. The shop is never sent a window, a day promise or a delivery time (FR-008).

## R2 - The run's driver: assigned, on the way, collected

**Found**: a collection round is `driver_round(kind='collection', deadline_at = run instant)` with a
`round_stop(kind='shop_pickup', shop_id)` per shop and `round_package` per portion. The round opens at
`public.round_opens_at('collection', deadline_at, NULL)` (run − `planning_lead_min`); before that the
driver service refuses every action. `driver_round.status` becomes `in_progress` only at the first
collect, so it cannot mean "set off". `driver_duty_session` records duty. The stop is `done` once the
driver collected there.

**Decision**: per run, for this shop:
- `none` - no round has a `shop_pickup` stop for this shop on this run;
- `assigned` - a round exists, not open yet (now < opens at) or the driver is off duty;
- `on_the_way` - the round is open, its driver is on duty, and this shop's stop is not `done`;
- `collected` - this shop's stop is `done` (the shop's next-collection panel then moves to the next run).

The server returns the state it sees and the round's `opensAt`, so the screen can turn "assigned"
into "on the way" at the opening minute by re-wording with its own clock (the allowed `useNow` clock;
no re-read on a timer). No driver name, position or other stop is sent.

## R3 - Live updates for collection facts

**Found**: shops already hear `orders` when a package moves (`announceMoves`), on hub check-in and on
a stop's change (`driver/src/work/announce.ts`). They do **not** hear when the planner assigns or
releases collection work, or when a driver goes on or off duty.

**Decision**: after commit, (a) the planner pass announces `orders` to every shop with a portion it
assigned to or released from a collection round; (b) duty on/off announces `orders` to the shops on
that driver's open collection rounds. Both through `@effy/edge-shared/live`'s `announce`, which never
throws. The shop console already maps `orders` to Today and the order queries.

## R4 - Pick order uses the line's storage-class snapshot

**Found**: `order_item.storage_class` (`ambient` | `chilled` | `frozen`, default `ambient`) is
snapshotted at checkout and already drives the bag zones (`zonesNeeded`).

**Decision**: the shop order line contract gains `storageClass` (required; every line has one). The
console groups Ambient → Chilled → Frozen. The printed pick list (one order or Today's batch) reads the
same field. No migration. Words: "Ambient", "Chilled", "Frozen" (`PARCEL_ZONE_WORDS` already uses
them).

## R5 - Availability is one new read in the shop service; the switch is the existing route

**Found**: stock and on-sale live on `product_variant` (`state` active/inactive/removed,
`stock_tracked`, `stock_on_hand`, `low_stock_threshold`, `sku`, `gtin`, `code`).
`POST /shop/v1/products/{id}/variants/{variantId}/state` already turns a size off and on immediately,
keeps one size on sale, records the change and announces `stock` to the shop.

**Decision**: `GET /shop/v1/availability` (shop service, products domain, shared gateway - 163/300,
55% after +1) lists sizes of live or unavailable products with stock, search (`q` over name, brand,
label, code, sku, gtin), a filter (`all` | `off_sale` | `out_of_stock`) and keyset paging. Each row
says whether it is the last size on sale (`lastOnSale`), so the console disables that switch with its
reason. Writes go through the existing state route - no second writer of a variant's state.

## R6 - Quality figures come from the hourly rollup

**Found**: Insights reads only the rollups (`shop/src/insights/rollup-only.guard.test.ts`). Buckets are
recomputed from source by the rollup job; a portion's status change already marks the current hour
dirty (`shop_ops_portion_upd`), and `fulfillment_event` is append-only.

**Decision**: one migration adds to `shop_sales_hour`:
`finished_orders`, `finished_units_ordered`, `finished_units_supplied`, `ready_orders`, `ready_seconds`.
A portion **finishes** in the hour of its **first** `ready_for_pickup` event or its `unfulfillable`
event (whichever came first; reopening picking does not count twice). Withdrawn portions never count.
Found rate = supplied ÷ ordered; can't-supply rate = can't-supply ÷ finished; average time to ready =
ready seconds ÷ ready orders (paid → first ready). The migration marks the last 60 days dirty so the
job fills history. The figures use the existing window and comparison.

## R7 - No new client state or polling

All four parts read through the shop's existing query keys (`shop/today`, `shop/fulfillment`,
`shop/stock`) and the live channel. Nothing refreshes on a timer (`check-no-refresh-timers.sh`).

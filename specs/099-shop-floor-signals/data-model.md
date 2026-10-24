# Data Model: Shop Floor Signals (099)

## Storage

One goose migration, `db/migrations/<ts>_shop_floor_signals.sql`:

```text
ALTER TABLE public.shop_sales_hour
  ADD finished_orders         integer NOT NULL DEFAULT 0 CHECK (>= 0),
  ADD finished_units_ordered  integer NOT NULL DEFAULT 0 CHECK (>= 0),
  ADD finished_units_supplied integer NOT NULL DEFAULT 0 CHECK (>= 0 AND <= finished_units_ordered),
  ADD ready_orders            integer NOT NULL DEFAULT 0 CHECK (>= 0),
  ADD ready_seconds           bigint  NOT NULL DEFAULT 0 CHECK (>= 0);
-- backfill: mark every (active shop, local hour) of the last 60 days dirty for the rollup job
-- down: drop the five columns
```

No other table changes. Collection runs, rounds, storage classes and variant stock already exist.

## Derived entities (computed on read)

### Collection run (for a shop)

| Field | Meaning |
|---|---|
| `runAt` | The run's instant (ISO). Shown in the shop's timezone. |
| `dayOffset` | 0 today, 1 tomorrow, … (local), so the screen can say "Tomorrow 9:00 am". |
| `driver` | `none` · `assigned` · `on_the_way` · `collected` (R2). |
| `opensAt` | When the round opens (null when `driver = none`); the screen words "on the way" from it. |
| `driverOnDuty` | The round's driver is on duty now. |
| `due` | This shop's Effy portions expected on this run: `{ ready, picking }` counts (picking includes awaiting pick). |

Rules: the shop's **next collection** is the earliest run ≥ now that has at least one of this shop's
open Effy portions and whose stop at this shop is not `done`; with none due, it is the next scheduled
run with `due = {0, 0}`; with no active runs it is `null` (the screen says none are set up).

### Order's collection

`{ kind: "effy_run", runAt, driver }` for an Effy-driver portion still at the shop (pending →
ready_for_pickup); `{ kind: "courier", … }` stays as today's `courierPickup`; absent once collected or
finished. A courier portion is never given an Effy run.

### Line storage class

`storageClass: "ambient" | "chilled" | "frozen"` on every shop order line and pick-list line, from
`order_item.storage_class`.

### Sellable size (Availability row)

| Field | From |
|---|---|
| `productId`, `productName`, `brand`, `productStatus` (`active` / `unavailable`) | `product` |
| `variantId`, `label` (null for a one-size product), `code`, `sku`, `gtin` | `product_variant` |
| `onSale` | `state = 'active'` |
| `stock` | `{ tracked, onHand, low, outOfStock }` — the existing `stockState` rule |
| `lastOnSale` | this is the product's only `active` variant |
| `imageUrl` | the product's primary picture (renditions as elsewhere) |

Only `product.status IN ('active', 'unavailable')` and `variant.state <> 'removed'`. Ordered by product
name, then variant position.

### Quality figures (Insights)

| Figure | Formula over the window's buckets | Empty |
|---|---|---|
| Found rate | Σ finished_units_supplied ÷ Σ finished_units_ordered | ordered = 0 → `null` |
| Can't-supply rate | Σ cant_supply ÷ Σ finished_orders | finished = 0 → `null` |
| Average time to ready | Σ ready_seconds ÷ Σ ready_orders | ready = 0 → `null` |

`cant_supply` is the existing column (unfulfillable events). Rates are sent as 1-dp percentage
strings; the average as whole seconds. The comparison uses the existing basis; a rate's change is
`abs` (percentage points), the time's change is `pct`.

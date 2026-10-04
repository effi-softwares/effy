# Research: Driver Item Manifest & Temperature Classes

Every finding was read from the code on `dev` at 2026-10-04.

## R1. Where the temperature class is snapshotted

**Decision**: a nullable `storage_class` column on `public.order_item`, written by
`UpsertPendingOrder` in `apis/core-api/internal/features/checkout/store.go` in the same INSERT that
writes `product_name`. Stored values are the catalogue's own vocabulary: `frozen`, `chilled`,
`ambient`. The driver-facing word "Normal" is a presentation mapping applied once, in the driver
service.

**Rationale**:
- FR-009 requires the class to be fixed at purchase. `order_item` already snapshots `product_name`
  and `unit_price_amount` for exactly that reason, and its table comment says so.
- The line read that feeds the insert (`store.go` ~L150–190) already joins `public.product` for
  `weight_grams`. The storage value is one more lookup in the same statement.
- Storing the catalogue vocabulary keeps one meaning per value across the platform: the fleet
  planner reads `value_text IN ('chilled','frozen')` from the same attribute
  (`apis/edge-api/fleet/src/planner/sql.ts:34`).
- `order_item` rows are deleted and reinserted at each payment intent until the order is paid, so
  the snapshot reflects the product at the moment of the final intent. That is "at purchase".

**The storage value is an attribute, not a column.** It lives in
`product_attribute_value.value_text` for the `attribute_definition` whose `key = 'storage'`. 063
recorded this as one of six names that typechecked and failed at runtime. A product with no such
row is written as `ambient` (FR-008).

**Alternatives considered**:
- *Read the product's current attribute at driver read time.* Rejected: violates FR-009; a shop
  edit would rewrite what a driver is told about goods already packed.
- *Snapshot on `fulfillment_item`.* Rejected: those rows are created lazily when picking begins, so
  the snapshot would be taken hours after purchase, and the table records pick progress, not what
  was sold.
- *Store `normal`.* Rejected: a second word for `ambient` in the database is two sources for one
  fact.

## R2. Live defect: every package at a stop carries every item at the stop

**Finding**: `collectionStop` in `apis/edge-api/driver/src/work/service.ts:199-213` calls
`packageItems(allPackageIds)` once and then assigns the **whole result** to each package:

```ts
packages: pkgs.map((p) => ({ ..., items: items.map((i) => ({ name: i.name, qty: Number(i.qty) })) }))
```

`PACKAGE_ITEMS` (`work/sql.ts:84`) returns no package key, so the rows cannot be split. The comment
calls it deliberate ("the manifest is per shop"), but the contract puts `items` on
`CollectionPackage`, and the app renders `pkg.items.sumOf { it.qty }` **per package**
(`CollectionScreens.kt:307`). At a shop stop with three packages of 2, 5 and 1 items, each package
reads "8 items".

**Decision**: `PACKAGE_ITEMS` returns `shop_fulfillment_id`; the service groups by it. This is a
correction to existing behaviour, made here because FR-013's per-package summary is false without
it.

**Reader audit** (the enum-widening lesson from 053/056/057/059):
- `packageItems` — one caller: `service.ts:199`.
- `ItemRow` — declared in `work/repository.ts`, used only there and in `service.ts`.
- `ManifestLine` (TS) — `driver.ts:183`; one generated Kotlin DTO; one mobile mapper,
  `HttpCollectionRepository.kt:121`; one domain type, `Collection.kt:25`; one renderer,
  `CollectionScreens.kt:307`.
- `DropPackageRef` — produced only by `deliveryDrop` (`delivery.ts:76`) and `historyDetail`
  (`delivery.ts:271`, always `[]`).

## R3. What "in the bag" means

**Decision**: per order line of a package, joined to its `fulfillment_item` row:

| `fulfillment_item` | Quantity shown | Included |
|---|---|---|
| no row | `order_item.quantity` | yes |
| `gathered_quantity > 0` | `gathered_quantity` | yes |
| `gathered_quantity = 0` | 0 | no — shown as not included |

**Rationale**: `fulfillment_item` is the shop's picking record (020), and 057 A3 made Fulfil mark
untouched lines unavailable first, so a package that reached `ready_for_pickup` through the console
has a row for every line. "No row" is kept as a defined case, not an error, because rows are
created lazily and a driver must never be shown an empty list for a real package.

The class summary counts **included units only** (FR-016): `Σ quantity shown` per class.

**Alternative considered**: showing `ordered − unavailable`. Rejected: under-accounting is legal
mid-pick (`gathered + unavailable ≤ ordered`), so that figure can exceed what was actually gathered.

## R4. Presenting a drop's packages without naming shops

**Finding**: `deliveryDrop` returns a single synthetic `packages` entry for the whole drop
(`ref` = the order number, `fromShopCount` = how many shops). A drop of two packages is one row.

**Decision**: one entry per `round_package`, ordered by `round_package.created_at`, labelled by
position ("Package 1 of 2") in the app. Each carries its own `items` and `summary`. The entry
carries no shop id, name or code. `fromShopCount` stays on the drop for backward compatibility.

**Rationale**: FR-003 requires items grouped by package so the driver can match list to bag. A
package is one shop's portion, so grouping by package is grouping by shop — the label must therefore
be positional and nothing else. A guard test asserts neither payload contains a shop identifier or
a money field (FR-020, FR-021, SC-007).

## R5. Orders placed before this feature

**Decision**: the column is nullable with **no backfill**. NULL is served as `not_recorded` and
rendered as "Class not recorded".

**Rationale**: backfilling from the product's current attribute would assert a class that was never
observed at purchase — the fabricated-baseline shape 033 refused for saved-item prices. Defaulting
NULL to Normal would label an in-flight frozen item as shelf-stable, which is the precise harm the
slice exists to prevent (FR-010, SC-008). In-flight orders at deploy are few and drain within days.

## R6. Readable with no connection (FR-024)

**Finding**: the driver app has an offline **write** queue (`core/offline/OfflineQueue.kt`) and no
read cache; `HttpCollectionRepository` and `HttpDeliveryRepository` fetch on every load.

**Decision**: each repository retains the last successful stop and drop reads for the current round
in memory and serves them when a fetch fails for connectivity, flagged as possibly stale. A failed
first load with nothing retained is an error state with retry, never an empty list (FR-025).

**Rationale**: the driver opens the stop on arrival, usually with signal, and re-reads it at the
counter or the door where signal drops. In-memory retention covers that. Persisting reads across
app restarts is a larger offline-first change and is not what the spec asks for.

## R7. Deploy order and old app builds

**Decision**: `make db-up` → `core-deploy` → `edge-deploy SERVICE=driver` → app release.

- The migration is additive and safe before any code.
- core-api must deploy before the class appears on new orders; until then new lines are NULL and
  read as `not_recorded`, which is honest.
- edge-driver names the new column, so it must not deploy before the migration.
- New contract fields are additive, and installed app builds ignore them: the driver app's HTTP
  client sets `ignoreUnknownKeys = true` (`core/http/EffyHttpClient.kt:19`, verified 2026-10-04). So
  edge-driver can deploy ahead of an app release.
- `CollectionPackage.items` changes meaning (stop-wide → that package's own). An old build then
  shows a correct per-package count instead of an inflated one — a fix, not a break.

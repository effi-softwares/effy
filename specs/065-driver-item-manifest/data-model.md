# Data Model: Driver Item Manifest & Temperature Classes

## Change: `public.order_item.storage_class`

One additive, forward-only migration `<ts>_order_item_storage_class.sql`.

| Column | Type | Null | Constraint |
|---|---|---|---|
| `storage_class` | `text` | yes | `CHECK (storage_class IS NULL OR storage_class IN ('frozen', 'chilled', 'ambient'))` |

- **Written by**: `UpsertPendingOrder` (hot path), in the INSERT that writes the line. Never
  updated afterwards. No other writer.
- **NULL means**: the line was sold before 065. It is data, not a gap, and is never backfilled
  (research R5).
- **Non-NULL for every line written from 065 on**: a product with no `storage` attribute is written
  as `ambient`.
- **Source at write time**: `product_attribute_value.value_text` where the attribute definition's
  `key = 'storage'`, for the line's product.
- **Down migration**: drops the column.
- **No index**: the column is only read through `order_item` rows already selected by order and
  shop.

Existing INSERTs that omit the column (test fixtures across `edge-api`) remain valid.

## Read model (no storage)

Derived per request by the driver service; nothing here is stored.

### Manifest line

| Field | Source | Rule |
|---|---|---|
| `name` | `order_item.product_name` | as sold |
| `orderedQty` | `order_item.quantity` | |
| `qty` | `fulfillment_item.gathered_quantity`, else `order_item.quantity` when no pick row | quantity in the bag (research R3) |
| `included` | `qty > 0` | false → shown as not included |
| `temperatureClass` | `order_item.storage_class` | `frozen`→`frozen`, `chilled`→`chilled`, `ambient`→`normal`, NULL→`not_recorded` |

Lines belong to a package through `order_item.order_id = shop_fulfillment.order_id AND
order_item.shop_id = shop_fulfillment.shop_id`, and to their pick row through
`fulfillment_item.order_item_id` + `shop_fulfillment_id`.

**Ordering within a package**: frozen, chilled, normal, not recorded; then included before not
included; then name.

### Class summary

`{ frozen, chilled, normal, notRecorded }`, each the sum of `qty` over **included** lines of that
class. Computed for a package, and for a drop as the sum over its packages.

### Package (pickup) and drop

- A pickup package is one `round_package` at a `shop_pickup` stop → its lines + its summary.
- A drop is one `customer_drop` stop → its `round_package` rows in `created_at` order, each with
  lines + summary, plus the drop-level summary.

## Invariants

1. A line's class never changes after the order is paid.
2. NULL is never presented as Normal.
3. A summary never counts a line that is not included.
4. No drop payload contains a shop identifier; no driver payload contains a money field.
5. A package's lines are that package's own, never the stop's.

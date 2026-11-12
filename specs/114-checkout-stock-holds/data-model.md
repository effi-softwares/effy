# Data Model: Hold Stock at Checkout (114)

One migration: `db/migrations/20261112120000_checkout_stock_holds.sql`. It only adds; its Down drops what it adds.

## New table `public.stock_hold`

Units of one counted size held for one unpaid order (research R1). A row **counts only while `held_until > now()`**.
Rows are deleted when the order ends or when its next payment start replaces them.

| Column | Type | Rule |
|---|---|---|
| `order_id` | uuid NOT NULL | FK `public."order"(id)` ON DELETE CASCADE |
| `variant_id` | uuid NOT NULL | FK `public.product_variant(id)` ON DELETE CASCADE |
| `customer_id` | uuid NOT NULL | FK `public.customer(id)`. Denormalised from the order, so the shopper's own holds can be left out without a join (R2) |
| `quantity` | integer NOT NULL | `CHECK (quantity > 0)` |
| `held_until` | timestamptz NOT NULL | `now() + stock_hold_min` when written |
| `created_at` | timestamptz NOT NULL DEFAULT now() | |

- `PRIMARY KEY (order_id, variant_id)`: one hold per size per order. A repeat payment start upserts.
- `CREATE INDEX stock_hold_variant_idx ON public.stock_hold (variant_id, held_until)`: the left-to-sell sum.
- `CREATE INDEX stock_hold_customer_idx ON public.stock_hold (customer_id)`.
- No state column (R1). Writes go only through `@effy/edge-shared/stock` `holds.ts` (guard R13).
- Bounded: only unpaid orders have rows, and 113 closes those after the abandon time (default 24 h).

## Changed table `public.housekeeping_settings`

| Column | Type | Rule |
|---|---|---|
| `stock_hold_min` | integer NOT NULL DEFAULT 15 | `CONSTRAINT housekeeping_settings_stock_hold_check CHECK (stock_hold_min BETWEEN 5 AND 60)` |

Changes are recorded in the existing `housekeeping_settings_change` with `field = 'stockHoldMinutes'` (R7).

## Derived (never stored)

- **Held**, for a size, is the sum of `stock_hold.quantity` where `variant_id` matches and `held_until > now()`.
  Optionally it leaves out one customer's rows. It is written only by `stockHeldSql` in `lib/availability.ts`.
- **Left to sell** is `GREATEST(0, stock_on_hand − held)` for a counted size, and unlimited for an uncounted one
  (`leftToSell`).
- **Purchasable** is the product active, the size active, and (uncounted, or left to sell > 0). It is the one rule,
  054 FR-012.

## Lifecycle of a hold

```
payment start ──holdStock──▶ live (held_until in the future)
   │                          │
   │ basket changed:          ├─ time passes ───────▶ lapsed (row stays, counts for nothing)
   │ next payment start       │
   │ replaces the row         ├─ payment succeeds ─▶ consumeStockHolds: row deleted, shelf reduced (R5)
   │                          ├─ order abandoned (113) or failed ─▶ releaseStockHolds: row deleted
   ▼                          └─ card declined ─▶ unchanged (retry within the time uses it)
refused (stock_changed): the order's rows deleted, nothing held
```

A lapsed row whose order then pays is a **late** payment (R5): `StockHoldLate`.

## Contract changes (shared-types)

| Type | Change |
|---|---|
| `CreateCheckoutIntentRequest` | **+ `shownLines: ShownLine[]`** (required). `ShownLine = { variantId: string; quantity: WireInt }` |
| `checkout.ts` constants | **+ `STOCK_CHANGED_CODE = "stock_changed"`, `STOCK_CHANGED_MESSAGE`** |
| `ProductStockDTO` (`inventory.ts`) | **+ `held: WireInt \| null`, `leftToSell: WireInt \| null`** (null exactly when untracked) |
| `StockFacts` (`shared/src/lib/stock-state.ts`) | **+ `held: number | null`**; `stockState()` fills `held` / `leftToSell` |
| `BackofficeProductDTO` sizes (`backoffice-products.ts`) | **+ `stockHeld: WireInt \| null`** beside `stockOnHand` |
| `HousekeepingDTO` | **+ `stockHoldMinutes: WireInt`** |
| `HousekeepingSettingsUpdate` | `abandonAfterMinutes?` and **`stockHoldMinutes?`**, at least one; `version` as before |
| `STOCK_HOLD_LIMITS` (`housekeeping.ts`) | **new** `{ min: 5, max: 60 }` |
| `live.ts` / `announce.ts` | `ops` scope may carry `stock` (the kind already exists) |

Kotlin: the customer app's checkout request DTO gains `shownLines`. Its words gain the sentence, pinned to
`checkout-words.fixtures.json`. The contract regeneration (`Dto.kt`, `CommerceDto.kt`) picks up the request change.

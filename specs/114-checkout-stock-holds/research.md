# Research: Hold Stock at Checkout (114)

All decisions below were made by reading the code on `dev` (2026-11-12). There were no open questions left in the
spec. Each entry is Decision / Rationale / Alternatives.

## R1 - What a hold is, and how it ends

**Decision**: a new table `public.stock_hold`, one row per (order, size), carrying the quantity, the customer and
`held_until`. A row **counts only while `held_until > now()`**. A row is **deleted** when its order ends (paid,
abandoned or failed) or when the order's next payment start replaces it. No state column, no clean-up job.

**Rationale**:
- The delivery-window hold (`delivery_slot_booking.held_until`, read as `state = 'held' AND held_until > now()`) and the
  points hold (`points_hold.held_until`) already work this way. Expiry needs no sweep, so FR-005 holds even if 113's
  clean-up never runs.
- Deleting on end keeps the table to the holds of unpaid orders only (bounded by 113's abandon time), so the
  availability read stays cheap without a purge. The sale itself is already recorded in `stock_movement`
  (`order_paid`); the way each hold ended is recorded as a metric (R11). The spec's Key Entities line was amended to
  say so.

**Alternatives**:
- A `state` column (`held` / `used` / `released`) kept for history. Rejected: it needs a purge, and nothing reads the
  history.
- Holds as negative `stock_movement` rows. Rejected: movements are the shelf's append-only history (054), and a hold
  is not a shelf change (FR-015).

## R2 - "Left to sell": one rule, in the existing availability module

**Decision**: `apis/edge-api/shared/src/lib/availability.ts` stays the only definition of "can this be bought". The
change:
- `variantSellable(v)` becomes `v.state = 'active' AND (NOT v.stock_tracked OR v.stock_on_hand > <held>)`, where
  `<held>` is the sum of other orders' live holds on `v`.
- One SQL builder, `stockHeldSql(v, exceptCustomerParam?)`, writes that sum. It is
  `COALESCE((SELECT sum(h.quantity) FROM public.stock_hold h WHERE h.variant_id = v.id AND h.held_until > now() [AND h.customer_id <> $n]), 0)`.
- `variantPurchasableSql` / `productAvailableSql` take an optional customer parameter. Listings (cached for every
  shopper, 60 s) pass none. Cart, checkout and saved items pass the signed-in customer, so a shopper's own holds never
  count against them (FR-003).
- `VARIANT_AVAILABILITY_COLUMNS` becomes `variantAvailabilityColumns(exceptCustomerParam?)` and adds `stock_held`.
  `purchasable()` and `outOfStock()` take `stockHeld`.
- A new `leftToSell(tracked, onHand, held)` gives the cart's cap and the "only N available" number.

**Rationale**:
- 054 FR-012 forbids two definitions, and `availability.guard.test.ts` already polices one shape of it.
- The rule stays a SQL fragment, not a database function, for the reason in the file's header: a function would hide
  the storefront's index.
- The held sum hits `stock_hold_variant_idx` and only ever sees the unpaid orders' rows (R1).

**Found while reading**: `commerce/src/saved/repository.ts:113-118` decides "temporarily unavailable" with its own
`stock_on_hand > 0`. That is a second definition today, and it would ignore holds. It moves onto the rule. The guard
gains a check that fails `stock_on_hand >` / `<=` comparisons in shopper code outside `availability.ts` (T-guard in
tasks).

**Alternatives**:
- A stored `stock_held` column on `product_variant`, kept by triggers or writers. Rejected: a stored count needs a
  writer at expiry, which is exactly the sweep R1 avoids.
- A view `variant_stock_left`. Rejected: joining a view into listings changes every storefront query's plan for one
  number. The correlated sum is cheaper on a table this small.

## R3 - Where and how the hold is taken

**Decision**: a new shared module `@effy/edge-shared/stock` (`apis/edge-api/shared/src/stock/holds.ts`), the only
writer of `stock_hold`:
- `holdStock(tx, { orderId, customerId, now })` runs in its own transaction. `createIntent` calls it **last**: after
  promotions, points, the delivery window, billing and delivery instructions, and immediately before the points-only
  branch or the provider calls (amended after `/speckit-analyze` G4). Every refusal that can happen earlier
  (promotions, slot, address, points) therefore runs before any stock is held. Anything that throws **after** the
  hold (the provider unreachable, `PaymentInProgressError` on the points-only path) is caught; the order's holds are
  released (`releaseStockHolds` in its own transaction) and the error rethrown. So a payment start that did not start
  holds nothing (spec edge case).
  1. Read `housekeeping_settings.stock_hold_min`.
  2. Lock the order's counted sizes: `SELECT … FROM product_variant WHERE id IN (order's items) AND stock_tracked ORDER BY id FOR UPDATE`.
     This is the same lock order `finalizeSucceeded` uses, so the two cannot deadlock.
  3. For each line, left = `stock_on_hand − live holds of OTHER customers` (`stockHeldSql(v, customer)`; the one
     scope, see "Whose holds are one's own" below).
  4. If any line's quantity > left: delete this order's holds and return `{ ok: false }`.
  5. Otherwise delete this order's holds for sizes no longer in it, and upsert one row per counted line with
     `held_until = now + stock_hold_min`.
- `releaseStockHolds(tx, orderId)` deletes the order's rows and returns what it removed (for metrics and live updates).
  It is called from `finalizeAbandoned` and `finalizeFailed` in `payments/finalize.ts`, the places that already release
  points, promotion uses and the window.
- `consumeStockHolds(tx, orderId)` is called from `finalizeSucceeded` (R5).

**Rationale**:
- Payment start is the last server moment before the charge. The client confirms payment with Stripe directly, which
  is why windows, points and promotion uses are held there too.
- Holding last means no earlier refusal leaves stock held. Points, promotion uses and the window held before a stock
  refusal are released or run out exactly as they do today when a later step refuses.
- The row lock on the size serialises two shoppers for the last unit (FR-004, SC-001), the way `lockSlot` does for
  the last window place.

**Whose holds are one's own (amended after `/speckit-analyze` I2)**: **the customer's**, in every place. That covers
the cart and checkout read (FR-003), `holdStock` step 3, and `finalizeSucceeded` (R5). All three call
`stockHeldSql(v, customerParam)` from `availability.ts`, and nothing re-writes the sum.
- Why the customer and not the order: `mayReusePendingOrder` can open a second unpaid order for the same shopper (the
  provider unreachable, or an intent cancelled). Scoping by order would show that shopper the full quantity in the cart
  and then refuse them at Pay until the stale order's hold ran out.
- Accepted consequence: while a stale order still holds units, the same shopper can hold them again on the new order.
  Only they are affected, the stale order is closed by 113, and if it ever paid late, R5 takes from the shelf only what
  other customers do not hold.

**Alternatives**:
- `SELECT … FOR UPDATE` on `stock_hold` rows. Rejected: there may be no row to lock yet. The size row always exists.
- Holding at "add to cart". Out of scope (spec).

## R4 - What the shopper was shown (FR-007)

**Decision**: the intent request gains a required `shownLines: { variantId, quantity }[]`, the payable lines the
checkout displayed (the cart's capped quantities).
- `createIntent` compares them with the server's payable lines (`cartLines`, now capped by the left-to-sell rule
  excluding the customer's own holds) **before anything is written**.
- A difference in any size or quantity is **409 `stock_changed`** (`STOCK_CHANGED_CODE`). Its **only write** is to
  release this order's existing stock holds (an earlier attempt's, e.g. after a declined card), so nothing stays held
  for a payment that did not start (amended after `/speckit-analyze` I1).
- The same 409 is returned when `holdStock` refuses under the lock (R3 step 4).
- The client goes back to review, shows the one sentence, and re-reads the cart. The cart already flags each changed
  line and says how many are available (054 FR-017). The shopper presses Pay again.

**Rationale**:
- It is the platform's existing pattern for "what you were shown changed" (`delivery_fee_changed`,
  `promotions_changed`): refused, nothing charged, shown again.
- Comparing lines rather than an amount says *what* changed, and does not mix stock with price.
- Required, not optional: there are no installed builds (cleanup 2026-10-23), and an optional field would let a
  client skip the check.

**Changes today's behaviour**: `cartLines` used to cap silently and charge for what was left (`StockBlocked` metric).
After 114 a capped line that differs from the screen is refused instead. A capped line the screen already showed as
capped is not a difference, and pays as shown.

**Alternatives**:
- An `expectedItemSubtotal` amount. Rejected: a price change would read as a stock change, and the client could not
  say which line moved.

## R5 - Recording the payment with holds

**Decision**: `finalizeSucceeded` keeps its lock-then-flag-then-deduct shape, with one change. For each counted line it
reads `left = stock_on_hand − live holds of OTHER customers` (`stockHeldSql(v, the order's customer)`; the one scope,
R3).
- The short quantity becomes `max(0, qty − left)`, replacing `qty − stock_on_hand`.
- The shelf is reduced by `qty − short`, replacing `GREATEST(0, on_hand − qty)`.

Then `consumeStockHolds` deletes the order's holds. If the order had a counted line but no live hold at payment (the
hold ran out), the payment is **late**:
- `StockHoldLate{outcome: complete}` when nothing was short;
- `StockHoldLate{outcome: short}` when something was short, which goes through today's short-order path (pick line
  pre-flagged; 055 proposes the refund).

**Rationale**:
- A late payer must not take units another shopper holds within their time. Otherwise that shopper's in-time order
  would be the short one, breaking SC-002.
- With no other holds, the new figures equal the old ones, so 054's SC-003 proof (the count never below 0) still
  applies.

**Alternatives**:
- Honour the late payer from the physical shelf. Rejected for SC-002 (above).
- Authorise the card and charge it later (manual capture). Out of scope (spec).

## R6 - Ending holds without a writer at every edge

**Decision**:
- **A declined card** (FR-012): no change. Since 113 a decline leaves the order `pending_payment`, so its holds stand
  until they run out.
- **Counting turned off** (FR-013): the rule asks `NOT v.stock_tracked` first, so holds on an uncounted size stop
  counting at once. No write is needed, and the rows go when the order ends.
- **A shop lowers its count below what is held**: nothing is written. Left to sell reads 0, never negative
  (`GREATEST(0, …)` in `leftToSell`), and R5 handles a held order paying for units no longer there.
- **The basket changes**: the next `holdStock` replaces the rows (R3 step 5).

**Rationale**: every one of these is answered by the read rule, so no second writer of `stock_hold` appears in the
inventory or catalog services.

## R7 - The hold time setting

**Decision**: a new column `housekeeping_settings.stock_hold_min integer NOT NULL DEFAULT 15`, `CHECK BETWEEN 5 AND 60`,
edited on back-office **Settings › Clean-ups** beside the abandon time.
- The existing `PUT /orders/v1/housekeeping/settings` accepts `stockHoldMinutes`, `abandonAfterMinutes`, or both. At
  least one is required.
- Same version check, admins only (`HousekeepingForbidden`).
- One `housekeeping_settings_change` row per changed field (`field = 'stockHoldMinutes'`).
- The `bo-housekeeping` activity source gains the field's words.
- `GET /orders/v1/housekeeping` returns `stockHoldMinutes`.

**Rationale**:
- **Zero new routes**: the staff gateway is at 234/300, past the 75% warning.
- The page already has the right role rule, the version check and the activity drawer, and the abandon time is the
  setting the hold time sits under ("how long an unfinished checkout keeps things").
- `ABANDON_LIMITS.min` (60) ≥ the hold maximum (60), so a hold never outlives its order.

**Alternatives**:
- A column on `delivery_settings` or `points_settings`. Rejected: neither is about stock, and their pages are owned by
  other features.
- A new inventory setting route on `inventory-staff`. Rejected: two new routes and a new activity source for one
  number.

Clean-ups' guided tour HK gains one step for the field, and its `version` rises (106 rule). Its words go into
`specs/107-backoffice-guided-tours/spec.md`'s HK inventory first, as 113 did.

## R8 - What shops and staff see (FR-016-018)

**Decision**: every operator stock read gains `held`, from the same `stockHeldSql` with no customer exclusion.
- `ProductStockDTO` (`@effy/shared-types/inventory.ts`) gains `held: WireInt | null` and `leftToSell: WireInt | null`
  (null exactly when untracked).
- `stockState()` (`shared/src/lib/stock-state.ts`, the one mapping to `ProductStockDTO`) takes `held` and fills
  `held` / `leftToSell`. Its three callers select `stockHeldSql("v")`: `inventory/src/stock/service.ts` (through its
  repository), `shop/src/products/handler-support.ts` (the shop product page) and
  `shop/src/availability/repository.ts` (Availability). This is how shop-web's screens get the numbers (amended after
  `/speckit-analyze` G1).
- back-office's product page reads `BackofficeProductDTO` sizes (`backoffice-products.ts` `stockOnHand`), filled by
  `catalog/src/products/repository.ts` and `service.ts`. They gain `stockHeld` there (G3).
  `shared/src/catalog/read.ts` is not changed.
- `outOfStock` / `low` stay on the shelf count (FR-018).

Screens:
- **shop-web** Product › Sizes (`VariantsSection`) and Availability (`AvailabilityScreen`): "In stock" stays; add
  "In checkouts" and "Left to sell".
- **back-office** Product › Sizes (`ProductScreen`): the same two columns. Shop › Stock (`ShopStockPanel`) is a
  **low-stock list** (`LowStockRowDTO`, `lib/low-stock.ts`), judged on the shelf by FR-018, so it is **not changed**
  (amended after `/speckit-analyze` G2).
- Shops see only numbers (FR-017). No route returns who holds.

**Rationale**: three numbers per size is the smallest view that explains "the shelf says 5, the shop says out of stock".

## R9 - Live updates (FR-016, 071)

**Decision**:
- After `createIntent` commits a changed hold, after a refusal that released holds, and after `abandonOrder`
  released holds: announce `{ scope: "shop", shopId, kind: "stock" }` for each shop whose counted sizes changed, plus
  `{ scope: "ops", kind: "stock" }`.
- `finalize`'s existing shop `stock` announcement also sends `ops` `stock`.
- The `ops` scope's kind union gains `"stock"` (the kind is already in `LIVE_KINDS`).
- back-office `features/live/routes.ts` maps `stock` to its product and shop-stock query keys.
- shop-web maps `stock` to Today and its stock key, which covers Availability (`["shop","stock","availability"]`). It
  gains the product key (`["shop","catalog","product"]`) so Product › Sizes refreshes too (G5).

**Rationale**: `change-map.guard.test.ts` requires a route that changes stock to announce. The update carries the kind
only, so nothing about a shopper reaches a shop.

## R10 - Wording (FR-009)

**Decision**: one new sentence, `STOCK_CHANGED_MESSAGE`, in `packages/shared-types/src/checkout.ts`, beside
`STOCK_CHANGED_CODE`:

> "Some items in your cart changed while you were paying. Check your order, then pay again."

- The customer app's twin lives in its checkout words and is pinned by a new `checkout-words.fixtures.json`, the same
  way `age-words.fixtures.json` pins `AgeWords`.
- Everything else the shopper reads (out of stock, "only N available") is 054's existing wording.

## R11 - Metrics and the alarm (FR-021)

**Decision**: all three metrics go to the **fixed money namespace `MONEY_METRIC_NAMESPACE` (`Effy/Commerce`)**, whichever
service ends the hold (commerce's checkout and webhook, orders' and customer's abandon paths), so one alarm sees them
all (amended after `/speckit-analyze` G7):

| Metric | Dimension values | Emitted |
|---|---|---|
| `StockHolds` | `outcome`: `held` / `refused_shown` / `refused_locked` | per payment start with a counted line |
| `StockHoldsEnded` | `reason`: `paid` / `abandoned` / `failed` / `replaced`, and `lapsed`: `yes` / `no` | per order whose holds end |
| `StockHoldLate` | `outcome`: `complete` / `short` | per paid order whose hold had run out |

One Terraform alarm, `StockHoldLateShort`: `StockHoldLate{outcome=short}` ≥ 3 in 24 hours goes to the alerts topic.
It sits in a new `infra/envs/dev/stock-holds.tf`, on the pattern of 113's `UnplacedPaymentRefunded` alarm.
SC-006 is read from `StockHoldLate` against `OrdersPlaced`.

## R12 - Proving it (SC-001 to SC-005)

A container test (`shared/src/stock/holds.container.test.ts`) covers:
- SC-001: 20 concurrent `holdStock` calls for 5 units: exactly 5 held, the rest refused, the count never below 0;
- own holds excluded;
- expiry with no sweep;
- replace on basket change;
- the release paths;
- R5's late-payment arithmetic.

Commerce's checkout container test gains:
- `stock_changed` before writing (shown lines) and under the lock;
- a decline keeping holds;
- 113's abandon releasing them.

The inventory and catalog reads get `held` assertions. The guard tests come in R2 and R13.

## R13 - Guards

- **`shared/src/stock/holds.guard.test.ts`** (new):
  - `INSERT INTO`, `UPDATE` or `DELETE FROM public.stock_hold` only in `stock/holds.ts`;
  - the table name read only in `stock/holds.ts` and `lib/availability.ts`. It is matched as a whole word
    (`\bstock_hold\b`, so `stock_hold_min` is not a hit), with `*.test.ts` and `db/migrations` exempt (U1);
  - proven by breaking it.
- **`availability.guard.test.ts`** gains the stock-comparison check from R2.
- **`change-map.guard.test.ts`** must stay green with the new announcements (R9).
- **Gateway capacity is unchanged**: no new routes.

## R14 - Database role

Commerce connects as `effy_shopper`, which holds the default grants on new `public` tables. It needs `stock_hold`
SELECT/INSERT/UPDATE/DELETE (it holds, and the webhook finalises), so nothing is revoked. It keeps its SELECT on
`housekeeping_settings` and the 113 revokes stand.

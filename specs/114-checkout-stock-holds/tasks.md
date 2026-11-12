# Tasks: Hold Stock at Checkout (114)

**Input**: `specs/114-checkout-stock-holds/`: spec, plan, research R1–R14, data-model,
`contracts/checkout-intent.md`, `contracts/stock-and-settings.md`, quickstart.

**Tests**: included where the spec's guarantees are mechanical:
- one shopper gets the last units (SC-001, FR-004);
- a hold ends by time with no sweep (FR-005);
- the shopper's own holds are left out (FR-003);
- charged only for what was shown (SC-003, FR-007);
- holds released on every end (FR-010–FR-012);
- a late payment takes nothing held for others (SC-002, R5);
- one rule and one writer (FR-002, R13).

Container tests run on the local Postgres recipe (memory: container-tests-local-postgres). The migration is checked with
real goose up / down-to / up.

**Rules carried from the plan**:
- `stock_hold` written only in `shared/src/stock/holds.ts`;
- "can this be bought" only in `shared/src/lib/availability.ts`;
- money and order status only in `@effy/edge-shared/payments`;
- no new routes (staff gateway 234/300);
- no timers (live kind `stock`);
- one new customer sentence, mirrored in Kotlin;
- no countdown shown to shoppers;
- shops see numbers only;
- tours, skeletons, `DataTable` and shadcn in the consoles; no dialogs in the customer app;
- never edit a committed migration;
- no real-world identifiers.

## Phase 1: Setup

- [X] T001 Write `db/migrations/20261112120000_checkout_stock_holds.sql` per data-model.md:
  - table `public.stock_hold`: `order_id`, `variant_id`, `customer_id`, `quantity > 0`, `held_until`, `created_at`;
    PK `(order_id, variant_id)`; FKs (order and variant `ON DELETE CASCADE`); indexes `stock_hold_variant_idx
    (variant_id, held_until)` and `stock_hold_customer_idx (customer_id)`;
  - `housekeeping_settings.stock_hold_min integer NOT NULL DEFAULT 15` with
    `housekeeping_settings_stock_hold_check CHECK (stock_hold_min BETWEEN 5 AND 60)`;
  - no revokes from `effy_shopper` (R14: commerce writes holds);
  - a full Down (drop the column and its CHECK, drop the table).
- [X] T002 [P] Shared types in `packages/shared-types/src/`:
  - `checkout.ts`: `ShownLine { variantId; quantity: WireInt }`, required `shownLines: ShownLine[]` on
    `CreateCheckoutIntentRequest`, `STOCK_CHANGED_CODE = "stock_changed"`, and `STOCK_CHANGED_MESSAGE` = "Some items in
    your cart changed while you were paying. Check your order, then pay again.";
  - `inventory.ts`: `ProductStockDTO` + `held: WireInt | null`, `leftToSell: WireInt | null` (doc comments: null exactly
    when untracked; `outOfStock` / `low` stay on `onHand`);
  - `housekeeping.ts`: `STOCK_HOLD_LIMITS = { min: 5, max: 60 }`, `HousekeepingDTO.stockHoldMinutes`, and
    `HousekeepingSettingsUpdate` with optional `abandonAfterMinutes` / `stockHoldMinutes` (at least one) plus `version`;
  - new `checkout-words.fixtures.json` (`{ "stockChanged": "<the sentence>" }`), with a test in `checkout.test.ts` that
    the constant equals the fixture.
- [X] T003 Regenerate the contracts (the package's contract generation script: `Dto.kt`, `CommerceDto.kt`, schema
  files). Run `pnpm --filter @effy/shared-types test` and typecheck the dependants.

## Phase 2: Foundational (blocks every story)

- [X] T004 Rewrite the rule in `apis/edge-api/shared/src/lib/availability.ts` (R2):
  - `stockHeldSql(v, exceptCustomerParam?: string)`: the correlated `COALESCE(sum)` over `public.stock_hold` with
    `held_until > now()`, plus optional `AND h.customer_id <> <param>`. This is the **only** writer of that sum. "Own"
    always means **the customer's** holds (research R3, "Whose holds are one's own"), in the cart and checkout read,
    `holdStock` and finalize alike;
  - `variantSellable(v, except?)`: `NOT v.stock_tracked OR v.stock_on_hand > <held>`;
  - `variantPurchasableSql(p, v, except?)` / `productAvailableSql(p, except?)`;
  - `variantAvailabilityColumns(except?)`, which adds `<held> AS stock_held` (it replaces `VARIANT_AVAILABILITY_COLUMNS`;
    update every importer);
  - `purchasable(status, state, tracked, onHand, held)`, `outOfStock(…, held)`, and the new
    `leftToSell(tracked, onHand, held): number | null` (`max(0, onHand − held)`; null when untracked).

  Keep the header's "not a database function" rationale.
- [X] T005 [P] Extend `apis/edge-api/shared/src/lib/availability.test.ts`'s truth table with held: 0 held,
  partly held, fully held, more held than the shelf (left 0, never negative), untracked ignoring holds.
- [X] T006 [P] Extend `apis/edge-api/shared/src/lib/availability.guard.test.ts`: fail a hand-written `stock_on_hand >`,
  `stock_on_hand <=` or `stock_on_hand < ` comparison in shopper code (`storefront`, `commerce`) outside
  `availability.ts`. Operator reads are exempt via the existing `availability-exempt:` comment convention. Prove it by
  breaking it.
- [X] T007 Create `apis/edge-api/shared/src/stock/holds.ts` (R3), the one writer:
  - `holdStock(tx, { orderId, customerId, now })` → `{ ok: true, heldShopIds } | { ok: false, releasedShopIds }`:
    1. read `stock_hold_min`;
    2. lock the order's counted sizes `ORDER BY v.id FOR UPDATE OF v`;
    3. per order line, left = `stock_on_hand − stockHeldSql(v, customer)` (other customers' live holds; imported
       from `availability.ts`, never re-written);
    4. on any shortfall, delete this order's holds and return not ok;
    5. else delete rows for sizes no longer in the order and upsert `(order, variant, customer, qty,
       now + stock_hold_min)`;
  - `releaseStockHolds(tx, orderId)` → `{ shopIds, lapsed: boolean }`;
  - `consumeStockHolds(tx, orderId)` → `{ hadCountedLines, late: boolean, shopIds }` (late = a counted line with no
    live hold).

  Write a header comment naming the slot-hold precedent and the lock order shared with finalize.
- [X] T008 [P] Create `apis/edge-api/shared/src/stock/index.ts`. Export it from `apis/edge-api/shared/src/index.ts`
  (and the package `exports` map if subpaths are listed, as `promotions` / `points` are).
- [X] T009 [P] Create `apis/edge-api/shared/src/stock/holds.guard.test.ts` (R13):
  - `INSERT INTO` / `UPDATE` / `DELETE FROM public.stock_hold` only in `stock/holds.ts`;
  - the table name read only in `stock/holds.ts` and `lib/availability.ts`. Match it as a whole word
    (`\bstock_hold\b`, so `stock_hold_min` in the orders housekeeping service is not a hit), and exempt `*.test.ts`
    and `db/migrations`;
  - prove it by breaking it.
- [X] T010 In `apis/edge-api/shared/src/live/announce.ts`, allow `stock` on the `ops` scope (type union). Update
  `live.contract` tests if they enumerate scope kinds.
- [X] T011 Move every caller onto the new rule's signatures (T004):
  - `apis/edge-api/storefront/src/catalog/repository.ts`, `home/repository.ts` and `lib/cards.ts` pass no customer
    (listings are shared);
  - `apis/edge-api/commerce/src/cart/service.ts` and `cart/repository.ts` pass the customer: the cap at
    `cart/service.ts:80` and the add/change refusal at `:275` (`InsufficientStockError`) use `leftToSell`, so "only N
    available" counts other shoppers' holds;
  - `apis/edge-api/commerce/src/saved/repository.ts:113-118` replaces its own `stock_on_hand > 0` with the rule (the
    second definition found in R2).

  Typecheck storefront and commerce; run their unit suites.

**Checkpoint**: the rule and the writer exist, and nothing holds yet. Shopper behaviour is unchanged while
`stock_hold` is empty.

## Phase 3: User Story 1 - The last units go to one shopper (P1) 🎯 MVP

**Goal**: pressing Pay holds the counted sizes, and two shoppers can never both get the last unit.

**Independent test**: a counted product at 1. A's payment start holds it, and B's cart, checkout and payment start see
it as unavailable. A pays, the count is 0, and A's order is not short.

- [X] T012 [US1] `apis/edge-api/commerce/src/checkout/store.ts`:
  - `cartLines(customerId)` caps `quantity` at `leftToSell` excluding the customer's own holds (replace the
    `LEAST(ci.quantity, CASE … stock_on_hand …)` with the rule's held sum; keep the comment's rationale);
  - add `holdStock(orderId, customerId, now)`, which runs `@effy/edge-shared/stock` `holdStock` in its own
    transaction (`transact`).
- [X] T013 [US1] `apis/edge-api/commerce/src/checkout/service.ts` `createIntent` (research R3, amended G4):
  - **create** `StockChangedError` in the checkout errors module (T018 maps it to 409, T019 also throws it);
  - call `store.holdStock` **last**: after `recordPromotions`, `holdPoints`, `captureDelivery`, billing and delivery
    instructions, and immediately before the points-only branch and the provider calls;
  - when not ok, throw `StockChangedError` and emit `StockHolds{outcome: refused_locked}`;
  - when ok with counted lines, emit `StockHolds{outcome: held}`;
  - wrap everything after the hold in `try/catch`: on **any** error (the provider unreachable,
    `PaymentInProgressError`, anything else), call `store.releaseStockHolds(orderId)` (its own transaction), then
    rethrow;
  - keep the points-only path working (its `settlePaid` consumes the holds via finalize, T015). Add
    `releaseStockHolds(orderId)` to the store beside `holdStock`.
- [X] T014 [US1] `apis/edge-api/commerce/src/functions/checkout-intent-v1-post.ts`: after the service returns, or after
  a stock refusal that released holds, announce `{scope:"shop", shopId, kind:"stock"}` for each affected shop and
  `{scope:"ops", kind:"stock"}` (after commit; never throws). Keep `change-map.guard.test.ts` green.
- [X] T015 [US1] `apis/edge-api/shared/src/payments/finalize.ts` `finalizeSucceeded` (R5):
  - the shortfall `INSERT … fulfillment_item` uses left = `stock_on_hand − stockHeldSql(v, the order's customer)`
    (other customers' live holds; the one scope, R3);
  - the shelf `UPDATE` reduces by `qty − short`, keeping `GREATEST(0, …)`;
  - then call `consumeStockHolds`. Add `stockHoldLate: boolean` and `stockHoldShort: boolean` to `FinalizeOutcome`;
  - `meterFinalize` emits `StockHoldLate{outcome: complete|short}` and `StockHoldsEnded{reason: paid, lapsed}` to
    the fixed `MONEY_METRIC_NAMESPACE` (`Effy/Commerce`), not the caller's namespace (research R11, G7);
  - the existing shop `stock` change also sends `ops` `stock`.
- [X] T016 [P] [US1] Create `apis/edge-api/shared/src/stock/holds.container.test.ts`, covering:
  - SC-001: 20 concurrent `holdStock` for 20 orders of 1 unit each against 5 on the shelf → exactly 5 ok, 15 refused,
    shelf unchanged, `sum(held) = 5`;
  - two orders racing for the last unit → one ok;
  - the shopper's own hold not counted against their second read (`variantPurchasableSql` with the customer);
  - an untracked size → no row;
  - finalize after a live hold → shelf reduced, rows gone, not late, not short.
- [X] T017 [US1] Extend the commerce checkout container test (`apis/edge-api/commerce/src/checkout/checkout.container.test.ts`):
  - A's intent holds; B's intent for the same last unit is refused (409 `stock_changed`) with no PaymentIntent created
    on the fake gateway;
  - A's webhook success → A not short, shelf 0.

**Checkpoint**: US1 works end to end through the API.

## Phase 4: User Story 2 - Charged only for what was shown (P1)

**Goal**: any difference between the lines shown and what can be held refuses payment start, with nothing charged; the
shopper sees one sentence and the new quantities.

**Independent test**: checkout shows 4. Another checkout takes 2. Pay is refused with the sentence; the line shows 2;
paying again charges for 2.

- [X] T018 [US2] `apis/edge-api/commerce/src/functions/checkout-intent-v1-post.ts`: parse required `shownLines` per
  contracts/checkout-intent.md (array; UUID `variantId`; whole `quantity` ≥ 1; no duplicates → 422
  `validation_failed`). Map `StockChangedError` to 409 `{ code: STOCK_CHANGED_CODE }`.
- [X] T019 [US2] `apis/edge-api/commerce/src/checkout/service.ts`: compare `shownLines` as a set with `cartLines`'
  payable lines **before** promotions, quote or any other write. On a difference, the **only write** is
  `store.releaseStockHolds(orderId)` for the customer's pending order, if one exists (an earlier attempt's holds, e.g.
  after a declined card; research R4, I1). Then throw `StockChangedError` with `StockHolds{outcome: refused_shown}`. This replaces the old silent `StockBlocked` path (drop that metric, or keep it
  only for the refusal; say which in a comment). Order it before `PromotionsChangedRefusal` and
  `DeliveryFeeChangedError`.
- [X] T020 [US2] Extend the checkout container test:
  - shown lines differ → 409; no order upsert change and no intent; an earlier attempt's stock holds for the order
    are deleted (and nothing else is touched);
  - shown lines equal but another checkout takes the units between read and lock (simulate by holding from a second
    customer first) → 409 with the order's holds deleted;
  - **every refusal or error after the hold leaves no stock held** (G4): the fake gateway throwing on
    `createPaymentIntent` / `ensureCustomer`, and the points-only path's `PaymentInProgressError`;
  - **no stock is held after the earlier refusals**: `promotions_changed`, `slot_unavailable`, an unknown billing
    address;
  - shown lines equal and holdable → ok;
  - a capped line shown as capped → ok.
- [X] T021 [P] [US2] customer-web `apps/customer-web/app/checkout/CheckoutFlow.tsx`:
  - send `shownLines` from the lines the review step displays;
  - on 409 `STOCK_CHANGED_CODE`: `capture({ name: "checkout_stock_changed" })` (add the event to
    `apps/customer-web/lib/telemetry.ts`), `setIntent(null)`, back to review, `setError(STOCK_CHANGED_MESSAGE)`,
    re-read the cart and quote (the same as `promotions_changed`).

  Add a vitest for the refusal path beside the existing checkout tests.
- [X] T022 [P] [US2] Customer app data and domain, in
  `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/features/checkout/`:
  - the intent request DTO gains `shownLines`. Use the regenerated `CommerceDto.kt` from T003; if the app's request
    is a hand-written DTO, add the field there and check it against the generated one;
  - `data/HttpCheckoutRepository.kt` decodes 409 `stock_changed` (`stockChangedOrNull`, beside `promotionsChangedOrNull`)
    into a domain `StockChanged` refusal;
  - the repository call site sends the displayed lines.
- [X] T023 [US2] Customer app presentation: the checkout ViewModel handles `StockChanged`. It drops the intent, returns
  to review, shows the sentence through the existing review error (no dialog; the `EffySheet` rules), and re-reads cart
  and quote. Add the sentence to the app's checkout words. Add `AnalyticsEvent` `CheckoutStockChanged`.
- [X] T024 [P] [US2] Customer app tests in `commonTest`:
  - a words test that reads `packages/shared-types/src/checkout-words.fixtures.json` (as the age-words test does);
  - a ViewModel test for `StockChanged` (back to review, message shown, re-read requested);
  - a repository decode test.

**Checkpoint**: both clients send what they showed and handle the refusal.

## Phase 5: User Story 3 - Held stock goes back (P2)

**Goal**: holds end by time with no clean-up, and at once on abandon, fail or basket change. A decline keeps them.

**Independent test**: hold and walk away: after the hold time another shopper can buy it, with no job run. Close the
order early: the hold is gone at once.

- [X] T025 [US3] `apis/edge-api/shared/src/payments/finalize.ts`:
  - `finalizeAbandoned` and `finalizeFailed` call `releaseStockHolds`;
  - `AbandonOutcome` gains `stockShopIds` so callers can announce;
  - emit `StockHoldsEnded{reason: abandoned|failed, lapsed}` to `MONEY_METRIC_NAMESPACE` (G7). Return it for the caller
    to emit after commit, matching how the file meters today. This covers FR-011 and FR-012a.
- [X] T026 [US3] `apis/edge-api/commerce/src/housekeeping/job.ts` (113's unpaid-orders clean-up) and the closure path
  that calls `abandonOrder` (`apis/edge-api/customer/src/closure/service.ts`): after commit, announce shop and `ops`
  `stock` for released holds.
- [X] T027 [US3] In `holdStock` (T007), when replacing an order's rows, emit `StockHoldsEnded{reason: replaced, lapsed}`
  for rows whose time had passed (return the count; the caller emits).
- [X] T028 [P] [US3] Extend `apis/edge-api/shared/src/stock/holds.container.test.ts`:
  - expiry: with `held_until` set in the past, another shopper's rule reads the unit as sellable while the row still
    exists (FR-005, no sweep);
  - basket change: a second `holdStock` after removing a line deletes that row and refreshes `held_until`;
  - `finalizeAbandoned` and `finalizeFailed` delete the rows;
  - a declined payment (113's webhook path) leaves the rows;
  - late payment complete: lapsed hold, stock still there → `late`, not short;
  - late payment short: lapsed hold, another order holding the rest → short by the held amount, shelf reduced only by
    what was sold, and the other order's hold intact (SC-002);
  - a shop lowering the count below held → left to sell 0;
  - counting turned off: holds stop counting at once (the rule ignores them), and the size sells as uncounted
    (FR-013);
  - the hold time changed after a hold was made: the existing row keeps its `held_until`, and the next `holdStock` uses
    the new time (US5 scenario 1);
  - the customer scope: a second pending order of the same customer does not block that customer's own read (R3).

**Checkpoint**: nothing stays held past its time or its order.

## Phase 6: User Story 4 - Shops and staff see what is held (P2)

**Goal**: In stock / In checkouts / Left to sell per size in both consoles, updated live. The shop's count is never
changed by a hold.

**Independent test**: hold 2 of 5. Shop and back-office show 5 / 2 / 3, and the shop's count is still 5.

- [X] T029 [US4] `ProductStockDTO` has one builder, `stockState()` (research R8, G1):
  - `apis/edge-api/shared/src/lib/stock-state.ts`: `StockFacts` gains `held: number | null`, and `stockState()` fills
    `held` and `leftToSell` (null when untracked; `outOfStock` / `low` unchanged). Extend its unit test;
  - its three callers select `stockHeldSql("v")` (no customer exclusion) and pass it through:
    `apis/edge-api/inventory/src/stock/repository.ts` (used by `stock/service.ts`; shop and `inventory-staff` stacks),
    `apis/edge-api/shop/src/products/handler-support.ts` (and the query it maps; the shop product page) and
    `apis/edge-api/shop/src/availability/repository.ts` (Availability);
  - keep every sort whitelist unchanged.
- [X] T030 [P] [US4] back-office product sizes (G3): `packages/shared-types/src/backoffice-products.ts` adds
  `stockHeld: WireInt | null` beside `stockOnHand`; `apis/edge-api/catalog/src/products/repository.ts` (the size
  read at ~198) selects `stockHeldSql("v")` (or the variant table alias it uses); `catalog/src/products/service.ts`
  (~103) maps it. `shared/src/catalog/read.ts` is not changed.
- [X] T031 [P] [US4] shop-web `apps/shop-web/src/features/catalog/VariantsSection.tsx`: per counted size show In stock
  (`onHand`), In checkouts and Left to sell. Uncounted sizes keep "Not counted". Update its test if one asserts the
  columns.
- [X] T032 [P] [US4] shop-web `apps/shop-web/src/features/catalog/AvailabilityScreen.tsx`: add the In checkouts and Left
  to sell columns (`DataTable` column meta: numeric, phone placement), and the skeleton's matching columns.
- [X] T033 [P] [US4] back-office `apps/back-office/src/features/products/ProductScreen.tsx`: the sizes section shows
  In checkouts and Left to sell from `stockHeld`. `out` / `low` stay on `onHand`.
- [X] T034 [P] [US4] shop-web `apps/shop-web/src/features/live/routes.ts`: the `stock` kind also refreshes the product
  page key (`["shop","catalog","product"]`), so Product › Sizes updates live (G5). Update its routes test.
  (back-office `ShopStockPanel` is a low-stock list on the shelf count, FR-018, and is **not changed**; G2.)
- [X] T035 [P] [US4] back-office `apps/back-office/src/features/live/routes.ts`: map `stock` to the product query key
  (`PRODUCTS`) and the shop low-stock key. Update `routes.test.ts`.
- [X] T036 [US4] Tests:
  - extend the inventory stock repository's container or unit test to assert `held` and `leftToSell` with a live hold,
    a lapsed hold and an untracked size, and confirm the shop count is unchanged;
  - assert the shop service's product page and Availability responses carry `held`;
  - assert the catalog service's back-office product sizes carry `stockHeld`.

**Checkpoint**: operators can explain any "out of stock" a shopper sees.

## Phase 7: User Story 5 - Staff set how long a hold lasts (P3)

**Goal**: admins set 5–60 minutes on Settings › Clean-ups. Managers and CSAs read only. Every change is in the activity
drawer.

**Independent test**: as an admin, set it to 5; the next payment start holds for 5 minutes; the drawer shows who
changed it.

- [X] T037 [US5] `apis/edge-api/orders/src/housekeeping/service.ts`:
  - `readHousekeeping` returns `stockHoldMinutes`;
  - `parseHousekeepingSettings` accepts either field or both (at least one; unknown keys refused; range messages from
    `STOCK_HOLD_LIMITS` / `ABANDON_LIMITS`);
  - `updateHousekeepingSettings` writes the changed columns and one `housekeeping_settings_change` row per changed field
    (`field = 'stockHoldMinutes'`).

  Rename the forbidden message to cover both settings.
- [X] T038 [P] [US5] `apis/edge-api/orders/src/housekeeping/activity.ts`: the words for `stockHoldMinutes` ("Changed
  how long checkout holds stock from 15 to 20 minutes").
- [X] T039 [US5] Extend `apis/edge-api/orders/src/housekeeping/service.test.ts` and `service.container.test.ts`:
  - only the hold time, only the abandon time, both;
  - out of range;
  - a manager refused;
  - a stale version;
  - activity rows per field.
- [X] T040 [US5] back-office `apps/back-office/src/features/settings/housekeeping/` (`HousekeepingScreen.tsx`,
  `words.ts`, `repo.ts`, `queries.ts`):
  - a "Hold stock at checkout" minutes field beside the abandon time, read-only for managers and CSAs;
  - saves with the version;
  - the words: label, help ("Units stay held for a shopper this long after they press Pay"), and the range error.

  Extend `HousekeepingScreen.test.tsx`.
- [X] T041 [US5] Tour HK:
  - add a step for the field to `specs/107-backoffice-guided-tours/spec.md`'s HK inventory (words first);
  - then `apps/back-office/src/features/tours/tours.ts` (step plus `data-tour` key on the field), raising HK's
    `version`;
  - run `tours.test.ts`.

**Checkpoint**: the hold time is a business setting with a history.

## Phase 8: Polish & Cross-Cutting

- [X] T042 [P] Create `infra/envs/dev/stock-holds.tf`: CloudWatch alarm `StockHoldLateShort` on `Effy/Commerce`
  (`MONEY_METRIC_NAMESPACE`) `StockHoldLate` with `outcome=short`, sum ≥ 3 over 24 hours (a single 86400 s period), sending to the
  existing alerts topic, on the pattern of 113's `UnplacedPaymentRefunded` in `housekeeping.tf`. Run `terraform fmt` and
  `terraform validate` (no apply).
- [X] T043 Run real goose up / down-to `20261112090000` / up on the local Postgres for the migration.
- [X] T044 Run the suites and record the results in the hand-off:
  - shared (unit, guard, container: holds, availability, finalize, payments), commerce (unit + container), orders
    (housekeeping), inventory, storefront, catalog;
  - shared-types;
  - back-office, shop-web and customer-web vitest and builds; customer-web depcruise;
  - customer app host tests and the Android and iOS compiles;
  - gateway capacity (expect 234/300 unchanged), `change-map.guard`, `live.contract`.

  Note any failure that also fails without 114.
- [X] T045 [P] Docs:
  - **`FEATURE-HISTORY.md`**: a 114 entry at the top with what changed, the behaviour change (refuse instead of
    silent cap), the deploy order with "commerce and the website together", and the open steps;
  - **`CLAUDE.md`**: the feature line "built 2026-11-12; not migrated, deployed or walked", and a short ⚠ under the
    commerce / money section: "STOCK IS HELD AT PAYMENT START (114) - `stock_hold`, one writer `stock/holds.ts`;
    left to sell = shelf − live holds, only through `availability.ts`";
  - **`ORDER-FLOW-GAPS.md`**: 054's A6 residual oversell window closed by 114.
- [X] T046 [P] Notifications backlog F5 (folded in, per the operator):
  - `docs/next-implementation-candidates.md`: #2, #3 and #16 done; #4 and #6 done by 109 and 110; a dated note that the
    register is stale beyond these;
  - `docs/audiences/customer-capabilities.md`: the Notifications screen row is now the inbox (110);
  - `docs/observability-apple-blockers.md`: the time-sensitive capability step for backlog D7;
  - `docs/notifications-backlog.md`: F5 done (114), and F8 recorded as "not doing: the website inbox covers it" **only
    if the operator has confirmed**, otherwise leave it open and say so in the hand-off.
- [X] T047 [P] Memory: a new `checkout-stock-holds-114.md` project memory (what's non-obvious: required `shownLines`,
  no sweep, late-payment rule, hold time on Clean-ups) and its `MEMORY.md` line.
- [X] T048 Walk the quickstart's local checks list, mark this file's tasks [X], and hand off the operator steps from
  quickstart.md (db-up, apply, commerce + orders + edge-deploy-all, the web pipelines with commerce, then the app).

## Dependencies

- **Phase 1 → Phase 2 → everything.** T004 (the rule) and T007 (the writer) block all stories; T011 must finish before
  any commerce story task.
- **US1** (T012–T017) needs Phase 2. **US2** needs US1's T013 (the refusal type and the hold call site). **US3** needs
  T007 and T015. **US4** needs T004 only, so it can run beside US1–US3. **US5** needs T001/T002 only, so it can run
  beside everything; `holdStock` already reads the column.
- Polish after all stories. T046 is independent and can be done at any time.

## Parallel examples

- Phase 1: T002 beside T001.
- Phase 2: T005, T006, T008 and T009 together once T004 / T007 exist.
- US2: T021 (web), T022 (app data) and T024 (app tests) beside the backend T018–T020.
- US4: T030–T035 all touch different files: run them together after T029.
- US5: T038 beside T037; T040 / T041 once the DTO from T002 exists.

## Implementation strategy

1. **MVP = Phases 1–3 (US1)**: the hold and the one-shopper guarantee. Do not deploy US1 alone: it changes the intent,
   and US2's required `shownLines` must ship with it, so treat **US1 + US2 as one deployable increment**.
2. US3 next: the release paths and the late-payment rule. These are what make the guarantee hold over time.
3. US4 and US5 are operator-facing and can land in either order.
4. Polish: alarm, docs, the backlog F5 items, memory, hand-off.

**Totals**: 48 tasks:

| Phase | Tasks |
|---|---|
| Setup | 3 |
| Foundational | 8 |
| US1 | 6 |
| US2 | 7 |
| US3 | 4 |
| US4 | 8 |
| US5 | 5 |
| Polish | 7 |

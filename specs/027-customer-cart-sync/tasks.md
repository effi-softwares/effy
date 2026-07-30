---

description: "Task list for 027-customer-cart-sync"
---

# Tasks: Customer Cart — Persistent, Synced & Complete

**Input**: Design documents from `/specs/027-customer-cart-sync/`

**Prerequisites**: [plan.md](plan.md) · [spec.md](spec.md) · [research.md](research.md) ·
[data-model.md](data-model.md) · [contracts/](contracts/) · [quickstart.md](quickstart.md)

**Tests**: Included. Not because TDD was requested, but because the constitution's Quality Gates make a
green unit suite a condition of every slice, and because three of this feature's hardest properties —
idempotence, out-of-order response handling, and exactly-once redemption — are **only** provable in a
test. They are written alongside their implementation, not before it, matching this repo's practice.

**Organization**: Tasks are grouped by user story. The foundational phase is unusually large here and
that is deliberate: the platform must become authoritative before any client can stop being so.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US10, mapping to the spec's user stories
- **⚠ operator**: the operator runs this, not Claude (deployments, migrations, live AWS, device runs)

## Path Conventions

Monorepo. Hot path `apis/core-api/internal/`, cold path `apis/edge-api/admin/src/`, mobile
`apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/` (abbreviated
**`MOBILE/`** below), web `apps/customer-web/`, console `apps/back-office/src/`, contracts
`packages/shared-types/`.

---

## Phase 1: Setup (contract SSOT and the two amendments)

**Purpose**: put the contract and the recorded decisions in place before any code is written against them

- [X] T001 Create the migration file with `make db-new NAME=cart_sync_promotions` so Goose owns the timestamp; leave it empty for T009/T010
- [X] T002 [P] Record the R8 reversal as an amendment in `specs/019-customer-commerce-flow/research.md` — Option B is superseded, its insight retained, pointing to `specs/027-customer-cart-sync/research.md` R0
- [X] T003 [P] Amend the doc-comment in `MOBILE/core/storage/DevicePreferences.kt` to permit a non-authoritative, reconciled-on-read mirror under the three conditions in research R3, and add `PreferenceKeys.CART_MIRROR` + `PreferenceKeys.CART_QUEUE`
- [X] T004 Rewrite the cart contract in `packages/shared-types/src/cart.ts` per [contracts/cart-api.contract.md](contracts/cart-api.contract.md) §4: add `revision`, `savedLines`, `discountAmount`, `discount`, `checkout`, `limits`; widen `CartNoticeDTO` (`productId: string | null`, `detail`, 4 new kinds); add `CartDiscountDTO`, `CartCheckoutStateDTO`, `CartLimitsDTO`, `CartPolicyDTO`, `ReorderResultDTO`, `ReorderSkippedDTO`, `CartLineInput`, `CartPreviewRequest`, `ReorderRequest`, `ApplyPromoRequest`; add `changeId` to `AddToCartRequest`/`UpdateCartLineRequest`; **remove** `ReplaceCartRequest` and add `MergeCartRequest` with a doc-comment that states plainly it is union-with-**maximum** and not 019's additive merge
- [X] T005 [P] Add `discountAmount` and `promoCode` to the receipt and order-history DTOs in `packages/shared-types/src/order.ts`
- [X] T006 [P] Add `PromoCodeDTO`, `CreatePromoCodeRequest`, `UpdatePromoCodeRequest`, `SetPromoStatusRequest`, `OrderPolicyDTO`, `UpdateOrderPolicyRequest` to a NEW `packages/shared-types/src/promotion.ts` (mirroring how `delivery.ts` and `shop.ts` hold management DTOs — a deviation from this task's original `back-office.ts` target, made for symmetry with the codebase) exported from `src/index.ts`, per [contracts/promotions-admin-api.contract.md](contracts/promotions-admin-api.contract.md) §3
- [X] T007 Run `pnpm --filter @effy/shared-types commerce-contract:gen`; extend `packages/shared-types/scripts/gen-kotlin-commerce-contract.mjs` if it cannot express the new shapes (nullable members of named objects, the widened `string | null`), then confirm `commerce-contract:check` is green
- [X] T008 Run `pnpm -r typecheck` and fix every consumer the contract change breaks — expect hits in `apps/customer-web/lib/cart-store.ts`, `apps/customer-web/app/checkout/CheckoutFlow.tsx`, and `MOBILE/features/cart/data/HttpCartRepository.kt`

**Checkpoint**: the contract is the SSOT for everything that follows, and both amendments are on record.

---

## Phase 2: Foundational (the platform becomes authoritative)

**⚠ CRITICAL**: no user story can begin until the migration is applied and the hot-path cart is
authoritative. Everything in this phase blocks everything after it.

### Migration

- [X] T009 Author the `-- +goose Up` half of `db/migrations/<ts>_cart_sync_promotions.sql`: create `public.promo_code`, `public.promo_redemption`, `public.order_policy`, `public.cart_saved_item`, `public.cart_change_log` exactly as specified in [data-model.md](data-model.md) §4–§8, in that order, with every `CHECK`, every FK index, and `COMMENT ON` on every table and non-obvious column
- [X] T010 Add the three `ALTER TABLE`s (`cart` + `revision`/`promo_code_id`/`promo_applied_at`, `cart_item` + `unit_price_at_add`, `public."order"` + `discount_amount`/`promo_code_id`/`promo_code`), the `order_policy` seed row, and the `-- +goose Down` half (reverse order, dev single-stepping only) in the same file
- [ ] T011 **⚠ operator** Commit the migration file (003 commit-guard), then run `make db-up ENV=dev` and `make db-status ENV=dev` to confirm it applied

### Hot path — the read side

- [X] T012 [P] Create `apis/core-api/internal/platform/cartpolicy/policy.go`: read the single `public.order_policy` row into a typed value (minimum in cents, `MaxLineQuantity`, `MaxDistinctItems`), plus `policy_test.go`
- [X] T013 Extend `apis/core-api/internal/features/cart/repository.go`: return `unit_price_at_add` from `Lines()`, add `SavedLines(cartID)` over `cart_saved_item` with the same `LATERAL` primary-media pick, and add `CountDistinct(cartID)`
- [X] T014 Add a `bumpRevision` fold to every mutating statement in `apis/core-api/internal/features/cart/repository.go` so no mutation can return without advancing `cart.revision`, and return the new revision from `GetOrCreateCartID`/`Lines`

### Hot path — the write side

- [X] T015 Replace `ReplaceItems` with `MergeItems` in `apis/core-api/internal/features/cart/repository.go`: `unnest` + `ON CONFLICT DO UPDATE SET quantity = LEAST(GREATEST(cart_item.quantity, EXCLUDED.quantity), $max)` — union with **maximum**, never a sum, and **no** delete-what-is-absent clause (that clause is what made the old op a clobber)
- [X] T016 Add `SetQty` absolute semantics, `DeleteAllItems(cartID)` (clear — `cart_item` only, never `cart_saved_item`), `SetAside`, `RestoreSaved` and `DeleteSaved` to `apis/core-api/internal/features/cart/repository.go`; set-aside and restore each run as one transaction of two statements
- [X] T017 Add `MarkChangeApplied(tx, cartID, changeID) (bool, error)` to `apis/core-api/internal/features/cart/repository.go` — insert into `cart_change_log` with `ON CONFLICT DO NOTHING` **inside the mutation's own transaction**, returning false when already applied, plus the bounded 7-day prune
- [X] T018 Rework `apis/core-api/internal/features/cart/service.go`: `SetQty` becomes absolute (0 removes), quantity clamps to `policy.MaxLineQuantity` and emits a `quantity_clamped` notice rather than failing, `Add` refuses past `policy.MaxDistinctItems` with `cart_full` leaving the cart untouched
- [X] T019 Add `Merge(customerID, lines, changeID)` (union-max, idempotent) and `Clear(customerID)` to `apis/core-api/internal/features/cart/service.go`
- [X] T020 Add `Preview(lines)` to `apis/core-api/internal/features/cart/service.go` — re-price a client-supplied line set with full notices and **zero writes**, for guests (research R10)
- [X] T021 Add a single `withChangeGuard` wrapper in `apis/core-api/internal/features/cart/service.go` that every mutation passes through, so a `changeId` is honoured uniformly and a future non-idempotent operation inherits the guard automatically
- [X] T022 Rewrite the cart `build()` in `apis/core-api/internal/features/cart/service.go` to assemble the widened cart: payable lines, saved lines, `priceChangedFrom` from `unit_price_at_add`, notices (`unavailable`, `price_changed`, `removed`, `quantity_clamped`), `limits`, and a `checkout` state with `blockedReason` ∈ `empty | no_payable_items` (the `below_minimum` case lands in US9)
- [X] T023 Delete a line whose product row no longer exists and emit a `removed` notice for it (FR-025), in `apis/core-api/internal/features/cart/service.go`

### Hot path — the edge

- [X] T024 Rewrite the DTO mapping in `apis/core-api/internal/features/cart/handler.go` for the widened `CartDTO` (revision, savedLines, discount `null` for now, checkout, limits, notices with a nullable `productId`)
- [X] T025 Add handlers for `DELETE /v1/cart`, `POST /v1/cart/merge`, `POST /v1/cart/items/{productId}/set-aside`, `POST /v1/cart/saved/{productId}/restore`, `DELETE /v1/cart/saved/{productId}` in `apis/core-api/internal/features/cart/handler.go`, and the two public handlers `POST /v1/cart/preview` and `GET /v1/cart/policy`
- [X] T026 Rewrite `apis/core-api/internal/features/cart/register.go`: the authenticated group loses `PUT ""` and gains the five routes above; add a **separate public group** (no auth middleware) for `preview` and `policy`
- [X] T027 Extend `apis/core-api/internal/features/cart/service_test.go`: absolute-set-quantity idempotence, clamp-with-notice, `cart_full` refusal leaves the cart unchanged, merge is union-max **and** unchanged on a second run, `changeId` replay is a no-op returning the current cart, preview writes nothing, `removed` notice deletes the line, saved items appear in no total
- [X] T028 Run `cd apis/core-api && go build ./... && go vet ./... && go test ./... && gofmt -l .` and confirm the cart is wired into the router with both groups
- [X] T029a Prove every new/changed cart SQL statement against a real Postgres 16 (throwaway Docker container, full Goose chain, two shops + media + an archived product): the `Lines`/`SavedLines` projections with the LATERAL media pick, `MergeItems` union-with-MAXIMUM (existing 3 vs sent 2 → stays 3, not 5, not 2), set-aside/restore-at-current-price, the change-log dedupe (2nd insert = 0 rows), the revision bump, `ProductSnapshots`, and the ownership-checked reorder read (wrong customer → 0 rows)
- [ ] T029b **⚠ operator** `make core-run`, then exercise `GET /v1/cart` over HTTP against the dev seed with a two-shop cart. The SQL is proven (T029a); this closes the HTTP/auth half, which needs Cognito and AWS credentials Claude does not have

### Client seams (shapes only — behaviour lands in the story phases)

- [X] T030 [P] Create `MOBILE/features/cart/domain/PendingChange.kt`: a `@Serializable` change with `changeId`, kind, productId, quantity, attempt count and status (`queued | sending | failed`)
- [X] T031 Widen the `MOBILE/features/cart/domain/CartRepository.kt` port to the full surface — `get`, `add`, `setQuantity`, `remove`, `clear`, `merge`, `reorder`, `setAside`, `restoreSaved`, `deleteSaved`, `applyPromo`, `removePromo`, `preview`, `policy` — each returning the domain cart, and **delete `replace`**
- [X] T032 Implement every port method in `MOBILE/features/cart/data/HttpCartRepository.kt` against the generated DTOs, mapping wire → domain explicitly and preserving the existing `AppError` translation
- [X] T033 [P] Add route handlers under `apps/customer-web/app/api/cart/` — one file per operation (`route.ts` for GET/DELETE, `items/route.ts`, `items/[productId]/route.ts`, `items/[productId]/set-aside/route.ts`, `saved/[productId]/route.ts`, `saved/[productId]/restore/route.ts`, `merge/route.ts`, `reorder/route.ts`, `promo/route.ts`, `preview/route.ts`, `policy/route.ts`) — all via `proxyToCore`, and **delete the old `PUT`**
- [X] T034 [P] Create `apps/customer-web/lib/cart-api.ts`: a typed, dependency-free client over those handlers, returning the contract's `CartDTO`

**Checkpoint**: the platform is authoritative and every route is reachable. No client behaviour has
changed yet.

---

## Phase 3: User Story 1 — My cart is still there (Priority: P1) 🎯 MVP

**Goal**: a cart survives a force-quit and a device restart, for guests and signed-in shoppers, on both
surfaces, and shows current prices when it comes back.

**Independent Test**: add 3 items, force-quit, reopen — same items, same quantities, same order, current
prices. Then restart the device. Then repeat as a guest and signed in, and on the web storefront.

- [X] T035 [US1] Create `MOBILE/features/cart/data/CartLocalStore.kt`: serialise `{revision, lines, savedLines, discount, checkout, limits}` and the pending queue to two `DevicePreferences` keys with `kotlinx.serialization`, behind a schema version so a future shape change discards rather than crashes
- [X] T036 [P] [US1] Add `CartLocalStoreTest.kt` under `apps/customer-mobile/shared/src/commonTest/.../features/cart/`: round-trip, unknown-version discard, corrupt-JSON discard, empty-store default
- [X] T037 [US1] Create `MOBILE/features/cart/domain/CartStore.kt`: the mirror — an immutable `StateFlow<CartState>` hydrated from `CartLocalStore` on construction, with `apply`, `adopt(cart)` (revision-guarded) and `reset()`; keep the pure ops from `GuestCart.kt`
- [X] T038 [P] [US1] Add `CartStoreTest.kt`: hydration from a persisted mirror, `adopt` accepts a higher revision, `adopt` **rejects a lower one**, `reset` clears
- [X] T039 [US1] Delete `MOBILE/features/cart/domain/GuestCartStore.kt` and repoint `MOBILE/app/AppContainer.kt` (`guestCart` → `cartStore`, constructed with `devicePreferences()`)
- [X] T040 [US1] Repoint every reader of the old store: `MOBILE/features/cart/presentation/CartScreen.kt`, `CartAction.kt`, `MOBILE/features/catalog/presentation/ProductDetailViewModel.kt`, and `MOBILE/features/checkout/presentation/CheckoutViewModel.kt`
- [X] T041 [US1] Persist the mirror on every change in `MOBILE/features/cart/domain/CartStore.kt`, coalescing writes so a burst of taps is one file write, not ten
- [X] T042 [P] [US1] Extend `apps/customer-web/lib/cart-store.ts`: hold `revision`, `savedLines`, `discount`, `checkout`, `limits` and the pending queue in the same `localStorage` + `useSyncExternalStore` store, under a versioned key, migrating the existing `effy:cart` payload rather than dropping a shopper's cart on deploy
- [X] T043 [P] [US1] Extend `apps/customer-web/lib/cart-store.test.ts`: persistence round-trip, key migration from the 019 shape, revision-guarded adopt, corrupt-payload discard
- [X] T044 [US1] Reconcile a **guest's** restored cart against `POST /v1/cart/preview` on cart open in `MOBILE/features/cart/domain/CartSyncCoordinator.kt` (created here, network-minimal) and in `apps/customer-web/lib/cart-sync.ts`, so a restored guest cart shows current prices and availability (FR-004)
- [X] T045 [P] [US1] Add `apps/customer-web/lib/cart-sync.test.ts` for the guest preview path: prices refresh, no write is issued, a preview failure leaves the mirror intact rather than emptying it
- [ ] T046 **⚠ operator** [US1] (needs T011: the migration applied) Run quickstart §3 scenarios 1–2 on Android, iOS and web: force-quit and device-restart survival (SC-001)

**Checkpoint**: the defect that motivated this slice is closed. Nothing else needs to work for this to be
worth shipping.

---

## Phase 4: User Story 2 — One cart, whichever way I shop (Priority: P1)

**Goal**: a signed-in shopper's cart is account-level and converges across devices and surfaces.

**Independent Test**: sign in on app and web; add on one, open the cart on the other within 5 s; change a
quantity on each in turn and confirm both settle on the same cart.

- [X] T047 [US2] Build out `MOBILE/features/cart/domain/CartSyncCoordinator.kt`: send each mutation through `CartRepository`, `adopt` the returned cart by revision, and discard any response whose revision is not newer
- [X] T048 [US2] Add `SyncCart` to `MOBILE/features/cart/domain/usecase/` and call it on cart open and on app foreground (the existing lifecycle seam in `MOBILE/app/CustomerShell.kt`) — FR-008
- [X] T049 [US2] In `MOBILE/core/session/SessionManager.kt`, adopt the account cart with a `GET /v1/cart` on the `Authenticated` transition, and reset the mirror to an empty guest cart on `signOutLocally` (FR-013)
- [X] T050 [P] [US2] Add `CartSyncCoordinatorTest.kt`: a response arriving out of order is discarded, a newer one is adopted, and two interleaved line mutations converge — the failure a manual two-device test will not reproduce on demand
- [X] T051 [P] [US2] Implement the same in `apps/customer-web/lib/cart-sync.ts`: drain, revision-guarded adopt, and reconcile on mount, `visibilitychange` and `focus`
- [X] T052 [P] [US2] Extend `apps/customer-web/lib/cart-sync.test.ts` with the out-of-order and interleaved-mutation cases
- [X] T053 [US2] Make `apps/customer-web/app/(shop)/_components/{CartBadge,MiniCart,AddToCartControl}.tsx` and `app/(shop)/cart/page.tsx` read the mirror only, and remove any direct cart fetch left in a component
- [ ] T054 **⚠ operator** [US2] Run quickstart §3 scenarios 3, 6, 7 with two real clients against one local `core-api` (SC-002, SC-004)

- [X] T054a [US2] Pull to refresh on the cart (FR-065a, operator request 2026-07-30) — `PullToRefreshBox` in `MOBILE/features/cart/presentation/CartScreen.kt` around BOTH the populated list and the empty state, calling `container.syncCart()`; a second pull mid-flight is ignored rather than queued, and a failure stops the spinner and changes nothing else
- [X] T054b **⚠ operator-verified BY CLAUDE** [US2] Live-tested on the Android emulator: the pull renders the spinner and issues `GET /v1/cart` → 200 (1.02s), with the cart intact

- [X] T054c [US2] Extract the gesture into ONE shared `EffyPullToRefresh` in `MOBILE/core/presentation/` (FR-065b/c) — owns the in-flight flag so the indicator cannot lie, ignores a second pull mid-flight, and carries the elastic content-follow in a single `graphicsLayer` line driven by `distanceFraction` (Material's own resistance curve; no animation code of our own)
- [X] T054d [US2] Add a non-destructive `suspend fun refresh()` to `HomeViewModel`, `OrdersViewModel`, `FavoritesViewModel`, `ProductDetailViewModel` and `ReceiptViewModel` — the existing `load()` flips to a full-screen spinner, which is right on first open and wrong on a pull; a failure keeps what is on screen
- [X] T054e [US2] Adopt it on Discover, Orders, Favourites, the product page and the receipt; **fix HomeScreen's pre-existing broken one** (025 FR-033 hard-coded `isRefreshing = false`, so the indicator never appeared, and called `load()`, which blanked the grid). Deliberately NOT on search (query-driven) or checkout (mid-flow)
- [X] T054f **⚠ operator-verified BY CLAUDE** [US2] Live on the Android emulator: Discover pull → `GET /v1/storefront/home` + `/categories` 200 with the grid visibly following the finger and NOT blanking; Orders pull → `GET /v1/orders` 200

**Checkpoint**: the cart is one thing the shopper owns, not one per device.

---

## Phase 5: User Story 3 — Signing in keeps everything (Priority: P1)

**Goal**: sign-in unions the device cart with the account cart, losing nothing and doubling nothing.

**Independent Test**: guest `A×1, B×2` + account `B×3, C×1` → sign in → `A, B×3, C`; repeat the sign-in
five times and confirm quantities never move.

- [X] T055 [US3] Add `MergeCartOnSignIn` to `MOBILE/features/cart/domain/usecase/` — post the mirror's lines to `POST /v1/cart/merge` with a `changeId`, adopt the result, then clear the local guest lines only after the merge is acknowledged
- [X] T056 [US3] Call it from the `Authenticated` transition in `MOBILE/core/session/SessionManager.kt`, ordered **before** the `SyncCart` adopt from T049 so a merge is never overwritten by a plain read
- [X] T057 [P] [US3] Add `MergeCartOnSignInTest.kt`: union with max, a second run changes nothing, an empty guest cart leaves the account cart untouched, a failed merge retains the local lines rather than silently dropping them
- [X] T058 [P] [US3] Merge on the web after a successful sign-in in `apps/customer-web/app/(auth)/` — post the mirror through `/api/cart/merge`, keeping `aws-amplify` on the server side of the quarantine
- [X] T059 [P] [US3] Add the equivalent web tests in `apps/customer-web/lib/cart-sync.test.ts`, including the unavailable-item case (the merge completes and the item arrives flagged, not dropped)
- [ ] T060 **⚠ operator** [US3] Run quickstart §3 scenarios 4–5 on both surfaces (SC-003)

**Checkpoint**: all three P1 stories are done. The cart is durable, account-level and lossless.

---

## Phase 6: User Story 4 — The cart keeps up with me (Priority: P2)

**Goal**: instant interaction, few requests, and no change lost to a dropped connection.

**Independent Test**: ten rapid taps track every tap and produce ≤2 requests; changes made in airplane
mode apply exactly once when connectivity returns, including across a force-quit.

- [X] T061 [US4] Add per-`productId` debounce (400 ms, a named constant), single-flight-per-line and newer-value conflation to `MOBILE/features/cart/domain/CartSyncCoordinator.kt`
- [X] T062 [US4] Add exponential backoff with a retry ceiling, and **stop retrying on a definitive refusal** (4xx that is not a timeout), in `MOBILE/features/cart/domain/CartSyncCoordinator.kt` — FR-020
- [X] T063 [US4] Drain the persisted queue on construction so a change made before a force-quit is applied on the next launch, in `MOBILE/features/cart/domain/CartSyncCoordinator.kt`
- [X] T064 [US4] Expose a per-line and cart-level unsaved/failed state in `CartStore`'s `CartState`, and reconcile to the platform's actual contents after a definitive failure (FR-019)
- [X] T065 [US4] Surface it in `MOBILE/features/cart/presentation/CartScreen.kt` — an unsaved marker and a single failure message, using the 026 monochrome primitives already in the file; no layout change
- [X] T066 [P] [US4] Add `CartSyncCoordinatorDebounceTest.kt`: ten sequential quantity changes produce **one** request; a pause longer than the debounce produces two; a definitive refusal stops retrying; a queue persisted across a cold start applies exactly once
- [X] T067 [P] [US4] Implement the same in `apps/customer-web/lib/cart-sync.ts` with `setTimeout` debouncing and `online`/`offline` listeners, no new dependency
- [X] T068 [P] [US4] Show the unsaved/failed state in `apps/customer-web/app/(shop)/cart/page.tsx`
- [X] T069 [P] [US4] Extend `apps/customer-web/lib/cart-sync.test.ts` with the debounce count, backoff, definitive-refusal and cold-start-drain cases
- [ ] T070 **⚠ operator** [US4] Run quickstart §3 scenarios 8–10 on both surfaces, counting requests (SC-005, SC-006)

**Checkpoint**: the cart feels native and tolerates a bad network.

---

## Phase 7: User Story 5 — The cart never lies to me (Priority: P2)

**Goal**: current price and availability, always, with the previous price shown when it changed, and
nothing unavailable ever charged for.

**Independent Test**: mark a cart product unavailable → flagged, excluded, unpayable; change a price up
and down → current price charged, previous shown both ways.

- [X] T071 [US5] Record `unit_price_at_add` on every insert path in `apis/core-api/internal/features/cart/repository.go` (add, merge, reorder, restore-from-saved) so the comparison in T022 has something to compare against
- [X] T072 [US5] Populate `priceChangedFrom` and emit the `price_changed` notice in `apis/core-api/internal/features/cart/service.go`, leaving both empty when `unit_price_at_add` is null (a pre-migration row must not fabricate a change)
- [X] T073 [P] [US5] Extend `apis/core-api/internal/features/cart/service_test.go`: price rise, price fall, null add-price, unavailable excluded from the subtotal, an all-unavailable cart yields `no_payable_items`
- [X] T074 [P] [US5] Render unavailable lines, the price-change line and the cart-level notices in `MOBILE/features/cart/presentation/CartScreen.kt`, and gate the checkout button on `checkout.allowed`
- [X] T075 [P] [US5] Render the same in `apps/customer-web/app/(shop)/cart/page.tsx`
- [X] T076 [P] [US5] Add a `MOBILE` ViewModel/state test asserting an unavailable line contributes nothing to the displayed total
- [ ] T077 **⚠ operator** [US5] Run quickstart §3 scenarios 11–12 on both surfaces (SC-007, SC-008)

**Checkpoint**: no shopper learns about a price change at the payment step.

---

## Phase 8: User Story 6 — Set it aside, or start over (Priority: P2)

**Goal**: save-for-later that persists and syncs, and a confirmed clear-cart that leaves saved items alone.

**Independent Test**: set aside → survives a restart and appears on another device → restore at current
price. Separately, clear a full cart and confirm the confirmation step and that saved items remain.

- [X] T078 [US6] Add `SetAside`, `RestoreSaved`, `DeleteSaved` and `Clear` to `apis/core-api/internal/features/cart/service.go`, refusing a restore of an unavailable product (FR-031) and never touching `cart_saved_item` on a clear
- [X] T079 [P] [US6] Extend `apis/core-api/internal/features/cart/service_test.go`: a product is never in both tables, saved items are absent from every total, a clear leaves them, restoring an unavailable item is refused, restore prices at current
- [X] T080 [P] [US6] Add `SetAside`, `RestoreSaved`, `DeleteSaved`, `ClearCart` use cases under `MOBILE/features/cart/domain/usecase/`
- [X] T081 [US6] Add the saved section and the clear-cart action with a confirmation to `MOBILE/features/cart/presentation/CartScreen.kt` — a sectioned list, not a card (Principle V), reusing `EffyDetailRow`/`EffyHairline` and the existing undo snackbar pattern
- [X] T082 [P] [US6] Add the same to `apps/customer-web/app/(shop)/cart/page.tsx` with a confirmation dialog from `@effy/design-system/ui`
- [X] T083 [P] [US6] Add web tests in `apps/customer-web/app/(shop)/cart/` covering set-aside exclusion from totals and clear-preserves-saved
- [ ] T084 **⚠ operator** [US6] Run quickstart §3 scenarios 13–14 on both surfaces (SC-009, SC-010)

**Checkpoint**: "I'm not sure" and "start again" both have a non-destructive answer.

---

## Phase 9: User Story 7 — Order that again (Priority: P3)

**Goal**: a past order returns to the cart in one action, with an honest report of what could not come back.

**Independent Test**: reorder a 5-item order with 2 unavailable → 3 added, 2 reported, no shop named;
reorder twice → no doubling.

- [X] T085 [US7] Add `OrderItemsForReorder(customerID, orderID)` to `apis/core-api/internal/features/cart/repository.go` — ownership-checked, returning product id, name, quantity and current status
- [X] T086 [US7] Add `Reorder(customerID, orderID, changeID)` to `apis/core-api/internal/features/cart/service.go`: union-with-max against the current cart, skipping unavailable and deleted products, applying the distinct-item ceiling to the batch as a whole, returning the cart plus a `skipped[]` with a reason per item
- [X] T087 [US7] Add the `POST /v1/cart/reorder` handler and `ReorderResultDTO` mapping in `apis/core-api/internal/features/cart/handler.go`, returning 404 (never 403) for another customer's order
- [X] T088 [P] [US7] Extend `apis/core-api/internal/features/cart/service_test.go`: 3-of-5 added with 2 reported, a second call does not double, a full cart reports `cart_full`, an all-unavailable order changes nothing, another customer's order is 404
- [X] T089 [P] [US7] Add a `ReorderPastOrder` use case under `MOBILE/features/cart/domain/usecase/` and a reorder action in `MOBILE/features/orders/presentation/`, reporting the skipped count with no shop reference
- [X] T090 [P] [US7] Add the same to `apps/customer-web/app/(shop)/orders/`
- [ ] T091 **⚠ operator** [US7] Run quickstart §3 scenarios 15–16 on both surfaces (SC-011)

**Checkpoint**: a weekly grocery order is one tap, not fifteen searches.

---

## Phase 10: User Story 10 — Run a promotion (Priority: P3)

**Goal**: an operator takes a promotion from nothing to live and back off again, entirely from the
console. Sequenced **before** US8 because every promotional test needs codes an operator created.

**Independent Test**: create a code in the console, watch a shopper redeem it, watch the usage count rise,
disable it, confirm the next shopper is refused — with no database access at any point.

- [X] T092 [P] [US10] Create `apis/edge-api/admin/src/promotions/types.ts` and `authz.ts` — the 009 gates: read = any active staff incl. `csa`, mutate = `admin`/`manager`, uniform 403
- [X] T093 [US10] Create `apis/edge-api/admin/src/promotions/repository.ts`: list with `q`/`status`/keyset paging and a `redemptionCount` **counted from `promo_redemption`** (never a stored counter), detail, create, update, status, delete, and the `order_policy` read/write
- [X] T094 [US10] Create `apis/edge-api/admin/src/promotions/service.ts`: every validation refusal in [contracts/promotions-admin-api.contract.md](contracts/promotions-admin-api.contract.md) §5, the `promo_immutable_once_used` rule (§4), delete-only-when-unused, and an `admin.audit_log` write per mutation
- [X] T095 [P] [US10] Create `apis/edge-api/admin/src/promotions/handler-support.ts` following the `delivery/` slice's shape
- [X] T096 [US10] Add the nine `apis/edge-api/admin/src/functions/` handlers (`promotions-list-v1-get`, `promotions-create-v1-post`, `promotions-detail-v1-get`, `promotions-update-v1-patch`, `promotions-status-v1-post`, `promotions-delete-v1-delete`, `promotions-audit-v1-get`, `order-policy-v1-get`, `order-policy-v1-put`) and register them in `apis/edge-api/admin/serverless.yml`
- [X] T097 [P] [US10] Add `apis/edge-api/admin/src/promotions/*.test.ts`: each authz gate, each validation refusal creating nothing, the used-code immutability rule, delete-refused-when-used, and that `redemptionCount` is derived
- [X] T098 [P] [US10] Create `apps/back-office/src/features/promotions/{model,repo,queries,access,errorText}.ts` mirroring `features/delivery/`
- [X] T099 [US10] Create `apps/back-office/src/features/promotions/PromotionsListScreen.tsx` using `DataTable` from `@effy/web-kit/console`: code, kind, value, window, usage against caps, status; filter by status, search by code — **no cards, no metric tiles**
- [X] T100 [US10] Create `apps/back-office/src/features/promotions/PromotionDetailScreen.tsx`: sectioned detail rows (definition · limits · usage · attribution · audit trail), enable/disable, and a delete offered only when unused
- [X] T101 [P] [US10] Create `apps/back-office/src/features/promotions/OrderRulesScreen.tsx` for the single `order_policy` row: minimum spend, per-line ceiling, distinct-item ceiling
- [X] T102 [US10] Add the routes and the nav entry in `apps/back-office/src/routes/` and `apps/back-office/src/components/layout/nav.ts`, role-gated so a `csa` sees the list but not the mutations
- [X] T103 [P] [US10] Add `apps/back-office/src/features/promotions/*.test.tsx`: the role gate, the validation error text, and the used-code disabled-edit state
- [ ] T104 **⚠ operator** [US10] `make edge-deploy SERVICE=admin ENV=dev`, then create the eight quickstart §2 fixture codes **through the console** and run quickstart §4 scenarios 26–30 (SC-020, SC-021)

**Checkpoint**: promotions are a product capability, not an engineering one.

---

## Phase 11: User Story 8 — Use my promotional code (Priority: P3)

**Goal**: a code applies in the cart, is refused with the right reason when it should not, and the
discount that reaches Stripe is the platform's own — counted once per paid order.

**Independent Test**: apply each of the eight fixture codes and get the exact expected outcome; pay with
a test card and confirm the charge matches the displayed total to the cent; re-deliver the webhook and
confirm the redemption count stays at 1.

- [X] T105 [P] [US8] Create `apis/core-api/internal/features/cart/promo.go`: pure validation (unknown, not started, expired, disabled, exhausted, already used, below minimum, not applicable) and the discount computation, with the fixed-amount cap so the payable total never goes below zero
- [X] T106 [P] [US8] Add `apis/core-api/internal/features/cart/promo_test.go` covering all eight refusals plus percentage rounding and the fixed-amount cap
- [X] T107 [US8] Add promo reads to `apis/core-api/internal/features/cart/repository.go`: lookup by `upper(code)`, the overall redemption count, and this customer's count
- [X] T108 [US8] Add `ApplyPromo` / `RemovePromo` to `apis/core-api/internal/features/cart/service.go`, set `cart.promo_code_id`, recompute the discount on **every** cart build, and emit `promo_no_longer_applies` with a reason when a cart change disqualifies the code (FR-047)
- [X] T109 [US8] Add the `POST`/`DELETE /v1/cart/promo` handlers and the 422 refusal mapping (the eight `promo_*` codes) in `apis/core-api/internal/features/cart/handler.go`
- [X] T110 [US8] Apply the discount to the charged amount in `apis/core-api/internal/features/checkout/service.go` — recomputed from the cart's applied code at intent time, never taken from the request — and persist `discount_amount`, `promo_code_id`, `promo_code` on the order
- [X] T111 [US8] Insert the `promo_redemption` row inside the existing `FinalizeSucceeded` transaction in `apis/core-api/internal/features/checkout/store.go`, after the status-guarded paid transition, relying on `order_id UNIQUE` for exactly-once
- [X] T112 [P] [US8] Extend `apis/core-api/internal/features/checkout/service_test.go`: the intent amount equals payable + delivery − discount, a replayed webhook inserts no second redemption, and a disabled-after-apply code does not discount the charge
- [X] T113 [P] [US8] Add `discountAmount` and `promoCode` to the receipt and history responses in `apis/core-api/internal/features/orders/`
- [X] T114 [P] [US8] Add a promo field, the discount row and the refusal reasons to `MOBILE/features/cart/presentation/CartScreen.kt`, with `ApplyPromoCode`/`RemovePromoCode` use cases under `MOBILE/features/cart/domain/usecase/`; show a sign-in affordance instead of the field for guests (research R10)
- [X] T115 [P] [US8] Add the same to `apps/customer-web/app/(shop)/cart/page.tsx`
- [X] T116 [P] [US8] Show the discount on the receipt and in order history on both surfaces (`MOBILE/features/orders/presentation/`, `apps/customer-web/app/(shop)/orders/`, `app/checkout/complete/`)
- [ ] T117 **⚠ operator** [US8] Run quickstart §3 scenarios 17–19 including the Stripe webhook re-delivery (SC-012, SC-013)

**Checkpoint**: a discount is real money and the platform is the only thing that decides it.

---

## Phase 12: User Story 9 — Tell me before I try to pay (Priority: P3)

**Goal**: a minimum spend is stated in the cart with the shortfall, blocks checkout, and cannot be
bypassed by a client that ignores it.

**Independent Test**: with a `$25` minimum and an `$18` cart, the cart states the shortfall and offers no
checkout; `curl` the intent directly and get `422 order_below_minimum`; add to cross the threshold and
watch it unlock without a reload.

- [X] T118 [US9] **Cart-side branch LANDED EARLY with T022** (`checkoutState` already returns `below_minimum` with both amounts; inert while the seeded minimum is 0.00). Still open in this task: the checkout-intent refusal, the tests, and the UI. Add the `below_minimum` branch to the `checkout` state in `apis/core-api/internal/features/cart/service.go` — payable items only, with `minimumSubtotalAmount` and `remainingAmount`, and nothing shown when the minimum is `0.00` (FR-057)
- [X] T119 [US9] Refuse `POST /v1/checkout/intent` below the minimum in `apis/core-api/internal/features/checkout/service.go` with `422 order_below_minimum` carrying both amounts (FR-056)
- [X] T120 [P] [US9] Extend the cart and checkout Go tests: unavailable items excluded from the minimum, exactly-at-minimum allowed, no message at zero, and the direct-intent refusal
- [X] T121 [P] [US9] Show the minimum and the shortfall and gate the checkout button in `MOBILE/features/cart/presentation/CartScreen.kt`, reading `checkout` from the mirror (guests read `GET /v1/cart/policy`)
- [X] T122 [P] [US9] Add the same to `apps/customer-web/app/(shop)/cart/page.tsx`
- [ ] T123 **⚠ operator** [US9] Run quickstart §3 scenarios 20–22 including the `curl` bypass attempts (SC-014, SC-015)

**Checkpoint**: every capability in the spec is implemented on both customer surfaces.

---

## Phase 13: Polish & Cross-Cutting Concerns

**Purpose**: delete what the new design makes wrong, prove the claims that only a review can prove, and
leave the record honest.

### Delete the old model (not optional — two sources of truth is the 2026-07-23 bug family)

- [X] T124 Remove the checkout-entry cart snapshot from `MOBILE/features/checkout/presentation/CheckoutViewModel.kt` (the `cartRepo.replace` call at the former `:105`) and take the cart from the mirror
- [X] T125 Remove the snapshot-and-gate workaround from `apps/customer-web/app/checkout/CheckoutFlow.tsx` so checkout reads the server cart, and confirm the 2026-07-23 back-to-back-order fix in `app/checkout/complete/page.tsx` still holds
- [X] T126 [P] Grep the repo for `ReplaceCartRequest`, `replace(`, `/v1/cart` `PUT` and `GuestCartStore` and confirm nothing remains in `apis/`, `apps/` or `packages/`

### Prove the claims

- [X] T127 Run the adversarial no-leak review per quickstart §5 on both surfaces — every notice, refusal, reorder report, promo label and minimum message — and read the rendered two-shop below-minimum cart on a device, because grep finds identifiers and only reading finds phrasing (SC-017)
- [X] T128 Measure the `customer-web` bundle **delta** per quickstart §6 (stash / unstash) and record both numbers; do not attempt to fix the pre-existing ≈167 KB overage here
- [X] T129 [P] Add Playwright coverage in `apps/customer-web/e2e/` for the cart journey: persistence across a reload, the guest→sign-in merge, a promo refusal, and the below-minimum gate
- [X] T130 Run the full machine gate sweep from quickstart §1 and fix everything red: `pnpm -r typecheck`, `pnpm -r test`, `pnpm build`, `commerce-contract:check`, Go build/vet/test/gofmt, both mobile suites + `assembleDebug` + the iOS compile, `make mobile-guard`, `node scripts/check-tokens.mjs` (must be **unchanged** — this slice adds no token), `depcruise`
- [X] T131 [P] Confirm PostHog events fire on web for add / remove / promo-applied / promo-refused, and record in the sign-off that **mobile analytics remains deferred** platform-wide rather than claiming parity

### Leave the record honest

- [X] T132 [P] Add a §027 row set to `docs/audiences/customer-capabilities.md` covering every capability against both customer surfaces (SC-018)
- [X] T133 [P] Update the **Active feature** section of `CLAUDE.md` for 027: what was built, the R8 reversal, the three surfaces, and every open operator item
- [ ] T134 **⚠ operator** Walk the full quickstart §3/§4 tables and sign off SC-001…SC-021, recording anything not walked rather than marking it done
- [ ] T135 **⚠ operator** Commit and open the PR

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup)**: no dependencies. T004 blocks T005–T008.
- **Phase 2 (Foundational)**: depends on Phase 1. **Blocks every user story.** Inside it,
  T009 → T010 → T011 is a hard chain, and T011 (the applied migration) blocks T012–T029.
- **Phase 3 (US1)** → **Phase 4 (US2)** → **Phase 5 (US3)**: sequential. Each builds directly on the
  store the previous one created; this is real coupling, not process.
- **Phase 6 (US4)** depends on Phase 4 (the coordinator exists before it is made clever).
- **Phase 7 (US5)**, **Phase 8 (US6)**, **Phase 9 (US7)**: independent of each other, all depend on
  Phase 4.
- **Phase 10 (US10)** is independent of every client phase and depends only on Phase 2. **Do it before
  Phase 11** — US8 cannot be verified without codes an operator created (T104 feeds T117).
- **Phase 11 (US8)** depends on Phase 10 for verification and on Phase 2 for the cart service.
- **Phase 12 (US9)** depends on Phase 2 (`cartpolicy`) and Phase 10 (an operator can set the minimum).
- **Phase 13 (Polish)**: depends on everything shipped.

### Deliberate honesty about independence

The template's ideal is fully independent stories. Three of these are not, and pretending otherwise
would produce tasks that cannot be executed: **US1 → US2 → US3 share one store**, and US2's coordinator
is US4's subject. They are still independently *testable* and each is a shippable increment — that is the
property that matters — but they must be built in order.

### Parallel opportunities

- Phase 1: T002, T003, T005, T006 in parallel after T004 lands.
- Phase 2: T012 with T030/T033/T034; the Go write-side chain T013→T014→T015→T016→T017 is sequential
  because it is one file.
- Phase 3+: within each story the mobile and web halves are independent — mobile T035–T041 alongside web
  T042–T043, mobile T061–T066 alongside web T067–T069, and so on.
- Phase 10 can run in full parallel with Phases 3–9 (different services, different surface).

### Parallel example: User Story 1

```bash
# Mobile and web halves have no shared file:
Task: "T035 Create MOBILE/features/cart/data/CartLocalStore.kt"
Task: "T042 Extend apps/customer-web/lib/cart-store.ts"

# Then their tests, also in parallel:
Task: "T036 Add CartLocalStoreTest.kt"
Task: "T043 Extend apps/customer-web/lib/cart-store.test.ts"
```

---

## Implementation Strategy

### MVP (Phases 1–3)

Setup → Foundational → US1. That lands **the defect that motivated the slice**: a cart that survives a
force-quit and a device restart, on three platforms, showing current prices. Stop and validate here
(T046). It is worth shipping alone.

### The P1 increment (Phases 1–5)

Adding US2 and US3 makes the cart account-level and lossless across sign-in — the three P1 stories. This
is the natural landing point if anything later slips, and the plan's phasing was chosen so that it stands
without the promotions half.

### Then, in order of decreasing risk-adjusted value

1. **US4** (Phase 6) — responsiveness and offline tolerance; the most-felt improvement per line of code.
2. **US5** (Phase 7) — honesty; closes the worst surprise in the current product.
3. **US6** (Phase 8) — save-aside and clear.
4. **US7** (Phase 9) — reorder.
5. **US10 → US8 → US9** (Phases 10–12) — the commercial half, in that order, because promotions must be
   creatable before they can be tested and the minimum must be settable before it can be enforced.

### Notes

- `[P]` means different files and no dependency on incomplete work.
- Commit after each task or logical group; the migration must be committed **before** `make db-up`.
- Every **⚠ operator** task is a stop: Claude does not run migrations, deployments, or device builds.
- Stop at any checkpoint and validate that story on its own before moving on.

---
description: "Task list for 033-customer-saved-items"
---

# Tasks: Customer Saved Items — Watchlist, Guest Saving & Zone-Aware Purchasability

**Input**: Design documents from `/specs/033-customer-saved-items/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/saved-items.contract.md),
[quickstart.md](quickstart.md)

**Tests**: **Included, and non-negotiable.** SC-014 exists because the capability being replaced has
**zero automated tests on any surface** — no Go test, no `commonTest`, no Vitest, no Playwright —
despite 019's tasks claiming "+ tests" for them. The test tasks below are the evidence for SC-014, not
optional polish.

**Organization**: by user story, so each is independently shippable. Phase 2 is unusually large
because this is a **replacement**: the predecessor must be gone, and the shared purchasability
predicate must be proven, before any new behaviour is built on top.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelisable (different files, no dependency on an incomplete task)
- **[Story]**: US1…US6 per [spec.md](spec.md); Setup / Foundational / Polish carry no story label

## Path conventions

- Hot path: `apis/core-api/internal/…`
- Shared contracts: `packages/shared-types/…`
- Web: `apps/customer-web/…`
- Mobile: `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/…`
  (abbreviated below as `…/mobile/…`)

---

## Phase 1: Setup

**Purpose**: create the migration and capture the pre-change baselines that later gates compare against.

- [X] T001 Run `make db-new name=customer_saved_items` to create the Goose-stamped migration file under `db/migrations/` (never hand-name or renumber it)
- [X] T002 Write the Up section in the new `db/migrations/*_customer_saved_items.sql`: `CREATE TABLE public.customer_saved_item` with composite PK `(customer_id, product_id)`, `saved_price_amount numeric(12,2)`, `saved_currency`, writable `saved_at`, both timestamps, per [data-model.md](data-model.md)
- [X] T003 Add `COMMENT ON` for the table and every column in the same migration, including the `-- ⚠` note that `public.cart_saved_item` is a **different** table owned by the cart (027) and is not touched
- [X] T004 Add `CREATE INDEX customer_saved_item_customer_idx (customer_id, saved_at DESC)` and `customer_saved_item_product_idx (product_id)` to the migration
- [X] T005 Add `DROP TABLE IF EXISTS public.customer_favorite;` to the Up section, with a header comment stating FR-005 (saved data is not carried forward) and why (no save-time price to migrate)
- [X] T006 Write the Down section (`DROP TABLE IF EXISTS public.customer_saved_item`) with a header stating it is **honestly lossy**, per `db/README.md`'s forward-only rule
- [X] T007 [P] Record the pre-feature guest bundle baseline into [quickstart.md](quickstart.md) §2: run `pnpm --filter @effy/customer-web build && make cw-size` on a clean tree and fill the "baseline" row
- [ ] T008 [P] Record the pre-migration row counts for `customer_favorite` and `cart_saved_item` (quickstart §0) so the blast radius is known before anything is applied

---

## Phase 2: Foundational (BLOCKING PREREQUISITES)

**⚠ CRITICAL**: no user story work begins until this phase is complete. It has three parts, in order:
remove the predecessor, prove the shared predicate, then land the contract.

### 2a — Remove the predecessor entirely (FR-001, FR-002, FR-004)

**Goal**: the old capability is unreachable and the tree is green **with nothing in its place**. Doing
this first means no new code is written against a half-removed model.

- [X] T009 Delete `apis/core-api/internal/features/favorites/` (both `favorites.go` and `handler.go`)
- [X] T010 Remove the favorites import, the `favorites *favorites.Service` field, its construction, and the `favorites.Register(...)` line from `apis/core-api/cmd/core-api/main.go`
- [X] T011 [P] Delete `packages/shared-types/src/favorite.ts` and its `export * from "./favorite"` line in `packages/shared-types/src/index.ts`
- [X] T012 [P] Remove `FavoriteDTO` from the import block, the re-export block, and the `favorite:` aggregator field in `packages/shared-types/src/customer-commerce-contract.ts`
- [X] T013 Run `make cm-contract-gen` and commit the regenerated `contract/commerce-schema.json` and `contract/CommerceDto.kt` with `FavoriteDTO` gone
- [X] T014 [P] Delete `apps/customer-web/app/(account)/favorites/` (both `page.tsx` and `FavoritesList.tsx`)
- [X] T015 [P] Delete `apps/customer-web/app/api/favorites/` including the `[productId]/route.ts` handler
- [X] T016 [P] Delete `apps/customer-web/app/(shop)/_components/FavoriteButton.tsx` and remove its import and `<FavoriteButton />` usage from `apps/customer-web/app/(shop)/product/[id]/page.tsx`
- [X] T017 [P] Remove `"/favorites/:path*"` from the matcher in `apps/customer-web/proxy.ts`
- [X] T018 [P] Remove the `product_favorited` variant from the `StorefrontEvent` union in `apps/customer-web/lib/telemetry.ts` and its row from `docs/telemetry/commerce-events.md` — it was declared, documented as shipped, and **fired by nothing** (FR-002)
- [X] T019 [P] Delete `…/mobile/features/favorites/` (domain, data, and presentation)
- [X] T020 Remove the favorites repository field and the `saveFavorite`/`removeFavorite`/`listFavorites` use cases from `…/mobile/app/AppContainer.kt`
- [X] T021 Remove `CustomerNavKey.Favorites` from **all four** places or it breaks on iOS only: the declaration, the `customerNavSavedState` polymorphic module, `ALL_CUSTOMER_ROUTES` in `…/mobile/core/nav/CustomerNavKey.kt`, and the hard-coded route count in `…/commonTest/…/app/ScreenInventoryTest.kt`
- [X] T022 Remove the `entry<CustomerNavKey.Favorites>` block and the `onFavorites` guest gate from `…/mobile/app/CustomerShell.kt`
- [X] T023 [P] Remove the "Saved items" `HeaderAction` from `DiscoverHeader` in `…/mobile/features/catalog/presentation/HomeScreen.kt`
- [X] T024 [P] Remove the "Saved items" `EffyNavRow` from `…/mobile/features/account/presentation/AccountScreens.kt`
- [X] T025 Remove the favourite toggle wiring from `…/mobile/features/catalog/presentation/ProductDetailViewModel.kt` (`_favoriteSaved`, `toggleFavorite`, ctor params) and `ProductDetailScreen.kt` (the `OutlinedButton` and its state)
- [X] T026 **Checkpoint — green with the capability absent**: `make core-lint`, `make core-test`, `pnpm -r typecheck` (count 12/12), `pnpm -r test`, `make cm-guard`, `make cm-contract-check`, and both mobile builds all pass with nothing in place of favourites

### 2b — The shared purchasability predicate (R2) — the correctness foundation

**⚠ This changes existing storefront behaviour.** It is proven in isolation, before anything depends
on it, with checkout's suite passing **unmodified**.

- [X] T027 Write `apis/core-api/internal/platform/delivery/purchasable.go` implementing the four-term predicate (destination zone ∧ origin zone ∧ active `delivery_offering` on the leg ∧ active `delivery_pricing_rule` for the method), with a header comment explaining why it lives in `platform/` and not in either feature — the same reasoning as `zone.go:12-29`
- [X] T028 Document in that header what is deliberately **not** a term and why: `shop.status` (nothing in the hot path reads it; adding it would make this stricter than checkout), `shop_sameday_declaration` (standard delivery is unaffected), `delivery_area_decision` (already reflected in zone membership)
- [X] T029 Write `apis/core-api/internal/platform/delivery/purchasable_test.go` as a container-backed test (`testcontainers` `postgres:16-alpine`, gated by `if testing.Short() { t.Skip }`), hand-writing the minimal schema for just the tables the predicate spans, following `storefront/locality_coverage_test.go`
- [X] T030 Add the **must-be-able-to-fail** case to `purchasable_test.go`: a fixture where the predicate returns false, so the test is proven capable of failing rather than vacuously green
- [X] T031 Repoint `Serviceable()` in `apis/core-api/internal/features/storefront/repository.go` at the new predicate, and **correct the stale comment at `:322-327`** which claims the storefront and checkout "cannot drift apart" — they already had, by three terms
- [X] T032 Assert **both directions** in `purchasable_test.go`: a postcode in a zone with no active inbound offering answers false (3350/3550 today), and a postcode with a real offering answers true (3121) — only the second proves it did not over-correct
- [X] T033 **Checkpoint — checkout is untouched**: run `cd apis/core-api && go test ./internal/features/checkout/...` and confirm it passes **unmodified**. Any edit needed there means the predicate diverged from what checkout already enforces

### 2c — The shared contract (R17)

- [X] T034 Create `packages/shared-types/src/saved-item.ts` with `SavedVerdict`, `SavedItemDTO`, `SavedMembershipDTO`, `SavedMergeRequest`, `SavedMergeItem`, `SavedMergeResultDTO`, `SavedSkip`, `SavedAddToCartRequest`, `SavedAddToCartResultDTO` per [contracts/saved-items.contract.md](contracts/saved-items.contract.md)
- [X] T035 Use `WireInt` (imported from `./cart`, **never redeclared**) for `SavedMembershipDTO.count` and `SavedMergeResultDTO.added` — a plain `number` generates a Kotlin `Double`, emits `1.0`, and Go's `encoding/json` refuses it (027 R13)
- [X] T036 Add `export * from "./saved-item"` to `packages/shared-types/src/index.ts`
- [X] T037 Register every new type in **all three** places in `packages/shared-types/src/customer-commerce-contract.ts` — the `import type` block, the `export type` re-export, **and a field on the `CustomerCommerceContract` interface** — or it generates zero times and the drift check passes trivially (030 T022a)
- [X] T038 Run `make cm-contract-gen` and commit both regenerated artifacts
- [X] T039 Run the **named type census** from quickstart §1b: grep `packages/shared-types/contract/CommerceDto.kt` for each new type by name and confirm every one prints `1`. `cm-contract-check` cannot catch a type that is missing from both files

**Checkpoint**: predecessor gone, predicate proven, contract generated. User stories may begin.

---

## Phase 3: User Story 1 — Save a product and have it stay saved (Priority: P1) 🎯 MVP

**Goal**: a shopper can save and un-save from product detail and from tiles, and **every control shows
the truth on first render** without interaction. A saved list exists and is correct.

**Independent Test**: save a product on one surface, fully close and reopen, reach it by a different
route, confirm the control shows *saved* on first render. Then un-save and confirm across surfaces.

### Tests for User Story 1 ⚠ write first

- [X] T040 [P] [US1] Write `apis/core-api/internal/features/saveditems/service_test.go` with a hand-rolled fake over the `Reader` seam (no DB, no mocks) covering save idempotency, un-save idempotency, and malformed/absent product ids
- [X] T041 [P] [US1] Write `apis/core-api/internal/features/saveditems/repository_test.go` (container-backed, `-short` gated) proving `ON CONFLICT DO NOTHING` leaves the row untouched and `DELETE` of an absent membership is a no-op
- [X] T042 [P] [US1] Write `apis/core-api/internal/features/saveditems/wire_contract_test.go` pinning the **exact bytes** of a real `SavedItemDTO` response — copy the literal from an actual response body, not from the struct (029's `banner_test.go` asserted the defect by doing the latter)
- [X] T043 [P] [US1] Write `…/commonTest/…/features/saved/SavedWireContractTest.kt` with the **byte-identical** JSON literal duplicated by hand, proving Kotlin decodes Go's bytes and **emits an integer, not `2.0`**
- [X] T044 [P] [US1] Write `…/commonTest/…/features/saved/SavedStoreTest.kt` covering optimistic toggle, revert on failure, and last-intent-wins under rapid repeated toggling
- [X] T045 [P] [US1] Write `apps/customer-web/lib/saved-store.test.ts` covering the versioned envelope, reference-stable empty reads, discard-on-version-mismatch, and cross-tab `storage` events

### Backend (hot path)

- [X] T046 [US1] Create `apis/core-api/internal/features/saveditems/repository.go` — SQL only, row structs never leaving the file: the membership read (`SELECT product_id … WHERE customer_id = $1`), the ordered list read, `INSERT … ON CONFLICT DO NOTHING` accepting an optional `saved_at`, and `DELETE`
- [X] T047 [US1] Create `apis/core-api/internal/features/saveditems/service.go` — business shaping only, no HTTP and no SQL; depends on the `media.Presigner` **interface**, and swallows a failed presign rather than blanking the read
- [X] T048 [US1] Create `apis/core-api/internal/features/saveditems/handler.go` — HTTP only, mapping domain → wire DTO, with sentinel errors resolved by `errors.Is` and mapped through `httpx`
- [X] T049 [US1] Implement `GET /v1/saved/ids` in the handler returning `SavedMembershipDTO`, with **no** `Cache-Control` header (per-shopper, must never reach a shared cache)
- [X] T050 [US1] Implement `PUT /v1/saved/{productId}` → `204`, `404` for a non-existent product, accepting the optional `{ "restoreSavedAt": … }` body
- [X] T051 [US1] Implement `DELETE /v1/saved/{productId}` → **always `204`**, never `404` — deleting an absent membership is a no-op, and a `404` would make a retried delete look like a failure
- [X] T052 [US1] Create `apis/core-api/internal/features/saveditems/register.go` mounting the group behind `auth.Middleware(verifier)` then `customeridentity.Middleware(identity)`, **in that order**
- [X] T053 [US1] Read the customer from `customeridentity.FromContext(...)` in every handler — **never** from a request parameter or body
- [X] T054 [US1] Wire the service into `apis/core-api/cmd/core-api/main.go`: one field on `dependencies`, one construction line, one `saveditems.Register(...)` line

### Mobile

- [X] T055 [P] [US1] Create `…/mobile/features/saved/domain/Saved.kt` — the `SavedItem` model, the `SavedRepository` interface, and the `SavedVerdict` enum mapped from the contract
- [X] T056 [US1] Create `…/mobile/features/saved/domain/SavedStore.kt` — the observable set of saved product ids with an optimistic `toggle` that reverts on failure, following `CartStore`'s single-source model (the queue is projected into state, never joined in the presentation layer)
- [X] T057 [US1] Create `…/mobile/features/saved/domain/SavedUseCases.kt` — `SaveProduct`, `UnsaveProduct`, `ListSaved`, `LoadMembership`, each applying to the store **first** and submitting **second**, in that order always
- [X] T058 [US1] Create `…/mobile/features/saved/data/HttpSavedRepository.kt` on `coreClient` (`BearerToken.Core`), funnelling errors through `AppException` with `AppError.NotFound` for 404
- [X] T059 [US1] Add an optional `saveControl: (@Composable BoxScope.() -> Unit)? = null` slot to `EffyProductCard`'s existing image `Box` in `…/mobile/core/presentation/StorefrontKit.kt`, defaulting to `null` so all existing call sites are unchanged
- [X] T060 [US1] Create the save control composable using `Res.drawable.ic_favorite_outlined` / `ic_favorite_selected` — **never** `Text("♥` or `Text("♡`, which `scripts/mobile-guard.sh:106` fails the build on
- [X] T061 [US1] Verify the control's own `clickable` consumes the tap and does **not** also trigger the card's outer navigation, and that the 0.97 press scale on the outer `Column` does not distort it
- [X] T062 [US1] Create `…/mobile/features/saved/presentation/SavedViewModel.kt` exposing a single immutable observable UI-state object (Loading / Ready / Error), per Principle VI's MVVM rule
- [X] T063 [US1] Create `…/mobile/features/saved/presentation/SavedScreen.kt` using `EffyAppBar`, `EffyPullToRefresh`, `EffyEmptyState` and `EffyProductCard` with the new slot
- [X] T064 [US1] Add `CustomerNavKey.Saved` in **all four** places: the declaration, the `customerNavSavedState` polymorphic module, `ALL_CUSTOMER_ROUTES`, and the hard-coded count in `ScreenInventoryTest.kt` — missing the second breaks on iOS only, after process death
- [X] T065 [US1] Register the `entry<CustomerNavKey.Saved>` block in `…/mobile/app/CustomerShell.kt` and add the Account-tab `EffyNavRow` plus the Discover header action, so `mobile-guard.sh`'s reachability check passes (an entry is the destination, not the way in)
- [X] T066 [US1] Wire the repository, store and use cases into `…/mobile/app/AppContainer.kt`
- [X] T067 [US1] Seed `ProductDetailViewModel` from the membership store so the product-detail control shows the **real** state on first render, replacing the predecessor's hard-coded `MutableStateFlow(false)`

### Web — ⚠ reclaim before spend (R5)

- [X] T068 [US1] Measure and record the current six-route bundle table (quickstart §2) before touching anything on the web surface
- [X] T069 [US1] Reclaim bytes on `/search` by deferring the refinement/filter portion of `apps/customer-web/app/(shop)/_components/SearchExperience.tsx` behind an interaction gate, following `DeliveryAffordance.tsx`'s pattern — **and drop any `loading:` fallback**, which is JSX paid for on every route
- [X] T070 [US1] **Gate**: re-run `pnpm --filter @effy/customer-web build && make cw-size` and confirm `/search` headroom **increased**. 030 measured a `next/dynamic` split making every route *worse*; if this did not free bytes, iterate here before proceeding
- [X] T071 [US1] Create `apps/customer-web/lib/saved-store.ts` — key `effy:saved:v1`, versioned envelope, `useSyncExternalStore`, frozen reference-stable empty value, every failure yielding empty rather than throwing, cross-tab `storage` listener. Zero dependencies
- [X] T072 [US1] Create `apps/customer-web/lib/saved-api.ts` — `fetch` only, through the route handlers, so no client module ever imports `aws-amplify`
- [X] T073 [US1] Create `apps/customer-web/lib/saved-actions.ts` — apply to the mirror synchronously, then send; a `401` means "you are a guest" and is a normal state, not a failure
- [X] T074 [US1] Create the `apps/customer-web/app/api/saved/` route handlers using `proxyToCore` (not the predecessor's hand-rolled `forward`), for `ids`, `[productId]` PUT/DELETE
- [X] T075 [US1] Create `apps/customer-web/app/(shop)/_components/SaveControl.tsx` as a small client island — **not** a hook inside `ProductCard`, which would make the card a client component everywhere including inside the server-rendered `RelatedProducts`
- [X] T076 [US1] Restructure `apps/customer-web/app/(shop)/_components/ProductCard.tsx` so the control is not nested inside the card's `<Link>` — a `<button>` inside an `<a>` is invalid HTML and produces hydration warnings; use a stretched-link overlay or a sibling
- [X] T077 [US1] Render `SaveControl` on the product detail page in `apps/customer-web/app/(shop)/product/[id]/page.tsx`
- [X] T078 [US1] Create `apps/customer-web/app/(account)/saved/page.tsx` and its list component, reading via `coreApi(session.accessToken)` with `uncached()` behind `requireCustomer("/saved")`
- [X] T079 [US1] **Gate**: re-run `make cw-size` and confirm all six routes are under 174 KB with the control landed. ⚠ Do **not** raise `GUEST_LIMIT` — reduce presentation instead
- [X] T080 [US1] Run `make cw-depcruise` and confirm the Amplify quarantine and the heavy-UI ban are both clean with the new modules in place

### Accessibility (FR-058)

- [X] T081 [P] [US1] Make the web control a real `<button>` whose **accessible name does not change** when state flips, carrying state in `aria-pressed` only — the predecessor swapped `aria-label` *and* set `aria-pressed`, which double-announces
- [X] T082 [P] [US1] Give the mobile control toggle semantics with a stable `contentDescription` and a separate selected state, matching the same rule

**Checkpoint**: US1 is fully functional. The heart tells the truth on every surface.

---

## Phase 4: User Story 2 — Know what changed since I saved it (Priority: P2)

**Goal**: the list states purchasability as one of five outcomes against the shopper's current delivery
location, and surfaces a price drop against the price at save time.

**Independent Test**: seed one product in each of the five outcomes and confirm the list distinguishes
all five in shopper-readable language; drop a saved product's price and confirm the drop appears.

### Tests for User Story 2 ⚠ write first

- [X] T083 [P] [US2] Extend `saveditems/repository_test.go` (container-backed) with a fixture per verdict, asserting the correct value for each of the five outcomes
- [X] T084 [P] [US2] Assert the **evaluation order** in the same test: an `archived` product reads `no_longer_sold` even with no destination postcode, and an absent postcode otherwise reads `not_yet_determined`
- [X] T085 [P] [US2] Extend `saveditems/service_test.go` with price-movement cases: lower → `priceDropped`, equal → absent, higher → absent, and a currency change → no drop reported
- [X] T086 [P] [US2] Write `apps/customer-web/lib/saved-display.test.ts` mapping each verdict to its shopper-facing copy and to whether the item is addable

### Backend

- [X] T087 [US2] Implement the single-statement verdict read in `saveditems/repository.go` — the `CASE` over `product.status` and the R2 predicate, with `LEFT JOIN LATERAL` for the primary image, per [data-model.md](data-model.md)
- [X] T088 [US2] Order the `CASE` so `archived` is tested **before** the destination test and `not_yet_determined` before the status distinctions — the more informative true statement wins
- [X] T089 [US2] Implement `GET /v1/saved?postcode=` in the handler, treating an absent `postcode` as first-class (every item `not_yet_determined`, FR-038) and a malformed one as `400 invalid_postcode` matching `/v1/storefront/serviceability`'s bare-`{"error":…}` convention
- [X] T090 [US2] Normalise the postcode through `delivery.NormalizePostcode` rather than validating shape locally
- [X] T091 [US2] Return money as `numeric(12,2)::text` and convert through the `money` package — never a float
- [X] T092 [US2] Record `saved_price_amount` and `saved_currency` at save time in the `PUT` path, and compute `priceDropped` in the service by comparing against the live price (currency must match)
- [X] T093 [US2] Emit **no** field for a price rise (FR-044) — the current price is always shown, so nothing is concealed, and a rise is not actionable
- [X] T094 [US2] **Performance check**: verify the full list read for a 200-item list is a single statement, and confirm SC-006 (2 s) locally against seeded data. At ~135 ms per Sydney round trip a per-item query is not viable

### Presentation

- [X] T095 [P] [US2] Render the five outcomes in distinct language on `apps/customer-web/app/(account)/saved/`, with a route to change delivery location on `not_delivered_to_your_area` (FR-040)
- [X] T096 [P] [US2] Render the same five outcomes in `…/mobile/features/saved/presentation/SavedScreen.kt`, reusing the delivery sheet as the location-change route
- [X] T097 [P] [US2] Show the price drop on both surfaces as current price plus what it was when saved (FR-043)
- [X] T098 [US2] Keep an `archived` product **visible and marked** rather than removing it (FR-041), on both surfaces
- [X] T099 [US2] Re-decide every verdict when the shopper changes delivery location (FR-039), on both surfaces
- [X] T100 [US2] Pass the current delivery location from each surface's existing delivery context into the list read

**Checkpoint**: the list is truthful about what the shopper can buy and what has changed.

---

## Phase 5: User Story 3 — Save without an account, and keep them when I sign in (Priority: P2)

**Goal**: a guest can save with no sign-in prompt, their saves survive a reload/restart, and they join
the account by an idempotent union on sign-in, disclosed by count.

**Independent Test**: save several products signed out, reload, sign in to an account that already has
saved items including an overlap, confirm the union with nothing lost or duplicated. Repeat to prove
idempotency.

### Tests for User Story 3 ⚠ write first

- [X] T101 [P] [US3] Extend `saveditems/service_test.go` with merge cases: union, overlap keeps the **original** `saved_at` and `saved_price_amount`, running twice is identical, and an unresolvable product id is skipped rather than failing the whole merge
- [X] T102 [P] [US3] Write `…/commonTest/…/features/saved/SavedLocalStoreTest.kt` using `InMemoryDevicePreferences`, covering round-trip, version-mismatch discard, and a truncated blob yielding empty rather than crashing
- [X] T103 [P] [US3] Extend `apps/customer-web/lib/saved-store.test.ts` with guest-cap refusal and the merge-then-clear ordering
- [ ] T104 [P] [US3] Write `apps/customer-web/e2e/saved.spec.ts` covering guest save without a sign-in prompt, persistence across reload, and the join on sign-in (Playwright, against a production build)

### Backend

- [X] T105 [US3] Implement `POST /v1/saved/merge` in `saveditems/` — set union inside one transaction, preserving existing rows' original `saved_at` and `saved_price_amount`
- [X] T106 [US3] Return `added`, the resulting `productIds`, and a `skipped[]` naming anything that did not fit, so the client seeds its store from the response rather than issuing a second read
- [X] T107 [US3] Skip an unresolvable `productId` with `reason: "not_found"` — a merge must never fail wholesale because one product went away

### Mobile

- [X] T108 [US3] Add a `PreferenceKeys` entry for the guest saved list in `…/mobile/core/storage/DevicePreferences.kt`
- [X] T109 [US3] **Amend the doctrine comment** in the same file: it currently states `CART_MIRROR` and `CART_QUEUE` are *"the only entries admitted"* under 027's mirror amendment. Show that the guest saved list meets all three criteria — reconciled and discarded when the platform disagrees, never an input to an authorization or pricing decision, and holding no more than the shopper could already see
- [X] T110 [US3] Create `…/mobile/features/saved/data/SavedLocalStore.kt` structurally on `CartLocalStore`: versioned envelope, `SCHEMA_VERSION` that **discards rather than migrates**, defensive decode, `runCatching` writes
- [X] T111 [US3] Hydrate `SavedStore` from disk at construction — before the first frame — and persist on every edit, **without** a sign-in check, matching `CartStore.persistSoon()`
- [X] T112 [US3] Remove the guest gate so tapping the control signed-out saves locally instead of calling `requireSignIn()` (FR-024)
- [X] T113 [US3] Add `MergeSavedOnSignIn` to `SavedUseCases.kt` and wire it into `SessionManager(onAuthenticated = …)` in `AppContainer.kt`, alongside the existing cart merge
- [X] T114 [US3] Clear the device list in `onSignedOut`, so no saved items remain readable on a shared device (FR-031)
- [X] T115 [US3] Store the save-time price in the guest list too — taking the price at merge time would erase the movement the watchlist exists to report

### Web

- [X] T116 [US3] Make the guest path in `saved-actions.ts` write to the local store with no sign-in redirect, replacing the predecessor's `window.location.href = "/sign-in?next=…"`
- [X] T117 [US3] Add `mergeSavedAfterSignIn()` to `saved-actions.ts` — read local, send, adopt the response, and clear the local list **only after** the platform acknowledges
- [X] T118 [US3] Call it from `apps/customer-web/app/(auth)/sign-in/SignInForm.tsx`
- [X] T119 [US3] ⚠ Call it **also** from `apps/customer-web/app/(auth)/callback/CallbackHandler.tsx` — without this the federated (Google) return silently drops the guest list
- [ ] T120 [US3] Clear the local list on sign-out via the existing `/sign-out` route handler path

### Disclosure and caps

- [X] T121 [P] [US3] Disclose the join by count on arrival (FR-032) — the existing zero-dependency `lib/toast-store.ts` on web, a snackbar on mobile. Not a modal: a join only adds and is individually reversible
- [X] T122 [US3] Enforce the 200 account cap **inside the writing transaction** under `FOR UPDATE` (not in the service), refusing via `httpx.ValidationFailedAs` with a distinguishable reason
- [X] T123 [US3] Enforce the 50 guest cap in each client store, refusing with a message and evicting nothing
- [X] T124 [US3] Truncate a merge newest-first at the cap and name what did not fit (FR-048) — **never** evict an existing saved item
- [X] T125 [P] [US3] State on both surfaces that guest saves are device-held and not available on other devices (FR-027)

**Checkpoint**: interest is captured the moment it occurs, and never lost at sign-in.

---

## Phase 6: User Story 4 — Act on the list (Priority: P3)

**Goal**: add one saved item to the cart, or every purchasable one at once — with nothing ever
silently omitted.

**Independent Test**: with a mixed list, bulk-add and confirm the cart holds exactly the purchasable
items and the shopper was shown an itemised account of the rest.

### Tests for User Story 4 ⚠ write first

- [X] T126 [P] [US4] Extend `saveditems/service_test.go` with bulk-add cases: all purchasable, mixed, none purchasable, and a cart-refused item reported with the cart's own reason
- [X] T127 [P] [US4] Assert that adding to the cart does **not** remove the item from the saved list (FR-050)

### Implementation

- [X] T128 [US4] Implement `POST /v1/saved/add-to-cart` in `saveditems/` — the **server** decides purchasability, so a client cannot re-implement the predicate and drift from it
- [X] T129 [US4] Return `added[]` and `skipped[{productId, reason}]` using the verdict vocabulary, so every omission carries a reason (FR-052)
- [X] T130 [US4] Return `200` with an empty `added` when nothing is purchasable — nothing was wrong with the request, so this is not a `422`
- [X] T131 [US4] Respect the cart's own limits and rules, reporting a cart refusal with the cart's reason
- [X] T132 [P] [US4] Wire single add-to-cart and bulk add on `apps/customer-web/app/(account)/saved/`, rendering the itemised skip list
- [X] T133 [P] [US4] Wire the same on `…/mobile/features/saved/presentation/SavedScreen.kt`
- [X] T134 [US4] Confirm a barred customer is refused by the cart's existing gate while the list stays readable (FR-053)

### FR-008 — the order-line save (⚠ blocked at the contract, R12)

- [X] T135 [US4] Add `productId` to the order-item projection in `apis/core-api/internal/features/orders/` — `public.order_item` already stores it, so this is a projection gap, not a schema change
- [X] T136 [US4] Add `productId` to the order-item DTO in `packages/shared-types/src/order.ts`, run `make cm-contract-gen`, and commit both regenerated artifacts
- [X] T137 [US4] Add `productId` to `ReceiptItem` in `…/mobile/features/checkout/domain/Checkout.kt` and its mapper in `…/mobile/features/checkout/data/CheckoutMappers.kt`
- [X] T138 [US4] Extend the wire contract test (both halves) to pin the new field
- [X] T139 [P] [US4] Render the save control on order-detail lines on both surfaces (`ReceiptScreen.kt` on mobile, the order detail page on web)
- [X] T140 [US4] Handle a product id on a past order that no longer resolves — saving answers `404` and the control reports it rather than appearing to succeed

**Checkpoint**: the watchlist converts into an order without misleading anyone.

---

## Phase 7: User Story 5 — Find my saved items (Priority: P3)

**Goal**: reachable from the account area on every surface, discoverable from the storefront, usable
when long, with two genuinely different empty states.

**Independent Test**: five people unfamiliar with the product find Saved items from the account area on
each surface, unaided.

- [X] T141 [P] [US5] Add "Saved items" to the account nav in `apps/customer-web/app/(account)/layout.tsx` — ⚠ it currently lists only Browse / Orders / Account, and `/addresses` is missing too
- [X] T142 [P] [US5] Repoint the "Saved items" footer link in `apps/customer-web/app/(shop)/_components/StorefrontFooter.tsx` from `/favorites` to the new route
- [X] T143 [P] [US5] Add a storefront entry point that does not require scrolling to the footer — the zero-JS `components/header/AccountMenu.tsx` `<details>` dropdown is free (FR-055)
- [X] T144 [US5] Ensure `/favorites` resolves to the new surface rather than 404-ing, for anyone holding a bookmark (FR-004)
- [X] T145 [P] [US5] Implement client-side grouping by category and ordering (most-recently-saved, purchasable-first) on both surfaces — the set is capped and already in memory, so a server round trip per sort would be latency for nothing (FR-056)
- [X] T146 [P] [US5] Implement the two distinct empty states on both surfaces: "you have never saved anything" and "you have saved items but none can be delivered where you are", the second offering a location change (FR-057)

**Checkpoint**: a correct list that people can actually find.

---

## Phase 8: User Story 6 — Measurement (Priority: P3) ⚠ CUTTABLE

**Goal**: the declared events actually reach PostHog, so save rate and save-to-cart are reportable.

**⚠ Read before starting.** PostHog has **never been initialised** on customer-web — a repo-wide grep
for `initAnalytics|setConsent|identifyCustomer|resetIdentity` finds zero non-test call sites and there
is no consent banner. `capture()` has always been a no-op. **This is a platform-wide gap this feature
inherits, not one it creates.**

**If this phase is cut**: FR-060 is met *structurally only*, and **SC-012 and SC-013 are unmeasurable
and must be recorded as such in the sign-off** — not claimed.

- [ ] T147 [P] [US6] Add the seven new events to the `StorefrontEvent` union in `apps/customer-web/lib/telemetry.ts` **first**, never inlining a string at a call site: `product_saved`, `product_unsaved`, `saved_list_viewed`, `saved_item_added_to_cart`, `saved_bulk_add`, `saved_guest_merged`, `saved_cap_reached`
- [ ] T148 [US6] Emit them from the web call sites using a **dynamic** import (`void import("@/lib/telemetry").then(…)`) — a static import from a cart client component cost +1.0 KB on four guest routes in 027
- [ ] T149 [US6] Keep `surface` a closed enum of placement names, never a URL, and carry no PII beyond the auth subject id
- [ ] T150 [US6] Build a minimal consent affordance calling `setConsent`/`initAnalytics`, so `capture()` stops being a no-op
- [ ] T151 [US6] **Gate**: re-run `make cw-size` — the consent affordance competes for the same headroom the save control just spent
- [ ] T152 [P] [US6] Update `docs/telemetry/commerce-events.md` with the new events, and state that **mobile telemetry remains deferred — the twelfth consecutive slice** rather than claiming parity

**Checkpoint**: the feature's central bet (guest saving increases saving) becomes testable rather than assumed.

---

## Phase 9: Polish & Cross-Cutting

- [X] T153 [P] Add SC-014 coverage confirmation: a short table in the sign-off naming the test file for each of save · un-save · idempotency both ways · join · cap refusal · all five verdicts
- [X] T154 [P] Add a `## §033` section to `docs/audiences/customer-capabilities.md` using **Format B** (4 columns, no row number), the ✅/⏸/⬜/—/🔒 vocabulary, a `**Path (Principle III):**` note, a `**Telemetry (Principle VII):**` note, a `**Bundle:**` line with measured KB, a `**Data**:` note, and a `**Carry-forwards**:` closer
- [X] T155 [P] Add the matching slice block to `CLAUDE.md`, linking to the `§033` anchor
- [X] T156 [P] Record the carry-forwards honestly: `shop.status` unread by the hot path; no metrics emission path in this feature area; mobile telemetry deferred a twelfth slice; `core-api` still has no cloud deploy; the three stale "no key-value persistence" comments in `DeliveryContextStore.kt`, `AppContainer.kt` and 030's research
- [X] T157 Run the full machine sweep from quickstart §1 and confirm every gate green, **counting reporting packages** (029: `pnpm -r test` was green while `typecheck` failed — vitest does not run `tsc`)
- [X] T158 Fill the three-point bundle table in quickstart §2 and confirm `GUEST_LIMIT` is still `174`

---

## Phase 10: Operator walks (OPERATOR — Claude does not run these)

**⚠ Every task below is a live walk. A capability verified only by grep is verified only by grep.**

- [ ] T159 **OPERATOR** ⚠ Read quickstart §0 and confirm the blast radius, then commit the migration and run `make db-up ENV=dev` — this **drops `customer_favorite`** and deletes every saved item under the old capability
- [ ] T160 **OPERATOR** Run `make core-run` and walk quickstart §4a on both surfaces — the heart tells the truth (SC-001, SC-002)
- [ ] T161 **OPERATOR** Walk §4b with one product seeded in each of the five outcomes, including the **five-observer test** that each message implies the right next action (SC-007)
- [ ] T162 **OPERATOR** ⚠ Walk §4c by `curl`: confirm `3350` now answers `serviced:false` **and** `3121` still answers `true`. Only the second proves it did not over-correct
- [ ] T163 **OPERATOR** Walk §4d including the **federated** sign-in path, 20 joins, zero lost/duplicated/evicted (SC-008)
- [ ] T164 **OPERATOR** Walk §4e — cap refusal by `curl` **not only the UI**, and a bulk add that omits nothing silently (SC-010)
- [ ] T165 **OPERATOR** Walk §4f — undo restores position, a fresh re-save goes to the top
- [ ] T166 **OPERATOR** ⚠ Walk §4g — the **five-observer** colour-free test with a screen reader and largest text size, light and dark (SC-009). The brand has no hue, so this is a real risk, not a formality
- [ ] T167 **OPERATOR** Walk §4h — 5/5 people find it unaided on both surfaces (SC-011)
- [ ] T168 **OPERATOR** ⚠ Walk §4i — prove the cart's save-for-later is untouched and its suite passes **unmodified** (SC-015, FR-003)
- [ ] T169 **OPERATOR** ⚠ Force-quit mobile with guest saves and relaunch — 030's exact trap was a store built with a no-op `persist`, so this must be observed, not assumed (FR-025)
- [ ] T170 **OPERATOR** ⚠ On **iOS**, background the app until the process is killed with the saved screen on the stack, then relaunch — a route missing from `customerNavSavedState` throws here and passes every Android test
- [ ] T171 **OPERATOR** ⚠ **Android has never been looked at** across 028 and 029, both of which recorded that gap. Walk the whole feature on Android
- [ ] T172 **OPERATOR** Fire 10 concurrent `PUT`s at a shopper sitting on 199 saved items and confirm the cap holds — a service-layer count would admit a race
- [ ] T173 **OPERATOR** Sign off against the full SC table and write `specs/033-customer-saved-items/SIGNOFF.md`, recording anything that did not hold rather than omitting it
- [ ] T174 **OPERATOR** Commit the slice

---

## Phase 11: Amendment — the mobile saved list becomes a cart-shaped list (2026-08-02, operator direction)

**⚠ This changes a decision, not a detail.** The mobile list was a two-column product grid (T063,
R18). It is now a **vertical list of detail rows built from the cart's own composition**, with
**pull-to-refresh in every state**. The reasoning is in the amended R18: a catalogue grid answers
"which of these do I want?", and this screen answers "what changed, and can I buy it yet?" — an answer
made entirely of text, which a half-width tile column cannot hold without wrapping.

**⚠ Wiring the row also closed two gaps that were marked complete and were not.** T132/T133 claimed
add-to-cart on both surfaces; the mobile half existed as a use case (`AddAllSavedToCart`) that **no
screen called**. The undo affordance (FR-017/FR-018) was likewise published by `SavedViewModel` and
**rendered by nothing**. Both are now built — recorded here rather than by quietly re-ticking the
original tasks, because a task that was ticked without the work is worth leaving visible.

- [X] T175 Add **FR-068** (refresh on demand, in every state, never clearing what is on screen) to `spec.md` §H, with the reasoning and the "empty and failed are the states a shopper doubts most" note
- [X] T176 Amend **R18** in `research.md` — the decision, why the original was wrong, and the ⚠ consequence that `TileSaveControl` now has no call site
- [X] T177 Amend the `plan.md` Complexity Tracking entry — the card-shaped justification is withdrawn because there is no longer a card-shaped thing on the screen
- [X] T178 Rebuild `…/mobile/features/saved/presentation/SavedScreen.kt` as a `LazyColumn` of `SavedRow`s — 72 dp tinted thumbnail · name · brand · verdict · price stack with the struck-through save-time price · a full-width action line, mirroring `CartRow`'s two-stack composition
- [X] T179 [US1] Put the sort control, the bulk-add button and the bulk report **inside** the list as header items, so a small phone does not spend its first screen on controls
- [X] T180 Make the gesture work in **every** state (FR-068): a content-shaped skeleton list while loading (the old loading state wrapped an empty `Column`, which has nothing to scroll, so the gesture could not fire), and `fillMaxSize` + `Arrangement.Center` inside a `verticalScroll` for the empty and error states — the 027 cart fix, which exists because a plain scrolling column top-aligns
- [X] T181 [US4] Wire **single** add-to-cart (FR-049), leaving the item on the list (FR-050) — ⚠ the mobile half of T132/T133, which was ticked and unbuilt
- [X] T182 [US4] Wire **bulk** add through `container.addAllSavedToCart` + `syncCart()`, rendering the **itemised** skip report with the cart's own refusal vocabulary (FR-052) — mirrors `SavedList.tsx`'s `skipReason`
- [X] T183 Render the **undo** affordance for a removal (FR-017/FR-018) — ⚠ `SavedViewModel.undo` had been published since the slice was built and consumed by nothing, so a mis-tap was unrecoverable
- [X] T184 Verify: `:shared:compileAndroidMain`, `:shared:testAndroidHostTest`, `:shared:compileKotlinIosSimulatorArm64`, `scripts/mobile-guard.sh` — all green
- [X] T184a ⚠ **Fix the iOS test suite, which had never compiled.** Three backtick test names in `SavedWireContractTest.kt` and `SavedStoreTest.kt` contain a **comma**, which Kotlin/Native forbids in a declaration name (`Name contains illegal characters: ","`). The JVM accepts it, so `testAndroidHostTest` was green while `:shared:iosSimulatorArm64Test` **failed to compile** — this slice's mobile verification only ever ran the Kotlin/Native **main** compilation, never its tests. Commas replaced with dashes; **217 iOS tests now run, 0 failures**, matching the Android count exactly
- [X] T185 Update the `§033` parity register and `CLAUDE.md`, including the **downgrade** of the tile-control row: FR-007's tile placement is unbuilt on mobile and the ✅ was optimistic
- [ ] T186 **OPERATOR** Walk the new list on **both** platforms: pull to refresh from the list, the empty state and the error state; confirm a failed refresh keeps the items; add one item, add everything, read the skip report; remove and undo, confirming the item returns to the position it held
- [X] T187 ⚠ **The FR-007 tile gap — closed by wiring, not by amending.** The mobile home/browse/search tiles had never carried a save control, so the only way to save on mobile was product detail, an order line or the saved list

### Phase 11b: FR-007 — the save control on mobile tiles

- [X] T188 Create `…/mobile/features/saved/presentation/SavedTiles.kt` — `rememberSavedTiles(container)` returning a `SavedTiles` holder (membership answer · toggle · a `SnackbarHostState` for refusals), plus the `BoxScope.TileSaveControl(product, tiles)` overload and `SavedTileMessages`. ⚠ ONE place, because the three rules that make a tile heart honest (one read per screen · one shared mirror · a refusal that is said) are each a defect if one screen does them differently
- [X] T189 ⚠ Make the membership read **signed-in only** — a guest's read `401`s, and `LoadSavedMembership` **`adopt()`s** its answer, so an empty answer from a guest would **clear the device list**. The guest's mirror is hydrated from disk in `SavedStore.init` and needs no read
- [X] T190 Add a pass-through `imageOverlay` parameter to `EffyRailTile` in `…/core/presentation/StorefrontKit.kt` — a pass-through, **not** a second placement, or a product in a rail and the same product in the grid would carry the heart in two different spots
- [X] T191 [US1] Wire the control on Home's rails (`SectionBlock` → `EffyRailTile`), threading one `SavedTiles` down from `HomeScreen` so the whole screen costs **one** membership read however many rails it renders
- [X] T192 [US1] Wire the control on `SearchScreen`'s grid — ⚠ this one screen **is** search, browse, category and "see all" (028), so it covers four surfaces at once; mobile keeps it on search too, unlike web (FR-007's amendment is web-only, and there is no bundle to spend here)
- [X] T193 [US1] Render `SavedTileMessages` on both screens, so the **guest cap refusal** (FR-047) is spoken instead of the heart silently flipping back — and a failed save/un-save says so too
- [X] T194 ⚠ **Fix the save control's touch target: it was 32 dp, not 48.** `toggleable` hung on the 24 dp `Icon` with 4 dp of padding, directly beneath a comment claiming it cleared the constitution's 48 dp minimum. Survivable on one detail screen; **load-bearing in the corner of every tile**, where a miss navigates away from the thing being saved. The glyph now sits centred in an `EffyMinTouchTarget` box — 48 dp tappable, 32 dp visible scrim
- [X] T195 Verify: `:shared:compileAndroidMain` · `:shared:testAndroidHostTest` (217/0) · `:shared:iosSimulatorArm64Test` (217/0) · `:androidApp:assembleDebug` · `mobile-guard` — all green
- [ ] T197 **OPERATOR** ⚠ Decide the **"More like this" rail** on product detail: it draws its own bespoke tile instead of `EffyProductCard`, so it is the one mobile product listing with no save control. The fix is to use the shared tile, **not** to give the bespoke one a second heart
- [ ] T196 **OPERATOR** Walk FR-007 on device, both platforms: tap the heart on a Home rail tile and on a search-result tile — ✅ it saves **without** opening the product; ✅ the state is right on **first** render after leaving and returning; ✅ the same product in a rail and in the grid always agree (FR-013); ✅ as a guest, save past 50 and read the refusal
### Phase 11c: the bulk add — the layout, and the reason it never worked (2026-08-02, from a device screenshot)

**⚠ The screenshot that prompted the layout fix also proved the endpoint was a total no-op.** It read
"**0 items added to your cart**" with all three products refused as "couldn't be added right now" —
which a shopper reads as *their products* being the problem, when the request never reached the cart.

- [X] T198 ⚠ **Fix `AddAllToCart`'s per-item change id.** It was `changeID + ":" + productID`, and `public.cart_change_log.change_id` is a **uuid** column — so **every** insert failed with `invalid input syntax for type uuid`, the cart errored on every item, and `cartReason`'s default reported each as `unavailable`. Now a **UUIDv5** derived from a fixed namespace + `changeID + ":" + productID`: still one id per (batch, product), still deterministic, so a retried bulk add is still recognised as a retry rather than charging the shopper twice
- [X] T199 ⚠ **Fix the test that was watching it happen.** `TestAddAllToCart_GivesEachItemItsOwnChangeID` asserted only that the two ids DIFFER — which `"chg:a"` and `"chg:b"` do — because `fakeCart.Add` takes a `string` and accepts anything. **The fixture agreed with the code instead of with the database**, this slice's own recurring lesson (027 R13). It now parses every id as a uuid, and a second test pins determinism across a retry. **Proved by reverting the fix**: the test fails with `change id "chg:a" is not a uuid`
- [X] T200 Move "Add everything available to cart" out of the list and into a **fixed bottom bar** — as the list's first item it scrolled away the moment the shopper started reading, and sat at the top of a phone, furthest from the thumb. The cart pins "Go To Checkout" for the same reasons
- [X] T201 Replace the bulk-result **block** with a **toast** carrying the counts, and move each item's reason onto **the row it concerns** (`SavedRow`'s `skipNote`). FR-052 is still met — nothing is omitted, it is said where it can be acted on — and a transient result no longer holds permanent space above the products
- [X] T202 Say "**Nothing could be added to your cart**" when nothing went in. "0 items added to your cart" is literally true and reads as a bug
- [X] T203 Move the `SnackbarHost` to a bottom **overlay**. As a column child it reserved space at the TOP and pushed the content down when it appeared, which is a banner, not a toast
- [X] T204 Verify: Go build/vet/gofmt · `saveditems` service tests · both mobile suites (217/217) · `assembleDebug` · `mobile-guard`
- [ ] T205 **OPERATOR** ⚠ Re-run the bulk add on device and confirm it **actually adds** — every previous run added nothing. Then open the cart and check the quantities
- [ ] T206 **OPERATOR** ⚠ **`saveditems`' container-backed tests are RED on this branch, and were before any of today's work** — `repository_test.go` seeds `public.delivery_pricing_rule`, which the delivery withdrawal (a478734) dropped. That is **25 tests, including the ones that would have caught T198**, not running. `CLAUDE.md` claims them green; they are not
### Phase 11d: FR-050a — the row says where the item went (eBay's watchlist pattern)

**The question that prompted it**: should adding to the cart remove the item from the saved list? **No**
— and the reasoning is now in FR-050. But keeping it exposed a real hazard: a repeat tap **increments
the quantity**, so a shopper who is not sure the first tap worked ends up with two.

- [X] T207 Add **FR-050a** to `spec.md` §G, and record under FR-050 *why* a watchlist is not consumed by an add (two list genres · grocery re-buying · the save-time baseline the watch is measured against)
- [X] T208 Render the cart state on each row: `cartQuantity == 0` → "Add to cart"; otherwise **"In your cart · View"** / **"N in your cart · View"**, routing to the cart. Read from `container.cart.state` — the cart's own mirror, never a second copy
- [X] T209 ⚠ Make the **bottom bar** answer the same question: when every purchasable item is already in the cart it becomes **"Go to cart"**, because the bulk add is **not** idempotent across taps (each tap is a new batch; only a retry of ONE batch is deduped), so the old label was an invitation to buy two of everything
- [X] T210 `syncCart()` on arrival — the screen now RENDERS from the cart mirror, so a cart filled on another device would otherwise offer "Add to cart" for something already in it. ⚠ A failure degrades to "Add to cart", never to a false "in your cart"
- [X] T211 Thread `onCart` from `CustomerShell`'s `entry<CustomerNavKey.Saved>`
- [X] T212 ⚠ **Deliberately NOT a quantity stepper.** That is the grocery-tile pattern (Woolworths, Coles) and it belongs where a shopper is deciding how much to buy. Quantity is the cart's business; a stepper here would make two screens responsible for one number
- [ ] T213 **OPERATOR** On device: add a saved item, ✅ it **stays** on the list and the row reads "In your cart · View"; tap View, ✅ it opens the cart; add the same product again from the product page, ✅ the row reads "2 in your cart"; empty the cart, ✅ the row returns to "Add to cart"



---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup)** — no dependencies
- **Phase 2 (Foundational)** — **BLOCKS everything**. Internally ordered: 2a (removal) → 2b (predicate) → 2c (contract). 2b before 2c because the predicate's shape determines the verdict field on the DTO
- **Phase 3 (US1)** — depends on Phase 2. **MVP.**
- **Phase 4 (US2)** — depends on Phase 3 (needs the list read and the client store)
- **Phase 5 (US3)** — depends on Phase 3; independent of Phase 4
- **Phase 6 (US4)** — depends on Phase 4 (bulk add needs a truthful verdict)
- **Phase 7 (US5)** — depends on Phase 3
- **Phase 8 (US6)** — depends on Phase 3; ⚠ sequenced after Phase 7 so the bundle spend is measured last
- **Phase 9 / 10** — depend on all shipped phases

### Ordering that is load-bearing, not incidental

- **T026 before T027**: the tree must be green with the capability *absent*, so nothing new is written against a half-removed model
- **T033 before Phase 3**: checkout's suite passing **unmodified** is what separates "the predicate is right" from "the feature is right"
- **T070 before T071**: reclaim before spend. 030 measured a `next/dynamic` split making every route *worse* — if T070 does not free bytes, iterate there rather than discovering it at T079
- **T037 before T038**: registering in the aggregator is what makes a type exist; regenerating first just commits its absence
- **T105 before T117**: the client cannot clear its local list until the server-side merge exists to acknowledge

### Parallel opportunities

- **Phase 1**: T007, T008
- **Phase 2a**: T011/T012, T014–T019, T023/T024 — different files across four surfaces
- **Phase 3 tests**: T040–T045 all parallel (six different files, no shared state)
- **Phase 3 build-out**: the backend (T046–T054), mobile (T055–T067) and web (T068–T080) tracks are independent once the contract lands at T039
- **Phase 4 tests**: T083–T086
- **Phase 5 tests**: T101–T104; then the mobile (T108–T115) and web (T116–T120) tracks are independent
- **Phase 9**: T153–T156

---

## Parallel Example: User Story 1 tests

```bash
# Six independent test files, no shared state — write them all before implementing:
Task: "Go service fakes in apis/core-api/internal/features/saveditems/service_test.go"
Task: "Go container-backed repo test in apis/core-api/internal/features/saveditems/repository_test.go"
Task: "Go wire contract half in apis/core-api/internal/features/saveditems/wire_contract_test.go"
Task: "Kotlin wire contract half in .../commonTest/.../features/saved/SavedWireContractTest.kt"
Task: "Kotlin store test in .../commonTest/.../features/saved/SavedStoreTest.kt"
Task: "Web store test in apps/customer-web/lib/saved-store.test.ts"
```

---

## Implementation Strategy

### MVP: Phase 1 → Phase 2 → Phase 3

That is the whole point of the slice — **the heart tells the truth**. It fixes the defect that makes
the current feature worse than nothing (a second tap silently un-saves what the shopper was trying to
save), and it delivers a correct, findable saved list. Everything after it adds value; none of it is
needed for the list to stop lying.

**Stop and validate at the Phase 3 checkpoint.** Walk quickstart §4a on both surfaces before starting
Phase 4.

### Incremental delivery

1. Phase 2 → the predecessor is gone and the shared predicate is proven (the storefront gets *more*
   honest even before the feature exists)
2. + Phase 3 → **MVP**: saving works and is truthful
3. + Phase 4 → the list becomes a watchlist rather than a bookmark folder
4. + Phase 5 → guests can save, which is the feature's central bet
5. + Phase 6 → it converts into orders
6. + Phase 7 → people can find it
7. + Phase 8 → we can tell whether any of it worked *(cuttable — see the warning in that phase)*

### If the bundle gate cannot be satisfied

T070/T079 are the decision point. The fallback is **not** to raise `GUEST_LIMIT` — it is to amend
FR-007 so web ships the control on product detail, the saved list and order history but **not** on
browse/search/home tiles, with mobile keeping all placements. That is a **spec amendment** (Principle
I), recorded in `spec.md` and the parity register, never a silent omission.

---

## Notes

- `[P]` = different files, no dependency on incomplete work
- Verify each test fails before implementing it
- Commit after each task or logical group
- ⚠ `cm-contract-check`, `cm-tokens-check` and `cm-guard` are **Makefile/operator-only — not in CI**.
  Run them by hand as part of every sweep
- ⚠ Nothing under `app/(shop)/` may import `lib/dal` — use `readServerSession()` and forward the id
  token, as `DeliverySeed.tsx` does. The dependency-cruiser guard has caught this before
- ⚠ Adding anything to the always-loaded storefront chrome spends from ~0.1 KB. When in doubt, it goes
  in a deferred module

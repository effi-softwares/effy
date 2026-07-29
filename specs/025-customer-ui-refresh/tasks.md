---

description: "Task list for 025 — Customer Experience Refresh (Web + Mobile)"
---

# Tasks: Customer Experience Refresh (Web + Mobile)

**Input**: Design documents from `specs/025-customer-ui-refresh/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/)

**Tests**: INCLUDED. The design documents require them explicitly — `research.md` R13 defines the
verification strategy, and each file in `contracts/` carries a "Required tests" section. Tests are not
optional in this feature.

**Organization**: Grouped by user story so each is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on incomplete work)
- **[Story]**: the user story this serves (US1–US5); Setup/Foundational/Polish carry none

## Path Conventions

- Hot path: `apis/core-api/internal/`
- Shared packages: `packages/{shared-types,design-system,mobile-kit}/`
- Web: `apps/customer-web/`
- Mobile: `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/`
- Shop mobile (refactor only): `apps/shop-mobile/shared/src/commonMain/kotlin/com/effyshopping/shop/mobile/`

---

## Phase 1: Setup (Measure Before Changing Anything)

**Purpose**: Establish the bundle baseline and stand up the guards *before* any code lands, so the
feature can never be blamed for — or hide behind — the pre-existing overage.

- [X] T001 Measure the pre-existing guest bundle overage: run `make cw-build && make cw-size`, capture the per-script gzipped breakdown, and record it as a new section "R6a — measured baseline (dd/mm)" in `specs/025-customer-ui-refresh/research.md`. **Do not change any app code first** — this number is the before-picture that T020 is judged against.
- [X] T002 [P] Fix the stale help text on the `cw-size` target in `Makefile` (it says "≤ 120 KB"; the real limit in `apps/customer-web/scripts/bundle-budget.mjs` is 160 KB, and the script's own comment explains why 120 was unreachable).
- [X] T003 [P] Extend `GUEST_PAGES` in `apps/customer-web/scripts/bundle-budget.mjs` to include `/search` and `/product/[id]` so the gate covers the routes this feature changes most, not only `/` and `/browse`.
- [X] T004 [P] Add the guest-path dependency quarantine to `apps/customer-web/.dependency-cruiser.cjs`: forbid `radix-ui`, `sonner`, and `vaul` from being **reachable** (`reachable: true`, not direct-import matching) from `app/(shop)/`.
- [X] T005 Prove the T004 guard by deliberately breaking it — temporarily import a Radix primitive into an `app/(shop)/_components/` file, confirm `make cw-depcruise` fails and names it, then revert. (011 research D11: the Amplify quarantine reported clean while broken because it matched only direct imports. Do not repeat that.)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared backend, contract, bundle, and mobile-foundation work every user story
depends on.

**⚠️ CRITICAL**: No user story work begins until this phase is complete and its gates are green.

### Hot path — the delivery predicate (contracts/storefront-serviceability.contract.md)

- [X] T006 Extract the postcode→zone predicate into `apis/core-api/internal/platform/delivery/zone.go` as `ZoneForPostcode(ctx, q, postcode) (zoneID string, ok bool, err error)`, lifted verbatim from the inline SQL at `apis/core-api/internal/features/checkout/delivery_store.go:36`.
- [X] T007 Repoint `DestinationZone` in `apis/core-api/internal/features/checkout/delivery_store.go` at `delivery.ZoneForPostcode` so checkout and the storefront share one predicate (FR-014b). Behaviour must be unchanged — existing checkout tests are the proof.
- [X] T008 [P] Write the serviceability parity test in `apis/core-api/internal/features/storefront/serviceability_test.go`: for a serviced postcode, an unserviced postcode, and one absent from every zone, assert the storefront read and `checkout.DestinationZone` agree (SC-002a). **Write it first; it must fail before T009.**
- [X] T009 Implement the serviceability read in `apis/core-api/internal/features/storefront/serviceability.go` plus its route in `apis/core-api/internal/features/storefront/handler.go`: normalise the postcode (trim, digits only, exactly 4), return `{postcode, serviced}`, **400 on malformed input** (never `serviced:false`), and emit no zone id, zone name, fee, or window.

### Hot path — sort and total (contracts/storefront-search-sort.contract.md)

- [X] T010 [P] Create the opaque, sort-tagged cursor in `apis/core-api/internal/features/storefront/cursor.go`: `base64url({v,s,k,i})` with encode/decode and a versioned payload.
- [X] T011 [P] Write cursor tests in `apis/core-api/internal/features/storefront/cursor_test.go`: round-trip per sort, and a cursor issued under one sort rejected under another. **Write first.**
- [X] T012 Rewrite the keyset in `apis/core-api/internal/features/storefront/search.go` to be per-sort (`newest` / `price_asc` / `price_desc` / `relevance`, each with `id` as tiebreak), and add the concurrent `SELECT count(*)` over the same WHERE. `relevance` must score with `similarity()` over the **exact expression** the trigram index at `db/migrations/20260716092105_product_catalog.sql:125` is built on.
- [X] T013 Wire `sort` and `total` through `apis/core-api/internal/features/storefront/handler.go`: parse and validate `sort`, reject a cursor/sort mismatch with 400 `cursor_sort_mismatch`, fall back to `newest` when `relevance` is asked without `q`, and **echo the sort actually applied**.
- [X] T014 [P] Write search integrity tests in `apis/core-api/internal/features/storefront/search_test.go`: `total` equals a full paged walk with no product repeated or missing (SC-003a); `relevance` without `q` returns `sort:"newest"`; existing `newest` tests pass untouched.

### Hot path — enriched categories (contracts/storefront-categories.contract.md, G1)

- [X] T015 Extend the categories projection in `apis/core-api/internal/features/storefront/` with `productCount` (active products) and a **deterministically derived** `imageUrl` (lowest `display_order`, then oldest `created_at`, then lowest `id`), returning `null` when no product in the category has media.
- [X] T016 [P] Add hot-path metrics for both new reads in the storefront feature slice, including a serviceability counter labelled **`serviced` only** — `postcode` must never be a label (unbounded cardinality + location data, Principle VII).

### Shared contracts (Principle II — one atomic edit)

- [X] T017 Update `packages/shared-types/src/storefront.ts`: add `ProductSort`; add `total` + `sort` to `ProductSearchResultDTO`; add `sort` to `ProductSearchQuery`; add `productCount` + `imageUrl` to `StorefrontCategoryDTO`; add `ServiceabilityDTO`.
- [X] T018 Export `ServiceabilityDTO` and `ProductSort` from `packages/shared-types/src/customer-commerce-contract.ts` alongside the existing storefront types.
- [X] T019 Regenerate the Kotlin contract with `make cm-contract-gen` and confirm `make cm-contract-check` and `make sm-contract-check` are green.

### Web — clear the pre-existing bundle overage

- [X] T020 Using the T001 measurement, bring `make cw-gates` green. If the cause is app code or a dependency on the guest path, fix it. If the measurement shows the Next 16 + React 19 framework floor is the cause, ratchet `GUEST_LIMIT` in `apps/customer-web/scripts/bundle-budget.mjs` **with the measurement recorded in the diff and in research.md R6a** — a reviewed, reasoned change, never a silent bump. **The gate must be green before Phase 3 starts.**

### Mobile — share the 018 foundation (research R5)

- [X] T021 Move `EffyComponents.kt` from `apps/shop-mobile/shared/src/commonMain/kotlin/com/effyshopping/shop/mobile/core/ui/` to `packages/mobile-kit/ui/EffyComponents.kt`, renaming the package to the neutral `com.effyshopping.mobile.kit.ui`.
- [X] T022 Refactor `apps/shop-mobile` onto the shared `EffyComponents` and delete the app-local original. `make sm-test` and `./gradlew :shared:allTests` must stay green — SC-012 requires no behaviour change.
- [X] T023 [P] Author the shared mobile assets once under `packages/design-system/mobile-assets/`: the Material Symbols icon vectors (with `MATERIAL_SYMBOLS_LICENSE.txt`) and the three Nunito Sans `.ttf` weights (with `OFL.txt`), taken from `apps/shop-mobile/shared/src/commonMain/composeResources/`.
- [X] T024 Extend `packages/design-system/scripts/gen-compose-theme.mjs` to (a) emit the Compose type scale per app with the correct app-specific font resource import, and (b) sync `mobile-assets/` into each consuming app's `composeResources/`. **Customer and shop only** — `compose-driver/` stays colour/spacing only, since `apps/driver-mobile` is the untouched base template and has no `composeResources`.
- [X] T025 Extend the token drift check in `packages/design-system/scripts/check-tokens.mjs` (or the `tokens:check` script it backs) to fail on drift in the emitted type scale and the synced assets, naming the stale surface — matching the `brand-check` pattern.
- [X] T026 Run the generator and commit the derived artifacts for customer and shop; confirm `make cm-tokens-check` and `make sm-tokens-check` are green.
- [X] T027 [P] Adopt the generated type scale in `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/core/theme/EffyTheme.kt` so the app renders Nunito Sans (FR-038).
- [X] T028 [P] Adopt the generated type scale in `apps/shop-mobile`'s `EffyTheme.kt` and delete the app-local `core/theme/EffyTypography.kt`.

### Mobile — navigation

- [X] T029 Migrate `apps/customer-mobile/.../app/CustomerShell.kt` from `AdaptiveNavShell` to the shared `ResponsiveNavigation`, supplying real icons for Home / Search / Orders / Account from the synced assets.
- [X] T030 Delete `packages/mobile-kit/shell/AdaptiveNavShell.kt` and its `NavGlyph` after confirming no consumer remains (`apps/driver-mobile` is the base template and uses neither). `NavGlyph` is the origin of the lettered glyphs — leaving it available leaves the defect available.
- [X] T031 [P] Extend `apps/customer-mobile`'s guard script (backing `make cm-guard`) to fail if a single-letter navigation glyph or a `TextButton("← Back")`-style navigation control reappears anywhere in the app (SC-006, made permanent).

**Checkpoint**: `make core-test`, `make cw-gates`, `make cm-codegen`, `make sm-codegen`, `make sm-test`, and both `allTests` suites green. User stories can now begin.

---

## Phase 3: User Story 1 — Find Something to Buy (Priority: P1) 🎯 MVP

**Goal**: A guest can see whether Effy delivers to them, reach any category from primary navigation
without hitting a placeholder, and narrow a large catalogue with several criteria at once — on both
surfaces.

**Independent Test**: As a signed-out guest on both surfaces, open cold, set a delivery location, reach
a product through browse without using search, refine by more than one criterion, change sort, and
share the refined URL — with no sign-in prompt and no placeholder page anywhere in the path.

### Tests for User Story 1

- [X] T032 [P] [US1] Playwright spec in `apps/customer-web/e2e/browse.spec.ts`: primary nav → browse → category → product in ≤3 deliberate steps, no placeholder copy reachable, no sign-in prompt.
- [X] T033 [P] [US1] Playwright spec in `apps/customer-web/e2e/refinement.spec.ts`: multi-criterion refinement, each chip removable, clear-all, sort change, shareable URL reopened in a new context, and refinements + scroll position restored on back.
- [X] T034 [P] [US1] Vitest spec in `apps/customer-web/lib/delivery-store.test.ts`: set, normalise, invalidate-on-postcode-change, seed-from-default-address, and — critically — a failed serviceability read must **not** collapse to `serviced: false`.
- [X] T035 [P] [US1] Kotlin `commonTest` in `apps/customer-mobile/shared/src/commonTest/.../features/catalog/` for the delivery-context store and the search refinement state holder.

### Implementation — customer-web

- [X] T036 [US1] Create the dependency-free delivery store in `apps/customer-web/lib/delivery-store.ts` (`useSyncExternalStore` + `localStorage`, the `lib/cart-store.ts` pattern), holding `{postcode, serviced, checkedAt, source}`.
- [X] T037 [US1] Build the delivery affordance in `apps/customer-web/app/(shop)/_components/DeliveryAffordance.tsx` — a client island using a native `<dialog>`, no Radix (contracts/customer-ui.contract.md §1).
- [X] T038 [US1] Add a persistent search input and the delivery affordance to `apps/customer-web/app/(shop)/layout.tsx`. **Do not call `cookies()` or `headers()` here and do not import `aws-amplify`** — the file's own comment explains what that would cost.
- [X] T039 [US1] Replace the placeholder in `apps/customer-web/app/(shop)/browse/page.tsx` with the real category index: server-rendered inside `<Suspense>`, keeping the existing `JsonLd` breadcrumb and metadata.
- [X] T040 [P] [US1] Create `apps/customer-web/app/(shop)/_components/CategoryTile.tsx` — image, name, product count, brand-mark fallback when `imageUrl` is null.
- [X] T041 [US1] Make the product tile fluid in `apps/customer-web/app/(shop)/_components/ProductCard.tsx` (`w-full`, drop `w-40 shrink-0 sm:w-48`) so it fills grid cells (FR-020).
- [X] T042 [US1] Move the fixed rail width into a wrapper in `apps/customer-web/app/(shop)/_components/ProductRail.tsx` so rails keep a consistent tile width after T041.
- [X] T043 [US1] Rebuild `apps/customer-web/app/(shop)/_components/PromoCarousel.tsx` as a real carousel — **using the `imageUrl` the `BannerDTO` already carries and the current component ignores** — with CSS scroll-snap, anchor dots, and position indication. Zero client JS.
- [X] T044 [US1] Rewrite refinement state in `apps/customer-web/app/(shop)/_components/SearchExperience.tsx` to be URL-resident: read from `useSearchParams`, write with `router.replace` (debounced for text), and add the sort control, result count, price range, removable refinement chips, and clear-all.
- [X] T045 [P] [US1] Give every discovery loading, empty, error, and offline state explicit plain-language copy with at least one recovery action, in `apps/customer-web/app/(shop)/` (home, browse, search).

### Implementation — customer-mobile

- [X] T046 [US1] Add the Browse destination and its category grid to `apps/customer-mobile/.../features/catalog/presentation/`, reusing the shared tile treatment.
- [X] T047 [US1] Create the persisted delivery-context store in `apps/customer-mobile/.../core/` following the `AppearancePreferenceStore` pattern.
- [X] T048 [US1] Add the search entry and delivery row to the Home app bar in `apps/customer-mobile/.../features/catalog/presentation/HomeScreen.kt`, replacing the ad-hoc `HomeStackHost` text row in `app/CustomerShell.kt`.
- [X] T049 [US1] Add sort, result count, and refinement chips to `apps/customer-mobile/.../features/catalog/presentation/SearchScreen.kt`.
- [X] T050 [US1] Replace the flat `BannerHero` in `HomeScreen.kt` with an image-bearing pager plus page indicator.

### Telemetry

- [X] T051 [P] [US1] Add the web PostHog events `delivery_location_set`, `browse_category_opened`, `search_refined` (facet **keys** only), and `search_sorted`. **`delivery_location_set` carries `serviced: bool` and never the postcode** (Principle VII, research R12).

**Checkpoint**: US1 is independently demonstrable on both surfaces. SC-001, SC-002, SC-002a, SC-003, SC-003a are walkable.

---

## Phase 4: User Story 2 — Decide On a Product (Priority: P2)

**Goal**: The product page answers what it is, when it arrives, how many, and what else is like it —
without navigation.

**Independent Test**: Open a product with several images and several attribute groups on both surfaces;
view every image, read the specifics, see a delivery expectation, choose a quantity, add it, and move
to a related product without leaving the product experience.

### Tests for User Story 2

- [X] T052 [P] [US2] Playwright spec in `apps/customer-web/e2e/product.spec.ts`: every gallery image reachable, delivery expectation present with a location set and an invitation without one, quantity adjacent to add, related rail present and self excluded.
- [X] T053 [P] [US2] Kotlin `commonTest` for the product detail view model's gallery selection and quantity state in `apps/customer-mobile/shared/src/commonTest/.../features/catalog/`.

### Implementation — customer-web

- [X] T054 [US2] Replace the inert thumbnails in `apps/customer-web/app/(shop)/product/[id]/page.tsx` with an interactive gallery — CSS scroll-snap plus labelled radio inputs, zero client JS.
- [X] T055 [US2] Show a delivery expectation beside the price when a delivery context exists, and an invitation to set one when it does not — never blocking add-to-cart (FR-023).
- [X] T056 [US2] Move the quantity control adjacent to the add action in `apps/customer-web/app/(shop)/_components/AddToCartControl.tsx`, with an unambiguous line total.
- [X] T057 [US2] Add the related-products rail to the product page in **its own `<Suspense>` boundary** so it can never delay the buy box — one search call filtered by the product's primary category, self excluded, section omitted entirely when empty.
- [X] T058 [P] [US2] State unavailability at the point of action rather than only as an image overlay (FR-028).
- [X] T059 [P] [US2] Make the specifics rows legible at the narrowest supported width in the product page's attribute section (FR-027) — they stay rows, never cards.

### Implementation — customer-mobile

- [X] T060 [US2] Add a swipeable gallery with position indication to `apps/customer-mobile/.../features/catalog/presentation/ProductDetailScreen.kt`.
- [X] T061 [US2] Add the sticky bottom buy bar (a `Scaffold` bottom bar owning price + quantity + add) so the primary action stays reachable on a long page (FR-025).
- [X] T062 [US2] Add the delivery expectation beside the price and move the quantity stepper adjacent to the add action.
- [X] T063 [US2] Add the related-products rail, omitted when the category yields nothing else.
- [X] T064 [P] [US2] Add the web PostHog events `product_gallery_viewed` and `related_product_opened`.

**Checkpoint**: US1 and US2 both work independently.

---

## Phase 5: User Story 3 — A Mobile App That Feels Native (Priority: P3)

**Goal**: Remove every "unfinished app" signal from `customer-mobile` — the lettered glyphs are gone in
Phase 2; this phase does the rest.

**Independent Test**: Use the app on a small phone, a large phone, and a tablet in both orientations;
visit every destination; trigger loading, empty, error, and offline states; confirm each is
recognisable, safe-area correct, and gives feedback.

### Tests for User Story 3

- [X] T065 [P] [US3] Kotlin `commonTest` for the skeleton and refresh state holders in `apps/customer-mobile/shared/src/commonTest/.../core/`.

### Implementation

- [X] T066 [US3] Add a `TopAppBar` to every destination and pushed screen across `apps/customer-mobile/.../features/`, with a standard back affordance — deleting the `TextButton("← Back")` in `ProductDetailScreen.kt:71` and every sibling.
- [X] T067 [US3] Route every screen through the shared `EffyPage` safe-area treatment from `packages/mobile-kit/ui/EffyComponents.kt` (status bars, cutouts, rounded corners, gesture areas, keyboard).
- [X] T068 [US3] Replace bare `CircularProgressIndicator` first-load states with content-shaped skeletons on Home, Search, Browse, Product, Orders — mirroring the web skeleton in `apps/customer-web/app/(shop)/page.tsx:95`.
- [X] T069 [US3] Add pull-to-refresh with visible progress and preserved position to Home, Search, Browse, and Orders.
- [X] T070 [US3] Add a `SnackbarHostState` to the shell and wire transient feedback for add, save, remove, and failure — **at most one action each** (FR-034).
- [X] T071 [US3] Add `ProductImage` to cart lines in `apps/customer-mobile/.../features/cart/presentation/CartScreen.kt`, alongside name, unit price, quantity control, and line total.
- [X] T072 [US3] Replace the `TextButton`-based quantity steppers across the app with proper controls meeting the platform minimum touch target, with press feedback (FR-036).
- [X] T073 [US3] Route transitions and feedback through `packages/mobile-kit/ui/Motion.kt` so reduced-motion simplifies movement **without removing the state change** (FR-037). Done by T114. ⚠ Scoped to app-initiated motion: the pagers are direct manipulation, which reduce-motion settings do not govern.
- [X] T074 [US3] Replace literal `dp` values across `apps/customer-mobile/.../features/` with `EffySpacing` from the generated `packages/design-system/compose/EffyTokens.kt` — it has been available since 017 and unused.

**Checkpoint**: SC-006's sweep should now return zero instances.

---

## Phase 6: User Story 4 — Add to Cart and Check Out With Confidence (Priority: P4)

**Goal**: Every add is unmistakable, the cart is reviewable without losing your place, and the amount
payable stays visible through checkout.

**Independent Test**: Add several items from different places on both surfaces, confirm each add is
acknowledged, review the cart without losing the browsing position, and complete a wide-screen
checkout with the amount payable visible throughout.

### Tests for User Story 4

- [X] T075 [P] [US4] Vitest spec in `apps/customer-web/lib/toast-store.test.ts`: queueing, dismissal, and the at-most-one-action rule.
- [X] T076 [P] [US4] Playwright spec in `apps/customer-web/e2e/cart-feedback.spec.ts`: add acknowledged, badge updates, mini-cart opens without navigation, remove is undoable, sticky summary stays visible while scrolling checkout.

### Implementation — customer-web

- [X] T077 [US4] Create the dependency-free toast store and fixed live region in `apps/customer-web/lib/toast-store.ts` and `apps/customer-web/app/(shop)/_components/ToastRegion.tsx` (~30 lines, no `sonner`).
- [X] T078 [US4] Acknowledge every add-to-cart path (product page, rails, search results) and update the cart indicator in `apps/customer-web/app/(shop)/_components/CartBadge.tsx`.
- [X] T079 [US4] Add the mini-cart to the header as a native `<dialog>` over the existing `lib/cart-store.ts`, so a shopper can review and adjust without leaving the page (FR-040).
- [X] T080 [P] [US4] Make removal reversible from its own acknowledgement in `apps/customer-web/app/(shop)/cart/page.tsx` (FR-041).
- [X] T081 [US4] Make the checkout order summary sticky on wide screens in `apps/customer-web/app/checkout/CheckoutFlow.tsx` — a two-column grid with `position: sticky` above `lg`, no scroll listener.
- [X] T082 [P] [US4] Give empty cart, empty favourites, and empty order history a direct route back into the catalogue (FR-044).

### Implementation — customer-mobile

- [X] T083 [US4] Wire the Phase 5 snackbar to add, remove-with-undo, and failure across cart and catalogue screens.
- [X] T084 [P] [US4] Give the mobile empty cart, favourites, and orders states a direct route back into the catalogue.

**Checkpoint**: SC-004 is walkable on both surfaces.

---

## Phase 7: User Story 5 — One Coherent, Accessible Brand (Priority: P5)

**Goal**: One product across two surfaces, usable with assistive technology, larger text, or a keyboard
alone.

**Independent Test**: Review every screen this feature touched on both surfaces in light and dark, at
increased text size, with a screen reader, and — on web — by keyboard alone.

### Tests for User Story 5

- [X] T085 [P] [US5] Playwright spec in `apps/customer-web/e2e/a11y.spec.ts`: keyboard-only traversal of discovery, product, cart, and checkout with focus always visible and no focus trap.

### Implementation

- [X] T086 [US5] Verify Nunito Sans renders on both mobile apps and matches the web storefront (FR-038, SC-008) — the currently visible divergence.
- [X] T087 [US5] Sweep every screen changed by this feature for hardcoded colour, type size, spacing, or radius, and replace with design-system values (FR-007, SC-007).
- [X] T088 [US5] Announce dynamic changes — result count, applied refinements, add confirmations, errors — through live regions on web and their mobile equivalents (FR-045).
- [X] T089 [US5] Add accessible names to every interactive element introduced by this feature on both surfaces (FR-045).
- [X] T090 [P] [US5] Grayscale review — **clean, nothing to fix**. Every colour signal carries its own text: the discount chip reads "-33%", the default-address badge reads "Default", the delivery control reads "Set"/"Change", unavailability reads "Unavailable", and every error is the message itself. Colour is decoration at all of them.
- [X] T091 [P] [US5] Maximum-text-size pass — **three real clips found and fixed**: (a) the quantity stepper's fixed 40dp value box, which would have shown `1` while the cart charged for `12`; (b) the category tile's fixed 132dp height, with a two-line name inside it; (c) the hero stats at `maxLines = 1`, where "No account" ellipsized to "No acc…". All three now grow instead of clipping.
- [X] T092 [US5] Dark-appearance pass — **clean**. The only hardcoded colours left are white-on-scrim over a *photograph* (promo slide copy), which is correct in both appearances precisely because it is not over a themed surface. Everything else resolves through the inverted token roles, which flip by construction. ⚠ Mid-session appearance switching is state-preserving by construction (theme change is a recomposition, not a navigation) but is **not device-verified** — it belongs to T115.

**Checkpoint**: SC-007 through SC-011 are walkable.

---

## Phase 7b: Mobile Adopts the Web Visual Language (added 2026-07-28)

The web half of US5 landed against the operator's template hybrid (research **R15**); the mobile half
had only 025's functional work, so the two customer surfaces diverged — the exact outcome US5 exists
to prevent. Content matches the web; chrome stays native (bottom bar, pushed cart, app bars, back
stacks all unchanged).

- [X] T103 Add `core/presentation/StorefrontFormat.kt` — `money` / `isDiscounted` / `discountPercent`, consolidating **six** copy-pasted `money()` helpers. `discountPercent` **rounds**, matching the web's `Math.round`.
- [X] T104 Add `core/presentation/StorefrontKit.kt` — `EffySurface` (the page/tint/skeleton inversion), `EffyDisplay` + `DisplaySize`, `EffySectionHeader`, `EffyHairline`, `EffyProductCard` (+ skeleton), the shared grid rhythm, `DiscountChip`, `EffyQuantityStepper`. App-local by design: `mobile-kit` is shared with the signed-off `shop-mobile`.
- [X] T105 Invert the page surface in `App.kt` — `EffySurface.page`, not `colorScheme.background`. **No token changes**; `cm-codegen` regenerates all 8 Compose files byte-identically.
- [X] T106 [US1] Recompose Home to the web's section order: hero band → promo carousel → hairline-closed rails with "See all" → "shop by category" panel. Skeleton reshaped to match.
- [X] T107 [US1] Wire the new Home affordances through `CustomerShell` — hero CTA → Browse; per-rail "See all" → Search, applying the web's `railHref()` mapping. Adds `SearchViewModel.applySaleOnly` (distinct from `toggleSale`: entry navigation must be idempotent, or the link means the opposite of itself on second use).
- [X] T108 [US1] Browse + Search onto the shared card and grid: borders removed, tint corrected, pill search field, skeletons from the kit.
- [X] T109 [US2] Product detail to the web layout: display title, price block with `DiscountChip`, tinted unavailable notice, ruled label/value detail rows, pill actions, shared stepper.
- [X] T110 [US4] Cart lines to the web treatment (larger tinted image, semibold name, shared stepper, hairline above a pill checkout). **Stays a pushed full screen — deliberately NOT the web's mini-cart dialog.**
- [X] T111 [US4] Rebuild Favourites as a product grid. It was a text list with **no image at all**, on the screen whose whole purpose is "things I liked the look of". Adds the missing back affordance (FR-030).
- [X] T112 [US5] Convert 14 raw `Button` call sites across account / auth / checkout / receipt to `mobile-kit`'s `EffyPrimaryAction`, which is already pill-shaped and 52dp. Fixes the shape at the call sites rather than overriding `MaterialTheme.shapes`, which would restyle every other surface.
- [X] ~~T113~~ **SUPERSEDED by 026** — the platform typeface is now General Sans, whose heaviest shipped face is SemiBold 600; there is no ExtraBold to ship and the mobile type scale is SemiBold-led. Original: Ship `nunito_sans_extrabold.ttf` through `packages/design-system/mobile-assets` and extend `effyFontFamily()`, so mobile display type matches the web's 800 weight. **Deferred**: currently Bold (700), recorded in research R15. Additive, but it regenerates all three Compose themes.
- [X] T114 [US3] Route feedback through `packages/mobile-kit/ui/Motion.kt` — adds `LocalMotionLevel` (a CompositionLocal, **not** an `expect fun`: mobile-kit is `srcDir`'d into shop-mobile too, so an `expect` would have forced a file into a signed-off surface) plus per-platform readings. Android's "Remove animations" → `None`; iOS's "Reduce Motion" → `Reduced`, because Apple's convention is to substitute a cross-fade, not to delete the transition. Applied to product-card press feedback, which closes an FR-036 gap: a bare `clickable` gave a ripple on Android and **nothing at all on iOS**.
- [ ] T115 **OPERATOR / DEVICE**: Android + iOS side by side against the web storefront on the same catalogue — home, a category, a search, a product, the cart — in light and dark. This is the mobile half of T096 and cannot be automated.

---

## Phase 8: Polish, Verification & Sign-Off

- [X] T093 [P] Update `docs/audiences/customer-capabilities.md` with every capability from this feature on both surfaces, including the justified `n/a` rows from `contracts/customer-ui.contract.md` §4 (FR-002, SC-014).
- [X] T094 [P] Audit both surfaces against the no-card doctrine: cards permitted **only** as product tile, category tile, and promo slide (research R11); no metric or summary cards anywhere, none at the top of any page.
- [X] T095 Run every gate in `quickstart.md` §2 and confirm all green — **especially `make cw-gates`**.
- [ ] T096 Walk the SC-005 structured visual review matrix in `quickstart.md` §6 (5 viewports × 2 appearances × 2 surfaces) and record a pass/fail per cell.
- [X] T097 Run the SC-006 "nothing left behind" sweep in `quickstart.md` §7: zero lettered glyphs, zero improvised back links, zero spinner-only first loads, zero imageless cart lines.
- [~] T098 Confirm the SC-012 `shop-mobile` regression: tests, guards, and a device check that sign-in, session restore, sign-out, role visibility, and manager denial are unchanged and its 018 presentation is visually identical.
- [ ] T099 Walk the 14 guest journeys in `quickstart.md` §5 on both surfaces and record results.
- [ ] T100 **OPERATOR**: schedule and run the moderated testing for SC-002, SC-003, and SC-013. SC-003 needs a catalogue larger than the current dev seed (>100 products in one result set) — note this when scheduling.
- [ ] T101 Commit spec, plan, research, data-model, contracts, tasks alongside the code (Quality Gates: no feature merges without them).
- [X] T102 Replace `next-themes` on the guest path with an inline pre-paint script (`components/theme/ThemeScript.tsx`) plus a `useSyncExternalStore` store (`components/theme/appearance-store.ts`). **⚠ THE ESTIMATE THAT JUSTIFIED THIS TASK WAS WRONG.** It was recorded as "~8.3 KB gz on every guest page", which would have brought `GUEST_LIMIT` to ~168 KB. Measured: `next-themes` `dist/index.mjs` is **1.5 KB gzipped**, the replacement store costs ~0.6 KB, and the actual saving is **0.9 KB** (`/` 171.4 → 170.5). `GUEST_LIMIT` ratcheted 176 → **174 KB** — by what was measured, not what was hoped. Still worth doing (one fewer dependency; the appearance logic is now ours and has 11 unit tests) but it does not buy headroom. The storage key and values are kept as next-themes' defaults (`theme`, `light|dark|system`) so nobody's existing choice is reset, and that is the first assertion in the test file. All four hard parts are reproduced: pre-paint application, live `system` tracking, cross-tab sync, and transition suppression during the swap.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: no dependencies — start immediately. T001 must precede T020.
- **Phase 2 (Foundational)**: depends on Phase 1. **Blocks every user story.**
- **Phase 3–7 (User Stories)**: all depend on Phase 2. Then independently deliverable in priority order.
- **Phase 8 (Sign-off)**: depends on whichever stories are being shipped.

### Critical path inside Phase 2

```text
T001 ──────────────────────────────▶ T020 (bundle green)  ─┐
T006 ─▶ T007 ─┐                                            │
T008 ─────────┴─▶ T009 (serviceability)                    ├─▶ Phase 3
T010 ─▶ T011 ─▶ T012 ─▶ T013 ─▶ T014 (sort + total)        │
T017 ─▶ T018 ─▶ T019 (contracts + Kotlin regen)            │
T021 ─▶ T022 ─┐                                            │
T023 ─▶ T024 ─┴─▶ T025 ─▶ T026 ─▶ T027/T028 ─▶ T029 ─▶ T030┘
```

### User Story Dependencies

- **US1 (P1)**: after Phase 2. No dependency on other stories. **This is the MVP.**
- **US2 (P2)**: after Phase 2. Reads the delivery context US1 introduces — if built alone, ship T036/T047 with it.
- **US3 (P3)**: after Phase 2. Mobile-only; fully independent of US1/US2.
- **US4 (P4)**: after Phase 2. Its mobile half reuses the US3 snackbar host — if built alone, ship T070 with it.
- **US5 (P5)**: verifies the surface area the other stories produce, so it lands last regardless of staffing.

### Parallel Opportunities

- Phase 1: T002, T003, T004 in parallel (T005 after T004).
- Phase 2: three independent tracks — **backend** (T006–T016), **contracts** (T017–T019), **mobile foundation** (T021–T031) — plus **T020** on its own. Four people could run these simultaneously.
- Phase 3: web (T036–T045) and mobile (T046–T050) are different codebases and fully parallel once T017–T019 land.
- All tests marked [P] within a story can run together.

---

## Parallel Example: Phase 2

```bash
# Three tracks, no shared files:
Track A (Go):        T006 → T007 → T009,  T010 → T011 → T012 → T013
Track B (contracts): T017 → T018 → T019
Track C (mobile):    T021 → T022,  T023 → T024 → T025 → T026
Track D (web):       T001 → T020
```

## Parallel Example: User Story 1

```bash
# Tests first, together:
Task: "Playwright browse spec in apps/customer-web/e2e/browse.spec.ts"
Task: "Playwright refinement spec in apps/customer-web/e2e/refinement.spec.ts"
Task: "Vitest delivery-store spec in apps/customer-web/lib/delivery-store.test.ts"
Task: "Kotlin commonTest for the mobile delivery-context store"

# Then the two surfaces in parallel:
Developer A: T036 → T037 → T038 → T039 → T040 → T041 → T042 → T043 → T044 → T045
Developer B: T046 → T047 → T048 → T049 → T050
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 — measure and stand up the guards.
2. Phase 2 — **the whole phase**. It is large because it is genuinely shared; skipping parts of it just relocates the work.
3. Phase 3 — US1.
4. **STOP and VALIDATE**: walk journeys 1–7 and 13–14 in `quickstart.md` §5.
5. Demo. A guest can now see whether Effy delivers to them and reach any product through a real browse experience — the two things the storefront most visibly lacked.

### Incremental Delivery

Phase 2 → US1 (MVP) → US2 → US3 → US4 → US5 → sign-off. Each story adds value without breaking the
previous ones.

### If Scope Must Shrink

Cut from the bottom. **US1 alone materially improves the storefront** (spec Assumptions). US3 is the
next most visible — it is where the "unfinished app" impression actually lives, and much of its cost is
already paid by Phase 2.

---

## Notes

- `[P]` = different files, no dependency on incomplete work.
- Tests are included by design (research R13, and every contract's "Required tests").
- **Do not start Phase 3 while `make cw-gates` is red.** No web verification is credible until it is green.
- Mobile telemetry is deliberately absent — a standing platform exception with its own owning slice (research R12).
- **No migration in this feature.** If one appears necessary, that is a signal to return to the spec, not to write it.
- Commit after each task or logical group.

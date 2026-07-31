---

description: "Task list for 028-mobile-home-merchandising"
---

# Tasks: Customer Mobile Home — Sectioned Merchandising & Search Entry

**Input**: Design documents from `/specs/028-mobile-home-merchandising/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Test tasks below are **not** speculative TDD ceremony — each one appears in the plan's or
quickstart's verification table as a required proof. They are the pieces that carry *logic* rather
than layout, and every one is runnable without a device. Layout is proven by the live walk in
[quickstart.md](./quickstart.md) §3–§4, because a home screen is a thing you look at.

**Organization**: Grouped by user story. US1–US3 are independently shippable; **the clean cut line if
this slice needs shortening is after US3** (research R14).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1…US5, mapping to the spec's user stories
- **⚠ OPERATOR**: Claude does not run this — it touches live AWS, the database, or a deploy

---

## Phase 1: Setup

**Purpose**: Establish a clean, measured starting point. Two of these three exist so the feature's
own success criteria can be judged against something.

- [ ] T001 Create branch `028-mobile-home-merchandising` **from `027-customer-cart-sync`, not from `main`** (the plan's setup script created no branch — the git extension is not installed). ⚠ **Verified**: `main` has **no `promo_code` migration** (its last is `20260722160000`), **no `apis/edge-api/admin/src/promotions/`**, and **no `apps/back-office/src/features/promotions/`** — all of it is 027, which sits 8 commits ahead on its own branch. Branching from `main` would make T045 extend a table that does not exist and T046–T054 edit files that do not exist. ⚠ `main` also still carries `HomeScreen.kt`'s `isRefreshing = false` bug that 027 fixed — see T062.
- [ ] T002 Verify the baseline is green before any edit: run the machine gates in [quickstart.md](./quickstart.md) §1 and record which, if any, are already failing so a pre-existing failure is never attributed to this feature
- [ ] T003 **Pin the conditions and record the baseline** in [quickstart.md](./quickstart.md) §5: name the reference Android and iOS devices, the swipe length, and the network throttling profile — then measure the current grid's first-meaningful-content time, `GET /v1/storefront/home` server time, swipes-to-last-content, and a screenshot of the unscrolled screen. ⚠ SC-002, SC-006 and SC-008 are *comparisons* against undefined units ("a standard phone", "a typical connection"); without this task they are unfalsifiable, and with unpinned conditions they measure the office wifi.

---

## Phase 2: Foundational (blocks US2–US5)

**Purpose**: The Home screen's container and the pure composition function every later block plugs into.

**⚠ This phase does NOT block US1.** The search entry touches navigation and the Search screen, not
Home's content area — so US1 can proceed in parallel with, or before, this phase. Stated plainly
rather than pretending everything is blocked.

- [ ] T004 Add the `HomeBlock` sealed interface (`Categories` / `Section` / `Promo`) and `CategoryShortcut` data class in `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/features/catalog/presentation/HomeBlocks.kt` per [data-model.md](./data-model.md) §5
- [ ] T005 Implement the pure `composeHome(home: HomeContent, categories: List<Category>): List<HomeBlock>` in the same file — banner interleaving by position, **out-of-range position clamped to the end** (never drop a live promotion), empty rails skipped (FR-020), category block omitted when empty (FR-029)
- [ ] T006 [P] Unit-test `composeHome` in `apps/customer-mobile/shared/src/commonTest/kotlin/com/effyshopping/customer/mobile/features/catalog/HomeBlocksTest.kt` — interleaving order, the out-of-range clamp, empty-rail skip, empty-category omission, and the all-empty case producing an empty list
- [ ] T007 Convert `HomeScreen`'s container from `LazyVerticalGrid` to `LazyColumn` in `apps/customer-mobile/shared/src/commonMain/.../catalog/presentation/HomeScreen.kt`, with `verticalArrangement = Arrangement.spacedBy(<one EffySpacing value>)` so SC-007's identical gap is true **by construction** rather than by inspection
- [ ] T008 Delete `DiscoverGrid` and `CategoryChips` from `HomeScreen.kt` — the chips were 026's substitute for rails (research R3); keeping both would leave two competing groupings on one screen. ⚠ **Do this only once T019 renders sections** (Phase 4). Until then the existing grid stays inside the new `LazyColumn`, so work stopping mid-slice never ships an app with an empty Home.
- [ ] T009 Replace `DiscoverSkeleton` with a section-shaped `EffyHomeSkeleton` in `apps/customer-mobile/shared/src/commonMain/.../core/presentation/StorefrontKit.kt` — FR-041 requires the placeholder to be shaped like what is coming, and a grid skeleton in front of a sectioned screen is now a lie

**Checkpoint**: Home renders as an empty-but-correct `LazyColumn`; `composeHome` is proven by tests.

---

## Phase 3: User Story 1 — Search entry (Priority: P1) 🎯 MVP

**Goal**: One tap from Home lands on Search with the field focused and the keyboard already up;
submitting runs the search and dismisses the keyboard.

**Independent Test**: Launch the app, tap Home's search entry, confirm the keyboard is raised with no
second tap, type and submit, confirm results — with no merchandising section built at all.

- [ ] T010 [US1] Add the one-shot focus request to `CustomerNavState` — `requestSearchFocus()` / `consumeSearchFocus(): Boolean` in `apps/customer-mobile/shared/src/commonMain/.../core/nav/CustomerNavState.kt`, deliberately **transient** (not saved across process death — a restored app should show results, not reopen the keyboard over them)
- [ ] T011 [P] [US1] Test the one-shot in `apps/customer-mobile/shared/src/commonTest/.../core/nav/CustomerNavStateTest.kt` — `consumeSearchFocus()` returns true exactly once and false thereafter
- [ ] T012 [US1] Expose the request through `CustomerNavigator` in the same file, matching the existing forward-only handle pattern (no second source of truth)
- [ ] T013 [US1] In `apps/customer-mobile/shared/src/commonMain/.../catalog/presentation/SearchScreen.kt`: attach a `FocusRequester` to the existing `OutlinedTextField`, consume the one-shot on composition, set `ImeAction.Search`, dismiss the keyboard on submit (FR-010), and make a blank/whitespace submit a no-op that keeps focus (FR-011). **Also FR-012a**: a previous query MUST be **retained**, not cleared, and the text **selected on focus** so a new query replaces it in one action — retaining a query the shopper then has to delete character by character is worse than clearing it.
- [ ] T014 [US1] In `HomeScreen.kt`: make the search entry call `requestSearchFocus()` then `onSearch()`, and **delete the fake "Filters" button** — it is labelled *Filters*, opens Search, and applies no filter; an affordance that lies about what it does
- [ ] T015 [US1] Wire the focus request through `apps/customer-mobile/shared/src/commonMain/.../app/CustomerShell.kt`'s `entry<CustomerNavKey.Home>` `onSearch` handler

**Checkpoint**: SC-001 is demonstrable on both platforms. US1 is shippable alone.

---

## Phase 4: User Story 2 — Sections (Priority: P2)

**Goal**: Home is a vertical sequence of named, horizontally scrolling product sections with a
consistent gap and a working "see all".

**Independent Test**: Load Home against a store with several groupings; confirm each renders as a
titled horizontally scrollable section with identical spacing — no banner, no category row present.

### Rail rendering

- [ ] T016 [US2] Add `railTileWidthFraction(widthClass): Float` as a **pure** function in `apps/customer-mobile/shared/src/commonMain/.../core/presentation/StorefrontKit.kt` — ~0.42 on compact so two tiles plus a peek fit; a smaller fraction on expanded so more tiles fit rather than each tile growing (research R4)
- [ ] T017 [P] [US2] Unit-test `railTileWidthFraction` in `apps/customer-mobile/shared/src/commonTest/.../core/presentation/` — compact yields a visible peek; expanded does not simply scale the phone layout
- [ ] T018 [US2] Add `EffyRailTile` to `StorefrontKit.kt`, reusing `EffyProductCard`'s presentation at rail width with its **height capped so header + row stays under half the viewport** (FR-017/SC-005). ⚠ `EffyProductCard`'s aspect ratio was set by a 2-column grid — measure it against the ceiling, do not assume it fits.
- [ ] T019 [US2] Render the `HomeBlock.Section` case in `HomeScreen.kt` — `EffySectionHeader(title, onSeeAll)` above a `LazyRow` of `EffyRailTile`, with the trailing peek (FR-015) present only when more items exist beyond the viewport

### Scoped results ("see all")

- [ ] T020 [US2] Add `CustomerNavKey.Results(title: String, categoryKey: String?, saleOnly: Boolean)` in `apps/customer-mobile/shared/src/commonMain/.../core/nav/CustomerNavKey.kt`, and register it in **BOTH** the `customerNavSavedState` polymorphic module **AND** `ALL_CUSTOMER_ROUTES`. ⚠ An omission here restores fine on Android and **throws on iOS**, passing every Android test.
- [ ] T021 [P] [US2] Extend `CustomerNavKeySerializationTest` in `apps/customer-mobile/shared/src/commonTest/.../app/ScreenInventoryTest.kt` to round-trip the new `Results` route — this is the guard for T020's iOS-only failure mode
- [ ] T022 [US2] Add `entry<CustomerNavKey.Results>` to `CustomerShell.kt`, rendering `SearchScreen` with the entry scope, **pushed onto the current tab** so Back returns to Home rather than stranding the shopper in the Search tab (research R2)
- [ ] T023 [US2] Extend `SearchScreen.kt` to accept an optional entry scope and apply it **once** on first composition via the existing `applyCategory` / `applySaleOnly` — ⚠ use `applySaleOnly`, never `toggleSale`; its own doc comment explains that toggling from entry navigation makes a link mean the opposite of itself on second use
- [ ] T024 [US2] Wire per-rail "see all" in `HomeScreen.kt`: the `on_sale` rail → `Results(saleOnly = true)`, a `category:<key>` rail → `Results(categoryKey = key)`, `featured` → `Results()` unscoped. The scope must be **stated on screen** at the destination (FR-018)
- [ ] T025 [US2] Update the now-stale 026 doc comments that assert Home is a grid and "category filtering lives in the Discover chips" — in `HomeScreen.kt`, `SearchScreen.kt` and `ScreenInventoryTest.kt`. A comment that describes a deleted design is worse than no comment.

**Checkpoint**: SC-003, SC-005, SC-006, SC-007 measurable on device. US1 + US2 both work.

---

## Phase 5: User Story 3 — Category shortcuts (Priority: P3)

**Goal**: A scannable icon-and-label category row that tells a shopper what kind of store this is.

**Independent Test**: Load Home; confirm the row is present and scannable, each entry navigates to
that category's products, and a category with no matching icon still renders legibly.

- [ ] T026 [US3] Author the category icon set + a neutral fallback glyph as VectorDrawables in `packages/design-system/mobile-assets/drawable/` (the SSOT). ⚠ Monochrome only — `currentColor`-style tinting, no hue. `scripts/check-no-emerald.sh` and `check-no-jade.sh` sweep `*.svg`/`*.xml` and will catch a retired brand value.
- [ ] T027 [US3] Run `pnpm --filter @effy/design-system mobile-assets:sync`, then `mobile-assets:check` — must report zero STALE / MISSING / ORPHANED
- [ ] T028 [US3] Add the pure `categoryIcon(key: String): DrawableResource` map with fallback in `apps/customer-mobile/shared/src/commonMain/.../catalog/presentation/CategoryIcons.kt`
- [ ] T029 [P] [US3] Unit-test `categoryIcon` in `apps/customer-mobile/shared/src/commonTest/.../features/catalog/CategoryIconsTest.kt` — every known key resolves, and **an unknown key returns the fallback glyph, never null** (FR-026). This is the path an operator hits by creating a category.
- [ ] T030 [US3] Add `EffyCategoryShortcut` to `StorefrontKit.kt` — icon above label, **no container, border or fill**. This is the "no card layouts" doctrine being followed, not excepted (research R10); do not wrap it in a tile.
- [ ] T031 [US3] Render the `HomeBlock.Categories` case in `HomeScreen.kt` as a `LazyRow`, fed from the existing `GetCategories` use case filtered to top-level (`parentKey == null`) with `productCount > 0`
- [ ] T032 [US3] Wire a shortcut tap to `Results(categoryKey = key, title = name)`, reusing T022's route

**Checkpoint**: SC-004 measurable. **This is the clean cut line** — US1–US3 deliver a complete
sectioned Home with search and category entry, touching only mobile plus the asset SSOT.

---

## Phase 6: User Story 4 — Banners, shopper side (Priority: P4)

**Goal**: Advertised promotions render as banners between sections, swipeable, never auto-advancing.

**Independent Test**: Load Home with one, several and zero advertised promotions (a fixture is enough
until US5 lands) and confirm the banner renders, swipes, navigates and disappears correspondingly.

**Depends on**: Phase 2. Can be built against a fixture **before** US5's migration exists.

### Contract

- [ ] T033 [US4] Extend `BannerDTO` in `packages/shared-types/src/storefront.ts` with the optional fields `code`, `terms`, `target`, `position`, and add the closed `BannerTarget` union per [data-model.md](./data-model.md) §3. ⚠ `position` MUST be declared `WireInt` / `@asType integer` — 027 lost days to Kotlin sending `1.0` where Go wanted an `int`, **with every unit test passing** (research R12). `WireInt` currently lives in `packages/shared-types/src/cart.ts`: **import it** (or promote it to a shared primitives module) rather than redeclaring — a second copy of the alias is a second thing that can drift, which defeats its whole purpose.
- [ ] T034 [US4] Run `make cm-contract-gen`, then `make cm-contract-check` — the committed Kotlin must regenerate cleanly with zero drift

### Hot path (Go)

- [ ] T035 [US4] Add `AdvertisedPromotions(ctx)` to `apis/core-api/internal/features/storefront/repository.go` — **one** query implementing the visibility predicate in [data-model.md](./data-model.md) §1, with exhaustion **counted from `promo_redemption`, never from a stored counter** (027's rule)
- [ ] T036 [US4] Rewrite `banners()` in `apis/core-api/internal/features/storefront/service.go` to return advertised promotions instead of the hard-coded `"welcome"` stub — ordered by position, artwork presigned via the existing `media.Presigner`, and the **terms sentence composed server-side** from `minimum_subtotal_amount` so both surfaces phrase one promotion identically (FR-037d)
- [ ] T037 [P] [US4] Go tests in `apis/core-api/internal/features/storefront/service_test.go` — a live promotion is included; outside-window, exhausted, `disabled`, and not-advertised are each excluded; the empty case returns `[]` and **not** a stub
- [ ] T037a [P] [US4] Go tests in the same file asserting **FR-021** (no product appears twice within one rail) and **FR-023** (no unavailable product appears in a rail). Both are properties this feature *inherits* from `storefront.Service.Home` rather than implements — which is exactly why they are worth pinning: an inherited guarantee nobody asserts is a guarantee that can be removed without anything going red.

### Mobile

- [ ] T038 [US4] Extend the `Banner` domain model and add the `BannerTarget` **sealed interface** in `apps/customer-mobile/shared/src/commonMain/.../catalog/domain/Catalog.kt`
- [ ] T039 [US4] Map the new wire fields in `apps/customer-mobile/shared/src/commonMain/.../catalog/data/CatalogMappers.kt` — an **unknown wire `kind` maps to `null`**, so the wire shape never leaks past `data` (Principle VI)
- [ ] T040 [P] [US4] Extend `apps/customer-mobile/shared/src/commonTest/.../features/catalog/CatalogMappersTest.kt` — banner fields map, and an unrecognised target yields `null` rather than throwing
- [ ] T041 [US4] Add `EffyPromoBanner` to `StorefrontKit.kt` — a bounded panel on `EffySurface.tint`, headline at display scale, terms beneath, code in a bordered inline chip, optional artwork behind a contrast-guaranteeing scrim. ⚠ **Real text, never baked into the image** (FR-033). ⚠ **No hue** — the palette has none to give; carry emphasis with scale, weight and negative space (research R9).
- [ ] T042 [US4] Render the `HomeBlock.Promo` case in `HomeScreen.kt` — one banner as a panel, several in a `HorizontalPager` with a position indicator and **no auto-advance** (FR-032, Baymard: mobile has no hover, so a shopper cannot pause an auto-rotating carousel)
- [ ] T043 [US4] Map `BannerTarget` to navigation in `HomeScreen.kt` / `CustomerShell.kt` via an exhaustive `when`; an unrecognised or null target renders the banner **non-tappable** — a dead tap is worse than no tap
- [ ] T044 [US4] Handle the empty-banner list in `apps/customer-web/app/(shop)/page.tsx` — ⚠ **this is the one behavioural change that is not backward compatible**: web currently always receives the `"welcome"` stub and will now receive `[]`. Called out in [contracts/storefront-home.contract.md](./contracts/storefront-home.contract.md) so it is found here rather than in production.

**Checkpoint**: banners render, swipe and navigate against a fixture.

---

## Phase 7: User Story 5 — Banners, operator side (Priority: P5)

**Goal**: An operator marks a promotion advertisable in the back-office and it appears on Home;
expiry, exhaustion or withdrawal takes it down with no app release.

**Independent Test**: From the back-office alone — mark a promotion advertisable, confirm it appears
on Home; end it, confirm it disappears on the next load.

**⚠ PREREQUISITE — this phase cannot start until 027 is merged and applied.** `public.promo_code`,
`apis/edge-api/admin/src/promotions/` and `apps/back-office/src/features/promotions/` are **all** 027's,
and none of them exist on `main`. Before any task below: 027 must be merged (or 028 branched from it per
T001) **and** its migration applied in dev (`make db-up ENV=dev`). 027 also still has 12 open operator
tasks — doing that pass first means one database session instead of two.

### Data

- [ ] T045 [US5] Scaffold the migration with `make db-new name=promo_advertising`, then author it in `db/migrations/<timestamp>_promo_advertising.sql`: the five columns, `promo_code_banner_copy_chk`, and the partial index `promo_code_advertised_idx`, per [data-model.md](./data-model.md) §1. Forward-only. ⚠ The CHECK is what makes an advertised-but-uncopy'd promotion **unrepresentable** — a service check can be bypassed by a backfill or a future route; a constraint cannot.

### Cold path

- [ ] T046 [US5] Extend `PromoCodeDTO`, `CreatePromoCodeRequest` and `UpdatePromoCodeRequest` in `packages/shared-types/src/promotion.ts` with the advertising facet
- [ ] T047 [US5] Extend `apis/edge-api/admin/src/promotions/types.ts` and `service.ts` — validate that `isAdvertised` requires a non-empty `bannerTitle`, so the operator gets a **field-level message** instead of a 500 from a constraint violation
- [ ] T048 [US5] Extend `apis/edge-api/admin/src/promotions/repository.ts` create/update to persist the facet. ⚠ **Do not route these fields through the `FOR UPDATE` value-immutability transaction** — FR-068 (a redeemed code's *value* can never change) must not be weakened by adding presentation metadata
- [ ] T048a [US5] **Promote the media presign helper into `@effy/edge-shared`.** `apis/edge-api/shop/src/products/media.ts` already implements exactly the needed thing — validated content type, size ceiling, pseudo-random key, presigned PUT so bytes never pass through Lambda, presigned GET on read — but it is app-local to `shop`. Copying it into `admin` would be exactly the cross-cutting copy-paste Principle II prohibits. Move it to `packages/edge-shared`, parameterise the key prefix (`products/…` vs `promotions/…`), and repoint `shop` at it. ⚠ `shop`'s existing media tests must stay green **unmodified** — if they need editing, the extraction changed behaviour.
- [ ] T048b [US5] Add the presign route to `apis/edge-api/admin` — `POST /admin/v1/promotions/{id}/banner-image/presign` returning `{ uploadUrl, storageKey }`, wired in `serverless.yml` under the existing admin authorizer and the same `admin`/`manager` mutate gate. The operator PUTs directly to S3, then saves `bannerImageKey` through the existing update route (T048's path) — the same two-step register pattern `shop` uses for product media.
- [ ] T048c [US5] Grant the admin Lambda `s3:PutObject` / `s3:GetObject` on the media bucket and set `S3_MEDIA_BUCKET` in `apis/edge-api/admin/serverless.yml`, mirroring the shop service's grant. ⚠ Scope the IAM to the bucket, not `*`.
- [ ] T049 [P] [US5] Extend `apis/edge-api/admin/src/promotions/service.test.ts` — advertised-without-title refused; the existing `admin`/`manager` mutate gate still refuses `csa`; an `admin.audit_log` row is written; **the presign route rejects a non-image content type and an oversize file** (the ceiling is the shared helper's, not a new number)
- [ ] T050 [US5] Confirm the **existing 027 FR-068 tests still pass unmodified**. If they needed editing, the advertising facet reached the value path and the change is wrong.

### Back-office

- [ ] T051 [US5] Add the advertising controls to `apps/back-office/src/features/promotions/PromotionDetailScreen.tsx` — an "Advertise on storefront" toggle defaulting to **off**, with title/subtitle/position **disabled while it is off** (an operator should not be able to fill in copy that goes nowhere)
- [ ] T052 [US5] Add copy beside the toggle stating plainly that this makes the promotion **public to every shopper**. ⚠ The default is the safety; this sentence is what stops someone reaching past it. The private-goodwill-credit case is real — one careless toggle turns one customer's credit into a storewide discount.
- [ ] T052a [US5] Add the banner-artwork uploader to `PromotionDetailScreen.tsx` — request a presigned PUT (T048b), upload the file directly to S3, then save the returned `storageKey` as `bannerImageKey`. Show the current artwork with a way to replace or clear it; **artwork is optional** (FR-037b), so clearing must be as easy as setting, and a banner with no image must still be savable.
- [ ] T053 [P] [US5] Extend `apps/back-office/src/features/promotions/PromotionsListScreen.test.tsx` (or a new detail test) covering the toggle's default-off state, the disabled-when-off fields, and that **clearing artwork leaves a valid, savable promotion**
- [ ] T054 [US5] Update `apps/back-office/src/features/promotions/repo.ts` and `queries.ts` to carry the new fields

### ⚠ OPERATOR

- [ ] T055 **⚠ OPERATOR** Commit the migration (003 commit-guard requires it committed first), then run `make db-up ENV=dev`
- [ ] T056 **⚠ OPERATOR** Run `make edge-deploy SERVICE=admin ENV=dev`
- [ ] T057 **⚠ OPERATOR** Run `make core-run` with the new binary so the storefront banner read is live

**Checkpoint**: the full operator → shopper loop works end to end.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: The requirements that span every block — and the ones most often skipped.

- [ ] T058 [P] Add accessibility semantics to every horizontal section and the banner pager in `HomeScreen.kt` / `StorefrontKit.kt` — each announced as a **bounded, named group** so a screen-reader user can move past it rather than being trapped in an unbounded sideways list (FR-044, SC-010)
- [ ] T059 [P] Verify every interactive element meets `EffyMinTouchTarget` and carries an accessible label describing what it does (FR-043)
- [ ] T060 [P] Route banner transitions and any section entrance animation through the existing `rememberMotionSpec` so reduced-motion yields 0ms (FR-045)
- [ ] T061 Verify adaptive behaviour on expanded windows via `mobile-kit`'s `WindowSize` — sections adapt rather than stretching, and no single product occupies half the screen width (FR-046, SC-011). Also confirm **safe-area insets** hold on both platforms (FR-006) — the notch and the home indicator are where a rebuilt full-height screen most often clips.
- [ ] T062 Verify the resilience states in `HomeViewModel`/`HomeScreen`: first-load retry, refresh-keeps-content-on-failure, and pull-to-refresh not blanking the screen (FR-042). ⚠ **This is "verify" only if T001 branched from 027.** On `main`, `HomeScreen.kt` still has `isRefreshing = false` hard-coded, so the pull gesture works and looks like nothing happened — if 028 lands ahead of 027, this task is **implement**, not verify.
- [ ] T063 Verify the single empty state for a store with no products, categories or promotions — **exactly one**, with no section headings, banner or placeholder (SC-012)
- [ ] T063a Inspect **every section title** `storefront.Service.Home` emits against the query that composes it, and record the result in the sign-off (SC-016, FR-038). Today the titles are "Featured", "On sale" and category names — all substantiated. This is a five-minute check that exists so the first person to add a "Popular" or "Trending" rail has to confront whether the store can actually back the word.
- [ ] T064 Run the full machine gate set in [quickstart.md](./quickstart.md) §1. ⚠ `cm-tokens-check` must pass **unchanged** — this slice adds no design token, so a diff there means a colour crept in, which is a Principle V violation and not a token update.
- [ ] T065 Run both mobile suites plus `assembleDebug` and the iOS Kotlin/Native compile
- [ ] T066 [P] Update the parity register at [docs/audiences/customer-capabilities.md](../../docs/audiences/customer-capabilities.md) with a §028 entry, recording that mobile now has sectioned merchandising and that customer-web's adoption of the new banner fields is deliberately deferred
- [ ] T067 **⚠ OPERATOR** Walk [quickstart.md](./quickstart.md) §3 on **both** Android and iOS, including the SC-013 side-by-side comparison
- [ ] T068 **⚠ OPERATOR** Walk [quickstart.md](./quickstart.md) §4 — including the **not-advertised** case (SC-015) and both automatic take-downs (expiry, exhaustion)
- [ ] T069 **⚠ OPERATOR** Record the §5 measurements against T003's baseline, and answer the open design risk: **did the monochrome banner actually get tapped?** (research R9). If it reads too quietly, the fix is contrast **within the neutral ramp** — never a new colour.
- [ ] T070 Sign-off: update [CLAUDE.md](../../CLAUDE.md)'s Active Feature section and commit

### Adjacent, optional — not this feature's scope

- [ ] T071 [P] *(optional)* Correct `CLAUDE.md`'s "Design system" section, which still describes **Effy Emerald + Nunito Sans** — retired by constitution v1.11.0 in favour of the monochrome ramp and General Sans. Unrelated to this feature, but it is the document every future session reads first, and it currently teaches the wrong palette.

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup)** — no dependencies
- **Phase 2 (Foundational)** — blocks **US2, US3, US4**. Does **not** block US1.
- **Phase 3 (US1)** — depends only on Phase 1
- **Phase 4 (US2)** — depends on Phase 2
- **Phase 5 (US3)** — depends on Phase 2; independent of US2
- **Phase 6 (US4)** — depends on Phase 2; buildable against a fixture before US5
- **Phase 7 (US5)** — depends on US4's contract task (T033) for field names, **and on 027 being merged and applied** (see the Phase 7 prerequisite). ⚠ Note also that **T045's migration must be applied before T035's SQL can be *executed***, even though the Go compiles without it — "US4 is buildable against a fixture" is true of the Kotlin and false of the query.
- **Phase 8 (Polish)** — depends on whichever stories shipped

### Story dependencies

```
Setup ──┬─────────────────────────► US1 (P1)  ── independently shippable
        │
        └──► Foundational ──┬─────► US2 (P2)  ── independently shippable
                            ├─────► US3 (P3)  ── independently shippable  ◄── CUT LINE
                            └─────► US4 (P4) ◄──► US5 (P5)  ── the two banner halves
```

**US4 and US5 are the only genuinely coupled pair.** US4 renders banners; US5 creates something to
render. US4 can be built and tested against a fixture, but the feature is not *demonstrable* until
US5's migration is applied.

### Within each story

- Pure functions and their tests before the composables that use them
- Contract (`shared-types`) before regeneration before consumers — always in that order (Principle II)
- Nav key registration and its serialization test **in the same commit** (the iOS-only failure mode)

---

## Parallel Opportunities

**Phase 2:**

```
T006 (composeHome tests) — parallel with T007/T009 once T005 lands
```

**Phase 4 (US2):**

```
T017 (rail width test)  ┐
T021 (nav serialization) ┘  different files, no interdependency
```

**Phase 6 (US4) — the widest fan-out, three languages at once:**

```
T037 (Go service tests)      — apis/core-api/…/service_test.go
T040 (Kotlin mapper tests)   — commonTest/…/CatalogMappersTest.kt
T044 (customer-web empty)    — apps/customer-web/app/(shop)/page.tsx
```

**Phase 7 (US5):**

```
T049 (edge-api vitest)  ┐  separate packages
T053 (back-office test) ┘
```

**Phase 8:**

```
T058, T059, T060 — accessibility, touch targets, motion: independent concerns, different call sites
```

---

## Implementation Strategy

### MVP (US1 only)

1. Phase 1 → Phase 3
2. **STOP and validate**: SC-001 on both platforms
3. Shippable on its own — one tap to a working keyboard is a real improvement to the current screen

### Recommended increment (the cut line)

1. Phase 1 → Phase 2 → US1 → US2 → US3
2. **STOP and validate**: quickstart §3 in full
3. This delivers the complete sectioned Home the request describes, touching **only** mobile plus the
   asset SSOT — no migration, no deploy, no back-office change

### Full slice

4. US4 → US5 → Phase 8
5. Adds the operator-controlled, self-expiring promotional banner across five surfaces

---

## Notes

- `[P]` = different files, no dependency on an incomplete task
- The three highest-risk tasks in this list, each for a reason already paid for once:
  - **T020/T021** — an unregistered nav route fails on **iOS only** and passes every Android test
  - **T033** — a wire-shape mismatch that every unit test passes (027's `1.0` into a Go `int`)
  - **T041** — a monochrome banner that nobody notices; the wrong fix is a colour, which is a
    constitution violation rather than a design choice
- Commit after each task or logical group; stop at any checkpoint to validate a story independently

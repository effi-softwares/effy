# Tasks: Driver Item Manifest & Temperature Classes

**Input**: Design documents from `specs/065-driver-item-manifest/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/driver-manifest.md](contracts/driver-manifest.md),
[quickstart.md](quickstart.md)

**Tests**: included. This repo's practice is unit + container tests per slice, and the quickstart
names four negative proofs that need tests to break.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US4 from spec.md; setup, foundational and polish tasks carry none
- `MOBILE` below = `apps/driver-mobile/shared/src/commonMain/kotlin/com/effyshopping/driver/mobile`
- `MOBILE_TEST` = `apps/driver-mobile/shared/src/commonTest/kotlin/com/effyshopping/driver/mobile`

---

## Phase 1: Setup

**Purpose**: confirm the ground the plan stands on before anything is written.

- [x] T001 Record the baseline in `specs/065-driver-item-manifest/quickstart.md` (a "Baseline" section): the reporting-package count from `pnpm -r typecheck`, and test counts for `@effy/edge-driver`, `@effy/shared-types`, `go test ./internal/features/checkout/...` and driver-mobile `:shared:testAndroidHostTest`; confirm `pnpm --filter @effy/shared-types driver-contract:check` is green at HEAD (it was red at HEAD before 063)
- [x] T002 Create the migration file with `make db-new NAME=order_item_storage_class` (produces `db/migrations/<ts>_order_item_storage_class.sql`)

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: the column, the snapshot write, the contract and the pure manifest builder. Every user
story reads these.

**⚠ No user story work starts until this phase is complete.**

- [x] T003 Write the migration in `db/migrations/<ts>_order_item_storage_class.sql`: add nullable `storage_class text` to `public.order_item` with `CHECK (storage_class IS NULL OR storage_class IN ('frozen','chilled','ambient'))`, a `COMMENT` stating NULL = sold before 065 and never backfilled, and a Down that drops the column (data-model.md)
- [x] T004 Add `StorageClass string` to `CheckoutLine` and populate it in the line read in `apis/core-api/internal/features/checkout/store.go` (~L150–190): a scalar subselect of `product_attribute_value.value_text` joined to `attribute_definition` where `key = 'storage'`, coalesced to `'ambient'` (research R1 — the value is an attribute row, not a product column)
- [x] T005 Write `storage_class` in the `INSERT INTO public.order_item` of `UpsertPendingOrder` in `apis/core-api/internal/features/checkout/store.go` (depends on T003, T004)
- [x] T006 [P] Update the contract in `packages/shared-types/src/driver.ts` per `contracts/driver-manifest.md`: add `TemperatureClass` and `ClassSummary`; widen `ManifestLine` (`orderedQty`, `included`, `temperatureClass`); add `summary` to `CollectionPackage`, `DeliveryDropSummary` and `DeliveryDropDTO`; add `items` + `summary` to `DropPackageRef`. Every integer is `WireInt`
- [x] T007 Regenerate the Kotlin contract with `pnpm --filter @effy/shared-types driver-contract:gen` and READ the generated file under `packages/shared-types/contract-driver/` to confirm counts are `Long`, not `Double` (027 R13) (depends on T006)
- [x] T008 [P] Create the pure manifest builder in `apis/edge-api/driver/src/work/manifest.ts`: `toTemperatureClass(storage_class | null)` (`ambient`→`normal`, NULL→`not_recorded`, no default branch that yields `normal`), `buildLines(rows)` applying research R3 (no pick row → ordered quantity; `gathered = 0` → `included: false`), ordering frozen → chilled → normal → not recorded then included-first then name, and `summarize(lines)` counting included units only
- [x] T009 [P] Unit tests in `apis/edge-api/driver/src/work/manifest.test.ts`: each class mapping; NULL is never `normal` (SC-008); the three R3 cases; ordering; summary excludes not-included lines; a zero-count class stays zero on the wire
- [x] T010 Make existing callers compile against the widened contract with placeholder-free values: `apis/edge-api/driver/src/work/service.ts`, `apis/edge-api/driver/src/work/delivery.ts` and `MOBILE/features/collection/data/HttpCollectionRepository.kt`, so `pnpm -r typecheck` and `:shared:compileAndroidMain` pass before story work begins (depends on T006, T007, T008)

**Checkpoint**: new orders record a class; the contract and builder exist; nothing user-visible yet.

---

## Phase 3: User Story 1 — Know what needs the cold compartment at pickup (P1) 🎯 MVP

**Goal**: at a shop stop, each package shows a class summary unopened and its own item list with
classes when opened.

**Independent test**: quickstart W1 and W2.

### Tests for User Story 1

- [x] T011 [P] [US1] Container test in `apis/edge-api/driver/src/work/manifest.container.test.ts` (migrations loaded from `db/migrations` via the `@effy/edge-shared` loader): a shop stop with two packages of 2 and 5 items returns each package's own lines and its own summary, never 7 (research R2); a package with frozen, chilled and ambient lines returns three classes; a standard-method package returns the same shape (FR-004)
- [x] T012 [P] [US1] Mobile test in `MOBILE_TEST/features/collection/CollectionManifestMappingTest.kt`: DTO → domain mapping keeps class, quantity and summary per package. No commas in backtick test names (Kotlin/Native rejects them)

### Implementation for User Story 1

- [x] T013 [US1] Rewrite `PACKAGE_ITEMS` in `apis/edge-api/driver/src/work/sql.ts` to return `sf.id AS package_id`, `oi.product_name`, `oi.quantity`, `oi.storage_class`, and `fi.gathered_quantity` through `LEFT JOIN public.fulfillment_item fi ON fi.order_item_id = oi.id AND fi.shop_fulfillment_id = sf.id`; select no money column
- [x] T014 [US1] Widen `ItemRow` and `packageItems` in `apis/edge-api/driver/src/work/repository.ts` to the new columns (depends on T013)
- [x] T015 [US1] In `collectionStop` in `apis/edge-api/driver/src/work/service.ts`, group rows by `package_id` and give each package only its own lines and summary via `manifest.ts`; remove the comment claiming the stop-wide list is deliberate (depends on T008, T014)
- [x] T016 [P] [US1] Create the domain types in `MOBILE/features/manifest/domain/Manifest.kt`: `TemperatureClass` (Frozen, Chilled, Normal, NotRecorded), `ManifestLine`, `ClassSummary`; retire the old `ManifestLine` in `MOBILE/features/collection/domain/Collection.kt` in favour of it
- [x] T017 [P] [US1] Create the shared views in `MOBILE/features/manifest/presentation/ManifestViews.kt`: `ClassChip` (word + icon, neutral ramp, no colour-only distinction — FR-011), `ClassSummaryRow` (omits zero classes — FR-015; shows nothing cold-related for an all-normal package), `ManifestList` (list rows, not cards; long names wrap without hiding quantity or class)
- [x] T018 [US1] Map the widened DTO in `MOBILE/features/collection/data/HttpCollectionRepository.kt` (line ~121) to the new domain types (depends on T007, T016)
- [x] T019 [US1] Render in `MOBILE/features/collection/presentation/CollectionScreens.kt`: replace the item-count line (~L307) with `ClassSummaryRow` per package, and an expandable `ManifestList` per package; packages with frozen or chilled goods are distinguishable in the list unopened (depends on T017, T018)

**Checkpoint**: US1 works alone — pickup shows per-package classes and correct per-package counts.

---

## Phase 4: User Story 2 — See what is being handed over at the door (P1)

**Goal**: a drop lists every item across its packages, grouped by package, with a summary on the
round's drop list — no shop named, no price shown.

**Independent test**: quickstart W3.

### Tests for User Story 2

- [x] T020 [P] [US2] Container test in `apis/edge-api/driver/src/work/drop-manifest.container.test.ts`: a drop of two packages from two shops returns two `packages` entries in stable order, each with its lines and summary; the drop summary equals the sum; another driver's drop id is refused identically to a nonexistent one
- [x] T021 [P] [US2] Guard test in `apis/edge-api/driver/src/work/manifest-prohibitions.guard.test.ts`: serialise the collection-stop and drop payloads from the container fixtures and fail naming any key matching `price|amount|total|fee|discount`, and on the drop payload any `shopId|shopName|shopCode` or shop address key (FR-020, FR-021, SC-007)
- [x] T022 [P] [US2] Mobile test in `MOBILE_TEST/features/delivery/DropManifestMappingTest.kt`: packages map in order and are labelled by position

### Implementation for User Story 2

- [x] T023 [US2] In `deliveryDrop` in `apis/edge-api/driver/src/work/delivery.ts`, replace the single synthetic `packages` entry with one per `round_package` ordered by `created_at`, each with `items` and `summary` from `manifest.ts`, plus the drop-level `summary`; reuse `packageItems` (no second items query — Principle II); keep `fromShopCount` (research R4)
- [x] T024 [US2] In `deliveryRun` in `apis/edge-api/driver/src/work/service.ts`, add `summary` to each `DeliveryDropSummary` using one `packageItems` call for the whole run, not one per drop (depends on T014)
- [x] T025 [US2] Add `packages` with lines and `summary` to the drop domain model in `MOBILE/features/delivery/domain/Delivery.kt` and map them in `MOBILE/features/delivery/data/HttpDeliveryRepository.kt`; update `MOBILE/features/delivery/data/PlaceholderData.kt` to the new shape
- [x] T026 [US2] Render `ClassSummaryRow` on each drop in the round list and a `ManifestList` grouped under "Package N of M" on the drop detail in `MOBILE/features/delivery/presentation/DeliveryScreens.kt` (depends on T017, T025)
- [x] T027 [P] [US2] Show the drop's `ClassSummaryRow` on `MOBILE/features/delivery/presentation/EnRouteScreen.kt` and the grouped `ManifestList` on `MOBILE/features/delivery/presentation/ArrivedScreen.kt` (depends on T017, T025)

**Checkpoint**: US1 and US2 both work; the guard proves no price or shop identity leaks.

---

## Phase 5: User Story 3 — The list matches the bag (P2)

**Goal**: unavailable lines read as not included; part-supplied lines show the supplied quantity.

**Independent test**: quickstart W4.

- [x] T028 [P] [US3] Extend `apis/edge-api/driver/src/work/manifest.container.test.ts`: a line with `gathered_quantity = 0` returns `included: false` and is absent from the summary; a part-picked line returns `qty` = gathered and `orderedQty` = ordered; a package with every line unavailable returns lines, all not included, and an all-zero summary (FR-017–FR-019)
- [x] T029 [US3] Render not-included lines in `MOBILE/features/manifest/presentation/ManifestViews.kt`: a "Not included" label in words (not strikethrough alone), sorted after included lines; a part-supplied line shows the supplied quantity; a package with nothing supplied shows "No items in this package"
- [x] T030 [P] [US3] Mobile test in `MOBILE_TEST/features/manifest/ManifestPresentationTest.kt`: not-included ordering, part-supplied quantity, the empty-package state

**Checkpoint**: the driver's list agrees with the shop's picking record.

---

## Phase 6: User Story 4 — What the driver is told does not change after purchase (P2)

**Goal**: prove the snapshot written in Phase 2 is what drivers see, and that product edits and old
orders behave as specified.

**Independent test**: quickstart W5, W6, W7.

- [x] T031 [P] [US4] Container test in `apis/core-api/internal/features/checkout/storage_class_container_test.go`: an order line for a chilled product is written `chilled`; a product with no `storage` attribute is written `ambient`; re-running intent after the product changes rewrites the line (still unpaid); after the order is paid, changing the product's attribute leaves `order_item.storage_class` untouched
- [x] T032 [P] [US4] Extend `apis/edge-api/driver/src/work/manifest.container.test.ts`: change the product's `storage` attribute after the order exists and assert the driver read still returns the original class (fails if the query reads the live product); a line with NULL `storage_class` returns `not_recorded`
- [x] T033 [US4] Render `NotRecorded` as "Class not recorded" with its own icon in `MOBILE/features/manifest/presentation/ManifestViews.kt`, and include it in `ClassSummaryRow` when non-zero

**Checkpoint**: all four stories work independently.

---

## Phase 7: Polish & cross-cutting

- [x] T034 [P] Offline retention (research R6) in `MOBILE/features/collection/data/HttpCollectionRepository.kt` and `MOBILE/features/delivery/data/HttpDeliveryRepository.kt`: keep the last successful stop and drop reads for the current round in memory and serve them, flagged stale, when a fetch fails for connectivity; a first load that fails surfaces an error (FR-024, FR-025)
- [x] T035 Surface the stale flag and the retryable error state in `MOBILE/features/collection/presentation/CollectionViewModel.kt` and `MOBILE/features/delivery/presentation/DeliveryViewModel.kt`; a load failure must never render as an empty package (depends on T034)
- [x] T036 [P] Mobile test in `MOBILE_TEST/features/collection/CollectionOfflineTest.kt`: retained read served on connectivity failure; first-load failure is an error state, not an empty list
- [x] T037 [P] Add `driver_manifest_opened` (`surface`, `hasCold`, `lineCount`) to `MOBILE/core/observability/AnalyticsEvent.kt` and fire it when a package or drop list is expanded; no item names, no order reference
- [x] T038 [P] Accessibility pass on `MOBILE/features/manifest/presentation/ManifestViews.kt`: content descriptions read "Frozen, 2 of Peas"; nothing clips at the largest text size; touch targets for expand/collapse are at least 48 dp
- [x] T039 Run the four negative proofs in `specs/065-driver-item-manifest/quickstart.md` §4 by breaking each thing in turn, and record which test caught each
- [x] T040 Full verification sweep: `pnpm -r typecheck` (reporting-package count unchanged from T001), `pnpm --filter @effy/edge-driver test` with `CONTAINER_TESTS=1`, `driver-contract:check`, `go build ./... && go vet ./... && go test ./internal/features/checkout/...`, driver-mobile `:shared:testAndroidHostTest` and `:shared:compileTestKotlinIosSimulatorArm64`, `make mobile-guard`
- [x] T041 [P] Add §065 to `docs/audiences/driver-capabilities.md` and write `specs/065-driver-item-manifest/SIGNOFF.md` (built, verified, defects found, open operator steps); add the 065 entry to `FEATURE-HISTORY.md` and its line to the index in `CLAUDE.md`
- [ ] T042 OPERATOR: `make db-up ENV=dev`, then `make core-image-push ENV=dev && make core-deploy ENV=dev`, then `make edge-deploy SERVICE=driver ENV=dev` — in that order (the driver read names the new column)
- [ ] T043 OPERATOR: walk W1–W10 in `specs/065-driver-item-manifest/quickstart.md` on Android and iOS and record the results in `SIGNOFF.md`

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (1)** → **Foundational (2)** → user stories → **Polish (7)**.
- Foundational blocks everything: T003 → T005; T006 → T007 → T010; T008 → T010.

### User story dependencies

- **US1** needs Phase 2 only.
- **US2** needs Phase 2, plus T013/T014 (the items query) and T016/T017 (shared manifest types and
  views) from US1. If US2 is built first, pull those four tasks forward.
- **US3** needs T013 (the pick join) and T017. Server behaviour is already in `manifest.ts` (T008);
  this phase proves and renders it.
- **US4** needs Phase 2 only for its tests; T033 needs T017.

### Parallel opportunities

- Phase 2: T006, T008, T009 together (three different files).
- US1: T011, T012, T016, T017 together; then T013 → T014 → T015 on the server while T018 → T019
  proceed on mobile.
- US2: T020, T021, T022 together; T027 beside T026.
- US4: T031 and T032 together (Go and TypeScript).
- Polish: T034, T037, T038, T041 together.

## Parallel example: User Story 1

```text
Together:  T011 container test · T012 mobile mapping test · T016 domain types · T017 shared views
Then:      T013 → T014 → T015 (server)   alongside   T018 → T019 (mobile)
```

## Implementation strategy

### MVP (US1 only)

Phases 1–3. Pickup shows per-package classes and the per-package count bug is fixed. Deployable on
its own: new contract fields are additive and installed app builds ignore unknown keys.

### Incremental delivery

1. Phases 1–2: foundation; new orders start recording a class.
2. US1: pickup. Demo W1, W2.
3. US2: the door. Demo W3.
4. US3 then US4: correctness proofs and their rendering. Demo W4–W7.
5. Polish, then the operator deploy and walks.

## Notes

- **Deviations recorded in [SIGNOFF.md](SIGNOFF.md)**: the container tests live in one file
  (`manifest.container.test.ts`), the mobile tests in two (`ManifestTest.kt`, `LastReadTest.kt`), and
  offline retention is `core/offline/LastRead.kt`. Rendering tasks are compile-verified only.

- T004 is the riskiest line in the slice: the storage value is an attribute row, and a wrong join
  typechecks. Only T031 proves it.
- Nothing is marked done on reasoning. A test task is done when the test has been seen to fail
  without the implementation or under its negative proof (T039).
- No commit is made by the implementer; the operator commits.

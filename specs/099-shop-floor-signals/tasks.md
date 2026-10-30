# Tasks: Shop Floor Signals - Collection, Pick Order, Availability and Quality

**Input**: Design documents from `specs/099-shop-floor-signals/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, quickstart.md

**Tests**: included - every backend part gets unit and container tests and every screen a component
test, per the constitution's quality gate (verified against acceptance criteria).

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [x] T001 Scaffold the migration `db/migrations/<ts>_shop_floor_signals.sql` with `make db-new NAME=shop_floor_signals` (file only; the operator applies it)

## Phase 2: Foundational (blocking)

- [x] T002 Move `dueRun` from `apis/edge-api/fleet/src/planner/service.ts` into `apis/edge-api/shared/src/lib/collection-deadline.ts` (export it with `collectionRunFor`), re-export from `@effy/edge-shared`, and import it back in the planner; keep `fleet/src/planner` tests green
- [x] T003 [P] Unit tests for the moved `dueRun` (Effy with window, Effy without window, courier, missed due run → caller uses next) in `apis/edge-api/shared/src/lib/collection-run-for.test.ts`
- [x] T004 Add the shared types from contracts/api.md: `CollectionDriver`, `ShopCollectionRunDTO`, `ShopNextCollectionDTO`, `ShopOrderCollectionDTO`, `StorageClass`, `STORAGE_CLASS_WORDS` in `packages/shared-types/src/shop-order-console.ts`; export from the package index

## Phase 3: User Story 1 - Know when the next collection comes (P1) 🎯 MVP

**Goal**: Today, the queue and an order's page say when the next run reaches the shop, what is due on it and whether a driver is on the way.
**Independent test**: quickstart walk steps 1–4.

- [x] T005 [US1] Pure rule module `apis/edge-api/shop/src/collection/rule.ts`: `runForPortion(portion, runs, settings, calendar, now)` (= next run, or the due run if later and not passed) and `driverState(round, stop, onDuty, now)` → `none | assigned | on_the_way | collected` (R1, R2)
- [x] T006 [P] [US1] Unit tests for `rule.ts` (window today/tomorrow, missed run, courier excluded, each driver state, opening time edge) in `apis/edge-api/shop/src/collection/rule.test.ts`
- [x] T007 [US1] Repository `apis/edge-api/shop/src/collection/repository.ts`: load active runs + `hub_turnaround_min` + no-delivery calendar; this shop's open Effy portions (pending → ready_for_pickup) with status and window start; this shop's `shop_pickup` stops on collection rounds for the next two local days with `round_opens_at`, round status, stop status and the driver's open duty session
- [x] T008 [US1] Service `apis/edge-api/shop/src/collection/service.ts`: `nextCollectionFor(shopId, now)` (data-model "Collection run" rules, `due.ready/picking`) and `collectionsForPortions(shopId, portionIds, now)` → map id → `ShopOrderCollectionDTO` (never for courier portions)
- [x] T009 [P] [US1] Container test against real rounds and stops in `apis/edge-api/shop/src/collection/repository.container.test.ts` (two runs, one ready + one picking, assigned round, collected stop moves to the next run, courier portion ignored)
- [x] T010 [US1] Add `nextCollection` and `live[].collection` to Today in `apis/edge-api/shop/src/today/{types,service,handler-support}.ts` and `packages/shared-types/src/shop-insights.ts`
- [x] T011 [US1] Add `collection` to order rows and detail in `apis/edge-api/shop/src/orders/{types,service,handler-support}.ts`
- [x] T012 [US1] After a planner pass, announce `{scope:"shop", kind:"orders"}` to shops whose portions were assigned to or released from collection rounds, in `apis/edge-api/fleet/src/planner/service.ts` (return the shop ids) and its scheduled caller in `apis/edge-api/fleet/src/functions/`
- [x] T013 [US1] On duty on/off, announce `orders` to shops on the driver's open collection rounds in `apis/edge-api/driver/src/work/announce.ts` (`announceDutyChanged`) and `apis/edge-api/driver/src/functions/driver-duty-v1-post.ts`
- [x] T014 [P] [US1] Update shop service tests for the new Today/order fields in `apis/edge-api/shop/src/functions/orders.test.ts` and `apis/edge-api/shop/src/today/service.test.ts`
- [x] T015 [US1] shop-web: `NextCollection` panel (time, Effy driver, ready/picking meter, driver line worded with `useNow` from `opensAt`, no-runs and next-day states) in `apps/shop-web/src/features/today/NextCollection.tsx`, shown on the Today rail
- [x] T016 [US1] shop-web: a slim "Next collection" strip above the Orders queue in `apps/shop-web/src/features/fulfillment/components/OrderQueue.tsx`
- [x] T017 [US1] shop-web: `collection` line on queue tickets, list rows ("Goes with" column), Today live orders and the order page meta ("Ready by … · collected on the … run") via one formatter `collectionLine()` in `apps/shop-web/src/features/fulfillment/collection.ts`
- [x] T018 [P] [US1] shop-web tests: panel states and formatter in `apps/shop-web/src/features/today/__tests__/next-collection.test.tsx` and `apps/shop-web/src/features/fulfillment/__tests__/collection.test.ts`

**Checkpoint**: US1 deployable alone (shop + fleet + driver + shop-web).

## Phase 4: User Story 2 - Pick in walking order (P2)

**Goal**: the pick list grouped Ambient → Chilled → Frozen, on screen and on paper.
**Independent test**: quickstart walk step 5.

- [x] T019 [US2] Select `oi.storage_class` into order detail lines in `apis/edge-api/shop/src/orders/repository.ts` and map `storageClass` in `orders/handler-support.ts`; add `storageClass` to `ShopOrderLineDTO` in `packages/shared-types/src/shop-order-console.ts`
- [x] T020 [P] [US2] Add `storageClass` to pick-list lines in `apis/edge-api/shop/src/pick-lists/repository.ts` and its shared type
- [x] T021 [US2] shop-web: group the pick list by `storageClass` with `sh-zone` headings and hints in `apps/shop-web/src/features/fulfillment/components/ItemsAndFulfilment.tsx` (no empty groups; behaviour unchanged)
- [x] T022 [US2] shop-web: group the printed pick list the same way in `apps/shop-web/src/features/fulfillment/pickList.ts` and its callers (`OrderDetailScreen.tsx`, `features/today/printPickLists.ts`)
- [x] T023 [P] [US2] Tests: grouping order and single-group case in `apps/shop-web/src/features/fulfillment/OrderDetailScreen.test.tsx`; backend mapping in `apis/edge-api/shop/src/orders/repository.container.test.ts`

## Phase 5: User Story 3 - Take a size off sale in one tap (P2)

**Goal**: Catalog › Availability lists every sellable size with stock and an on-sale switch.
**Independent test**: quickstart walk step 6.

- [x] T024 [US3] Add `ShopAvailabilityRowDTO` / `ShopAvailabilityDTO` in `packages/shared-types/src/shop-availability.ts` and export it
- [x] T025 [US3] Repository + service `apis/edge-api/shop/src/availability/{repository,service,handler-support}.ts`: live/unavailable products × non-removed variants, `q` over name/brand/label/code/sku/gtin, filter `all|off_sale|out_of_stock`, keyset cursor, `counts`, `lastOnSale`, existing `stockState`, primary image
- [x] T026 [US3] Handler `apis/edge-api/shop/src/functions/availability-v1-get.ts` and the `availabilityV1` function (`GET /shop/v1/availability`, shop authorizer) in `apis/edge-api/shop/serverless.yml`
- [x] T027 [P] [US3] Container test in `apis/edge-api/shop/src/availability/repository.container.test.ts` (filters, search by barcode, last-on-sale, draft/archived/removed excluded, other shop's sizes never listed)
- [x] T028 [US3] shop-web: repo + query (`["shop","stock","availability", params]` so live `stock` re-reads) in `apps/shop-web/src/features/catalog/availability.ts`
- [x] T029 [US3] shop-web: `AvailabilityScreen` (page head, view tabs All/Off sale/Out of stock with counts, search, rows with picture · name · size · code · stock word · switch; last-on-sale switch disabled with reason and product link; phone rows) in `apps/shop-web/src/features/catalog/AvailabilityScreen.tsx`, route `apps/shop-web/src/routes/catalog.availability.tsx`, registered in `apps/shop-web/src/router.tsx`; "Availability" button on the Catalog head; "Take a size off sale" in the palette
- [x] T030 [P] [US3] Test the screen (toggle calls the state route, refusal shown, filters) in `apps/shop-web/src/features/catalog/__tests__/availability.test.tsx`

## Phase 6: User Story 4 - See how well the shop fulfils (P3)

**Goal**: Found rate, can't-supply rate and average time to ready on Insights.
**Independent test**: quickstart walk step 7.

- [x] T031 [US4] Write the migration body in `db/migrations/<ts>_shop_floor_signals.sql`: five columns with checks on `shop_sales_hour`; mark the last 60 days of every active shop dirty; Down drops the columns
- [x] T032 [US4] Rollup: compute the five columns (first ready per portion; unfulfillable; withdrawn excluded; units ordered/supplied from `fulfillment_item`) in `apis/edge-api/shop/src/insights/rollup.ts`
- [x] T033 [US4] Read and compare: sum the columns over the window and the comparison window, build `quality` (`null` when nothing to measure) in `apis/edge-api/shop/src/insights/{repository,service}.ts`; add `quality` to `ShopInsightsDTO` in `packages/shared-types/src/shop-insights.ts`
- [x] T034 [P] [US4] Container test (reopened picking counted once, withdrawn excluded, hand-counted rates) in `apis/edge-api/shop/src/insights/repository.container.test.ts`
- [x] T035 [US4] shop-web: `QualityStrip` (three cells, "-" when null, change in words/glyph) on Insights in `apps/shop-web/src/features/insights/QualityStrip.tsx` and `InsightsScreen.tsx`; CSV export gains the three figures in `features/insights/exportCsv.ts`
- [x] T036 [P] [US4] Tests in `apps/shop-web/src/features/insights/__tests__/insights.test.tsx`

## Phase 7: Polish & cross-cutting

- [x] T037 Telemetry events `availability_viewed`, `availability_toggled`, `collection_panel_viewed` in the shop-web typed taxonomy (`apps/shop-web/src/lib/telemetry.ts` or its shared source)
- [x] T038 Remove every "Needs backend" placeholder assumption from the shop-web code comments and update `docs/shop-web-redesign-brief.md` §11 statuses to "Built"
- [x] T039 Run all checks: `pnpm --filter @effy/edge-shared test`, shop/fleet/driver vitest + typecheck, gateway capacity, `pnpm --filter @effy/shop-web test`, shop-web build, `scripts/check-shop-delivery-words.sh`, `scripts/check-no-refresh-timers.sh`, design-system guards
- [x] T040 Record 099 in `FEATURE-HISTORY.md` and the CLAUDE.md feature list with the operator steps (migration, deploy order) still open

## Dependencies

- Phase 2 (T002–T004) blocks US1. US2, US3 and US4 depend only on T004 (types) and are independent of each other and of US1.
- Within US1: T005 → T007 → T008 → T010/T011 → T015–T017; T012/T013 independent of shop-web.
- US4: T031 → T032 → T033 → T035.

## Parallel opportunities

- T003 ∥ T004; T006 ∥ T007; T009 ∥ T014; T019 ∥ T020; T027 ∥ T028; T034 ∥ T035.
- After Phase 2, US2, US3 and US4 can proceed in parallel with US1.

## Implementation strategy

MVP = Phase 2 + US1 (the next collection). Then US2 (small), US3, US4. Each story deploys on its own;
US4 alone needs the migration.

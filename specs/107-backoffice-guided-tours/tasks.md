---
description: "Task list for 107 - Guided Tours in Back-Office"
---

# Tasks: Guided Tours in Back-Office

**Input**: `specs/107-backoffice-guided-tours/` - [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md). Built on 106
(`specs/106-guided-tours/`).

**Tests**: included where the spec makes a check a requirement: SC-001 (every page, every key, the words), SC-003
(no step for another role reaches Customer support).

**Words**: every title and text is copied verbatim from spec.md › Tour Inventory. `tours.ts` is generated from the
spec's tables, and the words test keeps the two identical.

**Keys**: each screen task names the keys its tour's steps use, in step order. Generic keys from 106 are used where
they fit (`page-title`, `page-more`, `page-activity`, `list.first-row`, `list.row-select`, `list.col.<column id>`,
`nav.*`, `header.*`, and the `tour` prop on `Facet` / `ViewSelect` / `SearchBox` / `RecordSection` /
`InspectorSection` / `MoreActions`). Where a step points at a table column, read the column's `id` in the screen and
use `list.col.<id>`.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Add the `"./tour/testing": "./src/tour/testing.ts"` export to `packages/web-kit/package.json`

---

## Phase 2: Foundational (blocks every story)

### Roles in the shared engine (research R2) - shop-web stays green

- [X] T002 In `packages/web-kit/src/tour/define.ts`: replace `managersOnly?: boolean` with `roles?: readonly string[]` on `TourStepDef`; add `roles?: readonly string[]` to `TourDef`; widen `needsRecord` to `string`
- [X] T003 In `packages/web-kit/src/tour/engine.ts`: `StepContext` becomes `{ roles: ReadonlySet<string>; root? }`; `stepVisible` checks `step.roles` (any match); add `tourAllowed(tour, roles)`; `welcomeFirst` and `shouldOffer` callers skip tours not allowed
- [X] T004 In `packages/web-kit/src/tour/TourProvider.tsx`: `roles: readonly string[]` replaces `{ manager }` (memoised `Set`); `AutoStart`, `start`, `useTours().list` and `startPage` ignore tours `tourAllowed` refuses; add `analyticsRole?: string` and set `role` on every `TourEvent` when given; `openRecord(kind: string)`
- [X] T005 [P] In `packages/web-kit/src/tour/TourHelpButton.tsx` and `AllToursDialog.tsx`: list and offer only allowed tours (via `useTours().list`)
- [X] T006 Update `packages/web-kit/src/tour/engine.test.ts` and `packages/web-kit/src/tour/__tests__/TourProvider.test.tsx` to `roles` (step roles any-match; a role-limited tour neither starts nor lists; `role` on events when `analyticsRole` is set)
- [X] T007 Migrate shop-web: `apps/shop-web/src/routes/app.tsx` passes `roles={roles}`; `apps/shop-web/src/features/tours/tours.ts` uses `roles: ["shop_manager"]` where it had `managersOnly: true` (W4, OD11)

### Shared checks (research R8)

- [X] T008 Create `packages/web-kit/src/tour/testing.ts` (Node-only, imports `node:fs`/`node:path`): `checkToursAgainstSpec({ specPath, codeToKey, tours, roleMarks })` → list of differences (titles, texts, step count/order, `shownWhen`, and each step's `roles` against its "Shown when" mark through `roleMarks`, e.g. `{ "Admin or manager": ["admin","manager"], Admin: ["admin"], "Customer support": ["csa"] }`); `tourCoverage({ srcDir, kitDir, routesDir, navFile, tours, ignoreRouteFiles })` → the 106 guard's checks as data (routes without a tour, unknown keys, orphan tours, missing step keys, page-level keys not on their screen); `checkRoleFiltering({ tours, role, roleMarksAllowed })` → steps that would show to a role they are not marked for
- [X] T009 Rewrite `apps/shop-web/src/features/tours/tours.test.ts` and `tours.guard.test.ts` as thin callers of T008 (shop marks: `{ Manager: ["shop_manager"], "Manager, and something is refundable": ["shop_manager"] }`); run `pnpm --filter @effy/shop-web test` and `pnpm --filter @effy/web-kit test` until green

### Admin routes (research R3, contracts/tours-api.md)

- [X] T010 [P] Create `apis/edge-api/admin/src/functions/back-office-tours-v1-get.ts` and `back-office-tours-v1-patch.ts` (as 106's shop handlers, audience `'admin'`, problem type `tour-state-full`), and `back-office-tours-v1.test.ts` (401, 400, 409, 200 with audience always `'admin'`)
- [X] T011 Add `backOfficeToursV1Get` / `backOfficeToursV1Patch` at `/admin/v1/me/tours` with the authorizer `${ssm:/effy/${sls:stage}/staff/authorizer/back-office_id}` to `apis/edge-api/admin/serverless.yml`, beside `backOfficeMeV1`
- [X] T012 [P] Add `"admin/back-office-tours-v1-patch"` to `SILENT` in `apis/edge-api/shared/src/live/change-map.guard.test.ts` with its reason; add a 107 note to `docs/api/path-assignment.md`; confirm the staff gateway reads 210/300 in `gateway-capacity.contract.test.ts`

### Back-office wiring

- [X] T013 [P] Create `apps/back-office/src/features/tours/repo.ts`: `tourStateQueries({ load: GET /admin/v1/me/tours, save: PATCH })` with the back-office `api`
- [X] T014 Generate `apps/back-office/src/features/tours/tours.ts` (`BACK_OFFICE_TOURS = defineTours([...])`) from spec.md's 49 tables: keys per data-model.md; `path` / `search` per route (`/delivery` + `{ tab }`, `/customers` + `{ tab: "settings" }` for `points-settings`); `needsRecord` for record tours; tour `roles` for HS/IM/ID (`["admin","manager"]`) and TS/AA (`["admin"]`); step `roles` from each "Shown when" mark; `target` keys from the screen tasks below (BW: `null`, `nav`, `nav.exceptions`, `header.search`, `null`, `header.account`, `header.help`)
- [X] T015 Wire `apps/back-office/src/components/shell/AppShell.tsx`: `TourProvider` around `StaffShell` (`tours`, `roles={roles}`, `analyticsRole={roleLabel(roles) ?? undefined}`, `state`, `write`, `openRecord`, `onEvent={track}`, `devWarnings={import.meta.env.DEV}`), `headerActions={<TourHelpButton />}`, `<AllToursDialog />` in `overlays`
- [X] T016 [P] Add the four `tour_*` events with `role?: string` to `apps/back-office/src/lib/telemetry.ts`
- [X] T017 [P] `data-tour-above` on the root of `apps/back-office/src/components/shell/UpdateBanner.tsx`

**Checkpoint**: shop-web unchanged in behaviour and green; back-office has Help and the provider, but no page registers yet.

---

## Phase 3: User Story 1 - A new staff member learns a page by its tour (P1) 🎯 MVP

**Goal**: every back-office page and tab registers its tour and carries its keys.

**Independent test**: a person who has finished Welcome opens Orders; its tour starts by itself; reload, and it does
not start again.

Each task: `useTourPage(key, { status: tourStatus(mainQuery) })` in the screen (pages without a query: `"ready"`),
plus the keys for its steps.

### Operations

- [X] T018 [P] [US1] OV `overview`: `apps/back-office/src/features/overview/OverviewScreen.tsx`, `TodaysWindows.tsx`, `OnDuty.tsx`, `OrdersToday.tsx` - `page-title`, `overview.find`, `overview.attention`, `overview.windows`, `overview.duty`, `overview.today`, `overview.shortcuts`
- [X] T019 [P] [US1] OL `orders`: `apps/back-office/src/features/orders/OrdersListScreen.tsx` - `page-title`, `orders.views` (ViewSelect `tour`), `orders.search` (SearchBox `tour`), `orders.filters` (Sold as Facet), `list.col.<status id>`, `orders.desks` (the Dispatch / Courier parcels links)
- [X] T020 [P] [US1] OD `order`: `apps/back-office/src/features/orders/OrderDetailScreen.tsx` (+ `components/PackageRows.tsx`, `CustomerOrderPreview.tsx`) - `page-title`, `order.notice`, `order.packages`, `order.record` (first Record hand-over / arrival control), `order.items`, `order.delivery`, `order.payment`, `order.actions` (the header's action menu or bar), `order.customer-view`, `page-activity`
- [X] T021 [P] [US1] DS `dispatch`: `apps/back-office/src/features/dispatch/DispatchDayScreen.tsx`, `components/UnassignedPanel.tsx`, `WindowsByDay.tsx`, `RoundTable.tsx` - `page-title`, `dispatch.sections`, `dispatch.needs-driver`, `dispatch.assign` (first row's Assign), `dispatch.windows`, `dispatch.rounds`
- [X] T022 [P] [US1] RD `round`: `apps/back-office/src/features/dispatch/RoundDetailScreen.tsx`, `components/ReassignDialog.tsx` trigger, `WaiveSequenceButton.tsx` - `page-title`, `round.stops`, `round.arrows` (first stop's arrows), `round.reassign`, `round.take-back`, `round.go-ahead`
- [X] T023 [P] [US1] HR `handover-report`: `apps/back-office/src/features/reports/handovers/HandoverReportScreen.tsx` - `page-title`, `handovers.from`, `handovers.summary`, `handovers.by-shop`, `handovers.by-driver`, `handovers.problems`
- [X] T024 [P] [US1] CP `courier-parcels`: `apps/back-office/src/features/orders/CourierScreen.tsx` - `page-title`, `courier.stages`, `courier.service`, `courier.search`, `list.first-row`, `page-title`
- [X] T025 [P] [US1] EX `exceptions`: `apps/back-office/src/features/exceptions/ExceptionsScreen.tsx`, `SequenceSections.tsx` - `page-title`, `exceptions.kinds`, `exceptions.show`, `exceptions.search`, `exceptions.action` (first row's action), `exceptions.vehicles`, `page-title`
- [X] T026 [P] [US1] HS `hub-station`: `apps/back-office/src/features/hub/HubStationScreen.tsx` - `page-title`, `hub.scan`, `hub.incoming`, `hub.earlier`

### People

- [X] T027 [P] [US1] CU `customers` and CS `points-settings` (by `tab`): `apps/back-office/src/features/customers/CustomersScreen.tsx`, `components/PointsSettingsPanel.tsx` - CU: `page-title`, `customers.search`, `customers.ordered`, `list.col.<points id>`; CS: `page-title`, `points.value`, `points.expiry`, `points.credit-limit`, `points.hold`, `points.changes`
- [X] T028 [P] [US1] CD `customer`: `apps/back-office/src/features/customers/CustomerDetailScreen.tsx` - `page-title`, `customer.points`, `customer.credit`, `customer.remove`, `page-activity` (Points activity) or `customer.activity`, `customer.orders`
- [X] T029 [P] [US1] FB `feedback` and FD `feedback-item`: `apps/back-office/src/features/feedback/FeedbackListScreen.tsx`, `FeedbackDetailScreen.tsx`, `FeedbackPanel.tsx` - FB: `page-title`, `feedback.views`, `feedback.search`, `list.first-row`; FD: `feedback.details`, `feedback.status`, `feedback.reply`, `feedback.note`
- [X] T030 [P] [US1] DR `drivers` and DD `driver`: `apps/back-office/src/features/drivers/DriversListScreen.tsx`, `components/DutyPanel.tsx`, `ReadinessPanel.tsx`, `DriverDetailScreen.tsx`, `components/CapabilityEditor.tsx` - DR: `page-title`, `drivers.duty`, `drivers.readiness`, `drivers.views`, `drivers.search`, `list.col.<cleared id>`, `drivers.add`; DD: `page-title`, `driver.sections`, `driver.licence`, `driver.clearances`, `driver.grant`, `driver.employment`, `page-activity`
- [X] T031 [P] [US1] VL `vehicles` and VD `vehicle`: `apps/back-office/src/features/vehicles/VehiclesListScreen.tsx`, `VehicleDetailScreen.tsx`, `components/HoldingControl.tsx`, `VehicleStatusControl.tsx` - VL: `page-title`, `vehicles.views`, `vehicles.filters`, `vehicles.search`, `vehicles.add`; VD: `page-title`, `vehicle.details`, `vehicle.holder`, `vehicle.compliance`, `vehicle.status`, `page-activity`
- [X] T032 [P] [US1] SL `shops` and SD `shop`: `apps/back-office/src/features/shops/ShopsListScreen.tsx`, `ShopDetailScreen.tsx`, `ShopRoster.tsx`, `ShopStockPanel.tsx` - SL: `page-title`, `shops.views`, `shops.search`, `list.col.<label scanning id>`, `shops.create`; SD: `page-title`, `shop.sections`, `shop.details`, `shop.packing`, `shop.team`, `shop.stock`, `shop.danger`, `page-activity`

### Catalogue

- [X] T033 [P] [US1] PL `products` and PD `product`: `apps/back-office/src/features/products/ProductsListScreen.tsx`, `ProductScreen.tsx` - PL: `page-title`, `products.states`, `products.search`, `products.filters`, `list.col.<margin id>`, `list.row-select`, `products.add` (New product / Import a list); PD: `page-title`, `product.sizes`, `product.pictures`, `product.description`, `product.aisles`, `product.preview`, `product.facts`, `product.hold`, `page-activity`
- [X] T034 [P] [US1] PN `product-new` and PF `product-finish`: `apps/back-office/src/features/products/EffyProductScreens.tsx`, `EffyProductForm.tsx` (+ shared `product-form.*` keys from 106) - PN: `product-form.steps`, `product-form.shop`, `product-form.margin`, `product-form.price`, `product-form.send`; PF: `product-form.steps`, `product-form.send`
- [X] T035 [P] [US1] IM `imports` and ID `import`: `apps/back-office/src/features/products/ImportScreens.tsx` - IM: `page-title`, `imports.new`, `imports.aisles`, `imports.template`, `imports.list`; ID: `page-title`, `import.rows`, `import.problems`, `import.create`
- [X] T036 [P] [US1] RQ `review-queue` and RM `missing-details`: `apps/back-office/src/features/product-review/ReviewQueueScreen.tsx`, `MissingDetailsScreen.tsx` - RQ: `page-title`, `review.views`, `review.search`, `list.col.<waiting id>`, `review.start`, `review.set-margin`; RM: `page-title`, `missing.department`, `list.col.<missing id>`
- [X] T037 [P] [US1] RI `review-item`: `apps/back-office/src/features/product-review/ReviewItemScreen.tsx`, `ReviewChanges.tsx`, `ReviewVariants.tsx`, `MarginField.tsx`, `Placements.tsx` - `page-title`, `review.notice`, `review.changes`, `review.sizes`, `review.margin`, `review.pictures`, `review.placements`, `review.decision`, `review.prev-next`
- [X] T038 [P] [US1] TX `taxonomy`: `apps/back-office/src/features/taxonomy/TaxonomyScreen.tsx`, `CategoryTree.tsx`, `CategoryPanel.tsx`, `AttributeLibrary.tsx` - `page-title`, `taxonomy.views`, `taxonomy.tree`, `taxonomy.category`, `taxonomy.defaults`, `taxonomy.retire`, `taxonomy.attributes`
- [X] T039 [P] [US1] PR `promotions` and OR `order-rules`: `apps/back-office/src/features/promotions/PromotionsListScreen.tsx`, `OrderRulesScreen.tsx` - PR: `page-title`, `promotions.views`, `promotions.filters`, `promotions.search`, `promotions.links`, `promotions.create`; OR: `page-title`, `rules.minimum`, `rules.most-one`, `rules.most-different`, `page-title`
- [X] T040 [P] [US1] PE `promotion-editor` and PP `promotion`: `apps/back-office/src/features/promotions/PromotionEditorScreen.tsx`, `components/PromotionSummary.tsx`, `PromotionDetailScreen.tsx`, `components/PicturesSection.tsx`, `CodesPanel.tsx`, `PerformancePanel.tsx` - PE: `promo.basics`, `promo.applies`, `promo.kind`, `promo.who`, `promo.when`, `promo.limits`, `promo.combines`, `promo.summary`; PP: `page-title`, `promotion.status`, `promotion.sections`, `promotion.shown-in`, `promotion.pictures`, `promotion.codes`, `promotion.performance`, `page-activity`
- [X] T041 [P] [US1] PG `display-groups` and GD `display-group`: `apps/back-office/src/features/promotion-groups/PromotionGroupsScreen.tsx`, `PromotionGroupScreen.tsx`, `GroupLook.tsx` - PG: `page-title`, `list.col.<key id>`, `groups.new`; GD: `group.order`, `group.add`, `group.preview`, `group.look`
- [X] T042 [P] [US1] SK `skins` and SE `skin`: `apps/back-office/src/features/promotion-skins/SkinsListScreen.tsx`, `SkinEditorScreen.tsx`, `ReadabilityPanel.tsx`, `SkinUsage.tsx` - SK: `page-title`, `list.col.<looks id>`, `list.col.<used id>`, `skins.new`; SE: `skin.name`, `skin.background`, `skin.words`, `skin.button`, `skin.preview`, `skin.readability`, `skin.usage`

### Setup

- [X] T043 [P] [US1] DC/DK/DP/DW/DY/DH (by `tab`) in `apps/back-office/src/features/delivery/DeliveryScreen.tsx`, `coverage/CoveragePanel.tsx`, `PostcodeChecker.tsx`, `GroupsPanel.tsx`, `CourierPanel.tsx`, `CourierServicesPanel.tsx`, `pricing/PricingPanel.tsx`, `FeeSimulator.tsx`, `components/SlotsPanel.tsx`, `DeliveryDaysPanel.tsx`:
  - DC: `page-title`, `delivery.checker`, `delivery.postcodes`, `list.col.<distance id>`, `delivery.today`, `delivery.groups`, `delivery.add`
  - DK: `page-title`, `courier-setup.switch`, `courier-setup.route`, `courier-setup.excluded`, `courier-setup.services`
  - DP: `page-title`, `pricing.plans`, `pricing.activate`, `pricing.courier`, `pricing.simulator`
  - DW: `page-title`, `windows.table`, `windows.any-time`, `windows.new`, `windows.switch`
  - DY: `page-title`, `days.days`, `days.timings`, `days.drivers`, `days.runs`, `days.closed`
  - DH: `hub.location`, `hub.buffer`
- [X] T044 [P] [US1] TS `tax`: `apps/back-office/src/features/settings/tax/TaxSettingsScreen.tsx` - `page-title`, `tax.details`, `tax.fees`, `tax.invoices`
- [X] T045 [P] [US1] ED `deliverability` and EA `deliverability-address`: `apps/back-office/src/features/deliverability/DeliverabilityListScreen.tsx`, `DeliverabilityDetailScreen.tsx`, `components/RepairDialog.tsx` trigger - ED: `page-title`, `deliverability.views`, `deliverability.search`, `list.col.<account id>`; EA: `page-title`, `address.server-said`, `address.repair`, `address.events`
- [X] T046 [P] [US1] AA `admin-access`: `apps/back-office/src/features/staff-identity/AdminAccessScreen.tsx` - `access.yours`, `access.roles`
- [X] T047 [US1] Regenerate `apps/back-office/src/features/tours/tours.ts` with the final keys from T018–T046 (any `list.col.<id>` read from the screens); prettier on new files only

---

## Phase 4: User Story 2 - A tour shows each role only what applies to them (P1)

- [X] T048 [US2] `apps/back-office/src/features/tours/tours.test.ts`: `checkToursAgainstSpec` with the back-office code→key map (BW…AA, 49) and marks `{ "Admin or manager": ["admin","manager"], Admin: ["admin"], "Customer support": ["csa"] }`; expect no differences
- [X] T049 [US2] `apps/back-office/src/features/tours/tours.roles.test.ts`: `checkRoleFiltering` for `csa`, `manager` and `admin`; expect no step reaches a role it is not marked for; HS/IM/ID/TS/AA tours not allowed for `csa` (and TS/AA not for `manager`)

---

## Phase 5: User Story 3 - Anyone replays a tour (P1)

- [X] T050 [P] [US3] **Tour this page** / **All tours** in `apps/back-office/src/components/shell/CommandPalette.tsx` (keywords tour, help, guide; close first, start after)
- [X] T051 [P] [US3] `apps/back-office/src/features/tours/openRecord.ts`: 14 kinds + `finish` (research R6) via each feature's list query (first row) and `navigate`; a toast per kind when there is none; pass to `TourProvider`
- [X] T052 [US3] `apps/back-office/src/features/tours/tours.guard.test.ts`: `tourCoverage` over `apps/back-office/src/routes` (ignore `auth.tsx`, `__root.tsx`; the shell layout route), nav `components/shell/nav.ts`; expect no gaps; prove it by deleting one key

---

## Phase 6: User Story 4 - Tours on pages that change under them (P2)

- [X] T053 [US4] Confirm presence-based advancing on live pages: run `packages/web-kit/src/tour/__tests__/TourProvider.test.tsx` with a case that removes a step's element mid-tour (advance) and one that removes the last (end); add them if missing

---

## Phase 7: User Story 5 - The operator sees which tours help (P3)

- [X] T054 [US5] Covered by T004/T015/T016 (`analyticsRole` → `role` on events); add a provider test asserting `role` is present when set and absent when not

---

## Phase 8: Polish

- [X] T055 Run `pnpm --filter @effy/web-kit test`, `@effy/shop-web test`, `@effy/back-office test`, `@effy/back-office typecheck`, `@effy/back-office build`, `@effy/edge-shared test`, `@effy/edge-admin test`, `scripts/check-no-refresh-timers.sh`; fix until green (099's `package-status` guard excepted, as before)
- [X] T056 [P] `FEATURE-HISTORY.md` 107 entry and the `CLAUDE.md` feature line (operator order: `SERVICE=admin` → back-office, after 106's steps); memory note
- [X] T057 Hand the operator the quickstart walk (three roles), `specs/107-backoffice-guided-tours/quickstart.md`

---

## Dependencies & order

- T001 → T002–T009 (engine roles + shared checks; shop-web green) → T013–T017 (back-office wiring). T010–T012
  (admin routes) are independent of the web work.
- US1 screen tasks T018–T046 are parallel (different files), after T015. T047 after them.
- US2 (T048–T049) after T047. US3 T050/T051 after T015; T052 after T047.
- US4/US5 after T004.

## Parallel examples

```text
Foundation:  T005 Help/AllTours ∥ T010 admin handlers ∥ T013 repo ∥ T016 telemetry ∥ T017 UpdateBanner
Operations:  T018 overview ∥ T019 orders ∥ T021 dispatch ∥ T023 hand-over ∥ T025 exceptions ∥ T026 hub
People:      T027 customers ∥ T029 feedback ∥ T030 drivers ∥ T031 vehicles ∥ T032 shops
Catalogue:   T033 products ∥ T035 imports ∥ T036 review ∥ T038 taxonomy ∥ T039–T042 promotions
Setup:       T043 delivery ∥ T044 tax ∥ T045 deliverability ∥ T046 access
```

## Implementation strategy

1. **Foundation** (T001–T017): roles in the engine with shop-web still green, admin routes, back-office Help.
2. **MVP = US1 + US2 + US3**: every page tagged area by area (Operations first), the words and role tests, ⌘K and
   All tours. Run the coverage guard after each area so gaps never pile up.
3. US4/US5 checks, then polish and the operator steps: `SERVICE=admin`, then back-office.

# Tasks: Console Lists That Work the Same Everywhere

**Input**: `specs/103-console-data-tables/` — plan.md, spec.md, research.md (R1–R15), data-model.md,
contracts/list-contract.md (wire + per-endpoint table), contracts/data-table-ui.md (client layer), quickstart.md.

**Tests**: included where the plan names them — the shared helper's unit + guard tests, the data-table behaviour
tests, and one container test per converted list's SQL (page 1, last page, past the end, a tie at the page edge,
access scoping). Container tests need Docker Desktop and `DOCKER_CONFIG=$(mktemp -d)`.

**Mode of work**: Claude writes code; the operator runs the migration and deploys (quickstart §2–3). Do not commit.

**Every list conversion task means the same five things** (so they are not repeated per task):
(a) backend — the route parses params with `parseListQuery` (whitelisted sorts from the contract table, id
tie-break, the mode the contract table names) and returns `ListPage<T>`; any `LIMIT n` cap is removed;
(b) shared-types — the list's DTO uses `ListPage<T>`; (c) back-office/shop-web repo + `queries.ts` — `listQuery(...)`
with the key under the list's live root; (d) route — `validateSearch` from `defineListSearch(...)`; (e) screen —
`ListPage` + `DataTableToolbar` + `DataTable` with column defs at module scope carrying `EffyColumnMeta`
(columns, priorities, search, filters and sorts exactly as the spec's "The lists" row), deleting the screen's
own `Table`/`Pager`/cursor stack/`data-m`. Plus a container test for (a).

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Confirm staff-gateway headroom: run `pnpm --filter @effy/edge-shared test -- gateway-capacity` (apis/edge-api/shared/src/lib/gateway-capacity.contract.test.ts) and record staff/shared counts in specs/103-console-data-tables/research.md R11 (expected ≈ 203/300 staff; this feature adds 0 routes)
- [X] T002 Upgrade `@tanstack/react-table` to `9.3.x` (exact same version) in apps/back-office/package.json, apps/shop-web/package.json and packages/web-kit/package.json (both the dependencies and peerDependencies entries); `pnpm install`; read the v9 migration guide (https://tanstack.com/table/latest/docs/framework/react/guide/migrating) before T003
- [X] T003 Port the three v8 call sites to v9 (`useTable`, `tableFeatures`, `table.FlexRender`) with no behaviour change: apps/back-office/src/features/customers/components/PointsHistoryTable.tsx, apps/back-office/src/features/delivery/components/SlotsPanel.tsx, apps/back-office/src/features/delivery/pricing/PricingPanel.tsx; run `make bo-test && make bo-lint`
- [X] T004 [P] Add a guard that the three package.json files pin the same `@tanstack/react-table` version, in packages/web-kit/src/__tests__/tanstack-table-version.test.ts (the material3 lesson: one version per family)

---

## Phase 2: Foundational (blocks every story)

### Shared contract

- [X] T005 Create packages/shared-types/src/list.ts with `ListQuery`, `ListPage<T>`, `ListViews<V>`, `LIST_PAGE_SIZES = [25, 50, 100] as const`, `DEFAULT_PAGE_SIZE = 25`, `LIST_MAX_OFFSET = 10_000`, `LIST_COUNT_CAP = 10_000` per contracts/list-contract.md; export from packages/shared-types/src/index.ts; mark `PagedDTO<T>` in packages/shared-types/src/shop.ts `@deprecated` (`ListPage<T>` is a superset; each conversion moves its endpoint; removed in T061)

### Backend helper

- [X] T006 Create apis/edge-api/shared/src/lib/list-query.ts: `parseListQuery(event, spec)` (q trim/≤100/escape `%_\`, sort whitelist → default on unknown, dir, page ≥1, pageSize ∈ LIST_PAGE_SIZES else 25, cursor decode → first page on malformed, typed filters with unknown values collected into `ignored`, `views=only`), `orderBy(spec, sort, dir, idExpr)` (whitelisted expression + id in the same direction), `offsetClause`, `keysetClause(sortExpr, idExpr, dir, cursor, argIndex)` (row comparison), `encodeCursor/decodeCursor` (base64url JSON `[value, id]`), `cappedCountSql(innerSql)`, `toListPage(rows, …)` incl. the past-the-end fallback (shop orders' `full_count` pattern in apis/edge-api/shop/src/orders/repository.ts:188–222), and `ListQueryError("too_deep" | "validation")`; export from apis/edge-api/shared/src/index.ts
- [X] T007 [P] Unit tests in apis/edge-api/shared/src/lib/list-query.test.ts: every rule in contracts/list-contract.md "Request", cursor round-trip, malformed cursor → first page, unknown sort → default, offset > 10 000 → `too_deep`, `%`/`_` escaped
- [X] T008 [P] Guard apis/edge-api/shared/src/lib/list-query.guard.test.ts: scans every `apis/edge-api/*/src/**/repository.ts` and `*.sql.ts` (via `listStacks()` in shared/src/lib/serverless-stacks.ts for the service dirs) and fails (1) an `ORDER BY ${…}` interpolation not produced by `orderBy(`, (2) a list query (file exporting a function returning `ListPage`) whose ORDER BY does not end in an `id` column, (3) a literal `LIMIT <number ≥ 200>` in a list function; allow-list the kind-C/driver queries named in research R14 by file + reason
- [X] T009 Map `ListQueryError` to the error envelope (400 `validation`, 400 `too_deep` with "Narrow the search to see further.") — done as `listProblem(err, scope)` beside the helper in apis/edge-api/shared/src/lib/list-query.ts (handlers call it first in their catch), and emit `ListQueryDepthRefused` / `ListQueryParamIgnored` metrics via apis/edge-api/shared/src/lib/metrics.ts

### Client layer (`@effy/web-kit/data-table`)

- [X] T010 Create packages/web-kit/src/data-table/column-meta.ts: `EffyColumnMeta` (label, align, priority, phone, sortKey, identifying), the v9 module augmentation for column meta (verify the v9 typing route; if augmentation changed, type it through `createColumnHelper<Features, Row>()` and document which), helpers `priorityClass(priority)` (→ `max-lg:hidden` / `max-xl:hidden`) and `phoneAttrs(meta)` (→ `data-m`, `data-label`)
- [X] T011 Create packages/web-kit/src/data-table/list-search.ts: `defineListSearch<F>(spec)` → `validateSearch(raw)` (drops invalid values, never throws; `size` ∈ 25/50/100) and `toQuery(search)` → `URLSearchParams` matching contracts/list-contract.md
- [X] T012 Create packages/web-kit/src/data-table/use-list-state.ts: reads the route's search; `setQ` (local draft, writes after 250 ms idle with `replace: true`), `setFilter`/`setSort`/`setPageSize` (reset `page` to 1, clear the keyset stack), `next`/`back` (offset: page ±1 with push; keyset: push/pop cursor kept in router history state, `page` number in the URL for display, reload on keyset page > 1 → page 1 per research R3)
- [X] T013 Create packages/web-kit/src/data-table/list-query.ts: `listQuery(key, fetcher, params)` → `queryOptions` with `placeholderData: keepPreviousData`, the `signal` passed to `fetcher`, and `viewsQuery(key, fetcher, nonViewParams)` (`views=only`, `staleTime: 30_000`); plus `usePrefetchNext(query, …)` for offset mode; pass `signal` through the console fetch wrappers (apps/back-office/src/lib and apps/shop-web/src/lib api modules) if they do not already accept one
- [X] T014 Create packages/web-kit/src/data-table/hidden-columns.ts: `useHiddenColumns(app, listId)` over `localStorage` key `effy.table.<app>.<listId>.v1`, every read/write in try/catch, unknown ids ignored, identifying column never hidden
- [X] T015 Sort header: `DataTable` renders `TableSortHead` from @effy/design-system/ui directly for any column with `meta.sortKey` (asc→desc cycle, `aria-sort`) — no separate ColumnHeader file; Pagination.tsx ("1–25 of 312" / "10,000+", rows 25/50/100 Select, First/Back/Next/Last + "Page 3 of 13" in offset mode, Back/Next in keyset mode), ColumnMenu.tsx (DropdownMenu of `meta.label` checkboxes), DateRangeFacet.tsx (from/to with the design-system date field, writes two filter keys)
- [X] T016 Create packages/web-kit/src/data-table/DataTable.tsx: v9 `useTable` with `rowSortingFeature`, `rowPaginationFeature`, `columnVisibilityFeature`, `rowSelectionFeature` (only when `selection` is passed), `manualPagination/Sorting/Filtering`, `rowCount` (offset) or `pageCount: -1` (keyset), `getRowId: r => r.id`; renders on `Table*` primitives with sticky header, `priorityClass` + `phoneAttrs` on every cell, `ef-rtable` below md, row click + primary-cell `<Link>` from `rowHref`, J/K/Enter via `useHotkey`, skeleton rows on first load, `aria-busy` + 2 px progress bar while refetching, `ErrorState` with Retry, "No matches" + Reset vs `empty`, the `ignored` notice line, the pager as the frame's last child — all per contracts/data-table-ui.md
- [X] T017 Create packages/web-kit/src/data-table/ListPage.tsx (header → toolbar → frame; md+: frame `flex-1 min-h-0` with the body region scrolling, states centred in it; < md: natural height) and packages/web-kit/src/data-table/StaticTable.tsx (kind B: client `rowSortingFeature` + `createSortedRowModel()`, same cells/phone layout, no pager)
- [X] T018 Export the module as `@effy/web-kit/data-table` from packages/web-kit/package.json `exports` and packages/web-kit/src/data-table/index.ts; re-export `SearchBox`, `Facet`, `ViewSelect`, `ResetFilters` as `DataTableToolbar` parts from packages/web-kit/src/patterns/Toolbar.tsx (keep them in patterns)
- [X] T019 In packages/web-kit/src/console/StaffShell.tsx `<main>` gets the `ef-main` class; console.css holds it to the window only while it contains a ListPage (`.ef-main:has(> .ef-listpage)`, md+), so detail pages are unchanged
- [X] T020 [P] Behaviour tests packages/web-kit/src/data-table/__tests__/DataTable.test.tsx, list-search.test.ts, use-list-state.test.tsx, hidden-columns.test.ts — one test per bullet in contracts/data-table-ui.md "Behaviour"
- [X] T021 [P] Add any console-wide classes the module needs (progress bar, frame body region) to packages/design-system/src/console.css as `ef-*` (rule 1); run `pnpm --filter @effy/design-system test`

### Indexes

- [X] T022 Scaffold `make db-new NAME=console_list_indexes` → db/migrations/<ts>_console_list_indexes.sql with `-- +goose NO TRANSACTION` and the `CREATE INDEX CONCURRENTLY IF NOT EXISTS` set from data-model.md, each table/column name verified against db/migrations/20261023000000_baseline.sql and skipped where an equivalent index exists; hand to the operator (quickstart §2) — do not run

**Checkpoint**: shared contract, helper, client module, shell height and migration exist; no list converted yet.

---

## Phase 3: User Stories 1–3 (P1) — the MVP on two proof lists

**Goal**: one offset list and one keyset list show the whole behaviour: server search/filter/sort/page (US1),
the view in the URL (US2), filling the window (US3).

**Independent test**: quickstart §5 steps 1–3 on back-office Shops and Orders.

### Shops (offset proof)

- [X] T023 [US1] Convert apis/edge-api/admin/src/shops/repository.ts + service + apis/edge-api/admin/src/functions (shops list handler) to `parseListQuery` (sorts `code`, `name`; filter `status`; search code, name) and `ListPage`; container test in apis/edge-api/admin/src/shops/ (tie on `code` impossible — test the tie on `name`)
- [X] T024 [US1] [US2] [US3] Convert apps/back-office/src/features/shops/ShopsListScreen.tsx + repo.ts + queries.ts + apps/back-office/src/routes/shops.tsx (`validateSearch`) to the data-table module with the spec's Shops columns (Code 1 · Name 1 · Address 2 · Status 1 · Users 2 · Label scanning 3)

### Orders (keyset proof)

- [X] T025 [US1] In apis/edge-api/orders/src/orders/repository.ts replace `o.created_at < $cursor` with `keysetClause` on `(o.created_at, o.id)` (fixes the page-edge tie, FR-003) and add sort `total` keyset on `(o.grand_total_amount, o.id)`; add filters `status`, `shopId` (EXISTS on `shop_fulfillment`), `placedFrom`/`placedTo` to `baseWhere` so `viewCounts` honours them; capped total via `cappedCountSql`; service apis/edge-api/orders/src/orders/service.ts returns `ListPage`
- [X] T026 [P] [US1] Container test apis/edge-api/orders/src/orders/list.container.test.ts: two orders with identical `created_at` straddling a page edge both appear once; inserting newer orders between page requests repeats/skips nothing (FR-004); `shopId` and date filters; count capped at 10 000+
- [X] T027 [US1] [US2] [US3] Convert apps/back-office/src/features/orders/OrdersListScreen.tsx + model.ts + repo.ts + queries.ts + apps/back-office/src/routes/orders.tsx: q/view/delivery/sold/status/shop/placed range/sort/dir/page/size in `validateSearch`; spec Orders columns; keep J/K/Enter and the Dispatch / Courier parcels actions; delete the cursor stack and `useState` for q/rows

**Checkpoint (MVP)**: operator migrates + deploys `admin` and `orders` + back-office; walks quickstart §5 steps 1–3 on Shops and Orders.

---

## Phase 4: User Story 1 rollout + User Story 4 (P1/P2) — every list, right columns

**Goal**: every kind-A list in the spec's table on the module, with its spec columns, filters and sorts.

**Independent test**: for each list, quickstart §5 steps 1–4; columns compared to the spec row.

### Catalogue (service `catalog`)

- [X] T028 [P] [US1] [US4] Products: apis/edge-api/catalog/src/products/service.ts + repository.ts from offset-cursor to page+total (drop `decodeCursor`; `LIST_MAX_OFFSET`); apps/back-office/src/features/products/ProductsListScreen.tsx + repo.ts + queries.ts (`useInfiniteQuery` → `listQuery`) + apps/back-office/src/features/products/model.ts (`parseProductSearch` → `defineListSearch`); keep the selection bulk bar via `selection`
- [X] T029 [P] [US1] [US4] Review queue: apis/edge-api/catalog/src/review/ (keyset → offset; sorts `waiting`, `shop`; add `waitingSince` to the row); apps/back-office/src/features/product-review/ReviewQueueScreen.tsx + repo.ts + queries.ts + apps/back-office/src/routes/product-review.tsx — adds the **Waiting for** column
- [X] T030 [P] [US1] [US4] Missing details + Margin not set: apis/edge-api/catalog/src/products/ (missing-details) and apis/edge-api/catalog/src/review/ (margin-not-set) to offset with search and the spec's filters/sorts; apps/back-office/src/features/product-review/MissingDetailsScreen.tsx and the margin-not-set screen in apps/back-office/src/features/product-review/
- [X] T031 [P] [US1] Imports: apis/edge-api/catalog/src/imports/service.ts + repository.ts to page+total (search file, filters shop/state); the imports list in apps/back-office/src/features/products/ImportScreens.tsx (the per-import row table stays kind B)
- [X] T032 [P] [US7] Attribute library — reclassified a capped set (spec FR-024; the category editor's picker reads it whole): apps/back-office/src/features/taxonomy/AttributeLibrary.tsx onto `StaticTable` with search, status view and column sorting; its server cap is part of T055

### Fleet (service `fleet`)

- [X] T033 [P] [US1] Drivers: apis/edge-api/fleet/src/drivers/repository.ts + service.ts from keyset `(name,id)` to offset+total (search name, email; filters view, zone); apps/back-office/src/features/drivers/DriversListScreen.tsx + repo.ts + apps/back-office/src/routes/drivers.tsx
- [X] T034 [P] [US1] Vehicles: apis/edge-api/fleet/src/vehicles/repository.ts to offset+total (filters view, refrigeration, owner); apps/back-office/src/features/vehicles/VehiclesListScreen.tsx + repo.ts + apps/back-office/src/routes/vehicles.tsx

### Admin (services `admin`, `admin-promotions`)

- [X] T035 [P] [US1] Feedback: apis/edge-api/admin/src/feedback/repository.ts + service.ts keyset → offset (sorts received, rating); apps/back-office/src/features/feedback/FeedbackListScreen.tsx + repo.ts + queries.ts + apps/back-office/src/routes/feedback.tsx — spec columns incl. message excerpt (2)
- [X] T036 [P] [US1] Deliverability: apis/edge-api/admin/src/deliverability/repository.ts to `ListPage` (sort lastEvent); apps/back-office/src/features/deliverability/DeliverabilityListScreen.tsx + apps/back-office/src/routes/deliverability.tsx
- [X] T037 [P] [US1] Coverage postcodes: apis/edge-api/admin/src/delivery/coverage.repository.ts + coverage.service.ts cursor → offset (sorts postcode, distance; filters group, today); the postcode table in apps/back-office/src/features/delivery/coverage/CoveragePanel.tsx (`useInfiniteQuery` → `listQuery`; the tab's state in the /delivery route's search with a `cov.` prefix so it does not collide with other tabs)
- [X] T038 [P] [US1] [US4] Promotions: apis/edge-api/admin/src/promotions/promotion-repository.ts to `ListPage` with sorts start/end/used; apps/back-office/src/features/promotions/PromotionsListScreen.tsx + apps/back-office/src/routes/promotions.tsx; a promotion's codes and customers lists (apis/edge-api/admin/src/promotions/promotion-extras.ts; their tables in apps/back-office/src/features/promotions/) gain search by code/email

### Orders service

- [X] T039 [P] [US1] [US4] Customers browsable: apis/edge-api/orders/src/customers/repository.ts + service.ts — without `q` a page+total list (sorts joined, lastOrder, orders; filters hasOrdered, joined range; `orders_count`/`last_order_at` from one grouped sub-select excluding `pending_payment`), with `q` the same envelope; handler apis/edge-api/orders/src/functions/customers-v1-get.ts; apps/back-office/src/features/customers/CustomersScreen.tsx + repo.ts + apps/back-office/src/routes/customers.tsx — replace the recent/search split with one table (spec Customers columns)
- [X] T040 [P] [US1] Customer points: the shared `history` (apis/edge-api/shared/src/points/reads.ts) was already keyset on `(created_at,id)` but minted its cursor from a JS Date (millisecond) — fixed to Postgres text; the route stays the shared ledger (customer app too) and is exempt from the guard with that reason; apps/back-office/src/features/customers/components/PointsHistoryTable.tsx onto `StaticTable` with its "Show older"

### Shop detail (back-office)

- [X] T041 [P] [US1] Shop history: `GET /admin/v1/shops/{shopId}/audit` in apis/edge-api/admin/src/shops/ to keyset `(at,id)`; its table in apps/back-office/src/features/shops/ShopDetailScreen.tsx (`hist.` prefix)

### Shop console (service `shop`)

- [X] T042 [US1] Shop orders: apis/edge-api/shop/src/orders/repository.ts response → `ListPage` (+ keep `byTab`); apps/shop-web/src/features/fulfillment/components/OrderTable.tsx and its screen onto `DataTable` with `selection` (survives paging, cleared on filter change, FR-019); delete `SortTh`; keep row tones (`is-recent`/`is-unopened`) via a `rowClassName` prop on `DataTable`
- [X] T043 [P] [US1] Shop catalogue: apis/edge-api/shop/src/products/repository.ts → `ListPage`; apps/shop-web/src/features/catalog/CatalogListScreen.tsx + apps/shop-web/src/routes/catalog.tsx; replace `TableFrame`/`Th`/`Td`/`Tr` usage
- [X] T044 [P] [US1] [US4] Availability as a table: apis/edge-api/shop/src/availability/ + apis/edge-api/shop/src/functions/availability-v1-get.ts → `ListPage` (sorts stock, name; search name/your code; `lastChangedAt` on the row); apps/shop-web/src/features/catalog/AvailabilityScreen.tsx from `<ul>` to `DataTable` + apps/shop-web/src/routes/catalog.availability.tsx

**Checkpoint**: every list in the spec's table except the US5 caps runs on the module.

---

## Phase 5: User Story 5 (P2) — nothing silently missing

**Goal**: remove the fixed caps; every record reachable (FR-008). The loading/error/empty states already come with the module (T016).

**Independent test**: quickstart §5 step 5.

- [X] T045 [P] [US5] Courier parcels: drop `LIMIT 1000` in apis/edge-api/orders/src/orders/repository.ts (the handovers query near line 569) → offset+total with filters view (stage), serviceId and search order number/consignment reference; handler apis/edge-api/orders/src/functions/handovers-v1-get.ts; apps/back-office/src/features/orders/CourierScreen.tsx + repo.ts (`listCourierParcels`); container test with 1 500 parcels
- [X] T046 [P] [US5] Exceptions: drop `LIMIT 200` in apis/edge-api/fleet/src/exceptions/sql.ts → offset+total with filters kind, resolved and search; apps/back-office/src/features/exceptions/ExceptionsScreen.tsx + repo.ts (the sequence sections stay kind C); container test with 300 exceptions
- [X] T047 [P] [US5] Shop low stock: drop `LIMIT 500` in apis/edge-api/inventory/src/stock/repository.ts (low-stock query) → offset+total keeping the urgency order + id tie-break, for both `/inventory/v1/low-stock` (shop) and `/inventory/v1/admin/shops/{shopId}/low-stock` (staff); apps/back-office/src/features/shops/ShopStockPanel.tsx + stockQueries.ts onto `DataTable`
- [X] T048 [P] [US5] Variant stock history: `GET /inventory/v1/variants/{variantId}/stock?movements=page&cursor=` in apis/edge-api/inventory/src/stock/service.ts + repository.ts (`readMovements` keyset `(created_at,id)`, today a silent last-50); the stock response keeps the first page embedded; apps/shop-web/src/features/catalog/StockHistory.tsx + InventorySection.tsx + stockQueries.ts onto `DataTable` keyset with a reason filter
- [X] T049 [US5] Verify every list's query key starts with its live root and add missing ones to apps/back-office/src/features/live/routes.ts and apps/shop-web/src/features/live/routes.ts (e.g. feedback, deliverability, vehicles, shops, customers); extend each app's routes.test.ts

---

## Phase 6: User Story 6 (P3) — view counts in one call

**Independent test**: quickstart §5 step 6.

- [X] T050 [US6] Add `views=only` handling (`count(*) FILTER (WHERE …)` per view over the non-view `WHERE`) to the list routes with views: feedback (T035), drivers (T033), vehicles (T034), shops (T023), promotions (T038), deliverability (T036), review queue (T029), courier parcels (T045), exceptions (T046) — in each service's repository next to its list query; container-test that each count equals the opened view's `total`
- [X] T051 [US6] Wire `viewsQuery` into each of those screens' `ViewSelect`; delete the `useQueries(… limit: 1)` count fan-out in apps/back-office/src/features/feedback/FeedbackListScreen.tsx

---

## Phase 7: User Story 7 (P3) — bounded tables and capped sets

**Independent test**: quickstart §5 step 7; creating a 501st promotion group is refused with the sentence.

- [X] T052 [P] [US7] Order page sub-tables onto `StaticTable`: apps/back-office/src/features/orders/components/OrderItemsPanel.tsx, RefundsSection.tsx, PackageRows.tsx (package rows keep their expandable bag rows — use `StaticTable`'s `renderSubRow` or leave PackageRows on primitives with the shared cell helpers; decide in the task and note it), DeliveryHistory.tsx, DeliveryTypeSection.tsx
- [X] T053 [P] [US7] Product sub-tables: apps/back-office/src/features/products/ProductScreen.tsx (sizes), apps/back-office/src/features/product-review/ReviewVariants.tsx, apps/shop-web/src/features/catalog/VariantsSection.tsx (read-only display parts only; editors stay kind C)
- [X] T054 [P] [US7] Other bounded tables: apps/back-office/src/features/shops/ShopRoster.tsx, apps/back-office/src/features/deliverability/DeliverabilityDetailScreen.tsx, apps/back-office/src/features/promotions/components/PerformancePanel.tsx, apps/back-office/src/features/reports/handovers/HandoverReportScreen.tsx, apps/shop-web/src/features/insights/TopProducts.tsx, apps/shop-web/src/features/catalog/ReviewPanel.tsx, apps/shop-web/src/features/catalog/StockTable.tsx
- [X] T055 [US7] Capped sets (FR-024, R10): promotion groups (apis/edge-api/admin/src/promotion-groups/), skins (apis/edge-api/admin/src/promotion-skins/), courier services (apis/edge-api/admin/src/delivery/courier-services.service.ts), fee plans (apis/edge-api/admin/src/delivery/pricing.service.ts), shop team (apis/edge-api/shop/src/team/), attributes (`createAttribute` in apis/edge-api/shared/src/catalog/taxonomy.ts) — create refuses past 500 with 409 `limit_reached` and the contract sentence; list returns ≤ 501
- [X] T056 [US7] Their screens onto `StaticTable` with client search + sort and a "limit reached" line: apps/back-office/src/features/promotion-groups/PromotionGroupsScreen.tsx, apps/back-office/src/features/promotion-skins/SkinsListScreen.tsx, apps/back-office/src/features/delivery/coverage/CourierServicesPanel.tsx, apps/back-office/src/features/delivery/pricing/PricingPanel.tsx, apps/shop-web/src/features/team/TeamRoster.tsx

---

> **T052–T054, as built**: on `StaticTable` — order items, refunds issued, a product's sizes (back-office), review sizes, shop team, an address's delivery history (shows "The latest 50 events" when the service's 50 are full), the hand-over report's three tables. Kept on the primitives, deliberately: the bag table (each row carries the scan-to-find anchor and `aria-current`), the delivery-type and move logs (headerless timelines), shop-web `VariantsSection` (on-sale switches and remove in every row — an editor), `StockTable` (count entry — an editor), `ReviewPanel` (a review diff, out of scope), `PerformancePanel` (a metric matrix) and `TopProducts` (a ranked dashboard strip).

## Phase 8: Polish & cross-cutting

- [X] T057 Delete the replaced code: packages/web-kit/src/console/DataTable.tsx (+ its export in packages/web-kit/src/console/index.ts), `Pager` in packages/web-kit/src/patterns/Toolbar.tsx (+ patterns/index.ts), `TableFrame`/`Th`/`Td`/`Tr` in apps/shop-web/src/components/console/primitives.tsx; fix every import
- [X] T058 [P] Guard apps/back-office/src/__tests__/list-screens.guard.test.ts and apps/shop-web/src/__tests__/list-screens.guard.test.ts: a file under `features/**` importing `Table` from `@effy/design-system/ui` must be on the kind-C allow-list (the boards/editors named in the spec's Scope) — new lists must use `@effy/web-kit/data-table`; no `useInfiniteQuery` in a list screen; no hand-written `data-m=`
- [X] T059 [P] PostHog events `list_viewed {list, mode}` and `list_filtered {list}` in the typed taxonomy (packages/shared-types or the apps' telemetry module — follow where existing console events live), fired from `useListState`; no search text, no ids
- [X] T060 [P] Seed-volume generator for quickstart §4 in scripts/seed-list-volumes.sh (dev only, refuses any ENV but dev, ≥ 100 000 orders / 20 000 products); operator runs it
- [X] T061 Remove the deprecated `PagedDTO` alias from packages/shared-types/src/shop.ts once no import remains (`grep -rn PagedDTO apps packages apis`)
- [X] T062 Run the full local check list in specs/103-console-data-tables/quickstart.md §1 and fix failures
- [X] T063 FEATURE-HISTORY.md entry for 103 (what changed, the defects fixed, deploy order and the cosmetic old-console gap from quickstart §3, operator steps open) and the feature line in CLAUDE.md's "Features recorded" list; add to CLAUDE.md a short ⚠ rule: "every console list uses `@effy/web-kit/data-table` and `parseListQuery`; the URL is a list's state"
- [X] T064 Hand the operator: quickstart §2 (migration), §3 (deploys), §4 (EXPLAIN), §5 (walk)

---

## Dependencies & execution order

- **Phase 1 → Phase 2 → Phase 3 (MVP)**: strictly in order. T005 before T006/T010; T006 before every backend list task; T010–T018 before every screen task; T019 before US3 can be verified.
- **Phase 4–7** all depend on Phase 3 (the proof that the module and helper work end to end) but not on each other. Within Phase 4, the [P] tasks touch different services and screens and can run in parallel; T042 (shop orders) is not [P] because it changes `DataTable` (`rowClassName`).
- **T050–T051 (US6)** depend on the list tasks they extend.
- **T057, T058, T061** run last — they delete what Phases 3–7 replaced.
- Operator steps: migration (T022) before any deploy; backend services before consoles.

## Parallel examples

```text
Phase 2:  T007, T008 (backend tests)  ‖  T020, T021 (client tests, css)  — after T006 / T016
Phase 4:  T028 catalog-products ‖ T033 drivers ‖ T035 feedback ‖ T039 customers ‖ T043 shop catalogue
Phase 5:  T045 courier parcels ‖ T046 exceptions ‖ T047 low stock ‖ T048 stock history
Phase 7:  T052 order sub-tables ‖ T053 product sub-tables ‖ T054 other bounded tables
```

## Implementation strategy

1. **MVP = Phases 1–3**: the module, the helper, Shops and Orders. Ship to dev and walk before converting more —
   it proves offset and keyset, the URL state and the full-height frame on real data.
2. **Increment by domain** (Phase 4 groups), each deployable alone: catalog → fleet → admin → orders → shop.
3. Caps (US5), counts (US6), bounded tables (US7), then delete the old code and add the guards.

## Story → task map

| Story | Tasks |
|---|---|
| US1 consistent server lists (P1) | T023, T025–T026, T028–T044 |
| US2 view in the address (P1) | T011–T012, T024, T027 (+ every screen conversion) |
| US3 fills the window (P1) | T016–T017, T019, T024, T027 |
| US4 right attributes (P2) | T028–T030, T032, T038–T039, T044 (+ column defs in every conversion) |
| US5 nothing missing (P2) | T045–T049 |
| US6 counts in one call (P3) | T050–T051 |
| US7 bounded tables (P3) | T052–T056 |

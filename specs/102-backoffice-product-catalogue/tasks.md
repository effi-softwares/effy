# Tasks: Back-Office Product Catalogue (102)

**Input**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md),
[contracts/api.md](contracts/api.md), [quickstart.md](quickstart.md)

**Tests**: included — the plan's Testing section names them, and this repo proves every writer and guard
by test. Write each test task before the implementation it covers and see it fail.

**Paths**: `S` = `apis/edge-api/shared/src`, `C` = `apis/edge-api/catalog`, `SH` = `apis/edge-api/shop/src`,
`BO` = `apps/back-office/src`, `SW` = `apps/shop-web/src`, `T` = `packages/shared-types/src`,
`WK` = `packages/web-kit/src`. Packages: `@effy/edge-shared`, `@effy/edge-catalog`, `@effy/edge-shop`,
`@effy/shared-types`, `@effy/back-office`, `@effy/shop-web`.

⚠ Claude writes migrations, Terraform and source; the **user** runs `make migrate`, `make apply` and every
deploy (quickstart.md). Before touching `catalog` review code read FEATURE-HISTORY entries 067, 098, 101.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Re-count staff gateway routes with `pnpm --filter @effy/edge-shared vitest run gateway-capacity` and record the before figure in `specs/102-backoffice-product-catalogue/research.md` R1 (replace the ~195 estimate); stop and split `catalog` into a second stack (`serverless.products.yml`, the `admin-promotions` precedent) if the total after +15 would pass 75 %
- [X] T002 [P] Add `read-excel-file`, `write-excel-file`, `papaparse` (+ `@types/papaparse`) to `apps/back-office/package.json` at exact versions at least two weeks old; `pnpm install`

---

## Phase 2: Foundational (blocks every story)

- [X] T003 Write migration `db/migrations/<ts>_backoffice_product_catalogue.sql` per data-model.md: product columns `held_at`, `held_by`, `held_reason`, `held_prior_status`, `content_owner`, `created_via`, `import_id`; CHECKs `product_hold_shape_ck`, `product_held_not_active_ck`, `product_held_not_archived_ck`, `product_effy_owned_approved_ck`, `product_import_origin_ck`; tables `product_import`, `product_import_row`; indexes `product_held_idx`, `product_import_idx`, `product_updated_idx`, `product_variant_sku_lower_idx`; the four notification types added to `notification_request`'s type CHECK if one exists (check the baseline); goose Up and Down
- [X] T004 [P] Add `"products"` to `LIVE_KINDS` with a one-line comment in `packages/shared-types/src/live.ts`; update any fixture/guard listing the kinds (search `LIVE_KINDS` across the repo, including Kotlin twins if any)
- [X] T005 [P] Create `packages/shared-types/src/backoffice-products.ts` with `BackOfficeProductState`, `BACKOFFICE_PRODUCT_STATE_WORDS` (On sale · In review · Change pending · Held by Effy · Off sale · Draft · Archived), `BackOfficeProductListDTO`, `BackOfficeProductDTO`, `ProductHistoryEntryDTO`, `HoldRequest`, `ReleaseResultDTO`, `BulkProductRequest`, `BulkProductResultDTO`, `ProductImportDTO`, `ProductImportSummaryDTO`, `ImportTemplateDTO` exactly as contracts/api.md; export from `packages/shared-types/src/index.ts`
- [X] T006 Add `"products"` → `[["products"], ["product-review"]]` in `apps/back-office/src/features/live/routes.ts`, and `"products"` → the shop's product list/detail query keys in `apps/shop-web/src/features/live/routes.ts`
- [X] T007 Create `apis/edge-api/catalog/src/products/` with `errors.ts` (`ProductAdminError` kinds `validation | not_found | conflict`, conflict carries a `code`: `stale`, `already_held`, `not_held`, `archived`, `product_held`, `last_variant`, `not_effy_owned`, `shop_not_active`) and `handler-support.ts` (re-export `guard` from `../review/handler-support`, `mapProductAdminError` → problem+json with `code` and, for `stale`, `current`)

**Checkpoint**: migration written (user runs `make migrate ENV=dev` before any container test against dev; container tests apply it themselves).

---

## Phase 3: User Story 1 — See every product (P1) 🎯 MVP

**Goal**: Catalogue › Products lists every product of every shop with search, filters, tabs and counts; a product page shows everything; csa can view only.
**Independent test**: quickstart walk rows 1–5.

### Tests
- [X] T008 [P] [US1] Container test `C/src/products/list.container.test.ts`: seed 3 shops × products in every state (draft, sent back, in review, change pending, on sale, off sale, held, archived, Effy setting up); assert each appears once, `counts` per tab add up to `all`, every filter (q name, SKU case-insensitive, barcode, shopId, categoryId incl. descendants via `category_ancestor`, storage, margin set/not_set, missingDetails, lowStock) narrows correctly, keyset paging returns no duplicates across pages for each sort
- [X] T009 [P] [US1] Container test `C/src/products/list-perf.container.test.ts`: seed 50 000 products, run the list query with `EXPLAIN (ANALYZE)` for q, SKU, aisle and default sort; assert execution < 1000 ms (SC-002)
- [X] T010 [P] [US1] Container test `C/src/products/detail.container.test.ts`: detail returns overview, variants with codes/prices/stock, placements, `pendingChange`, history from `admin.audit_log` newest first with staff names resolved; 404 for unknown/invalid id

### Backend
- [X] T011 [US1] Implement `C/src/products/repository.ts`: `BACKOFFICE_STATE_SQL` (precedence per data-model.md), `listProducts(params)` (trigram text search on `product_search_trgm_idx`; `EXISTS` on `product_variant` for `lower(sku)` / `gtin` equality; `category_ancestor` join; lateral variant aggregate for from-prices, `priceVaries`, `lowStock`; missing-required via the same expression `listMissingDetails` uses in `C/src/review/repository.ts`; keyset cursor on (sort key, id); limit 50), `countProducts(params)` (one grouped query, same filters minus state), `readProductDetail(id)` (reuse `readProduct` + variant/detail/media readers from `C/src/review/repository.ts`), `readHistory(productId)` (audit_log joined to `admin.staff` for names)
- [X] T012 [US1] Implement `C/src/products/service.ts` `list(query)` (validate params, encode/decode cursor) and `detail(productId)` mapping rows → DTOs (picture URLs via `publicImageUrl`)
- [X] T013 [P] [US1] Handler `C/src/functions/products-list-v1-get.ts` (`guard` read)
- [X] T014 [P] [US1] Handler `C/src/functions/product-get-v1-get.ts` (`guard` read)
- [X] T015 [US1] Register `productsListV1` (`GET /catalog/v1/products`) and `productGetV1` (`GET /catalog/v1/products/{productId}`) in `apis/edge-api/catalog/serverless.yml` with the back-office authorizer, following the file's existing entries

### Back-office
- [X] T016 [P] [US1] `BO/features/products/repo.ts` (`listProducts`, `getProduct`) and `BO/features/products/queries.ts` (query keys under `["products", …]`)
- [X] T017 [P] [US1] `BO/features/products/model.ts`: search-param schema (q, shopId, categoryId, state, storage, margin, missingDetails, lowStock, sort, dir, cursor) with parse/serialise + unit test `model.test.ts`
- [X] T018 [US1] `BO/features/products/ProductsListScreen.tsx`: state tabs with counts, filter row (search input debounced, shop combobox from the shops query in `BO/features/shops/queries.ts`, aisle picker from the taxonomy query, storage/margin/missing/low-stock selects), TanStack Table with columns per FR-002, state pill using `BACKOFFICE_PRODUCT_STATE_WORDS`, row click → product page, "Load more" by cursor; all state in route search params; empty and error states via `@effy/web-kit/console`
- [X] T019 [US1] `BO/features/products/ProductScreen.tsx`: header (name, shop, state pill, created-via badge), tabs Overview · Sizes & stock · Details · Aisles · History as sectioned detail rows (no cards); a pending change links to `/product-review/$productId`; `BO/features/products/HistoryList.tsx`
- [X] T020 [US1] `BO/routes/products.tsx` (`/products` with `validateSearch` from model.ts, `/products/$productId`) and register them in the route tree where `productReview*` routes are registered
- [X] T021 [US1] Nav: add `{ key: "products-group", label: "Products", to: "/products", icon: Boxes, subs: [All products, Imports] }` first in the Catalogue group in `BO/components/shell/nav.ts`; add a chord if `BO/components/shell/chords.ts` lists one per area
- [X] T022 [P] [US1] "Products" link to `/products?shopId=…` on `BO/features/shops/ShopDetailScreen.tsx`
- [X] T023 [US1] Access: `BO/features/products/access.ts` (`canManageProducts(roles)` = admin|manager, mirroring `BO/features/product-review/access.ts`); every later action UI reads it

**Checkpoint**: US1 deployable alone (`SERVICE=catalog`, then back-office).

---

## Phase 4: User Story 2 — Hold a product off sale (P1)

**Goal**: Effy holds/releases with a reason; customers lose it; the shop cannot undo it and is told.
**Independent test**: quickstart walk rows 6–8.

### Tests
- [X] T024 [P] [US2] (Done inside `C/src/products/holds.container.test.ts`, "a held product can never be made active") Container test `S/catalog/hold-constraint.container.test.ts`: raw `UPDATE public.product SET status='active'` on a held product fails `product_held_not_active_ck`; same for `archived` (SC-004 at the database)
- [X] T025 [P] [US2] Container test `C/src/products/hold.container.test.ts`: hold needs reason (1–500); stale version → 409 `stale`; hold on-sale → `unavailable` + prior `active`; hold archived → 409; double hold → 409; release → prior status; release when prior `active` but no main picture → `unavailable` with reason `no_main_picture`; release when shop not active → `unavailable` `shop_not_active`; audit rows written; notification_request rows written for every active shop member; held while in review then approved → stays `unavailable` with prior `active`, release → `active`
- [X] T026 [P] [US2] Shop test `SH/products/held.container.test.ts` (plus `lifecycle.test.ts` unit cases): `changeStatus` to any status on a held product → `ProductError` conflict `product_held`; `setVariantState` to `active` → `product_held`; to `inactive` allowed; `updateProduct` on held approved product still creates a pending change; approving that change leaves the hold

### Implementation
- [X] T027 [US2] `S/catalog/variants.ts` `setVariantState`: read the product's `held_at` under the same lock; return new outcome `"held"` when `state === "active"` and held; add `"held"` to `SetVariantStateOutcome`
- [X] T028 [US2] `SH/products/service.ts` `changeStatus` and `setVariantState`: refuse while held (`ProductError("conflict", "product_held: Effy is holding this product — …")`) before any write; map the shared `"held"` outcome; `SH/products/repository.ts` `reviewFacts` returns `heldAt`
- [X] T029 [US2] `C/src/review/repository.ts` `approveNewProduct`: when the product is held, set `approved_at`/margin but leave `status`, and set `held_prior_status = 'active'` (R2)
- [X] T030 [US2] `C/src/products/repository.ts` `hold(tx, id, version, sub, reason)` / `release(tx, id, version)` (conditional UPDATE on `updated_at::text = version`, returning prior/new status; release checks primary image and shop status); `notifyShop(tx, type, shopId, productId, key)` modelled on `C/src/review/repository.ts` `notifyShop`, types `shop_product_held | shop_product_released` with reason in payload
- [X] T031 [US2] `C/src/products/service.ts` `hold` / `release`: validate, one transaction (lock, write, `audit` `product.held` / `product.released`, notify), then `announce([{scope:"staff", kind:"products"}, {scope:"shop", shopId, kind:"products"}])` after commit (match the `announce` call shape used in `SH/products/service.ts`); `emitMetric` `ProductHeld` / `ProductReleased`
- [X] T032 [P] [US2] Handlers `C/src/functions/product-hold-v1-post.ts`, `C/src/functions/product-release-v1-post.ts` (`guard` decide) and their entries in `apis/edge-api/catalog/serverless.yml`
- [X] T033 [US2] Notifications: add `shop_product_held` / `shop_product_released` templates and type handling in `apis/edge-api/notifications/` (find how `shop_product_sent_back` is rendered and mirror it; reason shown, attributed to "Effy")
- [X] T034 [US2] Shop DTO: `SH/products/types.ts` `ProductDetail`/`ProductListItem` gain `hold: { reason, heldAt } | null`; repository selects it; shop-web types follow in `SW/features/catalog/model.ts`
- [X] T035 [US2] shop-web: "Held by Effy" banner with the reason on `SW/features/catalog/ProductDetailScreen.tsx`, a held badge in `SW/features/catalog/components/ProductStatusBadge.tsx`, status and size on-sale controls disabled while held in `SW/features/catalog/ProductActions.tsx` / `statusControl.ts` / `VariantsSection.tsx`; error text for `product_held` in `SW/features/catalog/errorText.ts`
- [X] T036 [US2] Back-office: `BO/features/products/HoldDialog.tsx` (AlertDialog, reason textarea 1–500, version) and Release confirm, wired in `ProductScreen.tsx` header for `canManageProducts`; mutations in `queries.ts` invalidate `["products"]`; 409 `stale` re-reads and shows the current product

**Checkpoint**: deploy order `SERVICE=shop` → `SERVICE=notifications` → `SERVICE=catalog` → consoles.

---

## Phase 5: User Story 5 — Other controls, one or many (P2)

**Goal**: margin inline/bulk, placements, size on/off sale, stock — from the list and product page; bulk hold/release/margin with per-product results.
**Independent test**: quickstart walk row 9; size off sale leaves others buyable.

### Tests
- [X] T037 [P] [US5] Container test `C/src/products/bulk.container.test.ts`: 10 products across 2 shops, one stale and one archived → `done` 8, `refused` 2 with reasons; margin bulk re-prices each (`priceVariants`) and audits each; hold bulk writes one notification per shop (dedupe key = action id + shop)
- [X] T038 [P] [US5] Container test `C/src/products/variant-state.container.test.ts`: off sale ok and audited `product.variant_state_set`; on sale while held → 409 `product_held`; last active → 409 `last_variant`

### Implementation
- [X] T039 [US5] `C/src/products/service.ts` `setVariantState(productId, variantId, {state, version}, sub)` via shared `setVariantState` + audit + announce; handler `C/src/functions/product-variant-state-v1-post.ts` + serverless entry
- [X] T040 [US5] `C/src/products/service.ts` `bulk(body, sub)`: validate (1–200 items, action, reason/margin), loop items each in its own transaction reusing `hold`/`release`/review `setMargin` (call `C/src/review/service.ts` `setMargin` with `expectedCurrent` from the item), collect `done`/`refused`, group shop notifications per shop, one announce at the end; handler `C/src/functions/products-bulk-v1-post.ts` + serverless entry
- [X] T041 [P] [US5] `BO/features/products/MarginCell.tsx`: inline margin editor in the list's margin column and on the product header (reuse `BO/features/product-review/MarginField.tsx`), calls the existing margin route
- [X] T042 [P] [US5] `BO/features/products/BulkBar.tsx`: row selection in `ProductsListScreen.tsx`, actions Hold (reason) · Release · Set margin, result dialog listing refused products with reasons
- [X] T043 [US5] Product page Sizes & stock tab: per-size on/off sale toggle (new route) and stock adjust (reuse `BO/features/shops/stockRepo.ts` / `stockQueries.ts` against `inventory-staff`); Aisles tab reuses `BO/features/product-review/Placements.tsx`

---

## Phase 6: User Story 3 — Effy creates a product for a shop (P2)

**Goal**: staff create a product for an active shop with the shop's form; approved as made; Effy finishes it; on sale automatically once complete, then the shop's.
**Independent test**: quickstart walk rows 10–11.

### Extract the one writer (no behaviour change first)
- [X] T044 [US3] Move the shop's create and never-approved in-place edit (parse/validate/write: `createProduct` and the draft branch of `updateProduct`, their helpers `parseDetails`, `parseFacts`, `parseVariantSet`, `parseUnitBasis`, `leafOrError`, media normalisation) from `SH/products/service.ts` + `SH/products/repository.ts` into `S/catalog/authoring.ts` as `createProductContent(tx, {shopId, actor, body})` and `editDraftContent(tx, {productId, shopId, actor, body, expectedUpdatedAt})`, returning field issues in the existing shape; export from `S/catalog/index.ts`. The shop service calls them and maps errors as before. Run `pnpm --filter @effy/edge-shop test` — all green, no test changed but imports
- [X] T045 [P] [US3] `S/catalog/authoring.guard.test.ts`: fails any `INSERT INTO public.product\b` outside `authoring.ts` (and migrations/seeds)
- [X] T046 [US3] `authoring.ts` takes `actor: {kind: "shop"|"effy"|"import", sub}` and writes `created_by`, `created_via`, `import_id`; for `effy`/`import` it also takes `margin`, sets `approved_at = now()`, margin columns, `content_owner = 'effy'`, `status = 'unavailable'`, and prices variants (move or share `priceVariants` from `C/src/review/service.ts` into `S/catalog/` so both call one)

### Tests
- [X] T047 [P] [US3] Container test `C/src/products/effy-create.container.test.ts`: create without margin → 400; inactive shop → 409 `shop_not_active`; non-leaf → 400 `category_not_leaf`; complete at create → `on_sale`, `content_owner='shop'`, notification `shop_product_added_by_effy`, audit `product.created_by_effy` + `product.effy_completed`; incomplete → `draft` (Effy setting up), then PATCH adding a main picture completes it; PATCH after completion → 409 `not_effy_owned`; never appears in the review queue
- [X] T048 [P] [US3] Shop test `SH/products/effy-owned.container.test.ts`: while `content_owner='effy'` every shop write route (update, status, submit, withdraw, media create/register/patch/delete, sections, variant state) → 409 `effy_setting_up`; list/detail show `reviewState: "effy_setup"`, `createdBy: "effy"`

### Implementation
- [X] T049 [US3] `C/src/products/service.ts` `createForShop(body, sub)`, `editEffyOwned(id, body, sub)`, `completeIfReady(tx, id)` (submit rules from `SH/products/service.ts` `submitForReview` — move that rule into `authoring.ts` as `completenessIssues(tx, id)` so both call one); audits, notify, announce
- [X] T050 [US3] Media for Effy-owned products: `C/src/products/media.ts` adapter on the shared presign helper (`S/lib/media.ts`, `products/` prefix, same rules as `SH/products/media.ts`); register runs `completeIfReady`
- [X] T051 [P] [US3] Handlers + serverless entries: `C/src/functions/product-create-v1-post.ts` (`POST /catalog/v1/products`), `product-update-v1-patch.ts` (`PATCH /catalog/v1/products/{productId}`), `product-media-create-v1-post.ts`, `product-media-register-v1-post.ts`; add `s3:PutObject` on `products/*` to the catalog stack's IAM if absent
- [X] T052 [US3] Shop service: `REVIEW_STATE_SQL` gains `WHEN p.content_owner = 'effy' THEN 'effy_setup'` first; `ShopReviewState` gains `effy_setup`; DTOs gain `createdBy`; one `requireShopOwned(shopId,id)` check at the top of every write in `SH/products/service.ts`
- [X] T053 [US3] Notification template `shop_product_added_by_effy` in `apis/edge-api/notifications/`
- [X] T054 [US3] Move the product form to `WK/product-form/`: `ProductCreateFlow`, `create/*` (CategoryPicker, NameCategoryStep, DetailsStep, ReviewStep, StepTabs, ShopperPreview, RecategoriseDialog, steps), `VariantEditor`, `DetailField`, `FactsSection`, `ImageDropzone`, `MediaGallery` and their pure helpers (`draft.ts`, `validation.ts`, `variants.ts`, `detailFormat.ts`, `numberInput.ts`) from `SW/features/catalog/`, behind a `ProductFormAdapter` interface (load taxonomy, load form, presign, register, submit) supplied by each console; export as `@effy/web-kit/product-form`; shop-web imports it unchanged in behaviour (its tests green); move console-only styles to `packages/design-system/src/console.css` per the style rule
- [X] T055 [US3] `BO/features/products/NewProductScreen.tsx` (`/products/new`): shop picker (active shops), margin field (required, `MarginField`), then the shared form with a back-office adapter (`catalog` taxonomy routes + routes from T051); on save go to the product page
- [X] T056 [US3] Product page: when `contentOwner = 'effy'` show "Effy is setting this up — finish it to put it on sale" with the missing items and an Edit action opening the shared form against `PATCH`
- [X] T057 [P] [US3] shop-web: `effy_setup` state word and read-only detail ("Effy is setting this up"), "Added by Effy" badge in list and detail (`SW/features/catalog/components/ProductStatusBadge.tsx`, `ProductDetailScreen.tsx`, `CatalogListScreen.tsx`), error text for `effy_setting_up`

---

## Phase 7: User Story 4 — Import a shop's product list (P2)

**Goal**: download template, upload, every row checked (no writes), create ready rows, record kept, no duplicates.
**Independent test**: quickstart walk rows 12–14.

### Infrastructure (user applies)
- [X] T058 [US4] Terraform in `infra/envs/dev` (+ the module that owns the media bucket / queues): SQS `effy-<env>-product-import` + DLQ (maxReceiveCount 3), CloudWatch alarm on DLQ visible messages > 0 to the alerts topic, SSM params for both URLs/ARNs; media bucket lifecycle rule expiring `imports/` after 7 days; confirm `imports/` is NOT in `local.public_media_prefixes` and not in the bucket notification filter

### Tests
- [X] T059 [P] [US4] Unit test `S/lib/safe-fetch.test.ts`: refuses http, loopback, 10/8, 172.16/12, 192.168/16, 169.254/16, 100.64/10, ::1, fc00::/7, fe80::/10, redirect to a private host, > 3 redirects, > 10 MB, non-image bytes; accepts a public https JPEG (mock resolver + server)
- [X] T060 [P] [US4] Unit test `C/src/imports/rows.test.ts`: header mapping (known columns, `Detail: <name>`, unknown column → import error), grouping by Product key, disagreeing product-level cell → row problem, SKU required, duplicate SKU within file, price/weight/pack parsing, category by path or id
- [X] T061 [P] [US4] Container test `C/src/imports/import.container.test.ts`: 50 rows / 5 bad → after check 45 ready, 5 not_ready with named problems, zero products; create → 45 products `created_via='import'` linked to the import, audit + one `shop_products_imported` notification; rows without picture links → `draft` Effy setting up; running the worker's create twice creates nothing twice; second upload of the same file → `repeatOf` set and every row not_ready (SKU exists); a leaf retired between check and create → that product `left_out` with reason

### Implementation
- [X] T062 [P] [US4] `S/lib/safe-fetch.ts` per research R7 (DNS resolve + range check, manual redirects, streamed size cap, 15 s timeout, sniff via `S/lib/image-dimensions.ts`)
- [X] T063 [US4] `C/src/imports/rows.ts`: pure parsing/grouping/validation of the posted `columns`/`rows` into product inputs for `authoring.ts` (reuse `validateDetails`, `validateVariantSet`, `validateOptionsAgainstForm` from `@effy/shared-types`; resolve category paths against `category_resolved` paths; attribute names against the leaf's form)
- [X] T064 [US4] `C/src/imports/repository.ts`: insert import + rows, read import grouped by product key, state transitions guarded by `updated_at::text`, write row results, counts; shop-level SKU/GTIN existence lookup
- [X] T065 [US4] `C/src/imports/service.ts`: `start(body, sub)` (limits: ≤ 500 rows, known columns, active shop, margin required; `repeatOf` by `file_sha256`; enqueue `{importId, step:"check"}`), `list`, `get`, `create(id, version)` (state `checked` → `creating`; enqueue `create`), `template(categoryIds)`
- [X] T066 [US4] `C/src/imports/worker.ts` + `C/src/functions/product-import-worker.ts`: `check` step (validate each product, fetch pictures with concurrency 8 into `imports/<importId>/<row>/<n>.<ext>`, write results, state `checked`, announce); `create` step (each ready product in its own transaction via `authoring.ts` with actor `import`, copy staged pictures to `products/<shopId>/<productId>/…` then register media rows, `completeIfReady`, mark rows `created`/`left_out`; skip rows already `created`; state `done`, one shop notification, announce); unknown state → drop message
- [X] T067 [US4] Handlers + serverless entries: `imports-create-v1-post.ts` (`POST /catalog/v1/imports`, 202), `imports-list-v1-get.ts`, `import-get-v1-get.ts`, `import-create-v1-post.ts` (`POST /catalog/v1/imports/{importId}/create`, 202), `imports-template-v1-get.ts` (`GET /catalog/v1/imports/template` — register before `{importId}` and confirm the static path wins); worker function with the SQS event; IAM: `sqs:SendMessage` for the API functions, S3 `GetObject`/`PutObject` on `imports/*` and `PutObject` on `products/*` for the worker
- [X] T068 [US4] Notification template `shop_products_imported` (count only) in `apis/edge-api/notifications/`
- [X] T069 [P] [US4] `BO/features/products/importFile.ts`: read `.xlsx` (`read-excel-file`) / `.csv` (`papaparse`) to `{columns, rows}` of strings, SHA-256 via `crypto.subtle`; write the template `.xlsx` (`write-excel-file`) from `ImportTemplateDTO`; unit test with a fixture file
- [X] T070 [US4] `BO/features/products/ImportsScreen.tsx` (`/products/imports`): shop picker, margin, leaf multi-picker for the template, Download template, Upload → `POST /imports` → navigate to the import; history table (shop filter)
- [X] T071 [US4] `BO/features/products/ImportScreen.tsx` (`/products/imports/$importId`): state line (Checking… / Checked / Creating… / Done), repeat warning, products grouped Ready / Not ready with each row's problems, Create button (decide only, disabled unless `checked` with ready > 0), result summary with links to created products; re-reads on the `products` live kind (no polling)
- [X] T072 [US4] Product page and list: "Imported" badge with a link to the import (`createdVia`, `import`)

---

## Phase 8: Polish & cross-cutting

- [X] T073 [P] `change-map.guard.test.ts`: register every new writing route (hold, release, variant state, bulk, create, update, media register, imports create) with the `products` kind; run it
- [X] T074 [P] Re-run `gateway-capacity.contract.test.ts`; record the after figure in research.md R1
- [X] T075 [P] `scripts/check-no-refresh-timers.sh`, `pnpm --filter @effy/design-system test` (token usage in new screens), `check-shop-delivery-words.sh` (shop-web edits)
- [X] T076 [P] Metrics: `emitMetric` `EffyProductCreated`, `ImportRowsReady`, `ImportRowsNotReady`, `ImportRowsCreated` at the points in plan.md; confirm the worker's failure alarm is in Terraform
- [X] T077 `pnpm turbo typecheck lint test --filter=@effy/edge-shared --filter=@effy/edge-catalog --filter=@effy/edge-shop --filter=@effy/shared-types --filter=@effy/back-office --filter=@effy/shop-web --filter=@effy/web-kit` — all green
- [X] T078 Update `docs/api/path-assignment.md` (new `catalog` routes), `FEATURE-HISTORY.md` (102 entry: what changed, deploy order shop → notifications → catalog → consoles, Terraform before catalog, migration), `CLAUDE.md` feature list line and a short "Back-office products (102)" note under Catalogue (holds via status + CHECK; `authoring.ts` is the one writer of product content; `content_owner`)
- [X] T079 Fix `quickstart.md` package filter names to the real ones (`@effy/edge-catalog` etc.) and hand the operator steps to the user

---

## Dependencies

- Phase 1 → Phase 2 → stories.
- **US1** (Phase 3) needs Phase 2 only — the MVP.
- **US2** needs US1's repository/service files (T011–T012) and T007.
- **US5** needs US2 (`hold`/`release` reused by bulk) and US1 screens.
- **US3** needs Phase 2; T044 (extraction) blocks T046–T057; T054 (form move) blocks T055–T056.
- **US4** needs US3's `authoring.ts` with the `import` actor (T046) and `completeIfReady` (T049); T058 (Terraform applied by the user) before the worker can run in dev.
- Polish after the stories it touches.

```
Setup → Foundational → US1 → US2 → US5
                     ↘ US3 (T044 → …) → US4
```

## Parallel examples

- **US1**: T008, T009, T010 together; then T013 ‖ T014 ‖ T016 ‖ T017 ‖ T022 once T011–T012 land.
- **US2**: T024 ‖ T025 ‖ T026; T032 ‖ T033 ‖ T035 after T031.
- **US3**: T045 ‖ T047 ‖ T048 after T044; T051 ‖ T057 after T049.
- **US4**: T059 ‖ T060 ‖ T061 ‖ T062 ‖ T069; then T063 → T064 → T065 → T066.

## Implementation strategy

1. **MVP = US1** (T001–T023): back-office can see every product. Ship it (catalog + back-office).
2. **US2** next: the missing control. Deploy shop before catalog.
3. **US5**: gathers existing controls; low risk.
4. **US3**: start with T044 as a pure refactor commit-sized step, tests green, before any Effy behaviour.
5. **US4** last: Terraform first (user), then worker and screens.

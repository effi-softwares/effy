# Tasks: Product Variants with Variant-Based Stock and Pricing

**Input**: Design documents from `specs/098-product-variants/`
**Prerequisites**: plan.md, spec.md, research.md (R1–R18), data-model.md, contracts/api.md, quickstart.md

**Tests**: Included where the plan requires them (one-writer guards, the availability truth table,
SC-004 concurrency, unit-price fixtures, selector logic) — the house standard, not optional extras.

**Path shorthands**: `EA` = `apis/edge-api`, `ST` = `packages/shared-types/src`,
`CM` = `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile`,
`CW` = `apps/customer-web`, `SW` = `apps/shop-web/src/features`, `BO` = `apps/back-office/src/features`.

⚠ **The migration DROPS product's price/code/weight/stock columns (R14).** Phase 2 therefore rewires
EVERY reader of those columns before any story can be demonstrated; until Phase 2 is complete, nothing
runs against the new schema. Stories then add the variant behaviour on top.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup (schema and operator files)

- [X] T001 Write the dev purge script `db/reset/098_purge_catalogue_dev.sql`: `\set ON_ERROR_STOP on`, list every table that `TRUNCATE public.product, public."order", public.cart … CASCADE` would empty (query `pg_constraint` transitively) with row counts, then truncate in one transaction; header says dev only, operator-run (R14)
- [X] T002 Scaffold `db/migrations/<ts>_product_variants.sql` with `make db-new name=product_variants`; section 0: the empty-catalogue guard `DO` block from data-model.md §0
- [X] T003 In the same migration: create `public.product_option`, `public.product_option_value`, `public.product_variant` with every column, CHECK, unique (incl. `UNIQUE NULLS NOT DISTINCT (product_id, option1_value_id, option2_value_id)`, `UNIQUE (id, product_id)`), composite FK `(product_id, shop_id)` → `product(id, shop_id)`, indexes and `COMMENT ON` per data-model.md §2–4
- [X] T004 In the same migration: on `public.product` add `UNIQUE (id, shop_id)`, `unit_basis`, `list_price_amount`, `list_compare_at_amount`, `price_varies`; drop `sku, gtin, price_amount, compare_at_amount, shop_price_amount, shop_compare_at_amount, weight_grams, weight_is_assumed, stock_tracked, stock_on_hand, low_stock_threshold` with their constraints/indexes; rebuild the trigram index without `sku`; add index `(shop_id, status, list_price_amount, id)` (data-model.md §1)
- [X] T005 In the same migration: add `variant_id` + composite FK `(variant_id, product_id)` → `product_variant(id, product_id)` to `cart_item`, `cart_saved_item`, `order_item`, `stock_movement` (NOT NULL) and `customer_saved_item` (NULL; list entries reference the saved item); swap `cart_item`/`cart_saved_item` uniques to `(cart_id, variant_id)`; add `UNIQUE (order_id, variant_id)` and `variant_label, sku, gtin` to `order_item`; index every new FK (data-model.md §5)
- [X] T006 In the same migration: drop trigger `shop_ops_product_upd` from `product`, recreate it on `product_variant` `AFTER UPDATE OF stock_on_hand, low_stock_threshold, stock_tracked, state` calling a variant twin of `shop_ops_product_changed()`; keep a `product` trigger on `status`; write `-- +goose Down` that refuses (one-way, like 083)
- [X] T007 [P] Remove the product-insert section from `db/seeds/084_storefront_catalogue_dev.sql` (aisles stay) and write `db/seeds/098_variant_catalogue_dev.sql`: ~30 approved active products in an existing shop (stop if none), mixing no-option products, Size-only (with `unit_basis`/pack sizes) and Size×Flavour products, some variants tracked with low or zero stock, then call the listing summary SQL equivalent of `refreshListing` per product

---

## Phase 2: Foundational (blocking — the platform runs on the new schema)

### Shared contracts and rules

- [X] T008 [P] Create `ST/variants.ts` with `UnitBasis`, `PackUnit`, `VariantState`, `OptionDTO`, `OptionValueDTO`, `StorefrontVariantDTO`, `ShopVariantDTO`, `VariantInputDTO`, `OptionInputDTO`, `UnitPriceDTO` (contracts/api.md) plus pure `variantLabel(options, optionValueIds)` and `validateVariantSet(options, variants, unitBasis)` returning field errors for every rule in data-model.md §7; export from `ST/index.ts`
- [X] T009 [P] Create `ST/unit-price.ts` (`unitPriceCents`, `UNIT_BASIS_WORDS`, `packUnitCompatible`) and `packages/shared-types/unit-price.fixtures.json` (≥ 15 cases incl. kg↔100 g, l↔100 ml, each, half-up rounding, tiny packs); tests in `ST/unit-price.test.ts` and `ST/variants.test.ts`
- [X] T010 Update DTOs per contracts/api.md in `ST/catalog.ts` (remove moved fields; add `options`, `variants`, `unitBasis`; proposal keys), `ST/storefront.ts`, `ST/cart.ts`, `ST/order.ts`, `ST/saved-item.ts`, `ST/inventory.ts`, `ST/product-review.ts`, `ST/order-admin.ts`, `ST/shop-order-console.ts`, `ST/driver.ts` (optional `variantLabel`), and add the new types to `ST/customer-commerce-contract.ts`; regenerate `packages/shared-types/contract/*` with the existing generator scripts

### Edge-shared writers and rules

- [X] T011 Create `EA/shared/src/catalog/label.ts` (SQL fragment building the label from value names in option order + re-export of `variantLabel`) and `EA/shared/src/catalog/listing.ts` with `refreshListing(tx, productId)` (R4: min customer price among `state='active'` variants, its compare-at, `price_varies`)
- [X] T012 Create `EA/shared/src/catalog/variants.ts` `applyVariantSet(tx, productId, shopId, options, variants, unitBasis)` — validate with `validateVariantSet`, upsert options/values/variants by id, delete what a DRAFT no longer has / mark `removed` what an APPROVED product drops, resolve `mediaStorageKey` → `media_id`, map unique violations to field errors; export `catalog` from the package index (R6)
- [X] T013 Rewrite `EA/shared/src/lib/availability.ts`: `variantPurchasableSql(p, v)`, `productAvailableSql(p)`, `purchasable(status, state, tracked, onHand)`, `outOfStock(...)`, updated `AVAILABILITY_COLUMNS`; update `availability.test.ts` to run one truth table through all three forms and the storefront availability guard to accept only these (R5)
- [X] T014 Add guard tests in `EA/shared/src/catalog/catalog.guard.test.ts`: (a) only `listing.ts` writes `list_price_amount|list_compare_at_amount|price_varies`; (b) only `variants.ts` and the state route's repository write `product_option*`/`product_variant` rows other than stock columns; (c) no SQL under `EA/*/src` reads `p.(price_amount|compare_at_amount|shop_price_amount|sku|gtin|weight_grams|weight_is_assumed|stock_tracked|stock_on_hand|low_stock_threshold)` on a `product` alias
- [X] T015 Update `EA/shared/src/lib/margin.ts` callers' helper: add `priceVariants(tx, productId, margin)` in `EA/shared/src/catalog/variants.ts` that sets every variant's `price_amount`/`compare_at_amount` from `customerPrice` and calls `refreshListing` (R7)

### Rewire every reader of the dropped columns (single-variant-correct; stories add the rest)

- [X] T016 [P] Storefront: `EA/storefront/src/lib/cards.ts` reads `p.list_price_amount`/`p.list_compare_at_amount`, projects `productAvailableSql`, `price_varies`, `variant_count`, default `variant_id`; `search/filters.ts` sorts/filters on `list_price_amount` and `saleOnly` on `list_compare_at_amount > list_price_amount`, trigram without sku; `catalog`, `home`, `facets`, `suggest`, `search` repositories use the new predicates
- [X] T017 [P] Commerce cart + saved + lists repositories (`EA/commerce/src/cart/repository.ts`, `cart/service.ts`, `saved/repository.ts`, `functions/lists-v1-*.ts`): join `product_variant` for price, state, stock; cart rows keyed by `variant_id`
- [X] T018 Commerce checkout `EA/commerce/src/checkout/store.ts`: read lines by variant (variant price, weight; product GST and storage class), insert `order_item` with `variant_id, variant_label, sku, gtin`, write line discounts by `variant_id`; `EA/commerce/src/promotions/pricing.ts` sets `lineId = variantId` (R9, R10)
- [X] T019 Payments: `EA/shared/src/payments/finalize.ts` locks `product_variant` rows `ORDER BY id`, flags shortfall then deducts per variant, inserts `stock_movement` with `variant_id`; `EA/shared/src/payments/refunds/repository.ts` `returnStock` per `order_item.variant_id`; `EA/shared/src/lib/refund-proposals.ts` if it reads moved columns (R15)
- [X] T020 [P] Shop service readers: `EA/shop/src/{fulfillments,orders,pick-lists,today,insights,team-activity}/repository.ts` and `insights/rollup.ts` read sku/gtin/label from the `order_item` snapshot and stock from `product_variant`; pick shortfall in `fulfillments/repository.ts` zeroes the sold variant
- [X] T021 [P] Inventory: `EA/inventory/src/stock/{repository,service,types,authz,handler-support}.ts` operate on a variant id scoped through its product's shop; rename route paths in `EA/inventory/serverless.yml` and `serverless.staff.yml` and function files to `/variants/{variantId}/…` (contracts/api.md)
- [X] T022 [P] Fleet and driver: `EA/fleet/src/planner/sql.ts`, `planner/repository.ts`, `dispatch/sql.ts`, `dispatch/service.ts`, `dispatch/windows.ts` sum `oi.quantity * v.weight_grams` via `order_item.variant_id`; `EA/driver/src/work/sql.ts` reads the snapshot
- [X] T023 [P] Orders, catalog GST, promotions, documents, notifications, ops: `EA/orders/src/orders/{repository,service,refunds}.ts`, `orders/src/tax-settings/service.ts`, `EA/catalog/src/gst/service.ts`, `EA/shared/src/promotions/{candidates,product-offer}.ts`, `EA/admin/src/promotions/promotion-repository.ts` (target search matches variant SKUs via EXISTS), `EA/shared/src/documents/{delivery-note,tax-invoice,gst-status}.ts`, `EA/notifications/src/receipts/repository.ts`, `EA/ops/src/verify/{checkouts,webhooks}.ts`
- [X] T024 Run `pnpm -r typecheck` and every edge-api test suite incl. `CONTAINER_TESTS=1`; fix fixtures that insert products to insert a default variant through a shared test helper `EA/shared/src/catalog/test-fixtures.ts`

**Checkpoint**: the whole backend runs on the new schema with one variant per product.

---

## Phase 3: User Story 1 — A shop lists one product in several forms, approved once (P1) 🎯 MVP

**Goal**: shop-web creates products with 0–2 options and a variant grid; back-office approves with one margin; every variant is priced.
**Independent test**: quickstart walk rows 1–4.

- [X] T025 [US1] Shop product types and validation: `EA/shop/src/products/types.ts` and `handler-support.ts` accept `options`, `variants`, `unitBasis` on create/update, reject removed fields, cap sizes (FR-006)
- [X] T026 [US1] Shop product service/repository: `EA/shop/src/products/service.ts` + `repository.ts` create a product and its variant set in ONE transaction via `applyVariantSet`; a no-options create makes exactly one variant; draft updates write live via `applyVariantSet`; detail/list reads return `options`, `ShopVariantDTO[]`, `unitBasis`, `variantCount`, `priceVaries`
- [X] T027 [US1] Submission check in `EA/shop/src/products/service.ts`: refuse submit when any variant lacks a shop price or the set fails `validateVariantSet` (US1-6)
- [X] T028 [US1] Catalog review: `EA/catalog/src/review/{repository,service}.ts` return every variant with shop prices and resulting prices; approve calls `priceVariants` then sets status as today; the margin route `PUT /catalog/v1/products/{productId}/margin` reprices all variants (R7, FR-010/011)
- [X] T029 [P] [US1] Container tests `EA/shop/src/products/variants.container.test.ts`: create 0/1/2-option products, duplicate combination refused, 3rd option refused, duplicate SKU in shop refused naming `sku`, exactly-one option-less variant enforced by the index
- [X] T030 [P] [US1] Container test `EA/catalog/src/review/variants.container.test.ts`: approve with 10% → every variant priced, `list_price_amount`/`price_varies` correct; margin change reprices
- [X] T031 [P] [US1] shop-web pure logic `SW/catalog/variants.ts` (+ `variants.test.ts`): combinations from options, keep/remove rows, client-generated UUIDs, mapping to `VariantInputDTO`, errors via `validateVariantSet`
- [X] T032 [US1] shop-web `SW/catalog/OptionsEditor.tsx` (name + ordered values, reorder, max 2/20) and `SW/catalog/VariantGrid.tsx` (TanStack Table: label, SKU, barcode, price, compare-at, weight, pack qty/unit, picture picker, row order); single-variant form when no options
- [X] T033 [US1] Wire into `SW/catalog/ProductCreateFlow.tsx`, `ProductEditDialogs.tsx`, `ProductDetailScreen.tsx`, `CatalogListScreen.tsx` ("From $x", variant count), `repo.ts`, `queries.ts`, `model.ts`, `validation.ts`; unit basis picker on the product
- [X] T034 [US1] back-office `BO/product-review/{ReviewItemScreen.tsx, model.ts, MarginField.tsx, repo.ts}`: variant table with shop price → resulting price recomputed live from the margin input via shared `customerPrice`; model tests in `model.test.ts`

---

## Phase 4: User Story 2 — A shopper chooses a variant and buys exactly that (P1)

**Goal**: listings "From", product page selector, per-variant cart/order/saved/lists on customer-web and the app.
**Independent test**: quickstart rows 5–8, 11, 13, 14.

- [X] T035 [US2] Storefront detail `EA/storefront/src/catalog/repository.ts` + service: return `options`, active `variants` (label, prices, available, own image), `defaultVariantId` honouring `?variant=` (FR-014); search code match `EXISTS` on variant SKU/barcode sets card `variantId` (R13) in `EA/storefront/src/search/*`
- [X] T036 [US2] Commerce cart routes and service: rename `{productId}` → `{variantId}` in `EA/commerce/serverless.yml` and the cart/saved-for-later function files; `AddToCartRequest`/`CartLineInput`/reorder by `variantId`; refuse non-purchasable variant; `variant_unavailable` reorder skip; `CartLineDTO.variantLabel`
- [X] T037 [US2] Saved and lists: `EA/commerce/src/saved/{service,repository}.ts`, `functions/lists-v1-*.ts` store/update the remembered `variant_id`; add-to-cart from saved/list uses it or skips with `variant_unavailable` (FR-015a)
- [X] T038 [US2] Customer orders: `EA/commerce/src/orders/{repository,service}.ts` return `variantId`, `variantLabel` on `OrderItemDTO`
- [X] T039 [P] [US2] Commerce container tests `EA/commerce/src/cart/variants.container.test.ts`: two variants of one product = two lines; sold-out variant refused; promotion minQuantity counts across variants; checkout writes snapshots
- [X] T040 [P] [US2] customer-web selector logic `CW/lib/variant-selection.ts` (+ test): selectable/available per value given the other selection, default resolution
- [X] T041 [US2] customer-web `CW/app/(shop)/_components/VariantSelector.tsx` (button row per option, control radius, sold-out by text + line-through) and product page `CW/app/(shop)/product/[id]/page.tsx`: selection drives price, compare-at, image, add-to-cart target, URL `?variant=`
- [X] T042 [US2] customer-web cards and cart: `ProductCard.tsx`/`CardAdd.tsx` show "From" and switch quick-add to "Choose" when `variantCount > 1`; `AddToCartControl.tsx`, `MiniCartBody.tsx`, `cart/page.tsx` by variant with label; rename `CW/app/api/cart/items/[productId]` and `cart/saved/[productId]` route folders to `[variantId]`
- [X] T043 [US2] customer-web saved and lists: `SaveControl.tsx`, `AddToListButton.tsx`, `ListChooser.tsx`, `CW/app/api/saved/[productId]/route.ts` send the selected `variantId`; saved/list views show the label and the "choose again" path
- [X] T044 [US2] customer-web orders and receipt: `CW/components/receipt/*` and `CW/app/(account)` order views show `variantLabel`; `CW/lib/json-ld.tsx` emits `ProductGroup` for multi-variant products (R18)
- [X] T045 [P] [US2] customer app selector: `CM/core/presentation/VariantChips.kt` (chip row, storefront kit) and a pure `CM/features/catalog/domain/VariantSelection.kt` mirroring T040 with host tests
- [X] T046 [US2] customer app catalog: `CM/features/catalog/{data/CatalogMappers.kt, data/HttpCatalogRepository.kt, domain/Catalog.kt}` map options/variants; `presentation/ProductDetailViewModel.kt` holds `selectedVariantId`; `ProductDetailScreen.kt` shows chips; tiles show "From" and "Choose"; deep link `?variant=`
- [X] T047 [US2] customer app cart: `CM/features/cart/{data/HttpCartRepository.kt, data/CartLocalStore.kt, domain/*.kt, presentation/CartScreen.kt}` key lines by `variantId`, show labels; guest cart migrates by variant
- [X] T048 [US2] customer app saved/lists and receipt: `CM/features/saved/**` send/show remembered variant; `CM/features/checkout/{domain/Checkout.kt, data/CheckoutMappers.kt, presentation/ReceiptScreen.kt}` show `variantLabel`

---

## Phase 5: User Story 3 — Stock is counted per variant (P1)

**Goal**: tracking, deduction, shortfall, refund return, restock and attention lists, back-office correction per variant.
**Independent test**: quickstart row 9; SC-004.

- [X] T049 [US3] Inventory service per variant: `EA/inventory/src/stock/service.ts` + `repository.ts` — reads/writes `product_variant` stock, movements with `variant_id`, `LowStockRowDTO` with `variantId`/`variantLabel`; `EA/shared/src/lib/low-stock.ts` per variant; announce `stock` as today
- [X] T050 [US3] Today/attention and insights in `EA/shop/src/today/repository.ts` and `EA/shop/src/insights/*`: low/out rows per variant with label; per-product sales sum variants (FR-025)
- [X] T051 [P] [US3] Container tests: update `EA/inventory/src/stock/no-review.container.test.ts` and `append-only.guard.test.ts` for variants; new `EA/shared/src/payments/finalize-variants.container.test.ts` — two concurrent payments for the last unit of one variant never go below zero, other variants untouched, history sums to the count (SC-004)
- [X] T052 [US3] shop-web stock UI per variant: `SW/catalog/{InventorySection.tsx, StockDialogs.tsx, StockHistory.tsx, stockRepo.ts, stockQueries.ts, ShopDefaultThreshold.tsx}` — stock column in `VariantGrid`, dialogs open per row, history titled with the label; restock list rows show labels
- [X] T053 [US3] back-office `BO/shops/{ShopStockPanel.tsx, stockRepo.ts, stockQueries.ts}` per variant (+ update `ShopStockPanel.test.tsx`)

---

## Phase 6: User Story 4 — Unit prices (P2)

**Goal**: "$0.64 / 100 g" beside every shopper-visible price.
**Independent test**: quickstart rows 5–7 with pack sizes; SC-006.

- [X] T054 [US4] Server computes `unitPrice` with `unitPriceCents` in `EA/storefront/src/lib/cards.ts` (shown price), storefront detail (each variant), `EA/commerce/src/cart/service.ts` (effective unit price after the line's discount), saved/list DTOs
- [X] T055 [P] [US4] customer-web `CW/app/(shop)/_components/UnitPrice.tsx` using `UNIT_BASIS_WORDS`; place on card, product page, cart lines, saved items
- [X] T056 [P] [US4] customer app `CM/core/presentation/UnitPriceText.kt` + Kotlin `UnitBasisWords` pinned to `unit-price.fixtures.json` by a host test; place on tile, detail, cart, saved
- [X] T057 [US4] shop-web: basis on the product and pack quantity/unit in the grid validated by `packUnitCompatible` (FR-017), with the preview unit price per row

---

## Phase 7: User Story 5 — Everyone handling an order sees the variant (P2)

**Goal**: product name + variant label (and SKU/barcode for shops) on every order-line surface.
**Independent test**: quickstart row 10; SC-003.

- [X] T058 [P] [US5] shop-web order/pick/fulfilment views: `SW/fulfillment/**` (order detail lines, pick list print, packing) and `SW/today/**` show `variantLabel`, SKU and barcode; labels in `SW/fulfillment/labels/render.ts` line text if lines are printed
- [X] T059 [P] [US5] back-office order views `BO/orders/**` and refunds show `variantLabel`
- [X] T060 [P] [US5] Documents and email: `EA/shared/src/documents/{delivery-note,tax-invoice}.ts` line text "Name — Label"; `EA/notifications/src/receipts/sender.ts` and templates
- [X] T061 [P] [US5] Driver manifest: `EA/driver/src/work/sql.ts` returns optional `variantLabel`; `apps/driver-mobile` item line shows it when present (DTO field optional, no compatibility break)
- [X] T062 [US5] Test `EA/shop/src/orders/variant-lines.container.test.ts`: an order with two variants of one product yields two labelled lines in shop order detail, pick list, driver manifest and delivery note

---

## Phase 8: User Story 6 — Changing variants after the product is on sale (P3)

**Goal**: post-approval variant edits are proposals; deactivate/reactivate/remove are immediate.
**Independent test**: quickstart row 12.

- [X] T063 [US6] Proposals: `EA/shop/src/products/change.ts` — `TargetValues` gains `options`, `variants`, `unitBasis`; `diffProposal` includes them only when they differ (order-insensitive compare by id); `overlay` lays them over live; approval in `EA/catalog/src/review/service.ts` applies them via `applyVariantSet` then `priceVariants`
- [X] T064 [US6] Review diff rows `variantsAdded/Removed/Changed`, `optionsChanged` in `EA/catalog/src/review/service.ts`; back-office `BO/product-review/ReviewItemScreen.tsx` renders them as a table
- [X] T065 [US6] New route `POST /shop/v1/products/{id}/variants/{variantId}/state`: `EA/shop/src/functions/product-variant-state-v1-post.ts`, service rule `last_variant` 409, removal frees SKU, `refreshListing`, announce `stock`; add to `EA/shop/serverless.yml`; update `change-map.guard.test.ts` and the gateway capacity contract count
- [X] T066 [US6] Cart/saved effect: a deactivated/removed variant makes its cart line unavailable (existing notice path) and saved/list add-to-cart return `variant_unavailable` — cover in `EA/commerce/src/cart/variants.container.test.ts`
- [X] T067 [US6] shop-web: row actions Deactivate/Reactivate/Remove in `SW/catalog/VariantGrid.tsx` (confirm on remove), "Removed" section, pending-change overlay and banner in `ProductDetailScreen.tsx`/`ReviewPanel.tsx`
- [X] T068 [P] [US6] Container test `EA/shop/src/products/variant-change.container.test.ts`: live product — add variant + price change pend, shoppers see old; deactivate immediate; approval applies; last variant refused

---

## Phase 9: Polish & cross-cutting

- [X] T069 [P] Telemetry: EMF `VariantStateChanged{state}`, `ListingRefreshed` in the shop/catalog writers; PostHog `variant_selected`, `variant_add_to_cart` (customer-web + app taxonomy), `product_variants_saved` (shop-web)
- [X] T070 [P] Guards: run `scripts/mobile-guard.sh`, `scripts/check-no-refresh-timers.sh`, `pnpm --filter @effy/design-system test` (component shape: selector buttons not pills), `make gateway-usage`-equivalent contract test `gateway-capacity.contract.test.ts`
- [X] T071 Update docs: `docs/audiences/shop-capabilities.md` (variants, state route), `docs/api/path-assignment.md` (renamed inventory/commerce keys, new shop route), ARCHITECTURE.md note on the variant one-writers
- [X] T072 Add the 098 entry to `FEATURE-HISTORY.md` (what changed, defects found, verification counts, operator steps: purge → db-up → seeds → deploy order from plan.md) and the feature line in `CLAUDE.md`
- [X] T073 Run the full quickstart "Machine checks" block and record results; hand the operator the exact purge/migrate/seed/deploy commands

---

## Phase 10: Amendment — Effy codes and a clearer grid (FR-027, FR-028)

- [X] T074 Migration `db/migrations/20261027090000_variant_code.sql`: `product_variant.code` (V + 6, database default `public.new_variant_code()`, unique, checked, backfilled one row per statement) and `order_item.variant_code` (snapshot); format pinned in `packages/shared-types/src/package-code.ts` (`isVariantCode`) + test
- [X] T075 Code on the wire: `ShopVariantDTO.code`, `ReviewVariantDTO.code`, order line `variantCode` (shop console, fulfilment, pick lists, back-office orders); checkout snapshots it; storefront, shop product and promotion searches match it
- [X] T076 shop-web: Effy code in the grid and the Sizes table, "Your code" for the shop's own; codes shown "Effy · yours" on order, refund and printed pick lines (`fulfillment/codes.ts`); printed pick lists also name the size
- [X] T077 shop-web grid: column help, errors after leaving a cell or on Next/Save, "Apply first to all" for price and weight (`applyToAll` + tests)
- [X] T078 back-office: Effy code in the review sizes table ("On approval" for an added size) and on order lines

## Phase 11: Amendment — sizes are counted; stock always names its size (FR-029)

- [X] T079 `applyVariantSet` creates a variant tracked at 0; migration `20261028090000_variants_counted_by_default.sql` converts existing untracked sizes (with a `tracking_enabled` movement each); the dev seed counts every size
- [X] T080 shop-web stock dialogs name the size in their title; the header's Receive/Add stock chooses its size (`SizePicker`), never writing to an unchosen one; rules dialog named too
- [X] T081 Today's stock rows carry `variantId` (keyed per size; Restock opens `?size=`), and low/out-of-stock notification occurrences are keyed per size (`subjectKeyFor`) + test
- [X] T082 Printed pick lists (Today, order screen) name the size and its codes; stale "the platform has no variants" comments corrected

## Phase 12: Stock for every size in one table

- [X] T083 shop-web Inventory tab: `StockTable` — one row per size (Effy code, on hand, state in words, low-at), one input per row, "Add received" (adds, reason `received`) or "Set count" (replaces, reason `correction`; an unchanged count writes nothing), an uncounted size starts counting at its number, "Use first row for all", an optional note, ONE Save through the existing per-size routes; a refused size keeps its number and says why, saved ones clear (no double-add on re-save). Pure rules in `stockPlan.ts` + tests; movements and rules stay per size below the table

## Dependencies & Execution Order

- **Phase 1 → Phase 2 → stories.** Phase 2 is blocking: the dropped columns break every reader until T016–T024 are done.
- **US1** first (products must exist). **US2** and **US3** depend only on Phase 2 + US1's ability to create variants (or the 098 seed), and can run in parallel. **US4** needs US2's DTOs. **US5** needs Phase 2's snapshots only. **US6** needs US1.
- Within a story: backend → tests → web → mobile.

## Parallel examples

- Phase 2: T016, T017, T020, T021, T022, T023 (different services) once T008–T015 are done.
- US1: T029, T030, T031 together; then T032–T034.
- US2: T039, T040, T045 together; web (T041–T044) and app (T046–T048) in parallel.
- US5: T058–T061 all parallel.

## Implementation strategy

1. **MVP** = Phases 1–2 + US1 + US2 + US3: shops list variants, Effy approves, shoppers buy a chosen variant, stock is right.
2. Then US5 (pickers need labels before real orders), US4, US6.
3. Each checkpoint: typecheck + affected suites + the matching quickstart rows.

# Implementation Plan: Product Variants with Variant-Based Stock and Pricing

**Branch**: `dev` (feature directory `098-product-variants`) | **Date**: 2026-10-22 | **Spec**: [spec.md](spec.md)

## Summary

The **variant** becomes the unit that is bought, priced and counted. The **product** keeps what is
shared.

- **Model.** `product_option` (≤ 2), `product_option_value` (≤ 20 each) and `product_variant` (≤ 50).
  Each variant names its value ids, so a combination is unique by database constraint, and a product
  with no options has exactly one variant (R1, R2). Price, codes, weight, stock and pack size move off
  `product` onto the variant. The old columns are **dropped**, not duplicated, because the operator is
  resetting the data (R14).
- **References.** Carts, orders, stock history, saved items and lists add `variant_id` beside the
  `product_id` they already have, tied by a composite FK. Every product join keeps working (R3). Order
  lines snapshot the label, SKU and barcode (R9).
- **Price.** The margin stays one per product. Approval and the margin route price every variant (R7).
  The listing's "From" price is a summary on `product`, written by one function, so search sorting and
  filtering keep their index (R4).
- **Availability.** The one rule becomes a variant rule with a product form (an `EXISTS`). Cart and
  checkout refuse per variant; listings project and filter per product (R5).
- **Approval.** Edits to a draft write live rows. Edits to an approved product put the whole option and
  variant set into 067's `product_change`. Turning a variant on or off, or removing it, is immediate
  (R6, R8).
- **Promotions.** The engine is already line-based. The only change is that a line is now a variant
  (R10). Saved items and lists stay per product but remember a variant (R11).
- **Unit price.** One pure function and fixtures, computed by the server for every price it sends
  (R12).
- **Clients.** shop-web gets an options editor and a variant grid. back-office review shows every
  variant's resulting price. customer-web and the customer app get a selector and per-variant cart and
  saved items. Every line on shop, hub, driver, back-office and customer screens shows the variant
  label.

Decisions: [research.md](research.md) R1–R18. Data: [data-model.md](data-model.md). Contracts:
[contracts/api.md](contracts/api.md). Walk: [quickstart.md](quickstart.md).

## Technical Context

**Language/Version**:
- TypeScript: edge-api `shop`, `catalog`, `storefront`, `commerce`, `inventory`, `orders`, `driver`,
  `fleet`, `notifications`, `ops` and `shared`; `@effy/shared-types`; shop-web and back-office
  (React 19); customer-web (Next.js 16).
- Kotlin 2.4 / CMP: the customer app. The driver app needs no change, because its new field is optional.

**Primary Dependencies**: none new.

**Storage**: PostgreSQL 16. One goose migration, `<ts>_product_variants.sql`:
- it refuses to run unless the catalogue and orders are empty;
- three new tables;
- columns dropped from `product`;
- `variant_id` added to six tables;
- the 058 trigger moved.

Two operator SQL files:
- `db/reset/098_purge_catalogue_dev.sql` (new folder);
- `db/seeds/098_variant_catalogue_dev.sql` (and 084's product section removed).

**Testing**:
- vitest unit and container tests per service: the availability truth table in three forms,
  `refreshListing`, `applyVariantSet`, SC-004 concurrency per variant, promotions with two variants of
  one product;
- shared-types `unit-price.fixtures.json`;
- shop-web grid and validation tests;
- back-office review model;
- customer-web selector logic;
- KMP host tests: unit-price twin, `ProductDetailViewModel` selection;
- guard scripts.

**Target Platform**: Lambda behind the shared and staff gateways; browsers; Android and iOS (customer app).

**Project Type**: monorepo, with web, mobile and serverless parts.

**Performance Goals**:
- Listing and search reads keep their current latency. Price sort uses
  `(shop_id, status, list_price_amount, id)`. Availability is one indexed `EXISTS` per row.
- Product detail adds at most two small reads (options, variants), batched in the same round trip as
  today's attribute read.

**Constraints**:
- Hidden fulfilment: variant DTOs carry no shop.
- Money logic lives once: customer price comes from `margin.ts`, unit price from `unit-price.ts`.
- No refresh timers.
- Mobile: no drop-down menus and no centred dialogs. The selector is a chip row.
- Controls are never pills.
- No card layouts: the variant grid is a table.
- The shop mobile app is stopped and gets nothing.

**Scale/Scope**:
- Shared gateway: +1 route (variant state). Staff gateway: +0.
- Renamed route keys: commerce ×5, inventory ×10.
- About 45 backend files, 4 web apps and 1 mobile app.

## Constitution Check

| Principle | Verdict | Notes |
|---|---|---|
| I. Spec-driven | ✅ | Spec 098 with Clarifications 2026-10-22 ("From" = active, heart per product, no scan-to-pick). |
| II. Shared contracts | ✅ | All DTOs and the unit-price rule are in `@effy/shared-types` (`variants.ts`, `unit-price.ts` + fixtures). The variant writers (`applyVariantSet`, `refreshListing`) and the availability forms are in `@effy/edge-shared`. Kotlin DTOs are regenerated; the unit-price words have a Kotlin twin pinned to the same fixtures. |
| III. One backend | ✅ | Only existing services change. No new compute. +1 route on the shared gateway, 0 on staff. `admin` (at its resource limit) is untouched. |
| IV. Auth isolation | ✅ | The variant state route is behind the shop authorizer and scoped by the actor's shop, like every product route. Inventory keeps its two stacks and gates. A variant id from another shop gets the byte-identical "not found" (054's oracle rule). |
| V. Design | ✅ | shop-web: options editor + variant **table** (no cards). Selector: buttons with the control radius, sold-out shown by text and line-through, not by colour alone. Customer app: storefront kit chip row; sheets only. No new tokens. |
| VI. Layering | ✅ | handler → service → repository. Pure functions: label, combination validation, diff, `unitPriceCents`. One writer each for variants and for the listing summary. Guard tests enforce both. |
| VII. Observability | ✅ | EMF: `VariantStateChanged{state}`, `StockDeducted` keeps its outcome dimension (now per variant line), `ListingRefreshed`. PostHog: `variant_selected`, `variant_add_to_cart`, `product_variants_saved` (shop), with no PII. |
| Real-world identifiers | ✅ | None introduced. |
| Hidden fulfilment | ✅ | Variant DTOs to shoppers carry no shop id. A package key on cart lines is unchanged. |

Post-design re-check: ✅. No violations; no complexity table.

## Project Structure

### Documentation (this feature)

```text
specs/098-product-variants/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md
├── contracts/api.md
├── checklists/requirements.md
└── tasks.md            (/speckit-tasks)
```

### Source code

```text
db/migrations/<ts>_product_variants.sql                                              NEW
db/reset/098_purge_catalogue_dev.sql                                                 NEW (operator, dev only)
db/seeds/098_variant_catalogue_dev.sql (NEW) ; db/seeds/084_storefront_catalogue_dev.sql (product section removed)

packages/shared-types/src/{variants.ts, unit-price.ts}(NEW), unit-price.fixtures.json(NEW)
packages/shared-types/src/{catalog, storefront, cart, order, saved-item, inventory, product-review,
                           order-admin, shop-order-console, driver, customer-commerce-contract, index}.ts
packages/shared-types/contract/*                                                     regenerated

apis/edge-api/shared/src/catalog/{variants.ts, listing.ts, label.ts}(NEW)   applyVariantSet, refreshListing, variantLabel
apis/edge-api/shared/src/lib/{availability.ts, low-stock.ts, refund-proposals.ts}
apis/edge-api/shared/src/payments/{finalize.ts, refunds/repository.ts}            per-variant lock, flag, deduct, return
apis/edge-api/shared/src/promotions/{candidates.ts, product-offer.ts}             list price; lineId = variant
apis/edge-api/shared/src/documents/{delivery-note.ts, tax-invoice.ts, gst-status.ts}

apis/edge-api/shop/src/products/{types, change, service, repository, handler-support}.ts ; functions/product-variant-state-v1-post.ts(NEW)
apis/edge-api/shop/src/{orders, pick-lists, fulfillments, today, insights, team-activity}/repository.ts (+ insights/rollup.ts)
apis/edge-api/catalog/src/{review/*, gst/service.ts}                                variants in item, diff, approve, margin
apis/edge-api/storefront/src/{lib/cards.ts, catalog, search (+filters.ts), facets, home, suggest}/*
apis/edge-api/commerce/src/{cart, checkout/store.ts, promotions/pricing.ts, saved, orders, functions/lists-*}/*
apis/edge-api/inventory/src/stock/*, serverless.yml, serverless.staff.yml          per variant; route keys renamed
apis/edge-api/orders/src/orders/{repository, service, refunds}.ts ; tax-settings/service.ts
apis/edge-api/driver/src/work/sql.ts ; fleet/src/{planner, dispatch}/sql.ts        variant label; variant weight
apis/edge-api/notifications/src/receipts/{repository, sender}.ts ; ops/src/verify/*

apps/shop-web/src/features/catalog/{OptionsEditor.tsx, VariantGrid.tsx, variants.ts(+test)}(NEW),
    ProductCreateFlow, ProductEditDialogs, ProductDetailScreen, CatalogListScreen, InventorySection,
    StockDialogs, StockHistory, stockRepo, repo, model, validation, review*
apps/shop-web/src/features/{orders, fulfillment, today}/*                            variant label on lines
apps/back-office/src/features/product-review/{ReviewItemScreen, model, MarginField}.tsx/ts
apps/back-office/src/features/{shops/ShopStockPanel, orders, promotions}/*           per-variant stock; labels; target search
apps/customer-web/components/storefront/{VariantSelector.tsx, UnitPrice.tsx}(NEW), product card, cart, saved, lists
apps/customer-web/app/(shop)/product/[id]/page.tsx ; app/api/cart/items/[variantId]/*, app/api/cart/saved/[variantId]/* (renamed)
apps/customer-web/lib/json-ld.tsx                                                    ProductGroup
apps/customer-mobile/shared/.../features/{catalog, cart, saved, checkout, account(orders)}/*  selector, per-variant cart
apps/customer-mobile/shared/.../core/presentation/VariantChips.kt(NEW), UnitPriceText.kt(NEW)
```

**Structure decision**: the existing monorepo layout. One new shared-library folder
(`edge-shared/catalog`); everything else changes in place.

## Implementation notes

- **Migration order inside the file**:
  1. the empty-catalogue guard;
  2. the new tables;
  3. drop and add on `product`;
  4. referencing columns, composite FKs and unique swaps;
  5. move the trigger;
  6. comments.
  There are no backfills.
- **`applyVariantSet(tx, productId, options, variants, mode)`** is the only `INSERT`/`UPDATE`/`DELETE` of
  options, values and variants (except the state route and stock columns). It validates with the pure
  rules in `shared-types/variants.ts`, so shop-web shows the same refusals before saving.
- **`refreshListing(tx, productId)`** runs after every price or state write. Guard test: no other
  statement writes `list_price_amount`, `list_compare_at_amount` or `price_varies`.
- **Guard test for the dropped columns**: no SQL string in `apis/edge-api` references
  `p.price_amount`, `p.sku`, `p.gtin`, `p.weight_grams` or `p.stock_*` on a `product` alias. Container
  tests prove the same at runtime.
- **Checkout**: `store.ts` reads lines by variant, using the variant price and weight with the product's
  GST and storage class. It writes `order_item` with `variant_id`, `variant_label` (via the same
  `variantLabel` function), `sku` and `gtin`. Line discounts are written by `variant_id`.
- **Finalize**: the lock-then-read stays (070). It locks `product_variant` rows `ORDER BY id`, flags the
  shortfall before deducting (054), and inserts movements with `variant_id`.
- **Storefront detail**: one extra query returns options and values with variants as JSON, combined
  with the existing attribute read. `defaultVariantId` is the named active variant, else the first
  purchasable by position, else the first active.
- **Selector logic** (web and mobile, mirrored): given the selected values, a value is *selectable* if
  some active variant has it together with the other selected value. It is *available* if that variant
  is purchasable. Each client implements this as a small pure function with tests. It decides
  presentation only; the server refuses an unpurchasable variant regardless.
- **shop-web grid**: options editor on top. "Generate combinations" fills missing rows, which the
  operator can delete. Inline cells for SKU, barcode, price, compare-at, weight and pack size. Picture
  picker from the gallery. Stock opens 054's dialogs per row. Rows for removed variants are collapsed
  under "Removed". A product with no options shows the single-variant form.
- **Pending changes**: the shop's detail screen overlays `proposed.variants` and `proposed.options`
  as 067 overlays other fields, so the operator edits the version they proposed.
- **Customer app**: `ProductDetailViewModel` holds `selectedVariantId`. Cart and saved repositories
  switch to variant ids. Order history shows labels. Deep links `/product/{id}?variant=` are honoured.

## Deploy order

1. Commit, then **operator**: run the purge script (dev), then `make db-up ENV=dev`, then the 084 aisles
   seed and the 098 seed.
2. `make edge-deploy` for `storefront`, `commerce`, `shop`, `catalog`, `inventory`, `inventory-staff`,
   `orders`, `driver`, `fleet`, `notifications`, `admin-promotions` (its product search reads the variant
   SKU), in that order. The migration drops columns
   every one of them read, so **all of them must deploy before dev is used**. Old code fails loudly
   against the new schema rather than doing anything wrong.
3. shop-web, then back-office, then customer-web.
4. The customer app build. It ships together with `commerce`/`storefront`; the old build cannot add to
   the cart (renamed keys), which is accepted because the app is not publicly released.
5. Walk [quickstart.md](quickstart.md).

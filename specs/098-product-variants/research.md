# Research - 098 Product Variants

Each decision: **Decision / Rationale / Alternatives**. The external survey that started this feature
(Shopify, eBay, WooCommerce, grocery storefronts, the ACCC unit-pricing code) is summarised in the spec's
"Why this feature exists"; this file records how it lands in Effy's code.

## R1 - Options, values and variants are three tables; a variant names value ids

**Decision**: `product_option` (≤ 2 per product, positioned), `product_option_value` (ordered, per
option), `product_variant` with `option1_value_id` / `option2_value_id` and
`UNIQUE NULLS NOT DISTINCT (product_id, option1_value_id, option2_value_id)`.

**Rationale**: Renaming a value ("1kg" → "1 kg") renames it on every variant at once; the combination
uniqueness (FR-003) is a database fact; the selector's value order is the shop's, stored once. The
label (FR-005) is derived from value names in option order - never stored on the live variant (stored
only as an order-line snapshot, R9).

**Alternatives**: Shopify-style `option1/option2` TEXT on the variant - a rename touches every row and
typos make two values; a jsonb options blob on the product - uniqueness and the composite FKs in R3
become application rules.

## R2 - Every product has ≥ 1 variant; a product without options has exactly one

**Decision**: Enforced by the ONE writer (R6) and asserted by a container test; not by a trigger (house
style: no triggers for business rules). A product with no options has one variant whose two value ids
are NULL - the unique index then allows exactly one such row.

**Rationale**: `NULLS NOT DISTINCT` gives "exactly one option-less variant" for free. "At least one" is
the creation transaction's job: product and its variants are written in one transaction.

**Alternatives**: a deferred constraint trigger - the only enforcement that is a database fact, but it
is the platform's first deferred trigger and the writer is single.

## R3 - Referencing tables carry `(variant_id, product_id)` with a composite FK

**Decision**: `product_variant` has `UNIQUE (id, product_id)`. `cart_item`, `cart_saved_item`,
`order_item`, `stock_movement`, `customer_saved_item` keep their `product_id` and
add `variant_id` with `FOREIGN KEY (variant_id, product_id) REFERENCES product_variant (id, product_id)`
(nullable `variant_id` on the saved item, R11).

**Rationale**: ~45 queries join these tables to `product` by `product_id` for name, category, brand,
promotion targeting and shop. Keeping `product_id` leaves those joins correct; the composite FK makes it
impossible for the pair to disagree.

**Alternatives**: replace `product_id` with `variant_id` everywhere and join through the variant - every
one of those queries changes for no gain, and promotion targeting by product gets a join on the hot path.

## R4 - Listing price lives on the product as a maintained summary, written by one function

**Decision**: `product.list_price_amount`, `product.list_compare_at_amount`, `product.price_varies` =
the lowest customer price among ACTIVE variants (and that variant's compare-at), and whether active
prices differ. Written ONLY by `refreshListing(tx, productId)` in `@effy/edge-shared/catalog`, called in
the same transaction as every write that changes a variant's customer price or state (approval, margin
change, activate/deactivate/remove). A guard test fails any other `UPDATE` of these columns.

**Rationale**: Search and aisle reads sort, filter (`minPrice`/`maxPrice`/`saleOnly`) and page by price
with a keyset on `(price, id)` (`search/filters.ts`). A per-row aggregate over variants defeats that
index and puts the 029 timeout back. Prices change only at approval or margin time - rarely - and FR-013
deliberately uses ACTIVE (not in-stock) variants, so a sale at payment never touches the summary.

**Alternatives**: `LATERAL (SELECT min(...))` per listing - correct, but sorting a 10k-product aisle by
price would aggregate every variant of every product; a materialised view - refresh timing becomes a
correctness problem.

## R5 - The availability rule becomes a variant rule with a product form

**Decision**: `@effy/edge-shared` `availability.ts` keeps being THE rule, now in three forms:
- `variantPurchasableSql(p, v)` - `p.status = 'active' AND v.state = 'active' AND (NOT v.stock_tracked OR v.stock_on_hand > 0)`;
- `productAvailableSql(p)` - `p.status = 'active' AND EXISTS (SELECT 1 FROM product_variant v WHERE v.product_id = p.id AND v.state = 'active' AND (NOT v.stock_tracked OR v.stock_on_hand > 0))`;
- `purchasable(status, state, tracked, onHand)` in memory.
`AVAILABILITY_COLUMNS` and the 054 guard are updated so no shopper-facing service writes either form by hand.

**Rationale**: Cart/checkout refuse per variant (money moves on a variant); listings project/filter per
product (054's three jobs survive). The EXISTS is served by a partial index
`product_variant (product_id) WHERE state = 'active'`.

**Alternatives**: a stored `product.available` - would have to be rewritten on every paid order, the
hottest write on the platform, under the same lock as the stock deduction.

## R6 - Variant edits follow 067: draft writes live rows; a live product's edits are proposals

**Decision**:
- While a product has never been approved, the shop service writes options, values and variants
  directly (nothing is visible).
- After approval, anything FR-009 lists goes into `product_change.proposed` as two whole keys:
  `options` (the complete target option/value set) and `variants` (the complete target variant set,
  each with its id). `diffProposal` includes them only when they differ from live; approval applies them
  in one transaction via `applyVariantSet` (the ONE writer of options/values/variants).
- New variants and values get **client-generated UUIDs** in the proposal, so the reviewer, the shop and
  approval all speak about the same id.
- `state` changes (`active` ⇄ `inactive`, `removed`) are immediate, through their own route, never
  proposed (FR-009). Stock, tracking and thresholds stay in `inventory` (054), never proposed.

**Rationale**: 067's rule is that customers see only approved content; storing the whole target set
rather than a per-field patch keeps "what will the product look like" one object, and a set of ≤ 50 rows
is small. Stopping a sale never waits (spec US6).

**Alternatives**: per-variant `product_variant_change` rows - a second pending-change table and queue;
`pending` flags on live rows - 067 already rejected (every storefront read would need `AND NOT pending`).

## R7 - One margin per product, applied to every variant

**Decision**: `margin_kind` / `margin_value` stay on `product`. Approval and the margin route compute each
variant's `price_amount = customerPrice(shop_price_amount, margin)` and the same for compare-at, using
the existing `@effy/edge-shared` `margin.ts`, then `refreshListing`. The review DTO lists every variant's
shop and resulting customer price (FR-011).

**Rationale**: Operator decision (spec Assumptions). Reuses 067's arithmetic untouched.

## R8 - Variants are never hard-deleted once a product has been approved

**Decision**: `product_variant.state IN ('active','inactive','removed')`. "Remove" sets `removed`
(+ `removed_at`), is immediate, hides the variant from shoppers AND from the shop's grid (shown under
"Removed" for history), and frees its stock code (the per-shop SKU unique index is partial
`WHERE state <> 'removed'`). A never-approved product's variants may be deleted outright.

**Rationale**: order lines, stock history and refunds reference variants; a soft state keeps every FK
valid without `ON DELETE SET NULL` gymnastics. The last active-or-inactive variant cannot be removed
(FR-019).

## R9 - Order lines snapshot the variant

**Decision**: `order_item` gains `variant_id` (composite FK), `variant_label` (NULL for an option-less
product), `sku`, `gtin`, written by checkout in the same INSERT. `UNIQUE (order_id, variant_id)`. Every
reader that shows a line (shop orders, pick lists, fulfilments, driver manifest, delivery note, tax
invoice, receipts, back-office orders, refunds, team activity) reads the snapshot, never the live
variant (FR-015, FR-021).

**Rationale**: the same immutability 019 gave `product_name` and `unit_price_amount`.

## R10 - The cart line is a variant; promotions key lines by variant

**Decision**: `cart_item` / `cart_saved_item` unique on `(cart_id, variant_id)`. Commerce routes keyed by
`{productId}` become `{variantId}` (same route count). `AddToCartRequest`, `CartLineInput`,
`ReorderRequest` carry `variantId`. Promotions: `pricing.ts` sets `lineId = variantId`; the engine is
already line-based (minQuantity counts units across target lines, so FR-023's "across variants" holds
unchanged); `order_item.discount_amount` is written by `variant_id`. Targets stay product/category/brand.

**Rationale**: smallest correct change; the engine needed none (`engine.ts` keys by `lineId`).

## R11 - Saved items and list entries stay per product and remember a variant

**Decision**: `customer_saved_item` keeps its product key and gains a nullable `variant_id`;
`customer_list_entry` already references the saved item, so it needs none. Save/update sets it to the selected (or card's shown) variant. Add-to-cart from them uses
it; if it is NULL or no longer `active`, the result reports `variant_unavailable` and the client opens the
product to choose (FR-015a). Membership (`/saved/ids`) stays a product-id set.

**Rationale**: the heart on a tile and the 200-item membership read are product-level by design (033);
making them per-variant would make a tile's heart ambiguous.

## R12 - Unit price: a product basis, a variant pack size, one pure function

**Decision**:
- `product.unit_basis` ∈ `per_100g | per_kg | per_100ml | per_l | each` (nullable).
- `product_variant.pack_quantity numeric(10,3)` + `pack_unit` ∈ `g | kg | ml | l | each`; CHECK both or
  neither, quantity > 0; the service refuses a unit incompatible with the basis (FR-017).
- `unitPrice(priceCents, packQuantity, packUnit, basis)` in `@effy/shared-types/unit-price.ts` → cents,
  half-up to the cent; pinned by `unit-price.fixtures.json`. The SERVER computes it for every DTO that
  carries a price (card, detail variant, cart line using the line's effective unit price after its
  discount, saved item) and sends `unitPrice: { amountCents-as-text, basis }`; clients only format.
  Words (`$0.64 / 100 g`) are `UNIT_BASIS_WORDS` with a Kotlin twin pinned to the same fixtures.

**Rationale**: one sum (house rule "money logic lives once"); clients never divide money.

**Alternatives**: per-variant basis - two sizes of one product could compare in different units, which
defeats the comparison; computing in clients - two implementations of a money rule.

## R13 - Search finds a variant's code; the card says which variant it shows

**Decision**: the trigram expression drops `p.sku`; a separate exact predicate
`EXISTS (SELECT 1 FROM product_variant v WHERE v.product_id = p.id AND v.state = 'active' AND (lower(v.sku) = lower($q) OR v.gtin = $q))`
is OR-ed in, backed by indexes on `(shop_id, lower(sku))` and `(gtin)`. The card carries `variantId`
(the matched variant, else the default) and `variantCount`; the product page link carries `?variant=`.

## R14 - Fresh start: the migration refuses a non-empty catalogue; the operator purges dev first

**Decision**:
- `db/reset/098_purge_catalogue_dev.sql` (operator-run, dev only, prints what it will empty, then
  `TRUNCATE public.product, public."order", public.cart … CASCADE` in one transaction).
- The migration's first statement refuses (`RAISE EXCEPTION`) if `public.product`, `public."order"` or
  `public.cart_item` has any row - a database that took orders cannot run it by accident (the 083 pattern).
- It then DROPS the moved columns from `product` (price, compare-at, shop prices, sku, gtin, weight,
  stock) - no dual columns, no backfill.
- `db/seeds/098_variant_catalogue_dev.sql` replaces the product section of the 084 seed (aisles stay in 084).

**Rationale**: operator direction ("clean up the db to start fresh"); the migration itself never deletes
business data, so it is safe in any environment. Dropping the old columns makes every forgotten reader
fail loudly in container tests instead of silently reading a stale price.

## R15 - Stock moves to the variant with every writer enumerated

**Decision**: `stock_tracked`, `stock_on_hand`, `low_stock_threshold` and their CHECKs move to
`product_variant`; `stock_movement.variant_id` added (NOT NULL). The four writers move with them:
`inventory/src/stock/repository.ts`, `shared/src/payments/finalize.ts` (lock + flag + deduct per
variant), `shared/src/payments/refunds/repository.ts` (`returnStock`), `shop/src/fulfillments/repository.ts`
(shortfall). The 058 `shop_ops_product_upd` trigger moves to `product_variant`. Inventory routes become
`/inventory/v1/variants/{variantId}/…` (same count). `append-only.guard.test.ts` keeps holding.

## R16 - The selector: buttons, not pills, not menus

**Decision**: web - one row of toggle buttons per option (`rounded-lg`, the control shape;
`check-component-shape.mjs` forbids pill controls), unavailable values disabled with a line-through and
"Sold out" text, never colour alone. Mobile - the same as a horizontally scrolling chip row in the
customer kit (no drop-down menus: `mobile-guard.sh`). A product card with `variantCount > 1` shows
"Choose" instead of the quick-add stepper and opens the product.

## R17 - Placement and gateways

**Decision**: no new service. Shared gateway: **+1** route (`POST /shop/v1/products/{id}/variants/{variantId}/state`);
inventory and commerce route keys are renamed, not added. Staff gateway: **0** new. `admin` gains nothing.
The customer app and `commerce` + `storefront` change wire shapes together (no installed-base
compatibility for the customer app - it is not publicly released; recorded in the deploy order).

## R18 - Search engines

**Decision**: `apps/customer-web/lib/json-ld.tsx` emits `ProductGroup` with `hasVariant` / `variesBy` /
`productGroupID` when a product has more than one active variant, else `Product` as today (FR-026).

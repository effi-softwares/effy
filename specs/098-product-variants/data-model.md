# Data Model — 098 Product Variants

One goose migration, `db/migrations/<ts>_product_variants.sql`. House style: raw SQL, text CHECK enums,
an index on every FK, `COMMENT ON` everything, no triggers for business rules. Decisions cited as R#
(research.md).

## 0. Guard (R14)

```text
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.product) OR EXISTS (SELECT 1 FROM public."order")
     OR EXISTS (SELECT 1 FROM public.cart_item) THEN
    RAISE EXCEPTION '098 needs an empty catalogue: run db/reset/098_purge_catalogue_dev.sql first (dev only)';
  END IF;
END $$;
```

## 1. `public.product` — what is shared

**Dropped** (moved to the variant): `sku`, `gtin`, `price_amount`, `compare_at_amount`,
`shop_price_amount`, `shop_compare_at_amount`, `weight_grams`, `weight_is_assumed`, `stock_tracked`,
`stock_on_hand`, `low_stock_threshold`, with their CHECKs and indexes (`product_shop_sku_uq`,
`product_low_stock_idx`; the trigram index is rebuilt without `sku`).

**Kept**: id, shop_id, product_type_id, primary_category_id, name, brand, currency, short/long
description, status, gst_status, margin_kind, margin_value, approval columns (067), created/updated.

**Added**:

| Column | Type | Rule |
|---|---|---|
| `unit_basis` | text NULL | `per_100g`, `per_kg`, `per_100ml`, `per_l`, `each` (R12) |
| `list_price_amount` | numeric(12,2) NULL | lowest customer price among ACTIVE variants; NULL until approved (R4) |
| `list_compare_at_amount` | numeric(12,2) NULL | that variant's customer compare-at |
| `price_varies` | boolean NOT NULL DEFAULT false | active variants' customer prices differ → "From" |

`UNIQUE (id, shop_id)` added (target of the variant's composite FK). ⚠ The three `list_*`/`price_varies`
columns are written ONLY by `refreshListing` (R4). Index: `(shop_id, status, list_price_amount, id)` for
the price keyset.

## 2. `public.product_option` (new)

| Column | Type | Rule |
|---|---|---|
| id | uuid PK | client-generated allowed (R6) |
| product_id | uuid NOT NULL → product ON DELETE CASCADE | |
| position | smallint NOT NULL | CHECK `position IN (1, 2)`; UNIQUE (product_id, position) |
| name | text NOT NULL | 1–40 chars, trimmed; UNIQUE (product_id, lower(name)) |

## 3. `public.product_option_value` (new)

| Column | Type | Rule |
|---|---|---|
| id | uuid PK | |
| option_id | uuid NOT NULL → product_option ON DELETE CASCADE | |
| value | text NOT NULL | 1–40 chars; UNIQUE (option_id, lower(value)) |
| position | smallint NOT NULL | 0–19 (≤ 20 values, FR-006); UNIQUE (option_id, position) DEFERRABLE (reordering) |

## 4. `public.product_variant` (new) — the thing bought, priced and counted

| Column | Type | Rule |
|---|---|---|
| id | uuid PK | client-generated allowed (R6) |
| product_id | uuid NOT NULL | composite FK `(product_id, shop_id)` → product(id, shop_id) ON DELETE CASCADE |
| shop_id | uuid NOT NULL | denormalised for the per-shop SKU index |
| option1_value_id | uuid NULL → product_option_value | must belong to the product's position-1 option (service rule + container test) |
| option2_value_id | uuid NULL → product_option_value | the position-2 option's value (service rule) |
| position | smallint NOT NULL | display order, 0–49 (≤ 50 variants) |
| sku | text NULL | partial UNIQUE (shop_id, lower(sku)) WHERE sku IS NOT NULL AND state <> 'removed' |
| gtin | text NULL | indexed, not unique (R13) |
| shop_price_amount | numeric(12,2) NOT NULL | ≥ 0 |
| shop_compare_at_amount | numeric(12,2) NULL | ≥ 0 |
| price_amount | numeric(12,2) NULL | CUSTOMER price = shop price + product margin; NULL until approved (R7) |
| compare_at_amount | numeric(12,2) NULL | customer compare-at |
| weight_grams | int NOT NULL DEFAULT 500 | > 0 |
| weight_is_assumed | boolean NOT NULL DEFAULT true | 032's rule, per variant |
| pack_quantity | numeric(10,3) NULL | > 0 |
| pack_unit | text NULL | `g`,`kg`,`ml`,`l`,`each`; CHECK both-or-neither with pack_quantity |
| media_id | uuid NULL → product_media ON DELETE SET NULL | must be the same product's media (service rule) |
| stock_tracked | boolean NOT NULL DEFAULT false | 054, moved |
| stock_on_hand | int NULL | ≥ 0; CHECK `NOT stock_tracked OR stock_on_hand IS NOT NULL` |
| low_stock_threshold | int NULL | ≥ 0 |
| state | text NOT NULL DEFAULT 'active' | `active`, `inactive`, `removed` (R8) |
| removed_at | timestamptz NULL | CHECK `(state = 'removed') = (removed_at IS NOT NULL)` |
| created_at / updated_at | timestamptz | ⚠ stock writes never touch `updated_at` (054's rule) |

Constraints and indexes:
- `UNIQUE (id, product_id)` — target of every referencing composite FK (R3).
- `UNIQUE (product_id, option1_value_id, option2_value_id) NULLS NOT DISTINCT WHERE state <> 'removed'` — FR-003; one option-less variant (R2); a removed combination can return.
- Value FKs are `ON DELETE SET NULL`: the writer deletes a value only when no non-removed variant names it.
- `INDEX (product_id) WHERE state = 'active'` — the availability EXISTS (R5).
- `INDEX (shop_id, stock_on_hand) WHERE stock_tracked` — the restock list (054's index, moved).
- `INDEX (gtin) WHERE gtin IS NOT NULL`, `INDEX (shop_id, lower(sku))`.
- The 058 trigger `shop_ops_product_upd` is dropped from `product` and recreated on `product_variant`
  `AFTER UPDATE OF stock_on_hand, low_stock_threshold, stock_tracked, state`; `product` keeps a trigger
  on `status`.

**Label** (FR-005, derived, never stored on the live row): value names in option position order joined
with " / "; NULL when the variant has no option values.

**State transitions**: `active ⇄ inactive` (immediate, shop or back-office); `active|inactive → removed`
(immediate, terminal); refused when it would leave the product with no `active|inactive` variant (FR-019).

## 5. Referencing tables (R3, R9–R11, R15)

| Table | Change |
|---|---|
| `cart_item` | + `variant_id uuid NOT NULL`, FK (variant_id, product_id); UNIQUE (cart_id, product_id) → UNIQUE (cart_id, variant_id); `added_price_amount` (027) stays, now the variant's |
| `cart_saved_item` | + `variant_id NOT NULL`, same FK; unique per (cart, variant) |
| `order_item` | + `variant_id NOT NULL` FK; + `variant_label text NULL`, `sku text NULL`, `gtin text NULL` (snapshots); UNIQUE (order_id, variant_id) |
| `stock_movement` | + `variant_id NOT NULL` FK; index (variant_id, created_at DESC) |
| `customer_saved_item` | + `variant_id NULL` FK — the remembered choice (FR-015a) |
| `customer_list_entry` | unchanged — an entry references the saved item, whose remembered variant serves every list |
| `product_change` | unchanged shape; `proposed` may carry `options` and `variants` (§6) |

Untouched: `fulfillment_item`, `refund_line`, `refund_request_item` (they reference `order_item`, which
now names the variant), `promotion_target` (product-level, FR-023), `shop_product_sales_day` (per
product, FR-025).

## 6. `product_change.proposed` — the variant keys (R6)

```text
proposed.options?:  [{ id, position, name, values: [{ id, value, position }] }]       complete target set
proposed.variants?: [{ id, position, optionValueIds: [id|null, id|null], sku, gtin,
                       shopPriceAmount, shopCompareAtAmount, weightGrams, packQuantity, packUnit,
                       mediaStorageKey }]                                              complete target set
proposed.unitBasis?: basis | null
```

Present only when different from live. A variant absent from `variants` that is live is a removal at
approval (only if the shop did not already remove it immediately). State, stock, tracking and thresholds
are never in a proposal.

## 7. Validation rules (service layer, shop and catalog)

- ≤ 2 options, ≤ 20 values per option, ≤ 50 variants (FR-006); names/values 1–40 chars, unique
  case-insensitively within their parent.
- Every variant names exactly one value per defined option; no duplicate combination; every option value
  in use by at least one variant or it is dropped on save.
- `shopPriceAmount` required (money string, 2 dp); compare-at > price when present.
- `packUnit` compatible with the product's `unitBasis`: g/kg ↔ per_100g/per_kg; ml/l ↔ per_100ml/per_l;
  each ↔ each.
- SKU unique within the shop among non-removed variants (409 naming the field).
- `mediaStorageKey` must be in the product's (resulting) gallery.

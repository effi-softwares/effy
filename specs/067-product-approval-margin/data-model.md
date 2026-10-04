# Data Model: Product Approval & Effy Margin

One forward-only migration `<ts>_product_approval_margin.sql`. Additive plus a backfill; the CHECK
is added last, after the backfill.

## `public.product` — new columns

| Column | Type | Null | Notes |
|---|---|---|---|
| `shop_price_amount` | `numeric(12,2)` | no | What the shop is paid. Backfill: `= price_amount` |
| `shop_compare_at_amount` | `numeric(12,2)` | yes | Shop's "was" price. Backfill: `= compare_at_amount` |
| `margin_kind` | `text` | yes | `percent` \| `amount` |
| `margin_value` | `numeric(12,4)` | yes | ≥ 0. Percent as entered (e.g. `12.5`), or an amount |
| `approved_at` | `timestamptz` | yes | First approval. Backfill: `created_at` where `status <> 'draft'` |
| `review_state` | `text` | no | `none` \| `in_review` \| `sent_back`. Default `none` |
| `review_reason` | `text` | yes | Shown to the shop; carries no staff identity |
| `submitted_at` | `timestamptz` | yes | When the current submission entered the queue |

`price_amount` and `compare_at_amount` are unchanged and keep meaning the CUSTOMER price.

**Constraints**

- `CHECK (status <> 'active' OR approved_at IS NOT NULL)` — never on sale without an approval.
- `CHECK ((margin_kind IS NULL) = (margin_value IS NULL))` — both or neither.
- `CHECK (margin_value IS NULL OR margin_value >= 0)`.
- `CHECK (review_state = 'none' OR approved_at IS NULL)` — `review_state` describes a
  never-approved product; an approved product's review lives in `product_change`.
- `CHECK (review_state <> 'sent_back' OR review_reason IS NOT NULL)`.
- `CHECK (review_state <> 'in_review' OR submitted_at IS NOT NULL)`.

**Index**: partial on `(submitted_at)` where `review_state = 'in_review'` (the queue); partial on
`(shop_id)` where `approved_at IS NOT NULL AND margin_kind IS NULL` (margin not set).

### Review state of a product, as shown to a shop (derived)

| Shown | Condition |
|---|---|
| Draft | `approved_at IS NULL`, `review_state = 'none'` |
| In review | `approved_at IS NULL`, `review_state = 'in_review'` |
| Sent back | `approved_at IS NULL`, `review_state = 'sent_back'` |
| Live | `approved_at IS NOT NULL`, no `product_change` row |
| Live, change pending | `approved_at IS NOT NULL`, `product_change.state = 'in_review'` |
| Live, change sent back | `approved_at IS NOT NULL`, `product_change.state = 'sent_back'` |

"Live" here means approved; whether it is on sale is still `status`.

### Transitions

```text
draft ──submit──▶ in_review ──approve(margin)──▶ approved (status active)
  ▲                   │
  └──withdraw─────────┤
  └──edit+resubmit◀── sent_back ◀──send back(reason)

approved ──shop edits a detail──▶ change in_review ──approve──▶ applied, change deleted
                                        │  ├──send back(reason)──▶ change sent_back ──edit──▶ in_review
                                        └──withdraw / equals live──▶ change deleted
```

## `public.product_change` — new

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `product_id` | `uuid` FK → product, `ON DELETE CASCADE` | `UNIQUE` — one open change per product |
| `shop_id` | `uuid` FK → shop | Denormalised for queue filtering |
| `proposed` | `jsonb` not null | Proposed scalar details and attribute values. Only keys that differ from the live product |
| `media_changed` | `boolean` not null default false | True when `product_change_media` holds the proposed image set |
| `state` | `text` not null | `in_review` \| `sent_back` |
| `reason` | `text` | Required when `sent_back` |
| `submitted_at` | `timestamptz` not null | |
| `created_at`, `updated_at` | `timestamptz` | `updated_at` is the version a decision must echo |

`proposed` keys (all optional): `name`, `shortDescription`, `longDescription`, `brand`, `sku`,
`gtin`, `primaryCategoryId`, `productTypeId`, `shopPriceAmount`, `shopCompareAtAmount`,
`weightGrams`, `attributes` (attribute definition id → value).

## `public.product_change_media` — new

The complete proposed image set, present only when `media_changed`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `change_id` | `uuid` FK → product_change, `ON DELETE CASCADE` | |
| `storage_key` | `text` not null | A new upload, or an existing live image's key |
| `source_media_id` | `uuid` | The live `product_media.id` this row keeps, else NULL (new) |
| `is_primary` | `boolean` | At most one per change (partial unique) |
| `display_order` | `int` | |
| `alt_text` | `text` | |

Approval replaces the product's `product_media` rows with this set in the decision transaction.
Storefront media reads never see this table.

## `public.order_item` and `public.shop_fulfillment` — new columns

| Table | Column | Null | Meaning |
|---|---|---|---|
| `order_item` | `shop_unit_price_amount numeric(12,2)` | yes | Shop price per unit at placement |
| `order_item` | `shop_line_subtotal_amount numeric(12,2)` | yes | `quantity × shop_unit_price_amount` |
| `shop_fulfillment` | `shop_subtotal_amount numeric(12,2)` | yes | Σ shop line subtotals of the portion |

Backfill: each equals its customer-price counterpart (FR-047). **NULL means "same as the customer
price"**: a line written by a core-api older than this slice. Every reader uses
`COALESCE(shop_…, customer_…)`.

Existing `unit_price_amount`, `line_subtotal_amount`, `subtotal_amount` are unchanged and remain
customer money.

## `public.notification_request.type`

Widened to admit `product_approved` and `product_sent_back` (reader audit in research R9).

## `admin.audit_log`

No schema change. New `action` values: `product.approved`, `product.sent_back`,
`product.change_approved`, `product.change_sent_back`, `product.margin_set`. `detail` carries
product id, shop id, reason, and margin kind/value before and after.

## Invariants

1. `price_amount = customerPrice(shop_price_amount, margin)`; with no margin, they are equal.
2. A product is `active` only if `approved_at` is set.
3. The live product, its attributes and its media are always the last approved version.
4. A product has at most one open change.
5. A stock write touches neither `product_change` nor any review column.
6. A placed order line's two prices never change.
7. No shop-pool query selects `margin_kind` or `margin_value`.
8. After the migration, every pre-existing product's `price_amount`, `compare_at_amount` and
   `status` are unchanged.

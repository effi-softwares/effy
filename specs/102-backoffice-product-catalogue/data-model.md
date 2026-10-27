# Data Model: Back-Office Product Catalogue (102)

One goose migration, `db/migrations/<ts>_backoffice_product_catalogue.sql`. Nothing is backfilled except
defaults: existing products are `content_owner = 'shop'`, `created_via = 'shop'`, not held.

## `public.product` — new columns

| Column | Type | Rule |
|---|---|---|
| `held_at` | timestamptz NULL | set by a hold, cleared by a release |
| `held_by` | text NULL | staff sub |
| `held_reason` | text NULL | 1–500 characters |
| `held_prior_status` | text NULL | `draft` \| `active` \| `unavailable` — restored on release |
| `content_owner` | text NOT NULL DEFAULT `'shop'` | `shop` \| `effy` (R4) |
| `created_via` | text NOT NULL DEFAULT `'shop'` | `shop` \| `effy` \| `import` |
| `import_id` | uuid NULL → `product_import(id)` | set when `created_via = 'import'` |

Constraints:
- `product_hold_shape_ck`: `(held_at IS NULL) = (held_by IS NULL) = (held_reason IS NULL) = (held_prior_status IS NULL)` (written as pairwise equalities).
- `product_held_not_active_ck`: `held_at IS NULL OR status <> 'active'` — the SC-004 guarantee.
- `product_held_not_archived_ck`: `held_at IS NULL OR status <> 'archived'`.
- `product_effy_owned_draft_ck`: `content_owner = 'shop' OR (approved_at IS NULL AND review_state = 'none' AND margin_kind IS NOT NULL)` — Effy's unfinished product is a draft with its margin chosen (implementation notes in research.md).
- `product_import_origin_ck`: `(created_via = 'import') = (import_id IS NOT NULL)`.

Indexes: `product_held_idx (held_at) WHERE held_at IS NOT NULL`; `product_import_idx (import_id) WHERE import_id IS NOT NULL`; `product_updated_idx (updated_at DESC, id)` for the default sort.

## `public.product_variant` — new index

- `product_variant_sku_lower_idx ON (lower(sku)) WHERE sku IS NOT NULL AND state <> 'removed'` — the
  cross-shop SKU search (R8).

## `public.product_import` — new

| Column | Type | Rule |
|---|---|---|
| `id` | uuid PK | |
| `shop_id` | uuid NOT NULL → `shop` | |
| `file_name` | text NOT NULL | as uploaded, for the record |
| `file_sha256` | text NOT NULL | warns on a repeat upload (the SKU rule is what prevents duplicates) |
| `columns` | jsonb NOT NULL (array) | the sheet's header row, as the browser parsed it |
| `margin_kind`, `margin_value` | as on `product` | required; the default for rows with no Margin column |
| `state` | text NOT NULL | `checking` → `checked` → `creating` → `done`; `failed` from any (worker gave up) |
| `row_count`, `ready_count`, `created_count`, `left_out_count` | integer NOT NULL DEFAULT 0 | |
| `created_by` | text NOT NULL | staff sub |
| `created_at`, `checked_at`, `finished_at` | timestamptz | |
| `updated_at` | timestamptz NOT NULL | the version for `create` (stale → 409) |

## `public.product_import_row` — new

| Column | Type | Rule |
|---|---|---|
| `import_id` | uuid → `product_import` ON DELETE CASCADE | |
| `row_number` | integer | the spreadsheet's row (header = 1) |
| `product_key` | text NOT NULL | groups sizes into a product |
| `cells` | jsonb NOT NULL (array) | the row's strings, read against `product_import.columns` |
| `result` | text NOT NULL | `pending` \| `ready` \| `not_ready` \| `created` \| `left_out` |
| `problems` | jsonb NOT NULL DEFAULT `'[]'` | `[{column, message}]` |
| `staged_media` | jsonb NOT NULL DEFAULT `'[]'` | staging keys of fetched pictures, in order |
| `product_id` | uuid NULL → `product` | set when created |

PK `(import_id, row_number)`. A product's rows share `result` (one bad size makes the product not ready,
and every row of it says why).

State transitions:

```
checking ──worker──▶ checked ──POST create──▶ creating ──worker──▶ done
    └───────────── worker exhausted retries ─────────────▶ failed
```

## `public.notification_request` — new types

`shop_product_held`, `shop_product_released`, `shop_product_added_by_effy`, `shop_products_imported`
(add to the type CHECK and the notifications worker's templates, if the type list is closed there).

## `admin.audit_log` — new actions (target_type `product` unless noted)

`product.held` {shopId, reason, priorStatus} · `product.released` {shopId, releasedTo} ·
`product.created_by_effy` {shopId, importId?} · `product.effy_edited` {shopId, changed[]} ·
`product.effy_completed` {shopId} · `product.variant_state_set` {shopId, variantId, from, to} ·
`product_import.created` / `.checked` / `.finished` (target_type `product_import`).
Stock changes keep the inventory service's own record.

The product page's **History** is a read over `admin.audit_log` (target = the product) plus the product's
own `created_at` / `created_via`. Actor subs are resolved to staff names for staff; the shop sees none of it.

## Derived: the back-office state (`BACKOFFICE_STATE_SQL`, R8)

```
held           held_at IS NOT NULL
archived       status = 'archived'
in_review      approved_at IS NULL AND review_state = 'in_review'
change_pending pc.state = 'in_review'
draft          approved_at IS NULL  OR content_owner = 'effy'
on_sale        status = 'active'
off_sale       otherwise
```

## Derived: the shop's review state (`REVIEW_STATE_SQL`, shop service)

Gains `effy_setup` (when `content_owner = 'effy'`), evaluated before `live`. The shop DTO gains
`hold: { reason, heldAt } | null` and `createdBy: "shop" | "effy"`.

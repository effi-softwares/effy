# Data Model: Category-Driven Catalogue (101)

PostgreSQL 16, raw SQL, goose. **Removed**: `product_type`, `product_type_attribute`,
`product.product_type_id`, `product_option.name`, `product_attribute_value.value_options`, and the
`storage` attribute. Decisions are cited as R-numbers from [research.md](research.md).

## Authored tables (staff write, through the `catalog` taxonomy writer)

### `category` (changed)

| Column | Type | Rule |
|---|---|---|
| id | uuid PK | |
| parent_id | uuid → category, NULL = department | Depth ≤ 5 and no cycles, enforced by the writer (`category_too_deep`, `category_cycle`) |
| key | text UNIQUE | A slug generated from the name at creation and never changed. Used in storefront links |
| name | text | 1–60 chars. Unique among active siblings, case-insensitive (`category_sibling_name_uq`) |
| position | int | Order among siblings (was `display_order`) |
| icon | text NULL | One of `CATEGORY_ICONS` (R13). A check lists the keys |
| image_key | text NULL | `categories/…` in the media bucket (R13) |
| synonyms | text[] NOT NULL DEFAULT '{}' | Each 1–40 chars, at most 30 entries. Used by the shop picker (R11) |
| default_storage | text NULL | `frozen` / `chilled` / `ambient`. NULL = inherit |
| default_gst_status | text NULL | `taxable` / `gst_free`. NULL = inherit |
| default_age_restricted | boolean NULL | NULL = inherit |
| status | text | `active` / `retired` |
| created_at, updated_at | timestamptz | |

A category is a **leaf** when it has no **active** children (`category_resolved.is_leaf`).

### `attribute_definition` (changed)

| Column | Type | Rule |
|---|---|---|
| id | uuid PK | |
| key | text UNIQUE | Slug from the name, immutable. The filter parameter (`attr.<key>`) |
| name | text | UNIQUE, case-insensitive. Refused when `isStockDateName` matches (R19) |
| help_text | text NULL | ≤ 200 chars |
| input_type | text | `short_text` · `long_text` · `number` · `boolean` · `single_select` · `multi_select` · `date` · `time` (renamed from `data_type`, plus `date` and `time`) |
| unit_family | text NULL | Numbers only. One of `UNIT_FAMILIES` (R8) |
| units | text[] NULL | Non-empty when `unit_family` is set. Every entry is in that family. The first is the default |
| min_value, max_value | numeric NULL | Numbers, in the base unit |
| decimals | smallint NULL | Numbers, 0–3 |
| max_length | int NULL | Text, ≤ 2000 |
| filterable | boolean | Allowed only for `single_select`, `multi_select`, `boolean` and `number` |
| customer_visible | boolean | false = internal only. Never reaches a customer DTO |
| varies_by_variant | boolean | "May differ per variant" |
| variant_option | boolean | Only for `single_select`. Implies `varies_by_variant` |
| status | text | `active` / `retired` |

Writer refusals once any `product_attribute_value` row uses the attribute: changing `input_type`,
changing `unit_family`, retiring (`attribute_in_use`).

### `attribute_allowed_value` (changed)

| Column | Type | Rule |
|---|---|---|
| id | uuid PK | Values are stored by id (R6), so renaming a label is safe |
| attribute_definition_id | uuid → attribute_definition | |
| label | text | 1–40 chars, unique per attribute (case-insensitive). The old `value` column is dropped |
| position | int | |
| status | text | `active` / `retired`. A retired value cannot be chosen by new products and stays on existing ones |

Deleting a value is refused while it is used (`value_in_use`). Renaming a label also rewrites the
label copy in `product_option_value.value` in the same transaction (R7).

### `category_attribute` (new; replaces `product_type_attribute`)

| Column | Type | Rule |
|---|---|---|
| category_id | uuid → category | PK with `attribute_id` |
| attribute_id | uuid → attribute_definition | |
| level | text NULL | `required` / `recommended` / `optional`. NULL when `hidden` |
| hidden | boolean | When true, `level` IS NULL (check) |
| section | text NULL | Form heading, ≤ 40 chars. NULL = inherited, else "Details" |
| position | int NULL | NULL = inherited |

Writer refusals: a level looser than the inherited one (`attachment_loosens`), hiding an attribute
nothing above attaches (`nothing_to_hide`), and attaching a retired attribute.

## Derived tables (written ONLY by `public.rebuild_category_derived()`; R3)

| Table | Columns | Meaning |
|---|---|---|
| `category_ancestor` | ancestor_id, category_id, distance (0 = self) | Closure over **active** categories. PK `(ancestor_id, category_id)`, index `(category_id)` |
| `category_resolved` | category_id PK, depth (1–5), is_leaf, path_ids uuid[], path_names text[], path_keys text[], storage, gst_status, age_restricted (resolved; NULL when no ancestor sets one) | One row per active category |
| `category_form` | category_id, attribute_id, level, section, position, source_category_id | The resolved form (R4). PK `(category_id, attribute_id)`, index `(attribute_id)` |

The rebuild runs inside every taxonomy write transaction and once at the end of the seed migration.
`catalog.guard.test.ts` fails any other writer.

## Product tables

### `product` (changed)

- **Dropped**: `product_type_id`.
- **Added**: `storage text NOT NULL` (check `frozen|chilled|ambient`), `age_restricted boolean NOT NULL`.
- **Changed**: `gst_status` becomes NOT NULL.
- **Kept**: `primary_category_id` (= the home leaf; leaf-ness enforced by the writers, R2).
- New products take `category_resolved` defaults. The shop's writer refuses a product whose leaf
  resolves no default when the shop sent none (`fact_required`).

### `product_placement` (new; R14)

| Column | Type | Rule |
|---|---|---|
| product_id | uuid → product ON DELETE CASCADE | PK with `category_id` |
| category_id | uuid → category | Must be an active leaf, not the home leaf. At most 5 per product (writer) |
| created_by | text | Staff sub |
| created_at | timestamptz | |

### `product_attribute_value` (changed; R6)

| Column | Type | Rule |
|---|---|---|
| id | uuid PK | |
| product_id | uuid → product ON DELETE CASCADE | |
| variant_id | uuid NULL → product_variant ON DELETE CASCADE | NULL = the whole product. Composite FK `(variant_id, product_id)` |
| attribute_definition_id | uuid → attribute_definition | |
| value_text | text NULL | short_text / long_text |
| value_number | numeric NULL | As entered |
| value_unit | text NULL | Set when the attribute has a unit family |
| value_base | numeric NULL | `value_number` in the family's base unit. Written by the writer, never by a client |
| value_boolean | boolean NULL | |
| allowed_value_ids | uuid[] NULL | single_select (exactly 1) / multi_select (≥ 1) |
| value_date | date NULL | |
| value_time | time NULL | |

Constraints:
- `UNIQUE (product_id, attribute_definition_id, variant_id) NULLS NOT DISTINCT`;
- exactly one value family is non-null;
- an exclusion check (writer + container test): no product-level row may coexist with variant rows
  for the same attribute.

Indexes: `(attribute_definition_id, product_id)`, GIN on `allowed_value_ids`,
`(attribute_definition_id, value_base)`.

ONE writer: `writeProductDetails` (`@effy/edge-shared/catalog`).

### `product_option` / `product_option_value` (changed; R7)

- `product_option`:
  - **dropped**: `name`;
  - **added**: `kind text NOT NULL` (`attribute|pack_size`) and `attribute_id uuid NULL` →
    attribute_definition (check: `attribute_id IS NOT NULL` ⇔ `kind = 'attribute'`);
  - unique `(product_id, attribute_id)`, and at most one `pack_size` per product.
- `product_option_value`:
  - **added**: `allowed_value_id uuid NULL` → attribute_allowed_value (set ⇔ the option's kind is
    attribute);
  - **kept**: `value` text, as the label copy read by `variantLabel` / `variantLabelSql`. Written only by
    `applyVariantSet`, and refreshed by the value-rename writer.

## Removed

- `product_type`, `product_type_attribute`: dropped.
- The baseline rows of `attribute_definition`, `attribute_allowed_value` and `category`: deleted by
  the schema migration before the taxonomy migration inserts the new ones.
- `catalog` GST missing/bulk: routes deleted (R5).

## State and lifecycle

- **Category**:
  - `active ⇄ retired`;
  - retiring is refused while the category is home to any non-archived product (`category_in_use`) or
    has active children (`category_has_children`), and deletes the placements into it;
  - creating or restoring under a retired parent is refused (`parent_retired`);
  - restoring under a parent that is home to products needs `moveProductsToSelf` (the products move
    into the restored category), else `category_has_products`;
  - so an active category never has a retired ancestor (R2).
- **Attribute**: `active ⇄ retired`, refused while in use.
- **Allowed value**: `active ⇄ retired`, plus delete when unused.
- **Product**: unchanged (`draft → in_review → active/unavailable/archived`, 067).
  `product_missing_required(id)` (R15) must be empty to submit or approve, and is reported, never
  enforced, for a product already on sale.

## Functions

| Function | Returns | Used by |
|---|---|---|
| `public.rebuild_category_derived()` | void | The taxonomy writer; the seed migration |
| `public.product_missing_required(product_id uuid)` | `TABLE(attribute_id uuid, attribute_name text, variant_id uuid)`. `variant_id` is set for a per-variant gap. It never builds a variant label (R15) | Via `missingRequired()` in `EA/shared/src/catalog/form.ts`, which labels variants with the one label rule: shop list and detail, submit, approve, back-office list |

# Phase 1 Data Model: Customer Advanced Search Filters

This feature adds **no new tables**. It reads the existing 016 catalogue schema and adds **one
forward-only index migration** to keep facet counting inside the latency budget. The "facet model" is
a read-time projection, not stored state.

## Existing tables consumed (016 catalogue)

- **`public.product`** — `id`, `name`, `brand` (first-class, nullable), `price_amount numeric(12,2)`,
  `compare_at_amount` (nullable; `> price_amount` ⇒ on sale), `primary_category_id`, `status`
  (`draft|active|unavailable|archived`; only `active` is visible), `short_description`, `sku`,
  `created_at`. Existing indexes: `product_shop_status_idx`, `product_shop_price_idx`,
  `product_primary_category_id_idx`, trigram GIN over name/sku/brand/short_description.
- **`public.category`** — `id`, `key`, `name`, `parent_id` (hierarchy), `status`.
- **`public.attribute_definition`** — `id`, `key`, `label`, `data_type`
  (`short_text|long_text|number|boolean|single_select|multi_select`), `unit`, `status`.
- **`public.attribute_allowed_value`** — `attribute_definition_id`, `value` (options for select types).
- **`public.product_attribute_value`** (EAV) — `product_id`, `attribute_definition_id`, `value_text`,
  `value_number`, `value_boolean`, `value_options text[]`. Existing indexes:
  `product_attribute_value_product_idx`, `product_attribute_value_attr_idx`.

## Read-time facet projection (not persisted)

- **FacetSet** — the whole response for a query + applied filters:
  - `priceBounds { min, max }` — min/max active-product price in the current set (drives the price
    control), nullable when empty.
  - `facets: Facet[]`.
- **Facet** — one refinable dimension:
  - `key` — `"category"`, `"brand"`, or an attribute-definition `key` (e.g. `"diet"`); `"offers"` for
    the sale toggle.
  - `label` — display name (category → "Category"; brand → "Brand"; attribute → its `label`).
  - `type` — `single_select` (category) | `multi_select` (brand, select/boolean attributes) |
    `toggle` (offers).
  - `options: FacetOption[]`.
- **FacetOption**:
  - `value` — the concrete value (a brand string; an `attribute_allowed_value.value`; `true`/`false`).
  - `label` — display label.
  - `count` — number of **active** products matching this option **within the current filter set,
    excluding this facet's own selection** (the OR-within-facet count rule; FR-008/FR-010).
  - Options with `count = 0` are omitted (FR-009); a facet with no non-zero options is itself omitted.

## Filterability rule (derived, no schema change — R5)

An attribute becomes a facet iff `attribute_definition.status = 'active'` **and**
`data_type IN ('single_select','multi_select','boolean')`. `category` is always a facet
(`single_select`, options = active categories with a product-count rollup, reusing the existing
`categoryKey` filter param — no contract change to the filter input). `brand` is always a facet
(first-class column). `offers` is always available as a toggle. `number`/text attributes are **not**
faceted in this slice.

## Filter semantics (FR-003)

- **Within a multi-select facet** → OR: `product.brand = ANY($brands)`;
  `value_text = ANY($vals) OR value_options && $vals` for the attribute EAV row.
- **Across facets** → AND: each active facet contributes an `AND` predicate (attributes via `EXISTS`
  over `product_attribute_value`, as the current `search.go` `filters()` already does — extended from a
  single value to `ANY`).
- Price, category, offers, and text query compose unchanged with the above.

## Migration (forward-only): `<ts>_search_facet_indexes.sql`

Indexes to keep the concurrent aggregate counts inside p95 < 1 s at 50k products (validated by
`EXPLAIN (ANALYZE)` in quickstart — the migration ships only the indexes proven to be used):

- **Brand grouping over active products**:
  `CREATE INDEX product_active_brand_idx ON public.product (status, brand) WHERE status = 'active';`
  (partial, supports `GROUP BY brand` over the visible set and brand `= ANY` filtering).
- **Attribute-value grouping**:
  `CREATE INDEX product_attribute_value_def_product_idx ON public.product_attribute_value (attribute_definition_id, product_id);`
  (supports joining a filtered product set to its attribute values and grouping by definition/value).
- Category-facet counts reuse `product_primary_category_id_idx` and the existing category product-count
  rollup (no new index expected; confirm via EXPLAIN, add only if the plan shows a seq scan). Category
  is `single_select`, so its own selection is NOT excluded when computing category-option counts —
  unlike the multi-select facets, a single-select facet's counts reflect the fully-applied set.

⚠ **No change to the trigram expression or its GIN index.** `search.go`'s `trigramExpr` constant must
stay character-identical to the index expression (its own warning); this migration does not touch it.

## Validation rules (from requirements)

- Price: min ≤ max enforced before query (FR-004); non-numeric rejected.
- Only `status='active'` products counted or returned (FR-005; existing invariant).
- Facet counts and the grid share **one** `WHERE` builder so the headline total and the options cannot
  disagree with the list (extends `search.go`'s single-`filters()` discipline).
- Cursor is never carried across a sort or filter change (existing `cursor_sort_mismatch` guard;
  a filter change restarts at page 1).

## State transitions

None — this is a stateless read projection. Applied-filter state lives in the URL (web) / ViewModel
(mobile), not the database.

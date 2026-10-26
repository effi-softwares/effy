# Contracts: Category-Driven Catalogue (101)

DTOs live in `@effy/shared-types` (`taxonomy.ts` new; `catalog.ts`, `storefront.ts`, `cart.ts`,
`order.ts` and `product-review.ts` changed). Kotlin DTOs are regenerated.

Errors are RFC 7807 `problem+json` with `code` and, where relevant, `fields[]`. Money and ids keep
today's formats.

## Back-office: `catalog` service, staff gateway

- **Read** routes: any active staff.
- **Write** routes: admin or manager, from `admin.staff`. Every write appends an `admin.audit_log` row
  in the same transaction (`target_type` ∈ `category`, `attribute_definition`, `category_attribute`,
  `product_placement`).
- Every tree or attachment write ends with `rebuild_category_derived()`. After commit,
  `announceTaxonomy()` publishes `taxonomy` to ops and to every active shop (R21).

| Method & path | Body → response | Refusals |
|---|---|---|
| `GET /catalog/v1/taxonomy/categories` | → `TaxonomyTreeDTO` (every category with status, depth, isLeaf, productCount: home products in the subtree, placementCount, icon, imageUrl, synonyms, own and resolved defaults) | |
| `POST /catalog/v1/taxonomy/categories` | `{parentId\|null, name, icon?, synonyms?, defaults?, moveProductsToSelf?: boolean}` → `CategoryDTO` | `category_too_deep`, `category_sibling_name_taken`, `category_has_products` (the parent is home to products and `moveProductsToSelf` is not true), `parent_retired` |
| `PATCH /catalog/v1/taxonomy/categories/{id}` | `{name?, icon?, imageKey?\|null, synonyms?, defaults?: {storage?, gstStatus?, ageRestricted?} (null = inherit)}` → `CategoryDTO` | `category_sibling_name_taken`, `invalid_icon` |
| `POST /catalog/v1/taxonomy/categories/{id}/move` | `{parentId\|null, position}` → `TaxonomyTreeDTO` | `category_too_deep`, `category_cycle`, `category_has_products` (new parent is home to products; moves never carry products), `parent_retired`, `category_sibling_name_taken` |
| `POST /catalog/v1/taxonomy/categories/{id}/status` | `{status: "active"\|"retired", moveProductsToSelf?: boolean}` → `CategoryDTO` | retire: `category_in_use` (`productCount` in detail), `category_has_children`. Restore: `parent_retired`, `category_has_products` (the parent is home to products and `moveProductsToSelf` is not true), `category_sibling_name_taken` |
| `POST /catalog/v1/taxonomy/categories/{id}/image` | `{contentType}` → `{uploadUrl, imageKey}` (presign, `categories/` prefix) | `unsupported_media_type` |
| `GET /catalog/v1/taxonomy/categories/{id}/form` | → `CategoryFormDTO` (resolved form with `sourceCategoryId`/`sourceCategoryName` per row, the category's own attachments, and its resolved defaults) | |
| `PUT /catalog/v1/taxonomy/categories/{id}/attributes/{attributeId}` | `{level?: "required"\|"recommended"\|"optional", hidden?: boolean, section?, position?}` → `CategoryFormDTO` | `attachment_loosens`, `nothing_to_hide`, `attribute_retired` |
| `DELETE /catalog/v1/taxonomy/categories/{id}/attributes/{attributeId}` | → `CategoryFormDTO` | `attachment_not_found` |
| `GET /catalog/v1/taxonomy/attributes` | `?status=&q=` → `AttributeDTO[]` (with `usage: {categories, products}`) | |
| `GET /catalog/v1/taxonomy/attributes/{id}` | → `AttributeDTO` (with values and their usage counts, and attaching categories) | |
| `POST /catalog/v1/taxonomy/attributes` | `AttributeInput` → `AttributeDTO` | `attribute_name_taken`, `attribute_is_stock_date`, `invalid_attribute` (`fields[]`: unit family or units, limits, switches not allowed for the input type, choice types with no values) |
| `PATCH /catalog/v1/taxonomy/attributes/{id}` | `AttributeInput` partial; `values` is the full ordered list `[{id?, label, status}]` → `AttributeDTO` | `attribute_in_use` (input type or unit family changed), `value_in_use` (a used value omitted), plus the create refusals |
| `POST /catalog/v1/taxonomy/attributes/{id}/status` | `{status}` → `AttributeDTO` | `attribute_in_use` |
| `PUT /catalog/v1/products/{productId}/placements` | `{categoryIds: string[]}` (≤ 5) → `{categoryIds}` | `category_not_leaf`, `placement_is_home`, `too_many_placements` |
| `GET /catalog/v1/products/missing-details` | `?cursor=` → page of `{productId, shopName, name, categoryPath, missing: string[]}` | |

**Changed**: `GET /catalog/v1/review/items/{productId}` adds the following, and `approve` refuses
`missing_required_details`:
- `categoryPath: string[]`
- `facts: {storage, gstStatus, ageRestricted}`
- `factOverrides: ("storage"|"gstStatus"|"ageRestricted")[]`
- `details: ProductDetailsDTO`
- `missingRecommended: string[]`
- `placements: {categoryId, path}[]`

**Deleted**: all 18 routes under `/admin/v1/catalog/*`, plus `GET /catalog/v1/gst/missing` and
`POST /catalog/v1/gst/bulk`.

### Shapes

```ts
type InputType = "short_text"|"long_text"|"number"|"boolean"|"single_select"|"multi_select"|"date"|"time"
type Level = "required"|"recommended"|"optional"
type Storage = "frozen"|"chilled"|"ambient"

interface AttributeInput {
  name: string; helpText?: string|null; inputType: InputType
  unitFamily?: UnitFamily|null; units?: string[]           // number only
  min?: string|null; max?: string|null; decimals?: number|null; maxLength?: number|null
  filterable: boolean; customerVisible: boolean; variesByVariant: boolean; variantOption: boolean
  values?: { id?: string; label: string; status?: "active"|"retired" }[]   // choice types
}
interface CategoryFormRow {
  attributeId: string; key: string; name: string; helpText: string|null; inputType: InputType
  unitFamily: UnitFamily|null; units: string[]; min: string|null; max: string|null; decimals: number|null; maxLength: number|null
  values: { id: string; label: string }[]                  // active values only
  level: Level; section: string; position: number
  variesByVariant: boolean; variantOption: boolean; customerVisible: boolean; filterable: boolean
  sourceCategoryId: string; sourceCategoryName: string     // back-office only
}
interface CategoryFormDTO {
  categoryId: string; path: string[]; isLeaf: boolean
  sections: { title: string; rows: CategoryFormRow[] }[]
  defaults: { storage: Storage|null; gstStatus: GstStatus|null; ageRestricted: boolean|null }
}
```

## Shop: `shop` service, shared gateway

| Method & path | Body → response | Notes |
|---|---|---|
| `GET /shop/v1/catalog/categories` | → `ShopTaxonomyDTO {categories: {id, parentId, name, path: string[], isLeaf, synonyms, icon}[], recentLeafIds: string[] (≤ 5)}` | Active categories only. Replaces `GET /shop/v1/catalog/schema` |
| `GET /shop/v1/catalog/categories/{id}/form` | → `CategoryFormDTO` (without source fields) | `category_not_leaf` for a parent |
| `POST /shop/v1/products` | `{name, primaryCategoryId, brand?, shortDescription, longDescription?, storage?, gstStatus?, ageRestricted?, unitBasis?, options, variants, details?: DetailInput[], media?}` → `ProductDetail` | Facts that are absent take the leaf's defaults (`fact_required` when it has none). `category_not_leaf`. Details are checked against the leaf's form |
| `PATCH /shop/v1/products/{id}` | same fields, partial, with `version` | Draft: live write. Approved: becomes a `product_change` proposal (067) |
| `POST /shop/v1/products/{id}/submit` | → `ProductDetail` | `missing_required_details` (`fields[]` names each attribute or variant) |
| `GET /shop/v1/products` | adds `?missing=true` | Each list item adds `missingRequired: number` |

```ts
interface DetailInput {
  attributeId: string
  // exactly one of:
  value?: DetailValue                                     // the whole product
  perVariant?: { variantId: string; value: DetailValue }[] // "Differs by variant"; variesByVariant attributes only
}
type DetailValue =
  | { text: string } | { number: string; unit?: string } | { boolean: boolean }
  | { valueIds: string[] } | { date: string /* YYYY-MM-DD */ } | { time: string /* HH:MM */ }

// OptionInputDTO (098) changes:
interface OptionInputDTO {
  id: string; position: 1|2
  kind: "attribute"|"pack_size"
  attributeId?: string                                    // kind=attribute; must be variantOption in the leaf's form
  values: { id: string; allowedValueId?: string; position: number }[]  // pack_size: ids only; labels come from variants' packs
}
```

`ProductDetail` (shop) adds:
- `categoryPath`
- `storage`, `ageRestricted`, `gstStatus` (non-null)
- `factDefaults` (the leaf's)
- `details: {attributeId, value?|perVariant?}[]`
- `missingRequired: string[]`

`attributes` and `productTypeId` are removed.

## Storefront: shared gateway, public

| Route | Change |
|---|---|
| `GET /storefront/v1/categories` | `StorefrontCategoryDTO` adds `icon: string\|null`, `depth`, and `isLeaf`. `imageUrl` is the staff picture, falling back to today's derived product picture. Counts include extra placements, each product counted once |
| `GET /storefront/v1/products` | `attr.<key>=<valueId>` (repeatable; **AND across keys**, OR within), `range.<key>=<min>..<max>` (display unit of the facet). Category membership includes placements |
| `GET /storefront/v1/facets` | Attribute facets follow R9. New `FacetType` `"range"` with `range: {min: string, max: string, unit: string}` and no `options`. Choice options' `value` is the allowed-value id |
| `GET /storefront/v1/products/{id}` | `attributes` removed. Each variant adds `details: ProductAttributeGroupDTO[]` (customer-visible, rendered strings). `?variant=` is honoured; from a filtered list the client passes the matching variant (the card's `variantId` is the first active variant matching the filters) |
| Card, cart line, checkout line, order line DTOs | add `ageRestricted: boolean` |

## Shared types and twins

| File | Contents | Twin |
|---|---|---|
| `taxonomy.ts` (new) | the DTOs above, `CATEGORY_DEPTH_MAX = 5`, `PLACEMENTS_MAX = 5`, `LEVEL_ORDER` | |
| `units.ts` (new) | `UNIT_FAMILIES`, `toBase`, `fromBase`, `formatAttributeValue` | server-only rendering, so no Kotlin twin |
| `category-suggest.ts` (new) | `suggestCategories(name, leaves)`, pinned to `category-suggest.fixtures.json` | |
| `product-form.ts` (new) | `validateDetails(form, details, variants)`, `recategorise(...)`, `isStockDateName` | shop-web and the server use the same function |
| `category-icons.ts` (new) | `CATEGORY_ICONS` (key → Lucide name), pinned to `category-icons.fixtures.json` | Kotlin `CategoryIcons.kt` (replaces the word rules) |
| `age-words.ts` (new) | `AGE_RESTRICTED_LABEL = "18+"` and the cart/checkout sentence | Kotlin twin pinned to fixtures |

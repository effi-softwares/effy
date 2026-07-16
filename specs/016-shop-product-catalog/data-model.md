# Data Model: Shop Product Catalog Management (015)

Phase 1 data design. Tables live in the **`public`** schema (operational, alongside `public.shop`),
raw SQL, Goose forward-only migration, `text CHECK` enums (no native PG enums, no `updated_by`, no
triggers — plain `created_at`/`updated_at timestamptz NOT NULL DEFAULT now()`), an index on every FK,
`COMMENT ON` for each table/column. DTOs live once in `@effy/shared-types` (`catalog.ts`); the
shop-facing subset regenerates to Kotlin for shop-mobile.

Legend: **PK** primary key · **FK** foreign key · `∎` platform-owned (never written from token data).

---

## 1. Entity-relationship overview

```
                          ┌────────────────────┐
                          │ attribute_definition│──1─┐
                          └─────────┬───────────┘    │ (select types)
                                    │1               ▼N
                                    │        ┌──────────────────────┐
                                    │N       │ attribute_allowed_value│
                          ┌─────────▼───────┐└──────────────────────┘
   ┌───────────────┐     │product_type_attr │  (assignment: mandatory?, order, group)
   │ product_type  │──1──┤  (M:N join)      │
   └──────┬────────┘     └──────────────────┘
          │1
          │N                    ┌──────────┐        ┌──────────────┐
   ┌──────▼────────┐   N     1  │ category │ self-FK│ (taxonomy)   │
   │   product     ├────────────►(primary) │◄───────┘ parent_id    │
   │ (shop-owned)  │            └──────────┘
   └─┬───┬───┬─────┘
     │   │   │N       ┌────────────────────────┐
     │   │   └────────► product_attribute_value │ (EAV: one typed value col per data_type)
     │   │            └────────────────────────┘
     │   │N   ┌──────────────┐
     │   └────► product_media │ (primary + gallery, ordered)
     │        └──────────────┘
     │N   ┌────────────────┐   N        1 ┌──────────────┐
     └────► product_section │◄────────────┤ shop_section  │ (shop-local)
          └────────────────┘              └──────┬───────┘
                                                 │N
   product.shop_id ─FK RESTRICT─► public.shop ◄──┘  shop_section.shop_id ─FK CASCADE─► public.shop
```

---

## 2. Tables

### 2.1 `public.product_type` — back-office classification
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK DEFAULT gen_random_uuid()` | |
| `key` | `text NOT NULL UNIQUE` | stable slug (e.g. `prepared_food`) |
| `name` | `text NOT NULL` | display name |
| `description` | `text` | nullable |
| `status` ∎ | `text NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired'))` | retired hides from new-product creation; existing products keep it |
| `created_at`/`updated_at` | `timestamptz NOT NULL DEFAULT now()` | |

### 2.2 `public.attribute_definition` — reusable attribute
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `key` | `text NOT NULL UNIQUE` | slug (e.g. `net_weight`) |
| `name` | `text NOT NULL` | |
| `data_type` ∎ | `text NOT NULL CHECK (data_type IN ('short_text','long_text','number','boolean','single_select','multi_select'))` | |
| `unit` | `text` | nullable (e.g. `g`, `ml`, `min`) |
| `help_text` | `text` | nullable |
| `validation` | `jsonb` | nullable: `{min?,max?,maxLength?}` |
| `status` ∎ | `text NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired'))` | retire blocked/handled if in use (FR-006) |
| `created_at`/`updated_at` | `timestamptz` | |

### 2.3 `public.attribute_allowed_value` — options for select types
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `attribute_definition_id` | `uuid NOT NULL REFERENCES attribute_definition(id) ON DELETE CASCADE` | |
| `value` | `text NOT NULL` | stored value |
| `label` | `text NOT NULL` | display |
| `display_order` | `int NOT NULL DEFAULT 0` | |
| — | `UNIQUE (attribute_definition_id, value)` | removing an in-use value is blocked (FR-006) |

### 2.4 `public.product_type_attribute` — assignment (type ↔ attribute)
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `product_type_id` | `uuid NOT NULL REFERENCES product_type(id) ON DELETE CASCADE` | |
| `attribute_definition_id` | `uuid NOT NULL REFERENCES attribute_definition(id) ON DELETE RESTRICT` | |
| `is_mandatory` ∎ | `boolean NOT NULL DEFAULT false` | drives required-field enforcement |
| `display_order` | `int NOT NULL DEFAULT 0` | step-form order |
| `group_label` | `text` | nullable; groups fields into form steps / detail sections |
| — | `UNIQUE (product_type_id, attribute_definition_id)` | |

### 2.5 `public.category` — platform taxonomy (hierarchical)
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `parent_id` | `uuid REFERENCES category(id) ON DELETE RESTRICT` | nullable = top level |
| `key` | `text NOT NULL UNIQUE` | slug |
| `name` | `text NOT NULL` | |
| `display_order` | `int NOT NULL DEFAULT 0` | |
| `status` ∎ | `text NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired'))` | |
| `created_at`/`updated_at` | `timestamptz` | |

### 2.6 `public.product` — the shop-owned catalog item
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `shop_id` | `uuid NOT NULL REFERENCES public.shop(id) ON DELETE RESTRICT` | **ownership + isolation key** |
| `product_type_id` | `uuid NOT NULL REFERENCES product_type(id) ON DELETE RESTRICT` | |
| `primary_category_id` | `uuid NOT NULL REFERENCES category(id) ON DELETE RESTRICT` | |
| `name` | `text NOT NULL` | title |
| `sku` | `text` | nullable; **unique per shop when present** (§3) |
| `gtin` | `text` | nullable; **not** unique (future dedupe key) |
| `brand` | `text` | nullable; first-class (searchable, R7) |
| `price_amount` | `numeric(12,2) NOT NULL CHECK (price_amount >= 0)` | |
| `currency` ∎ | `char(3) NOT NULL DEFAULT 'AUD'` | single platform currency (assumption) |
| `compare_at_amount` | `numeric(12,2) CHECK (compare_at_amount >= 0)` | nullable (sale/RRP) |
| `short_description` | `text NOT NULL` | universal mandatory |
| `long_description` | `text` | nullable |
| `status` ∎ | `text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','unavailable','archived'))` | lifecycle (§4) |
| `created_by` | `text NOT NULL` | operator `cognito_sub` |
| `created_at`/`updated_at` | `timestamptz` | |

Indexes: `product_shop_id_idx (shop_id)`, `product_shop_status_idx (shop_id, status)`,
`product_shop_price_idx (shop_id, price_amount)`, `product_shop_created_idx (shop_id, created_at DESC)`,
`product_type_id_idx`, `product_primary_category_id_idx`,
partial unique `product_shop_sku_uq (shop_id, sku) WHERE sku IS NOT NULL`,
and a `pg_trgm` GIN over `lower(name||' '||coalesce(sku,'')||' '||coalesce(brand,'')||' '||short_description)` for `q`.

### 2.7 `public.product_attribute_value` — EAV value
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `product_id` | `uuid NOT NULL REFERENCES product(id) ON DELETE CASCADE` | |
| `attribute_definition_id` | `uuid NOT NULL REFERENCES attribute_definition(id) ON DELETE RESTRICT` | |
| `value_text` | `text` | populated when data_type ∈ short_text/long_text/single_select |
| `value_number` | `numeric` | number |
| `value_boolean` | `boolean` | boolean |
| `value_options` | `text[]` | multi_select |
| `created_at`/`updated_at` | `timestamptz` | |
| — | `UNIQUE (product_id, attribute_definition_id)` | one value row per attribute |

Exactly one `value_*` column is populated per row, matching the attribute's `data_type` (enforced in
the service layer; a CHECK can assert not-all-null).

### 2.8 `public.product_media`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `product_id` | `uuid NOT NULL REFERENCES product(id) ON DELETE CASCADE` | |
| `storage_key` | `text NOT NULL` | S3 object key |
| `is_primary` ∎ | `boolean NOT NULL DEFAULT false` | exactly one true per product |
| `display_order` | `int NOT NULL DEFAULT 0` | gallery order |
| `alt_text` | `text` | nullable |
| `created_at` | `timestamptz` | |
| — | partial unique `product_media_primary_uq (product_id) WHERE is_primary` | at most one primary |

### 2.9 `public.shop_section` — shop-local grouping
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `shop_id` | `uuid NOT NULL REFERENCES public.shop(id) ON DELETE CASCADE` | |
| `name` | `text NOT NULL` | |
| `display_order` | `int NOT NULL DEFAULT 0` | |
| `created_at`/`updated_at` | `timestamptz` | |
| — | `UNIQUE (shop_id, name)` | |

### 2.10 `public.product_section` — M:N join
| Column | Type | Notes |
|---|---|---|
| `product_id` | `uuid NOT NULL REFERENCES product(id) ON DELETE CASCADE` | |
| `shop_section_id` | `uuid NOT NULL REFERENCES shop_section(id) ON DELETE CASCADE` | |
| — | `PRIMARY KEY (product_id, shop_section_id)` | |

### 2.11 `admin.audit_log` (existing) — new actions
Schema mutations write an audit row inside the same transaction (verified 009 pattern):
`product_type.create/update/retire`, `attribute.create/update/retire`,
`attribute_value.add/remove`, `category.create/update/retire`. `target_type ∈ {product_type,
attribute_definition, category}`; `detail jsonb`. (Shop-side product CRUD is **not** audited in this
slice — consistent with 007/009 shop side; a future enhancement.)

---

## 3. Validation rules (service layer)

- **Universal mandatory (create)**: `name`, `product_type_id` (must be `active`), `primary_category_id`
  (must be `active`), `price_amount ≥ 0`, `short_description`, **≥1 media with a primary image**
  (FR-010). Reject with 400 + field errors otherwise.
- **Type-driven mandatory**: every `product_type_attribute.is_mandatory = true` for the chosen type
  MUST have a value; optional ones may be omitted (FR-009/FR-011).
- **Attribute value typing**: value must match the attribute's `data_type`; `number` within
  `validation.min/max`; text within `maxLength`; `single_select`/`multi_select` values must be members
  of `attribute_allowed_value`. Reject with inline reasons (FR-023).
- **SKU**: optional; when present, unique within `shop_id` (partial unique index → 409 conflict on
  `23505`); blank always allowed (R6).
- **Brand (FR-010a)**: optional; written to the first-class `product.brand` column on create/edit (its
  single authority) so `q` search covers it. There is no `brand` attribute definition.
- **Focused-edit concurrency (FR-023a)**: `PATCH /shop/v1/products/{id}` carries `expectedUpdatedAt`
  (the `updated_at` the client last read). The update runs `... WHERE id = :id AND shop_id = :actorShopId
  AND updated_at = :expectedUpdatedAt`; **0 rows affected → 409 conflict** ("product changed, reload").
  This is optimistic concurrency using the existing `updated_at` — no version column is added. Edits to
  different sections still both succeed unless they race the *same* row's `updated_at`.
- **Schema-drift indicator (FR-020a)**: on detail read, the service computes the set of the product
  type's currently-mandatory attributes that the product has no `product_attribute_value` for, and
  returns it as `ProductDetailDTO.missingMandatoryAttributes` (a non-blocking notice; never hides the
  product).
- **Schema-change safety (FR-006)**: retiring/deleting an attribute or removing an allowed value that
  is referenced by any `product_attribute_value` is blocked (409) with the conflict surfaced; retiring a
  product type does not corrupt existing products.
- **Shop isolation (every shop query)**: `WHERE shop_id = :actorShopId` derived from the operator's
  `shop_staff` record — never from a client-supplied shop id (FR-019/FR-031, SC-005).
- **Hard-delete guard**: `DELETE` refused (409 → "archive instead") unless the product is `draft` and
  never activated / unreferenced (R8).

---

## 4. State transitions — `product.status`

```
        create
          │
          ▼
       ┌──────┐  publish   ┌────────┐  make unavailable  ┌────────────┐
       │draft │──────────► │ active │◄──────────────────►│ unavailable│
       └──┬───┘            └───┬────┘                     └─────┬──────┘
          │ hard-delete        │ archive                        │ archive
          │ (only here,        ▼                                ▼
          │  unreferenced)  ┌──────────┐  reactivate      ┌──────────┐
          └───────────►(gone)│ archived │◄────────────────┤ archived │
                             └──────────┘                 └──────────┘
```

- `draft → active` = publish (all mandatory fields validated).
- `active ↔ unavailable` = temporary hide (data intact).
- any → `archived` = the default "remove" (retained).
- `archived → active` = reactivate (re-validate mandatory fields).
- **hard delete** allowed only from `draft`/unreferenced; otherwise archive.

---

## 5. DTO surface (`@effy/shared-types` `catalog.ts`)

Enum unions + `readonly[]` constants mirroring the SQL CHECK sets:
`ProductStatus` (`draft|active|unavailable|archived`), `AttributeDataType`, `SchemaStatus`
(`active|retired`). Reuse `PagedDTO<T>`.

**Schema (admin) DTOs**: `ProductTypeDTO`, `AttributeDefinitionDTO` (+ `allowedValues`),
`ProductTypeAttributeDTO`, `CategoryDTO` (+ `parentId`, tree flattening client-side); request bodies
`CreateProductTypeRequest`, `UpdateProductTypeRequest`, `AssignAttributeRequest`,
`CreateAttributeDefinitionRequest`, `UpdateAttributeDefinitionRequest`, `CreateCategoryRequest`,
`UpdateCategoryRequest`, `ChangeSchemaStatusRequest`.

**Shop-facing DTOs** (also regenerated to Kotlin): `CatalogSchemaDTO` (active types + their assigned
attributes + active category tree, for the create form), `ProductListItemDTO` (thin row: id, name,
brand, primaryImageUrl, typeName, categoryName, price, currency, status, sku), `ProductDetailDTO`
(full + `brand` + `updatedAt` (the concurrency token) + `attributes: ProductAttributeValueDTO[]` +
`media: ProductMediaDTO[]` + `sections: string[]` + `missingMandatoryAttributes: string[]` (FR-020a)),
`CreateProductRequest` (incl. optional `brand`), `UpdateProductRequest` (all fields optional — focused
edits PATCH a subset — plus a required `expectedUpdatedAt` concurrency token, FR-023a),
`ChangeProductStatusRequest`, `ProductMediaDTO`, `CreatePresignedUploadRequest`/`Response`,
`ShopSectionDTO`, `CreateShopSectionRequest`. List envelope: `PagedDTO<ProductListItemDTO>`.

Timestamps are ISO `string`; nullable wire fields `T | null`; every enum has a tolerant-reader
narrowing helper (the `toShopRoles` pattern) for values authored by the back office.

---

## 6. Seed (starter schema — back-office-editable)

Inserted `ON CONFLICT (key) DO NOTHING`: product types `prepared_food`, `packaged_grocery`,
`beverage`, `household`; a starter attribute library (`dietary_labels` multi_select,
`allergens` multi_select, `spice_level` single_select, `prep_time` number/min,
`net_weight` number/g, `net_volume` number/ml, `storage` single_select, `country_of_origin` short_text,
`ingredients` long_text, `material` short_text, `dimensions` short_text); their type assignments
(food gets dietary/allergens/spice/prep; grocery gets net_weight/storage/origin; etc.); and a
small category tree (Food → {Meals, Bakery, …}, Grocery → {Pantry, Chilled, Frozen, …}, Household).

> **Brand is deliberately NOT seeded as an attribute (F1 / FR-010a).** Brand has a **single
> authority**: the first-class `product.brand` column (§2.6), captured in the creation basics and
> covered by the `q` search index. Modelling it *also* as a dynamic attribute would split its authority
> and leave `product.brand` (and therefore brand search) empty.
The starter set makes the feature usable day one; everything remains editable in the back office
(SC-001).

---
description: "Task list for 101 — Category-Driven Catalogue"
---

# Tasks: Category-Driven Catalogue

**Input**: Design documents from `specs/101-category-driven-catalogue/`. Read research.md (R1–R22),
data-model.md, contracts/api.md and quickstart.md before starting.

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, quickstart.md

**Tests**: Included. The repo's quality gates and the plan require guard tests, container tests,
shared fixtures and client unit tests for every writer and pure rule.

**Path abbreviations**:

| Abbreviation | Path |
|---|---|
| `EA` | `apis/edge-api` |
| `ST` | `packages/shared-types/src` |
| `BO` | `apps/back-office/src` |
| `SW` | `apps/shop-web/src` |
| `CW` | `apps/customer-web` |
| `CM` | `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile` |

**Rules for every task**:
- No legacy or compatibility code (FR-036). Delete what the old model needed.
- Claude writes code only. The operator runs `terraform apply`, migrations, seeds and deploys.
- Never `git commit`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task).
- **[Story]**: US1–US8, from spec.md.

---

## Phase 1: Setup (operator files, infrastructure, migration scaffolds)

- [X] T001 Write `db/reset/101_purge_catalogue_dev.sql`:
  - `\set ON_ERROR_STOP on`, one transaction, a header saying "dev only, run after `make purge-orders ENV=dev`";
  - print row counts, then `TRUNCATE public.product … CASCADE` together with `cart_item`, `cart_saved_item`, `customer_saved_item`, `promotion_target`, `stock_movement`, `shop_product_sales_day`, `product_change`, `product_change_media`, `product_gst_change`, `product_media`, `product_section`, `product_option`, `product_option_value`, `product_variant`, `product_attribute_value`;
  - refuse (RAISE) if any `public."order"` row remains (R17).
- [X] T002 [P] Add `"categories"` to `PUBLIC_MEDIA_PREFIXES` in `EA/shared/src/lib/media-public.ts` and to `local.public_media_prefixes` in `infra/envs/dev/media.tf`. Confirm the existing prefix-parity guard covers both, extending it if not (R13).
- [X] T003 Scaffold `make db-new name=category_catalogue` and `make db-new name=catalogue_taxonomy` under `db/migrations/`. The taxonomy file's timestamp must sort after the schema file's.
- [X] T004 [P] Delete `db/seeds/084_storefront_catalogue_dev.sql` and `db/seeds/098_variant_catalogue_dev.sql`, and update any doc or Makefile reference to them (`grep -rn "084_storefront\|098_variant" --exclude-dir=node_modules`).

---

## Phase 2: Foundational (schema, derived taxonomy, shared rules, old model removed)

**⚠ Blocks every story.** At the end, every service compiles and passes its tests against the new
schema, and no code names product types or the `storage` attribute.

### Schema migration (`db/migrations/<ts>_category_catalogue.sql`)

- [X] T005 Section 0: a `DO` guard that raises `'101: the catalogue is not empty — run db/reset/101_purge_catalogue_dev.sql first'` when any `public.product` row exists. Section 1: delete the baseline rows of `attribute_allowed_value`, `attribute_definition` and `category`, and drop `product_type_attribute`, `product_type`, `product.product_type_id` and its index.
- [X] T006 Same file, `category` (data-model.md; needs T015's icon keys):
  - rename `display_order` to `position`;
  - add `icon` (CHECK against the icon keys of T015), `image_key`, `synonyms text[] NOT NULL DEFAULT '{}'`, `default_storage`, `default_gst_status`, `default_age_restricted` with CHECKs;
  - add a unique index on `(parent_id, lower(name)) NULLS NOT DISTINCT WHERE status='active'`.
- [X] T007 Same file, `attribute_definition` and `attribute_allowed_value`:
  - rename `data_type` to `input_type`, with a CHECK over the 8 types;
  - add `unit_family`, `units text[]`, `min_value`, `max_value`, `decimals`, `max_length`, `filterable`, `customer_visible`, `varies_by_variant`, `variant_option`, with CHECKs coupling them to `input_type`;
  - drop `unit` and `validation`;
  - add a unique index on `lower(name)`;
  - values: drop `value`, rename `display_order` to `position`, add `status`, and add a unique index on `(attribute_definition_id, lower(label))`.
- [X] T008 Same file, create `public.category_attribute` (PK `(category_id, attribute_id)`, `level`, `hidden`, `section`, `position`, CHECK `hidden = (level IS NULL)`) and `public.product_placement` (PK `(product_id, category_id)`, `created_by`, `created_at`, FK `ON DELETE CASCADE` on the product).
- [X] T009 Same file, `product`: add `storage text NOT NULL` with CHECK `frozen|chilled|ambient`, add `age_restricted boolean NOT NULL`, and make `gst_status` NOT NULL.
- [X] T010 Same file, `product_attribute_value`:
  - add `variant_id` with composite FK `(variant_id, product_id)` → `product_variant(id, product_id)` ON DELETE CASCADE;
  - add `value_unit`, `value_base`, `value_date`, `value_time`; replace `value_options` with `allowed_value_ids uuid[]`;
  - swap the unique to `(product_id, attribute_definition_id, variant_id) NULLS NOT DISTINCT`;
  - add an exactly-one-value CHECK;
  - add indexes `(attribute_definition_id, product_id)`, GIN `(allowed_value_ids)`, `(attribute_definition_id, value_base)`.
- [X] T011 Same file, options:
  - `product_option`: drop `name`; add `kind` (CHECK `attribute|pack_size`) and `attribute_id` (FK, CHECK coupled to `kind`); add a unique on `(product_id, attribute_id)` and a partial unique on one `pack_size` per product;
  - `product_option_value`: add `allowed_value_id` (FK).
- [X] T012 Same file, the derived tables `category_ancestor`, `category_resolved` and `category_form`, with PKs and indexes as in data-model.md, plus `public.rebuild_category_derived()` (plan "Implementation notes"):
  - TRUNCATE all three, then build the closure over active categories, `category_resolved` (depth, `is_leaf`, path arrays, defaults coalesced deepest-first) and `category_form` (a root-first fold: set, tighten, hide, re-attach);
  - raise when depth > 5.
- [X] T013 Same file:
  - `public.product_missing_required(p uuid) RETURNS TABLE(attribute_id uuid, attribute_name text, variant_id uuid)` (R15): one row per required row of the leaf's `category_form` with no value (`variant_id` NULL), and for per-variant attributes one row per active variant without a value. It builds **no** variant label; `missingRequired()` (T025) labels variants with `variantLabelSql`;
  - a header comment and SQL comments on each section and function (the baseline carries no `COMMENT ON`);
  - a Down section that is a loud no-op (`SELECT 1; -- irreversible: fix forward (101)`).

### Taxonomy data migration (`db/migrations/<ts>_catalogue_taxonomy.sql`)

- [X] T014 Write the general-retailer seed as temp `VALUES` tables (084's style). It ends with `SELECT public.rebuild_category_derived();`.
  - **Departments (FR-034, 25)**: Fruit & Vegetables; Meat & Seafood; Dairy, Eggs & Fridge; Bakery; Pantry; Frozen; Snacks & Confectionery; Drinks; Liquor; Ready Meals & Deli; Health & Wellness; Beauty & Personal Care; Baby; Pet; Household & Cleaning; Home & Kitchen; Electronics; Toys & Games; Clothing & Accessories; Garden & Outdoor; Hardware & Tools; Office & Stationery; Sports & Fitness; Automotive; Party & Entertaining.
  - **Shape**: 600–900 categories, depth 2–5, leaves a shop recognises (e.g. Dairy › Yoghurt › Greek & Natural; Electronics › Phones & Accessories › Chargers & Cables; Pet › Dogs › Dog Food › Dry Dog Food).
  - **Per category**: a key slug, an icon key from T015, and synonyms on common leaves (soda → Soft Drinks; nappies → Nappies; charger → Chargers & Cables).
  - **Library**: about 60 attributes with values and units (FR-035), including allergens (the 10 AU allergens incl. sesame and lupin), dietary labels, ingredients, nutrition information, country of origin, organic, alcohol content, flavour, material, dimensions, colour, clothing size, shoe size, power, voltage, connector type, battery included, warranty, age range, scent, skin type, hair type, pet type, life stage, breed size, screen size, capacity, and pack count.
  - **Flags**: mark `filterable`, `varies_by_variant` and `variant_option` sensibly (flavour, colour, scent, clothing size and shoe size are variant options).
  - **Attachments**: at the right levels, for example allergens Required on every food and drink department (there is no common food root, so it is attached once per department) and hidden on Fruit & Vegetables › Fresh Fruit and Fresh Vegetables (whole produce); alcohol content Required on Liquor.
  - **Defaults (every leaf resolves all three; spec Clarifications 2026-10-26)**:
    - storage: Frozen → frozen; Dairy, Eggs & Fridge, Meat & Seafood and Ready Meals & Deli → chilled; every other department → ambient, with sub-branch overrides where needed (e.g. ice cream under Snacks stays in Frozen);
    - GST: Fruit & Vegetables, Meat & Seafood, Dairy, Eggs & Fridge, Bakery (bread and rolls) and Pantry → `gst_free`; Snacks & Confectionery, soft drinks and other sweetened drinks under Drinks, Ready Meals & Deli, Liquor and every non-food department → `taxable`; sub-branch overrides where the department mixes (cakes and pastries under Bakery taxable, sweetened drinks taxable, bottled water and milk gst_free);
    - age-restricted: Liquor → true; every other department → false.
    - Leave a header note: the operator confirms the GST mapping with their accountant; staff change defaults in back-office without a release.
- [X] T015 [P] Create `ST/category-icons.ts` (`CATEGORY_ICONS`: about 40 keys mapped to Lucide names covering every department) and `packages/shared-types/category-icons.fixtures.json`. The CHECK in T006 lists the same keys; add a test in `ST/category-icons.test.ts` that reads the migration file and compares the two lists.
- [X] T016 Container test `EA/shared/src/catalog/catalogue-taxonomy.container.test.ts` (load the baseline and both new migrations via `migrationSql()`), asserting:
  - depth ≤ 5;
  - unique sibling names;
  - all 25 departments present, each with leaves;
  - no attachment loosens an inherited level;
  - every leaf resolves `storage`, `gst_status` and `age_restricted`;
  - every Liquor leaf resolves `age_restricted = true` and no leaf outside Liquor does;
  - every leaf under a food or drink department resolves allergens as required unless hidden;
  - no attribute name matches `isStockDateName`.
- [X] T017 Container test `EA/shared/src/catalog/rebuild-category-derived.container.test.ts` on a small hand-built tree, covering:
  - set, tighten, hide and re-attach;
  - section and position inheritance;
  - default inheritance and override;
  - `is_leaf` after retiring the only child;
  - the closure;
  - `product_missing_required` rows for product-level and per-variant attributes (`variant_id` set, no label);
  - retiring a category with an active child is impossible through the writer (asserted in T040), so the closure test only covers retired leaves;
  - the depth > 5 raise.

### Shared types and pure rules

- [X] T018 [P] Create `ST/taxonomy.ts` with every DTO in contracts/api.md (`InputType`, `Level`, `Storage`, `AttributeInput`, `AttributeDTO`, `CategoryDTO`, `TaxonomyTreeDTO`, `CategoryFormRow`, `CategoryFormDTO`, `ShopTaxonomyDTO`, `DetailInput`, `DetailValue`), plus `CATEGORY_DEPTH_MAX = 5`, `PLACEMENTS_MAX = 5`, `LEVEL_ORDER`, and `STORAGE_WORDS` (ambient = "Room temperature"). Export from `ST/index.ts`.
- [X] T019 [P] Create `ST/units.ts` with `UNIT_FAMILIES` (R8), `toBase(value, unit)`, `fromBase`, `unitFamilyOf`, and `formatAttributeValue(row, value)`, plus `ST/units.test.ts` (kg↔g, L↔mL, TB↔GB, display rounding).
- [X] T020 [P] Create `ST/product-form.ts` and `ST/product-form.test.ts`:
  - `isStockDateName(name)` (R19);
  - `validateDetails(form, details, variants)`, returning field errors for: required missing, per-variant missing per active variant, wrong value family, limits, units outside the attribute's list, retired or unknown value ids, and `perVariant` on an attribute that is not `varies_by_variant`;
  - `recategorise(draft, oldForm, newForm, newDefaults, factsTouched)`, returning `{kept, dropped, facts}`.
- [X] T021 [P] Create `ST/age-words.ts` (`AGE_RESTRICTED_LABEL = "18+"` and `AGE_RESTRICTED_CART_SENTENCE`) and `packages/shared-types/age-words.fixtures.json`.
- [X] T022 Update `ST/catalog.ts`:
  - remove `ProductTypeDTO`, `ProductTypeAttributeDTO`, `CreateProductTypeRequest`, `UpdateProductTypeRequest`, `AssignAttributeRequest`, the old attribute and category request types, and the `productTypes` key of the schema DTO;
  - change the shop `ProductDetail`, create and update shapes per contracts/api.md (facts, `details`, `factDefaults`, `missingRequired`, `categoryPath`; no `attributes` or `productTypeId`);
  - change the proposal keys (R18).
- [X] T023 Update `ST/variants.ts`: `OptionInputDTO` gets `kind` and `attributeId`, and values get `allowedValueId` (contracts/api.md). `validateVariantSet` drops the option-name rules and checks kind/attribute coupling, one `pack_size` per product, at least one value, and for `pack_size` that two variants with the same pack are refused. Update `ST/variants.test.ts`.
- [X] T024 Update `ST/storefront.ts`:
  - `StorefrontCategoryDTO` adds `icon`, `depth` and `isLeaf`;
  - remove `StorefrontProductDetailDTO.attributes`;
  - `StorefrontVariantDTO` adds `details: ProductAttributeGroupDTO[]`;
  - `FacetType` adds `"range"` and `FacetDTO` adds an optional `range: {min, max, unit}`;
  - the card adds `ageRestricted`.

  Add `ageRestricted` to the line DTOs in `ST/cart.ts`, `ST/order.ts` and `ST/checkout.ts`. Add `taxonomy` to `LIVE_KINDS` in `ST/live.ts`. Regenerate `packages/shared-types/contract/*` with the existing generator (`make cm-contract-gen`).

### Edge-shared catalogue core

- [X] T025 Create `EA/shared/src/catalog/form.ts`:
  - `readForm(q, categoryId, {withSources})` → `CategoryFormDTO` from `category_form` + `attribute_definition` + active values;
  - `readResolved(q, categoryId)` → path, `is_leaf`, defaults;
  - `missingRequired(q, productIds)` → `Map<productId, string[]>`, via `product_missing_required`, naming per-variant gaps as `"<attribute> (<label>)"` with `variantLabelSql` (the one label rule);
  - `categoryMembershipSql(productAlias, categoryParam)` (R14; reads `category_ancestor` and `product_placement`).

  Export from `EA/shared/src/catalog/index.ts`.
- [X] T026 Create `EA/shared/src/catalog/details.ts` `writeProductDetails(tx, {productId, form, details, variants})`, the only writer of `product_attribute_value`:
  - validate with `validateDetails` and map its errors to a `DetailsInvalid` carrying `fields[]`;
  - convert to base units with `toBase`;
  - delete rows for attributes outside the form, except rows of an attribute that a staff attachment hides on the product's **own** leaf (kept so un-hiding restores them). Re-categorising passes `recategorise(...).dropped` and those rows are deleted even if hidden (FR-024);
  - upsert product or per-variant rows, enforcing the exclusion rule.
- [X] T027 Container test `EA/shared/src/catalog/product-details.container.test.ts` for `writeProductDetails`: base-unit conversion (kg/g, L/mL), each value family, refused units and limits, kept values of a staff-hidden attribute on the own leaf, dropped values on re-categorise, the product-row / variant-rows exclusion rule.
- [X] T028 Update `EA/shared/src/catalog/variants.ts` `applyVariantSet`:
  - accept the new option inputs and validate attribute options against the passed form (`variant_option` and in the form);
  - write `product_option.kind`/`attribute_id` and `product_option_value.allowed_value_id`;
  - write the label copy `value` from the allowed value's label, or for `pack_size` generate the values from the variants' `pack_quantity`/`pack_unit` (formatted as `variantLabel` expects);
  - then write option-derived per-variant attribute rows through `writeProductDetails` (R7).

  Update `EA/shared/src/catalog/read.ts` (`OptionRow` has `kind`, `attributeId` and the name from the attribute or "Pack size") and `variants.container.test.ts`. Rewire **every** reader of the dropped `product_option.name` to that name: `EA/storefront/src/catalog/repository.ts` (the options JSON, ~line 187), `EA/catalog/src/review/service.ts` (~line 192) and `EA/shop/src/products/repository.ts` (~line 332). Check with `grep -rn "o\.name\|'name', o" EA/*/src` since SQL is not type-checked.
- [X] T029 Extend `EA/shared/src/catalog/catalog.guard.test.ts` so that it fails on:
  - (a) any `product_type` in SQL or TS under `EA/*/src`, `apps/*/src`, `CW` and `packages/*/src`;
  - (b) `ad.key = 'storage'` or `key = 'storage'`;
  - (c) any `INSERT|UPDATE|DELETE` on `product_attribute_value` outside `details.ts`;
  - (d) any write to `category_ancestor|category_resolved|category_form` outside the migration function;
  - (e) any write to `category_attribute|category|attribute_definition|attribute_allowed_value` outside `EA/shared/src/catalog/taxonomy.ts` (T043);
  - (f) any write to `product_placement` outside `EA/catalog/src/placements/repository.ts`;
  - (g) any storefront SQL (`EA/storefront/src/**`) that joins `attribute_definition` without `customer_visible` in the same statement (FR-032);
  - (h) any `functions/*.ts` under `EA/admin` named `catalog-*` or under `EA/catalog` named `gst-*` (fold into the existing `functions.guard` if it already scans handler names).

- [X] T030 Live `taxonomy` kind (R21): extend `LiveChange` in `EA/shared/src/live/announce.ts` so the `shop` and `ops` scopes accept kind `taxonomy`; create `EA/shared/src/live/taxonomy.ts` `announceTaxonomy(db = pooled)` that reads active shop ids and announces `{scope:"ops",kind:"taxonomy"}` plus one shop change per shop (never throws); export it; add a unit test beside the existing announce tests. Update `change-map.guard.test.ts` only if it requires a mapping for the catalog service's new routes.

### Remove the old model and rewire readers to the new schema

- [X] T031 [P] Delete `EA/admin/src/catalog/**` and the 18 `EA/admin/src/functions/catalog-*.ts` (plus `catalog-handlers.test.ts`). Remove their function blocks from `EA/admin/serverless.yml` and fix `EA/admin/README.md` and `docs/api/path-assignment.md` (the admin row no longer says "catalogue admin"; the catalog row gains "taxonomy, attributes, placements").
- [X] T032 [P] Delete `EA/catalog/src/gst/**`, `EA/catalog/src/functions/gst-bulk-v1-post.ts` and `gst-missing-v1-get.ts`, and their `EA/catalog/serverless.yml` entries. Delete `BO/features/product-review/GstMissing.tsx` and its test, and remove its route and nav entry.
- [X] T033 [P] Delete `EA/shop/src/functions/catalog-schema-v1-get.ts` and its `EA/shop/serverless.yml` entry, and remove `readCatalogSchema`, `assignmentsForType` and `productTypeIsActive` from `EA/shop/src/products/repository.ts` along with every caller. Callers were rebuilt directly with US3 (T059–T061), so no interim 501 stubs were needed.
- [X] T034 Rewire checkout to the storage column. In `EA/commerce/src/checkout/store.ts`, replace the `storage` attribute subquery with `p.storage` and delete `storageClassOrAmbient`.
- [X] T035 [P] Rewire fleet to the storage column. In `EA/fleet/src/planner/sql.ts` (two places), `EA/fleet/src/dispatch/sql.ts` and `EA/fleet/src/dispatch/windows.ts`, replace the `storage` attribute joins with `p.storage`, keeping the same semantics (frozen/chilled = cold). Update the affected fleet tests.
- [X] T036 Rewire storefront reads:
  - `EA/storefront/src/lib/category-tree.ts`: replace the recursive CTEs with `category_ancestor` reads and export `categoryMembershipSql` from edge-shared;
  - `catalog/repository.ts`: categories from `category_resolved` (with `icon`, `depth`, `is_leaf`, `image_key` → `publicImageUrl`, falling back to the derived picture);
  - product detail: the path from `category_resolved.path_names`, and remove the `product_type_attribute` join (per-variant details are rebuilt in US5);
  - `search/filters.ts`, `facets/repository.ts`, `suggest/repository.ts`, `home/repository.ts` and `lib/cards.ts`: use `categoryMembershipSql` and project `p.age_restricted`.
- [X] T037 [P] Rewire catalog review. In `EA/catalog/src/review/repository.ts` and `service.ts`, remove product-type reads and read attribute values through `readForm` + `product_attribute_value` (the full review additions come in US8). Update `review.container.test.ts`.
- [X] T038 [P] Rewire promotions. `EA/shared/src/promotions/candidates.ts` and `product-offer.ts` match category targets through `category_ancestor` (a target covers its subtree) and include placements via `categoryMembershipSql`. Update the promotion tests that seeded product types.
- [X] T039 Run `pnpm -r typecheck` and `make edge-test`. Fix every compile and test failure caused by T005–T038 in container fixtures (any test helper inserting `product_type`, `display_order` or `value_options`: `grep -rln "product_type\|value_options\|display_order" EA/*/src`), so the platform is green before story work.

**Checkpoint**: the schema, the derived taxonomy and the shared rules exist, the old model is gone,
and everything is green.

---

## Phase 3: User Story 1: Staff build the category tree (P1) 🎯 MVP

**Goal**: back-office managers create, rename, reorder, move, retire and restore categories within 5
levels, with icon, picture, synonyms and defaults.

**Independent test**: quickstart step 1. On the seeded tree, build a 5-level branch, refuse a 6th,
move a leaf, add a child to a leaf with products (products move with it), refuse retiring a used
category, and see the storefront and shop picker reflect each change.

- [X] T040 [P] [US1] Container test `EA/catalog/src/taxonomy/taxonomy-writer.container.test.ts` covering:
  - `category_too_deep` (create and move);
  - `category_cycle`;
  - `category_sibling_name_taken`;
  - `category_has_products` without and with `moveProductsToSelf`;
  - `category_in_use`;
  - `category_has_children` (retire with an active child);
  - retiring deletes placements;
  - `parent_retired` (create and restore under a retired parent);
  - restore under a parent that became home to products: refused without `moveProductsToSelf`, products moved with it;
  - move under a leaf with products refused;
  - the audit row written;
  - the derived tables rebuilt in the same transaction.
- [X] T041 [P] [US1] Authz test `EA/catalog/src/taxonomy/authz.test.ts`: a csa can read every taxonomy GET and gets 403 on every write; admin and manager can write. Model it on `EA/catalog/src/review/authz.test.ts`.
- [X] T042 [P] [US1] Create `EA/catalog/src/taxonomy/authz.ts` (read = active staff; write = admin|manager from `admin.staff`) and `handler-support.ts` (problem mapping for every refusal code in contracts/api.md, DTO mappers).
- [X] T043 [US1] Create `EA/shared/src/catalog/taxonomy.ts`, the taxonomy writer core. Every function takes `tx`, starts with `LOCK TABLE public.category IN SHARE ROW EXCLUSIVE MODE`, validates against `category_resolved`, writes, and calls `SELECT public.rebuild_category_derived()`. Functions: `createCategory`, `updateCategory`, `moveCategory(id, parentId, position)` (renumbers siblings), `setCategoryStatus`.
- [X] T044 [US1] Create `EA/catalog/src/taxonomy/repository.ts` (tree read with product and placement counts from `category_ancestor`; audit insert into `admin.audit_log`) and `service.ts`. Each service wraps a T043 call in `withTransaction`, writes audit, and after commit calls `announceTaxonomy()` (T030: ops and every active shop).
- [X] T045 [US1] Create the catalog functions and add them to `EA/catalog/serverless.yml` (staff authorizer):
  - `EA/catalog/src/functions/taxonomy-categories-list-v1-get.ts`
  - `taxonomy-categories-create-v1-post.ts`
  - `taxonomy-categories-update-v1-patch.ts`
  - `taxonomy-categories-move-v1-post.ts`
  - `taxonomy-categories-status-v1-post.ts`
  - `taxonomy-categories-image-v1-post.ts` (presign under `categories/`, as the promotion picture presign does in `EA/admin/src/promotions`)

  Update the gateway capacity expectations if the test pins counts.
- [X] T046 [P] [US1] Back-office data layer: `BO/features/taxonomy/repo.ts`, `queries.ts` (keys: `["taxonomy","tree"]`, `["taxonomy","form",id]`, `["taxonomy","attributes"]`) and `model.ts` (pure tree helpers: build tree, depth, can-drop-here, descendants), with `model.test.ts`. Map live kind `taxonomy` to these keys in `BO/features/live/routes.ts`.
- [X] T047 [US1] Build `BO/features/taxonomy/CategoryTree.tsx`, an indented, expandable list (no cards). Each row shows name, icon, product count and status. It supports native HTML5 drag to reorder or re-parent (refused targets shown as not droppable), with "Move to…" (a dialog with a category search) and up/down buttons as keyboard and touch equivalents, all calling the move route. Add "Add sub-category" per row and "Add department" at the top.
- [X] T048 [US1] Build `BO/features/taxonomy/CategoryPanel.tsx`, the selected category's tabs:
  - General: name, icon picker from `CATEGORY_ICONS`, picture upload via the presign route, synonyms chips editor;
  - Defaults: storage, GST and 18+, each "Inherit (shows the resolved value)" or an explicit value;
  - Products: count and a link to the review/missing lists;
  - Retire/Restore, with the refusal shown inline.

  The "add child to a leaf with products" dialog explains that the products will move into the new sub-category.
- [X] T049 [US1] Create `BO/features/taxonomy/TaxonomyScreen.tsx` (tree left, panel right; stacked below 1024px) and route `BO/routes/taxonomy.tsx` (Categories / Attributes tabs). Delete `BO/routes/catalog-schema.tsx` and `BO/features/catalog-schema/**`, and update `BO/router.tsx`, the nav, and `BO/features/staff-identity/AdminAccessScreen.tsx` references.
- [X] T050 [P] [US1] Repoint `BO/features/promotions/components/TargetPicker.tsx` from `@/features/catalog-schema/queries` to the taxonomy tree query, showing full paths in the category search.

**Checkpoint**: US1 works end to end in back-office.

---

## Phase 4: User Story 2: Attribute library and attachments (P1)

**Goal**: staff define attributes once, attach them to categories with levels, tighten or hide down
the tree, and preview any leaf's form with sources.

**Independent test**: quickstart step 2.

- [X] T051 [P] [US2] Extend `taxonomy-writer.container.test.ts` (or add `attributes.container.test.ts` in `EA/catalog/src/taxonomy/`) covering:
  - `attribute_name_taken`;
  - `attribute_is_stock_date`;
  - `invalid_attribute` (switches not allowed for the type, choice types with no values, a unit outside the family);
  - `attribute_in_use` (type or unit family change, retire);
  - `value_in_use`;
  - a value rename rewrites `product_option_value.value`;
  - `attachment_loosens`;
  - `nothing_to_hide`;
  - `attribute_retired`;
  - attaching a new Required attribute leaves products on sale and they appear in `product_missing_required`;
  - an `admin.audit_log` row for every attribute, value and attachment write (FR-006).
- [X] T052 [US2] Add to `EA/shared/src/catalog/taxonomy.ts`:
  - `createAttribute` and `updateAttribute`: validate with the rules in data-model.md, generate the key slug at creation, take the values list as the full ordered set (insert, update label or status, delete only unused), and rewrite label copies on rename;
  - `setAttributeStatus`;
  - `putAttachment(categoryId, attributeId, {level, hidden, section, position})`: check against the parent's resolved row for loosening and nothing-to-hide;
  - `deleteAttachment`.

  Each ends with the rebuild.
- [X] T053 [US2] Create the catalog functions, adding them to `serverless.yml` and wiring them through `service.ts`/`repository.ts` (`usage` counts for attributes and values):
  - `EA/catalog/src/functions/taxonomy-attributes-list-v1-get.ts`
  - `taxonomy-attributes-get-v1-get.ts`
  - `taxonomy-attributes-create-v1-post.ts`
  - `taxonomy-attributes-update-v1-patch.ts`
  - `taxonomy-attributes-status-v1-post.ts`
  - `taxonomy-category-form-v1-get.ts` (`readForm` with sources)
  - `taxonomy-category-attribute-put-v1-put.ts`
  - `taxonomy-category-attribute-delete-v1-delete.ts`
- [X] T054 [US2] Build `BO/features/taxonomy/AttributeLibrary.tsx` (a table with name, input type, unit family, switches, usage, status, search) and `AttributeDialog.tsx`. The dialog adapts its fields to the input type: unit family and unit list for numbers, an ordered values editor with retire for choice types, limits, and the four switches with the disallowed ones disabled. Refusals map to field errors.
- [X] T055 [US2] Build `BO/features/taxonomy/AttachmentEditor.tsx` in the CategoryPanel "Attributes" tab. It lists inherited rows (with "from <category>", level and a Tighten or Hide action) and the category's own rows (level, section, position, remove), plus "Attach attribute" with a library search. Loosening options are not offered.
- [X] T056 [US2] Build `BO/features/taxonomy/FormPreview.tsx`, which renders `CategoryFormDTO` in the same sections and order as the shop sees it (reusing the shop-web field look through plain console classes), with a source badge per row. Show it from the panel ("Preview shop form") for leaves.

**Checkpoint**: staff can author forms. US1 and US2 together form the back-office MVP.

---

## Phase 5: User Story 3: Shop lists a product by name and category (P1)

**Goal**: no type step. The picker suggests, searches, browses and recalls. Details are rendered from
the leaf's form. Re-categorising warns.

**Independent test**: quickstart step 3, listing a food, an electrical product and a pet product.

- [X] T057 [P] [US3] Create `ST/category-suggest.ts` with `suggestCategories(name, leaves, limit=5)` (R11: tokenise, lowercase, strip simple plurals, score leaf name > synonym > ancestor name, tie-break by depth then name), `packages/shared-types/category-suggest.fixtures.json` (≥ 60 product names across all 25 departments with their expected top leaf, using seeded names; SC-007's full 100-product check is a manual walk, quickstart step 9) and `ST/category-suggest.test.ts`.
- [X] T058 [P] [US3] Container test `EA/shop/src/products/taxonomy.container.test.ts` covering:
  - create refuses `category_not_leaf`;
  - absent facts take the leaf defaults;
  - `fact_required` when no default resolves;
  - `missing_required_details` on submit with `fields[]`;
  - details are validated against the form;
  - an approved product's category change becomes a proposal;
  - `recentLeafIds`.
- [X] T059 [US3] Create `EA/shop/src/functions/catalog-categories-v1-get.ts` (`ShopTaxonomyDTO`: active categories from `category_resolved` + `category`, plus `recentLeafIds` = the shop's 5 most recently created or edited products' distinct leaves) and `catalog-category-form-v1-get.ts` (`readForm` without sources; `category_not_leaf` for parents). Register both in `EA/shop/serverless.yml` under the shop authorizer.
- [X] T060 [US3] Rewrite create and update in `EA/shop/src/products/service.ts`, `repository.ts`, `types.ts` and `handler-support.ts`:
  - parse `primaryCategoryId`, facts and `details` (contracts/api.md);
  - check the leaf is active;
  - fill facts from `readResolved`;
  - write the product, then `applyVariantSet`, then `writeProductDetails` in one transaction;
  - write `product_gst_change` when GST changes (existing writer);
  - for drafts, a category change applies `recategorise` (dropping details outside the new form, keeping touched facts; the client sends `factsTouched`);
  - `getProductDetail` returns `categoryPath`, facts, `factDefaults`, `details` and `missingRequired`;
  - the list supports `?missing=true` and `missingRequired` counts via `missingRequired()`;
  - submit refuses `missing_required_details`.

  Remove the 501 stubs from T033.
- [X] T061 [US3] Rewrite `EA/shop/src/products/change.ts` around the R18 proposal keys:
  - `diffProposal` and `overlay` cover `primaryCategoryId`, `storage`, `gstStatus`, `ageRestricted`, `details`, `options` and `variants`;
  - replace `mergeAttributes` with `mergeDetails`.

  Update `EA/catalog/src/review/service.ts` so that approving a proposal applies it through `applyVariantSet` + `writeProductDetails` and updates the facts columns. Update `variant-change.container.test.ts` and `review.container.test.ts`.
- [X] T062 [P] [US3] Update the shop-web data layer: `SW/features/catalog/model.ts` (remove `ProductType`; add facts, details and taxonomy types), `repo.ts` and `queries.ts` (taxonomy query with a long `staleTime`; form query per leaf), `draft.ts` (draft holds `primaryCategoryId`, facts, `factsTouched` and details) and `validation.ts` (use `validateDetails`). Map live kind `taxonomy` to the taxonomy and form query keys in `SW/features/live/routes.ts` (R21). Update their tests.
- [X] T063 [US3] Build `SW/features/catalog/create/CategoryPicker.tsx`:
  - a suggestions list from `suggestCategories(draft.name, leaves)` with full paths;
  - a search field over leaves (name and synonyms, showing paths);
  - a column browser (department → … → leaf; non-leaves open the next column);
  - "Recently used" from `recentLeafIds`.

  Only leaves are selectable, and a breadcrumb of the choice stays visible. Emit the PostHog events `category_suggestion_chosen{rank}`, `category_searched` and `category_browsed` through the existing telemetry module. Add `CategoryPicker.test.tsx`.
- [X] T064 [US3] Create `SW/features/catalog/create/NameCategoryStep.tsx` (name, brand, short description and CategoryPicker) and `SW/features/catalog/DetailField.tsx`, which renders one `CategoryFormRow` by input type (text, long text, number with a unit select, yes/no, single choice, multi choice, date, time), marks "Required", and shows a "Helps shoppers find this" nudge for Recommended. Replace `SW/features/catalog/AttributeField.tsx` (delete it and its test) and add `DetailField.test.tsx`.
- [X] T065 [US3] Create `SW/features/catalog/create/DetailsStep.tsx` (sections in form order using `DetailField`, errors from `validateDetails`) and `SW/features/catalog/FactsSection.tsx` (Storage with "Room temperature", GST, 18+, each marked "from category" until changed, which sets `factsTouched`). Put FactsSection on the Details step.
- [X] T066 [US3] Update `SW/features/catalog/create/steps.ts` and `ProductCreateFlow.tsx` to the steps Name & category → Sizes & prices → Image → Details → Review, with `canAdvance` using the form and `validateDetails`. Delete `create/TypeStep.tsx` and `create/AttributesStep.tsx`, and update `ReviewStep.tsx` and `ShopperPreview.tsx` to show path, facts and details.
- [X] T067 [US3] Show the recategorise warning: when the picker changes the category of a draft with details, open a confirm dialog listing `recategorise(...).dropped` names before applying. Implement this in `SW/features/catalog/create/NameCategoryStep.tsx` and in the edit flow in `SW/features/catalog/ProductEditDialogs.tsx`.
- [X] T068 [US3] Update `SW/features/catalog/ProductDetailScreen.tsx`, `ProductEditDialogs.tsx`, `focusedEdit.ts`/`useFocusedEdit.ts` and `CatalogListScreen.tsx`:
  - details are edited per section;
  - facts are editable;
  - the category can be changed (approved products: a proposal);
  - a "Missing details" banner lists `missingRequired`;
  - the list gains a "Missing details" filter (`?missing=true`) and a count badge.

  Update their tests.

**Checkpoint**: a shop lists products in any department with no type. With US1 and US2, the P1
catalogue is usable.

---

## Phase 6: User Story 4: Operational facts are always set (P1)

**Goal**: storage, GST and 18+ are never unknown. Category defaults apply. 18+ is labelled on every
customer surface. Cold chain reads the product.

**Independent test**: quickstart steps 3 (pre-set facts), 5 (18+ labels) and 7 (frozen order).

- [X] T069 [P] [US4] Container test in `EA/commerce/src/checkout/storage.container.test.ts`: a frozen product's order line gets `storage_class = 'frozen'`, and a chilled product's `chilled`. Add a fleet planner test (in the existing `EA/fleet/src/planner/*.test.ts`) showing that cold work counts follow `p.storage`.
- [X] T070 [US4] Project `ageRestricted` in:
  - the storefront card and detail SQL (`EA/storefront/src/lib/cards.ts`, `catalog/repository.ts`);
  - commerce cart lines and checkout lines (`EA/commerce/src/cart/repository.ts`, `checkout/*`);
  - customer order lines (`EA/commerce/src/orders/*`).
- [X] T071 [P] [US4] customer-web: create `CW/components/storefront/AgeBadge.tsx` (neutral badge, text from `AGE_RESTRICTED_LABEL`) and render it in:
  - `CW/app/(shop)/_components/ProductCard.tsx`;
  - `CW/app/(shop)/product/[id]/page.tsx`;
  - the cart page lines (`CW/app/(shop)/cart/page.tsx` and its line component);
  - the checkout summary (`CW/app/checkout/_components/*`) with `AGE_RESTRICTED_CART_SENTENCE` when any line is age-restricted;
  - account order lines.
- [X] T072 [P] [US4] Customer app: create the Kotlin twin `CM/core/presentation/AgeWords.kt`, pinned to `age-words.fixtures.json` by a host test (follow the existing fixture-pinned twins, e.g. the effy-windows twin test). Create `CM/core/presentation/AgeBadge.kt` in the storefront kit and render it on `ProductTile.kt`, the product detail screen, cart lines, checkout and order lines. Map `ageRestricted` in the catalog, cart and order mappers.
- [X] T073 [P] [US4] Shop-web and back-office display. The shop order and pick screens are unchanged: storage already flows via `order_item.storage_class`. Add the "Room temperature / Chilled / Frozen" word through `STORAGE_WORDS` wherever a product's storage is shown in `SW/features/catalog/*` and in back-office review.

**Checkpoint**: every P1 story is done. This is the full MVP.

---

## Phase 7: User Story 5: Shoppers filter each aisle by what matters there (P2)

**Goal**: category-relevant filters, AND across attributes, range facets, per-variant product details
on web and app.

**Independent test**: quickstart step 5.

- [X] T074 [P] [US5] Container test (written as a case in `EA/storefront/src/storefront.container.test.ts`, which shares its fixtures) covering:
  - an aisle shows only attributes in its leaves' forms that have values;
  - a hidden attribute's kept values are ignored;
  - AND across attributes and OR within one;
  - a range across g/kg values;
  - a per-variant value matches only through an active variant;
  - placements counted once;
  - at most 8 attribute facets on a search with no category;
  - `customer_visible = false` never appears.
- [X] T075 [US5] Rewrite `EA/storefront/src/facets/repository.ts` and `service.ts` per R9 and the plan's "Facets SQL":
  - an `inview` CTE;
  - one grouped count for unselected choice and boolean attributes;
  - one per selected attribute with its own selection cleared;
  - `min/max(value_base)` for filterable numbers, rendered in the attribute's first unit via `fromBase`;
  - ordering by the category's `category_form` position, else by coverage.

  Choice option `value` = allowed-value id; boolean labels are Yes/No. Delete `facetableAttributeDefs`.
- [X] T076 [US5] Update `EA/storefront/src/search/filters.ts`, `service.ts` and `functions/products-v1-get.ts`:
  - parse `attr.<key>` (value ids) and `range.<key>=<min>..<max>` (convert to base with `toBase`);
  - AND across attribute keys and OR within one;
  - match product rows or active-variant rows, joined to `category_form` so hidden attributes do not match;
  - the card's `variantId` = the first active variant (by position) matching the attribute filters when any are set (FR-031).

  Update the handler comment and `filters.test.ts`.
- [X] T077 [US5] Product detail in `EA/storefront/src/catalog/repository.ts` and `service.ts`:
  - build each variant's `details: ProductAttributeGroupDTO[]` from `category_form` order (sections → groups), merging product rows with that variant's rows;
  - only `customer_visible`;
  - values rendered with `formatAttributeValue` (units, Yes/No, value labels, dates).

  Remove the product-level `attributes`. Add a container case (in `EA/storefront/src/storefront.container.test.ts`) that an internal-only attribute's value never appears in the product detail DTO, and that the option names come from the attribute or "Pack size".
- [X] T078 [P] [US5] customer-web filters: update `CW/app/(shop)/_components/filters/FilterControls.tsx` to render `range` facets via a new `RangeFilter.tsx` (two number fields plus unit text, applied on blur or Enter), and update `CW/lib/search-query.ts` (+ test) to read and write `range.<key>` and value-id `attr.<key>`. Product links from a filtered list carry `?variant=<card.variantId>` (`CW/app/(shop)/_components/ProductCard.tsx`) (FR-031).
- [X] T079 [P] [US5] customer-web product page: `CW/app/(shop)/product/[id]/page.tsx` and its variant selector render the selected variant's `details` groups as detail rows (no cards), switching with the selection, and open on the `?variant=` the link carried.
- [X] T080 [P] [US5] Category icons on web: replace `CW/components/chrome/aisle-icon.tsx` with `category-icon.tsx` (`categoryIcon(key)` from `CATEGORY_ICONS` to Lucide components), and update `AisleMenu.tsx`/`AisleRow.tsx` (levels 1–3 in the mega menu). Aisle pages list child categories as links so levels 4–5 are reachable.
- [X] T081 [P] [US5] Customer app filters and details:
  - `CM/features/catalog/domain/Catalog.kt` and `data/CatalogMappers.kt`: range facet, variant `details`, category `icon`/`depth`/`isLeaf`;
  - `presentation/FilterSheet.kt`: range rows as two numeric fields in the sheet;
  - `SearchViewModel.kt`: `range.` and value-id `attr.` params;
  - `ProductDetailViewModel.kt` and `ProductDetailScreen.kt`: the selected variant's details, opening on the variant a filtered tile passed (`card.variantId`, FR-031);
  - replace the word rules in `presentation/CategoryIcons.kt` with an icon-key map pinned to `category-icons.fixtures.json` by a host test (add any missing Lucide drawables to the resources).

  Add or update the KMP host tests.

- [X] T082 [US5] Customer app category browsing (FR-033): a pushed category list screen in `CM/features/catalog/presentation/CategoryBrowseScreen.kt` + `CategoryBrowseViewModel.kt` (from `/storefront/v1/categories`: a level's children with icons and counts; a leaf or "All in <category>" opens Search with that `categoryKey`), reachable from Home's aisle entry and from Search's aisle facet; levels 1–5. Add a host test for the view model's level navigation.

**Checkpoint**: filters and details are relevant per aisle on both clients.

---

## Phase 8: User Story 6: Details that differ per variant (P2)

**Goal**: "Same for all / Differs by variant" for `varies_by_variant` attributes. Per-variant required
checks. The product page switches values (built in US5).

**Independent test**: quickstart step 6 (allergens per flavour).

- [X] T083 [P] [US6] Extend `EA/shared/src/catalog/product-details.container.test.ts` (from T027) covering:
  - per-variant rows written and read;
  - switching Same → Differs (product row replaced by variant rows) and back;
  - a required per-variant attribute missing for one active variant is refused by name;
  - a single-variant product is never asked;
  - reducing variants to one collapses values to the remaining variant and reports what was dropped (R6 exclusion).
- [X] T084 [US6] Shop service: accept `DetailInput.perVariant` in `EA/shop/src/products/service.ts` (only for `varies_by_variant` attributes; variant ids must belong to the product's active variants in the same request or stored). When a variant set shrinks to one, `applyVariantSet` → `writeProductDetails` collapses per-variant rows to product rows and returns `droppedDetails` for the response.
- [X] T085 [US6] Create `SW/features/catalog/VariantDetails.tsx`: for each `varies_by_variant` row on a product with more than one variant, a "Same for all / Differs by variant" segmented control and, when it differs, one `DetailField` per active variant labelled with the variant label. Integrate it into `DetailsStep.tsx` and the detail screen's section editor. When a save returns `droppedDetails`, show them in a toast-free inline notice ("These details were removed: …"). Add `VariantDetails.test.tsx`.
- [X] T086 [US6] Show per-variant details in back-office review: `BO/features/product-review/ReviewVariants.tsx` lists per-variant detail values beside each variant.

---

## Phase 9: User Story 7: Variant options come from the library (P2)

**Goal**: options are picked from the leaf's `variant_option` attributes or Pack size, values from the
library, never typed.

**Independent test**: quickstart step 6 (Flavour from the library; Pack size labels from packs; two
shops' Colour options identical and filterable).

- [X] T087 [P] [US7] Extend `EA/shared/src/catalog/variants.container.test.ts` covering:
  - an attribute option not in the leaf's form, or not `variant_option`, is refused;
  - `pack_size` values generated from packs, with duplicates refused;
  - the label copy equals the allowed value label and is rewritten on rename;
  - option values written as per-variant attribute values (filterable);
  - the option's attribute is not also accepted as a product-level detail.
- [X] T088 [US7] Shop service: pass the leaf form into `applyVariantSet`, and make `validateDetails` refuse details for attributes that are options on the product (`EA/shop/src/products/service.ts`, `ST/product-form.ts` + test).
- [X] T089 [US7] Shop-web options editor: rewrite `SW/features/catalog/VariantEditor.tsx`, `VariantsSection.tsx` and `variants.ts` (+ test). "Add option" offers the leaf form's `variantOption` rows plus "Pack size". Values are a multi-pick from the attribute's active values, with the hint "Missing a value? Ask Effy to add it". Pack size has no value picker: each variant row's pack quantity and unit become its value and the label previews it. Free-text option names and values are removed.
- [X] T090 [US7] Hide the option attribute in Details: when an attribute is a product option, `DetailsStep.tsx` does not render it and shows "Set per variant by the <name> option".

---

## Phase 10: User Story 8: Extra placements and review polish (P3)

**Goal**: staff place products in up to 5 extra leaves. Review surfaces the path, fact overrides and
empty recommended details. A missing-details list is available.

**Independent test**: quickstart steps 4 and 8.

- [X] T091 [P] [US8] Container test `EA/catalog/src/placements/placements.container.test.ts` covering:
  - `category_not_leaf`;
  - `placement_is_home`;
  - `too_many_placements`;
  - replace semantics;
  - audit row;
  - storefront membership includes the placement and counts once;
  - retiring a category deletes its placements.
- [X] T092 [US8] Create `EA/catalog/src/placements/{repository,service}.ts` (the only writer of `product_placement`) and `EA/catalog/src/functions/product-placements-v1-put.ts`, and register it in `EA/catalog/serverless.yml`.
- [X] T093 [US8] Create `EA/catalog/src/functions/products-missing-details-v1-get.ts`, a keyset page over products where `product_missing_required` is non-empty, with shop name and path. Register it.
- [X] T094 [US8] Review item additions in `EA/catalog/src/review/repository.ts`/`service.ts`: `categoryPath`, `facts`, `factOverrides` (vs `category_resolved`), `details`, `missingRecommended` and `placements`. Approve refuses `missing_required_details`. Update `ST/product-review.ts` and `review.container.test.ts`.
- [X] T095 [US8] Back-office review UI: `BO/features/product-review/ReviewItemScreen.tsx` and `model.ts` show an "Attention" block at the top (fact overrides, empty recommended details), the category path, and detail sections. A new `Placements.tsx` adds and removes extra leaves via a taxonomy search (leaves only, home excluded, max 5).
- [X] T096 [US8] Back-office `BO/features/product-review/MissingDetailsScreen.tsx` (a table with product, shop, path and missing details), plus its route and nav entry beside the review queue.

---

## Phase 11: Polish and cross-cutting

- [X] T097 [P] Seed `db/seeds/101_catalogue_products_dev.sql`: ~60 approved active products in the oldest active shop (stop if none; refuse if `SEED101-` codes exist), spread over every department. Include:
  - full required details;
  - some recommended details left empty;
  - per-variant allergens (Flavour option from the library);
  - Pack size options;
  - a Colour option;
  - two frozen, several chilled and two 18+ products;
  - two extra placements;
  - listing summaries set as `refreshListing` does.
- [X] T098 [P] Observability: EMF metrics `TaxonomyChanged{kind}` and `TaxonomyRebuildMs` in `EA/catalog/src/taxonomy/service.ts`, and `ProductSubmitRefused{reason}` in `EA/shop/src/products/service.ts`, via the shared metrics helper. Add a PostHog `filter_applied{type}` event in the customer-web and app filter code through the typed taxonomy files. Declare the alarm `ProductSubmitRefused{reason=missing_required_details}` > 20 in 15 min, delivered to the alerts topic, in Terraform beside the existing edge alarms in `infra/envs/dev/` (R22).
- [X] T099 [P] Docs:
  - `docs/api/path-assignment.md` (routes moved and added);
  - `EA/catalog/README.md` (taxonomy, placements);
  - delete `EA/admin/src/catalog/README.md` (gone with T031);
  - add a "Catalogue (101)" paragraph to `CLAUDE.md` with the invariants: one home leaf; `rebuild_category_derived` is the one definition; facts are columns; `writeProductDetails` and `applyVariantSet` are the writers; no product types;
  - add a `FEATURE-HISTORY.md` entry with the deploy order from plan.md.
- [X] T100 Run every gate and fix the failures:
  - `pnpm -r typecheck lint test`;
  - `make edge-test` (Docker; `DOCKER_CONFIG=<empty dir>`);
  - `make shop-test bo-test cw-test cw-gates`;
  - `make cm-contract-check cm-guard` plus the KMP host tests (`./gradlew :shared:allTests` in `apps/customer-mobile`);
  - `scripts/check-no-refresh-timers.sh`;
  - the design-system token-usage guard;
  - the gateway capacity test.

  Record the results in FEATURE-HISTORY.
- [X] T101 Hand the operator the exact steps from quickstart.md "Prerequisites" and plan.md "Deploy order". Do not run any of them.

---

## Dependencies and execution order

- **Setup (T001–T004)** → **Foundational (T005–T039)** blocks everything.
  - Inside it: T015 (icon keys) first; then the migration (T005–T013, where T006 uses T015's keys), then
    the taxonomy data (T014), then the container tests (T016–T017).
  - Shared types (T018–T024) can run in parallel with the migration.
  - Edge-shared (T025–T030: form, details + its test, variants, guards, live `taxonomy`) needs the types.
  - Removal and rewire (T031–T038) need T022–T030.
  - T039 closes the phase.
- **US1 (T040–T050)** → **US2 (T051–T056)**: US2 builds on the taxonomy writer and the panel.
- **US3 (T057–T068)** needs Foundational. It is testable with the seeded forms without US1/US2's UI,
  so it can proceed in parallel with US1/US2.
- **US4 (T069–T073)** needs US3's create path for walking, though the code tasks are independent.
- **US5 (T074–T082)** needs Foundational, plus products (the seed T097 or US3).
- **US6 (T083–T086)** needs US3. **US7 (T087–T090)** needs US3 and US6 (option values become
  per-variant details).
- **US8 (T091–T096)** needs Foundational and US1 (the taxonomy search in back-office).
- **Polish** comes last.

## Parallel examples

- **Foundational**: T015, T018, T019, T020 and T021 together. Then T031, T032, T033, T035, T037 and
  T038 together.
- **US1**: T040, T041, T042 and T046 together, then T043 → T044 → T045, then T047 and T048 in
  parallel with T050.
- **US3**: T057, T058 and T062 together. Then T059 and T060 (backend) in parallel with T063–T065
  (shop-web).
- **US5**: T074 alone. Then T075–T077 (backend) in parallel with T078, T079, T080, T081 and T082 (clients).

## Implementation strategy

1. **MVP**: Setup → Foundational → US1 → US2 → US3 → US4. This delivers the whole P1 scope: staff
   author the taxonomy and forms, shops list without types, and facts are always set.
2. **Then P2**: US5 (filters and details), US6 (per-variant details), US7 (library options). These are
   required by the operator in this feature, not deferred.
3. **Then P3**: US8 (placements and review polish).
4. **Then Polish**: seed, docs, gates, operator handoff.

The migration drops columns every catalogue reader uses, so **nothing is deployed until every phase
is complete**. Deploy order is in plan.md.

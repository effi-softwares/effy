# Implementation Plan: Category-Driven Catalogue

**Branch**: `dev` (feature directory `101-category-driven-catalogue`) | **Date**: 2026-10-26 | **Spec**: [spec.md](spec.md)

## Summary

The **home leaf category decides the form**. Product types are deleted.

- **Taxonomy.** One tree of at most 5 levels. Each category has an icon, an optional picture, synonyms
  and defaults for storage, GST and 18+. Staff attach library attributes as Required, Recommended or
  Optional, inherited downward. A child may tighten or hide, never loosen. One SQL function,
  `rebuild_category_derived()`, materialises the closure, the resolved defaults and paths, and the
  resolved form of every category. It is the single definition every reader uses (R3, R4).
- **Facts.** `product.storage`, `product.age_restricted` and `product.gst_status` are NOT NULL columns,
  defaulted from the leaf. Checkout and fleet stop reading a `'storage'` attribute (R5).
- **Details.** One value table, optionally per variant, with typed columns and numbers normalised to
  base units. One writer, `writeProductDetails` (R6). Variant options are library attributes or "Pack
  size". 098's `applyVariantSet` stays the one writer and keeps the label copy that every downstream
  reader uses (R7).
- **Shop.** The type step is gone. The picker is client-side over the whole taxonomy (suggest, search,
  browse, recent), using a shared pure `suggestCategories`. The Details step is rendered from the
  leaf's form, with "Same for all / Differs by variant" (R11, R18).
- **Back-office.** A new Taxonomy area (tree, library, attachments, preview), served by the `catalog`
  service. The 18 `/admin/v1/catalog/*` routes are deleted. Review shows the path, fact overrides and
  empty recommended details. Staff can set extra placements (R12, R14).
- **Storefront.** Filters come from the leaves in view, counted with one grouped query, AND across
  attributes, with a new `range` facet. Product-page details are per variant, merged on the server.
  18+ labels everywhere. Web and app at parity (R9, R10).
- **Data.** Clean rebuild. Operator purge, then a schema migration that refuses a non-empty catalogue,
  a general-retailer taxonomy migration (25 departments), and a new dev product seed (R16, R17).

Decisions: [research.md](research.md) R1–R22. Data: [data-model.md](data-model.md). Contracts:
[contracts/api.md](contracts/api.md). Walk: [quickstart.md](quickstart.md).

## Technical Context

**Language/Version**:
- TypeScript: edge-api `catalog`, `shop`, `storefront`, `commerce`, `fleet`, `admin` (deletions) and
  `shared`; `@effy/shared-types`; shop-web and back-office (React 19); customer-web (Next.js 16).
- Kotlin 2.4 / CMP: the customer app.
- The driver app needs no change: it already shows `storage_class` from order lines.

**Primary Dependencies**: none new. No drag-and-drop library is in the repo, so the back-office tree
uses native HTML5 drag events, with **"Move to…"** and up/down buttons as the keyboard and touch
equivalent. All three call the same move route.

**Storage**: PostgreSQL 16. Two goose migrations:
- `<ts>_category_catalogue.sql` (schema; guarded on an empty `product`);
- `<ts>_catalogue_taxonomy.sql` (reference data).

Plus `db/reset/101_purge_catalogue_dev.sql` and `db/seeds/101_catalogue_products_dev.sql`. The 084 and
098 seeds are deleted.

**Testing**:
- vitest unit and container tests: the derived rebuild, the taxonomy writer refusals, the product
  details writer, the facets SQL, the seed invariants, submit and approve with missing details, and
  checkout and fleet reading `p.storage`;
- shared-types fixtures: suggest, icons, age words, units, product-form;
- shop-web: picker, form renderer, recategorise warning;
- back-office: tree model, attachment editor, preview;
- customer-web: range filter, per-variant details;
- KMP host tests: range facet, `CategoryIcons` twin, age label twin, `ProductDetailViewModel` details
  switching;
- guard tests (below).

**Target Platform**: Lambda behind the shared and staff gateways; browsers; Android and iOS (customer
app).

**Project Type**: monorepo, with web, mobile and serverless parts.

**Performance Goals**:
- Facets: 3–5 queries per call regardless of library size (R9).
- Aisle and search latency unchanged. Membership goes through `category_ancestor` (indexed) instead of
  a recursive CTE.
- The taxonomy rebuild completes in under 200 ms on the seeded tree.
- The shop taxonomy payload is under 150 KB and loaded once per session.

**Constraints**:
- Hidden fulfilment: no shop in any customer DTO. Placements and missing-details lists are staff-only.
- Internal-only attributes never reach a customer DTO (guard).
- No refresh timers.
- Mobile: sheets only, no drop-downs. The range filter is a sheet with two fields. Category
  browsing is a pushed list.
- No card layouts: the tree is an indented list, the library and preview are tables and sections.
- Controls are never pills.
- Money logic is untouched.

**Scale/Scope**:
- Staff gateway: −18 (admin) −2 (GST) +16 (catalog), net −4.
- Shared gateway: shop −1 +2 = +1. Storefront and commerce: +0.
- About 60 backend files, 4 web apps and 1 mobile app.
- About 25 departments and 600–900 categories seeded.

**Service placement**:
- *Service: `catalog`, on the `staff` gateway, because back-office staff manage the catalogue's
  taxonomy, attributes and placements.*
- *Service: `shop`, on the `shared` gateway, because shop staff read the taxonomy and forms to list
  products.*
- Storefront changes stay in `storefront` (shared, public).

## Constitution Check

| Principle | Verdict | Notes |
|---|---|---|
| I. Spec-driven | ✅ | Spec 101 with the operator's clarifications (2026-10-26). |
| II. Shared contracts | ✅ | DTOs and pure rules (`suggestCategories`, `validateDetails`, `recategorise`, units, icons, age words) are in `@effy/shared-types`, with fixtures and Kotlin twins where the app renders them. Writers are in `@effy/edge-shared/catalog`. |
| III. One backend | ✅ | Only existing services. No new compute. Each route carries a service line. The staff gateway shrinks by 4 routes and `admin` loses 18 functions. |
| IV. Auth isolation | ✅ | Taxonomy writes need admin/manager per `admin.staff`; csa reads. Shop routes are behind the shop authorizer and never reveal another shop's products. Storefront routes stay public and read only. |
| V. Design | ✅ | Tables, sections and indented lists, no cards. Icons from the closed Lucide set. 18+ is a neutral badge (not red). Mobile uses the storefront kit sheets. No new tokens. |
| VI. Layering | ✅ | handler → service → repository. One SQL function for derived taxonomy, one writer each for details, variants (098) and the taxonomy. Pure functions shared with the clients. |
| VII. Observability | ✅ | EMF: `TaxonomyChanged{kind}`, `TaxonomyRebuildMs`, `ProductSubmitRefused{reason}`. PostHog: `category_suggestion_chosen{rank}` / `category_searched` / `category_browsed` (measures SC-002), `filter_applied{type}`, no PII. **Alarm (R22)**: `ProductSubmitRefused{reason=missing_required_details}` above 20 in 15 min goes to the alerts topic (Terraform, `infra/envs/dev`). `TaxonomyRebuildMs` is a metric only. |
| Real-world identifiers | ✅ | None. |
| Hidden fulfilment | ✅ | As above. |

Post-design re-check: ✅. No violations; no complexity table.

## Project Structure

### Documentation

```text
specs/101-category-driven-catalogue/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md
├── contracts/api.md
├── checklists/requirements.md
└── tasks.md            (/speckit-tasks)
```

### Source code

```text
db/migrations/<ts>_category_catalogue.sql                     NEW  schema, guard, rebuild_category_derived(), product_missing_required()
db/migrations/<ts>_catalogue_taxonomy.sql                     NEW  25-department tree, ~60 attributes, attachments, defaults, icons, synonyms
db/reset/101_purge_catalogue_dev.sql                          NEW  operator, dev only
db/seeds/101_catalogue_products_dev.sql                       NEW  ; db/seeds/{084,098}_*.sql DELETED

infra/envs/dev/media.tf                                       + "categories" public prefix
infra/envs/dev/<alarms file>.tf                               + ProductSubmitRefused alarm (R22)
apis/edge-api/shared/src/live/{announce.ts, taxonomy.ts}      `taxonomy` kind for shop+ops; announceTaxonomy() (R21)
apps/shop-web/src/features/live/routes.ts ; apps/back-office/src/features/live/routes.ts   map `taxonomy`

packages/shared-types/src/{taxonomy, units, category-suggest, product-form, category-icons, age-words}.ts (+ fixtures)  NEW
packages/shared-types/src/{catalog, storefront, variants, cart, order, product-review, live, index}.ts   changed; ProductType* removed
packages/shared-types/contract/*                              regenerated

apis/edge-api/shared/src/catalog/{taxonomy.ts, details.ts, form.ts}   NEW  taxonomy writer core, writeProductDetails, readForm/missingRequired
apis/edge-api/shared/src/catalog/{variants.ts, read.ts, catalog.guard.test.ts}   options by attribute/pack size; guards extended
apis/edge-api/shared/src/lib/{media-public.ts}                + categories
apis/edge-api/catalog/src/taxonomy/{service, repository, handler-support, authz}.ts   NEW ; functions/taxonomy-*.ts NEW (14)
apis/edge-api/catalog/src/placements/*, functions/product-placements-v1-put.ts, products-missing-details-v1-get.ts   NEW
apis/edge-api/catalog/src/review/*                            path, facts, overrides, missing; approve refuses missing
apis/edge-api/catalog/src/gst/** + functions/gst-*.ts         DELETED
apis/edge-api/admin/src/catalog/** + functions/catalog-*.ts   DELETED ; admin/serverless.yml trimmed
apis/edge-api/shop/src/products/{types, service, repository, change, handler-support}.ts   facts, details, form, recategorise, missing
apis/edge-api/shop/src/functions/{catalog-categories-v1-get, catalog-category-form-v1-get}.ts NEW ; catalog-schema DELETED
apis/edge-api/storefront/src/{lib/category-tree.ts, catalog, search/filters.ts, facets, suggest, home, lib/cards.ts}   membership, facets R9, details per variant, icon/picture, ageRestricted
apis/edge-api/commerce/src/{checkout/store.ts, cart, orders}/*   p.storage; ageRestricted on lines
apis/edge-api/fleet/src/{planner/sql.ts, dispatch/sql.ts, dispatch/windows.ts}   p.storage

apps/back-office/src/features/taxonomy/{TaxonomyScreen, CategoryTree, CategoryPanel, AttributeLibrary, AttributeDialog, AttachmentEditor, FormPreview, model, queries, repo}.tsx/ts   NEW
apps/back-office/src/features/catalog-schema/**               DELETED
apps/back-office/src/features/product-review/{ReviewItemScreen, model, Placements}.tsx ; GstMissing* DELETED ; MissingDetailsScreen NEW
apps/shop-web/src/features/catalog/create/{NameCategoryStep, CategoryPicker, DetailsStep}.tsx NEW ; TypeStep DELETED ; AttributesStep → DetailsStep
apps/shop-web/src/features/catalog/{DetailField, VariantDetails, FactsSection}.tsx NEW ; {ProductCreateFlow, ProductDetailScreen, ProductEditDialogs, CatalogListScreen, VariantEditor, VariantsSection, model, draft, validation, repo, queries, focusedEdit}
apps/customer-web/{components/chrome/aisle-icon.tsx → category-icon, AisleMenu, AisleRow}, app/(shop)/_components/filters/{FilterControls, RangeFilter}, product/[id]/page.tsx, lib/search-query.ts, cart & checkout lines (18+)
apps/customer-mobile/shared/.../features/catalog/{data, domain, presentation/{FilterSheet, SearchScreen, ProductDetailScreen, ProductDetailViewModel, CategoryIcons}}, cart/checkout/account lines (18+)
```

**Structure decision**: the existing monorepo layout. New folders are `catalog/src/taxonomy`,
`catalog/src/placements` and back-office `features/taxonomy`. Everything else changes in place or is
deleted.

## Implementation notes

- **Order of work (independently testable)**:
  1. removal plus schema plus taxonomy seed;
  2. back-office taxonomy (US1–US2);
  3. shop flow plus facts (US3–US4), including checkout and fleet;
  4. storefront filters (US5);
  5. per-variant details (US6);
  6. library options (US7);
  7. placements and review polish (US8).
- **Schema migration contents, in order**:
  1. `DO` guard: no `product` rows;
  2. delete the baseline catalogue rows;
  3. drop `product_type*` and `product.product_type_id`;
  4. alter `category`, `attribute_definition`, `attribute_allowed_value`, `product`,
     `product_attribute_value`, `product_option`, `product_option_value`;
  5. create `category_attribute`, `product_placement` and the three derived tables;
  6. functions;
  7. comments.
  The Down section is a loud no-op (irreversible, fix forward).
- **`rebuild_category_derived()`**: `TRUNCATE` the three derived tables, then insert:
  - the closure (recursive over active categories);
  - `category_resolved` (depth, path arrays, `is_leaf` = no active child, defaults with
    `COALESCE` along the path deepest-first);
  - `category_form`, by walking each category's path root-first and folding attachments (set, tighten,
    hide, re-attach) in a PL/pgSQL loop over categories ordered by depth. Children start from the
    parent's resolved rows, so it is O(categories × attributes).

  It raises if any category exceeds depth 5 (a backstop to the writer).
- **Taxonomy writer** (`@effy/edge-shared/catalog/taxonomy.ts`, used by `catalog`): every mutation
  locks `category` (`LOCK TABLE … IN SHARE ROW EXCLUSIVE MODE`) so two concurrent moves cannot build a
  cycle. It validates against `category_resolved`, writes, calls the rebuild, writes the audit row, then
  announces `taxonomy` after commit. Refusal codes are as in the contracts.
- **`writeProductDetails(tx, productId, form, details, variants)`**:
  - validates with `validateDetails` (shared-types, the same code shop-web runs);
  - converts numbers to base units;
  - deletes the product's rows for attributes not in the form, but **keeps** values for attributes
    hidden by the form (edge case: hidden values are kept);
  - upserts product or per-variant rows;
  - writes option-derived per-variant rows.

  The guard fails any other writer of `product_attribute_value`.
- **Facts on create**: the shop service reads `category_resolved` for the leaf, fills any absent fact
  and refuses `fact_required` if one is still null. Re-categorising a draft applies `recategorise`
  (facts the shop touched are kept; the client sends `factsTouched`).
- **Storefront membership**: `categoryMembershipSql(alias, categoryIdParam)` =
  `EXISTS (SELECT 1 FROM category_ancestor ca WHERE ca.ancestor_id = $x AND (ca.category_id = p.primary_category_id OR ca.category_id IN (SELECT category_id FROM product_placement pp WHERE pp.product_id = p.id)))`.
  The recursive CTEs in `category-tree.ts` are replaced by `category_ancestor` reads.
- **Facets SQL**: one CTE `inview` (product ids under the current filters minus attribute selections),
  then the following, where the `category_form` join drops hidden attributes:
  `SELECT pav.attribute_definition_id, unnest(pav.allowed_value_ids) v, count(DISTINCT pav.product_id) FROM product_attribute_value pav JOIN inview … JOIN category_form cf ON cf.category_id = p.primary_category_id AND cf.attribute_id = pav.attribute_definition_id LEFT JOIN product_variant pv ON pv.id = pav.variant_id WHERE (pav.variant_id IS NULL OR pv.state='active') GROUP BY 1,2`.
  Ranges come from `min/max(value_base)`. Selected attributes are re-counted with their own selection
  cleared.
- **Guards**:
  - `catalog.guard.test.ts` (extended): no `product_type`; no `ad.key = 'storage'`; one writer each for
    `product_attribute_value`, `category_attribute`, `product_placement` and the three derived tables;
    `customer_visible` is checked in every storefront attribute read;
  - `media-public` prefix parity;
  - the gateway capacity test;
  - `functions.guard` for removed routes.
- **Customer app**:
  - `FilterSheet` renders `range` (two numeric fields plus unit text) and keeps choice facets as
    checklists;
  - `ProductDetailViewModel` exposes the selected variant's `details`;
  - `CategoryIcons.kt` maps `icon` keys (twin of `category-icons.ts`);
  - an `AgeBadge` in the kit renders `18+` from the age-words twin.
- **customer-web**: `aisleIcon(name)` is replaced by `categoryIcon(key)`. The mega menu shows levels
  1–3. Aisle pages list child categories as links, so levels 4–5 are reached by navigation.

## Deploy order

1. Commit, then **operator**:
   - `terraform apply` (dev; the `categories/` prefix);
   - `make purge-orders ENV=dev`;
   - run `db/reset/101_purge_catalogue_dev.sql`;
   - `make db-up ENV=dev`.
2. `make edge-deploy`:
   - `SERVICE=admin` first, because it releases the `/admin/v1/catalog/*` route keys;
   - then `catalog`, `shop`, `storefront`, `commerce`, `fleet`, `orders`, `driver`, `notifications`,
     `admin-promotions`.

   `catalog`, `shop`, `storefront`, `commerce` and `fleet` read columns the migration drops
   (`product_type_id`, the `storage` attribute, `value_options`, `product_option.name`). The rest
   redeploy because the shared library they bundle changed (variants, live, promotions). All must
   deploy before dev is used.
3. shop-web, back-office, customer-web.
4. The customer app build (it is not publicly released, so no compatibility is needed).
5. `db/seeds/101_catalogue_products_dev.sql`, then walk [quickstart.md](quickstart.md).

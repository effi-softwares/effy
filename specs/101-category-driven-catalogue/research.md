# Research: Category-Driven Catalogue (101)

Decisions resolving the plan's open questions. Each decision is stated, then why, then what else was
considered.

## External reference (summary)

- **eBay**: a listing goes in a **leaf** category. Each leaf's item specifics are required, recommended
  or optional (`aspectRequired`, `aspectUsage`). A second category is optional and costs extra.
  Categories are suggested from the title (`getCategorySuggestions`), each shown with its ancestors.
- **Shopify Standard Product Taxonomy**: each category lists its attributes explicitly. In Food &
  Beverages the tree goes nine levels deep, and children normally repeat their parent's attributes but
  may drop some: Cheese does not carry its root's `organic_certification`. Category attributes can be
  storefront filters and can be **linked to variant options** (Colour), so option values stay
  consistent.
- **Amazon / Akeneo**: these keep a separate "product type" or family for the form, and use categories
  for browsing only (many per product). That model suits teams who manage the data at very large SKU
  counts. Effy's shops fill in a form themselves, so the category-led model fits.

## R1. The category is the form. Product types are dropped, not renamed.

- **Decision**: drop `product_type` and `product_type_attribute`, and `product.product_type_id` with
  them. The form comes from the home leaf's attachments plus those of its ancestors.
- **Why**: this is the spec (FR-001), it is eBay's and Shopify's model, and it gives every product one
  classification instead of two that can disagree.
- **Alternatives**: keep types hidden behind categories (category → type). Rejected: it is two
  sources for one fact.

## R2. The home category is a leaf, enforced at the writers, not by trigger.

- **Decision**: `product.primary_category_id` stays as the column name (it is read in about 40
  places). The shop's product writers and the catalog review writers refuse a category that has active
  children (`category_not_leaf`). The tree writer refuses to add a child to a category that is home to
  products unless the same call moves them (FR-004). Restoring a category under such a parent needs the
  same consent (`moveProductsToSelf`). Moving an existing category under a leaf with products is
  refused (`category_has_products`): staff create the sub-category there instead. Retiring is refused
  while the category has **active** children (`category_has_children`) or is home to products, and
  creating or restoring under a retired parent is refused (`parent_retired`). So an active category
  never sits under a retired one, and the closure over active categories is always complete.
- **Why**: a trigger would hide the rule. The repo's pattern is one writer per table, held by guard
  tests. A leaf can only stop being a leaf through the tree writer, which moves the products in the same
  transaction, so the invariant holds without a constraint.
- **Alternatives**: a deferred constraint trigger. Rejected: it duplicates the writer rule, and its
  error would arrive at commit, with no field to point at.

## R3. Resolved forms and the tree closure are materialised by ONE SQL function.

- **Decision**: three derived tables are rebuilt in full by `public.rebuild_category_derived()`:
  - `category_ancestor (ancestor_id, category_id, distance)`: the closure;
  - `category_resolved (category_id, depth, is_leaf, path_names text[], path_keys text[], storage,
    gst_status, age_restricted)`: resolved defaults and the path;
  - `category_form (category_id, attribute_id, level, section, position, source_category_id)`: the
    resolved form of every category. Hidden attributes are absent. Rows exist for every category, not
    only leaves, so a parent's preview and an aisle's filters both read it.

  The function runs in the transaction of every tree or attachment write. The TS taxonomy writer is
  the only caller. It also runs once at the end of the seed migration.
- **Why**: the resolved form is read on hot paths: storefront filters across thousands of products,
  submission checks, review, the shop's form and the preview. A recursive walk per product per query
  would be the slow part. The taxonomy is small (≈1,000 categories × ≈15 attributes ≈ 15k rows) and
  changes rarely, so a full rebuild is milliseconds. It also gives exactly one definition of "the
  resolved form" (FR-014): the SQL function. `catalog.guard.test.ts` fails any other `INSERT`,
  `UPDATE` or `DELETE` on the three tables.
- **Alternatives**:
  - a recursive view: one definition too, but recomputed per row in facet counts;
  - an incremental per-branch rebuild: faster on paper, but more code for a table this small.

## R4. Inheritance semantics.

- **Decision**: walk from the root to the category. Each level's attachment of attribute A either:
  - **sets** A (when no ancestor attached it), with a level, section and position;
  - **tightens** the level (`optional < recommended < required`). Section and position may be restated;
  - **hides** A (`hidden = true`), which removes it from this category and everything below;
  - **re-attaches** a hidden A at a deeper level, which starts again from that level.

  Loosening is refused by the writer (`attachment_loosens`). The source shown in the preview is the
  category that last set or tightened it.
- **Why**: eBay's levels plus Shopify's dropping. Allowing only tightening keeps a department-level
  legal requirement (allergens on food) from being switched off silently. Hiding is explicit and
  auditable.
- **Alternatives**: free override in both directions. Rejected: a child could undo a legal
  requirement without anyone seeing it.

## R5. Operational facts are columns on `product`, with category defaults.

- **Decision**:
  - add `product.storage` (`frozen|chilled|ambient`, NOT NULL) and `product.age_restricted` (boolean,
    NOT NULL);
  - `product.gst_status` (096) becomes NOT NULL;
  - add `category.default_storage`, `category.default_gst_status`, `category.default_age_restricted`
    (nullable = inherit); the resolved values live in `category_resolved`;
  - the `storage` attribute disappears;
  - checkout (`commerce/checkout/store.ts`) and fleet (planner ×2, dispatch, windows) read `p.storage`;
  - customer DTOs add `ageRestricted`.
- **Why**: FR-017–FR-020. Cold chain and tax must never depend on staff-editable EAV keyed by a string.
- **Wording**: "Room temperature" is the label for `ambient` on every screen. The stored word stays
  `ambient`, because order lines (`order_item.storage_class`) and the 065 manifest already use it.
- **GST tooling**: the "GST missing" list and bulk set (`catalog` `/gst/missing`, `/gst/bulk`) are
  deleted. They existed only because GST could be blank. `product_gst_change` stays as the history,
  written by the same writer.

## R6. Attribute values: one table, optionally per variant, typed columns, normalised numbers.

- **Decision**: `product_attribute_value` gains:
  - `variant_id` (nullable; NULL = the whole product);
  - `value_unit`;
  - `value_base`: the number converted to its family's base unit, used for filters and ranges;
  - `value_date` and `value_time`;
  - `value_options` becomes `allowed_value_ids uuid[]`, so a rename of a value label never strands
    data.

  Uniqueness is `(product_id, attribute_id, variant_id) NULLS NOT DISTINCT`. A check refuses both a
  product row and variant rows for the same attribute. ONE writer: `writeProductDetails(tx, …)` in
  `@effy/edge-shared/catalog`.
- **Hidden values**: the writer keeps values of an attribute that a staff attachment hides on the
  product's **own** leaf, so un-hiding restores them. On re-categorise, every value the new leaf does not
  ask for, hidden or not, is dropped (`recategorise`, FR-024).
- **Why**: FR-027, FR-029, FR-030. One table means filters have one place to look ("a product matches
  if any active variant matches" is one `EXISTS`). Base units make "1.5 kg" and "1500 g" equal in a
  range filter.
- **Alternatives**: a separate `variant_attribute_value` table. Rejected: two places for one fact, and
  filters would need a `UNION`.

## R7. Variant options are library attributes or "Pack size".

- **Decision**: `product_option` gains:
  - `kind` (`attribute|pack_size`);
  - `attribute_id` (when kind = attribute; the attribute must be `single_select` with `variant_option`
    true and in the leaf's resolved form).

  `product_option.name` is dropped; the name is the attribute's name, or "Pack size".
  `product_option_value` gains `allowed_value_id` (attribute kind). Its `value` text stays as the
  **label copy** that `variantLabel` / `variantLabelSql` read. For pack size, the values are generated
  from the variants' pack quantity and unit. Both copies are written only by `applyVariantSet` (098's
  one writer) and refreshed by the attribute writer when a value label is renamed. A variant's option
  value is also written as its per-variant attribute value by `writeProductDetails`, called from
  `applyVariantSet` (FR-029).
- **Why**: consistent names and values across shops (FR-028), and filterable options. Every order
  line, manifest, PDF and email keeps reading a label through the one existing function, so nothing
  downstream changes.
- **Alternatives**:
  - read labels by join at every reader. Rejected: 098 put the label in about 20 SQL readers through
    `variantLabelSql`; one copy written by two known writers is smaller and guarded;
  - free-text "custom" options as a fallback. Rejected by the spec ("ask Effy").

## R8. Units: fixed families in shared-types, with conversion factors.

- **Decision**: `packages/shared-types/src/units.ts` defines families and units, with integer-safe
  factors to the base unit:
  - mass (mg, g, kg → g)
  - volume (mL, L → mL)
  - length (mm, cm, m → mm)
  - area (cm², m² → cm²)
  - power (W, kW → W)
  - voltage (V)
  - battery capacity (mAh)
  - data capacity (GB, TB → GB)
  - duration (min, h, d, mo, y → min; months and years are fixed at 30 d and 365 d, so they are used for
    display and warranty only)
  - temperature (°C)
  - count (pieces, sheets, rolls, packs, each a family of one)

  The attribute stores `unit_family` and `units text[]` (allowed, ordered; the first is the default).
  `formatAttributeValue` (TS) renders a value for customers. The server sends rendered strings, so no
  Kotlin twin is needed.
- **Why**: FR-010. A closed set keeps conversion exact. A new family is a release (spec assumption).

## R9. Storefront filters follow the resolved form and the products in view.

- **Decision**:
  - The facet attribute set for a query is every attribute that is `filterable`, appears in
    `category_form` of the home leaf of at least one product in view, and has a value on one of them.
    "In view" means the products matched by the query, category subtree and other filters. For a
    category page, attributes are ordered by the category's own `category_form` position, then by
    coverage. For search without a category, they are ordered by coverage, with **at most 8** attribute
    facets.
  - Counting is **one** grouped query over all unselected attributes (`GROUP BY attribute_id, value`),
    plus one query per *selected* attribute with its own selection cleared, as today.
  - Choice values are AND across attributes and OR within one. This **changes** today's OR-across rule
    (FR-030).
  - Numbers marked filterable become a new facet type `range` (`{min, max, unit}` in the family's
    display unit), filtering on `value_base`.
  - A product matches if a product-level value matches, or an **active** variant's value matches.
    Values of attributes hidden for the product's leaf are ignored through a join to `category_form`.
- **Why**: FR-030 / FR-031 / SC-005. Today's code issues one count query per attribute in the
  library. With about 60 library attributes that would be 60 queries; one grouped query keeps the facet
  call at 3–5 queries whatever the library size.
- **Wire**: search params stay `attr.<key>=<allowedValueId>` (repeatable) and add
  `range.<key>=<min>..<max>`. The attribute `key` is a slug generated from the name at creation and
  never changes.

## R10. Product page details are per variant, merged on the server.

- **Decision**: `StorefrontProductDetailDTO.attributes` is removed. Each `StorefrontVariantDTO` gains
  `details: ProductAttributeGroupDTO[]`, the complete customer-visible groups for that variant (product
  values merged with that variant's, in `category_form` order). Clients render the selected variant's
  groups.
- **Why**: FR-032. Clients never merge, so web and app cannot disagree. With at most 50 variants and a
  dozen short rows, the payload stays small.

## R11. Category picker: the taxonomy is loaded once, and matching is a shared pure function.

- **Decision**:
  - `GET /shop/v1/catalog/categories` returns every active category: id, parent, name, path, is_leaf,
    synonyms, icon. It also returns the shop's five most recently used leaves. Resolved defaults come with
    the leaf's form (`CategoryFormDTO.defaults`), which the shop fetches when it picks a leaf.
  - `suggestCategories(name, leaves)` in `@effy/shared-types/category-suggest.ts` tokenises, singularises
    simple plurals, and scores matches on leaf names, ancestor names and synonyms (a leaf-name or
    synonym hit outranks an ancestor hit). It returns at most five, pinned to fixtures.
  - The column browser and search use the same list.
- **Why**: FR-022. There is no per-keystroke round trip, the payload is about 100 KB once per session
  and cached, and it is testable without a server. Learned suggestions are a later improvement (spec
  assumption).
- **Alternatives**: a server suggest route. Rejected: one more route and latency on every keystroke,
  for the same word matching.

## R12. Where the routes live: taxonomy admin moves from `admin` to `catalog`.

- **Decision**: the back-office taxonomy routes are `catalog` service, **staff** gateway, under
  `/catalog/v1/taxonomy/…`. The 18 `/admin/v1/catalog/*` routes and `admin/src/catalog` are deleted.
- **Why**: `catalog` already owns back-office catalogue work (review, margin). `admin` passed
  CloudFormation's 500-resource limit once (095) and is better off shrinking. The staff gateway goes
  from about 199 to about 195 routes (18 removed, 16 added, 2 GST routes removed), well under the
  75% alarm (225).
- **Service line**: *Service: `catalog`, on the `staff` gateway, because back-office staff manage the
  catalogue's taxonomy. Shop reads: `shop`, on the `shared` gateway, because the shop audience lists
  products.*

## R13. Category pictures and icons.

- **Decision**:
  - `category.icon`: a key from a closed glyph list in `@effy/shared-types/category-icons.ts` (≈40 Lucide
    names covering every department), with a Kotlin twin pinned to `category-icons.fixtures.json`. This
    **replaces** the word-rule `aisleIcon` on web and in the app.
  - `category.image_key`: an optional staff picture under a new public media prefix `categories/`,
    uploaded through the existing presign pattern and served by `publicImageUrl` with renditions.
  - The storefront falls back to today's derived product picture when there is no staff picture.
- **Why**: the spec asks for a picture or icon per category. Word rules cannot cover Electronics,
  Garden, Automotive and the rest.
- **Infra**: `PUBLIC_MEDIA_PREFIXES` and `local.public_media_prefixes` (`infra/envs/dev/media.tf`) gain
  `categories`. The operator runs `terraform apply`. The guard holds the two lists equal.

## R14. Extra placements.

- **Decision**: a new table `product_placement (product_id, category_id, created_by, created_at)`, PK
  `(product_id, category_id)`. Leaf only, at most 5 per product, never the home leaf. Written only by
  the catalog service. It is included in the storefront's category contents (FR-009) through one
  fragment, `categoryMembershipSql`, which replaces `p.primary_category_id IN (subtree)` everywhere
  (`storefront/src/lib/category-tree.ts`). Search results stay one row per product. Retiring a category
  deletes the placements into it.
- **Why**: FR-008 / FR-009.

## R15. Missing required details: computed, never stored.

- **Decision**: `public.product_missing_required(product_id) RETURNS TABLE(attribute_id uuid,
  attribute_name text, variant_id uuid)` returns one row per required attribute of the leaf's
  `category_form` that has no value (`variant_id` NULL). For a per-variant attribute it returns one row
  per active variant lacking a value. It **does not name variants**. The TS reader `missingRequired()`
  (`@effy/edge-shared/catalog/form.ts`) labels them with the one label rule (`variantLabelSql` /
  `variantLabel`) as "Allergens (Mango / 500 g)", so the label rule keeps one implementation. It is read by:
  - the shop's product list and detail (a "Missing details" filter and banner);
  - submission and approval (refuse when non-empty);
  - the back-office "Missing details" list.
- **Why**: FR-016 / SC-004. It cannot go stale. Products stay on sale (spec).

## R16. The seed is a data migration. Dev products are a seed file.

- **Decision**:
  - `<ts>_category_catalogue.sql`: the schema change. It refuses unless `product` is empty, drops the
    old model, adds the new columns and tables, and adds `rebuild_category_derived()`.
  - `<ts>_catalogue_taxonomy.sql`: the general-retailer tree (25 departments, about 600–900
    categories, depth 2–5), the attribute library (about 60 attributes with values and units),
    attachments at the right levels, defaults per department, icons and synonyms. It is written as
    `VALUES` tables, as 084's seed is, and ends with `SELECT public.rebuild_category_derived()`.
  - `db/seeds/101_catalogue_products_dev.sql` replaces the 084 and 098 seeds: products in every
    department, with details, per-variant values and options from the library.
  - `catalogue-taxonomy.container.test.ts` checks the seeded tree's invariants: depth ≤ 5, unique sibling
    names, every department has leaves, no attachment loosens, every leaf resolves all three defaults or
    is a department that deliberately has none, and every food leaf requires allergens.
- **Why**: the starting taxonomy is product reference data every environment needs, not dev sample
  data. `make wipe-dev` rebuilds from migrations, so it arrives automatically.
- **Alternatives**: a YAML source plus a generator. Rejected: one more tool, and the migration would be
  frozen after first apply anyway.

## R17. Purge before migrating (dev).

- **Decision**: the operator runs `make purge-orders ENV=dev` (exists), then
  `db/reset/101_purge_catalogue_dev.sql` (new). It deletes the rows of cart, saved and list items,
  promotion targets, stock movements, sales-day rollups, product changes, media rows and products.
  Then they run `make db-up`. The schema migration refuses to run while any product exists, so the
  order cannot be skipped. `make wipe-dev` is the heavier alternative (it also deletes accounts).
- **Why**: FR-036. It keeps staff, shop and driver accounts while discarding the catalogue.

## R18. Approval, edits and the change proposal.

- **Decision**: 067's `product_change.proposed` keys become `primaryCategoryId`, `storage`,
  `gstStatus`, `ageRestricted`, `details` (product and per-variant), `options` and `variants`.
  `diffProposal` / `overlay` / `mergeAttributes` are rewritten around `details`. Approval applies a
  proposal through `writeProductDetails` + `applyVariantSet`. Re-categorising a draft runs the
  pure `recategorise(draft, oldForm, newForm, newDefaults, factsTouched)` in `@effy/shared-types/product-form.ts`.
  The shop-web warning and the server use it, so both drop the same details (FR-024).
- **Review**: the item response adds `categoryPath`, `missingRecommended` and `factOverrides` (facts
  differing from the leaf's defaults), shown at the top (story 8).

## R19. Stock-date names are refused.

- **Decision**: `isStockDateName(name)` in `@effy/shared-types/product-form.ts` matches
  `/\b(expir|best[ -]?before|use[ -]?by|manufactur|packed|packing date|batch|lot)\b/i`. The attribute
  writer refuses a match (`attribute_is_stock_date`) (FR-012).

## R20. Old code removed, not kept for compatibility.

- **Decision**: delete the following:
  - `admin/src/catalog/**` and its 18 functions;
  - back-office `features/catalog-schema/**`, replaced by `features/taxonomy/**`;
  - shop-web `create/TypeStep.tsx` and the type model;
  - `/shop/v1/catalog/schema`;
  - `ProductTypeDTO` and related types;
  - the `catalog` GST missing/bulk routes and back-office `GstMissing`;
  - the word-rule `aisleIcon` (web and app);
  - the 084 and 098 dev seeds.

  A guard test (`catalog.guard.test.ts`, extended) fails any SQL naming `product_type` or
  `ad.key = 'storage'`.
- **Why**: FR-036 and the operator's "no legacy" instruction.

## R21. Taxonomy changes reach open shop consoles and back-office.

- **Decision**: add `taxonomy` to the live kinds for the **shop** and **ops** scopes
  (`LiveChange`). After a taxonomy write commits, `announceTaxonomy()` (`@effy/edge-shared/live`)
  publishes `{"k":"taxonomy"}` to ops and to every active shop. There are tens of shops, so these are a
  handful of publishes, best-effort, never throwing. shop-web maps `taxonomy` to its taxonomy and form
  query keys (`SW/features/live/routes.ts`); back-office maps it to the taxonomy keys.
- **Why**: SC-006 ("within a minute, without a release"). The shop caches the taxonomy for the
  session, so without a signal an open console would keep a stale tree.
- **Alternatives**: a short `staleTime`. Rejected: the repo forbids timer-driven refresh, and it would
  still miss open forms.

## R22. Alarms.

- **Decision**: add one CloudWatch alarm in Terraform (`infra/envs/dev`): **`ProductSubmitRefused`
  with reason `missing_required_details` above 20 in 15 minutes**, delivered to the alerts topic. It
  signals a category requirement shops cannot meet (a mis-set Required attribute). `TaxonomyRebuildMs`
  is a metric only, with no alarm, because rebuilds run inside staff writes that already report
  failures.
- **Why**: Principle VII requires a plan to name the alerts it introduces.

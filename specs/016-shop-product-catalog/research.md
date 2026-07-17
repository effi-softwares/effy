# Research: Shop Product Catalog Management (016)

Phase 0 decisions. Each resolves an unknown or pins a convention so Phase 1 (data-model, contracts)
and later tasks have no open technical questions. Conventions were verified against the live tree
(the `apis/edge-api/{admin/shops, shop/staff}`, `db/migrations`, `packages/*`, `apps/*` patterns).

---

## R1 — Backend path: cold path only

**Decision**: All catalog APIs run on the **cold path** (edge-api). Admin schema authority →
`apis/edge-api/admin` (`catalog/` slice, back-office authorizer). Shop product CRUD + schema-read →
`apis/edge-api/shop` (`products/`/`sections/` slices, shop authorizer).

**Rationale**: Every operation is management CRUD by an Effy-employed operator or a shop operator —
low-frequency, not latency-sensitive customer traffic. Principle III places exactly this on the cold
path. The operator confirmed a cold-path preference. No `core-api` change.

**Alternatives considered**: Hot path for product **reads** — rejected: these are operator reads, not
customer reads. A future **customer-facing** catalog browse/search is genuinely latency-sensitive and
may warrant the hot path, but it is out of scope and gets its own spec + path justification (spec
Assumptions). Flagged for the operator per the feature brief ("ask before using hot path").

---

## R2 — Catalog ownership: shop-owned products (confirmed)

**Decision**: `public.product` is **shop-owned** — one row per shop-authored product, FK
`shop_id → public.shop(id) ON DELETE RESTRICT`. No shared master product.

**Rationale**: Confirmed with the operator; matches the eBay seller-listing / Uber-Eats-menu model and
the spec's "each shop has its own catalog." GTIN/barcode is captured as a plain (non-unique) column so
a **future** cross-shop master-catalog dedupe stays possible without building it now.

**Alternatives**: Master-product + per-shop offer — rejected for this slice (much larger foundation,
implies a catalog authority above shops); the GTIN column keeps the door open.

---

## R3 — Dynamic attribute model: back-office-managed EAV (confirmed)

**Decision**: A managed schema drives products:
- `product_type` — a named classification.
- `attribute_definition` — a reusable attribute with a `data_type`
  (`short_text | long_text | number | boolean | single_select | multi_select`), optional `unit`,
  optional `validation` (jsonb: min/max/max_length), and `attribute_allowed_value` rows for the select
  types.
- `product_type_attribute` — assigns an attribute to a type with `is_mandatory`, `display_order`,
  `group_label` (drives the step-form grouping and the detail-page sections).
- `product_attribute_value` — the per-product value (EAV), one **typed** column populated per
  `data_type` (`value_text` / `value_number` / `value_boolean` / `value_options text[]`).

**Rationale**: The operator's confirmed requirement is that attributes are **data managed by the back
office**, addable without a deployment (SC-001). EAV is the industry-standard way to model
eBay-style "item specifics" that vary by category. Raw SQL + explicit row→domain mapping still holds
(no ORM). Typed value columns (not a single opaque jsonb) keep values queryable/validatable and let a
later slice add GIN/functional indexes for attribute filtering without a data migration.

**Alternatives**: (a) One `value jsonb` per row — rejected: harder to validate/query per type.
(b) Per-type physical columns — rejected: cannot add an attribute without a migration (fails SC-001).
(c) A separate variant/modifier engine — deferred: the spec folds variants/modifiers into the dynamic
attribute system for this slice (spec Assumptions); revisit only if attributes prove insufficient.

---

## R4 — Categories: platform taxonomy + shop sections (confirmed)

**Decision**: `public.category` is a back-office-managed **hierarchical taxonomy**
(`parent_id` self-FK, `status active|retired`), shared across shops; a product has one
**primary_category_id** (FK RESTRICT). `public.shop_section` is a **shop-local** grouping
(`shop_id` FK CASCADE), with `product_section` as the M:N join (a product may sit in several sections,
like an Uber Eats item in multiple menu sections).

**Rationale**: Confirmed. Platform taxonomy makes future cross-shop customer browse coherent; shop
sections give operators free organization without polluting the shared taxonomy.

**Alternatives**: Single primary category only (no sections) — deferred to Phase D but modeled now;
shop-defined categories only — rejected (not comparable across shops later).

---

## R5 — Authorization: active-shop-membership for CRUD; admin/manager for schema (clarified)

**Decision**:
- **Shop product/section CRUD** (create/edit/archive/delete) requires an **active shop assignment with
  any shop role** (`shop_manager` **or** `shop_staff`). New backend predicate `authorizeShopMember(sub)`
  = `shop_staff.status='active' AND shop.status='active'` joined on the operator's assigned shop (a
  role-agnostic sibling of the existing `authorizeShopManager`). Reads (list/detail) require the same
  membership (also enforcing shop-scope). Decided **from the DB record, never the token claim**;
  **fail-closed** (throw → 503, never a grant); uniform denials that never disclose which term failed.
- **Catalog schema** (types/attributes/categories): **read** = any active `admin.staff` (incl. `csa`);
  **mutate** = `admin`/`manager` — exactly the `apis/edge-api/admin/shops/authz.ts` `guard(read|mutate)`
  pattern.

**Rationale**: Clarified with the operator (both manager and staff manage the catalog). Reuses the
verified shop-scope join (`apis/edge-api/shop/src/staff/repository.ts` `AUTHORIZE_SHOP_MANAGER`) with
the role term dropped, and the admin two-level guard. Principle IV holds — shop tokens on the shop
authorizer, admin tokens on the back-office authorizer, no cross-pool.

**Alternatives**: Manager-only CRUD (the original assumption) — overturned by clarification; the
manager gate remains available for any future manager-only catalog action.

---

## R6 — Product identity / uniqueness: SKU unique per shop when provided (clarified)

**Decision**: `product.sku` is **nullable**; a **partial unique index**
`CREATE UNIQUE INDEX product_shop_sku_uq ON public.product (shop_id, sku) WHERE sku IS NOT NULL`
enforces per-shop uniqueness only when a SKU is present. `name` and `gtin` are **not** unique; no
cross-shop uniqueness. A `23505` unique violation from this index maps to a domain **conflict** (409)
with an inline "SKU already used in this shop" message (the `asConflict` pattern).

**Rationale**: Clarified; the eBay seller-key model. Partial unique index is the standard Postgres way
to make "unique when present" without forcing a value.

---

## R7 — Search & filter: backend-only, `q` over name/SKU/brand/description (clarified)

**Decision**: `GET /shop/v1/products` accepts `page`, `pageSize`, `q` (free text), `type`, `category`,
`section`, `status`, `priceMin`, `priceMax`, `sort` (`name|price|recent`), `order` (`asc|desc`). `q`
matches **name, SKU, brand, short_description** case-insensitively. Response is `PagedDTO<ProductListItemDTO>`
(`items/total/page/pageSize`) with `total` from `count(*) OVER()`; `LIMIT/OFFSET` for the page. Server
clamps `pageSize` (e.g. ≤100). All computed **backend-side** — the client requests discrete pages
(SC-004, FR-017).

**Rationale**: Confirmed searchable fields (Q4). Extends the verified back-office `listShops`
pagination pattern (`page/pageSize/q/status` + `count(*) OVER()` + `PagedDTO`). Sort params have no
existing precedent, so this slice introduces the `sort`/`order` convention.

**Indexing for < 1s at 10k+/shop**: btree on `(shop_id, status)`, `(shop_id, price_amount)`,
`(shop_id, created_at DESC)`; a `pg_trgm` GIN index (or a generated `search_text` `tsvector`) over
name/sku/brand/short_description for `q`. Decision: start with a **`pg_trgm` GIN** on a concatenated
expression (simplest, good `ILIKE '%q%'` recall); revisit `tsvector` if ranking is needed later.

**Alternatives**: Client-side filtering — prohibited (FR-017). Full-text over all attribute values —
rejected for the MVP (heavier, noisier; the EAV typed columns allow adding it later).

---

## R8 — Product lifecycle, archive vs hard delete (clarified)

**Decision**: `product.status ∈ {draft, active, unavailable, archived}` (`text CHECK`, platform-owned).
- **Remove = archive** by default: `POST /shop/v1/products/{id}/status` (or PATCH) sets `archived`; the
  row and all data are retained.
- **Hard delete** (`DELETE /shop/v1/products/{id}`) is permitted **only** when the product is
  **unreferenced** — the service refuses (409) unless the product is `draft` and has never been
  published/active and has no dependent references; otherwise it instructs the caller to archive.
  (There are no order/cart references yet, so "unreferenced" today ≈ "still draft, never activated";
  the guard is written to extend cleanly when those arrive.)

**Rationale**: Clarified ("Both"). Reconciles FR-029/FR-030. Archiving-by-default protects future
cart/order/history integrity (Uber Eats / eBay both retain delisted items).

**Alternatives**: Hard delete always (rejected — dangling references) or archive-only (rejected — the
operator wanted true removal for never-published drafts).

---

## R9 — Product media: new S3 bucket + presigned direct upload

**Decision**: A new **S3 bucket** `effy-<env>-product-media` (Terraform, `infra/envs/dev/media.tf`,
region from `var.aws_region`). Upload flow: `POST /shop/v1/products/{id}/media` returns a **presigned
PUT URL** + the object key; the client uploads bytes **directly to S3**; a follow-up
`PATCH`/registration records `product_media(storage_key, is_primary, display_order, alt_text)`. Reads:
the list/detail endpoints return **short-lived presigned GET URLs** for each key. Bucket is **private**
(dev); a CloudFront CDN is deferred to the customer-facing slice. The shop Lambda gets IAM
`s3:PutObject`/`s3:GetObject` scoped to the bucket. Server validates declared content-type
(`image/jpeg|png|webp`) and enforces a max size via the presigned policy (FR-026).

**Rationale**: Direct-to-S3 presigned upload is the industry standard (keeps bytes out of Lambda,
cheap, scalable). Private + presigned GET is sufficient for an operator-only management surface; the
public CDN belongs with the customer-facing slice.

**Alternatives**: Proxy bytes through Lambda (rejected — payload limits, cost), store in Postgres
(rejected — anti-pattern). **Media is its own Phase-A workstream** because FR-010 makes a primary
image mandatory at creation. **Open for the operator**: confirm bucket naming/region posture at
`make apply` time (heaviest new infra in the slice).

---

## R10 — `@effy/shared-types` DTOs + Kotlin regeneration

**Decision**: Add `packages/shared-types/src/catalog.ts` (barrel-exported) with: enum unions +
`readonly[]` constants (mirroring the SQL `CHECK` sets) and DTOs — schema DTOs (`ProductTypeDTO`,
`AttributeDefinitionDTO`, `CategoryDTO`, assignment shapes) and product DTOs (`ProductListItemDTO`,
`ProductDetailDTO`, `CreateProductRequest`, `UpdateProductRequest`, media/section DTOs), reusing
`PagedDTO<T>`. The **shop-facing subset** the mobile app needs (schema-read + product DTOs +
`ProblemJSON`) must be **regenerated to Kotlin** (`packages/shared-types/contract-shop/…`) via
`pnpm --filter @effy/shared-types contract:gen`, since shop-mobile `srcDir`s the generated contract.
Admin-only schema-authoring DTOs are **not** part of the mobile contract.

**Rationale**: Principle II single-source. The mobile DTOs are generated, not hand-written (verified:
`contract-shop/ShopDto.kt` is generated and diff-guarded).

**Open task-level detail**: confirm whether `contract:gen` emits from `shop.ts` only or can include a
new `catalog.ts` — if it is file-scoped to `shop.ts`, the shop-facing catalog DTOs are authored in (or
re-exported into) the generated source set the generator reads. Resolve in tasks; does not change the
architecture.

---

## R11 — Design-system additions (Principle II) and the NO-CARD rule

**Decision**: Add to `packages/design-system/src/ui/` (via shadcn CLI → shared package, then barrel
re-export): **`tabs`** (detail page), **`textarea`** (descriptions), **`switch`** (availability),
**`checkbox`**/**`radio-group`** (attribute inputs), **`popover`**, and **`sonner`** (there is no toast
system today; success/error is inline). Existing primitives suffice for the rest:
`sheet` (bottom-sheet via `side="bottom"`), `dialog`, `alert-dialog`, `select`, `table`, `badge`,
`input`, `label`, `skeleton`, `tooltip`, plus web-kit `DataTable`. **No shadcn `form`** — the codebase
uses **TanStack Form** (raw `Label`+field). Multi-step "stepper" and image-upload are composed by hand
(no primitive).

**NO-CARD (DOCTRINE-2)**: the pre-v1.9.0 `back-office/features/shops` screens still wrap detail/roster
in `<Card>`; **do not copy that**. Build catalog pages as sectioned layouts (`space-y-6` +
`h1/h2` + `text-muted-foreground`), detail rows as `<dl className="grid ...">` with `dt/dd`, tables in
`<div className="rounded-md border">`, and the details page with **`Tabs`** + sectioned `dl`s. No
metric/summary cards at the top of any page.

**Rationale**: Verified primitive inventory; adds only what's missing, to the shared package, once.

---

## R12 — Web catalog UI patterns (shop-web + back-office)

**Decision**: Mirror `back-office/features/shops` end-to-end for both new UI slices
(`repo.ts`/`queries.ts`/`model.ts`/`access.ts`/`errorText.ts`/`*ListScreen`/`*DetailScreen`/`components/`).
- **List**: `useState` for `page`/filters/`q` → params-keyed `useQuery` → web-kit `DataTable`
  (presentational) + manual Prev/Next; server owns pagination/filter/search (TanStack Query cache is
  the single source of truth — no hand-caching).
- **Create step-form**: local step state (`Step` index) inside a `Dialog` (desktop) / bottom `Sheet`
  (`side="bottom"`, mobile-web), TanStack Form per step; step 1 selects the **product type**, then the
  form renders that type's mandatory/optional attributes from the schema query; **draft** in
  `localStorage` (client state — a small TanStack Store slice or direct `localStorage`), restored on
  reopen, cleared on publish/discard (FR-012).
- **Detail**: `Tabs` (Overview / Attributes / Media / Pricing / Categorization) with sectioned `dl`
  rows; each section has a **pencil** button opening a small `Dialog` scoped to that field/group;
  mutation PATCHes only that subset and invalidates the detail query.
- Role-aware UI hides controls (backend authoritative); nav entry gated as appropriate.

**Rationale**: Reuses the proven, audience-neutral console foundation; nothing new in web-kit required.

---

## R13 — Mobile catalog UI patterns (shop-mobile, KMP + MVVM)

**Decision**: New `features/catalog/{data,domain,presentation}` following the verified
`features/shop` pattern:
- **domain**: `CatalogRepository` interface (schema-read + product CRUD), `CatalogUseCases`
  (`GetCatalogSchema`, `ListProducts`, `GetProduct`, `CreateProduct`, `UpdateProduct`,
  `ChangeProductStatus`), pure domain models (`Product`, `ProductType`, `AttributeDef`) — DTOs never
  escape `data/`.
- **data**: `HttpCatalogRepository` over the shop Ktor client (single bearer, relative `shop/v1/...`
  paths, `ensureSuccess()`/`toAppException()`), `CatalogMappers.kt` (generated DTO → domain).
- **presentation**: `CatalogListScreen` (`LazyColumn`, backend `q`/filters in `UiState`, tablet-first
  **two-pane** list/detail on `WindowWidth.EXPANDED` via `AdaptiveContent`), `ProductCreateSheet`
  (`ModalBottomSheet` multi-step — a `Step` enum + fields + a `draft` sub-object in immutable
  `UiState`, mirroring `AuthViewModel`'s multi-step flow), `ProductDetailScreen` (`TabRow` + sectioned
  rows via `HorizontalDivider`, focused **bottom-sheet** edits). **No cards** (rows + dividers).
- **Wiring**: register repository (private) + use cases in `AppContainer`; pass explicit collaborators
  into ViewModels; add `AppRoute.ProductList` / `AppRoute.ProductDetail(id)` and `App.kt` when-branches;
  navigate via `navigator.push/pop`.
- **Local draft**: persist the in-progress create state on-device. **Decision**: use
  `multiplatform-settings` (a small KMP key-value lib) or a simple `commonMain` file abstraction behind
  a `DraftStore` interface with platform actuals — pick `multiplatform-settings` unless it complicates
  the build; the draft is device-local, never synced (FR-012).

**Rationale**: Matches the established MVVM + Clean Architecture + manual-DI conventions; introduces
`ModalBottomSheet`/`LazyColumn` (already in the installed Material3/foundation deps — no new
dependency) and one small settings dependency for the draft.

**Alternatives**: Compose Navigation lib (rejected — the app uses its own sealed-route stack);
service-locator into ViewModels (rejected — 014 removed that seam).

---

## R14 — Testing strategy

**Decision**: Follow the verified conventions per surface:
- **edge-api**: colocated `*.test.ts` with `vi.hoisted`/`vi.mock` module-boundary mocking. Unit-test
  services (validation: mandatory-field enforcement, SKU-uniqueness mapping, hard-delete guard,
  archive transitions, search/sort/pagination param clamping), authz predicates
  (`authorizeShopMember`, the admin `guard`), media presign shaping, and handlers (status/shape/no
  internal leakage in error bodies). Repositories get SQL/guard tests; no live DB in unit tests.
- **web**: vitest feature units (repo mapping, access helpers, `errorText`, draft persistence, step
  validation); optional Playwright E2E for the create→list→detail→edit happy path + shop-isolation +
  no-card assertions.
- **mobile**: `kotlin.test` + `runTest` with **hand-written `FakeCatalogRepository`** — test use cases
  (input normalization, mandatory validation) and ViewModel state transitions (step flow, draft
  restore, list filter). No mocking library, no DI framework in tests.

**Rationale**: Mirrors the platform's existing test posture exactly.

---

## R15 — Migration authoring & seed

**Decision**: `make db-new name=product_catalog` → `db/migrations/<ts>_product_catalog.sql` with
`-- +goose Up`/`-- +goose Down` (FK-safe drop order), all tables in `public`, `text CHECK` enums (no
native PG enums, no `updated_by`, no triggers — plain `created_at`/`updated_at`), an index on every FK,
the partial-unique SKU index, the `pg_trgm` search index, and `COMMENT ON` for each table/column.
**Seed** a minimal starter schema via `INSERT … ON CONFLICT DO NOTHING`: product types (Prepared Food,
Packaged Grocery, Beverage, Household), a starter attribute library (dietary labels, allergens, spice
level, prep time, brand, net weight/unit, storage, country of origin, material, dimensions), their
type assignments, and a small category taxonomy — so the feature is usable day one while remaining
fully back-office-editable (SC-001). Add `admin.audit_log` actions
(`product_type.*`, `attribute.*`, `category.*`) written inside each schema mutation's transaction.
Commit the file **before** `make db-up` (the commit-guard).

**Rationale**: Verified Goose/house conventions; the seed satisfies "usable on day one" without
violating "addable without a deployment."

---

## R16 — Dedicated primary-image step + modern upload UX (drag-drop · click · paste)

**Decision (UI refinement, post-MVP)**: The primary image is captured in its **own dedicated step**
in the shop-web create flow, inserted **immediately after the Basics step** (step 3), rather than as a field
inside it. New step order: **Type → Basics → Image → Details → Review** (5 steps). The
step presents a single, large, professional **image dropzone** supporting **three input modalities**:
(1) **click** to open the file picker, (2) **drag-and-drop**, and (3) **paste** (Ctrl/⌘-V a copied
image). It shows a live preview that fills the step area, a Replace/Remove affordance, and client-side
type/size validation that mirrors the backend allow-list.

**Rationale**:
- **Reference platforms (DOCTRINE-1)**: eBay's listing flow and Shopify/Square/Uber-Eats-merchant all
  give media its own dedicated section/step with a big drop target — media is a first-class,
  publish-mandatory asset (FR-010), not one field among many. A dedicated step de-clutters Basics and
  gives the image the space a proper drop zone needs.
- **Three modalities, native APIs, no new dependency**:
  - **Click** — a hidden `<input type="file" accept="image/jpeg,image/png,image/webp">` triggered from
    the zone (also keyboard-activatable: the zone is a `<button>`).
  - **Drag-and-drop** — the HTML Drag-and-Drop API: `onDragOver` (must `preventDefault` to allow a
    drop), `onDragEnter`/`onDragLeave` for the active-highlight state, `onDrop` reads
    `e.dataTransfer.files[0]`.
  - **Paste** — a `document`-level `paste` `ClipboardEvent` listener mounted **only while the step is
    shown**; it scans `clipboardData.items` for the first `image/*` and takes `item.getAsFile()`.
    Document-scoped is safe here because the Image step has no other input to steal a paste from.
  - Rejected **react-dropzone / filepond / uppy** — the three native APIs are ~60 lines and keep the
    storefront-adjacent console bundle lean (consistent with 011's bundle discipline); a library buys
    nothing we need here.
- **Validation mirrors the backend** (`apis/edge-api/shop/src/products/media.ts`): type ∈
  `{jpeg, png, webp}`, size ≤ **10 MB**. The backend re-validates on presign (authoritative); the
  client check is a courtesy that fails fast with an inline message.
- **Preview lifecycle**: `URL.createObjectURL` on select, **revoked** on change/unmount (no leak) —
  the pattern the existing picker already used.
- **Accessibility**: the empty zone is a focusable `<button>` (Enter/Space opens the picker); the
  active drag state is a visual + `aria` cue; the preview's Remove control is `aria-label`led.
- **Draft interaction (FR-012)**: unchanged — the chosen `File` still is **not** persisted to
  `localStorage` (a `File` can't be revived across reload); the operator re-picks on reopen, and the
  Image step's advance gate re-checks presence. Every other field still restores.

**Upload timing is unchanged (create-then-attach, R9/FR-010)**: this is purely *capture* UX. The
presign → PUT → register still runs on **publish** once the product row exists; the upload progress
bar renders on the **Review** step during publish.

**Component**: a new feature-local `ImageDropzone.tsx` (not promoted to the design-system yet — it is
catalog-create-specific; promote to `@effy/web-kit` only if a second surface needs the same control).
It supersedes the inline `MediaUpload` picker in the create flow. Mobile-web keeps the same step via
the bottom-sheet path (the zone falls back to click + paste; drag-drop is a no-op on touch, expected).

**Out of scope (recorded)**: multi-image gallery capture during create (still primary-only at create;
the gallery is US4's detail-page concern), image cropping/rotation, and camera capture — later polish.

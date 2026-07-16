---
description: "Task list for 015-shop-product-catalog"
---

# Tasks: Shop Product Catalog Management

**Input**: Design documents from `specs/015-shop-product-catalog/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: Included as normal tasks (not TDD-first). The constitution's Quality Gates and every existing
edge-api / mobile slice ship colocated unit tests; this feature matches that posture. Web E2E is optional.

**Organization**: Tasks are grouped by user story (spec US1–US5) plus a mobile-parity phase. Phases map to
the plan's delivery phasing (A–D). **MVP = Phase 1 + Phase 2 + US1 + US2 + US3** (schema authority + shop
create + shop browse, web + backend). Stop-and-validate checkpoints are marked.

**Mode of work**: Claude authors all code/SQL/Terraform. Steps that apply live AWS / run migrations /
deploy are **[operator]** — listed in Phase 10, gated on committed code.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on incomplete tasks)
- **[Story]**: US1–US5 for story phases; Setup/Foundational/Mobile/Polish carry no story label (mobile tasks carry the story they deliver)

---

## Phase 1: Setup (Shared Contracts, Design System, Infra Authoring)

**Purpose**: Cross-cutting scaffolding every story builds on. No live AWS.

- [ ] T001 [P] Author catalog wire DTOs in `packages/shared-types/src/catalog.ts` — enum unions + `readonly[]` constants (`ProductStatus`, `AttributeDataType`, `SchemaStatus`) and all schema + shop-facing interfaces per [data-model.md §5](./data-model.md); reuse `PagedDTO<T>`; add tolerant-reader narrowing helpers for back-office-authored enums.
- [ ] T002 Add `export * from "./catalog";` to `packages/shared-types/src/index.ts` (depends: T001).
- [ ] T003 Ensure the shop-facing catalog DTO subset is emitted to Kotlin: inspect `packages/shared-types` `contract:gen` config; author/wire the shop-facing catalog DTOs into the generated source set and run `pnpm --filter @effy/shared-types contract:gen` (resolves research R10 open detail) (depends: T001).
- [ ] T004 [P] Add `@effy/shared-types` to `apis/edge-api/shop/package.json` dependencies (shop service does not yet depend on it).
- [ ] T005 [P] Add missing shadcn primitives to `packages/design-system/src/ui/` (via CLI into the shared package) and re-export from `packages/design-system/src/ui/index.ts`: `tabs`, `textarea`, `switch`, `checkbox`, `radio-group`, `popover`, `sonner` (toast). Do NOT add shadcn `form` (TanStack Form is used).
- [ ] T006 [P] Author `infra/envs/dev/media.tf` — private S3 product-media bucket (`effy-<env>-product-media`, region from `var.aws_region`), bucket CORS for browser PUT, and an SSM param `/effy/<env>/media/bucket`. Author only (operator applies in Phase 10).
- [ ] T007 [P] Extend `apis/edge-api/shop/serverless.yml` provider env with `S3_MEDIA_BUCKET: ${ssm:/effy/${sls:stage}/media/bucket}` and an IAM statement allowing `s3:PutObject`/`s3:GetObject` scoped to the bucket ARN (author only).

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: No user story can begin until this phase is complete.

- [ ] T008 Scaffold the migration: `make db-new name=product_catalog` → `db/migrations/<ts>_product_catalog.sql`.
- [ ] T009 Write the `-- +goose Up` schema-authority tables in the migration (all `public`, `text CHECK` enums, index every FK, `COMMENT ON` each): `product_type`, `attribute_definition`, `attribute_allowed_value`, `product_type_attribute`, `category` per [data-model.md §2.1–2.5](./data-model.md) (depends: T008).
- [ ] T010 Write the `-- +goose Up` product tables in the migration: `product` (+ btree indexes, partial-unique `product_shop_sku_uq`, `pg_trgm` GIN search index), `product_attribute_value`, `product_media` (+ partial-unique primary), `shop_section`, `product_section` per [data-model.md §2.6–2.10](./data-model.md) (depends: T009).
- [ ] T011 Write the `-- +goose Up` starter seed (`INSERT … ON CONFLICT (key) DO NOTHING`): product types, attribute library, type↔attribute assignments, category tree per [data-model.md §6](./data-model.md). **Do NOT seed a `brand` attribute** — brand's single authority is the `product.brand` column (F1 / FR-010a) (depends: T010).
- [ ] T012 Verify `admin.audit_log` accepts the new `target_type` values (`product_type`,`attribute_definition`,`category`) and actions; adjust the audit table CHECK in this migration if it is constrained (depends: T009).
- [ ] T013 Write the `-- +goose Down` section: FK-safe drop order (children→parents), dev-iteration only (depends: T010).
- [ ] T014 [P] Author `authorizeShopMember(sub)` in `apis/edge-api/shop/src/products/authz.ts` — record-backed predicate (`shop_staff.status='active' AND shop.status='active'`, **any** role) resolving the actor's `shop_id`; fail-closed; + `authz.test.ts` (member allowed; role-less/unassigned/inactive-shop refused).
- [ ] T015 [P] Author `apis/edge-api/admin/src/catalog/authz.ts` reusing the `shops/` `guard(read|mutate)` pattern — read = any active `admin.staff`; mutate = `admin`/`manager`; + `authz.test.ts`.

**Checkpoint**: Migration authored (commit + `db-up` is Phase 10); authz predicates ready. Stories can start.

---

## Phase 3: User Story 1 — Back-office defines the catalog schema (Priority: P1) 🎯 MVP

**Goal**: Back office creates/maintains product types, attribute definitions, and the category taxonomy that drive everything else.

**Independent Test**: In the back office, create a "Prepared Food" type, attach 3 attributes (1 mandatory), add a food category; all persist and are retrievable; a `csa` can read but not mutate.

### Backend — `apis/edge-api/admin/src/catalog/`

- [ ] T016 [P] [US1] `types.ts` — domain models (ProductType, AttributeDefinition, AllowedValue, Assignment, Category) + `CatalogError` (validation/conflict/not_found).
- [ ] T017 [US1] `repository.ts` — raw SQL for product-type, attribute-definition (+allowed values), and category CRUD/status + assignment writes; each mutation co-writes an `admin.audit_log` row inside `withTransaction`; in-use guards for retire/delete (depends: T016).
- [ ] T018 [US1] `service.ts` — validation + orchestration: non-empty name, `dataType` ∈ union, `validation` shape, allowed-value uniqueness, category no-cycle, retire-in-use → conflict (FR-006) (depends: T017).
- [ ] T019 [US1] `handler-support.ts` — `guard(event,scope,level)` wrapper, DTO mappers (domain→`@effy/shared-types`), `mapCatalogError` (depends: T018).
- [ ] T020 [US1] Handlers `functions/catalog-product-types-*.ts` (list/get/create/patch/status + attribute assign/patch/unassign) (depends: T019).
- [ ] T021 [US1] Handlers `functions/catalog-attributes-*.ts` (list/get/create/patch/status + allowed-value delete) (depends: T019).
- [ ] T022 [US1] Handlers `functions/catalog-categories-*.ts` (list/create/patch/status) (depends: T019).
- [ ] T023 [US1] Register all catalog functions in `apis/edge-api/admin/serverless.yml` under `/admin/v1/catalog/*` with `authorizer.id: ${ssm:.../edge/authorizer/back-office_id}`, per-function `Errors>0` alarms + `Duration p95` on list/tree reads (depends: T020–T022).
- [ ] T024 [P] [US1] Unit tests `catalog/service.test.ts` (validation, in-use guard, cycle) with `vi.hoisted`/`vi.mock`.
- [ ] T025 [P] [US1] Handler test (shape, 403 for `csa` mutate, no internal leakage in error bodies).

### Frontend — `apps/back-office/src/features/catalog-schema/`

- [ ] T026 [P] [US1] `model.ts` — domain aliases of the catalog DTOs + list-param types.
- [ ] T027 [US1] `repo.ts` — `api.get/post/patch/delete` for `/admin/v1/catalog/*` (depends: T026).
- [ ] T028 [US1] `queries.ts` — TanStack `queryOptions` + mutation hooks with coarse invalidation (depends: T027).
- [ ] T029 [P] [US1] `access.ts` (`canManageCatalog(roles)`) + `errorText.ts` (map `DomainError` → safe copy, no `detail` leak).
- [ ] T030 [US1] Schema screens (sectioned/tabbed, **no cards**): Product Types, Attributes, Categories — tables + detail, using `DataTable`/`Tabs`/`dl` rows (depends: T028).
- [ ] T031 [US1] Dialogs (TanStack Form): create/edit type (+assign attributes), create/edit attribute (`dataType` select, allowed-values editor, validation fields), create/edit category (parent select) (depends: T030).
- [ ] T032 [US1] `routes/catalog-schema.tsx` (+ `$` detail if needed), register in `apps/back-office/src/routes/router.tsx`, add nav entry in `apps/back-office/src/components/layout/nav.ts` (read for all staff; mutate gated in-screen) (depends: T030).
- [ ] T033 [P] [US1] vitest units: repo mapping, `access`, `errorText`.

**Checkpoint**: US1 fully functional — the schema authority exists and is demoable on its own.

---

## Phase 4: User Story 2 — Shop adds a product via schema-driven step form (Priority: P1) 🎯 MVP

**Goal**: A shop operator creates a product through a guided, type-driven multi-step form with a device-local draft; primary image uploads to S3.

**Independent Test**: With a type defined (US1), an operator completes the web step form for a food product; it appears in the catalog; closing mid-way and reopening restores the draft.

### Backend — `apis/edge-api/shop/src/products/`

- [ ] T034 [P] [US2] `types.ts` (domain + `ProductError`) and `media.ts` (S3 client singleton + presigned-PUT/GET helpers, content-type + size validation).
- [ ] T035 [US2] `repository.ts` — `catalog-schema` read query (active types + assignments + active category tree); product insert + attribute-value rows + media registration inside `withTransaction`; SKU `23505` → conflict (depends: T034).
- [ ] T036 [US2] `service.ts` — create validation: universal mandatory (name/type/category/price/short_description/primary image), type-mandatory attributes present, attribute values typed + within `validation`, SKU uniqueness; **write optional `brand` to the `product.brand` column** (F1 / FR-010a — never as an attribute); schema assembly (depends: T035).
- [ ] T037 [US2] `handler-support.ts` — `authorizeShopMember` gate wrapper (resolve `actorShopId`), DTO mappers, `mapProductError` (depends: T036).
- [ ] T038 [US2] Handler `functions/catalog-schema-v1-get.ts` (`GET /shop/v1/catalog/schema`) (depends: T037).
- [ ] T039 [US2] Handler `functions/product-create-v1-post.ts` (`POST /shop/v1/products`) (depends: T037).
- [ ] T040 [US2] Handlers `functions/product-media-create-v1-post.ts` (presign) + `product-media-register-v1-post.ts` (depends: T037).
- [ ] T041 [US2] Register the above in `apis/edge-api/shop/serverless.yml` under `/shop/v1/...` (shop authorizer id, `Errors` alarms) (depends: T038–T040).
- [ ] T042 [P] [US2] Unit tests `products/service.test.ts` (mandatory enforcement, attribute typing, SKU dup→409, missing primary image→400) + media presign test + a handler test.

### Frontend — `apps/shop-web/src/features/catalog/`

- [ ] T043 [P] [US2] `model.ts` + `repo.ts` (schema query, create, media upload) + `queries.ts`.
- [ ] T044 [US2] `draft.ts` — device-local draft store (localStorage, keyed per shop+subject): save/load/clear (FR-012).
- [ ] T045 [US2] `ProductCreateFlow` — multi-step `Dialog` (desktop) / bottom `Sheet` (mobile-web): Step 1 select type → Step 2 basics (name/category/price/short desc/primary image/**optional brand**) → Step 3 dynamic type attributes → Step 4 review/publish; blocks advance on unmet mandatory (depends: T043, T044).
- [ ] T046 [US2] Dynamic attribute field renderer (`AttributeDataType` → input/textarea/number/switch/select/checkbox-group) reused by create + focused edit (depends: T043).
- [ ] T047 [US2] Media upload component — presigned PUT to S3, progress, set primary (depends: T043).
- [ ] T048 [US2] Wire draft restore/clear on open/publish/discard + PostHog `product_create_started`/`product_created` (depends: T045).
- [ ] T049 [P] [US2] vitest units: draft persistence, step validation, attribute-renderer mapping.

**Checkpoint**: US1 + US2 work — schema exists and shops can create products (draft-resilient).

---

## Phase 5: User Story 3 — Backend-driven catalog table (Priority: P1) 🎯 MVP

**Goal**: An operator browses their shop's products with backend search/filter/sort/pagination; shop-isolated.

**Independent Test**: With >1 page of products, search + status-filter returns correct paginated results with a total count computed server-side; a second shop sees only its own.

### Backend

- [ ] T050 [US3] `products/repository.ts` — list query: `q` (trgm ILIKE over name/sku/brand/short_description), filters (type/category/section/status/priceMin/priceMax), `sort`/`order`, `count(*) OVER()`, `LIMIT/OFFSET`, `WHERE shop_id = :actorShopId` (depends: T035).
- [ ] T051 [US3] `products/service.ts` list param clamp/validate + handlers `functions/products-list-v1-get.ts` and `product-get-v1-get.ts` (detail read, shop-scoped) (depends: T050).
- [ ] T052 [US3] Register list/detail in `serverless.yml` (+ `Duration p95` alarm on the list route — the <1s SC-004 route) (depends: T051).
- [ ] T053 [P] [US3] Unit tests: param clamp, shop isolation, pagination shape, search-field coverage.

### Frontend

- [ ] T054 [P] [US3] `CatalogListScreen` — `DataTable` columns (image/name/type/category/price/status/sku), filter row (`q` input, type/category/status selects, price range), manual Prev/Next + total; **no cards, no metric cards** (depends: T043).
- [ ] T055 [US3] `queries.ts` `productListQuery(params)` keyed per filter/page; empty state + `ErrorState` (depends: T054).
- [ ] T056 [US3] `routes/catalog.tsx` (index) + register + `Catalog` nav entry; PostHog `catalog_search`/`catalog_filter_applied` (depends: T054).
- [ ] T057 [P] [US3] vitest: list-param encoding, column render.

**Checkpoint**: 🎯 **MVP complete** — back-office schema + shop create + shop browse on the web.

---

## Phase 6: User Story 4 — Product details & focused editing (Priority: P2)

**Goal**: A sectioned/tabbed details page (no cards) with small, focused pencil edits (dialog on web).

**Independent Test**: Open a product; edit one focused group (pricing) via its pencil; only that group changes; page uses tabs/sections, zero cards.

### Backend

- [ ] T058 [US4] `products/repository.ts` — full detail assembly (attributes + media presigned-GET + sections + `updatedAt` token + `missingMandatoryAttributes` computed vs the type's current mandatory set, **FR-020a**); PATCH partial update `... WHERE id AND shop_id AND updated_at = :expectedUpdatedAt` (0 rows → conflict, **FR-023a**), attribute upserts inside `withTransaction`; media patch/delete (depends: T050).
- [ ] T059 [US4] `products/service.ts` focused-edit validation (mandatory cannot be cleared; typed values; **require + enforce `expectedUpdatedAt`, map 0-rows → 409 conflict**, FR-023a) + handlers `product-update-v1-patch.ts`, `product-media-patch/-delete` (depends: T058).
- [ ] T060 [US4] Register PATCH/media functions in `serverless.yml` + alarms (depends: T059).
- [ ] T061 [P] [US4] Unit tests: PATCH updates only the subset; mandatory-clear refusal; **stale `expectedUpdatedAt` → 409**; `missingMandatoryAttributes` computed correctly; media rules.

### Frontend

- [ ] T062 [P] [US4] `ProductDetailScreen` — `Tabs` (Overview/Attributes/Media/Pricing/Categorization) + sectioned `dl` rows, **no cards**; render a non-blocking **"missing required attribute" notice** from `missingMandatoryAttributes` (FR-020a) (depends: T043).
- [ ] T063 [US4] Focused-edit dialogs — one pencil per section opening a small `Dialog` scoped to that field/group; PATCH subset **with `expectedUpdatedAt` from the loaded detail**; on **409 show a "changed elsewhere — reload" message** (FR-023a); invalidate detail; reuse the attribute renderer (T046) (depends: T062).
- [ ] T064 [US4] Media gallery management (add/reorder/set-primary/delete) (depends: T062).
- [ ] T065 [US4] `routes/catalog.$productId.tsx` + register; PostHog `product_edit_saved` (depends: T062).
- [ ] T066 [P] [US4] vitest: detail mapping, focused-edit payload builds only the subset.

**Checkpoint**: US1–US4 work on the web.

---

## Phase 7: User Story 5 — Organization & lifecycle (Priority: P3)

**Goal**: Shop sections, product lifecycle (archive default / guarded hard-delete), inventory "coming soon".

**Independent Test**: Create a section, assign + filter by it; change status active→unavailable→archived; hard-delete a published product is refused (archive offered), a never-published draft is removed; inventory shows "coming soon".

### Backend

- [ ] T067 [US5] `apis/edge-api/shop/src/sections/` slice (types/service/repository) — section CRUD + `product_section` assignment; product status change; hard-delete guard (409 unless draft/unreferenced) (depends: T035).
- [ ] T068 [US5] Handlers `sections-*.ts`, `product-status-v1-post.ts`, `product-delete-v1-delete.ts`, `product-sections-v1-patch.ts` (depends: T067).
- [ ] T069 [US5] Register in `serverless.yml` + alarms (depends: T068).
- [ ] T070 [P] [US5] Unit tests: section CRUD, status transitions, hard-delete guard, archive-by-default.

### Frontend

- [ ] T071 [P] [US5] shop-web sections management UI (list/create/edit/delete + assign products; filter list by section) (depends: T054).
- [ ] T072 [US5] Lifecycle controls (status menu → publish/unavailable/archive; archive-vs-delete `AlertDialog`); inventory **"coming soon"** placeholder (no stock entry) (depends: T062).
- [ ] T073 [P] [US5] vitest: status-control logic, delete-guard messaging.

**Checkpoint**: Full web capability (US1–US5) complete.

---

## Phase 8: Shop-Mobile Parity (`apps/shop-mobile`) — delivers US2–US5 on mobile

**Goal**: KMP + Compose catalog: list, schema-driven bottom-sheet create with local draft, sectioned/tabbed detail with focused bottom-sheet edits; tablet-first. Mobile telemetry deferred (documented Principle VII deviation).

**Independent Test**: On Android + iOS, an operator creates (bottom-sheet step form, draft restored), browses (LazyColumn + backend filters, two-pane on EXPANDED), and edits (focused bottom sheet) a product.

- [ ] T074 [P] [US2] `features/catalog/domain/` — `CatalogRepository` interface + pure models (`Product`, `ProductType`, `AttributeDef`, `Category`).
- [ ] T075 [US2] `features/catalog/domain/CatalogUseCases.kt` — `GetCatalogSchema`, `ListProducts`, `GetProduct`, `CreateProduct`, `UpdateProduct`, `ChangeProductStatus` (depends: T074).
- [ ] T076 [US2] `features/catalog/data/` — `HttpCatalogRepository` (Ktor, relative `shop/v1/...`, `ensureSuccess()`/`toAppException()`) + `CatalogMappers.kt` (generated DTO→domain) (depends: T074, T003/T084 for DTOs).
- [ ] T077 [US2] `core/…/DraftStore` — commonMain interface + platform actuals (multiplatform-settings or file); device-local create draft (FR-012).
- [ ] T078 [US2] Wire in `app/AppContainer.kt` (repository private, use cases as explicit collaborators); add `AppRoute.ProductList`/`ProductDetail(id)`; extend `app/App.kt` `when(stack.last())`; add a Home entry (depends: T075, T076, T077).
- [ ] T079 [US3] `presentation/CatalogListScreens.kt` — `CatalogListViewModel` (immutable `UiState` with `q`/filters) + `LazyColumn` list; `AdaptiveContent` two-pane on `WindowWidth.EXPANDED`; no cards (depends: T078).
- [ ] T080 [US2] `presentation/ProductCreateSheet.kt` — `ModalBottomSheet` multi-step (`Step` enum + fields + `draft` in `UiState`), dynamic attribute fields, media upload; `CreateViewModel` (depends: T078).
- [ ] T081 [US4] `presentation/ProductDetailScreens.kt` — `DetailViewModel` + `TabRow` + sectioned rows (`HorizontalDivider`) + focused `ModalBottomSheet` edits (send `expectedUpdatedAt`; handle 409 reload, FR-023a) + a "missing required attribute" notice (FR-020a); no cards (depends: T078).
- [ ] T082 [US5] Mobile lifecycle controls (status change; archive vs guarded delete) + sections read/assign + inventory **"coming soon"** (depends: T081).
- [ ] T083 [P] [US2] `commonTest` — `CatalogUseCasesTest` + ViewModel state tests (step flow, draft restore, list filter) with a hand-written `FakeCatalogRepository` (depends: T075).
- [ ] T084 [US2] Regenerate the Kotlin contract (`contract:gen`) for catalog DTOs and verify `:shared:allTests` + Android + iOS builds are green (depends: T003).

**Checkpoint**: Shop capability at parity on web + mobile.

---

## Phase 9: Polish & Cross-Cutting

- [ ] T085 [P] Update `docs/audiences/shop-capabilities.md` — add catalog rows for **both** shop surfaces (web ✅; mobile ✅, telemetry ⏸) with the backend they depend on.
- [ ] T086 [P] Confirm the shared PostHog event taxonomy documents every catalog web event (`product_create_started/created`, `product_edit_saved`, `product_archived`, `catalog_search`, `catalog_filter_applied`, `schema_type_created`, `schema_attribute_created`).
- [ ] T087 [P] No-card design audit (DOCTRINE-2) on shop-web detail, back-office schema screens, and shop-mobile detail; no metric/summary cards at page tops. **Also verify shop-web responsive range** (SC-009/FR-033): the catalog **list and detail** screens remain usable desktop→mobile-web (table reflow/scroll, focused-edit dialog reachable), not just the create Sheet/Dialog switch.
- [ ] T088 Secret/PII sweep across new backend + web + mobile code; verify error bodies leak nothing (subject-only logs).
- [ ] T088a [P] **SC-004 latency verification**: author a throwaway seed script that inserts ≥10,000 products into one shop, then measure `GET /shop/v1/products` first-page + total-count latency and assert **< 1s**; record the result (this verifies SC-004, distinct from the production p95 alarm in T052). Remove the seed afterward.
- [ ] T089 [P] Author slice READMEs / notes for `apis/edge-api/admin/catalog` and `apis/edge-api/shop/products` (routes, authz, audit actions).
- [ ] T090 Full static gate: `pnpm typecheck` + `pnpm -r test` + `turbo build` + `apps/shop-mobile ./gradlew :shared:allTests` + `terraform -chdir=infra/envs/dev validate`/`fmt -check` all green.

---

## Phase 10: Operator-Run (gated on committed code) — **[operator]**

Claude authors everything above; the operator runs these. Runbook: [quickstart.md](./quickstart.md).

- [ ] T091 [operator] `make apply ENV=dev` — provision the S3 product-media bucket + shop-Lambda IAM + `S3_MEDIA_BUCKET` SSM key. *Abort if any Cognito pool would be replaced.*
- [ ] T092 [operator] Commit `db/migrations/<ts>_product_catalog.sql`, then `make db-up ENV=dev` (commit-guard requires it committed first).
- [ ] T093 [operator] `make edge-deploy SERVICE=admin ENV=dev` (catalog schema) and `SERVICE=shop ENV=dev` (products/sections/media/schema-read).
- [ ] T094 [operator] Provision a back-office admin/manager + a `csa`, and at an active shop a `shop_manager` + `shop_staff`; sign in each.
- [ ] T095 [operator] Live sign-off SC-001…SC-011 + US5 per quickstart (web + mobile parity rows), then update the parity register and commit.

---

## Dependencies & Execution Order

### Phase dependencies
- **Phase 1 Setup** — start immediately (T001→T002→T003 chain for DTOs; rest [P]).
- **Phase 2 Foundational** — after Setup; **blocks all stories** (migration + authz).
- **US1 (P3 phase)** — after Foundational. No dependency on other stories.
- **US2** — after Foundational; consumes US1's schema at runtime but is independently testable with the seed.
- **US3** — after Foundational; shares the `products` repository with US2 (T050 depends on T035) — sequence US2 backend before US3 backend, but US3 web is independent.
- **US4** — after US2/US3 (extends `products` repo + reuses the attribute renderer).
- **US5** — after US2 (new `sections` slice + product status/delete).
- **Phase 8 Mobile** — after the shop backend exists (US2–US5) and DTOs are generated (T003); internally T074→T075/T076/T077→T078→T079–T082.
- **Phase 9 Polish** — after desired stories complete.
- **Phase 10 Operator** — after code committed.

### Within a story
Models/types → repository → service → handlers → serverless registration → tests; web repo → queries → screens → routes/nav.

### Parallel opportunities
- Setup: T001, T004, T005, T006, T007 in parallel (T002/T003 chain after T001).
- Foundational: T014, T015 in parallel.
- Backend slice and its web slice can proceed in parallel once DTOs (T001–T003) land (e.g. T016–T025 alongside T026–T033).
- All `[P]` test tasks run in parallel with sibling implementation once their target files exist.
- Once the shop backend (US2–US5) is deployed, the entire mobile phase can proceed in parallel with web polish.

---

## Parallel Example: User Story 1

```bash
# Backend and frontend of US1 can start together once T001–T003 (DTOs) are done:
Task: "T016 [US1] admin catalog types.ts"          # backend
Task: "T026 [US1] back-office features/catalog-schema/model.ts"  # frontend
# Then within backend, tests parallel the handlers:
Task: "T024 [US1] catalog/service.test.ts"
Task: "T025 [US1] catalog handler test"
```

---

## Implementation Strategy

### MVP first (Phases 1–2 + US1 + US2 + US3)
1. Setup + Foundational (migration, DTOs, design-system, authz).
2. US1 (back-office schema authority) → validate independently.
3. US2 (shop create + draft + media) → validate.
4. US3 (backend-driven table) → validate.
5. **STOP & VALIDATE / demo** — a shop can define nothing itself but the back office seeds the schema and a shop creates + finds products on the web. Operator can run Phase 10 for this scope and ship.

### Incremental delivery after MVP
- Add **US4** (details + focused edit) → demo.
- Add **US5** (sections + lifecycle + inventory placeholder) → demo.
- Add **Phase 8** (mobile parity) → demo; update parity register.
- **Phase 9/10** polish + operator sign-off.

### Notes
- `[P]` = different files, no incomplete-task dependency.
- The `products` `repository.ts`/`service.ts` are touched by US2/US3/US4/US5 — those tasks are sequenced (not `[P]`) where they share a file.
- Commit after each task or logical group; the migration must be committed before `db-up` (commit-guard).
- Stop at any checkpoint to validate a story independently.

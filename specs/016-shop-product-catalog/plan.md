# Implementation Plan: Shop Product Catalog Management

**Branch**: `015-shop-product-catalog` | **Date**: 2026-07-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/015-shop-product-catalog/spec.md`

## Summary

Give every shop a **feature-rich, schema-driven product catalog** it manages from both shop surfaces
(web console + mobile app), and give the back office the **authority that drives it** — a managed
library of **product types**, **attribute definitions**, and a **category taxonomy**. A shop authors
**shop-owned** products through a guided, type-driven multi-step form (device-local draft), browses
them in a **backend-paginated/filtered/searched** table, and views/edits each product on a
**sectioned/tabbed details page** with **small, focused pencil edits** — **no card layouts anywhere**
(constitution v1.9.0, DOCTRINE-2), the entity modelled on **eBay item-specifics + Uber Eats menus**
(DOCTRINE-1). Inventory is a **"coming soon"** placeholder.

**Backend path**: **cold path only** (Principle III). Every operation is shop-operator or back-office
management CRUD — low-frequency, not latency-sensitive customer traffic — so it runs on the
serverless TypeScript edge-api. Two services are extended: a new **`catalog/`** slice in
`apis/edge-api/admin` (schema authority, back-office authorizer) and a new **`products/`** +
**`sections/`** + schema-read surface in `apis/edge-api/shop` (shop authorizer). No `core-api` (hot
path) involvement; a future **customer-facing** catalog browse is out of scope and, when built, is the
only part that may warrant the hot path (its own slice, its own path justification).

**Scale of this feature**: it spans **four client surfaces** (back-office-web, shop-web, shop-mobile,
plus shared-package work) **+ two backend services + one migration + new media infrastructure (S3)**.
That is large for one slice. This plan is authored whole (so the architecture is coherent), but
delivery is **explicitly phased** (§ Delivery Phasing) with a shippable **MVP** first; `/speckit-tasks`
should order tasks by phase, and the operator may choose to land phases as separate commits.

## Technical Context

**Language/Version**:
- Cold path — **Node 22 + TypeScript**, Serverless Framework v3 (3.40.0 pinned), Lambda **arm64**, ESM.
- Web — **React 19 + TypeScript**, Vite (shop-web :5174, back-office :517x), TanStack Router/Query/Table/Form/Store.
- Mobile — **Kotlin 2.4.0 + Compose Multiplatform 1.11.1**, Clean Architecture + MVVM, Ktor client, kotlinx.serialization.

**Primary Dependencies**: `pg` 8.22 (raw SQL, no ORM); `@effy/edge-shared` (http/claims/db/validate);
`@effy/shared-types` (wire DTOs, single source; regenerated to Kotlin via `contract:gen`);
`@effy/api-client`; `@effy/design-system` (shadcn/ui + Tailwind v4) & `@effy/web-kit` (ConsoleShell,
DataTable); Amplify (shop/back-office pools); Ktor + Material 3 (mobile).

**Storage**: **PostgreSQL 16**, `public` schema, raw SQL, **Goose** forward-only migration; **S3** for
product media (new bucket, presigned upload/read). Back-office schema changes audited in
`admin.audit_log`.

**Testing**: vitest (edge-api services/handlers/authz — module-boundary mocking with `vi.hoisted`/`vi.mock`);
vitest (web feature units); Playwright optional for web E2E; `kotlin.test` + `kotlinx.coroutines.test`
(mobile ViewModels/use-cases with hand-written repository fakes).

**Target Platform**: AWS Lambda (arm64, outside VPC in dev, TLS to RDS); modern browsers
(desktop-first shop-web + back-office, excellent mobile web); Android + iOS (tablet-first via
`AdaptiveContent`/window-size class, excellent on phones).

**Project Type**: multi-surface (web SPA ×2 + KMP mobile + serverless backend + DB + infra).

**Performance Goals**: product list search/filter returns first page + total count **< 1s** at
**10,000+** products per shop (SC-004); backend pagination (page/pageSize/total), never client-side.

**Constraints**: DOCTRINE-2 **no cards / no metric cards**; DOCTRINE-1 reference Uber Eats + eBay;
dark mode required; shop isolation absolute (every query scoped to the operator's shop); mandatory
fields (universal + the type's mandatory attributes) enforced backend-side; SKU unique per shop when
provided; single platform currency; device-local drafts (never synced).

**Scale/Scope**: per-shop catalogs to 10k+ products; a managed schema of dozens of attribute
definitions across a handful of product types; a modest platform category taxonomy.

## Constitution Check

*GATE: evaluated against constitution v1.9.0. Re-checked after Phase 1 design — still passing.*

| Principle | Gate | Status |
|---|---|---|
| **I — Spec-Driven** | spec.md + plan.md + (next) tasks.md committed before code; clarifications resolved | ✅ spec + this plan; 4 clarifications recorded |
| **II — Monorepo & shared contracts** | catalog DTOs live once in `@effy/shared-types` (`catalog.ts`), consumed by web + regenerated to Kotlin; no per-surface redefinition; new UI primitives added to `@effy/design-system` (not copied) | ✅ designed so |
| **III — Dual-path** | cold path justified (ops/shop management CRUD, not latency-sensitive customer traffic); no hot-path use | ✅ justified in Summary |
| **IV — Auth isolation** | admin routes on **back-office** authorizer; shop routes on **shop** authorizer; per-pool JWT, pinned issuer; **backend-authoritative** decisions from the platform record; no cross-pool | ✅ shop CRUD gated by active-shop-membership (any role); schema by admin/manager |
| **V — Design (+ doctrines)** | one design-system; dark mode; native mobile (HIG/Material); **DOCTRINE-1** (eBay/Uber-Eats-modelled entity + UX); **DOCTRINE-2** (no cards — tables/sections/tabs/dl rows) | ✅ explicit; old Card-using shops screens are **not** copied |
| **VI — Layered arch & explicit wiring** | three-layer slice (handler→service→repository, raw SQL); no ORM; no DI framework (admin `guard`/module mocks; mobile `AppContainer` explicit collaborators); mobile MVVM (ViewModel→UseCase→Repository/Driver, immutable StateFlow); web server-state cache is source of truth (TanStack Query), client store only for genuine client state (draft, dialog open) | ✅ conforms to ARCHITECTURE.md |
| **VII — Observability & telemetry** | backend structured logs + per-function CloudWatch alarms; web PostHog product events + error tracking; **mobile telemetry deferred** (documented Principle VII deviation, owned by `mobile-telemetry`, consistent with 013/014) | ⚠ documented deviation — see Complexity Tracking |

**No unjustified violations.** The one carried deviation (mobile telemetry) matches the platform's
existing, documented mobile-telemetry deferral. The feature's **size** is a delivery risk, not a
principle breach; it is mitigated by phasing (below) and recorded in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/015-shop-product-catalog/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions + rationale + alternatives
├── data-model.md        # Phase 1 — tables, DTOs, relationships, validation, state
├── quickstart.md        # Phase 1 — end-to-end validation guide
├── contracts/
│   ├── admin-catalog.contract.md   # /admin/v1/catalog/* (schema authority)
│   └── shop-products.contract.md    # /shop/v1/products|sections|catalog schema-read
├── checklists/requirements.md       # spec quality checklist (16/16)
└── tasks.md             # Phase 2 — created by /speckit-tasks (NOT here)
```

### Source Code (repository root)

```text
# ── Backend (cold path) ─────────────────────────────────────────────
apis/edge-api/admin/src/
├── catalog/                         # NEW slice — schema authority (back-office authorizer)
│   ├── types.ts  service.ts  repository.ts  authz.ts  handler-support.ts  (+ *.test.ts)
└── functions/
    ├── catalog-product-types-*.ts   catalog-attributes-*.ts   catalog-categories-*.ts

apis/edge-api/shop/src/
├── products/                        # NEW slice — product CRUD + schema-read (shop authorizer)
│   ├── types.ts  service.ts  repository.ts  authz.ts  media.ts  handler-support.ts  (+ *.test.ts)
├── sections/                        # NEW slice — shop-local sections
│   └── types.ts  service.ts  repository.ts  (+ *.test.ts)
└── functions/
    ├── products-list-v1-get.ts  product-get-v1-get.ts  product-create-v1-post.ts
    ├── product-update-v1-patch.ts  product-status-v1-post.ts  product-delete-v1-delete.ts
    ├── product-media-create-v1-post.ts (presigned) product-media-*-v1-*.ts
    ├── catalog-schema-v1-get.ts  (product-types + attributes + categories for the form)
    └── sections-*-v1-*.ts

# ── Data & shared contracts ─────────────────────────────────────────
db/migrations/<ts>_product_catalog.sql        # NEW — public.* tables + seed + admin.audit_log actions
packages/shared-types/src/catalog.ts          # NEW — DTOs/enums (+ barrel export); shop-facing subset regen→Kotlin
packages/shared-types/contract-shop/…         # regenerated (contract:gen) for shop-mobile

# ── Design system additions (Principle II) ──────────────────────────
packages/design-system/src/ui/                # ADD: tabs, textarea, switch, checkbox, radio-group, popover, sonner(toast)
                                              #  (sheet/dialog/alert-dialog/select/table/badge/input/label exist)

# ── Web surfaces ────────────────────────────────────────────────────
apps/back-office/src/features/catalog-schema/ # NEW — mirrors features/shops/ (types/attributes/categories CRUD)
apps/back-office/src/routes/catalog-schema.tsx  (+ nav entry)
apps/shop-web/src/features/catalog/           # NEW — list/create(step)/detail(tabs)/focused-edits/sections
apps/shop-web/src/routes/catalog.tsx  catalog.$productId.tsx  (+ nav entry, + router.tsx)

# ── Mobile surface (KMP) ────────────────────────────────────────────
apps/shop-mobile/shared/src/commonMain/.../features/catalog/
├── data/    HttpCatalogRepository.kt  CatalogMappers.kt
├── domain/  CatalogRepository.kt  Product.kt  ProductType.kt  CatalogUseCases.kt
└── presentation/  CatalogListScreens.kt  ProductDetailScreens.kt  ProductCreateSheet.kt
# + AppRoute entries (ProductList, ProductDetail(id)), App.kt when-branches, AppContainer wiring,
#   local-draft store (multiplatform settings/file)

# ── Infrastructure (operator-run; Claude authors, does not apply) ───
infra/envs/dev/media.tf                        # NEW — S3 product-media bucket + CORS + SSM key; IAM to shop Lambda
```

**Structure Decision**: Extend the two existing cold-path services with new domain slices (never a
new gateway/service), following the verified `apis/edge-api/{admin/shops, shop/staff}` three-layer
pattern. Put all wire DTOs once in `@effy/shared-types` and regenerate the shop-facing subset to
Kotlin. Mirror `back-office/features/shops` for the schema-authority UI and build the shop catalog UI
as a new `features/catalog` slice on each shop surface — **without** copying the pre-v1.9.0 Card
wrappers those older screens still use.

## Delivery Phasing

The feature is authored whole but **shipped in phases**; each phase is independently testable and
maps to the spec's prioritized user stories. `/speckit-tasks` orders tasks accordingly.

- **Phase A — Foundation & MVP (spec P1: US1 + US2 + US3)**
  DB migration + starter seed; `@effy/shared-types` catalog DTOs; **admin `catalog/`** backend +
  **back-office `catalog-schema/`** UI (types/attributes/categories); **shop `products/`** create +
  list + `catalog-schema` read backend; **shop-web** create step-form (local draft) + backend-driven
  table; **S3 media** pipeline (presigned upload) for the mandatory primary image; design-system
  `textarea`/`switch`/`toast` additions. *Delivers: a shop can define nothing itself, but back-office
  seeds the schema and a shop creates + finds products on the web.*
- **Phase B — Details & focused editing (spec P2: US4)**
  shop-web product **details page** (tabs + sectioned `dl` rows, no cards) + **focused pencil edits**
  (Dialog on web) + media gallery management; design-system `tabs` addition.
- **Phase C — Mobile parity (spec P1/P2 on `shop-mobile`)**
  KMP `features/catalog` — list (LazyColumn + backend search/filter, tablet-first two-pane on
  EXPANDED), create **ModalBottomSheet** step-form + **local draft**, detail (TabRow + sectioned rows)
  + focused **bottom-sheet** edits. Update the shop capability register for both surfaces.
- **Phase D — Organization & lifecycle (spec P3: US5)**
  shop **sections** (define/assign/filter), lifecycle status changes surfaced in table + detail,
  archive vs guarded hard-delete, inventory **"coming soon"** placeholder.

The **parity register** (`docs/audiences/shop-capabilities.md`) gains catalog rows and is updated as
web (Phase A/B/D) and mobile (Phase C) land — a row with an unstated cell is a defect.

## Telemetry (Principle VII declaration)

- **Backend**: structured logs (subject-only, no PII beyond auth sub); **per-function CloudWatch
  Errors alarms** on every new Lambda + a **Duration p95** alarm on DB-touching routes (the mandatory
  edge-api convention). No new Grafana dashboard required (management traffic).
- **Web (shop-web + back-office)**: PostHog product events through the shared taxonomy —
  `product_create_started`, `product_created`, `product_edit_saved`, `product_archived`,
  `catalog_search`, `catalog_filter_applied`, `schema_type_created`, `schema_attribute_created`; web
  runtime errors already route to PostHog. No PII beyond the auth subject id; consent-respecting.
- **Mobile**: **deferred** (documented Principle VII deviation, owned by the `mobile-telemetry` slice,
  consistent with 013/014). Recorded so the parity register does not overstate mobile.

## Complexity Tracking

> Only genuine deviations / notable design choices are recorded here.

| Item | Why needed | Simpler alternative rejected because |
|---|---|---|
| **Feature spans 4 surfaces + 2 services + new S3 infra** | The spec's confirmed model (back-office schema authority driving shop web+mobile catalogs) is inherently multi-surface | A smaller cut would not deliver the confirmed feature; mitigated by **phased delivery** with a shippable Phase-A MVP rather than by dropping scope |
| **Mobile telemetry deferred (Principle VII)** | Matches the platform's existing mobile-telemetry deferral (013/014); PostHog/Crashlytics mobile wiring is its own slice | Wiring mobile telemetry here duplicates work the dedicated slice will do and widens this already-large feature |
| **EAV attribute model** (`attribute_definition` + `product_attribute_value`) | The confirmed requirement is a **dynamic, back-office-managed** attribute schema — attributes are data, not columns | Hardcoded per-type columns can't be "added without a deployment" (SC-001); raw SQL + explicit mapping still holds (no ORM) |
| **`brand` as a first-class product column** (alongside dynamic attributes) | Q4 requires **search by brand** with sub-second results at 10k+ rows without indexing the EAV table | Keeping brand only as a dynamic attribute would force EAV search/indexing in the MVP; a denormalized indexed column is cheaper and safe (brand is near-universal) |
| **New S3 media bucket + presigned upload** | FR-010 makes a **primary image mandatory** at creation; browser/mobile direct-to-S3 upload is the industry-standard pattern | Storing images in Postgres or proxying bytes through Lambda is an anti-pattern; a CDN can be added with the customer-facing slice |

## Operator-run steps (Claude authors, does not execute — per CLAUDE.md mode of work)

Recorded here so they are visible early; the runbook is in [quickstart.md](./quickstart.md):
`make db-new` is Claude's; **`make apply ENV=dev`** (S3 media bucket + shop-Lambda IAM),
**commit migration → `make db-up ENV=dev`**, **`make edge-deploy SERVICE=admin ENV=dev`** and
**`SERVICE=shop ENV=dev`**, provisioning at least one back-office admin/manager and one shop
manager+staff for live sign-off, and the SES/OTP inboxes for sign-in are all **operator-run**.
```

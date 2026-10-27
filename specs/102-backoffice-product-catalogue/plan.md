# Implementation Plan: Back-Office Product Catalogue

**Branch**: `dev` (feature directory `102-backoffice-product-catalogue`) | **Date**: 2026-10-27 | **Spec**: [spec.md](spec.md)

## Summary

Back-office gets **Catalogue › Products**: every product of every shop, and Effy's controls over them.

- **See.** One server-driven list across all shops — search (name, SKU, barcode), filters (shop, aisle
  incl. descendants, state, storage, margin, missing details, low stock), state tabs with counts, sort,
  filters in the URL — and a product page (Overview · Sizes & stock · Details · Aisles · History). One
  SQL expression decides a product's back-office state (R8).
- **Hold.** Four columns on `product` and a CHECK that a held product is never `active`. Holding sets
  `unavailable`, so **no storefront reader changes**, and no route — present or future — can put a held
  product on sale (R2). Shops see "Held by Effy" and are notified.
- **Effy creates.** The shop's create and draft-edit logic moves into `@effy/edge-shared/catalog`
  `authoring.ts` — one writer of product content — called by the shop service and by `catalog`. An
  Effy-created product is approved as made (margin required) and goes on sale automatically once
  complete; until then it is Effy's to finish (`content_owner = 'effy'`) and the shop sees it read-only
  (R3, R4).
- **Import.** The browser parses `.xlsx`/`.csv` into rows; `catalog` stores the import and an SQS worker
  checks every row (aisle, details, sizes, SKU uniqueness, picture links fetched safely into a private
  staging prefix), then creates the ready products one transaction each (R5–R7).
- **Other controls** gathered on the product: margin (inline and bulk), placements, size on/off sale,
  stock — through the existing writers. Bulk hold, release, margin (≤ 200, per-product results).

Decisions: [research.md](research.md) R1–R12. Data: [data-model.md](data-model.md). Contracts:
[contracts/api.md](contracts/api.md). Walk: [quickstart.md](quickstart.md).

## Technical Context

**Language/Version**: TypeScript — edge-api `catalog`, `shop`, `notifications`, `shared`;
`@effy/shared-types`; back-office and shop-web (React 19, TanStack suite). No customer-web or mobile
change (held products are simply not `active`; unknown live kinds are ignored by the apps).

**Primary Dependencies**: three new, **back-office only**: `read-excel-file`, `write-excel-file`,
`papaparse` (R5). Nothing new in the backend; the worker uses the AWS SDK clients already bundled.

**Storage**: PostgreSQL 16 — one goose migration (`<ts>_backoffice_product_catalogue.sql`): product
columns and CHECKs, `product_import`, `product_import_row`, one index, notification types. S3: a private
`imports/` staging prefix with a 7-day lifecycle (Terraform). SQS: `product-import` + DLQ (Terraform).

**Testing**:
- container tests (`catalog`): the list SQL and counts against every state; hold/release incl. held in
  review, release to a product with no picture, archived; bulk partial refusal; import check (every
  problem kind), create idempotency, duplicate file; `completeIfReady`;
- container tests (`shared`): `authoring.ts` create/edit (moved shop tests run against it),
  `setVariantState` → `held`; the CHECK refuses `active` while held (SC-004, attempted through raw SQL);
- unit: SSRF guard (every refused range, redirect to a private host), row grouping and parsing;
- shop: 409 `product_held` / `effy_setting_up` on every write route; `REVIEW_STATE_SQL` `effy_setup`;
- back-office: list search-param model, bulk-result rendering, import grouping; shop-web: held banner;
- guards: `authoring.guard.test.ts` (no `INSERT INTO public.product` elsewhere), `change-map` (new
  routes announce), `gateway-capacity` (< 75 %), `catalog.guard.test.ts` unchanged, `check-no-refresh-timers.sh`.

**Target Platform**: Lambda behind the staff gateway (and the shared one for the shop changes); browsers.

**Project Type**: monorepo — serverless backend + two web consoles.

**Performance Goals**: list < 1 s at 50 000 products (SC-002, `EXPLAIN ANALYZE` in a container test);
import check of 500 rows < 1 min (SC-005) — pictures fetched with bounded concurrency (8).

**Constraints**:
- Hidden fulfilment is untouched: nothing here reaches a customer DTO.
- A shop never sees another shop's products, imports or holds; the margin is never shown to a shop.
- Staff gateway stays under 75 % (~70 % after; R1).
- No polling: the import page and list re-read on the `products` live kind (R9).
- Claude does not run the migration, Terraform or deploys (quickstart lists them for the operator).

**Scale/Scope**: tens of thousands of products, imports ≤ 500 rows, bulk ≤ 200 products. 15 staff routes,
1 worker, ~5 back-office screens, small shop-web change.

## Constitution Check

*GATE: before Phase 0, re-checked after Phase 1.*

| Principle | Status |
|---|---|
| III — one serverless backend, every API in `apis/edge-api`, no always-on compute | ✅ routes in `catalog`; worker is a Lambda on SQS (pay-per-use) |
| Two gateways; a new service states its gateway | ✅ staff gateway; no new service; capacity checked (R1) |
| Raw SQL, repository pattern, no ORM; three-layer slice | ✅ `products/` and `imports/` folders in `catalog`: handler → service → repository |
| One writer per fact | ✅ `authoring.ts` (product content), `applyVariantSet`, `writeProductDetails`, `setVariantState`, `setMargin` — reused, not copied; guard added |
| No DI framework | ✅ module singletons, as the service does today |
| Unidirectional client state; server cache is the truth | ✅ TanStack Query; filters in the URL; no hand-cached server data |
| 071 — no timers | ✅ `products` live kind; import progress by announcement |
| Layout doctrine — no cards | ✅ tables, tabs, sectioned pages |
| Design system — one theme, `ef-*` patterns, shadcn overlays | ✅ hold/release in `AlertDialog`; bulk bar and tables from console.css |
| VII — observability | ✅ metrics `ProductHeld`, `ProductReleased`, `EffyProductCreated`, `ImportRows{Ready,NotReady,Created}`; DLQ alarm in Terraform |
| Security — least privilege, input at trust boundary | ✅ `decide` vs `read`; server re-validates every parsed cell; SSRF guard (R7) |
| Prohibited values | ✅ no addresses or identifiers introduced |
| Mode of work — user runs migrations/applies/deploys | ✅ quickstart hands them over |

**Justified additions**: three back-office dependencies (spreadsheet I/O has no in-repo implementation;
alternatives in R5). No violations.

**Post-design re-check**: unchanged — the design added no runtime, gateway or writer.

## Project Structure

### Documentation (this feature)

```text
specs/102-backoffice-product-catalogue/
├── plan.md  research.md  data-model.md  quickstart.md
├── contracts/api.md
├── checklists/requirements.md
└── tasks.md            # /speckit-tasks
```

### Source Code (repository root)

```text
db/migrations/<ts>_backoffice_product_catalogue.sql

infra/envs/dev/ (+ module)        # product-import queue + DLQ + alarm; media bucket imports/ lifecycle; worker IAM

apis/edge-api/shared/src/catalog/
├── authoring.ts                  # NEW — create / in-place edit of product content (from shop service)
├── authoring.guard.test.ts       # NEW
└── variants.ts                   # setVariantState → 'held'
apis/edge-api/shared/src/lib/
└── safe-fetch.ts                 # NEW — https-only, private-range refusal, size/time caps (R7)

apis/edge-api/catalog/
├── serverless.yml                # 15 routes + productImportWorker (SQS)
└── src/
    ├── products/                 # NEW — repository (list, counts, detail, history), service (hold,
    │                             #   release, bulk, effy create/edit, completeIfReady), handler-support
    ├── imports/                  # NEW — parse/check rows, picture staging, create, worker
    ├── review/repository.ts      # approveNewProduct respects a hold (R2)
    └── functions/                # one file per route, as today

apis/edge-api/shop/src/products/  # call authoring.ts; refuse while held / effy-owned; REVIEW_STATE_SQL
apis/edge-api/notifications/      # four new types + templates

packages/shared-types/src/
├── backoffice-products.ts        # NEW — list/detail/import DTOs, BackOfficeProductState, words
└── live.ts                       # + "products"

apps/back-office/src/
├── features/products/            # NEW — repo, queries, model (search params), ProductsListScreen,
│                                 #   ProductScreen (tabs), NewProductScreen, ImportsScreen,
│                                 #   ImportScreen, HoldDialog, BulkBar, MarginCell, HistoryList
├── routes/products.tsx           # NEW
├── components/shell/nav.ts       # Catalogue › Products (All products, Imports)
├── features/live/routes.ts       # products → ["products"], ["product-review"]
└── features/shops/ShopDetailScreen.tsx   # "Products" link

packages/web-kit/src/…            # the product form + details renderer, IF still in shop-web (R12)

apps/shop-web/src/features/products/      # held banner, "Added by Effy", read-only while effy_setup
```

**Structure Decision**: extends existing slices; the only new shared module is `authoring.ts`, created by
moving code, not writing a second copy.

## Delivery order (for /speckit-tasks)

1. **US1 — See** (P1): migration (columns, index), list/detail routes, shared-types, back-office list +
   page + nav + shop link. Shippable alone.
2. **US2 — Hold** (P1): hold/release routes, shop refusals, `setVariantState` `held`, approve-while-held,
   notifications, shop-web banner. Deploy shop **before** catalog.
3. **US5 — Other controls** (P2): variant state route, bulk route, inline margin, placements/stock on the page.
4. **US3 — Effy creates** (P2): `authoring.ts` extraction (shop tests green first), create/edit/media
   routes, `completeIfReady`, `effy_setup` in shop-web, form moved to web-kit if needed.
5. **US4 — Import** (P2): Terraform, tables, worker, safe fetch, import routes and screens.

## Risks

- **The `authoring.ts` extraction** touches the shop's create/edit path — move it with its tests first, no
  behaviour change, before Effy calls it.
- **The product form in back-office** may require moving shop-web's form into `@effy/web-kit` (R12);
  size this at task time.
- **Picture fetching** is the one outward call from a worker; R7's guard is a hard requirement, unit-tested
  per range.

## Complexity Tracking

None — no constitution violations.

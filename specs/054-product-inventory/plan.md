# Implementation Plan: Product Inventory (Shop-Managed Stock)

**Branch**: `054-product-inventory` | **Date**: 2026-08-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/054-product-inventory/spec.md`

## Summary

Give every shop-owned product an optional unit count, make the platform's existing availability rule
account for it, and stop the oversell at the two moments that matter — adding to a cart, and creating
a payment. This closes **G2**, the top item in the order-flow gap register's post-053 sequencing, and
the root cause of the shortfall → refund → support chain.

The technical approach is deliberately small. Stock is **three columns on `public.product`** plus an
append-only movement log and one per-shop settings row. Customer-facing availability is **one Go SQL
fragment** replacing the ~15 places that spell `p.status = 'active'` by hand. The reduction is **one
statement inside the existing paid transaction**, which is already exactly-once. Management is a new
cold-path service serving both the shop console and the back-office console. **No customer DTO changes
at all** — the shopper feels this entirely through the value of the `available` flag they already
receive, which is the same leverage 052 got from deleting `summarizeFulfillment`.

Two findings from Phase 0 shrank the work further: the storefront **already** reads uncached, so the
freshness contract needs a guard rather than a caching build (R2); and the shop fulfilment service's
pick-row seed is already `ON CONFLICT DO NOTHING`, so pre-flagging a shortfall at payment needs **no
change to that service at all** (R4).

## Technical Context

**Language/Version**: Go 1.25 (hot path) · Node 22 + TypeScript (cold path) · React 19 + TypeScript
(shop-web, back-office) · Kotlin 2.4 / Compose Multiplatform (shop-mobile)

**Primary Dependencies**: Gin, pgx/v5, raw SQL (hot path); Serverless Framework v3, `@effy/edge-shared`
(cold path); TanStack Query/Router/Form + shadcn/ui via `@effy/design-system` (web consoles);
`@effy/shared-types` for DTOs with the existing Kotlin contract generator for shop-mobile. **No new
third-party dependency in any surface.**

**Storage**: PostgreSQL 16, Goose forward-only migration. One migration adding three columns to
`public.product`, `public.stock_movement`, and `public.shop_stock_settings`.

**Testing**: `go test` incl. container-backed tests for the concurrency and idempotency proofs; Vitest
(edge services, web consoles); Kotlin `commonTest` + `testAndroidHostTest` and the iOS simulator
compile for shop-mobile.

**Target Platform**: Fargate (hot path) · Lambda arm64 behind the shared HTTP gateway (cold path) ·
Amplify-hosted SPA consoles · Android + iOS (shop-mobile).

**Project Type**: Monorepo vertical slice — one migration, one hot-path change set, one new cold-path
service, two operator surfaces at parity, plus a correction to a third (`edge-api/shop`).

**Performance Goals**: no additional database round trip on any storefront read (the availability
predicate stays single-table, no join); the finalize transaction grows by one statement per order.

**Constraints**:
- ⚠ `apis/edge-api/admin` is at **434/500 CloudFormation resources** with 77 functions and
  `versionFunctions: false` already spent. No route may be added to it (R6).
- The paid transaction must not gain an external dependency or a new failure mode (R3).
- `customer-web`'s guest bundle gate and the storefront's PPR shell must be untouched — this slice
  ships zero client JavaScript to any customer surface.

**Scale/Scope**: **14 hot-path availability sites** (8 SQL in storefront, 1 in checkout, 1 in saved
items, 4 in-memory in cart), 1 migration, **14 new cold-path routes** (8 shop + 6
back-office) in a fresh CloudFormation stack, 2 shop surfaces, 1 back-office surface, 0 customer surface
changes. The route count matters because R6's whole justification is a resource ceiling.

## Constitution Check

*GATE: passed before Phase 0, re-checked after Phase 1 design. Constitution v1.13.0.*

| Principle | Assessment |
|---|---|
| **I. Spec-Driven** | Spec written and clarified before this plan (5 questions, [spec.md](./spec.md) § Clarifications). Two contradictions found while planning are recorded in [research.md](./research.md) R12 rather than patched in code. ✅ |
| **II. Monorepo & Shared Contracts** | Stock DTOs enter `@effy/shared-types` and reach shop-mobile through the existing Kotlin generator with its `:check` drift guard. The availability rule is one shared Go fragment, not per-query text (R1). One inventory service rather than duplicated stock logic in two services (R6). ✅ |
| **III. Dual-Path Discipline** | Declared per work item in [research.md](./research.md) R7. Customer reads and the paid-transaction reduction on the hot path; operator CRUD on the cold path. No exception required. ✅ |
| **IV. Auth Isolation** | The new service exposes shop-authorized and back-office-authorized routes; API Gateway authorizers are **per route**, so no token crosses pools and no service brokers auth for another. Both gates decide from the platform's own record (`shop_staff` / `admin.staff`), never from the claim alone. ✅ |
| **V. Design** | Fills two tabs that already exist on the shop surfaces; adds no navigation. Detail rows and tables, **no cards, no metric cards** (R11). Monochrome — "low" and "out of stock" carried by weight and label, never a hue; 041 removed an amber warning colour from these exact screens and it is not coming back. ✅ |
| **VI. Layered Architecture** | Three-layer slice on every surface: handler → service → repository (Go and TS), ViewModel → UseCase → Repository (mobile). Raw SQL, no ORM. Explicit wiring. ✅ |
| **VII. Observability** | Two hot-path counters with named call sites, and an oversell alert rule, declared in [research.md](./research.md) R9. ⚠ **The alert is written and inert, not live** — `infra/observability/README.md` records that the Prometheus/Grafana stack does not exist and nothing scrapes `core-api`'s `/metrics`. That is a pre-existing platform gap this slice inherits rather than introduces; it is recorded here and in Complexity Tracking rather than passed silently. ✅ with a recorded deviation. |
| **Real-World Identifiers** | This slice introduces none. ✅ |

**No entries in Complexity Tracking.** The one decision that looks like an exception — a new cold-path
service — is not a deviation from any principle; it is the measured consequence of a CloudFormation
ceiling and follows the precedent 053 set for the same reason (R6).

## Project Structure

### Documentation (this feature)

```text
specs/054-product-inventory/
├── plan.md              # This file
├── research.md          # Phase 0 — 12 decisions, incl. two corrections to stated premises
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1 — the validation walk
├── contracts/           # Phase 1 — route + DTO contracts
├── checklists/
│   └── requirements.md
├── spec.md
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
db/migrations/
└── <ts>_product_inventory.sql            # NEW — 3 columns on product, stock_movement,
                                          #       shop_stock_settings

apis/core-api/internal/
├── platform/availability/                # NEW — THE single availability rule (R1)
│   ├── availability.go                   #   the SQL fragment + its Go predicate twin
│   ├── availability_test.go
│   └── guard_test.go                     #   fails NAMING the file on a hand-written rule
├── platform/metrics/metrics.go           # EDIT — 3 counters/gauge (R9)
└── features/
    ├── storefront/repository.go          # EDIT — 12 sites adopt the shared fragment
    ├── cart/service.go                   # EDIT — availability + the FR-016 quantity refusal
    ├── cart/handler.go                   # EDIT — refusal carries the available quantity
    ├── saveditems/repository.go          # EDIT — verdict widened to cover zero stock (R12.2)
    └── checkout/
        ├── service.go                    # EDIT — re-check at intent creation (FR-018)
        └── store.go                      # EDIT — reduction + shortfall seed in FinalizeSucceeded

apis/edge-api/inventory/                  # NEW SERVICE (R6) — shop + back-office routes
├── serverless.yml                        #   attaches to the shared gateway, two authorizers
├── src/
│   ├── stock/{service,repository,types,authz}.ts
│   └── functions/                        #   ~10 thin handlers
└── ...

apis/edge-api/shop/src/fulfillments/
└── repository.ts                         # EDIT — the pick shortfall also corrects stock (FR-023)

packages/shared-types/
├── src/inventory.ts                      # NEW — stock DTOs
└── contract-shop/                        # REGENERATED by shop-contract:gen

apps/shop-web/src/features/catalog/
├── ProductDetailScreen.tsx               # EDIT — the Inventory tab stops saying "coming soon"
├── StockPanel.tsx / StockHistory.tsx     # NEW
└── LowStockScreen.tsx                    # NEW

apps/shop-mobile/shared/src/commonMain/.../features/catalog/
└── (Inventory tab + stock ViewModel/UseCase/Repository)   # NEW — parity with shop-web (FR-030)

apps/back-office/src/features/shops/
└── (stock view + adjust, on the shop detail surface)      # NEW — US4

infra/observability/alerts/
└── 054-product-inventory.yml            # NEW — the oversell rule. ⚠ WRITTEN AND INERT: no
                                          #   Prometheus stack exists to load it (R9).
```

**Structure Decision**: a standard vertical slice across the existing directories, with exactly one new
top-level unit — `apis/edge-api/inventory`. Everything else extends a module that already exists. The
customer surfaces (`apps/customer-web`, `apps/customer-mobile`) appear nowhere in the tree above, which
is the intended shape: the shopper's experience changes entirely through the value of a flag they
already receive.

## Phase ordering

1. **Migration + the availability rule.** The rule lands first, adopted by all ~15 sites with stock
   columns present but every product untracked — so the whole platform is provably byte-identical in
   behaviour before any stock exists (SC-006).
2. **Shop management** (US1) on both shop surfaces — the operator's ask, useful alone.
3. **The buying gates** (US2) — cart refusal, cart flagging, checkout re-check.
4. **Order flow** (US3) — the reduction, the payment-time shortfall, the pick correction.
5. **Back-office** (US4).
6. **Low stock** (US5) — cuttable under pressure without invalidating anything above.

## Risks

- **⚠ The 14-site adoption is the riskiest edit in the slice.** Missing one leaves a surface selling a
  sold-out product, silently. Mitigated by `guard_test.go`, which greps the hot path and fails naming
  the file, plus SC-006's behaviour-identical proof. ⚠ **Corrected during implementation**: the "~15,
  12 in storefront" figure in this plan's first draft came from a raw grep and was wrong — three of
  those lines are `promo_code`, `attribute_definition` and `category`, not `product`. The real count is
  above. The guard now carries a point-of-use `availability-exempt:` marker for each non-product site,
  so the distinction is enforced rather than recounted by hand.
- **The saved-items verdict** must widen to cover zero stock or a product at zero reads `purchasable` in
  a shopper's saved list while being unbuyable everywhere else (R12.2). Explicitly tasked, not assumed.
- **`fulfillment_item` rows now exist before picking starts**, contradicting a comment at
  `repository.ts:71`. The aggregate is unaffected; any presentation inferring "picking has begun" from
  their presence would be wrong. Pinned by a test (R4).
- **Nobody has looked at any of this.** 039 shipped four live defects with a fully green suite. The
  shop console and shop-mobile Inventory tabs need a person's eyes before this is called done.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| **Principle VII — the alert is specified, not live** | An oversell must be alertable, but the Prometheus/Grafana stack ARCHITECTURE.md describes does not exist: no module, no scrape config, nothing reads `core-api`'s `/metrics`. The rule ships as `infra/observability/alerts/054-product-inventory.yml`, the home 032 created for this exact situation. | A CloudWatch alarm would put this slice's alert on a different mechanism from every hot-path metric beside it, and there is **no log metric filter anywhere in the repository** to hang it on (038 deferred its own). Standing up the observability stack is its own slice, not a rider on this one. Until then an oversell is detectable by querying `stock_movement`. |

*No other deviation.* The new cold-path service is not one — it is the measured consequence of the
434/500 CloudFormation ceiling recorded in [research.md](./research.md) R6.

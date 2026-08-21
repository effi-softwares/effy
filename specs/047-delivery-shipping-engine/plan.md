# Implementation Plan: Delivery Zones & Shipping-Fee Engine

**Branch**: `047-delivery-shipping-engine` | **Date**: 2026-08-21 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/047-delivery-shipping-engine/spec.md`

## Summary

Reintroduce delivery — serviceability, a two-method (same-day / standard) offer, and a shipping-fee
engine — after the previous four-slice build (021/030/031/032) was **withdrawn whole** on 2026-08-02 for
having too many independent refusal terms. The rebuild is deliberately simpler and is governed by one
rule: **serviceability is decided by a single fact — is the address's postcode in a served zone — and a
served zone can never fail to produce a standard fee** (spec FR-001/FR-029). Same-day is a strictly
additive offer on top.

**Technical approach** (paths per Principle III):

- **Hot path (`apis/core-api`, Go)** owns everything a shopper touches: a **serviceability** read and a
  **locality typeahead** (public, cacheable, guest-first — the reintroduced 025/030 reads), and the
  **delivery quote** (available methods + GST-inclusive, snapped-up fees per package) folded into the
  existing `checkout`/`cart` flow. A new pure package `platform/delivery` holds the **one and only fee
  engine** and the zone/ring/plan repository reads. Commerce is hot-path by the 011 routing law.
- **Cold path (`apis/edge-api/admin`, TS)** owns all back-office configuration — zones (composed from
  real places), distance rings, fee plans, same-day eligibility + per-shop exceptions, and the
  collection schedule — as a new `delivery/` domain behind the back-office authorizer, RBAC decided from
  the `admin.staff` record. It **validates** plans (refuses gaps) but never computes a customer fee, so
  the engine keeps exactly one home.
- **Cold path (`apis/edge-api/shop`, TS)** — the existing `products/` domain gains **product weight**
  entry (measured vs assumed).
- **Reference data** is loaded by an operator Go command `cmd/load-localities` (the `create-first-admin`
  precedent), from a committed **G-NAF-derived** open dataset under `db/reference/`.
- **One forward-only migration** adds the reference, zone, ring, plan, eligibility, schedule and
  per-order-capture tables, and re-adds `product.weight_grams`. DTOs live in `@effy/shared-types`
  (customer-facing ones generated to Kotlin for mobile, with a Go↔Kotlin wire-contract test). Web
  (customer-web + back-office) and mobile (customer-mobile) consume them.

**⚠ A simplification discovered in planning and reconciled into the spec**: the customer fee depends on
the **destination** zone's distance ring and the package weight — **not** on where the fulfilling shop
is. So **shop location is not required** by this feature (the old design needed it for origin-zone
pricing and shop→customer same-day distance; this design needs neither). Same-day is a back-office
**eligibility** decision, not a computed shop-distance. Spec Dependencies/Assumptions were narrowed
accordingly (see research R2).

## Technical Context

**Language/Version**: Go 1.25 (hot path — serviceability, locality, quote, fee engine, loader);
TypeScript on Node 22 (cold path — `edge-api/admin` delivery config, `edge-api/shop` product weight);
React 19 (customer-web Next 16 SSR + back-office Vite SPA); Kotlin Multiplatform + Compose
(customer-mobile).

**Primary Dependencies**: Go — Gin, pgx/v5, existing `platform/{money,metrics,logger,customeridentity,
db}`; a small Haversine helper for admin-side ring suggestion (no external geo service). TS —
`@effy/edge-shared` (pg `query`, handler helpers, S3-none), `@effy/shared-types`, `@effy/web-kit`
(`ConsoleShell` + `DataTable`), `@effy/design-system/ui`. Mobile — `mobile-kit`, existing Amplify/Ktor
spine. **No locked-technology swap; no ORM; no third-party geocoding/routing dependency.**

**Storage**: PostgreSQL 16, `public` schema, raw SQL, Goose **forward-only** migration. New tables:
`locality`, `delivery_ring`, `delivery_zone`, `delivery_zone_postcode`, `delivery_fee_plan`,
`delivery_ring_price`, `delivery_weight_band`, `shop_sameday_exception`, `delivery_collection_run`,
`delivery_settings`, `order_package_delivery`; altered: `product` (+weight), `"order"` (+delivery
capture), `shop_fulfillment` (+delivery columns). Audit reuses `admin.audit_log`.

**Testing**: Go `go test` incl. a pure-engine table test (no DB) and container-backed repo/serviceability
tests gated by `-short` (the `storefront` precedent); Vitest for the two edge domains incl. a
config-contract test reading the real `serverless.yml`; Kotlin `commonTest` (Android + iOS) for mobile;
a Go↔Kotlin **wire-contract** test for the quote/serviceability shapes (the 028/029 precedent);
Playwright for the storefront serviceability + checkout path.

**Target Platform**: `core-api` on Fargate (dev-deployed as 040) + local `make core-run`; two edge
services on Lambda (arm64) behind the shared HTTP API; customer-web (public SSR) + back-office (internal
SPA); iOS + Android for customer-mobile.

**Performance Goals**: serviceability and locality typeahead answer instantly (public, cacheable, fired
while typing); the checkout quote adds **one wave-parallel** read block, not N serial round trips (the
029 lesson — 8 serial Sydney-RDS queries once 503'd the storefront); the fee engine is pure in-memory
arithmetic.

**Constraints**: customer-web guest bundle gate is **174 KB** — serviceability/method UI reuses the
existing address affordance and the checkout island, adding no heavy dependency (the 030 R7 discipline).
GST-inclusive fees; the exact snapped-up fee shown before payment and charged unchanged (no drip);
distance never appears in any shopper-facing DTO (the 032 R7 rule); **no PII** (no postcode/address) in
logs or telemetry beyond the auth subject id (025/030 R13). Same-day cutoff evaluated in
**Australia/Melbourne** wall-clock, never UTC or device clock.

**Project Type**: Web + mobile + API, hot **and** cold path — the platform's widest single feature,
spanning three clients, two edge domains, the hot path, an operator loader, and one migration.

**Scale/Scope**: ~15k locality rows (VIC-first served zones, whole-of-AU loaded); a handful of rings; a
few fee plans; per-shop×zone exceptions in the low thousands at most. This is large by nature (it
consolidates four withdrawn slices) — see **Build sequencing** below; `/speckit-tasks` will order it,
with **US1 as a shippable MVP** (serviceability + standard fee, no same-day).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Spec-Driven Development** ✅ — spec.md written and validated first; three scope decisions resolved
  with the operator before this plan; this plan cites the spec. The one planning discovery (shop
  location not required) is reconciled **back into the spec** (Principle I), not patched silently.
- **II. Monorepo with Shared Contracts** ✅ — all DTOs in `@effy/shared-types`; the customer-facing
  serviceability/locality/quote shapes are generated to Kotlin and pinned by a Go↔Kotlin wire-contract
  test. The fee **engine has exactly one home** (Go `platform/delivery`); the admin console validates but
  never recomputes a fee, so there is no cross-surface duplication of pricing logic.
- **III. Dual-Path Backend Discipline** ✅ — justified split:
  - *Serviceability, locality typeahead, delivery quote* → **hot path** (`core-api`). Public,
    guest-reachable, latency-sensitive customer reads fired while typing and a transaction-time quote —
    the hot path's definition, and commerce under the 011 routing law. Reintroduces where 025/030/032 put
    the same work.
  - *Back-office delivery configuration* → **cold path** (`edge-api/admin`). Low-frequency operator CRUD;
    the doctrine's internal console, mirroring 009/031/032.
  - *Product weight entry* → **cold path** (`edge-api/shop`), the existing products domain.
  - *Reference-data load* → an operator **Go command**, not a request path (the `create-first-admin`
    precedent) — `core-api` must not mutate data on boot.
- **IV. Auth Isolation** ✅ — serviceability + locality reads are **public** (no authorizer), like 025/030;
  the quote runs under the **customer** authorizer (access token) inside checkout; back-office config uses
  the **back-office** authorizer with RBAC from `admin.staff` (read = any active staff incl. csa; mutate =
  admin/manager); product weight uses the **shop** authorizer with the existing shop gate. No token
  crosses pools; no brokering.
- **V. Native-Feel, Consistent Design** ✅ — monochrome design system throughout. **No card layouts**: the
  console is inherently tabular — a zones list/detail, a rings list, a fee-plan editor (sectioned page:
  ring-price rows, weight-slab rows, factor/rounding/floor/cap fields), and a same-day eligibility list
  with a per-shop exception sub-list; the storefront reuses the address affordance and checkout's
  sectioned summary. Reference platforms: eBay/Uber Eats **shipping-settings and delivery-options**
  patterns, adapted to single-brand hidden fulfilment. Mobile native (Material/HIG), fat-finger targets.
- **VI. Layered Architecture & Explicit Wiring** ✅ — three-layer slices (handler → service → repository)
  with raw SQL and explicit row→domain mapping; the fee engine is a **pure** file with no I/O (the 032
  `promo.go` precedent); mobile is MVVM (ViewModel → immutable UI state); web treats the server-state
  cache as source of truth; no DI framework; dependencies wired at each entry point.
- **VII. Observability & Telemetry** ✅ — declared in Phase 1: a **serviceability** counter labelled
  `serviced` only (never postcode — 025 precedent); a **quote** counter by outcome (offered
  same_day+standard / standard_only / unserviced) and method chosen; every config change attributed via
  `admin.audit_log`; one alarm on **quote failure** (a served zone that fails to price — the invariant
  that must never fire). Product events (`delivery_serviceability_checked`, `delivery_method_selected`).
  **No PII** (no postcode/address) in telemetry — labels stay low-cardinality. ⚠ Carry-forward: PostHog
  is still not initialised on customer-web (039) — web events are wired but a no-op until then; mobile
  telemetry remains deferred (recorded, not hidden).
- **Real-World Identifiers** ✅ — no new outward identifier (no email/phone/domain/endpoint). Effy's
  operating-**hub coordinates** and the collection times are operational config the operator supplies;
  they are not inferred from session/env. The G-NAF attribution string is a **licence requirement** on the
  committed dataset (recorded in `db/reference/README.md`), not a person's identifier.

**Result**: PASS. No violations → Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/047-delivery-shipping-engine/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── delivery-customer-api.contract.md   # hot-path: serviceability, localities, quote (+ Kotlin wire)
│   ├── delivery-admin-api.contract.md       # cold-path: zones, rings, plans, eligibility, schedule
│   └── fee-engine.contract.md               # the pure engine: inputs, formula, invariants
└── checklists/
    └── requirements.md  # from /speckit-specify
```

### Source Code (repository root)

```text
db/
├── migrations/
│   └── <ts>_delivery_shipping_engine.sql     # all new tables + product/order/fulfillment alters
└── reference/
    ├── au-localities.csv                      # G-NAF-derived (postcode,locality,state,lat,lng,addr_count)
    └── README.md                              # provenance + CC BY 4.0 / Open-G-NAF attribution

packages/shared-types/src/
├── delivery.ts                                # serviceability + locality + quote DTOs (WireInt for cents)
└── delivery-admin.ts                          # zone/ring/plan/eligibility/schedule admin DTOs + enums

apis/core-api/
├── cmd/load-localities/                       # operator loader (idempotent upsert), like create-first-admin
└── internal/
    ├── platform/delivery/                     # THE engine + reads (pure engine has no I/O)
    │   ├── engine.go        engine_test.go     # fee(method,ring,weightSlab) → snap up, floor, cap
    │   ├── zone.go                             # postcode → zone → ring, sameday-eligibility resolution
    │   └── plan.go                             # active-plan load + coverage validation
    └── features/
        ├── storefront/                         # + serviceability.go, localities.go (public reads)
        └── checkout/                           # + delivery quote/options, capture into intent+finalize

apis/edge-api/admin/src/
├── delivery/     authz.ts · repository.ts · service.ts · suggest.ts (Haversine) · types.ts ·
│                 service.test.ts · repository.container.test.ts · config.contract.test.ts
└── functions/    zones-* · rings-* · plans-* · plan-activate · sameday-eligibility-* ·
                  sameday-exception-* · collection-run-* · settings-*  (v1 handlers)

apis/edge-api/shop/src/products/                # + weight (measured/assumed) on create/update

apps/customer-web/app/                          # serviceability in the delivery affordance; method +
                                                # fee in checkout summary (reuse existing islands)
apps/back-office/src/features/delivery/         # zones, rings, plans, eligibility, schedule console
apps/shop-web/src/features/catalog/             # product weight entry (measured/assumed) — US5
apps/customer-mobile/.../features/delivery/     # serviceability + method choice (Clean-Arch/MVVM)
```

**Structure Decision**: Web + mobile + API across **both** backend paths. The hot path gains a pure
engine package and extends `storefront`/`checkout`; the cold path gains one admin `delivery/` domain and
extends shop `products/`; three clients consume shared DTOs. This mirrors the withdrawn design's file
homes so the reintroduction is legible, while collapsing its four slices into one coherent capability.

## Build sequencing (advisory; `/speckit-tasks` will order it)

This feature is large by nature. The natural, independently-shippable order — each a real MVP:

1. **Reference data + zones + serviceability** (US1a) — loader, `locality`, `delivery_zone(_postcode)`,
   the serviceability read + locality typeahead. Effy can say where it delivers. *No fee yet.*
2. **Rings + fee plan + standard quote** (US1b) — `delivery_ring`, `delivery_fee_plan` (+ ring prices,
   weight bands, factors), the pure engine, product weight, and the checkout **standard** quote +
   capture. Effy charges a sound, snapped-up, GST-inclusive fee. **US1 MVP complete.**
3. **Same-day eligibility + collection schedule** (US2) — zone `sameday_eligible`, `delivery_settings`
   (hub + buffer), `delivery_collection_run`, the derived-cutoff logic, and the same-day quote branch.
4. **Per-shop exceptions** (US3) — `shop_sameday_exception`, per-package resolution.
5. **Multiple fee plans** (US4) — the plan register + activation gate (already modelled; this is the
   console + activation UX and the quoted-fee-immutability proof).
6. **Product weight console polish** (US5) — shop-web measured/assumed entry + the assumed-weight report.

The **data model and the serviceability rule (FR-001) are designed once, here**, so the slices cannot
fragment the customer contract — the failure that withdrew the last attempt.

## Complexity Tracking

No constitution violations. Table intentionally empty.

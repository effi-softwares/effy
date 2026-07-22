# Implementation Plan: Delivery Zones & Pricing

**Branch**: `021-delivery-zones-pricing` | **Date**: 2026-07-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/021-delivery-zones-pricing/spec.md`

---

## Summary

Replace Effy's single flat $5 delivery fee (`pricing.DeliveryFeeCents = 500`) with **per-shop split
delivery**: a multi-shop cart becomes one anonymous package per shop, each priced and timed from that
shop's location to the customer's address, each with its own real ready-by. The customer places **one
order, pays once**, and sees an anonymised breakdown; back-office manages zones, shop locations, and the
rate grid; and 020's per-portion queue gains genuinely independent promises with a one-line seam swap.

**Technical approach** — six moving parts, each extending a proven pattern rather than inventing one:

1. **One forward-only migration** — `delivery_zone` + `delivery_zone_postcode` + `delivery_offering`
   (the rate grid), `shop.postcode` (shops gain a location), `order_package_delivery` (the captured
   quote), delivery columns on `shop_fulfillment`, and `order.delivery_quote_expires_at`.
2. **Hot path (core-api)** — a new `POST /v1/checkout/quote` and an extended `/intent` that group cart
   lines by shop, resolve zones by postcode, price each package from the offering table, and capture the
   quote; 019's `FinalizeSucceeded` transaction gains a JOIN so `shop_fulfillment` lands with its delivery
   columns atomically. `pricing.DeliveryFeeCents` is deleted.
3. **Cold path (edge-api/admin)** — a new `delivery/` slice cloning 009's `shops/`: zone/postcode/offering
   CRUD + set-shop-location, audited via `admin.audit_log`.
4. **Both customer surfaces** — a package-aware cart (opaque package key per line) and a new
   delivery-options step in checkout (before payment): serviceability, per-package methods, default
   preference + per-package override, auto-exclude + confirm.
5. **Back-office** — a `delivery/` feature cloning 009's `shops/` (DataTable + dialogs, no cards).
6. **020 seam swap** — one file: read the real `shop_fulfillment.promised_ready_at` when present.

---

## Technical Context

**Language/Version**: Go 1.25 (hot path) · TypeScript 5.9 / Node 22 (cold path + web) · Kotlin 2.4.0 +
Compose Multiplatform 1.11.1 (mobile) · React 19 (web) · PostgreSQL 16 SQL.

**Primary Dependencies**: **No new runtime dependencies.** Hot path — `platform/{money,pricing}`, pgx,
Stripe (unchanged). Cold path — `@effy/edge-shared` (`query`, `withTransaction`, the `guard` pattern),
`pg`. Web — TanStack Query/Router, `@effy/design-system/ui`, `@effy/web-kit/console` (`DataTable`). Mobile
— Ktor, generated `CommerceDto.kt`.

**Storage**: PostgreSQL 16, `public` schema (config + operational), `admin.audit_log` (reused). Raw SQL,
Goose forward-only. One migration.

**Testing**: `go test` (quote pricing, zone resolution, the extended finalize) · Vitest (edge-admin
SQL-shape + handler; customer-web) · Vitest + RTL (back-office) · Kotlin `commonTest`.

**Target Platform**: core-api (local Docker) · AWS Lambda arm64 behind the shared gateway (admin) ·
modern browsers · Android + iOS.

**Performance Goals**: the quote is a customer-critical read — a few indexed lookups (postcode→zone,
offering by zone-pair) per package, no external calls; same latency class as 019's intent.

**Constraints**: server-authoritative per-package fees, **never** client-supplied (FR-007, SC-004);
atomic multi-package finalize (FR-012a); quote honored within a validity window (FR-011); **no** shop
identity/location or carrier on any customer or shop surface (FR-019/FR-020, SC-006/007); customer-web
guest bundle already at 167.3 KB — 021 code must stay out of `/` and `/browse`.

**Scale/Scope**: dev — 2 shops, a handful of zones, a small rate grid. Net-new: 1 migration, ~2 hot-path
endpoints, ~10 cold-path endpoints, 2 customer checkout steps × 2 surfaces, 1 back-office feature.

---

## Path Assignment (Principle III — mandatory declaration)

> **Path: `core-api` (hot) — rule 1** for the customer quote, serviceability, and extended intent
> (customer critical path; the paid transaction; the customer stares at delivery options while they load).
>
> **Path: `edge-api` (cold), service `admin` — rule 2** for zone / offering / shop-location management
> (internal back-office CRUD, latency-tolerant), mirroring 009.

Both paths **read/write the same `public` config tables** — the hot path reads zones/offerings at quote
time; the cold path writes them from back-office. This is a shared database, **not** cross-path proxying
(the doctrine forbids one path *calling* another, which does not happen here). Recorded per
[docs/api/path-assignment.md](../../docs/api/path-assignment.md); full evidence in
[research.md](./research.md) R1.

---

## Constitution Check

*GATE: evaluated before Phase 0 and re-evaluated after Phase 1 design.*

| Principle | Status | Evidence |
|---|---|---|
| **I. Spec-Driven** | ✅ PASS | spec (31 FR / 16 SC / 10 clarifications, 0 markers) → this plan → tasks next. |
| **II. Monorepo & Shared Contracts** | ✅ PASS | Customer DTOs single-sourced in `shared-types/src/{cart,checkout,order}.ts`, regenerated to `CommerceDto.kt`; management DTOs in a new `src/delivery.ts`. No hand-defined mobile types (R10). |
| **III. Dual-Path Discipline** | ✅ PASS | Declared above with rule numbers. Quote → hot; management → cold. Shared DB, no proxying. |
| **IV. Auth Isolation** | ✅ PASS | Quote/intent on the customer pool (existing `customeridentity`); management on the back-office pool reusing 009's `isActiveStaff` / admin-manager gates. No cross-pool acceptance. |
| **V. Native-Feel, Consistent Design** | ✅ PASS | **No cards** — back-office uses `DataTable` + sectioned pages + `<dl>` rows (021 does **not** inherit 009's detail-card; research R9). Checkout delivery step is a list of packages with radio method options. Both customer surfaces at parity (FR-021). |
| **VI. Layered Architecture** | ✅ PASS | Hot: handler → service → store (raw SQL) + a pure `platform/delivery` package. Cold: `functions/` → `service` → `repository`, cloning 009. Mobile MVVM. Web server-state cache. No DI framework. |
| **VII. Observability & Telemetry** | ✅ PASS | Declared below. |

**Result: PASS — no violations, no exceptions claimed. Complexity Tracking empty.**

### Telemetry declaration (Principle VII)

- **Product events (PostHog)**: customer — `delivery_options_viewed`, `delivery_method_selected` (method
  only), `delivery_address_unserviceable`, `delivery_items_excluded`; back-office —
  `delivery_zone_created`, `delivery_offering_changed`, `shop_location_set`. **No PII, and no postcode**
  (a postcode is location PII) — subject id only.
- **Metrics**: per-Lambda `Errors` alarms on the new admin functions; the quote endpoint's latency rides
  core-api's existing RED middleware.
- **Structured logs**: `scope.log` with the subject on authz failures — never a postcode or address.
- **Mobile telemetry** remains deferred (013/014/015/020 pattern) — recorded, not skipped.

---

## Project Structure

### Documentation (this feature)

```text
specs/021-delivery-zones-pricing/
├── plan.md · spec.md · research.md · data-model.md · quickstart.md
├── contracts/delivery-api.contract.md
└── checklists/requirements.md
```

### Source Code (repository root)

```text
db/migrations/
└── <ts>_delivery_zones_pricing.sql                 # NEW — zones, offerings, shop.postcode,
                                                     #       order_package_delivery, shop_fulfillment cols

apis/core-api/internal/                              # HOT PATH
├── platform/pricing/pricing.go                      # MODIFIED — delete DeliveryFeeCents; add QuoteValidity
├── platform/delivery/delivery.go (+_test.go)        # NEW — zone resolve + package pricing (pure, DB-free)
└── features/checkout/
    ├── quote.go (+_test.go)                          # NEW — POST /v1/checkout/quote (group by shop, price)
    ├── service.go / store.go                         # MODIFIED — per-package computeAmounts; intent writes
    │                                                  #   order_package_delivery; FinalizeSucceeded JOINs it
    └── handler.go                                    # MODIFIED — /quote route; extended /intent body

apis/edge-api/admin/src/                             # COLD PATH (clone of shops/)
├── delivery/{types,repository,service,authz,handler-support}.ts + *.test.ts   # NEW
└── functions/…                                       # NEW — zones/postcodes/offerings/shop-location + audit
serverless.yml                                       # MODIFIED — new functions + Errors alarms

packages/shared-types/src/
├── delivery.ts                                       # NEW — management DTOs (reuse PagedDTO, AuditEntryDTO)
├── cart.ts / checkout.ts / order.ts                  # MODIFIED — packageKey, quote, extended intent, receipt
└── contract/CommerceDto.kt                           # REGENERATED (drift-guarded)

apps/customer-web/
├── lib/cart-store.ts / cart-totals.ts                # MODIFIED — packageKey; drop flat fee
├── app/(shop)/cart/page.tsx                          # MODIFIED — per-package sections
├── app/(shop)/_components/AddToCartControl.tsx       # MODIFIED — capture packageKey
├── app/checkout/CheckoutFlow.tsx                     # MODIFIED — new delivery-options step + serviceability
├── app/checkout/DeliveryOptions.tsx                  # NEW
└── app/api/checkout/{quote,intent}/route.ts          # NEW quote proxy / MODIFIED intent proxy

apps/customer-mobile/shared/src/commonMain/.../features/
├── cart/domain/{GuestCart,CartTotals}.kt             # MODIFIED — packageKey; drop flat fee
├── cart/presentation/CartScreen.kt                   # MODIFIED — per-package sections
└── checkout/{domain,data,presentation}/…             # MODIFIED — quote step, selections, serviceability

apps/back-office/src/features/delivery/…              # NEW (clone of features/shops/): zones + rates + location
apps/back-office/src/{routes/delivery.tsx,router.tsx,components/layout/nav.ts}   # MODIFIED

apis/edge-api/shop/src/fulfillments/promise.ts  (020) # ONE-FILE SEAM SWAP — read promised_ready_at
docs/audiences/customer-capabilities.md               # MODIFIED — §021
```

**Structure Decision**: no new organising idea. The hot-path work extends 019's checkout feature and adds
one pure `platform/delivery` package (zone resolution + pricing, unit-testable without a DB). The cold-path
and back-office halves are structural clones of 009's `shops/` slice. The customer surfaces extend the
existing two-step checkout with one step and make the existing cart package-aware. 020 is touched in
exactly one file.

---

## Design Notes (Phase 1 outcomes)

**The quote is captured, then consumed — not recomputed at finalize** (R3). `order_package_delivery` holds
the per-package selection from intent time; 019's `FinalizeSucceeded` transaction JOINs it into
`shop_fulfillment` atomically (FR-012a). This is the single most important structural choice — it exists
because `shop_fulfillment` rows don't exist until the webhook fires.

**The fee is never client-supplied.** The quote endpoint captures server-computed fees; intent honors them
within the validity window and re-resolves on expiry; the request carries selections (method + optional
date), never a price (SC-004). `excludedPackageKeys` must match the server's serviceability verdict or
intent 409s (R8).

**Package identity is opaque.** The cart line's `packageKey` is a stable, meaningless token grouping a
shop's items — never the shop UUID, name, or location (R5, SC-006). Hidden fulfilment holds: the split
shows, the shop never does.

**020 needs one line.** Its `promise.ts` seam reads the real `promised_ready_at` when present; everything
else in 020's queue/detail already renders the promise (R11).

**Bundle discipline** (customer-web): the guest gate is already breached at 167.3 KB (pre-existing, not
021's). 021's delivery-options and package-aware-cart code lives in the checkout/cart route trees, not
reachable from `/` or `/browse`, so it does not touch the measured guest pages.

---

## Complexity Tracking

**No violations.** No principle is deviated from, no new dependency is introduced. Two things worth naming
that are *not* deviations:

| Apparent concern | Why it is not a deviation |
|---|---|
| Adding `packageKey` to a cart line 019 kept shop-free | An **opaque** grouping token, not shop identity — hidden fulfilment holds (R5). The no-split alternative was rejected in `/speckit-clarify` Q4. |
| Touching 019's `FinalizeSucceeded` (the money path) | An **extension of an existing transaction** (a JOIN in the fan-out), not a new finalization path — the atomic guarantee already lives there (R3, FR-012a). |

The standing **mobile-telemetry deferral** (Principle VII) is inherited and declared above.

> ⚠ **Carried, not a plan defect — the pre-existing customer-web bundle breach (167.3 KB / 160 KB).**
> Documented in 020; byte-identical with 020/021 reverted. Needs its own investigation; 021 must not
> worsen it (design note above), but does not own the fix.

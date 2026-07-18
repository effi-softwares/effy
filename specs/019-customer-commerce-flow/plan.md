# Implementation Plan: Customer Commerce Flow (Browse → Cart → Checkout → Order)

**Branch**: `019-customer-commerce-flow` | **Date**: 2026-07-18 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/019-customer-commerce-flow/spec.md`

## Summary

Turn Effy's two customer surfaces (Next.js 16 storefront `apps/customer-web`, KMP app `apps/customer-mobile`)
from a foundation-only shell into a **complete, shoppable store**: a merchandised Home, rich product
pages, search with filters + infinite scroll, a hybrid cart, a Stripe checkout, a receipt, and a
multi-shop order fan-out. The commerce backend is **net-new on the Go hot path** (`apis/core-api`),
which today has only two proving endpoints — this slice is the first to read the existing `public.product`
catalog for customers and to introduce `cart`, `order`, `payment`, `address`, `favorite`, and the
`event_outbox` fan-out schema. Payment is **Stripe in test mode**: the secret key lives only in core-api,
clients hold the publishable key and confirm with a `client_secret`, and the **webhook is the authoritative
order finalizer**. A single placed order **fans out** into one `shop_fulfillment` record per involved shop
(items grouped by `product.shop_id`) and a durable `order.placed` outbox event — surfacing those orders
inside the shop apps is a later slice (per the clarification).

Built in **priority-ordered phases** mirroring the spec's user stories, each independently demoable:
discovery (P1) → product + add-to-cart (P1) → cart + checkout + payment + receipt + fan-out (P1) →
search (P2) → order history (P2) → favorites/recently-viewed (P3).

## Technical Context

**Language/Version**: Go 1.25 (hot path); TypeScript / React 19 on Next.js 16.2.x (web); Kotlin 2.4.0 +
Compose Multiplatform 1.11.1 (mobile). PostgreSQL 16 (raw SQL, Goose forward-only).

**Primary Dependencies**:
- **core-api**: Gin, pgx/v5, `github.com/stripe/stripe-go/v82`, `aws-sdk-go-v2` (`config` + new `service/s3`
  + `feature/s3/s3-request-presigner`; Cognito verifier already wired), `caarlos0/env/v11`.
- **customer-web**: `@stripe/stripe-js` + `@stripe/react-stripe-js` (Payment Element), the TanStack suite
  (Query/Store), shadcn/ui via `@effy/design-system/ui`, `@effy/{api-client,shared-types}`.
- **customer-mobile**: Ktor client (new `coreClient`), `com.stripe:stripe-android` (PaymentSheet) on
  androidMain, `stripe-ios` `StripePaymentSheet` via a Swift bridge on iosMain, `packages/mobile-kit`
  (`TabBackStacks`/`AppNavKey` adopted for the deeper commerce stacks), generated Compose tokens.

**Storage**: PostgreSQL 16 `public` schema. Reuses `public.{product,product_media,category,shop,customer}`
(read); adds `customer_address`, `cart`, `cart_item`, `order`, `order_item`, `shop_fulfillment`,
`payment`, `stripe_event`, `event_outbox` (+ `customer_favorite`). Product media in the existing private
S3 bucket, served via presigned GET. See [data-model.md](data-model.md).

**Testing**: core-api — Go table-driven `service_test.go`/`handler_test.go` (httptest) + testcontainers
`repository_test.go` (gated `-short`), plus a Stripe `PaymentGateway` fake. customer-web — Vitest (mappers,
cart math, `next`/URL logic) + Playwright E2E on a production build (SSR/SEO, checkout with a Stripe test
card, deferred-sign-in, idempotent re-submit). customer-mobile — `commonTest` units (cart totals, DTO↔domain
mappers, price-change detection).

**Target Platform**: Public web (SSR + PPR, guest-first) at :3000; Android (minSdk 24) + iOS 15+; hot-path
Go in local Docker (Fargate go-live is a separate slice — the base address is config, so no code changes when
it moves).

**Project Type**: Multi-surface (two customer clients at parity + one hot-path backend + DB migrations).

**Performance Goals**: search results < 1s p95 on representative data (SC-004, served by the existing
`pg_trgm` GIN index); Home first paint renders ≥ 90% of visible cards without layout shift (SC-002);
checkout → receipt < 3 min / ≤ 5 steps (SC-003).

**Constraints**: Commerce MUST run on the hot path (FR-028). The Stripe **secret** key MUST never leave
core-api; clients hold only the publishable key. Webhook is authoritative (client result is UX-only). No
customer card data in any log/store/analytics; no PII beyond the auth subject id (SC-012). Public web
discovery pages stay cacheable/crawlable — facets are query params, personalization streams inside
`<Suspense>` (Cache Components). Cross-pool tokens structurally rejected. Money handled as `numeric(12,2)`
AUD server-side, converted to integer minor units only at the Stripe boundary.

**Scale/Scope**: Solo/small-team dev environment; catalog in the hundreds–thousands of products; single
platform currency (AUD). ~10 new customer screens per surface; ~7 new core-api feature slices; 1 migration.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Spec-Driven Development** — ✅ `spec.md` written, `/clarify` run (4 decisions recorded), this plan
  cites the constitution; `tasks.md` follows. No code precedes the committed artifacts.
- **II. Monorepo with Shared Contracts** — ✅ All new wire shapes are authored **once** in
  `@effy/shared-types` (`storefront.ts`, `cart.ts`, `order.ts`, `checkout.ts`, `address.ts`, `favorite.ts`)
  and consumed by customer-web directly + regenerated to Kotlin for customer-mobile via a
  `customer-commerce-contract.ts`. core-api's Go wire structs are hand-authored **to the same documented
  contract** (`contracts/`) — Go cannot import TS, which is the established platform reality (every prior
  backend slice does this); the contract file is the single source and a mapping test guards drift.
  *No per-surface redefinition of domain shapes.*
- **III. Dual-Path Backend Discipline** — ✅ Justified: **all** customer commerce (catalog reads, search,
  cart, order, checkout, payment) is latency-sensitive customer traffic → **hot path** (`core-api`, Go), per
  the binding FR-028 routing law. Catalog *authoring* stays on the cold path (016) and is untouched; both
  read the same Postgres. Customer profile/account stays cold path. No low-frequency admin CRUD is placed
  on the hot path.
- **IV. Auth Isolation** — ✅ Customer pool only; core-api's customer `PoolVerifier` is already wired and
  pins the issuer. New commerce routes sit under a customer-scoped group. **One documented exception**: the
  Stripe **webhook** route carries **no pool authorizer** — it verifies a provider signature instead
  (constant-time HMAC + timestamp tolerance). This is exactly the async-webhook shape ARCHITECTURE.md
  sanctions ("a webhook … with no authorizer — it verifies a provider signature instead"); it is not
  cross-pool auth. The platform `customer.status` record remains authoritative (a barred customer is refused).
- **V. Native-Feel, Consistent Design** — ✅ with **one recorded justification** (see Complexity Tracking):
  discovery/search use **product cards/tiles**, which the no-card doctrine permits when a card is
  demonstrably the right pattern — it is the industry-standard commerce tile (eBay/Uber Eats), and no better
  layout exists for a scannable product grid/rail. The product **detail** page stays **sectioned/tabbed with
  detail rows, no metric cards, no top-of-page summary cards**. All color/spacing/typography comes from the
  design-system SSOT (web `@effy/design-system`, mobile generated Compose tokens); dark mode + appearance
  switching already present. Reference platforms: eBay + Uber Eats, food-first.
- **VI. Layered Architecture & Explicit Wiring** — ✅ core-api adds feature-sliced packages (handler →
  service → repository, raw SQL, Stripe/S3 behind domain **port interfaces** in the data layer, wired by hand
  in `main.go`). Mobile adds `features/<name>/{data,domain,presentation}` with `ViewModel → UseCase →
  Repository/Driver`, the Stripe `PaymentDriver` as a `commonMain` native-capability interface (the
  ARCHITECTURE.md "payments" driver), all wired in `AppContainer`. Web keeps server-state cache as truth +
  a client store for the guest cart only. No DI framework anywhere.
- **VII. Observability & Telemetry** — ◑ Partial, consistent with prior slices. **In scope**: core-api
  `/metrics` gains per-feature business counters (catalog reads, cart writes, orders placed, payment
  outcomes) with low-cardinality labels; customer-web emits the PostHog catalog→cart→checkout funnel + routes
  runtime errors to PostHog; **no PII / no card data** anywhere. **Deferred (documented, matches 013/014)**:
  mobile PostHog analytics + Crashlytics remain deferred to the mobile-telemetry slice; the shared event
  **taxonomy names** are still defined here so mobile can adopt them later. Push notifications for order
  updates are out of scope (later notifications slice).

**Technology Standards** — ✅ No locked technology is swapped. New libraries (`stripe-go`, `@stripe/*`,
`stripe-android/ios`, aws `service/s3`) are feature libraries within the standards; no ORM is introduced
(raw SQL throughout); Goose forward-only migration.

**Gate result: PASS** (one justified Principle V card exception; one sanctioned Principle IV webhook
exception; Principle VII partial per the established mobile-telemetry deferral). Recorded in Complexity
Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/019-customer-commerce-flow/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions (Stripe, outbox, presign, cart, nav)
├── data-model.md        # Phase 1 — new tables + DTO surface
├── quickstart.md        # Phase 1 — end-to-end validation guide (incl. Stripe test flow)
├── contracts/           # Phase 1 — core-api commerce API contract + DTO contract
│   ├── core-commerce-api.md
│   └── shared-dtos.md
└── tasks.md             # Phase 2 — /speckit-tasks (NOT created here)
```

### Source Code (repository root)

```text
apis/core-api/                                   # HOT PATH — the commerce backend (net-new)
├── cmd/core-api/main.go                         # wire new features + Stripe/S3 clients + webhook route
└── internal/
    ├── platform/
    │   ├── config/config.go                     # + Stripe{SecretKey,WebhookSecret}, AWS.MediaBucket
    │   ├── media/                               # S3 presign-GET helper (asset URL resolver)
    │   └── events/                              # transactional outbox writer (shared envelope)
    └── features/
        ├── storefront/                          # public reads: home rails, product list/detail, categories
        ├── cart/                                # customer: server cart + merge
        ├── addresses/                           # customer: delivery addresses CRUD
        ├── checkout/                            # customer: create-intent, confirm, + Stripe webhook
        ├── orders/                              # customer: order list + detail (receipt)
        └── favorites/                           # customer: favorites list/add/remove
                                                 #   payment gateway behind a PaymentGateway port

db/migrations/
└── <ts>_customer_commerce.sql                   # cart, order, order_item, shop_fulfillment, payment,
                                                 #   stripe_event, customer_address, customer_favorite,
                                                 #   event_outbox  (forward-only, public schema)

packages/shared-types/src/
├── storefront.ts  cart.ts  order.ts  checkout.ts  address.ts  favorite.ts   # NEW DTO SSOT
└── customer-commerce-contract.ts                # KMP codegen entry → generated Kotlin for mobile

apps/customer-web/                               # Next.js 16 storefront
├── app/(shop)/{page.tsx, product/[id]/, search/, cart/, checkout/, checkout/complete/}
├── app/(account)/{orders/, addresses/, favorites/}
├── lib/{config.ts(+stripeConfig), api/core.ts, cart-store.ts, stripe.ts}
└── e2e/                                         # Playwright: checkout, deferred-signin, idempotency

apps/customer-mobile/shared/src/commonMain/.../
├── core/{http(+coreClient), payment/PaymentDriver.kt, nav(adopt mobile-kit TabBackStacks)}
├── features/{catalog, cart, checkout, orders, favorites}/{data,domain,presentation}
└── app/{AppContainer.kt(+ commerce wiring), CustomerShell.kt(real Home/Search/Orders tabs)}
    # androidApp: AndroidPaymentDriver (stripe-android PaymentSheet)
    # iosApp/iosApp/SwiftPaymentBridge.swift (StripePaymentSheet) + IosPaymentDriver
```

**Structure Decision**: Multi-surface slice. The backend is organized as feature-sliced Go packages under
`apis/core-api/internal/features/` (handler → service → repository, ports for Stripe/S3), matching
ARCHITECTURE.md's hot-path layout. Both clients follow their established internal shapes (Next App-Router
route groups + `lib/` service layer; KMP Clean-Architecture feature folders + one manual `AppContainer`).
Shared DTOs live once in `@effy/shared-types` and drive web + mobile; core-api mirrors them from the
documented contract. One forward-only migration adds the commerce schema to `public`.

## Complexity Tracking

| Violation / Exception | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **Product cards/tiles in discovery & search** (Principle V no-card doctrine) | A scannable grid/rail of products is the industry-standard commerce pattern on both reference platforms (eBay tiles, Uber Eats cards); it is genuinely the right pattern for at-a-glance product scanning | A table/list of products for a visual grocery/food storefront is worse UX and off-reference; the doctrine explicitly allows a card where it is demonstrably right. **Product detail** still avoids cards (sectioned/tabbed detail rows), so the doctrine's core target (metric/summary/dashboard cards) is honored. |
| **Stripe webhook route with no pool authorizer** (Principle IV) | Stripe calls it server-to-server with no Cognito token; it authenticates by verifying the Stripe signature (HMAC + timestamp) | A pool authorizer is impossible for an external provider callback; ARCHITECTURE.md explicitly sanctions the signature-verified no-authorizer webhook shape. It is not cross-pool auth. |
| **Mobile telemetry deferred** (Principle VII partial) | Matches the established 013/014 deferral to the mobile-telemetry slice; keeps this already-large slice focused | Building mobile PostHog + Crashlytics now expands scope without unblocking the flow; the taxonomy names are defined here so adoption is later a wiring task, not a redesign. |
| **Large single feature (both surfaces + backend + payments)** | The user explicitly asked for the *complete* end-to-end flow in one spec; the surfaces must stay at parity | Splitting into many specs fragments the parity contract; instead the plan is **phased by user-story priority** (P1→P3), each phase independently demoable, so `/tasks` + `/implement` can land it incrementally and the operator may commit per phase. |

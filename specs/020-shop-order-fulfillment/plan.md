# Implementation Plan: Shop Order Fulfillment (Receive → Pick → Handoff)

**Branch**: `020-shop-order-fulfillment` | **Date**: 2026-07-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/020-shop-order-fulfillment/spec.md`

---

## Summary

019 made Effy sell; nothing makes it fulfil. Every paid order already writes one `shop_fulfillment`
portion per involved shop, and **no code path has ever changed that row's status off `pending`**. This
slice builds the consumer: an order queue, a pick screen, and a state machine, at parity on both shop
surfaces, ending at `ready_for_pickup`.

**Technical approach** — five moving parts, all following patterns already proven in this repo:

1. **A new `fulfillments/` domain slice in `apis/edge-api/shop`** (cold path — see Path Assignment
   below), reusing the existing role-agnostic `gate()` → `{sub, shopId}` so a shop's scope is
   structurally un-supplyable by a client.
2. **One forward-only migration** widening `shop_fulfillment.status`'s CHECK to the five-state machine
   and adding two tables: `fulfillment_item` (pick progress + shortfall) and `fulfillment_event`
   (append-only audit).
3. **Shop-side DTOs in `@effy/shared-types`**, added to the existing `ShopContract` aggregator and
   generated to Kotlin via the existing `shop-contract:gen` pipeline.
4. **Both shop surfaces**: a `fulfillment` feature slice in `apps/shop-web` (new Orders nav item, table
   + sectioned detail) and an `orders` feature slice in `apps/shop-mobile` replacing the
   `FoundationPlaceholderScreen` at `ShopShell.kt:121-124`.
5. **A small additive change to `apis/core-api/internal/features/orders`** (hot path) so the customer's
   existing anonymous fulfilment summary carries the richer status and a terminal-gated shortfall.

---

## Technical Context

**Language/Version**: TypeScript 5.9 / Node 22 (cold path) · Go 1.25 (hot path, minor edit) ·
Kotlin 2.4.0 + Compose Multiplatform 1.11.1 (mobile) · React 19 + TypeScript (web) · PostgreSQL 16 SQL

**Primary Dependencies**: **No new runtime dependencies on any surface.** Cold path — `@effy/edge-shared`
(`query`, `withTransaction`, `preamble`, `problem`), `pg` 8.22. Web — TanStack Query/Router,
`@effy/design-system/ui`, `@effy/web-kit/console` (`DataTable`, `ConsoleShell`). Mobile — Ktor,
kotlinx.serialization, `packages/mobile-kit`, Compose Material 3.

**Storage**: PostgreSQL 16, `public` schema, raw SQL, Goose forward-only. One migration:
1 `ALTER` + 2 new tables. `admin` schema untouched.

**Testing**: Vitest (edge shop — `vi.hoisted` + `vi.mock` at the `@effy/edge-shared` db seam for SQL-shape
assertions; service-module mocks for handlers) · Vitest + RTL (shop-web, mocked at the `repo.ts`
boundary) · Kotlin `commonTest` with `runTest`/`runCurrent()` and **hand-written fakes, no mocking
library** · `go test` (core-api orders).

**Target Platform**: AWS Lambda arm64 behind the shared HTTP API (`/shop/v1/*`) · modern browsers ·
Android + iOS, **tablet landscape primary**.

**Project Type**: Multi-surface vertical slice — cold-path backend + two client surfaces + one
additive hot-path edit + one migration.

**Performance Goals**: Order visible in queue **≤30s** from payment (SC-001) via ~15s interval refetch.
Queue read is a single indexed query on `shop_fulfillment (shop_id)`. Transitions are single-statement.

**Constraints**: A shop sees **only** its own lines and **never** payment details (FR-007/008, SC-007) —
enforced by never accepting a shop identifier as input (R11). Concurrency-safe transitions with no
double-apply (FR-014, SC-005). Queue position stable (SC-018). Customer sees **zero** shop identity
(FR-018, SC-009). No delivery-execution modelling anywhere (FR-002a, SC-021).

**Scale/Scope**: Dev-scale — 2 shops, tens of orders. ~24 existing Lambda functions in the shop service;
this adds ~6. Two net-new client feature slices.

---

## Path Assignment (Principle III — mandatory declaration)

> **Path: `edge-api` — rule 2** (latency-tolerant internal operator surface).
> **Service: `shop`** — the shop audience/domain, on the existing shop-pool authorizer.
>
> **Plus, for the customer half only: Path `core-api` — rule 1** (customer-facing commerce read, already
> resident there; 019 FR-028).

⚠ **This inverts the spec's own speculation** that *"live order intake is time-sensitive, which argues
for the hot path"*. Full evidence in [research.md](./research.md) R1; the decisive points:

- **`core-api` has no cloud deployment at all** — local-Docker only, no ECS/Fargate/ECR in `infra/`, no
  CI pipeline, reachable off-localhost only via an ngrok tunnel. **A shop queue placed there could never
  go live**, while the shop pool's authorizer and all 24 existing shop endpoints already run on the
  deployed shared gateway.
- **[docs/api/path-assignment.md](../../docs/api/path-assignment.md) names this exact case**: the shop
  service is *"an internal operator console, latency-tolerant and low-frequency, cold starts
  acceptable"*, and its worked examples include a near-identical *refund review queue → edge-api*.
- **The latency claim does not survive the numbers**: SC-001 budgets 30 seconds; a cold start is ~1s.
- **The alternative costs real rework**: `PoolVerifier.clientID` is a scalar while the shop pool has
  *two* clients (web + mobile), so shop-mobile could not even authenticate without changing it.

**This is the operator's own rule working as stated** (2026-07-20): *"if you think one feature customer
side should use core api and shop side should use edge api, nothing to worry."* One capability —
fulfilment status — serves two audiences from two paths, each chosen on its merits. Neither path proxies
the other; no endpoint is split.

**Recorded revisit trigger**: reconsider only if 021 introduces tight same-day windows **and** interval
refresh proves inadequate **and** core-api gains a deployment. None holds today.

---

## Constitution Check

*GATE: evaluated before Phase 0 and re-evaluated after Phase 1 design.*

| Principle | Status | Evidence |
|---|---|---|
| **I. Spec-Driven** | ✅ PASS | `spec.md` (50 FR / 21 SC / 9 clarifications, 0 markers) → this plan → `tasks.md` next. No code before artifacts. |
| **II. Monorepo & Shared Contracts** | ✅ PASS | Fulfilment DTOs defined **once** in `@effy/shared-types`, added to the existing `ShopContract` aggregator, generated to Kotlin by the existing `shop-contract:gen` + diff-guarded by `shop-contract:check`. No hand-redefined types per surface (FR-021). |
| **III. Dual-Path Discipline** | ✅ PASS | Declared above with rule number and rationale, per the mandatory format. Shop → edge/shop (rule 2); customer read stays core-api (rule 1). |
| **IV. Auth Isolation** | ✅ PASS | Shop-pool JWT authorizer by id from SSM; no cross-pool acceptance; no auth proxy. Authorization decided from the **platform record** (`shop_staff` + `shop`), never from `cognito:groups`. **Deliberately role-agnostic** per FR-019a — reuses `authorizeShopMember`, not the manager gate. |
| **V. Native-Feel, Consistent Design** | ✅ PASS | **No card layouts** — web uses `DataTable` + `<dl>` detail rows (the in-repo `ProductDetailScreen` precedent); mobile uses a list and an ≥840dp two-pane split. Reference platform (Uber Eats merchant) deliberately **overruled**, justification in research R9. Dark mode + tokens inherited from `@effy/design-system`. Tablet-first per FR-023. |
| **VI. Layered Architecture** | ✅ PASS | Cold path: `functions/` (thin edge) → `service.ts` → `repository.ts` (raw SQL, no ORM). Mobile: domain → data → presentation with MVVM (`MutableStateFlow` + immutable `UiState`). Web: server-state cache is the source of truth (TanStack Query); no hand-cached server data. No DI framework — module-scope singletons (cold), `AppContainer` `by lazy` (mobile). |
| **VII. Observability & Telemetry** | ✅ PASS | Declared below — required by this principle for any user-facing flow. |

**Result: PASS — no violations, no exceptions claimed. Complexity Tracking is empty.**

### Telemetry declaration (Principle VII)

- **Product events (PostHog, typed taxonomy)**: `shop_order_queue_viewed`, `shop_order_opened`,
  `shop_order_state_changed` (from/to), `shop_order_item_gathered`, `shop_order_item_unavailable`,
  `shop_order_reversed`. **No PII beyond the authenticated subject id**; no customer name, address, or
  order contents in any property. Mobile telemetry remains **deferred** (the standing 013/014/015
  Principle VII deviation owned by the `mobile-telemetry` slice) — recorded, not silently skipped.
- **Metrics**: per-function Lambda `Errors` + `Duration` p95 CloudWatch alarms, matching the shape every
  existing shop function already ships (`Errors`: Sum/300s/threshold 0; `Duration`: p95/300s/3 periods/
  5000ms on the queue-list function).
- **Structured logs**: `scope.log` child logger carrying `awsRequestId` + gateway `requestId` via
  `preamble()`. Log the `sub` on authz failures — **never** the operator's email (the established
  `shop-me-v1-get.ts` discipline).
- **Alert**: queue-list function error rate > 0 over 5 minutes — a blind shop is an unfulfilled order.

---

## Project Structure

### Documentation (this feature)

```text
specs/020-shop-order-fulfillment/
├── plan.md                        # This file
├── spec.md                        # 50 FR · 21 SC · 9 clarifications
├── research.md                    # Phase 0 — R1…R11
├── data-model.md                  # Phase 1 — migration + entities + state machine
├── quickstart.md                  # Phase 1 — validation runbook
├── contracts/
│   └── fulfillment-api.contract.md
├── checklists/requirements.md
├── NEXT-021-delivery-zones.md     # captured scope handoff
└── tasks.md                       # /speckit-tasks — NOT created here
```

### Source Code (repository root)

```text
db/migrations/
└── <ts>_shop_order_fulfillment.sql          # NEW — ALTER status CHECK + 2 tables

apis/edge-api/shop/                          # ← the slice's backend home (cold path)
├── serverless.yml                           # MODIFIED — +6 functions, +alarms
└── src/
    ├── fulfillments/                        # NEW domain slice
    │   ├── types.ts                         # domain types + FulfillmentError
    │   ├── repository.ts                    # raw SQL, all shop-scoped
    │   ├── service.ts                       # state machine rules, no HTTP/SQL
    │   ├── promise.ts                       # the DeliveryPromise seam (R7 / 021)
    │   ├── repository.test.ts               # SQL-shape + guarded-UPDATE assertions
    │   └── service.test.ts                  # transition legality, concurrency no-op
    └── functions/                           # NEW — one file per route
        ├── fulfillments-list-v1-get.ts      # GET    /shop/v1/fulfillments
        ├── fulfillment-get-v1-get.ts        # GET    /shop/v1/fulfillments/{id}
        ├── fulfillment-status-v1-post.ts    # POST   /shop/v1/fulfillments/{id}/status
        ├── fulfillment-item-v1-patch.ts     # PATCH  /shop/v1/fulfillments/{id}/items/{itemId}
        ├── fulfillment-pickup-v1-post.ts    # POST   /shop/v1/fulfillments/{id}/pickup  ⚠ DEV-ONLY
        └── fulfillments.test.ts

apis/core-api/internal/features/orders/      # MODIFIED (hot path, additive only)
└── orders.go                                # richer status + terminal-gated shortfall projection

packages/shared-types/
├── src/
│   ├── shop-order.ts                        # NEW — shop-side fulfilment DTOs
│   └── shop-contract.ts                     # MODIFIED — aggregator gains the new DTOs
└── contract-shop/ShopDto.kt                 # REGENERATED (diff-guarded)

apps/shop-web/src/
├── components/layout/nav.ts                 # MODIFIED — + Orders nav item (no requiredRole)
├── router.tsx                               # MODIFIED — + 2 routes into routeTree
├── routes/
│   ├── orders.tsx                           # NEW
│   └── orders.$fulfillmentId.tsx            # NEW
└── features/fulfillment/                    # NEW slice (model → repo → queries → screens)
    ├── model.ts  repo.ts  queries.ts
    ├── OrderQueueScreen.tsx  OrderDetailScreen.tsx
    ├── components/{FulfillmentStatusBadge,PickList,StateControl,PromiseCell}.tsx
    └── *.test.ts(x)

apps/shop-mobile/shared/src/
├── commonMain/kotlin/com/effyshopping/shop/mobile/
│   ├── app/AppContainer.kt                  # MODIFIED — wire repo + use cases
│   ├── core/nav/ShopRoutes.kt               # MODIFIED — + OrderDetail route + shopNavJson
│   ├── features/shop/presentation/ShopShell.kt  # MODIFIED — replace the Orders placeholder
│   └── features/orders/                     # NEW slice
│       ├── domain/{OrderModels,OrderRepository,OrderUseCases}.kt
│       ├── data/{HttpOrderRepository,OrderMappers}.kt
│       └── presentation/{OrdersViewModel,OrdersScreen}.kt
└── commonTest/kotlin/.../features/orders/
    ├── FakeOrderRepository.kt
    └── presentation/OrdersViewModelTest.kt

docs/audiences/shop-capabilities.md          # MODIFIED — §020 parity rows (FR-022)
```

**Structure Decision**: This follows the established per-surface conventions exactly rather than
introducing any new organising idea. The backend adds a **domain slice** beside `staff/`, `status/`,
`products/`, `sections/` with the same four-file shape, and one `functions/` file per route. Both
clients add a **feature slice** in their surface's idiom — `model → repo → queries → screens` on web,
`domain → data → presentation` on mobile. The shop-mobile route, tab, icons, and serializer
registration **already exist**; only the placeholder body is replaced.

---

## Design Notes (Phase 1 outcomes)

**Authorization reuses `authorizeShopMember`, not the manager gate.** `products/authz.ts` already
resolves `sub → shopId` for *any* active member of an active shop and returns `null` as a uniform deny.
That is precisely FR-019a (both `shop_manager` and `shop_staff` have full fulfilment access). The
`gate()` helper in `products/handler-support.ts` returns `{sub, shopId} | {deny}` and is reused verbatim
— so authorization and shop-scope resolution stay one round trip, and the shop id is never client input.

**Transitions are guarded single statements.** `UPDATE … WHERE id=$1 AND shop_id=$2 AND status=$expected`
— zero rows means another operator already applied it, surfaced as a benign no-op (FR-014, SC-005). This
is 019's proven payment-finalizer idiom, not a new mechanism.

**Polling is new to this codebase.** A sweep found **zero** `refetchInterval`/`setInterval`/`WebSocket`
usage across all of `apps/` and `packages/` — refresh today is entirely mutation-driven invalidation.
This slice therefore *establishes* the pattern, which is why cadence (~15s), background-pause, and the
pay-per-request cost consequence are pinned in research R8 rather than improvised per surface.

**409 needs care on web.** `@effy/api-client` maps 409 to `DomainErrorKind "unknown"`, so conflicts must
be detected by `err.status === 409` (the existing `catalog/errorText.ts` `isConflict` helper).

**Kotlin codegen quirks** (from the existing generated `ShopDto.kt`): every TS `number` becomes Kotlin
`Double` (mappers narrow with `.toInt()`), and trailing-`Id` fields are renamed to `ID` with a
`@SerialName`. New nav routes **must** be registered in `shopNavJson` or iOS state restore fails
silently.

---

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified.

**No violations.** No principle is deviated from, no exception is claimed, and no new dependency is
introduced on any surface. Two things that *look* like deviations are not:

| Apparent deviation | Why it is not one |
|---|---|
| The dev-only pickup stub (FR-030…034) writes order state with a caller-supplied driver id | It is spec'd as scaffolding with a removal trigger, is **disabled by default and structurally unable to exist in a deployed environment**, and SC-013 requires proving that by *attempting to enable it*. Not shipped capability. |
| Overruling the reference platform (Uber Eats merchant uses cards) | Principle V's prohibition is followed, not excepted — a table is the better pattern for dense queue scanning, and no card justification is claimed (research R9). |

The standing **mobile telemetry deferral** (Principle VII) is inherited from 013/014/015 and owned by
the `mobile-telemetry` slice; it is declared in the telemetry section above rather than silently
skipped.

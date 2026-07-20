# Tasks: Shop Order Fulfillment (Receive → Pick → Handoff)

**Feature**: 020-shop-order-fulfillment · **Date**: 2026-07-20
**Inputs**: [plan.md](./plan.md) · [spec.md](./spec.md) · [research.md](./research.md) ·
[data-model.md](./data-model.md) · [contracts/](./contracts/) · [quickstart.md](./quickstart.md)

## Format: `[ID] [P?] [Story] Description`

- **[P]** — parallelizable (different file, no dependency on an incomplete task)
- **[US#]** — the user story this task serves (user-story phases only)
- **🧑‍💻** — OPERATOR-RUN. Claude authors; the operator executes anything touching AWS, the DB, or live
  state (per CLAUDE.md's mode of work). Claude MUST NOT run these.

## Path Conventions

- Cold path (this slice's backend home): `apis/edge-api/shop/src/`
- Hot path (customer half only): `apis/core-api/internal/features/orders/`
- Web console: `apps/shop-web/src/`
- Mobile: `apps/shop-mobile/shared/src/commonMain/kotlin/com/effyshopping/shop/mobile/`
- Contracts: `packages/shared-types/`
- Migrations: `db/migrations/`

**Tests are included** — not as strict TDD, but alongside implementation, matching every prior slice in
this repo and the constitution's Quality Gate (*"ships verified against its spec's acceptance criteria"*).

---

## Phase 1: Setup (Shared Contracts)

**Purpose**: Establish the single source of truth for fulfilment types before any surface consumes them
(Principle II, FR-021).

- [ ] T001 [P] Define shop-side fulfilment DTOs (`FulfillmentSummaryDTO`, `FulfillmentDetailDTO`, `FulfillmentItemDTO`, `DeliveryPromiseDTO`, `FulfillmentStatus`, `TransitionRequest`, `ItemProgressRequest`) per [contracts/fulfillment-api.contract.md](./contracts/fulfillment-api.contract.md) in `packages/shared-types/src/shop-order.ts`
- [ ] T002 Add every new DTO as a field on the `ShopContract` aggregator interface in `packages/shared-types/src/shop-contract.ts` (a type not named here silently never reaches Kotlin)
- [ ] T003 Re-export `./shop-order` from the barrel in `packages/shared-types/src/index.ts`
- [ ] T004 [P] Extend the customer-side `OrderFulfillmentDTO` with an optional `unavailableItems` array in `packages/shared-types/src/order.ts` (US5; keep it anonymised — no shop field)
- [ ] T005 Regenerate the Kotlin contract: `pnpm --filter @effy/shared-types shop-contract:gen` → `packages/shared-types/contract-shop/ShopDto.kt`
- [ ] T006 Verify the drift guard is clean: `pnpm --filter @effy/shared-types shop-contract:check` (any diff means generated Kotlin was hand-edited — a Principle II violation)

**Checkpoint**: Contracts exist and generate deterministically. No surface code yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠ Every user story below depends on this phase. Nothing in Phase 3+ can start until it completes.**

### Data layer

- [ ] T007 Author the forward-only migration `db/migrations/<timestamp>_shop_order_fulfillment.sql` per [data-model.md](./data-model.md): drop + re-add `shop_fulfillment_status_check` widened to the five states, add `shop_fulfillment.state_changed_at`, create `public.fulfillment_item` (with the `gathered + unavailable <= ordered` CHECK and the `(shop_fulfillment_id, order_item_id)` UNIQUE), create `public.fulfillment_event` (append-only, `actor_staff_id` nullable `ON DELETE SET NULL`), and both indexes. Scaffold with `make db-new name=shop_order_fulfillment`
- [ ] T008 🧑‍💻 Commit the migration, then apply it: `make db-up ENV=dev` (the 003 commit-guard blocks an uncommitted migration). Verify with `\d public.fulfillment_item` and the `pg_get_constraintdef` check in [quickstart.md](./quickstart.md) §2

### Backend domain slice

- [ ] T009 [P] Define domain types and `FulfillmentError` (`validation | conflict | not_found`, mirroring `products/types.ts`) in `apis/edge-api/shop/src/fulfillments/types.ts`
- [ ] T010 [P] Implement the `DeliveryPromise` seam (derive `readyBy` from `placedAt` + platform default; the single point 021 repoints, research R7) in `apis/edge-api/shop/src/fulfillments/promise.ts`
- [ ] T011 Implement the repository with raw parameterized SQL — every query bound to the gate-resolved `shopId`, never client input — in `apis/edge-api/shop/src/fulfillments/repository.ts`
- [ ] T012 Implement the service (state-machine legality, no HTTP, no SQL) in `apis/edge-api/shop/src/fulfillments/service.ts`
- [ ] T013 [P] Add handler support — re-export `gate` from `../products/handler-support`, plus `mapFulfillmentError` and domain→DTO mappers — in `apis/edge-api/shop/src/fulfillments/handler-support.ts`
- [ ] T014 [P] Write SQL-shape tests asserting shop-scoping and guarded-UPDATE structure (mock the `@effy/edge-shared` db seam via `importOriginal` spread) in `apis/edge-api/shop/src/fulfillments/repository.test.ts`
- [ ] T015 [P] Write state-machine legality tests (every illegal transition rejected; `collected` immutable) in `apis/edge-api/shop/src/fulfillments/service.test.ts`

**Checkpoint**: Schema applied, domain slice compiles and is unit-tested. User stories can now proceed.

---

## Phase 3: User Story 1 — A shop sees its incoming orders (P1) 🎯 MVP

**Goal**: A paid order appears in the owning shop's queue within 30s, on both surfaces, scoped to that
shop alone.

**Independent test**: With a paid two-shop order, open Orders on each surface as each shop; confirm each
sees its own order with reference/arrival/count/state, never the other's; confirm a new order surfaces
without manual reload; confirm the empty state.

### Backend

- [ ] T016 [US1] Add the queue query — shop-scoped, `state=active|completed` filter, `ORDER BY o.placed_at ASC, sf.id ASC` with the documented 021 seam comment (FR-001, SC-020) — to `apis/edge-api/shop/src/fulfillments/repository.ts`
- [ ] T017 [US1] Add `listQueue(shopId, state)` including promise derivation and the `atRisk` computation (FR-001a) to `apis/edge-api/shop/src/fulfillments/service.ts`
- [ ] T018 [US1] Implement `GET /shop/v1/fulfillments` (preamble → gate → service → DTO → json) in `apis/edge-api/shop/src/functions/fulfillments-list-v1-get.ts`
- [ ] T019 [US1] Register the `fulfillmentsListV1` function with the shop JWT authorizer by SSM id, plus its `Errors` and `Duration` p95 alarms, in `apis/edge-api/shop/serverless.yml`
- [ ] T020 [P] [US1] Write handler tests — 401 without subject, uniform 403 on deny, 503 fail-closed, and only-own-shop rows — in `apis/edge-api/shop/src/functions/fulfillments.test.ts`

### Web (shop-web)

- [ ] T021 [P] [US1] Define domain types and DTO→domain mapping in `apps/shop-web/src/features/fulfillment/model.ts`
- [ ] T022 [US1] Implement `listFulfillments` against `/shop/v1/fulfillments` in `apps/shop-web/src/features/fulfillment/repo.ts`
- [ ] T023 [US1] Define `fulfillmentQueueQuery` with `refetchInterval: 15_000` and `refetchIntervalInBackground: false` (research R8 — the monorepo's first polling) in `apps/shop-web/src/features/fulfillment/queries.ts`
- [ ] T024 [P] [US1] Build `FulfillmentStatusBadge` using the `Record<Status, variant>` lookup pattern with `success|warning|muted` variants in `apps/shop-web/src/features/fulfillment/components/FulfillmentStatusBadge.tsx`
- [ ] T025 [P] [US1] Build `PromiseCell` rendering service level + ready-by with in-place at-risk emphasis (never reordering, SC-018) in `apps/shop-web/src/features/fulfillment/components/PromiseCell.tsx`
- [ ] T026 [US1] Build `OrderQueueScreen` — `DataTable` columns (reference, arrival, promise, item count, state), `emptyMessage`, `ErrorState` + retry, loading — **no cards** (Principle V) — in `apps/shop-web/src/features/fulfillment/OrderQueueScreen.tsx`
- [ ] T027 [US1] Add `ordersRoute` in `apps/shop-web/src/routes/orders.tsx` and register it in the `routeTree` in `apps/shop-web/src/router.tsx`
- [ ] T028 [US1] Add the Orders nav item **with no `requiredRole`** (both shop roles have access, FR-019a) in `apps/shop-web/src/components/layout/nav.ts`
- [ ] T029 [P] [US1] Write queue screen tests (mock at the `./repo` boundary with `vi.hoisted`; assert empty/error/loading and row contents) in `apps/shop-web/src/features/fulfillment/OrderQueueScreen.test.tsx`

### Mobile (shop-mobile)

- [ ] T030 [P] [US1] Define domain models in `features/orders/domain/OrderModels.kt`
- [ ] T031 [US1] Define the `OrderRepository` interface with per-method KDoc naming each endpoint in `features/orders/domain/OrderRepository.kt`
- [ ] T032 [US1] Define `ListFulfillments` use case (`operator fun invoke`) in `features/orders/domain/OrderUseCases.kt`
- [ ] T033 [US1] Implement `HttpOrderRepository` with the shared `request { }` failure-mapping idiom in `features/orders/data/HttpOrderRepository.kt`
- [ ] T034 [US1] Write DTO→domain mappers, narrowing generated `Double` fields to `Int` (codegen quirk), in `features/orders/data/OrderMappers.kt`
- [ ] T035 [US1] Implement `OrdersViewModel` — `MutableStateFlow` + immutable `OrdersUiState`, `runCatching{}.fold`, injected `CoroutineScope` test seam, and a 15s refresh loop that stops when the screen leaves composition — in `features/orders/presentation/OrdersViewModel.kt`
- [ ] T036 [US1] Build `OrdersRoute` + stateless `OrdersScreen` (list, empty, error/retry) in `features/orders/presentation/OrdersScreen.kt`
- [ ] T037 [US1] Replace `OrdersRoot -> FoundationPlaceholderScreen(...)` with `OrdersRoute(...)` at `features/shop/presentation/ShopShell.kt:121-124`
- [ ] T038 [US1] Wire the private repository and public use cases (`by lazy`) into `app/AppContainer.kt`
- [ ] T039 [P] [US1] Add a hand-written `FakeOrderRepository` (recording last args, no mocking library) and `OrdersViewModelTest` using `runTest`/`runCurrent()` in `commonTest/.../features/orders/`

**Checkpoint**: US1 is independently demonstrable — the queue works end to end on both surfaces. **This
is the MVP.**

---

## Phase 4: User Story 2 — A shop opens an order and picks it (P1)

**Goal**: The operator sees exactly their own lines with quantities and delivery context, tracks picking
progress durably, and can flag items unavailable.

**Independent test**: Open a two-shop order from each shop; confirm each sees only its own lines, no
payment data, and the delivery context; part-pick, leave, return, and confirm progress persisted; flag
an item unavailable and un-flag it.

### Backend

- [ ] T040 [US2] Add the detail query (portion + **only this shop's** `order_item` rows + delivery snapshot; **no payment columns, no order total** — FR-007/008) to `apis/edge-api/shop/src/fulfillments/repository.ts`
- [ ] T041 [US2] Add the guarded implicit `pending → received` transition on first open (FR-011a), the `fulfillment_item` upsert, and the transactional `fulfillment_event` insert (via `withTransaction`) to `apis/edge-api/shop/src/fulfillments/repository.ts`
- [ ] T042 [US2] Add `getDetail` (with implicit acknowledge) and `updateItemProgress` (absolute quantities, `gathered + unavailable <= ordered`, `picking`-only) to `apis/edge-api/shop/src/fulfillments/service.ts`
- [ ] T043 [US2] Implement `GET /shop/v1/fulfillments/{id}` in `apis/edge-api/shop/src/functions/fulfillment-get-v1-get.ts`
- [ ] T044 [US2] Implement `PATCH /shop/v1/fulfillments/{id}/items/{orderItemId}` in `apis/edge-api/shop/src/functions/fulfillment-item-v1-patch.ts`
- [ ] T045 [US2] Register both functions + alarms in `apis/edge-api/shop/serverless.yml`
- [ ] T046 [P] [US2] Write tests proving cross-shop access returns **403 not 404** (SC-007, so portions cannot be enumerated), that no payment field appears in any response body, and that over-accounting is rejected, in `apis/edge-api/shop/src/functions/fulfillments.test.ts`

### Web

- [ ] T047 [US2] Add `getFulfillment` + `updateItemProgress` to `repo.ts` and their `queryOptions`/mutation with invalidation to `queries.ts` in `apps/shop-web/src/features/fulfillment/`
- [ ] T048 [US2] Build `PickList` — per-line gathered/unavailable controls with an un-flag affordance (FR-010d) — in `apps/shop-web/src/features/fulfillment/components/PickList.tsx`
- [ ] T049 [US2] Build `OrderDetailScreen` using `<dl>` detail rows and sections, **never cards** (follow the `ProductDetailScreen` precedent), in `apps/shop-web/src/features/fulfillment/OrderDetailScreen.tsx`
- [ ] T050 [US2] Add `ordersDetailRoute` reading `fulfillmentId` at the route boundary in `apps/shop-web/src/routes/orders.$fulfillmentId.tsx` and register it in `apps/shop-web/src/router.tsx`
- [ ] T051 [P] [US2] Write detail + pick-list tests in `apps/shop-web/src/features/fulfillment/OrderDetailScreen.test.tsx`

### Mobile

- [ ] T052 [US2] Add detail + item-progress methods to `OrderRepository`, `HttpOrderRepository`, `OrderMappers`, and new use cases in `features/orders/`
- [ ] T053 [US2] Add `@Serializable data class OrderDetail(val id: String) : AppNavKey` to `core/nav/ShopRoutes.kt` **and register it in `shopNavJson`** (unregistered routes fail iOS state restore silently)
- [ ] T054 [US2] Extend `OrdersUiState` and `OrdersViewModel` with detail load + item-progress actions in `features/orders/presentation/OrdersViewModel.kt`
- [ ] T055 [US2] Add the detail pane and the `BoxWithConstraints` `maxWidth >= 840.dp` two-pane split (mirroring `CatalogScreen`), tablet-first per FR-023, in `features/orders/presentation/OrdersScreen.kt`
- [ ] T056 [P] [US2] Extend `FakeOrderRepository` and add detail/pick tests in `commonTest/.../features/orders/presentation/OrdersViewModelTest.kt`

**Checkpoint**: US1 + US2 deliver a usable pick workflow.

---

## Phase 5: User Story 3 — A shop moves an order through to handoff (P1)

**Goal**: Deliberate, durable, concurrency-safe transitions ending at `ready_for_pickup`, with the one
permitted reversal — the state that has never existed until now.

**Independent test**: Advance an order to ready on one surface, see it on the other and as a second
operator; tap advance simultaneously from two devices and confirm exactly one transition; reverse a
premature completion and re-complete it; confirm `shop_fulfillment.status` has left `pending`.

### Backend

- [ ] T057 [US3] Add guarded transition SQL — `UPDATE … WHERE id=$1 AND shop_id=$2 AND status=$from` — covering `received→picking`, `picking→ready_for_pickup`, and the single reversal `ready_for_pickup→picking`, each writing `state_changed_at` and a `fulfillment_event` row in one transaction, to `apis/edge-api/shop/src/fulfillments/repository.ts`
- [ ] T058 [US3] Add `transition()` to `service.ts` with the no-op semantics from the contract: 0 rows + already in target state → 200 with current portion; 0 rows + other state → 409; `collected` → always 409 (FR-011f)
- [ ] T059 [US3] Create `fulfillment_item` rows for every line on entry to `picking`, in the same transaction, in `apis/edge-api/shop/src/fulfillments/repository.ts`
- [ ] T060 [US3] Implement `POST /shop/v1/fulfillments/{id}/status` in `apis/edge-api/shop/src/functions/fulfillment-status-v1-post.ts`
- [ ] T061 [US3] Register the function + alarms in `apis/edge-api/shop/serverless.yml`
- [ ] T062 [P] [US3] Write concurrency and legality tests — simultaneous transition yields exactly one apply (SC-005), every illegal transition 409s (SC-015), reversal is audited and attributed (SC-016), completing with shortfalls succeeds (SC-012) — in `apis/edge-api/shop/src/fulfillments/service.test.ts`

### Web

- [ ] T063 [US3] Build `StateControl` (deliberate advance action, reversal affordance, no duplicate action once applied) in `apps/shop-web/src/features/fulfillment/components/StateControl.tsx`
- [ ] T064 [US3] Add the transition mutation with queue + detail invalidation, treating `err.status === 409` as a conflict (409 maps to `DomainErrorKind "unknown"` — use the `isConflict` idiom) in `apps/shop-web/src/features/fulfillment/queries.ts`
- [ ] T065 [P] [US3] Write transition tests including the 409 stale-state path in `apps/shop-web/src/features/fulfillment/StateControl.test.tsx`

### Mobile

- [ ] T066 [US3] Add transition use cases and repository methods in `features/orders/domain/OrderUseCases.kt` and `features/orders/data/HttpOrderRepository.kt`
- [ ] T067 [US3] Add transition actions + conflict handling to `features/orders/presentation/OrdersViewModel.kt`
- [ ] T068 [US3] Add fat-finger-friendly transition controls (Principle V) to `features/orders/presentation/OrdersScreen.kt`
- [ ] T069 [P] [US3] Add transition + conflict tests in `commonTest/.../features/orders/presentation/OrdersViewModelTest.kt`

**Checkpoint**: The fulfilment loop is closed. `shop_fulfillment.status` finally moves. All three P1
stories complete.

---

## Phase 6: User Story 4 — A shop reviews what it has fulfilled (P2)

**Goal**: Completed orders leave the active queue and remain openable in a shop-scoped completed view.

**Independent test**: Complete an order; confirm it leaves the active queue, appears in the completed
view for that shop only, and still opens in full detail.

- [ ] T070 [US4] Verify/extend the `state=completed` branch of the queue query and add its test in `apis/edge-api/shop/src/fulfillments/repository.ts` + `repository.test.ts`
- [ ] T071 [US4] Add active/completed switching to the queue screen and its query key in `apps/shop-web/src/features/fulfillment/OrderQueueScreen.tsx` + `queries.ts`
- [ ] T072 [US4] Add the same switch to `features/orders/presentation/OrdersScreen.kt` and `OrdersViewModel.kt`
- [ ] T073 [P] [US4] Add completed-view tests on both surfaces

---

## Phase 7: User Story 5 — The customer sees progress (P2)

**Goal**: The customer's existing anonymous fulfilment summary carries real states and terminal-gated
shortfalls, with zero shop identity.

**⚠ Hot path (`core-api`) — the only phase outside the cold path.** Fully independent of Phases 3–6 and
parallelizable with them.

**Independent test**: Place a two-shop order, advance one portion; confirm the customer view reflects
progress, names no shop, hides mid-pick flags, and discloses shortfalls only once terminal.

- [ ] T074 [P] [US5] Extend the `Fulfillment` domain struct and its DTO mapping with `unavailableItems` in `apis/core-api/internal/features/orders/orders.go`
- [ ] T075 [US5] Add the shortfall projection joined from `fulfillment_item`, **gated on `sf.status IN ('ready_for_pickup','collected')`** (FR-018b, SC-017), keeping shop identity out of the projection entirely, in `apis/core-api/internal/features/orders/orders.go`
- [ ] T076 [P] [US5] Write Go tests asserting mid-pick flags are absent, terminal shortfalls present, and **no shop field** in any projection, in `apis/core-api/internal/features/orders/orders_test.go`
- [ ] T077 [P] [US5] Render fulfilment progress and terminal shortfalls (no refund promise, FR-018a) on the customer order detail page in `apps/customer-web/app/(account)/orders/[id]/page.tsx`
- [ ] T078 [P] [US5] Add customer-web tests for the progress and shortfall rendering

---

## Phase 8: User Story 3a — The pickup stub (P3, TEMPORARY SCAFFOLD)

**Goal**: Make the lifecycle exercisable past `ready_for_pickup` before a driver surface exists.

**⚠ Security-critical.** This endpoint accepts a caller-supplied driver identity. If it were ever
reachable in a deployed environment it would be an **order-state forgery primitive** — anyone could mark
any shop's order collected. It must be *absent*, not merely refusing.

**Independent test**: With the stub enabled locally, collect a ready portion and confirm the placeholder
marking; confirm a non-ready portion is refused; confirm the route does not exist when disabled.

- [ ] T079 [US3a] Add the guarded `ready_for_pickup → collected` transition storing `driverRef` **marked as placeholder data** (FR-033, SC-014) in `apis/edge-api/shop/src/fulfillments/repository.ts` and `service.ts`
- [ ] T080 [US3a] Implement `POST /shop/v1/fulfillments/{id}/pickup` in `apis/edge-api/shop/src/functions/fulfillment-pickup-v1-post.ts`
- [ ] T081 [US3a] Register the function **conditionally so it is structurally absent unless the deploy stage is local/dev** — not a runtime flag, not a header, not an env var read per request (FR-031) — in `apis/edge-api/shop/serverless.yml`
- [ ] T082 [US3a] Add a code comment recording the **removal trigger**: deleted when the driver slice ships a real dispatch path; must not accrete capability (FR-034)
- [ ] T083 [P] [US3a] Write tests: non-ready portion → 409, collected portion immutable, `driverRef` stored as placeholder, in `apis/edge-api/shop/src/fulfillments/service.test.ts`

---

## Phase 9: Polish & Cross-Cutting Concerns

- [ ] T084 [P] Add the PostHog event taxonomy (`shop_order_queue_viewed`, `shop_order_opened`, `shop_order_state_changed`, `shop_order_item_gathered`, `shop_order_item_unavailable`, `shop_order_reversed`) with **no PII beyond the subject id** in `apps/shop-web/src/lib/telemetry.ts` and document it in `docs/telemetry/`
- [ ] T085 [P] Confirm every new Lambda has `Errors` alarms and the queue-list function has a `Duration` p95 alarm in `apis/edge-api/shop/serverless.yml`
- [ ] T086 [P] Add §020 rows to **both** shop columns (web + mobile) in `docs/audiences/shop-capabilities.md` (FR-022), and confirm the standing mobile-telemetry deferral is still recorded as a deviation
- [ ] T087 Run the full verification sweep from [quickstart.md](./quickstart.md) §1: `pnpm -r typecheck`, `pnpm --filter @effy/edge-shop test`, `pnpm --filter @effy/shop-web test`, `shop-contract:check`, `go build ./... && go vet ./... && go test ./...`, `./gradlew :shared:allTests`, `turbo build`
- [ ] T088 🧑‍💻 Deploy the cold path: `make edge-deploy SERVICE=shop ENV=dev`
- [ ] T089 🧑‍💻 **Prove the pickup stub is ABSENT in dev** per [quickstart.md](./quickstart.md) §3 — expect **404**, not 403 and not 200. A 403 means the route exists in a deployed environment and is a **failure** (SC-013)
- [ ] T090 🧑‍💻 Run one real two-shop checkout to create live fulfilment data (`make core-run` + `stripe listen` + test-card) — **blocking prerequisite** for SC-001/SC-002; 019's carry-forward means no order has ever existed
- [ ] T091 🧑‍💻 Run the adversarial isolation proof from [quickstart.md](./quickstart.md) §4 — cross-shop read returns 403 not 404, and grep both response bodies for payment/shop/driver leakage (SC-002, SC-007)
- [ ] T092 🧑‍💻 Walk the full SC-001…SC-021 table in [quickstart.md](./quickstart.md) §4 on **both** surfaces (SC-010); record SC-019 as not-yet-provable by design (needs 021)
- [ ] T093 🧑‍💻 Commit spec, plan, research, data-model, contracts, quickstart, tasks **alongside** the code (Quality Gates: no feature merges without all three artifacts)

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup: contracts)
   └─▶ Phase 2 (Foundational: migration + domain slice)   ⚠ BLOCKS EVERYTHING
          ├─▶ Phase 3 (US1 queue)         🎯 MVP
          │      └─▶ Phase 4 (US2 detail/pick)
          │             └─▶ Phase 5 (US3 transitions)
          │                    ├─▶ Phase 6 (US4 completed view)
          │                    └─▶ Phase 8 (US3a pickup stub — needs ready_for_pickup)
          └─▶ Phase 7 (US5 customer) ────── independent, hot path, fully parallel
   Phase 9 (Polish) ── after all of the above
```

### User Story Dependencies

- **US1** — depends only on Foundational. Independently shippable. **The MVP.**
- **US2** — depends on US1's backend slice and web/mobile scaffolding (routes, container wiring).
- **US3** — depends on US2 (`picking` must exist before `ready_for_pickup` is meaningful).
- **US4** — depends on US3 (nothing is "completed" until a terminal state exists).
- **US5** — depends only on Foundational (the migration's richer states). **Parallel with US1–US4.**
- **US3a** — depends on US3 (`ready_for_pickup` is its only legal source state).

### Within Each User Story

Backend (repository → service → function → serverless registration) precedes the surfaces, because both
clients consume its contract. Web and mobile are then **fully parallel with each other** — different
files, different toolchains, no shared state.

### Parallel Opportunities

- **T001 ∥ T004** — shop-side and customer-side DTOs are different files.
- **T009 ∥ T010 ∥ T013** — types, promise seam, handler support are independent.
- **T014 ∥ T015** — repository and service tests.
- **Web ∥ Mobile within every story** — e.g. T021–T029 run alongside T030–T039.
- **Phase 7 (US5) ∥ Phases 3–6** — different backend, different surface, no shared file.
- **T084 ∥ T085 ∥ T086** — telemetry, alarms, and parity docs are independent.

---

## Parallel Example: User Story 1

```bash
# After T016–T020 (backend) land, run the two surfaces concurrently:

# Track A — web console
T021  model.ts
T022  repo.ts
T023  queries.ts (refetchInterval — the repo's first polling)
T024  FulfillmentStatusBadge.tsx    ∥  T025  PromiseCell.tsx
T026  OrderQueueScreen.tsx
T027  routes/orders.tsx + router.tsx
T028  nav.ts
T029  OrderQueueScreen.test.tsx

# Track B — mobile (independent toolchain, zero shared files with Track A)
T030  OrderModels.kt
T031  OrderRepository.kt
T032  OrderUseCases.kt
T033  HttpOrderRepository.kt        ∥  T034  OrderMappers.kt
T035  OrdersViewModel.kt
T036  OrdersScreen.kt
T037  ShopShell.kt (replace placeholder)
T038  AppContainer.kt
T039  FakeOrderRepository + OrdersViewModelTest
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

Phases 1 → 2 → 3. That alone converts a silent database row into work a shop can see — the entire point
of the slice — and is independently demonstrable on both surfaces. **Stop and validate here** before
building the pick workflow.

### Incremental Delivery

1. **US1** — the queue. Shops can see orders. *(MVP)*
2. **US2** — the pick screen. Shops can work orders.
3. **US3** — transitions. `shop_fulfillment.status` moves for the first time; every later slice now has
   a signal to react to.
4. **US4 / US5** — completed history and customer visibility. Both P2, both optional to a first release.
5. **US3a** — the scaffold, last, and deleted when the driver slice lands.

### Risks carried into implementation

- **T090 is a hard prerequisite for live sign-off.** `shop_fulfillment` is empty in dev — 019 never ran
  a live purchase. Without a real two-shop order, SC-001/SC-002 cannot be proven at all.
- **T089 is the security gate.** Verify the stub's absence by *attempting to reach it*, never by reading
  the code.
- **The shortfall debt is real.** A flagged item means the customer paid and receives nothing back in
  this slice. Confirm shortfalls are queryable (T075's projection + the `fulfillment_item` ledger) before
  sign-off, or the refunds slice inherits an unrecoverable mess.
- **SC-019 is not provable yet** — it needs 021's differentiated promises. That is by design (FR-001b),
  and T092 must record it as such rather than marking it passed or failed.

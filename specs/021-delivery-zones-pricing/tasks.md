# Tasks: Delivery Zones & Pricing

**Feature**: 021-delivery-zones-pricing · **Date**: 2026-07-21
**Inputs**: [plan.md](./plan.md) · [spec.md](./spec.md) · [research.md](./research.md) ·
[data-model.md](./data-model.md) · [contracts/](./contracts/) · [quickstart.md](./quickstart.md)

## Format: `[ID] [P?] [Story] Description`

- **[P]** — parallelizable (different file, no dependency on an incomplete task)
- **[US#]** — the user story this task serves (user-story phases only)
- **🧑‍💻** — OPERATOR-RUN. Claude authors; the operator runs anything touching AWS, the DB, or live state.

## Path Conventions

- Hot path: `apis/core-api/internal/` (checkout + a new `platform/delivery` pkg)
- Cold path: `apis/edge-api/admin/src/` (a new `delivery/` slice, cloning `shops/`)
- Web customer: `apps/customer-web/` · Web back-office: `apps/back-office/src/`
- Mobile: `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/`
- Contracts: `packages/shared-types/` · Migrations: `db/migrations/`

**Tests are included** alongside implementation (repo convention + constitution Quality Gate). This is a
**large slice touching the money path** — the fee-integrity tasks (US3) are load-bearing.

> ✅ **020 is committed** (`8f91b35 "feat: finalize shop order fulfillment feature with live testing and
> bug fixes"`, incl. the Stripe fix). 021 builds on committed ground.

---

## Phase 1: Setup (Shared Contracts)

**Purpose**: Single-source the DTOs both audiences consume before any surface code (Principle II, FR-021).

- [X] T001 [P] Add management DTOs (`DeliveryZoneDTO`, `DeliveryZonePostcodeDTO`, `DeliveryOfferingDTO`, `ShopLocationDTO`, `CreateZoneRequest`, `UpdateZoneRequest`, `AddPostcodesRequest`, `CreateOfferingRequest`, `UpdateOfferingRequest`, `SetShopLocationRequest`) reusing `PagedDTO<T>` + `AuditEntryDTO`, in `packages/shared-types/src/delivery.ts`; export from `src/index.ts`
- [X] T002 [P] Add `packageKey: string` to `CartLineDTO` and a per-package grouping to the cart contract in `packages/shared-types/src/cart.ts`
- [X] T003 [P] Add the quote DTOs (`DeliveryQuoteRequest`, `DeliveryQuoteResponse`, `QuotePackageDTO`, `DeliveryMethodOptionDTO`) and the extended `CreateCheckoutIntentRequest` (`quoteId`, `selections[]`, `excludedPackageKeys[]`) + a `deliveryBreakdown` on the response, in `packages/shared-types/src/checkout.ts`
- [X] T004 [P] Add per-package delivery (`serviceLevel`, `feeAmount`, `window`) to `OrderFulfillmentDTO` in `packages/shared-types/src/order.ts` (still anonymised — no shop field)
- [X] T005 Regenerate the customer Kotlin contract: `pnpm --filter @effy/shared-types commerce-contract:gen` → `packages/shared-types/contract/CommerceDto.kt`
- [X] T006 Verify the drift guard: `pnpm --filter @effy/shared-types commerce-contract:check` (a diff means the generated Kotlin was hand-edited)

**Checkpoint**: Contracts exist and generate deterministically.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠ Every user story depends on this phase.**

### Data layer

- [X] T007 Author the forward-only migration `db/migrations/<ts>_delivery_zones_pricing.sql` per [data-model.md](./data-model.md): `delivery_zone`, `delivery_zone_postcode` (UNIQUE postcode), `delivery_offering` (UNIQUE origin×dest×method + indexes), `ALTER public.shop ADD postcode`, `order_package_delivery` (UNIQUE order×shop), `ALTER public."order" ADD delivery_quote_expires_at`, `ALTER public.shop_fulfillment ADD` the 4 delivery columns. House style: `public` schema, text CHECK enums, index every FK, COMMENT ON everything. Scaffold with `make db-new name=delivery_zones_pricing`
- [ ] T008 🧑‍💻 Commit the migration, then `make db-up ENV=dev`; verify per [quickstart.md](./quickstart.md) §2

### Hot-path pricing core (pure, DB-free — the heart of the money path)

- [X] T009 [P] Delete `DeliveryFeeCents` and add `QuoteValidity` (a `time.Duration` constant) in `apis/core-api/internal/platform/pricing/pricing.go`
- [X] T010 Implement the pure delivery-pricing package — `PricePackage(originZone, destZone, method, offerings) (feeCents, promisedReadyAt)`, method availability, same-day cutoff logic, window derivation — with **no DB access**, in `apis/core-api/internal/platform/delivery/delivery.go`
- [X] T011 [P] Write exhaustive unit tests for the pricing core (metro→metro offers same-day; regional→metro standard-only; missing offering → unserviceable; same-day withdrawn past cutoff; window derivation) in `apis/core-api/internal/platform/delivery/delivery_test.go`

### Cold-path slice skeleton (clone of 009 shops/)

- [X] T012 [P] Define domain types + `DeliveryError` (`validation|conflict|not_found`) in `apis/edge-api/admin/src/delivery/types.ts`
- [X] T013 [P] Add the authz gate — reuse `isActiveStaff` (read) and the admin/manager mutate gate — plus `guard(event, scope, level)` and `mapDeliveryError`, in `apis/edge-api/admin/src/delivery/handler-support.ts` (mirror `shops/`)

**Checkpoint**: Schema applied, pricing core unit-tested, cold-path skeleton ready.

---

## Phase 3: User Story 4 — Back-office manages coverage, locations, rates (P2, built first) 🎯 FOUNDATION

> **Built first despite P2**: nothing else can be exercised without zones, shop locations, and a rate
> grid to price against. This is the data the customer path reads.

**Goal**: Back-office defines zones (postcode sets), sets shop locations, and manages the (origin→dest,
method) rate grid; changes affect new quotes only; all audited.

**Independent Test**: Create a zone, add postcodes, set a shop's location, define an offering; confirm a
DB read reflects it; remove all offerings for a pair and confirm it becomes unserviceable.

### Backend (cold path)

- [X] T014 [US4] Implement the repository — zones CRUD, postcode add/remove (`23505`→conflict), offerings CRUD, set-shop-location, list — each mutation writing `admin.audit_log` in the same `withTransaction` (actions `delivery_zone.*`, `delivery_offering.*`, `shop.location_set`), in `apis/edge-api/admin/src/delivery/repository.ts`
- [X] T015 [US4] Implement the service (validation: valid postcodes, non-negative prices, `lead_days_max >= min`, method enum) in `apis/edge-api/admin/src/delivery/service.ts`
- [X] T016 [US4] Implement the thin handlers for every endpoint in [contracts §C](./contracts/delivery-api.contract.md) under `apis/edge-api/admin/src/functions/` (delivery-zones list/create/update, postcodes list/add/delete, offerings list/create/update, shop-location patch, zone audit)
- [X] T017 [US4] Register every function with the back-office JWT authorizer + `Errors` alarms in `apis/edge-api/admin/serverless.yml`
- [X] T018 [P] [US4] Write SQL-shape + audit-write tests (mock the `@effy/edge-shared` db seam) in `apis/edge-api/admin/src/delivery/repository.test.ts` and handler authz tests in `apis/edge-api/admin/src/delivery/handlers.test.ts`

### Frontend (back-office — clone of features/shops/, NO cards)

- [X] T019 [P] [US4] `model.ts` (DTO→domain) + `repo.ts` (`api.get/post/patch/delete`) + `queries.ts` (`["back-office","delivery"]` root, mutations invalidate) + `access.ts` + `errorText.ts` in `apps/back-office/src/features/delivery/`
- [X] T020 [US4] Build `DeliveryZonesScreen` (`DataTable` of zones) and `ZoneDetailScreen` (zone header as `<dl>` rows + postcode `DataTable` + audit history) — **no cards** — in `apps/back-office/src/features/delivery/`
- [X] T021 [US4] Build `RatesScreen` — the (origin→dest, method) offering grid as a `DataTable` with an `EditOfferingDialog` — in `apps/back-office/src/features/delivery/`
- [X] T022 [P] [US4] Build dialogs `CreateZoneDialog`, `AddPostcodesDialog`, `EditOfferingDialog`, `SetShopLocationDialog` (TanStack Form, mutate, audit) in `apps/back-office/src/features/delivery/components/`
- [X] T023 [US4] Add routes in `apps/back-office/src/routes/delivery.tsx`, register in `router.tsx`, add the ungated **Delivery** nav item in `components/layout/nav.ts` (csa read-only via in-screen `canManage`)
- [X] T024 [P] [US4] Write RTL tests (zones list/empty/error, offering edit, mutate-gated controls hidden for csa) in `apps/back-office/src/features/delivery/*.test.tsx`

**Checkpoint**: A configuration exists to quote against. **This unblocks every customer story.**

---

## Phase 4: User Story 1 — A customer sees real per-package delivery options (P1) 🎯 MVP

**Goal**: The delivery step shows anonymous packages, each with its available methods + fees + windows;
default preference + per-package override; total sums the effective fees.

**Independent Test**: Two-shop cart to a metro address → two packages, one offering same-day+standard, the
other standard-only; set a preference, override one, confirm the total re-sums; no shop identity anywhere.

### Backend (hot path)

- [X] T025 [US1] Add zone-resolution + offering-read SQL (destination zone from postcode; per-shop origin zone; active offerings for the pair) to `apis/core-api/internal/features/checkout/store.go`
- [X] T026 [US1] Implement `POST /v1/checkout/quote` — group cart lines by shop into opaque packages, resolve zones, price each via `platform/delivery`, mark serviceability, capture the quote with `expiresAt` — in `apis/core-api/internal/features/checkout/quote.go`; route in `handler.go`
- [X] T027 [US1] Assign the opaque `packageKey` per shop (stable per (order, shop), never the shop UUID) in `apis/core-api/internal/features/checkout/quote.go`
- [X] T028 [P] [US1] Write quote tests (two-shop grouping, per-package methods, serviceability flags, no shop id in the response) in `apis/core-api/internal/features/checkout/quote_test.go`

### Web (customer-web)

- [X] T029 [US1] Add `packageKey` to `GuestCartLine` + capture it at add-time in `apps/customer-web/lib/cart-store.ts` and `app/(shop)/_components/AddToCartControl.tsx`
- [X] T030 [US1] Make the cart page package-aware — group lines into anonymous sections — in `apps/customer-web/app/(shop)/cart/page.tsx`; drop the flat delivery fee (show "calculated at checkout") in `apps/customer-web/lib/cart-totals.ts`
- [X] T031 [US1] Add the quote proxy `app/api/checkout/quote/route.ts` and build the `DeliveryOptions.tsx` step (packages, per-package method radios, default preference + override, running total) in `apps/customer-web/app/checkout/`
- [X] T032 [US1] Insert the delivery step into `CheckoutFlow.tsx` between address select and payment (new `Step`), calling quote after address select — in `apps/customer-web/app/checkout/CheckoutFlow.tsx`
- [X] T033 [P] [US1] Write tests (package grouping, method selection + override re-sums, no shop identity rendered) in `apps/customer-web/app/checkout/*.test.tsx` + `lib/cart-totals.test.ts`

### Mobile (customer-mobile)

- [X] T034 [US1] Add `packageKey` to `GuestCartLine` + capture at add-time in `features/cart/domain/GuestCart.kt`; drop flat fee in `features/cart/domain/CartTotals.kt`
- [X] T035 [US1] Make `CartScreen` package-aware (anonymous sections) in `features/cart/presentation/CartScreen.kt`
- [X] T036 [US1] Add the quote call + a delivery-options step (packages, method selection + override) to the checkout domain/data/presentation in `features/checkout/`
- [X] T037 [P] [US1] Extend the checkout fakes + ViewModel tests (grouping, selection, no shop id) in `commonTest/.../features/checkout/`

**Checkpoint**: The customer can see and choose per-package delivery. **MVP** (with US4's config + US3's charge).

---

## Phase 5: User Story 3 — The price shown is the price paid, forever (P1) 🔴 money path

**Goal**: Per-package fees are server-computed, captured with a validity window, snapshotted at
placement, summed into the charge, and atomic at finalize. Never client-supplied.

**Independent Test**: Place a two-package order; each fee to the cent, total == Σ; change a rate → the
historical order is unchanged; submit a client fee → ignored; expire the quote → re-quote 409.

### Backend (hot path — the load-bearing tasks)

- [X] T038 [US3] Rewrite `computeAmounts` to be per-package: receive resolved destination zone + selections, group by shop, price each package via `platform/delivery`, return the summed fee + per-package breakdown — in `apis/core-api/internal/features/checkout/service.go`
- [X] T039 [US3] Extend `CreateCheckoutIntent` — validate `quoteId`/`expiresAt` (409 + re-quote on expiry), honor captured fees within the window, re-resolve, **ignore any client-sent fee** (SC-004) — in `apis/core-api/internal/features/checkout/service.go`
- [X] T040 [US3] Write `order_package_delivery` (delete+reinsert) + set `order.delivery_fee_amount = Σ` + `delivery_quote_expires_at` inside `UpsertPendingOrder` in `apis/core-api/internal/features/checkout/store.go`
- [X] T041 [US3] Extend `FinalizeSucceeded`'s fan-out to JOIN `order_package_delivery` and populate `shop_fulfillment`'s delivery columns **in the same transaction**; roll back on a package/holder mismatch (no partial order) — in `apis/core-api/internal/features/checkout/store.go`
- [X] T042 [US3] Add the per-package `deliveryBreakdown` to the intent response and the extended `handler.go` intent body parsing in `apis/core-api/internal/features/checkout/`
- [X] T043 [P] [US3] Write money-integrity tests: fee == charge == snapshot; total == Σ; client-fee ignored; rate-change leaves historical order unchanged; atomic finalize rolls back on mismatch — in `apis/core-api/internal/features/checkout/service_test.go` + `store` tests

### Web + Mobile

- [X] T044 [US3] Send `{quoteId, selections, excludedPackageKeys}` from checkout and re-quote on a 409 in `apps/customer-web/app/checkout/CheckoutFlow.tsx` + `app/api/checkout/intent/route.ts`
- [X] T045 [US3] Same on mobile — send selections, handle re-quote — in `features/checkout/`
- [X] T046 [P] [US3] Show the per-package fee breakdown on the receipt (customer-web `app/(account)/orders/[id]/page.tsx` + mobile receipt), still anonymised

**Checkpoint**: The money path is per-package, server-authoritative, atomic, and snapshotted.

---

## Phase 6: User Story 2 — A customer cannot order a package Effy can't deliver (P1)

**Goal**: Undeliverable packages are auto-set-aside with an item-level notice; the customer explicitly
confirms; excluded items are never priced or charged; all-undeliverable blocks entirely.

**Independent Test**: Address one shop can't reach → its items set aside, explicit confirm required,
excluded items not charged; restore by changing address; all-undeliverable blocks.

- [X] T047 [US2] In the quote, mark each package `serviceable` and name affected items; in intent, **require `excludedPackageKeys` to exactly match the server's unserviceable set** (409 on mismatch) in `apis/core-api/internal/features/checkout/{quote.go,service.go}`
- [X] T048 [US2] Block entirely when every package is unserviceable (no confirm path) in `apis/core-api/internal/features/checkout/service.go`
- [X] T049 [US2] Build the set-aside + explicit-confirm UI (item-level notice, never a shop) in `apps/customer-web/app/checkout/DeliveryOptions.tsx` + restore-on-address-change
- [X] T050 [US2] Same on mobile in `features/checkout/presentation/`
- [X] T051 [P] [US2] Tests: partial exclusion charged correctly, mismatch 409, all-undeliverable block, item-level notice names no shop — backend `*_test.go` + web/mobile

**Checkpoint**: Undeliverable addresses are handled safely on all surfaces.

---

## Phase 7: User Story 5 — Each shop's ready-by becomes real and independent (P2)

**Goal**: Each shop portion carries its own promise from its package's chosen method; 020's queue orders
by it; the shop sees service level + ready-by, never the fee.

**Independent Test**: Order with a same-day package and a multi-day package to different shops → each
shop's queue shows its own ready-by; same-day ranks more urgent; no fee shown to the shop.

- [X] T052 [US5] Swap 020's promise seam to read `shop_fulfillment.promised_ready_at` (+ `delivery_service_level`) when present, falling back to the derivation for pre-021 orders — in `apis/edge-api/shop/src/fulfillments/promise.ts`
- [X] T053 [US5] Surface the service level + ready-by (never `delivery_fee_amount`) in the shop fulfilment DTOs/queries in `apis/edge-api/shop/src/fulfillments/{repository.ts,handler-support.ts}`
- [ ] T054 [P] [US5] Tests: real per-portion ready-by drives ordering; same-day outranks multi-day; **no fee** in any shop response — in `apis/edge-api/shop/src/fulfillments/*.test.ts`

**Checkpoint**: The shop side reflects real, independent per-package promises — no UI rework (020 built the seam).

---

## Phase 8: Polish & Cross-Cutting

- [ ] T055 [P] Add the PostHog delivery events (customer + back-office, **no postcode/PII**) in `apps/customer-web/lib/telemetry.ts` + `apps/back-office/src/lib/telemetry.ts`; document in `docs/telemetry/`
- [X] T056 [P] Update the parity register `docs/audiences/customer-capabilities.md` §021 (both customer surfaces) and note the enriched shop promise
- [X] T057 [P] Confirm 021 code stays out of the customer-web guest bundle: `cd apps/customer-web && pnpm size` MUST NOT regress `/` or `/browse` vs the pre-021 167.3 KB baseline (do not raise the limit)
- [X] T058 Run the full sweep from [quickstart.md](./quickstart.md) §1: `pnpm -r typecheck` + `commerce-contract:check` + edge-admin/customer-web/back-office Vitest + `go build/vet/test` + `./gradlew :shared:allTests` + `pnpm turbo build`
- [ ] T059 🧑‍💻 Deploy the cold path: `make edge-deploy SERVICE=admin ENV=dev`; seed a first zone/rate config per [quickstart.md](./quickstart.md) §3
- [ ] T060 🧑‍💻 Run `make core-run` + `./scripts/stripe-listen.sh`; place a real two-shop order and walk SC-001…SC-013 in [quickstart.md](./quickstart.md) §4, incl. the adversarial money proofs (SC-004) and the atomic-finalize kill test (SC-011c)
- [ ] T061 🧑‍💻 Verify parity on customer-mobile (SC-010) and that the shop surface never shows the delivery fee (FR-021a)
- [ ] T062 🧑‍💻 Commit spec, plan, research, data-model, contracts, quickstart, tasks **alongside** the code

---

## Dependencies & Execution Order

```
Phase 1 (Contracts)
   └─▶ Phase 2 (Foundational: migration + pricing core + cold skeleton)   ⚠ BLOCKS ALL
          └─▶ Phase 3 (US4 management)   🎯 built first — creates the data to quote against
                 └─▶ Phase 4 (US1 quote/options)   🎯 MVP
                        ├─▶ Phase 5 (US3 money path)   🔴 the integrity core
                        │      └─▶ Phase 6 (US2 serviceability) — needs the quote's serviceable flags
                        └─▶ Phase 7 (US5 shop promise) — needs finalize writing promised_ready_at (Phase 5)
   Phase 8 (Polish) ── after all
```

### User Story Dependencies

- **US4** (management) — foundation for everything; built first despite being P2 (the customer path reads
  its data). Depends only on Phase 2.
- **US1** (quote/options) — depends on US4 (config to price against) + Phase 2 (pricing core). **MVP.**
- **US3** (money path) — depends on US1 (the quote it charges). The integrity core.
- **US2** (serviceability) — depends on US1 (the quote's serviceable flags) + US3 (the exclusion in intent).
- **US5** (shop promise) — depends on US3 (finalize writing `promised_ready_at`). Backend-only, 1-file seam.

### Parallel Opportunities

- **T001–T004** — DTO files are independent.
- **T009 ∥ T012 ∥ T013** — pricing const, cold types, cold gate.
- **Within US4**: backend (T014–T018) ∥ frontend (T019–T024) once types (T012) land.
- **Within US1**: hot path (T025–T028) → then web (T029–T033) ∥ mobile (T034–T037).
- **US5 (T052–T054)** is a small backend-only track that can run alongside US2 once Phase 5 lands.

---

## Implementation Strategy

### MVP (US4 → US1 → US3)

Config to price against (US4), the per-package options (US1), and the server-authoritative charge (US3).
That is a working per-package delivery purchase. **Stop and prove the money path** (SC-002/SC-004) before
US2/US5.

### The load-bearing risk

**US3 is the money path — the second slice to touch it, right after the first live checkout only just
worked.** T041 (atomic finalize) and T043 (money-integrity tests) are non-negotiable. A fee that drifts
between quote, charge, and receipt, or a partially-finalized paid order, is a billing defect. Verify
SC-002/SC-004/SC-011c live (T060) before sign-off.

### Carried risks

- **Commit 020 before starting** — it's uncommitted under 021.
- **Guest-bundle breach (167.3 KB) is pre-existing** — T057 ensures 021 doesn't worsen it; it doesn't own
  the fix.
- **`core-api` is local-only** — the customer half is locally verifiable, not live until the hot path's
  deploy slice.

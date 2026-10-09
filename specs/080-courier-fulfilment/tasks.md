# Tasks: Courier Fulfilment — Via the Hub or Pickup from the Supplier

**Input**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md),
[contracts/routes.md](contracts/routes.md), [quickstart.md](quickstart.md)

**Tests**: included — proofs P1–P15 are the definition of done; marked ones are broken once.

Abbreviations: `EA` = `apis/edge-api`, `ST` = `packages/shared-types/src`, `BO` = `apps/back-office/src/features`,
`SW` = `apps/shop-web/src/features`, `CW` = `apps/customer-web`, `M1` = `db/migrations/<ts>_courier_fulfilment.sql`.

⚠ Claude writes code, SQL and Terraform; the operator runs `make db-up`, deploys and `make apply`.
⚠ **No courier service is seeded** — names are the operator's (CLAUDE.md, prohibited values). Tests
create their own with obviously fictional names ("Test Courier").
⚠ **Deploy order**: `notifications` before `orders` (new notification type).
⚠ Known red before this feature: `EA/shop/src/attention/repository.container.test.ts` (079 SIGNOFF).

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Scaffold M1 with `make db-new name=courier_fulfilment`.
- [X] T002 [P] In `ST/delivery-admin.ts` add `CourierServiceDTO`, its create/update inputs and list response (contracts § Admin); `CourierBlocker` gains `"no_service"`; `CourierReachDTO` / `CourierReachUpdateDTO` gain `collectionDefault`.
- [X] T003 [P] In `ST/order-admin.ts` add `ConsignmentState`, `ConsignmentEventKind`, `ConsignmentDTO`; `AdminOrderPackageDTO` gains `consignment`, `dueOut`, `late`; `AdminOrderDetailDTO` gains `courierCollection` and its history; `OrderAwaiting` gains `"courier_problem"`; handover list rows gain `view` fields (contracts § Orders).
- [X] T004 [P] In `ST/shop-order-console.ts` and `ST/shop-order.ts` add `CourierPickupDTO` and the optional `courierPickup` on list, detail, Today and queue rows.
- [X] T005 [P] In `ST/delivery-type.ts` + `delivery-type.fixtures.json`: `OrderDeliveryDTO.tracking`, words `trackParcel`, `trackingByEmail`, `withCourier`; fixture cases (one link, by email, none). In `ST/driver.ts`: `HubCheckinResponse.courierCount` (keep `standardCount`, deprecated).
- [X] T006 Regenerate contracts (`make cm-contract-gen`, `make sm-contract-gen`, driver `driver-contract:gen`); `pnpm -r typecheck`; note baseline counts of every container suite in a scratch note for SIGNOFF.

---

## Phase 2: Foundational (blocks every story)

- [X] T007 Write M1 Up per [data-model.md](data-model.md): `courier_service` (+ partial unique default, default ⇒ active), `delivery_settings.courier_collection_default`, `order.courier_service_id` / `courier_collection` (+ CHECK both set iff `delivery_type = 'courier'` for rows where `delivery_type` is not null), `order_courier_collection_change`, `courier_consignment` (+ partial unique live-per-package), `courier_consignment_event`; REVOKE UPDATE, DELETE on the two history tables from `effy_shopper`; `public.courier_parcel_collection(text, text)`; replace `public.courier_delivery_state` so `courier_not_ready` = no active default service (estimate text no longer consulted); COMMENTs everywhere. Down refuses if any consignment exists.
- [X] T008 Write `EA/shared/src/delivery/courier-pickup.ts` `nextCourierPickup(from, weekdays, cutoff)` and **P1** in `courier-pickup.test.ts` (before/after cutoff, skips non-pickup weekdays, 2026-10-04 and 2027-04-04 DST days, a Sunday-only service from Monday); break once (ignore cutoff) and restore.
- [X] T009 Write `EA/shared/src/delivery/consignment.ts` — the one writer: `bookConsignment(tx, …)`, `recordConsignmentEvent(tx, …)` which for `handed_over` inserts `carrier_handoff` (053 shape, idempotent) and for `delivered` calls the arrival write's SQL path (`package_arrival`, `staff_recorded`), maintains `state`, refuses invalid steps; `consignmentFor(q, packageIds)` read. Export from `delivery/index.ts`.
- [X] T010 **P13** guard `EA/shared/src/delivery/consignment.guard.test.ts`: `courier_consignment_event` and INSERT/UPDATE of `courier_consignment` only in `consignment.ts`; `courier_parcel_collection(` called only via one exported fragment. Break once (a second writer).
- [X] T011 Status: `EA/shared/src/status/sql.ts` adds `courier_problem`; `status.ts` returns Problem with "With the courier — <reason>" after delivered and before With carrier; rows in `status.test.ts`. Container check in `EA/shared/src/delivery/consignment.container.test.ts` (book → handed over → in transit → lost → resolved → delivered; cancel after handover refused; idempotent handover).
- [X] T012 Courier services backend: `EA/admin/src/delivery/courier-services.{repository,service}.ts` (validation per data-model, one default, retire rules, audit, `announce` delivery) and functions `delivery-courier-services-v1-get.ts`, `-v1-post.ts`, `delivery-courier-service-v1-put.ts` in `EA/admin/serverless.yml` (staff gateway). `coverage.service.ts`: `blockedBy` uses `no_service`; `setCourier` accepts `collectionDefault`; refuse `offered:true` without an active default. Container tests in `EA/admin/src/delivery/courier-services.container.test.ts`; update `coverage.container.test.ts` / `pricing.container.test.ts` P19 for the service rule.
- [X] T013 **P10** in `EA/shared/src/delivery/coverage.container.test.ts`: courier not ready without an active default service; ready with one (estimate text irrelevant). Break once and restore.

---

## Phase 3: User Story 1 — Via the hub, as consignments (P1) 🎯 MVP

**Independent test**: one-supplier courier order: collect, check in ("Courier"), Courier tab due-out, hand over with reference, deliver → completes.

- [X] T014 [US1] `EA/commerce/src/checkout/{store,service}.ts`: a courier intent writes `courier_service_id` (the default) and `courier_collection` (the platform default); the quote's estimate is the default service's `estimate_text` (`EA/shared/src/delivery/{coverage,quote}.ts` `loadCourierSettings`). **P9** in `checkout.container.test.ts` (update 079's courier fixtures to create a service).
- [X] T015 [US1] `EA/orders/src/orders/promise.ts` + `repository.ts`: due-out for a courier package = `nextCourierPickup` from its hub check-in (or now) using the booked or the order's service; late after that day's cutoff; replaces 079's "day placed". Update `promise.test.ts`.
- [X] T016 [US1] `EA/orders/src/handoff/repository.ts` + `EA/orders/src/orders/repository.ts` `handovers(view)`: views `hub_due`, `hub_late`, `supplier`, `with_courier`, `problems`; hub views exclude supplier-mode orders via the fragment; existing `due=` values keep working. Hub handover goes through `recordConsignmentEvent(handed_over)` (creates a consignment from the order's service when none was booked).
- [X] T017 [US1] Orders consignment routes in `EA/orders/src/consignments/{service,repository}.ts` + functions `fulfillment-consignment-v1-put.ts`, `fulfillment-consignment-events-v1-post.ts`, `fulfillment-consignment-label-v1-post.ts` (presigned PUT under `courier-label/`, ≤ 5 MB, PDF/PNG); register in `EA/orders/serverless.yml` with the media bucket env + IAM on the prefix; announce after commit.
- [X] T018 [US1] Order detail/package reads include `consignment`, `dueOut`, `late` (`EA/orders/src/orders/service.ts` `toPackage`).
- [X] T019 [US1] **P3, P5, P8** in `EA/orders/src/consignments/consignments.container.test.ts`; break P3 once (write only the consignment).
- [X] T020 [US1] Driver: `EA/driver/src/work/complete.ts` returns `courierCount` (packages `package_delivered_by = 'courier'`) and keeps `standardCount`; `apps/driver-mobile/.../collection/presentation/CollectionScreens.kt` second block "Courier — handed to a courier at the hub" from `courierCount` (fallback `standardCount`); **P14** in the driver container test and a driver-mobile `commonTest`.
- [X] T021 [P] [US1] Back-office: `BO/orders/components/ConsignmentBlock.tsx` (book/edit service, reference, tracking link, label upload, record progress, cancel) in `PackageRows.tsx`; `BO/orders/HandoverListScreen.tsx` → Courier tab with the five views, due-out and late; `repo.ts`/`queries.ts`; `errorText.ts` for the new refusals. Tests beside each.

---

## Phase 4: User Story 2 — Pickup from the supplier (P1)

**Independent test**: default = supplier; two-supplier courier order; no driver work; each shop sees and hands over its own; never At hub.

- [X] T022 [US2] `EA/fleet/src/planner/sql.ts` `GATHER_COLLECTION` excludes supplier-mode parcels via the shared fragment. **P2** in the fleet planner container test; break once.
- [X] T023 [US2] Shop reads: `courierPickup` on `EA/shop/src/orders/*`, `today/*`, `pick-lists/*`, `fulfillments/*` (queue + detail) from `consignmentFor`, only for supplier-mode courier orders; `labelUrl` presigned read (shop IAM read on `courier-label/*`). ⚠ `no-delivery-window.guard` must stay green.
- [X] T024 [US2] Shop route `EA/shop/src/functions/fulfillment-courier-handover-v1-post.ts` (+ `serverless.yml`, shared gateway): own shop only; `recordConsignmentEvent(handed_over, actor shop)`; announce.
- [X] T025 [US2] **P4, P12**: `EA/shop/src/orders/repository.container.test.ts` (two shops, each sees only its own; handover; status With carrier, never At hub); extend `EA/shop/src/delivery-isolation.contract.test.ts` (no fee, estimate, tracking link, other package).
- [X] T026 [P] [US2] shop-web: `SW/fulfillment/components/CourierPickup.tsx` in the order detail and a row badge in the list and Today ("Courier pickup · Thu 9 Oct, 1–3 pm"), label link, "Handed over to courier" button; tests.
- [X] T027 [P] [US2] shop-mobile: domain `CourierPickup`, mapper, the same block on the order detail and the action; host test.

---

## Phase 5: User Story 3 — Change one order's mode (P2)

**Independent test**: switch both ways before handover; refused after.

- [X] T028 [US3] `EA/orders/src/consignments/collection.ts` + function `order-courier-collection-v1-put.ts`: refuse after any handoff or `picked_up`; switching to supplier withdraws an open collection assignment through 073's unassign path (fleet shared helper) in the same transaction; cancels nothing handed over; records the change; announce. **P7** in the container test; break once.
- [X] T029 [P] [US3] Back-office: mode control + history on the order detail (`BO/orders/components/CourierCollection.tsx`); test.

---

## Phase 6: User Story 4 — Timeframe and tracking for the customer (P2)

**Independent test**: one consignment with a link → link; two → "by email"; email sent per handover.

- [X] T030 [US4] `EA/commerce/src/orders/{repository,service}.ts`: `delivery.tracking` per contracts; **P11** in `checkout.container.test.ts` (P9 block) — break once (a link with two consignments).
- [X] T031 [US4] Notification `order_with_courier`: `EA/shared/src/lib/notification-types.ts`, M1 widens `notification_request_type_check`, enqueue on every `handed_over` event in `consignment.ts` (dedup per consignment), `EA/notifications/src/worker/{copy,email-sender}.ts`, `packages/email-kit` template `order-with-courier` (mjml + text + fixtures + catalog), `pnpm email:gen`.
- [X] T032 [P] [US4] `deliverySummary` + Kotlin twin carry tracking; customer-web `components/receipt/ArrivalPanel.tsx` (link or sentence); customer-mobile `ReceiptScreen.kt`; fixture tests both sides.

---

## Phase 7: User Story 5 — Problems reach back-office (P2)

**Independent test**: record lost → Problem + needs attention; resolve clears.

- [X] T033 [US5] `OrderAwaiting` `courier_problem` in `EA/orders/src/orders/repository.ts` (filter + badge from the same predicate) and `service.ts`; overdue-with-courier from `max_business_days`. **P6** in the orders container test; break once (ignore `resolved`).
- [X] T034 [US5] Scheduled sweep `EA/orders/src/functions/courier-late-sweep.ts` (every 30 min) emitting `CourierParcelsLate {where}`; alarm in `infra/envs/dev/` (≥ 1 for `hub` or `supplier` over 2 h → alerts topic); `EA/orders/src/alarms.contract.test.ts` or the nearest alarm contract test.
- [X] T035 [P] [US5] Back-office: Courier tab "Problems" view rows link to the order; `AWAITING_LABEL.courier_problem`; test.

---

## Phase 8: User Story 6 — Courier services and the default mode (P3)

**Independent test**: add two, set default, retire, change default mode.

- [X] T036 [US6] Back-office `BO/delivery/components/CourierServicesPanel.tsx` (table + form), placed on the Coverage tab's courier section; replace the 079 estimate field with the default service's timeframe and a link; "How courier parcels reach the courier" default; `errorText.ts`; tests.

---

## Phase 9: Polish

- [X] T037 Run every container suite, web/mobile suites, `pnpm -r typecheck`, guards (`gateway-capacity` — expect staff 153 / shared 159, `change-map`, `windows`, `coverage`, `fee`, `delivery-type`, `consignment`, refresh timers, shop words, design-system), contract checks.
- [X] T038 [P] Docs: `docs/delivery-console-guide.md` (courier services, default mode), `docs/order-console-guide.md` (Consignment block, Courier tab), new `docs/runbooks/courier-handover.md`.
- [X] T039 [P] `FEATURE-HISTORY.md`, `CLAUDE.md` (consignment rules, one writer, supplier exclusion), backlog E6 ticks, memory.
- [X] T040 `specs/080-courier-fulfilment/SIGNOFF.md` with proofs, results, deviations, operator steps.

---

## Dependencies

- Phase 1 → Phase 2 → stories. T007 → T008–T013; T009 → T010, T011.
- US1 needs T009, T012. US2 needs T009 (and T016's fragment). US3 needs US2's exclusion. US4 needs T009 + T014. US5 needs T011. US6 needs T012 only.

## Parallel

T002–T005; client tasks T021, T026, T027, T029, T032, T035 beside their backend; T038–T039.

## Strategy

MVP = Phases 1–3 (via the hub with consignments — today's path made trackable). Then US2 (the new
path), US3 (its fallback), US4, US5, US6.

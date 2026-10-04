# Tasks: Delivery Time Slots & Standard Delivery Date

**Input**: Design documents from `specs/069-delivery-slots-dates/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/delivery-slots-dates.md](contracts/delivery-slots-dates.md),
[quickstart.md](quickstart.md)

**Tests**: included. The quickstart names eight negative proofs (NP1–NP8) that need tests to break,
and SC-002 can only be shown by a concurrency test.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US7 from spec.md; setup, foundational and polish tasks carry none
- `CORE` = `apis/core-api/internal`
- `EDGE` = `apis/edge-api`
- `ST` = `packages/shared-types`
- `CM` = `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile`
- `CM_TEST` = `apps/customer-mobile/shared/src/commonTest/kotlin/com/effyshopping/customer/mobile`
- `DM` = `apps/driver-mobile/shared/src/commonMain/kotlin/com/effyshopping/driver/mobile`
- `DM_TEST` = `apps/driver-mobile/shared/src/commonTest/kotlin/com/effyshopping/driver/mobile`
- `BO` = `apps/back-office/src`

---

## Phase 1: Setup

- [x] T001 Fill the "Baseline" table in `specs/069-delivery-slots-dates/quickstart.md`, measured BEFORE any change: reporting-package count from `pnpm -r typecheck`; test counts for `@effy/shared-types`, `@effy/edge-fleet`, `@effy/edge-orders`, `@effy/edge-driver` (each with `CONTAINER_TESTS=1`), `@effy/edge-notifications`, `@effy/customer-web`, `@effy/back-office`; `go test -short ./...` in `apis/core-api`; `:shared:testAndroidHostTest` for customer-mobile and driver-mobile; the customer-web `size` output per route; the three `*contract:check` states
- [x] T002 Measure the packaged CloudFormation resource count of `effy-edge-fleet` and `effy-edge-orders` (`npx serverless package` in `EDGE/fleet` and `EDGE/orders`, count `Resources` in `.serverless/cloudformation-template-update-stack.json`); record both in the quickstart baseline and in `research.md` R9. If fleet + ~35 would exceed 480, move the delivery-days routes (T056–T058) to `EDGE/orders` and say so in R9
- [x] T003 Create the migration file with `make db-new name=delivery_slots_dates` (produces `db/migrations/<ts>_delivery_slots_dates.sql`)

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: the schema, the contracts, and the two pure rules that decide what a customer is offered.

**⚠ No user story work starts until this phase is complete.**

- [x] T004 Write the migration in `db/migrations/<ts>_delivery_slots_dates.sql` exactly per data-model.md: `public.delivery_slot` (three CHECKs, `UNIQUE(start_time, end_time)`); `public.delivery_slot_booking` (`UNIQUE(order_id)`, index on `(slot_id, delivery_date)`); `public.delivery_non_delivery_date`; view `public.delivery_slot_load`; five columns on `public.delivery_settings` with their defaults and CHECKs; `slot_id`, `window_start`, `window_end` on `public.order_package_delivery` with the all-or-none + same-day-only CHECK; `COMMENT`s stating times are Melbourne wall-clock and that the two defaults (turnaround 60, carrier lead 1) are stated assumptions; a Down that drops everything added. Seed NO slot
- [x] T005 [P] Create `ST/src/delivery-window.ts`: `DeliveryWindow { startAt; endAt }`, `windowStateAt(now, window): "upcoming" | "due" | "late"` (R11) and `formatArrival({ promisedFrom, promisedTo, windowStart, windowEnd }, now)` implementing the four-row rendering table in contract §1 in Australia/Melbourne; export from `ST/src/index.ts`
- [x] T006 [P] Create the shared fixture `ST/fixtures/delivery-window.json` (window today; window on another date; no window one date; no dates; a window on each DST transition day; `windowStateAt` at start−1s, start, end, end+1s) and `ST/src/delivery-window.test.ts` running every case
- [x] T007 Extend the contracts per `contracts/delivery-slots-dates.md`: `DeliverySlotOptionDTO`, `StandardDayOptionDTO` and the three new quote fields in `ST/src/delivery.ts`; `sameDaySlotId`, `standardDate`, `slotHeldUntil` in `ST/src/checkout.ts`; `windowStart`/`windowEnd` on `ArrivalEstimateDTO` in `ST/src/order.ts` (rewrite its "DATES, NOT TIMES" comment — the window is now real); package fields + `HandoverRowDTO` in `ST/src/order-admin.ts`; new `ST/src/delivery-admin.ts` (`DeliverySlotDTO`, `DeliverySlotInput`, `DeliveryDaysDTO`, `DeliveryDaysInput`); `window` on `DeliveryDropDTO` and the round stop in `ST/src/driver.ts` (depends on T005)
- [x] T008 Regenerate the Kotlin contracts (`pnpm --filter @effy/shared-types contract:gen commerce-contract:gen driver-contract:gen`) and READ the generated nullable fields in `ST/contract/CommerceDto.kt` and `ST/contract-driver/DriverDto.kt` (depends on T007)
- [x] T009 [P] Create `CORE/platform/delivery/slots.go`: types `Slot`, `OpenSlot`; pure `OpenSlots(now, slots, booked map, runs, bufferMin, turnaroundMin)` per research R5 (cutoff, capacity, a makeable run with `run + turnaround ≤ start`), building `window_start`/`window_end`/`cutoff` instants with `time.Date` in `MelbourneTZ`; the single SQL constant for "a booking counts"; loaders `LoadSlots`, `LoadSlotLoad(date)`, `LoadSlotSettings`
- [x] T010 [P] Table test `CORE/platform/delivery/slots_test.go`: before/at/after cutoff; at capacity; no makeable run; run too late for the slot's start; disabled slot; both DST transition days; ordering earliest first
- [x] T011 [P] Create `CORE/platform/delivery/standarddays.go`: pure `AvailableDays(now, runs, bufferMin, leadDays, lookahead, noWeekdays, noDates)` per research R6 (hub day, earliest day, skip-without-counting, 60-day scan bound) and loaders for the settings and `delivery_non_delivery_date`
- [x] T012 [P] Table test `CORE/platform/delivery/standarddays_test.go`: before/after the last run; lead 0 and 2; a weekday excluded does not count toward the look-ahead (NP5 target); a blocked earliest day moves forward; a long blocked stretch still returns days; year boundary; DST days
- [x] T013 Make every existing producer and consumer compile against the widened contracts with honest values (empty arrays, nulls): `CORE/features/checkout/handler.go`, `CORE/features/orders/{orders,handler}.go`, `EDGE/driver/src/work/delivery.ts`, `EDGE/orders/src/orders/service.ts`, `apps/customer-web/app/checkout/CheckoutFlow.tsx` and its test fixtures, `CM/features/checkout/data/CheckoutMappers.kt`, `DM/features/delivery/data/HttpDeliveryRepository.kt`; extend `CORE/features/checkout/delivery_wire_contract_test.go` and `CM_TEST/features/checkout/DeliveryWireContractTest.kt` with the new fields so `pnpm -r typecheck`, `go build ./...` and both apps' `:shared:compileAndroidMain` pass (depends on T008)

**Checkpoint**: schema, contracts and both rules exist; nothing user-visible; same-day behaves as before because the quote is not yet wired to slots.

---

## Phase 3: User Story 1 — Choose a same-day time slot (P1) 🎯 MVP

**Goal**: same-day shows open slots with the fee; the chosen window is recorded and shown on the
confirmation, receipt, emailed receipt and order page, on web and mobile.

**Independent test**: quickstart W2, W3, W6, W14, W15 (tests seed slots directly; US5 is not needed).

### Tests for User Story 1

- [x] T014 [P] [US1] Container test `CORE/features/checkout/delivery_slot_container_test.go` against every migration: quote lists open slots and omits a past-cutoff one; no slots ⇒ no `same_day` option and reason `slots_closed`; ineligible zone ⇒ `not_eligible`; intent with a valid slot writes `slot_id`, `window_start`, `window_end` and `promised_from = promised_to =` the Melbourne date on every same-day package; same-day without a slot ⇒ `slot_required`; an unknown or closed slot ⇒ `slot_unavailable` with no payment intent created and NO fallback to standard (NP4 target)
- [x] T015 [P] [US1] Container test `CORE/features/checkout/shop_ready_by_container_test.go`: after finalize of an order with `promised_to` five days out, `shop_fulfillment.promised_ready_at` IS NULL (research R2; NP3 target)
- [x] T016 [P] [US1] Web test `apps/customer-web/app/checkout/DeliveryOptions.test.tsx`: slots render start–end with the same-day fee; none is preselected (FR-006); the two unavailable reasons show different wording (FR-004); a slot past `cutoffAt` is not selectable; the selection survives a re-render with a new quote that still contains it
- [x] T017 [P] [US1] Extend `apps/customer-web/components/receipt/ArrivalPanel.test.tsx` and `EDGE/notifications/src/receipts/sender.test.ts` (create if absent) to assert both render the fixture cases from `ST/fixtures/delivery-window.json` identically
- [x] T018 [P] [US1] Mobile test `CM_TEST/features/checkout/DeliveryChoiceTest.kt`: slot selection state, intent request mapping, and the Kotlin arrival formatter against the shared fixture file; no commas in backtick test names

### Implementation for User Story 1

- [x] T019 [US1] In `CORE/platform/delivery/quote.go` load slots, load and settings once per quote, compute `OpenSlots` per same-day-eligible package and intersect across those packages (spec edge case); add a `same_day` option only when the intersection is non-empty; return `SameDaySlots`, `SameDayUnavailableReason` and keep `SameDayUntil` as the latest open cutoff (R8); extend `quote_test.go` (depends on T009)
- [x] T020 [US1] In `CORE/features/checkout/service.go` and `handler.go`: carry the slots and reason through `DeliveryQuote` to `deliveryQuoteDTO`; accept `sameDaySlotId` on `createIntentRequest`; in `CreateCheckoutIntent` require a slot when any package resolves same-day and narrow the standard fallback to packages the quote never offered same-day on (R7); map `ErrSlotRequired` / `ErrSlotUnavailable` to 409 with `code` and a fresh `quote`; return before `UpsertPendingOrder` so nothing is created on refusal (depends on T019)
- [x] T021 [US1] In `CORE/features/checkout/store.go`: `PackageDelivery` gains `SlotID`, `WindowStart`, `WindowEnd`; `CaptureDelivery` writes them and `promised_from`/`promised_to`; DELETE the `promised_ready_at = opd.promised_to` assignment in `FinalizeSucceeded` with a comment citing research R2 (depends on T004, T020)
- [x] T022 [US1] Return `windowStart`/`windowEnd` from the customer order reads in `CORE/features/orders/orders.go` and `handler.go` (select both; RFC3339 in `MelbourneTZ`); rewrite the `arrivalRow` comment; extend `orders_test.go`
- [x] T023 [P] [US1] Build `apps/customer-web/app/checkout/DeliveryOptions.tsx`: a sectioned block (no card) with the method choice, slot chips under same-day each showing the window and the method's fee, and the unavailable note; controls are `rounded-md`, tokens only
- [x] T024 [US1] Wire it into `apps/customer-web/app/checkout/CheckoutFlow.tsx`: replace the inline method buttons; offer same-day when ANY package has it (R7) and state how many deliveries arrive today; hold `slotId`; send `sameDaySlotId` on intent; block "continue to payment" until a slot is chosen (depends on T023)
- [x] T025 [P] [US1] Render the window in `apps/customer-web/components/receipt/ArrivalPanel.tsx` via `formatArrival`; rewrite its "DATES, NEVER TIMES" comment
- [x] T026 [P] [US1] Select the window in `EDGE/notifications/src/receipts/repository.ts` and use `formatArrival` in `sender.ts` so the emailed receipt matches the page (FR-025)
- [x] T027 [US1] Mobile: add slots and the choice to `CM/features/checkout/domain/Checkout.kt`, map them in `data/CheckoutMappers.kt` and `HttpCheckoutRepository.kt`, hold the selection in `presentation/CheckoutViewModel.kt`, render slot chips (≥48dp targets) in `CheckoutScreen.kt`, and the window in `ReceiptScreen.kt` with a Kotlin `formatArrival` twin in `domain/`
- [x] T028 [US1] Guard test `EDGE/shop/src/fulfillments/no-delivery-window.guard.test.ts`: fails naming any file under `EDGE/shop/src` whose SQL selects `window_start`, `window_end`, `slot_id` or `promised_from`/`promised_to` (contract §5; NP7 target)

**Checkpoint**: a same-day order carries a window everywhere the customer looks. Capacity is not yet enforced.

---

## Phase 4: User Story 2 — A full slot is not sold again (P1)

**Goal**: capacity is held at the intent call, confirmed at payment, freed on lapse or cancel; a
customer whose slot went is told and re-chooses without being charged.

**Independent test**: quickstart W4, W5, W12.

### Tests for User Story 2

- [x] T029 [P] [US2] Container test `CORE/features/checkout/slot_capacity_container_test.go`: 20 concurrent intents on a capacity-3 slot yield exactly 3 live holds and 17 `slot_unavailable` (SC-002; NP1 target); a lapsed hold stops counting (NP2 target); re-intent on the same order refreshes one row, and with another slot moves it; re-intent as standard-only deletes it
- [x] T030 [P] [US2] Container test `CORE/features/checkout/slot_finalize_container_test.go`: finalize within the hold ⇒ `confirmed`; finalize after lapse with room ⇒ `confirmed`, not flagged; after lapse with the slot full ⇒ `confirmed` with `over_capacity = true` and the order still paid in its chosen slot; finalize twice is idempotent
- [x] T031 [P] [US2] Container test `CORE/features/refunds/cancel_slot_container_test.go`: cancelling a booked order sets the booking `released` and the place is offered by the next quote
- [x] T032 [P] [US2] Web test `apps/customer-web/app/checkout/CheckoutFlow.slots.test.tsx`: a 409 `slot_unavailable` clears the selection, shows the message, re-offers from the returned quote and selects nothing; payment confirm is preceded by a fresh intent when `slotHeldUntil` has passed
- [x] T033 [P] [US2] Mobile test `CM_TEST/features/checkout/SlotRefusalTest.kt`: the same two behaviours in the ViewModel

### Implementation for User Story 2

- [x] T034 [US2] In `CORE/features/checkout/store.go` `CaptureDelivery`: when a slot is chosen, inside the existing transaction `SELECT … FROM public.delivery_slot WHERE id = $1 FOR UPDATE`, re-evaluate cutoff and count with the shared counting SQL excluding this order's own row, then upsert the booking `ON CONFLICT (order_id)` as `held` with `held_until = now + slot_hold_min` and the window snapshot; return `ErrSlotUnavailable` and roll back when it cannot be held; delete the order's booking when no package is same-day. Move the capture ahead of payment-intent creation in `service.go` if it is not already, so a refusal creates no intent (R3, R4)
- [x] T035 [US2] Return `slotHeldUntil` on `createIntentResponse` in `CORE/features/checkout/handler.go` and `service.go` (depends on T034)
- [x] T036 [US2] In `FinalizeSucceeded` (`CORE/features/checkout/store.go`): lock the slot, set the booking `confirmed`; if `held_until` had lapsed, recount and set `over_capacity = true` when full or past cutoff; add `SlotOverCapacity bool` to `FinalizeOutcome` (depends on T034)
- [x] T037 [US2] Release the booking inside the transaction in `CORE/features/refunds/cancel.go` `CancelOrder` (R13)
- [x] T038 [P] [US2] Add `effy_delivery_slot_bookings_total{outcome}` to `CORE/platform/metrics/metrics.go` and raise it from the checkout service for `held`, `confirmed`, `refused_full`, `refused_cutoff`, `refused_uncollectable`, `over_capacity`
- [x] T039 [P] [US2] Add the slot alert rules to `infra/observability/alerts/069-delivery-slots.yml` (⚠ corrected: hot-path metric alerts are Prometheus rule files there, not `alerts.tf`, and are written-not-loaded like 054/055) and list the file in `infra/observability/README.md`. No notification endpoint is written
- [x] T040 [US2] Web: handle the three refusal codes in `apps/customer-web/app/checkout/CheckoutFlow.tsx` and re-run intent in `PaymentStep.tsx` before confirm when `slotHeldUntil` has passed; show the hold expiry in words
- [x] T041 [US2] Mobile: the same in `CM/features/checkout/presentation/CheckoutViewModel.kt` and `CheckoutScreen.kt`

**Checkpoint**: the window is an honest promise. US1 + US2 are shippable together.

---

## Phase 5: User Story 3 — Choose the day a standard delivery arrives (P1)

**Goal**: standard shows individual days with the fee, earliest preselected; the chosen day is
recorded and shown; a mixed basket asks for one slot and one day.

**Independent test**: quickstart W7, W9.

### Tests for User Story 3

- [x] T042 [P] [US3] Container test `CORE/features/checkout/standard_date_container_test.go`: quote returns `lookahead` days with non-delivery days absent; intent with a listed day writes it to `promised_from`/`promised_to` on every standard package; absent `standardDate` ⇒ the earliest day; an unlisted or past day ⇒ 409 `date_unavailable` with a fresh quote and nothing created; a two-shop basket with one same-day exception stores one slot and one day (SC-010)
- [x] T043 [P] [US3] Extend `apps/customer-web/app/checkout/DeliveryOptions.test.tsx`: days listed with the standard fee, earliest preselected, a mixed basket shows both a slot group and a day list
- [x] T044 [P] [US3] Mobile test `CM_TEST/features/checkout/StandardDayTest.kt`: default selection, mapping, mixed basket state

### Implementation for User Story 3

- [x] T045 [US3] Compute `StandardDays` in `CORE/platform/delivery/quote.go` via `AvailableDays` and carry it through `CORE/features/checkout/service.go` + `handler.go` to the quote DTO (depends on T011)
- [x] T046 [US3] Accept `standardDate` in the intent: validate against the freshly computed days, default to the earliest when absent, map `ErrDateUnavailable` to 409 with a fresh quote, set `PromisedFrom`/`PromisedTo` on standard packages; raise `effy_delivery_standard_date_refused_total` (`CORE/features/checkout/{handler,service}.go`, `CORE/platform/metrics/metrics.go`) (depends on T045, T021)
- [x] T047 [US3] Web: day list in `apps/customer-web/app/checkout/DeliveryOptions.tsx` (a list, earliest selected, each row with the fee); hold and send `standardDate` and handle `date_unavailable` in `CheckoutFlow.tsx`; mixed baskets show both groups
- [x] T048 [US3] Mobile: the same in `CM/features/checkout/{domain/Checkout.kt,data/CheckoutMappers.kt,presentation/CheckoutViewModel.kt,presentation/CheckoutScreen.kt}`

**Checkpoint**: every new order carries a day; the customer half of the slice is complete.

---

## Phase 6: User Story 5 — Back-office sets the slots (P2)

**Goal**: admins create, change and switch off slots and see today's load.

**Independent test**: quickstart W1, W11. ⚠ Deploy-wise this ships FIRST (quickstart §2).

### Tests for User Story 5

- [x] T049 [P] [US5] Container test `EDGE/fleet/src/slots/slots.container.test.ts` against the real migrations: create, patch, disable; each FR-037 refusal names its field; a duplicate window is refused; `bookedToday` counts confirmed + live holds and ignores lapsed and released; editing a slot changes no `order_package_delivery` or booking row (SC-009); every write produces an `admin.audit_log` row with the actor
- [x] T050 [P] [US5] Unit test `EDGE/fleet/src/slots/service.test.ts`: a non-admin role is refused on every write and allowed on read (FR-039)
- [x] T051 [P] [US5] Console test `BO/features/delivery/components/SlotsPanel.test.tsx`: table rows show window, cutoff, booked/capacity and over-capacity count; write controls are absent without `canManage`; a 422 lands on its field

### Implementation for User Story 5

- [x] T052 [US5] Create `EDGE/fleet/src/slots/{sql,repository,service}.ts`: list (joining `public.delivery_slot_load` for Melbourne today), create, patch incl. `status`; validation mirroring the CHECKs with named field errors; rows mapped to `DeliverySlotDTO`; add `delivery_slot.created|updated|disabled` actions and target type to `EDGE/fleet/src/shared/audit.ts`
- [x] T053 [US5] Add the three handlers under `EDGE/fleet/src/functions/` and their routes (`GET`/`POST /fleet/v1/delivery-slots`, `PATCH /fleet/v1/delivery-slots/{slotId}`) to `EDGE/fleet/serverless.yml` on the back-office authorizer; admin-only writes via the existing fleet authz helper (depends on T052)
- [x] T054 [US5] Console: `BO/features/delivery/components/SlotsPanel.tsx` (a `DataTable` with an add/edit dialog, no cards) with repo + queries in `BO/features/delivery/{repo,queries}.ts`; add a "Time slots" tab to `BO/features/delivery/DeliveryScreen.tsx`
- [x] T055 [US5] Add the slot section to `docs/delivery-console-guide.md`, including that same-day is not offered while no slot is active

**Checkpoint**: the operator can run slots without a release.

---

## Phase 7: User Story 6 — Back-office sets which days standard delivery runs (P2)

**Goal**: look-ahead, weekdays and dates with no delivery are configurable.

**Independent test**: quickstart W8.

### Tests for User Story 6

- [x] T056 [P] [US6] Container test `EDGE/fleet/src/deliverydays/deliverydays.container.test.ts`: put/get round-trip; excluding all seven weekdays and a look-ahead outside 1–30 are refused; adding a date returns `affectedOrders` and changes no order (FR-043); delete; audit rows written
- [x] T057 [P] [US6] Console test `BO/features/delivery/components/DeliveryDaysPanel.test.tsx`: weekday toggles, date list with affected counts, the two assumption settings labelled as assumptions

### Implementation for User Story 6

- [x] T058 [US6] Create `EDGE/fleet/src/deliverydays/{repository,service}.ts`, four handlers under `EDGE/fleet/src/functions/` and routes in `EDGE/fleet/serverless.yml` (`GET`/`PUT /fleet/v1/delivery-days`, `POST`/`DELETE /fleet/v1/delivery-days/dates…`); audit actions in `EDGE/fleet/src/shared/audit.ts`; admin-only writes (location per T002's finding)
- [x] T059 [US6] Console: `BO/features/delivery/components/DeliveryDaysPanel.tsx` (sectioned rows + a dates table) and a "Delivery days" tab in `BO/features/delivery/DeliveryScreen.tsx`; extend `docs/delivery-console-guide.md`

---

## Phase 8: User Story 4 — The driver delivers inside the window (P2)

**Goal**: rounds respect windows; the driver sees each drop's window, due and late.

**Independent test**: quickstart W10.

### Tests for User Story 4

- [x] T060 [P] [US4] Extend `EDGE/fleet/src/planner/planner.container.test.ts`: packages in two windows produce rounds whose `deadline_at` is each window's end (NP6 target); a window is not planned before `window_start − planning_lead_min`; a package with no window keeps end-of-day
- [x] T061 [P] [US4] Container test `EDGE/driver/src/work/drop-window.container.test.ts`: the drop and the round's stops return `window`; stop `dueAt` is `window.startAt`; stops in the earlier window sort first through `orderRoundStops`; a pre-069 drop returns `window: null`; another driver gets 404
- [x] T062 [P] [US4] Mobile test `DM_TEST/features/delivery/DeliveryWindowTest.kt`: the Kotlin `windowStateAt` against `ST/fixtures/delivery-window.json`

### Implementation for User Story 4

- [x] T063 [US4] Planner: select `window_start`/`window_end` in `GATHER_DELIVERY` (`EDGE/fleet/src/planner/sql.ts`), add them to `PlannablePackage` (`types.ts`) and the repository mapping, and in `planDeliveryWave` (`service.ts`) group by window, skip a group until `now ≥ window_start − planningLeadMin`, and plan each with `deadlineAt = window_end`; replace the "date-granular" comment (R10). No `.sort(` in `assign.ts` (the one-ordering guard)
- [x] T064 [US4] Driver service: select the window in `EDGE/driver/src/work/delivery.ts` and `sql.ts`, return it on `DeliveryDropDTO`, and set stop `dueAt` from `window_start` in `EDGE/driver/src/work/service.ts` (was `null`)
- [x] T065 [US4] Driver app: `DM/features/delivery/domain/DeliveryWindow.kt` (`windowStateAt`), map `window` in `domain/Delivery.kt` + `data/HttpDeliveryRepository.kt`, and show the window with a worded Due / Late state (icon + word; colour only reinforces) on `presentation/{EnRouteScreen,ArrivedScreen,DeliveryScreens}.kt`; nothing shown when null; completing a late drop stays enabled (FR-034)
- [x] T066 [P] [US4] Dispatcher console: show each drop's window and due/late via `windowStateAt` in `BO/features/dispatch/RoundDetailScreen.tsx` and `model.ts`; extend `model.test.ts`

---

## Phase 9: User Story 7 — Staff hand standard packages over for the right day (P2)

**Goal**: staff see each package's chosen day or window, what is due for handover and what is at risk.

**Independent test**: quickstart W13.

### Tests for User Story 7

- [x] T067 [P] [US7] Container test `EDGE/orders/src/handoff/handovers.container.test.ts`: `due=today|overdue|upcoming` partition correctly from `promised_to − carrier_lead_days`; at-risk when past due with no `carrier_handoff` or handed over late; same-day and pre-069 packages never appear; a csa can read
- [x] T068 [P] [US7] Extend `EDGE/orders/src/orders/repository.container.test.ts`: order detail returns `promisedDate`, `window`, `overCapacity`, `handoverDueOn`, `atRisk`, and `onTime` from `package_arrival.arrived_at ≤ window_end` (FR-035, FR-047)
- [x] T069 [P] [US7] Console test `BO/features/orders/HandoverListScreen.test.tsx`: three filters, at-risk shown as a word, an empty state

### Implementation for User Story 7

- [x] T070 [US7] `EDGE/orders/src/handoff/{repository,service}.ts`: the handover list query and DTO mapping (R6 derivations, read from `delivery_settings.carrier_lead_days`); handler under `EDGE/orders/src/functions/` and the `GET /orders/v1/handovers` route in `EDGE/orders/serverless.yml`; echo `promisedDate` on the handoff response
- [x] T071 [US7] Extend order detail in `EDGE/orders/src/orders/{repository,service}.ts` with the package fields in contract §4
- [x] T072 [US7] Console: `BO/features/orders/HandoverListScreen.tsx` (a table with filter tabs) + repo/queries, registered in `BO/routes/orders.tsx` and the nav; show day / window / at-risk / over-capacity / on-time in `BO/features/orders/components/PackageRows.tsx` and the chosen day in the handoff dialog on `OrderDetailScreen.tsx`
- [x] T073 [US7] Add the handover section to `docs/order-console-guide.md`

---

## Phase 10: Polish & cross-cutting

- [x] T074 [P] Declare the three analytics events in the shared event taxonomy and call them from `apps/customer-web/app/checkout/CheckoutFlow.tsx` and `CM/features/checkout/presentation/CheckoutViewModel.kt` with exactly the properties in plan.md (bounded ints, bool, enum)
- [x] T075 [P] Guard test `CORE/features/checkout/customer_dto_guard_test.go`: the quote and order JSON contain no `capacity`, `booked`, `overCapacity` or shop id (FR-050)
- [x] T076 Run NP1–NP8 from quickstart §1 one at a time; each must turn its named test red and be restored. Record the result of each in `specs/069-delivery-slots-dates/quickstart.md`. A proof that does not fail is a missing test — write it
- [x] T077 [P] Accessibility pass on the checkout choice (web + mobile): slot chips and day rows are a labelled radio group, the refusal message is announced, targets ≥ 44pt/48dp, due/late never colour-only
- [x] T078 Run every command in quickstart §1 and fill the "After" column; `pnpm --filter @effy/design-system test` and the customer-web `size` gate must match the baseline
- [x] T079 [P] Update the parity registers `docs/audiences/{customer,driver,admin}-capabilities.md` §069
- [x] T080 Add the 069 entry to `FEATURE-HISTORY.md` and the one-line index entry in `CLAUDE.md`; correct CLAUDE.md's hub-and-spoke section where it implies the promise is date-only
- [x] T081 Write `specs/069-delivery-slots-dates/SIGNOFF.md`: what was verified, deviations, the three known limits (quickstart §4), and the operator steps in order
- [ ] T082 OPERATOR (the user runs; Claude does not): quickstart §2 in order — `db-up` → `edge-deploy SERVICE=fleet` → create slots → `core-deploy` → `orders`, `driver`, `notifications` → web + apps — then walks W1–W15

---

## Dependencies & execution order

- **Phase 1 → Phase 2 → stories.** T004 blocks every container test; T007 → T008 → T013 blocks every client.
- **US1** needs Phase 2 only.
- **US2** needs US1 (T021's capture is what T034 extends).
- **US3** needs Phase 2 and T021; independent of US2.
- **US5** needs Phase 2 only. Build it right after Phase 2 if dev walks are wanted early: it is what lets US1 be walked rather than only tested.
- **US6** needs Phase 2; its effect is visible once US3 exists.
- **US4** needs US1 (windows exist on packages).
- **US7** needs US3 (chosen days exist).
- **Polish** last; T076 needs every story's tests.

### Parallel opportunities

- Phase 2: T005, T006, T009–T012 together; T004 alongside.
- US1: T014–T018 together; then hot path T019 → T020 → T021 → T022 while web (T023 → T024, T025), email (T026) and mobile (T027) proceed side by side.
- US2: T029–T033 together; T038, T039 alongside T034 → T035 → T036.
- US5, US6 (cold path + console) can run alongside US1–US3 (hot path + customer clients) once Phase 2 is done.
- US4 and US7 touch different services and screens and can run together.

## Parallel example: User Story 1

```text
Together:  T014 T015 Go container tests · T016 T017 web/email tests · T018 mobile test
Then:      T019 → T020 → T021 → T022 (hot path)
Alongside: T023 → T024, T025 (web) · T026 (email) · T027 (mobile) · T028 (shop guard)
```

## Implementation strategy

### MVP (US1 + US2, with US5 to operate it)

A window sold without a capacity is a promise broken on the first busy evening, so US1 alone is
not shippable. The smallest honest release is US1 + US2, plus US5 so the operator can create the
slots that same-day now depends on.

### Incremental delivery

1. Phases 1–2: foundation.
2. US5: slots exist in dev. Demo W1.
3. US1 + US2: demo W2–W6, W12.
4. US3 + US6: demo W7–W9.
5. US4: demo W10. US7: demo W13.
6. Polish, then the operator deploy and remaining walks.

## Notes

- **Deviations and corrections made while building are recorded in [SIGNOFF.md](SIGNOFF.md)**:
  the shared fixture's path, the alert file's home (and that it is not loaded), who may change
  slots, the `deliveryWindow` field name, how mobile renews a lapsed hold, and where the mobile
  tests for T018/T033/T044 live.

- T021 removes one line that nothing visibly depends on today. T015 is what keeps it removed.
- T034 is where "never charged for a slot you did not get" is decided; T029 is its proof.
- A late payer is honoured and flagged, never moved or refunded (research R3). T030 pins that.
- A test task is done when the test has been seen to fail without the implementation.
- Claude does not run migrations, deploys or `terraform apply` (T082), and makes no commit.

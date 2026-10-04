# Implementation Plan: Delivery Time Slots & Standard Delivery Date

**Branch**: `069-delivery-slots-dates` | **Date**: 2026-10-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/069-delivery-slots-dates/spec.md`

## Summary

A customer choosing same-day picks a time slot; a customer choosing standard picks a day. Slots
have a cutoff and a capacity that back-office sets. The window reaches the receipt, the email, the
order page and the driver's drop; the chosen day reaches the hub staff who hand standard packages
to the carrier.

Three findings from the code shape the plan, and the first two sent corrections back to the spec:

1. **Nothing writes a delivery promise today.** `promised_from` / `promised_to` have eleven
   readers and no writer; every order says "We'll confirm your delivery date". This slice becomes
   the first writer, into the columns the readers already understand (research R1).
2. **"Re-check at payment" has to be a short hold.** The client confirms payment with the
   provider directly, so the only server moment before the charge is the intent call. That call
   checks the slot and holds a place for ten minutes; finalize confirms it (R3).
3. **Writing the promise would silently change the shop's queue.** Finalize copies `promised_to`
   into the shop's ready-by. That copy is removed, or a standard order for next Thursday would
   tell the shop it is not due until Thursday (R2).

The fee engine is not touched: a slot and a day have no price of their own.

## Technical Context

**Language/Version**: Go (`apis/core-api`), TypeScript on Node 22
(`apis/edge-api/{fleet,orders,driver,notifications}`, `packages/shared-types`), TypeScript/React 19
(`apps/customer-web` on Next 16, `apps/back-office`), Kotlin 2.4 / Compose Multiplatform
(`apps/customer-mobile`, `apps/driver-mobile`)

**Primary Dependencies**: none new.

**Storage**: PostgreSQL 16, raw SQL, one forward-only Goose migration: three tables, one view,
five settings columns, three columns on `order_package_delivery` ([data-model.md](data-model.md)).

**Testing**: `go test` (pure table tests for `OpenSlots` / `AvailableDays` with DST fixtures;
container tests for the hold, concurrency and finalize), Vitest (unit + container against the real
migrations), Kotlin `commonTest`, the contract drift guards, the customer-web bundle gate.

**Target Platform**: customer-web, customer-mobile (Android + iOS), driver-mobile, back-office;
Fargate (core-api); Lambda (edge services).

**Project Type**: monorepo — two backend paths, two web apps, two mobile apps.

**Performance Goals**: no new request on the checkout path. The quote gains three reads (slots,
slot load, non-delivery dates), each a handful of rows; the intent call gains one row lock and one
count inside its existing capture transaction.

**Constraints**: capacity never exceeded under concurrency (SC-002); no charge on a refused slot
or day (SC-004); fee unchanged (FR-021); Melbourne wall-clock, DST-correct (FR-029); nothing about
capacity or shops in a customer DTO (FR-050); the shop sees no window or day; customer-web guest
bundle gate must not move.

**Scale/Scope**: 1 migration; 5 contract files; hot path (quote, intent, finalize, cancel, receipt
read); cold path (7 new fleet routes, 1 new orders route, planner, driver reads, receipt email);
4 client surfaces; 2 new back-office tabs and 1 new list.

### Unknowns

All resolved in [research.md](research.md): the missing promise (R1), the shop ready-by (R2), the
hold (R3), concurrency (R4), which slots are open (R5), standard days and the handover due day
(R6), mixed baskets (R7), the quote shape (R8), where the routes live (R9), the planner (R10), due
and late (R11), snapshots (R12), cancellation (R13), old clients and deploy order (R14),
accountability (R15).

## Constitution Check

| Principle | Verdict | Note |
|---|---|---|
| I. Spec-driven | PASS | Spec has no tech. Research found two false premises (R1, R3); the spec was corrected before this plan was written, not worked around. |
| II. Shared contracts | PASS | Every new shape is declared once in `packages/shared-types`; Kotlin is generated; Go mirrors the customer shapes under the existing wire test. The "a booking counts" predicate has one SQL definition and a view the console reads. |
| III. Dual-path discipline | PASS | Quote, hold, finalize, cancel, receipt read → hot path (commerce). Slot and day configuration, handover list, planner, driver reads, email → cold path. |
| IV. Auth isolation | PASS | No new pool or authorizer. New back-office routes attach to the existing back-office authorizer; writes are admin-only by staff record (FR-039). Driver reads keep their driver-scoped predicate. |
| V. Design | PASS | No new token. Slots are choice chips and days a list, each inside the existing sectioned checkout; back-office uses tables in tabs. No cards. Due/late use `--warning` / `--destructive` on their tints, each with a word. |
| VI. Layered architecture | PASS | handler → service → repository on both backends; the two rules are pure functions in `platform/delivery`; rows mapped to DTOs. |
| VII. Observability | PASS | Metrics, one alarm and three analytics events declared below. |

**Gate result**: no violations. Re-checked after design: unchanged. Complexity Tracking is empty.

### Telemetry declared (Principle VII)

| Signal | Where | Shape | Purpose |
|---|---|---|---|
| `effy_delivery_slot_bookings_total{outcome}` | core-api `/metrics` | `held`, `confirmed`, `refused_full`, `refused_cutoff`, `refused_uncollectable`, `over_capacity` | Are slots filling; how often customers are bounced |
| Alert rule: slot over capacity | `infra/observability/alerts/069-delivery-slots.yml` | `over_capacity` increased | A late payer overbooked a slot (R3). ⚠ Written, not loaded: the Prometheus stack does not exist, so it pages nobody yet. |
| `effy_delivery_standard_date_refused_total` | core-api | counter | A day went stale between quote and pay |
| `checkout_delivery_slot_selected` | customer-web, customer-mobile | `slotsOffered` (int), `position` (int), `hoursAhead` (int) | Which slots customers want |
| `checkout_delivery_date_selected` | same | `daysAhead` (int), `wasDefault` (bool) | Whether the date picker is used |
| `checkout_delivery_choice_refused` | same | `reason` (`slot_unavailable` \| `date_unavailable` \| `slot_required`) | How often US2 bites |

⚠ Known state, not introduced here: PostHog is not initialised on customer-web and mobile
telemetry is deferred, so the three events are declared and typed but emit nothing yet.

## Project Structure

### Documentation (this feature)

```text
specs/069-delivery-slots-dates/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── delivery-slots-dates.md
└── checklists/requirements.md
```

### Source code

```text
db/migrations/
└── <ts>_delivery_slots_dates.sql               # NEW — slot, booking, non-delivery date, view, columns

packages/shared-types/src/
├── delivery.ts                                 # quote gains sameDaySlots / standardDays / reason
├── delivery-window.ts                          # NEW — window type, windowStateAt(), formatArrival()
├── checkout.ts                                 # intent request + response
├── order.ts                                    # ArrivalEstimateDTO gains windowStart / windowEnd
├── order-admin.ts                              # package gains day / window / at-risk; HandoverRowDTO
├── delivery-admin.ts                           # NEW — DeliverySlotDTO, DeliveryDaysDTO
└── driver.ts                                   # DeliveryDropDTO + stop gain window
# + regenerated: contract/CommerceDto.kt, contract-driver/DriverDto.kt
# + fixtures/delivery-window.json               # NEW — shared by the TS, Kotlin and Go tests

apis/core-api/internal/
├── platform/delivery/
│   ├── slots.go                                # NEW — OpenSlots (pure) + loaders + the counting SQL
│   ├── standarddays.go                         # NEW — AvailableDays (pure) + loaders
│   └── quote.go                                # same-day option only when a slot is open
└── features/
    ├── checkout/{handler,service,store}.go     # quote DTO; intent validates + holds; finalize confirms
    │                                           # ⚠ finalize stops copying promised_to → promised_ready_at
    ├── orders/{orders,handler}.go              # receipt read returns the window
    └── refunds/cancel.go                       # releases the booking

apis/edge-api/
├── fleet/src/
│   ├── slots/{service,repository,sql}.ts       # NEW — slot CRUD + today's load
│   ├── deliverydays/{service,repository}.ts    # NEW — look-ahead, weekdays, dates
│   ├── planner/{service,sql,types}.ts          # delivery wave grouped by window; deadline = window end
│   └── shared/audit.ts                         # two new audit actions
├── orders/src/
│   ├── handoff/{repository,service}.ts         # NEW list: due / overdue / upcoming
│   └── orders/{repository,service}.ts          # day, window, at-risk, on-time on order detail
├── driver/src/work/{delivery,service,sql}.ts   # window on the drop; dueAt on the stop
└── notifications/src/receipts/{repository,sender}.ts   # the window in the emailed receipt

apps/customer-web/
├── app/checkout/DeliveryOptions.tsx            # NEW — method, slot chips, day list
├── app/checkout/CheckoutFlow.tsx               # holds the choice; handles the three refusals
└── components/receipt/ArrivalPanel.tsx         # renders the window

apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/features/checkout/
├── domain/Checkout.kt · data/{CheckoutMappers,HttpCheckoutRepository}.kt
└── presentation/{CheckoutScreen,CheckoutViewModel,ReceiptScreen}.kt

apps/back-office/src/features/
├── delivery/{DeliveryScreen.tsx,components/SlotsPanel.tsx,components/DeliveryDaysPanel.tsx}
└── orders/{HandoverListScreen.tsx,OrderDetailScreen.tsx,components/PackageRows.tsx}

apps/driver-mobile/shared/src/commonMain/kotlin/com/effyshopping/driver/mobile/features/delivery/
├── domain/{Delivery,DeliveryWindow}.kt · data/HttpDeliveryRepository.kt
└── presentation/{EnRouteScreen,ArrivedScreen,DeliveryScreens}.kt

infra/observability/alerts/069-delivery-slots.yml   # NEW — three rules (⚠ written, not loaded)
```

**Structure decision**: the two rules that decide what a customer is offered are pure Go functions
beside `SameDayCutoff`, because the hot path is the only place that offers anything. Back-office
configuration goes to `edge-api/fleet`, not `edge-api/admin`, which is at its CloudFormation
ceiling (R9). The planner reads stored instants and re-derives nothing, so no Go↔TypeScript rule
is duplicated (R5).

## Phase plan

1. **Foundation** — T001 baseline and resource counts; migration; shared-types + regenerated
   Kotlin; the fixture file; `OpenSlots` and `AvailableDays` with table tests. Nothing visible.
2. **US5 slots in back-office** — fleet routes, audit, the Time slots tab. First, because US1
   cannot be walked until a slot exists.
3. **US1 choose a slot** — quote, intent validation, capture, receipt read; checkout and receipt
   on web and mobile; the email; removal of the ready-by copy with its proof.
4. **US2 capacity** — the hold, the lock, finalize confirm and the over-capacity path, cancel
   release, the refusal flow on both clients, the metric and alarm.
5. **US3 choose a day** — `AvailableDays` in the quote, intent validation, mixed baskets, the day
   list on both clients.
6. **US6 delivery days in back-office** — fleet routes, the Delivery days tab.
7. **US4 driver** — planner grouping and deadline, drop window, due/late on the app and the
   dispatcher console.
8. **US7 handover** — orders list route, at-risk, order detail, the Handover screen.
9. **Polish** — telemetry, no-leak guards (shop, customer DTOs), accessibility, parity registers,
   FEATURE-HISTORY entry, quickstart walks.

## Risks

| Risk | Mitigation |
|---|---|
| Same-day disappears on deploy because no slot exists | Deploy order puts "create slots" before `core-deploy` (quickstart §2); the back-office tab ships first (phase 2). |
| Two customers take the last place | Row lock on the slot inside the capture transaction; a 20-way concurrency container test, proven by removing the lock (NP1). |
| A late payer overbooks | Accepted and flagged (R3): `over_capacity`, a metric, and a count on the console's slot row. Clients re-run intent when the hold has lapsed. ⚠ No live alert until the observability stack exists. |
| The shop queue reorders around the customer's day | The copy is removed; a container test pins the shop's ready-by; NP3 restores the line and must fail. |
| A window is wrong on the two DST days | Go builds the instant once with the zone database; table tests cover both transition days; nothing in TypeScript rebuilds one. |
| The window leaks to a shop, or capacity to a customer | Guard tests over `edge-api/shop` selects and over the customer DTO field set (contract §5). |
| Web, mobile and email word the arrival differently | One `formatArrival` in shared-types for web and email; a Kotlin twin pinned by the shared fixture. |
| Old mobile build picks same-day | Refused with `slot_required`; recorded as a known limit. Standard defaults to the earliest day. |
| `edge-fleet` nears its resource ceiling | Measured in T001 before adding seven routes; `edge-orders` is the fallback home for delivery days. |
| customer-web bundle gate | `DeliveryOptions` lives inside the already-client checkout flow; run the gate against the T001 baseline. |
| Turnaround and carrier lead time are guesses | Both are settings with stated defaults, shown to the operator on the Delivery days tab, flagged at sign-off. |

## Complexity Tracking

No constitution violations to justify.

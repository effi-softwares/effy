# Implementation Plan: Flexible Standard Delivery — a Day, "As Soon As Possible", or a Time

**Branch**: `085-flexible-standard-delivery` | **Date**: 2026-10-13 | **Spec**: [spec.md](spec.md)

**Input**: `specs/085-flexible-standard-delivery/spec.md`, and the operator's instruction for this plan:
**keep it simple — no complex logic; reuse what exists.**

## Summary

Standard delivery lets a customer choose a **day with no time** (the default), **"as soon as possible"**,
or — opt-in — a **time window** on a day. Same-day delivery is unchanged. Exactly one choice per order,
none pre-selected.

**The whole approach in one sentence: an order with no time is an order in a window that staff mark
"Any time".** Staff add one delivery window — say 12:00–21:00, capacity 40 — and tick *Any time*. From
that moment:

- **A day-only order** holds a place in that window on its day.
- **An "as soon as possible" order** is put, at payment, in that window on the first day it is open
  (today included), and is then identical to a day-only order. The customer is told the business's
  estimate, never the day.
- **Nothing downstream learns a new rule.** Capacity, the hold, the cutoff, collection from suppliers,
  round planning, round opening, hub check-in groups, dispatch, lateness and back-office's move-to-Effy
  all already work per window, and work unchanged for this one. The only thing drivers and staff get is
  a label: "Any time" where the hours would be.

What is actually built: one flag on a window, two columns recording what the order was sold, one
setting for the estimate, two additive fields on the quote, one on the intent, the customer picker on
web and mobile, the words, and one staff function to re-time an order.

Details and the alternatives rejected: [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript (Node 20 Lambdas; React 19 / Next.js 16 web), Kotlin 2.4.0 (Compose
Multiplatform 1.11.1, customer and driver apps), SQL (PostgreSQL 16, Goose).

**Primary Dependencies**: existing only — `@effy/edge-shared/delivery` (`slots.ts`, `windows.ts`,
`quote.ts`, `override.ts`), `@effy/shared-types`, TanStack Query/Form (back-office). No new dependency.

**Storage**: PostgreSQL — one migration: `delivery_slot.any_time`, `order.delivery_promise`,
`order.asap_estimate`, `delivery_settings.asap_estimate`, one partial unique index. No new table.

**Testing**: Vitest (services, shared-types, web), Kotlin common tests pinned to the shared fixtures,
the existing guard tests and scripts.

**Target Platform**: the one serverless backend; customer-web, customer-mobile, back-office,
driver-mobile (label only). shop-web / shop-mobile: no change.

**Project Type**: monorepo — backend services + web + mobile.

**Performance Goals**: none new. The quote judges one more window per day; the intent's ASAP path is a
`find` over a list the quote already builds.

**Constraints**: additive wire only (installed apps cannot be forced to update); one window rule, one
fee sum, one type-history writer, one wording home — all kept; staff gateway only for the new route.

**Scale/Scope**: ~1 migration, ~6 backend files changed + 1 new function + 1 new route, 2 shared-types
files + 2 fixtures, 1 web picker, 1 mobile picker, 3 back-office touches, 3 label touches.

## Constitution Check

| Principle | Verdict |
|---|---|
| **I. Spec-driven** | Pass. Three simplifications were found while planning and written **back into the spec** (FR-013a, FR-024, FR-026, the meaning of "during the day"), not left as plan-only deviations. |
| **II. Monorepo, shared contracts** | Pass. Types and words only in `packages/shared-types`; Kotlin twins pinned to the same fixtures. |
| **III. Single serverless backend** | Pass. No new service, no always-on compute. One new integration, on the **staff** gateway (`orders`); none on the shared gateway. `gateway-capacity.contract.test.ts` stays green. |
| **IV. Auth isolation** | Pass. The new route carries the back-office authorizer only; customers reach nothing new. |
| **V. Native-feel, consistent design** | Pass. Lists, radios and a disclosure inside the existing section — no cards. Existing tokens only. Web and mobile at parity. |
| **VI. Layered architecture** | Pass. Handler → service → repository; raw SQL; the pure rule files stay pure. |
| **VII. Observability** | Pass. One property on an existing analytics event; no PII. Live updates through the existing `announce*` functions. |
| **Real-world identifiers** | Pass. The ASAP estimate is operator-entered, never seeded; ASAP is not offered while it is empty. |

No violation; no amendment needed. **Post-design re-check: unchanged.**

## Project Structure

### Documentation (this feature)

```text
specs/085-flexible-standard-delivery/
├── plan.md            # this file
├── research.md        # decisions R1–R9
├── data-model.md      # the migration
├── quickstart.md      # automated checks + the dev walk
├── contracts/wire.md  # quote, intent, order DTO, words, staff routes, labels
└── tasks.md           # /speckit-tasks — not created here
```

### Source Code

```text
db/migrations/<ts>_flexible_standard_delivery.sql

packages/shared-types/src/
  delivery.ts                     # EffyDayDTO.anyTime, EffyWindowsDTO.asap, new DELIVERY_WINDOW_WORDS
  checkout.ts                     # CreateCheckoutIntentRequest.deliveryPromise
  effy-windows.ts (+ fixtures)    # effyWindowsView: anyTime per day, asap
  delivery-type.ts (+ fixtures)   # OrderDeliveryDTO.promise/asapEstimate; deliverySummary's two new forms

apis/edge-api/shared/src/delivery/
  slots.ts                        # Slot.anyTime (read only — judgeWindow NOT touched)
  windows.ts                      # openWindows: the any-time window goes to EffyDay.anyTime, not windows[]
  quote.ts                        # premium 0 for any-time; the asap fee (isToday = false); asap offered?
  override.ts                     # extract the window-binding block; changeEffyWindow; promise on moves
  delivery-type.ts                # recordDeliveryType also writes delivery_promise (still the one writer)

apis/edge-api/commerce/src/checkout/
  delivery-choice.ts              # resolveEffyWindow accepts a day's anyTime; resolveAsap = first open day
  service.ts, store.ts, respond.ts# pass deliveryPromise through; write promise + estimate; DTO fields

apis/edge-api/orders/src/
  delivery-move/                  # new route: POST …/delivery-window → changeEffyWindow
  orders/repository.ts            # promise on rows; ?promise= filter
apis/edge-api/orders/serverless.yml

apis/edge-api/fleet/src/slots/    # anyTime on create/update; 409 any_time_exists
apis/edge-api/fleet/src/dispatch/windows.ts          # anyTime label
apis/edge-api/driver/src/work/                       # anyTime label on effyGroups / round windows
apis/edge-api/admin/src/delivery/                    # asapEstimate setting; no premium for an any-time window

apps/customer-web/app/checkout/
  EffyWindowOptions.tsx (+ test)  # days as choices, the time disclosure, the asap button
  CheckoutFlow.tsx (+ tests)      # choice = window | asap; body; fee for asap
  lib/delivery-choice.ts          # ChosenWindow → the three-way choice; chosenFee
apps/customer-web/app/(account)/…orders  # nothing but what deliverySummary now returns

apps/customer-mobile/shared/src/commonMain/…/features/checkout/
  presentation/EffyWindowsView.kt, CheckoutScreen.kt, the ViewModel, the intent DTO  (+ tests, fixture)

apps/back-office/src/features/delivery/components/SlotsPanel.tsx   # the "Any time" tick
apps/back-office/src/features/delivery/…settings                    # the estimate field
apps/back-office/src/features/orders/…                              # promise column + filter; "Change day/time"
apps/driver-mobile/…                                                # "Any time" where hours are printed

CLAUDE.md, FEATURE-HISTORY.md, docs/api/path-assignment.md
```

**Structure Decision**: no new package, service or table. Every change lands in the file that already
owns that fact.

## Build order

Each step leaves the platform working; nothing is visible to customers until staff create the Any-time
window (and, for ASAP, enter the estimate).

1. **Migration + types + words + fixtures** (shared-types, both fixtures, Kotlin twins' tests red→green).
2. **Shared rules**: `Slot.anyTime`; `openWindows` splits it out; `quote.ts` prices it (premium 0) and
   builds `asap`. Tests: an any-time window is never in `windows[]`; today's is never on the wire; ASAP
   fee carries no today surcharge; with no any-time window the quote is byte-identical to today's.
3. **Checkout** (`commerce`): bind a day-only choice; resolve ASAP; write `delivery_promise` /
   `asap_estimate`; refusals. Tests: the four send-shapes in `contracts/wire.md` §2; never substituted.
4. **Customer web picker** — replaces the interim behaviour shipped ahead of this feature.
5. **Order reading**: `deliverySummary` forms on the order page, receipt, email; ASAP DTO carries no day.
6. **Back-office**: the tick on a window, the estimate setting, pricing excludes the any-time window.
   → *from here the feature can be switched on in dev by staff.*
7. **Labels**: driver hub check-in and rounds, dispatch.
8. **Staff tools**: promise column + filter; `changeEffyWindow` + its route + the "Change day/time" action.
9. **Customer mobile picker.**
10. **Docs**: CLAUDE.md delivery section, FEATURE-HISTORY entry, path-assignment.
11. **Hand over** migration and deploy commands (order: research R8); walk [quickstart.md](quickstart.md).

## Risks

| Risk | Limit |
|---|---|
| The any-time round is too large for one driver | Its capacity is the limit staff set. ⚠ To verify in tasks: how the planner sizes a round for one window today — the Any-time window is expected to be the largest it has seen. |
| ASAP undercuts paid same-day delivery | Accepted by the operator (spec, Assumptions). It reaches today only before the any-time window's own cutoff, which staff set. |
| A customer on an old app never sees the new choices | Additive wire: they keep choosing windows, which still works. |
| Staff create two Any-time windows | Partial unique index + 409. |
| Staff edit the Any-time window's hours after orders are sold | Orders keep the instants they were sold (the existing snapshot rule); the promise is stored on the order. |
| Day-only sold for today by a crafted request | Refused server-side (`slot_unavailable`) unless it is an ASAP order. |
| The interim picker tests (opening a day drops a same-day choice) contradict the new behaviour | Rewritten in step 4; called out in the spec's Assumptions. |

## Complexity Tracking

| Trade-off | Why | Rejected |
|---|---|---|
| "Any time" is a window, not a new kind of order | Zero new rules for capacity, hold, collection, planning, dispatch, lateness | A parcel with a day and no window: a new rule in each of those eight places |
| Untimed parcels ride their own round | Free from the planner's existing bucket; cannot make a windowed parcel late | Spreading them across window rounds: new planner logic |
| ASAP's day is fixed at payment; only staff move it | No job, no "day not set" state | A background re-planner and a customer notification for it |
| The customer picker asks the server nothing new for a day-only choice | It sends the existing `deliveryWindow` | A second choice shape on the wire for something the slot already says |
| One extra column pair on `order` | An order keeps what it was sold even if the window is later edited; ASAP is not derivable | Deriving from the slot at read time |

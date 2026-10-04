# Sign-off — 069 Delivery Time Slots & Standard Delivery Date

**Date**: 2026-10-04 · **Status**: 🚧 **81/82 — CODE-COMPLETE AND MACHINE-VERIFIED. NOT DEPLOYED, NOT
COMMITTED, NOT WALKED BY A PERSON.** The one open task is the operator's: the deploy and the walks
(T082). Client feedback R4b + R4c.

## What this slice changed that was not true before

**A customer chooses when.** Same-day delivery now means a time window the customer picked
("Today, 5 pm – 7 pm"); standard delivery means a day the customer picked. Both are recorded on the
order and said on the confirmation, the order page and the emailed receipt.

Also now true, and not before:

- **An order has a delivery promise at all.** `promised_from` / `promised_to` had eleven readers
  and no writer, so every order on the platform said "We'll confirm your delivery date". This slice
  is the first writer.
- **Same-day capacity is finite.** A slot has a capacity; a full or closed slot is not offered, and
  a place is held from the moment the customer continues to payment.
- **Back-office runs slots and delivery days without a release**: two new tabs in the Delivery
  console, live at the next checkout, every change audited.
- **The driver sees the window**, with "Due now" and "Late", and the round is planned per window to
  the window's end. `DeliveryDropSummary.window` existed since 049 and was hard-coded null.
- **Hub staff can see what must be handed to the carrier today**, and which packages are at risk.
- **The dispatcher's round detail is ordered by the shared rule.** It used the query's own order,
  which agreed with the driver's app only while no stop had a due time.

## Corrections the code forced on the spec

Both were made to `spec.md` before the plan was written.

1. **There was no "date range the platform computes".** The PRD and the first draft of the spec
   both described one. FR-049, US7 and the earliest-day assumption were rewritten.
2. **"Re-check at payment" has to be a hold.** The client confirms payment with the provider
   directly, so the intent call is the last server moment before the charge. FR-009 became
   "proceeds to payment", FR-009a/b were added, and SC-002 was restated.

## Built

| Layer | What |
|---|---|
| Migration | `20261004100725_delivery_slots_dates.sql` — `delivery_slot`, `delivery_slot_booking`, `delivery_non_delivery_date`, the view `delivery_slot_load`, five settings columns, three columns on `order_package_delivery`. Additive; rewrites no order. |
| `shared-types` | `delivery-window.ts` (`formatArrival`, `formatDeliveryWindow`, `windowStateAt`) + a fixture shared with both apps; quote, intent, arrival, admin order, slot/day and handover DTOs; `code` on `ProblemJSON`; four Kotlin contracts regenerated |
| `core-api` | `platform/delivery/slots.go` (`JudgeSlot`, `OpenSlots`, the slot lock) and `standarddays.go` (`AvailableDays`); the quote; intent validation, the hold and the 409 refusal; finalize confirms; cancel releases; receipt read returns the window; two metrics |
| `edge-fleet` | slots and delivery-days modules, seven routes; planner groups the delivery wave by window; round detail carries the window and uses the shared ordering |
| `edge-orders` | package promise verdicts (`promise.ts`), order detail fields, `GET /orders/v1/handovers` |
| `edge-driver` | the window on the drop and the run list; stop `dueAt` is the window's start |
| `edge-notifications` | the emailed receipt words the arrival with `formatArrival` |
| `edge-shop` | a guard: no file may read the customer's delivery promise |
| `customer-web` | `DeliveryOptions`; checkout holds the choice, handles the three refusals, renews a lapsed hold; receipt panel |
| `back-office` | Time slots and Delivery days tabs; Carrier handover list; package promise rows; window on the dispatch round |
| `customer-mobile` | slots, days and refusals in the checkout domain, ViewModel and screen; `DeliveryWindowText` (the Kotlin twin); a Melbourne-offset platform hook; receipt |
| `driver-mobile` | `DeliveryWindow` + `WindowLine` on the round list, en-route, arrived and drop detail |
| Observability | `infra/observability/alerts/069-delivery-slots.yml` — three rules, **written and not loaded** |
| Docs | delivery and order console guides; three parity registers; telemetry taxonomy |

## Verified

`pnpm -r typecheck` **21/21** · Go build / vet / gofmt clean, `go test -short ./...` clean ·
checkout, refunds and orders green **with containers** · four Kotlin contracts regenerate stable ·
customer-web production build and **bundle gate within budget on all 16 routes** · design-system
guards green · both apps: Android host tests green and **iOS main + test targets compile**.

| Suite (with containers where they exist) | Before | After |
|---|---|---|
| shared-types | 34 | 57 |
| edge-fleet | 196 | 236 |
| edge-orders | 56 + 1 flaky | 78 |
| edge-driver | 132 | 137 |
| edge-notifications | 45 | 63 |
| customer-web | 536 | 593 |
| back-office | 245 | 278 |
| customer-mobile (Android host) | 352 | 380 |
| driver-mobile (Android host) | 54 | 62 |
| Go checkout | — | +16 container tests against every migration and the real dev seed; +15 unit; +5 wire/guard |
| Go `platform/delivery` | — | `JudgeSlot` / `OpenSlots` / `AvailableDays` table tests incl. both DST days |

### Eight things proven by breaking them

| # | Break | Test that went red |
|---|---|---|
| NP1 | remove `FOR UPDATE` from the slot lock | 20 concurrent customers, capacity 3 |
| NP2 | count lapsed holds as live (in the view) | an abandoned hold frees its place |
| NP3 | restore `promised_ready_at = opd.promised_to` | the shop's ready-by is not the customer's day |
| NP4 | let a closed slot fall back to standard | a closed slot is refused, never substituted |
| NP5 | let a non-delivery weekday count toward the look-ahead | `AvailableDays` |
| NP6 | set a delivery round's deadline back to end of day | planner container test + `deadlineFor` |
| NP7 | select `window_start` in a shop query | the shop no-leak guard |
| NP8 | render a slot instant in UTC | the Go wire contract test |

NP7 and NP8 each needed a second attempt because the first *break* was wrong (one landed in a
comment, one broke the build instead of a test). Neither was a guard missing its proof.

### Red before this slice, and still red

- Go with containers: `platform/delivery` (its transcribed schema lacks `sameday_eligible`) and
  `features/shoplive`. Confirmed pre-existing by stashing the tracked changes.
- `edge-shop` with containers: attention recipients and order paging (both recorded by 065). A
  third, an insights "today" test, fails only in the minutes after Melbourne midnight; it passed on
  re-run.

## Deviations from the plan and tasks

| What | Why |
|---|---|
| The shared fixture is `packages/shared-types/src/delivery-window.fixtures.json`, not `fixtures/` | That is where 066's lives. |
| The two apps embed a COPY of the fixture, and a TypeScript test compares the copies to the file | `commonTest` cannot read a file outside the app. The comparison is what stops the copies drifting. |
| Slots and delivery days can be changed by **admin and manager**, not admin only | The contract said "admin". Every other delivery setting is admin/manager, and the fleet guard has no admin-only level. Spec FR-039 was reworded to match. |
| The driver field is `deliveryWindow`, with `window` kept as a label | `DeliveryDropSummary.window` already existed as a display string. One name for two shapes on sibling types is how a client reads the wrong one. |
| The alert rules are in `infra/observability/alerts/`, not `alerts.tf`, and **nothing loads them** | That is where hot-path metric alerts live, and the Prometheus stack does not exist (054 and 055 are in the same position). **A slot going over capacity pages nobody.** It is visible on the slot's row and on the order. |
| A late payer is flagged only when the slot is actually over capacity | The spec said "filled or closed". A slot past its cutoff with room left has not had its capacity broken, so the booking is confirmed unflagged. |
| customer-mobile does not renew a lapsed hold itself | The payment screen stops and tells the shopper to go back and continue again, which re-runs the intent. Web renews automatically. Passing the order across two ViewModels was more plumbing than the rare case earns. |
| customer-mobile's pay button stays enabled without a slot and explains on press | Web disables it. A disabled button on a phone gives no reason. |
| T018, T033 and T044 are `DeliveryWindowTextTest` and `DeliveryChoiceTest` | Two files instead of three; the same cases. |
| T050 has no test of its own | Role refusal is the shared fleet guard, already covered by `authz.test.ts`; the handlers pass `"mutate"`. |
| The `Quoter` takes the customer id | A customer's own unpaid hold must not be counted against them when they re-quote. |
| customer-web tolerates a quote with no `standardDays` | A server older than 069 sends none; blocking the pay button on a choice nobody was shown would stop checkout between the two deploys. |
| `make apply` is not in the deploy steps | No Terraform changed. |
| No "before" bundle sizes were recorded | The gate passes on every route; "byte-identical" is not claimed. |

## Known limits

- **Same-day stops being offered when `core-api` deploys unless a slot exists.** Create slots first.
- **An older mobile build choosing same-day gets a generic checkout error.** The server requires a
  slot it does not send. Standard orders from an older build default to the earliest day.
- **Two settings are guesses**: hub turnaround (60 min) and carrier lead time (1 day). The console
  labels both as estimates.
- **A chosen standard day is as firm as the carrier.** There is no carrier integration; Effy's part
  is the handover day.
- **Telemetry**: web's three events are called and emit nothing until PostHog is initialised;
  mobile's are declared and not wired.
- **SC-014 and SC-015** (90% on time) need a month of live deliveries.

## Operator steps (T082), in order

⚠ Order matters. `fleet` before `core-api`, so slots can exist before same-day depends on them.

```sh
make db-up ENV=dev                         # additive; safe before any deploy
make edge-deploy SERVICE=fleet ENV=dev
#   → back-office › Delivery › Time slots: create the slots (walk W1)
make core-image-push && make core-deploy ENV=dev
make edge-deploy SERVICE=orders ENV=dev
make edge-deploy SERVICE=driver ENV=dev
make edge-deploy SERVICE=notifications ENV=dev
#   then push customer-web and back-office; release the two apps
```

Then walks W1–W15 in [quickstart.md](quickstart.md). **W5** (a slot lost at the payment step) and
**W14** (the shop's ready-by is unchanged) are the two that most need a person.

Nothing is committed. The Kotlin contract checks read red until the regenerated files are.

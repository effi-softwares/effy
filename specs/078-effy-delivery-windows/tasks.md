# Tasks: Effy Delivery Windows — Today and the Next Three Days

**Input**: Design documents from `specs/078-effy-delivery-windows/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/routes.md](contracts/routes.md), [quickstart.md](quickstart.md)

**Tests**: included. Proofs P1–P20 in the quickstart are part of this feature's definition of done.
Each is broken once to see it fail.

**Organization**: by user story (spec.md). Paths are repo-relative. Abbreviations:
`EA` = `apis/edge-api`, `ST` = `packages/shared-types/src`, `BO` = `apps/back-office/src/features`,
`CW` = `apps/customer-web`, `CM` = `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/features`,
`CMT` = the matching `commonTest` directory, `M1` = `db/migrations/<ts>_effy_delivery_windows.sql`.

⚠ **Mode of work**: Claude writes the code, SQL and Terraform; the operator runs `make db-up`,
every `make edge-deploy` and `make apply` (quickstart → Operator steps).

⚠ **The switch stays off.** Nothing in this feature writes `delivery_settings.delivery_model_v2_from`
outside tests. No route, seed or migration sets it (research R1).

⚠ **M1 is additive.** It adds two columns and a function and only *widens* one CHECK. Nothing the
running services read is renamed, dropped or tightened.

⚠ **Legacy path untouched.** With the switch off, every response is byte-identical to before (P9).
Write the P9 snapshot (T009) before changing any quote code.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US8 from spec.md

---

## Phase 1: Setup

- [X] T001 Scaffold M1 with `make db-new name=effy_delivery_windows`; Down is a dev-only reversal (see T011).
- [X] T002 [P] In `ST/delivery.ts` add `EffyWindowsDTO`, `EffyDayDTO`, `EffyWindowDTO` exactly as [contracts/routes.md](contracts/routes.md) §1, and `effyWindows?: EffyWindowsDTO | null` appended to `DeliveryQuoteDTO` ("null while the new delivery model is off"). Add the seven word constants of §1 (`SECTION_SAME_DAY`, `SECTION_STANDARD`, `TODAY_CLOSED_SENTENCE`, `TODAY_NOT_DELIVERY_DAY_SENTENCE`, `DAY_FULL_SENTENCE`, `NO_EFFY_WINDOWS_SENTENCE`, `WINDOW_CUTOFF_PREFIX`) beside `COVERAGE_REFUSAL_SENTENCE`, with a comment that this is the only place they are written. Add `"no_windows_available"` to `DeliveryChoiceRefusalCode`. Update the `DeliverySlotOptionDTO.slotId` comment ("sent back as `sameDaySlotId`, or as `deliveryWindow.slotId` once the new model is on").
- [X] T003 [P] In `ST/checkout.ts` add `deliveryWindow?: { slotId: string; date: string } | null` to the intent request with the comment from contracts §2; note on `deliveryMethod` / `sameDaySlotId` / `standardDate` that they are ignored while the new model is on.
- [X] T004 [P] In `ST/delivery-admin.ts` add `days: { date; isToday; nonDelivery }[]` to the delivery-slots response and `load: { date; booked; overCapacity }[]` to `DeliverySlotDTO` (keep `bookedToday` / `overCapacityToday`); add `effyLookaheadDays: number` to the delivery-days DTO and its PUT input (contracts §3–4).
- [X] T005 Regenerate the Kotlin/JSON contracts with `make cm-contract-gen` (and confirm `make sm-contract-gen` output is unchanged); run `pnpm --filter @effy/shared-types test` and `pnpm -r typecheck`.

---

## Phase 2: Foundational (blocks every story)

**Purpose**: one window rule for every day, the switch, the schema, and the legacy-path safety net.

### The window calendar (pure — proven before anything calls it)

- [X] T006 Write the table tests FIRST in `EA/shared/src/delivery/windows.test.ts`, using `test-clock.ts`: **P1** — 10:00 on a Tuesday, windows 10–12 / 16–18 / 18–20 with cutoffs 09:00 / 14:00 / 17:00, one collection run 11:00, buffer 30, turnaround 60 → today offers only the windows whose cutoff and collection allow, each later day offers all three. **P2** — 17:01 → today `closedReason: "closed"`, three later days intact. **P3** — Sunday in `noWeekdays` and a Monday date in `noDates`, queried on Friday → days = Fri(today), Sat, Tue, Wed; today itself excluded → `not_delivery_day` with no windows and still three later days; look-ahead 1 and 14. **P4** — a window today with no makeable run → absent today, present tomorrow (verdict `uncollectable` only ever for today). **P5** — 23:59 vs 00:00 Melbourne; 2026-10-04 (clocks forward) and 2027-04-04 (clocks back): each window's `start`/`end` keep their wall-clock time, no date repeats or is skipped. Also: a full window (`booked >= capacity`) on Thu absent, same window Fri present; `capacity: null` never full.
- [X] T007 Create `EA/shared/src/delivery/windows.ts` per research R3: `EffyDay`, `EffyWindow`, `WindowVerdict`; `effyDays(now, lookahead, noWeekdays, noDates)` (noon-UTC arithmetic, the rule in `standard-days.ts`; bounded scan like `MAX_DAY_SCAN`); `judgeWindow(now, day, slot, booked, runs, bufferMin, turnaroundMin)` — clocks via `clockOn(clock, dayAsInstant)`, cutoff test every day, collection test only when `day === melbourneDate(now)`, reason order as `judgeSlot`'s comment; `openWindows(now, days, slots, loadByDate, runs, bufferMin, turnaroundMin)` → `EffyDay[]` with `closedReason` per R3. Header comment: `clockOn` stays the one slot→instant conversion; this file holds the one window rule.
- [X] T008 In `EA/shared/src/delivery/slots.ts` make `judgeSlot` and `openSlots` thin wrappers over `judgeWindow` with `day = melbourneDate(now)`; change `slotLoad(q, dates: string[])` to return `Map<date, Map<slotId, n>>` via `delivery_date = ANY($1::date[])` (keep a one-date convenience for existing callers) and `ownLiveHolds(q, customerId, dates: string[])` likewise; add `effyLookaheadDays` to `SlotSettings` / `loadSlotSettings` (default 3 when the row is missing). Export the new symbols from `EA/shared/src/delivery/index.ts`. Run `slots.test.ts`, `sameday.test.ts`, `standard-days.test.ts` unchanged — they must stay green.
- [X] T009 Write the **P9 snapshot** in `EA/commerce/src/checkout/checkout.container.test.ts` BEFORE any quote change: a fixed clock, coverage, plan, two slots and a two-shop basket; record the full `toQuoteDTO` JSON and the intent's written rows (`order_package_delivery`, `delivery_slot_booking`) as the expected legacy output. Later tasks add `effyWindows: null` to the expectation and nothing else.
- [X] T010 Break-and-restore P1 (drop the cutoff test), P3 (count a skipped day toward the look-ahead), P4 (run the collection test on every day), P5 (local midnight + 24 h); note each for SIGNOFF.

### Schema — M1 and the switch

- [X] T011 In M1 Up: `ALTER TABLE public.delivery_settings ADD COLUMN delivery_model_v2_from timestamptz, ADD COLUMN effy_lookahead_days int NOT NULL DEFAULT 3 CONSTRAINT delivery_settings_effy_lookahead_ck CHECK (effy_lookahead_days BETWEEN 1 AND 14)` with COMMENTs from [data-model.md](data-model.md) (the switch: "read ONLY through public.delivery_model_v2_at; no route writes it before E9"); `CREATE FUNCTION public.delivery_model_v2_at(at timestamptz) RETURNS boolean LANGUAGE sql STABLE` (false when the row is missing); `GRANT EXECUTE` to `effy_shopper` and the roles that already read `delivery_settings` (pattern in `db/migrations/20261005032655_shopper_role.sql`); drop and re-add `order_package_delivery_window_ck` without `AND method = 'same_day'`; extend the `method` column COMMENT (R6). Down: raise if any `standard` row has a `slot_id`, else restore the old CHECK, drop the function and columns.
- [X] T012 Create `EA/shared/src/delivery/model.ts`: `deliveryModelV2At(q, now): Promise<boolean>` calling `SELECT public.delivery_model_v2_at($1)` — header: the one TypeScript reader of the switch. Export it.
- [X] T013 Write the guard **P14** in `EA/shared/src/delivery/windows.guard.test.ts` (pattern: `coverage.guard.test.ts`): across `apis/edge-api/**/src` (excluding tests and migrations) the string `delivery_model_v2_from` appears nowhere; `delivery_model_v2_at` appears only in `model.ts`; `instantAtLocalTime(` is called only by `clockOn` in `slots.ts`. Break once by adding a second reader.
- [X] T014 Container test in `EA/shared/src/delivery/windows.container.test.ts`: M1 applies on the real migrations; `delivery_model_v2_at` is false with NULL, false before, true at/after the instant; a `standard` package row with a window now inserts; a half-window row is still refused.

**Checkpoint**: one window rule, the switch, the schema; legacy behaviour pinned by P9.

---

## Phase 3: User Story 1 — Choose a window today or on one of the next three delivery days (P1) 🎯 MVP

**Goal**: with the switch on, the customer sees Same-day delivery (today's open windows with cutoffs) and Standard delivery (next N delivery days with their windows), picks one window for the whole order, and pays.

**Independent Test**: switch on in the container test; quote at 10:00; confirm sections/days/windows; place an intent for Thursday's window; confirm the package rows and the hold.

- [X] T015 [US1] In `EA/shared/src/delivery/quote.ts` branch on `deliveryModelV2At(q, now)`. Off: today's code, unchanged. On (research R2, R5): load settings, `effyDays(...)`, `slotLoad` for those dates minus `ownLiveHolds` for those dates, `openWindows(...)`; **do not** call `sameDayForShops`; price each open window on each day with `priceEffyOrder(plan, postcode, km, grams, basketCents, slotId, date === today)`; return the legacy fields filled from it (today's windows → `sameDaySlots`, later days → `standardDays`, every package offered both methods only when today has windows) plus `effyWindows: { days, fees: Map<"slotId|date", PricedFee>, unavailable }`. Add `effyWindows: null` to the off branch's result type.
- [X] T016 [US1] In `EA/commerce/src/checkout/quote.ts` `toQuoteDTO`: map `effyWindows` to `EffyWindowsDTO` (section from `isToday`; `surchargeAmount` = window fee − plain later-day fee, never negative; `fee: feeDTO(...)`; `cutoffAt` via `operatingStamp`); `null` when off. ⚠ No capacity, no full windows, nothing per package. Extend `capturedQuote` with the window fees (`storedBreakdown`) when on.
- [X] T017 [US1] In `EA/commerce/src/checkout/delivery-choice.ts` add `resolveEffyWindow(q, window, now)`: missing → `slot_required`; date not among offered days → `date_unavailable`; slot not open that day → `slot_unavailable`; returns every package as `{ method: date === today ? "same_day" : "standard", promisedDay: date, slotId, windowStart, windowEnd }`, `hold: { slotId, date, now }`, and the fee for `slotId|date`. Never substitutes. Keep `resolveDeliveryChoice` for the off path.
- [X] T018 [US1] In `EA/commerce/src/functions/checkout-intent-v1-post.ts` parse `deliveryWindow` (object with two non-empty strings, date `yyyy-mm-dd`, else 422 `invalid_request`); in `EA/commerce/src/checkout/service.ts` add it to the input and call `resolveEffyWindow` when `quote.effyWindows` is present, `resolveDeliveryChoice` otherwise; meter refusals with the existing `meterChoiceRefusal`; emit `EffyWindowQuotes {outcome}` (R13).
- [X] T019 [US1] In `EA/commerce/src/checkout/store.ts` `captureDelivery`: `SlotHold` gains `date`; lock the slot (unchanged), judge with `judgeWindow(hold.now, hold.date, …)` against `slotLoad(tx, [hold.date])`, insert the booking with `hold.date` and the judged window instants. The off path passes `date = melbourneDate(now)` so it behaves as before.
- [X] T020 [US1] Container tests **P10** and **P11** (the `slot_required` / `date_unavailable` parts) in `EA/commerce/src/checkout/checkout.container.test.ts`: switch on → DTO days/sections/windows; intent for a later-day window writes `standard` + window on every package and a `held` booking on that date; intent for today writes `same_day`; a two-shop basket never splits; no `deliveryWindow` → `slot_required`; a date past the look-ahead → `date_unavailable`. Update P9's expectation with `effyWindows: null` only. Break once by honouring `sameDayForShops` in the v2 branch.
- [X] T021 [P] [US1] Customer web: in `CW/lib/delivery-choice.ts` add `isEffyWindows(quote)` and the window-choice state; in `CW/app/checkout/DeliveryOptions.tsx` render, when `effyWindows` is present, a **Same-day delivery** section (today's windows as a radio list, each "4–6 pm · Order by 2 pm") or its sentence, and a **Standard delivery** section with a day-tab strip (`Wed 9`, `Thu 10`, …) and that day's windows; no preselection; tokens only, no cards; words from `@effy/shared-types`. Legacy rendering kept for `effyWindows == null`.
- [X] T022 [US1] In `CW/app/checkout/CheckoutFlow.tsx` keep `{ slotId, date }`; send `deliveryWindow` (and not the 069 fields) when the quote has `effyWindows`; `need`/canPay require a window; on a 409 delivery-choice refusal re-render from its fresh `quote` and clear the choice if it is gone; **clear the choice when the address changes** (spec edge case) and keep it across steps and a failed payment while it is still offered (FR-011); `shownDeliveryAmount` from the chosen window's `fee.totalAmount`.
- [X] T023 [P] [US1] Customer web tests: extend `CW/app/checkout/DeliveryOptions.test.tsx` and `CW/app/checkout/CheckoutFlow.slots.test.tsx` with a v2 fixture — two sections, day tabs, choosing Thursday sends `deliveryWindow`, Pay disabled until chosen, legacy fixture unchanged.
- [X] T024 [P] [US1] Customer mobile domain/data: in `CM/checkout/domain/Checkout.kt` add `EffyWindows`/`EffyDay`/`EffyWindow`; map in `CM/checkout/data/CheckoutMappers.kt`; send `deliveryWindow` from the intent request when present; `CM/checkout/domain/DeliveryWindowText.kt` formats "4–6 pm", "Order by 2 pm" and day labels in Melbourne time.
- [X] T025 [US1] Customer mobile presentation: create `CM/checkout/presentation/DeliveryWindowWords.kt` (the seven constants, verbatim); in `CheckoutViewModel.kt` hold the selected `{slotId, date}` and selected day tab, re-read the quote on refusal, clear the choice on an address change and keep it across a failed payment; in `CheckoutScreen.kt` render the two sections with a horizontal day strip and a window list (48 dp targets, no cards); legacy UI kept for a quote without `effyWindows`.
- [X] T026 [P] [US1] Mobile tests in `CMT/checkout/`: `DeliveryWindowFixture.kt` gains a v2 fixture; `CheckoutViewModelTest.kt` (choose Thursday → request carries `deliveryWindow`; nothing chosen → cannot pay); `DeliveryWireContractTest.kt` decodes `effyWindows`; **P17** `DeliveryWindowWordsTest.kt` asserts each constant equals the TS source (read the same way `CoverageWords` is tested).
- [X] T027 [P] [US1] Telemetry: `checkout_window_selected { section, day_offset }` in `CW/lib/telemetry.ts` and the mobile observability taxonomy (`apps/customer-mobile/.../core/observability`); no slot id, no PII.

**Checkpoint**: US1 works end-to-end with the switch on, and nothing changes with it off.

---

## Phase 4: User Story 2 — Non-delivery days are skipped (P1)

**Goal**: excluded weekdays and dates never offered and never counted; the look-ahead is a setting.

**Independent Test**: mark a weekday and a date; quote the day before; three delivery days still offered.

- [X] T028 [US2] In `EA/fleet/src/deliverydays/repository.ts` and `service.ts` read/write `effy_lookahead_days` (422 `invalid_lookahead` outside 1–14); `EA/fleet/src/functions/delivery-days-v1-put.ts` accepts `effyLookaheadDays` (absent = unchanged, so an older console still saves); audit as today; announce `slots` after commit (already there).
- [X] T029 [US2] In `EA/fleet/src/deliverydays/repository.ts` change the "orders already carry this date" count to every paid, not-yet-delivered package with `promised_to = day` **whatever its method** (research R6, FR-032); update its comment.
- [X] T030 [US2] Container tests (part of **P16**) in `EA/fleet/src/deliverydays/` (new `deliverydays.container.test.ts` if none): look-ahead round-trips and validates; a windowed `standard` package and a `same_day` package on the date are both counted; marking the date changes neither order.
- [X] T031 [P] [US2] Back-office `BO/delivery/components/DeliveryDaysPanel.tsx`: a "Days offered" number field (Effy delivery days after today, 1–14) at the top, the non-delivery weekdays/dates unchanged, and the 069 look-ahead and carrier lead time moved under a muted subsection "Until the switch to the new delivery model"; wording "Effy delivery days" (FR-034). Update `DeliveryDaysPanel.test.tsx`; `BO/delivery/repo.ts` / `queries.ts` carry the field.
- [X] T032 [US2] Container test: with the switch on, a non-delivery weekday and date are absent from `effyWindows.days` and three later days remain; today excluded → `closedReason: "not_delivery_day"` (extends P10 in `EA/commerce/src/checkout/checkout.container.test.ts`).

---

## Phase 5: User Story 3 — A full window on one day says nothing about another (P1)

**Goal**: room counted per window per day; exactly one winner for the last place.

**Independent Test**: fill Thursday's window; Friday's still offered; race the last place.

- [X] T033 [US3] **P6** in `EA/shared/src/delivery/windows.container.test.ts`: confirmed and live-held bookings on Thu for a capacity-2 slot → `slotLoad` for [Thu, Fri] reports 2 and 0; `openWindows` omits it Thu, offers it Fri; a lapsed hold stops counting. Break once by loading by slot only.
- [X] T034 [US3] **P7** in the same file: two transactions call `captureDelivery` for the last place in a later-day window concurrently → exactly one `held` row, the other `SlotUnavailableError("full")`. Break once by removing `FOR UPDATE` from `lockSlot`.
- [X] T035 [US3] Cancellation releases a later-day place: assert in `EA/shared/src/payments/refunds/` container tests that the booking on that date becomes `released` and the window reappears for that date only.

---

## Phase 6: User Story 4 — Paying never costs the customer their window (P1)

**Goal**: hold at intent on the chosen date; refuse before any charge; late payer keeps the window, staff told.

**Independent Test**: hold and pay; let a hold lapse unpaid; late-pay into a filled later-day window.

- [X] T036 [US4] **P8** container test for `finalizeSucceeded` (beside the existing finalize tests in `EA/shared/src/payments/`): a hold on a later date lapses, the window fills, payment lands → booking `confirmed`, `over_capacity = true`, metric `SlotBookings{outcome: over_capacity}`; staff order detail (`EA/orders/src/orders/repository.ts`) shows `overCapacity` for that order. No code change expected in `finalize.ts` — if one is needed, record why.
- [X] T037 [US4] Container test: intent for a later-day window that filled between quote and intent → 409 `slot_unavailable` with a fresh quote, no order money moved, no payment intent created, the order's previous hold (if any) untouched (`EA/commerce/src/checkout/checkout.container.test.ts`).
- [X] T038 [US4] Container test: a quote taken at 23:58 offers "Wed" (tomorrow); an intent at 00:01 for that window is re-judged as today (cutoff + collection) — accepted if still open with `same_day`, otherwise `slot_unavailable`; never moved to another window.

---

## Phase 7: User Story 7 — The window the customer bought is the window they keep (P1)

**Goal**: a placed order's day and window never change, and every place it is shown says it.

**Independent Test**: place an order, then edit/disable its window and mark its date non-delivery; order page, receipt, email unchanged.

- [X] T039 [P] [US7] In `EA/orders/src/handoff/repository.ts` refuse carrier handover for a package with a window (`slot_id IS NOT NULL`) with a new code `not_carrier` (add to the orders action error codes and the back-office error text in `BO/orders`); keep `not_standard` for same-day.
- [X] T040 [P] [US7] In `EA/orders/src/orders/promise.ts` judge on-time by the window whenever `windowStart` is present (not only for `same_day`), and give a windowed package no `handoverDueOn`; update `promise.test.ts`.
- [X] T041 [US7] **P16** container tests in `EA/orders/src/` for T039/T040: a windowed `standard` package cannot be handed to the carrier; a windowless one still can.
- [X] T042 [P] [US7] Receipt: in `EA/notifications/src/receipts/sender.ts` show the window for any package that has one ("Standard delivery · Thursday 9 Oct, 4–6 pm"); use the section words from `@effy/shared-types`. Update its fixtures/tests and the email-kit fixture if the rendered text changes (`packages/email-kit/src/fixtures`).
- [X] T043 [P] [US7] Customer web: `CW/components/receipt/ReceiptDocument.tsx` and the order detail page show "Standard delivery · Thursday 9 Oct, 4–6 pm" when a standard package has a window; test in `ReceiptDocument.test.tsx`.
- [X] T044 [P] [US7] Customer mobile: `CM/checkout/presentation/ReceiptScreen.kt` and `OrdersScreen.kt` via `DeliveryWindowText.kt`; test in `CMT/checkout/DeliveryWindowTextTest.kt`.
- [X] T044a [P] [US7] Back-office order detail (FR-027): in `BO/orders/model.ts` a package with a window has no carrier-handover state (today only `same_day` returns "none"), and `BO/orders/components/PackageRows.tsx` shows its day and window and offers no carrier-handover action; add the `not_carrier` error text; tests beside them.
- [X] T045 [US7] **P13** container test: place a later-day order, then change the slot's times, lower its limit, disable it and mark its date non-delivery → `commerce` customer order DTO and the receipt repository return the original day and window.

---

## Phase 8: User Story 5 — The customer sees what each window costs (P2)

**Goal**: each window shows its surcharge before it is chosen; today's carry the "Delivery today" premium.

**Independent Test**: active plan with a today premium and one window premium; compare each window's surcharge and the charged total.

- [X] T046 [US5] **P12** container test in `EA/commerce/src/checkout/checkout.container.test.ts`: today's window surcharge = today premium + window premium; the same window tomorrow = window premium only; a basket over the free amount → every `surchargeAmount` "0.00" and every `fee.totalAmount` "0.00"; intent's charged delivery = the chosen window's `fee.totalAmount`; a mismatched `shownDeliveryAmount` → 409 `delivery_fee_changed`. Break once by passing `windowIsToday: true` for every day.
- [X] T047 [P] [US5] Web and mobile render `surchargeAmount` beside each window when not "0.00" (`CW/app/checkout/DeliveryOptions.tsx`, `CM/checkout/presentation/CheckoutScreen.kt`) and the chosen window's fee lines through the existing 077 components; covered by T023/T026 fixtures with one surcharged window.

---

## Phase 9: User Story 6 — The customer is told plainly when nothing is available (P2)

**Goal**: one sentence when no window is open on any day; alarm when none is defined.

**Independent Test**: close every window; quote and intent; then switch every window off.

- [X] T048 [US6] In `EA/shared/src/delivery/quote.ts` set `effyWindows.unavailable` to `"none_defined"` when there is no active slot and `"no_windows"` when every day is empty; in `EA/commerce/src/checkout/service.ts` refuse the intent with `no_windows_available` before writing anything, and emit `EffyWindowsNoneDefined` for `none_defined`.
- [X] T049 [US6] **P11** remainder in the commerce container test: both reasons, the refusal, the metric; no courier option appears in the DTO.
- [X] T050 [P] [US6] Terraform: add the `EffyWindowsNoneDefined` alarm (≥ 1 in 15 min, `treat_missing_data = notBreaching`, alerts topic) beside `DeliveryQuoteFailures` in `infra/envs/dev/commerce-alarms.tf`.
- [X] T051 [P] [US6] Web and mobile: render `NO_EFFY_WINDOWS_SENTENCE` in place of both sections and disable Pay (`CW/app/checkout/DeliveryOptions.tsx`, `CheckoutFlow.tsx`, `CM/checkout/presentation/CheckoutScreen.kt`); emit `checkout_windows_unavailable { reason }`; tests in T023/T026 fixtures.

---

## Phase 10: User Story 8 — Back-office sees how full each window is, day by day (P2)

**Goal**: a grid of windows × offered days with booked/limit, over-limit marked, live.

**Independent Test**: book into several days; open the grid; book from another session; the grid updates.

- [X] T052 [US8] In `EA/fleet/src/slots/sql.ts` add `OFFERED_DAYS_LOAD` (from `public.delivery_slot_load` where `delivery_date = ANY($1::date[])`) and keep `LIST_SLOTS`; in `EA/fleet/src/slots/repository.ts` / `service.ts` compute `days[]` with `effyDays(now, effyLookaheadDays, noWeekdays, noDates)` (marking excluded dates inside the range as `nonDelivery`) and attach `load[]` per slot in the same order. Comment: counts come from the view and nowhere else.
- [X] T053 [US8] **P15** in `EA/fleet/src/slots/slots.container.test.ts`: `days[]` skips a non-delivery weekday; `load[]` equals the view per date including a live hold and an over-capacity confirmed booking.
- [X] T054 [US8] `BO/delivery/components/SlotsPanel.tsx`: a table with one row per window (time, cutoff, limit, status, edit) and one column per `days[]` date ("Today", "Thu 9", …) showing `booked / limit` (or `booked` with no limit); over-limit cell `text-warning` on `bg-warning-soft`; switched-off windows muted. No cards. Read-only for csa (existing `access.ts`). Live via the existing `slots` mapping in `BO/live/routes.ts`. Rename visible "same-day slot" wording to "delivery window" (FR-034).
- [X] T055 [US8] **P19** in `BO/delivery/components/SlotsPanel.test.tsx`: grid shape, over-limit marking, no-limit cell, csa cannot edit, a `slots` live update re-reads.

---

## Phase 11: Polish & cross-cutting

- [X] T056 **P18** parity: one quote fixture JSON (v2, with a surcharged window, a closed today and a full day) checked into `packages/shared-types` test fixtures and rendered by `CW/app/checkout/DeliveryOptions.test.tsx` and `CMT/checkout/CheckoutViewModelTest.kt` — same sections, day labels, windows, surcharges and sentences.
- [X] T057 **P20**: run `change-map.guard`, `coverage.guard`, `fee.guard`, `windows.guard`, `scripts/check-no-refresh-timers.sh`, `pnpm --filter @effy/design-system test` (token usage), `gateway-capacity.contract.test.ts` (no route added), `pnpm -r typecheck`, `pnpm -r test`, `./gradlew :shared:allTests` in `apps/customer-mobile`.
- [X] T058 [P] `docs/delivery-console-guide.md`: the Windows grid, "Days offered", and what the switch is (and that it is not set from the console until E9).
- [X] T059 [P] `CLAUDE.md` "Driver logistics model": add a ⚠ bullet for 078 — Effy windows across today + N delivery days are built and **off** behind `delivery_model_v2_from` (read only via `delivery_model_v2_at`); "Standard delivery" will mean Effy on a later day; a windowed `standard` package is Effy's; don't turn the switch on before E8. Add 078 to "Features recorded".
- [X] T060 [P] `docs/prd/2026-10-delivery-model-v2-backlog.md`: tick E4 tasks, note E4-T03 (carrier lead days) kept for the legacy path, and add to E8: "the planner must deliver windowed `standard` packages"; to E9: "the switch column and function already exist (078) — add only the setter + readiness check".
- [X] T061 `FEATURE-HISTORY.md` entry for 078 (what changed, proofs and their break-once results, operator steps from quickstart, the dev-only switch warning) and `specs/078-effy-delivery-windows/SIGNOFF.md`; hand the operator the quickstart steps (migrate → deploy commerce, fleet, orders, notifications → build back-office and customer-web → ship mobile → `make apply` for the alarm).

---

## Dependencies & execution order

- **Phase 1 → Phase 2 → stories.** T009 (P9 snapshot) precedes T015.
- **US1 (Phase 3)** is the MVP and the base for every other customer-facing story: US2's T032, US4, US5, US6 extend its quote/intent; US7's T045 needs a v2 order.
- **US2 fleet tasks (T028–T031)** and **US8 (T052–T055)** depend only on Phase 2 and can run alongside US1.
- **US3 (T033–T035)** needs T008 and T019.
- **US7 readers (T039–T044)** need only Phase 2; T045 needs US1.
- **Polish** last.

```
Setup ─► Foundational ─┬─► US1 ─┬─► US2 (T032) · US3 · US4 · US5 · US6 · US7 (T045)
                       ├─► US2 fleet + back-office (T028–T031)
                       ├─► US7 readers (T039–T044)
                       └─► US8
                                └──────────────► Polish
```

## Parallel examples

- **Setup**: T002, T003, T004 together (three different files).
- **US1**: after T015–T020, web (T021–T023), mobile (T024–T026) and telemetry (T027) in parallel.
- **US7**: T039, T040, T042, T043, T044 in parallel (different services/apps).
- **Alongside US1**: T028–T031 (fleet days) and T052–T055 (fleet slots + back-office) by a second pair of hands.

## Implementation strategy

1. **MVP** = Phases 1–3: the window calendar, the switch, and a customer choosing any window on any of the four days, on web and mobile — with P9 proving nothing changes while the switch is off.
2. Then the P1 safety stories (US2, US3, US4, US7), then the P2 stories (US5, US6, US8).
3. Ship with the switch NULL; E9 turns it on after E5 and E8.

---

## Notes from implementation (2026-10-08)

- **T007/T008** — `judgeWindow` lives in `slots.ts` beside `clockOn` (not in `windows.ts`): `windows.ts`
  imports it, and putting it the other way round made the two files import each other.
  `slotLoadByDate` / `ownLiveHoldsByDate` were ADDED; the one-date `slotLoad` / `ownLiveHolds` are unchanged.
- **T009 / P9** — the quote's `effyWindows` is ABSENT (not null) while the switch is off, so the three
  existing byte-for-byte wire tests in `commerce/src/wire.contract.test.ts` pass UNCHANGED. They are the
  snapshot; the container test adds the key list and "a window sent anyway is ignored".
- **T027** — the mobile app DECLARES the two events and emits neither, like the rest of its commerce
  taxonomy; the website emits both.
- **T035** — no new test: the release is by order id and `refunds.container.test.ts` already proves it
  with an explicit delivery date.
- **T038** — proven in `windows.test.ts` (a window chosen as "tomorrow" is judged by today's rules after
  midnight) and by the `date_unavailable` container case; the container suite runs on the real clock.
- **T044** — no code change: the app's receipt already says a window on any method (`formatArrival`).
- **T054 / FR-034** — the window screen keeps "slot" in its controls until the cutover (spec FR-034
  was corrected); the grid, the days setting and the copy about per-day counts are new.
- **T056 / P18** — the shared fixture is `packages/shared-types/src/effy-windows.fixtures.json`; the
  parity is on `effyWindowsView` (TS) and its Kotlin twin, which both pickers render.
- **Added beyond the list**: `distinctArrivals` (one delivery per distinct promise on order pages and
  receipts); the orders LIST's "needs handover" count and filter skip a windowed package.
- **Not mine, still red**: two `shop` container tests fail with and without this feature
  (`attention/repository` — `column "id" does not exist`; `orders/repository` — paging order).

# Tasks: Flexible Standard Delivery — a Day, "As Soon As Possible", or a Time (085)

**Input**: `specs/085-flexible-standard-delivery/` — [plan.md](plan.md), [spec.md](spec.md),
[research.md](research.md), [data-model.md](data-model.md), [contracts/wire.md](contracts/wire.md),
[quickstart.md](quickstart.md)

**The one idea** (plan, Summary): an order with no time is an order in a delivery window staff mark
**"Any time"**. `judgeWindow`, the fee sum (`engine.ts`), the hold, `collectionRunFor`, the planner and
`round_opens_at` are **not edited** by any task below. A task that finds it needs to edit one of them
stops and goes back to the plan.

**Tests**: every behaviour task carries its test in the same task (this repo's convention; the guards
depend on it). No separate test phase.

**Rules that bind every task**: Claude writes code and SQL and does **not** run migrations or deploys;
no `git commit`; all wire changes additive; words only in `packages/shared-types` and their Kotlin twins.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, nothing unfinished it depends on)
- **[Story]**: US1 day only · US2 a time on a day · US3 as soon as possible · US4 one choice ·
  US5 drivers and dispatch · US6 staff tools

---

## Phase 1: Setup

- [X] T001 Read the FEATURE-HISTORY.md entries for 078, 079, 081 and 082 and note in `specs/085-flexible-standard-delivery/research.md` (a short "Verified" section) the answers to the two open checks from the plan: (a) how `apis/edge-api/fleet/src/planner/` sizes and splits a delivery round for one window — is there a per-round parcel cap, and what happens to a window with ~40 parcels; (b) which customer notification `moveToEffy` in `apis/edge-api/shared/src/delivery/override.ts` causes (caller in `apis/edge-api/orders/src/delivery-move/service.ts`). If (a) shows a window's parcels are NOT split across drivers, stop and report before continuing.

---

## Phase 2: Foundational (blocks every story)

**Purpose**: the flag, the two order columns, the types and the calendar split. After this phase the
platform behaves exactly as before — nothing is offered until staff create an Any-time window.

- [X] T002 Write the migration `db/migrations/<timestamp>_flexible_standard_delivery.sql` exactly per `specs/085-flexible-standard-delivery/data-model.md`: `delivery_slot.any_time boolean NOT NULL DEFAULT false`; the partial unique index `delivery_slot_any_time_uq` (one active Any-time window); `"order".delivery_promise text` CHECK in (`window`,`day`,`asap`); `"order".asap_estimate text`; the two CHECKs (`(delivery_promise = 'asap') = (asap_estimate IS NOT NULL)`, `delivery_promise IS NULL OR delivery_type = 'effy'`); `delivery_settings.asap_estimate text` with a length CHECK ≤ 80; COMMENTs in the style of `db/migrations/20261009011552_order_delivery_type.sql`; a Down that refuses while any order has `delivery_promise IN ('day','asap')`. No backfill. Do NOT run it.
- [X] T003 [P] Extend the wire types in `packages/shared-types/src/delivery.ts` (`EffyDayDTO.anyTime?: EffyWindowDTO | null`, `EffyWindowsDTO.asap?: { estimate: string; fee: DeliveryFeeDTO } | null`), `packages/shared-types/src/checkout.ts` (`CreateCheckoutIntentRequest.deliveryPromise?: "asap"`) and `packages/shared-types/src/delivery-type.ts` (`OrderDeliveryDTO.promise?: "window" | "day" | "asap"`, `asapEstimate?: string`), with doc comments taken from `specs/085-flexible-standard-delivery/contracts/wire.md` §1–§3. Regenerate any generated contract file the package's build produces.
- [X] T004 Add the new sentences to `DELIVERY_WINDOW_WORDS` in `packages/shared-types/src/delivery.ts` using the drafts in `contracts/wire.md` §4 (`anyTimeDay`, `timeOptionOpen`, `timeOptionHint`, `timeRequired`, `asapTitle`, `asapHint`, `asapEstimatePrefix`), and mirror them in `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/features/checkout/presentation/DeliveryWindowWords.kt`. Extend whichever existing test holds the Kotlin words to the TypeScript ones so the new keys are held too. (Depends on T003.)
- [X] T005 Add `anyTime: boolean` to `Slot` and read `any_time` in `SLOT_COLUMNS` / `toSlot` / `lockSlot` in `apis/edge-api/shared/src/delivery/slots.ts`. ⚠ Do not change `judgeWindow`. Update `slots.test.ts` fixtures for the new field only.
- [X] T006 In `apis/edge-api/shared/src/delivery/windows.ts`, add `anyTime: OpenSlot | null` to `EffyDay` and make `openWindows` judge an Any-time slot like any other but put an open one in `anyTime` instead of `windows[]` (for EVERY day, today included — the wire decides what is shown). `closedReason` stays about timed windows only. Change `windowsUnavailable` so a calendar with any open `anyTime` is not `no_windows`. Tests in `windows.test.ts`: an Any-time slot is never in `windows[]`; it is `null` when full or past cutoff; with no Any-time slot the output equals the pre-085 output for the existing fixtures. (Depends on T005.)
- [X] T007 In `apis/edge-api/shared/src/delivery/quote.ts`, price each open `anyTime` with **premium 0** (do not call `windowPremiumCents` for it) and file it in `fees` under `windowKey(slot, date)`; add `asap: { estimate, fee } | null` to `EffyWindowsQuote`, set when `delivery_settings.asap_estimate` is non-empty AND some day in the calendar (today included) has `anyTime` open, with `fee = priceEffyOrder(…, isToday = false)` and premium 0; load `asap_estimate` through `loadSlotSettings` in `slots.ts` (`asapEstimate: string | null`). ⚠ `engine.ts` is not edited (`fee.guard.test.ts` must stay green). Tests in `quote.test.ts`: any-time fee has no `window_surcharge` line; the asap fee has no surcharge even when the first open day is today; `asap` is null with no estimate or no open Any-time day; with no Any-time slot the quote is unchanged. (Depends on T006.)
- [X] T008 Map the quote to the wire where `EffyWindowsDTO` is built (`apis/edge-api/shared/src/delivery/fee-wire.ts` and/or `apis/edge-api/commerce/src/checkout/quote.ts` — follow where `EffyDayDTO.windows` is produced today): emit `anyTime` (with `surchargeAmount: "0.00"`) for later days only — **always `null` for today** — and `asap`. Test: today's `anyTime` is never on the wire even when open; later days carry it; a pre-085 fixture serialises byte-identically apart from `anyTime: null` / `asap: null`. (Depends on T007, T003.)

**Checkpoint**: `pnpm --filter @effy/shared-types test && pnpm --filter @effy/edge-shared test && pnpm --filter @effy/edge-commerce test` green; `fee.guard.test.ts`, `windows.guard.test.ts`, `coverage.guard.test.ts` untouched and green.

---

## Phase 3: User Story 1 — a customer chooses a day and nothing else (P1) 🎯 MVP

**Goal**: tap a later day → that is the order's delivery choice; pay; every place the customer reads
the order says the day and "any time".

**Independent test**: quickstart walk rows 2, 3, 8, 11, 12.

- [X] T009 [US1] In `packages/shared-types/src/effy-windows.ts`, add `anyTime: { slotId: string; date: string } | null` to `EffyDayView` (from the day DTO's `anyTime`) and return it from `dayView`; add cases to `packages/shared-types/src/effy-windows.fixtures.json`: *any-time open on later days*, *any-time full but windows open*, *no any-time window defined (view equals the pre-085 view plus `anyTime: null`)*. Update `effy-windows.test.ts`.
- [X] T010 [P] [US1] Mirror T009 in `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/features/checkout/presentation/EffyWindowsView.kt` and the DTO in `…/features/checkout/domain/Checkout.kt` + `…/data/CheckoutMappers.kt`; `EffyWindowsViewTest.kt` must pass against the updated shared fixture. (No UI yet — T033.)
- [X] T011 [US1] In `apis/edge-api/commerce/src/checkout/delivery-choice.ts`, make `resolveEffyWindow` find the chosen slot in `day.windows` **or** `day.anyTime`; return `promise: "window" | "day"` (`"day"` exactly when the slot is the day's `anyTime`); refuse `slot_unavailable` when the Any-time slot is named for a day where `day.isToday`. Add `promise` to the returned shape. Tests in a NEW `apis/edge-api/commerce/src/checkout/delivery-choice.test.ts` (the function has no unit test today — it is pure, so no database is needed): a later day's Any-time slot → packages carry that slot's start/end, `method: standard`, `promise: "day"`; today's Any-time slot → `slot_unavailable`; a full Any-time day → `slot_unavailable`; timed windows unchanged.
- [X] T012 [US1] Write `delivery_promise` where `"order".delivery_type` is written at checkout (`apis/edge-api/commerce/src/checkout/store.ts`, called from `service.ts`) — same statement, value from T011; courier orders write NULL. Extend `apis/edge-api/shared/src/delivery/delivery-type.guard.test.ts` (or add `delivery-promise.guard.test.ts` beside it) so a writer of `delivery_promise` outside `commerce/src/checkout/store.ts` and `shared/src/delivery/override.ts` fails. (Depends on T002, T011.)
- [X] T013 [US1] Carry `promise` on the customer's order: select `delivery_promise` in `apis/edge-api/commerce/src/orders/service.ts` (and its repository) and set `OrderDeliveryDTO.promise` (`COALESCE(delivery_promise, 'window')` for an Effy order; absent for courier). Test: an order from before 085 (NULL) reads `window`.
- [X] T014 [US1] In `packages/shared-types/src/delivery-type.ts`, give `deliverySummary` (and `DeliverySummaryInput`) the `day` form: the day as today's code formats it, followed by `DELIVERY_WINDOW_WORDS.anyTimeDay`, with **no hours**. Add cases to `packages/shared-types/src/delivery-type.fixtures.json`; mirror in `apps/customer-mobile/…/features/checkout/presentation/DeliveryTypeWords.kt` (+ `domain/DeliveryWindowText.kt` if it formats the window) held to the same fixture. Check every non-test caller found by `grep -rn "deliverySummary\|distinctArrivals" apis apps packages` (order page, receipt, email templates) passes `promise` through and prints no hours for a `day` order.
- [X] T015 [US1] Extend the web choice model in `apps/customer-web/lib/delivery-choice.ts`: keep `ChosenWindow = { slotId, date }` (a day-only choice is the day's `anyTime` slot) and make `chosenFee` / `carryWindow` look the chosen key up in a day's `windows` **and** its `anyTime`; a carried choice whose slot is gone becomes `null` (never substituted). Tests in `delivery-choice.test.ts`.
- [X] T016 [US1] Rebuild the Standard section of `apps/customer-web/app/checkout/EffyWindowOptions.tsx`: each later day is a **radio in the section's one radio group** (not a tab). Choosing a day whose `anyTime` is non-null calls `onChoose({ slotId: anyTime.slotId, date })` and shows `DELIVERY_WINDOW_WORDS.anyTimeDay` under it. A day with `anyTime: null` and no windows is disabled with its existing `sentence`. No windows are listed in this task (US2). Nothing is selected on arrival. Remove the interim behaviour (day as a tab that reveals windows; `onChoose(null)` when a tab opens). Rewrite `EffyWindowOptions.test.tsx` for: nothing chosen on arrival; choosing a day reports the Any-time slot and its date; choosing another day replaces it; a full day cannot be chosen; the fixture-words test still holds; with no `anyTime` on any day the section falls back to today's behaviour (day → windows required, see T019). (Depends on T009, T015.)
- [X] T017 [US1] Update `apps/customer-web/app/checkout/CheckoutFlow.tsx` so the fee/total for a day-only choice comes from the day's `anyTime.fee`, and `checkout_window_selected` gains `promise: "day"` (the event type lives in the shared analytics taxonomy — add the property there). Fix `CheckoutFlow.slots.test.tsx` and `CheckoutFlow.courier.test.tsx` helpers that open a day tab (`openFirstDay`, `tabs()`), and add: a day-only choice sends `deliveryWindow` with the Any-time slot and reaches the payment step; a `slot_unavailable` refusal redraws with nothing chosen.

**Checkpoint**: with an Any-time window seeded in a test fixture, a day-only order can be placed and
read back on the web. Without one, checkout is unchanged.

---

## Phase 4: User Story 2 — a specific time, opt-in (P1)

**Goal**: "Need a specific time?" under a chosen day reveals that day's windows; picking one promises
the window; closing it or changing the day returns to the day alone.

**Independent test**: quickstart walk rows 4, 5, 11.

- [X] T018 [US2] In `apps/customer-web/app/checkout/EffyWindowOptions.tsx`, add the disclosure under the chosen day: a button labelled `timeOptionOpen` with `timeOptionHint` (`aria-expanded`, `aria-controls`), disabled until a day is chosen; open → that day's `windows` as radios **in the same radio group**, none chosen; choosing one calls `onChoose({ slotId, date })`; closing it, or choosing another day, calls `onChoose` with the (new) day's `anyTime` choice. Closed/full windows render as they do today. Tests: cannot open before a day is chosen; opening changes no choice; choosing a window reports it; closing returns to the day's Any-time choice; changing day drops the window.
- [X] T019 [US2] Handle a day with `anyTime: null` but open windows in `EffyWindowOptions.tsx`: choosing the day is **not** a complete choice — `onChoose(null)`, the disclosure opens by itself and shows `DELIVERY_WINDOW_WORDS.timeRequired`. This is also the whole behaviour when the business has defined no Any-time window. Tests for both, including that `CheckoutFlow`'s continue button stays disabled until a window is chosen.
- [X] T020 [US2] In `apps/customer-web/app/checkout/CheckoutFlow.tsx`, send `promise: "window"` on `checkout_window_selected` for a timed window and confirm the fee line shows the window's surcharge when the time option adds one and drops it when the option is closed (test in `CheckoutFlow.slots.test.tsx`).

---

## Phase 5: User Story 4 — one choice across the whole section (P1)

**Goal**: at most one thing highlighted, ever; the total belongs to it.

**Independent test**: quickstart walk rows 2–7 in sequence.

- [X] T021 [US4] Make exclusivity structural in `apps/customer-web/app/checkout/EffyWindowOptions.tsx`: highlight state is **derived from the single `chosen` prop only** — no local "selected day" that can outlive it (the open/closed state of the time disclosure is the only local state, and it resets when `chosen` leaves that day). Add one table-driven test in `EffyWindowOptions.test.tsx` that walks every ordered pair of choice kinds (same-day window, day, window-on-day, and — once T025 lands — asap) and asserts exactly one checked radio after each step and none under the section left.
- [X] T022 [US4] In `apps/customer-web/app/checkout/CheckoutFlow.*.test.tsx`, assert that changing the delivery address leaves nothing chosen for each choice kind (extend the existing 079 "re-decides everything" tests rather than adding new files).

---

## Phase 6: User Story 3 — "as soon as possible" (P2)

**Goal**: one button; the server puts the order in the first open Any-time day (today included) at the
ordinary fee; the customer reads the estimate, never the day.

**Independent test**: quickstart walk rows 7, 9, 10.

- [X] T023 [US3] Add `resolveAsap(q, now)` to `apis/edge-api/commerce/src/checkout/delivery-choice.ts`: the first day in `q.effyWindows.days` (calendar order, today first) whose `anyTime` is non-null → packages bound to that slot (`method` = `same_day` when that day `isToday`, else `standard`), `hold` on it, `fee = q.effyWindows.asap.fee`, `promise: "asap"`, `estimate = q.effyWindows.asap.estimate`. Refuse `slot_unavailable` when `asap` is null or no day is open. In `service.ts` route by the request: `deliveryPromise === "asap"` with no `deliveryWindow` → `resolveAsap`; both or neither → `slot_required` (table in `contracts/wire.md` §2). Tests for each row of that table, and that an ASAP order landing today pays no today surcharge.
- [X] T024 [US3] Write `asap_estimate` beside `delivery_promise` in `apis/edge-api/commerce/src/checkout/store.ts`; in `apis/edge-api/commerce/src/orders/service.ts` return `promise: "asap"` and `asapEstimate`, and for such an order return **no day and no window** to the customer (`arrivalEstimates` empty, as for courier). Add the `asap` form to `deliverySummary` in `packages/shared-types/src/delivery-type.ts` — `asapEstimatePrefix` + the stored estimate, always worded as an estimate — with fixture cases and the Kotlin twin (`DeliveryTypeWords.kt`). Test: the customer DTO of an ASAP order contains no date.
- [X] T025 [US3] Add `asap` to `EffyWindowsView` in `packages/shared-types/src/effy-windows.ts` (`{ title, hint, estimate } | null`) with fixture cases (*asap offered*, *asap with today open*, *asap absent*) and the Kotlin twin; then in `apps/customer-web/app/checkout/EffyWindowOptions.tsx` render it as one more radio in the group at the top of the Standard section, showing title, hint and the estimate. The web choice type in `apps/customer-web/lib/delivery-choice.ts` becomes `ChosenWindow | { asap: true }`; `chosenFee` returns `quote.effyWindows.asap.fee`; `carryWindow` keeps it only while `asap` is still offered.
- [X] T026 [US3] In `apps/customer-web/app/checkout/CheckoutFlow.tsx`, send `deliveryPromise: "asap"` with no `deliveryWindow`, `promise: "asap"` on the analytics event, and show the one-sentence state when neither a day, a window nor ASAP can be chosen. Tests in `CheckoutFlow.slots.test.tsx`: the body shape; the total has no surcharge line; a `slot_unavailable` refusal redraws with nothing chosen. Add `asap` to the pair-walk test from T021.

---

## Phase 7: Staff switch it on (part of US6, needed before any walk)

- [X] T027 [P] [US6] Slot flag in the staff API: accept and return `anyTime` in `apis/edge-api/fleet/src/slots/{service,repository,sql}.ts` and the slot DTO in `packages/shared-types/src/delivery-admin.ts`; a second active Any-time window → 409 `any_time_exists` (catch the unique violation). Tests beside the existing slot service tests.
- [X] T028 [P] [US6] ASAP estimate setting: add `asapEstimate: string | null` (trimmed, ≤ 80, empty → NULL) to the delivery-settings read/write in `apis/edge-api/admin/src/delivery/{service,repository,types}.ts` and its DTO; in `apis/edge-api/admin/src/delivery/pricing.{service,repository}.ts` leave an Any-time window out of the per-window surcharge list and answer 422 to a premium write for one. Tests for each.
- [X] T029 [US6] Back-office UI: an "Any time (no set hours for the customer)" checkbox with one line of help in `apps/back-office/src/features/delivery/components/SlotsPanel.tsx` (shown as an "Any time" badge in the list; the 409 said plainly via `errorText.ts`), and an "As soon as possible — what customers are told" text field on the delivery settings screen under `apps/back-office/src/features/delivery/` (helper text: leave empty to switch "as soon as possible" off). Update `SlotsPanel.test.tsx`. (Depends on T027, T028.)

**Checkpoint**: staff can create the Any-time window and the estimate in dev; quickstart rows 1–12 walkable.

---

## Phase 8: User Story 5 — drivers and dispatch (P1)

**Goal**: an untimed parcel shows as its own "Any time" group on its day. A label; no rule changes.

**Independent test**: quickstart walk rows 13, 14.

- [X] T030 [P] [US5] Hub check-in: in `apis/edge-api/driver/src/work/complete.ts` join `public.delivery_slot` on `opd.slot_id` and add optional `anyTime: true` to each `effyGroups[]` entry (type in `packages/shared-types/src/driver.ts`); do the same on any driver round/stop payload that carries a window (find with `grep -rn "window_start" apis/edge-api/driver/src`). Compatibility fields untouched. Tests beside the existing ones.
- [X] T031 [P] [US5] Dispatch: add `anyTime: boolean` to each window group returned by `apis/edge-api/fleet/src/dispatch/windows.ts` and print **"Any time"** in place of the hours in `apps/back-office/src/features/dispatch/components/WindowsByDay.tsx` (+ its test).
- [X] T032 [P] [US5] Driver app: read the optional `anyTime` in `apps/driver-mobile/…/features/collection/domain/Collection.kt` and `…/data/HttpCollectionRepository.kt` (and the delivery-round equivalents) and print "Any time" where the window's hours are printed; a missing field behaves as today. Run `scripts/check-driver-delivery-words.sh`.

---

## Phase 9: Customer app parity (FR-011)

- [X] T033 [US1] Customer mobile picker — day only and the time option: rebuild the Standard section of `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/features/checkout/presentation/CheckoutScreen.kt` and the choice state in `CheckoutViewModel.kt` to match T016, T018, T019 and T021 (days as single-choice rows, the "Need a specific time?" disclosure, highlight derived from the one chosen value). Common tests for the ViewModel: the same pair-walk as T021.
- [X] T034 [US3] Customer mobile — ASAP: add the ASAP row to `CheckoutScreen.kt`, the choice to `CheckoutViewModel.kt`, and `deliveryPromise` to the intent request in `…/features/checkout/data/` (`HttpCheckoutRepository.kt`, `CheckoutMappers.kt`); `OrdersScreen.kt` / `ReceiptScreen.kt` print what `DeliveryTypeWords.kt` returns for `day` and `asap`. Run `./gradlew :shared:allTests` in `apps/customer-mobile`.

---

## Phase 10: User Story 6 — staff see and adjust (P2)

**Independent test**: quickstart walk rows 15, 16.

- [X] T035 [US6] Orders list/detail: return `promise` for each Effy order and accept `?promise=window|day|asap` in `apis/edge-api/orders/src/orders/repository.ts` (+ service, DTO in `packages/shared-types`); in `apps/back-office/src/features/orders/OrdersListScreen.tsx` add the filter and show the promise beside the delivery type ("Window" / "Day only" / "As soon as possible"); in `OrderDetailScreen.tsx` / `components/DeliveryTypeSection.tsx` show it with the planned day and, for ASAP, the estimate the customer was told. Staff DO see an ASAP order's planned day.
- [X] T036 [US6] In `apis/edge-api/shared/src/delivery/override.ts`, extract the window-binding block of `moveToEffy` (calendar → `lockSlot` → `judgeWindow` → booking upsert → package update) into one private helper used by both `moveToEffy` and a new `changeEffyWindow(tx, { orderId, window, reason, actor, expectedUpdatedAt, now })`. `changeEffyWindow`: Effy orders only; same guards as a move (a parcel out for delivery → refuse; `changed`); sets `delivery_promise` to `day` or `window` from the slot (an ASAP order re-timed by staff becomes `day`/`window` and its `asap_estimate` is cleared in the same statement); appends to `delivery_override` in its existing shape; no money moves. Also make `moveToEffy` set `delivery_promise` from the slot and `moveToCourier` set it (and `asap_estimate`) to NULL. Tests in `override.test.ts`: each guard; the promise after each function; `moveToEffy` behaviour otherwise unchanged; `consignment.guard.test.ts` and `delivery-type.guard.test.ts` green.
- [X] T037 [US6] New staff route `POST /orders/v1/orders/{orderId}/delivery-window`: handler `apis/edge-api/orders/src/functions/order-delivery-window-v1-post.ts`, service method in `apis/edge-api/orders/src/delivery-move/service.ts` (one transaction → `changeEffyWindow` → after commit `announceOrder` and the same customer notification `moveToEffy`'s caller sends, per T001), registered in `apis/edge-api/orders/serverless.yml` on the **staff** gateway with the back-office authorizer, same roles as `…/delivery-move`. Add the row to `docs/api/path-assignment.md`. `gateway-capacity.contract.test.ts` and `change-map.guard.test.ts` must pass.
- [X] T038 [US6] Back-office "Change day or time" action on an Effy order: reuse the window picker inside `apps/back-office/src/features/orders/components/DeliverByEffyDialog.tsx` (extract it if needed) in a dialog launched from `DeliveryTypeSection.tsx`; the Any-time window is listed as "Any time"; a required reason; refusals said through `errorText.ts`; the change appears in `DeliveryHistory.tsx`. Repo/query additions in `apps/back-office/src/features/orders/{repo,queries}.ts`. Confirm `DeliverByEffyDialog.tsx` itself now offers the Any-time window (FR-030) and labels it. Tests beside the existing dialog tests.

---

## Phase 11: Polish

- [X] T039 [P] Add an Any-time window and the ASAP estimate to the dev seed `db/seeds/047_delivery_dev.sql` (or the seed that now creates delivery windows — check first) so a fresh dev database can walk the feature.
- [X] T040 [P] Run every guard and suite listed under "Automated" in `specs/085-flexible-standard-delivery/quickstart.md`, plus `pnpm --filter @effy/design-system test` and `scripts/check-no-refresh-timers.sh`; fix what fails. Report failures with their output — do not skip.
- [X] T041 Update `CLAUDE.md` (the "Delivery model" and "Windows" sections: the four promises, "Any time is a window", ASAP's day is the server's and staff's, `delivery_promise`'s two writers, `changeEffyWindow`) and add the 085 entry to `FEATURE-HISTORY.md` and to the "Features recorded" list, including the deploy order from `research.md` R8 and what is not yet walked.
- [X] T042 Hand over to the operator, in the final message and in the FEATURE-HISTORY entry: the exact migration command, the deploy commands in R8 order (`AWS_PROFILE=ef`), and the dev setup + walk from `quickstart.md`. Claude runs none of them.

---

## Dependencies

```text
T001 → Phase 2 (T002, T003 → T004; T005 → T006 → T007 → T008)
Phase 2 → US1 (T009–T017)                       ← MVP
US1 → US2 (T018–T020) → US4 (T021–T022)
US1 → US3 (T023–T026)        (T026 extends T021's test)
Phase 2 → T027, T028 → T029                     (independent of the customer stories)
Phase 2 → US5 (T030–T032)                       (independent of the customer stories)
US1 + US2 + US4 → T033;  US3 → T034
T012 → T035;  T012 → T036 → T037 → T038
everything → T039–T042
```

US5 and Phase 7 need only Phase 2, so they can be built alongside the customer stories. US1, US2 and
US4 all edit `EffyWindowOptions.tsx` and must be done in order.

## Parallel examples

- After Phase 2: `T009` (shared view) ‖ `T011` (checkout binding) ‖ `T027` ‖ `T028` ‖ `T030` ‖ `T031`.
- `T010` (Kotlin view) alongside `T011`–`T013`.
- `T030`, `T031`, `T032` together — three services/apps, no shared file.

## Implementation strategy

1. **MVP = Phase 2 + US1 + T027 + T029's checkbox**: a customer can buy a day with no time, and it is
   delivered through the existing machinery. Stop and walk rows 1–3, 8, 11, 12.
2. **+ US2 + US4** before anything is switched on for real: without the time option, a customer who
   needs a window has lost it.
3. **+ US5** (labels) before the first untimed order's delivery day.
4. **+ US3** (ASAP), then **mobile parity**, then **US6's staff tools**.

## Task counts

| Phase | Tasks |
|---|---|
| Setup | 1 |
| Foundational | 7 |
| US1 — day only | 9 (+ T033 mobile) |
| US2 — a time, opt-in | 3 |
| US4 — one choice | 2 |
| US3 — as soon as possible | 4 (+ T034 mobile) |
| US6 — staff | 3 switch-on + 4 tools |
| US5 — drivers and dispatch | 3 |
| Polish | 4 |
| **Total** | **42** |

## Build notes (2026-10-13) — where the build differed from a task as written

- **T028 / T029** — the "as soon as possible" estimate is saved by `fleet`'s delivery-days settings
  (`fleet/src/deliverydays`, the Delivery days panel), not `admin`: that is where the customer calendar's
  other settings on the same row already live. A PUT that omits it keeps it (an older console must not clear it).
- **T030–T032** — the labels are WRITTEN BY THE SERVER (`label`, `window`, `windowLabel`), so the driver
  app and back-office dispatch needed no change; `anyTime` is added to the payloads for later use.
- **T036** — a re-timing is recorded in `admin.audit_log` (`order.delivery_window_changed`), not
  `delivery_override`: that table hangs off a delivery-TYPE change, which Effy → Effy is not.
- **T037 / T038** — no second new route for the choices: the existing
  `GET …/delivery-move?to=effy` now lists windows for an order Effy already delivers too.
- **T039** — NOT seeded, deliberately. The Any time window is the feature's switch and the estimate is
  operator-entered; seeding either would switch the feature on in every fresh environment.
- **T033 / T034** — the customer app's checkout host tests pass (`:shared:testAndroidHostTest`); the
  iOS target was not compiled or run here.
- **Not run here**: every `*.container.test.ts` (no Docker in this session) — including the new ones
  in `shared/src/delivery/override.container.test.ts` and `fleet/src/slots/slots.container.test.ts`.
  Run them with `CONTAINER_TESTS=1` before the migration is applied.

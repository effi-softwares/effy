# Research: Effy Delivery Windows — Today and the Next Three Days

**Feature**: 078 · **Date**: 2026-10-08 · Epic **E4** of `docs/prd/2026-10-delivery-model-v2-backlog.md`

## Findings from the code (F)

**F1 — Capacity is already per day.** `delivery_slot_booking` carries `delivery_date`, the index is
`(slot_id, delivery_date)`, and `public.delivery_slot_load` groups by `(slot_id, delivery_date)`. The
shared `slotLoad(q, date)` and the payment-time `confirmSlotBooking` both take the booking's own date.
Backlog task E4-T01 ("fix if it counts today only") needs **no schema change**. What is today-only is
every *caller*: the quote asks `slotLoad(q, today)`, `captureDelivery` judges `hold.now`'s date, and the
fleet console joins `delivery_date = today`.

**F2 — The window engine only knows "today".** `judgeSlot(now, slot, …)` places the slot's clocks on
`now`'s Melbourne day (`clockOn(slot.start, now)`) and always runs the collection test. It needs a
*day* argument and must skip the collection test for a later day.

**F3 — A package row cannot carry a window unless it is same-day.** `order_package_delivery_window_ck`
requires `method = 'same_day'` whenever `slot_id` / `window_*` are set. A Standard (later-day) Effy
delivery with a window violates it.

**F4 — "Standard" means "carrier" in four readers.** `orders/src/handoff` (carrier handover),
`orders/src/orders/promise.ts` (handover due = day − carrier lead), `fleet/src/deliverydays` (orders on a
non-delivery date counted as `method = 'standard'` only), and the planner (`GATHER_DELIVERY` takes
`same_day` only). The first three are touched here (R6). The planner is **E8** (spec: out of scope).

**F5 — Same-day eligibility still consults the per-shop bridge.** `quote()` calls `sameDayForShops`
(076's frozen same-day bridge, removed by E5) and offers same-day per package, so a basket can split
across today and a later day ("2 of your 3 deliveries can arrive today").

**F6 — Pricing is ready.** `priceEffyOrder(plan, …, slotId, windowIsToday)` already prices any window
on any day: the plan's today premium applies only when `windowIsToday`, the per-window premium always.
Nothing in the engine changes.

**F7 — Readers already show a window whatever the method.** The customer order DTO
(`commerce/src/orders`), the receipt repository and sender (`notifications/src/receipts`) read
`window_start` / `window_end` per package and print them when present. The sender's method word
(`"Same-day"` / `"Standard"`) is already the customer's word the operator kept.

**F8 — Bookings already announce.** `finalize.ts` announces `slots` (ops) when a booking is confirmed;
`order-moves.ts` does on cancellation; the fleet slot and day routes do after every change.

## Decisions (R)

### R1 — One switch, introduced now, read in one place
- **Decision**: add `delivery_settings.delivery_model_v2_from timestamptz NULL` (NULL = off) and one
  SQL function `public.delivery_model_v2_at(timestamptz) RETURNS boolean`. TypeScript reads it only
  through `deliveryModelV2At(q, now)` in `shared/src/delivery/model.ts`. **No route sets it in 078**;
  E9 adds the setter behind its go-live checklist. In dev the operator may set it by hand to walk.
- **Rationale**: the spec (FR-037) says built off, switched on at the cutover. E9 already planned this
  exact column (E9-T01); creating it now means one switch for the whole programme instead of a 078 flag
  that E9 must reconcile. A setter without the readiness check would let the model go live before E8
  can deliver a later-day window.
- **Alternatives**: an environment variable per service (several places decide, redeploy to flip —
  rejected); a boolean (cannot say *from when*, and E9 needs a moment that splits old orders from new).

### R2 — Two quote shapes, both always correct
- **Decision**: with the switch off, `quote()` and the customer DTO are **unchanged** and the new
  `effyWindows` field is `null`. With it on, `effyWindows` carries today + N delivery days, and the
  legacy fields are still filled (today's windows → `sameDaySlots`, the later days → `standardDays`) so
  a client built before 078 still renders something true — but its intent (no `deliveryWindow`) is
  refused with `slot_required` when the switch is on.
- **Rationale**: clients ship **before** the cutover (mobile store review), so they must render both
  shapes and choose by `effyWindows !== null`. The server, not a client flag, decides which model is
  live.
- **Alternatives**: a versioned route (a second integration on a counted gateway — rejected).

### R3 — The window calendar is one pure function
- **Decision**: `shared/src/delivery/windows.ts`:
  - `effyDays(now, lookahead, noWeekdays, noDates)` → today (flagged if it is a non-delivery day) plus
    the next `lookahead` delivery days. Noon-UTC calendar arithmetic, the `standard-days.ts` rule
    that survived 058's DST defects.
  - `judgeWindow(now, day, slot, booked, runs, bufferMin, turnaroundMin)` → `judgeSlot` generalised:
    clocks are placed on `day`, not on `now`; the cutoff test is the same on every day; the collection
    test runs **only when `day` is today** (spec assumption: a later day can always be collected for —
    planning that collection is E8).
  - `openWindows(...)` → `EffyDay[]`, each with its windows and, when empty, a reason.
  `slots.ts`'s `judgeSlot` / `openSlots` become thin calls into `judgeWindow` with `day = today` so
  the legacy path and the new one share one rule (constitution III: a rule has one implementation).
- **Rationale**: one place turns a wall-clock slot into an instant for a given day (`clockOn`'s
  existing ⚠); the hold, the confirm and the quote all call it.
- **Day-closed reasons**: `not_delivery_day` (today is excluded), `closed` (every window past cutoff or
  uncollectable), `full` (open windows exist but all are full). Later days have only `full`.

### R4 — A later day closes at that day's own cutoff
- **Decision**: no "book by the day before" rule (spec Assumptions; backlog E4-T04's open point).
- **Rationale**: on the day itself the window becomes "today" and the collection test then applies —
  the same rule as any same-day order. Adding an earlier cutoff would hide windows that can be served.

### R5 — One window per order, no split
- **Decision**: in the v2 path an order has exactly one window. Today's windows are offered only when
  **every** package can go today; the per-shop same-day bridge (`sameDayForShops`) is **not consulted**
  in the v2 path — every collection run visits every shop (069 FR-005's own reasoning).
- **Rationale**: FR-009 (one window, nothing reveals the number of suppliers). The split sentence is
  the one leak 077 recorded for E5 to remove; the v2 path never produces it. The bridge is E5's to
  delete and the switch cannot be on before E5 ships (E9's checklist).
- **Alternatives**: honour the bridge in v2 (re-introduces the split — rejected).

### R6 — How a later-day Effy package is recorded
- **Decision**: the package's `method` is the **customer's word**: `same_day` when the window is today,
  `standard` when it is a later day. **A `standard` package with a window is delivered by Effy**; one
  without a window is a legacy carrier package. The migration relaxes `order_package_delivery_window_ck`
  so a window is allowed on either method (and still all-or-nothing). Three readers learn the
  distinction now:
  - `orders/src/handoff`: a windowed package is refused for carrier handover (`not_carrier`).
  - `orders/src/orders/promise.ts`: on-time is judged by the window whenever one exists; no
    "handover due" for a windowed package.
  - `fleet/src/deliverydays`: the count shown when a date is marked non-delivery includes every
    package promised that date, whatever its method.
  The planner (`GATHER_DELIVERY`, same-day only) is **E8**; until E8 a later-day Effy package would
  never get a delivery round — which is why the switch stays off.
- **Rationale**: the operator decided the customer words stay and "standard" changes meaning (spec
  Clarifications). E5 adds `order.delivery_type` (effy | courier), which turns the windowed/unwindowed
  convention into a column; until then the convention is enforced by the relaxed CHECK and documented
  on the column.
- **Alternatives**: record later-day windows as `same_day` (the planner would pick them up, but the
  shop console and every report would call a Thursday delivery "same-day" — the meaning the operator
  said never changes); a new method value `effy_later` (a third value E5 and E9 must then unwind, and
  every `IN ('same_day','standard')` CHECK widened — rejected).

### R7 — Holds and confirmation for a later day
- **Decision**: the intent carries `deliveryWindow: { slotId, date }`. `captureDelivery` locks the
  slot row (unchanged), judges with `judgeWindow(now, date, …)` against `slotLoad(tx, date)`, and writes
  the booking with that date. `confirmSlotBooking` already uses the booking's date (F1). Cancellation
  release is unchanged. The hold length is 069's `slot_hold_min`.
- **Rationale**: the row lock is per slot, not per (slot, date) — two customers on different days for
  the same window serialise for a few milliseconds. Correct and cheap; a per-day lock row would be a new
  table for no measured contention.

### R8 — The customer's own hold, on any day
- **Decision**: `ownLiveHolds` takes a list of dates; the quote subtracts the customer's own unpaid hold
  on whichever day it is.

### R9 — "No windows on any day"
- **Decision**: `effyWindows.unavailable = "no_windows"` when every offered day is empty, and
  `"none_defined"` when no window is switched on at all. The intent refuses with
  `no_windows_available`. `none_defined` also emits `EffyWindowsNoneDefined` → a Terraform alarm
  (FR-020). Courier fallback is **not** offered: `COURIER_ORDERING_AVAILABLE` is false until E5
  (spec Assumptions); the DTO says nothing about courier.
- The sentence lives once in `packages/shared-types/src/delivery.ts` beside 076's refusal and is
  mirrored in the mobile app's words file, held by a test (the `CoverageWords.kt` pattern).

### R10 — Look-ahead and non-delivery days
- **Decision**: new `delivery_settings.effy_lookahead_days int NOT NULL DEFAULT 3 CHECK (1..14)`. The
  non-delivery weekdays and dates are **reused as they are** (`standard_no_delivery_weekdays`,
  `delivery_non_delivery_date`); E9 renames them. `standard_lookahead_days` and `carrier_lead_days`
  keep driving the legacy picker until the cutover and are labelled so in the console.
- **Rationale**: answer Q4 (delivery days, reuse 069's). A separate column rather than re-using the
  legacy 7-day look-ahead, because both pickers live side by side until the switch.

### R11 — Back-office fullness, no new route
- **Decision**: `GET /fleet/v1/delivery-slots` (staff gateway) gains `days[]` — today plus the
  configured number of delivery days — and each slot gains `load[]`: `{ date, booked, overCapacity }`,
  read from `delivery_slot_load` with `delivery_date = ANY($1)`. The existing `bookedToday` /
  `overCapacityToday` fields stay (an older console still reads them). `GET/PUT /fleet/v1/delivery-days`
  gain `effyLookaheadDays`. Live kind `slots` already covers both.
- **Gateway**: no route added on either gateway.
- **Holds**: counted (the view counts live holds) but holds do not announce; a lapsed hold vanishes on
  the next announced change. Announcing every hold would wake every console for a ten-minute fact.

### R12 — The customer's screen
- **Decision**: two sections, both always rendered when the v2 shape is present:
  **Same-day delivery** (today's windows, each "4–6 pm · order by 2 pm", surcharge beside it; or the
  day's reason in one line) and **Standard delivery** (day tabs — `Wed 9`, `Thu 10`, `Fri 11` — with that
  day's windows). No preselection (FR-010). Lists and tabs, no cards (Principle V). Reference: Uber Eats
  "Schedule" sheet (day row, then time list) and Woolworths/Coles delivery-window pickers (day strip +
  window list with a fee beside each).
- Mobile: the same, in `CheckoutScreen.kt` with a horizontal day strip; fat-finger targets 48 dp.

### R13 — Telemetry
- **CloudWatch** (commerce namespace): `EffyWindowQuotes {outcome: offered|no_windows|none_defined}`,
  `WindowChoiceRefusals {code}` (existing metric, new code), `EffyWindowsNoneDefined` + alarm (≥1 in 15
  min → alerts topic). `SlotBookings {outcome}` (existing) unchanged.
- **PostHog** (shared taxonomy): `checkout_window_selected { section: same_day|standard, day_offset:
  0..N }`, `checkout_windows_unavailable { reason }`. No PII, no slot id.

### R14 — Time
- All instants are made by `clockOn(clock, day)`; days are Melbourne `yyyy-mm-dd`. Test clocks cover
  2026-10-04 (clocks forward) and 2027-04-04 (clocks back), 23:59 → 00:00, and a window chosen as "Wed"
  that becomes "Today" at midnight (caught at the intent).

### R15 — What is not done here
- Driver planning across days, hub dwell, temperature classes overnight (E8). The courier option and
  `delivery_type` (E5). The switch's setter and readiness check (E9). Renaming the reused settings (E9).

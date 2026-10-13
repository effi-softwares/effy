# Research: Flexible Standard Delivery (085)

The operator's instruction for this plan: **simple, no complex logic — reuse what exists.** Every
decision below was taken with that as the tie-breaker, and says where the spec was simplified to match.

## R1 — How an order with a day and no time is represented

**Decision**: as an ordinary delivery window that staff mark **"Any time"** — one `delivery_slot` row
with `any_time = true` (for example 12:00–21:00, order by 10:00, capacity 40). A day-only order is an
order that holds a place in that window on that day.

**Rationale**: every downstream rule keys off `(slot, window_start, window_end)`, and none of them has
to change:

| Rule (owner) | What it does with an Any-time window, unchanged |
|---|---|
| `judgeWindow` (`slots.ts`) | Cutoff, today's collectability and capacity — per `(window, date)`. The window's capacity **is** the day's own limit for untimed orders (spec FR-020). |
| Hold at the intent (`delivery_slot_booking`) | One place per order, held and confirmed as now (FR-022). |
| `order_package_delivery_window_ck` | Still all-or-nothing: an untimed parcel has a slot, a start and an end. |
| `collectionRunFor` | Latest run reaching the hub before the window's start (FR-023). |
| Planner bucket `(kind, deadline_at, window_start_at)` | The Any-time parcels of a day form their own round, to the window's end (FR-024). |
| `round_opens_at` | Opens at the window start less `planning_lead_min`. |
| Hub check-in `effyGroups`, dispatch `windows.ts` | Already group by window — the Any-time group appears by itself (FR-025). |
| `moveToEffy` (`override.ts`) | Takes any slot — staff can already move an order onto a day with no time (FR-030). |
| Lateness | Past the window's end, as for any window (FR-026). |

**Alternatives considered**:
- *A package with a day and NULL window.* Rejected: breaks the window constraint, has no capacity
  measure, no collection deadline, no round bucket, is invisible to dispatch (`window_start IS NOT
  NULL`), and reads as a **carrier** package to anything still looking at `slot_id`. Every one of those
  would need its own new rule.
- *A per-day capacity table plus a "spread untimed parcels across the day's window rounds" planner
  step.* Rejected: new table, new planner logic, and a real risk of pushing windowed parcels late.

**Spec simplified to match**: FR-024 (untimed parcels ride their own "Any time" round rather than being
slotted into window rounds), FR-026 (late at the end of the Any-time hours), and the meaning of "during
the day" (the Any-time hours staff set).

## R2 — "As soon as possible"

**Decision**: at the payment-intent call the server walks the same calendar the quote uses (`effyDays`,
today first) and takes the **first day whose Any-time window `judgeWindow` calls open**. From there it
is a day-only order for that day in every respect. The order records that it was *sold* as ASAP and the
estimate text it was sold with; the customer is told the estimate, never the day.

**Rationale**: no new scheduler, no background job, no state. One `find` over a list that is already
computed. "May go today" needs no rule of its own: today's Any-time window is open exactly while its
cutoff has not passed and a collection run can still reach the hub before it starts.

**Fee**: ASAP is priced as a later-day order whatever day it lands on — `priceEffyOrder(…, isToday =
false)` — so the fixed "Delivery today" surcharge never applies (FR-017). The quote carries that one
fee; nothing depends on the day the server picks, so the total the customer saw is the total charged.

**Alternatives considered**: *plan the day later, in a job* (needs a new worker, a "day not yet set"
state everywhere, and a customer notification — rejected); *automatic re-planning when a day slips*
(rejected: staff move it, R6).

**Spec simplified to match**: FR-013a — the platform plans the day once, at payment; only staff re-plan.

## R3 — No window surcharge on an untimed order

**Decision**: the fee engine is not touched. `quote.ts` passes **premium 0** for an Any-time window
(`windowPremiumCents` is not consulted for it), and back-office's Pricing tab does not list an Any-time
window in the per-window surcharge table.

**Rationale**: FR-017 becomes a property of the one fee sum's input, not a new branch inside it
(`fee.guard.test.ts` keeps holding).

## R4 — What the wire gains (and what old apps see)

**Decision**: additive only.
- Quote: each later day gains `anyTime: EffyWindowDTO | null`; `effyWindows` gains
  `asap: { estimate, fee } | null`. An Any-time window is **never** in `windows[]`.
- Intent: a day-only choice is the existing `deliveryWindow { slotId, date }` with the Any-time slot's
  id. ASAP is `deliveryPromise: "asap"` with no `deliveryWindow`.

**Rationale**: an installed customer app (there is no update mechanism) ignores the new fields and
keeps working exactly as today — windows only. The server learns "day only" from the slot, so the
client cannot claim a promise the slot does not back.

**Today is not sold day-only** (spec edge case): today's `anyTime` is never put on the wire, and an
intent naming the Any-time slot on today's date without `deliveryPromise: "asap"` is `slot_unavailable`.

## R5 — What the order remembers, and what everyone is told

**Decision**: `order.delivery_promise` — `window` | `day` | `asap`, NULL on orders from before 085
(which read as `window`) — and `order.asap_estimate`, the text it was sold. Written once, by checkout,
in the same statement that writes `delivery_type`.

Wording has one home, as now: `packages/shared-types` (`DELIVERY_WINDOW_WORDS`, `effyWindowsView`,
`deliverySummary`) with Kotlin twins pinned to the same fixtures. `deliverySummary` gains the two new
forms — *"Thu 15 Oct · any time"* and *"As soon as possible — usually within 2–3 days"* — so the order
page, receipt, email and app follow without their own edits to the words.

**Why a column and not "derive it from the slot"**: a slot can be edited or disabled after the sale,
and an order keeps what it was sold (FR-014). ASAP cannot be derived at all — it is stored as a day.

**The ASAP estimate** is a business setting (`delivery_settings.asap_estimate`), operator-entered and
never seeded — the same shape as the courier service's timeframe. While it is empty, ASAP is not offered.

## R6 — Staff changing an order's day or time (FR-029)

**Decision**: one new function, `changeEffyWindow`, beside `moveToEffy` in `override.ts`, reusing its
window-binding block verbatim (calendar → `lockSlot` → `judgeWindow` → upsert the booking → update the
packages) and its guards (a parcel out for delivery blocks it; `expectedUpdatedAt`). It sets
`delivery_promise` to `window` or `day` from the slot chosen. One staff route in the `orders` service.

**Rationale**: the block exists and is tested; extracting it into a shared helper called by both is a
refactor, not new logic. The customer is told through the notification an order update already sends — ⚠ to verify in tasks which one `moveToEffy` uses, and reuse it.

**Alternatives considered**: a general "reschedule" feature with its own history table — rejected.
⚠ Corrected while building: the change is recorded in `admin.audit_log`, not `delivery_override` —
that table requires a delivery-type change row, and Effy → Effy is refused there by a CHECK.

## R7 — Drivers, dispatch and shops

**Decision**: the only change is a **label**. The driver hub-check-in group, the dispatch window list
and back-office's order rows get an optional `anyTime: true`, and the screens say **"Any time"** where
they would have printed the hours. Installed driver apps that ignore the field print the hours
(e.g. "12 pm – 9 pm") — correct, just less friendly. Shops see nothing new: "Effy driver".

`scripts/check-driver-delivery-words.sh` and `check-shop-delivery-words.sh` are unaffected — "Any time"
is neither "same-day" nor "standard".

## R8 — Rollout

**Decision**: no feature flag. The feature is **off until staff create an Any-time window** and **ASAP
is off until staff enter the estimate**. With neither, the quote carries `anyTime: null` / `asap: null`
and both clients render Standard delivery exactly as today.

**Deploy order**: migration → `commerce` (quote/intent/order) + `notifications` (receipt) → `fleet`,
`driver`, `orders`, `admin` (the slot flag, the estimate, labels, `changeEffyWindow`, pricing) → web
clients → mobile. `storefront` is not touched. Each step is
safe by itself because every wire change is additive.

## R9 — Gateways and capacity

Two new routes, both back-office, both on the **staff** gateway: the ASAP-estimate setting rides the
existing delivery-settings route (no new integration); `POST /orders/v1/orders/{orderId}/delivery-window`
is one new integration on `orders`. The slot flag rides the existing slot routes. Shared gateway: no
new route. `gateway-capacity.contract.test.ts` must still pass.

## Open points — none blocking

- Exact customer sentences are drafted in `contracts/wire.md` for the operator to edit before build.
- SC-008 (less crowding in the busiest window) is measured from existing order data; no new telemetry
  beyond one property on `checkout_window_selected` (`promise`).

## Verified (T001, 2026-10-13)

- **(a) A large window is split across drivers.** `planWave` (`fleet/src/planner/assign.ts`) places
  packages one by one and asks `eligibilityReasons` over the WHOLE round — weight, chilled/frozen,
  stop count and "can it finish by the deadline from its opening time" — so a window's parcels spill
  onto further rounds/drivers when one is full; what no driver can take is `unassigned` and shown to
  dispatch. A long Any-time window makes the finish test easier, not harder. No change needed.
- **(b) A staff move tells the customer by live update only.** `orders/src/delivery-move/service.ts`
  calls `announceOrder` / `announceDispatch` / `announceSlots` after commit; there is no email or push
  for a move today. `changeEffyWindow`'s route does the same. ⚠ So FR-029's "the customer is told" is
  met by the order page updating and saying the new promise — not by a message. A push/email for a
  staff change is not built here (it does not exist for 081's moves either).

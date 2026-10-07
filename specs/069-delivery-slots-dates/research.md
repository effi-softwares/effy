# Research: Delivery Time Slots & Standard Delivery Date

Every finding below was read from the code on `dev`, not from status notes.

## R1. There is no delivery promise today

**Finding.** `order_package_delivery.promised_from` / `promised_to` exist and are read by eleven
files, but nothing writes them. `resolveDelivery` (`features/checkout/service.go`) builds each
`PackageDelivery` with a method and a fee only; `store.go:45` says "PromisedFrom/To are nil for
US1". Every order on the platform therefore shows "We'll confirm your delivery date"
(`ArrivalPanel.tsx`, `receipts/sender.ts`).

**Consequence.** The PRD's "a date range the platform computes" and the spec's first draft both
described something that does not exist. The spec was corrected (Why this slice exists, FR-049,
US7 scenario 5, the earliest-day assumption).

**Decision.** This slice is the first writer. A same-day package gets `promised_from =
promised_to =` the Melbourne delivery date; a standard package gets both `=` the chosen day.

**Rationale.** Every existing reader already renders `from == to` as a single day ("today",
"Thursday 8 October"). Writing the columns the readers were built for means the receipt email, the
web panel and the mobile receipt show the day with no change, and only the window is new work.

**Alternative rejected.** A new `chosen_date` column: a second column for one fact, and eleven
readers to repoint.

## R2. The shop's ready-by must not become the customer's delivery day

**Finding.** `FinalizeSucceeded` copies `promised_ready_at = opd.promised_to` onto
`shop_fulfillment`. `edge-api/shop/src/fulfillments/promise.ts` uses that as the shop's `readyBy`
and escalates a portion 15 minutes before it. It is `NULL` on every order today (R1), so the shop
falls back to "one hour after placement".

**Consequence.** Writing `promised_to` without touching that line would tell a shop that an order
for next Thursday is not due until next Thursday. The spec holds standard packages at the **hub**,
not at the shop: the shop picks now, as it does today.

**Decision.** Remove the copy. `promised_ready_at` stays `NULL` and the shop's uniform derivation
stands. A container test places a standard order five days out and asserts the shop's `readyBy` is
within an hour of placement.

**Alternative rejected.** Setting `promised_ready_at` to the collection run's cutoff: a real
improvement to the shop queue, but a change to 020's ordering that nobody asked for in this slice.

## R3. "Re-check at payment" has to be a hold

**Finding.** Payment is confirmed by the client directly with the provider. The server creates a
payment intent (`CreateCheckoutIntent`) and learns the outcome from a webhook
(`HandleWebhook → FinalizeSucceeded`) after the money has moved. There is no server step between
"customer presses pay" and "customer is charged".

**Consequence.** A check at finalize cannot satisfy "MUST NOT be charged". The only server moment
before the charge is the intent call.

**Decision.** The intent call checks the slot and, in the same transaction, **holds** a place for
the order for `slot_hold_min` (default 10). Held places count against capacity. Finalize turns the
hold into a confirmed booking. A hold that lapses unpaid stops counting; there is no sweeper,
because the count query ignores lapsed holds.

Each intent call for the same order refreshes or moves the hold (`UNIQUE(order_id)`), so changing
slot never holds two places.

**The late payer.** A payment intent stays payable after the hold lapses. If the webhook arrives
after the hold has ended and the slot is now full or past cutoff, the choices are to overbook by
one or to refund a paid grocery order automatically. The spec forbids moving the order (FR-010).
The booking is confirmed with `over_capacity = true` and a metric is raised. Both clients re-run
the intent call when the hold has lapsed before confirming, which makes this rare; the server
cannot enforce that, which is why the flag exists.

⚠ **Corrected during implementation: nothing pages.** The alert rule is written
(`infra/observability/alerts/069-delivery-slots.yml`) but, like 054's and 055's, it is not loaded
by anything: the Prometheus stack does not exist. Until it does, an over-capacity booking is
found by a person looking at back-office › Delivery › Time slots ("N over capacity") or at the
order. A slot is also only flagged when it is actually over capacity: a late payer into a slot
that has passed its cutoff but still has room is confirmed unflagged, because nothing about the
evening's capacity was broken.

**Alternatives rejected.**
- *Authorise now, capture at finalize.* Changes the payment flow for every order and every
  pay-over-time method to protect one slot.
- *Check at finalize and refund.* Charges a customer for a slot they did not get (FR-009).
- *Hold while browsing.* Abandoned checkouts would drain an evening's capacity. Spec out of scope.

The spec was corrected to say "proceeds to payment" and to add FR-009a/b and the late-payment
edge case.

## R4. Capacity under concurrency

**Decision.** Inside the capture transaction: `SELECT … FROM delivery_slot WHERE id = $1 FOR
UPDATE`, count live bookings for `(slot_id, delivery_date)`, insert or move the order's booking.
The row lock serialises bookings per slot.

**Rationale.** A partial unique index cannot express "at most N". An advisory lock works but is
invisible in the schema; a row lock on the thing being rationed is the plainest statement of it.
Contention is per slot and each critical section is two statements.

**Proof.** A container test fires 20 concurrent intents at a slot with capacity 3 and asserts
exactly 3 holds (SC-002). Proven by removing `FOR UPDATE` and watching it fail.

## R5. Which slots are open: one pure function on the hot path

**Decision.** `platform/delivery/slots.go` — `OpenSlots(now, slots, booked, runs, bufferMin,
turnaroundMin)`, pure, beside `SameDayCutoff`. A slot is open when all hold:

1. `now ≤ slot.cutoff` (Melbourne wall-clock, today).
2. `booked < capacity`.
3. A collection run is still makeable (`now ≤ run − buffer`, the existing rule) **and** that run
   reaches the hub in time: `run + turnaround ≤ slot.start`.

`turnaroundMin` is a new setting, `sameday_hub_turnaround_min`, default 60. It is a stated
assumption awaiting one timed round, like 063's `planning_lead_min`.

Zone eligibility and shop exceptions stay where they are (`SameDayForShops`). A slot is offered
for the order only if it is open for every package that would go same-day (spec edge case).

**No TypeScript duplicate.** The planner never re-derives a window from wall-clock fields: Go
converts the slot's `time` to an instant once, at booking, and stores `window_start` /
`window_end` as `timestamptz`. 063 needed a pinned Go↔TS duplicate because both sides rebuilt
instants from a schedule; here only one side does.

## R6. Standard days: one pure function, and what "earliest" means

**Decision.** `platform/delivery/standarddays.go` — `AvailableDays(now, runs, bufferMin, leadDays,
lookahead, noWeekdays, noDates)`.

- **Hub day** = today if any collection run is still makeable, otherwise tomorrow.
- **Earliest delivery day** = hub day + `carrier_lead_days` (default 1), moved forward past
  non-delivery days.
- Offer `lookahead` deliverable days from there. Non-delivery days are skipped and do not count
  (FR-016). If the calendar blocks a long stretch the list simply starts later; a 60-day scan
  bound returns what it found and never an empty list unless every weekday is excluded, which the
  configuration write refuses (FR-020).

**Handover due day** for chosen day `X` = `X − carrier_lead_days`. **At risk** = today is past
the due day and no `carrier_handoff` row exists, or the handoff was recorded after it. Both are
derived on read in `edge-api/orders`; neither is stored.

**Alternative rejected.** Storing a due date per package: it would go stale the moment the lead
time setting changes, and the at-risk list would disagree with the setting staff can see.

## R7. One choice per method, mixed baskets

**Finding.** `CreateCheckoutIntent` takes one order-level `deliveryMethod` and resolves it per
package, falling back to standard where same-day is not offered. customer-web offers same-day only
when **every** package has it (`CheckoutFlow.tsx:125`), so a mixed order cannot be placed from web
today even though the server supports it (047 SC-011).

**Decision.** The request gains `sameDaySlotId` and `standardDate`. The server requires a slot if
any package resolves same-day and a date if any resolves standard. Clients offer same-day when
**any** package has it, and then ask for both a slot and a day when the basket is mixed (FR-023,
SC-010). Both clients state how many deliveries arrive today.

**The fallback is narrowed.** Today a request for same-day that cannot be met is silently priced
as standard. That is now allowed only for a package the quote never offered same-day on (zone or
shop exception). If the customer sent a slot and it is closed, full or unknown, the intent is
refused with `slot_unavailable` and fresh options (FR-010).

## R8. The quote carries the choices; the fee does not change

**Decision.** `DeliveryQuoteDTO` gains `sameDaySlots[]`, `standardDays[]` and
`sameDayUnavailableReason` (`not_eligible | slots_closed | null`). Fees stay on the per-package
options exactly as today; a slot or a day has no price of its own (FR-021), and clients show the
method's total beside every option (FR-002, FR-017).

`sameDayUnavailableReason` also closes 047's recorded carry-forward: the "same-day unavailable"
note could not tell past-cutoff from not-eligible (FR-004).

`sameDayAvailableUntil` is kept for old clients and now carries the latest open slot's cutoff.

## R9. Where the back-office routes live

**Finding.** `effy-edge-admin` is at the CloudFormation resource ceiling with `versionFunctions:
false` already spent; 053, 054 and 056 each moved out for that reason. It has 72 functions.
`effy-edge-fleet` has 33, `effy-edge-orders` 7.

**Decision.**
- Slot and delivery-day configuration → **`edge-api/fleet`** (`/fleet/v1/delivery-slots`,
  `/fleet/v1/delivery-days`). Slots are delivery capacity, and the planner that must respect them
  lives there.
- The carrier handover list → **`edge-api/orders`**, which owns `carrier_handoff`.
- The screens → new **Time slots** and **Delivery days** tabs in the existing back-office Delivery
  console, and a **Handover** list under Orders. The console's tab is where an operator looks;
  which service answers is not their concern.

T001 measures both stacks' packaged resource counts before any route is added.

## R10. The planner and the window

> ⚠ **"Before that the packages wait at the hub" is SUPERSEDED by [072](../072-immediate-driver-assignment/research.md)**
> (2026-10-07). The packages are assigned on the next pass after check-in; the ROUND waits instead —
> visible to its driver and refused until `window_start − planning_lead_min`. Grouping by window and
> the window's end as the deadline are unchanged.

**Finding.** `planDeliveryWave` plans whatever is at the hub with `deadlineAt = endOfLocalDay`,
under a comment that says the promise is date-granular. `orderRoundStops` already sorts on a
`dueAt` field, and the driver service sets it to `null` (`work/service.ts:61`).

**Decision.**
- `GATHER_DELIVERY` returns each package's `window_start` / `window_end`.
- The delivery wave groups by window. A group is planned once `now ≥ window_start −
  planning_lead_min`; before that the packages wait at the hub. Its `deadlineAt` is `window_end`.
  Packages with no window (pre-069) keep the end-of-day behaviour.
- A drop's `dueAt` is its `window_start`, so the one ordering rule puts earlier windows first on
  both the driver app and the dispatcher console with no change to the rule (FR-031).
- Collection needs no change: every run collects every ready package, and R5's rule already
  refused a slot the last makeable run could not serve (FR-033).

## R11. Due and late

**Decision.** The server sends `window: { startAt, endAt }`. "Due" (`now ≥ startAt`) and "late"
(`now > endAt`) are derived where they are shown, because they change while a screen is open. One
Kotlin function in driver-mobile and one TypeScript function in shared-types, pinned by a shared
fixture file (the 047/063 cross-language pattern).

On-time (FR-035) is `package_arrival.arrived_at ≤ window_end`, derived on read. No new column.

## R12. Snapshots and configuration changes

**Decision.** The window is copied onto `order_package_delivery` and the booking as instants at
intent time. Editing or switching off a slot touches only `delivery_slot`; no placed order reads
it again (FR-026, SC-009). Slots are never deleted, only switched off, so the booking's foreign
key always resolves.

Marking a non-delivery date returns the count of placed orders carrying it and changes none
(FR-043).

## R13. Cancellation frees the place

**Finding.** `refunds.Repository.CancelOrder` sets the order `canceled` in one transaction.

**Decision.** The same transaction sets the order's booking to `released`. A released booking
stops counting, so the place is offered again if the cutoff has not passed (FR-012).

## R14. Old clients and deploy order

- An old mobile build sends neither field. Standard resolves to the earliest day (the same
  default the new UI preselects). Same-day without a slot is refused with `slot_required`; the old
  build shows its generic checkout error. Acceptable while there are no production users; noted in
  the quickstart.
- **Same-day stops being offered the moment core-api deploys** until at least one slot exists
  (spec assumption). The quickstart puts "create slots" between the migration and the deploy; the
  migration seeds none, because slot times are the operator's to choose.
- Order: migration → `fleet` → create slots → `core-api` → `orders`, `driver`, `notifications` →
  customer-web → apps. core-api before customer-web, as 047 recorded.

## R15. Accountability

Slot and delivery-day writes go through `fleet/src/shared/audit.ts` into `admin.audit_log` with
the actor and the before/after values, and stamp `updated_by` on the row (FR-048). Changes are
admin-only; any active staff member may read (FR-039). The gate is the staff record's role, as in
056.

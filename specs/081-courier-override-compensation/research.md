# Research: Back-Office Courier Override & Compensation (081)

Every decision below was read off the code on `dev` at 35ff6fb5. No external research was needed.

## R1 — Which orders can be moved: only those with a recorded delivery type

**Decision**: A move is offered only for a paid order whose `order.delivery_type` is set (sold under the
new delivery model, 078/079). An order with `delivery_type IS NULL` is refused (`no_delivery_type`).
**Rationale**: `recordDeliveryType` (the one writer, 079 R7) returns `false` for a NULL type and will not
invent history for it — deliberately (079: "its history is not invented"). Moving a pre-model same-day
order would need a first type written by staff, a delivery-method rewrite on a package the 069 planner
reads, and a carrier path that E9 is about to retire.
**Consequence**: like 079/080, the feature is dormant until the cutover; walks need the model switch on
briefly in dev. The spec's assumption was corrected.
**Alternatives**: write a first entry for NULL orders (`reason: staff_change`, `from_type NULL`) —
rejected: it conflicts with the first-entry unique index meaning "the checkout decided".

## R2 — One transaction in the `orders` service, through one shared function

**Decision**: `@effy/edge-shared/delivery` gains `override.ts` with `moveToCourier(tx, …)` and
`moveToEffy(tx, …)`. Route handlers live in `orders` (staff gateway — it already owns the order page,
refunds, consignments and the mode). One transaction:

1. `pg_advisory_xact_lock(72063001)` — the planner's pass lock (blocking), so no pass assigns the
   order's parcels mid-move. Taken **first**, as fleet's `prepare()` does.
2. `order` row `FOR UPDATE` (inside `recordDeliveryType`), then packages, then the points account (074's
   lock order: order before points).
3. Guards (R3) → package rewrite (R5) → driver work (R4) → window (R6) → courier service + mode (R7) →
   `recordDeliveryType(tx, {actor: staff, change: {to, reason: "staff_change", courierEstimate, note}})` →
   the `delivery_override` row → compensation (R8) → notification rows (R10).
4. After commit: `announceOrder`, `announceDispatch(driverIds)`, `announceSlots()`, refund submission
   (R8), metric.

**Rationale**: FR-003 "one step; if any part cannot be done, nothing changes". Every piece already has
one writer that runs in a caller's transaction except the refund submission, which 055 deliberately
splits (record, then submit).

## R3 — Guards (move to courier)

Refused, nothing written, with a code:

| Code | When |
|---|---|
| `not_found` | no such order |
| `not_paid` | payment not succeeded, or order cancelled/completed |
| `no_delivery_type` | R1 |
| `already_courier` | type is already `courier` |
| `handed_over` | any `carrier_handoff` or live consignment `handed_over`+ |
| `delivered` | any `package_arrival` |
| `out_for_delivery` | any package on a `driver_round` of kind `delivery` with status `in_progress` |
| `courier_not_ready` | no active courier fee plan or no default active `courier_service` |
| `compensation_changed` | the amounts recomputed in the transaction differ from what the client previewed (R9) |
| `changed` | the order's `updated_at` differs from the preview's |

`courier_delivery_state` is not consulted as a whole: the model switch must be on for orders to *have*
a type, and `courier_offered` (the platform toggle) governs whether **customers** are offered courier —
staff moving an order in an emergency only need a price and a service. Hence the two explicit checks.

## R4 — Driver work: reuse 073's removal, moved into the shared library

**Decision**: Move fleet's `removeAssignment` and the `PASS_LOCK` statement to
`@effy/edge-shared/delivery/driver-work.ts`; fleet's `unassign` / `assignTo` import it (one
implementation). The override:

- **Delivery work**: every `round_package` in state `assigned` on a delivery round `planned` is removed
  (a round in progress is refused by R3).
- **Collection work**: kept when the order goes **via the hub** (the parcels still have to reach the
  hub — removing it would only make the next pass re-assign it). Removed (state `assigned` only) when it
  goes **from the supplier**. `picked_up` rows are never touched.
- Driver ids affected are returned for `announceDispatch` after commit (fleet's `lib/live.ts` helper is
  moved beside it in shared for the same reason).

**Alternatives**: call fleet's route — rejected, two services, no single transaction.

## R5 — The package rewrite

**To courier**: `order_package_delivery` → `method='standard'`, `slot_id`, `window_start`, `window_end`,
`promised_from`, `promised_to` NULL; `shop_fulfillment.delivery_method='standard'`. Exactly what a courier
checkout writes (079: "a courier package is stored `standard`, no window, no day — that word is
ROUTING").
**To Effy**: `method = 'same_day'` when the chosen date is today (Melbourne), else `'standard'`;
`slot_id`, `window_start/end`, `promised_from/to = date` — what `resolveEffyWindow` writes at checkout.
⚠ Until E8 the planner gathers `same_day` only, so a later-day window gets no driver round; the model is
off until after E8, so this is the same limitation 078 already carries.

## R6 — The window

**To courier**: `UPDATE delivery_slot_booking SET state='released', held_until=NULL` — the same
statement 055's cancellation uses; `released` stops counting in `delivery_slot_load`. The released
slot/date are copied onto the `delivery_override` row.
**To Effy**: `lockSlot(tx, slotId)` then `judgeWindow(now, date, slot, load, runs, buffer, turnaround)`
(the one window rule, 078) must say `open`; then the order's booking row (UNIQUE `order_id`) is
**upserted** to `confirmed` on the new slot/date (`over_capacity=false`). Staff cannot overfill a
window (spec assumption). The windows offered in the dialog come from `effyDays`/`openWindows` for the
order's postcode, through the same calendar the quote uses.

## R7 — Courier service and mode

The order takes the **default active courier service** (`courier_service_id`), its `estimate_text`
(through `recordDeliveryType`'s `courierEstimate`), and `courier_collection` = `'hub'` if any package has
a `picked_up` collection row, else `delivery_settings.courier_collection_default`.
⚠ `consignment.guard.test.ts` makes `consignment.ts` the ONE writer of the mode, so it gains
`setCourierRouting(tx, orderId, {serviceId, collection} | null, actorSub)` — used for the move and for
clearing on the move back (which also cancels any `booked` consignment, as `changeCourierCollection`
does). A move back is refused if any consignment is beyond `booked` (`handed_over`).

## R8 — Compensation: points through 074, money through 055

**Amounts** (pure function `overrideAmounts`, unit-tested):
- `paidCents` = `order.delivery_fee_amount` (the stored total, small-order charge and surcharge
  included).
- `courierCents` = `courierFee({grams, basketCents} from order.delivery_fee_breakdown.inputs, plan:
  courierValues(loadActivePlan(tx,'courier')))`.`totalCents`.
- `differenceCents = max(0, paid − courier)`.
- Points for an amount = `ceil(cents / centsPerPoint)` (in the customer's favour).
- Card refunds are capped at what is still refundable (055's ceiling); the preview shows the cap.

| Kind | Effect |
|---|---|
| `points_difference` (default) | `credit(tx, {kind:'auto_credit', reason:'courier_override_compensation', points, orderId, dedupeKey:'courier_override:<overrideId>', quiet:true})` |
| `free_delivery_points` | same, for `paidCents` |
| `free_delivery_refund` | refund of `paidCents` |
| `refund_difference` | refund of `differenceCents` |
| `none` | nothing; `note` required |

A zero amount on a points/refund kind is recorded and gives nothing (no ledger row, no refund).

**Points** run in the override's transaction (074's `credit` takes a `tx`). `CreditInput` gains
`quiet?: boolean` — skip the "points credited" message, because the override's own message says it.
**Refunds** keep 055's "record first, then submit": the refund row is **recorded in the override's
transaction** (`RefundRepository.recordIn(tx, …)`, new, the body of `record` without its own
transaction), with kind **`delivery`**, reason **`courier_override`** (migration widens both CHECKs; the
`OPERATOR_REASONS` set is not widened — staff cannot pick it from the refund dialog), actor
`back_office`, and idempotency key `courier_override:<overrideId>`. After commit, `refundService.submit
Recorded(refundId)` sends it; a crash between leaves a `submitting` row the existing reconciler resolves.
Points-paid orders follow 055/074's split unchanged.
**Alternatives**: `goodwill` kind — rejected: its key is `orderId:kind:reason:amount`, so two overrides
with the same amount would collapse into one refund, and the kind would read as a gesture the business
did not choose.

## R9 — Preview, then confirm with the expected amounts

`GET …/delivery-move?to=courier|effy` returns the amounts, each choice's effect, the refundable cap,
the windows (for `effy`), the guards that would refuse, and the order's `updatedAt`. `POST` carries
`expectedUpdatedAt` and `expectedAmountCents`; the transaction recomputes and returns 409
`compensation_changed` / `changed` on a mismatch (FR-009). Duplicate POSTs: the order is already
`courier` → `already_courier` (409) with the existing override in the body — nothing given twice
(FR-011); the dedupe keys make retries inside one move safe.

## R10 — Telling people

- **Customer**: new notification type `order_delivery_changed`, push + email, entity = the override id,
  dedupe `order_delivery_changed:<channel>:<sub>:<overrideId>`, address snapshotted (052), written in the
  transaction (080's pattern). Worker reads the override + order; email template
  `order-delivery-changed` (email-kit). Copy: to courier — "Your order will now arrive by courier.
  Usually arrives in {estimate}." + the compensation sentence; to Effy — "Your order will be delivered by
  Effy, {window}."
- **Compensation sentence**: ONE wording in `packages/shared-types/src/delivery-type.ts`
  (`compensationLine`), Kotlin twin pinned by `delivery-type.fixtures.json`: "We've added 350 points
  ($3.50) to your account." / "We've refunded $5.00 to your card." / nothing for `none`.
- **Order page (web, mobile)**: the commerce order DTO's `delivery` gains `movedByEffy?: {to, at,
  compensation?: {kind:'points'|'refund', amount, points?}}` — the latest staff move only. Never the note.
- **Shops**: nothing new — `deliveredBy` already reads `package_delivered_by`, and `announceOrder` tells
  their screens.
- **Drivers**: `announceDispatch(driverIds)`.

## R11 — Metrics and alarm

EMF `DeliveryOverrides {to}` (namespace `Effy/Orders`) and `DeliveryCompensation {kind}`. Alarm: sum of
`DeliveryOverrides` over 1 day `> var.delivery_override_daily_alarm` (default 5), missing data = not
breaching, to the alerts topic. In the orders alarms file.

## R12 — Where it attaches

`orders` service, **staff gateway**: +2 routes (`GET` preview, `POST` move) → staff 153 → 155 of 300.
`commerce` (shared) adds a field to an existing route. No new service, no new gateway route on shared.

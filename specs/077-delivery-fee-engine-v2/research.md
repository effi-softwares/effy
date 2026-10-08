# Research: Delivery Fee Engine v2 (077)

What the code does today, what was found, and each decision with its reason. Read against
[spec.md](spec.md); the tables are in [data-model.md](data-model.md).

## What exists (read 2026-10-08)

- **The engine** — `apis/edge-api/shared/src/delivery/engine.ts`, pure, integer cents:
  `fee = clamp(roundUpToStep(factor × (ringPrice + weightAdd)), floor, cap)`.
- **The plan** — `delivery_fee_plan` (one active, by a partial unique index), `delivery_ring_price`
  (plan × ring), `delivery_weight_band` (plan × upper grams; the heaviest band is open-ended by an
  engine rule). Plans are created whole and never edited: three admin routes — list, create, activate.
- **The quote** — `quote.ts` prices **each per-shop package** and offers each a `standard` and, where
  open, a `same_day` option. The tier comes from the 076 bridge
  `COALESCE(zone.ring_id, coverage_ring_for_km(distance_km))`.
- **The order** — `commerce/src/checkout/service.ts` sums the chosen per-package fees into
  `order.delivery_fee_amount`; `order_package_delivery.delivery_fee_amount` holds each package's share
  and `finalize.ts` copies it to `shop_fulfillment.delivery_fee_amount`.
- **Who reads the per-package fee afterwards: nobody.** Every reader of `order_package_delivery`
  (orders, fleet, driver, receipts, customer order page) takes the method, the day and the window.
  Refunds return item lines, or everything on a full cancellation, from the order's own amounts.
- **Slots** — `delivery_slot` (start, end, cutoff, capacity). Today every slot is a same-day window; a
  standard order gets a day and no window.
- **Clients** — customer-web sums per-package option fees in `lib/delivery-choice.ts`; the cart says
  "Delivery calculated at checkout". customer-mobile mirrors it in `features/checkout`.

## Findings

**F1 — The shop console shows the customer's delivery charge.** `shop/src/orders/repository.ts` returns
`money.deliveryFee` and `apps/shop-web/.../ItemsAndFulfilment.tsx` renders it as "Shipping". The spec
(FR-038) and the product model say a shop never sees it. Removed here. ⚠ The same panel shows the
order's grand total, from which the charge can still be subtracted out; whether a shop should see the
customer's total at all is a product call **raised with the operator**, not decided here.

**F2 — Pricing by each postcode's own distance moves some fees.** The 076 bridge keeps a pre-076
postcode on its **zone's** tier. A zone had one tier for all its postcodes, sometimes chosen by hand
(`ring_is_overridden`). Pricing from `delivery_zone_postcode.distance_km` (D2) changes the tier of any
postcode whose own distance falls outside its zone's tier. This is intended by the model and cannot be
avoided without keeping tiers alive. Decision R10 lists them before the migration runs.

**F3 — Nothing downstream needs a per-package fee**, so "one fee per order" (Q1) touches the quote, the
intent and three displays — not refunds, dispatch or the driver app.

## Decisions

### R1 — Evolve `delivery_fee_plan` in place
**Decision**: add columns to the existing plan table; add one new table for distance bands and one
for slot premiums; leave `delivery_ring*` untouched in the first migration.
**Why**: the service that is running when the migration is applied still reads `delivery_ring_price`
for the active plan. Additive changes keep checkout selling between "migrate" and "deploy".
**Rejected**: new `fee_plan_v2` tables — two places that claim to be the active plan (the same shape
076 R1 refused).

### R2 — Distance bands are upper bounds with one open top
**Decision**: `delivery_distance_band(plan_id, upper_km NULL, add_amount)`. Exactly one row per plan
has `upper_km IS NULL` — "and beyond". A distance takes the band with the smallest `upper_km ≥ km`,
else the open one. Boundaries belong to the lower band (FR-006).
**Why**: storing only upper bounds makes a gap or an overlap unrepresentable (047's lesson with weight
bands); an explicit open band is what staff see on screen ("20 km and beyond") and is what makes any
postcode added later priceable without touching the plan (US3-4).
**Weight bands keep their storage and their rule** (heaviest band is open-ended): no migration of live
rows for a naming improvement. The editor shows the last band as "and above".

### R3 — One formula, one implementation, in the pure engine
```
premium   = today premium (if the window is today) + the slot's premium
raw       = base + distance add + weight add + premium
delivery  = clamp( roundUpToStep(raw), floor, cap )
if basket ≥ free_over            → delivery = 0            (surcharge included — clarified)
small     = basket < small_under ? small_order_fee : 0     (outside rounding and the cap)
total     = delivery + small
```
**Decision**: `effyFee()` and `courierFee()` in `engine.ts` return the total **and** the breakdown.
Checkout, the simulator and the tests all call these two functions; nothing else adds fee parts.
**Why**: constitution III — a rule has one implementation. The simulator equals checkout (FR-026)
because it is the same function fed a plan loaded by id instead of "the active one".
**A basket that is both free and small** cannot exist: saving a plan refuses
`small_order_under ≥ free_over`.

### R4 — One fee per order; the per-package fee stops being written
**Decision**: the quote returns one fee for the order. `order_package_delivery.delivery_fee_amount`
becomes nullable and is written NULL; `finalize.ts` stops copying it; both columns are dropped at E9.
The package rows stay — they carry the method, day and window that dispatch and the driver app read.
**Weight** is the whole basket's grams (the sum the per-shop packages already add up to).
**Wire compatibility**: `packages[].options[].feeAmount` stays on the quote for one release so a client
built before 077, which sums the chosen method's option per package, never shows less than it is
charged: `standard` options carry the standard fee on the first package and "0.00" on the rest;
`same_day` options carry, on the first package that offers same-day, the **dearest** open slot's fee
less whatever the standard-only packages already contribute, and "0.00" elsewhere. Such a client may
show slightly more than it is charged (a cheaper slot), never less. New clients read the order-level
fee and ignore these. Removed by E5.

### R5 — Two kinds of window surcharge, both belonging to the plan
**Decision**: `delivery_fee_plan.today_premium_amount` (added when the chosen window is today) and
`delivery_slot_premium(plan_id, slot_id, add_amount)` (added for that window on any day).
**Why**: the spec names both ("windows today, or busy evening windows"). Today every slot is a
same-day window, so the today premium **is** the operator's "same-day is a bit dearer"; when E4 offers
the same slots on later days it keeps meaning exactly that, with no data change. Per-slot rows hang
off the plan, so replacing a plan never edits a slot (FR-021).
**In the live checkout until E5**: a same-day order (it has a slot) pays today premium + that slot's
premium, **once for the order** even when only some of its packages go same-day; a standard order has
no window and pays neither.
**Rejected**: a multiplier — retired by the programme; a premium on the slot row — a plan change would
edit operations data.

### R6 — Basket value is defined once
**Decision**: `basketValueCents = max(0, itemSubtotal − promo discount)`, exported from the engine
module and used by checkout and the simulator. Points are not subtracted (074: a way of paying).
**Why**: both basket rules test the same number, and the two figures already exist in the intent path.

### R7 — The breakdown: what staff see, what a customer sees, what is stored
**Decision**: the engine returns
`{ baseCents, distanceCents, weightCents, premiumCents, rawCents, roundedCents, clamp: "floor"|"cap"|null,
deliveryCents, freeApplied, smallOrderCents, totalCents }` plus the inputs it used (plan id and name,
km, grams, basket cents, band bounds).
The **customer lines** are derived from it by one function, `feeLines()`:

| Line | Amount |
|---|---|
| Delivery | the fee worked out **without** any window premium |
| Window surcharge | fee with the premium − fee without (so a fee at the cap shows a smaller, true, surcharge — or none) |
| Small-order fee | as charged |
| Free delivery | minus (Delivery + Window surcharge), when the free amount is reached |

The lines always sum to the total (FR-028). A zero line is omitted, as the receipt already does.
**Stored** on the order as `delivery_fee_breakdown jsonb` — the full breakdown and the lines — written
by the intent call beside `delivery_fee_amount`, which becomes the delivery **total** (small-order fee
included) so `grand_total = items − discount + delivery_fee_amount` stays true everywhere.
**Customer DTOs carry the lines only.** The full breakdown is on the staff order detail (FR-037).
Orders placed before 077 have no breakdown and render the single line they do today.

### R8 — The amount charged is the amount shown
**Decision**: the intent request gains `shownDeliveryAmount`. If the server's total differs, it writes
nothing and answers 409 `delivery_fee_changed` with a fresh quote — the same shape as 069's
delivery-choice refusal — and the client shows the new lines before the customer can pay.
**Why**: a plan can be activated between the quote and the payment step (FR-031). Today the intent
re-prices silently. A client that does not send the field (built before 077) is priced as now.

### R9 — Courier pricing is a plan of another kind
**Decision**: `delivery_fee_plan.kind` — `effy` | `courier`. One active plan **per kind** (the unique
index gains the column). A courier plan uses `base_amount` (the flat per-order amount), weight bands,
`free_over_amount`, step, floor and cap; distance bands, premiums and the small-order fee are refused
on it by a CHECK and by the service.
**Why**: same lifecycle, same editor, same three routes; a second table family would double the
routes on a gateway whose integrations are counted.
**Charged to nobody** in this feature. `courierFee()` exists, is table-tested and is reachable through
the simulator. The courier switch (076) gains a second refusal — `courier_plan_missing` — so courier
ordering cannot be turned on without an active courier plan (FR-013), on top of
`COURIER_ORDERING_AVAILABLE`.

### R10 — Release: carry the plan across, ask for the one number that cannot be derived
**Decision**, in the first migration:
- every plan gets `kind = 'effy'`, `base_amount = 0`, and one distance band per ring it priced —
  `(ring.suggest_upper_km, price)`, the open-ended ring becoming the open band;
- weight bands, step, floor and cap are untouched; no basket rules;
- `today_premium_amount` for the **active** plan comes from the operator through Goose's environment
  substitution (`EFFY_TODAY_PREMIUM`). **Unset, the migration raises** and changes nothing. A multiplier
  cannot be turned into a fixed amount without choosing a basket to measure it on — that is the
  operator's number, so it is asked for (CLAUDE.md, prohibited values: never guess);
- the active plan must come out complete, or the migration raises naming the gap;
- the active plan's `standard_factor` must be exactly 1, or the migration raises: the old fee
  multiplied distance **and** weight before rounding, which a per-band copy cannot reproduce. The
  pre-flight reports the factor first.

**Before migrating**, a read-only query in [quickstart.md](quickstart.md) lists every postcode whose
tier will move (F2), with its fee before and after for a 1 kg basket. Zero rows means SC-011 holds for
every postcode.
**The ring tables are dropped by a second migration**, applied after the services are deployed —
`delivery_ring`, `delivery_ring_price`, `coverage_ring_for_km`, and `delivery_zone.ring_id`,
`suggested_ring_id`, `ring_is_overridden`, `hub_distance_km`. A guard test fails any remaining reader first.

### R11 — Plan lifecycle
**Decision**: state is derived, not stored — `draft` (never activated), `active`, `retired`
(activated once, not active now). A draft can be replaced whole (`PUT`); active and retired plans are
immutable; "copy" is the editor opening a new draft prefilled from any plan.
A retired plan is never re-activated — it is copied.
Activation is one SQL function, `delivery_plan_activate(plan, actor, confirm_zero_floor)`: it takes an
advisory lock, runs the completeness check, deactivates the current plan of that kind and activates
the new one — two statements in the function's one transaction, deactivate first (a partial unique
index is checked row by row, so a single swapping UPDATE can fail on row order). No reader can see
zero active plans: the change is visible only at commit. There is no route that deactivates or
deletes a plan. **Immutability** of an activated plan is held by the admin service under the plan's
row lock — a trigger was built and withdrawn during implementation, because the platform permits
triggers only to mark analytics buckets (058 R6, `triggers.guard.test.ts`).
**Why**: exactly one active plan at every moment (FR-019, SC-006), including under two simultaneous
activations; the partial unique index remains the second guard.

### R12 — Completeness is a SQL function that names the gap
**Decision**: two kinds of problem, each with ONE home.
*Value errors* — an amount off the step, small-order not below free, a courier plan given distance
bands or surcharges — are refused when the plan is saved, as 422 field errors from the service; the
table CHECKs are the last guard behind it.
*Gaps* — things a half-built draft may legitimately have — are returned by `delivery_plan_gaps(plan)`,
one row each with a code and the facts: `distance_bands_missing`, `distance_open_band_missing`,
`weight_bands_missing`, `distance_not_monotonic` and `weight_not_monotonic` (with the two bands), and
two that do not block: `floor_is_zero` (needs confirmation) and `premium_on_disabled_slot`.
`delivery_plan_is_complete` is "no blocking rows". The back-office maps each code to a sentence
(FR-018); the same function is called when a draft is saved, to show the gaps before activation.
**Why SQL**: activation must check and switch in one transaction, against the rows as they are.
**Monotonic** (FR-007): a band's amount may not be less than a lower band's.

### R13 — What the cart can show before there is an address
**Decision**: the storefront's existing `GET /storefront/v1/serviceability` answer gains, for an
Effy-covered postcode, an `offer` — the active plan's free-delivery amount and small-order amount and
fee. The cart (which already knows the delivery postcode once the shopper has set one) shows
"Spend $N more for free delivery" and the small-order line from it. No new route.
**Why**: those three numbers depend on the basket alone and are the business's public offer. The
delivery fee itself needs the address and the window and stays at checkout (spec assumption).

### R14 — Shops (F1)
**Decision**: `deliveryFee` leaves the shop order DTO, the shop service's query and the shop console's
totals. A guard test fails a shop contract that carries a delivery amount.

### R15 — Observability
- `DeliveryQuoteFailures` (existing, alarmed) keeps meaning "a listed postcode could not be priced";
  the error is renamed `ListedPostcodeUnpricedError`.
- New metric `DeliveryFeeChanged` (R8 refusals) — no alarm; a spike follows every activation.
- New metric `FreeDeliveryOrders` and dimension `premium` on `DeliveryQuotes` — bounded values.
- PostHog: `delivery_fee_viewed { free, small_order, surcharge }` — three booleans, no amounts, no PII.

### R16 — Live updates
**Decision**: a new kind `pricing`, ops channel only, announced after a plan is saved or activated;
back-office maps it to the plan query keys. Customers are not told: their next quote reads the new
plan, and R8 covers a quote already on screen.

### R17 — Legal check (not legal advice — for the operator's adviser)
- **Component pricing (ACL s 48)**: when a price is shown in parts, the **single total** must be at
  least as prominent as any part. Checkout already leads with the order total; the lines sit under it.
- **A small-order fee and a window surcharge are avoidable, pre-disclosed charges**, shown before the
  customer commits and before the window is chosen (FR-030). Neither is a payment surcharge.
- **"Free delivery"** must be free: the clarified rule (surcharge included) keeps the claim true.
- **Rounding up** was cleared under 047; the step is unchanged.

### R18 — Gateway and stack budget
Staff gateway: +2 routes (`PUT` a draft, `POST` simulate), −1 (`GET rings`) → 145 → 146 of 300.
Shared gateway: 0. `admin` stack: about +6 resources.

### R19 — Tooling
Goose is v3.27 locally; `-- +goose ENVSUB ON` is supported from v3.19. The migration turns it on for
the one statement that reads `EFFY_TODAY_PREMIUM` and off again.

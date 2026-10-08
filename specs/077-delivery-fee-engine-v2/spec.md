# Feature Specification: Delivery Fee Engine v2

**Feature Branch**: `077-delivery-fee-engine-v2`

**Created**: 2026-10-08

**Status**: Draft

**Input**: "Delivery Fee Engine v2. Effy prices delivery two ways. 'Delivered by Effy' is priced from
four things: how far the delivery postcode is from Effy's hub, in distance bands the business sets
(for example 0–10 km, 10–20 km, 20 km and beyond); how heavy the basket is, in weight bands; the
basket's value (free delivery above an amount the business sets, and an extra small-order fee below
another amount); and, optionally, a surcharge on particular delivery windows (for example windows
today, or busy evening windows). The result is always rounded UP to a step the business sets, and
kept between a minimum and maximum fee. 'Courier delivery' is priced from its own table: weight bands
plus a flat amount per order, with an optional free-delivery threshold that is off by default. There
is no pricing that changes with demand. All of these values live in named fee plans owned by the
business; many plans can exist but exactly one is active, and a plan cannot be made active unless it
can price every postcode Effy delivers to and every basket weight — an address Effy delivers to must
never come back 'no price', and must never be free by accident. Staff can try a plan before
activating it: enter a postcode, a weight, a basket value and a window, and see the fee and how it
was built. The customer sees the delivery fee, and any small-order fee or window surcharge, as
separate lines before paying, and the amount charged is exactly the amount shown. Activating a new
plan never changes the fee of an order already placed. Shops never see or affect delivery fees. Fees
include GST."

## Why This Exists

Effy is replacing "same-day vs standard" with **who delivers** — Effy's own drivers, or a courier
(`docs/prd/2026-10-delivery-model-v2-backlog.md`, epic E3; decisions D2–D7, answers Q1 and Q3). The
previous feature (076) settled *where* Effy delivers and gave every covered postcode a distance from
the hub. This one settles *what delivery costs*.

Today's fee has three problems the new model cannot carry forward:

- it is priced from **distance tiers** that no longer have any controls, kept alive only so the
  checkout can keep selling;
- it is charged **once per supplier** behind the basket, so a customer's total quietly reveals how
  many places their order comes from — which the single-brand model says they must never learn;
- it multiplies by a **same-day factor**, a concept the programme is retiring, and it has no way to
  reward a large basket, discourage a tiny one, or charge more for a sought-after window.

This feature replaces it with one fee per order, built from parts a person can read back: distance,
weight, basket value and window — plus a separate, simpler table for courier delivery.

## Clarifications

### Session 2026-10-08

- Q: Does free delivery also waive a window surcharge? → A: Yes. Free delivery is free — the whole
  delivery charge, surcharge included.
- Q: With the same-day multiplier gone, should same-day cost the same as any other delivery? → A: No.
  Same-day stays a bit more expensive, through a surcharge on today's windows. Any introductory
  discount is a promotion, which is a later feature and out of scope here.
- Q: Should a basket that comes from several suppliers cost more to deliver than the same basket
  from one? → A: No. Effy collects everything and brings it to its hub, so to the customer the order
  comes from one place: one delivery fee per order, never more for more suppliers.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A fee that follows distance and weight, once per order (Priority: P1)

A customer 5 km from the hub and a customer 25 km from it put the same goods in their baskets. Each
sees one delivery fee for the whole order. The nearer customer's fee comes from the near distance
band, the farther customer's from the far one. A third customer at the same address as the first,
with a much heavier basket, pays at least as much as the first. None of them pays more because their
goods come from several suppliers.

**Why this priority**: this is the fee itself. Everything else adjusts or displays it.

**Independent Test**: with a plan of three distance bands and three weight bands, price identical
baskets at a near and a far postcode, then a light and a heavy basket at one postcode, then a basket
from one supplier and the same goods from three — and check each fee against the plan by hand.

**Acceptance Scenarios**:

1. **Given** two identical baskets delivered to postcodes in different distance bands, **When** each
   is priced, **Then** each fee uses its own postcode's band.
2. **Given** two baskets to the same postcode, **When** one is heavier, **Then** its fee is never
   lower than the lighter one's.
3. **Given** a basket whose goods come from several suppliers, **When** it is priced, **Then** there
   is one delivery fee for the order, equal to the fee for the same goods from one supplier.
4. **Given** any fee, **When** it is worked out, **Then** it is rounded up to the plan's step, never
   down, and is never below the plan's minimum or above its maximum.
5. **Given** a postcode on Effy's list at any distance and a basket of any weight, **When** it is
   priced, **Then** a fee is always returned — never "no price", never zero by omission.
6. **Given** a distance or weight exactly on a band's boundary, **When** it is priced, **Then** it
   falls in the lower band, the same way every time.

---

### User Story 2 - Basket value changes the fee (Priority: P1)

The business sets free delivery over $80 and a $3 small-order fee under $20. A customer with a $95
basket pays nothing for delivery and is told so. A customer with a $15 basket pays the delivery fee
plus a small-order fee, shown as its own line. A customer with a $70 basket sees "Spend $10 more for
free delivery".

**Why this priority**: it is the business's main lever on basket size, and the rule most likely to
make delivery free — or not free — by mistake.

**Independent Test**: price baskets just under, exactly at and just over each amount; confirm the
fee, the lines shown and the "spend more" hint for each.

**Acceptance Scenarios**:

1. **Given** a free-delivery amount is set, **When** a basket's value reaches it, **Then** Effy
   delivery costs $0 and the customer sees that delivery is free and what they saved.
2. **Given** a basket below the free-delivery amount, **When** the customer views it, **Then** they
   see how much more to spend for free delivery.
3. **Given** a small-order amount is set, **When** a basket's value is below it, **Then** the
   small-order fee is added and shown as a separate line.
4. **Given** a plan with neither amount set, **When** any basket is priced, **Then** basket value
   plays no part in the fee.
5. **Given** a promotion reduces the goods total, **When** basket value is tested against either
   amount, **Then** the value after the promotion is used.
6. **Given** a customer pays partly or wholly with points, **When** basket value is tested, **Then**
   points make no difference — they are a way of paying, not a reduction of the basket.

---

### User Story 3 - A plan cannot go live unless it prices everything (Priority: P1)

A manager builds a new fee plan and presses Activate. If the plan has a gap — distance bands that
stop at 30 km, weight bands that stop at 20 kg, a small-order amount above the free-delivery amount,
a surcharge on a window that no longer exists — activation is refused and the message names the
exact gap. When it is complete it becomes the one active plan, and the previous one is retired in
the same moment.

**Why this priority**: an active plan with a hole means a customer in Effy's area is refused, or
delivered to for nothing. The check is what makes story 1's "always a fee" true.

**Independent Test**: try to activate a plan with each kind of gap and read the refusal; fix it and
activate; confirm exactly one plan is active before, during and after.

**Acceptance Scenarios**:

1. **Given** a plan whose distance bands do not reach every distance, **When** activation is tried,
   **Then** it is refused and staff are told which distances are not covered.
2. **Given** a plan whose weight bands do not cover every weight, **When** activation is tried,
   **Then** it is refused and staff are told which weights are not covered.
3. **Given** a complete plan, **When** a manager activates it, **Then** it becomes the only active
   plan and new baskets are priced from it immediately.
4. **Given** an active plan, **When** a postcode at any distance is later added to Effy's list,
   **Then** it is priced without anyone touching the plan.
5. **Given** an active plan, **When** staff try to change its values, **Then** they cannot; they copy
   it to a new draft, change that, and activate it.
6. **Given** two managers activate different plans at the same moment, **When** both finish,
   **Then** exactly one plan is active.
7. **Given** the only active plan, **When** staff try to retire or delete it without activating
   another, **Then** they are refused.

---

### User Story 4 - Staff try a plan before it goes live (Priority: P1)

Before activating a draft, the manager opens the simulator, chooses the draft, and enters a
postcode, a weight, a basket value and a window. They see the fee and each step that produced it:
the base, the distance band and its amount, the weight band and its amount, the window surcharge,
the rounding, the minimum or maximum if it applied, and the free-delivery or small-order rule. A
customer-service agent uses the same tool against the active plan to explain a fee to a customer.

**Why this priority**: without it, the first test of a plan is a real customer's checkout.

**Independent Test**: simulate the same inputs against a draft and the active plan and get two
explained fees; confirm the active plan's simulated fee equals what a real basket with those inputs
is charged.

**Acceptance Scenarios**:

1. **Given** any plan, draft or active, **When** staff enter a postcode, weight, basket value and
   window, **Then** they see the fee and every step that built it.
2. **Given** the active plan, **When** the same inputs are simulated and used in a real basket,
   **Then** the two fees are identical.
3. **Given** a postcode that is not on Effy's list, **When** it is simulated, **Then** staff are told
   Effy does not deliver there and, where a courier does, shown the courier fee and how it was built.
4. **Given** a simulation, **When** it is run, **Then** nothing is saved and no order or customer is
   affected.

---

### User Story 5 - The customer sees what they pay, and pays what they saw (Priority: P1)

In the cart and at checkout the customer sees delivery as plain lines: the delivery fee; a
small-order fee if there is one; a window surcharge if their chosen window carries one; a
free-delivery saving if they earned it. The lines add up to the delivery total. The amount taken at
payment is that total. Afterwards the order page, the receipt and the receipt email show the same
lines with the same amounts — next week, and after the business changes its plan.

**Why this priority**: a fee the customer cannot see before paying, or that differs from what they
were shown, is a complaint and a legal problem.

**Independent Test**: take a basket that triggers every line through checkout on web and on mobile;
compare cart, checkout, the amount charged, the order page, the receipt and the email — then
activate a different plan and compare again.

**Acceptance Scenarios**:

1. **Given** a basket and an address, **When** the customer views the cart or checkout, **Then** each
   delivery charge that applies is its own named line and the lines sum to the delivery total.
2. **Given** the delivery total shown at the last step before payment, **When** payment is taken,
   **Then** exactly that amount is charged for delivery.
3. **Given** the plan changes between a customer viewing their basket and paying, **When** they reach
   payment, **Then** they are shown the new amount before they can pay — never charged an amount they
   were not shown.
4. **Given** an order already placed, **When** a new plan is activated, **Then** the order's fee and
   its lines are unchanged everywhere they appear.
5. **Given** any delivery screen, receipt or email, **When** the customer reads it, **Then** it shows
   no distance, band, weight, plan name or hub location, and nothing from which the number of
   suppliers can be worked out.
6. **Given** the same basket on web and on mobile, **When** each shows delivery, **Then** the lines,
   their names and their amounts are identical.

---

### User Story 6 - Some windows cost more (Priority: P2)

The business adds $2 to evening windows. A customer who picks one sees a "window surcharge" line; a
customer who picks a morning window does not. Changing which windows carry a surcharge is a change
to the fee plan, not to the windows themselves.

**Why this priority**: valuable for spreading demand, but the fee is complete without it.

**Independent Test**: set a surcharge on one window in a draft, activate it, and price the same
basket with and without that window chosen.

**Acceptance Scenarios**:

1. **Given** a window with a surcharge in the active plan, **When** the customer chooses it, **Then**
   the surcharge is added and shown as its own line.
2. **Given** a window with no surcharge, **When** it is chosen, **Then** no surcharge line appears.
3. **Given** the windows on offer, **When** the customer compares them, **Then** each window's
   surcharge is visible before it is chosen.
4. **Given** a surcharge is set, **When** demand for the window rises or falls, **Then** the
   surcharge does not change — only staff change it, by activating a plan.
5. **Given** a plan is replaced, **When** staff look at the windows, **Then** the windows themselves
   — times, cutoffs, capacity — are untouched.

---

### User Story 7 - Courier delivery has its own price (Priority: P2)

The business sets a courier fee table: a flat amount per order plus an amount by weight band, with
its own rounding step, minimum and maximum, and an optional free-delivery amount that is off unless
staff set it. Staff can simulate it. No customer is charged from it until courier orders can be
placed (a later feature), but when they can, the price is already there and already tested.

**Why this priority**: the next features need it, but nothing a customer does today depends on it.

**Independent Test**: build and activate a courier fee table; simulate light and heavy baskets, with
and without the courier free-delivery amount set; confirm Effy's free-delivery amount has no effect.

**Acceptance Scenarios**:

1. **Given** an active courier fee table, **When** a courier delivery is priced, **Then** the fee is
   the flat amount plus the weight band's amount, rounded up and kept within its minimum and maximum.
2. **Given** the courier free-delivery amount is not set, **When** a basket of any value is priced
   for courier delivery, **Then** it is never free — whatever Effy's own free-delivery amount is.
3. **Given** a courier table whose weight bands do not cover every weight, **When** activation is
   tried, **Then** it is refused with the gap named.
4. **Given** courier delivery priced for any address, **When** it is worked out, **Then** distance
   plays no part.

---

### User Story 8 - Release day changes no fee by accident (Priority: P1)

On the day this ships, an active plan already exists: the fee the business charges today, carried
across — the old tiers' prices as distance bands with the same boundaries, the same weight bands,
the same rounding, minimum and maximum, a surcharge on today's windows standing in for the old
same-day multiplier, and no basket rules until staff add them. The
tier-priced plan screens are gone. A customer whose order comes from one supplier and arrives on an
ordinary day pays what they would have paid yesterday.

**Why this priority**: a pricing feature that silently moves every fee on release is an incident.

**Independent Test**: price a set of sample baskets the day before and the day after release and
explain every difference by one of the two intended changes (one fee per order; same-day priced by
a fixed surcharge instead of a multiplier).

**Acceptance Scenarios**:

1. **Given** the plan active before release, **When** the feature goes live, **Then** an equivalent
   plan is active with no staff action, and no basket is unpriced at any moment.
2. **Given** a single-supplier, non-same-day basket, **When** it is priced before and after release,
   **Then** the fee is the same.
3. **Given** orders placed before release, **When** they are viewed or refunded afterwards, **Then**
   their fees are as they were charged.
4. **Given** a same-day basket, **When** it is priced after release, **Then** it costs more than the
   same basket on a later day, by the surcharge on today's windows.
5. **Given** the back-office after release, **When** staff open delivery pricing, **Then** nothing
   refers to distance tiers or to a same-day multiplier.

---

### Edge Cases

- **A fee that is free on purpose vs by accident.** $0 delivery happens only through the
  free-delivery amount being reached, and the customer is told it is free. A plan whose minimum fee is
  $0 must be confirmed explicitly by the person activating it.
- **Free-delivery amount reached and a surcharged window chosen.** Delivery is free including the
  surcharge (see Assumptions — flagged for the operator).
- **Small-order amount set at or above the free-delivery amount.** Refused when saving the plan; a
  basket cannot be both small and free.
- **Small-order fee and the maximum fee.** The maximum limits the delivery fee; the small-order fee
  is added after it and is not absorbed by it.
- **A basket whose value drops below the free-delivery amount** because an item is removed or goes
  out of stock before payment: the fee is worked out again and shown before the customer pays.
- **A basket with an item of unknown weight.** Handled as today (the platform's existing weight rule);
  the fee is never refused for it.
- **A covered postcode's distance is corrected after an order is placed.** New baskets use the new
  distance; the placed order is unchanged.
- **A window with a surcharge is removed or switched off.** The plan stays valid for pricing; the
  surcharge simply never applies, and staff see it marked as pointing at nothing.
- **A draft copied from a plan while another manager activates a third.** The draft is unaffected and
  can still be activated later, subject to the same check.
- **An order placed, then partly refunded or cancelled.** What is returned of the delivery charges
  follows the existing refund rules, using the amounts recorded on the order.
- **The courier fee is needed but no courier table is active.** Courier ordering cannot be switched
  on in that state; nothing is ever priced at $0 for want of a table.

## Requirements *(mandatory)*

### Functional Requirements

**The Effy fee**

- **FR-001**: An Effy delivery MUST be priced **once per order**, from the delivery postcode's
  distance from the hub, the basket's total weight, the basket's value and the chosen window. The
  number or identity of suppliers behind the basket MUST NOT affect it.
- **FR-002**: The delivery fee MUST be: the plan's base amount, plus the amount for the distance
  band, plus the amount for the weight band, plus the chosen window's surcharge if any — rounded UP
  to the plan's step, then kept between the plan's minimum and maximum.
- **FR-003**: Where the basket's value reaches the plan's free-delivery amount, the delivery fee
  (including any window surcharge) MUST be $0.
- **FR-004**: Where the basket's value is below the plan's small-order amount, the plan's small-order
  fee MUST be added, after rounding and the minimum/maximum, as a separate charge.
- **FR-005**: Basket value MUST mean one thing everywhere: the goods total after promotions, before
  any delivery charge, including GST. Payment by points MUST NOT change it.
- **FR-006**: A value exactly on a band boundary MUST fall in the lower band; a basket value exactly
  equal to the free-delivery amount MUST be free; one exactly equal to the small-order amount MUST NOT
  attract the small-order fee.
- **FR-007**: A heavier basket MUST never be priced below a lighter one at the same postcode, and a
  farther postcode never below a nearer one for the same basket; plans that would break this MUST be
  refused when saved.
- **FR-008**: The fee MUST NOT vary with demand, time of day (other than through a window's set
  surcharge), customer, or supplier.
- **FR-009**: Every listed postcode and every basket weight MUST always produce a fee under the
  active plan. If one ever cannot, the customer MUST be refused rather than charged nothing, and the
  business MUST be alerted.
- **FR-010**: All fees and amounts are GST-inclusive.

**The courier fee**

- **FR-011**: A courier delivery MUST be priced once per order from its own table: a flat amount per
  order plus the amount for the basket's weight band, rounded UP to that table's step and kept between
  its minimum and maximum. Distance MUST NOT affect it.
- **FR-012**: The courier table MAY carry its own free-delivery amount; it MUST be unset by default,
  and Effy's free-delivery amount MUST NOT apply to courier delivery.
- **FR-013**: Courier ordering MUST NOT be switchable on while no courier table is active.

**Fee plans**

- **FR-014**: All pricing values MUST live in named fee plans. There MUST be exactly one active Effy
  plan at all times, and at most one active courier table.
- **FR-015**: Staff MUST be able to create a plan, copy an existing one, edit a draft, activate a
  draft, and see every plan with its state (draft, active, retired) and who activated it and when.
- **FR-016**: An active or retired plan MUST NOT be editable.
- **FR-017**: Activation MUST be refused unless the plan can price every distance from zero upward
  with no gap or overlap, and every weight from zero upward with no gap or overlap; its minimum does
  not exceed its maximum and both are multiples of the step; its small-order amount, if set, is below
  its free-delivery amount, if set; and no amount is negative.
- **FR-018**: A refused activation or save MUST name the exact gap or conflict in words staff can act
  on.
- **FR-019**: Activating a plan MUST retire the previously active one in the same step; there MUST be
  no moment with zero or two active plans.
- **FR-020**: A plan with a $0 minimum fee MUST require explicit confirmation at activation.
- **FR-021**: Window surcharges MUST belong to the plan, not to the window; changing plans MUST NOT
  alter any window.
- **FR-022**: Managers and admins MUST be able to change and activate plans; customer-service agents
  MUST be able to read plans and use the simulator and change nothing.
- **FR-023**: Every plan change and activation MUST be recorded: who, when, what it was, what it
  became.
- **FR-024**: An open pricing screen MUST show another staff member's change without being reloaded.

**The simulator**

- **FR-025**: Staff MUST be able to price a postcode, weight, basket value and window against any
  plan — draft, active or retired — and see the fee and each step that built it.
- **FR-026**: A simulation against the active plan MUST equal the fee a real basket with the same
  inputs is charged.
- **FR-027**: Simulating MUST NOT change anything.

**What the customer sees**

- **FR-028**: Before paying, the customer MUST see each applicable delivery charge as its own named
  line — delivery fee, small-order fee, window surcharge, free-delivery saving — summing exactly to
  the delivery total.
- **FR-029**: A basket below the free-delivery amount MUST show how much more to spend to reach it.
- **FR-030**: Each offered window MUST show its surcharge, if any, before it is chosen.
- **FR-031**: The delivery total charged MUST equal the delivery total shown at the last step before
  payment. If it would differ, the customer MUST be shown the new total before payment can proceed.
- **FR-032**: Customers MUST NOT be shown, or be able to derive, a distance, a band, a basket weight,
  a plan's name, the hub's location, or the number of suppliers.
- **FR-033**: The customer website and the customer mobile app MUST show identical lines, names and
  amounts.

**Placed orders**

- **FR-034**: Every order MUST record the delivery charges it was sold with and how each was built,
  sufficient to explain the fee later without reference to any plan.
- **FR-035**: The order page, receipt and receipt email MUST show the recorded lines.
- **FR-036**: No plan change, activation, distance correction or coverage change may alter a placed
  order's recorded charges.
- **FR-037**: Staff viewing an order MUST be able to see how its delivery fee was built.

**Shops**

- **FR-038**: Shops MUST NOT see delivery fees or any part of them, and no shop setting may affect
  one.

**Replacing the old arrangement**

- **FR-039**: At release, the then-active plan MUST be carried across to an equivalent active plan
  without staff action: former tier prices as distance bands on the same boundaries, the same weight
  bands, step, minimum and maximum, no basket rules, and a surcharge on today's windows in place of
  the same-day multiplier.
- **FR-040**: The same-day multiplier and tier-based pricing MUST be removed from pricing and from
  every staff screen.
- **FR-041**: Orders placed before release MUST keep the fees they were charged.

### Key Entities

- **Fee plan (Effy)**: a named set of pricing values — base amount, distance bands, weight bands,
  free-delivery amount (optional), small-order amount and fee (optional), window surcharges (optional),
  rounding step, minimum and maximum. Has a state (draft / active / retired) and a record of who
  activated it and when.
- **Distance band**: a range of distance from the hub and the amount it adds. The last band has no
  upper limit.
- **Weight band**: a range of basket weight and the amount it adds. The last band has no upper limit.
- **Window surcharge**: an amount a plan adds to a particular delivery window.
- **Courier fee table**: a named set — flat amount per order, weight bands, optional free-delivery
  amount, rounding step, minimum and maximum — with the same draft / active / retired life.
- **Fee breakdown**: the delivery charges for one basket or order and the steps that built them. Shown
  to the customer as lines; shown to staff in full; recorded on the order when it is placed.
- **Plan change record**: who changed or activated what, when, from what to what.
- **Covered postcode and its distance** (existing, 076), **delivery window** (existing), **basket and
  its weight** (existing).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For 100% of a published table of test baskets (every band edge, both basket-value
  edges, minimum, maximum, rounding), the fee equals the hand-worked answer to the cent.
- **SC-002**: Zero baskets to a listed postcode are returned without a price, and zero are priced at
  $0 without the free-delivery amount having been reached.
- **SC-003**: For 100% of orders, the delivery total charged equals the total shown at the last step
  before payment.
- **SC-004**: For 100% of orders, the lines on the order page, receipt and email equal the lines shown
  at checkout, and remain so after any later plan activation.
- **SC-005**: 100% of attempts to activate an incomplete plan are refused with a message naming the
  gap; a manager can fix the named gap without asking anyone what it means.
- **SC-006**: At every moment there is exactly one active Effy plan.
- **SC-007**: A manager can copy the active plan, change one amount, test it in the simulator and
  activate it in under 3 minutes.
- **SC-008**: A customer-service agent can explain any order's delivery fee, step by step, in under
  30 seconds from the back-office.
- **SC-009**: For 100% of simulated inputs against the active plan, the simulated fee equals the fee
  charged to a real basket with the same inputs.
- **SC-010**: A basket's delivery fee is identical whether its goods come from one supplier or
  several.
- **SC-011**: On release day, 100% of single-supplier, non-same-day sample baskets are priced the
  same as the day before, and no basket is unpriced at any moment.
- **SC-012**: No customer-visible screen, receipt or email contains a distance, band, weight, plan
  name or supplier count; no shop-visible screen contains a delivery fee.
- **SC-013**: The delivery lines shown on the website and in the mobile app are identical for 100% of
  test baskets.

## Assumptions

- **One fee per order** (answer Q1, confirmed 2026-10-08). Effy collects from its suppliers and
  delivers from its hub, so for the customer the order comes from one place and carries one fee. This
  is a deliberate change: a basket drawn from several suppliers pays one fee where today it pays one
  per supplier, and becomes cheaper on release.
- **Free delivery covers the window surcharge too** (confirmed 2026-10-08): a basket over the
  free-delivery amount pays $0 even in a surcharged window.
- **The surcharge sits inside the minimum/maximum** (D3): a fee already at the plan's maximum does
  not rise further for a surcharged window. The lines shown always sum to what is charged.
- **The small-order fee sits outside rounding and the maximum**, as its own charge, and should itself
  be a multiple of the step.
- **Free delivery over an amount applies to Effy delivery only** (answer Q3); the courier table has
  its own, off by default.
- **Until the programme's checkout feature (E5), the live checkout still offers today's same-day
  windows and standard days.** This feature changes what they *cost*, not how they are offered: the
  same-day multiplier goes and is replaced by a **surcharge on today's windows**, so same-day stays a
  bit more expensive (confirmed 2026-10-08). The surcharge is a fixed amount, not a multiple; its
  amount is the business's to set and is asked of the operator before release — never guessed.
  Offering windows across today and the next three days is E4.
- **Promotions on delivery are out of scope.** Introductory or targeted delivery discounts are a later
  feature; this one prices delivery and nothing else.
- **Courier pricing is defined and testable here but charged to nobody** until a courier order can be
  placed (E5). Courier ordering stays off.
- **An Effy plan and a courier table are separate things**, each with its own active one.
- **Bands are "up to and including"** their upper limit; the last band is open-ended. This is what
  makes any postcode added to the list later priceable without touching the plan.
- **Basket weight** is the total of the basket's items, worked out as the platform does today.
- **Distance** is the one recorded against the covered postcode by 076 (straight-line, or
  hand-entered). This feature reads it and never recalculates it.
- **No demand-based pricing** (D6) and **no live courier quotes** (E10).
- **Refund rules for delivery charges are unchanged** (055); they act on the amounts recorded on the
  order.
- **Roles** follow the existing back-office pattern: admin and manager change, customer-service reads.
- **Legal**: rounding up was cleared under 047; showing a small-order fee and a window surcharge as
  separate, pre-payment lines is to be confirmed against consumer-law surcharge display rules during
  planning.

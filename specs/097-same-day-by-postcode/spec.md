# Feature Specification: Delivery Today, Postcode by Postcode

**Feature Branch**: `097-same-day-by-postcode`

**Created**: 2026-10-21

**Status**: Draft

**Input**: User description: "Back-office: mark, per postcode on Effy's delivery list (Delivery → Coverage), whether delivery TODAY is offered there. Today every postcode on the list is offered the same windows today (shown to customers as "Same-day delivery") whenever a window passes the one window rule (cutoff, a collection run that reaches the hub in time, capacity). Far postcodes (e.g. Geelong 64 km, Werribee 28 km from the hub) cannot realistically be served on a same-day round, and the only lever is removing them from the list, which turns them into courier orders. Staff need a per-postcode setting "Delivery today: offered / not offered", default offered, shown as a column on the Coverage list and settable in bulk for selected postcodes (e.g. filter by distance, select, switch off). Not on groups — groups must stay labels that change nothing a customer sees. No automatic distance rule. A postcode with today switched off: the customer sees no "Same-day delivery" section, only Standard delivery from the next delivery day; an "as soon as possible" order there starts from the next delivery day, never today; checkout, the place hold at payment, back-office moving an order to Effy and staff re-timing an Effy order must all agree (one rule); orders already placed keep what they bought. Managers/admins change it, customer service reads; every change is audited and shows live on other open Coverage screens; the coverage checker says whether today is offered. Customers see no new wording."

## Background

A postcode on Effy's delivery list is **Delivered by Effy**. The customer picks one window for the
order: a window **today** (shown under "Same-day delivery") or one on the next few delivery days (shown
under "Standard delivery"). Whether a window today is offered is decided by time alone — its cutoff,
whether a collection run can still get the goods to the hub before it starts, and whether it has room.
The **place** never matters: Richmond (3 km from the hub) and Geelong (64 km) are offered exactly the
same windows today.

That is wrong for the business. A round that leaves the hub for a two-hour evening window can serve
the inner suburbs; it cannot also reach a town an hour away. Today the only way to stop selling
same-day to a far postcode is to take it off the list entirely — which stops Effy delivering there at
all and turns every order into a courier order. Staff need the smaller lever: **Effy delivers here,
but not today.**

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Switch delivery today off for far postcodes (Priority: P1)

A delivery manager opens Delivery → Coverage, filters the list to postcodes more than 25 km from the
hub, selects them all, and switches **Delivery today** off. From that moment a customer in Geelong
(3220) sees only Standard delivery at checkout — windows from the next delivery day — while a customer
in Richmond (3121) still sees Same-day delivery as before.

**Why this priority**: It is the whole feature. Without it the business either sells deliveries it
cannot make or stops delivering to whole towns.

**Independent Test**: With a window today open, switch Delivery today off for 3220 only; confirm a
checkout to a 3220 address shows no Same-day delivery section and its first offered day is the next
delivery day, and a checkout to a 3121 address at the same moment still shows today's window.

**Acceptance Scenarios**:

1. **Given** the Coverage list, **When** a manager looks at it, **Then** every listed postcode shows
   whether Delivery today is offered, and the list can be filtered by it.
2. **Given** several postcodes selected, **When** the manager switches Delivery today off for them,
   **Then** all of them change together, the list shows the new state, and one audit entry per
   postcode records who changed it, when, and from what to what.
3. **Given** 3220 has Delivery today off and a window today is otherwise open, **When** a customer
   with a 3220 address reaches checkout, **Then** no Same-day delivery section is shown, Standard
   delivery is offered from the next delivery day, and nothing on the screen explains or mentions the
   difference.
4. **Given** the same moment, **When** a customer with a 3121 address (Delivery today on) reaches
   checkout, **Then** today's open window is offered exactly as before this feature.
5. **Given** 3220 has Delivery today off, **When** a customer there chooses "as soon as possible",
   **Then** the order is placed on the first open delivery day after today, never today, and the
   customer is told only the usual estimate.
6. **Given** a manager switches Delivery today back on for 3220, **When** a customer there reaches
   checkout while a window today is open, **Then** Same-day delivery is offered again.

---

### User Story 2 - Every door agrees (Priority: P1)

Delivery today being off must hold everywhere an Effy window is chosen or changed — not only on the
checkout screen — so that nothing sold or assigned contradicts it.

**Why this priority**: A rule obeyed by one screen and ignored by another produces orders the business
said it would not take. It is part of the minimum viable feature, not a refinement.

**Independent Test**: With Delivery today off for 3220, attempt each path that can put a 3220 order in
a window today — the place hold at payment, staff moving a courier order to Effy, and staff re-timing
an Effy order — and confirm each is refused, while the same attempt for a 3121 order succeeds.

**Acceptance Scenarios**:

1. **Given** a customer was shown today's window for a 3220 address, **When** a manager switches
   Delivery today off for 3220 before the customer continues to payment, **Then** the customer's
   choice is refused as no longer available and they are asked to choose again — no other window is
   substituted for them.
2. **Given** a customer already holds a place in today's window (they have continued to payment),
   **When** Delivery today is switched off for their postcode, **Then** their held place stands and
   the order completes as chosen.
3. **Given** a paid courier order to a 3220 address, **When** staff move it to Effy, **Then** windows
   today are not offered for it; a window on a later day is.
4. **Given** a paid Effy order to a 3220 address in a window on a later day, **When** staff re-time
   it, **Then** windows today are not offered.
5. **Given** orders already placed for today in 3220, **When** Delivery today is switched off, **Then**
   those orders are unchanged: same window, same fee, same delivery round.

---

### User Story 3 - Staff can see and explain it (Priority: P2)

A customer-service agent is asked "why can't I get same-day delivery?". They check the postcode and
see that Delivery today is not offered there, alongside the existing answer of who delivers and why.

**Why this priority**: Staff must be able to answer the question the feature creates, but the feature
delivers its value without it.

**Independent Test**: Use the coverage checker on 3220 and 3121 and confirm each states whether
Delivery today is offered; confirm a customer-service agent sees the column and the checker answer but
no control to change either.

**Acceptance Scenarios**:

1. **Given** 3220 has Delivery today off, **When** any staff member checks 3220 in the coverage
   checker, **Then** the answer says it is Delivered by Effy and that delivery today is not offered.
2. **Given** a customer-service agent, **When** they open the Coverage list, **Then** they see the
   Delivery today column and filter, and no way to change it.
3. **Given** two managers have the Coverage list open, **When** one switches Delivery today off for a
   postcode, **Then** the other's list shows the change without being reloaded.
4. **Given** a manager adds a new postcode through Add places, **When** they add it, **Then** they can
   choose whether Delivery today is offered there, defaulting to offered.

---

### Edge Cases

- **Today is not a delivery day anyway** (a closed date or a no-delivery weekday): nothing changes —
  no postcode is offered today; the setting has no visible effect that day.
- **No window today would have been open anyway** (all cutoffs past, no collection run makeable): the
  customer sees the same thing whether the setting is on or off.
- **No later delivery day falls within the days customers are offered** (e.g. a long closure): a
  postcode with Delivery today off may have no window at all; it is then treated exactly as any other
  Effy postcode with no window left — including courier delivery where the business allows courier
  when no window is left — and refused with the one refusal sentence otherwise.
- **A postcode is removed from the list and added back**: it takes whatever Delivery today choice is
  made when it is added (default offered); the earlier setting is not remembered.
- **A postcode moves between groups**: its Delivery today setting does not change.
- **The "Any time" day-only window**: is never offered for today already; unaffected.
- **Pricing**: a postcode with Delivery today off is never charged the "Delivery today" surcharge,
  because no window today can be chosen there; the fee for later days is unchanged.
- **The delivery address changes during checkout** from a postcode with Delivery today on to one with
  it off: the offer follows the address, as it already does for who delivers.

## Requirements *(mandatory)*

### Functional Requirements

**The setting**

- **FR-001**: Every postcode on Effy's delivery list MUST carry a Delivery today setting: offered or
  not offered.
- **FR-002**: A postcode MUST be offered delivery today unless staff have switched it off. Every
  postcode already on the list at release MUST start as offered, so the release itself changes nothing
  any customer sees.
- **FR-003**: The setting MUST belong to the postcode alone. Groups, distance, shops and any other
  setting MUST NOT change it or be consulted in place of it.

**What it decides**

- **FR-004**: A window today MUST NOT be offered for an address in a postcode with Delivery today not
  offered. Windows on later delivery days MUST be offered exactly as before.
- **FR-005**: For a postcode with Delivery today offered, the windows offered MUST be exactly what
  they would be without this feature.
- **FR-006**: An "as soon as possible" order to a postcode with Delivery today not offered MUST be
  placed on the first open delivery day after today.
- **FR-007**: The same decision MUST apply at every point where an Effy window is offered, held,
  confirmed or changed: the checkout offer, the place hold when the customer continues to payment,
  staff moving an order to Effy, and staff re-timing an Effy order. No point may allow what another
  refuses.
- **FR-008**: A choice of today's window made before the setting was switched off, and not yet held,
  MUST be refused as no longer available and the customer asked to choose again; no window may be
  substituted for them.
- **FR-009**: A place already held, and every order already placed, MUST keep the window, day and fee
  it was sold, whatever the setting later becomes.
- **FR-010**: Customers MUST see no new wording, notice or explanation: a postcode with Delivery today
  not offered simply has no Same-day delivery section.

**Staff controls and visibility**

- **FR-011**: The Coverage list MUST show each postcode's Delivery today setting and MUST allow
  filtering by it, alongside the existing filters (including distance).
- **FR-012**: Managers and admins MUST be able to change the setting for one postcode or for many
  selected postcodes in one action.
- **FR-013**: When adding postcodes, managers and admins MUST be able to choose the setting for the
  postcodes being added, defaulting to offered.
- **FR-014**: The coverage checker MUST state, for a listed postcode, whether delivery today is
  offered there.
- **FR-015**: Customer-service staff MUST be able to see the setting everywhere managers can, and MUST
  NOT be able to change it.
- **FR-016**: Every change MUST be recorded in the coverage audit: who, when, which postcode, what it
  was and what it became.
- **FR-017**: An open Coverage screen MUST reflect another staff member's change without a manual
  reload. A customer already at checkout is covered by FR-008: their choice is re-checked when they
  continue to payment.

### Key Entities

- **Listed postcode** (existing): a postcode on Effy's delivery list, with its group and distance.
  Gains **Delivery today: offered / not offered**.
- **Coverage audit entry** (existing): gains entries for Delivery today changes.
- **Delivery window**, **delivery day**, **order** (existing): unchanged. An order records what it was
  sold, as today.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A manager can switch delivery today off for every postcode beyond a chosen distance in
  under 1 minute, in one bulk action.
- **SC-002**: After release and before any change, every customer is offered exactly the windows they
  would have been offered before — zero differences across a comparison of the listed postcodes.
- **SC-003**: Once delivery today is switched off for a postcode, zero new orders there are placed in,
  moved to, or re-timed into a window today.
- **SC-004**: 100% of orders placed before a change keep their window, day and fee.
- **SC-005**: A customer-service agent can answer "is same-day delivery offered at this postcode?" from
  the back-office in under 30 seconds.
- **SC-006**: 100% of changes to the setting appear in the coverage audit with before and after values.

## Assumptions

- **Default offered**: switching off is the exception, used for far or hard-to-serve postcodes; the
  business decides which, case by case. No automatic rule (by distance or anything else) sets it.
- **Per postcode, not per group**: groups remain labels that change nothing a customer sees, is
  offered or pays. Bulk selection on the list (filtered by group or distance) covers the "do the whole
  area" need.
- **Roles** follow the existing coverage pattern: admin and manager change, customer-service reads.
- **Only "today" is controlled.** Limiting a postcode to certain windows or certain later days is out
  of scope; so is a per-postcode cap on deliveries.
- **Driver work** needs no new rule: a postcode that cannot be sold today produces no new orders for
  today's rounds; orders already placed are delivered as planned.
- **Courier delivery** is unaffected, except through the existing "no window left" rule (Edge Cases).
- **The storefront's "do we deliver to you?" answer** is unchanged: the postcode is still Delivered by
  Effy.

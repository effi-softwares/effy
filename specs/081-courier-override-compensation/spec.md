# Feature Specification: Back-Office Courier Override & Compensation

**Feature Branch**: `081-courier-override-compensation`

**Created**: 2026-10-09

**Status**: Draft

**Input**: "Back-Office Courier Override and Compensation. Rarely, and only in an emergency, back-office
staff need an order that was sold as 'Delivered by Effy' to go by courier instead. Staff can move any
such order to courier delivery, giving a reason, as long as it has not already been handed to a
customer or a courier. The customer's delivery window is given up, the order leaves any Effy driver's
work, and the customer is told straight away — by email and notification — that their order will now
arrive by courier, with the new estimate. Once moved, the order reaches the courier the way any courier
order does: by the business's default (via the hub or pickup from the supplier), which staff can change
for that order as for any other courier order, and with the business's default courier service and its
timeframe. Staff then choose, for that order, how to make it right; nothing is decided automatically.
The default is to credit the customer points worth the difference between what they paid for Effy
delivery and the courier fee. Staff may instead make the delivery free (giving back the whole delivery
fee, as points or to the card), or, as a last resort, refund the difference to the customer's card. If
courier delivery costs more than what the customer paid, the customer is never asked to pay more; Effy
bears the difference. The customer's message says what they received. Staff can move a courier order
back to Effy delivery only before it has been handed to a courier, choosing a new window; the customer
is never charged more for that either. Every move and every compensation is recorded with who, when,
why and how much, and is visible on the order. Only admins and managers can move orders;
customer-service agents can view."

**Programme**: Delivery Model v2, epic **E7** (`docs/prd/2026-10-delivery-model-v2-backlog.md`).
Builds on 074 (points — the way a credit reaches the customer), 055 (refunds — the way money returns to
a card), 073 (assigning and unassigning driver work), 077 (the delivery charge an order stores), 078
(windows), 079 (every order is "Delivered by Effy" or "Courier delivery", with a recorded history of
changes) and 080 (how a courier order reaches the courier, courier services and their timeframes).
A customer choosing courier delivery themselves is E10.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Staff move an Effy order to courier and compensate the customer (Priority: P1)

The van is off the road and an Effy order cannot make its window. A manager opens the order in
back-office and chooses **Send by courier…**. The dialog asks for a reason, shows what the customer paid
for delivery, what courier delivery costs for this order, and the difference, and offers the ways to
make it right with **points for the difference** preselected. The manager confirms. The order is now
"Courier delivery": its window is given up, it leaves any driver's work, the customer is emailed and
notified that it will arrive by courier, with the courier's timeframe and the points they received.

**Why this priority**: this is the feature — the emergency move and the default compensation.

**Independent Test**: take a paid Effy order not yet collected; move it to courier with the default
compensation; confirm the window has room again, no driver has it, the customer has the points and the
message, and the order's history shows who, when, why and how much.

**Acceptance Scenarios**:

1. **Given** a paid Effy order none of whose parcels has been delivered or handed to a courier, **When**
   an admin or manager opens it, **Then** "Send by courier…" is offered.
2. **Given** the dialog, **When** it opens, **Then** it shows the delivery charge the customer paid, the
   courier charge for the same order today, the difference (never below zero), and each choice's effect
   in money and points, with "points for the difference" preselected.
3. **Given** no reason is entered, **When** staff confirm, **Then** it is refused.
4. **Given** staff confirm, **When** the move is recorded, **Then** in one step the order becomes
   "Courier delivery", its window place is released, its parcels leave any driver's work, and the
   chosen compensation is given.
5. **Given** the move, **When** it is recorded, **Then** within one minute the customer is emailed and
   notified that the order will now arrive by courier, with the courier's usual timeframe as an
   estimate and a sentence saying what they received.
6. **Given** the move, **When** the customer, the supplier, the driver or another staff member views the
   order, **Then** it reads as a courier order on every screen without anyone refreshing.

---

### User Story 2 - Staff choose a different compensation (Priority: P1)

Sometimes the difference is small, or the customer has had a bad week. The manager may instead make
the delivery free — the whole delivery charge back, as points or to the card — or, as a last resort,
refund the difference to the card. Where the difference is zero and a goodwill gesture is not
warranted, they may give nothing and say why.

**Why this priority**: the backlog's acceptance names every choice; staff must not be forced into one.

**Independent Test**: move four orders, one per choice; confirm each customer receives exactly what the
dialog previewed, by the means it named, and the message says so.

**Acceptance Scenarios**:

1. **Given** "free delivery as points", **When** confirmed, **Then** the customer is credited points worth
   the whole delivery charge they paid.
2. **Given** "free delivery to the card", **When** confirmed, **Then** the whole delivery charge is refunded
   through the existing refund flow.
3. **Given** "refund the difference", **When** confirmed, **Then** the difference is refunded through the
   existing refund flow, and the dialog marks this choice as the last resort.
4. **Given** "no compensation", **When** confirmed, **Then** a note saying why is required, nothing is
   credited or refunded, and the customer's message mentions no compensation.
5. **Given** the courier charge is higher than what the customer paid, **When** any choice is made,
   **Then** the customer is charged nothing more, the difference shows as zero, and Effy bears the cost.
6. **Given** any choice that returns money to the card, **When** the order was paid partly with points,
   **Then** the refund follows the existing refund rules for such orders, and the dialog's preview says
   so.

---

### User Story 3 - Staff move a courier order back to Effy delivery (Priority: P2)

The van is back. A manager opens an order that is now "Courier delivery" and chooses **Deliver by
Effy…**, picks a window the order can still make, gives a reason, and confirms. The order returns to
Effy's drivers, the customer is told the new window, and they are charged nothing more.

**Why this priority**: the operator's decision (Q6): reversible, but only before the courier has it.

**Independent Test**: move an order to courier, then back before any handover, choosing a window;
confirm the window's room is taken, the parcels become driver work, the customer is told, and no money
is taken.

**Acceptance Scenarios**:

1. **Given** a courier order none of whose parcels has been handed to a courier or delivered, and whose
   address is on Effy's delivery list, **When** an admin or manager opens it, **Then** "Deliver by
   Effy…" is offered.
2. **Given** the dialog, **When** it opens, **Then** it lists only windows the order could be sold today
   (open, with room), and confirming takes a place in the chosen one.
3. **Given** any parcel of the order has been handed to a courier, **When** staff try to move it back,
   **Then** it is refused with the reason.
4. **Given** the Effy charge for the order would now be higher, **When** it is moved back, **Then** the
   customer is charged nothing more.
5. **Given** the move back, **When** recorded, **Then** any courier booking not yet handed over is
   cancelled, and the customer is emailed and notified of the new window.
6. **Given** an order that was compensated when moved to courier, **When** it is moved back, **Then** the
   compensation already given stays with the customer.

---

### User Story 4 - Every move and compensation is visible and accountable (Priority: P2)

A customer-service agent takes a call: "why is my order coming by courier?" They open the order and see
its delivery history — each move, who made it, when, why, and what the customer received — but cannot
move it themselves.

**Why this priority**: accountability for an action that moves money and breaks a promise.

**Independent Test**: move an order to courier and back; sign in as an agent; confirm the history shows
both moves with actor, time, reason and amounts, and neither action is offered.

**Acceptance Scenarios**:

1. **Given** any order, **When** staff view it, **Then** its delivery history lists every change of
   delivery type with who, when, why, from what to what, and the compensation (kind and amount).
2. **Given** a customer-service agent, **When** they view an order, **Then** they see the history and
   neither move action; a move attempted by an agent by any means is refused.
3. **Given** a move to courier, **When** the customer views the order on web or mobile, **Then** they see
   it now arrives by courier, the courier's timeframe as an estimate, and one line saying what they
   received — never the reason staff entered.
4. **Given** the business, **When** moves happen more often than a set number per day, **Then** the
   operator is alerted — moves are meant to be rare.

---

### Edge Cases

- **A parcel already collected by a driver** (with the driver or at the hub): the move is allowed; that
  parcel cannot be taken off the driver mid-collection, so it continues to the hub and reaches the
  courier from there. The order goes **via the hub** in that case, whatever the default.
- **A parcel out for delivery with a driver** (a delivery round under way): the move is refused until the
  driver's round settles that parcel — a parcel already in a van on its way to a customer is not taken
  off the driver mid-round.
- **Any parcel already delivered, or handed to a courier**: the move to courier is refused for the whole
  order, with the reason.
- **An unpaid, cancelled or completed order**: neither move is offered.
- **Courier delivery not set up** (no active courier charge table or no default courier service): the
  move to courier is refused with the reason — the customer could be told no timeframe and no charge
  could be compared.
- **The order's delivery charge was zero** (free delivery threshold): the difference is zero; staff may
  still choose "free delivery" (also zero) or no compensation with a note.
- **Part of the order already refunded**: compensation returned to the card cannot exceed what is still
  refundable; the preview shows the cap.
- **Two staff act at once**: the second move is refused because the order has changed; nothing is given
  twice.
- **The customer's window had already passed** when the move is made: the move is still allowed; the
  window's place is released all the same.
- **An order placed before the new delivery model** (it has no recorded delivery type): neither move is
  offered. Such orders keep the same-day / standard handling they were sold with until they finish.
- **A courier order that was courier from the start** (address not on Effy's list): "Deliver by Effy…" is
  not offered.
- **Moving back and forth repeatedly**: allowed while the rules hold; each move is recorded; compensation
  is given only with a move to courier.
- **Suppliers** are told "Courier" instead of "Effy driver" for that order, and nothing else — no reason,
  no compensation, no charge.

## Requirements *(mandatory)*

### Functional Requirements

**Moving to courier**

- **FR-001**: Admins and managers MUST be able to move a paid "Delivered by Effy" order to "Courier
  delivery" while none of its parcels has been delivered, handed to a courier, or is out for delivery on
  a round under way. Otherwise the move MUST be refused with the reason. Orders placed before the new
  delivery model (no recorded delivery type) MUST NOT be offered either move.
- **FR-002**: A move MUST require a reason.
- **FR-003**: A move to courier MUST, as one step: change the order's delivery type, release its window
  place, drop its parcels from any delivery round not yet under way, set
  how the order reaches the courier (the business's default, or via the hub when any parcel is already
  collected), give the order the default courier service and its timeframe, give the chosen
  compensation, and record all of it. Collection work from the suppliers stays with drivers when the order
  goes via the hub (the parcels still have to reach the hub); it is withdrawn when the courier collects
  from the supplier. If any part cannot be done, nothing MUST change.
- **FR-004**: After the move, the order MUST be handled exactly like any other courier order, including
  staff changing how it reaches the courier.
- **FR-005**: The move to courier MUST be refused when courier delivery is not set up (no active courier
  charge table or no default courier service).

**Compensation**

- **FR-006**: Before confirming, staff MUST see: the delivery charge the customer paid, the courier charge
  for the same order now, the difference (the paid charge minus the courier charge, never below zero),
  and the effect of each choice in money and points.
- **FR-007**: Staff MUST choose exactly one compensation per move to courier: points for the difference
  (preselected), free delivery as points, free delivery to the card, refund of the difference to the card
  (marked "last resort"), or no compensation (a note required). Nothing MUST be chosen automatically.
- **FR-008**: Points MUST be credited through the platform's existing points crediting, with the order and
  a compensation reason; money MUST be returned through the existing refund flow. Neither may be
  re-implemented.
- **FR-009**: The amount given MUST equal the amount previewed. If the order changed between preview and
  confirmation such that the amount would differ, the move MUST be refused and the preview shown again.
- **FR-010**: The customer MUST never be charged more because of a move, in either direction; Effy bears
  any extra cost.
- **FR-011**: Compensation MUST be given at most once per move, even if the confirmation is sent twice.

**Moving back to Effy**

- **FR-012**: Admins and managers MUST be able to move a courier order back to "Delivered by Effy" only
  while none of its parcels has been handed to a courier or delivered, and only when its address is on
  Effy's delivery list.
- **FR-013**: Moving back MUST require a reason and a window the order could be sold now (open, with
  room); it MUST take a place in that window, cancel any courier booking not yet handed over, and make
  the parcels driver work as for any Effy order.
- **FR-014**: Moving back MUST NOT take or return money, and MUST NOT undo compensation already given.

**Telling people**

- **FR-015**: The customer MUST be emailed and notified within one minute of a move: to courier — with
  the courier timeframe as an estimate and one sentence saying what they received; back to Effy — with
  the new window.
- **FR-016**: The customer's order page (web and mobile) and their receipt MUST show the current delivery
  type and, after a move to courier, one line naming what they received. The staff reason MUST never be
  shown to the customer.
- **FR-017**: Suppliers MUST see only that the order is now "Courier" (or "Effy driver"), with nothing
  about the reason, charge or compensation.
- **FR-018**: Drivers MUST see the parcel leave their work, or be told to return it to the hub, without
  refreshing.
- **FR-019**: Every screen showing the order MUST update when it is moved, as for any order change.

**Record and access**

- **FR-020**: Every move MUST be recorded with who, when, why, from and to, and its compensation (kind,
  amount, and the points credit or refund it produced), and MUST be visible on the order to all
  back-office roles. The record MUST be append-only.
- **FR-021**: Customer-service agents MUST be able to view the history and MUST NOT be able to move an
  order; the refusal MUST hold however the move is attempted.
- **FR-022**: The business MUST be able to count moves per day and be alerted when they exceed a set
  number.

### Key Entities

- **Delivery move**: one change of an order's delivery type made by staff — from, to, reason, who, when,
  the window released or taken, and its compensation. Joins the order's existing delivery-type history.
- **Compensation**: what the customer received for a move to courier — kind (points for the difference,
  free delivery as points, free delivery to the card, refund of the difference, none), amount, the note
  when none, and the points credit or refund it produced.
- **Compensation preview**: what staff see before confirming — paid delivery charge, courier charge now,
  difference, each choice's effect. Not stored except as the amounts the move records.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An admin or manager can move an order to courier, with compensation, in under one minute
  from opening the order.
- **SC-002**: 100% of moves to courier release the window place, and the place can be sold to another
  customer immediately.
- **SC-003**: After a move to courier, zero parcels of the order remain on any driver's delivery work, and
  none remains on collection work when the courier collects from the supplier.
- **SC-004**: 100% of moved customers are emailed and notified within one minute of the move.
- **SC-005**: Zero customers are charged more as a result of a move, in either direction.
- **SC-006**: In 100% of moves, the amount the customer receives equals the amount previewed, and is
  given once.
- **SC-007**: 100% of moves have a recorded reason, actor, time and compensation visible on the order.
- **SC-008**: Zero customer or supplier screens show a staff reason, a courier charge or Effy's cost.

## Assumptions

- **Compensation is chosen with the move**, in one dialog, and given at once. A further goodwill gesture
  later uses the existing points credit or refund tools, not this feature.
- **"No compensation" is a choice** with a required note (backlog E7-T01 lists it), so staff are never
  forced to give zero points as though it were a gift.
- **What the customer paid for delivery** is the delivery charge the order stored at checkout (077),
  including any window surcharge and small-order charge. **The courier charge** is what checkout would
  charge this order for courier delivery at the moment of the move, from the active courier charge table.
- **Points value**: points are worth the business's point value (074; 1 point = $0.01), and an amount in
  money becomes points at that value, rounded up to the whole point in the customer's favour.
- **Only orders sold under the new delivery model** (with a recorded delivery type) can be moved, so —
  like 079 and 080 — this feature is dormant until the cutover and is walked in dev with the model switch
  briefly on. Orders placed before it keep their same-day / standard handling.
- **Moving back is allowed only to an address on Effy's delivery list**, choosing among the windows a
  customer could be offered now; staff cannot overfill a window.
- **No compensation on moving back**: the customer already has what they were given; Effy's charge is
  never collected again.
- **The alert threshold** for moves per day is a business setting, default 5.
- **Out of scope**: a customer choosing courier (E10); moving only some parcels of an order; changing a
  compensation after it is given; live courier quotes (E10).

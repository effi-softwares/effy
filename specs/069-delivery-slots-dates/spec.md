# Feature Specification: Delivery Time Slots & Standard Delivery Date

**Feature Branch**: `069-delivery-slots-dates`

**Created**: 2026-10-04

**Status**: Draft

**Input**: User description: "lets move onto the last fix in docs/prd/2026-10-client-feedback-prd.md
which is R4b + R4c" — client feedback round of October 2026, requirements R4b (same-day time slots)
and R4c (standard delivery date) in
[docs/prd/2026-10-client-feedback-prd.md](../../docs/prd/2026-10-client-feedback-prd.md).

## Why this slice exists

**A customer can choose how fast an order comes, and nothing about when.**

Checkout offers two methods, same-day and standard, and promises no day for either: the
confirmation says the delivery date will be confirmed. Three consequences follow:

1. **Same-day means "some time today".** A customer who is out until six cannot say so. The
   delivery arrives whenever the round reaches them, and a perishable order sits on a doorstep or
   goes back to the hub.
2. **Standard delivery lands on a day the customer did not pick.** Someone away until Thursday
   cannot ask for Thursday.
3. **Nothing limits how much same-day work is sold.** Every eligible order before the cutoff is
   accepted, whether or not the evening's rounds can carry it.

The client asked for this directly, with a reference checkout: time slots under same-day, a
selectable date for standard delivery, and a price shown on every option.

This slice makes a promise the platform has so far declined to make. The order record was built
to carry a delivery date and deliberately no time of day, because the business had not committed
to one, and in practice no date has been recorded either. From this slice on, every order carries
a day, a same-day order carries a time window as well, and the customer is told both on every
record of the order.

Two decisions were settled with the operator before this was written:

- **A chosen standard date is honoured through the outside carrier.** Standard packages still
  leave Effy's hands at the hub. Effy holds each one and hands it over so that it lands on the day
  the customer chose. Effy's own drivers do not start delivering standard orders.
- **The delivery fee does not vary by slot or by date.** It stays what it is today: a function of
  method, distance and weight. Every option shows its fee; all same-day slots cost the same, and
  all standard dates cost the same.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Choose a same-day time slot (Priority: P1)

A customer at checkout who picks same-day delivery is shown the time slots still open for their
address today, each with its window and the fee. They pick one. The order records it, and the
confirmation, the receipt and the order's page all say "Today, 5 pm to 7 pm" rather than only
"Today".

**Why this priority**: This is the headline of the client's request and the part that changes what
Effy promises. Nothing else in the same-day half has anything to act on until a slot is chosen.

**Independent Test**: Configure two slots. Place a same-day order choosing the later one and
confirm that window appears on the confirmation, the receipt and the order page on both customer
surfaces, and that the fee charged is the fee shown beside the slot.

**Acceptance Scenarios**:

1. **Given** an address eligible for same-day and two slots still open, **When** the customer
   chooses same-day, **Then** both slots are shown with their start time, end time and fee.
2. **Given** the customer picks a slot and pays, **When** the order is confirmed, **Then** the
   order records that slot and the confirmation shows its window.
3. **Given** a slot whose cutoff has passed, **When** any customer reaches checkout, **Then** that
   slot is not offered.
4. **Given** an address in a zone that is not same-day eligible, **When** the customer reaches
   checkout, **Then** no slots are shown and standard delivery is offered as it is today.
5. **Given** same-day is eligible but every slot today is closed or full, **When** the customer
   reaches checkout, **Then** same-day is not offered, the customer is told why in plain words,
   and standard remains available.
6. **Given** a basket supplied by two shops where both packages are same-day, **When** the
   customer chooses a slot, **Then** they choose once and the slot applies to both packages.
7. **Given** a customer who has chosen a slot, **When** they move between checkout steps or a
   payment attempt fails, **Then** their choice is still selected if it is still open.

---

### User Story 2 - A full slot is not sold again (Priority: P1)

Each slot has a capacity. Once that many deliveries are booked into it, the next customer is not
offered it. If a slot fills or passes its cutoff while a customer is still at checkout, they are
told and asked to choose again before any money is taken. Once they proceed to payment, their
place is held for a short time so that paying cannot lose it.

**Why this priority**: Equal-first with US1. A time window that is sold without limit is a promise
Effy will break on its first busy evening. Capacity is what makes the window honest.

**Independent Test**: Set a slot's capacity to two. Place two orders into it, then confirm a third
customer is not offered it. Separately, hold a checkout open on a slot, fill the slot from another
account, and confirm the first customer is told to re-choose and is not charged.

**Acceptance Scenarios**:

1. **Given** a slot with capacity two and two deliveries booked, **When** a third customer reaches
   checkout, **Then** that slot is not offered to them.
2. **Given** a customer who selected a slot that then filled, **When** they try to pay, **Then**
   payment does not go ahead, they are told the slot is no longer available, and they are shown
   the slots that are.
3. **Given** a customer who selected a slot whose cutoff then passed, **When** they try to pay,
   **Then** the same thing happens: no charge, a plain explanation, and a fresh choice.
4. **Given** the customer's slot became unavailable, **When** they are shown the remaining
   options, **Then** nothing is selected for them: the platform never moves an order to a
   different slot on its own.
5. **Given** two customers who try to take the last place in a slot at the same moment, **When**
   both proceed to payment, **Then** exactly one gets it and the other is asked to choose again
   without being charged.
6. **Given** a customer whose place is held, **When** they complete payment within the hold,
   **Then** the place is theirs; **When** they abandon checkout, **Then** the place is offered to
   others once the hold ends.
7. **Given** an order booked into a slot is cancelled before delivery, **When** the next customer
   reaches checkout before the cutoff, **Then** the freed place is offered again.

---

### User Story 3 - Choose the day a standard delivery arrives (Priority: P1)

A customer who picks standard delivery is shown the next available delivery days, each with the
fee, and chooses one. The earliest day is already selected, so a customer who does not care does
nothing extra. The order records the chosen day and shows it wherever the delivery promise is
shown today.

**Why this priority**: This is the second half of the client's request. It is P1 because standard
is the method most orders use.

**Independent Test**: Place a standard order choosing a date three days out. Confirm that date,
not a range, appears on the confirmation, receipt and order page on both customer surfaces, and
that a day marked as a non-delivery day was never offered.

**Acceptance Scenarios**:

1. **Given** a customer choosing standard delivery, **When** the options are shown, **Then** they
   see a list of individual days, each with its fee, starting from the earliest day the order
   could arrive.
2. **Given** the list of days, **When** it first appears, **Then** the earliest day is selected.
3. **Given** a day marked as a non-delivery day, **When** the list is shown, **Then** that day is
   absent.
4. **Given** the customer picks a day and pays, **When** the order is confirmed, **Then** the
   order records that day and every place that shows the delivery promise shows that one day.
5. **Given** a basket supplied by two shops where both packages are standard, **When** the
   customer chooses a day, **Then** they choose once and both packages carry it.
6. **Given** a basket where one package is same-day and one is standard, **When** the customer
   checks out, **Then** they choose one slot for the same-day package and one day for the standard
   package, and each package keeps its own method.
7. **Given** a customer who selected the earliest day and waited until it is no longer achievable,
   **When** they try to pay, **Then** payment does not go ahead and they are asked to choose from
   the days now available.

---

### User Story 4 - The driver delivers inside the window (Priority: P2)

A driver on a same-day round sees each drop's delivery window. The round is put together so that
drops can be reached inside their windows, with earlier windows first.

**Why this priority**: A window the customer was told and the driver was not is a promise kept
only by accident. It follows US1 and US2 because there is no window to show until they exist.

**Independent Test**: Place same-day orders in two different slots, let them be assigned to a
driver, and confirm each drop shows its own window and the earlier slot's drops come first in the
round.

**Acceptance Scenarios**:

1. **Given** a same-day order with a chosen slot, **When** the assigned driver opens the drop,
   **Then** the window is shown in words and times.
2. **Given** a round containing drops from two slots, **When** the driver views the round,
   **Then** drops in the earlier slot are ordered before drops in the later one.
3. **Given** a drop whose window has started, **When** the driver views the round, **Then** that
   drop is marked as due now, and once its window has ended it is marked as late.
4. **Given** a package booked into a slot, **When** work is assigned for the day, **Then** the
   package is collected and at the hub in time to go out for that slot.
5. **Given** a same-day order placed before this feature, **When** a driver opens its drop,
   **Then** no window is shown.

---

### User Story 5 - Back-office sets the slots (Priority: P2)

A back-office admin defines the same-day delivery slots: when each starts and ends, the time
after which it can no longer be chosen, and how many deliveries it can take. They can change a
slot, switch it off, and see how full each of today's slots is.

**Why this priority**: The slots a customer sees have to come from somewhere, and the business
must be able to change them without a release. It is P2 because the first slots can be put in
place by the operator once and the customer journey proven before the console is polished.

**Independent Test**: Create a slot, confirm it appears at checkout; lower its capacity below
what is booked and confirm no further orders are accepted while the booked ones keep their
window; switch it off and confirm it disappears from checkout.

**Acceptance Scenarios**:

1. **Given** an admin in the delivery settings, **When** they create a slot with a start, an end,
   a cutoff and a capacity, **Then** it is offered at checkout from then on.
2. **Given** a slot whose end is not after its start, or whose cutoff is after its start,
   **When** the admin saves, **Then** the save is refused with the reason.
3. **Given** a slot with orders booked today, **When** the admin changes its times, **Then** the
   booked orders keep the window they were sold and the change applies to new orders.
4. **Given** a slot with orders booked today, **When** the admin switches it off, **Then** no new
   orders can choose it and the booked orders are unaffected.
5. **Given** today's slots, **When** the admin views them, **Then** each shows how many deliveries
   are booked against its capacity.
6. **Given** any change to a slot, **When** it is saved, **Then** who made it and when is
   recorded.
7. **Given** a staff member who cannot manage delivery configuration, **When** they open the
   delivery settings, **Then** they can see the slots and cannot change them.

---

### User Story 6 - Back-office sets which days standard delivery runs (Priority: P2)

A back-office admin sets how many days ahead a customer may choose, which days of the week have
no delivery, and individual dates with no delivery such as public holidays.

**Why this priority**: Without it the standard date list offers days nobody can deliver on. It is
P2 because a sensible starting configuration covers launch.

**Independent Test**: Mark Sunday and one specific date as non-delivery days, set the choice to
seven days ahead, and confirm checkout offers seven deliverable days with neither of those
present.

**Acceptance Scenarios**:

1. **Given** an admin sets the number of days a customer may choose from, **When** a customer
   reaches checkout, **Then** that many deliverable days are offered.
2. **Given** a weekday marked as having no delivery, **When** a customer reaches checkout,
   **Then** no date falling on that weekday is offered.
3. **Given** a specific date marked as having no delivery, **When** a customer reaches checkout,
   **Then** that date is not offered.
4. **Given** an order already placed for a date, **When** the admin later marks that date as a
   non-delivery day, **Then** the order keeps its date and staff can see it is affected.
5. **Given** any change to these settings, **When** it is saved, **Then** who made it and when is
   recorded.

---

### User Story 7 - Staff hand standard packages over for the right day (Priority: P2)

Staff at the hub see, for each standard package, the day the customer chose. They can see which
packages need to go to the carrier today to arrive on time, and a package that is at risk of
missing its day is pointed out.

**Why this priority**: The chosen date is honoured by a person handing a package to a carrier on
the right day. If staff cannot see the date, the customer's choice changes nothing.

**Independent Test**: Place standard orders for three different days, bring them to the hub, and
confirm staff see each package's chosen day, can list the ones due for handover today, and see a
warning on one whose day can no longer be met.

**Acceptance Scenarios**:

1. **Given** a standard package at the hub, **When** staff view it, **Then** the customer's chosen
   delivery day is shown.
2. **Given** standard packages for several days, **When** staff ask what is due to be handed over
   today, **Then** they see the packages that must leave today to arrive on their chosen day.
3. **Given** a package that has not been handed over in time for its chosen day, **When** staff
   view it, **Then** it is marked as at risk.
4. **Given** staff record a handover to the carrier, **When** they do so, **Then** the chosen day
   is shown beside the package being handed over.
5. **Given** a standard order placed before this feature, **When** staff view it, **Then** it
   shows no chosen day and nothing is marked as at risk.

---

### Edge Cases

- **No slots are configured, or all are switched off.** Same-day is not offered; standard is.
- **The last slot's cutoff is later than the last collection that could bring the goods to the
  hub.** The slot is offered only while the package can still be collected in time for it. A slot
  can never be chosen for goods that cannot reach the hub before it starts.
- **Two same-day packages in one order where a slot is open for one shop's package and not the
  other's.** The slot is offered only if it is open for every same-day package in the order.
- **A shop is excepted from same-day for the customer's zone.** That package is standard, as
  today; the other package may still take a slot.
- **Capacity is lowered below the number already booked.** Booked orders keep their slot; the slot
  takes no more.
- **The clock change at the start or end of daylight saving.** Slot times are wall-clock times in
  Melbourne and mean the same thing on the day the clocks change.
- **A customer whose device is in another timezone.** Windows and days are shown in Melbourne
  time, which is where the delivery happens.
- **Checkout opened before midnight and paid after.** The options are re-checked at payment;
  yesterday's slots and a date that is no longer achievable are refused with a fresh choice.
- **Every day in the look-ahead period is a non-delivery day.** Standard delivery still produces
  options: the list continues to the next deliverable day rather than showing nothing.
- **A delivery reaches the customer outside its window.** The delivery is completed and recorded
  as it happened. The order's record keeps the window that was promised and the time it actually
  arrived.
- **A same-day drop fails and is returned to the hub.** Handled as failed deliveries are today;
  the slot is not re-offered or re-booked automatically.
- **The carrier delivers a standard package on a different day from the one chosen.** The order
  records the day it arrived. The chosen day stays on the record as what was asked for.
- **An order placed before this feature.** It carries no window and no chosen day, and goes on
  saying what it says today. It is not rewritten.
- **Payment completes after the hold has ended, and the slot has since filled or closed.** The
  customer has paid for that slot, so the order keeps it. Staff are told the slot is over
  capacity. The order is never moved or refunded automatically.
- **The customer changes their slot after proceeding to payment.** The earlier hold is given up
  and a place in the new slot is held instead; one order never holds two places.
- **Delivery instructions.** One slot and one date are chosen per order per method; instructions
  remain one set for the whole order.

## Requirements *(mandatory)*

### Functional Requirements

**Same-day slots at checkout**

- **FR-001**: When same-day delivery is available for an order, the customer MUST choose a
  delivery time slot to use it.
- **FR-002**: Each slot offered MUST show its start time, its end time and the delivery fee.
- **FR-003**: A slot MUST be offered only when all of the following hold: the address's zone is
  same-day eligible, no shop exception rules it out, the slot's cutoff has not passed, the slot
  has capacity remaining, and the order's same-day packages can still be collected in time for it.
- **FR-004**: When same-day is not offered because no slot is open, the customer MUST be told
  that today's slots are closed or full, in words distinct from "same-day is not available in
  your area".
- **FR-005**: An order's same-day packages MUST share one slot, chosen once by the customer,
  however many shops supplied them.
- **FR-006**: The platform MUST NOT select a slot on the customer's behalf.
- **FR-007**: The customer's selection MUST survive moving between checkout steps and a failed
  payment attempt, for as long as the slot remains open.

**Capacity and the moment of payment**

- **FR-008**: A slot MUST NOT accept more deliveries than its capacity. One customer order
  delivered to one address counts as one delivery, whatever the number of packages.
- **FR-009**: The slot's availability MUST be re-checked when the customer proceeds to payment.
  If it has filled or passed its cutoff, the customer MUST NOT be charged, MUST be told the slot
  is no longer available, and MUST be asked to choose again.
- **FR-009a**: When the check passes, a place MUST be held for that order for a short, configured
  period, counted against capacity, so that completing payment cannot lose it. A hold that ends
  without payment MUST free the place.
- **FR-009b**: If payment completes after the hold has ended and the slot has since filled or
  closed, the order MUST keep the chosen slot and MUST be flagged to staff as over capacity.
- **FR-010**: The platform MUST NOT move an order to a different slot or a different method
  without the customer choosing it.
- **FR-011**: When two customers compete for the last place in a slot, exactly one MUST get it.
- **FR-012**: A place in a slot MUST be freed when its order is cancelled before delivery.
- **FR-013**: Availability and capacity MUST be enforced by the platform, not only by the screen
  the customer chooses on.

**Standard delivery date at checkout**

- **FR-014**: When the customer chooses standard delivery they MUST be offered a list of
  individual delivery days and MUST choose one.
- **FR-015**: The first day offered MUST be the earliest day the order could arrive, and it MUST
  be selected by default.
- **FR-016**: The number of days offered MUST be the configured look-ahead. Non-delivery days
  MUST be left out and MUST NOT count toward that number.
- **FR-017**: Each day offered MUST show the delivery fee.
- **FR-018**: An order's standard packages MUST share one chosen day, chosen once by the
  customer, however many shops supplied them.
- **FR-019**: The chosen day MUST be re-checked when the customer proceeds to payment. If it is no longer
  achievable the customer MUST NOT be charged and MUST be asked to choose again.
- **FR-020**: A served address MUST always be offered at least one standard delivery day.

**Fees**

- **FR-021**: The delivery fee MUST NOT depend on which slot or which day is chosen. It remains
  determined by method, distance and weight.
- **FR-022**: The fee shown beside the chosen option MUST be the fee charged.

**Mixed orders**

- **FR-023**: Each package MUST continue to take its own method. An order with both methods MUST
  ask for one slot and one day, and no more.

**What the customer is told afterwards**

- **FR-024**: The chosen slot MUST be recorded with each same-day package, and the chosen day
  with each standard package, as they stood when the order was placed.
- **FR-025**: The confirmation, the receipt, the emailed receipt and the order's page MUST show a
  same-day delivery as its date and window, and a standard delivery as its chosen day.
- **FR-026**: A later change to a slot's times, capacity or status, or to the non-delivery days,
  MUST NOT change what a placed order shows.
- **FR-027**: The slot and the day MUST NOT be changeable after the order is paid.
- **FR-028**: Choosing a slot or a day and seeing it afterwards MUST behave the same on customer
  web and customer mobile.
- **FR-029**: All times and days MUST be Melbourne wall-clock time, wherever the customer's
  device is.

**The driver**

- **FR-030**: The driver assigned to a same-day drop MUST see its delivery window.
- **FR-031**: A round's drops MUST be ordered so that earlier windows come first.
- **FR-032**: A drop MUST be marked as due once its window has started and as late once its
  window has ended.
- **FR-033**: Work MUST be assigned so that a package booked into a slot is collected and at the
  hub in time to go out for that slot.
- **FR-034**: A drop being late MUST NOT prevent the driver from completing it.
- **FR-035**: The time a same-day delivery was completed MUST be recorded against its window, so
  staff can tell whether it was on time.

**Back-office: slots**

- **FR-036**: A back-office admin MUST be able to create, change and switch off same-day slots.
  Each slot has a start time, an end time, a cutoff and a capacity.
- **FR-037**: A slot MUST be refused if its end is not after its start, its cutoff is after its
  start, or its capacity is not a whole number of at least one.
- **FR-038**: The admin MUST be able to see, for each of today's slots, how many deliveries are
  booked against its capacity.
- **FR-039**: Only the back-office roles that manage delivery configuration today (admin and
  manager) MUST be able to change slots and delivery-day settings. Other back-office staff may
  view them.
- **FR-040**: Shops and drivers MUST NOT be able to see or change slot configuration.

**Back-office: standard delivery days**

- **FR-041**: A back-office admin MUST be able to set how many days ahead a customer may choose.
- **FR-042**: A back-office admin MUST be able to mark days of the week, and individual dates, as
  non-delivery days.
- **FR-043**: Marking a date as a non-delivery day MUST tell the admin how many placed orders
  already carry that date, and MUST NOT change those orders.

**Staff and the carrier handover**

- **FR-044**: Staff who can view an order MUST see each package's chosen slot or chosen day.
- **FR-045**: Staff MUST be able to list the standard packages that must be handed to the carrier
  today to arrive on their chosen day.
- **FR-046**: A standard package that has not been handed over in time for its chosen day MUST be
  marked as at risk.
- **FR-047**: When a standard package arrives, the day it arrived MUST be recorded alongside the
  day that was chosen.

**Accountability and existing orders**

- **FR-048**: Every change to a slot and to the standard delivery day settings MUST record which
  admin made it and when.
- **FR-049**: Orders placed before this feature MUST NOT be given a window or a chosen day after
  the fact, and MUST go on showing what they show today.
- **FR-050**: The customer MUST NOT be shown, or able to infer from anything this feature adds,
  which shop fulfils any part of their order.

### Key Entities *(include if feature involves data)*

- **Delivery slot**: a same-day delivery window the back-office defines. Has a start time, an end
  time, a cutoff after which it cannot be chosen, a capacity in deliveries, and an on/off status.
- **Slot booking**: one order's place in one slot on one day. Held when the customer proceeds to
  payment and confirmed when payment completes. Counts once toward capacity however many packages
  the order has. Freed if the hold ends unpaid or the order is cancelled before delivery.
- **Standard delivery settings**: how many days ahead a customer may choose, the weekdays with no
  delivery, and individual non-delivery dates.
- **Package delivery promise**: what each package was promised when the order was placed. For a
  same-day package it gains the window; for a standard package it becomes the one chosen day
  rather than a range. Fixed once the order is paid.
- **Drop**: the driver's view of one customer delivery. Gains the window.
- **Carrier handover**: the existing record of a standard package leaving the hub. Read alongside
  the chosen day to tell staff what is due and what is at risk.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A customer chooses a slot or a delivery day and continues in under 15 seconds; a
  customer who accepts the default standard day takes no extra step.
- **SC-002**: No slot is ever offered or held beyond its capacity, including when many customers
  proceed to payment at once. The only bookings above capacity are payments that completed after
  their hold ended, and every one of those is flagged to staff.
- **SC-003**: A slot past its cutoff or at capacity is offered to zero customers.
- **SC-004**: In 100% of cases where a slot or day becomes unavailable before payment, the
  customer is not charged and is asked to choose again; in zero cases is an order placed into a
  slot or day the customer did not choose.
- **SC-005**: For 100% of orders, the delivery fee charged equals the fee shown beside the chosen
  option.
- **SC-006**: For 100% of same-day orders placed with a slot, the same window appears on the
  confirmation, the receipt, the emailed receipt, the order page and the assigned driver's drop.
- **SC-007**: For 100% of standard orders, the chosen day appears on every customer and staff view
  of the order, and no date range is shown.
- **SC-008**: A non-delivery day is offered to zero customers.
- **SC-009**: Changing or switching off a slot, or adding a non-delivery day, changes what zero
  placed orders show.
- **SC-010**: A two-shop order with one same-day and one standard package asks the customer for
  exactly one slot and one day.
- **SC-011**: The same order shows the same window or day on customer web and customer mobile.
- **SC-012**: Staff can list today's standard handovers and tell which packages are at risk
  without opening individual orders.
- **SC-013**: An attempt to book a closed or full slot that bypasses the customer screens is
  refused in 100% of cases.
- **SC-014**: Within a month of release, at least 90% of same-day deliveries are completed inside
  their window.
- **SC-015**: Within a month of release, at least 90% of standard deliveries arrive on the chosen
  day.

## Assumptions

- **Settled with the operator**: a chosen standard date is honoured by handing the package to the
  outside carrier at the right time; Effy drivers do not deliver standard orders. The date is
  therefore as firm as the carrier, and the customer-facing wording is for the planning stage to
  agree with the operator.
- **Settled with the operator**: the delivery fee does not vary by slot or date.
- **Same-day always needs a slot once this is live.** There is no "same-day, no window" mode for
  new orders. The operator must configure at least one slot before release, or same-day stops
  being offered.
- **Slots repeat every delivery day.** A slot is a daily window, not a one-off. Different slots
  for different weekdays are a later change.
- **Capacity is counted in deliveries**, one per order per address, and applies across all zones.
  Per-zone or per-vehicle capacity is a later change.
- **A place in a slot is held when the customer proceeds to payment**, not while they browse. A
  customer can therefore lose a slot they were looking at, which is why US2 exists. The hold
  starts at ten minutes and is configuration.
- **The actual slots, cutoffs and capacities are configuration**, entered by the operator. The
  client has not yet supplied them; none are fixed by this specification.
- **The look-ahead starts at seven days** and the non-delivery days start empty, until the
  operator sets them.
- **The earliest standard day** is worked out from when the order can next be collected and how
  long the carrier takes. The platform records no delivery day today, so there is no existing
  rule to inherit.
- **How long the carrier takes** is a single operator-set lead time used to work out what is due
  for handover and what is at risk. There is no carrier integration.
- **Only signed-in customers check out**, as today.
- **The existing same-day rules stay**: zone eligibility, shop exceptions and the collection
  schedule still decide whether same-day is possible at all. Slots add to them.
- **SC-014 and SC-015 are observed, not gated.** They need a month of live deliveries and do not
  block sign-off.

## Out of Scope

- Fees that vary by slot or by date.
- Effy drivers delivering standard orders.
- Sending the chosen date to the carrier electronically, or receiving tracking from one.
- Time slots for standard delivery.
- Choosing a same-day slot on a future day.
- Changing a slot or a day after the order is paid.
- Holding a slot while the customer is still browsing the options.
- Compensation or refunds for a late delivery.
- Pickup points.
- Live driver tracking and "arriving soon" notifications.
- Different slots per zone or per weekday, and per-zone capacity.

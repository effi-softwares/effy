# Feature Specification: Effy Delivery Windows — Today and the Next Three Days

**Feature Branch**: `078-effy-delivery-windows`

**Created**: 2026-10-08

**Status**: Done — migrated and deployed to dev 2026-10-09 (operator-reported); switched off until the cutover

**Input**: "Effy Delivery Windows: today and the next three days. When an order is 'Delivered by
Effy', the customer chooses a delivery time window. The business defines the daily windows (start
time, end time, the last moment it can be chosen, and how many deliveries it takes). The same windows
repeat each delivery day. The customer can choose a window today — only while its cutoff has not
passed, it still has room, and Effy can still collect the goods from its suppliers and get them ready
before the window starts — or a window on any of the next three delivery days. Days the business marks
as non-delivery days (certain weekdays, public holidays) are skipped and do not count toward the three.
Each window has its own room on each day: a full Thursday evening says nothing about Friday evening.
A customer's place in a window is held for a short time while they pay, and confirmed when payment
succeeds; a customer is never charged for a window they did not get, and if payment arrives after the
hold lapsed and the window has since filled, the customer keeps the window they paid for and staff are
told. A window with a surcharge shows it next to the window. If no window is available on any of the
four days, the customer is told plainly and offered courier delivery instead only if the business
allows it. Changing or disabling a window changes what new customers are offered, never what a placed
order was sold. Back-office sees, for each day and window, how full it is."

**Programme**: Delivery Model v2, epic **E4** (`docs/prd/2026-10-delivery-model-v2-backlog.md`).
Builds on 069 (daily windows, capacity, holds, non-delivery days), 076 (who delivers to an address)
and 077 (what a window costs). The courier flow (E5/E6) and driver planning across days (E8) are
separate features.

## Clarifications

### Session 2026-10-08

- Q: How is the choice presented, and what do "same-day" and "standard" mean now? → A: Checkout
  defaults to **Delivered by Effy** and shows two sections. **Same-day delivery** lists today's
  windows with their cutoffs — its meaning is unchanged. **Standard delivery** lists the next three
  delivery days, each with its time windows — "standard" now means *Effy delivers on a later day in a
  window*, no longer *handed to a carrier on a day*. An address Effy does not deliver to shows no picker
  and says the order will be delivered by a courier partner (that flow is E5). The customer-facing
  words "Same-day delivery" and "Standard delivery" stay.
- Q: When are customers first offered this? → A: **Built and switched off, turned on at the cutover.**
  Effy drivers cannot yet hold a parcel at the hub for a later day (E8), so until the operator switches
  it on, customers keep today's checkout. Staff can configure windows and days and see fullness before
  then.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Choose a window today or on one of the next three delivery days (Priority: P1)

It is Tuesday 10:00. A customer at an address Effy delivers to reaches checkout; Delivered by Effy
is already selected. Under **Same-day delivery** they see today's windows that are still open —
cutoff not passed, room left, and Effy can still collect for them in time — each with its cutoff.
Under **Standard delivery** they see Wed, Thu and Fri, each with its windows that have room. The
customer picks Thursday 4–6 pm under Standard delivery and continues.

**Why this priority**: this is the feature. Everything else protects or explains this choice.

**Independent Test**: with three daily windows (cutoffs 9:00, 14:00, 17:00) and no non-delivery days,
open checkout at 10:00 and confirm the 9:00-cutoff window is missing from Today only, and every window
appears on each of the next three days.

**Acceptance Scenarios**:

1. **Given** it is 10:00 and a window has a 14:00 cutoff, room, and can be collected for in time,
   **When** the customer opens checkout, **Then** that window is offered today and on each of the next
   three delivery days.
2. **Given** a window whose cutoff today has passed, **When** the customer opens checkout, **Then** it
   is not offered today but is offered on each of the next three delivery days.
3. **Given** a window today whose cutoff has not passed but which Effy can no longer collect for in
   time, **When** the customer opens checkout, **Then** it is not offered today.
4. **Given** every window today is closed, **When** the customer opens checkout, **Then** the
   Same-day delivery section says "No windows left today" and Standard delivery still offers the next
   three delivery days.
4a. **Given** a same-day window is offered, **When** the customer views it, **Then** its cutoff ("order
   by 2 pm") is shown with it.
5. **Given** the customer has chosen a window, **When** they move between checkout steps or a payment
   attempt fails, **Then** their choice is kept for as long as the window is still open.
6. **Given** an order whose goods come from several suppliers, **When** the customer checks out,
   **Then** they choose one window for the whole order, and nothing on the screen reveals how many
   suppliers there are.
7. **Given** the customer has not chosen a window, **When** they try to pay, **Then** they are asked
   to choose one; the platform never chooses for them.

---

### User Story 2 - Non-delivery days are skipped (Priority: P1)

The business does not deliver on Sundays and has marked a public holiday on Monday. On Friday the
customer is offered Today (Friday), Saturday, Tuesday and Wednesday — still three days after today.

**Why this priority**: offering a day Effy will not deliver is a broken promise on every order that
takes it.

**Independent Test**: mark a weekday and a date as non-delivery days; open checkout on the day before
them and confirm both are absent and three delivery days are still offered after today.

**Acceptance Scenarios**:

1. **Given** a weekday marked as non-delivery, **When** the customer's four days are worked out,
   **Then** that weekday never appears and does not count toward the three.
2. **Given** a specific date marked as non-delivery, **When** the four days are worked out, **Then**
   that date is skipped the same way.
3. **Given** today is itself a non-delivery day, **When** the customer opens checkout, **Then** no
   window is offered today, the customer is told Effy does not deliver today, and the next three
   delivery days are offered.
4. **Given** staff mark a date as non-delivery that placed orders already carry, **When** they save
   it, **Then** they are told how many orders carry that date, and those orders are not changed.

---

### User Story 3 - A full window on one day says nothing about another day (Priority: P1)

Thursday 4–6 pm takes 20 deliveries and has 20. A customer looking at Thursday does not see 4–6 pm;
on Friday 4–6 pm is still offered. When two customers reach payment for the last place in Friday's
4–6 pm at the same moment, exactly one gets it; the other is told plainly, is not charged, and chooses
again.

**Why this priority**: capacity counted across days would either oversell a day or wrongly close
every day after the first busy one.

**Independent Test**: fill one window on one day; confirm it is not offered on that day and is offered
on every other day; race two payments for the last place and confirm one succeeds and one is refused
without a charge.

**Acceptance Scenarios**:

1. **Given** a window full on one day, **When** the customer views that day, **Then** the window is
   not offered.
2. **Given** the same window is full on one day, **When** the customer views any other day, **Then**
   its availability there depends only on that day's bookings.
3. **Given** a window with no limit set, **When** any number of orders choose it on a day, **Then** it
   never fills; it closes only by its cutoff and, today, by collection.
4. **Given** two customers try to take the last place in a window on the same day, **When** both
   proceed to payment, **Then** exactly one gets it and the other is not charged and is asked to
   choose again.
5. **Given** an order is cancelled before delivery, **When** the cancellation completes, **Then** its
   place in that day's window is freed.

---

### User Story 4 - Paying never costs the customer their window (Priority: P1)

The customer chooses Friday 8–10 am and proceeds to payment. Their place is held while they pay. If
the window filled or closed while they were choosing, they are told before any charge and choose
again. If they pay slowly, the hold lapses, and someone else takes the last place, the customer still
gets Friday 8–10 am — they paid for it — and staff are told the window is over its limit.

**Why this priority**: charging a customer for a window they did not get, or moving them to another
without asking, is the failure customers remember.

**Independent Test**: hold a place and pay within the hold; let a hold lapse unpaid and confirm the
place is freed; let a hold lapse, fill the window, then complete payment and confirm the order keeps
its window and staff see it flagged.

**Acceptance Scenarios**:

1. **Given** a chosen window still has room, **When** the customer proceeds to payment, **Then** a
   place is held for that order on that day for a short, set time and counts against that day's room.
2. **Given** a chosen window has filled or closed, **When** the customer proceeds to payment, **Then**
   no charge is taken and the customer is told and asked to choose again.
3. **Given** a hold ends without payment, **When** it lapses, **Then** the place is freed for others.
4. **Given** payment completes after the hold lapsed and the window has since filled or closed,
   **When** the order is placed, **Then** it keeps the window the customer chose and staff are told
   it is over the window's limit.
5. **Given** any of the above, **When** the order is placed, **Then** the platform never moves it to a
   different window or day without the customer choosing.

---

### User Story 5 - The customer sees what each window costs (Priority: P2)

Today's windows carry the "Delivery today" surcharge and the evening windows carry an evening
surcharge. Each window lists its surcharge beside it before it is chosen, and choosing it shows the
surcharge as its own line in the delivery total. A window without a surcharge shows nothing extra.

**Why this priority**: the price is already set by the fee plan (077); this story is about showing it
before the choice. The feature works without surcharges.

**Independent Test**: with a "Delivery today" surcharge and one window surcharge active, open checkout
and compare each window's shown surcharge with the plan; choose each and compare the delivery lines.

**Acceptance Scenarios**:

1. **Given** a window that carries a surcharge on a day, **When** it is offered, **Then** the amount is
   shown beside it before it is chosen.
2. **Given** the same window today and on a later day, **When** both are offered, **Then** today's
   shows the "Delivery today" surcharge and the later one does not.
3. **Given** the basket has reached the free-delivery amount, **When** windows are offered, **Then**
   none shows a surcharge to pay (delivery, surcharge included, is free).
4. **Given** the customer chooses a window, **When** the delivery total is shown, **Then** it equals
   what is charged.

---

### User Story 6 - The customer is told plainly when nothing is available (Priority: P2)

A customer at an address Effy delivers to opens checkout late on a busy Friday: every window today
has closed and every window on the next three delivery days is full. They are told, in one sentence,
that there are no delivery windows available in the next few days. They are offered courier delivery
instead only when the business allows it; otherwise they cannot pay.

**Why this priority**: rare, but a blank picker or an unexplained refusal loses the sale and the
customer's trust.

**Independent Test**: close or fill every window on all four days and open checkout; confirm the
message and that payment cannot proceed; repeat with courier delivery allowed (once a later feature
allows it).

**Acceptance Scenarios**:

1. **Given** no window is available on any of the four days, **When** the customer opens checkout,
   **Then** they see one plain sentence saying so and cannot pay for Effy delivery.
2. **Given** the business allows courier delivery as a fallback, **When** no window is available,
   **Then** courier delivery is offered instead.
3. **Given** the business does not allow it, **When** no window is available, **Then** no courier
   option appears.
4. **Given** no windows are defined or switched on at all, **When** a customer at a covered address
   reaches checkout, **Then** they see the same sentence and the business is alerted.

---

### User Story 7 - The window the customer bought is the window they keep (Priority: P1)

A customer buys Thursday 4–6 pm. Before Thursday, staff move that window to 5–7 pm, lower its limit,
and later switch it off. The customer's order page, receipt and email still say "Thursday 9 Oct,
4–6 pm"; new customers see the changed window (or none).

**Why this priority**: a placed order is a promise; editing configuration must never rewrite it.

**Independent Test**: place an order in a window, change the window's times, limit and status, and
mark its date as non-delivery; confirm the order shows exactly what was sold everywhere, and new
checkouts reflect each change.

**Acceptance Scenarios**:

1. **Given** a placed order, **When** its window's times, limit or status change, **Then** the order
   still shows the day and times it was sold.
2. **Given** a window is switched off, **When** a new customer reaches checkout, **Then** it is not
   offered on any day.
3. **Given** a window's times change, **When** a new customer reaches checkout, **Then** the new times
   are offered on every day.
4. **Given** a placed order, **When** the customer views its page, receipt or confirmation email,
   **Then** the delivery is shown as its day and window, e.g. "Thursday 9 Oct, 4–6 pm".
5. **Given** a paid order, **When** anyone tries to change its window, **Then** this feature offers no
   way to do so.

---

### User Story 8 - Back-office sees how full each window is, day by day (Priority: P2)

A manager opens delivery windows and sees a grid: each window down the side, today and the next
three delivery days across the top, and in each cell the number booked against the limit (or booked
with no limit), with holds counted. A window over its limit is marked. The grid changes as orders
arrive, without reloading.

**Why this priority**: staff need it to set limits and spot trouble, but customers can check out
without it.

**Independent Test**: book orders into different windows on different days; confirm each cell's count;
place an over-limit order (story 4) and confirm it is marked; book from another session and confirm
the open screen updates.

**Acceptance Scenarios**:

1. **Given** bookings on several days, **When** staff open the windows screen, **Then** they see, per
   window per day, booked count and limit.
2. **Given** a window over its limit on a day, **When** staff view it, **Then** that cell is marked.
3. **Given** a non-delivery day inside the range, **When** staff view the grid, **Then** it is skipped
   in the same way customers' days are.
4. **Given** a new booking or cancellation, **When** it happens, **Then** an open windows screen shows
   it without being reloaded.
5. **Given** a customer-service agent, **When** they open the screen, **Then** they can read it and
   change nothing.

---

### Edge Cases

- **Midnight.** At 00:00 Melbourne time "today" becomes the next day; a window the customer was
  looking at on "Wed" becomes a "Today" window and is now subject to today's rules (cutoff, collection,
  "Delivery today" surcharge). A choice that is no longer valid is caught when they proceed to payment.
- **Daylight-saving change days.** Windows, cutoffs and day boundaries are Melbourne wall-clock times;
  a window on a change day keeps its wall-clock start and end.
- **A chosen future-day window whose day becomes a non-delivery day** before the customer pays: caught
  at payment, no charge, choose again.
- **A future day's window and its cutoff.** On a future day the window's cutoff has not yet arrived;
  it closes when that day's cutoff passes, like any other day.
- **The customer changes address during checkout** to one Effy does not deliver to: the window choice
  is dropped, not carried over (what replaces it is the courier feature's concern).
- **A window whose limit is lowered below what is already booked** on a day: existing orders keep their
  places; the cell shows over its limit; no new bookings until it has room.
- **The hold length** is the one set for 069; a hold on a later day behaves exactly as one today.
- **An order placed before this feature** keeps whatever it was sold and shows it as it does today.

## Requirements *(mandatory)*

### Functional Requirements

**What the customer is offered**

- **FR-001**: For an order "Delivered by Effy" — the default wherever Effy delivers — the customer
  MUST choose one delivery window: a day and a window on that day.
- **FR-001a**: Checkout MUST present the choice in two sections: **Same-day delivery** (today's
  windows, each showing its cutoff) and **Standard delivery** (the following delivery days, each with
  its windows). These two names MUST be used consistently wherever the customer sees the choice or the
  order.
- **FR-001b**: Where Effy does not deliver to the address, no window picker MUST be shown. Until the
  courier flow exists (E5) the customer sees the existing "we don't deliver here" message; E5 replaces
  it with "delivered by a courier partner".
- **FR-002**: The days offered MUST be today and the next three delivery days. The number of days
  after today MUST be a business setting, three by default.
- **FR-003**: Days marked as non-delivery (weekdays and specific dates) MUST NOT be offered and MUST
  NOT count toward the number of days after today.
- **FR-004**: The same set of switched-on windows MUST be offered on every delivery day.
- **FR-005**: A window MUST be offered today only while its cutoff today has not passed, it has room
  today, and Effy can still collect the order's goods and have them ready before it starts.
- **FR-006**: A window MUST be offered on a later day while it has room on that day and that day's
  cutoff has not passed.
- **FR-007**: When no window is open today, the customer MUST be told so in words distinct from the
  "no windows available" message (FR-019), and the later days MUST still be offered.
- **FR-008**: Each offered window MUST show its day, its start and end time, and its surcharge if any.
- **FR-009**: An order MUST have one window, whatever the number of suppliers behind it. Nothing
  offered or shown MUST let the customer infer the number or identity of suppliers.
- **FR-010**: The platform MUST NOT choose a window for the customer.
- **FR-011**: The customer's choice MUST survive moving between checkout steps and a failed payment
  attempt while the window remains open.

**Room in a window**

- **FR-012**: A window's room MUST be counted per day: bookings on one day MUST NOT affect the same
  window on any other day.
- **FR-013**: One order counts as one delivery against a window, whatever its number of packages.
- **FR-014**: A window MUST have no limit unless staff set one; a window without a limit never fills.
- **FR-015**: When two customers compete for the last place in a window on a day, exactly one MUST get
  it.
- **FR-016**: A place MUST be freed when its order is cancelled before delivery.

**The moment of payment**

- **FR-017**: The chosen window and day MUST be checked again when the customer proceeds to payment.
  If the window is full, closed, switched off, or the day is no longer a delivery day, no charge MUST
  be taken and the customer MUST be asked to choose again.
- **FR-018**: When the check passes, a place MUST be held for that order on that day for a short, set
  period. A hold that ends unpaid MUST free the place. If payment completes after the hold ended and
  the window has since filled or closed, the order MUST keep its window and staff MUST be told it is
  over the limit.
- **FR-019**: When no window is available on any of the offered days, the customer MUST be told in one
  plain sentence and MUST NOT be able to pay for Effy delivery. Courier delivery MUST be offered instead
  only when the business allows it.
- **FR-020**: When no window is defined or switched on at all, the business MUST be alerted.
- **FR-021**: Availability, room and holds MUST be enforced by the platform, not only by the screen.

**Price**

- **FR-022**: The surcharge shown beside a window MUST be the one the active fee plan applies to that
  window on that day, including the "Delivery today" surcharge for windows today. The surcharge
  charged MUST be the one shown.

**After the order is placed**

- **FR-023**: The order MUST record the day and window (with its start and end times) it was sold, as
  they stood at that moment.
- **FR-024**: The order page, confirmation, receipt and receipt email MUST show the delivery as its day
  and window (e.g. "Thursday 9 Oct, 4–6 pm").
- **FR-025**: No change to a window, its limit or status, the non-delivery days or the number of days
  offered MUST change a placed order.
- **FR-026**: The window MUST NOT be changeable after payment through this feature.
- **FR-027**: Staff who can view an order MUST see its day and window.

**Back-office**

- **FR-028**: Staff MUST see, for each window on today and each offered day, the number of deliveries
  booked (holds included) against its limit, and which are over their limit.
- **FR-029**: That view MUST update without being reloaded when a booking is confirmed or cancelled
  or a window or day setting changes. A short payment hold is counted, and shows on the next update.
- **FR-030**: Managers and admins MUST be able to create, change and switch off windows, set the number
  of days offered, and mark non-delivery weekdays and dates. Customer-service agents MUST be able to
  view them and change nothing. Shops and drivers MUST NOT see or change them.
- **FR-031**: A window MUST be refused if its end is not after its start, its cutoff is after its
  start, or a limit is given that is not a whole number of at least one.
- **FR-032**: Marking a date as non-delivery MUST tell staff how many placed orders carry that date and
  MUST NOT change them.
- **FR-033**: Every change to windows and day settings MUST record who made it and when.
- **FR-034**: Back-office MUST show the days setting as Effy delivery days and MUST NOT present a
  delivery sold a window as a carrier delivery. The window screen keeps today's words ("same-day slot")
  until the switch, because until then that is what the windows are; the rename lands with the cutover.

**Everywhere**

- **FR-035**: All days and times MUST be Melbourne wall-clock time, wherever the customer's device is.
- **FR-036**: Choosing a window and seeing it afterwards MUST look and behave the same on the customer
  website and the customer mobile app.
- **FR-037**: The new choice MUST be built switched off. Until the operator switches it on (at the
  cutover), customers MUST keep being offered exactly what they are offered today; staff MUST be able to
  configure windows and days and see fullness before then. Switching it on MUST NOT change any order
  already placed.

### Key Entities

- **Delivery window** (existing, 069): a daily window — start, end, cutoff, optional limit, on/off —
  repeated on every Effy delivery day.
- **Window booking** (existing, 069): one order's place in one window on one day; held at payment,
  confirmed when paid, freed if the hold lapses or the order is cancelled. Counted per window per day.
- **Effy delivery days** (existing settings, renamed in meaning): the number of days offered after
  today, non-delivery weekdays, and non-delivery dates.
- **Offered day**: today or one of the next delivery days, with the windows open on it.
- **Order's delivery window**: the day and window an order was sold, fixed when it was placed.
- **Window fullness**: booked count against limit, per window per day, for staff.
- **Window surcharge** (existing, 077): what the active fee plan adds to a window on a day.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For 100% of a published set of test clocks (before, at and after each cutoff; midnight;
  both daylight-saving change days; non-delivery weekdays and dates), the days and windows offered
  equal the hand-worked answer.
- **SC-002**: A non-delivery day is never offered, and 100% of checkouts on a delivery-covered address
  are offered exactly the set number of delivery days after today.
- **SC-003**: Zero windows accept more confirmed deliveries on a day than their limit, other than
  orders that paid after their hold lapsed — and 100% of those are flagged to staff.
- **SC-004**: Zero customers are charged for a window they did not get, and zero orders are moved to a
  window or day the customer did not choose.
- **SC-005**: Filling a window on one day changes availability on zero other days.
- **SC-006**: For 100% of orders, the day and window on the order page, receipt and email equal what
  was chosen at checkout, and remain so after any change to window configuration.
- **SC-007**: A customer can choose a window on any offered day in under 15 seconds from reaching the
  delivery step.
- **SC-008**: The windows offered, their surcharges and the shown order window are identical on the
  website and the mobile app for 100% of test cases.
- **SC-009**: Staff can see how full every window is on each offered day from one screen, and it
  reflects a new booking without a reload.

## Assumptions

- **"Next three days" counts delivery days**, not calendar days (answer Q4, 2026-10-08), reusing the
  non-delivery weekdays and dates 069 introduced.
- **A later day's window closes at that day's cutoff.** There is no extra "book by the day before"
  rule; the collection check applies only to today, because a window on a later day can always be
  collected for in time (planning that collection is E8).
- **Windows are the same every delivery day.** Different windows for different weekdays remain a
  later change (as in 069).
- **The limit is optional and off by default** (069, amended 2026-10-07), counted per order per
  address, across the whole delivery area.
- **The hold length** is 069's (ten minutes by default, configurable).
- **Surcharges are priced by 077**: the active fee plan's "Delivery today" surcharge on today's
  windows and any per-window surcharge. This feature shows them; it does not change how they are set.
- **"Standard delivery" changes meaning, not name** (clarified 2026-10-08). For Effy addresses it is
  now a later-day window delivered by Effy; orders placed before the switch keep their old meaning and
  show as they do today. The backlog's plan to remove the words "same-day" and "standard" from
  customer screens (E5, E9) is superseded for customer wording.
- **Courier fallback cannot be offered yet.** Courier ordering stays switched off until the checkout
  feature (E5) makes a courier order placeable; until then "no window available" ends at the plain
  sentence. The sentence is new and distinct from the "we don't deliver to this address" refusal (076).
- **The standard-delivery day picker and the carrier lead time stop applying to Effy delivery.** A
  later day is now delivered by Effy in a window, not handed to a carrier by date. The carrier lead time
  may return for courier delivery (E6).
- **Driver planning across days is out of scope** (E8): collecting for a later day, holding parcels at
  the hub, and releasing a round only on its own day.
- **Out of scope**: the courier flow (E5, E6), changing a window after payment, holding a place while
  browsing, demand pricing, per-weekday or per-area windows or limits.
- **Only signed-in customers check out**, as today.
- **An order sold one window is shown as ONE delivery.** Order pages and receipts used to list one
  arrival per supplier package, so a three-supplier order read "Multiple deliveries" — which told the
  customer how many suppliers filled it. Identical promises are now said once. This also applies to
  orders placed before this feature whose packages share one promise. (Found while implementing.)
- **Staff order screens that count "needs carrier handover"** treat a delivery sold a window as
  Effy's, not a carrier's — the list, its badge and the action on the order. (Found while analysing.)

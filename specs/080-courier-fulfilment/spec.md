# Feature Specification: Courier Fulfilment — Via the Hub or Pickup from the Supplier

**Feature Branch**: `080-courier-fulfilment`

**Created**: 2026-10-09

**Status**: Draft

**Input**: "Courier Fulfilment. Orders delivered by courier reach the courier in one of two ways, chosen
by the business: 'via the hub' — Effy's drivers collect the parcels from Effy's suppliers, bring them
to Effy's hub, and hub staff hand them to the courier (how it works today); or 'pickup from supplier' —
the courier collects each parcel straight from the supplier that packed it. The business sets a default
for the whole platform and staff can change it for a single order until the first parcel of that order
has left Effy's or the supplier's hands. Each parcel handed to a courier gets its own consignment
(courier name, service and reference, when known), so an order filled by two suppliers with pickup from
supplier has two consignments; the customer still sees one order and never learns how many suppliers
were involved. For 'pickup from supplier', supplier staff see which parcels a courier will collect and
when, the label or reference to attach, and mark each parcel handed over; they never see the customer's
fee. For 'via the hub', hub staff see which parcels are due to go to which courier and record the
handover. Staff can record courier progress (in transit, delivered, failed) by hand, and a delivered
courier parcel completes like any other. When a courier cannot pick up from a supplier, staff can switch
that order to 'via the hub'. Problems (lost, damaged, returned to sender) are raised to back-office with
the order. In this feature bookings are made and recorded by staff; automatic booking with a courier
company comes later. The business keeps a list of the courier services it uses, each with its own usual
timeframe; a courier order is told the timeframe of the service it will go with, and keeps what it was
told. A courier parcel waiting at the hub is due to go out by the next pickup of its courier service, and
staff see the ones that are late. Drivers checking parcels in at the hub see 'Courier' for parcels that
go to a courier, never 'Standard'. A customer sees one tracking link for their order only when it
travels as a single consignment; otherwise they are told tracking is sent by email for each parcel."

**Programme**: Delivery Model v2, epic **E6** (`docs/prd/2026-10-delivery-model-v2-backlog.md`).
Builds on 079 (every order is "Delivered by Effy" or "Courier delivery", with a recorded type and the
estimate it was sold) and on 053's carrier handover and arrival records. Staff moving an order between
the two delivery types, with compensation, is E7. Automatic booking with a courier company and live
courier quotes are E10.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Courier parcels go via the hub, tracked as consignments (Priority: P1)

A courier order is placed with the platform's default "via the hub". Its parcels are collected by Effy
drivers and checked in at the hub, where the driver sees them as **Courier**. Hub staff open the
courier handover list, see each parcel due to go, which courier service it goes with and by when, book
it with the courier, and record the handover with the courier's reference. The parcel then reads
**With carrier**. Later staff record "in transit" and then "delivered", and the order completes.

**Why this priority**: it is how courier parcels already move; this story makes each handover a
consignment the business can follow, and is the base every other story adds to.

**Independent Test**: place a one-supplier courier order; collect and check it in; record the handover
with a reference; record delivered; confirm the status runs At hub → With carrier → Delivered and the
order completes.

**Acceptance Scenarios**:

1. **Given** a courier parcel checked in at the hub, **When** a driver views the check-in, **Then** it is
   labelled "Courier", never "Standard".
2. **Given** courier parcels at the hub, **When** hub staff open the handover list, **Then** each shows
   its order, its courier service, when it is due out (the service's next pickup) and whether it is late.
3. **Given** a parcel handed to the courier, **When** staff record the handover with service and
   reference, **Then** a consignment is recorded and the parcel reads "With carrier".
4. **Given** a handover recorded with no reference yet, **When** staff add the reference later, **Then**
   it is added to the same consignment; the handover itself is complete without it.
5. **Given** a consignment, **When** staff record "in transit" then "delivered", **Then** the parcel reads
   "Delivered" and, once every parcel of the order is delivered, the order is complete like any other.
6. **Given** a parcel past its courier service's next pickup and still at the hub, **When** staff view the
   handover list, **Then** it is marked late.

---

### User Story 2 - The courier picks up straight from the supplier (Priority: P1)

The business sets the platform default to "pickup from supplier". A courier order filled by two
suppliers is placed. Effy drivers are not sent to collect it. Each supplier sees, for its own parcel,
that a courier will collect it and when, the courier reference and the label to attach, and marks it
handed over when the courier takes it. The order has two consignments; the customer sees one order.

**Why this priority**: this is the new way a parcel can reach a courier, and removes a hub trip for
orders the hub only passes through.

**Independent Test**: with the default set to pickup from supplier, place a two-supplier courier order;
book both consignments; confirm neither parcel goes on a collection round, each supplier sees only its
own pickup, and each handover makes that parcel "With carrier" without ever reading "At hub".

**Acceptance Scenarios**:

1. **Given** the default is pickup from supplier, **When** a courier order is placed, **Then** its
   parcels are not offered to Effy drivers for collection.
2. **Given** staff have booked a pickup for a parcel, **When** the supplier views its orders, **Then** it
   sees "Courier pickup", the pickup day and time window, the courier and the reference, and the label
   to print where one was attached.
3. **Given** no pickup is booked yet, **When** the supplier views the parcel, **Then** it says a courier
   pickup is being arranged, and the parcel is still prepared and marked ready as usual.
4. **Given** the courier collects the parcel, **When** supplier staff mark it handed over, **Then** that
   parcel reads "With carrier" and never "At hub".
5. **Given** an order filled by two suppliers, **When** both are handed over, **Then** there are two
   consignments, and the customer still sees one order with one delivery line.
6. **Given** any supplier screen for a courier pickup, **When** it is viewed, **Then** it shows no
   delivery fee, no estimate given to the customer, and nothing about the other supplier's parcel.

---

### User Story 3 - Staff change how one order reaches the courier (Priority: P2)

A courier cannot get to a supplier this week. Staff open the order, see it is set to pickup from
supplier, and switch it to via the hub. The parcels become ordinary collection work for Effy drivers.
Once any parcel of the order has left the supplier or the hub, the switch is no longer offered.

**Why this priority**: the fallback that makes the pickup mode safe to use.

**Independent Test**: switch an order both ways before any handover; confirm the parcels move on and
off collection work; record one handover and confirm the switch is refused.

**Acceptance Scenarios**:

1. **Given** a courier order set to pickup from supplier with no parcel handed over or collected,
   **When** staff switch it to via the hub, **Then** its parcels become collection work for Effy drivers
   and any booked pickup is shown to the supplier as cancelled.
2. **Given** an order set to via the hub with no parcel collected, **When** staff switch it to pickup from
   supplier, **Then** its parcels are taken off collection work.
3. **Given** any parcel of the order has been collected by a driver or handed to a courier, **When** staff
   try to switch, **Then** it is refused with the reason.
4. **Given** a switch, **When** staff view the order, **Then** they see who switched it, when and why.
5. **Given** the platform default is changed, **When** existing orders are viewed, **Then** each keeps the
   mode it had; only new orders follow the new default.

---

### User Story 4 - The customer is told the right timeframe and can track it (Priority: P2)

The business lists its courier services, each with a usual timeframe ("Express, 1–2 business days";
"Standard parcel, 2–5 business days") and one marked as the default for new courier orders. A customer
checking out to a courier address is told the default service's timeframe, as an estimate, and the
order keeps it. Once handed over, if the order travels as one consignment the customer sees one
tracking link on their order page; if it travels as several they are told tracking is emailed for each
parcel, and each parcel's tracking is emailed when it is handed over.

**Why this priority**: what the customer reads; needed before courier orders reach real people.

**Independent Test**: set two services with different timeframes; check out — the default's timeframe
is shown and kept; hand over one consignment with a tracking link — it appears on the order page; on a
two-consignment order the page says tracking is emailed, and two emails go out.

**Acceptance Scenarios**:

1. **Given** courier services with their timeframes and one default, **When** a customer checks out to a
   courier address, **Then** they are shown the default service's timeframe as an estimate, and the
   order keeps that text.
2. **Given** a service's timeframe is changed later, **When** the customer views an existing order,
   **Then** it still shows what they were told.
3. **Given** an order whose only consignment has a tracking link, **When** the customer views the order,
   **Then** it shows one "Track your parcel" link with the courier's name.
4. **Given** an order with more than one consignment, **When** the customer views it, **Then** no link is
   shown and they are told tracking is sent by email for each parcel; nothing on the page says how many.
5. **Given** a consignment is handed over with a tracking link, **When** the handover is recorded,
   **Then** the customer is sent "Your order is with the courier" with that parcel's tracking.
6. **Given** a consignment with no tracking link, **When** it is handed over, **Then** the customer is told
   it is with the courier, and no link is invented.

---

### User Story 5 - Problems with a courier parcel reach back-office (Priority: P2)

A courier reports a parcel damaged. Staff record it on the consignment. The parcel reads **Problem**
with the reason, and the order appears in back-office's needs-attention view until someone resolves it
(for example by refunding through the existing refund flow, or recording that the courier delivered a
replacement).

**Why this priority**: a lost parcel left looking "With carrier" forever is a customer nobody calls back.

**Independent Test**: record "lost" on a consignment; confirm the parcel reads Problem, the order is
listed as needing attention, and resolving it removes it from the list.

**Acceptance Scenarios**:

1. **Given** a consignment, **When** staff record failed, lost, damaged or returned to sender with a note,
   **Then** the parcel reads "Problem" with that reason and the order is listed as needing attention.
2. **Given** a problem, **When** staff record that it is resolved (delivered after all, or dealt with),
   **Then** it leaves the needs-attention list and the history keeps both entries.
3. **Given** a parcel handed to a courier and nothing recorded for longer than the service's timeframe,
   **When** staff view courier parcels, **Then** it is marked overdue.
4. **Given** any problem, **When** the customer views the order, **Then** they see the platform's status
   words only — no courier's internal reason codes and no staff notes.

---

### User Story 6 - The business manages its courier services and the default mode (Priority: P3)

In back-office staff add the courier services Effy uses (courier name, service name, usual timeframe,
pickup days and cut-off time, and whether it picks up from suppliers), mark one as the default for new
courier orders, retire one no longer used, and set the platform's default mode.

**Why this priority**: required configuration, but simple, and the others can be tested against seeded
services.

**Independent Test**: add two services, set a default, retire one, change the default mode; confirm
checkout and new orders follow, and existing orders are unchanged.

**Acceptance Scenarios**:

1. **Given** no active courier service, **When** staff try to switch courier delivery on, **Then** it is
   refused: a customer would be told no timeframe.
2. **Given** a service that does not pick up from suppliers, **When** it is chosen for a pickup-from-
   supplier booking, **Then** it is refused.
3. **Given** a service is retired, **When** existing consignments are viewed, **Then** they keep naming it;
   it simply cannot be chosen for new ones.
4. **Given** the default service is retired, **When** staff try to retire it, **Then** they must first
   choose another default.

---

### Edge Cases

- **Pickup from supplier, but the supplier marks the parcel unavailable** (cannot supply): no consignment
  is booked for it; the existing shortfall and refund flow applies.
- **A two-supplier order where one parcel is handed over and the other is not**: the order is "With
  carrier" only for the first; the customer's order status stays at the least advanced parcel, as today.
- **A courier collects but the supplier forgets to mark it**: staff can record the handover from
  back-office on the supplier's behalf; it says who recorded it.
- **Staff book a consignment and then the courier never comes**: staff can cancel the booking and book
  again, or switch the order to via the hub if nothing has left yet.
- **A parcel recorded delivered by the courier and also by staff**: recorded once; the first record
  stands, as for every arrival.
- **Orders placed before this feature** that went to a carrier keep their handover records and read as
  they do today; they are not given consignments retroactively.
- **An order that was Effy's and is moved to a courier later** (E7) uses the default mode at that moment
  unless staff choose otherwise.
- **The hub handover list** never lists a parcel set to pickup from supplier.
- **Pickup windows** are the courier's; staff enter what the courier booked. A pickup left in the past
  with no handover is marked late on the supplier's and back-office's screens.
- **Labels** show the customer's delivery name and address, which suppliers already see to prepare the
  order (D13); the supplier's own address appearing as sender is accepted.

## Requirements *(mandatory)*

### Functional Requirements

**Modes**

- **FR-001**: The business MUST be able to set the platform default for how courier parcels reach the
  courier: "via the hub" or "pickup from supplier". It MUST be "via the hub" until changed.
- **FR-002**: Every courier order MUST carry its own mode, taken from the default when it is placed.
  Changing the default MUST NOT change existing orders.
- **FR-003**: Staff MUST be able to change one order's mode until any of its parcels has been collected
  by a driver or handed to a courier; after that the change MUST be refused with the reason. Each change
  MUST record who, when and why.
- **FR-004**: Parcels of an order set to pickup from supplier MUST NOT be offered to Effy drivers as
  collection work; parcels of an order set to via the hub MUST be, as today.

**Consignments**

- **FR-005**: Every courier parcel handed to a courier MUST have its own consignment: courier service,
  reference (when known), tracking link (when known), optional label, how it reached the courier (hub or
  supplier), and its progress.
- **FR-006**: Staff MUST be able to book a consignment before handover (service, reference, pickup day
  and window, label), add or correct the reference and tracking link after, and cancel a booking that
  has not been handed over.
- **FR-007**: A consignment's progress MUST be one of: booked, handed over, in transit, delivered, failed,
  lost, damaged, returned to sender — recorded by staff (or, for handover, by supplier staff), each with
  who and when.
- **FR-008**: A handed-over parcel MUST read "With carrier"; a delivered one "Delivered"; failed, lost,
  damaged or returned "Problem" with the reason — using the platform's existing status words only.
- **FR-009**: A delivered courier parcel MUST complete like any other: the order is complete when every
  parcel is delivered or cancelled, and the customer is told as for any delivered order.
- **FR-010**: Courier parcels handed over before this feature MUST keep reading as they do today.

**Hub**

- **FR-011**: Drivers checking parcels in at the hub MUST see "Courier" for a parcel that goes to a
  courier, never "Standard".
- **FR-012**: The hub handover list MUST show each courier parcel set to via the hub that has not been
  handed over: its order, courier service, when it is due out and whether it is late. Due out is the
  courier service's next pickup after the parcel can reach the hub.
- **FR-013**: Recording a hub handover MUST create (or complete) that parcel's consignment.

**Suppliers**

- **FR-014**: For a parcel set to pickup from supplier, the supplier MUST see that a courier will collect
  it, and once booked the pickup day and window, courier, reference and label; before booking, that a
  pickup is being arranged.
- **FR-015**: Supplier staff MUST be able to mark their own parcel handed over to the courier; staff in
  back-office MUST be able to record it for them.
- **FR-016**: Supplier screens MUST NOT show the customer's delivery fee, the customer's estimate, any
  other supplier's parcel, or how many suppliers fill the order.

**Courier services**

- **FR-017**: Back-office MUST be able to maintain courier services: courier name, service name, usual
  timeframe (as the customer reads it), pickup days and cut-off time, whether it collects from
  suppliers, active or retired, and which one is the default for new courier orders.
- **FR-018**: At checkout a courier order MUST be told the default service's timeframe, as an estimate,
  and MUST keep that text. Courier delivery MUST NOT be switchable on without an active default service.
- **FR-019**: A retired service MUST stay on the consignments that name it and MUST NOT be offered for new
  bookings.

**Customers**

- **FR-020**: When an order has exactly one consignment and it has a tracking link, the customer's order
  page MUST show one tracking link with the courier's name.
- **FR-021**: When an order has more than one consignment, the order page MUST say tracking is sent by
  email for each parcel, MUST NOT show any link, and MUST NOT say how many parcels there are.
- **FR-022**: When a consignment is handed over, the customer MUST be told their order is with the
  courier, with that parcel's tracking link when there is one, by email and notification.
- **FR-023**: The customer MUST NOT see staff notes, courier problem codes, references without a link, or
  anything that reveals the number of suppliers.

**Problems and lateness**

- **FR-024**: A consignment recorded failed, lost, damaged or returned MUST put the order on back-office's
  needs-attention view until staff record it resolved.
- **FR-025**: A courier parcel at the hub past its due-out time, a booked supplier pickup past its window
  without handover, and a handed-over parcel with no progress for longer than its service's timeframe
  MUST each be marked late or overdue to staff.
- **FR-026**: The business MUST be able to see consignments by progress and how many are late, and be
  alerted when parcels sit booked but not handed over beyond a set time.

**Live updates**

- **FR-027**: Every screen showing a parcel or order MUST update when its consignment or mode changes,
  as for any other order change.

### Key Entities

- **Courier service**: a courier company's named service Effy uses — timeframe text, pickup days and
  cut-off, whether it collects from suppliers, active or retired; one is the default.
- **Courier mode** (per order, with a platform default): via the hub, or pickup from supplier; with a
  history of changes.
- **Consignment**: one parcel's journey with a courier — service, reference, tracking link, label, how it
  reached the courier, pickup booking, and its progress entries.
- **Consignment progress entry**: one step — booked, handed over, in transit, delivered, failed, lost,
  damaged, returned, resolved — with who, when and a note.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of courier parcels handed over after release have a consignment naming the service.
- **SC-002**: With pickup from supplier, zero courier parcels appear on Effy drivers' collection work.
- **SC-003**: Zero hub check-in screens show "Standard" for a courier parcel.
- **SC-004**: Zero supplier screens show a delivery fee, a customer estimate, or another supplier's parcel.
- **SC-005**: Zero customer surfaces let the number of suppliers be worked out — one link or none, one
  delivery line.
- **SC-006**: Every lost, damaged, failed or returned courier parcel appears in back-office's
  needs-attention view within one minute of being recorded, and stays until resolved.
- **SC-007**: Staff can find every late courier parcel (at the hub, at a supplier, or with a courier) in
  one view.
- **SC-008**: A courier order's customer is told the timeframe of a service the business actually uses,
  in 100% of courier checkouts.

## Assumptions

- **Manual first** (backlog E6): staff book with the courier outside the platform and record the
  booking, reference, tracking link and label here. No courier company is integrated or named in the
  product; which couriers to use (D14) is researched during planning and entered by the operator.
- **The service is chosen at booking, not at checkout.** Checkout tells the customer the default
  service's timeframe; staff may book another service, and the customer keeps what they were told.
- **One consignment per parcel.** Splitting one supplier's parcel across several consignments is out
  of scope.
- **Labels are files staff attach** (from the courier's booking); this feature does not generate labels.
- **Tracking per Q8**: one link when the order travels as one consignment; otherwise "tracking is sent
  by email for each parcel".
- **Default mode is via the hub**, matching today's behaviour, so release changes nothing for parcels.
- **Courier delivery stays dormant until the cutover** (079): until the new delivery model is on there
  are no courier orders, so this feature's screens are configured and tested ahead of time.
- **Moving an order between Effy and courier** is E7; this feature only changes the courier mode within
  a courier order.
- **Out of scope**: automatic booking, live courier quotes and courier status webhooks (E10); returns
  handling beyond recording "returned to sender"; customer-chosen courier services.

# Feature Specification: Cutover to the New Delivery Model

**Feature Branch**: `083-delivery-model-cutover`

**Created**: 2026-10-09

**Status**: Draft

**Input**: "Cutover to the new delivery model. From a moment the business chooses, every new order uses
'Delivered by Effy' (a delivery window today or on one of the next delivery days) or 'Courier
delivery'; orders placed before that moment keep exactly what they were sold (a same-day window, or a
standard day handed to a carrier) and finish their journey unchanged — customers, suppliers, drivers
and staff can still see and complete them. Before the switch, staff can check that the new setup is
complete — delivery area listed, an Effy fee plan active, delivery windows defined, collection runs
scheduled, and courier delivery either switched off or fully set up (fee table, default courier
service, how parcels reach the courier) — and the switch refuses to happen if anything is missing.
Staff choose the moment (now, or a future time), can change or cancel it until it arrives, and can see
afterwards when it happened and who set it. After the switch staff can see how many orders of the old
kind are still open. Once none remains open and every app in use has been updated, the old arrangement
is removed entirely in a second step: the old checkout choices, the old settings and screens that only
served it, and the old words for staff, suppliers and drivers all go, while the history of old orders
still reads correctly. Customers keep reading 'Same-day delivery' and 'Standard delivery' as the names
of an Effy window today or on a later day. The business's documentation is rewritten to describe only
the new model, with a short record of what the old one was and how to read an old order."

**Programme**: Delivery Model v2, epic **E9** (`docs/prd/2026-10-delivery-model-v2-backlog.md`) — the last
build epic. Everything the new model needs is built and in dev, switched off: coverage (076), one fee
per order (077), windows today and on the next delivery days (078), Effy or courier at checkout (079),
courier fulfilment (080), back-office moves and compensation (081) and driver work (082). This feature
turns it on, and then takes the old arrangement away.

⚠ **Two stages, released separately.** Stage 1 (the switch) can ship at once. Stage 2 (removal) ships
only after no order of the old kind is open — in production that is days later, not the same release.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Staff check the platform is ready, and the switch refuses if it is not (Priority: P1)

An admin opens **Go-live** in back-office. A checklist says, item by item, whether the new model can
sell an order and deliver it: Effy's delivery area has postcodes; an Effy fee plan is active and prices
every listed postcode; delivery windows are defined; collection runs are scheduled; courier delivery is
either off, or fully set up. Each failing item says what is missing and where to fix it. The switch
cannot be set while any required item fails.

**Why this priority**: switching on a platform that cannot price or deliver an order sells nothing, or
sells what cannot be kept. The checklist is the gate.

**Independent Test**: with one required item missing (for example, no delivery windows), open the
checklist and confirm that item fails with its remedy and that setting the switch is refused; fix it
and confirm the checklist passes.

**Acceptance Scenarios**:

1. **Given** the Go-live page, **When** any back-office role opens it, **Then** every readiness item is
   shown as ready or not ready, each not-ready item with one line saying what is missing and where it is
   fixed.
2. **Given** any required item is not ready, **When** an admin tries to set the switch, **Then** it is
   refused, naming the items.
3. **Given** courier delivery is switched off, **When** the checklist is shown, **Then** courier setup is
   not required, and the page says addresses outside Effy's area will be refused at checkout.
4. **Given** courier delivery is switched on but incomplete (no fee table, no default courier service),
   **When** the checklist is shown, **Then** that is a failing required item.
5. **Given** everything required is ready but something advisable is not (no driver may deliver; a
   listed postcode has no group), **When** the checklist is shown, **Then** it is a warning that does
   not block the switch.
6. **Given** a setting is changed elsewhere, **When** the page is open, **Then** the checklist reflects it
   without refreshing.

---

### User Story 2 - An admin switches the platform to the new model at a chosen moment (Priority: P1)

With the checklist passing, an admin chooses **now** or a future date and time, and confirms. Until
that moment nothing changes for anyone. From that moment every shopper who reaches the delivery step is
offered an Effy window (today or on the next delivery days) or, outside Effy's area, courier delivery —
and every order placed carries who delivers it. Orders placed before the moment are untouched.

**Why this priority**: this is the cutover.

**Independent Test**: set the switch a few minutes ahead; confirm an order placed before the moment is
sold the old way and one placed after is sold a window or courier delivery, with nothing else changed
in between.

**Acceptance Scenarios**:

1. **Given** a passing checklist, **When** an admin sets the switch to a future moment, **Then** the page
   shows the moment, who set it and when, and nothing a customer sees changes until it arrives.
2. **Given** a scheduled switch, **When** the admin changes the moment or cancels it before it arrives,
   **Then** the new moment (or none) stands, and the change is recorded.
3. **Given** the moment has arrived, **When** a shopper opens the delivery step, **Then** they are offered
   the new choices on web and in the app, and an order they place records who delivers it.
4. **Given** a shopper who began checkout before the moment and pays after it, **When** they continue,
   **Then** they are shown the new choices before paying and are never charged for a delivery they were
   not shown.
5. **Given** the checklist stops passing after the switch was scheduled (a plan deactivated, the last
   window removed), **When** the moment arrives, **Then** the switch does not happen, the page says why,
   and the operator is alerted.
6. **Given** the switch has happened, **When** an admin needs to go back, **Then** they can turn it off
   with a reason until the old arrangement has been removed; orders already placed keep what they were
   sold either way.
7. **Given** a manager or customer-service agent, **When** they open Go-live, **Then** they see the
   checklist and the switch's state and cannot set it.

---

### User Story 3 - Orders placed before the switch finish exactly as they were sold (Priority: P1)

A customer who bought same-day delivery in a 4–6 pm window an hour before the switch still gets it in
that window. One who chose a standard delivery day still has their parcels handed to the carrier for
that day. Their order page, their receipt, the supplier's screen, the driver's round and back-office
all read as they did, and every action on those orders still works.

**Why this priority**: the promise already made to a customer outranks the change.

**Independent Test**: place one same-day and one standard order before the switch; switch; take both to
delivery and confirm each step, screen and message is what it would have been without the switch.

**Acceptance Scenarios**:

1. **Given** an order placed before the switch with a same-day window, **When** it is collected and
   delivered after the switch, **Then** it is delivered by an Effy driver in its window, and every screen
   says what it said before.
2. **Given** an order placed before the switch for a standard day, **When** it reaches the hub, **Then** it
   is handed to the carrier for its day, as before.
3. **Given** any order placed before the switch, **When** staff cancel or refund it, or a supplier marks
   it ready or short, **Then** it works as before.
4. **Given** an order placed before the switch, **When** staff look at it, **Then** it is not offered
   "Send by courier…" or "Deliver by Effy…" (081: only orders sold under the new model can be moved).
5. **Given** the customer's order history, **When** it lists old and new orders together, **Then** each
   reads correctly in the same words.

---

### User Story 4 - Staff see how many old orders are still open (Priority: P2)

After the switch the Go-live page shows the number of orders sold the old way that are still open,
with a link to them in the order list. The number only goes down. When it reaches zero the page says
the old arrangement can be removed.

**Why this priority**: it is the trigger for the second stage, and nobody should have to query for it.

**Independent Test**: with three old orders open after the switch, confirm the count is three and the
link lists them; complete or cancel them and confirm it reaches zero and says so.

**Acceptance Scenarios**:

1. **Given** the switch has happened, **When** staff open Go-live, **Then** they see how many old-kind
   orders are open and can open the list of them.
2. **Given** an old order is delivered, cancelled or fully refunded, **When** the page is viewed, **Then**
   the count has gone down by one.
3. **Given** the count is zero, **When** the page is viewed, **Then** it says no old order remains open
   and when the last one closed.
4. **Given** the count has not reached zero a set number of days after the switch, **When** that time
   passes, **Then** the operator is alerted, with the orders still open.

---

### User Story 5 - The old arrangement is removed (Priority: P2, second stage)

With no old order open and every app in use updated, the second stage is released. The old checkout
choices are gone; the settings and screens that only served the old arrangement are gone; staff,
suppliers and drivers no longer meet its words anywhere. An order from before the switch still opens
and still says what it was: "Same-day delivery, Tuesday 4–6 pm" or "Standard delivery, Thursday —
delivered by a carrier". Customers still read "Same-day delivery" and "Standard delivery" as the names
of an Effy window today or on a later day.

**Why this priority**: two arrangements side by side are two sets of rules to keep true; removing one
is what makes the new model the only one. It cannot happen before the count is zero.

**Independent Test**: after the second stage, confirm no back-office, supplier or driver screen offers
or names the old arrangement, the old settings are absent, a new order can be placed, and an order
from before the switch still opens with its original delivery line on every surface.

**Acceptance Scenarios**:

1. **Given** the second stage is released, **When** a shopper checks out, **Then** only the new choices
   exist; nothing can sell an order the old way, whatever the switch says.
2. **Given** back-office delivery settings, **When** viewed, **Then** nothing that only served the old
   arrangement is shown (the standard-day look-ahead, the carrier lead time, per-area same-day flags).
3. **Given** any back-office, supplier or driver screen, **When** shown, **Then** it never says "same-day"
   or "standard" except when showing an order placed before the switch.
4. **Given** an order placed before the switch, **When** opened by the customer, staff, or (while it was
   theirs) the supplier, **Then** its delivery line reads as it was sold, and its history is complete.
5. **Given** the second stage, **When** it is prepared for release while an old order is still open,
   **Then** it refuses to apply and says how many remain.
6. **Given** a supplier or driver on an app version from before the second stage, **When** they work a
   shift, **Then** everything they do still works: the second stage removes nothing a released supplier
   or driver app reads.

---

### User Story 6 - The documentation describes one model (Priority: P3)

The platform's written record — the project guide, the operator guides and runbooks — describes only
the new model, in the words the screens use. One short page records what the old model was and how to
read an order placed under it. A runbook says, in order, how the cutover is done and how to back out.

**Why this priority**: a guide that still describes the old model is how the next change gets built on
it.

**Independent Test**: read the project guide's delivery section and the delivery, order and driver
guides; confirm none describes same-day/standard as how delivery works, and that the archive page and
the cutover runbook exist and are accurate.

**Acceptance Scenarios**:

1. **Given** the guides, **When** read, **Then** delivery is described as Effy windows or courier
   delivery, and the old model appears only on the archive page.
2. **Given** the cutover runbook, **When** followed in dev, **Then** each step works in the order written,
   including backing out before the second stage.

---

### Edge Cases

- **The moment falls while a delivery window today is already past its cutoff**: the new checkout offers
  what is still open, as on any day.
- **No Effy window is open on any offered day at the moment of the switch**: shoppers in Effy's area are
  told there are no windows (or offered courier if the business allows that), as designed in 079.
- **A cart that was priced before the switch**: priced again under the new rules at the delivery step;
  the shopper sees the delivery total before paying.
- **An unpaid order created before the switch and paid after**: it is re-quoted at payment under the new
  model (the existing refusal makes the shopper confirm); it never becomes a paid old-kind order after
  the switch.
- **The switch is turned back off** (before stage 2): orders placed while it was on keep their delivery
  type and are completed as sold; new orders are sold the old way again; the old-order count is shown
  only while the switch is on.
- **An old order never closes** (a parcel lost, a refund unresolved): it holds stage 2 back; staff
  resolve it through the existing tools (refund, cancel, record arrival). Nothing closes it silently.
- **A supplier, driver or customer still on an old app** after stage 1: everything keeps working — the
  earlier features kept what old apps read.
- **Two admins set the switch at once**: the second sees the first's value and must confirm again.
- **A switch moment in the past** is treated as now.
- **Daylight saving on the chosen day**: the moment is an exact instant, shown in Melbourne time.

## Requirements *(mandatory)*

### Functional Requirements

**Readiness**

- **FR-001**: Back-office MUST show a go-live checklist to every back-office role, each item ready or not
  ready with what is missing and where it is fixed.
- **FR-002**: Required items MUST be: Effy's delivery area has at least one postcode; an Effy fee plan is
  active and can price every listed postcode; at least one delivery window is defined and active; at
  least one collection run is scheduled; the hub's location is set; and courier delivery is either
  switched off or fully set up (an active courier fee table, a default courier service, how parcels
  reach the courier).
- **FR-003**: Advisory items MUST NOT block the switch and MUST be shown as warnings: at least one driver
  may deliver and one may collect; whether out-of-area addresses will be refused (courier off).
- **FR-004**: The checklist MUST be one definition used by the page and by the switch itself.

**The switch**

- **FR-005**: Only admins MUST be able to set, change or cancel the switch moment, or turn the switch
  back off; every such act MUST record who, when, the value and (for turning back) a reason.
- **FR-006**: Setting the switch MUST be refused while any required readiness item is not ready, naming
  the items.
- **FR-007**: The moment MAY be now or a future instant; before it arrives it MAY be changed or cancelled.
- **FR-008**: If a required item is no longer ready when a scheduled moment arrives, the switch MUST NOT
  take effect, and the operator MUST be alerted.
- **FR-009**: From the moment, every checkout on every customer surface MUST offer only the new choices,
  and every order placed MUST record who delivers it.
- **FR-010**: A shopper MUST never be charged for a delivery choice or total they were not shown, across
  the moment.
- **FR-011**: Until the old arrangement is removed, an admin MUST be able to turn the switch back off;
  orders placed in the meantime MUST keep what they were sold.

**Old orders**

- **FR-012**: An order placed before the switch MUST keep its delivery method, window or day, its
  handling (Effy driver, or carrier), its status words and its messages, on every surface, to
  completion.
- **FR-013**: Every existing action on such an order (prepare, collect, check in, hand to carrier,
  deliver, record arrival, cancel, refund) MUST keep working.
- **FR-014**: After the switch, back-office MUST show how many orders placed under the old arrangement
  are still open, and list them; an order counts until it is completed, cancelled or fully refunded.
- **FR-015**: The operator MUST be alerted if that count is not zero a set time after the switch.

**Removal (second stage)**

- **FR-016**: The second stage MUST refuse to apply while any old-kind order is open.
- **FR-017**: After it, no path MUST be able to sell an order under the old arrangement, and the old
  checkout choices MUST NOT exist on any customer surface.
- **FR-018**: Settings, screens and options that only served the old arrangement MUST be removed from
  back-office, the supplier surfaces and the driver app.
- **FR-019**: No back-office, supplier or driver screen MUST say "same-day" or "standard", except when
  displaying an order placed before the switch.
- **FR-020**: Customers MUST keep reading "Same-day delivery" (a window today) and "Standard delivery" (a
  window on a later day) for Effy deliveries; a courier order is never either.
- **FR-021**: An order placed before the switch MUST remain readable — its delivery line as sold, its
  full history, its receipt — by the customer and by staff, indefinitely.
- **FR-022**: The second stage MUST NOT remove anything a released supplier or driver app reads. The
  customer app MUST be on a version that offers the new choices before the switch (stage 1); that is a
  step of the cutover runbook, checked by the operator.
- **FR-023**: A build check MUST fail if the old arrangement's terms reappear outside the display of old
  orders and the archive.

**Documentation**

- **FR-024**: The project guide and the operator guides MUST describe only the new model; one archive
  page MUST record the old model and how to read an old order; a runbook MUST give the cutover and
  back-out steps in order.

### Key Entities

- **Go-live checklist**: the readiness items, each required or advisory, ready or not, with its remedy.
- **Switch**: the moment the new model applies from (or none), with a record of every change: who, when,
  value, reason.
- **Old-kind order**: an order placed before the switch — it has no recorded delivery type; open until
  completed, cancelled or fully refunded.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of orders placed after the switch moment record who delivers them; 0% are sold the
  old way.
- **SC-002**: 100% of orders placed before the moment are completed with the method, window or day they
  were sold.
- **SC-003**: The switch cannot be set in any state where a required readiness item is not ready (0
  successful attempts in testing every single-item failure).
- **SC-004**: Zero customers are charged a delivery total or type they were not shown across the moment.
- **SC-005**: An admin can read the checklist and schedule the switch in under two minutes.
- **SC-006**: Staff can see the number of open old-kind orders, and the orders, in one click from
  Go-live.
- **SC-007**: After the second stage, zero staff, supplier or driver screens show the old arrangement's
  words except on an order placed before the switch; zero old-only settings remain.
- **SC-008**: After the second stage, 100% of orders placed before the switch still open and show their
  original delivery line.
- **SC-009**: The project guide's delivery section and the operator guides contain no description of the
  old model outside the archive page.

## Assumptions

- **Two stages in one feature**, released separately; stage 2's tasks are not started in production until
  the old-order count is zero. In dev both may be walked in one sitting once the dev orders are closed.
- **Admins only** set the switch (it changes what every customer is sold); managers and agents view.
- **Turning back** is allowed until stage 2, with a reason; it is an emergency tool, not a schedule.
- **"Open"** means paid and not completed, cancelled or fully refunded. Unpaid old orders do not count:
  they are re-quoted under the new model if paid after the switch.
- **App versions** (corrected during planning): the platform has no "please update" mechanism and this
  feature does not add one. Supplier and driver apps keep working through both stages — what they read is
  kept. The customer app must be on a version from 078 or later BEFORE the switch (an older one cannot
  show windows); releasing it is a runbook step and the operator's judgement.
- **The alert for lingering old orders** fires 7 days after the switch (a setting).
- **No announcement to customers**: the checkout simply offers the new choices.
- **Customer words stay** (operator decision, 078): "Same-day delivery" and "Standard delivery".
- **Out of scope**: a customer choosing courier, live courier quotes, courier booking by integration
  (E10); changing the new model's rules; migrating old orders to the new model (they are never
  relabelled).

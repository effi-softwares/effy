# Feature Specification: Checkout and Orders — Delivered by Effy vs Courier Delivery

**Feature Branch**: `079-effy-vs-courier-checkout`

**Created**: 2026-10-09

**Status**: Built and checked by machine 2026-10-09 — not migrated, deployed or walked; rides 078's switch (see SIGNOFF.md)

**Input**: "Checkout and Orders: Delivered by Effy vs Courier delivery. Every Effy order is delivered
one of two ways, decided at checkout from the delivery address: 'Delivered by Effy' when the address
is in Effy's delivery area, and 'Courier delivery' when it is not but a courier reaches it. The
customer does not choose between them in this feature. For 'Delivered by Effy' the customer picks a
delivery window and pays Effy's delivery fee; the customer still reads the words they know —
'Same-day delivery' for a window today, 'Standard delivery' for a window on a later day. For 'Courier
delivery' there is no window and no date to pick; the customer is told the order is delivered by a
courier partner and arrives within the courier's usual timeframe (an estimate the business sets, never
a promise) and pays the courier fee. If neither Effy nor a courier reaches the address, checkout
refuses with the one plain sentence the platform already uses. If the customer changes the address
during checkout, the delivery type, fee and window choice update immediately and nothing chosen for
the old address is silently carried over. The order records its delivery type and every later change
to it, with who changed it, when and why. One order has one delivery type, whatever number of
suppliers fill it, and the customer never learns how many suppliers were involved. Every place the
customer sees the order — order list, order detail, tracking, receipt, confirmation email,
notifications — uses the same words and shows the window (Effy) or the courier estimate (courier).
Order status keeps the platform's single set of status words; courier orders use 'With carrier' once
the courier has them. Shop staff see whether a package is going with an Effy driver or a courier —
never 'same-day' or 'standard', never the customer's window or fee. Back-office sees and can filter
orders by delivery type and sees the history of changes. Orders placed before this feature keep what
they were sold and still read correctly everywhere. Like the delivery windows it builds on, this is
built switched off and turned on by the business at the cutover; until then today's checkout is
unchanged."

**Programme**: Delivery Model v2, epic **E5** (`docs/prd/2026-10-delivery-model-v2-backlog.md`).
Builds on 076 (who delivers to an address), 077 (what delivery costs — an Effy fee and a courier fee
table that so far charges nobody) and 078 (Effy's delivery windows, today and the next three delivery
days). How a courier parcel physically reaches the courier (E6), staff moving an order between the two
types with compensation (E7), driver planning across days (E8) and the cutover itself (E9) are separate
features.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An address in Effy's area is "Delivered by Effy" (Priority: P1)

A customer whose address is in Effy's delivery area reaches checkout. The delivery section is headed
**Delivered by Effy**. They choose a window — under **Same-day delivery** for today or **Standard
delivery** for one of the next delivery days — see Effy's delivery fee, and pay. The order is recorded
as delivered by Effy, for the reason "address in Effy's area", with the window they bought.

**Why this priority**: it is the default and the large majority of orders. 078 built the picker; this
story makes "Delivered by Effy" a fact the order carries, rather than something inferred from which
kind of window it has.

**Independent Test**: with the feature switched on, place an order to an address in Effy's area with a
later-day window; confirm the order shows "Delivered by Effy", "Standard delivery" and the window on
every customer surface, and that back-office shows the type and its reason.

**Acceptance Scenarios**:

1. **Given** an address in Effy's area, **When** the customer opens checkout, **Then** the delivery
   section is headed "Delivered by Effy" and offers windows as 078 defines.
2. **Given** the customer chose a window today, **When** the order is placed, **Then** it is recorded
   as delivered by Effy and reads "Same-day delivery" with its window.
3. **Given** the customer chose a window on a later day, **When** the order is placed, **Then** it is
   recorded as delivered by Effy and reads "Standard delivery" with its day and window.
4. **Given** an order filled by several suppliers, **When** it is placed, **Then** it has exactly one
   delivery type and one window, and nothing shown to the customer reveals the number of suppliers.
5. **Given** an order delivered by Effy, **When** the customer tries to pay without a window chosen,
   **Then** payment does not proceed and they are asked to choose one.

---

### User Story 2 - An address outside Effy's area is "Courier delivery" (Priority: P1)

A customer whose address is outside Effy's area, but where the business offers courier delivery,
reaches checkout. There is no window and no day to pick. The delivery section is headed **Courier
delivery** and says the order is delivered by a courier partner and usually arrives within the
timeframe the business has set (for example "2–4 business days") — worded as an estimate, not a
promise. They see the courier fee, and pay. The order is recorded as courier delivery, for the reason
"address outside Effy's area", with the estimate they were shown.

**Why this priority**: this is what the feature adds. Until now such an address could not order at all.

**Independent Test**: with the feature and courier delivery switched on and a courier fee table
active, check out to an address outside Effy's area; confirm no picker is shown, the estimate and
courier fee are, the order can be paid for, and every customer surface says "Courier delivery" with
the estimate.

**Acceptance Scenarios**:

1. **Given** an address outside Effy's area where courier delivery is offered, **When** the customer
   opens checkout, **Then** no window or day picker is shown; the section says "Courier delivery",
   that a courier partner delivers the order, and the business's estimate.
2. **Given** the same checkout, **When** the fee is shown, **Then** it is the courier fee for the
   whole order (077), shown once, and Effy's fee, window surcharges and Effy's free-delivery amount
   play no part.
3. **Given** the customer pays, **When** the order is placed, **Then** it is recorded as courier
   delivery with the estimate text as it was shown, and holds no place in any Effy window.
4. **Given** the business later changes the estimate text, **When** the customer views that order,
   **Then** it still shows the estimate they were sold.
5. **Given** a courier order filled by several suppliers, **When** the customer views it anywhere,
   **Then** it reads as one courier delivery.
6. **Given** the customer adjusts their basket, **When** the courier fee changes with it, **Then** the
   new fee is shown before payment and the customer is never charged a total they were not shown.

---

### User Story 3 - An address nobody reaches is refused plainly (Priority: P1)

A customer whose address neither Effy nor a courier reaches is told so with the one sentence the
platform already uses for this, and cannot pay.

**Why this priority**: taking money for an order nobody can deliver is the worst outcome available.

**Independent Test**: check out to an address excluded from courier delivery and outside Effy's area;
confirm the sentence, and that payment cannot be started by any route.

**Acceptance Scenarios**:

1. **Given** an address neither reaches, **When** the customer opens checkout, **Then** they see the
   platform's one refusal sentence and no delivery options, fee or pay button.
2. **Given** the same address, **When** payment is attempted anyway, **Then** it is refused before
   any charge.
3. **Given** courier delivery is switched off as a whole, **When** an address outside Effy's area
   checks out, **Then** it is refused the same way.

---

### User Story 4 - Changing the address re-decides everything (Priority: P1)

Mid-checkout the customer switches from a home address in Effy's area to a holiday address outside
it. Immediately the section changes to "Courier delivery", the window they had chosen is gone, the fee
is the courier fee, and the total updates. Switching back shows "Delivered by Effy" with **no** window
pre-selected — they choose again.

**Why this priority**: a window or fee quietly carried over from another address charges the customer
for something they were not shown, or sells them a window for a place Effy does not go.

**Independent Test**: at checkout choose a window, switch to a courier address, then to an unreachable
address, then back; at each step confirm type, fee, total and window choice match the address on
screen and nothing from the previous address remains.

**Acceptance Scenarios**:

1. **Given** a window is chosen for an Effy address, **When** the customer switches to a courier
   address, **Then** the window choice is dropped, the courier estimate and courier fee are shown, and
   the courier order they then pay for holds no place in any window.
2. **Given** a courier address, **When** the customer switches to an Effy address, **Then** the window
   picker is shown with nothing selected, and Effy's fee replaces the courier fee.
3. **Given** any address, **When** the customer switches to one nobody reaches, **Then** the refusal
   sentence replaces the options and payment is unavailable.
4. **Given** the address changed after a total was shown, **When** the customer pays, **Then** the
   payment is for the total of the address now selected, or it is refused and re-shown — never the
   old total.
5. **Given** the customer edits the postcode of the selected address rather than picking another,
   **When** it is saved, **Then** the same re-decision happens.

---

### User Story 5 - The customer reads the same thing everywhere (Priority: P2)

After ordering, the customer sees the order in their order list, opens its detail, follows its
progress, reads the receipt and the confirmation email, and gets notifications as it moves. Each
says the same thing: for an Effy order, "Same-day delivery" or "Standard delivery" with the window;
for a courier order, "Courier delivery" with the estimate.

**Why this priority**: the order must be placeable first; but a receipt that says "Standard delivery,
Thursday" for a parcel a courier is carrying is a broken promise in writing.

**Independent Test**: place one Effy same-day, one Effy later-day and one courier order; compare the
words and the arrival line across order list, detail, progress, receipt, email and notifications on
web and mobile.

**Acceptance Scenarios**:

1. **Given** a courier order, **When** it is shown on any customer surface, **Then** it reads
   "Courier delivery" with the estimate, and never shows a window, a delivery day, or the words
   "same-day" or "standard".
2. **Given** an Effy order, **When** it is shown on any customer surface, **Then** it reads "Same-day
   delivery" or "Standard delivery" with its window, once per order.
3. **Given** a courier order the courier has taken, **When** the customer views its status, **Then**
   it reads "With carrier", and "Delivered" once delivered — the same status words as every order.
4. **Given** a courier order, **When** notifications are sent as it progresses, **Then** none of them
   says "out for delivery with your Effy driver" or names a window.
5. **Given** any order, **When** it is shown, **Then** the delivery fee appears as one amount for the
   order.

---

### User Story 6 - Shop staff see who is taking the package (Priority: P2)

A shop operator preparing packages sees, on each one, whether an **Effy driver** or a **Courier** is
taking it. The words "same-day" and "standard" are gone from the shop's screens. As before, the shop
never sees the customer's window, delivery fee or estimate.

**Why this priority**: the shop needs to know who it is handing to, and nothing more. The old words
would be wrong the day the feature is on — a "standard" package would be going with an Effy driver.

**Independent Test**: with one Effy order and one courier order containing the same shop's goods,
open the shop's order list, today view, pick list and order detail on web and mobile; confirm the two
labels and the absence of the old words, the window and any delivery money.

**Acceptance Scenarios**:

1. **Given** a package of an Effy order, **When** shop staff view it anywhere, **Then** it is labelled
   "Effy driver".
2. **Given** a package of a courier order, **When** shop staff view it anywhere, **Then** it is
   labelled "Courier".
3. **Given** any package, **When** shop staff view it, **Then** no window, delivery day, estimate or
   delivery fee is shown.
4. **Given** the shop's summaries and groupings that used to split by same-day and standard, **When**
   viewed, **Then** they split by Effy driver and Courier instead.
5. **Given** a package of an order placed before this feature, **When** shop staff view it, **Then**
   it carries the label that matches who actually takes it: "Effy driver" where it was sold same-day,
   "Courier" where it was sold standard for a carrier.

---

### User Story 7 - Back-office sees, filters and audits the delivery type (Priority: P2)

A back-office user opens the orders list, sees each order's delivery type, and filters to courier
orders only. On an order they see the type, why it is that type, the window or estimate, and a history
of the type — starting with how it was decided at checkout, and later (once staff can change it, E7)
every change with who, when and why.

**Why this priority**: staff will be asked "why did this go by courier?" from the first courier order.

**Independent Test**: place an Effy and a courier order; filter the list by each type; open each and
confirm the type, reason, window or estimate, and a one-entry history.

**Acceptance Scenarios**:

1. **Given** orders of both types, **When** staff filter by delivery type, **Then** only orders of
   that type are listed.
2. **Given** an order, **When** staff open it, **Then** they see its delivery type, the reason, and
   its window (Effy) or estimate (courier).
3. **Given** a newly placed order, **When** staff open its delivery-type history, **Then** there is
   one entry: the type decided at checkout, its reason, and when.
4. **Given** an order placed before this feature, **When** staff view it, **Then** it shows what it
   was sold in the old terms, is not counted under either new type's filter unless it clearly belongs
   to one, and has no invented history.
5. **Given** a history entry, **When** anyone tries to alter or remove it, **Then** they cannot.

---

### User Story 8 - Nothing changes until the business switches it on (Priority: P1)

Until the cutover the business keeps today's checkout: same-day windows and a standard delivery day,
exactly as now, and an address outside Effy's area is refused as now. Staff can set the courier
estimate and see the new back-office and shop wording before then.

**Why this priority**: drivers cannot yet deliver a later-day window (E8) and courier handling is not
finished (E6); a courier order sold early is an order nobody is ready to move.

**Independent Test**: with the feature deployed and switched off, run today's checkout end to end and
confirm it behaves and reads exactly as before; confirm a courier order cannot be placed by any route.

**Acceptance Scenarios**:

1. **Given** the feature is switched off, **When** a customer checks out, **Then** the checkout, its
   words, its fee and the resulting order are what they are today.
2. **Given** the feature is switched off, **When** an address outside Effy's area checks out, **Then**
   it is refused as today, whatever the courier settings say.
3. **Given** the feature is switched on but courier delivery is off, or no courier fee table is
   active, or no estimate text is set, **When** an out-of-area address checks out, **Then** it is
   refused; a courier order is never sold without a fee and an estimate.
4. **Given** an order placed while the feature was off, **When** it is viewed after the switch,
   **Then** it shows what it was sold.

---

### User Story 9 - When Effy has no window left, courier may be offered instead (Priority: P3)

An address is in Effy's area, but no window is available today or on the next delivery days. If the
business allows it, the customer is told there are no delivery windows and is offered courier delivery
instead, with the courier estimate and fee; continuing places a courier order recorded with the reason
"no Effy window available". If the business does not allow it, the customer gets 078's plain sentence
and cannot pay.

**Why this priority**: 078 promised this fallback "once a courier order can be placed". It is rare,
and off by default.

**Independent Test**: fill or close every window for four days; with the fallback off, confirm the
sentence; with it on, confirm the courier offer, its fee, and the recorded reason.

**Acceptance Scenarios**:

1. **Given** no window is available and the fallback is off, **When** the customer opens checkout,
   **Then** they see 078's "no delivery windows" sentence and cannot pay.
2. **Given** no window is available and the fallback is on and a courier reaches the address, **When**
   the customer opens checkout, **Then** they are told no windows are available and offered courier
   delivery with its estimate and fee.
3. **Given** the customer continues, **When** the order is placed, **Then** it is courier delivery
   with the reason "no Effy window available".
4. **Given** at least one window is available, **When** the customer opens checkout, **Then** courier
   delivery is not offered — the customer does not choose between the two.

---

### Edge Cases

- **Coverage changes while the customer is at checkout** (a postcode is added to or removed from
  Effy's list, or courier delivery is switched off): caught when they proceed to payment; no charge;
  the checkout re-shows what now applies.
- **Coverage changes after the order is placed**: the order keeps its type. Only a recorded change
  (E7) alters it.
- **The courier fee table is deactivated or the estimate cleared** while a customer is at a courier
  checkout: payment is refused before any charge and the address is treated as not reachable.
- **A courier order and Effy's window settings**: non-delivery days, cutoffs, window limits and the
  "Delivery today" surcharge do not apply to a courier order.
- **Points and promotions** apply to a courier order as to any order; the delivery fee they apply
  against is the courier fee.
- **The last window fills between viewing and paying** (Effy address): 078's rule applies — refused
  before charge, choose again; if the fallback is on and nothing else is available the courier offer
  appears then.
- **A basket too heavy for the courier fee table**: 077 requires an active table to cover every
  weight, so there is always a fee.
- **Cancellation and refund** of a courier order follow the existing rules; the courier fee is
  refunded or kept exactly as a delivery fee is today.
- **A courier order's journey before the courier has it**: it moves through the same status words as
  any order (Preparing, Ready, With driver, At hub) and becomes "With carrier" at handover. It is
  never shown "Out for delivery".
- **An Effy order never shows "With carrier"**, even though it reads "Standard delivery".
- **Orders placed before the switch** that were sold "standard" for a carrier still read "Standard
  delivery" with their day to the customer, as sold; they are not relabelled "Courier delivery".
- **A guest's or new customer's first address**: the type is decided the moment an address exists;
  before that, checkout asks for an address and shows no delivery type.
- **The address screen outside checkout** already says who delivers to an address (076); it and the
  checkout must give the same answer for the same address at the same moment.

## Requirements *(mandatory)*

### Functional Requirements

**Deciding the delivery type**

- **FR-001**: Every order placed under this feature MUST have exactly one delivery type — *Delivered
  by Effy* or *Courier delivery* — whatever number of suppliers fill it.
- **FR-002**: The type MUST be decided from the delivery address by the platform's single answer to
  "who delivers here" (076): Effy's area → Delivered by Effy; outside it where courier delivery is
  offered → Courier delivery; neither → refused.
- **FR-003**: The customer MUST NOT be able to choose between the two types. The only route from an
  Effy address to a courier order is the no-window fallback (FR-011).
- **FR-004**: An address neither reaches MUST be refused with the platform's existing single refusal
  sentence, and MUST NOT be able to start a payment by any route.
- **FR-005**: The type shown at checkout and the type the order is placed with MUST be the same; if
  the answer changed in between, the payment MUST be refused before any charge and the checkout
  re-shown.

**Delivered by Effy**

- **FR-006**: A Delivered-by-Effy checkout MUST require one window chosen as 078 defines, and MUST
  charge Effy's delivery fee as 077 defines.
- **FR-007**: The customer MUST read "Same-day delivery" for a window today and "Standard delivery"
  for a window on a later day, under the heading "Delivered by Effy".

**Courier delivery**

- **FR-008**: A courier checkout MUST show no window and no day picker, MUST say the order is
  delivered by a courier partner, and MUST show the business's estimate worded as an estimate.
- **FR-009**: A courier order MUST be charged the courier fee for the whole order (077) and nothing
  from Effy's fee plan; the fee MUST be shown before payment and the customer MUST NOT be charged a
  total they were not shown.
- **FR-010**: A courier order MUST be placeable only when all of these hold: the feature is switched
  on, courier delivery is switched on, a courier fee table is active, and an estimate text is set.
  Otherwise the address MUST be treated as not reachable.
- **FR-011**: The business MUST be able to allow or disallow offering courier delivery when an
  Effy-area address has no window available on any offered day; it MUST be disallowed by default.
  When allowed and used, the order's reason MUST record it.
- **FR-012**: A courier order MUST NOT hold or consume a place in any Effy window.

**The estimate**

- **FR-013**: Back-office MUST be able to set and change the courier estimate text (for example
  "2–4 business days"). Changing it MUST affect new checkouts only.
- **FR-014**: A courier order MUST keep the estimate text it was sold and show that text thereafter.
- **FR-015**: Wherever the estimate is shown it MUST be worded so it cannot be read as a guaranteed
  date.

**Changing address during checkout**

- **FR-016**: When the delivery address or its postcode changes during checkout, the type, the fee,
  the total and the available choices MUST be re-decided immediately for the new address.
- **FR-017**: A window chosen for a previous address MUST NOT be carried to another address.
  Returning to an Effy address MUST present the picker with nothing selected. A place already held
  for the previous choice MUST be given up when the customer proceeds to pay for the new address, and
  otherwise MUST lapse on its own within the normal hold time — it is never kept for the order.

**The order's record**

- **FR-018**: The order MUST record its delivery type, the reason for it (address in Effy's area;
  address outside Effy's area; no Effy window available; changed by staff), and what it was sold —
  the window, or the estimate.
- **FR-019**: The order MUST keep a history of its delivery type: the first entry is the decision at
  checkout; every later change adds an entry with the previous type, the new type, who made it, when,
  and why. Entries MUST NOT be editable or removable.
- **FR-020**: This feature MUST NOT itself provide a way to change a placed order's type (that is
  E7); it provides the record that change will write to.
- **FR-021**: Orders placed before this feature MUST keep what they were sold, MUST NOT be given an
  invented type history, and MUST read correctly on every surface.

**What the customer sees after ordering**

- **FR-022**: Order list, order detail, order progress, receipt, confirmation email and notifications
  — on web and mobile — MUST use the same words for the same order: "Same-day delivery" or "Standard
  delivery" with the window for an Effy order; "Courier delivery" with the estimate for a courier
  order.
- **FR-023**: A courier order MUST never be shown a window, a delivery day, or the words "same-day"
  or "standard".
- **FR-024**: Nothing shown to a customer MUST reveal how many suppliers filled the order: one
  delivery type, one arrival line, one delivery fee.

**Status**

- **FR-025**: All orders MUST keep the platform's single set of status words. A courier order's
  packages MUST read "With carrier" once the courier has them and "Delivered" when delivered, and MUST
  never read "Out for delivery". An Effy order's packages MUST never read "With carrier".
- **FR-026**: Which packages are due to be handed to a courier, which are Effy's to deliver, and
  whether an order is on time MUST be read from the order's delivery type, not inferred from whether a
  window is present.
- **FR-027**: An order MUST be complete when all its packages are delivered or cancelled, for both
  types.

**Shops**

- **FR-028**: Every shop surface (web and mobile) MUST label a package "Effy driver" or "Courier"
  and MUST NOT show the words "same-day" or "standard".
- **FR-029**: Shop surfaces MUST NOT show the customer's window, delivery day, estimate or any
  delivery money.
- **FR-030**: Shop groupings and summaries that split by the old two methods MUST split by Effy
  driver and Courier.
- **FR-031**: Packages of orders placed before this feature MUST carry the label matching who takes
  them (sold same-day → Effy driver; sold standard for a carrier → Courier).

**Back-office**

- **FR-032**: The orders list MUST show each order's delivery type and MUST be filterable by it.
- **FR-033**: The order detail MUST show the type, its reason, the window or estimate, and the type
  history.
- **FR-034**: Back-office MUST show an order placed before this feature in the terms it was sold.

**Switching on, and what goes away**

- **FR-035**: The feature MUST be built switched off and turned on by the business together with
  078's delivery windows — one switch, not two. While off, checkout, its words, its fees, the
  resulting orders and the out-of-area refusal MUST be exactly as today.
- **FR-036**: Under the new checkout, whether an address gets same-day windows MUST NOT depend on
  which suppliers fill the order or on any per-area same-day setting; those controls no longer exist
  (D9).
- **FR-037**: Under the new checkout, customers MUST NOT be shown a per-supplier split of the
  delivery fee or a count of deliveries in an order ("N of your M deliveries"). (Today's checkout
  keeps both until it is retired at the cutover.)

**Live updates and measurement**

- **FR-038**: When an order's delivery type is set or changed, every screen showing that order MUST
  be told to re-read it, as for any other order change, without revealing what changed.
- **FR-039**: The business MUST be able to see how many orders are placed of each type, how often an
  address is refused as unreachable, and how often the no-window fallback is offered and taken. No
  personal information beyond what analytics already carries.

### Key Entities

- **Delivery type**: who delivers an order — *Effy* or *courier*. One per order. Set at checkout.
- **Delivery type reason**: why — address in Effy's area, address outside it, no Effy window
  available, or changed by staff.
- **Delivery type history entry**: one decision or change — previous type (none for the first), new
  type, reason, who (the checkout itself, or a staff member), when, and an optional note. Permanent.
- **Courier estimate**: a short text the business sets describing the courier's usual timeframe. The
  order keeps the text it was sold.
- **No-window fallback setting**: whether an Effy-area address with no available window may be
  offered courier delivery. Off by default.
- **Order (extended)**: gains its delivery type, reason, and what it was sold (window or estimate).
  Orders from before the feature have no type.
- **Package (as shops see it)**: gains "who takes it" — Effy driver or Courier — derived from the
  order's type.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of orders placed after the switch have exactly one delivery type and a reason, and
  a first history entry.
- **SC-002**: A customer at an out-of-area address that a courier reaches can complete checkout
  without being asked for a window or a day, in no more steps than an Effy checkout.
- **SC-003**: Zero orders are paid for at an address neither Effy nor a courier reaches.
- **SC-004**: After any address change at checkout, the type, fee and total on screen match the
  selected address within one second, and zero payments are taken for a total belonging to a previous
  address.
- **SC-005**: For any single order, the delivery words and arrival line are identical across order
  list, order detail, progress, receipt, email and notifications, on web and mobile — checked for one
  same-day, one later-day and one courier order.
- **SC-006**: Zero shop screens show "same-day", "standard", a window, a delivery day, an estimate or
  delivery money; every package shows "Effy driver" or "Courier".
- **SC-007**: Zero customer surfaces let the number of suppliers be worked out from the delivery
  type, arrival line or fee.
- **SC-008**: Back-office can list all courier orders in one filter action, and answer "why is this
  order going by courier?" from the order page alone.
- **SC-009**: With the feature switched off, today's checkout and its orders are indistinguishable
  from before the feature was deployed, and zero courier orders can be placed.
- **SC-010**: Every order placed before the switch still opens and reads as it did, on all six apps.

## Assumptions

- **Customer words** (decided 2026-10-08 while specifying 078, superseding this epic's original
  "the old names disappear"): "Same-day delivery" and "Standard delivery" stay for customers and
  back-office reading a customer's order; only **shops** lose them. Out-of-area reads "Courier
  delivery — delivered by a courier partner".
- **One switch.** This feature rides on 078's switch and goes on at the cutover (E9). Courier
  ordering additionally needs courier delivery on, an active courier table and an estimate. This
  feature is what makes it *possible* to switch courier delivery on; it does not switch it on.
- **One estimate text for the platform** in this feature. Per-courier-service estimates (answer Q5
  says "per courier service") arrive with courier services in E6; the order's kept text is unaffected.
- **How a courier parcel moves is unchanged here**: Effy's drivers collect it to the hub and hub
  staff hand it to the carrier, as "standard" parcels do today. Pickup straight from the supplier,
  consignments and tracking are E6.
- **No one changes a placed order's type in this feature.** The history and the "changed by staff"
  reason exist so E7 has one place to write; compensation is E7.
- **A customer choosing courier is deferred** (D10). The no-window fallback is the business's rule,
  not a preference the customer sets.
- **The no-window fallback is in scope** because 078 deferred it to "the feature that makes a courier
  order placeable"; it is off by default and the lowest priority here.
- **Courier pricing is 077's**: flat amount plus weight band, own optional free-delivery amount, no
  distance, no window surcharge. This feature charges it; it does not change how it is set.
- **Coverage is 076's** and windows are 078's; this feature asks them and does not redefine either.
- **Old orders are not converted for customers.** For shops and for internal handling (handover,
  on-time), an old order is read as what it effectively was — same-day → Effy; standard for a carrier
  → courier — without rewriting what the customer was sold.
- **"Tracking"** means the order-progress view customers already have; courier tracking links are E6
  (answer Q8).
- **Driver app wording** ("Courier" instead of "Standard" at hub check-in) belongs to E6/E8.
- **Removing today's same-day controls and per-supplier fee figures is the cutover's job** (E9):
  they are read only by today's checkout, which customers keep using until the switch. The new
  checkout already ignores them (078).
- **Out of scope**: courier consignments, pickup from supplier, tracking references (E6); staff
  override and compensation (E7); driver planning across days (E8); the setter for the switch,
  renames and removal of the old checkout (E9); customer-chosen courier, live courier quotes (E10).
- **Only signed-in customers check out**, as today.

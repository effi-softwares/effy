# Feature Specification: Customer Delivery Instructions

**Feature Branch**: `066-delivery-instructions`

**Created**: 2026-10-04

**Status**: Draft

**Input**: User description: "Customer delivery instructions" — client feedback round of October
2026, requirement R4a in
[docs/prd/2026-10-client-feedback-prd.md](../../docs/prd/2026-10-client-feedback-prd.md).

## Why this slice exists

**A customer cannot tell the driver anything.**

Checkout asks where an order is going and how fast, and nothing else. "Leave it at the door", "the
buzzer is broken, call me" and "use the side gate" have nowhere to go. Three consequences follow:

1. **Deliveries fail that did not need to.** A driver standing at a locked lobby door has an address
   and no way in. The delivery is recorded as failed and the goods go back to the hub, when one
   sentence from the customer would have prevented it.
2. **The driver's screens have a gap where the instructions should be.** The driver app has had a
   place for delivery instructions on three screens since it was built. It has always been empty,
   because nothing on the platform asks for them or keeps them.
3. **"Leave it at the door" is decided by the driver, not the customer.** Whether a package is left
   unattended is the customer's call. Today the driver guesses.

The client asked for this directly: customers should be able to add delivery instructions or
comments, such as "Leave at the door" or "Meet at the door".

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Tell the driver how to deliver this order (Priority: P1)

A customer at checkout adds instructions for the delivery: they pick "Leave at the door" or "Meet
at the door", type a short note of their own, or both. The instructions are kept with the order.
The customer sees them on the order confirmation and on the order's page afterwards.

**Why this priority**: This is the capability the client asked for, and nothing else in the slice
has anything to carry until a customer can say something.

**Independent Test**: Place an order with a quick choice and a typed note. Confirm both appear on
the confirmation and the order page exactly as entered, and that an order placed with nothing
entered shows no instructions at all.

**Acceptance Scenarios**:

1. **Given** a customer at checkout, **When** they choose "Leave at the door" and place the order,
   **Then** the order records that choice and the confirmation shows it.
2. **Given** a customer at checkout, **When** they type a note of up to 250 characters and place
   the order, **Then** the note is kept exactly as typed and shown on the confirmation.
3. **Given** a customer who chooses a quick choice and also types a note, **When** they place the
   order, **Then** both are kept and shown together.
4. **Given** a customer who adds nothing, **When** they place the order, **Then** the order has no
   instructions and no placeholder text is shown in their place anywhere.
5. **Given** a customer typing a note, **When** they reach 250 characters, **Then** they cannot
   enter more and can see how many characters remain.
6. **Given** a customer who has entered instructions, **When** they move between checkout steps or
   payment fails and they try again, **Then** what they entered is still there.

---

### User Story 2 - The driver reads the instructions before the door (Priority: P1)

A driver on a same-day round sees the customer's instructions for each drop: while driving to it,
on arrival, and on the drop's detail. If the customer chose "Leave at the door", the driver is told
the drop is to be left unattended.

**Why this priority**: Equal-first with US1. Instructions a customer writes and a driver never sees
are worse than none: the customer believes they have been heard.

**Independent Test**: Place a same-day order with instructions, assign it to a driver, and confirm
the instructions appear on the driver's en-route, arrived and drop detail screens, and on no other
driver's.

**Acceptance Scenarios**:

1. **Given** an order placed with a typed note, **When** the assigned driver opens the drop,
   **Then** the note is shown in full, as the customer typed it.
2. **Given** an order placed with "Leave at the door", **When** the driver arrives, **Then** the
   screen says the customer asked for the package to be left, and completing the drop that way
   asks for a photograph.
3. **Given** an order placed with "Meet at the door", **When** the driver arrives, **Then** the
   screen says the customer wants to receive it in person.
4. **Given** an order with no instructions, **When** the driver opens the drop, **Then** no
   instruction area is shown.
5. **Given** a drop assigned to one driver, **When** any other driver looks at their own work,
   **Then** they cannot see that drop's instructions.

---

### User Story 3 - Save instructions on an address (Priority: P2)

A customer who always wants deliveries to one address handled the same way saves instructions on
that address. Checkout then starts with them filled in whenever that address is chosen. The
customer can change them for one order without changing what is saved.

**Why this priority**: Most households give the same instruction every time. Without a saved
default the customer retypes it on every order, and the one time they forget is the delivery that
fails.

**Independent Test**: Save instructions on an address, start a checkout with that address and
confirm they are prefilled; change them for that order only, place it, and confirm the address
still holds the original.

**Acceptance Scenarios**:

1. **Given** an address with saved instructions, **When** the customer selects it at checkout,
   **Then** the instructions are filled in ready to use.
2. **Given** prefilled instructions, **When** the customer edits them and places the order,
   **Then** the order carries the edited version and the address keeps its saved version.
3. **Given** a customer who types instructions at checkout for an address that has none,
   **When** they choose to save them to the address, **Then** the address holds them for next time.
4. **Given** a customer who switches to a different address during checkout, **When** the new
   address is selected, **Then** the instructions shown are the new address's saved ones, not the
   previous address's.
5. **Given** an address with saved instructions, **When** the customer clears them in their address
   book, **Then** the next checkout with that address starts empty.

---

### User Story 4 - A placed order keeps what was said (Priority: P2)

After an order is placed, the customer edits or deletes the address it was delivered to. The
order's instructions do not change: the driver, staff and the customer still see what was said when
the order was placed.

**Why this priority**: An order is a record of what was agreed. If editing an address book could
rewrite a placed order, a driver could be sent to follow instructions nobody gave for that
delivery.

**Independent Test**: Place an order with instructions from a saved address, then change and
delete that address, and confirm the order still shows the original instructions everywhere.

**Acceptance Scenarios**:

1. **Given** a placed order with instructions, **When** the customer changes the saved
   instructions on that address, **Then** the order's instructions are unchanged.
2. **Given** a placed order with instructions, **When** the customer deletes that address,
   **Then** the order's instructions are unchanged.

---

### User Story 5 - Staff see what the customer asked for (Priority: P3)

A back-office staff member looking at an order sees the delivery instructions the customer gave, so
they can answer "I said to leave it at the door" without asking the customer to repeat it.

**Why this priority**: It closes the loop for support and for delivery exceptions, but no delivery
depends on it.

**Independent Test**: Open an order with instructions in the back-office order view and confirm
they are shown, and that an order without them shows none.

**Acceptance Scenarios**:

1. **Given** an order with instructions, **When** staff open it, **Then** the instructions are
   shown with the delivery address.
2. **Given** a delivery recorded as failed, **When** staff review it, **Then** they can see what
   instructions the driver had.

---

### Edge Cases

- **Only spaces, or only line breaks, typed.** Treated as no instructions.
- **Line breaks inside a note.** Kept readable; they do not let a note exceed its length limit or
  break the layout of any screen showing it.
- **Emoji and non-English text.** Accepted and shown as typed.
- **Text that looks like markup, a link or a command.** Shown as the plain characters the customer
  typed, everywhere. It is never interpreted, linked or run.
- **A note containing a gate code or a phone number.** Accepted; this is the most useful kind of
  instruction. It is why the text is kept out of emails, analytics and logs.
- **"Leave at the door" on an order the driver ends up handing over in person.** The instruction is
  a request, not a constraint: the driver completes the drop as it actually happened.
- **"Leave at the door" where leaving is not possible** (no safe place, building refuses). The
  driver records the delivery as not completed, as they can today.
- **An order whose packages use different delivery methods.** One set of instructions covers the
  whole order.
- **A standard package handed to an outside carrier.** The instructions are kept with the order and
  visible to staff; passing them to the carrier is not part of this slice.
- **Payment fails, or checkout is abandoned and resumed.** What the customer entered is not lost,
  and nothing is saved to an address unless they asked for that.
- **Two devices.** Instructions saved on an address on one device appear on the other; an unsaved
  draft at checkout belongs to the checkout it was typed in.
- **An order placed before this feature.** It has no instructions and shows none.

## Requirements *(mandatory)*

### Functional Requirements

**Giving instructions**

- **FR-001**: At checkout a customer MUST be able to give delivery instructions for the order.
  Giving them MUST be optional.
- **FR-002**: The customer MUST be able to choose one handover preference from a fixed set:
  "Leave at the door" or "Meet at the door". Choosing none MUST be allowed.
- **FR-003**: The customer MUST be able to type a note of their own, up to 250 characters, with or
  without a handover preference.
- **FR-004**: The customer MUST be able to see how many characters remain, and MUST NOT be able to
  submit a note longer than the limit.
- **FR-005**: A note consisting only of blank space MUST be treated as no note.
- **FR-006**: What the customer has entered MUST survive moving between checkout steps and a
  failed payment attempt.
- **FR-007**: The limit and the content rules MUST be enforced by the platform, not only by the
  screen the customer types into.

**Keeping them with the order**

- **FR-008**: The instructions MUST be recorded with the order when it is placed, together with
  the delivery address as it stood at that moment.
- **FR-009**: Once an order is placed, its instructions MUST NOT change when the customer edits or
  deletes the address, or changes that address's saved instructions.
- **FR-010**: Instructions MUST NOT be editable after the order is paid.
- **FR-011**: One set of instructions MUST apply to the whole order, however many packages it has.

**Saved on an address**

- **FR-012**: A customer MUST be able to save a handover preference and a note on an address as
  that address's default, from the address book and from checkout.
- **FR-013**: When an address with saved instructions is selected at checkout, they MUST be filled
  in for the customer to use, change or clear.
- **FR-014**: Changing the instructions for one order MUST NOT change the address's saved default
  unless the customer asks for that.
- **FR-015**: Selecting a different address at checkout MUST replace the shown instructions with
  the newly selected address's saved ones.
- **FR-016**: A customer MUST be able to clear an address's saved instructions.

**Shown to the driver**

- **FR-017**: The driver assigned to a drop MUST see the order's note in full on the en-route,
  arrived and drop detail views.
- **FR-018**: The driver MUST be told the handover preference in words: that the customer asked for
  the package to be left, or asked to receive it in person.
- **FR-019**: Where the customer asked for the package to be left, completing the drop as left
  unattended MUST require a photograph, as unattended drops already do.
- **FR-020**: A handover preference MUST NOT prevent the driver from completing the drop the way it
  actually happened, or from recording that it could not be completed.
- **FR-021**: A drop with no instructions MUST show no instruction area.
- **FR-022**: A drop's instructions MUST be visible only to the driver it is assigned to.

**Shown to the customer and to staff**

- **FR-023**: The customer MUST see the instructions they gave on the order confirmation and on
  the order's page, on every customer surface.
- **FR-024**: Back-office staff who can view an order MUST see its instructions with the delivery
  address.
- **FR-025**: Shops MUST NOT be shown delivery instructions.

**Handling the text**

- **FR-026**: The note MUST be shown as plain text everywhere. It MUST never be interpreted as
  markup, turned into a link, or acted on.
- **FR-027**: Instructions MUST NOT appear in any email the platform sends.
- **FR-028**: Instructions MUST NOT appear in analytics or in operational logs.
- **FR-029**: Emoji and text in any language MUST be accepted and shown as typed.

**Consistency**

- **FR-030**: Giving, saving and viewing instructions MUST behave the same on customer web and
  customer mobile.
- **FR-031**: An order placed without instructions, including every order placed before this
  feature, MUST show none, with no placeholder or default text anywhere.

### Key Entities *(include if feature involves data)*

- **Delivery instructions**: an optional handover preference (leave at the door, or meet at the
  door) and an optional note of up to 250 characters. Either may be present without the other.
- **Order**: gains the delivery instructions as given at placement. Fixed once the order is paid.
- **Saved address**: gains default delivery instructions the customer can set, change and clear.
  Used to prefill checkout; never read to decide what a placed order says.
- **Drop**: the driver's view of one customer delivery. Presents the order's instructions to the
  assigned driver.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A customer can add a handover preference and a note at checkout in under 20 seconds.
- **SC-002**: For 100% of orders placed with instructions, the assigned driver sees exactly the
  text the customer typed, on all three driver views.
- **SC-003**: For 100% of orders placed without instructions, no instruction area and no
  placeholder text appears on any customer, driver or staff screen.
- **SC-004**: A customer with saved instructions on an address completes checkout without typing
  them again.
- **SC-005**: Editing or deleting an address changes the instructions on zero placed orders.
- **SC-006**: A note containing markup, a link and a script shows as those literal characters on
  every screen, and nothing is linked or run.
- **SC-007**: Zero emails, analytics events and log lines contain the text of any instruction.
- **SC-008**: A driver not assigned to a drop can retrieve its instructions in zero cases.
- **SC-009**: A note longer than 250 characters is refused in 100% of attempts, including attempts
  that bypass the customer screens.
- **SC-010**: The same order shows the same instructions on customer web and customer mobile.
- **SC-011**: Within a month of release, deliveries recorded as failed for "nobody home" or
  "access blocked" fall as a share of same-day drops.

## Assumptions

- **Two handover preferences to start**: "Leave at the door" and "Meet at the door", the two the
  client named. The set is closed; adding a third is a later change.
- **A handover preference is a request.** It tells the driver what the customer wants and which
  way of completing the drop to expect. It does not lock the driver out of the other.
- **Only signed-in customers check out**, so every order with instructions belongs to an account.
- **One note per order, not per package.** A customer delivery is one drop, even when several
  shops supplied it.
- **Instructions are for the driver.** They are not shown to the shop that picks the order.
- **Standard packages go to an outside carrier** after the hub. Their instructions are stored and
  visible to staff; sending them on to the carrier depends on a carrier integration that does not
  exist yet.
- **Instructions may contain personal or access details** (gate codes, phone numbers). They are
  treated as part of the delivery address for privacy: visible to the customer, the assigned
  driver and back-office staff, and nowhere else.
- **The unattended-drop photo rule already exists** in the driver's proof-of-delivery flow; this
  slice supplies the customer's wish, not a new proof rule.
- **SC-011 is observed, not gated.** It needs a month of live deliveries and does not block
  sign-off.

## Out of Scope

- Delivery time slots and choosing a delivery date.
- Changing instructions after the order is paid.
- Instructions for the shop or the picker.
- Passing instructions to an outside carrier.
- Calling or messaging the customer from the driver app.
- More handover preferences (a neighbour, a parcel locker, a safe place picker).
- Translating a note for the driver.
- Showing instructions in the delivered notification or the receipt email.

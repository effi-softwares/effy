# Feature Specification: Simple Order Status & Driver Assignment in Orders

**Feature Branch**: `073-order-dispatch-control`

**Created**: 2026-10-07 · **Revised**: 2026-10-07 (simplified on operator direction: *"simpler always
makes things better … give users simple updates … have manual functionality as well"*)

**Status**: Draft

**Input**: "Show how the planner assigns each order to a driver for pickup and delivery inside
back-office Orders; let back-office assign by hand what the planner could not and change anything it
decided; and make every status change show correctly in the shop, back-office and driver app."

## Why This Exists

Two problems, found while testing 072:

1. **Statuses are wrong on screen.** A driver collects a package and back-office already says "At hub"
   or "Out for delivery"; checking in at the hub changes nothing anywhere; the shop console never moves
   past "Collected". The records are right — every screen guesses from the shop's status alone.
2. **Assignment is invisible and cannot be steered.** Back-office cannot see, from an order, which
   driver has it; cannot give an unassigned package to someone; cannot move one package to another
   driver.

The fix is deliberately small: **one short list of statuses everyone shares, who has each package, a
one-line reason, and two manual actions — "Assign to…" and "Unassign".**

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One simple status, the same everywhere (Priority: P1)

Every package has one status from a short list, in plain words, the same on the shop console,
back-office and the driver app, and it changes on every open screen the moment the package moves.

| Status | Means |
|---|---|
| **Preparing** | the shop is picking it |
| **Ready** | packed, waiting for a driver |
| **With driver** | collected — in the named driver's van |
| **At hub** | checked in at the hub |
| **Out for delivery** | a driver has started taking it to the customer |
| **With carrier** | a standard package handed to the delivery company |
| **Delivered** | done |
| **Problem** | not collected, delivery attempt failed, or the shop can't supply — with one line saying which |
| **Cancelled** | the order was cancelled |

**Why this priority**: The operator's must. Nothing else is trustworthy while "where is it" is wrong.

**Independent Test**: Walk one same-day and one standard package from Ready to Delivered with the shop
console, back-office and driver app open; each step shows the same status on all three without a
refresh.

**Acceptance Scenarios**:

1. **Given** a Ready package, **When** a driver collects it, **Then** every screen shows "With driver
   — <name>" (never "At hub").
2. **Given** a collected package, **When** the driver checks in at the hub, **Then** every screen shows
   "At hub".
3. **Given** a same-day package at the hub, **When** the driver starts the drop, **Then** "Out for
   delivery"; **When** proof is captured, "Delivered".
4. **Given** a standard package at the hub, **When** it is handed to the carrier, **Then** "With
   carrier"; **When** its arrival is recorded, "Delivered".
5. **Given** a package left uncollected or a failed delivery attempt, **When** viewed, **Then**
   "Problem" with one line ("Not collected at the shop", "Delivery attempt failed — nobody home").
6. **Given** any status change, **When** a screen showing that package is open, **Then** it updates
   within a few seconds without a refresh.
7. **Given** the customer's order page, **Then** it is unchanged by this feature.

---

### User Story 2 - See who has each order (Priority: P2)

Each order shows who is collecting it and who is delivering it, or "Unassigned" with one line saying
why. Each assignment carries one line saying how it was made: "Auto-assigned — fewest packages today"
or "Assigned by <person>". An **Assignments** tab inside Orders lists what needs a driver at the top,
then each driver with their packages and when their round opens. The separate Dispatch page is
retired into it.

**Why this priority**: The operator's "I think it works, I'm not sure" — this makes it checkable.

**Independent Test**: With the planner running, the order list shows a driver for every assigned
order; an unassigned order shows "Unassigned" and a reason.

**Acceptance Scenarios**:

1. **Given** an assigned order, **When** viewing the order list, **Then** a Driver column shows the
   collecting driver (and delivering driver for same-day).
2. **Given** an assigned package, **When** viewing the order, **Then** it shows driver, when the round
   opens and is due, and how it was assigned in one line.
3. **Given** an unassigned package, **When** viewing it, **Then** it shows "Unassigned" and the main
   reason in one line ("No driver on duty is cleared for this area").
4. **Given** the Assignments tab, **When** opened, **Then** "Needs a driver" is first, then drivers.

---

### User Story 3 - Assign or change a driver by hand (Priority: P3)

On any package that is not yet collected, a manager can choose **Assign to…** (a list of drivers,
the most suitable first, each with a short note if there is a concern) or **Unassign**. After any
action the screen says, in one line, what happened.

**Why this priority**: The planner may fail to assign; a person must be able to fix it, and to
correct a choice they know is wrong.

**Independent Test**: Take an unassigned package and assign it by hand; move an assigned package to
another driver; unassign one. Each shows a one-line confirmation and appears in the drivers' apps.

**Acceptance Scenarios**:

1. **Given** an unassigned or assigned (not collected) package, **When** a manager assigns it to a
   driver, **Then** it moves to that driver, both drivers' apps update, and the screen says "Assigned
   to Ben".
2. **Given** the driver list, **When** it opens, **Then** drivers who are fine come first; drivers with
   a concern show it in a few words ("Not cleared for Inner North", "Round may run late"); drivers who
   cannot take it at all ("Off duty", "No vehicle", "Licence expired", "Van can't carry chilled",
   "Van too full") cannot be picked.
3. **Given** a manager picks a driver with a concern, **When** they confirm, **Then** the assignment is
   made and records that it was a person's choice.
4. **Given** a package assigned by hand, **When** planner passes run, **Then** it stays where the
   person put it.
5. **Given** a manager unassigns a package, **When** the next pass runs, **Then** the planner may
   assign it again; **Given** they want to choose themselves, they use Assign to… instead.
6. **Given** a package already collected, **Then** Assign to… and Unassign are not offered, and the
   row says it is in <driver>'s van.
7. **Given** someone else changed the package a moment earlier, **When** a manager saves, **Then** they
   are told "This changed — here is the latest" and nothing is overwritten.

---

### Edge Cases

- A driver goes off duty with a hand-assigned, uncollected package: it returns to "Unassigned" as today.
- An order with packages from several shops: each package has its own status and driver; the order
  list shows the least advanced status and "2 drivers" where relevant.
- A standard package has no delivery driver; it shows "With carrier" after handover.
- A CSA sees everything and changes nothing.

## Requirements *(mandatory)*

### Functional Requirements

**Status (US1)**

- **FR-001**: Every package MUST have exactly one status from: Preparing, Ready, With driver, At hub,
  Out for delivery, With carrier, Delivered, Problem, Cancelled. "With driver" and "Out for delivery"
  name the driver; "Problem" carries one line saying what.
- **FR-002**: The status MUST be worked out from what actually happened (collection, hub check-in,
  drop started, proof, failed attempt, carrier handover, arrival), not from the shop's status alone.
- **FR-003**: Back-office, the shop console and the driver app MUST use the same words for the same
  status. The shop console MUST NOT show driver names.
- **FR-004**: Every status change MUST update every open screen showing that package within a few
  seconds, without a refresh — including the shop console on hub check-in.
- **FR-005**: The customer's order page MUST NOT change.

**Who has it (US2)**

- **FR-006**: The order list MUST show a Driver column and allow filtering to orders that need a driver.
- **FR-007**: Each package MUST show its collecting driver and, for same-day, its delivering driver,
  with when the round opens and is due.
- **FR-008**: Each assignment MUST carry one line saying how it was made — by the planner and the rule
  in plain words, or by a named person.
- **FR-009**: An unassigned package MUST show "Unassigned" and its main reason in one line.
- **FR-010**: Orders MUST have an Assignments tab — "Needs a driver" first, then each driver with
  their packages — replacing the Dispatch page; old Dispatch links MUST still work.

**Manual (US3)**

- **FR-011**: A manager or admin MUST be able to Assign to… any package that is not yet collected —
  whether unassigned or already assigned — and Unassign any package that is not yet collected.
- **FR-012**: The driver list MUST show each driver as: fine; has a concern (not cleared for the area,
  round may run late) — pickable after a confirm; or cannot take it (not employed, off duty, licence
  expired, no vehicle, van can't carry chilled/frozen, van too full) — not pickable. The platform MUST
  enforce the "cannot" list, not only the screen.
- **FR-013**: The planner MUST NOT move work a person assigned (it already never moves assigned work).
- **FR-014**: Collected packages MUST NOT be reassigned or unassigned.
- **FR-015**: A save MUST be refused if the package changed since it was loaded, showing the latest.
- **FR-016**: Every manual action MUST record who and when, and show in the package's one-line
  "how assigned".

**Simple updates (all)**

- **FR-017**: Every action MUST end with a one-line confirmation of what happened ("Assigned to Ben",
  "Unassigned — the planner will pick it up within 5 minutes"); every refusal MUST say why in one line.
- **FR-018**: Words on screen MUST be plain: no internal codes, no enum values, no "wave".

**Simplification of what exists**

- **FR-019**: The round **lock** is removed. Since 072 the planner never moves assigned work, so the lock
  only stopped additions; a person who wants control uses Assign to….
- **FR-020**: The "planning passes" list is removed from screens; the planner is called "auto-assign".

### Key Entities

- **Package status**: one of the nine above, derived from what happened; never stored separately.
- **Assignment**: which driver has a package for collection or delivery, and one line on how it got
  there (planner rule, or a named person, and when).

## Success Criteria *(mandatory)*

- **SC-001**: For one same-day and one standard package walked end to end, every step shows the same
  status on shop console, back-office and driver app within a few seconds, with no refresh.
- **SC-002**: From the order list a user can tell who has any order without opening anything else.
- **SC-003**: An unassigned package can be given to a driver in under 30 seconds from its order.
- **SC-004**: Every "cannot take it" condition is refused by the platform when attempted directly.
- **SC-005**: No collected package can be reassigned or unassigned.
- **SC-006**: Every action shows a one-line confirmation or a one-line reason.

## Assumptions

- **Managers and admins act; CSA views.** As today.
- **Concerns vs cannot**: area clearance and the deadline estimate are a person's call; employment,
  duty, licence, vehicle, refrigeration and weight are facts.
- **No hold.** To stop the planner choosing, a person assigns. Unassign hands it back to the planner.
- **"How assigned" is one stored line**, written when the assignment is made; there is no candidate
  table.
- **The planner's rules are otherwise unchanged.**

## Out of Scope

- Holding packages; full decision breakdowns; assignment history timelines; bulk actions.
- Moving a whole round at once in the new screens (the existing round reassign stays on the round page).
- Changes to the customer's view, maps, routing, instant (event-triggered) assignment.

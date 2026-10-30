# Feature Specification: Return Failed Parcels to the Hub

**Feature Branch**: `088-failed-parcel-return`

**Created**: 2026-10-16

**Status**: Draft

## Clarifications

### Session 2026-10-16

- Q: What happens to a returned parcel - re-offered automatically, held for staff, or by reason? → A:
  Held for staff to choose its next step (option A, the recommended default; operator proceeded to
  planning without choosing otherwise).

**Input**: User description: "Driver: return failed parcels to the hub (driver backlog A4). When a driver cannot complete a delivery drop (nobody home, wrong address, refused, access blocked, other), the parcel stays physically with the driver, but today it disappears from the driver's work and nothing tracks it back to the hub. The driver needs a clear "return to hub" step for every failed parcel on their delivery round, the parcel must stay on the driver's work until it is checked back in at the hub, and dispatch/back-office must see failed parcels that are out with a driver versus returned to the hub. Once returned, the parcel is back at the hub and can be planned for another delivery attempt or handled by staff. The delivery round should not be considered finished from the driver's point of view while failed parcels are still in the van. Keep it simple: one return step at the end of the round (or a "Return to hub" item on Today), checked in all together. Source: docs/driver-app-backlog.md (A4) and docs/driver-app-review.md (M1)."

## Background

An Effy driver works a delivery round from the hub to customers. When a drop cannot be completed, the
driver records why (nobody home, wrong address, customer refused, access blocked, other). The goods
are still in the driver's van - but from that moment nothing on the platform says so. The drop leaves
the driver's work, the round can finish, and the parcel's status reads "Problem" for ever: nobody is
asked to bring it back, nobody at the hub is expecting it, and it cannot be delivered again because
it is still recorded as on the round. A parcel can be physically lost without anything noticing.

This feature closes that gap: a failed parcel stays the driver's responsibility until it is checked
back in at the hub, and from then it is the hub's.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The driver brings failed parcels back (Priority: P1)

A driver's round has one or more drops they could not complete. When the round's remaining drops are
all settled, the driver's work shows a single "Return to hub" step listing every parcel still in the
van. At the hub the driver confirms the return in one action, and those parcels are checked in.

**Why this priority**: This is the whole problem. Without it a failed parcel has no owner and no
destination; with it alone, every failed parcel is accounted for.

**Independent Test**: Fail one drop on a two-drop round, deliver the other. The driver's work still
shows the round with a "Return to hub" step naming the failed parcel. Confirm the return: the round
is finished and the parcel reads "At hub".

**Acceptance Scenarios**:

1. **Given** a round with a failed drop and other drops still open, **When** the driver views the
   round, **Then** the failed drop is shown as "to return" and the open drops remain the next work.
2. **Given** every drop on a round is delivered or failed and at least one failed, **When** the
   driver views Today, **Then** the current work is "Return to hub" with the number of parcels to
   return, and the round is not finished.
3. **Given** the "Return to hub" step, **When** the driver confirms the return, **Then** every listed
   parcel is recorded as back at the hub, the round is finished, it appears in the driver's history,
   and the driver's next round becomes current.
4. **Given** every drop on a round was delivered, **When** the last proof is recorded, **Then** there
   is no return step and the round finishes as it does today.

---

### User Story 2 - Dispatch sees where failed parcels are (Priority: P1)

Back-office staff looking at an order, a parcel or a round can tell a failed parcel that is still out
with a driver from one that has been returned, and who has it.

**Why this priority**: The driver's step only helps if the people responsible for the customer can
see the result. A failed parcel out with a driver at the end of a shift is the case staff must chase.

**Independent Test**: Fail a drop. In back-office the parcel shows as a problem that is "with
[driver] - to return". After the driver returns it, it shows as returned to the hub, with the
failure reason.

**Acceptance Scenarios**:

1. **Given** a failed drop not yet returned, **When** staff view the parcel or its order, **Then**
   they see the failure reason, when it failed, and that it is still with the named driver.
2. **Given** a returned parcel, **When** staff view it, **Then** they see it is at the hub, when it
   was returned, and the failure reason.
3. **Given** several failed parcels across drivers, **When** staff view the day's dispatch, **Then**
   they can see how many failed parcels are still out with drivers and how many have been returned.

---

### User Story 3 - A returned parcel gets a next step (Priority: P2)

Once a failed parcel is back at the hub, it does not stay there forgotten: it goes on to its next
step (see FR-010).

**Why this priority**: Returning the parcel stops it being lost; giving it a next step is what
eventually gets the customer their goods or their money back. It depends on Story 1.

**Independent Test**: Return a failed parcel. It is shown as needing a next step, and taking that
step (per FR-010) moves it on; it is never silently left at the hub.

**Acceptance Scenarios**:

1. **Given** a returned parcel, **When** staff open it, **Then** the actions they already have for
   an order's delivery (choose a new delivery window, move it to courier delivery, cancel and refund)
   are available for it.
2. **Given** a returned parcel that has had its next step taken, **When** anyone views it, **Then**
   its status reflects that step and not the old failure.

---

### User Story 4 - Staff record a return on a driver's behalf (Priority: P3)

A driver ends a shift without confirming the return (forgot, phone died, round taken off them), but
hands the parcels in. A hub staff member records the return for them.

**Why this priority**: Rare, but without it a parcel handed in physically could stay "with the
driver" in the record indefinitely.

**Independent Test**: Fail a drop, do not return it from the app. In back-office, record the return.
The parcel reads "At hub", the driver's return step disappears, and the action is attributed to the
staff member.

**Acceptance Scenarios**:

1. **Given** a failed parcel still with a driver, **When** a staff member records its return,
   **Then** it is at the hub, the driver's return step no longer lists it, and the record names the
   staff member who did it.

### Edge Cases

- **A failed drop is later delivered on the same round** (the driver goes back and the customer is
  home): the drop's proof is recorded as today, and the parcel is no longer "to return".
- **Some but not all parcels at a failed drop**: a drop is all-or-nothing today; a failed drop
  returns every parcel that was on it.
- **The driver records the return while offline**: it is saved on the phone and sent when the
  connection returns, like every other driver action; the driver is moved on immediately.
- **Dispatch tries to move a round to another driver after a failure**: the failed parcel is still
  physically with the original driver, so the move is refused until the return is recorded.
- **The driver signs out or goes off duty with parcels to return**: they are reminded that parcels
  are still to be returned; staff see the parcels as still with that driver (Story 2, Story 4).
- **A return confirmed twice** (retry, two taps, two devices): recorded once.
- **A parcel the hub does not physically receive**: out of scope for confirmation by scanning; the
  driver's confirmation is the record (scanning arrives with backlog H10).

## Requirements *(mandatory)*

### Functional Requirements

**Driver**

- **FR-001**: A parcel on a failed drop MUST remain part of the driver's work, as "to return",
  until it is recorded as returned to the hub.
- **FR-002**: A delivery round MUST NOT be finished while any of its failed parcels is still to
  return; it MUST finish when the last such parcel is returned (or, with none, when the last drop is
  settled, as today).
- **FR-003**: When a round has parcels to return and no other open drops, the driver's current work
  MUST be one "Return to hub" step showing how many parcels, and which orders, are to be returned.
- **FR-004**: The driver MUST be able to return all of a round's to-return parcels in ONE action.
- **FR-005**: Recording a return MUST be safe to repeat: a retried or duplicated return records once.
- **FR-006**: Recording a return MUST work without a connection, in the same way as the driver's
  other actions (saved, then sent; the driver is moved on at once).
- **FR-007**: When a driver signs out or goes off duty with parcels still to return, the app MUST say
  so before they confirm.

**Status & visibility**

- **FR-008**: A failed parcel not yet returned MUST read as "Problem" with the detail that it is with
  the named driver to be returned; a returned parcel MUST read "At hub", with its failure still
  visible in its history. The platform's single package-status vocabulary is not extended.
- **FR-009**: Back-office MUST show, per parcel and order, the failure reason, when it failed, who has
  it, and when it was returned; and per day, the count of failed parcels still out with drivers and
  the count returned.

**After the return**

- **FR-010**: A returned parcel MUST be held at the hub as needing a staff decision - it is NOT offered
  for delivery again by itself. It MUST appear among the things back-office has to act on until a
  staff member gives it a next step (FR-011). *(Decided 2026-10-16: a person decides, because the
  reason it failed - a wrong address, a refusal - usually needs a person to look at it.)*
- **FR-011**: A returned parcel MUST be able to be delivered again, moved to courier delivery, or
  cancelled and refunded through the actions back-office already has for an order's delivery; none of
  them may treat it as still on the failed round.

**Staff**

- **FR-012**: Back-office staff MUST be able to record the return of a failed parcel on a driver's
  behalf; the record MUST name the staff member and the time.
- **FR-013**: Every return (by a driver or staff) MUST be recorded with who, when and which parcels,
  and MUST NOT change the recorded failure (reason, note, time).

**Unchanged**

- **FR-014**: A failure still MUST NOT mark anything delivered, notify the customer that it was
  delivered, or move any money. This feature does not change what the customer is told about a
  failed attempt.

### Key Entities

- **Failed attempt** (exists): a drop that could not be completed - reason, note, when, which driver.
- **Parcel to return**: a parcel from a failed drop, still with the driver who attempted it; belongs
  to that driver and the round it failed on.
- **Return**: the record that parcels came back to the hub - which parcels, who recorded it (driver or
  staff member), when, and the round they came from.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of parcels on failed drops are either shown as with a named driver or as returned
  to the hub; none has no recorded location.
- **SC-002**: A driver can return all of a round's failed parcels in one action taking under 10
  seconds at the hub.
- **SC-003**: No delivery round is finished while a parcel from it is still in a driver's van.
- **SC-004**: Staff can find every failed parcel still out with a driver from one screen, in under a
  minute.
- **SC-005**: Every returned parcel reaches a next step (FR-010) - none remains at the hub with no
  owner or action pending.

## Assumptions

- The existing failure reasons, failure recording and the "Problem" status are kept as they are.
- One hub (as today); "the hub" needs no choosing.
- The driver's confirmation is the record of the return; scanning parcels in is a later addition
  (driver backlog H10) that will plug into the same step.
- What the customer is told about a failed attempt is unchanged and out of scope.
- This changes when a delivery round with a failure is finished (backlog A1 closed it on the last
  failure; it now closes on the return).
- Collection rounds are unaffected: a parcel not collected stays at its shop, as today.
- Back-office's existing "choose a new window" / "move to courier" / "cancel and refund" actions are
  the tools for a returned parcel's next step; no new kind of re-delivery is invented.

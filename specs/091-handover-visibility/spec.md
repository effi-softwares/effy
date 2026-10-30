# Feature Specification: Scan Versus Manual Visibility

**Feature Branch**: `091-handover-visibility`

**Created**: 2026-10-16

**Status**: Draft

**Input**: User description: "Driver backlog H12 - show scan versus manual for every hand-over on the order and run screens, and a per-shop 'labels that didn't scan' count, so dispatch can see which labels and drivers skip scanning."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Each package's hand-overs on the order (Priority: P1)

Staff looking at an order see, for each package, every hand-over it has been through - collected,
checked in at the hub, loaded, delivered, returned - and whether each was scanned, typed or ticked by
hand, when, and by which driver.

**Why this priority**: When a customer says they got the wrong bag, this is the first question.

**Independent Test**: A package collected by scan and delivered by hand shows two lines on the order,
"Collected · scanned" and "Delivered · by hand", each with its time and driver.

**Acceptance Scenarios**:

1. **Given** a package with recorded hand-overs, **When** staff open its order, **Then** each hand-over
   is listed in time order with its method, time and driver.
2. **Given** a package with none recorded (before scanning, or an app that does not scan), **When** the
   order is opened, **Then** nothing is shown for it - never "by hand" by assumption.

---

### User Story 2 - Scanning on a round (Priority: P2)

On a round, each stop shows how many of its hand-overs were scanned, typed and ticked by hand.

**Why this priority**: Shows which driver or which stop skips scanning.

**Independent Test**: A stop with two scanned and one typed hand-over shows "2 scanned · 1 typed".

**Acceptance Scenarios**:

1. **Given** a round with recorded hand-overs, **When** dispatch opens it, **Then** each stop shows its counts.
2. **Given** a stop with none recorded, **Then** no counts are shown.

---

### User Story 3 - Labels that didn't scan, per shop (Priority: P2)

On a shop's page, staff see, for the last 30 days, how many of that shop's package hand-overs were
scanned and how many were not (typed or by hand) - a shop whose labels often fail to scan is printing
them badly.

**Independent Test**: A shop with 8 scanned and 2 typed hand-overs in 30 days shows "8 scanned · 2 not
scanned (20%)".

**Acceptance Scenarios**:

1. **Given** hand-overs of a shop's packages in the last 30 days, **When** staff open the shop, **Then**
   they see scanned and not-scanned counts and the not-scanned share.
2. **Given** none, **Then** the shop page says no scanning has been recorded yet.

### Edge Cases

- Hand-overs older than 30 days do not count on the shop page; they still show on the order.
- The customer and the shop never see any of this.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Back-office's order view MUST list each package's recorded hand-overs (step, method,
  time, driver), oldest first.
- **FR-002**: Back-office's round view MUST show per stop the count of recorded hand-overs by method.
- **FR-003**: Back-office's shop view MUST show, for the last 30 days, scanned and not-scanned counts of
  that shop's packages' hand-overs, and the not-scanned share.
- **FR-004**: Nothing is inferred: a hand-over with no recorded method is not shown or counted.
- **FR-005**: None of this appears on a customer, shop or driver surface.

### Key Entities

- **Hand-over** (from 090): package, step, method, driver, time.

## Success Criteria *(mandatory)*

- **SC-001**: Staff can tell how any package was handed over at each step from its order, in one screen.
- **SC-002**: Staff can find the shops with the most unscanned labels without leaving back-office.

## Assumptions

- Data appears once drivers use the scanning screens (after the redesign); until then the views are empty.

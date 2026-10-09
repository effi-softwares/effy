# Feature Specification: Driver Operations Realignment

**Feature Branch**: `082-driver-operations-realignment`

**Created**: 2026-10-09

**Status**: Draft

**Input**: "Driver Operations Realignment. Effy drivers' work changes to match the new delivery model.
Collection runs still visit Effy's suppliers and bring parcels to the hub; they carry every 'Delivered
by Effy' parcel and every courier parcel that goes via the hub, but never parcels a courier collects
directly from a supplier. Because customers can now choose a window up to three days ahead, a parcel
may wait at the hub: it is collected in time for its window and delivered only on the round for its
own day and window, never earlier. At hub check-in the driver sees two groups — parcels for Effy
delivery (by day and window) and parcels for the courier — without classifying anything. Delivery
rounds are planned per window on the window's day, as today. Driver permissions say whether a driver
collects, delivers, or both, and where; the old split by 'same-day' or 'standard' goes away, and
'where' is the business's named groups of postcodes or everywhere — a postcode in no group can be
delivered by any driver cleared to deliver, not only by drivers cleared for everywhere. Drivers and
dispatch staff never see the words 'same-day' or 'standard' (customers keep them). Dispatch staff can
look at any of the days that have windows on sale, and 'needs a driver' in the order list means any
Effy parcel at the hub whose window is coming up with no driver, whichever day it was sold for. An
order moved back from courier to Effy delivery for a later day gets a delivery round like any other.
Work still opens at its planned time and is assigned as soon as a qualifying driver can take it."

**Programme**: Delivery Model v2, epic **E8** (`docs/prd/2026-10-delivery-model-v2-backlog.md`).
Builds on 063/072/073 (work assignment, opening on time, the Assignments tab), 065 (temperature classes),
076 (coverage: one postcode list, optional groups), 078 (windows today and on the next delivery days),
079 (who delivers an order), 080 (how courier parcels reach the courier) and 081 (moving an order
between Effy and courier). ⚠ This is the last thing the new delivery model waits for: until it is
built, a window sold for a later day gets no delivery round. Switching the model on is E9.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A later-day window is delivered on its own day (Priority: P1)

On Tuesday a customer buys a window for Thursday, 4–6 pm. The supplier prepares the parcel. An Effy
driver collects it on a collection run and checks it in at the hub, where it waits. Thursday's 4–6 pm
delivery round is planned on Thursday, includes the parcel, and a driver delivers it in the window. It
is never on Tuesday's or Wednesday's delivery rounds.

**Why this priority**: it is what the new model sells and what today's planning cannot do — a later-day
parcel currently gets no delivery round at all.

**Independent Test**: place an Effy order for a window two days ahead; confirm it is collected and
checked in, appears on no delivery round before its day, and on its day is on exactly one round for
its window and can be delivered with proof.

**Acceptance Scenarios**:

1. **Given** a parcel sold a window on a later day, **When** delivery rounds are planned today or on any
   day before its own, **Then** it is on none of them.
2. **Given** the parcel's own day, **When** its window's delivery round is planned, **Then** the parcel is
   on it, whether it reached the hub that day or days earlier.
3. **Given** a parcel waiting at the hub for a later day, **When** anyone views it, **Then** it reads
   "At hub", with the day and window it is waiting for.
4. **Given** a window today, **When** its round is planned, **Then** it works exactly as it does now.
5. **Given** an order moved back from courier to Effy delivery for a later day (081), **When** that day's
   round is planned, **Then** its parcels are on it like any other.
6. **Given** a delivery round, **When** it is planned, **Then** it opens at its window's start less the
   planning lead time and is assigned as soon as a qualifying driver can take it, as today.

---

### User Story 2 - Parcels are collected in time for their window (Priority: P1)

A parcel for Thursday afternoon does not need to leave the supplier on Tuesday. It is put on the latest
collection run that still gets it to the hub in time for its window — so chilled and frozen goods stay
at the supplier as long as they can. A parcel for Thursday's first window, before any Thursday run could
bring it in, is collected on Wednesday's last run and waits at the hub overnight. Collection runs carry
Effy parcels and courier parcels that go via the hub, and never a parcel a courier collects from the
supplier.

**Why this priority**: a parcel collected too late misses its window; this decides which run it is on.

**Independent Test**: with runs at known times, place orders for windows today, tomorrow morning and two
days ahead in the afternoon; confirm each is offered to drivers only on the run that is the latest one
reaching the hub in time, and that a supplier-pickup courier parcel is on none.

**Acceptance Scenarios**:

1. **Given** a parcel whose window is days away, **When** an earlier collection run is planned and a later
   run would still reach the hub in time, **Then** the parcel is not on the earlier run.
2. **Given** the latest run that reaches the hub in time for the parcel's window, **When** that run is
   planned, **Then** the parcel is on it once the supplier has it ready.
3. **Given** a window so early that no run on its own day reaches the hub in time, **When** the previous
   delivery day's last run is planned, **Then** the parcel is on that run and waits at the hub overnight.
4. **Given** a parcel the supplier had not ready for its intended run, **When** the next run is planned,
   **Then** it is on the next run, and staff see it as at risk of missing its window.
5. **Given** a courier parcel that goes via the hub, **When** runs are planned, **Then** it is collected on
   the next run as today; **Given** one the courier collects from the supplier, **Then** never.
6. **Given** a parcel with chilled or frozen items that will wait at the hub overnight, **When** hub and
   dispatch staff view it, **Then** it is marked as needing cold storage.

---

### User Story 3 - The driver sees two groups at the hub, in plain words (Priority: P1)

A driver finishes a collection run and checks in at the hub. The screen shows what they brought in two
groups: **Effy delivery**, listed by day and window ("Today, 4 pm – 6 pm"; "Thu 15 Oct, 10 am – 12
pm"), and **Courier**. They classify nothing. Nowhere in the driver app — today's work, upcoming work,
collection, delivery, history — do the words "same-day" or "standard" appear.

**Why this priority**: the driver is the person who puts a parcel on the right shelf; the old words now
describe nothing they do.

**Independent Test**: check in a run carrying a parcel for today, one for a later day and a courier
parcel; confirm the two groups, the day and window on each Effy parcel, and that a sweep of every
driver screen finds neither old word.

**Acceptance Scenarios**:

1. **Given** a check-in with Effy and courier parcels, **When** the driver views it, **Then** there are two
   groups — "Effy delivery" with a count per day and window, and "Courier" with a count.
2. **Given** an Effy parcel for a later day, **When** shown at check-in, **Then** it names that day and
   window, so it can be shelved for it.
3. **Given** any driver screen, **When** it is shown, **Then** it never says "same-day" or "standard";
   delivery work is "Delivery", collection work is "Collection".
4. **Given** a driver's upcoming work, **When** they view it, **Then** a delivery round names its day and
   window.
5. **Given** an order sold before the new model (same-day, or standard to a carrier), **When** its parcels
   are shown to a driver, **Then** they read "Effy delivery" (with their window) or "Courier" — the same
   two words.
6. **Given** a driver on the previous version of the app, **When** they work a shift after this release,
   **Then** every screen still works; only the wording is the old one until they update.

---

### User Story 4 - Driver permissions: collects, delivers, and where (Priority: P2)

In back-office a manager opens a driver and sees what they may do: **Collects** and/or **Delivers**,
each either **Everywhere** or in named groups of postcodes. There is no "same-day" or "standard"
anywhere on the screen. A driver who could do either method for an area before can do that function
for that area now. A delivery to a postcode that is in no group can be given to any driver who may
deliver.

**Why this priority**: the old permission's second half no longer means anything, and an address in no
group can only be delivered by an every-area driver today.

**Independent Test**: view a driver who had mixed old permissions; confirm they are shown as collects /
delivers with their areas and nothing was lost; give a delivery to an ungrouped postcode and confirm a
driver cleared for one group only is offered it.

**Acceptance Scenarios**:

1. **Given** existing permissions, **When** this feature is released, **Then** every driver can do at
   least everything they could before: any old permission for a function and area becomes that function
   for that area.
2. **Given** the driver's page, **When** a manager edits permissions, **Then** they choose Collects and
   Delivers, each for everywhere or for chosen groups, and nothing about a delivery method.
3. **Given** a delivery to a postcode in a group, **When** work is assigned, **Then** only drivers who
   deliver everywhere or in that group qualify.
4. **Given** a delivery to a postcode in no group, **When** work is assigned, **Then** any driver who
   delivers anywhere qualifies.
5. **Given** a driver with no delivery permission, **When** delivery work is assigned, **Then** they never
   qualify, whatever the postcode.
6. **Given** a group is removed, **When** its postcodes become ungrouped, **Then** their deliveries are
   still assignable (scenario 4) and no driver's other permissions change.

---

### User Story 5 - Dispatch sees every day on sale (Priority: P2)

A dispatcher opens Assignments and picks a day: today or any later day that has windows on sale. For
each window they see its parcels — at the hub, still to be collected, or not yet ready — and who has
the round, or that it will be planned on the day. The order list's "needs a driver" picks out any Effy
parcel at the hub whose round has opened with no driver, whichever day it was sold. No dispatch screen
says "same-day" or "standard".

**Why this priority**: dispatch needs to see tomorrow's load today, and the "needs a driver" filter
currently ignores later-day parcels.

**Independent Test**: with parcels for today and two later days, switch days and confirm each window's
parcels and state; leave a later-day parcel at the hub with no driver once its round has opened and
confirm it is listed as needing a driver.

**Acceptance Scenarios**:

1. **Given** windows on sale today and on the next delivery days, **When** a dispatcher opens Assignments,
   **Then** they can choose any of those days, today first.
2. **Given** a later day, **When** viewed, **Then** each window lists its parcels and where each is (not
   ready, ready at supplier, with a driver, at hub), and says its round is planned on the day.
3. **Given** an Effy parcel at the hub whose delivery round has opened and has no driver, **When** the
   order list is filtered to "needs a driver", **Then** it is listed — for a window today or any day.
4. **Given** a parcel at the hub for a later day whose round has not opened, **When** the filter is
   applied, **Then** it is not listed: it is waiting, not unassigned.
5. **Given** any dispatch or driver-management screen, **When** shown, **Then** it never says "same-day" or
   "standard".
6. **Given** "Assign to…" on a delivery (073), **When** used for a later-day parcel before its day,
   **Then** it is refused with the reason: its round is planned on its day.

---

### Edge Cases

- **A non-delivery day between purchase and window** (Sunday): no runs or rounds that day; "the previous
  delivery day's last run" skips it.
- **A parcel misses its round** (not at the hub when the window's round is planned): it joins the round
  if it arrives before the round opens; otherwise it is "needs a driver"/late as today and staff decide
  (assign, or move to courier — 081).
- **A failed delivery** returns to the hub and is handled as today; it is not silently put on a later
  day's round.
- **A window is closed or its capacity changed after orders were sold**: sold parcels keep their window
  and are delivered in it.
- **Collection schedule changes** after a parcel was planned for a run: the parcel follows the schedule
  as it now stands, on the latest run that still makes its window (072's rule for removed runs).
- **A parcel for a later day that the driver collected early anyway** (given by hand with "Assign to…"):
  allowed; it waits at the hub.
- **An order with parcels from several suppliers**: each is collected on its own run; all are delivered
  on the one round for the order's window.
- **Courier parcels at hub check-in** include those of an order moved from Effy to courier (081).
- **A driver cleared to collect in one group only**: collection areas keep working as they do today —
  by the group of the parcel's delivery address.
- **Hub check-in with only one group present** shows that group alone, never an empty heading.
- **Old driver-app versions** receive the same work; nothing they rely on is removed in this feature.

## Requirements *(mandatory)*

### Functional Requirements

**Delivery rounds**

- **FR-001**: A parcel delivered by Effy MUST be put on a delivery round only for its own day and
  window — never on a round for an earlier day or another window.
- **FR-002**: Delivery rounds MUST be planned per window on the window's day, for every window with
  parcels, whether the window is today's or was sold days earlier.
- **FR-003**: What makes a parcel Effy's to deliver MUST be the order's delivery type and its window, not
  the words it was sold under; orders placed before the new model MUST keep being delivered as they
  were sold.
- **FR-004**: A round MUST open and be assigned exactly as today (opens at its window's start less the
  planning lead; assigned as soon as a qualifying driver can take it; an off-duty driver's unstarted
  work returns to be assigned).
- **FR-005**: A parcel waiting at the hub for a later day MUST read "At hub" and show the day and window
  it waits for, on every staff and driver screen that shows it.

**Collection**

- **FR-006**: Collection runs MUST carry Effy-delivered parcels and courier parcels that go via the hub,
  and MUST NOT carry a parcel a courier collects from the supplier.
- **FR-007**: An Effy parcel MUST be offered for collection on the latest run that reaches the hub in
  time for its window (allowing the hub's turnaround), and not on an earlier run while such a later run
  exists.
- **FR-008**: When no run on the window's day reaches the hub in time, the parcel MUST be collected on
  the last run of the previous delivery day.
- **FR-009**: A parcel that was not ready for its intended run MUST be offered on the next run and shown
  to staff as at risk.
- **FR-010**: A parcel with chilled or frozen items that waits at the hub overnight MUST be marked to hub
  and dispatch staff as needing cold storage.

**Hub check-in and driver wording**

- **FR-011**: At hub check-in the driver MUST see two groups — "Effy delivery", by day and window with a
  count each, and "Courier" with a count — and MUST NOT be asked to classify anything.
- **FR-012**: No driver screen MUST show "same-day" or "standard". Delivery work is "Delivery" with its
  day and window; collection work is "Collection".
- **FR-013**: Drivers on the previous app version MUST be able to complete every task after release.

**Permissions**

- **FR-014**: A driver's permissions MUST be: collects and/or delivers, each for everywhere or for named
  groups of postcodes. There MUST be no delivery-method dimension.
- **FR-015**: On release, every driver MUST keep at least what they could do: any existing permission for
  a function and area becomes that function for that area; "everywhere" stays everywhere.
- **FR-016**: A delivery to a postcode in a group MUST qualify only drivers who deliver everywhere or in
  that group; a delivery to a postcode in no group MUST qualify any driver who delivers anywhere.
- **FR-017**: Back-office MUST let managers view and edit these permissions with no reference to
  "same-day" or "standard".

**Dispatch**

- **FR-018**: Assignments MUST let staff choose today or any later day with windows on sale, and for each
  window show its parcels, where each is, and its round's driver or that it is planned on the day.
- **FR-019**: "Needs a driver" MUST include any Effy parcel at the hub whose delivery round has opened
  with no driver, for any day's window, and MUST NOT include a parcel whose round has not opened.
- **FR-020**: "Assign to…" for delivery MUST be refused before the parcel's day, with the reason.
- **FR-021**: No dispatch or driver-management screen MUST show "same-day" or "standard".

**Everywhere**

- **FR-022**: Customers MUST keep reading "Same-day delivery" and "Standard delivery"; suppliers MUST keep
  reading "Effy driver" and "Courier". Nothing in this feature changes a customer or supplier screen.
- **FR-023**: Every affected screen MUST update without refreshing when work is planned, assigned or
  changed, as today.

### Key Entities

- **Delivery round**: one driver's deliveries for one window on one day; planned on that day.
- **Collection run**: a scheduled round of suppliers ending at the hub; carries Effy parcels and
  via-the-hub courier parcels, each on the latest run that suits it.
- **Driver permission**: what a driver may do — collects, delivers — and where: everywhere, or named
  postcode groups.
- **Hub dwell**: a parcel at the hub waiting for its day and window; marked for cold storage when it
  holds chilled or frozen items overnight.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of Effy parcels sold a later-day window are on a delivery round for that day and
  window, and 0% on any earlier round.
- **SC-002**: 100% of Effy parcels ready in time reach the hub before their window's round opens.
- **SC-003**: Zero supplier-pickup courier parcels appear on collection runs.
- **SC-004**: Zero driver, dispatch or driver-management screens show "same-day" or "standard".
- **SC-005**: After release, zero drivers can do less than they could before.
- **SC-006**: 100% of deliveries to postcodes in no group can be assigned to a driver cleared for a
  single group.
- **SC-007**: Dispatch can see the parcels for every window on any day on sale within 10 seconds of
  choosing the day.
- **SC-008**: Every Effy parcel at the hub with an opened, unassigned round is listed under "needs a
  driver", whichever day it was sold.

## Assumptions

- **Collect late, not early** (backlog E8-T02, settled by default): the latest run that makes the window,
  so chilled goods stay at the supplier and the hub holds as little as possible. The alternative —
  collect as soon as ready, to free supplier shelf space — is the operator's to choose instead.
- **Cold goods may wait at the hub overnight** (backlog E8-T04, settled by default): they are marked for
  cold storage rather than refused. If the hub cannot hold chilled or frozen goods overnight, that is a
  rule on which windows such a basket can be sold — a checkout change, not part of this feature.
- **A postcode in no group** is deliverable by any driver who delivers anywhere (the wording given). The
  stricter alternative is every-area drivers only, as today.
- **Delivery rounds are created on their day**, not days ahead; dispatch sees upcoming parcels by window
  before that, without a round.
- **Collection areas** work as today (by the group of the parcel's delivery address); only the method
  half of the permission goes.
- **The supplier's side is unchanged**: suppliers are never told the customer's window (069) and prepare
  orders as they arrive. Telling suppliers when a parcel will be collected is out of scope.
- **The words**: drivers and dispatch say "Effy delivery" / "Delivery" / "Collection" / "Courier".
- **This feature does not switch the new delivery model on** (E9); it removes the last reason not to.
- **Out of scope**: routes and arrival times on a map (still schematic); multiple hubs; removing the old
  method values from stored data and contracts (E9, with the old checkout).

# Feature Specification: Driver Work in One Order, and Trips That Join Up

**Feature Branch**: `093-driver-work-sequence`

**Created**: 2026-10-17

**Status**: Draft

**Input**: User description: "Driver work happens in one enforced order, and a driver's collecting and
delivering join into one continuous trip. Hub check-in only after every shop is settled; nothing on a
delivery run until the van is loaded; no loading while collected parcels are still in the van; a package
the driver did not see is never marked collected; the collecting driver is preferred for delivering what
they collected; missing packages at loading and check-in are declared, never assumed; dispatch sees where
every run is and is told when a step is overdue; a pre-trip vehicle check. The driver app is still in
development — no compatibility with installed builds is required." Research:
[research-07-driver-task-sequencing.md](../../docs/research/logistics/research-07-driver-task-sequencing.md).

## Background

A driver's work has a physical order. They collect from the shops, check the parcels in at the hub, load
the van, deliver, and bring back what could not be delivered. The major delivery platforms enforce this
order. Onfleet will not let a driver start any drop on a hub route until its load step is done, and locks
the manifest once loading starts. Bringg refuses a task whose linked task is unfinished. Track-POD can make
a load check mandatory before a route starts. Hub systems reconcile what arrives against the manifest.

Effy's driver app follows this order on screen, but the platform itself does not enforce it. Only the time
gate is enforced: work cannot start before its run opens. A retried request, a second phone or a stale
screen can check in at the hub with shops still outstanding, or deliver a drop that was never loaded. A
package added to a shop stop while the driver stands at the counter can also be recorded as collected
without the driver ever seeing it. And a driver who has just brought parcels to the hub is not
preferred for delivering them. Someone else is sent, and the first driver goes home empty or waits idle.

## Clarifications

### Session 2026-10-17

- Q: Do installed driver-app builds need to keep working? → A: **No** (operator, 2026-10-17). The app is
  in development and nobody uses it. The per-drop "Start this drop" step is removed rather than kept
  alongside loading.
- Q: Should collecting and delivering combine into one trip? → A: **Yes, where possible**, as the most
  cost-effective use of a driver (operator, 2026-10-17).
- Q: Pre-trip vehicle check? → A: **Include it if useful** (operator, 2026-10-17). It is included as the
  lowest-priority story.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One step unlocks the next (Priority: P1)

The driver's work moves in one order, and the platform refuses a step taken out of turn. The refusal says
what has to happen first ("Collect from Fresh Grocer first", "Load the van first", "Check in the parcels
you collected first"). The app never offers a step it would refuse. Its controls show the next step and
nothing else.

The order is:

- **Collection run:** each shop is collected or declared not available, then the hub check-in closes the run.
- **Delivery run:** load the van, then each drop is delivered or not delivered, then any parcels that
  could not be delivered are returned to the hub.
- **Across runs:** a driver cannot load a delivery run while they still hold parcels from a collection
  run that have not been checked in. They also cannot load one while they hold failed parcels from an
  earlier delivery run that have not been returned. In both cases the driver is at the hub, so the
  missing step takes a moment.

**Why this priority**: This is the request that started the feature. A driver who can work out of order
can break an order: a delivered parcel that was never loaded, a run closed with parcels still at a shop.
Each one is a customer problem that nobody sees until the customer calls.

**Independent Test**: Try each step out of order. Try it through the app, and also by sending the request
directly as a stale screen or a second phone would. Each is refused with what to do first, and nothing
is written.

**Acceptance Scenarios**:

1. **Given** a collection run with one shop still to collect, **When** the driver checks in at the hub,
   **Then** it is refused, naming the shop, and the run stays open.
2. **Given** a collection run with every shop collected or declared not available, **When** the driver
   checks in, **Then** the check-in succeeds and the run closes.
3. **Given** a delivery run whose van is not loaded, **When** the driver tries to mark a drop as on the
   way, arrived, delivered or not delivered, **Then** each is refused with "Load the van first", and the
   drop is unchanged.
4. **Given** a delivery run that is not loaded, **When** the driver opens Today or any drop on the run,
   **Then** the current step is "Load the van", and the drop's delivery controls are unavailable with
   "Load the van first".
5. **Given** a driver who has collected parcels that are not yet checked in, **When** they try to load a
   delivery run, **Then** it is refused with "Check in the parcels you collected first".
6. **Given** a driver holding a failed parcel from an earlier delivery run that has not been returned,
   **When** they try to load a new delivery run, **Then** it is refused with "Return the parcels from
   your last run first".
7. **Given** a driver in the situation of scenario 5 or 6 whose phone has failed, **When** a dispatcher
   allows the load with a written reason, **Then** the driver can load that run, and the waiver and its
   reason are recorded against the run.
8. **Given** a driver who still has drops to deliver on a loaded run, **When** they try to collect at a
   shop on a collection run, **Then** it is refused with "Finish your deliveries first".

---

### User Story 2 - A package the driver did not see is never marked collected (Priority: P1)

Work keeps arriving during the day, and a package can be added to a shop stop while the driver is at the
counter. When the driver collects the packages they were shown, any package they were not shown stays
waiting at that stop. The stop stays open, and the driver is told "1 more package was added — collect it
before you leave". They collect it there, or declare it not available.

**Why this priority**: Without this a package can be recorded as in the van while it is still on the
shop's counter. The shop is told it was collected. Nobody looks for it, and the customer's order stalls.

**Independent Test**: Open a stop showing two packages, add a third to it, then collect the two. The
third is still waiting, the stop is still open, and the driver is shown the third.

**Acceptance Scenarios**:

1. **Given** a stop the driver opened with two packages, **When** a third is added and the driver
   collects the two, **Then** the two are collected, the third is still waiting, and the stop is open.
2. **Given** that open stop, **When** the driver collects or declares the third, **Then** the stop is done.
3. **Given** a stop where nothing was added, **When** the driver collects every package shown, **Then**
   the stop is done in one step, as now.

---

### User Story 3 - Trips that join up (Priority: P1)

When a driver checks in parcels at the hub that Effy will deliver today, they are preferred for
delivering those parcels. This holds if they are cleared to deliver to those addresses, are on duty,
have a vehicle that can carry them, and can finish before the window ends. Their day then runs as one
trip: collect, hub, load, deliver, return. They don't hand their parcels over and leave while another
driver is sent to deliver them.

The preference is explained in words, like every assignment ("Collected it — continuing to delivery").
It never overrides keeping an order's packages together. If one driver is already delivering to that
address, the order's other packages go to them. Where neither rule applies, the driver with the fewest
packages today is chosen, as now. As soon as the check-in is done, the driver's app shows the next step of
their trip: the delivery run, when it opens, and "Load the van".

**Why this priority**: The driver is already at the hub, with the parcels in hand. Sending someone else
costs a second driver and a second trip.

**Independent Test**: With two drivers both cleared and on duty, driver A collects and checks in parcels
for today's 5–7 pm window. A's delivery run for that window contains them, and the stated reason is that A
collected them.

**Acceptance Scenarios**:

1. **Given** driver A checks in parcels for a window today and can take them, **When** delivery work for
   that window is next planned, **Then** those parcels go to A, with the reason "collected it —
   continuing to delivery".
2. **Given** driver A is not cleared for one of the addresses, or their vehicle cannot carry a chilled
   parcel, **When** it is planned, **Then** that parcel goes to another driver by the usual rules, with
   the usual reason.
3. **Given** another driver already holds a run delivering to the same order, **When** a parcel for that
   order is planned, **Then** it joins that driver, so the order arrives together.
4. **Given** driver A checks in parcels for a later day, **When** they are shelved, **Then** no preference
   is kept. A later day is planned on that day.
5. **Given** driver A has just checked in, **When** their delivery run is planned, **Then** their app
   moves to it without a refresh and shows when it opens, then "Load the van".
6. **Given** driver A has already loaded and left on a delivery run for that window, **When** more of A's
   collected parcels are planned, **Then** they do not join A's van. They go on a run that has not been
   loaded.

---

### User Story 4 - Missing packages are declared, never assumed (Priority: P2)

At loading, the driver accounts for every package on the run: scanned, ticked, or declared missing with a
reason. The reasons are not at the hub, damaged, wrong temperature, or other with a note. A declared
package comes off the run. It is held at the hub, out of planning, until a dispatcher decides. If a drop's
packages are all declared, the drop comes off the run. If only some are, the drop goes out with the rest,
and the driver sees "1 of 2 packages".

At hub check-in, a collected package that is not in the van is declared missing. It is held out of
delivery planning and raised to dispatch as a shortage.

"Mark all loaded" and "check in without scanning" remain as fallbacks, but each lists the packages not
yet scanned. The driver confirms each one: it's here, or it's missing.

**Why this priority**: Without this, a package that was never in the van is "out for delivery" and a
package lost between shop and hub is "at the hub". Neither shows up anywhere until a customer complains.
It follows US1 because the gates come first.

**Independent Test**: Load a run with one package declared "not at the hub", and check in a collection
with one package declared missing. Each is off planning, each appears to dispatch with its reason, and
nothing else on the run is affected.

**Acceptance Scenarios**:

1. **Given** a run being loaded, **When** the driver declares one package "damaged", **Then** that
   package is off the run and held, dispatch sees it with the reason, and the rest of the run goes out.
2. **Given** every package of a drop declared, **When** loading finishes, **Then** that drop is not on
   the run.
3. **Given** a dispatcher views a held package, **When** they choose "Found — plan again", **Then** it
   is planned for a later run. **When** they choose "Lost", **Then** it is recorded as lost and leaves
   planning for good.
4. **Given** a check-in with one collected package not in the van, **When** the driver declares it
   missing, **Then** it is held, dispatch sees a shortage naming the driver and the shop, and the other
   parcels check in.
5. **Given** a driver chooses "Mark all loaded" with three packages unscanned, **When** they continue,
   **Then** they are asked about each of the three, and loading finishes only when every one is
   accounted for.

---

### User Story 5 - Dispatch sees where every run is (Priority: P2)

Dispatch sees each run's stage in words:

- **Collection:** To collect · Collecting 2 of 5 · Heading to the hub · Checked in.
- **Delivery:** To load · Out 4 of 9 · Returning 2 · Closed.

Dispatch is told when a step is overdue: a delivery run open but not loaded after a set number of minutes,
or a collection run with every shop done but not checked in after a set number of minutes. Held packages
(US4) are listed with their actions. A run worked in a different order from the plan shows that on the
run. The driver is not stopped from working out of order.

**Why this priority**: The gates stop mistakes. This shows dispatch where a trip has stalled while there
is still time to act.

**Independent Test**: Walk a run through each stage and check the dispatch view at each. Let a delivery
run sit open and unloaded past the set time, and check that an alert appears.

**Acceptance Scenarios**:

1. **Given** a delivery run open and unloaded past the set time, **When** dispatch views exceptions,
   **Then** it is listed with the driver and how long it has waited. It leaves the list once loaded.
2. **Given** a collection run with every shop done and no check-in past the set time, **Then** it is
   listed the same way.
3. **Given** a driver delivers drop 3 before drop 2, **When** dispatch opens the run, **Then** it shows
   that the run was worked out of order.
4. **Given** a run at any stage, **When** dispatch views the day or the run, **Then** the stage shown
   matches the stage the driver's app is at.

---

### User Story 6 - A pre-trip vehicle check (Priority: P3)

When a driver goes on duty, they answer a short check of the vehicle they are driving: tyres, lights and
indicators, brakes, mirrors and windows, cold storage, and body damage. Each answer is OK, minor issue or
unsafe, with an optional note. With an unsafe answer the driver is on duty but given no work,
and dispatch is told. A dispatcher can clear it once the vehicle is fixed or swapped. Minor issues are
recorded and shown to dispatch. One check per vehicle per shift is enough. Going off and back on duty in
the same shift does not ask again.

**Why this priority**: It is common practice for employee fleets, and it gives dispatch a record when a
vehicle is unfit. The order of work does not depend on it.

**Independent Test**: Go on duty and answer "unsafe" for brakes. The driver receives no work, dispatch
sees the check, and after a dispatcher clears it the driver receives work.

**Acceptance Scenarios**:

1. **Given** a driver going on duty for the first time in a shift, **When** they reach the check,
   **Then** they must answer every item before they can take work.
2. **Given** an unsafe answer, **Then** the driver is not given work, and the reason is shown in words
   to the driver and to dispatch.
3. **Given** a dispatcher clears an unsafe check, **Then** the driver is given work from the next
   planning pass.
4. **Given** all items OK, **Then** the driver takes work as now, and the check is recorded.

---

### Edge Cases

- **A shop closed, or not one package ready:** the stop is declared not available, which settles it, and
  check-in is allowed.
- **A collection run whose packages were all moved to other drivers before any collection:** the
  run has nothing to settle, and closes as dispatch's move leaves it, as now.
- **A delivery run planned while the driver is still collecting for it:** the run is shown. Loading
  waits for the check-in, which is the cross-run gate.
- **A run that grows while it is being loaded:** what joined before loading finished is loaded with it.
  Once the van is loaded, nothing joins (US3 scenario 6).
- **A retried load, check-in or collect:** answers with the result already recorded and writes nothing
  twice.
- **Offline:** a step queued offline is sent in order, so a queued check-in is never sent before the
  collects queued ahead of it. A step the platform refuses when the queue is sent is shown to the driver
  with its sentence. It is never silently dropped.
- **A dispatcher moves a package off a run during loading:** the load still finishes. The moved package
  is not on it.
- **The collecting driver goes off duty right after check-in:** the preference has no one to apply to,
  and the parcels are planned by the usual rules.
- **A driver with no vehicle assigned at going on duty:** this is already a reason they get no work. The
  check is not asked.

## Requirements *(mandatory)*

### Functional Requirements

**Order of work (US1)**

- **FR-001**: The platform MUST refuse a hub check-in while any shop stop on the run is neither
  collected nor declared not available, and MUST name the outstanding shops.
- **FR-002**: The platform MUST refuse every action on a delivery drop (on the way, arrived, delivered,
  not delivered) while the drop has not been loaded.
- **FR-003**: Loading MUST be the only way a drop goes out for delivery. The per-drop start step is
  removed.
- **FR-004**: The platform MUST refuse loading a delivery run while the same driver holds collected
  parcels that have not been checked in, or failed parcels from an earlier delivery run that have not
  been returned.
- **FR-005**: The platform MUST refuse collecting at a shop while the same driver has drops still to
  deliver on a loaded run.
- **FR-006**: A dispatcher MUST be able to waive FR-004 or FR-005 for one run, with a written reason.
  The waiver MUST be recorded with who gave it and when.
- **FR-007**: Every refusal MUST say, in one sentence, what has to happen first, and MUST write nothing.
- **FR-008**: The driver app MUST present only the step the platform would allow next: "Load the van"
  as Today's current step for an unloaded run; drops of an unloaded run shown with "Load the van
  first" and their delivery controls unavailable; the hub check-in available only when every shop is
  settled.
- **FR-009**: These gates MUST apply in addition to the existing rule that nothing is done before a run
  opens.

**Collecting what was seen (US2)**

- **FR-010**: Collecting a stop MUST settle only the packages the driver accounted for. A package on the
  stop that the driver did not account for MUST stay waiting, and the stop MUST stay open.
- **FR-011**: When packages remain waiting after a collect, the driver MUST be told how many, and
  shown them, before leaving the stop.

**Trips that join up (US3)**

- **FR-012**: When delivery work is planned, a parcel MUST be offered first to the driver who collected
  and checked it in, when that driver meets every existing condition: on duty, cleared for that delivery
  area, a vehicle that can take it, and able to finish in time.
- **FR-013**: Keeping an order's packages with the driver already delivering to that order MUST take
  precedence over FR-012. Where neither applies, the existing fewest-packages rule MUST decide.
- **FR-014**: The reason for an assignment made under FR-012 MUST be stated in words a driver could be
  told.
- **FR-015**: A parcel MUST NOT join a delivery run once its van has been loaded.
- **FR-016**: After a check-in, the driver's app MUST show the next step of the trip as soon as the
  delivery run is planned, without the driver refreshing.

**Missing packages (US4)**

- **FR-017**: Loading MUST account for every package on the run: scanned, confirmed by hand, or declared
  missing with one of: not at the hub, damaged, wrong temperature, other (with a note).
- **FR-018**: A package declared missing at loading MUST come off the run and be held out of planning.
  A drop with every package declared MUST come off the run. A drop with some packages declared MUST go
  out with the rest, and the driver MUST see how many of the drop's packages they carry.
- **FR-019**: Hub check-in MUST account for every collected package: scanned, confirmed by hand, or
  declared missing. A package declared missing MUST be held out of delivery planning.
- **FR-020**: Every held package MUST appear to dispatch with its reason, the driver, the run and when.
  The actions are "Found — plan again" (returns it to planning) and "Lost" (records it and removes it
  from planning for good).
- **FR-021**: The fallbacks "Mark all loaded" and "Check in without scanning" MUST list every package
  not yet scanned, and MUST ask the driver to confirm each one as present or missing.

**Dispatch visibility (US5)**

- **FR-022**: Every run MUST have one stage, worded the same everywhere it is shown (driver app,
  dispatch day, run detail). Collection: To collect · Collecting n of m · Heading to the hub · Checked
  in. Delivery: To load · Out n of m · Returning n · Closed.
- **FR-023**: Dispatch MUST be told when a delivery run has been open and unloaded for longer than a set
  number of minutes (default 20), and when a collection run has every shop settled but no check-in for
  longer than a set number of minutes (default 30). Staff MUST be able to change both values.
- **FR-024**: A run worked in a different order from the plan MUST show that on the run's detail. It
  MUST NOT be prevented.

**Vehicle check (US6)**

- **FR-025**: On the first time going on duty in a shift, a driver with a vehicle MUST answer a check of
  six items (tyres; lights and indicators; brakes; mirrors and windows; cold storage; body damage).
  Each answer is OK, minor issue or unsafe, with an optional note.
- **FR-026**: A driver whose current check has an unsafe answer MUST NOT be given work, with that reason
  shown in words, until a dispatcher clears it.
- **FR-027**: Dispatch MUST see every check and its answers, and MUST be told about an unsafe
  answer when it is given.

**Throughout**

- **FR-028**: Every step in this feature MUST be safe to repeat. A retried request answers with the
  result already recorded.
- **FR-029**: Every change in this feature MUST reach the screens that show it (driver app, dispatch)
  without a refresh, through the platform's existing live updates.
- **FR-030**: Nothing in this feature may tell a driver or a shop which shops filled an order beyond
  what they are told now, or tell a shop anything about delivery.

### Key Entities

- **Run stage**: where a collection or delivery run is, worked out from its stops and packages. It is
  one definition, read by every screen.
- **Held package**: a package declared missing at loading or check-in, with reason, note, driver, run,
  time, and its resolution (found or lost, by whom, when).
- **Load waiver**: a dispatcher's permission for one run to skip the cross-run gate, with reason, who
  and when.
- **Vehicle check**: one per driver per vehicle per local day, with the six answers and notes,
  the time, and whether it was cleared, by whom and when.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: No step out of order is accepted. Every out-of-order attempt in the test plan is refused
  with its sentence and writes nothing, whether it comes through the app or as a direct request.
- **SC-002**: Zero packages are recorded as collected that the driver was not shown (US2 test).
- **SC-003**: In a day where one driver collects and is cleared to deliver, at least 90% of the parcels
  they check in for delivery that day are delivered by them.
- **SC-004**: Every package declared missing at loading or check-in appears to dispatch within one
  minute.
- **SC-005**: An overdue step (unloaded run, unchecked-in collection) appears to dispatch within five
  minutes of passing its set time.
- **SC-006**: A driver can complete a full trip (collect, check in, load, deliver, return) with every
  next step shown on Today, without opening a menu to find it.
- **SC-007**: A driver with an unsafe vehicle check receives no work until it is cleared (US6 test).

## Assumptions

- One hub (multi-hub is deferred platform-wide).
- "Shift" for the vehicle check means the local (Melbourne) day: one check per driver per vehicle per day.
  A different vehicle later the same day is checked again.
- The vehicle check takes notes, not photos. A photo can be added later without changing the rule.
- Overdue thresholds default to 20 minutes (unloaded) and 30 minutes (not checked in), and staff can
  change them.
- A failed parcel can still be returned at the hub at any time (088). This feature only requires that it
  is returned before the driver's next load.
- Stop order within a run stays the driver's choice. It is recorded, not enforced.
- A "Lost" package is not compensated automatically. Staff use the existing refund tools.
- The driver app has no installed users. Removed steps and changed requests need no transition period.

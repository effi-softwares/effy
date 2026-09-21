# Feature Specification: Driver Work Assignment & Wave Planning

**Feature Branch**: `063-driver-work-assignment`

**Created**: 2026-09-21

**Status**: Draft

**Input**: User description: "Driver Work Assignment & Wave Planning — the engine that turns paid orders into a driver's day, and the back-office view that supervises it."

## Why This Exists

Nothing on the platform assigns any work to any driver.

The previous work model was removed deliberately. Since then, two slices have built the foundations
it will stand on: the fleet (vehicles, who is holding which one, whether a driver is employable at
all, and where each shop physically is), and driver clearances (which kind of work a driver may do,
by method, in which areas). Both are live.

What is missing is the thing between them. A shop can pick and pack every order it has and mark each
one ready, and **no driver is ever told**. The packages sit. The shopper is told nothing new. Nobody
at Effy is asked to act. The driver app's own "today" screen asks the platform what its driver should
be doing and gets no answer at all, because there is nothing left to answer with.

This slice is that answer: the rules that decide **which driver does which work, when**, and the
back-office view that watches those rules and overrides them when a human knows better.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A driver on duty is given their collection round (Priority: P1)

Packages that shops have made ready need collecting and bringing to the hub before the day's
collection run. Ahead of each run, the platform gathers everything that must travel, decides who is
able to carry it, and gives that driver an ordered round: which shops, in what order, and what to
pick up at each.

The driver does not choose work, search for work, or accept work. They come on duty and their round
is there.

**Why this priority**: This is the whole loop. Without it every other story has nothing to operate
on, and the platform remains unable to move a single package. It is also the minimum that delivers
real value: one driver collecting real packages against a real deadline.

**Independent Test**: With a shop holding ready packages, a cleared driver on duty, and a collection
run configured for later today, confirm the driver is given a round naming those shops and those
packages, ordered, before the run time.

**Acceptance Scenarios**:

1. **Given** a shop has packages ready and a cleared, on-duty driver exists, **When** the wave for
   today's collection run is planned, **Then** that driver is given a collection round containing
   those packages, and the round names each shop and what to collect there.
2. **Given** a driver is cleared only for a different area, **When** the wave is planned, **Then**
   they are not given that work, and the reason they were excluded is recorded.
3. **Given** two shops in the same area both have ready packages, **When** the round is built,
   **Then** both shops appear in one round rather than two, and packages from the same shop sit
   together.
4. **Given** a driver is on duty but is not employable (licence lapsed, holding no vehicle, or stood
   down), **When** the wave is planned, **Then** they are given no work, and the specific reason is
   stated rather than them being silently skipped.
5. **Given** a driver's round has been planned, **When** they open their app, **Then** they see what
   to do next at the top, without having to decide the order themselves.

---

### User Story 2 - Packages arrive at the hub and are counted in (Priority: P2)

A driver finishing a collection round arrives at the hub with everything they picked up. They check
the packages in. The platform records that custody has passed from the round to the hub, and shows
the split that already exists between packages going out again today and packages leaving by other
means.

The driver classifies nothing. Which packages are same-day and which are standard was decided when
the shopper checked out; the check-in only reveals it.

**Why this priority**: Without check-in, a collection round has no ending and packages have no
recorded location. It is also the precondition for any same-day delivery work — nothing can go out
from the hub until something is known to have arrived there.

**Independent Test**: Complete a collection round, check the packages in at the hub, and confirm each
package is recorded as at the hub and correctly shown as same-day or standard without the driver
being asked.

**Acceptance Scenarios**:

1. **Given** a driver has collected packages, **When** they check them in at the hub, **Then** every
   package is recorded as having arrived, with the time and the driver.
2. **Given** the collected packages include both same-day and standard, **When** check-in completes,
   **Then** the split is shown to the driver as a fact, and they are asked to decide nothing.
3. **Given** a package on the round was not collected, **When** the driver checks in, **Then** the
   discrepancy is visible rather than the package being quietly treated as arrived.
4. **Given** a standard package has been checked in, **When** check-in completes, **Then** that
   package's driver-side work is finished and it is not put into any delivery round.

---

### User Story 3 - Same-day packages go back out as a delivery round (Priority: P3)

Packages at the hub that were sold as same-day must reach customers today. The platform groups them
into a delivery round for a driver cleared to deliver in those areas, ordered so the driver is told
where to go next.

**Why this priority**: It completes the hub-and-spoke shape and is the half a shopper actually
experiences. It depends on US2 having put packages at the hub, which is why it follows.

**Independent Test**: With same-day packages checked in at the hub and a driver cleared for same-day
delivery on duty, confirm a delivery round is produced, ordered, covering those packages.

**Acceptance Scenarios**:

1. **Given** same-day packages are at the hub and a cleared driver is on duty, **When** the delivery
   wave is planned, **Then** that driver is given a delivery round containing those packages.
2. **Given** packages are going to two different areas, **When** the round is ordered, **Then** stops
   in the same area are grouped together rather than interleaved.
3. **Given** a driver is cleared to deliver standard but not same-day, **When** the delivery wave is
   planned, **Then** they are not given same-day work.
4. **Given** a package requires refrigeration, **When** a driver is selected, **Then** only a driver
   holding a vehicle able to carry it is eligible.

---

### User Story 4 - Back-office supervises the wave and overrides it (Priority: P4)

A dispatcher opens a view of the day's work: what has been planned, who has it, what could not be
given to anybody and why. They can move work from one driver to another, take work back, change the
order of a round, and mark a decision as theirs so the engine does not undo it on the next planning
pass.

The screen is built around what needs attention, not around what is going fine.

**Why this priority**: The engine earns its place by making the common case automatic and the
exceptional case visible. At this volume a dispatcher with a good screen could cope alone — which is
precisely why the override path must exist and be trusted. It follows the automatic path because
there is nothing to supervise until that path runs.

**Independent Test**: Plan a wave, then as a dispatcher reassign one driver's round to another, lock
it, re-plan, and confirm the locked decision survives.

**Acceptance Scenarios**:

1. **Given** a wave has been planned, **When** a dispatcher opens the day's view, **Then** they see
   every round, who holds it, and its current state.
2. **Given** packages could not be given to any driver, **When** the dispatcher opens the view,
   **Then** those packages are shown together with the reason no driver was eligible.
3. **Given** a dispatcher moves a round to a different driver, **When** the change is saved, **Then**
   the new driver sees it and the previous driver no longer does.
4. **Given** a dispatcher has locked an assignment, **When** the next planning pass runs, **Then**
   the locked assignment is left exactly as the dispatcher set it.
5. **Given** a dispatcher reorders the stops in a round, **When** the driver next looks, **Then**
   they see the dispatcher's order.
6. **Given** a dispatcher takes work back from a driver, **When** the work is unassigned, **Then** it
   becomes available to be planned again rather than disappearing.

---

### Edge Cases

- **No driver is eligible for some or all of the work.** The packages must be visibly unassigned with
  a stated reason, never silently dropped and never assigned to somebody who cannot legally or
  practically do it.
- **More work exists than the on-duty drivers can carry.** The overflow must be visible as overflow.
- **A driver goes off duty holding planned work.** The work must return to the pool and be visible,
  not vanish with the session. Work they have physically collected is a different case and must not
  be silently taken from them while it is in their vehicle.
- **A package becomes ready after its wave has already been planned** — settled by FR-004a: it joins
  the round if that shop's stop is still outstanding, otherwise it waits.
- **A package is added to a round the driver has already started**, and the driver is part-way through
  a shop's pick-up.
- **A shop marks a package ready and then cannot supply it after all**, after the round is planned.
- **Two planning passes run close together.** The same package must not end up in two rounds, and a
  driver must not be told two different things.
- **A collection run's time passes with work still uncollected.**
- **The day has no collection runs configured**, or none remaining today.
- **A driver is cleared for every area** — they must be eligible everywhere, including areas created
  after their clearance was granted.
- **A package's destination area has no cleared delivery driver at all**, so it can be collected but
  never delivered. This must be visible before the collection round runs, not discovered at the hub.
- **A dispatcher assigns work to a driver who is not eligible for it.** Whether this is refused or
  permitted-with-warning must be deliberate.
- **Daylight saving.** A collection run's wall-clock time and any deadline derived from it must remain
  correct on the days the clocks change.

## Requirements *(mandatory)*

### Functional Requirements

**Planning the wave**

- **FR-001**: The platform MUST plan work in waves tied to the configured collection schedule, rather
  than continuously scavenging for unassigned work.
- **FR-002**: The platform MUST plan each wave ahead of its collection run, early enough that an
  assigned driver can complete the round before the run time.
- **FR-003**: The platform MUST include in a wave every package that shops have made ready and that
  is not already part of a round.
- **FR-004**: The platform MUST NOT create work for packages that are not yet ready.
- **FR-004a**: Where a package becomes ready after its wave has been planned, the platform MUST add
  it to the existing collection round if that round's driver has not yet completed the stop at its
  shop. Where the stop is already complete, the package MUST wait for the next wave.
- **FR-004b**: Where a round changes after the driver has begun it, the driver MUST be shown that it
  changed and what was added. A round MUST NOT grow silently underneath somebody working it.
- **FR-004c**: A package MUST NOT be added to a round that would then exceed the vehicle's carrying
  capacity, or that could no longer be completed before its deadline. In that case it waits for the
  next wave, visibly.
- **FR-005**: Planning MUST be repeatable: running a planning pass twice MUST NOT duplicate work,
  assign one package to two drivers, or disturb work already in progress.
- **FR-006**: The platform MUST record, for each wave, when it ran and what it decided.

**Deciding who gets the work**

- **FR-007**: The platform MUST decide assignment on the server. No client may choose its own work.
- **FR-008**: Assignment MUST be push: work appears for the driver. There MUST be no offer, no
  accept, and no decline.
- **FR-009**: A driver MUST be eligible for a piece of work only if ALL of the following hold — they
  are employed and not stood down; they are on duty; they are cleared for that function, that
  method and that area; their licence is valid; and they hold a vehicle.
- **FR-010**: Eligibility conditions MUST be filters, not scores. A driver who fails any one of them
  MUST NOT be assigned the work under any circumstances, however favourably they compare otherwise.
- **FR-011**: Where the goods require refrigeration, only a driver holding a vehicle with that
  capability MUST be eligible.
- **FR-012**: The platform MUST NOT assign a round whose weight exceeds the carrying capacity of the
  driver's held vehicle.
- **FR-013**: The platform MUST NOT assign a round that cannot be completed before its deadline, or
  before the driver's expected finish time where they have given one.
- **FR-014**: Where more than one driver is eligible, the platform MUST assign the work to the
  eligible driver who has been given the least work so far that day, measured in packages. Where that
  is still a tie, the choice MUST be resolved by a stable rule so that the same inputs always produce
  the same result.
- **FR-014a**: The balancing rule MUST be stated in terms a driver could be told. A driver who asks
  why they were given a round MUST be answerable without reference to a score, a weight or a formula.
- **FR-014b**: The platform MUST NOT rank eligible drivers by any measure of distance, location or
  travel time, including any proxy for them.
- **FR-015**: Where no driver is eligible for a piece of work, the platform MUST leave it unassigned
  and record the reason, naming the condition that excluded the candidates.
- **FR-016**: The platform MUST NOT use any driver's location, or any distance or travel-time
  calculation, in any part of this decision.

**Ordering the work**

- **FR-017**: Every task list given to a driver MUST be ordered so that what to do next is first.
- **FR-018**: The order MUST be determined by, in precedence: what is actionable now versus already
  done; the time constraint that applies; the area; and the originating shop.
- **FR-019**: Packages from the same shop MUST appear together in a collection round; stops in the
  same area MUST appear together in a delivery round.
- **FR-020**: The order MUST be reproducible and explainable without reference to any map, coordinate
  or route calculation.

**Collection, hub and delivery**

- **FR-021**: A collection round MUST name each shop to visit and what is to be collected there,
  including the shop's address.
- **FR-022**: The platform MUST provide a hub check-in that records the arrival of collected packages,
  with the time and the driver.
- **FR-023**: Hub check-in MUST show which packages are same-day and which are standard, taken from
  the method already chosen at checkout. The driver MUST NOT be asked to classify anything.
- **FR-024**: A standard package's driver-side work MUST end at hub check-in. It MUST NOT be placed
  in any delivery round.
- **FR-025**: The platform MUST group same-day packages that have arrived at the hub into delivery
  rounds for drivers cleared to deliver in their destination areas.
- **FR-026**: Where a package on a round is not collected, the platform MUST record the discrepancy
  rather than treating the package as collected.

**Supervision and override**

- **FR-027**: Back-office MUST be able to see the day's planned work: every round, who holds it, and
  its state.
- **FR-028**: Back-office MUST be able to see all work that could not be assigned, together with the
  reason.
- **FR-029**: Back-office MUST be able to move a round or an individual piece of work from one driver
  to another.
- **FR-030**: Back-office MUST be able to take work back from a driver, returning it to be planned
  again.
- **FR-031**: Back-office MUST be able to change the order of stops within a round.
- **FR-032**: Back-office MUST be able to mark an assignment as decided by a person, and a subsequent
  planning pass MUST leave such an assignment unchanged.
- **FR-033**: The platform MUST record who made each manual change and when.
- **FR-034**: Where a dispatcher directs work to a driver who does not meet the eligibility
  conditions, the platform MUST refuse and name the condition. A person may override a preference;
  they may not override a driver being unlicensed, stood down, or without a suitable vehicle.
- **FR-035**: Work assigned to a driver who then goes off duty MUST return to the pool and be visible,
  except for work they have physically collected, which MUST remain attributed to them and be shown
  as held.

**Driver-facing**

- **FR-036**: A driver MUST be able to see their current work without choosing or searching for it.
- **FR-037**: A driver MUST see changes made by a dispatcher.
- **FR-038**: A driver MUST NOT be shown work assigned to anyone else.

### Key Entities

- **Wave**: One planning pass tied to a point in the collection schedule. Records when it ran, what
  it considered, and what it decided.
- **Round**: A body of work given to one driver in one go — either a collection round (a set of shops
  to visit) or a delivery round (a set of customer stops). Has a state and an order.
- **Task / Stop**: One unit of work within a round — collect from this shop, or deliver to this
  destination. Carries its own state and its position in the round's order.
- **Assignment**: The link between a round and the driver who holds it, including whether a person
  set it and must not have it overwritten.
- **Hub check-in**: The record that collected packages arrived at the hub, and when, and with whom.
- **Exclusion reason**: Why a given driver was not eligible for a given piece of work — the thing that
  makes an unassigned package explainable instead of mysterious.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A package a shop marks ready before the day's cutoff is included in that day's
  collection round, with no human action in between.
- **SC-002**: A driver coming on duty during a planned wave can see what to do next without making
  any choice about what to work on.
- **SC-003**: Every package the platform cannot assign is visible to back-office with a stated reason,
  within the same wave in which it could not be assigned. No package is ever silently unhandled.
- **SC-004**: Running the planning pass twice in succession produces no duplicated work, no package in
  two rounds, and no change to work already under way.
- **SC-005**: A driver is never given work they are not cleared for, not licensed for, or cannot carry
  — verified by attempting each case, including by a dispatcher acting deliberately.
- **SC-006**: An assignment a dispatcher has locked survives every subsequent planning pass unchanged.
- **SC-007**: The order of a driver's task list can be explained from the stated rule alone, and the
  same set of work always produces the same order.
- **SC-007a**: Given two eligible drivers carrying different amounts of work, the next package goes to
  the one carrying less — demonstrable by running the case.
- **SC-013**: A package made ready while its collection round is under way, at a shop the driver has
  not yet reached, is collected on that same round rather than waiting for the next one — and the
  driver is shown that it was added.
- **SC-008**: A dispatcher can find, and act on, everything needing attention for the day without
  reading through work that is proceeding normally.
- **SC-009**: A package sold as same-day, made ready before the cutoff, reaches a delivery round the
  same day.
- **SC-010**: Standard packages leave the driver-side process at hub check-in, and appear in no
  delivery round.
- **SC-011**: A collection run's deadline is computed correctly on the days daylight saving starts and
  ends.
- **SC-012**: No stored data and no decision in this feature refers to any driver's location.

## Assumptions

- **One hub.** All collected packages converge on a single location, and all same-day deliveries
  depart from it. Multi-hub is explicitly out of scope.
- **Fewer than ten drivers, one metropolitan area.** The engine is sized for this; the correctness
  rules are what matter, not throughput.
- **All drivers are Effy employees on shift.** This is what makes push assignment correct and removes
  any need for consent, offer or decline.
- **A driver holds at most one vehicle at a time**, and that is already how the fleet records it.
- **Carrying capacity is judged by weight**, since package weight is derivable from what is in it.
  Volume and crate counts are recorded against vehicles but cannot be checked against packages,
  because the catalogue does not describe product volume. This is a stated limitation, not an
  oversight.
- **Shops have addresses; nothing has coordinates.** A driver is told where to go and hands off to
  their device's own maps application. No distance is computed anywhere.
- **The collection schedule already exists** and is the same schedule that decides, at checkout,
  whether a shopper may choose same-day. This feature reads it in the opposite direction.
- **Whether a package is same-day or standard was decided at checkout** and is never decided, changed
  or inferred here.
- **Proof of delivery, custody signatures, photographs and scan reconciliation are out of scope.** A
  later slice wires the driver app's existing screens and the proof mechanisms.
- **The driver app's screens already exist.** This feature supplies what they display; it does not
  design new ones.
- **Times are judged in the platform's operating timezone**, as the collection schedule already is.
- **Load is balanced by package count, not by value, weight or effort** (FR-014). Package count is the
  measure a driver and a dispatcher can both see and verify; anything richer would be a score nobody
  could check. Revisit only if rounds prove visibly uneven in practice.

## Out of Scope

- Proof of delivery and custody events (next slice).
- Multi-hub operation.
- Driver rosters and shift scheduling — a driver clocks on ad hoc.
- Offer / accept / decline mechanics.
- Any route optimisation, distance matrix, or geographic calculation.
- Any capture or use of driver location.
- Re-attempt scheduling for failed deliveries, and customer notification of driver progress.

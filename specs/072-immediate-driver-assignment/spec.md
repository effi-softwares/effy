# Feature Specification: Immediate Driver Work Assignment

**Feature Branch**: `072-immediate-driver-assignment`

**Created**: 2026-10-07

**Status**: Draft

**Input**: User description: "Immediate Driver Work Assignment — assign work to drivers as soon as it is eligible, instead of waiting for a planning window, and let drivers see it early with actions locked until the start time."

## Why This Exists

The platform already decides which driver does which work (063) and already respects the delivery
window a customer was sold (069). What it does badly is **timing**.

It looks for work every few minutes, but it only *gives* a package to a driver inside a short period
just before a collection run, or just before a delivery window opens. Outside that period a package a
shop finished hours ago sits with nobody's name on it. The driver's app shows nothing. The dispatcher
cannot see who will carry what until shortly before it has to happen. A driver learns the shape of
their run less than an hour before it must be finished.

Operating the app showed this plainly: work that could have been given to a driver was being held
back, for no reason a driver or an operator could see.

This feature removes the waiting. **Work is given to a driver the moment a driver can take it.** The
driver sees it straight away, and what stops them acting too early is no longer that the work is
hidden — it is that the work is visibly not yet open.

The operator's direction for every trade-off in this feature was the same: **simpler is better.**

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Work is given to a driver as soon as a driver can take it (Priority: P1)

A shop marks a package ready in the morning. A cleared driver is on duty. On the platform's next
regular check, that package is given to that driver — hours before the collection run, not minutes.
The same holds at the hub: a same-day package that has been checked in is given to a delivery driver
on the next check, whenever its delivery window is.

Nothing about *who may* take the work changes. Every existing condition still has to hold, and the
choice between drivers who all qualify is made the same way it is today.

**Why this priority**: This is the feature. Everything else here exists to make early assignment safe
(story 2) or tidy (story 3).

**Independent Test**: With a collection run configured for the afternoon, a cleared driver on duty and
a shop marking a package ready in the morning, confirm the package is assigned to that driver within
one regular check, and that the dispatcher's view shows it against that driver.

**Acceptance Scenarios**:

1. **Given** a cleared, on-duty driver and a collection run several hours away, **When** a shop marks
   a package ready, **Then** the package is assigned to that driver on the next regular check.
2. **Given** a same-day package has been checked in at the hub and its delivery window opens several
   hours later, **When** the next regular check runs, **Then** the package is assigned to a driver
   cleared to deliver it.
3. **Given** no driver currently meets every condition for a package, **When** the check runs,
   **Then** the package stays unassigned with its reason shown, and it is assigned on a later check as
   soon as a driver does qualify.
4. **Given** one driver is on duty in the morning and a second comes on duty at midday, **When** the
   second driver comes on duty, **Then** work already given to the first driver stays with the first
   driver, and the second receives only work that becomes assignable from then on.
5. **Given** two qualifying drivers who have been given different amounts of work today, **When** a
   new package becomes assignable, **Then** it goes to the one given less, exactly as today.
6. **Given** a shop marks a package ready after the day's last collection run has passed, **When** the
   next check runs, **Then** it is assigned to a driver for the next run, and is shown with that run's
   day and time.

---

### User Story 2 - A driver sees their work early and cannot start it early (Priority: P2)

A driver opens their app in the morning and sees the afternoon's collection round: which shops, what
to collect, and when it opens. They can read all of it. They cannot act on any of it. The app says
when it opens; at that time the actions become available.

This is what makes story 1 safe. Without it, giving a driver a 5–7 pm delivery at 2 pm invites them to
go and knock on a door three hours early.

**Why this priority**: Early assignment without an opening time causes real harm — early deliveries to
empty homes, and collections from shops still packing. It follows story 1 only because there is
nothing to hold closed until work is assigned early.

**Independent Test**: Assign a round whose opening time is in the future, confirm the driver can see
it in full but every progressing action is refused and names the opening time; then confirm the same
actions succeed once the opening time has passed.

**Acceptance Scenarios**:

1. **Given** a round whose opening time has not arrived, **When** the driver opens their app,
   **Then** they see the round, its stops, its packages and the time it opens.
2. **Given** a round whose opening time has not arrived, **When** the driver attempts any action that
   progresses it, **Then** the action is unavailable and the driver is told when it opens.
3. **Given** a round whose opening time has not arrived, **When** an action that progresses it is
   attempted by any means other than the app's own controls, **Then** the platform refuses it.
4. **Given** a round's opening time arrives while the driver has the app open, **When** that time
   passes, **Then** the actions become available without the driver having to do anything.
5. **Given** a same-day delivery whose order carries no delivery window, **When** it is assigned,
   **Then** it is open immediately.
6. **Given** a driver holds one open round and one not yet open, **When** they look at what to do
   next, **Then** the open round is what they are shown first.

---

### User Story 3 - A driver has one round per run, not a new one every few minutes (Priority: P3)

Because work is now given out as it appears, packages for the same collection run arrive across the
whole morning. They accumulate in **one** round for that driver and that run. The driver sees a round
that grows, not a list of fragments.

**Why this priority**: Without this, story 1 turns every regular check into a new round, and a driver
could be holding a dozen rounds for one afternoon run. It is what keeps early assignment usable.

**Independent Test**: With one driver on duty, have three shops mark packages ready at three different
times ahead of the same collection run, and confirm the driver holds a single round containing all of
them.

**Acceptance Scenarios**:

1. **Given** a driver already holds a not-yet-finished collection round for a run, **When** another
   package for that run is assigned to them, **Then** it is added to that round rather than starting a
   new one.
2. **Given** a driver already holds a not-yet-finished delivery round for a delivery window, **When**
   another package for that window is assigned to them, **Then** it is added to that round.
3. **Given** a round the driver has already begun, **When** a package is added, **Then** the existing
   rules for a round in progress apply: it joins only where that stop is still outstanding and the
   round still fits, and the driver is shown what was added.
4. **Given** a round a dispatcher has marked as their own decision, **When** new work becomes
   assignable, **Then** that round is left exactly as it is and the new work is placed elsewhere.
5. **Given** a round that has not opened yet, **When** packages are added to it, **Then** the driver
   sees the current contents whenever they look, without a notice for each addition.

---

### User Story 4 - Back-office sees the day take shape (Priority: P4)

A dispatcher opening the day's view in the morning sees rounds already forming — who holds which, when
each opens — and sees, in one place, every package nobody can currently take and why. That list stays
current: a package appears on it once, with today's reason, however many times the platform has
tried.

**Why this priority**: The override tools already exist and are unchanged. This story is only that the
view they act on is now populated early and stays readable.

**Independent Test**: Leave one package unassignable for an hour of regular checks, and confirm the
dispatcher sees it once, with its current reason, rather than once per check.

**Acceptance Scenarios**:

1. **Given** work was assigned early, **When** a dispatcher opens the day's view, **Then** each round
   shows who holds it, whether it has opened, and when it opens.
2. **Given** a package nobody can take, **When** the platform has tried many times, **Then** the
   dispatcher sees it once with the reason that applies now.
3. **Given** the reason a package cannot be assigned changes, **When** the dispatcher next looks,
   **Then** they see the new reason and not the old one.
4. **Given** a dispatcher moves, takes back, reorders or locks a round that has not opened, **When**
   they save, **Then** it behaves exactly as it does for an open round.

---

### Edge Cases

- **A driver given early work goes off duty before it opens.** Nothing has been collected, so the
  existing rule applies: the work returns to be assigned again, and goes to whoever qualifies on the
  next check.
- **A driver's stated finish time is before a round opens.** They cannot complete it and must not be
  given it.
- **Work for tomorrow's run is assigned to a driver on duty tonight.** It is theirs until they go off
  duty, at which point it returns as above. Nobody is left holding tomorrow's work overnight while off
  duty.
- **A package becomes ready minutes before its run.** It belongs to that run while the run's time has
  not passed. If no driver can fit it in, it stays unassigned with that reason and belongs to the next
  run once this one has passed.
- **A collection run's time is changed, or a run is removed, after rounds have formed for it.** The
  rounds must follow the schedule as it now stands; a driver must not be shown an opening time or a
  deadline that no longer exists.
- **The opening lead is changed after rounds have formed.** Opening times follow the new value.
- **The first driver on duty is given more than a fair share.** Accepted. It is visible to the
  dispatcher, who can move work by hand.
- **A round's vehicle becomes too full for further packages.** Further packages go to another
  qualifying driver, or stay unassigned with that reason.
- **A driver has finished and checked in a collection round, and more work appears for the same run.**
  A further round for that run is created only if it can still be completed before the run's time.
- **A delivery window has already ended when its package reaches the hub.** Unchanged: it is still
  delivered today and recorded as late.
- **Two checks run close together.** Unchanged: a package is never in two rounds.
- **Daylight saving.** Opening times are derived from the same schedule as deadlines and must be
  correct on the days the clocks change.

## Requirements *(mandatory)*

### Functional Requirements

**Assigning immediately**

- **FR-001**: On every regular check, the platform MUST assign each package that is ready to be
  carried and not already in a round to a qualifying driver, regardless of how far away its collection
  run or delivery window is.
- **FR-002**: This MUST apply both to collection (a shop has marked the package ready) and to same-day
  delivery (the package has been checked in at the hub).
- **FR-003**: The conditions a driver must meet to be given work MUST remain exactly those already in
  force, and MUST remain filters: a driver who fails any one is not given the work.
- **FR-004**: The rule for choosing between qualifying drivers MUST remain exactly the one already in
  force: least work given so far today, with a stable rule for ties.
- **FR-005**: Whether a driver can complete a round in time MUST be judged from when the round opens,
  or from now if it has already opened — never from a moment before the round can be started.
- **FR-006**: A driver whose stated finish time falls before a round opens, or before it could be
  completed, MUST NOT be given it.
- **FR-007**: A package no driver qualifies for MUST remain unassigned and MUST be reconsidered on
  every regular check.
- **FR-008**: The platform MUST NOT use any driver's location, or any distance or travel-time
  calculation, anywhere in this feature.

**No rebalancing**

- **FR-009**: Once assigned, work MUST stay with its driver. The platform MUST NOT move assigned work
  to another driver in order to even out loads, including when another driver comes on duty.
- **FR-010**: The existing dispatcher overrides — move, take back, reorder, lock — MUST remain the only
  way assigned work changes hands while its driver is on duty.

**Which run a package belongs to**

- **FR-011**: A package to be collected MUST belong to the next collection run whose time has not yet
  passed, and take that run's deadline and opening time.
- **FR-012**: Where the day's last run has passed, the package MUST belong to the next run on a later
  day, and MUST be shown to the driver and the dispatcher with that day and time.
- **FR-013**: A same-day package to be delivered MUST belong to the delivery window its customer was
  sold. A package with no delivery window belongs to the day, as it does now.
- **FR-014**: Where the collection schedule changes after rounds have formed, the deadline and opening
  time of rounds not yet begun MUST follow the schedule as it now stands.

**One round per driver per run**

- **FR-015**: The platform MUST NOT give a driver a second round for a collection run or a delivery
  window while they hold one for it that they have not yet begun. (A further round alongside one
  already under way is permitted, as is a second round that a dispatcher's own move produces.)
- **FR-016**: Newly assigned work MUST be added to the driver's existing not-yet-begun round for that
  run or window where one exists.
- **FR-017**: Adding to a round that has not been begun MUST respect the vehicle's carrying capacity
  and the round's deadline.
- **FR-018**: Adding to a round the driver has begun MUST follow the rules already in force for a round
  in progress, including telling the driver what was added.
- **FR-019**: A round a dispatcher has locked MUST NOT be added to or otherwise altered by the
  platform.

**Seeing early, starting on time**

- **FR-020**: A driver MUST be able to see every round assigned to them as soon as it is assigned,
  including its stops, its packages, and when it opens.
- **FR-021**: A collection round MUST open at its run's time less the configured lead. The run's time
  remains the deadline for completing the collection.
- **FR-022**: A same-day delivery round MUST open at its delivery window's start less the same
  configured lead. A delivery round with no window MUST be open as soon as it is assigned.
- **FR-023**: Until a round opens, no action that progresses it — starting it, arriving at a stop,
  collecting, checking in at the hub, delivering — may succeed.
- **FR-024**: The platform itself MUST refuse those actions before the opening time. Hiding or
  disabling a control in the app MUST NOT be the only thing preventing them.
- **FR-025**: Wherever an action is unavailable because a round has not opened, the driver MUST be
  told when it opens.
- **FR-026**: When a round's opening time arrives, its actions MUST become available to a driver who
  already has the app open, without their intervention.
- **FR-027**: Where a driver holds both open and not-yet-open work, what they are shown to do next MUST
  be open work.

**Back-office**

- **FR-028**: The day's view MUST show, for each round, whether it has opened and when it opens.
- **FR-029**: A package that cannot be assigned MUST appear to back-office once, with the reason or
  reasons that apply now. Repeated attempts MUST NOT accumulate repeated entries.
- **FR-030**: The platform MUST keep a record of when each package was assigned and to whom.
- **FR-031**: Every dispatcher override MUST work on a round that has not opened exactly as it does on
  one that has, including refusing a driver who does not qualify.

**Unchanged**

- **FR-032**: A standard package's driver-side work MUST still end at hub check-in.
- **FR-033**: A package MUST never be in two rounds at once.
- **FR-034**: Work assigned to a driver who goes off duty before collecting it MUST return to be
  assigned again; work they have physically collected MUST remain theirs.
- **FR-035**: A driver's app MUST be told when their work changes, by the means already in place, and
  MUST NOT check on a timer.

### Key Entities

- **Round**: A body of work held by one driver — now tied to one collection run or one delivery window,
  and able to grow until it is finished. Gains an **opening time** alongside its existing deadline.
- **Opening time**: The moment a round's actions become available. Derived from the collection run or
  the delivery window and the configured lead; never chosen by a driver.
- **Collection run**: The scheduled time by which collection must be complete. Unchanged; now also what
  a collection round is grouped by.
- **Delivery window**: The time span a same-day customer was sold. Unchanged; now also what a delivery
  round is grouped by.
- **Unassigned package**: A package no driver currently qualifies for, with its current reasons — one
  standing fact per package, not a history of attempts.
- **Assignment record**: When a package was given to a driver, and to whom.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A package marked ready while a qualifying driver is on duty is assigned within one
  regular check — at most five minutes — however far away its collection run is.
- **SC-002**: A same-day package checked in at the hub while a qualifying driver is on duty is assigned
  within one regular check, however far away its delivery window is.
- **SC-003**: A driver can see an afternoon collection round from the moment the first package for it
  is ready, rather than from under an hour before it is due.
- **SC-004**: No action progressing a round succeeds before the round's opening time, by any route —
  verified by attempting each action directly against the platform.
- **SC-005**: Across a full day, a driver never holds two not-yet-begun rounds for the same collection
  run or delivery window unless a dispatcher put them there.
- **SC-006**: Work assigned to one driver is never found with another driver unless a dispatcher moved
  it or the first driver went off duty before collecting it.
- **SC-007**: A package left unassignable for a whole day appears to back-office exactly once, showing
  its current reason.
- **SC-008**: Every existing condition on who may be given work still holds for work assigned early —
  verified by repeating each existing refusal case against a round that has not opened.
- **SC-009**: A package made ready after the day's last collection run is assigned the same day, and
  both driver and dispatcher can see which day and time it is for.
- **SC-010**: Opening times and deadlines are correct on the days daylight saving starts and ends.
- **SC-011**: No screen checks for changes on a timer; a driver's view of a round changes when the
  round does.

## Assumptions

- **First come, first served is accepted.** A driver on duty early is given more than one who comes on
  duty late. The operator chose this over rebalancing because it is simpler and because the dispatcher
  can already move work by hand.
- **The lead that sets a round's opening time is the lead already configured** for deciding when to
  begin planning. It keeps its current value and its current place in settings; this feature changes
  what it means — from "when planning starts" to "when the work opens".
- **The regular check keeps its current frequency** (every few minutes).
- **A dispatcher cannot open a round early.** If a round must be worked before its opening time, the
  schedule or the lead is what changes. Revisit only if it proves necessary in practice.
- **One shop's packages may still be divided between two drivers** when both qualify, as today. Keeping
  a shop's work with one driver is a separate question and out of scope.
- **A driver need not be told about each addition to a round they have not begun.** The round simply
  shows what it now contains. The existing notice applies once the round is under way.
- **This replaces two earlier decisions**: 063's requirement that work be planned in waves tied to the
  collection schedule rather than continuously, and 069's rule that a delivery window's packages wait
  at the hub unassigned until shortly before the window. Both documents should be marked as superseded
  on those points.
- **Returning an off-duty driver's uncollected work (FR-034) is required here, not merely inherited.**
  063 required it and planning found it is not in force today. Early assignment makes it essential:
  without it, work given out in the evening would stay with a driver who has gone home.
- **Everything else about assignment is inherited unchanged**: the qualifying conditions, the balancing
  rule, the ordering of stops, hub check-in, proof, custody, and the dispatcher's overrides.
- **One hub, fewer than ten drivers, one metropolitan area**, as before.

## Out of Scope

- Rebalancing or re-optimising work that has been assigned.
- Any use of location, distance or routing.
- Changing who qualifies for work, how ties are broken, or how stops are ordered.
- Keeping all of one shop's packages with a single driver.
- Letting a dispatcher or a driver open a round ahead of its time.
- Driver rosters or shift scheduling; offer, accept or decline.
- Multi-hub operation.

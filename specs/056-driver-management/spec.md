# Feature Specification: Back-Office Driver Management

**Feature Branch**: `056-driver-management`

**Created**: 2026-08-30

**Status**: Draft

**Input**: User description: "before we continue with the order flow fixes, i think we should add driver manangment feature to back office. since driver are added by back office admins we need to have full driver profile manangement feature for back office. so do a deep dive and research and identify all the features we need for driver managment. then you can implement it full"

## Why this feature exists

Effy's drivers are **employees**. They cannot sign themselves up, cannot edit their own record, and
cannot be paid, rostered, disciplined or stood down by any surface that exists today. Everything about a
driver's working life is decided in back-office — and back-office has **no driver screen at all**.

Feature 049 built the driver app and, alongside it, a deliberately **minimal provisioning adjunct**: five
routes (list, read, create, update, set-status) with no console, no search, no history, and no view of any
work a driver has ever done. Its own specification recorded the debt in plain words: *"a full
driver-management console is out of scope for this slice unless folded in during planning."* This is that
slice.

Three consequences of the gap are already live:

1. **The driver app records exceptions for a reader who does not exist.** Every reported missing or short
   package at a shop, and every undeliverable drop with its reason and note, is written to the platform
   annotated "recorded for back-office follow-up". No surface anywhere reads either record. The
   order-flow gap register now names failed-delivery visibility the **top remaining structural gap** —
   a shopper whose delivery failed keeps seeing "on the way", indefinitely, and nobody at Effy is told.
2. **Standing a driver down can strand physical goods.** Work a driver has not started is automatically
   returned to the pool when they go off duty or are disabled. Work they have **already picked up** — the
   packages in their van, a drop they are part-way through — is deliberately never yanked, and there is no
   screen on which any human can see that it is stuck, nor any control to release it.
3. **Provisioning silently overwrites.** Creating a "new" driver with a work email that already belongs to
   someone re-uses that person's record and identity account instead of refusing, and re-enables an
   account that had been deliberately stood down.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The driver register and the profile of record (Priority: P1)

A back-office operator opens **Drivers**, sees every driver Effy employs, finds the one they want by
name, work email, zone or status, and opens a profile that answers every question the business actually
asks about that person: who they are, how to reach them, where they work, what they drive, whether they
are currently employed, and who changed any of that and when.

**Why this priority**: It is the explicit request, and it is the front door — every other story in this
feature is reached by first finding a driver. Today the closest thing that exists is an unpaginated,
unsearchable list of five fields returned by an API with no screen attached to it.

**Independent Test**: Provision several drivers, then find one by partial name, by email and by zone;
open the profile; confirm every recorded fact about that person is on the page and nothing about them
lives only in a database somebody must query by hand.

**Acceptance Scenarios**:

1. **Given** an operator signed in to back-office, **When** they open Drivers, **Then** they see a
   register of drivers with name, work email, zone, duty state and employment status, ordered
   predictably and paged so the screen stays usable as the fleet grows.
2. **Given** a register of many drivers, **When** the operator types part of a name or work email,
   **Then** only matching drivers remain, and the filter can be combined with status and zone.
3. **Given** a driver in the register, **When** the operator opens them, **Then** they see the full
   profile: identity and contact details, work assignment (zone and hub), vehicle, employment status and
   start date, administrative notes, and the account's sign-in state.
4. **Given** an operator viewing a profile, **When** they edit a field and save, **Then** the change takes
   effect immediately, is confirmed on screen, and is attributable to them afterwards.
5. **Given** a driver with a zone assigned, **When** the operator **clears** the zone and saves, **Then**
   the zone is actually removed — a field that can be set can be unset.
6. **Given** an operator without permission to change driver records, **When** they open a profile,
   **Then** they can read it in full and every editing control is absent, not merely disabled-looking.

---

### User Story 2 - Onboarding and offboarding a driver (Priority: P1)

An operator hires a driver: they create the record, the person receives a working sign-in for the driver
app, and they appear as available for work. Later that person leaves, or is stood down for a week, and the
operator ends their access — safely, knowing exactly what happens to any work the driver is holding.

**Why this priority**: A driver record **is a credential**. The ability to revoke it promptly, and to know
that revocation actually took effect, is the security half of the feature; the ability to add one is the
half without which no driver exists at all. Both are currently reachable only by calling an API by hand.

**Independent Test**: Create a driver, confirm they can sign in to the driver app; suspend them, confirm
they cannot; restore them, confirm they can again; offboard them, confirm the record is retained for audit
while access is gone.

**Acceptance Scenarios**:

1. **Given** an operator with management permission, **When** they submit a new driver's name and work
   email, **Then** a driver record and a working sign-in are created together, and the driver appears in
   the register as active.
2. **Given** a work email that already belongs to another driver, **When** the operator tries to create a
   driver with it, **Then** the attempt is **refused** and names the existing driver — it never silently
   edits or re-activates them.
3. **Given** an active driver, **When** the operator suspends them, **Then** they can no longer obtain a
   working session in the driver app, they are excluded from receiving new work, and the register shows
   them as suspended with the reason and the date.
4. **Given** a suspended driver, **When** the operator restores them, **Then** access and eligibility for
   work both return.
5. **Given** a driver who has left, **When** the operator offboards them, **Then** access ends
   permanently, the record and all their work history are **retained** for audit, and they no longer
   appear in the default register view.
6. **Given** a driver who is holding work that has already been picked up, **When** the operator tries to
   suspend or offboard them, **Then** they are warned **before** confirming, told exactly what is held
   and which orders it belongs to, and — if they proceed — that work is surfaced as needing reassignment
   rather than disappearing.
7. **Given** any change to a driver's record, status, assignment or vehicle, **When** it is saved,
   **Then** who did it, what changed, and when is recorded and readable on the driver's profile.

---

### User Story 3 - Delivery exceptions and collection issues reach a person (Priority: P2)

An operator opens a driver's profile, or a fleet-wide exceptions view, and sees every undeliverable drop
and every missing or short package the drivers have reported — with the reason, the driver's note, the
order it belongs to, and whether anyone has dealt with it yet. From there they can jump straight to the
order and act on it.

**Why this priority**: This closes the order-flow register's **top structural gap**. The driver app has
been faithfully recording these exceptions since 049 and no surface has ever read them; after the standard
delivery lifecycle was completed, a failed same-day delivery is the last remaining way an order gets
permanently stuck. It is P2 only because it is reached through the register US1 builds — its platform
value is the highest in this feature, and it should be pulled forward if anything is cut.

**Independent Test**: Have a driver mark a drop undeliverable and report a short package at a shop; confirm
both appear in back-office within the same working session, carry the reason and note the driver gave, link
to the affected order, and can be marked as handled so they stop demanding attention.

**Acceptance Scenarios**:

1. **Given** a driver marked a drop undeliverable, **When** an operator opens the exceptions view,
   **Then** the failure appears with its reason, the driver's note, the driver's name, the order, the
   customer's delivery suburb, and when it happened.
2. **Given** a driver reported a missing or short package at a shop, **When** an operator opens the
   exceptions view, **Then** the report appears with the shop, the affected order and item where the
   driver identified one, the kind of problem, and the note.
3. **Given** an exception, **When** the operator opens it, **Then** they can reach the affected order in
   one step, so the money and communication tools built for that order are immediately at hand.
4. **Given** an exception that has been dealt with, **When** the operator marks it resolved with a note,
   **Then** it leaves the outstanding list, remains permanently readable in history, and records who
   resolved it.
5. **Given** outstanding exceptions exist, **When** an operator opens Drivers, **Then** the count of
   unresolved exceptions is visible without hunting for it.
6. **Given** a driver with a history of exceptions, **When** an operator opens their profile, **Then**
   the exceptions attributable to that driver are visible on it.

---

### User Story 4 - Who is working right now (Priority: P2)

An operator needs to answer, in seconds: who is on duty, what is each of them doing, is anything overdue,
and is any work sitting unassigned because nobody eligible is on duty.

**Why this priority**: Assignment is automatic and driverless by design — no dispatcher, no accept/decline.
That design is only safe if a human can *observe* what it decided. Today nobody can see whether a single
driver is on duty, and the only symptom of "nobody is working" is orders quietly not moving.

**Independent Test**: With one driver on duty running a collection round and one off duty, open the duty
view and confirm it distinguishes them, shows the on-duty driver's current run and its progress, and
reports any ready work that no driver has been given.

**Acceptance Scenarios**:

1. **Given** drivers on and off duty, **When** an operator opens the duty view, **Then** on-duty drivers
   are listed with how long they have been on duty and what they are currently doing.
2. **Given** an on-duty driver mid-run, **When** the operator views them, **Then** they see the run type,
   its progress (stops or drops done against the total), and the next stop.
3. **Given** work that is ready but unassigned, **When** the operator opens the duty view, **Then** the
   volume of unassigned work is shown, so "no driver is on duty" is visible as a cause rather than
   inferred from stalled orders.
4. **Given** a driver whose duty session has been left open far longer than a working shift, **When** the
   operator views the duty list, **Then** that session is flagged, and an operator with management
   permission can end it.
5. **Given** work that is stranded with an ineligible driver, **When** the operator views it, **Then**
   they can release it back to the pool so an eligible driver receives it on the next assignment round.

---

### User Story 5 - A driver's work record (Priority: P3)

An operator reviewing a driver — for a performance conversation, a customer complaint, or a payroll query
— opens their history and sees what that person actually did: which days they worked, which runs they ran,
how many stops and drops they completed, how many failed and why, and the proof captured for a disputed
delivery.

**Why this priority**: It is what makes the profile a *record of employment* rather than a contact card,
and it is the only way to answer a customer who says a delivery never arrived. It is P3 because the
exceptions view (US3) already surfaces the urgent subset, and this is the retrospective, non-blocking half.

**Independent Test**: For a driver who has completed a collection run and a delivery round, open their
history and confirm each run appears for the correct working day with its outcome, and that opening a
completed drop shows the proof the driver captured.

**Acceptance Scenarios**:

1. **Given** a driver with completed work, **When** an operator opens their history, **Then** runs are
   listed newest first by working day, each showing its type, outcome and volume of work completed.
2. **Given** a run in that history, **When** the operator opens it, **Then** they see its stops or drops
   in order with the times each state was reached.
3. **Given** a delivery that was completed with proof, **When** an operator opens that drop, **Then**
   they can see the proof that was captured — including any photograph or signature — and who captured it.
4. **Given** a driver's history, **When** an operator looks at a chosen period, **Then** they see summary
   counts for that period: days worked, runs completed, packages collected, drops delivered, drops failed.
5. **Given** proof media containing personal surroundings, **When** it is viewed, **Then** access is
   limited to permitted back-office staff and the fact of viewing is recorded.

---

### User Story 6 - Fleet coverage and readiness (Priority: P3)

An operator planning the day sees which delivery zones have drivers assigned to them and which do not, and
which drivers cannot be given work — because they have no zone, are suspended, or their licence has
expired — so gaps are found before orders start failing rather than afterwards.

**Why this priority**: It is preventative. A driver with no zone assigned is silently inert for assignment
today, and nothing anywhere says so. It is P3 because every individual fact it aggregates is already
visible in US1–US4.

**Independent Test**: Create a driver with no zone and a zone with no drivers; confirm both are reported as
gaps, with an explanation of the consequence, and that fixing them clears the report.

**Acceptance Scenarios**:

1. **Given** a driver with no delivery zone assigned, **When** an operator views the register or the
   readiness view, **Then** that driver is flagged as unable to receive work, with the reason stated.
2. **Given** a delivery zone with no active driver assigned, **When** an operator views the readiness
   view, **Then** the zone is reported as uncovered.
3. **Given** a driver whose recorded licence or vehicle registration expiry has passed or is imminent,
   **When** an operator views the register or readiness view, **Then** it is flagged with the date.
4. **Given** a gap that has been fixed, **When** the operator returns to the readiness view, **Then** the
   gap is gone without any further action.

---

### Edge Cases

- **A work email is re-used for a person who has left.** Creating a driver with the work email of an
  offboarded driver must be refused and must name the offboarded record, so the operator chooses
  deliberately between restoring that person and using a different address. It must never silently
  reactivate a stood-down account.
- **A driver is offboarded while packages are in their van.** The physical goods exist and the platform
  must not pretend otherwise: the held work is reported as stranded, attributed to the departed driver,
  and released or reassigned by an explicit human action.
- **A driver is offboarded mid-drop.** The customer is expecting a delivery that is no longer coming. The
  affected order must be identifiable from the stranded-work report so the order can be handled.
- **Two operators edit the same driver at once.** The second save must not silently discard the first
  operator's change without saying so.
- **A driver's sign-in account exists but their record does not, or the reverse.** The profile must show
  the discrepancy plainly rather than rendering a half-working driver as normal.
- **Suspension does not take effect instantly for work already assigned.** Access ends immediately, but
  work already in the driver's hands is only reclaimed by the next assignment round. The screen must not
  imply the driver has been fully cleared of work when they have not.
- **A driver is suspended, then work becomes ready in only their zone.** That work goes unassigned; the
  duty view must show it as unassigned rather than leaving it invisible.
- **An exception is reported against an order that is later cancelled or refunded.** The exception remains
  readable and is not silently deleted; its resolution note is where the connection is recorded.
- **A driver has no work history at all.** Every history and summary view must render a stated empty
  state, never a blank panel or a zero that looks like a failure.
- **The register is opened before any driver exists.** It must explain what a driver is and offer the
  create action, not present an empty table.
- **A driver's zone is deleted.** The driver must not vanish from the register or become unreadable; they
  are shown as having no zone and flagged as unable to receive work.
- **Proof media is missing or unreadable** for a delivery that claims to have it. The drop must say so
  rather than showing a broken placeholder.

## Requirements *(mandatory)*

### Functional Requirements

#### The register and search

- **FR-001**: Back-office MUST provide a Drivers area reachable from the console's primary navigation,
  visible to every back-office role.
- **FR-002**: The register MUST list drivers with, at minimum, name, work email, assigned zone, current
  duty state, and employment status.
- **FR-003**: The register MUST support text search across name and work email, and filtering by
  employment status and by assigned zone, combinable.
- **FR-004**: The register MUST be paged with a stable, repeatable ordering, so that paging through it can
  neither repeat nor skip a driver.
- **FR-005**: The register MUST default to hiding offboarded drivers, with an explicit control to include
  them.

#### The profile of record

- **FR-006**: A driver profile MUST present, in one place: identity (name, work email), contact details,
  work assignment (delivery zone, operating hub), vehicle (type, registration plate), employment status
  with its effective date, employment start date, administrative notes, and the state of their sign-in
  account.
- **FR-007**: The driver record MUST carry a contact phone number, an employment start date, an emergency
  contact name and number, and a free-text administrative note.
- **FR-008**: The driver record MUST carry driving-licence details sufficient to establish eligibility to
  drive: a licence reference and an expiry date; and a vehicle registration expiry date.
- **FR-009**: Operators with management permission MUST be able to edit every profile field except the
  work email, which is the identity key.
- **FR-010**: Any optional profile field that can be set MUST be able to be cleared, and clearing it MUST
  persist. (Today, assignment and vehicle fields cannot be unset once set.)
- **FR-011**: Editing MUST validate before saving and refuse invalid input with a message naming the
  field and the problem, never a generic failure.
- **FR-012**: Changing a driver's work email MUST NOT be offered as an edit; changing the address a driver
  signs in with MUST be a distinct, explicitly-confirmed operation, or not offered at all.

#### Onboarding, lifecycle and offboarding

- **FR-013**: Operators with management permission MUST be able to create a driver by supplying at minimum
  a name and a work email, which creates the platform record and a working driver sign-in as one
  operation; if either half fails the operator MUST be told which.
- **FR-014**: Creating a driver with a work email already held by any driver — active, suspended or
  offboarded — MUST be **refused**, and the refusal MUST identify the existing driver and their status.
- **FR-015**: A driver MUST have exactly one employment status at a time, from: **active** (employed and
  eligible for work), **suspended** (temporarily stood down; retained, no access, no work), and
  **offboarded** (no longer employed; retained for audit, permanently no access).
- **FR-016**: Changing employment status MUST require management permission, MUST capture a reason, and
  MUST take effect on both the platform record and the sign-in account so a stood-down driver cannot
  obtain a session by any route.
- **FR-017**: A suspended or offboarded driver MUST be excluded from receiving new work.
- **FR-018**: A suspended driver MUST be restorable to active, restoring both access and eligibility.
- **FR-019**: Offboarding MUST retain the driver record and their entire work history; it MUST NOT delete
  either.
- **FR-020**: Before suspending or offboarding a driver who is holding work that has already been picked
  up or is part-way through delivery, the system MUST warn the operator, itemise what is held and which
  orders it affects, and require explicit confirmation.
- **FR-021**: Work stranded with a suspended or offboarded driver MUST be reported to back-office and MUST
  be releasable back to the unassigned pool by an operator with management permission.

#### Authorization and accountability

- **FR-022**: Reading the driver register, profiles, duty view, exceptions and history MUST be available
  to any active back-office staff member, including customer-service staff — answering "where is my
  delivery" and "why did it fail" is their work.
- **FR-023**: Every change — create, edit, status change, duty-session termination, stranded-work release,
  exception resolution — MUST require management permission, and the decision MUST be made from the
  platform staff record rather than from a token claim alone.
- **FR-024**: Every such change MUST be recorded with the operator who made it, what changed, the target
  driver, and when — using the platform's existing back-office audit record. Driver changes are currently
  the only privileged back-office domain that writes no audit entry.
- **FR-025**: A driver's profile MUST show that change history, newest first, in plain language.
- **FR-026**: Controls an operator's role does not permit MUST NOT be shown to them; the backend MUST
  refuse the action independently, so a hidden control is never the only protection.

#### Exceptions and follow-up

- **FR-027**: Back-office MUST be able to read every undeliverable-drop record the driver app has created,
  with its reason, note, driver, order, delivery suburb and time.
- **FR-028**: Back-office MUST be able to read every missing-or-short package report the driver app has
  created, with its kind, note, driver, shop, and the affected order and item where one was identified.
- **FR-029**: Exceptions MUST be presentable both fleet-wide (an outstanding-work queue) and per driver.
- **FR-030**: Each exception MUST link to the affected order so an operator can act on it in one step.
- **FR-031**: An exception MUST be markable as resolved with a note, recording who resolved it and when;
  resolved exceptions MUST remain readable and MUST NOT be deleted.
- **FR-032**: The count of unresolved exceptions MUST be visible on entering the Drivers area.
- **FR-033**: A failed delivery MUST NOT be silently absorbed: an undelivered drop MUST remain visible as
  outstanding until an operator resolves it.

#### Duty and assignment visibility

- **FR-034**: Back-office MUST be able to see which drivers are currently on duty, since when, and what
  each is currently doing.
- **FR-035**: For an on-duty driver mid-run, back-office MUST be able to see the run type, its progress
  against its total, and the next stop.
- **FR-036**: Back-office MUST be able to see the volume of work that is ready but unassigned, so an
  absence of on-duty drivers is visible as a cause.
- **FR-037**: A duty session left open beyond a configurable threshold MUST be flagged, and an operator
  with management permission MUST be able to end it.
- **FR-038**: Back-office MUST NOT be able to assign a specific piece of work to a specific named driver;
  assignment remains automatic. Releasing work back to the pool is the sanctioned intervention.

#### Work history

- **FR-039**: A driver's completed runs MUST be listable by working day, newest first, each with its type,
  outcome and volume of work completed.
- **FR-040**: A run MUST be openable to show its stops or drops in order with the time each state was
  reached.
- **FR-041**: A completed delivery MUST show the proof that was captured, including any photograph or
  signature, and by whom.
- **FR-042**: Proof media MUST remain private: it MUST be accessible only to permitted back-office staff
  through time-limited access, never by a durable public address, and each access MUST be recorded.
- **FR-043**: A driver's record MUST show summary counts over a chosen period: days worked, runs
  completed, packages collected, drops delivered, and drops failed.

#### Readiness and coverage

- **FR-044**: A driver who cannot receive work MUST be flagged as such wherever they are listed, with the
  reason stated (no zone assigned, suspended, offboarded, or expired licence).
- **FR-045**: Back-office MUST be able to see which delivery zones have no active driver assigned.
- **FR-046**: A licence or vehicle-registration expiry that has passed, or falls within a configurable
  warning window, MUST be flagged wherever the driver is listed.

#### Presentation and platform rules

- **FR-047**: Every screen MUST follow the platform's monochrome design language, support light and dark
  appearance, and use tables, lists, sectioned pages and detail rows rather than card layouts or metric
  cards.
- **FR-048**: Every list and panel MUST have an explicit, worded empty state, a loading state, and an
  error state that says what failed and what to do.
- **FR-049**: No screen in this feature may display currency or order money amounts as a driver-facing
  fact; money belongs to the order screens the exceptions link to.
- **FR-050**: A driver's personal contact details and emergency contact MUST NOT appear in any log,
  analytics event, or telemetry payload.

### Key Entities

- **Driver**: A person Effy employs to move packages. Identity (name, work email), contact details,
  emergency contact, work assignment (delivery zone, operating hub), vehicle (type, plate, registration
  expiry), licence (reference, expiry), employment status and its effective date and reason, employment
  start date, administrative notes. The platform record — not the sign-in account — is authoritative for
  whether they may work.
- **Duty session**: A period a driver declared themselves on duty. Being on duty is what makes a driver
  eligible to receive work. At most one open session per driver.
- **Run**: A body of work assigned to one driver on one working day, of one type — a collection round
  (shops to hub) or a same-day delivery round (hub to customers) — with a status and a completion time.
- **Stop / drop**: A single unit of work within a run: a package to collect from a shop, or a customer
  delivery. Carries an ordered position, a status and the times it reached each state.
- **Delivery exception**: An undeliverable drop, carrying the reason the driver gave, their note, the
  order and the time; plus, for back-office, whether it has been resolved, by whom and with what note.
- **Collection issue**: A missing or short package reported at a shop, carrying its kind, note, shop, and
  the affected order and item where identified; plus the same resolution fields.
- **Proof of delivery**: The evidence captured when a drop completed — a photograph, a signature, a
  verified delivery code, or a contactless note — held privately and viewable only through time-limited
  access.
- **Stranded work**: Work still claimed by a driver who is no longer eligible to do it, which the
  automatic assignment round will not reclaim because it has already been physically picked up or started.
- **Driver change record**: Who changed what about which driver, and when — the accountability trail for
  every privileged action in this feature.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can find any driver in the fleet and open their complete profile in **under 15
  seconds**, starting from the console home, without knowing an identifier.
- **SC-002**: An operator can onboard a new driver — record created and the person able to sign in to the
  driver app — in **under 2 minutes**, with no step performed outside the console.
- **SC-003**: **100%** of undeliverable drops and missing/short package reports created by the driver app
  are visible in back-office; none require a database query to discover. Measured by comparing every
  exception recorded over a period against what the exceptions view lists.
- **SC-004**: A driver's access can be revoked and confirmed ineffective — they cannot obtain a working
  session — in **under 60 seconds** from the decision.
- **SC-005**: Attempting to create a driver with a work email already in use is refused **100%** of the
  time, and never modifies the existing driver's record, status or sign-in account.
- **SC-006**: When a driver holding picked-up work is stood down, that work is reported as stranded and
  attributable to a named driver and a named order in **100%** of cases, and is releasable without
  developer intervention.
- **SC-007**: **100%** of privileged driver actions produce a change record identifying the operator, the
  target and the change; a reviewer can reconstruct who changed a driver's status and when, without
  access to application logs.
- **SC-008**: An operator can answer "who is working right now and what are they doing" in **under 10
  seconds** and, when nobody is on duty while work is waiting, that situation is stated explicitly.
- **SC-009**: A driver with no delivery zone assigned is identified as unable to receive work **before**
  any order is affected — that is, on the register, not by an order failing to move.
- **SC-010**: Every optional profile field, once set, can be cleared and stays cleared after a reload —
  verified for **100%** of optional fields.
- **SC-011**: A back-office role without management permission cannot perform any driver mutation via any
  route, verified by attempting each mutation directly; each attempt is refused.
- **SC-012**: Proof media is never retrievable by an unauthenticated party, and every retrieval by a
  permitted operator is recorded — verified by attempting retrieval without a session and by inspecting
  the access record afterwards.
- **SC-013**: The register remains usable and pages correctly with **500** driver records, with no
  repeated or skipped row across the full paging sequence.
- **SC-014**: No driver contact detail or emergency contact appears in any log or telemetry payload,
  verified by a sweep over the output of a full exercise of the feature.
- **SC-015**: Every screen renders correctly in both light and dark appearance and contains no card-style
  container or metric card, verified by inspection.

## Assumptions

- **Drivers are employees, added only by back-office.** There is no driver self-signup and none is added
  here; the driver audience remains provisioned-only.
- **Assignment stays automatic.** Feature 049 settled that there is no dispatcher and no accept/decline.
  This feature makes assignment *observable* and adds the ability to *release* work back to the pool; it
  deliberately does **not** add the ability to hand a named job to a named driver, which would contradict
  that settled model. If manual dispatch is wanted it is its own decision and its own slice.
- **Shift rostering is out of scope.** Duty is driver-initiated — a driver declares themselves on duty
  from the app. Planning who is *scheduled* to work, publishing rosters, and comparing planned against
  actual hours are payroll/workforce concerns with no existing model on the platform, and are excluded.
- **Compliance is tracked as facts, not documents.** Licence and registration are recorded as a reference
  and an expiry date so they can be checked and warned about. **No document images or scans are stored** —
  that would create a new store of sensitive personal identity documents with its own retention and
  access-control obligations. If document capture is required later it is a separate decision.
- **Payroll, pay rates, hours worked for payment, and any monetary treatment of a driver are excluded.**
  The work-history summary counts activity; it is not a timesheet and must not be presented as one.
- **One operating hub.** The platform has a single configurable hub; per-driver hub assignment is
  displayed but multi-hub operation is not introduced here.
- **The existing driver, run, task, exception and proof records are reused.** This feature is
  overwhelmingly a **reading and governance** slice over data the driver app already writes; the record
  additions it makes are the profile fields the business needs and the resolution state for exceptions.
- **Employment status widens from two values to three.** Today a driver is active or disabled. Suspended
  (temporary) and offboarded (permanent) are separated, matching how shops already model lifecycle,
  because conflating "back next week" with "no longer employed" makes the register unusable for either.
- **The zone list already exists** and is reused for assignment; this feature does not create or manage
  delivery zones.
- **Driver-facing changes are out of scope.** The driver app is not modified: drivers do not edit their own
  profile here, and no new driver-app screen is introduced. Any driver-side reflection of these fields is a
  later slice.
- **The customer is not notified by this feature.** Making a failed delivery *visible to Effy* is this
  slice's job; deciding what the customer is told, and re-attempting delivery, is the failed-delivery
  handling slice that this one unblocks.

## Dependencies

- **Driver delivery app (049)** provides the driver record, duty sessions, runs, collection and delivery
  tasks, exceptions and proof of delivery that this feature reads and governs.
- **Back-office console foundation (005)** provides the console shell, session guard, staff record and the
  role model every authorization decision in this feature is made from.
- **Shop management (009)** provides the back-office audit record this feature writes to, and the
  three-state lifecycle pattern the driver employment status follows.
- **Delivery and shipping engine (047)** provides the delivery zones drivers are assigned to and the
  operating hub they work from.
- **Order console (053)** provides the order screens every exception links to; without it an exception
  would have nowhere to lead.
- **Driver identity pool** provides the sign-in accounts this feature creates, stands down and restores.

## Out of scope

- Manual dispatch: assigning a named job to a named driver.
- Shift rostering, published schedules, and planned-versus-actual hours.
- Payroll, pay rates, and any monetary treatment of drivers.
- Storage of licence or identity document images.
- Live driver location tracking or a fleet map. Location is a point-in-time snapshot used at assignment
  time only, and this feature does not begin streaming or displaying it.
- Customer notification and re-attempt scheduling for a failed delivery — unblocked by this feature,
  delivered by its own slice.
- Any change to the driver mobile app.
- Multi-hub operation.
- Driver self-service of any kind.

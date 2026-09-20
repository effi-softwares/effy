# Feature Specification: Driver Zone Capability & Coverage

**Feature Branch**: `062-driver-zone-capability`

**Created**: 2026-09-20

**Status**: Draft

**Input**: User description: "Driver Zone Capability & Coverage — who can do what work, where. Slice B of four rebuilding Effy's logistics capability."

**Research deliverable**: [docs/logistics-engine-architecture.md](../../docs/logistics-engine-architecture.md) §5 Slice B · decisions D1, D2, D3 in [docs/research/logistics/decisions-01-running.md](../../docs/research/logistics/decisions-01-running.md) · builds on [061-fleet-foundations](../061-fleet-foundations/spec.md).

---

## Why this feature exists

Effy can now describe its fleet — who its drivers are, what vehicles it runs, who has which van.
What it still cannot describe is **which work each driver is allowed to do**.

A driver record carries one optional delivery zone, and that field is wrong in two directions at once.
It can hold **only one zone**, when a real driver plainly covers several. And **nothing has ever read
it** — the code that introduced it stated that a driver without a zone "is inert for assignment", then
never consulted the field in any assignment decision. So the platform stores an answer nobody asked
for and cannot store the answer anybody needs.

The slice after this one decides who does what work. It cannot begin until the platform can say who is
eligible for what.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Record what a driver is cleared for (Priority: P1)

A back-office operator opens a driver and records the work they are cleared to do: collecting from
shops, delivering to customers, or both — for standard orders, same-day orders, or both — in one zone
or several. They grant a clearance, and they take one away.

**Why this priority**: it is the whole capability. Without it the platform cannot answer the question
the next slice is built on, and every other story here reads or summarises what this one records.

**Independent Test**: fully testable by clearing one driver for a specific combination, confirming it
is recorded, revoking it, and confirming it is gone — with no other story built.

**Acceptance Scenarios**:

1. **Given** a driver cleared for nothing, **When** an operator clears them for same-day delivery in
   one zone, **Then** that clearance is recorded and visible on the driver.
2. **Given** a driver, **When** an operator clears them for several different combinations, **Then**
   every combination is recorded independently and all are visible together.
3. **Given** a driver cleared for a combination, **When** an operator revokes it, **Then** it is gone
   and their other clearances are untouched.
4. **Given** a driver already cleared for a combination, **When** an operator grants the same one
   again, **Then** nothing is duplicated and the operator is not shown an error for a no-op.
5. **Given** any change to a driver's clearances, **When** an operator opens the change history,
   **Then** they see who changed what and when.

---

### User Story 2 - Clear a driver for every zone, including zones that do not exist yet (Priority: P2)

An operator clears a driver for a kind of work **everywhere**, rather than naming today's zones one by
one. When a new zone is created next month, that driver is cleared for it too, without anybody
revisiting their record.

**Why this priority**: it is the difference between a clearance that stays true and one that silently
rots. Recording "everywhere" as a list of today's zones is wrong the first time a zone is added — and
wrong invisibly, because the driver simply stops being eligible for the new area with nothing failing
and nobody told.

**Independent Test**: testable by clearing a driver for every zone, adding a new zone, and confirming
the driver is cleared for the new zone without any further action.

**Acceptance Scenarios**:

1. **Given** a driver, **When** an operator clears them for a kind of work across every zone, **Then**
   that is recorded as a single clearance rather than one per existing zone.
2. **Given** a driver cleared for every zone, **When** a new zone is created, **Then** the driver is
   cleared for it immediately, with no further action by anybody.
3. **Given** a driver cleared for every zone, **When** an operator views their clearances, **Then** it
   is stated as "every zone" and is visibly distinct from a list that happens to cover every zone
   today.
4. **Given** a driver cleared for every zone for one kind of work, **When** an operator revokes it,
   **Then** only that kind of work is affected and any zone-specific clearances remain.

---

### User Story 3 - Tell at a glance who is cleared for what (Priority: P3)

An operator scanning the driver register can see how broadly each driver is cleared, without opening
each record in turn.

**Why this priority**: it is what makes the register usable once clearances exist. A list of twelve
names tells an operator nothing about which of them can cover a same-day round this afternoon.

**Independent Test**: testable by giving several drivers different clearances and confirming the
register distinguishes them.

**Acceptance Scenarios**:

1. **Given** drivers with different clearances, **When** an operator views the register, **Then** each
   driver's breadth of clearance is summarised on their row.
2. **Given** a driver cleared for nothing, **When** an operator views the register, **Then** that is
   shown as a stated fact rather than an empty space.

---

### User Story 4 - See where the fleet has no cover (Priority: P4)

An operator opens one view and sees which zones nobody can serve, broken down by the kind of work each
zone needs. The view distinguishes a zone **nobody is cleared for** from a zone whose cleared drivers
are **all unavailable today** — because the first is an administrative gap and the second is a
rostering problem, and the remedies are different.

**Why this priority**: it is what turns recorded clearances into an operational answer, and it needs
US1 and US2 to have anything to report. It is also the screen the next slice's engine must agree with.

**Independent Test**: testable by creating a zone nobody is cleared for, a zone whose only cleared
driver is unavailable, and a fully covered zone, then confirming the view tells the three apart.

**Acceptance Scenarios**:

1. **Given** a zone nobody is cleared for, **When** an operator opens the coverage view, **Then** the
   zone is listed and the reason says nobody is cleared for it.
2. **Given** a zone whose only cleared driver cannot work today, **When** an operator opens the view,
   **Then** the zone is listed and the reason distinguishes this from having nobody cleared at all.
3. **Given** a zone with three drivers cleared only to collect, **When** an operator opens the view,
   **Then** the zone is reported as uncovered **for delivery** — coverage is never reported as a
   single number per zone.
4. **Given** a fully covered zone, **When** an operator opens the view, **Then** that zone does not
   appear at all.
5. **Given** the coverage view and the existing work-readiness view, **When** both are open, **Then**
   they never disagree about whether a given driver can work.

---

### User Story 5 - Retire the single-zone field (Priority: P5)

The driver record's single optional zone, and the work-readiness reason derived from it, are removed.

**Why this priority**: it is a removal, so it delivers no new operator capability — but leaving it
beside its replacement would give the platform two answers to one question.

**Independent Test**: testable by confirming no interface accepts or displays a single driver zone and
no driver is reported as unable to work for lack of one.

**Acceptance Scenarios**:

1. **Given** the platform after this feature, **When** an operator views or edits a driver, **Then**
   there is no single-zone field anywhere.
2. **Given** a driver cleared for nothing, **When** an operator views the work-readiness view, **Then**
   the reason describes their clearances, not a missing single zone.

---

### Edge Cases

- **A zone is disabled while drivers are cleared for it.** Their clearance must not silently vanish,
  and the zone must not silently keep counting as covered.
- **A new zone is created.** Every driver cleared for "every zone" covers it immediately; every driver
  cleared for named zones does not — and the coverage view must show the gap on day one.
- **A driver is offboarded while holding clearances.** They must stop counting toward coverage without
  their record being rewritten.
- **Two operators edit one driver's clearances at the same time.** One must not silently undo the
  other.
- **A driver is cleared for everything, everywhere.** This must be expressible without enumerating
  anything, and must be legible as such.
- **A driver is cleared for nothing.** An ordinary state for a new starter — reported as a fact, never
  as an error.
- **Granting a clearance that already exists**, and **revoking one that does not**. Neither is a
  failure worth showing an operator.
- **A zone whose cleared drivers are all blocked for unrelated reasons** — an expired licence, no
  vehicle. The coverage view must attribute this correctly rather than reporting nobody is cleared.

---

## Requirements *(mandatory)*

### Functional Requirements

#### Recording clearances (US1)

- **FR-001**: A driver's clearance MUST be expressible along three independent dimensions: the
  **function** (collecting from shops, delivering to customers), the **method** (standard, same-day),
  and the **zone**.
- **FR-002**: Every combination of those dimensions MUST be grantable independently, including a
  driver cleared for one combination only and a driver cleared for all of them.
- **FR-003**: Back-office MUST be able to grant a clearance and revoke a clearance.
- **FR-004**: Revoking one clearance MUST NOT affect any other clearance the driver holds.
- **FR-005**: Granting a clearance the driver already holds MUST be a no-op, not a failure.
- **FR-006**: Revoking a clearance the driver does not hold MUST be a no-op, not a failure.
- **FR-007**: A driver's full set of clearances MUST be readable in one place.
- **FR-008**: Every grant and revoke MUST be attributable to the person who made it and readable as a
  history.
- **FR-009**: Two operators changing one driver's clearances at the same time MUST NOT silently
  overwrite one another.

#### "Every zone" (US2)

- **FR-010**: Back-office MUST be able to clear a driver for a function and method across **every
  zone**, without naming zones.
- **FR-011**: A driver cleared for every zone MUST be cleared for any zone created afterwards, with no
  further action by anybody.
- **FR-012**: "Every zone" MUST be presented as such, and MUST be distinguishable from a set of
  zone-specific clearances that happens to cover every zone today.
- **FR-013**: Revoking an "every zone" clearance MUST affect only that function and method, leaving
  zone-specific clearances for other combinations intact.

#### Reading clearances (US3)

- **FR-014**: The driver register MUST summarise each driver's breadth of clearance without the
  operator opening the record.
- **FR-015**: A driver cleared for nothing MUST be shown as a stated fact, not as blank space.

#### Coverage (US4)

- **FR-016**: The platform MUST present, in one view, every zone that cannot currently be served.
- **FR-017**: Coverage MUST be reported **per kind of work**, never as one figure per zone — a zone
  served only by drivers cleared to collect is uncovered for delivery.
- **FR-018**: The view MUST distinguish **nobody is cleared** for a zone from **everybody cleared is
  unavailable**, because the remedies differ.
- **FR-019**: A zone that can be served MUST NOT appear in the view at all.
- **FR-020**: The coverage view and the existing work-readiness view MUST NOT disagree about whether a
  given driver can work.
- **FR-021**: A driver whose employment status is not active, or who is otherwise unable to work, MUST
  NOT count toward coverage.

#### Clearance is a filter (all stories)

- **FR-022**: A driver who is not cleared for a combination MUST be treated as **ineligible** for it,
  never as a lower-ranked candidate.
- **FR-023**: Where no driver is cleared for a needed combination, the platform MUST say so explicitly
  rather than returning an empty result with no explanation.

#### Retirement (US5)

- **FR-024**: The driver record's single optional zone MUST be removed.
- **FR-025**: The work-readiness reason derived from that field MUST be removed, and replaced by one
  describing the driver's clearances.

#### Scope guard

- **FR-026**: This feature MUST NOT assign work of any kind to any driver. No tasks, rounds, dispatch
  or routing.
- **FR-027**: This feature MUST NOT change how zones are defined. No geographic boundaries, map
  polygons, travel-time areas or coordinates are introduced, and the existing zone model is not
  re-cut.
- **FR-028**: This feature MUST leave every existing back-office and driver capability working as it
  did before.

#### Test data

- **FR-029**: Seed data MUST include drivers with meaningfully different clearances — at least one
  cleared for everything everywhere, one cleared for a single function in a single zone, and one
  cleared for nothing.
- **FR-030**: Seed data MUST leave at least one zone that nobody can serve, so the coverage gap can be
  walked by a person rather than reasoned about.

### Key Entities

- **Clearance**: permission for one driver to do one kind of work in one place. Carries a function, a
  method, and either a named zone or the standing answer "every zone".
- **Driver**: gains a set of clearances; **loses** its single optional zone.
- **Zone**: unchanged. Referenced by clearances; its definition, membership and lifecycle are not
  touched by this feature.
- **Coverage gap**: a zone and a kind of work that nobody can currently serve, together with the
  reason. Derived on reading, never stored — a stored gap and the clearances beneath it can disagree,
  and then nobody knows which is true.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can record a driver's complete clearances — several combinations across
  several zones — in under three minutes, without leaving the driver's record.
- **SC-002**: Every combination of function, method and zone is expressible, verified by recording
  each one at least once.
- **SC-003**: **Proven by causing it**: a driver cleared for every zone is cleared for a zone created
  afterwards, with nobody revisiting their record.
- **SC-004**: "Every zone" is distinguishable from an exhaustive list of today's zones, on screen and
  in what is recorded.
- **SC-005**: **Every** zone that cannot be served appears in the coverage view with a stated reason,
  and no zone appears without one.
- **SC-006**: The coverage view tells apart a zone nobody is cleared for, a zone whose cleared drivers
  are all unavailable, and a zone uncovered only for one kind of work — verified by creating all three.
- **SC-007**: A zone that can be served does not appear in the coverage view at all.
- **SC-008**: The coverage view and the work-readiness view never disagree about whether a driver can
  work, verified across every blocking reason.
- **SC-009**: **Proven by absence**: no interface accepts or displays a single driver zone, and no
  driver is reported unable to work for lack of one. Verified by searching the platform's own
  surfaces, not by assertion.
- **SC-010**: Every capability that worked before this feature still works after it, including the
  driver register, profile editing, employment status, the vehicle register and vehicle handovers.
- **SC-011**: A person can walk the whole feature against seed data without inventing any values of
  their own.

---

## Assumptions

- **Permissions follow the existing back-office model.** Reading clearances and coverage is available
  to any active staff member including a CSA; granting and revoking are restricted to administrators
  and managers, matching how driver and vehicle management already behave.
- **Change history reuses the platform's existing back-office audit trail** rather than introducing a
  second one.
- **The two functions are collecting and delivering, and the two methods are standard and same-day.**
  These mirror the work the platform already models: a package is collected from a shop and delivered
  to a customer, and its method is chosen by the customer at checkout.
- **A clearance is permission, not a promise.** It says a driver *may* do that work, not that they
  will, and not that they are available today. Availability remains the driver going on duty.
- **Coverage counts only drivers who could actually work** — active employment, and not otherwise
  blocked. A driver cleared for a zone but unable to work does not make that zone covered.
- **Zones are unchanged and remain defined by postcode.** This was settled in research: postcodes are
  imperfect as geography, and the alternatives do not justify their cost at one hub in one metropolitan
  area. A driver's clearance is about permission, not geometry.
- **No roster exists.** Availability is the driver clocking on, as established in the previous slice.
- **This feature depends on the driver, zone and work-readiness capabilities** delivered by earlier
  slices, and on the back-office console that already manages drivers.
- **The driver mobile application is not changed.** A driver does not grant their own clearances and
  has no screen for them in this slice.

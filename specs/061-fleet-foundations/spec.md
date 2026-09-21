# Feature Specification: Fleet Foundations — Driver, Vehicle & Shop Location Management

**Feature Branch**: `061-fleet-foundations`

**Created**: 2026-09-20

**Status**: Draft

**Input**: User description: "Fleet Foundations — Driver, Vehicle & Shop Location Management (back-office). The first of four slices rebuilding Effy's logistics capability after the 049 driver work model was torn down."

**Research deliverable**: [docs/logistics-engine-architecture.md](../../docs/logistics-engine-architecture.md) §5 Slice A · decisions D8, D9, D20–D24 in [docs/research/logistics/decisions-01-running.md](../../docs/research/logistics/decisions-01-running.md) · 348 catalogued requirements in [docs/research/logistics/](../../docs/research/logistics/).

---

## Why this feature exists

Effy employs its own drivers and owns its own vehicles, and the platform can barely describe either.

A driver record holds a name, a work email and two free-text strings about whatever they happen to
drive. **There is no vehicle as a thing in its own right** — so nobody at Effy can answer how many vans
exist, which are roadworthy, which can carry chilled goods, or who had which one yesterday. A driver's
licence is a reference and an expiry date that **nothing acts on**, so an expired licence is a fact in a
database rather than a reason someone stops being given work. And a fulfillment shop **has no address at
all**, so there is nowhere to tell a driver to go.

Until Effy can describe its fleet accurately, nothing can sensibly decide who should do what work — and
deciding that is the slice after this one. This feature builds the vocabulary; it assigns nothing.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Manage the vehicle fleet (Priority: P1)

A back-office operator keeps a register of every vehicle Effy runs. They add a vehicle, record what it
is, what it can carry, whether it can carry chilled or frozen goods, and when its registration,
insurance and roadworthy inspection expire. They correct details as they change and retire a vehicle
when it leaves the fleet, without erasing the record of it.

**Why this priority**: it is the largest absolute gap. Today the concept does not exist, so no question
about the fleet can be answered at all. Every later story depends on a vehicle being a thing.

**Independent Test**: fully testable by adding several vehicles of different types, editing one,
retiring one, and confirming the register answers "what do we run, and what is roadworthy". Delivers
value with no other story built.

**Acceptance Scenarios**:

1. **Given** an empty register, **When** an operator adds a vehicle with its registration plate, make,
   model, body type, carrying capacity and compliance dates, **Then** it appears in the register and can
   be opened to see everything recorded about it.
2. **Given** a vehicle that can carry frozen goods, **When** an operator views the register, **Then**
   its refrigeration capability is visible without opening the record.
3. **Given** a vehicle whose registration expired yesterday, **When** an operator views the register,
   **Then** the vehicle is shown as non-compliant and the specific lapsed item is named.
4. **Given** a vehicle that has left the fleet, **When** an operator retires it, **Then** it no longer
   appears among active vehicles, its record and history remain readable, and it can no longer be
   assigned to anybody.
5. **Given** a vehicle Effy does not own but a driver does, **When** an operator records it, **Then** it
   is the same kind of record as an Effy-owned vehicle, distinguished only by who owns it.

---

### User Story 2 - Hand a vehicle to a driver and take it back (Priority: P2)

An operator gives a vehicle to a driver — typically for a shift — recording the odometer as it goes out.
When the driver returns it, the operator takes it back and records the odometer again. At any time the
operator can see who currently holds each vehicle, and every driver who has ever held it.

**Why this priority**: this is the capability the operator explicitly asked for — a vehicle belongs to
Effy, not to a person, and must be able to move between people. It is meaningless without US1.

**Independent Test**: testable by assigning a vehicle, confirming the holder is visible from both the
vehicle and the driver, returning it, and reading the resulting history.

**Acceptance Scenarios**:

1. **Given** an available vehicle and an active driver, **When** an operator assigns it, **Then** the
   vehicle shows that driver as its current holder and the driver shows that vehicle.
2. **Given** a vehicle already held by a driver, **When** an operator tries to assign it to a second
   driver, **Then** the assignment is refused and the refusal names the current holder.
3. **Given** a driver already holding a vehicle, **When** an operator tries to give them a second one,
   **Then** the assignment is refused and the refusal names the vehicle they already hold.
4. **Given** a vehicle that is out with a driver, **When** the operator records its return with a
   closing odometer reading, **Then** the vehicle becomes available and the completed period appears in
   its history with both odometer readings.
5. **Given** a vehicle with several past holders, **When** an operator opens its history, **Then** every
   period is listed with who held it and when, oldest to newest.
6. **Given** a retired vehicle, **When** an operator attempts to assign it, **Then** the assignment is
   refused and the refusal says the vehicle is retired.

---

### User Story 3 - Keep a complete driver record (Priority: P3)

An operator records everything Effy needs to know about an employed driver: their personal and contact
details, an emergency contact, employment dates, and their driver licence — including **which class of
licence it is** and when it expires. Every change is attributable.

**Why this priority**: partially exists already, so it completes rather than creates. But the licence
class is genuinely missing and is what makes "may this person legally drive this vehicle" an answerable
question rather than an assumption.

**Independent Test**: testable by creating a driver, filling every field, editing them, and reading the
change history back.

**Acceptance Scenarios**:

1. **Given** a new employee, **When** an operator creates a driver record with personal details, contact
   details, an emergency contact, a start date and licence details including class and expiry, **Then**
   all of it is stored and readable on the driver's record.
2. **Given** an existing driver, **When** an operator clears an optional field, **Then** it is cleared
   and stays cleared.
3. **Given** any change to a driver record, **When** an operator opens the change history, **Then** they
   see who changed what and when.
4. **Given** a change to an emergency contact, **When** an operator reads the change history, **Then**
   it records that the field changed **without** reproducing the contact's details, because that person
   is a third party who never dealt with Effy.

---

### User Story 4 - See who cannot be given work, and why (Priority: P4)

An operator opens one view and sees every driver who cannot currently be given work, with the reason
stated in words. The reasons differ and so do the remedies: a licence that has expired, a licence class
that does not cover the vehicle they hold, an employment status that is not active, no vehicle assigned,
or a vehicle whose registration or insurance has lapsed.

**Why this priority**: it is what turns the recorded facts into an operational answer, and it is the
screen the next slice's assignment engine will agree with. It needs US1–US3 to have anything to say.

**Independent Test**: testable by creating drivers in each blocked state and confirming each shows its
own reason, and that an unblocked driver shows none.

**Acceptance Scenarios**:

1. **Given** a driver whose licence expired, **When** an operator opens the readiness view, **Then** the
   driver is listed and the reason names the expired licence.
2. **Given** a driver holding a vehicle whose registration has lapsed, **When** an operator opens the
   readiness view, **Then** the reason names the vehicle's lapsed registration, not the driver.
3. **Given** a driver with no vehicle assigned, **When** an operator opens the readiness view, **Then**
   the reason says no vehicle is assigned.
4. **Given** a driver who is blocked for several reasons at once, **When** an operator opens the view,
   **Then** **every** reason is listed, not just the first one found.
5. **Given** a driver who can work, **When** an operator opens the view, **Then** that driver is not
   listed at all.

---

### User Story 5 - Record where each shop is (Priority: P5)

An operator records a street address for each fulfillment shop, so that a driver can be told where to
collect from.

**Why this priority**: small, and independent of everything above, but it unblocks the collection half
of the next slice — a driver cannot be sent somewhere the platform cannot name.

**Independent Test**: testable by giving every active shop an address and confirming the address is
readable wherever a shop is shown to staff.

**Acceptance Scenarios**:

1. **Given** a shop with no address, **When** an operator records one, **Then** the address is stored
   and shown on the shop's record.
2. **Given** an active shop with no address, **When** an operator views the shop register, **Then** the
   missing address is visible as a gap rather than an empty space.

---

### User Story 6 - A driver says when they expect to finish (Priority: P6)

When a driver goes on duty they may record when they expect to finish. It is optional. If they do not,
the platform says the finish time is unknown — it never assumes one.

**Why this priority**: it exists solely so the next slice can ask "can this driver finish this round
before they go home". It carries no value on its own today, which is why it is last among the additive
stories — but building it here keeps the next slice from having to change the duty flow.

**Independent Test**: testable by going on duty with and without a finish time and confirming the two
are distinguishable everywhere the duty state is shown.

**Acceptance Scenarios**:

1. **Given** a driver going on duty, **When** they record an expected finish time, **Then** it is stored
   against that duty period and visible to back-office.
2. **Given** a driver going on duty, **When** they do not record one, **Then** back-office shows the
   finish time as unknown, and **no default shift length is substituted**.
3. **Given** an open duty period with an expected finish time that has now passed, **When** an operator
   views who is on duty, **Then** the overrun is visible.

---

### User Story 7 - The platform stops being able to record a driver's location (Priority: P7)

Effy does not track driver position. The platform's ability to accept or store one is removed.

**Why this priority**: it is a removal, not a capability, so it delivers no operator-visible value — but
it closes a live exposure and belongs in the slice that touches the driver record.

**Independent Test**: testable by confirming that no interface accepts a driver location and that no
driver location is stored anywhere.

**Acceptance Scenarios**:

1. **Given** the platform after this feature, **When** anything attempts to submit a driver's location,
   **Then** there is no interface that accepts it.
2. **Given** the platform after this feature, **When** an operator inspects what is stored about a
   driver's duty period, **Then** no position is stored.

---

### Edge Cases

- **A driver is stood down while holding a vehicle.** The vehicle is physically with them. Standing them
  down must not silently make the vehicle look available, and must not pretend it has been returned.
- **A vehicle's registration or insurance expires while it is out with a driver.** The lapse must become
  visible without the vehicle vanishing from the driver's hands.
- **A driver's licence expires while they hold a vehicle.** Same shape, opposite side.
- **An operator retires a vehicle that is currently assigned.** Retirement must not strand the record of
  who has it.
- **Two operators assign the same vehicle at the same moment.** Exactly one must succeed.
- **The closing odometer is lower than the opening one.** Physically impossible; must be refused or
  flagged rather than silently stored.
- **A driver-owned vehicle when that driver leaves Effy.** The vehicle is not Effy's to keep in the
  active fleet.
- **A shop has no address** when the next slice needs to send somebody there.
- **A driver goes on duty, records an expected finish, and is still on duty long after it.**
- **A vehicle is recorded with a registration plate that already exists.**

---

## Requirements *(mandatory)*

### Functional Requirements

#### Vehicle register (US1)

- **FR-001**: Back-office MUST be able to record a vehicle with its registration plate, make, model,
  year, body type and fuel type.
- **FR-002**: A vehicle MUST record what it can carry: payload weight, load volume, and the number of
  crates it holds.
- **FR-003**: A vehicle MUST record whether it can carry **chilled** goods, **frozen** goods, both, or
  neither. Effy sells groceries; this is a capability, not a detail.
- **FR-004**: A vehicle MUST record the expiry dates of its registration, its insurance, and its
  roadworthy inspection.
- **FR-005**: A vehicle MUST record whether it is owned by **Effy** or by a **driver**. Both MUST be the
  same kind of record, distinguished by that fact and not by separate features.
- **FR-006**: A vehicle's registration plate MUST be unique among vehicles that have not been retired.
- **FR-007**: Back-office MUST be able to edit any recorded detail of a vehicle.
- **FR-008**: Back-office MUST be able to **retire** a vehicle. A retired vehicle MUST remain readable
  with its full history and MUST NOT be assignable.
- **FR-009**: The register MUST show, without opening a record, which vehicles are non-compliant and
  **which specific item** has lapsed.

#### Vehicle assignment (US2)

- **FR-010**: Back-office MUST be able to assign a vehicle to a driver and record the odometer reading
  at that moment.
- **FR-011**: Back-office MUST be able to record a vehicle's return and the closing odometer reading.
- **FR-012**: A vehicle MUST be held by **at most one driver at a time**.
- **FR-013**: A driver MUST hold **at most one vehicle at a time**.
- **FR-014**: The platform MUST refuse an assignment that would break FR-012 or FR-013, and the refusal
  MUST name what is already held rather than failing generically.
- **FR-015**: The platform MUST refuse to assign a retired vehicle, and say so.
- **FR-016**: A vehicle's record MUST show its current holder, if any, and every past holding period
  with its dates and both odometer readings.
- **FR-017**: A driver's record MUST show the vehicle they currently hold, if any.
- **FR-018**: A closing odometer reading lower than the opening reading MUST be refused.
- **FR-019**: Standing a driver down while they hold a vehicle MUST NOT silently return or reassign it.
  The operator MUST be told the vehicle is still out and with whom.

#### Driver record (US3)

- **FR-020**: Back-office MUST be able to record and edit a driver's personal details, contact details,
  emergency contact, and employment dates.
- **FR-021**: Back-office MUST be able to record the driver's licence **class** alongside its reference
  and expiry date.
- **FR-022**: An optional field on a driver record MUST be clearable, and MUST stay cleared.
- **FR-023**: Every change to a driver or vehicle record MUST be attributable to the person who made it
  and readable as a history.
- **FR-024**: The change history MUST record **that** a personal-contact field changed **without
  reproducing its value**, because an emergency contact is a third party who never dealt with Effy.

#### Work readiness (US4)

- **FR-025**: The platform MUST present, in one view, every driver who cannot currently be given work.
- **FR-026**: Each such driver MUST have **every** applicable reason stated in words — not a flag, and
  not only the first reason found — because the remedy differs per reason.
- **FR-027**: The reasons MUST include at minimum: employment status not active, licence expired,
  licence class insufficient for the held vehicle, no vehicle assigned, and held vehicle non-compliant.
- **FR-028**: A driver who can be given work MUST NOT appear in that view.

#### Shop location (US5)

- **FR-029**: Back-office MUST be able to record a street address for each fulfillment shop.
- **FR-030**: An active shop with no recorded address MUST be visible as a gap, not rendered as blank.
- **FR-031**: The platform MUST NOT store map coordinates for a shop. Nothing in the platform computes
  distance, and a stored value nothing reads is a design decision made in advance for an unspecified
  feature.

#### Duty (US6)

- **FR-032**: A driver going on duty MUST be able to record, optionally, when they expect to finish.
- **FR-033**: When no expected finish time is recorded, the platform MUST present it as **unknown** and
  MUST NOT substitute an assumed shift length.
- **FR-034**: Back-office MUST be able to see, for each driver on duty, their expected finish time or
  that it is unknown, and whether an expected finish has passed.

#### Removal (US7)

- **FR-035**: The platform MUST NOT provide any interface that accepts a driver's location.
- **FR-036**: The platform MUST NOT store any driver location.

#### Scope guard

- **FR-037**: This feature MUST NOT assign work of any kind to any driver. No tasks, rounds, dispatch or
  routing.
- **FR-038**: This feature MUST leave every existing back-office and driver capability working as it did
  before.

#### Test data

- **FR-039**: Seed data MUST provide fulfillment shops with Melbourne addresses and a set of vehicles
  covering every body type and refrigeration capability, so the feature can be walked by a person.
- **FR-040**: Seed data MUST be plainly fictional and MUST NOT name a real business or reproduce a real
  person's address.

### Key Entities

- **Vehicle**: a vehicle Effy runs, whoever owns it. Identity (plate, make, model, year), classification
  (body type, fuel), carrying capability (payload, volume, crates, chilled/frozen), compliance
  (registration, insurance, roadworthy expiry), ownership (Effy or driver), and a lifecycle that ends in
  retirement rather than deletion.
- **Vehicle holding**: a period during which one driver had one vehicle. Has a start, an optional end
  (open means still held), an opening odometer reading and, once returned, a closing one.
- **Driver**: extended with licence class, and with the vehicle they currently hold.
- **Duty period**: extended with an optional expected finish time; **loses** any notion of location.
- **Shop**: extended with a street address.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can add a new vehicle to the register, with everything the business needs to
  know about it, in under three minutes and without leaving the vehicle screen.
- **SC-002**: For any vehicle, an operator can see every driver who has ever held it, and when, without
  leaving that vehicle's record.
- **SC-003**: **Proven by attempting both**: a vehicle cannot be held by two drivers at once, and a
  driver cannot hold two vehicles at once. Each attempt is refused with a message naming what is already
  held.
- **SC-004**: **Every** driver shown as unable to work carries at least one stated reason, and no driver
  is shown as blocked without one. Verified across every blocking reason listed in FR-027.
- **SC-005**: **Proven by causing it**: a driver whose licence has expired is reported as unable to work,
  and the reason names the licence.
- **SC-006**: 100% of active fulfillment shops have a recorded address once seed data is loaded, and any
  shop without one is identifiable in a single view.
- **SC-007**: **Proven by absence**: no interface anywhere on the platform accepts a driver location, and
  no driver location is stored. Verified by a search of the platform's own surfaces, not by assertion.
- **SC-008**: A driver on duty without a recorded expected finish is presented as **unknown** everywhere
  the duty state is shown — never as a number.
- **SC-009**: Retiring a vehicle removes it from the assignable fleet while leaving its record and its
  full holding history readable.
- **SC-010**: Every capability that worked before this feature still works after it, including the
  existing driver register, profile editing, employment-status changes and change history.
- **SC-011**: A person can walk the whole feature against seed data without inventing any values of
  their own.

---

## Assumptions

- **Permissions follow the existing back-office model.** Reading the fleet is available to any active
  staff member including a CSA; creating, editing, assigning and retiring are restricted to
  administrators and managers, matching how driver management already behaves.
- **Change history reuses the platform's existing back-office audit trail** rather than introducing a
  second one.
- **A vehicle holding is independent of a duty period.** It usually spans a shift, but it is recorded in
  its own right so it can be shorter or longer without the two concepts having to agree. This subsumes
  the per-shift case rather than assuming it.
- **All Effy vehicles in this phase are light vehicles** (under 4.5 tonnes), so a current Australian
  Class C licence is sufficient to drive any of them. The licence class is recorded so the rule is
  checkable rather than assumed; a richer class-to-vehicle mapping is deferred until a vehicle needs one.
- **Standing a driver down mirrors the existing precedent**: the operator is warned and shown what the
  driver still holds, and proceeding is an explicit decision rather than a silent side effect.
- **There is no driver roster.** Availability is the driver going on duty. A roster would be a second
  source of truth about who is working, maintained by hand at fewer than ten drivers, and the platform
  would then have to choose which to believe.
- **No Chain of Responsibility or heavy-vehicle fatigue fields are built.** Those obligations begin above
  4.5 and 12 tonnes respectively and do not reach Effy's vehicles. This was verified during research,
  and inventing the fields anyway would be scope with no rule behind it.
- **No per-driver food-safety certification field is built.** Whether any such requirement reaches a
  delivery-only operation is unresolved, and if it applies at all it is likely a premises-level rather
  than a per-person obligation. It is not built speculatively.
- **Seed addresses use real Melbourne suburbs and postcodes** — which are public geographic facts and
  identify nobody — **with plainly fictional street lines**, so that postcode-based zone matching can be
  exercised without reproducing anyone's home address.
- **This feature depends on the existing shop, driver and duty records** introduced by earlier slices,
  and on the back-office console that already manages drivers.
- **The driver mobile application already has the screens** this feature needs for the duty flow; no new
  mobile interface design is assumed.

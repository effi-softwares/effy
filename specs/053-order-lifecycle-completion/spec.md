# Feature Specification: Order Lifecycle Completion

**Feature Branch**: `053-order-lifecycle-completion`

**Created**: 2026-08-26

**Status**: Draft

**Input**: User description: "Order Lifecycle Completion — letting an order actually finish. Today a customer order can never complete unless it took the same-day delivery option… (full description recorded in the conversation that opened this feature; the problem statement below is its faithful restatement)"

## Problem

An order placed on Effy today can only ever finish if it took the **same-day** delivery option.

When packages are collected from shops and checked in at the central hub, same-day packages go on to a
delivery round and are closed with proof of delivery. A **standard** package simply stops at the hub.
Nothing in the platform can record that it went any further, and nothing can record that it arrived.

Standard is the default option — same-day is offered only in the nearer delivery areas and only before
the daily cutoff — so this is what happens to most orders. The consequences compound:

- The customer is shown "on the way" indefinitely; the order never leaves their active list.
- The "your order has been delivered" message can never be sent on the majority path.
- The order keeps counting against the customer when they ask to close their account.
- Nobody at Effy can look at the order to find out why, because the internal console has no way to
  look up an order at all.

This is the only place in the customer journey where the flow is **structurally unable to terminate**,
as opposed to merely error-prone. Several capabilities that were already built sit unreachable behind
it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Staff can find and understand an order (Priority: P1)

A member of Effy's back-office staff receives a query about an order — a customer says something is
missing, or asks where their shopping is. They search for the order by its reference or by the
customer, open it, and can see the whole picture: where it has got to, what was bought, what was paid
and how, where it is going, and everything that has happened to it in order.

**Why this priority**: Nothing else in this feature has anywhere to happen without it. It is also
independently valuable on its own: today a customer who is told "contact support and we'll sort it
out" reaches people who cannot see a single thing about the order they are being asked about.

**Independent Test**: Ship only this story and support staff can answer order questions for the first
time. Fully testable by placing an order, searching for it in the console, and confirming every fact
about it is legible without asking an engineer to query anything.

**Acceptance Scenarios**:

1. **Given** a placed order, **When** a staff member searches by its customer-facing reference, **Then** the order is found and opened.
2. **Given** a customer with several orders, **When** a staff member looks the customer up, **Then** that customer's orders are listed most recent first.
3. **Given** an open order, **When** a staff member views it, **Then** they see its current progress, its packages and each package's state, the items, the amounts charged and how it was paid, the delivery destination, and a chronological history of what has happened to it.
4. **Given** a person who is not an active member of staff, **When** they attempt to reach any order view, **Then** they are refused.

---

### User Story 2 - A standard order can be completed (Priority: P1)

A standard package is checked in at the hub and handed over to whoever carries it the rest of the way.
That handover is recorded. Later, when the package has reached the customer, a member of staff records
its arrival. Once every package in an order has arrived, the order is finished.

**Why this priority**: This is the gap the feature exists to close. Without it no standard order can
ever terminate.

**Independent Test**: Place a standard order, take it through collection and hub check-in, record the
handover and then the arrival, and confirm the order reaches a finished state and the customer sees it.

**Acceptance Scenarios**:

1. **Given** a standard package checked in at the hub, **When** it is handed over, **Then** the handover is recorded with the time it happened and who recorded it.
2. **Given** a handover where the carrier's reference is known, **When** it is recorded, **Then** the reference is stored against the package.
3. **Given** a handover where no reference is known, **When** it is recorded, **Then** the handover is still valid and complete, and nothing anywhere presents the missing reference as a fault or an unfinished step.
4. **Given** a handed-over package, **When** a staff member records its arrival, **Then** the package reaches its finished state and the time of arrival is recorded.
5. **Given** an arrival that has already been recorded, **When** the same action is repeated, **Then** nothing changes — no second arrival, no second notification, and the original arrival time is preserved.
6. **Given** a package that has not been handed over, **When** an arrival is attempted, **Then** it is refused with a reason that says why.
7. **Given** an order with both a same-day and a standard package, **When** only the same-day one has arrived, **Then** the order is not finished; **When** both have arrived, **Then** it is.

---

### User Story 3 - The customer is told their order arrived (Priority: P2)

When the last package in an order arrives, the customer hears about it — whichever way they shop.
Somebody who only ever uses the website, and has never installed the app, is told just as reliably as
somebody who has.

**Why this priority**: The arrival being recordable (US2) is what makes the order finishable; being
*told* is what makes it feel finished. It is separable, and the platform can ship US2 without it.

**Independent Test**: Complete an order for a customer who has no app installed, and confirm they
receive the arrival message.

**Acceptance Scenarios**:

1. **Given** an order whose last package has just arrived, **When** the arrival is recorded, **Then** the customer is notified.
2. **Given** a customer who has never used the mobile app, **When** their order arrives, **Then** they still receive the message.
3. **Given** an arrival that is recorded twice, **When** the notification is considered, **Then** the customer is told exactly once.
4. **Given** any arrival message, **When** the customer reads it, **Then** it reveals nothing about how many shops were involved or which they were.

---

### User Story 4 - Progress wording tells the truth (Priority: P2)

A customer is told their order is "on the way" only once it has genuinely left. While it is packed and
waiting at a shop for the next scheduled collection round — which may be the following day — they are
told it is being prepared, not that it has departed.

**Why this priority**: It is a correctness fix to a customer-facing claim, on the document a customer
treats as the record of their purchase. Independently shippable and small.

**Independent Test**: Take an order to "packed and waiting at the shop" and confirm no customer surface
says it has departed. Advance it to genuinely in transit and confirm the wording changes then.

**Acceptance Scenarios**:

1. **Given** an order whose packages are packed but still at their shops, **When** the customer views it on any surface, **Then** they are not told it is on the way.
2. **Given** an order whose packages have left for the customer, **When** the customer views it, **Then** they are told it is on the way.
3. **Given** the same order viewed on the website and in the app, **When** both are compared, **Then** they show the same progress wording.

---

### User Story 5 - An arrived order stops blocking account closure (Priority: P3)

A customer whose order has arrived can close their account straight away, rather than waiting out a
fallback period that assumes their shopping might still be in transit.

**Why this priority**: A real defect with a narrow blast radius — it affects only customers who are
leaving, and a fallback period does eventually release them.

**Independent Test**: Complete an order, immediately request account closure, and confirm that order
does not appear as a blocker.

**Acceptance Scenarios**:

1. **Given** an order whose packages have all arrived, **When** the customer requests closure, **Then** that order does not block it.
2. **Given** an order still in transit, **When** the customer requests closure, **Then** it does block, and the customer is told when the block ends.

---

### Edge Cases

- **A handover reference is never learned.** Must be an ordinary, complete state — see US2 #3. The
  platform must not display an empty reference as missing data, and must not withhold the handover
  record because of it.
- **A mixed order.** One shop's package goes same-day by an Effy driver, another's goes standard by
  carrier. Each arrives by a different route and at a different time; the order is finished only when
  the last one has.
- **Two staff act at once.** Two people record the same arrival simultaneously — exactly one arrival
  and one notification must result.
- **An arrival recorded out of order.** Marking a package arrived when it was never collected, or never
  handed over, must be refused rather than silently accepted.
- **A package reported short or missing at collection.** It was collected in a reduced state. It must
  still be able to complete — the shortfall is a separate fact and does not prevent the rest arriving.
- **A same-day delivery the driver could not complete.** ⚠ Today this leaves the order stuck in exactly
  the same way this feature fixes for standard, and it is **explicitly not addressed here** (see
  Assumptions). It is named so it is not mistaken for covered.
- **An order abandoned before payment.** Never finishes because it never started; it is not an order
  awaiting completion and must not appear as one.

## Requirements *(mandatory)*

### Functional Requirements

**Completing an order**

- **FR-001**: Every order MUST be able to reach a finished state, whichever delivery option its packages took.
- **FR-002**: A package leaving the hub in the care of an outside carrier MUST have that handover recorded, including when it happened and who recorded it.
- **FR-003**: A carrier reference MUST be recordable against a handover when it is known, and its absence MUST be an ordinary supported state — never surfaced as an error, a warning, or an incomplete step.
- **FR-004**: An authorized member of back-office staff MUST be able to record that a handed-over package has arrived.
- **FR-005**: Recording an arrival MUST be idempotent: repeating it MUST NOT create a second arrival, alter the recorded arrival time, or notify the customer again.
- **FR-006**: The system MUST refuse to record an arrival for a package that has not been handed over, and MUST say why it refused.
- **FR-007**: An order MUST be treated as finished only when every one of its packages has arrived — never when only some have.
- **FR-008**: Every arrival MUST record **how it was learned** — recorded by staff, or proven by an Effy driver — so the two can be told apart afterwards.
- **FR-009**: The way an arrival is learned MUST be replaceable by an automatic signal from a carrier without the rest of the order lifecycle changing.
- **FR-010**: An order finishing MUST NOT depend on any capability the platform does not have; in particular it MUST NOT require a carrier integration, and MUST NOT complete an order automatically after a period of time, because elapsed time is not evidence that anything arrived.

**The internal order surface**

- **FR-011**: Back-office staff MUST be able to find an order by its customer-facing reference and by the customer it belongs to.
- **FR-012**: An order's detail view MUST show its current progress, each of its packages and their states, the items purchased, the amounts charged and the means of payment, the delivery destination, and a chronological history of everything that has happened to it.
- **FR-013**: No order view MUST be reachable without an authenticated, active staff record; a valid credential alone MUST NOT be sufficient.
- **FR-014**: Every staff action that changes an order MUST be attributed to the person who took it and retained in the platform's audit trail.
- **FR-015**: Recording an arrival MUST be restricted to administrators and managers. Reading an order — finding it, opening it, reading its history — MUST be available to every active staff member including customer-service agents, because triage is their work.
  - **Rationale (settled, do not re-litigate).** With no carrier signal, "arrived" is an *assertion*, not an observation: a staff member is recording that a package they never saw reached a customer they never met, and that assertion finishes a financial record and sends the customer a message. That places it on the outward-facing side of the platform's existing split, with the customer reply email, rather than with read-and-triage. The access asymmetry decides it: widening this later is trivial and safe, narrowing it after agents have relied on it for months is taking a capability away.

**What the customer sees and is told**

- **FR-016**: The customer MUST NOT be told an order is on its way until it has physically left the shops holding it.
- **FR-017**: The progress wording shown to a customer MUST be determined once and shared by every customer surface, so two surfaces can never disagree about the same order.
- **FR-018**: A finished order MUST be visible as finished to the customer on both customer surfaces.
- **FR-019**: When an order's last package arrives, the customer MUST be notified through a channel that reaches a customer who has never installed the mobile app.
- **FR-020**: The customer MUST be notified of an arrival exactly once, however many times the arrival is recorded.
- **FR-021**: No customer-facing view or message MUST disclose the number of shops fulfilling an order, or their identity. This restates an existing platform invariant because carrier references threaten it directly: references are per-package, and packages are per-shop, so listing them would reveal how many shops served the customer.
- **FR-022**: A carrier reference MUST NOT be shown to the customer in this feature. It is recorded for staff only (FR-003, FR-012), so that support can chase a carrier on the customer's behalf.
  - **Rationale (settled, do not re-litigate).** This is the only option that keeps FR-021 safe *by construction* rather than by every future screen rendering it carefully. Showing a reference only for single-package orders was rejected as worse than nothing: an affordance that appears for some orders and not others hands the customer a visible signal they cannot explain, and the thing it encodes is exactly how many shops served them — a leak with extra steps. An Effy-minted order-level reference aggregating several carrier references was rejected as building against a contract that does not exist: there is no carrier yet whose capabilities that scheme could be designed around. And plainly: with no carrier, a reference the customer could act on does not exist, so showing them an inert string is worse than showing nothing. ⚠ Revisit when a real carrier contract lands — this is correct *while there is no carrier*, not permanently.

**Account closure**

- **FR-023**: An order whose packages have all arrived MUST stop blocking account closure immediately, without waiting for any fallback period.
- **FR-024**: An order still genuinely in transit MUST continue to block closure, and MUST state when that block ends.

### Key Entities

- **Order**: A customer's purchase. Already exists. Gains the ability to be finished.
- **Package**: One shop's portion of an order, the unit that is collected, handed over and arrives. Already exists internally. It is never presented to the customer as a separable thing (FR-021).
- **Handover**: The record that a package left Effy's care for an outside carrier — when, by whom, and the carrier's reference where known.
- **Arrival**: The record that a package reached the customer — when, by whom or by what means, and how that was learned (FR-008).
- **Order history entry**: One thing that happened to an order, in sequence, for staff to read (FR-012).
- **Staff member**: The internal actor who finds orders and records arrivals. Already exists, with roles and an active/inactive state that governs access.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A standard order placed today can be taken to a finished state, and the customer sees it as finished on both the website and the app.
- **SC-002**: No order shape exists that is structurally unable to finish — verified by taking a same-day order, a standard order, and a mixed order all the way to finished.
- **SC-003**: A staff member who knows an order's reference can open that order and read its full history in under 30 seconds, without help from anyone technical.
- **SC-004**: A customer who has never installed the mobile app receives the arrival message.
- **SC-005**: An order recorded as arrived stops blocking that customer's account closure within one minute.
- **SC-006**: Across every customer-facing order view and message, nothing reveals how many shops fulfilled the order — verified by inspecting each of them.
- **SC-007**: Recording the same arrival five times produces exactly one arrival record and exactly one customer notification.
- **SC-008**: A customer is never shown "on the way" for an order whose packages are all still sitting at their shops — verified by holding an order at that state and inspecting both surfaces.
- **SC-009**: A handover recorded with no carrier reference is indistinguishable in completeness from one recorded with a reference; neither staff nor customer sees a warning, a gap, or an unfinished step.
- **SC-010**: Every arrival in the system can be attributed, after the fact, to the person or the mechanism that recorded it.

## Assumptions

- **No carrier contract exists, and this feature does not create one.** Choosing and contracting a
  delivery company is an operator decision and is explicitly out of scope. Arrival is therefore recorded
  by Effy staff in this feature, and FR-009 requires that a future automatic carrier signal can take
  that job over without the lifecycle being rebuilt.
- **⚠ Recording arrivals by hand is a real operational cost, and the feature does not remove it.** With
  no carrier signal, an order finishes only when somebody at Effy says it did. This makes completion
  *possible*, which it is not today; it does not make it automatic.
- **⚠ A same-day delivery the driver could not complete remains stuck.** A failed drop leaves its
  package where it was and tells the customer nothing. That is the same class of defect this feature
  fixes for standard delivery, it is known, and it is deliberately not addressed here. Named explicitly
  so its absence is not read as coverage.
- **Refunds, cancellation, returns, and anything that moves money are out of scope**, including for the
  shortfall case where a customer has paid for something they will not receive.
- **Stock and availability are out of scope.**
- **The existing customer progress vocabulary is reused.** No new customer-facing progress words are
  introduced beyond what the FR-016 correction requires.
- **Existing back-office staff accounts, roles and access rules are reused**; this feature provisions no
  new kind of account.
- **Existing notification and email capabilities are reused** rather than rebuilt.
- **The existing audit trail is reused** for FR-014.
- Standard delivery is assumed to be the majority path, on the basis that same-day is restricted to the
  nearer delivery areas and to orders placed before the daily cutoff.

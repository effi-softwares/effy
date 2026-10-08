# Feature Specification: A Second Front Door for Back-Office

**Feature Branch**: `075-staff-gateway`

**Created**: 2026-10-08

**Status**: Draft

**Input**: "A second front door for staff. Today every Effy app reaches the platform through one shared
front door, and that front door has a fixed ceiling on how many distinct things it can route to. On
2026-10-08 that ceiling was reached: a deployment was refused because no further destination could be
added. Give the back-office its own front door, leaving customers, shops and drivers on the existing
one with room to grow. The move must be invisible to people using the platform; the separation between
audiences must be at least as strong as today; the operator can see how full each front door is and is
warned well before either is full again; the rule for where a new capability goes is written down; the
move can be undone; and it must be repeatable for every later environment."

## Why This Exists

Every Effy app talks to the platform through **one shared front door**. That door can lead to a fixed
number of places, and on **2026-10-08 it filled up**: the deployment of customer points (074) was
refused at 299 + 2 of 300, and could only be completed by folding two destinations into one. The door
now stands at **300 of 300**. Nothing further can be added to the platform through it, and every
planned feature — starting with the delivery model programme
(`docs/prd/2026-10-delivery-model-v2-backlog.md`) — needs to add more.

Nobody saw it coming: no screen showed how full the door was, and the first warning was a failed
deployment that took twelve minutes to roll back.

Back-office accounts for roughly **half** of everything behind the door, it is where most new work
lands next, and only one app uses it. Giving back-office **its own front door** frees about half the
room on the existing one and gives both doors space to grow — and moves the least-risky audience: an
internal website, with no public traffic and no app-store release.

The operator agreed to this direction on 2026-10-08 ("we can move some services to own gateway, so
that we have 2").

## User Scenarios & Testing *(mandatory)*

### User Story 1 - New work can ship again (Priority: P1)

A developer finishes the next feature and deploys it. It adds new back-office capabilities and a few
new customer ones. Both deployments succeed, because back-office now has its own front door and the
shared one has room.

**Why this priority**: This is the whole reason for the feature. Until it is done, no feature that adds
a capability can be deployed at all.

**Independent Test**: After the move, add one new capability behind each front door and deploy; both
succeed, and each door reports how much room is left.

**Acceptance Scenarios**:

1. **Given** the move is complete, **When** the operator looks at how full each front door is, **Then**
   the shared door holds no back-office capability and is no more than about 60% full, and the
   back-office door is no more than about 60% full.
2. **Given** the move is complete, **When** a new capability is added behind either door and deployed,
   **Then** the deployment succeeds.
3. **Given** the move is complete, **When** the two customer points destinations that 074 had to merge
   are considered, **Then** there is room to separate them again if that is ever wanted (it is not
   required).

---

### User Story 2 - Nobody using Effy notices (Priority: P1)

A back-office manager is refunding an order while the move happens. Afterwards every screen works
exactly as before — orders, customers, dispatch, drivers, delivery settings, product review, feedback —
including screens that update on their own when something changes. A customer placing an order, a shop
packing one and a driver on a round notice nothing at all, during or after.

**Why this priority**: A change that fixes deployments by breaking the platform for the people using it
is not a fix.

**Independent Test**: Walk every back-office area before and after the move and compare; place, pack,
collect and deliver one order on the customer, shop and driver apps while the move is in progress.

**Acceptance Scenarios**:

1. **Given** the move is complete, **When** a staff member uses any back-office screen, **Then** it
   shows the same information and offers the same actions as before, with the same role rules
   (administrator, manager, customer-service agent).
2. **Given** an open back-office screen, **When** something it shows changes, **Then** it still updates
   by itself within a few seconds.
3. **Given** the move is in progress, **When** a customer, shop user or driver uses their app, **Then**
   nothing is unavailable to them at any moment.
4. **Given** the move is in progress, **When** a staff member uses back-office, **Then** it is
   unavailable for no more than a few minutes in total, at a time the operator chose, and what they see
   meanwhile says plainly that back-office is briefly unavailable.
5. **Given** the move is complete, **When** any customer, shop or driver app already installed on a
   device is used, **Then** it works without an update.
6. **Given** a shop manager or back-office staff member uses the stock screens, **When** the move is
   complete, **Then** each sees exactly the stock capabilities they had before.

---

### User Story 3 - The audiences stay apart (Priority: P1)

Someone signed in as a customer tries the back-office front door directly. They are refused. A
back-office staff member's sign-in is of no use for anything customer-, shop- or driver-only, and the
reverse.

**Why this priority**: Two doors must not mean a weaker lock on either. Effy's four audiences have
different levels of trust, and that separation is a standing rule of the platform.

**Independent Test**: Present a valid customer, shop and driver sign-in at the back-office door and a
valid staff sign-in at the shared door for a shop-only and a customer-only capability; all are refused.

**Acceptance Scenarios**:

1. **Given** a valid customer, shop or driver sign-in, **When** it is presented at the back-office front
   door for any capability, **Then** it is refused, and the refusal does not say why.
2. **Given** a valid back-office sign-in, **When** it is presented at the shared front door for a
   customer-, shop- or driver-only capability, **Then** it is refused exactly as it is today.
3. **Given** no sign-in at all, **When** any back-office capability other than a basic "are you up?"
   check is requested, **Then** it is refused.
4. **Given** the move is complete, **When** the back-office front door is inspected, **Then** it accepts
   only requests from the back-office website's own addresses, as the shared door does for each app
   today.

---

### User Story 4 - The operator sees a door filling up long before it is full (Priority: P2)

The operator opens the platform's health view and sees how full each front door is. Months later one of
them passes three-quarters full; the operator is told then — not on the day a deployment fails.

**Why this priority**: The ceiling was a surprise because nothing measured it. Without this, the same
failure returns on the second door.

**Independent Test**: Read the fullness of both doors; lower the warning threshold in a test and confirm
the warning arrives.

**Acceptance Scenarios**:

1. **Given** either front door, **When** the operator asks how full it is, **Then** they get the number
   in use and the ceiling for each of its limits, with one command or one look.
2. **Given** either front door passes 75% of any limit, **When** the regular check runs, **Then** the
   operator is warned through the platform's usual alert, naming the door, the limit and the numbers.
3. **Given** a change that would take a door past its ceiling, **When** it is checked before deployment,
   **Then** the check fails and says so — the ceiling is never again discovered by a failed deployment.
4. **Given** the check itself stops running, **When** that happens, **Then** the operator is told, as
   for every other scheduled check on the platform.

---

### User Story 5 - The rule is written down (Priority: P2)

A developer adding a capability reads one page and knows which front door and which service it belongs
to, and what to do if that door is getting full.

**Why this priority**: The platform's rule today says "one front door" and gives no guidance for a
second; without a written rule the next person guesses.

**Independent Test**: Give the page to someone who was not involved and ask where three example
capabilities go; they answer correctly from the page alone.

**Acceptance Scenarios**:

1. **Given** the platform's standing rules, **When** the move is complete, **Then** they say there are
   two front doors, which audience uses which, and that a third needs the same deliberate decision.
2. **Given** the placement guide, **When** a developer reads it, **Then** it says which door each
   audience's capabilities go through, where a capability used by two audiences goes, and what to do
   when a door passes its warning level.
3. **Given** older documents that say "one front door", **When** the move is complete, **Then** the
   current ones are corrected and the historical ones are left as history.

---

### User Story 6 - It can be undone, and done again elsewhere (Priority: P3)

The move goes wrong in dev. The operator puts back-office back behind the shared door with a short,
written set of steps. Later, when a production environment is created, it gets two front doors from the
start by the same means.

**Why this priority**: Dev is the only environment today, so a slow recovery is tolerable — but the
procedure must exist, and production must not need this work repeated by hand.

**Independent Test**: In dev, perform the move, undo it, and perform it again, following only the
written steps.

**Acceptance Scenarios**:

1. **Given** the move has been made, **When** the operator follows the written undo steps, **Then**
   back-office works behind the shared door again, as long as the shared door still has room for it —
   and the steps say so plainly if it no longer does.
2. **Given** a new environment is created, **When** it is set up, **Then** it has both front doors
   without any manual step beyond those every environment already needs.

---

### Edge Cases

- **A capability used by two audiences** (stock is used by shops and by back-office): each audience
  reaches its own part through its own front door; neither loses anything, and neither gains the
  other's.
- **A back-office tab left open across the move**: after the move it either keeps working or asks the
  staff member to reload once; it never silently shows stale information or fails without explanation.
- **A request in flight at the moment of the switch**: it either completes or fails cleanly and can be
  retried; no refund, cancellation or other money action is applied twice or half-applied.
- **Scheduled background work** (planning passes, reconciliation, notifications): it is not routed
  through either door and must keep running through the move.
- **The move is only half done** (some back-office areas moved, others not): back-office still works,
  each area through whichever door currently serves it; a half-finished move is a safe place to stop.
- **Undo after later features have used the freed room**: the shared door may no longer have room to
  take back-office back; the undo steps must check and say so before changing anything.
- **Messages and links already sent** that point at the platform (emailed links, saved bookmarks to the
  back-office website): they keep working.

## Requirements *(mandatory)*

### Functional Requirements

**The second front door**

- **FR-001**: The platform MUST have a second front door used only by back-office, alongside the
  existing shared one used by customers, shops and drivers.
- **FR-002**: Every capability back-office staff use MUST be reachable through the back-office front
  door after the move: staff and shop administration, catalogue administration, product review and
  margin, promotions, delivery configuration, deliverability, feedback, drivers, vehicles, work planning
  and assignment, exceptions, the order console with refunds and cancellation, customers and points, and
  the back-office parts of stock.
- **FR-003**: After the move the shared front door MUST carry no back-office-only capability.
- **FR-004**: A capability used by more than one audience MUST be reachable by each audience through
  that audience's own front door, with exactly the access each had before.

**Nobody notices**

- **FR-005**: The back-office website MUST show the same information and offer the same actions, under
  the same role rules, after the move as before it.
- **FR-006**: Open back-office screens MUST continue to update by themselves when what they show
  changes.
- **FR-007**: No capability used by customers, shops or drivers MUST be unavailable at any moment
  because of the move.
- **FR-008**: Back-office MUST be unavailable for no more than 10 minutes in total because of the move,
  at a time the operator chooses.
- **FR-009**: No customer, shop or driver app MUST need a new release, a new setting or any change
  because of the move.
- **FR-010**: Background work that is not requested through a front door MUST keep running throughout.
- **FR-011**: No money action (refund, cancellation, points credit or debit) MUST be applied twice or
  partly because of the move.

**The audiences stay apart**

- **FR-012**: The back-office front door MUST accept only back-office sign-ins. A customer, shop or
  driver sign-in MUST be refused for every capability, without disclosing the reason.
- **FR-013**: A back-office sign-in MUST remain refused at the shared front door for every customer-,
  shop- or driver-only capability.
- **FR-014**: The decision of what a staff member may do MUST continue to be made from the platform's
  own staff record (role and status), exactly as today.
- **FR-015**: The back-office front door MUST accept requests only from the back-office website's own
  addresses, as the shared door restricts each app today.

**Seeing it coming**

- **FR-016**: The operator MUST be able to see, for each front door and each of its limits, how many are
  in use and what the ceiling is.
- **FR-017**: The operator MUST be warned through the platform's usual alert when either front door
  passes 75% of any limit, and again at 90%.
- **FR-018**: A change that would take a front door past any ceiling MUST be caught by a check before
  it is deployed.
- **FR-019**: If the fullness check stops running, the operator MUST be told.

**The written rule**

- **FR-020**: The platform's standing rules MUST be amended to say that there are two front doors, which
  audience uses each, and that adding another requires the same deliberate amendment.
- **FR-021**: The placement guide MUST say which front door and which service a new capability belongs
  to, where a capability shared by two audiences goes, and what to do when a door passes its warning
  level.
- **FR-022**: Current documents that describe a single front door MUST be corrected; historical records
  MUST be left as they are.

**Undo and repeat**

- **FR-023**: The move MUST be reversible by written steps, which MUST first check that the shared door
  has room and stop, saying so, if it does not.
- **FR-024**: The move MUST be possible in stages, and a partly completed move MUST leave every
  back-office area working.
- **FR-025**: Every environment created later MUST get both front doors by the same means as dev, with
  no extra manual step.

### Key Entities

- **Front door**: the single address an app uses to reach the platform, with fixed ceilings on how many
  places it can lead to. Two after this feature: shared (customers, shops, drivers) and back-office.
- **Capability**: one thing an app can ask the platform to do, reached through exactly one front door
  per audience.
- **Audience**: customer, shop, driver, or back-office — each with its own sign-in and trust level.
- **Fullness reading**: for a front door and one of its limits — the number in use, the ceiling, and
  when it was read.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After the move, each front door is at or below 60% of every limit.
- **SC-002**: A deployment that adds a capability behind either front door succeeds on the first
  attempt.
- **SC-003**: Every back-office area passes a before-and-after walk with zero differences in what staff
  can see or do.
- **SC-004**: Zero minutes of unavailability for customers, shops and drivers during the move; at most
  10 minutes for back-office.
- **SC-005**: 100% of cross-audience attempts (customer, shop and driver sign-ins at the back-office
  door; a staff sign-in on customer-, shop- and driver-only capabilities) are refused.
- **SC-006**: Zero customer, shop or driver app releases are required.
- **SC-007**: The operator can read how full both front doors are in under 1 minute, and a warning
  arrives within one day of a door passing 75%.
- **SC-008**: A person not involved in the work places three example capabilities correctly using only
  the written placement guide.
- **SC-009**: The move, its undo and the move again are each completed in dev by following only the
  written steps.

## Assumptions

- **Back-office is the audience to move**, not customers, shops or drivers: it is about half of what is
  behind the shared door, it is where the next features add most, and only one app — an internal
  website — depends on it (operator agreed 2026-10-08).
- **Two front doors, not one per audience.** Shop and driver stay on the shared door; a third door is a
  future decision, made the same deliberate way.
- **The back-office website may be given a new address for the platform** as part of the move; staff
  never type it and are not affected. Customer, shop and driver apps keep the address they have.
- **Stock is shared by shops and back-office.** Its back-office part moves; its shop part stays. No
  access changes for either.
- **Dev is the only environment today**, so a short back-office outage in working hours is acceptable
  if the operator picks the moment.
- **Warning levels of 75% and 90%** are starting values the operator can change.
- **Merging capabilities to save room** (as 074 had to) stops being necessary; it is not undone by this
  feature.
- **This feature precedes the delivery model programme's next spec** (coverage). The backlog's proposed
  numbers 075–082 each shift by one.
- **The standing rule "one shared front door" is changed by this feature** — a deliberate amendment to
  the platform's constitution, not an exception to it.

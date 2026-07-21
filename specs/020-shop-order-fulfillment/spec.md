# Feature Specification: Shop Order Fulfillment (Receive → Pick → Handoff)

**Feature Branch**: `020-shop-order-fulfillment`

**Created**: 2026-07-20

**Status**: ✅ **SIGNED OFF (partial by design) — 2026-07-21.** The commerce→fulfilment loop is **proven
live** with a real Stripe charge: SC-001 and SC-002 verified against the dev DB (order `EFY-HVX2AE`
→ `paid`; fan-out to 2 shops — `shop one` 2 items/$20.00, `Effy SHOP TWO` 6 items/$37.80; Σ portions
$57.80 == order item subtotal; `Effy SHOP TWO` advanced to `picking` in the shop app, so US1/US2/US3
are live on that surface). Code-verified everywhere: workspace typecheck + **576 JS/TS tests** + build,
Go build/vet/test/gofmt, **152 shop-mobile tests** (Android + iOS), mobile-guard, contract drift guard.
**Carry-forwards** (below) are NOT done.

⚠ **Carry-forward 1 — a live-only Stripe bug was found and fixed during sign-off.**
`webhook.ConstructEvent` (stripe-go/v82) hard-rejects a newer account API version
(`2026-05-27.dahlia` vs the SDK's `2025-08-27.basil`), 400-ing every webhook and stranding every paid
order at `pending_payment` with no fan-out. Fixed via `ConstructEventWithOptions{IgnoreAPIVersionMismatch:
true}` in `apis/core-api/internal/features/checkout/stripegateway.go` (safe — only the event type and
PaymentIntent id are read, both version-stable; HMAC still fully verified). **This is a 019 checkout fix
surfaced by 020's first live run** — the mocks could never have caught it.

⚠ **Carry-forward 2 — several SCs remain unit-proven, not live.** SC-005 (concurrent transition),
SC-007 (adversarial no-leak on the wire), SC-010 (the *second* shop surface — only one was exercised
live), SC-011/SC-012 (shortfall flow), and SC-013 (the deployed pickup-stub 404 probe) are asserted in
tests but not manually walked. The full SC-001…SC-021 table in [quickstart.md](./quickstart.md) §4
remains to be run.

⚠ **Carry-forward 3 — dev-only helper shipped.** `scripts/stripe-listen.sh` syncs the CLI's webhook
signing secret into Secrets Manager (`/effy/dev/stripe/webhook_secret`) and records the forward URL in
SSM (`/effy/dev/stripe/webhook_url`) before forwarding — removing the secret-drift that caused the
stranded first order. Local dev only.

**Original status: Draft** →

**Input**: User description: "Shop Order Fulfillment — let shops actually receive and work the orders that 019 creates. 019 writes one per-shop fulfilment record per paid order plus an `order.placed` outbox event, and nothing consumes either: from a shop's point of view a paid order vanishes into the database. Deliver the shop audience's order-handling capability at parity on both shop surfaces (shop-web console, shop-mobile tablet-first): see incoming orders in near-real-time, open one to see exactly what to pick, and move it through a lifecycle to the point it leaves the shop. A shop sees ONLY its own items and never the customer's payment details. The shop audience MAY use BOTH backends — the path is chosen by latency/reliability need, not by audience."

---

## Overview

019 made Effy **sell**. It did not make Effy **fulfil**.

Every paid order already splits correctly: one per-shop fulfilment record per involved shop, each holding
only that shop's items, plus an `order.placed` event carrying the per-shop breakdown. That machinery is
built, tested, and proven against real two-shop data. **But nothing reads it.** No shop is told an order
arrived, no screen lists it, and the fulfilment status has never once moved off `pending` — there is no
code path anywhere that changes it. A customer can pay for groceries today and the shop that must pick
them has no idea.

This slice closes that loop: it makes an incoming order **visible** to the shop that owns it, **workable**
by the staff standing at the shelves, and **completable** to the point the goods leave the shop. It is the
first time the platform's fulfilment side does anything at all.

It is deliberately bounded at the shop's doorstep. Who carries the order away — driver assignment,
dispatch, delivery tracking — is a later slice. This one ends when the shop says "this is ready to go".

### Why this is the right next slice

The fan-out records are the platform's only evidence that an order needs work. Leaving them unconsumed
means paid orders silently accumulate as rows nobody sees — a failure that is invisible, which is the
worst kind. And everything downstream (driver dispatch, delivery, customer notifications) needs a
shop-side status to react to; that status does not exist until this slice creates it.

---

## User Scenarios & Testing *(mandatory)*

> **Parity is mandatory.** Every story below MUST be delivered on **both** shop surfaces —
> `apps/shop-web` (operator console, which has **no Orders area at all** today) and `apps/shop-mobile`
> (tablet-first, whose **Orders tab is an explicit "coming soon" placeholder**) — with equivalent
> capability and a native feel on each. The shop parity register
> ([docs/audiences/shop-capabilities.md](../../docs/audiences/shop-capabilities.md)) MUST be updated in
> the same change. Reference platforms: the merchant/kitchen order screens of Uber Eats and comparable
> fulfilment consoles — a queue that is readable at a glance from arm's length.

### User Story 1 - A shop sees its incoming orders (Priority: P1)

A shop operator opens the Orders area and sees the orders **their shop** must fulfil, most urgent first.
Each row shows enough to triage at a glance: the order reference, when it arrived, how many items, and
its current state. New orders appear without the operator navigating away and back, and their arrival is
unmistakable — an operator who walked away and came back must be able to tell instantly that work is
waiting. When nothing is waiting, the screen says so plainly rather than looking broken.

**Why this priority**: Visibility is the whole gap. Until an order appears on a screen, nothing else in
fulfilment can happen, and today it appears nowhere. This story alone converts a silent database row into
actionable work and is independently valuable.

**Independent Test**: With a paid order that involves this shop, open Orders on each surface and confirm
the order appears with reference, arrival time, item count and state; confirm an order belonging to a
*different* shop never appears; confirm a newly placed order surfaces without a manual reload; confirm the
empty state when the shop has no work.

**Acceptance Scenarios**:

1. **Given** a paid order containing this shop's items, **When** the operator opens Orders, **Then** the
   order appears in the queue with its reference, arrival time, item count and current state.
2. **Given** an order that contains **no** items from this shop, **When** the operator opens Orders,
   **Then** that order never appears — in any state, filter, or count.
3. **Given** the operator is viewing the queue, **When** a new order for this shop is placed, **Then** it
   appears without the operator navigating away, and its arrival is clearly signalled.
4. **Given** the shop has no outstanding orders, **When** the queue loads, **Then** a clear empty state is
   shown (not an error, not a blank screen).
5. **Given** an operator whose account is disabled, whose shop is inactive, or who has no shop assignment,
   **When** they attempt to view the queue, **Then** they are refused, and the refusal does not disclose
   which condition failed.

---

### User Story 2 - A shop opens an order and picks it (Priority: P1)

The operator opens an order and sees exactly what to gather: **their shop's items only**, with product
name, quantity and enough identifying detail to find each one on the shelf. They can see the order
reference and the delivery context needed to prepare and label it. As they gather items they can track
progress against the list, so a half-picked order survives an interruption and a colleague can pick up
where the first person left off. When something is damaged or simply not on the shelf, they can **flag
that item unavailable** rather than being forced to pretend they picked it — the shortfall is recorded
against the order instead of being lost. Nothing about the customer's payment is shown.

**Why this priority**: The queue tells a shop that work exists; this tells them what the work *is*. It is
the core operational screen — the one a person actually stands in front of — and it is required before any
completion state means anything.

**Independent Test**: Open an order spanning two shops from each shop's account; confirm each sees only
its own lines with correct quantities; confirm the order reference and delivery context are present and no
payment detail appears anywhere; mark part of the list gathered, navigate away and return, and confirm the
progress persisted.

**Acceptance Scenarios**:

1. **Given** an order spanning multiple shops, **When** this shop opens it, **Then** only this shop's
   items and quantities are shown, and no other shop's items, totals or identity appear anywhere.
2. **Given** any order, **When** it is displayed to a shop, **Then** the customer's payment details are
   never shown — no card data, no payment references, no amounts beyond this shop's own line values.
3. **Given** an open order, **When** the operator views it, **Then** the order reference and the delivery
   context needed to prepare and label the order are available.
4. **Given** an operator part-way through gathering items, **When** they leave the screen and return (or a
   colleague opens the same order), **Then** the picking progress made so far is still reflected.
5. **Given** an order with many items, **When** it is displayed, **Then** the list remains readable and
   workable from arm's length on a tablet.
6. **Given** an item is damaged or not on the shelf, **When** the operator flags it unavailable, **Then**
   the shortfall is recorded against the order, is visible to the shop, and the order can still be
   completed with the remaining items.
7. **Given** an item was flagged unavailable, **When** the order and its portion are inspected, **Then**
   **no** refund, credit, or price adjustment has been applied automatically, and the shortfall remains
   discoverable for later resolution.
8. **Given** an item flagged unavailable, **When** the operator finds it after all, **Then** they can undo
   the flag and gather it normally.

---

### User Story 3 - A shop moves an order through to handoff (Priority: P1)

Once the items are gathered the operator advances the order — `received` → `picking` →
**`ready_for_pickup`** — to the point it is ready to leave the shop. Each transition is deliberate (a
positive action, never an accident, save for the implicit `received` on first open), is
reflected immediately on the operator's screen, and is durable — a refresh, a different device, or a
second staff member all show the same truth. When the shop marks the order ready, its fulfilment record
finally leaves `pending`, and that is the signal every later slice will build on.

**Why this priority**: This is the state that does not exist today. Without it the fulfilment status is
permanently `pending` and nothing downstream can ever be built. It is the deliverable that makes the
019 fan-out mean something.

**Independent Test**: Take an order from arrival through each state to ready on one surface; confirm the
state is immediately visible on the *other* surface and to a second operator; confirm the fulfilment
record reflects each transition; confirm an already-advanced order cannot be silently advanced twice.

**Acceptance Scenarios**:

1. **Given** an order in the queue, **When** the operator advances it `received` → `picking` →
   `ready_for_pickup`, **Then** each state change is recorded and immediately visible to that shop on both
   surfaces.
2. **Given** an order marked ready by one operator, **When** a second operator views it, **Then** they see
   the ready state and are not offered a duplicate completing action that would double-apply.
3. **Given** two operators acting on the same order at the same time, **When** both attempt a transition,
   **Then** the result is consistent and the order does not end up in a contradictory state.
4. **Given** an order is marked ready, **When** its fulfilment record is inspected, **Then** its status has
   left `pending` and reflects the shop's completion.
5. **Given** an operator attempts to act on an order belonging to another shop, **When** the action is
   submitted, **Then** it is refused regardless of what any interface offered or any client sent.
6. **Given** an order in which some items were flagged unavailable, **When** the operator marks it ready,
   **Then** it completes normally, and the shortfall stays recorded and visible rather than being erased
   by completion.
7. **Given** an order marked ready for pickup, **When** nothing collects it, **Then** it remains
   distinguishable as *awaiting collection* rather than being treated as finished business.
8. **Given** an order marked ready for pickup by mistake, **When** the operator reverses it, **Then** it
   returns to `picking`, the reversal is recorded against that operator, and it can be completed again.
9. **Given** a portion that has been collected, **When** any transition, reversal, or unavailable flag is
   attempted, **Then** it is refused and nothing changes.

---

### User Story 3a - The pickup stub (Priority: P3, TEMPORARY SCAFFOLD)

There is no driver surface yet, so nothing can collect a ready order and the lifecycle dead-ends. To keep
the flow exercisable end to end today, a **stand-in pickup call** marks a ready portion as collected using
a placeholder driver identifier. It exists purely so the platform can be developed and demonstrated before
the driver slice lands.

**Why this priority**: It is scaffolding, not product. It has no user, no interface, and is explicitly
scheduled for removal. It is P3 because the three P1 stories are complete and valuable without it — it
only unblocks *demonstrating* the state past "ready".

**Independent Test**: With an order marked ready, invoke the stub with a placeholder driver identifier and
confirm the portion moves to collected; confirm it is refused against an order that is not ready; confirm
that with the stub disabled (the default outside development) it does not exist at all.

**Acceptance Scenarios**:

1. **Given** a portion marked ready for pickup and the stub enabled, **When** it is invoked with an order
   reference and a placeholder driver identifier, **Then** the portion is marked collected and the
   identifier is recorded as a placeholder, clearly distinguishable from a real driver.
2. **Given** a portion that is **not** ready, **When** the stub is invoked, **Then** it is refused and no
   state changes.
3. **Given** the stub is disabled — **the default in every environment other than local development** —
   **When** it is invoked, **Then** it does not exist and nothing can be mutated through it.
4. **Given** any deployed (non-development) environment, **When** its configuration is inspected, **Then**
   the stub cannot be turned on, by any runtime input.

---

### User Story 4 - A shop reviews what it has already fulfilled (Priority: P2)

An operator can look back at orders the shop has completed — to answer "did we send that?", to resolve a
query relayed by support, or to hand over at shift change. Completed orders are separated from live work
so the active queue stays uncluttered, and each remains openable in full detail.

**Why this priority**: Operationally valuable and expected of any fulfilment console, but a shop can work
orders without it. It ranks below the live path.

**Independent Test**: Complete an order; confirm it leaves the active queue, appears in the completed view
for that shop, and can still be opened to see its items and details.

**Acceptance Scenarios**:

1. **Given** a completed order, **When** the operator views the active queue, **Then** it is no longer
   presented as outstanding work.
2. **Given** a completed order, **When** the operator opens the completed view, **Then** it is listed with
   its reference and completion time and can be opened in full detail.
3. **Given** the completed view, **When** it is scoped, **Then** it contains only this shop's orders.

---

### User Story 5 - The customer sees that their order is progressing (Priority: P2)

As shops work an order, the customer's own order view reflects that progress — **without ever revealing a
shop**. The customer already sees an anonymous per-portion fulfilment summary; this slice makes it
meaningful by giving those portions real, moving states. A customer whose order spans shops sees one
coherent picture of progress, not a shop-by-shop breakdown.

**Why this priority**: It turns an existing but inert customer-facing field into real information at
almost no extra cost. It is not required for a shop to fulfil an order, so it ranks after the shop path.

**Independent Test**: Place an order spanning two shops; advance one shop's portion; confirm the
customer's order view reflects progress, shows no shop names or identifiers, and stays coherent while the
second portion is still outstanding.

**Acceptance Scenarios**:

1. **Given** an order whose shop portion has advanced, **When** the customer views the order, **Then** the
   progress is reflected in their view.
2. **Given** an order spanning multiple shops, **When** the customer views it, **Then** no shop name,
   identifier, or count that implies "who" is fulfilling is disclosed.
3. **Given** one portion is ready and another is not, **When** the customer views the order, **Then** the
   overall state is presented coherently and is not misleading about completion.
4. **Given** an item is flagged unavailable while its portion is still being picked, **When** the customer
   views the order, **Then** the flag is **not** shown — mid-pick churn never reaches them.
5. **Given** that portion has reached its terminal state with an item still unavailable, **When** the
   customer views the order, **Then** that specific item is disclosed as unavailable, without naming a
   shop and without promising a refund.

---

### Edge Cases

- **Multi-shop order**: each shop sees only its own lines; no shop can infer another shop's involvement,
  items, or totals from anything shown — including counts, totals, or ordering.
- **Order arrives while the operator is away / device asleep**: on return the order is present and its
  arrival is still evident — the signal is not lost because nobody was looking.
- **Two staff work the same order simultaneously**: transitions do not conflict, double-apply, or leave a
  contradictory state; the interface does not offer an action that has already run.
- **Shop deactivated while an order is outstanding**: its operators are refused further access; the record
  is not corrupted and remains recoverable by the back office.
- **An item cannot be fulfilled** (damaged, not on the shelf): the operator flags that item unavailable;
  the order completes with the rest and the shortfall is recorded. **No money moves** — the customer has
  paid for an item they will not receive, and that debt is deliberately left visible for a refunds slice.
- **Every item on a portion is unavailable**: the portion still completes (a zero-gathered completion)
  rather than becoming stuck — declining a whole portion is not supported.
- **An order sits in "ready for pickup" indefinitely** because nothing collects it: it must stay
  distinguishable as awaiting collection, not silently counted as finished.
- **A very large order**: the pick list stays readable and workable; no truncation that could cause an
  item to be missed.
- **Stale queue**: a queue that has failed to refresh must not silently present old data as current.
- **Backend unreachable**: queue and detail degrade to a clear, retryable state — never a blank screen and
  never a false "no orders".
- **An order with zero items for this shop** cannot exist (a portion is only created where a shop has
  items) — but if encountered it must not appear as workable.

---

## Requirements *(mandatory)*

### Functional Requirements

#### Seeing the work (US1)

- **FR-001**: A shop operator MUST be able to view the orders their shop is responsible for fulfilling,
  ordered by **delivery promise urgency — soonest promised handoff first**, tie-broken by arrival time
  oldest-first. Both keys are immutable once the order is placed, so the queue order MUST be stable — it
  MUST NOT reorder in response to state changes or operator activity.
- **FR-001a**: Orders **at risk against their promise** (approaching or past the time by which the shop
  must be ready) MUST be **visually escalated in place** (prominence, not position), so slipping work is
  obvious without the queue rearranging itself.
- **FR-001b**: Ordering MUST degrade gracefully when no delivery-method model exists yet: while every
  order carries the same promise, the promise key is constant and FR-001 collapses to **strict FIFO by
  arrival**. This slice MUST NOT hardcode FIFO in a way that requires rework once 021 introduces
  differentiated promises.
- **FR-002**: Each queue entry MUST show the order reference, when it arrived, the number of items this
  shop must gather, the order's current fulfilment state, and its **delivery promise** — the service level
  and the time by which this shop must be ready.
- **FR-002a**: The delivery promise MUST be presented as a **service level and a deadline only**. Whether
  a platform driver or a third-party service executes the delivery MUST NOT be modelled or displayed
  anywhere in this feature — that distinction does not exist in the product.
- **FR-003**: The queue MUST be scoped to the operator's own shop — an order with no items from that shop
  MUST never appear.
- **FR-004**: Newly placed orders MUST surface in the queue in near-real-time without the operator
  manually navigating away and back, and their arrival MUST be clearly signalled.
- **FR-005**: The queue MUST show an explicit empty state when the shop has no outstanding orders.

#### Working the order (US2)

- **FR-006**: Opening an order MUST show that shop's items with product name and quantity, in enough
  detail to locate each item.
- **FR-007**: An order view MUST NEVER show another shop's items, totals, or identity.
- **FR-008**: An order view MUST NEVER show the customer's payment details.
- **FR-009**: An order view MUST show the order reference and the delivery context required to prepare and
  label the order, **including the delivery promise** (service level + ready-by deadline).
- **FR-009a**: The delivery promise MUST be **read-only** to the shop — a shop cannot change the service
  level, the fee, the deadline, or the serviceability of an address. Those are owned by 021.
- **FR-010**: Picking progress MUST persist across navigation, refresh, device change, and operator change
  so an interrupted pick is resumable and hand-over-able.

#### Unavailable items (US2, clarified 2026-07-20)

- **FR-010a**: An operator MUST be able to flag an **individual item** unavailable, in whole or by
  reducing the quantity actually gathered.
- **FR-010b**: Flagging an item unavailable MUST NOT trigger any refund, credit, or price adjustment —
  the recorded order amounts are unchanged, and the shortfall is left explicitly discoverable for a later
  refunds slice.
- **FR-010c**: An order containing unavailable items MUST still be completable with the remaining items.
- **FR-010d**: An unavailable flag MUST be reversible while the order is still being worked.
- **FR-010e**: A shop MUST NOT be able to decline an entire portion (out of scope by clarification) —
  unavailability is expressed item by item.
- **FR-010f**: Recorded shortfalls MUST survive completion and remain visible on the completed order.

#### Completing the order (US3)

- **FR-011**: A fulfilment portion MUST move through exactly these states:
  **`pending` → `received` → `picking` → `ready_for_pickup`**, plus the terminal **`collected`** reachable
  only via the dev-only pickup stub (FR-030). The shop's responsibility ends at `ready_for_pickup`.
  - `pending` — created by the 019 fan-out; nobody has looked at it yet.
  - `received` — a human at the shop has acknowledged the order.
  - `picking` — the shop is actively gathering items.
  - `ready_for_pickup` — gathered and awaiting collection. **Terminal for the shop.**
  - `collected` — a placeholder driver has taken it (scaffold only; see FR-030…FR-034).
- **FR-011a**: A portion MUST become `received` when an operator of that shop first opens it — opening it
  *is* the acknowledgement. No separate acknowledge action is required, since with no accept/reject
  decision (clarified) such an action would carry no information.
- **FR-011b**: Every other transition MUST be a deliberate operator action, never an automatic side effect
  of viewing.
- **FR-011c**: The time a portion has spent in its current state MUST be derivable, so an order sitting
  unacknowledged or half-picked is identifiable rather than invisible.
- **FR-011d**: The state machine MUST be forward-only with exactly **one** permitted reversal:
  `ready_for_pickup → picking`, allowed only while the portion is not `collected`. Every other backward
  transition MUST be refused.
- **FR-011e**: A reversal MUST be audited identically to a forward transition (who, what, when), so a
  prematurely-completed order leaves a visible trace rather than silently rewinding.
- **FR-011f**: Once `collected`, a portion MUST be immutable — no transition, reversal, or unavailable
  flag may be applied.
- **FR-012**: A state transition MUST be durable and immediately visible to that shop on **both** surfaces
  and to other operators of the same shop.
- **FR-013**: Completing an order MUST move its per-shop fulfilment record out of `pending` to reflect the
  shop's completion.
- **FR-014**: Transitions MUST be safe under concurrency — two operators acting at once MUST NOT
  double-apply a transition or leave the order in a contradictory state.
- **FR-015**: The system MUST record who advanced an order and when, so fulfilment activity is auditable.

#### The pickup stub (US3a — TEMPORARY, dev-only)

- **FR-030**: The system MUST provide a stand-in way to mark a ready portion **collected**, accepting an
  order reference and a placeholder driver identifier, so the lifecycle is exercisable before a driver
  surface exists.
- **FR-031**: The stub MUST be **disabled by default** and enabled only by explicit local-development
  configuration. It MUST be **structurally impossible to enable in any deployed environment** — not merely
  discouraged, and not switchable by any runtime input, header, or request parameter.
- **FR-032**: The stub MUST refuse any portion that is not in the ready state, and MUST NOT be usable to
  skip, reverse, or shortcut any earlier fulfilment state.
- **FR-033**: A portion collected via the stub MUST record its driver identifier as a **placeholder**, so
  stub-collected orders are permanently distinguishable from genuinely dispatched ones and cannot be mistaken for
  real delivery data.
- **FR-034**: The stub's **removal trigger MUST be recorded**: it is deleted when the driver slice ships a
  real dispatch path. It MUST NOT accrete additional capability in the meantime.

#### Reviewing past work (US4)

- **FR-016**: Completed orders MUST leave the active queue and be viewable in a separate shop-scoped
  completed view, each still openable in full detail.

#### The customer's view (US5)

- **FR-017**: A customer's order view MUST reflect fulfilment progress as shops advance their portions.
- **FR-018**: No shop name, identifier, or any signal implying which or how many shops are involved MUST
  be exposed to the customer (hidden-fulfilment, binding).
- **FR-018a**: Where items were flagged unavailable, the customer's order view MUST NOT imply those items
  are on their way. It MUST NOT promise a refund either, since none is issued in this slice.
- **FR-018b**: Unavailable items MUST be disclosed to the customer at **item level**, but **only once that
  portion has reached its terminal state**. Mid-pick flags MUST NOT be visible to the customer, so a flag
  that is later undone (FR-010d) never reaches them.
- **FR-018c**: Item-level disclosure MUST NOT reveal shop identity or imply how many shops are involved —
  the item is already the customer's own line, so naming it discloses nothing about fulfilment structure.

#### Access, safety, parity (cross-cutting)

- **FR-019**: Access MUST be record-backed and fail-closed — role AND account status AND active-shop
  assignment — and an operator MUST only ever read or act on their **own** shop's fulfilments, regardless
  of what any interface offers or any client sends.
- **FR-019a**: **Both** `shop_manager` and `shop_staff` MUST have full fulfilment access — reading the
  queue and order detail, transitioning states, and flagging items unavailable. No fulfilment action is
  manager-only, and the existing 014 manager gate MUST NOT be reused to restrict this feature.
- **FR-019b**: Because no action is role-restricted, the **audit trail is the sole accountability
  control** — every transition and every unavailable flag MUST be attributable to the individual operator
  who performed it (FR-015), not merely to the shop.
- **FR-020**: A refusal MUST NOT disclose which condition failed.
- **FR-021**: Both shop surfaces MUST deliver every story at parity, each feeling native to its platform,
  and MUST share one source of truth for the data contracts they exchange with the backend.
- **FR-022**: The shop capability parity register MUST be updated in the same change.
- **FR-023**: The shop-mobile experience MUST be usable on a **large-screen tablet in landscape** — the
  shop audience's primary device — and readable at arm's length.
- **FR-024**: Every fulfilment read and write MUST be observable (operational metrics + structured logs)
  with no PII beyond the authenticated subject id.

### Key Entities *(include if data involved)*

- **Shop fulfilment portion (existing)**: the per-shop slice of one customer order — the shop, its item
  count and subtotal, and a status that today is permanently `pending`. **This slice gives that status a
  life.** Exactly one exists per (order, shop).
- **Order (existing, read-only here)**: the customer's single purchase — reference, placement time, and an
  immutable delivery-address snapshot. A shop reads only what it needs to fulfil.
- **Order item (existing, read-only here)**: a line of an order, already attributed at placement to the
  shop that owns the product — which is what makes per-shop scoping a direct, unambiguous query.
- **Fulfilment state**: the working lifecycle of a shop's portion —
  `pending` → `received` → `picking` → `ready_for_pickup`, plus the scaffold-only terminal `collected`.
  Carries enough history that time-in-state is derivable (FR-011c).
- **Pick progress**: which of a portion's items have been gathered, durable across people and devices.
- **Delivery promise (owned by 021, read-only here)**: the service level the customer bought (same-day,
  scheduled, multi-day) and the time by which this shop must be ready. Drives queue ordering (FR-001) and
  at-risk escalation (FR-001a). Deliberately says **nothing** about who performs the delivery.
- **Shortfall**: an item recorded as unavailable (or short-gathered) — a paid-for item the customer will
  not receive. Carries no financial effect in this slice and exists to be resolved by a later refunds
  slice.
- **Placeholder collection (temporary)**: the stand-in record of a portion being collected by a
  non-existent driver, marked as placeholder data and removed when the driver slice ships.
- **Fulfilment activity record**: who advanced a portion, to what state, and when — for audit and
  shift handover.
- **Shop / shop staff (existing)**: the fulfilment node and the people authorised to act for it.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A paid order involving a shop appears in that shop's queue **within 30 seconds** of payment
  without any manual refresh, on both surfaces.
- **SC-002**: For an order spanning **N** shops, each shop sees **exactly** its own items — zero lines
  from any other shop — and the union of what all shops see equals the order, with nothing duplicated.
- **SC-003**: An operator can go from opening the queue to marking an order ready in **under 60 seconds**
  for a 5-item order, with no more than 3 deliberate actions beyond gathering the goods.
- **SC-004**: Every order a shop has marked ready has a fulfilment record that has left `pending` — zero
  exceptions.
- **SC-005**: Two operators acting on the same order concurrently produce **exactly one** applied
  transition — no duplicates, no contradictory state.
- **SC-006**: Picking progress survives navigation, reload, and operator change in **100%** of cases.
- **SC-007**: **Zero** occurrences of a shop being shown another shop's items, another shop's identity, or
  any customer payment detail — verified adversarially, not merely by inspection.
- **SC-008**: An operator who is disabled, unassigned, or whose shop is inactive is refused **100%** of
  fulfilment reads and writes, with a refusal that does not reveal which condition failed.
- **SC-009**: A customer viewing a multi-shop order sees progress but **zero** shop-identifying
  information.
- **SC-010**: Every user story is demonstrably satisfied on **both** shop-web and shop-mobile, verified
  against its acceptance scenarios on each.
- **SC-011**: Flagging items unavailable produces **zero** automatic refunds, credits, or price
  adjustments, and **100%** of recorded shortfalls remain discoverable after the order is completed.
- **SC-012**: An order whose items were all flagged unavailable still reaches a terminal state — **zero**
  portions become permanently stuck.
- **SC-013**: The pickup stub is **absent** (not merely refusing) in every non-development configuration,
  and **no** runtime input can enable it — verified by attempting to enable it, not by reading the code.
- **SC-014**: **100%** of stub-collected portions are identifiable as placeholder data and **zero** are
  indistinguishable from a genuine dispatch.
- **SC-015**: Every portion follows the declared state machine — **zero** portions reach a state by any
  path other than `pending → received → picking → ready_for_pickup` (+ the single permitted reversal, and
  `collected` only via the stub).
- **SC-016**: A prematurely-completed order can be reversed and re-completed, and **100%** of reversals
  are attributable to the operator who performed them.
- **SC-017**: **Zero** mid-pick unavailable flags are visible to the customer; **100%** of shortfalls on
  terminal portions are disclosed at item level without naming a shop.
- **SC-018**: Queue position is stable — an order's position **never** changes in response to a state
  change or operator activity, and at-risk orders are escalated in place.
- **SC-019**: The queue is ordered by soonest promised handoff, tie-broken by arrival — verified with a
  later-arriving, sooner-promised order correctly outranking an earlier-arriving, later-promised one.
- **SC-020**: With a single uniform promise, ordering is **identical** to strict FIFO — proving FR-001b's
  graceful degradation without a code path that must later be replaced.
- **SC-021**: **Zero** references to delivery execution (own driver vs third party) appear in any shop or
  customer surface, data contract, or stored record produced by this feature.

---

## Clarifications

### Session 2026-07-20

- Q: **When a shop cannot fulfil an item or an entire order, what happens?** Payment was captured at
  placement (019) and refunds/cancellations are explicitly out of scope, so a plain "reject" would take
  money for goods never sent. → **A: Option B — a shop may flag an *individual item* unavailable. The
  shortfall is recorded and surfaced (to the shop, and as progress to the customer), but triggers **no**
  automatic refund, credit, or price adjustment in this slice. Declining a *whole portion* is NOT
  supported. The money owed is left deliberately visible for a later refunds slice to resolve.**
- Q: **Where exactly does the shop's responsibility end, and how is "it left the shop" recorded** when no
  driver system exists yet? → **A: Option A — the shop's terminal state is "ready for pickup" and its
  responsibility ends there. Because no driver surface exists, this slice additionally ships a
  **temporary, dev-only pickup stub**: a single call that takes an order portion and a stand-in driver
  identifier and marks the portion collected, so the lifecycle can be exercised end to end today. It is a
  scaffold with a defined removal trigger, not a product capability — see FR-030…FR-034.**
- Q: **What are the fulfilment portion's actual working states?** FR-011 referred to "working states" without
  enumerating them. → **A: `pending → received → picking → ready_for_pickup`, plus the terminal
  `collected` reachable only via the dev-only pickup stub. `received` (already reserved by 019 and unused)
  means a human has acknowledged the order, which is what makes an untouched order distinguishable from
  one being actively worked.**
- Q: **Which shop roles may read and act on fulfilments?** FR-019 required "role AND status AND scope"
  without saying which role. → **A: Both `shop_manager` and `shop_staff` have full access — read the
  queue, transition states, and flag items unavailable. Fulfilment is floor work, and this slice contains
  no adjudicable decisions (accept/reject was clarified out), so a manager gate would add friction without
  adding judgement. The control is the audit trail (FR-015), not a role restriction.**
- Q: **Can a state transition be undone?** Unspecified, and material on a fat-finger tablet UI. → **A:
  Only `ready_for_pickup → picking` is reversible, and only while the portion has not been collected.
  All earlier transitions are forward-only (`received` is implicit on open, so reversing it is
  meaningless). Every reversal is audited like any other transition.**
- Q: **Does the customer see which items were unavailable, and when?** → **A: Item-level, but only once
  that portion reaches its terminal state. Showing flags live would expose mid-pick churn (an item flagged
  then un-flagged under FR-010d would appear to vanish and return), while hiding shortfalls entirely would
  let the customer discover the shortfall at the door. The customer is told a settled fact, per portion.**
- Q: **What does "most urgent first" mean for queue ordering?** The platform has no promised-time or SLA
  concept. → **A: Strict FIFO by arrival time, never reordered, plus a visual age escalation on orders
  past a threshold. Position is stable (a queue that shifts under an operator mid-shift is disorienting);
  prominence carries the urgency. Kitchen-display pattern.**
- Q: **AMENDS the previous answer — how does queue ordering work once orders carry different delivery
  promises?** Strict FIFO was correct only while every order had the same implicit promise; it breaks the
  moment a same-day order sits behind a multi-day one. → **A: Order by delivery promise urgency (soonest
  promised handoff first), tie-broken by arrival time. Both keys are immutable, so the stability property
  that motivated FIFO is preserved. Escalation is now promise-relative (at risk against the promise)
  rather than raw age. While only one promise exists, this collapses to FIFO automatically — see
  FR-001b.**
- Q: **Does the shop see the delivery promise, and does it own delivery pricing/zones?** → **A: The shop
  SEES the promise (service level + the time it must be ready by) because it drives prioritisation and
  packing. It does NOT own zones, methods, rates, or serviceability — those are
  **021-delivery-zones-pricing**, a separate slice. 020 consumes the promise read-only.**

---

## Assumptions

Recorded as reasonable defaults so the spec is buildable; each can be overridden in `/speckit-clarify`.

- **The event backbone is NOT built here.** 019 writes `order.placed` to a transactional outbox whose
  envelope is already shaped for a future SNS/SQS backbone, but nothing drains it. This slice reads the
  per-shop fulfilment records **directly** and leaves the outbox undrained; building the real event
  backbone (and its consumer dedup) remains its own later slice. This closes the fulfilment loop now
  without taking on messaging infrastructure.
- **"Near-real-time" means periodic refresh, not push.** Device push (FCM/APNs) belongs to the
  notifications slice, and mobile telemetry/push remains deferred platform-wide. A shop learns of new work
  by the queue refreshing while open, plus a clear in-app signal. Push can be layered on later without
  changing this feature's shape.
- **The shop audience may use BOTH backends** (operator decision, 2026-07-20): the cold path
  (`edge-api/shop`) and the hot path (`core-api`) are both available to shop surfaces, and the choice is
  driven by **latency and reliability need, not by audience**. It is explicitly acceptable for the same
  capability to exist on both paths serving different audiences. Live order intake is time-sensitive,
  which argues for the hot path even though the rest of the shop console is cold-path. **Which path serves
  which endpoint is a plan-level decision** and MUST be recorded with its justification in `plan.md`.
- **Fulfilment progresses per shop, independently.** A shop advances its own portion without waiting on
  another shop; any order-level view is derived from the portions rather than blocking them.
- **No inventory/stock model exists** and none is added — gathering an item does not decrement stock.
- **No customer notifications** (email/push) are sent by this slice; the customer sees progress only when
  they look at their order — including when an item is short.
- **Shortfalls create a real, deliberate debt.** Flagging an item unavailable means the customer paid for
  something they will not get, and this slice issues no refund. That is an accepted, time-boxed gap whose
  resolution is the refunds slice; it MUST be recorded in a way that makes the outstanding obligation
  queryable rather than buried.
- **The shop-mobile surface is foundation-only today** — its Orders tab is an explicit "coming soon"
  placeholder, and (per 018) its catalog UI was removed pending dedicated slices. This feature builds the
  Orders experience on that foundation and does not depend on the removed catalog screens.
- **The delivery promise is a first-class input, even though it is uniform today.** 019 ships a single
  flat fee and no service levels, so every order's promise is currently identical. The queue is
  nonetheless specified to order *by promise* (FR-001) rather than by arrival, so that 021 introducing
  same-day vs multi-day changes the **data**, not the fulfilment code. Building FIFO now and retrofitting
  urgency later would mean reworking the queue query, both UIs, and their tests.
- **shop-web has no Orders area at all today** — its console navigation is Dashboard / Catalog /
  Management. The Orders area is entirely net-new there.

## Dependencies

- **019 customer commerce flow** (signed off) — supplies the paid orders, the per-shop fulfilment records,
  the shop-attributed order items, and the immutable delivery-address snapshot this slice reads.
  ⚠ 019's own carry-forward stands: **no live purchase has yet been executed end to end**, so real
  fulfilment data must be produced (a test-card checkout) before live sign-off of this slice is possible.
- **007 shop web** and **009 shop management** — the shop record, shop staff, roles, and the working
  record-backed authorisation gate this slice reuses rather than reinvents.
- **014/018 shop mobile** — the tablet-first KMP surface and its shell, whose Orders tab this fills.
- **The hot path (`core-api`) is local-Docker only** — its cloud deployment is its own slice, so anything
  placed on the hot path here is locally verifiable but not live until that lands.
- **021-delivery-zones-pricing** (planned, ships AFTER this slice) — will own delivery zones (AU postcode
  lists), service levels, per-zone rates, ready-by/delivery windows, and address serviceability, replacing
  019's hardcoded flat `DeliveryFeeCents = 500`. **020 does not depend on 021 to ship**: until 021 lands,
  every order carries the same uniform promise and FR-001 degrades to FIFO (FR-001b). 020 must, however,
  model the promise as a *first-class read-only input* so 021 slots in without reworking the queue.
- The shared data-contract package both shop surfaces consume as a single source of truth.

## Out of Scope

- Driver assignment, dispatch, routing, and delivery tracking — **except** the temporary dev-only pickup
  stub (FR-030…FR-034), which is scaffolding scheduled for deletion, not a driver capability.
- **Resolving shortfalls**: refunds, credits, price adjustments, substitutions, cancellations, and
  re-orders. Shortfalls are *recorded* here and *resolved* by a later refunds slice.
- A shop declining an entire order portion (clarified out — unavailability is per item).
- Inventory/stock tracking or deduction.
- Customer-facing notifications (email/push) about fulfilment progress.
- The SNS/SQS event backbone and its outbox drainer.
- Back-office oversight of fulfilment across all shops (an admin slice).
- Shop performance analytics or SLA reporting.
- **Delivery zones, service levels, rates, windows, and address serviceability — all of 021.** This slice
  *consumes* a delivery promise read-only; it does not define, price, or validate one, and it does not
  touch 019's flat delivery fee.
- **Any modelling of who performs a delivery** (platform driver vs third-party service). The product does
  not expose this distinction and this feature MUST NOT introduce it.

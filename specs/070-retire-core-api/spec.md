# Feature Specification: Retire the Hot Path — One Serverless Backend

**Feature Branch**: `070-retire-core-api`

**Created**: 2026-10-04

**Status**: Draft

**Input**: User description: "i would like to do a full rewrite of core-api. i want to migrate that core-api completely to serverless api. because of the cost. and then i want to destroy containers, load balancers and everything related to core api. … we can try everything in TS and write everything in edge api. this must be a full migration. … at the end we do not need any api in core api. we can destroy core api."

## Context & Framing

Effy runs **two backends**. The **hot path** (`core-api`) is an always-on service behind a load
balancer; it serves everything a shopper does that involves the catalogue or money — browsing, search,
saved lists, cart, checkout, payment, orders, refunds — plus three narrow staff operations. The
**cold path** (`edge-api`) is pay-per-use and serves everything else. The split was made a
constitutional principle (Principle III) on the grounds that shopper traffic is latency-sensitive.

**The operator has decided to reverse that.** The platform is pre-launch, one environment exists, and
the always-on backend costs money every hour whether or not anyone is shopping. This feature moves
**every** capability of the hot path onto the pay-per-use backend, proves nothing was lost, and then
**removes the always-on backend entirely** — its running service, its load balancer, its image store,
its address, its source code and every reference to it.

**The overriding constraint is completeness.** A partial migration is the worst outcome: it keeps the
whole fixed cost while adding a second copy of the rules. The feature is finished only when the hot
path serves no request and nothing of it remains to pay for or maintain.

**The operator's priority is speed to a single working backend, not a guarded transition.** Because
nothing is live for real shoppers, the two backends are not run side by side and the old one is not
kept as a fallback. Defects found after the switch are fixed forward on the single backend.

**The second constraint is that money keeps working.** The hot path is where every payment is taken
and every refund issued. Those behaviours are proven by automated checks that will be deleted along
with the code. For the behaviours where an error costs money, the replacement must carry equivalent
proof before the original is removed.

**What this feature is:** a like-for-like relocation of behaviour, a small number of deliberate
repairs to defects that the inventory uncovered (listed under *Repairs*), and a teardown.

**What it is not:** a redesign of any shopper, shop or back-office screen; a change to any price,
fee, promotion or delivery rule; a schema redesign; or the standing-up of any new environment.

**Companion document:** [migration-inventory.md](migration-inventory.md) is the complete index of what
exists today — every operation, rule, consumer, automated check, cloud resource and document that this
feature must account for. This specification states *what must be true*; the inventory states *what is
there*. Every row of the inventory must end the feature either relocated, deliberately retired with a
recorded reason, or destroyed.

## Clarifications

### Session 2026-10-04

- Q: Should the migration be cut over in stages with both backends running side by side, or in one
  cut-over? → A: One cut-over. There is no production and no real shoppers, so the old backend is
  not kept as a fallback: everything is built on the single backend, all consumers switch at once,
  the old backend is destroyed, and verification and bug-fixing happen afterwards on the single
  backend.
- Q: When are the old backend's cloud resources destroyed — immediately, or after the rewrite?
  → A: After. The rewrite is built and deployed first while the old backend keeps running and the
  environment stays usable; the old backend is destroyed once the consumers have been switched.
- Q: What replaces the shop console's held-open live-update stream? → A: Nothing new. Live updates
  are dropped; the console keeps itself current by polling on its existing refresh interval. A
  cheaper way to restore prompt updates is deferred to a later feature.
- Q: Which of the defects found during indexing are repaired as part of this feature? → A: Three,
  plus one in passing. In scope: promo codes work; a payment-provider notification can no longer be
  lost; a refund left uncertain is recovered automatically; malformed catalogue requests are
  refused correctly. Deferred to a later feature: delivering the order-placed record, and cleaning
  up abandoned unpaid orders — both are carried over exactly as they behave today.
- Q: How much of the old backend's automated proof is rebuilt? → A: Proof for money and
  simultaneous-request behaviour (payment, delivery windows, stock, refunds, saved-item limits) is
  rebuilt against a real database; the existing checks on what the apps expect to receive are kept;
  the structural safeguards are re-pointed. Browsing, cart and list behaviour is covered by
  ordinary tests written with the new code and by the operator's manual walk — not by a
  one-for-one successor to every old test.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A shopper browses and searches exactly as before (Priority: P1)

A shopper — signed in or not, on the web storefront or the mobile app — opens the home page, browses
categories, searches, filters by price, brand and attributes, sorts, pages through results, opens a
product, opens a promotion, and checks whether their postcode is delivered to. Everything they see is
what they saw before the migration: the same products in the same order, the same badges, the same
counts beside each filter, the same wording.

**Why this priority**: Browsing is the entry to every other journey and the only part with no
sign-in, so it is both the highest-traffic surface and the safest to move first. It proves the
pay-per-use backend can carry public shopper traffic at acceptable speed before anything involving
money depends on it.

**Independent Test**: With only this story delivered, point the storefront's browsing at the new
backend while cart and checkout still use the old one. Walk home → category → search with filters →
product → promotion on web and mobile and compare each screen against the old backend for the same
data.

**Acceptance Scenarios**:

1. **Given** a catalogue with products on sale, new products and several categories, **When** a
   shopper opens the home page, **Then** they see the same banners and the same product rails, in the
   same order, as the old backend produced for the same data.
2. **Given** a search term and a combination of filters, **When** the shopper applies them,
   **Then** the result count, the order of results, and the count shown beside every filter option
   are identical to the old backend's.
3. **Given** a shopper paging through results, **When** they continue from page one to the end,
   **Then** no product is repeated or skipped, and changing the sort order mid-way starts cleanly
   rather than producing a mixed list.
4. **Given** a product that is out of stock, **When** it appears in a listing, **Then** it is still
   listed and marked unavailable, and it does not appear in a home-page rail.
5. **Given** a shopper who enters a postcode, **When** they check delivery, **Then** they are told
   whether Effy delivers there, and a malformed postcode is refused with a clear message.
6. **Given** a link to a product or promotion that does not exist, **When** it is opened, **Then**
   the shopper sees "not found" — never a "service unavailable" message.

---

### User Story 2 - A signed-in shopper's saved lists and cart behave exactly as before, and promo codes work (Priority: P1)

A signed-in shopper saves products, organises them into named lists, moves a list into the cart,
adds, changes and removes cart lines, sets items aside for later, re-orders a past order, and signs in
on a second device to find the same cart and lists. They enter a promo code and see the discount.

**Why this priority**: The cart is the precondition for every sale. It also carries the feature's
first deliberate repair — applying a promo code does not work today on either the web storefront or
the mobile app, and this story is where it starts working.

**Independent Test**: With stories 1 and 2 delivered, a shopper can build a cart, apply a code and see
correct totals across two devices, with checkout still served by the old backend.

**Acceptance Scenarios**:

1. **Given** a shopper adding an item, **When** the same request is delivered twice (a double tap or
   a retry on a poor connection), **Then** the item is added once.
2. **Given** a shopper with items in a cart built while signed out, **When** they sign in, **Then**
   the two carts are combined, keeping the larger quantity of any product in both.
3. **Given** a product whose price has changed since it was added, **When** the cart is viewed,
   **Then** the current price is shown and the shopper is told it changed.
4. **Given** a product with less stock than the quantity in the cart, **When** the cart is viewed,
   **Then** the quantity offered is limited to what is available and the shopper is told.
5. **Given** a valid promo code, **When** the shopper applies it, **Then** the discount appears on
   the cart and carries through to the amount charged; **When** they remove it, **Then** it is gone.
   An invalid, expired or exhausted code is refused with the reason.
6. **Given** a shopper at the limit of saved products or of named lists, **When** they try to add
   one more, **Then** they are refused with the limit stated, and two simultaneous attempts from two
   devices cannot both succeed.
7. **Given** a shopper who moves a whole list into the cart, **When** the request is retried,
   **Then** no line is added twice, and any item that could not be added is reported with its reason.
8. **Given** a cart below the minimum order value, **When** it is viewed, **Then** checkout is shown
   as blocked with the amount still needed.

---

### User Story 3 - A shopper pays once, is charged the right amount, and the order always arrives (Priority: P1)

A shopper chooses an address, sees the delivery options and fee, picks a same-day window or a
standard delivery day, pays with a new or saved card, and lands on a confirmation. The shop sees the
order, the shopper gets a receipt, stock goes down, and the delivery window they chose is theirs.

**Why this priority**: This is where money moves. An error here charges a shopper twice, charges them
without creating an order, or sells the same delivery place twice. It is the highest-risk part of the
migration and the part with the most proof to re-establish.

**Independent Test**: With stories 1–3 delivered, complete a same-day order and a standard order end
to end on web and mobile using the payment provider's test mode, including deliberately interrupted
and repeated attempts, and verify the resulting order, charge, stock, booking, receipt and shop
notification each exist exactly once.

**Acceptance Scenarios**:

1. **Given** a shopper at checkout, **When** they request delivery options, **Then** they see the
   same packages, fees, open same-day windows and available standard days as the old backend would
   give for the same cart, address and moment.
2. **Given** a shopper who starts payment, abandons it, and starts again with the same cart,
   **Then** one order and one charge exist, not two.
3. **Given** a shopper who starts payment for a same-day window, **Then** a place in that window is
   held for them for the configured hold period, and another shopper cannot take the last place
   during it.
4. **Given** a window that fills, closes or becomes unreachable between the shopper seeing it and
   paying, **When** they start payment, **Then** they are told specifically why and shown the
   current options.
5. **Given** a successful payment, **When** the confirmation arrives by any route — the provider's
   notification, the shopper's return to the site, or a later retry — and however many times,
   **Then** exactly one of each of these results: the order becomes paid, each fulfilling shop gets
   its portion, the delivery place is confirmed, stock is reduced, shop staff are notified, the
   shopper is notified, a receipt is queued, the promo use is recorded, and the cart is emptied.
   Either all of these happen or none do.
6. **Given** a shopper whose hold expired on a now-full window but whose payment then succeeded,
   **Then** their order is honoured and flagged as over capacity, rather than refused after being
   charged.
7. **Given** a payment notification from the provider that cannot be processed because of a
   temporary fault, **When** the provider sends it again, **Then** it is processed — it is never
   discarded as "already seen".
8. **Given** a notification that does not carry the provider's valid signature, **Then** it is
   rejected and changes nothing.
9. **Given** a shopper viewing saved cards, **When** the payment provider is unreachable, **Then**
   they see an error — never an empty list implying their cards are gone. A shopper can remove only
   their own cards.
10. **Given** any request to start payment, **Then** the amount charged is computed by the platform
    from current prices, the current fee and the current discount; no amount supplied by the
    shopper's device is ever used.

---

### User Story 4 - Orders can be viewed, cancelled and refunded by everyone who could before (Priority: P2)

A shopper views their orders and their progress, cancels an order that has not yet been picked, or
asks for a refund. A back-office manager issues an item or goodwill refund, cancels an order, or
declines a refund request. A shop manager refunds lines their own shop could not supply.

**Why this priority**: Refunds move money outward and are issued by three different audiences with
three different sets of permissions. They depend on payments existing (story 3) and are lower in
volume, but an error is as costly.

**Independent Test**: With stories 1–4 delivered, place an order, then exercise each of the six
refund and cancellation actions from its proper audience, plus each from an improper one, in the
payment provider's test mode.

**Acceptance Scenarios**:

1. **Given** a shopper viewing an order, **Then** its stage, whether it can be cancelled, and its
   refunded total match what the old backend reported for the same order.
2. **Given** a shopper trying to open or cancel another shopper's order, **Then** they are told it
   does not exist — never that it is forbidden.
3. **Given** refunds already issued against an order, **When** anyone tries to refund more than
   remains, **Then** it is refused stating the amount that remains; two simultaneous refunds cannot
   together exceed what was paid.
4. **Given** a refund request that is repeated, **Then** one refund is issued.
5. **Given** a refund whose submission to the payment provider had an uncertain outcome, **Then**
   the staff member is told it is unresolved, and it is later brought to a definite result without
   anyone intervening.
6. **Given** a shop manager, **When** they refund, **Then** they can refund only lines their own
   shop fulfils, on orders their shop has a part in; shop staff who are not managers cannot refund.
7. **Given** a shopper cancelling an order, **When** any part of it has already been picked,
   **Then** the cancellation is refused; when it succeeds, the order's delivery place is released
   and every shop portion is withdrawn.
8. **Given** a shopper with an open refund request, **When** they submit another for the same order,
   **Then** it is refused as already open.

---

### User Story 5 - A shop still sees new orders without the always-on stream (Priority: P2)

A shop operator has the console's Today view open. A shopper pays. The new order appears on the
operator's screen at the console's next regular refresh, without the operator doing anything.

**Why this priority**: Today a new order appears within seconds because the console holds a
connection open to the always-on backend — the one capability that cannot be relocated, because the
pay-per-use backend cannot hold a connection open. The operator has chosen to drop it for now and
rely on the console's existing periodic refresh, accepting a slower appearance; shop staff are
still alerted to a new order by the existing push notification.

**Independent Test**: With the Today view open in one browser, complete a payment in another and
confirm the order appears at the next refresh with no error shown and no manual reload.

**Acceptance Scenarios**:

1. **Given** a shop console open on Today, **When** an order for that shop is paid, **Then** it
   appears without any action by the operator within the time promised in the success criteria.
2. **Given** the live-update stream no longer exists, **When** the console is opened, **Then** it
   makes no attempt to connect to one, shows no connection error or "reconnecting" state, and does
   not present itself as live.
3. **Given** a console left open all day, **Then** it continues refreshing at its regular interval
   and stops being served within a few minutes of the operator's access being withdrawn.

---

### User Story 6 - The operator can still mint the first administrator and load reference data (Priority: P2)

On a fresh environment, or after locking themselves out, the operator runs the break-glass tool to
create the first administrator, can remove an administrator (but never the last active one by
accident), and can load the list of localities that address search depends on.

**Why this priority**: These tools live inside the hot path's source and are run from it. Deleting
the hot path without rehoming them removes the only way into the back office on a new environment.
They are rarely used, which is exactly why their loss would not be noticed until it mattered.

**Independent Test**: On a disposable environment with no administrators and no localities, run each
tool from its new home and confirm the administrator can sign in and address search returns results.

**Acceptance Scenarios**:

1. **Given** no administrators, **When** the operator runs the create tool with a name and email,
   **Then** that person can sign in to the back office with full rights; running it again changes
   nothing.
2. **Given** exactly one active administrator, **When** the operator tries to remove them without
   explicitly overriding, **Then** the tool refuses.
3. **Given** an empty locality list, **When** the operator runs the load tool, **Then** address
   search returns suburbs; running it again creates no duplicates.

---

### User Story 7 - The operator removes the always-on backend and the bill drops (Priority: P1 — the purpose of the feature)

As soon as the single backend carries every capability and the consumers have been switched to it,
the operator runs a prepared teardown — without waiting for a full verification pass. Afterwards the
always-on service, its load balancer, its image store and its address are gone; the monthly bill no
longer carries them; and nothing in the repository, the documentation or the cloud account refers to
a hot path as something that exists.

**Why this priority**: It is the reason for the whole feature; stories 1–6 deliver no saving on
their own. The operator has chosen to reach it quickly and verify afterwards, accepting that the
environment may be partly broken for a period while defects are fixed forward.

**Independent Test**: After teardown, re-walk every journey from stories 1–6; list the environment's
always-on resources; search the repository for the retired backend's name; read the next monthly
bill.

**Acceptance Scenarios**:

1. **Given** every capability built on the single backend and every consumer switched to it,
   **When** the operator runs the teardown, **Then** it completes in a single pass without manual
   clean-up of leftovers.
2. **Given** the teardown complete, **Then** the things other parts of the platform share with the
   retired backend — the database, the web address certificate, the payment credentials, product
   images, sign-in — are untouched, and every journey in stories 1–6 is then walked on the single
   backend, with each defect found recorded and fixed there until the walk passes.
3. **Given** the teardown complete, **When** the operator runs the routine that pauses the
   environment's database overnight, **Then** it still pauses the database.
4. **Given** a defect discovered after the switch, **Then** it is fixed on the single backend;
   there is no return to the old one.
5. **Given** the feature complete, **Then** the constitution, the architecture reference, the
   product brief and the project guide all describe one backend, and no structural safeguard has
   been lost merely because the code it used to read was deleted.

---

### Edge Cases

- **The first request after a quiet period is slow.** A pay-per-use backend that has been idle takes
  longer on its first request. A shopper's first page, and a payment notification arriving after an
  idle night, must still succeed within the bounds in the success criteria.
- **A burst of shoppers arrives at once.** The database accepts a limited number of simultaneous
  connections, shared with the shop, driver and back-office surfaces. A shopper burst must degrade
  shopper traffic gracefully — a clear "try again" — and must not lock staff or drivers out.
- **A payment step is cut off mid-way.** A request that runs out of time after the payment provider
  has acted but before the platform recorded it must be recoverable to a single correct state.
- **A refund is cut off mid-submission.** It must not be left permanently unresolved.
- **The payment provider sends notifications out of order or more than once.**
- **A refund is made directly in the payment provider's own dashboard**, with no corresponding
  platform action: it must still be recorded against the order.
- **Daylight-saving changeover.** Same-day cut-offs, window times and standard delivery days are
  judged in Melbourne time and must be correct on the changeover days.
- **A shopper is barred, or closing their account.** Every signed-in shopper operation refuses them
  consistently; an unknown shopper is treated as not signed in.
- **Money with more than two decimal places**, a percentage discount that does not divide evenly, a
  discount larger than the cart: each resolves exactly as it does today.
- **A list or cart request naming a product that no longer exists** or is no longer sold.
- **An installed mobile build that still points at the retired address** after teardown.
- **A journey found broken after the old backend is gone.** There is no fallback; the environment
  stays in that state until the defect is fixed, which is accepted because no real shopper is
  affected.
- **Clients switch on refusal reasons.** A refusal whose reason code changes even slightly silently
  breaks the screen that handles it.

## Requirements *(mandatory)*

### Functional Requirements

#### Governance — before anything moves

- **FR-001**: The constitution MUST be amended, as a major revision, to replace the dual-path
  principle with a single-backend principle before any hot-path capability is relocated. The
  amendment MUST record why the original reasoning no longer holds and what is being traded.
- **FR-002**: Every governing or descriptive document that states the platform has two backends, or
  assigns a capability to the hot path, MUST be corrected to describe one backend: the architecture
  reference, the product brief, the path-assignment guide, the error and versioning guides, the
  project guide, and the rule embedded in the cold path that forbids commerce operations there.
- **FR-003**: Statements found to be untrue during the inventory MUST be corrected in the same pass:
  that a metrics-and-dashboards stack is running (none was ever built); that device registration is
  on the hot path (it is not); that the hot path has no cloud deployment.

#### Completeness

- **FR-004**: Every operation listed in the migration inventory MUST end the feature in exactly one
  recorded state: relocated and verified; deliberately retired with a stated reason; or replaced by
  a named equivalent. No operation may simply disappear.
- **FR-005**: Every business rule that exists only in the hot path today MUST be re-established on
  the single backend with the same results for the same inputs: delivery fee calculation and
  quoting; delivery zones and postcode serviceability; same-day window eligibility, holds, capacity
  and cut-off; available standard delivery days; minimum order value and cart ceilings; promotion
  eligibility and discount arithmetic; whether a product is purchasable; saved-item and list limits;
  the catalogue search, ordering and filter-counting rules; and the scope within which a shop
  manager may refund.
- **FR-006**: Where a rule currently exists in two copies kept in step by a cross-check, the feature
  MUST leave exactly one copy.

#### Behaviour parity

- **FR-007**: For every relocated operation, a client MUST observe the same outcomes as before: the
  same information in the same shape, the same distinction between "absent", "empty" and "not
  provided", the same success and refusal outcomes, and the same refusal reason codes.
- **FR-008**: Access rules MUST be unchanged: which operations are open to the public; which need a
  signed-in shopper; which need back-office staff with authority to move money; which need a shop
  manager. A credential issued for one audience MUST NOT be accepted for another.
- **FR-009**: A shopper MUST NOT be able to learn whether another shopper's order, list or saved
  card exists; such requests are answered as "not found".
- **FR-010**: Every failure to sign in MUST look the same to the caller regardless of cause.
- **FR-011**: Signed-in shopper operations MUST refuse a barred shopper and a shopper whose account
  is closing, on every operation without exception.
- **FR-012**: Staff authority to move money MUST be decided from the platform's own staff records at
  the moment of the request, not solely from what the sign-in credential claims. "Could not check"
  MUST be distinguishable from "not allowed".

#### Money and concurrency

- **FR-013**: Every monetary calculation MUST be exact to the cent, with each existing rounding rule
  preserved — in particular, a percentage discount rounds in the platform's favour to the cent and
  never exceeds the cart subtotal.
- **FR-014**: The amount charged MUST be computed by the platform; a client-supplied amount MUST
  never be used.
- **FR-015**: Starting payment more than once for the same unpaid cart MUST NOT create more than one
  order or more than one charge.
- **FR-016**: Recording a successful payment MUST be all-or-nothing and MUST take effect exactly
  once however many times and by whichever routes confirmation arrives. Its effects are those
  enumerated in story 3, scenario 5.
- **FR-017**: A delivery window MUST NOT be sold beyond its capacity through simultaneous checkouts.
  A shopper who pays after their hold lapsed on a now-full window MUST be honoured and flagged.
- **FR-018**: Stock MUST NOT be reduced below zero; a line that could not be fully supplied MUST be
  flagged for the shop; simultaneous orders for the same products MUST NOT deadlock.
- **FR-019**: The total refunded against an order MUST NOT exceed the amount paid, including under
  simultaneous refunds, and a repeated refund request MUST issue one refund.
- **FR-020**: Every cart change MUST be safe to repeat.
- **FR-021**: Changes to one shopper's saved items and lists MUST be applied one at a time, so that
  limits cannot be exceeded by simultaneous requests.

#### Repairs (deliberate changes of behaviour)

- **FR-022**: Shoppers MUST be able to apply and remove a promo code on web and mobile. *(Today both
  clients call an operation the hot path never exposed.)*
- **FR-023**: A notification from the payment provider MUST be marked as handled only once it has
  been handled. A notification that fails for a temporary reason MUST be accepted again when resent.
  *(Today it is marked first, so a resend after a temporary fault is discarded; refund notifications
  lost this way are never recovered.)*
- **FR-024**: A refund left in an uncertain state MUST be brought to a definite outcome
  automatically within a bounded time. *(Today nothing does this.)*
- **FR-025**: A catalogue request with a malformed product reference or price bound MUST be refused
  as the caller's error, not reported as the service being unavailable.
- **FR-026**: The record that an order was placed MUST continue to be written exactly as today, as
  part of recording a successful payment. Delivering it anywhere is **out of scope** and deferred;
  it remains undelivered, as it is today, and this is recorded as a known gap.
- **FR-027**: Unpaid orders abandoned at checkout are **not** cleaned up by this feature; that is
  deferred and recorded as a known gap. Their delivery holds already lapse on their own and MUST
  continue to.

#### Shop console freshness

- **FR-028**: The held-open live-update stream MUST be removed, together with everything that exists
  only to feed it. The shop console's Today view MUST instead stay current by polling on its
  existing refresh interval, with no operator action and no connection held open.
- **FR-029**: The console MUST NOT attempt to open the removed stream, MUST NOT show an error or a
  "reconnecting" state for its absence, and MUST NOT describe itself as live. The earlier promise
  that a new order appears within 10 seconds is withdrawn and recorded as such; restoring prompt
  updates by a cheaper means is out of scope and deferred to a later feature.

#### Capacity, speed and visibility

- **FR-030**: Shopper traffic MUST NOT be able to exhaust the database's capacity for simultaneous
  connections to the exclusion of shop, driver and back-office traffic. Under overload, shopper
  requests MUST fail fast with a retryable refusal.
- **FR-031**: The speed targets previously attributed to the hot path MUST be restated against the
  single backend and met (see success criteria). Slower first requests after idleness MUST be
  bounded and stated.
- **FR-032**: Every operational measurement the hot path records today MUST continue to be recorded:
  delivery quotes and their failures; serviceability checks; window bookings by outcome; standard
  dates refused; stock deducted and stock-blocked events; refunds issued, their outcomes and
  submission failures; cancellations by who cancelled; shop refunds denied; request counts, failures
  and durations per operation.
- **FR-033**: The four alert definitions written against those measurements — which have never been
  live — MUST become live alerts that reach the operator's approved operational mailbox.
- **FR-034**: Logs and measurements MUST NOT contain payment details, shopper-authored text
  (including list names and delivery instructions), or any personal data beyond the signed-in
  identifier.

#### Proof

- **FR-035**: Before the hot path's code is removed, the behaviours where an error costs money or
  cannot be seen by using the product MUST be protected on the single backend by checks that run
  against a real database, including under simultaneous requests: recording a payment exactly once;
  delivery window capacity, holds and the over-capacity path; stock deduction; the refund ceiling
  and repeated refunds; cancellation; saved-item and list limits; and the handling of
  payment-provider notifications. A one-for-one successor to every other existing check is **not**
  required: browsing, cart and list behaviour is covered by ordinary tests written alongside the
  new code and by the verification walk.
- **FR-036**: Structural safeguards that work by scanning the hot path's code MUST be re-pointed so
  their protection survives: that refund records are only ever appended to; that stock movements
  are only ever appended to; that no shopper-facing response reveals which shop fulfils an order;
  that "is this product purchasable" is decided in one place; that no code refers to a removed
  database column; that every setting the backend needs is declared where it is deployed.
- **FR-037**: The contract checks that pin what the mobile apps and web storefront expect to receive
  MUST pass against the single backend without being weakened.

#### Cut-over

- **FR-038**: The migration MUST be delivered as one cut-over: every capability is built on the
  single backend, then all four consumers are switched together. The two backends are not required
  to serve shoppers side by side.
- **FR-039**: No fallback to the old backend is required. Defects found after the switch MUST be
  fixed on the single backend.
- **FR-040**: Every consumer — web storefront, customer mobile app, shop console, back office — MUST
  be re-pointed and rebuilt; after cut-over none may hold a setting naming the retired backend, and
  a consumer MUST NOT fail to start because such a setting is absent.
- **FR-041**: The address the payment provider sends notifications to MUST be changed by the
  operator as an explicit, ordered step, with no interval in which notifications go nowhere.
- **FR-042**: The full verification walk of stories 1–6 MUST be carried out on the single backend
  and recorded, with every defect found fixed, before the feature is declared complete. It is a
  condition of completion, not of teardown.

#### Teardown

- **FR-043**: Teardown MUST NOT begin until every capability in the migration inventory has been
  built and deployed on the single backend and all four consumers have been switched to it; until
  then the old backend keeps running unchanged so the environment remains usable. Teardown MUST NOT
  additionally depend on the verification walk having passed.
- **FR-044**: Teardown MUST remove everything that exists only for the hot path — the running
  service, the load balancer, the image store and its images, their access roles, logs, address
  records, published settings, and the settings injected into the three web applications — and MUST
  leave intact everything shared.
- **FR-045**: Teardown MUST be authored for the operator to run and MUST complete in one pass;
  known obstacles (stored images blocking removal; mutually dependent settings) MUST be handled in
  the prepared steps rather than discovered.
- **FR-046**: The environment's database pause-and-resume routines MUST keep working after
  teardown. *(Today the pause routine addresses the always-on service first and would stop before
  pausing the database once that service is gone — silently leaving the database billing.)*
- **FR-047**: The operator tools in story 6 MUST be runnable from a home that survives teardown.
- **FR-048**: Local development and helper routines that start, test, build, tunnel to or forward
  payment notifications to the hot path MUST be removed or re-pointed.
- **FR-049**: The hot path's source MUST be deleted, and with it any local file holding payment
  test credentials; the operator MUST be told to rotate those credentials if they were ever shared.
- **FR-050**: After the feature, the retired backend's name MUST NOT appear anywhere in the
  repository outside historical records (past specifications, the feature history, and already-
  applied database change scripts, which are never edited).

### Key Entities

No new business entities are introduced and no existing entity changes meaning. The feature
relocates the behaviour that reads and writes these:

- **Catalogue**: products, their images, categories, attributes and promotions, as shoppers see them.
- **Saved item / List**: a shopper's saved products and named groupings of them, with limits.
- **Cart**: a shopper's lines, set-aside items, applied promotion, and the record of changes already
  applied (what makes a repeated change harmless).
- **Order**: what was bought, at what price, to which address, with which delivery choice; its
  payment; its portion per fulfilling shop.
- **Delivery window booking**: a place in a same-day window — held, confirmed, released, or
  confirmed over capacity.
- **Payment and provider notification**: the charge, and the record of each notification received
  and whether it has been handled.
- **Refund and refund request**: money returned, by whom, why, in what state; and a shopper's
  request for one.
- **Stock movement**: the appended-only history of stock changes.
- **Notification request / receipt dispatch / order-placed record**: the queued consequences of a
  payment.
- **Staff record**: the platform's authoritative record of who may do what.

One thing may need a small supporting record that does not exist today: the *handled / not handled*
state of a provider notification (FR-023). Its shape is a planning decision.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The environment has **zero always-on compute** other than the database. The monthly
  bill no longer carries the load balancer, the always-on service, the image store or their public
  addresses — a reduction of at least the documented ~US$30 per month.
- **SC-002**: **100%** of the operations in the migration inventory are accounted for as relocated,
  retired-with-reason or replaced; **none** is unaccounted for.
- **SC-003**: For a fixed set of catalogue data, **every** browsing and search response examined in
  the verification walk matches the old backend's for the same request — same items, same order,
  same counts.
- **SC-004**: **95%** of searches and filter changes return within **1 second** and **99%** within
  **2 seconds**, measured on a warm backend against the catalogue size previously targeted.
- **SC-005**: A shopper's full saved list at its maximum size is shown within **2 seconds**.
- **SC-006**: Starting payment completes within **6 seconds** for 95% of attempts — half the
  client's existing patience — including on the first request after idleness.
- **SC-007**: A shopper's first page after the backend has been idle arrives within **4 seconds**;
  subsequent pages meet the normal targets.
- **SC-008**: Across **200** test-mode checkouts including deliberately repeated, interrupted and
  simultaneous attempts, there are **zero** double charges, **zero** paid orders missing any of
  their consequences, and **zero** windows sold beyond capacity without the over-capacity flag.
- **SC-009**: Across **100** provider notifications delivered with injected temporary faults,
  duplicates and re-ordering, **100%** end correctly handled and **none** is lost.
- **SC-010**: Across simultaneous refund attempts on one order, the total refunded **never** exceeds
  the amount paid; every refund left uncertain reaches a definite state within **15 minutes**.
- **SC-011**: Promo codes can be applied and removed on web and mobile, and the discounted amount
  equals the amount charged, in **100%** of verification cases.
- **SC-012**: A newly paid order appears on an open shop console, with no operator action, within
  **30 seconds** — the console's existing refresh interval. (This knowingly relaxes the 10-second
  promise the retired stream made.)
- **SC-013**: With shopper traffic driven to overload, shop, driver and back-office requests
  continue to succeed at their normal rate.
- **SC-014**: **Every** money and simultaneous-request behaviour named in FR-035, and **every**
  structural safeguard named in FR-036, has a passing automated check on the single backend before
  the old backend's code is deleted; the app-facing contract checks pass unweakened.
- **SC-015**: A search of the repository for the retired backend's name, outside historical
  records, returns **nothing**; a listing of the environment's resources shows **none** belonging
  to it.
- **SC-016**: The verification walk — every journey in stories 1–6, on every consuming surface —
  passes in full on the single backend, with **zero** known defects left open when the feature is
  declared complete.
- **SC-017**: The governing documents describe one backend, and a reader following them encounters
  **no** instruction that refers to a component that does not exist.

## Assumptions

- **Pre-launch.** There are no real shoppers. Every installed build of the customer mobile app is an
  operator test build and will simply be rebuilt; no compatibility address is kept alive for old
  builds. If this is wrong, a transition address is required and SC-001 is delayed.
- **One environment.** Only the development environment exists; production is designed for but not
  stood up. The previously recorded production prerequisites specific to the hot path lapse.
- **Speed is being traded for cost, knowingly.** The single backend is expected to be somewhat
  slower per request than the always-on one, and noticeably slower on the first request after
  idleness. The targets above are the floor the operator accepts; if they cannot be met, the feature
  returns to the operator rather than quietly relaxing them.
- **No data migration.** Both backends already share one database. No shopper, order or payment
  data moves or changes shape; any supporting record added is additive.
- **The payment provider, its account and its credentials are unchanged.** Only the address it
  notifies changes, and only the operator can change it.
- **Operational alerts go to the approved operational mailbox** (`workspace-admin@effyshopping.com`),
  as existing alerts do. No other address is introduced.
- **The diagnostic "hot path reachability" page and its supporting operation are retired**, not
  relocated: they exist only to prove the retired backend is reachable.
- **Operations with no caller are still relocated.** Postcode serviceability, locality search,
  platform status and back-office order cancellation have no consuming screen today but are
  specified by earlier features; they move rather than being dropped.
- **Division of labour is unchanged.** Claude authors all code, infrastructure definitions and the
  teardown steps; the operator runs every deployment, every infrastructure change, and the change
  at the payment provider.
- **Dependencies:** the existing shared gateway, sign-in pools, database and notification workers;
  the payment provider's test mode for verification; operator availability for the cut-over and
  the teardown.

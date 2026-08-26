# Feature Specification: Order Confirmation & Emailed Receipt

**Feature Branch**: `052-order-confirmation-invoice`

**Created**: 2026-08-26

**Status**: Draft

**Input**: User description: "next we need to re design the Order complete (Thank you page). currently it just not like a invoice. so what i want is that a full redesign of this thank you page, like a modern e commerce site. so you can use claude design to design new modern, professional, industry standard web page and mobile app view for this ui. (can gave colors, badges or anything. etc...) then we need to send the invoice to the customer email as well. so we should design a good invoice email template and setup the email service to send the invoice to the customer. both web app and mobile app should have this. take time do the research, do the design and then we can implement!"

---

## Context: what exists today, and why it falls short

A shopper who pays today lands on a page that says **THANK YOU**, lists product names against line
totals, shows three summary rows, restates the delivery address, and offers two buttons. The mobile
receipt shows approximately the same thing in a single scrolling column. Neither is wrong; both are
**incomplete as a record of a purchase**.

Against what a person actually needs from a purchase record, the current page omits: the **date and
time** of the order, **how it was paid**, **when it will arrive**, **what happens next**, **where to
get help**, any **seller identity** beyond a logo, per-item **unit prices** (only line totals are
shown), item **imagery**, order **status**, and any way to **keep a copy**. Nothing is emailed at all
— the shopper's only copy of the transaction is a browser tab they are about to close.

That last point is the sharpest one. A confirmation email is the single most-opened message in
e-commerce and is treated as the default proof of purchase. The platform has been able to render one
since **038** — `order-confirmation` was authored as the deliberate "data-heavy proof" template and
shipped with **no call site**, waiting for the slice that owns order notifications. This is that
slice.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — A shopper finishes paying and gets a real record (Priority: P1)

A customer completes payment on the web storefront. Instead of a thin thank-you note, they land on a
document that reads like a professional receipt: a clear paid confirmation, the order number and the
exact date and time it was placed, every item with its image, unit price, quantity and line total,
a totals block where every line adds up to the amount charged, how it was paid, where it is going,
when it is expected, what happens next, and where to get help.

**Why this priority**: This is the moment the shopper decides whether Effy is a serious business. It
is also the only screen where the platform can answer "did that work, and what did I just buy?"
without the shopper having to go looking. Every other story in this slice is a copy of this document
delivered somewhere else.

**Independent Test**: Complete a paid order on the web storefront and confirm the completion page
renders every element above from the platform's own record of the order, with the totals reconciling
to the amount charged.

**Acceptance Scenarios**:

1. **Given** a customer has just paid for an order, **When** they land on the order-complete page,
   **Then** they see a prominent paid confirmation, the order number, and the placed date and time in
   the customer's local reading format.
2. **Given** an order with multiple items, **When** the confirmation renders, **Then** each item
   shows its image, name, unit price, quantity and line total, and the sum of the line totals equals
   the stated items subtotal.
3. **Given** an order with a delivery fee and/or a promotional discount, **When** the confirmation
   renders, **Then** each of those appears as its own labelled line and items subtotal minus discount
   plus delivery equals the grand total shown.
4. **Given** an order paid by card, **When** the confirmation renders, **Then** it states the payment
   method in a recognisable, non-sensitive form (for example the card brand and its last four digits,
   or the wallet name) and never any other card data.
5. **Given** an order with a known delivery promise, **When** the confirmation renders, **Then** it
   states when the order is expected and which delivery method was chosen, using the promise captured
   at checkout.
6. **Given** any confirmed order, **When** the confirmation renders, **Then** it shows a "what happens
   next" progression and a visible route to help.
7. **Given** an order whose payment has not completed, **When** the shopper reaches the page, **Then**
   they see the existing waiting or not-completed state and **no** receipt document, and their basket
   is not emptied.

---

### User Story 2 — The same record, in the mobile apps (Priority: P1)

A customer who pays inside the mobile app sees the same document, laid out natively for a phone: the
same facts, the same order, the same totals, in a layout designed for a single column and a thumb.

**Why this priority**: The platform's parity rule is that a customer capability exists on both
customer surfaces or it does not exist. More than half of grocery purchases happen on a phone, and
the mobile receipt is currently the thinner of the two.

**Independent Test**: Complete a paid order in the mobile app and confirm the receipt screen carries
the same set of facts as the web confirmation, with no field present on one surface and missing on the
other.

**Acceptance Scenarios**:

1. **Given** a customer pays in the mobile app, **When** the receipt screen appears, **Then** it shows
   the same fact set as the web confirmation (paid state, order number, placed date/time, itemised
   lines with unit price, reconciling totals, payment method, delivery address, delivery promise,
   what-happens-next, help route).
2. **Given** the receipt screen is open, **When** the shopper pulls to refresh, **Then** the order's
   progress is re-read and the screen updates without losing its place.
3. **Given** a customer opens a past order from order history, **When** the screen renders, **Then**
   it is the same document, with navigation appropriate to arriving from history rather than from
   checkout.

---

### User Story 3 — The receipt arrives by email (Priority: P1)

Within moments of payment, the customer receives an email containing the complete itemised record —
readable on a phone, in dark mode, and in an email client that strips images — with a link back to the
order.

**Why this priority**: This is the half of the request that the platform genuinely cannot do at all
today. A shopper who closes the tab currently has nothing. It is also the customer's proof of purchase
for a dispute, a refund request, or their own records.

**Independent Test**: Pay for an order and confirm a single, correctly rendered receipt email arrives
at the customer's account address, with the same figures as the on-screen confirmation.

**Acceptance Scenarios**:

1. **Given** an order transitions to paid, **When** the platform processes that fact, **Then** exactly
   one receipt email is sent to the address on the customer's account.
2. **Given** the paid transition is processed more than once (a retried or re-delivered payment
   notification), **When** the platform processes it again, **Then** no second email is sent.
3. **Given** a receipt email, **When** it is opened, **Then** it carries the order number in its
   subject, every line item, the reconciling totals, the delivery address, the delivery promise, the
   seller identity block, and a link to view the order.
4. **Given** a receipt email, **When** it is read as plain text or with images blocked, **Then** every
   figure and every link remains legible and usable.
5. **Given** a receipt email, **When** it is opened in a dark-mode client, **Then** all text remains
   legible against its background.
6. **Given** a large basket, **When** the receipt email is generated, **Then** it renders within the
   platform's email size budget without being truncated by mail clients.
7. **Given** the email cannot be sent, **When** the failure occurs, **Then** the order remains paid and
   the customer's on-screen confirmation is unaffected, and the failure is recorded for operators.

---

### User Story 4 — Getting the copy back (Priority: P2)

A customer who deleted the email, or who paid as one of several people using an inbox, can send
themselves the receipt again from the order, on either surface.

**Why this priority**: A receipt nobody can re-obtain is a support ticket. It is small to build once
the document and the send path exist, and it turns the most common receipt-related contact into a
self-service action.

**Independent Test**: Open a past paid order on either surface, request the receipt again, and confirm
it arrives at the account address.

**Acceptance Scenarios**:

1. **Given** a paid order, **When** the customer chooses to resend the receipt, **Then** it is sent to
   the address on their account and they are told it has been sent.
2. **Given** a customer requests the receipt repeatedly, **When** they exceed a reasonable frequency,
   **Then** further requests are refused with a clear explanation and no email is sent.
3. **Given** an order that is not paid, **When** a resend is attempted, **Then** it is refused.
4. **Given** an order belonging to another customer, **When** a resend is attempted, **Then** it is
   refused without disclosing whether that order exists.

---

### User Story 5 — Honest about what the document is (Priority: P2)

An Australian shopper who needs the document for their own tax or expense records can see at a glance
what it is and what it is not, and an operator can see exactly what is missing before it can be a
compliant tax invoice.

**Why this priority**: Effy sells in Australia, prices GST-inclusive, and the request used the word
"invoice". A document that looks like a tax invoice but is not one is worse than one that says so.
This story is what keeps the slice truthful without blocking it.

**Independent Test**: Confirm the document states its own status, carries a seller identity block, and
that the tax-invoice-specific fields are absent rather than fabricated.

**Acceptance Scenarios**:

1. **Given** any receipt (on screen or emailed), **When** it renders, **Then** it carries a seller
   identity block naming the trading entity and a support contact.
2. **Given** the platform's legal identifiers are not yet supplied, **When** the receipt renders,
   **Then** it does **not** display an entity registration number, does **not** state a tax amount,
   does **not** claim to be a tax invoice, and the document is not blocked from rendering.
3. **Given** a shopper reads the receipt, **When** they look for its status, **Then** a plain
   statement tells them this is a record of payment and how to obtain a tax invoice.
4. **Given** the legal identifiers and per-item tax treatment are later supplied, **When** the receipt
   renders, **Then** the tax-invoice fields appear in their designed positions with no change to the
   document's structure.

---

### Edge Cases

- **The order is paid but a portion is already short.** An item the customer paid for and will not
  receive must be visible on the document, at item level, only once that portion is terminal — the
  existing disclosure rule. It must not silently change the totals shown, because those totals are what
  was charged.
- **The order was fulfilled by more than one internal node.** The document is ONE Effy order, itemised
  by product, with no shop identity, no shop count, and nothing that implies fulfilment structure.
- **The customer changed their account email after ordering.** The emailed receipt is addressed to the
  account address at the time of sending; the document itself carries no email address as a field.
- **The customer has no name on their account.** The document degrades to the delivery recipient's
  name rather than showing an empty greeting.
- **A product was archived or renamed after purchase.** Every line renders from the order's own
  snapshot, never from the live catalogue, so a receipt years later still says what was bought.
- **A product image no longer resolves.** The line renders complete without it; imagery is decoration,
  never a carrier of meaning.
- **The delivery promise has already passed** when a past order is re-opened. The document shows the
  order's actual progress rather than a stale future promise.
- **An extremely large basket.** The on-screen document remains navigable and the email stays within
  budget; neither truncates a line without saying so.
- **A zero-fee delivery, a zero discount, or a fully discounted order.** A line that is genuinely zero
  is either omitted or shown as zero, never rendered as a blank or a dash that could be read as unknown.
- **The receipt is requested for an order in a refunded or cancelled state** (a future state the
  document must not misrepresent). The document reports the state it finds and never asserts "paid" for
  an order that is not.
- **Dark mode, large text, and screen readers** on every surface — the document is a table of figures,
  which is the layout that degrades worst under all three.

---

## Requirements *(mandatory)*

### The document

- **FR-001**: The platform MUST define ONE canonical set of facts that constitutes an order receipt, and
  every surface that shows a receipt MUST render from that same set. A field present on one surface and
  absent on another is a defect, not a variation.
- **FR-002**: The receipt MUST show: the paid state, the order number, the date and time the order was
  placed, every line item, a totals block, the payment method summary, the delivery address, the
  billing address treatment, the delivery method and promise, the order's progress, the seller identity
  block, and a route to help.
- **FR-003**: Each line item MUST show the product name, quantity, unit price and line total, and SHOULD
  show the product image. Unit price is currently absent everywhere and is what makes a line checkable.
- **FR-004**: The totals block MUST reconcile: the sum of line totals equals the items subtotal, and
  items subtotal minus any discount plus any delivery fee equals the grand total, which equals the amount
  charged. Any component that is zero MUST be either omitted or shown as an explicit zero.
- **FR-005**: A promotional discount MUST be shown as its own line, labelled with the code used, at the
  value computed when payment was taken — never recomputed from the promotion's current definition.
- **FR-006**: The receipt MUST state how the order was paid in a recognisable, non-sensitive form. The
  platform MUST capture that summary at the moment payment succeeds and store it on the order record; it
  MUST NOT store or display any other payment-instrument data.
- **FR-007**: The receipt MUST state the chosen delivery method and the expected arrival, derived from
  the promise captured at checkout. Where an order was split into packages with different methods, the
  receipt MUST convey that without disclosing which internal node handles which package.
- **FR-008**: The receipt MUST show the order's progress through a small, ordered set of customer-facing
  stages, and MUST reflect the current state when re-opened later.
- **FR-009**: The receipt MUST NOT disclose shop identity, shop count, distance, delivery ring, or any
  other fulfilment-structure fact.
- **FR-010**: An item the customer paid for and will not receive MUST be disclosed on the receipt at item
  level once that portion is terminal, and MUST NOT alter the charged totals.
- **FR-011**: Every line MUST render from the order's own snapshot of the purchase, never from the live
  catalogue.
- **FR-012**: The receipt MUST carry a "what happens next" explanation appropriate to the order's current
  stage, and exactly one primary onward action alongside secondary ones.

### The visual design

- **FR-013**: The web confirmation page and the mobile receipt screen MUST be redesigned to a modern,
  professional, document-grade standard, and MUST read as the same document on both surfaces —
  the same information hierarchy, the same section order, the same language.
- **FR-014**: The document MUST use the platform's monochrome ramp for all structural and typographic
  treatment, consistent with the platform's design law.
- **FR-015**: A **bounded status palette** MAY be used for status indicators only — order status, payment
  state, and delivery-method badges. It is a recorded, component-local exception to the monochrome rule,
  with the same constraints previously applied to the storefront's coloured panels: it MUST NOT become a
  design token, MUST NOT be surfaced to the mobile theme system, MUST NOT be used as a page accent, fill,
  or body-text colour, and MUST be removable by deleting a single definition. Every colour used MUST meet
  the platform's contrast requirement against its own background in both appearances, and colour MUST
  NEVER be the only carrier of a status — a label always accompanies it.
- **FR-016**: The document MUST be legible and complete in dark mode, at large text sizes, and to a screen
  reader, on every surface. Figures MUST be associated with their labels in a way assistive technology can
  announce.
- **FR-017**: The redesign MUST NOT change the platform's existing rule for when a receipt is shown at all:
  an order that has not been paid for is not a receipt and MUST NOT empty a basket.
- **FR-018**: Existing brand chrome that the storefront has locked — its header, navigation, product card
  and footer — MUST NOT be altered by this slice.
- **FR-018a**: The web page MUST align to the storefront's ONE shared content-column definition and MUST
  NOT re-declare its own width, centring and gutters. That column is materially wider than the column the
  page uses today, so the layout MUST be designed for the shared width rather than constrained back down
  to a narrower one — a single column at the full shared width would separate each item from its price by
  the width of the page.

### The email

- **FR-019**: The platform MUST send a receipt email to the customer's account address when an order
  becomes paid.
- **FR-020**: Exactly one receipt email MUST be sent per order regardless of how many times the paid fact
  is processed. Re-processing MUST be a no-op.
- **FR-021**: The email MUST carry the same fact set as the on-screen receipt, including the reconciling
  totals, and MUST link back to the order.
- **FR-022**: The email MUST remain fully legible with images blocked, as plain text, and in dark-mode
  clients, and MUST render within the platform's email size budget for a large basket without truncation.
- **FR-023**: A failure to send MUST NOT change the order's state, MUST NOT affect the shopper's on-screen
  confirmation, and MUST be recorded so operators can see it.
- **FR-024**: The email MUST be a transactional message and MUST NOT carry an unsubscribe affordance, so
  that a customer can never opt out of their own proof of purchase.
- **FR-025**: The email's subject MUST name the order and MUST NOT restate the amount charged; its preview
  line MUST NOT repeat the subject.
- **FR-026**: The platform MUST record the outcome of each receipt send so a missing receipt can be
  diagnosed without guessing.

### Re-obtaining the receipt

- **FR-027**: A customer MUST be able to request the receipt for any of their paid orders again, from both
  customer surfaces, and it MUST be sent to the address on their account — never to an address supplied in
  the request.
- **FR-028**: Repeat requests MUST be rate-limited per order, refused with a clear explanation once the
  limit is reached, and MUST NOT send an email when refused.
- **FR-029**: A resend request for an order that is not the requester's, or that is not paid, MUST be
  refused uniformly and MUST NOT disclose whether the order exists.

### Legal status and forward compatibility

- **FR-030**: The receipt MUST carry a seller identity block naming the trading entity and a customer-facing
  support contact.
- **FR-031**: The receipt MUST NOT display a business registration number, a tax amount, a per-line tax
  treatment, or the words "tax invoice" while the platform's legal identifiers remain unsupplied and
  per-item tax treatment is unmodelled. It MUST NOT infer, guess, or default any of these values.
- **FR-032**: The receipt MUST state plainly what the document is — a record of payment — and how a tax
  invoice can be obtained.
- **FR-033**: The document's layout MUST reserve the positions for the tax-invoice fields so that supplying
  the legal identifiers and per-item tax treatment later turns the receipt into a compliant tax invoice by
  configuration and data, without redesigning the document.
- **FR-034**: The platform MUST record, in this feature's own artefacts, the exact set of prerequisites
  that stand between this receipt and a compliant Australian tax invoice, so the gap is a known, tracked
  item rather than a discovery.

---

### Key Entities

- **Order receipt** — the canonical, surface-independent set of facts that constitutes the record of one
  paid order: identity (number, placed timestamp), lines (name, image, unit price, quantity, line total),
  money (items subtotal, discount and its code, delivery fee, grand total, currency), payment (method
  summary, paid state), delivery (address, billing treatment, method, promise), progress (customer-facing
  stage, any terminal shortfalls), and seller identity. Derived entirely from the order's own snapshot.
- **Payment method summary** — a short, non-sensitive description of how an order was paid, captured at the
  moment payment succeeds and stored on the order. New; nothing equivalent is recorded today.
- **Receipt dispatch** — the record that a receipt email was requested, attempted, and what came of it: the
  order it belongs to, why it was sent (automatic on payment, or requested by the customer), when, and its
  outcome. What makes exactly-once sending, rate limiting, and operator diagnosis possible.
- **Order stage** — the small, ordered, customer-facing vocabulary the progress indicator renders, derived
  from the order's existing fulfilment state without exposing fulfilment structure.
- **Seller identity** — the trading entity, support contact, and (when supplied) registration number and
  registered address shown on every receipt. Sourced from the platform's existing legal identifier record,
  including its fail-loud placeholders.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A shopper who has just paid can answer "what did I buy, for how much, how did I pay, and when
  will it arrive?" from the confirmation alone, without navigating away — verified with 5 observers, 5/5.
- **SC-002**: Every figure on the receipt reconciles: line totals sum to the items subtotal, and subtotal
  minus discount plus delivery equals the grand total equals the amount charged. Verified on orders with
  and without a discount, with and without a delivery fee, and with more than one item.
- **SC-003**: The web confirmation and the mobile receipt present the same fact set. A field-by-field
  comparison finds zero fields present on one surface and absent on the other.
- **SC-004**: A receipt email arrives for 100% of orders that reach paid, and exactly one arrives per
  order — proven by processing the paid fact twice and observing one email.
- **SC-005**: The receipt email renders correctly across the major mail clients including the one with the
  most restrictive rendering engine, in light and dark mode, with images blocked, and as plain text.
- **SC-006**: A receipt email for a basket of at least 25 items stays within the email size budget and no
  client truncates it.
- **SC-007**: A customer can re-send themselves the receipt for a past order from both surfaces, and the
  rate limit refuses the request after the configured number of attempts without sending.
- **SC-008**: Requesting the receipt for another customer's order is refused, and the refusal is
  indistinguishable from the refusal for an order that does not exist.
- **SC-009**: The full receipt is legible and complete on both surfaces in dark mode, at the largest system
  text size, and read end-to-end by a screen reader with every figure announced against its label.
- **SC-010**: The status palette introduced by this slice does not appear in the platform's design tokens,
  does not reach the mobile theme system, and its removal requires editing exactly one definition — proven
  by the existing token drift check passing unchanged.
- **SC-011**: The receipt discloses nothing about fulfilment structure. An adversarial read of the page, the
  email, and the underlying response finds no shop name, shop id, shop count, distance, or delivery ring.
- **SC-012**: The receipt never displays a fabricated legal identifier. With the platform's identifiers
  unsupplied, the registration number, tax amount and "tax invoice" wording are absent — not blank, not
  placeholder text, not guessed.
- **SC-013**: An unpaid order still shows the waiting or not-completed state, shows no receipt, and leaves
  the basket intact — the existing rule, re-proven after the redesign.
- **SC-014**: An order paid, then re-opened from order history days later, shows its current progress rather
  than the state it had at payment.
- **SC-015**: A failed receipt send leaves the order paid and the on-screen confirmation unchanged, and the
  failure is visible to an operator without reading application logs line by line.

---

## Assumptions

- **The document is a receipt, not a tax invoice, and says so.** Resolved with the operator on 2026-08-26.
  An Australian tax invoice for a taxable sale requires the seller's registration number, and the platform's
  legal identifier record still holds a fail-loud placeholder for it. Groceries are additionally a *mixed
  supply* — basic food is GST-free — so no per-item tax treatment exists to break out and the
  "total price includes GST" shorthand would be false for most Effy baskets. Both gaps are recorded as
  prerequisites (FR-034) and the layout reserves their positions (FR-033).
- **Colour is a bounded, component-local exception.** Resolved with the operator on 2026-08-26. Status
  indicators may carry colour; the document is otherwise monochrome. This mirrors the precedent already set
  for the storefront's coloured value panels — component-local constants, never design tokens.
- **HTML email only.** Resolved with the operator on 2026-08-26. A PDF attachment and a print-optimised
  stylesheet were both considered and are **out of scope**; the shopper's keepable copy is the email itself
  plus the linked order page.
- The receipt is sent to the address on the customer's account. There is no separate "billing email" concept
  on this platform and this slice does not introduce one.
- Every order in scope is a signed-in customer's order. Guest checkout does not exist on this platform, so
  there is no anonymous receipt-retrieval path to design.
- The delivery promise shown is the one captured at checkout. This slice does not introduce live tracking or
  a re-estimated arrival time.
- Refund and cancellation states are not produced by any existing flow. The document is required not to
  misrepresent them (edge cases) but this slice does not build refund handling.
- The existing rule about when a receipt may be shown at all, and when a basket may be cleared, is correct
  and is preserved unchanged.
- Localisation is out of scope: one language, one currency, one country.

---

## Out of Scope

- A PDF invoice attachment, and any document-generation or document-storage capability.
- A print stylesheet or an OS-level share/save action on the receipt.
- Modelling per-item GST treatment, or any tax calculation.
- Refunds, cancellations, partial refunds, and any money movement after payment.
- Live delivery tracking or a re-estimated arrival time.
- Post-purchase merchandising on the confirmation page — recommendations, cross-sells, or a next-order
  offer. The page is a record first; merchandising it is a separate decision with its own evidence.
- Receipts for any audience other than the customer. Shop and driver surfaces are untouched.
- Any change to the checkout or payment flow itself.

---

## Dependencies

- The order record, its snapshotted line items, addresses, discount, delivery fee and grand total — all of
  which exist.
- The platform's captured delivery promise and chosen method per package — which exist.
- The platform's transactional email capability, including the already-authored order-confirmation template
  that has never had a call site.
- The platform's transactional outbox, already used to fan out notifications on the paid transition.
- The platform's legal identifier record, including its unsupplied placeholders.
- **Operator-supplied, and not blocking this slice**: the legal entity name, registration number and
  registered address. Their absence is designed for (FR-031); supplying them later completes FR-033.

# Feature Specification: Product Approval & Effy Margin

**Feature Branch**: `067-product-approval-margin`

**Created**: 2026-10-04

**Status**: Draft

**Input**: User description: "Product approval and Effy margin" — client feedback round of October
2026, requirements R1 and R2 in
[docs/prd/2026-10-client-feedback-prd.md](../../docs/prd/2026-10-client-feedback-prd.md).

## Why this slice exists

**Anything a shop types goes on sale, and Effy earns nothing it can point to.**

A shop creates a product, sets a price and publishes it. It is on the storefront the same moment,
under Effy's name, with no one at Effy having seen it. The shop can then change the name, the photos
or the price whenever it likes. Three consequences follow:

1. **Effy sells things it has never looked at.** Customers buy from one brand. A wrong photo, a
   misleading description or a price typed with one zero too many is Effy's mistake in their eyes,
   and nothing stands between a shop's keyboard and the storefront.
2. **Effy has no margin.** The price a shop enters is the price a customer pays. There is nowhere to
   record what Effy adds, so the platform cannot say what it earns on any product.
3. **An approval would mean nothing if edits were free.** Reviewing a product once is worthless if
   the shop can rewrite it the next minute.

The client asked for both halves: every new product is approved by Effy, who adds the margin; and
every later change to a product's details, except its stock quantity, is approved too.

### Decisions already made (operator, 2026-10-04)

- **Margin model.** The shop enters the price it wants to be paid (the **shop price**). Effy adds
  its **margin**. The **customer price** is the shop price plus the margin, and it is the only price
  a customer ever sees.
- **Products already on sale** when this ships stay on sale and keep selling. They are treated as
  approved with no margin set, and appear in Effy's queue marked "margin not set".
- **What a shop sees.** For its own products a shop sees its shop price and the resulting customer
  price. It does not see the margin as a figure, and sees nothing about other shops.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A new product needs Effy's approval before it sells (Priority: P1)

A shop finishes a new product and submits it for review. It is not on sale. An Effy admin opens the
review queue, looks at everything the shop entered, sets the margin and approves it. Only then can
customers find and buy it, at the customer price.

**Why this priority**: This is the gate itself. Until it exists nothing else in the slice has
anything to attach to, and every day without it a shop can still publish unseen.

**Independent Test**: As a shop, create and submit a product; confirm no customer can find or open
it. As an admin, approve it with a margin; confirm customers can now buy it at shop price plus
margin.

**Acceptance Scenarios**:

1. **Given** a shop with a finished new product, **When** it submits the product, **Then** the
   product is in review, the shop sees that state, and the product is not on sale.
2. **Given** a product in review, **When** a customer searches for it, browses its category or opens
   its direct link, **Then** they find nothing.
3. **Given** a product missing a required detail or a main image, **When** the shop tries to submit
   it, **Then** submission is refused and the shop is told what is missing.
4. **Given** a product in review, **When** an admin approves it and sets a margin, **Then** it goes
   on sale at the shop price plus that margin.
5. **Given** a product in review, **When** an admin tries to approve it without setting a margin,
   **Then** approval is refused.
6. **Given** a product in review, **When** the shop withdraws the submission, **Then** the product
   returns to an unsubmitted draft and leaves the queue.
7. **Given** a shop, **When** it tries to put a never-approved product on sale by any means,
   **Then** it cannot.

---

### User Story 2 - Effy sends a product back with a reason (Priority: P1)

An admin reviewing a product finds a problem. They send it back with a written reason. The shop
sees the reason on the product, fixes it and submits again.

**Why this priority**: Equal-first with US1. A gate that can only say yes is not a review, and a
refusal with no reason leaves the shop guessing.

**Independent Test**: Send a submitted product back with a reason; confirm the shop sees it, the
product is still not on sale, and a resubmission returns to the queue.

**Acceptance Scenarios**:

1. **Given** a product in review, **When** an admin sends it back, **Then** a reason is required.
2. **Given** a product sent back, **When** the shop opens it, **Then** it sees the reason and who
   it came from is shown as Effy, not a named person.
3. **Given** a product sent back, **When** the shop edits and resubmits it, **Then** it returns to
   the queue as a fresh submission.
4. **Given** a decision of either kind, **When** it is made, **Then** the shop is notified in its
   console and by its notification channel.

---

### User Story 3 - A change to a live product waits for approval (Priority: P1)

A shop edits a product that is already on sale: a new name, a new photo, a new price. The product
keeps selling exactly as it was. The edit is a pending change. An admin sees what changed, before
and after, and approves it or sends it back. On approval the live product takes the new details.

**Why this priority**: Equal-first. Without it US1 is bypassed by one edit.

**Independent Test**: Edit a live product's name and photo; confirm customers still see the old
ones. Approve the change; confirm customers now see the new ones. Repeat and send it back; confirm
the live product never moved.

**Acceptance Scenarios**:

1. **Given** a live product, **When** the shop changes any of its details, **Then** a pending
   change is created and the live product is unchanged.
2. **Given** a pending change, **When** a customer views, searches for, saves or buys the product,
   **Then** they see and are charged for the last approved version.
3. **Given** a pending change, **When** an admin opens it, **Then** they see each changed detail
   with its current and proposed value, and nothing that did not change.
4. **Given** a pending change, **When** an admin approves it, **Then** the live product takes
   every proposed value at once.
5. **Given** a pending change, **When** an admin sends it back with a reason, **Then** the live
   product is exactly as it was and the shop sees the reason.
6. **Given** a pending change, **When** the shop edits the product again, **Then** the same
   pending change is updated; a second one is not created.
7. **Given** a pending change, **When** the shop withdraws it, **Then** it is discarded and the
   live product is untouched.
8. **Given** a pending change that includes a new image, **When** a customer views the product,
   **Then** they do not see the new image until it is approved.

---

### User Story 4 - Stock and taking a product off sale never wait (Priority: P1)

A shop adjusts its stock count, or takes a product off sale because it has run out or been
recalled. Both take effect at once, with no approval, whether or not a change is pending.

**Why this priority**: Equal-first. The client excluded stock from approval by name, and a shop
that must wait for Effy to stop selling something it does not have is worse off than today.

**Independent Test**: With a change pending on a live product, adjust its stock and then mark it
unavailable; confirm both take effect immediately and the pending change is still there.

**Acceptance Scenarios**:

1. **Given** a live product, **When** the shop changes its stock on hand, records a stock count or
   adjustment, changes its low-stock threshold, or turns stock tracking on or off, **Then** the
   change applies immediately and no approval is created.
2. **Given** a live product, **When** the shop marks it unavailable or archives it, **Then** it is
   off sale immediately.
3. **Given** a product the shop took off sale with nothing else changed, **When** the shop puts it
   back on sale, **Then** it is on sale immediately.
4. **Given** a product with a pending change, **When** the shop adjusts its stock, **Then** the
   stock changes and the pending change is undisturbed.

---

### User Story 5 - Effy sets and changes its margin (Priority: P2)

An admin sets the margin when approving a product. When a shop proposes a new shop price, the admin
confirms or resets the margin as part of approving that change. An admin can also change the margin
on a live product at any time, and set it on products that were live before this feature.

**Why this priority**: The margin is what Effy earns. It follows approval in priority only because
approval has to exist before there is a moment to set it.

**Independent Test**: Approve a product with a margin and confirm the customer price. Change the
margin on the live product and confirm the customer price follows. Set a margin on a product marked
"margin not set" and confirm the same.

**Acceptance Scenarios**:

1. **Given** an admin setting a margin, **When** they enter it as a percentage or as an amount,
   **Then** they see the resulting customer price before confirming.
2. **Given** a pending change that alters the shop price, **When** an admin approves it, **Then**
   they must confirm or reset the margin, seeing the resulting customer price.
3. **Given** a live product, **When** an admin changes its margin, **Then** the customer price
   changes at once and the change is recorded.
4. **Given** a product that was live before this feature, **When** an admin views the queue,
   **Then** it is listed as "margin not set" and its customer price equals its shop price.
5. **Given** a customer with the product in their cart or saved list, **When** the customer price
   changes, **Then** they see the new price the next time they look, as with any price change.

---

### User Story 6 - The shop knows where every product stands (Priority: P2)

A shop's product list and product page show, for each product, whether it is a draft, in review,
live, live with a change pending, or sent back, and the price customers pay. The same on shop web
and shop mobile.

**Why this priority**: A shop that cannot see state will resubmit, re-edit and ask support. It
comes after the gate because there is nothing to show until the gate exists.

**Independent Test**: Take one product through draft, in review, sent back, live, and live with a
pending change, and confirm the shop sees the right state and the right prices at each step on both
shop surfaces.

**Acceptance Scenarios**:

1. **Given** a shop's product list, **When** it is viewed, **Then** each product shows its review
   state.
2. **Given** a live product with a pending change, **When** the shop opens it, **Then** it sees
   what is live, what it proposed, and that the proposal is waiting.
3. **Given** a live product, **When** the shop views it, **Then** it sees its shop price and the
   customer price, and no margin figure.
4. **Given** a product of another shop, **When** a shop looks for it, **Then** it finds nothing.

---

### User Story 7 - The shop is paid at its price, the customer at theirs (Priority: P2)

An order is placed for a product with a margin. The customer is charged the customer price and
sees it on their receipt. The shop's order view and sales figures show what the shop is owed, at
the shop price. Both prices are kept with the order, so later changes to either do not rewrite it.

**Why this priority**: Once a margin exists, "the price" is two numbers, and every place that shows
money has to know which one it means. It follows the gate because the gate is what creates the
second number.

**Independent Test**: Buy one unit of a product with a shop price of 10.00 and a margin of 2.00.
Confirm the customer is charged 12.00 and their receipt says 12.00; the shop's order and sales show
10.00; and changing the margin afterwards moves neither.

**Acceptance Scenarios**:

1. **Given** a product with a margin, **When** a customer buys it, **Then** they are charged the
   customer price and their receipt shows it.
2. **Given** that order, **When** the shop views it, **Then** the line shows the shop price.
3. **Given** that order, **When** it is refunded, **Then** the customer is refunded what they paid.
4. **Given** that order, **When** the product's margin or shop price later changes, **Then** the
   order shows what it showed when it was placed.
5. **Given** a promotion or a minimum order amount, **When** it is evaluated, **Then** it uses
   customer prices.

---

### User Story 8 - Every decision is on the record (Priority: P3)

Each approval, each send-back and each margin change is recorded with who made it, when, on which
product, and what the margin was.

**Why this priority**: It is what lets Effy answer "who approved this, and at what margin?" months
later. Nothing a customer or shop does depends on it.

**Independent Test**: Approve a product, send a change back, and change a margin; confirm three
records exist naming the staff member, the product and the figures.

**Acceptance Scenarios**:

1. **Given** any decision, **When** it is made, **Then** a record is kept of who, when, which
   product, the decision, any reason, and the margin before and after.
2. **Given** a recorded reason, **When** it is shown to the shop, **Then** the staff member's
   identity is not.

---

### Edge Cases

- **The shop edits a pending change while an admin has it open.** The admin's decision is refused
  and they are shown the current proposal; nothing is approved that the admin did not see.
- **Two admins decide the same item at once.** One decision is recorded; the other is told it has
  already been decided.
- **A shop submits, then archives the product before review.** It leaves the queue.
- **A shop takes a live product off sale while a change is pending.** The product is off sale; the
  pending change stays and can still be approved or withdrawn.
- **A shop proposes a change, then changes the same detail back.** A proposal that no longer
  differs from the live product is discarded.
- **A change that only reorders or removes images.** It is a change to details and needs approval.
- **A pending change proposes a category or product type that Effy has since retired.** Approval is
  refused with that reason.
- **A sent-back new product is never resubmitted.** It stays a draft with the reason shown.
- **A product is in a customer's cart when its price changes on approval.** The cart shows the new
  price next time, as it does for any price change today.
- **A margin entered as a percentage on an awkward price.** The customer price is rounded to whole
  cents, and the admin sees the rounded figure before confirming.
- **A margin of zero.** Allowed, but only as an explicit entry; an empty margin is not zero.
- **A product live before this feature is edited by its shop.** The edit is a pending change like
  any other, and approving it requires a margin to be set.
- **The shop's "was" price.** The same margin is applied to it, so the customer sees a "was" price
  on the same footing as the price they pay; a "was" price not higher than the customer price is
  not shown.
- **A very large queue.** It stays usable: oldest first, filterable, with the age of each item.
- **A shop is suspended while it has items in review.** They remain in the queue marked as such;
  approving one does not put it on sale while the shop is not active.

## Requirements *(mandatory)*

### Functional Requirements

**Submitting a new product**

- **FR-001**: A shop MUST submit a new product for review to put it on sale; a shop MUST NOT be
  able to put a never-approved product on sale by any other route.
- **FR-002**: Submission MUST run the existing readiness checks (required details present, a main
  image) and MUST refuse a product that fails them, saying what is missing.
- **FR-003**: A product in review MUST NOT be purchasable, searchable, listed, or viewable by
  customers by any route, including a direct link and a saved-item entry.
- **FR-004**: A shop MUST be able to withdraw a submission that has not been decided.
- **FR-005**: A shop MUST be able to keep working on an unsubmitted draft without Effy seeing it.

**Reviewing**

- **FR-006**: Back-office MUST provide a review queue listing new products awaiting review and
  pending changes to live products, oldest first, each showing its shop, its kind and how long it
  has waited.
- **FR-007**: The queue MUST be filterable by shop and by kind, and searchable by product name.
- **FR-008**: The queue MUST separately list live products with no margin set.
- **FR-009**: A reviewer MUST be able to see everything the shop entered for a product: all
  details, attributes, prices and every image.
- **FR-010**: For a pending change, the reviewer MUST see each changed detail with its current and
  proposed value, including images added, removed or reordered, and MUST NOT have to compare the
  whole product by eye.
- **FR-011**: Staff with the admin or manager role MUST be able to approve or send back. Other
  back-office staff MUST be able to view the queue and items and MUST NOT be able to decide.
- **FR-012**: Sending back MUST require a written reason.
- **FR-013**: A reviewer MUST NOT be able to edit what the shop entered; they decide on it as
  submitted.
- **FR-014**: A decision MUST be refused if the item changed after the reviewer opened it, or if
  it has already been decided.

**Changes to live products**

- **FR-015**: A change by a shop to any of a live product's name, descriptions, brand, SKU,
  barcode, category, product type, attributes, shop price, "was" price, weight or images MUST
  create or update a pending change and MUST NOT alter the live product.
- **FR-016**: While a change is pending, every customer-facing surface MUST present, and every
  order MUST charge, the last approved version.
- **FR-017**: A product MUST have at most one pending change; further edits by the shop update it.
- **FR-018**: A shop MUST be able to withdraw a pending change.
- **FR-019**: Approving a pending change MUST apply every proposed value to the live product
  together, or none.
- **FR-020**: Sending a pending change back MUST leave the live product exactly as it was.
- **FR-021**: A proposed image MUST NOT be visible to customers before approval.
- **FR-022**: A pending change that no longer differs from the live product MUST be discarded.

**What never waits**

- **FR-023**: Changes to stock on hand, stock counts and adjustments, the low-stock threshold, and
  whether stock is tracked MUST apply immediately and MUST NOT create a pending change.
- **FR-024**: Marking a live product unavailable, and archiving it, MUST apply immediately.
- **FR-025**: Returning to sale a product the shop itself took off sale MUST apply immediately
  when no detail changed.
- **FR-026**: None of FR-023 to FR-025 MUST disturb a pending change.

**Margin and prices**

- **FR-027**: The price a shop enters MUST be recorded as the shop price.
- **FR-028**: Approval of a new product MUST require a margin and MUST be refused without one.
- **FR-029**: A margin MUST be enterable as a percentage of the shop price or as an amount, MUST
  NOT be negative, and MAY be zero only when entered explicitly.
- **FR-030**: The customer price MUST be the shop price plus the margin, rounded to whole cents,
  and the reviewer MUST see it before confirming.
- **FR-031**: Approving a pending change that alters the shop price MUST require the reviewer to
  confirm or reset the margin.
- **FR-032**: An admin or manager MUST be able to set or change the margin of a live product at
  any time; the customer price MUST follow immediately.
- **FR-033**: A product with no margin set MUST sell at its shop price.
- **FR-034**: Customers MUST see only the customer price: on product pages, lists, search, cart,
  saved items, checkout, receipts, order pages and refunds.
- **FR-035**: A shop's "was" price MUST have the same margin applied before it is shown to
  customers, and MUST NOT be shown unless it is higher than the customer price.
- **FR-036**: Promotions, the minimum order amount and delivery pricing inputs MUST be evaluated
  on customer prices.

**What a shop sees**

- **FR-037**: A shop MUST see each of its products' review state: draft, in review, sent back,
  live, or live with a change pending.
- **FR-038**: A shop MUST see the reason for the most recent send-back until it resubmits or
  withdraws.
- **FR-039**: For its own products a shop MUST see the shop price and the customer price, and MUST
  NOT see the margin as a figure.
- **FR-040**: A shop MUST NOT see any other shop's products, prices or review items.
- **FR-041**: A shop MUST be notified of each decision in its console and by its notification
  channel.
- **FR-042**: All of FR-037 to FR-041 MUST hold on both shop web and shop mobile.

**Orders**

- **FR-043**: Each order line MUST record both the customer price charged and the shop price owed,
  as they stood when the order was placed.
- **FR-044**: Shop-facing money (the order view and sales figures) MUST be in shop prices;
  customer-facing money and refunds to customers MUST be in customer prices.
- **FR-045**: A later change to a product's shop price or margin MUST NOT change any placed order.

**Products already on sale**

- **FR-046**: Products on sale when this feature starts MUST remain on sale, unchanged in price,
  and be treated as approved with no margin set.
- **FR-047**: Orders placed before this feature MUST read as having a shop price equal to the
  price charged.

**Record**

- **FR-048**: Every approval, send-back and margin change MUST be recorded with the staff member,
  the time, the product, the decision, any reason, and the margin before and after.
- **FR-049**: The identity of the staff member MUST NOT be shown to shops.

### Key Entities *(include if feature involves data)*

- **Product**: a shop's catalogue item. Gains a review state, a shop price, a margin and a customer
  price. What customers see is always its last approved version.
- **Pending change**: the shop's proposed new version of a live product's details, at most one per
  product. Holds proposed values and proposed images until decided or withdrawn.
- **Review item**: something awaiting a decision: a new product in review, or a pending change.
  Has a kind, a shop, the time it was submitted, and an outcome.
- **Margin**: what Effy adds to a shop price, held as a percentage or an amount, together with the
  customer price it produces.
- **Decision record**: an approval, send-back or margin change, with who, when, which product, the
  reason and the margin before and after.
- **Order line**: gains the shop price beside the customer price charged, both fixed at placement.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero products reach customers without an approval on record, measured from the day
  this ships, excluding products already on sale that day.
- **SC-002**: A product in review can be found by a customer through zero routes: search, category
  browse, home sections, saved items and direct link.
- **SC-003**: After a shop edits a live product's name, photo and price, 100% of customer-facing
  surfaces still show the approved version until a decision is made.
- **SC-004**: A change sent back leaves the live product identical in every detail to how it was
  before the change was proposed.
- **SC-005**: A stock adjustment takes effect for customers in under 5 seconds, with or without a
  pending change, and creates zero review items.
- **SC-006**: For every approved product with a margin, customer price equals shop price plus
  margin to the cent, on every surface that shows a price.
- **SC-007**: A reviewer can decide a new product in under 2 minutes and a change in under 1
  minute from opening it.
- **SC-008**: For 100% of orders, the amount the customer was charged per line and the amount the
  shop is owed per line can both be read from the order, and neither moves when the product's
  price or margin later changes.
- **SC-009**: A shop can see a margin figure, or another shop's product, in zero places.
- **SC-010**: A staff member without the admin or manager role can approve or send back in zero
  attempts.
- **SC-011**: Every decision made has exactly one record naming the staff member, the product and
  the margin.
- **SC-012**: On the day this ships, the number of products on sale and their prices are the same
  as the day before.
- **SC-013**: A shop sees the same review state and the same two prices for a product on shop web
  and on shop mobile.

## Assumptions

- **A margin can be a percentage or an amount**, chosen per product. The client said "cost/margin"
  without choosing; offering both covers either reading. A percentage is re-applied when the shop
  price changes on approval; an amount is carried as it is. Either way the reviewer confirms.
- **Zero margin is allowed** when entered explicitly, so Effy can choose to pass a product through
  at the shop's price.
- **Reviewers do not edit shop content.** They approve what was submitted or send it back. This
  keeps one author per product and one clear record of who wrote what.
- **A margin change by Effy is not a shop change** and needs no shop approval; it takes effect
  immediately.
- **The "was" price follows the margin**, so a comparison shown to a customer is like for like.
- **Shop sales figures move to shop prices** from the day a product has a margin. For products
  without one the two prices are equal, so nothing changes for them.
- **Customers already holding the product** in a cart or saved list are treated as for any price
  change today: they see the new price next time; no order already paid is touched.
- **The existing readiness checks are sufficient** for submission. Making more details compulsory
  is a separate change.
- **No review-time target is enforced by the platform.** The queue shows how long each item has
  waited; what Effy promises shops is an operating decision.
- **Notification uses the shop's existing channel** (console and push), addressed as other shop
  notifications are.
- **Back-office staff roles are as they exist today**: admin and manager decide; customer-service
  staff read.

## Out of Scope

- Approving many items in one action.
- Rules that approve automatically for trusted shops or small changes.
- Paying shops, settlement or payout reports.
- Approving some details of a change and not others.
- A browsable history of every past version of a product, beyond the decision record.
- Default margins per category or per shop.
- Making more product details compulsory at submission.
- Letting Effy staff create or edit a shop's products.
- Messaging between a shop and a reviewer beyond the send-back reason.
- Showing the margin, or what Effy earned, to shops.

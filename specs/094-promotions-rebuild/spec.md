# Feature Specification: Promotions Rebuilt — a Full Promotion System, Grouped for Display

**Feature Branch**: `094-promotions-rebuild`

**Created**: 2026-10-19

**Status**: Draft

**Input**: User description: "Promotions rebuilt: a full-featured promotion system, grouped for display. Replace Effy's current promotion model (027/028/029: one whole-cart code with percent or fixed amount off, an optional minimum spend, active dates, total and per-shopper caps, and an 'advertise on storefront' switch with a headline, artwork and one of two exclusive placements) with an industry-standard promotion system in the shape Uber Eats, DoorDash, Instacart and Shopify use, managed in back-office and shown in the customer website and customer mobile app in the right places." (Full text: see the conversation that opened this feature; every point is carried into the requirements below.)

## Why this feature exists

Today a promotion can only be one thing: a code that takes a percentage or a fixed amount off the whole
cart. Effy cannot run the offers every comparable grocery and delivery business runs — free delivery
this weekend, 20% off fresh produce, buy one get one free on a brand, a welcome offer that applies by
itself on a first order — and it cannot say where an offer appears beyond two fixed spots on Home. Staff
design artwork that the website no longer shows. This feature replaces the model with one that covers
those offers, lets staff decide where each one is shown by putting it in named groups, and has the
website and the mobile app read those groups.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run a cart offer, with or without a code (Priority: P1)

A manager creates a promotion that takes money off the whole cart — a percentage (optionally capped,
"20% off up to $15") or a fixed amount — sets its minimum spend, dates and limits, and chooses whether it
applies by itself or only when a shopper enters a code. A shopper whose cart qualifies sees the discount
in the cart and on the receipt, named.

**Why this priority**: It is today's capability, rebuilt on the new model. Nothing else can ship until
the new model can do at least what the old one did, and every existing live code must keep working.

**Independent Test**: Create a "10% off orders over $50, up to $20" code and an automatic "$5 off your
cart this weekend"; build qualifying and non-qualifying carts on the website and the app; confirm the
discount, its name and the refusal sentences.

**Acceptance Scenarios**:

1. **Given** an active code promotion "20% off, up to $15, minimum $40", **When** a shopper with a $100
   cart enters the code, **Then** the cart shows "$15.00 off" against the promotion's name and the order
   total reflects it.
2. **Given** an automatic promotion "$5 off carts over $30" is active, **When** a shopper's cart reaches
   $30, **Then** the discount appears without any code, and it disappears with a sentence if the cart
   falls below $30.
3. **Given** a code with a minimum of $40, **When** a shopper with a $35 cart enters it, **Then** they are
   told how much more to spend, and no discount is applied.
4. **Given** a code promotion that existed before this feature, **When** a shopper enters it after the
   change, **Then** it behaves exactly as it did, and orders placed with it before the change still show
   the discount they were sold.

---

### User Story 2 - Show promotions where staff put them (Priority: P1)

Staff create display groups ("Home hero", "Home side cards", "Offers page", "Cart suggestions"…), put a
promotion in one or more groups, order promotions within each group, and write the words a shopper reads
(headline, supporting line, a short label). The website and the mobile app each show a group's
promotions in that group's place, in that order, and only those the shopper can actually use now.

**Why this priority**: It is the second half of what was asked for — where offers appear is as much the
business's decision as what they are — and it replaces the two fixed placements and the artwork editor
outright.

**Independent Test**: Create two groups, put one promotion in both and another in one, reorder them, and
confirm both clients show exactly those promotions in those places and orders; end one promotion and
confirm it leaves every place it was shown.

**Acceptance Scenarios**:

1. **Given** a promotion in "Home hero" (position 1) and "Offers page" (position 3), **When** a shopper
   opens Home and then Offers, **Then** it appears first in the hero and third on Offers.
2. **Given** a promotion limited to first orders, **When** a shopper who has ordered before opens Home,
   **Then** it is not shown to them; a shopper who has not ordered sees it.
3. **Given** a promotion whose budget runs out, **When** any shopper next opens a page that shows its
   group, **Then** it is no longer shown.
4. **Given** a group with no promotion currently usable, **When** a shopper opens its page, **Then** the
   place is simply absent — never an empty frame.
5. **Given** each shown promotion, **Then** its conditions (minimum spend, what it applies to, when it
   ends, first order only) are stated where it is shown, and a code promotion shows its code with a way
   to copy it.

---

### User Story 3 - Offers on chosen products, categories or brands (Priority: P2)

A manager creates a promotion that takes money off only certain items — chosen products, every product
in chosen categories, or every product of chosen brands — as a percentage or a fixed amount per item.
Shoppers see the offer on those products where products are listed and in the cart.

**Why this priority**: Item offers are the most common grocery promotion and drive sales of what the
business wants to move, but the platform is useful without them for a first release.

**Independent Test**: Create "15% off Dairy & eggs"; confirm the reduced price is shown on those products
in listings, product pages and the cart, and that other items are unaffected.

**Acceptance Scenarios**:

1. **Given** "15% off Dairy & eggs" is active, **When** a shopper adds milk ($4.00) and bread ($5.00),
   **Then** the cart takes $0.60 off the milk only and names the promotion.
2. **Given** the same promotion, **When** a shopper browses Dairy & eggs, **Then** each product shows the
   offer.
3. **Given** a product-scoped promotion with a minimum quantity of 2, **When** the shopper has 1, **Then**
   the cart says how many more are needed.

---

### User Story 4 - Buy X get Y (Priority: P2)

A manager creates "Buy 2 get 1 free" or "Buy one, get the second half price" over chosen products,
categories or brands, optionally capped at a number of times per order.

**Why this priority**: A standard grocery mechanic that cannot be expressed as a percentage, and that
shoppers expect.

**Independent Test**: Create "Buy 2 get 1 free on Brand X yoghurts"; add 3 and 6 of mixed flavours;
confirm 1 and 2 are free (the cheapest qualifying items first) and the receipt says so.

**Acceptance Scenarios**:

1. **Given** "Buy 2 get 1 free" on a brand, **When** a shopper adds three qualifying items priced $3,
   $4 and $5, **Then** the $3 item is free.
2. **Given** the same promotion limited to once per order, **When** the shopper adds six, **Then** only
   one item is free.

---

### User Story 5 - Delivery offers (Priority: P2)

A manager creates a promotion that makes delivery free or reduces it by a percentage or amount, for
Delivered by Effy, Courier delivery or both, optionally with a minimum spend.

**Why this priority**: "Free delivery" is the single most effective delivery-platform offer; the platform
already prices delivery once per order, so the offer has one clear thing to reduce.

**Independent Test**: Create "Free delivery over $60, Delivered by Effy only"; confirm the delivery fee
goes to $0 for a qualifying Effy order and is unchanged for a Courier order.

**Acceptance Scenarios**:

1. **Given** "Free delivery over $60" for Effy delivery, **When** a shopper with a $70 cart chooses a
   window, **Then** the delivery fee shows as free with the promotion named.
2. **Given** the same promotion, **When** the address is served by courier, **Then** the fee is charged
   and the shopper is told the offer is for Effy delivery only.
3. **Given** a delivery promotion and a cart promotion both apply and both allow combining, **Then** both
   are applied.

---

### User Story 6 - Who qualifies, when, and how often (Priority: P2)

A manager limits a promotion to first orders, to customers who have never ordered, or to customers they
choose; to certain days of the week and hours; to a minimum spend or item count; and caps it by total
uses, uses per customer and a money budget.

**Why this priority**: Targeting and limits are what keep a promotion affordable; without them every
offer is open to everyone forever.

**Independent Test**: Create "Weekday lunch: $5 off, 11:00–14:00 Mon–Fri, once per customer, budget
$500"; confirm it applies only in those hours, once per customer, and stops when $500 has been given.

**Acceptance Scenarios**:

1. **Given** a promotion limited to 11:00–14:00 on weekdays, **When** a shopper checks out at 15:00,
   **Then** it does not apply and the cart says when it is available.
2. **Given** a budget of $500 with $497 given, **When** a qualifying order would take $10 off, **Then**
   the promotion applies only if the whole discount fits; otherwise it is not offered and stops being
   shown.
3. **Given** a promotion for chosen customers, **When** a customer not on the list enters its code,
   **Then** they are told the code is not available to their account.

---

### User Story 7 - Many single-use codes (Priority: P3)

A manager generates a batch of single-use codes for one promotion (for a partner, a newsletter or
apologies from customer service), downloads them, and sees which have been used.

**Why this priority**: Valuable for partnerships and service recovery, but most promotions use one shared
code or none.

**Independent Test**: Generate 100 codes, use 3, confirm each works once and the list shows the 3 as used.

**Acceptance Scenarios**:

1. **Given** a batch of 100 codes, **When** one is used on an order, **Then** it cannot be used again by
   anyone, and the promotion shows 1 of 100 used.
2. **Given** a batch, **When** the manager downloads it, **Then** they receive every code with its state.

---

### User Story 8 - How promotions combine (Priority: P2)

A manager decides whether a promotion may be used together with others and, for promotions that may
not, which wins. Shoppers always get the outcome the rules describe, and the cart shows every promotion
that applied.

**Why this priority**: Without a combining rule, two offers stack by accident and the business pays twice.

**Independent Test**: Activate an automatic 10% cart promotion that does not combine and a $15 code that
does not combine; on a $100 cart confirm the shopper gets the larger ($15) and is told the other did not
apply.

**Acceptance Scenarios**:

1. **Given** two promotions of the same kind that do not combine, **When** both qualify, **Then** the one
   giving the shopper the larger discount applies, and the cart says the other was not combined.
2. **Given** a promotion that combines and one that does not, **When** both qualify, **Then** only the one
   that does not combine applies if it gives more; otherwise the combinable ones apply together.

---

### User Story 9 - See how a promotion is doing (Priority: P3)

A manager opens a promotion and sees its uses, distinct customers, discount given, orders and sales it
touched, and budget left, over its lifetime and the last 7 and 30 days.

**Why this priority**: Needed to decide what to run again, but the promotions work without it.

**Independent Test**: Place three orders with a promotion and confirm its page shows 3 uses, the correct
discount total and the correct sales.

**Acceptance Scenarios**:

1. **Given** a promotion used on 3 orders totalling $180 with $27 off, **When** a manager opens it,
   **Then** it shows 3 uses, $27.00 given and $180.00 in sales.
2. **Given** one of those orders is cancelled before it is fulfilled, **Then** its use and its discount
   are no longer counted, and the use goes back to the shopper and the budget.

---

### User Story 10 - Lifecycle and history (Priority: P1)

A manager saves a promotion as a draft, schedules it, pauses and resumes it, ends it early and archives
it. Its status is worked out from its dates, limits, budget and switch. Every change is recorded with who
made it. Once a promotion has been used, what it takes off and who it is for can no longer be changed.

**Why this priority**: The rules that keep money and history trustworthy are part of the first release.

**Independent Test**: Create a draft, schedule it, let it start, pause it, try to change its value after
one use, end it, archive it; confirm each status and that the value change is refused.

**Acceptance Scenarios**:

1. **Given** a draft, **Then** shoppers never see or receive it.
2. **Given** a used promotion, **When** a manager tries to change its value, what it applies to or who
   qualifies, **Then** the change is refused with the reason; dates, limits, budget, words and groups can
   still change.
3. **Given** an archived promotion, **Then** it is hidden from the default list but every order that used
   it still names it.

---

### Edge Cases

- Several promotions qualify and none says how to break a tie → the one giving the larger discount wins;
  an exact tie goes to the one ending soonest, then the oldest.
- A discount would make an item, the cart or delivery negative → it is limited to the amount it reduces;
  nothing goes below zero.
- A percentage of a price does not divide into cents → rounded down, so rounding never favours the
  business against the shopper's displayed price by more than a cent and never exceeds a cap.
- The cart changes between showing the discount and paying (an item removed, a window changed, the
  promotion ending, the budget running out) → the final price is re-checked at payment; if the discount
  changed the shopper is shown the new total before paying, never charged a total they did not see.
- An order using a promotion is partly refunded → the refund returns what the shopper paid for the
  refunded items after their share of the discount; the discount is shared across the items it applied to
  in proportion to their price.
- An order is cancelled before fulfilment → the use, the single-use code and the budget are released.
- A promotion is in a group but ends, is paused or runs out → it disappears from every group at once.
- A product in a product offer is withdrawn or changes category → it stops qualifying from that moment;
  carts already holding it are re-checked.
- A shopper is not signed in → automatic promotions for everyone are shown and applied; promotions that
  depend on who the shopper is (first order, chosen customers, per-customer limits) are shown only once
  they sign in, and are re-checked then.
- Points are used to pay → points still pay what is left after discounts; a promotion never changes the
  points a shopper holds.
- A code is typed in any case or with spaces → matched without regard to case or spaces.
- A promotion has no headline → it can still apply in the cart but cannot be added to a display group.

## Requirements *(mandatory)*

### Functional Requirements

**Kinds of promotion**

- **FR-001**: Staff MUST be able to create a **cart** promotion: a percentage off the eligible items
  (with an optional maximum discount) or a fixed amount off.
- **FR-002**: Staff MUST be able to create an **item** promotion: a percentage or a fixed amount off each
  qualifying item, where qualifying items are chosen products, all products in chosen categories
  (including their sub-categories), or all products of chosen brands; with an optional minimum quantity.
- **FR-003**: Staff MUST be able to create a **buy X get Y** promotion over a qualifying set of items:
  buy a number, get a number free or at a percentage off; the cheapest qualifying items are the ones
  reduced; optionally limited to a number of times per order.
- **FR-004**: Staff MUST be able to create a **delivery** promotion: free delivery, or a percentage or
  amount off the order's one delivery fee, for Delivered by Effy, Courier delivery or both.
- **FR-005**: A **first-order offer** MUST be expressible as any kind above limited to a customer's first
  order (FR-011), not as a separate kind.

**How a promotion is triggered**

- **FR-006**: Every promotion MUST be either **automatic** (applies when the cart qualifies) or **code**
  (applies only when a shopper enters a code that belongs to it).
- **FR-007**: A code promotion MUST have either one shared code or a batch of generated single-use codes;
  staff MUST be able to generate a batch of a chosen size (up to 10,000 at a time), add more later, and
  download the batch with each code's state.
- **FR-008**: Codes MUST be unique across all promotions, matched without regard to case or spaces, and
  never reused after the promotion that owned them is archived.

**Who qualifies and when**

- **FR-009**: Staff MUST be able to require a minimum spend and/or a minimum number of qualifying items.
- **FR-010**: Staff MUST be able to limit a promotion to Delivered by Effy, Courier delivery, or both.
- **FR-011**: Staff MUST be able to limit a promotion to: everyone; a customer's first order; customers
  who have never placed an order; or a list of chosen customers (added by searching customers, and by
  uploading a list of email addresses).
- **FR-012**: Staff MUST be able to set active dates (start and end, either open) and, optionally, the
  days of the week and hours of the day it applies, in Melbourne time.

**Limits**

- **FR-013**: Staff MUST be able to cap total uses, uses per customer, and total discount given (a
  budget). A promotion whose cap or budget is reached MUST stop applying and stop being shown at once.
- **FR-014**: A promotion MUST apply only if its whole discount fits in the budget left; it MUST NOT be
  partly applied to fit.

**Combining**

- **FR-015**: Each promotion MUST say whether it **combines** with other promotions. At most one code may
  be entered per order.
- **FR-016**: When several promotions qualify, the outcome MUST be: every combinable promotion applies,
  unless a single non-combinable promotion gives a larger discount on its own, in which case it alone
  applies. Item, cart and delivery reductions are worked out in that order (item offers first, then cart
  offers on what is left, then delivery).
- **FR-017**: When a promotion the shopper chose (by entering its code) does not apply because of
  combining, the shopper MUST be told why and which promotion applied instead.

**Lifecycle**

- **FR-018**: A promotion MUST be one of: Draft, Scheduled, Active, Paused, Used up, Out of budget,
  Ended, Archived — worked out from its dates, caps, budget and switch, never stored as a separate fact.
- **FR-019**: Staff MUST be able to save as draft, publish (scheduled or immediately active), pause,
  resume, end now, and archive. Ending and archiving MUST be confirmed.
- **FR-020**: Once a promotion has been used on any order, its kind, value, what it applies to and who
  qualifies MUST NOT change. Its dates, hours, limits, budget, combining, words and groups MAY change. A
  used promotion MUST NOT be deleted; an unused one MAY be.
- **FR-021**: Every change to a promotion, its codes or a group MUST be recorded with who made it and
  when, and shown on the promotion's page.

**Display groups**

- **FR-022**: Staff MUST be able to create, rename, reorder, describe and remove display groups. Each
  group MUST have a stable key that the customer website and app ask for; the key MUST NOT change once
  created.
- **FR-023**: Staff MUST be able to put a promotion in any number of groups and set its position within
  each group independently.
- **FR-024**: Each promotion MUST carry the shopper-facing words — a headline (required to be in a
  group), an optional supporting line and an optional short label (e.g. "This week's offer", "New") —
  separate from its internal name.
- **FR-025**: Staff MUST be able to preview a group as a shopper would see it, including which
  promotions are hidden right now and why (draft, scheduled, paused, used up, out of budget, ended).
- **FR-026**: The platform MUST give the customer website and app, for a group key, the promotions in
  that group that the asking shopper could use now, in group order, each with its words, its code (for
  code promotions with a shared code), the sentence of its conditions and when it ends.
- **FR-027**: Removing a group MUST remove only the grouping, never a promotion. A group that clients ask
  for and that does not exist MUST answer as empty, not as an error.
- **FR-028**: The platform MUST start with the groups the clients currently show offers in — Home hero,
  Home side cards, Offers page, Between Home sections — and existing advertised promotions MUST be placed
  in them so Home looks the same on the day of the change.

**Where shoppers see promotions**

- **FR-029**: The customer website and the customer app MUST show each group in its place: Home hero
  (the carousel), Home side cards, Between Home sections, the Offers page and the cart. Each place
  MUST read its group by key and show nothing when it is empty.
- **FR-030**: Products covered by an item or buy-X-get-Y promotion MUST show the offer where products
  are listed and on the product's own page.
- **FR-031**: The cart, checkout and receipt (on screen and emailed) MUST list each promotion that
  applied and how much it took off, and the item lines it reduced.
- **FR-032**: A code promotion shown to shoppers MUST show its shared code with a way to copy it;
  promotions with only single-use codes MUST NOT show any code.
- **FR-033**: Every condition that can stop a promotion applying MUST be said where it is shown and in
  the cart — never first at payment.
- **FR-034**: When a shown or applied promotion stops being available, a client MUST stop showing it the
  next time it shows that place, and within one minute (SC-005); the cart and checkout re-check it on
  every read. No screen refreshes on a timer. Back-office screens are told of changes as they are today.
  *(Amended at planning: the live channel has no scope that reaches every shopper at once, and adding one
  is out of scope.)*

**Money and history**

- **FR-035**: All promotions MUST be funded by Effy. What a shop is paid for an item MUST be unchanged by
  promotions, and a shop MUST NOT see which promotion applied, its name, its code or its terms. *(Amended
  at planning: a shop's order money panel already shows the order's total discount, which its refund
  arithmetic balances against; that one total stays, the code name it showed beside it does not.)*
- **FR-036**: Points MUST remain a way of paying, applied after all discounts; promotions MUST NOT change
  a points balance.
- **FR-037**: The final price MUST be re-checked when payment is taken; if it differs from what the
  shopper last saw, payment MUST NOT go ahead until the shopper has seen the new total.
- **FR-038**: Every order MUST keep, permanently, the promotions applied to it and the amount each took
  off each line and the delivery fee, as they stood when it was sold, so receipts, refunds and reports
  never re-derive them.
- **FR-039**: A refund of part of an order MUST return the shopper's paid share of each refunded line
  after its share of any discount.
- **FR-040**: Cancelling an order before fulfilment MUST release its uses, its single-use code and the
  budget it consumed.
- **FR-041**: Every promotion and code from the previous model MUST carry over: live codes keep working
  with their value, minimum, dates and caps; past orders keep naming the code and amount they were sold.

**Performance and reporting**

- **FR-042**: Each promotion's page MUST show uses, distinct customers, discount given, orders and sales,
  and budget left, for its lifetime and the last 7 and 30 days.
- **FR-043**: The promotions list MUST let staff filter by status, kind, trigger (automatic / code) and
  group, search by name or code, and see counts per status.

**Access**

- **FR-044**: Every back-office role MUST be able to read promotions, groups and performance; creating,
  changing, pausing, ending, archiving promotions and managing groups and codes MUST need a manager or an
  administrator.

**Removed**

- **FR-045**: The old "advertise on storefront" switch, its two placements (offers carousel / between
  sections), its banner position and its artwork editor MUST be removed from back-office and from what the
  clients read, replaced by groups and words (FR-022–FR-028).

### Key Entities

- **Promotion**: an offer. Internal name, kind (cart, item, buy X get Y, delivery), trigger (automatic or
  code), value (percent with optional cap, or amount; for buy X get Y the buy and get quantities and the
  reduction), what it applies to (whole cart, chosen products/categories/brands, delivery type),
  eligibility (audience, minimum spend, minimum quantity, days and hours, dates), limits (total uses, per
  customer, budget), combining, switch (on / paused), archived flag, shopper-facing words (headline,
  supporting line, label).
- **Promotion code**: a code that triggers a code promotion. Either the one shared code, or one of a
  batch of single-use codes with its state (unused, used on an order, released).
- **Chosen customers list**: the customers a promotion is limited to.
- **Display group**: a named place where promotions are shown. Stable key, name, description, and an
  ordered list of promotions.
- **Applied promotion (on an order)**: which promotion applied to an order, by which code if any, and the
  amount it took off each line and the delivery fee — kept as sold.
- **Use**: one order's use of one promotion by one customer; released if the order is cancelled before
  fulfilment.
- **Change record**: who changed what on a promotion, a code batch or a group, and when.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Staff can create and publish each of the four kinds of promotion, with targeting and limits,
  in under 3 minutes without help.
- **SC-002**: 100% of promotions live before the change keep working after it, and 100% of past orders show
  the same discount on their receipt before and after.
- **SC-003**: For every test cart in the acceptance scenarios, the discount the shopper sees in the cart
  equals the discount charged at payment and the discount on the receipt, to the cent.
- **SC-004**: No promotion ever gives more than its budget, its total-use cap or its per-customer cap,
  including when many shoppers check out at the same moment.
- **SC-005**: A promotion that is paused, ended, used up or out of budget stops being shown and applied in
  every client within one minute.
- **SC-006**: A shopper never learns of a promotion's condition for the first time at payment (verified
  across every acceptance scenario on both clients).
- **SC-007**: Placing a promotion in a group, or reordering a group, changes what both clients show
  without a client release.
- **SC-008**: No shop-facing screen or document names a promotion or its code, and no amount a shop is paid depends on one.

## Assumptions

- **Brands** are the brand recorded on each product in the catalogue today; a product with no brand never
  matches a brand offer.
- **Who funds it**: Effy funds every promotion; supplier-funded promotions are out of scope.
- **Tie-break** when several non-combinable promotions qualify: the larger discount for the shopper; then
  the one ending soonest; then the oldest. Staff do not set numeric priorities (one fewer thing to get wrong).
- **One code per order**, as today; automatic promotions apply alongside it under the combining rule.
- **Rounding**: down to the cent, per line, for percentages.
- **Signed-out shoppers** see only promotions open to everyone; personal promotions appear after sign-in.
- **Existing live codes** become cart code promotions with a shared code; existing advertised promotions are
  placed in the starting groups matching their old placement and position, with their headline and
  supporting line as their words. Uploaded artwork is not carried over (no client draws it).
- **Banner look** (colours, icons, decoration) stays as each client draws it today; a group decides which
  promotions and in what order, not how they look.
- **Out of scope**: supplier/shop-funded promotions, loyalty tiers, referral programmes, gift cards,
  promotions on points, A/B testing of promotions, and per-shop promotions (shops are hidden).
- **Melbourne time** for dates, days and hours, as everywhere else on the platform.

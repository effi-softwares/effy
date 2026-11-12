# Feature Specification: Hold Stock at Checkout

**Feature Branch**: `114-checkout-stock-holds`

**Created**: 2026-11-12

**Status**: Draft

**Input**: User description: "Hold stock at checkout: reserve a shop's stock when payment starts, confirm it at payment, release it when the order is abandoned or fails, so a shop can never sell more than it has"

## Background

Shops count stock per size of a product, and counting is their choice (054, 098). Today the count goes down only when an
order is **paid**. Between a shopper starting to pay and the payment going through, another shopper can buy the same last
units. Both are charged, and one order arrives at the shop short. 054 accepted this window on purpose (its assumption A6):
closing it needed a way to give back what an unfinished checkout had taken, and the platform had none. 113 now closes
unpaid orders after a set time, so the window can be closed.

The same point in checkout already holds a delivery window (for 10 minutes) and the points a shopper is using (for 30
minutes). This feature holds the stock there too.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The last units go to one shopper (Priority: P1)

Two shoppers have the last jar of a sauce in their carts. The first to start paying gets it held for them. The second is
told, before paying, that it is no longer available, and is never charged for it. The first pays and gets a complete
order.

**Why this priority**: This is the fault the feature exists to fix. A short order costs Effy a refund, the shop a bad
pick, and the customer the item they paid for.

**Independent Test**: With a counted product at 1, start payment as shopper A, then try to pay as shopper B. Only A can
pay for it; B's checkout says it is no longer available; after A pays, the count is 0 and A's order is not short.

**Acceptance Scenarios**:

1. **Given** a counted size with 1 on the shelf and two shoppers with it in their carts, **When** shopper A starts paying,
   **Then** that unit is held for A's order, and shopper B's cart and checkout show it as no longer available.
2. **Given** A's unit is held, **When** shopper B tries to start paying for it, **Then** B is told their cart changed, then
   sees the product with the words a cart uses when it is out of stock, and nothing is held or charged for B.
3. **Given** A's unit is held, **When** A's payment goes through, **Then** the shelf count goes down by 1 and the hold is
   used up; A's order is not marked short.
4. **Given** 5 on the shelf and shopper A holding 3, **When** shopper B asks for 3, **Then** B is told only 2 are
   available, the same way a cart already says it.
5. **Given** two shoppers start paying for the last unit at the same instant, **When** both payment starts arrive,
   **Then** exactly one gets the unit and the other is refused.

---

### User Story 2 - A shopper is charged only for what they were shown (Priority: P1)

A shopper looks at checkout showing 4 bottles of milk. While they type their card, someone else's checkout takes 2 of the
last 4. When the shopper presses Pay, they are not quietly charged for 2. They are told what changed and choose again.

**Why this priority**: Today checkout silently charges for whatever is still on the shelf, so a shopper can pay for
fewer items than the screen showed without being asked. With holds, this is the moment that answer is decided, so it
must be decided honestly.

**Independent Test**: Show checkout with a counted line of 4, then take 2 of them in another checkout, then press Pay.
The payment does not start; the shopper sees the line is now 2 and confirms again.

**Acceptance Scenarios**:

1. **Given** checkout showed a quantity for a counted line, **When** fewer can be held at the moment payment starts,
   **Then** payment does not start, nothing is held for the order, and the shopper is shown what changed and asked to
   confirm again.
2. **Given** the shopper confirms the new basket, **When** payment starts again, **Then** what can be held now is held
   and the shopper is charged for exactly that.
3. **Given** every counted line can be held in full, **When** payment starts, **Then** it starts with no extra step.
4. **Given** a line can no longer be held at all, **When** payment starts, **Then** the shopper is told that item is no
   longer available and is never charged for it.

---

### User Story 3 - Held stock goes back when it is not bought (Priority: P2)

A shopper starts paying and walks away. The units held for them go back on sale on their own when the hold time runs
out, without anyone doing anything. If the order is closed as unpaid (113) or the shopper changes their basket, the hold
goes at once.

**Why this priority**: Holding stock for checkouts nobody finishes would make products look sold out when they are on
the shelf. Shops lose sales they could have made.

**Independent Test**: Start payment for a counted product and stop. Another shopper sees it as unavailable; after the
hold time, they can buy it. Separately, close the unpaid order early and confirm the unit is back at once.

**Acceptance Scenarios**:

1. **Given** units are held and the shopper does nothing, **When** the hold time passes, **Then** those units are on sale
   again to every shopper, with no clean-up run needed.
2. **Given** units are held, **When** the order is closed as unpaid (113), **Then** the hold ends at that moment.
3. **Given** units are held, **When** the shopper changes their basket and starts paying again, **Then** the order's
   holds become the new basket's, never the old basket's plus the new one.
4. **Given** units are held and the card is declined, **When** the shopper retries within the hold time, **Then** the
   hold still stands and a successful retry gets every held unit; a retry after the hold time is held again, if the
   stock is still there.
5. **Given** a hold ran out and the shopper's payment then goes through, **When** the units are still on the shelf,
   **Then** the order is complete, as today; **When** they were sold in the meantime, **Then** the order is handled
   exactly as a short order is today (the line is marked short before picking and a refund is proposed), and the event
   is counted so staff can see how often it happens.

---

### User Story 4 - Shops and staff see what is held (Priority: P2)

A shop opens a product's stock and sees three numbers: what is on the shelf, how many are held in checkouts, and how many
are left to sell. Back-office sees the same on the product. The shelf count the shop enters is never changed by a hold.

**Why this priority**: Without this, a shop counting 5 on the shelf while the storefront says "out of stock" has no way
to understand why, and may "fix" a count that was right.

**Independent Test**: Hold 2 of a product with 5 on the shelf. The shop console and back-office both show 5 on the
shelf, 2 held, 3 left to sell; the shop's count is still 5.

**Acceptance Scenarios**:

1. **Given** units are held for checkouts, **When** a shop or staff member looks at the product's stock, **Then** they
   see the shelf count, the number held, and the number left to sell, for each size.
2. **Given** units are held, **When** the shop sets a new shelf count, **Then** the count they entered is the count kept,
   and what is left to sell is worked out from it.
3. **Given** a hold starts, ends or is used, **When** the shop has the product's stock open, **Then** it updates without
   a reload (071).
4. **Given** no shopper is told which shop holds stock (054 FR-015), **When** units are held, **Then** a shopper is never
   told that someone else holds them; the product simply shows as unavailable, or the cart says how many are available.

---

### User Story 5 - Staff set how long a hold lasts (Priority: P3)

An admin in back-office sets how long checkout holds stock. Managers see it but cannot change it.

**Why this priority**: The default suits most payments. The setting matters only if the numbers show holds running out
during bank checks, or products looking sold out too often.

**Independent Test**: As an admin, change the hold time; the next payment start holds for the new time; the change is in
the activity log with who made it.

**Acceptance Scenarios**:

1. **Given** an admin, **When** they set the hold time within its allowed range, **Then** new holds last that long and
   existing holds keep the time they were given.
2. **Given** a manager or CSA, **When** they open the setting, **Then** they can read it and cannot change it.
3. **Given** a value outside the allowed range, **When** it is saved, **Then** it is refused with the range.

---

### Edge Cases

- **The shop lowers its count below what is held.** The shop's count is kept. Nothing more is held from that product
  until there is stock again. A held order that then pays for units the shelf no longer has is handled as a short
  order, as today.
- **The shop stops counting a product.** Its holds no longer matter and end; the product sells as an uncounted product
  does.
- **The product or a size is taken off sale while held.** A held order that pays is handled as today; the hold ends when
  the payment outcome is known or the hold time passes.
- **The same shopper on two devices.** A shopper has one unpaid order at a time; starting payment again updates its holds
  and never adds to them.
- **A shopper's own hold.** What a shopper holds is not counted against them in their own cart or checkout; they are
  never told their own item is "no longer available" because they are holding it.
- **Points or a promotion cannot be held.** Payment start is refused as a whole: no stock is held for a payment that
  did not start.
- **A payment arrives for an order closed as unpaid.** Its holds were already released; 113 refunds that payment.
- **An order mixing counted and uncounted products.** Only counted sizes are held; the rest behave as today.
- **Very large quantities.** A hold never takes more than the shelf has left to sell.

## Requirements *(mandatory)*

### Functional Requirements

**Holding**

- **FR-001**: When a shopper starts paying for an order, the platform MUST hold, for that order, the quantity of every
  counted size in it, in the same step that holds its delivery window and points. Uncounted sizes MUST NOT be held.
- **FR-002**: A size's units **left to sell** MUST be its shelf count minus every live hold on it, never below zero. Every
  place that decides whether a shopper can buy a counted size (listings, product pages, search, cart, saved items,
  checkout and payment start) MUST use this one rule. Two definitions MUST NOT exist.
- **FR-003**: A shopper's own order's holds MUST NOT reduce what that shopper may buy in their own cart and checkout.
- **FR-004**: Two payment starts for the same last units MUST NOT both succeed, whatever their timing.
- **FR-005**: A hold MUST last for the hold time set when it was made, and MUST stop counting the moment that time passes,
  without waiting for any scheduled clean-up.
- **FR-006**: Starting payment again for the same unpaid order MUST replace that order's holds with ones for its current
  basket, and MUST give the full hold time again.

**What the shopper is charged**

- **FR-007**: If, at payment start, any counted line cannot be held in the quantity the shopper's checkout showed, the
  payment MUST NOT start, nothing MUST be held for the order, and the shopper MUST be shown the new quantities and asked
  to confirm. The amount charged MUST never differ from the amount the shopper confirmed.
- **FR-008**: A line that cannot be held at all MUST be shown as no longer available and MUST NOT be charged for.
- **FR-009**: The words a shopper sees MUST be the existing out-of-stock and "only N available" wording (054 FR-016, FR-017)
  plus at most one new sentence for "your basket changed, please check it". Any new sentence MUST be the same on the
  app and the website.

**Ending a hold**

- **FR-010**: When a held order's payment goes through, its holds MUST be used up and the shelf count reduced by what was
  sold, in the same step that records the payment.
- **FR-011**: When an order is closed as unpaid (113), its holds MUST end in the same step.
- **FR-012**: A declined payment MUST NOT end the holds. They last until the hold time passes, so a retry can still use
  them.
- **FR-012a**: When a payment is cancelled or fails for good (the order ends unpaid), its holds MUST end in the same
  step.
- **FR-013**: When a shop stops counting a size, its holds MUST stop counting at once. A size that is counted again
  is held again only by later payment starts; a hold made before counting stopped may count again if its time has not
  passed, which is accepted.
- **FR-014**: A payment that goes through after its holds ran out MUST be treated as today: complete if the units are
  still there, otherwise marked short before picking with a refund proposed (054, 055). Each such case MUST be counted
  and visible to staff.

**Shops and staff**

- **FR-015**: A hold MUST NOT change the shelf count a shop or staff member entered. Only a sale, a count, or a stock
  movement already in place changes it.
- **FR-016**: Shop and back-office stock views MUST show, for each counted size, the shelf count, the number held in
  checkouts, and the number left to sell. They MUST update when holds change, without a timer (071).
- **FR-017**: A shop MUST NOT be shown who holds its stock or anything about the shopper. Only the number held (see
  also FR-020 for shoppers).
- **FR-018**: Low-stock lists and thresholds (054) MUST keep using the shelf count.
- **FR-019**: An admin MUST be able to set the hold time within an allowed range. Managers and CSAs MUST be able to read
  it, not change it. Each change MUST be recorded with who made it and when, and shown in the setting's activity log
  (104).

**Customer privacy and wording**

- **FR-020**: A shopper surface MUST NOT disclose that another shopper is holding stock, or which shop has it (054 FR-015).

**Observability**

- **FR-021**: The platform MUST count, over time, holds made, holds used, holds that ran out, payment starts refused
  because stock changed, and payments that arrived after their hold ran out and were short. Staff MUST be alerted when
  late short payments happen more than rarely.

### Key Entities

- **Stock hold**: units of one counted size held for one unpaid order. Has the quantity, the shopper, and when it runs
  out. It exists only while its order is unpaid; how each hold ended (used by the payment, released when the order
  closed or the basket changed, ran out) is counted for staff, not kept per hold.
- **Hold time setting**: how long a new hold lasts, set by an admin, with its change history.
- **Size (existing)**: gains a derived "left to sell" (shelf count minus live holds), never stored.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a test where 20 shoppers start paying for the last 5 units of one size at the same moment, exactly 5
  units are held, no more than 5 units are paid for, and the shelf count never reads below 0.
- **SC-002**: No order paid within its hold time is ever short of a counted item because another shopper bought it.
- **SC-003**: In every test, the amount a shopper is charged equals the amount their checkout showed when they pressed
  Pay.
- **SC-004**: Units held for an abandoned checkout can be bought in a cart and checkout as soon as the hold time
  passes, or at once when the order is closed as unpaid; product listings show them within 60 seconds after that.
- **SC-005**: A shop looking at a product's stock while a checkout holds some of it sees the held number within 5
  seconds.
- **SC-006**: In dev over a week of test orders, fewer than 1 in 100 paid orders arrive after their hold ran out.

## Assumptions

- **Hold time**: 15 minutes by default, settable by an admin between 5 and 60 minutes. Longer than the 10-minute
  delivery-window hold, because a bank check can take several minutes; shorter than the 30-minute points hold, because a
  held unit stops other shoppers buying it.
- **No timer is shown to the shopper.** Grocery checkouts finish in minutes; a countdown would add worry and new wording
  for a rare case. The rare late payment is handled as a short order is today.
- **The hold starts at payment start**, the last moment the platform sees before the card is charged, as the delivery
  window and points do. Putting something in a cart holds nothing.
- **Stock is per size** (098) and per shop; there is one shop per product, so nothing chooses between shops.
- **Holds end by time, not by a clean-up.** A hold counts only while its time has not passed. 113's unpaid-order
  clean-up ends holds early when it closes an order, but correctness never waits for it.
- **Low-stock thresholds stay on the shelf count**, because they exist to prompt restocking and held units usually sell.
- **The setting lives with the other checkout and clean-up settings in back-office Settings**; its exact place is decided
  in the plan.
- **One unpaid order per shopper** at a time, as checkout already works.

## Out of Scope

- Holding stock while items sit in a cart, waitlists, or "notify me when back".
- Showing shoppers a countdown, or how many others are looking at an item.
- Choosing between several shops for the same product.
- Changing how a short order is refunded (055) or how stock is restocked after a refund or cancellation.
- Authorising a card and charging it later.

## Dependencies

- 054 Product Inventory (shelf counts, the one availability rule, short-order marking).
- 098 Product Variants (counts per size).
- 055 Refunds & Cancellation (the refund proposed for a short order).
- 113 Data Lifecycle (closing unpaid orders, refunding a payment on a closed order).
- 071 Live Updates (stock views update without a timer).
- 104 Activity Log Drawer (the setting's change history).

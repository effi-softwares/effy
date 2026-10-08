# Feature Specification: Customer Points (store credit)

**Feature Branch**: `074-customer-points`

**Created**: 2026-10-08

**Status**: Draft

**Input**: "Customer Points (store credit). Effy customers have a points balance that Effy can add to
and the customer can spend. This feature introduces the balance; earning points by buying is NOT part
of it. Back-office staff can credit or debit a customer's points for a stated reason, and every change
is recorded with who did it, when, why, and which order it relates to (if any). A customer sees their
balance and a plain history of every change on web and mobile. At checkout a customer can choose to use
points toward an order — part of it or all of it, goods and delivery alike — and sees exactly how much
was paid by points and how much by card before paying. One point is worth one cent (a business
setting). Points expire 12 months after they were credited (a business setting); the oldest points are
used first, expired points are never usable, and the customer is told before points expire. If an order
paid partly with points is cancelled or refunded, points go back as points and card money goes back to
the card, in the same proportion. A balance can never go negative. Points can never be withdrawn as
cash. Later features will credit points automatically (for example as compensation when Effy changes
how an order is delivered), so crediting must be something other parts of the platform can do with a
reason, not only a manual staff action. Back-office roles: admins and managers can credit and debit;
customer-service agents can view and credit up to a limit set by the business. The value of a point,
the expiry period and the agent credit limit are business settings."

## Why This Exists

Effy needs a way to **make things right without moving card money**. The first user is the delivery
model v2 programme (`docs/prd/2026-10-delivery-model-v2-backlog.md`, epic E7): when back-office has to
send an Effy-delivered order by courier in an emergency, the default compensation is **points worth
the fee difference**. Today the platform can only refund to the card (055). Points also give
customer-service a goodwill tool that keeps the customer's value inside Effy.

This feature is **only the balance**: crediting, spending, returning and expiring points. Earning
points by buying (a loyalty programme) is deliberately out of scope.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Staff credit a customer's points, and the customer sees them (Priority: P1)

A customer phones in: their order arrived late. A customer-service agent opens the customer in
back-office, credits 500 points ($5.00) with the reason "Late delivery" against that order, and the
customer immediately sees a balance of 500 points ($5.00) and a history line "+500 · Late delivery ·
order #1234 · expires 8 Oct 2027" on web and mobile, and gets an email saying so.

**Why this priority**: Without a balance that can be credited and seen, nothing else in this feature
exists. It is also the whole of what E7 (courier override compensation) needs on the crediting side.

**Independent Test**: Credit points to a test customer from back-office; confirm the balance and the
history line on web and mobile, the email, and the audit record naming the agent, time, reason and
order.

**Acceptance Scenarios**:

1. **Given** an admin or manager, **When** they credit any number of points to a customer with a
   reason, **Then** the balance rises by exactly that number and the change is recorded with who, when,
   why, the related order (if any) and the expiry date.
2. **Given** a customer-service agent, **When** they credit points within their limit, **Then** it
   succeeds; **When** they try to credit more than their limit in one credit, **Then** it is refused
   with a sentence naming the limit, and nothing changes.
3. **Given** any staff member, **When** they try to credit or debit without a reason, **Then** it is
   refused.
4. **Given** a credit, **When** the customer opens their points page on web or mobile, **Then** they see
   the new balance (in points and its money value), the history line, and when the points expire.
5. **Given** a credit, **When** it is recorded, **Then** the customer receives an email (and a push
   notification on mobile, where enabled) saying how many points they received and why, in
   customer-facing words.
6. **Given** another part of the platform credits points automatically (for example a future
   compensation flow), **When** it does, **Then** the record names that flow as the author, gives its
   reason and order, and behaves exactly like a staff credit to the customer.

---

### User Story 2 - The customer spends points at checkout (Priority: P1)

A customer with 1,250 points ($12.50) checks out a $47.80 order. They switch on "Use points", choose
to use all of them, and see "Points −$12.50 · Card $35.30" before paying. They pay; the order is
placed; their balance is 0. Another customer with 6,000 points pays a $42.00 order entirely with points
and is never asked for a card.

**Why this priority**: Points the customer cannot spend are worthless as compensation.

**Independent Test**: Give a test customer points; place one order paid partly by points and one paid
entirely by points; confirm the totals shown before paying, the amount charged to the card, the
balance after, and the receipt.

**Acceptance Scenarios**:

1. **Given** a customer with points, **When** they choose to use points, **Then** they can use any whole
   number of points from zero up to the lower of their usable balance and the order total, and the
   default is the most they can use.
2. **Given** a chosen number of points, **When** the checkout shows the total, **Then** it shows the
   order total, the points used and their money value, and the amount left to pay by card, and those are
   the amounts the order is settled at.
3. **Given** points cover the whole order (goods, delivery and any fees), **When** the customer places
   it, **Then** no card is asked for and no card is charged.
4. **Given** points are chosen, **When** payment by card fails or the customer abandons checkout,
   **Then** the points are not spent and are usable again.
5. **Given** two checkouts in progress for the same customer, **When** both try to use the same points,
   **Then** only one can; the other is told the balance has changed and shown the new amount before
   anything is charged.
6. **Given** some of the customer's points expire while they are at checkout, **When** they place the
   order, **Then** the order uses only points still valid at that moment; if fewer are available than
   shown, the customer is shown the corrected amounts before anything is charged.
7. **Given** an order paid with points, **When** the customer views the order or receipt (screen and
   email), **Then** points appear as a way the order was paid — never as a discount on the price.

---

### User Story 3 - Cancelled or refunded orders return points as points (Priority: P1)

An order of $40.00 was paid $10.00 by points and $30.00 by card. Staff refund one $8.00 item. The
customer gets 200 points back and $6.00 on the card. Another order paid entirely with points is
cancelled; every point comes back.

**Why this priority**: Without this, a refund could turn points into card money (a cash-out) or lose
them — either breaks the rule that points are never cash and never vanish unfairly.

**Independent Test**: Refund part of, and cancel the whole of, orders paid with mixed and points-only
payment; confirm the split and the history lines.

**Acceptance Scenarios**:

1. **Given** an order paid partly by points, **When** any amount of it is refunded, **Then** the refund
   is split between points and card in the same proportion the order was paid, and the two parts always
   add up to the refunded amount.
2. **Given** an order paid entirely by points, **When** it is cancelled or refunded, **Then** the whole
   refund comes back as points and nothing goes to a card.
3. **Given** points returned by a refund, **When** they are credited, **Then** they get a new full expiry
   period from the day they come back, and the history line names the order and the refund.
4. **Given** an order refunded piece by piece, **When** the last piece is refunded, **Then** the total
   points returned equal the points spent and the total card money returned equals the card money paid —
   never a cent more of either.

---

### User Story 4 - Points expire, and the customer is warned first (Priority: P2)

A customer received 500 points eleven months ago and never used them. Thirty days before they expire,
the customer is emailed "500 points ($5.00) expire on 8 Oct 2027". On that day they stop counting.

**Why this priority**: Expiry is a business setting and a fairness obligation; it matters once points
have been around for a while, not on day one.

**Independent Test**: Credit points with a short test expiry; confirm the warning, that expired points
no longer count, and that the oldest points are spent first.

**Acceptance Scenarios**:

1. **Given** points credited on a date, **When** the expiry period passes, **Then** those points are no
   longer part of the usable balance and cannot be spent, and the history shows them as expired.
2. **Given** a customer spends points, **When** they hold points credited on different dates, **Then**
   the oldest valid points are used first.
3. **Given** points that will expire within the warning period, **When** the warning is due, **Then**
   the customer is told once how many points expire and when; a customer is never warned more than once
   about the same points.
4. **Given** the business changes the expiry period, **When** new points are credited, **Then** they use
   the new period; points already credited keep the expiry they were given.

---

### User Story 5 - Staff correct a balance by debiting points (Priority: P2)

A manager notices points were credited to the wrong customer. They debit 500 points from that customer
with the reason "Credited in error", and credit them to the right customer.

**Why this priority**: Mistakes happen; without a debit, the only fix would be editing history.

**Independent Test**: Credit, then debit, points; confirm the history keeps both lines and the balance
cannot go negative.

**Acceptance Scenarios**:

1. **Given** an admin or manager, **When** they debit points with a reason, **Then** the balance falls by
   that number and the change is recorded with who, when and why.
2. **Given** a debit larger than the customer's usable balance, **When** it is attempted, **Then** it is
   refused with the current usable balance stated, and nothing changes.
3. **Given** a customer-service agent, **When** they try to debit, **Then** it is refused.
4. **Given** any change, **When** it has been recorded, **Then** it can never be edited or deleted; a
   mistake is corrected only by a further, opposite change.

---

### User Story 6 - The business sets the rules (Priority: P3)

An admin sets the value of a point, the expiry period, the customer-service credit limit and how long
before expiry customers are warned.

**Why this priority**: Defaults (1 point = 1 cent, 12 months, warning 30 days before) work from day one;
changing them is rare.

**Independent Test**: Change each setting and confirm the next credit, the next checkout and the next
warning use it, and that the change is recorded.

**Acceptance Scenarios**:

1. **Given** an admin, **When** they change a points setting, **Then** it applies from that moment and
   the change is recorded with who, when, the old and the new value.
2. **Given** a manager or customer-service agent, **When** they look for the settings, **Then** they can
   view but not change them.
3. **Given** the value of a point changes, **When** a customer views their balance, **Then** the money
   value shown uses the current value; orders already paid keep the money value they were paid at.

---

### Edge Cases

- **A customer with no points** sees a balance of 0 and one sentence saying what points are; checkout
  does not show the "Use points" control at all.
- **Points worth more than the order**: only the order total can be used; the rest stays in the balance.
- **An order total that is not a whole number of points** (if a point is ever worth more than a cent):
  points cover whole points only and the card pays the remainder; the customer never pays a fraction of
  a cent more than the order total.
- **A tiny card remainder** (for example 5 cents) that the card provider cannot charge: the customer is
  asked to use slightly fewer points so the card amount is chargeable, never charged a minimum on top.
- **A refund after the original points have expired**: the returned points are credited fresh with a
  full expiry period (Story 3, scenario 3).
- **A late card payment** that succeeds after the customer's points hold lapsed and the points were
  meanwhile spent elsewhere: the order is still honoured at what the customer saw, Effy absorbs the
  shortfall, and staff are told — the customer is never charged again and the balance never goes
  negative.
- **A customer closes their account**: the platform tells them before closure how many points they will
  lose; remaining points are forfeited on closure and the history records it.
- **A debit and a checkout at the same moment** for the same customer: whichever is recorded first wins;
  the other is refused or re-shown with the corrected balance; the balance never goes negative.
- **A credit tied to an order that belongs to a different customer** is refused.
- **A credit of zero or a negative number** is refused; a debit is its own action.

## Requirements *(mandatory)*

### Functional Requirements

**Balance and history**

- **FR-001**: Every customer MUST have a points balance, starting at zero.
- **FR-002**: Every change to a balance MUST be recorded as one entry with: the number of points (added
  or removed), the kind of change (staff credit, staff debit, automatic credit, spent on an order,
  returned by cancellation or refund, expired, forfeited on account closure), the author (a named staff
  member or a named platform flow), the reason, the related order (if any), the date and time, and —
  for points added — the date they expire.
- **FR-003**: Recorded entries MUST never be edited or deleted. A correction MUST be a further entry.
- **FR-004**: The usable balance MUST at every moment equal the points added, less points spent,
  debited, expired or forfeited, counting only points that have not expired. It MUST never be negative.
- **FR-005**: A customer MUST be able to see, on web and mobile, their usable balance in points and its
  money value, when their next points expire and how many, and their full history with customer-facing
  wording for each kind of change.

**Crediting and debiting**

- **FR-006**: Admins and managers MUST be able to credit any number of points to a customer with a
  mandatory reason and an optional related order.
- **FR-007**: Customer-service agents MUST be able to view a customer's points and history, and credit
  points up to the business's per-credit limit; anything above MUST be refused with the limit named.
- **FR-008**: Only admins and managers MUST be able to debit points, with a mandatory reason; a debit
  larger than the usable balance MUST be refused with the usable balance stated.
- **FR-009**: Other parts of the platform MUST be able to credit points automatically with a reason and
  related order, recorded under the name of that flow; such credits MUST obey every rule a staff credit
  obeys except the agent limit.
- **FR-010**: A credit tied to an order MUST be refused if the order does not belong to that customer.
- **FR-011**: A customer MUST be told by email (and push notification on mobile, where enabled) when
  points are credited, with the number, money value, customer-facing reason and expiry date. Debits,
  spending and returns MUST appear in the history but MUST NOT trigger a message on their own.

**Spending at checkout**

- **FR-012**: At checkout a customer with a usable balance MUST be able to choose how many points to
  use, from zero up to the lower of their usable balance and the order total (goods, delivery and any
  fees together); the default MUST be the most they can use.
- **FR-013**: Before paying, the customer MUST see the order total, the points used and their money
  value, and the amount left to pay by card; the order MUST be settled at exactly those amounts.
- **FR-014**: When points cover the whole order, the order MUST be placed without asking for or charging
  a card.
- **FR-015**: Points chosen at checkout MUST be reserved from the moment the customer commits to pay
  until payment succeeds (then spent) or fails or is abandoned (then released, usable again). Reserved
  points MUST NOT be usable by another checkout or debit.
- **FR-016**: When points are spent, the oldest valid points MUST be used first.
- **FR-017**: If the usable balance changes between showing and paying (expiry, a debit, another
  checkout), the customer MUST be shown the corrected amounts before anything is charged.
- **FR-018**: Points MUST be recorded and shown as a way of paying — never as a discount on prices,
  delivery fees or promotions — on the order, the receipt (screen and email) and in back-office.

**Returning points**

- **FR-019**: When an order paid partly by points is cancelled or refunded (fully or in part), the
  refunded amount MUST be split between points and card in the same proportion the order was paid; the
  two parts MUST add up exactly to the refunded amount, and across all refunds of one order MUST never
  return more points than were spent or more card money than was paid.
- **FR-020**: Points returned by a cancellation or refund MUST be credited with a new full expiry period
  from the day they are returned.
- **FR-021**: Points MUST never be paid out as money — not on request, not on refund, not on account
  closure.

**Expiry**

- **FR-022**: Points MUST expire at the end of the expiry period counted from the day they were credited
  (in the platform's operating timezone); expired points MUST never be usable and MUST appear in the
  history as expired.
- **FR-023**: A customer MUST be told once, by email, a set number of days before points expire, how many
  points expire and on what date.

**Account closure**

- **FR-024**: Before a customer closes their account, they MUST be told how many points they hold and
  that these will be lost; on closure remaining points MUST be forfeited and recorded.

**Business settings**

- **FR-025**: The business MUST be able to set: the money value of one point (default one cent), the
  expiry period (default 12 months), the customer-service agent per-credit limit, and the expiry-warning
  period (default 30 days). Only admins MUST be able to change them; every change MUST be recorded with
  who, when, the old and the new value.
- **FR-026**: A settings change MUST apply only from that moment: points already credited keep their
  expiry; orders already paid keep the money value of the points they used.

**Visibility and boundaries**

- **FR-027**: Shops MUST never see a customer's points, nor whether an order was paid with points.
- **FR-028**: Back-office MUST show, on a customer, their balance, history and any reserved points; and
  on an order, how much was paid by points and how much by card, and how much of each has been returned.
- **FR-029**: Every screen showing a balance or a points payment MUST update without the viewer
  refreshing when the balance changes.

### Key Entities

- **Points balance**: belongs to one customer; never stored on its own as a number anyone can edit — it
  is what the history adds up to (valid points added, less points used).
- **Points entry**: one change to a balance — kind, number of points, author (staff member or platform
  flow), reason, related order, time, and, for points added, expiry date. Never changed once recorded.
- **Points reservation**: points set aside for one checkout until it is paid, fails or is abandoned.
- **Order points payment**: on an order, the points used, their money value at the time, and the amount
  of points and card money returned so far.
- **Points settings**: point value, expiry period, agent credit limit, warning period — with a record of
  every change.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For every customer, at every moment, the usable balance equals the sum of their history —
  checked across every customer by a regular reconciliation, with zero mismatches.
- **SC-002**: No customer's usable balance is ever negative — zero occurrences.
- **SC-003**: A customer sees a new credit on their points page within 10 seconds of it being recorded,
  without refreshing.
- **SC-004**: A customer can apply points at checkout in one action (the default uses the most they can),
  and 100% of orders paid with points are charged to the card exactly the amount shown before paying.
- **SC-005**: Across all refunds of any order, points returned never exceed points spent and card money
  returned never exceeds card money paid — zero occurrences.
- **SC-006**: Every points change is attributable: 100% of entries name an author, a kind and a reason.
- **SC-007**: 100% of customers holding points that are about to expire receive exactly one warning
  before they expire.
- **SC-008**: A customer-service agent can credit points to a customer in under 1 minute from opening the
  customer.

## Assumptions

- **One point = one cent; points expire 12 months after crediting; warnings go 30 days before expiry**
  — the operator's stated defaults, all business settings (backlog decision Q2, 2026-10-08).
- **The customer-service per-credit limit** starts at 2,000 points ($20.00) until the business sets it.
- **Points are promotional credit given free by Effy, not bought by the customer**, so they are not a
  gift card. Australian gift-card rules (minimum three-year expiry) are assumed **not** to apply; this
  and the customer-facing points terms go to legal review (045's legal system) before go-live.
- **Points are a means of payment, not a discount**: prices, promotions and GST on the order are
  calculated exactly as without points; points then pay part or all of the total.
- **Returned points get a fresh expiry** (rather than their original one) — simpler to explain and never
  unfair to the customer.
- **Forfeiting points on account closure** is acceptable because points have no cash value; the customer
  is told beforehand.
- **Earning points by buying, tiers, transferring points between customers, and buying points** are out
  of scope (backlog E10-d).
- **The first automatic crediting flow** is the courier override compensation in a later feature (spec
  080 / backlog E7); this feature only has to make automatic crediting possible.
- **Existing roles are reused**: back-office admin, manager and customer-service agent (csa); no new role.
- **Existing refunds (055) remain the way money moves back**; this feature changes how a refund is
  split when points were used, not who may issue a refund or when.

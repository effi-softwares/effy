# Feature Specification: Data Lifecycle

**Feature Branch**: `113-data-lifecycle`

**Created**: 2026-11-11

**Status**: Draft

**Input**: User description: "113 Data lifecycle: clear abandoned unpaid orders, erase closed customer accounts on their
promised date, and remove phone notification registrations not seen for 270 days. (1) An order started at checkout and
never paid lingers forever as pending payment; it should be closed after a set time (releasing anything it held), never
shown to the customer as an order, and stop blocking account closure. (2) When a customer deletes their account they are
told an erase date; today nothing erases it. On that date the account must be erased as promised: personal details
removed or anonymised, sign-in removed, points forfeited and recorded, notifications erased (109 already purges them),
while records Effy must keep by law (orders, tax documents, payments) are kept without identifying the person. A closure
that the customer cancelled before the date is never erased. (3) Device registrations for push not seen for 270 days are
removed (notifications backlog A9). Staff can see when each job last ran and what it did; failures alarm. Source:
docs/next-implementation-candidates.md items 2 and 3, notifications backlog A9."

## Context

Three things Effy keeps today have no end:

- **Orders nobody paid for.** Checkout creates an order before the customer pays. If they never pay, it stays "awaiting
  payment" forever. It shows in the customer's order list, still holds any points and promotion uses set aside for it,
  and blocks the customer from deleting their account until they finish or abandon checkout themselves.
- **Accounts their owners deleted.** Since 034, a customer who deletes their account is told what is deleted, what is
  kept and why, and the date after which it cannot be recovered (30 days). Nothing deletes it on that date. 034 recorded
  this as a promise the platform cannot yet keep, and said **the apps must not be submitted to either store until it
  ships** (034 FR-041, SC-011). This is the slice that keeps it.
- **Phone registrations for notifications.** A phone that is thrown away, reset or uninstalled stays registered for
  ever, and Effy keeps trying to reach it (notifications backlog A9).

Some of the end is already built:
- 109's daily clean-up deletes an erased customer's notifications once their date has passed.
- 112's daily clean-up removes erased customers from saved message filters.
- Closing an account already ends every session, and signing in during the 30 days restores it (034).

This spec adds what's missing: the three clean-ups, a page where staff can see each one, and the rules for what an
erased customer leaves behind.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A deleted account is erased on the date the customer was told (Priority: P1)

A customer deletes their account and is told "after 12 December this can't be undone". On that date Effy erases it:
their name, email, phone, addresses, saved items, lists, cart, feedback, notification choices and phone registrations
are gone, and so is their sign-in. Their points are forfeited, and the forfeit is recorded. What Effy must keep stays,
with nothing on it that identifies them:
- the orders they paid for, and the payments and refunds on them;
- any tax invoice Effy issued because they asked for one, kept exactly as issued.

The same email can then be used to start a brand-new account.

**Why this priority**: it is a promise already made to every customer who deletes an account, a legal duty, and a
store-submission blocker. Everything else in this spec is housekeeping.

**Independent Test**: Close a test account and move its date into the past. After the next erasure run:
- the person can't sign in;
- the email registers as a new, empty account;
- back-office shows their old orders under "Deleted customer", with amounts and items intact;
- a search for their name, email or phone finds nothing anywhere in back-office.

**Acceptance Scenarios**:

1. **Given** a closing account whose erase date has passed, **When** the erasure runs, **Then** the account is erased
   within 24 hours of the date, and never before it.
2. **Given** an account that was closed and then restored by signing in during the 30 days, **When** the original date
   passes, **Then** nothing about it is erased.
3. **Given** an erased account that held 1,200 points, **When** staff open the points records, **Then** a forfeit of
   1,200 points is recorded against "Deleted customer", and the balance is 0.
4. **Given** an erased customer with three paid orders, **When** staff open one, **Then** they see the items, amounts,
   delivery fee, payment and refunds. The customer is shown as "Deleted customer". No name, email, phone, street address
   or delivery note is shown; the suburb and postcode remain.
5. **Given** an erased customer who once asked for a tax invoice, **When** staff open that order, **Then** the invoice is
   still available exactly as issued.
6. **Given** the erased customer's email, **When** someone registers with it, **Then** they get a new account with no
   orders, points, addresses or history from the old one.
7. **Given** the erasure run fails part-way through one account, **When** it runs again, **Then** it finishes that
   account without erasing anything twice or leaving it half-done for longer than one run. The failure raises an alarm.
8. **Given** an account that was barred before it was deleted, **When** it is erased, **Then** only the small security
   record described in FR-016 remains.

---

### User Story 2 - An order nobody paid for is closed by itself (Priority: P1)

A customer starts checkout, gets as far as payment, and walks away. After the abandon time (24 hours from when they last
touched checkout, by default) Effy closes the order:
- the points and promotion uses set aside for it are free again;
- any delivery place it held is released;
- Effy makes sure the payment can no longer be taken.

The order disappears from the customer's order list, because it never was an order. Their cart is kept, so they can
check out again at any time.

**Why this priority**: unpaid orders pile up for ever, clutter the customer's orders and keep points and promotion uses
locked. Closing them is also what lets the next story drop the "finish checkout first" refusal.

**Independent Test**: Start checkout with points and a promotion code, stop at the payment step, and wind the clock past
the abandon time. After the next run:
- the order is gone from the customer's list;
- the points and the code can be used again;
- the payment can't be completed;
- the cart still has its items.

**Acceptance Scenarios**:

1. **Given** an order awaiting payment last touched 25 hours ago, **When** the clean-up runs, **Then** it is closed as
   abandoned, its points and promotion uses are released, and the payment can no longer be taken.
2. **Given** an order awaiting payment whose payment the provider reports as already taken or still being processed,
   **When** the clean-up runs, **Then** the order is left alone. It is finished by the payment as it would have been,
   and checked again on the next run.
3. **Given** a customer who returns to checkout 2 hours after starting, **When** they pay, **Then** nothing is closed:
   returning to checkout restarts the abandon time.
4. **Given** a closed abandoned order, **When** the customer opens their orders on the app or website, **Then** it is not
   listed. An order still awaiting payment, within the abandon time, is shown as it is today.
5. **Given** a payment that somehow succeeds for an order already closed as abandoned, **When** Effy hears of it,
   **Then** the full amount is refunded automatically and staff can see what happened. The customer is never charged
   for an order they can't see.
6. **Given** an admin, **When** they change the abandon time in back-office, **Then** it must be between 1 hour and 7
   days. Managers can see it but not change it.

---

### User Story 3 - An unpaid order no longer stops someone deleting their account (Priority: P2)

Today a customer with an order awaiting payment is told to finish or abandon checkout before they can delete their
account. After this spec, closing the account closes that unpaid order on the spot, in the same way as Story 2. Only a
paid order still on its way blocks, as before.

**Why this priority**: it removes a refusal the customer often can't act on (they may not know there is an unpaid
checkout), which is what the store rules call "unnecessarily difficult" deletion.

**Independent Test**: Leave an order awaiting payment, then delete the account. Deletion goes through, and the unpaid
order is closed.

**Acceptance Scenarios**:

1. **Given** a customer with an order awaiting payment and no paid order on its way, **When** they delete their account,
   **Then** the screen doesn't list the unpaid order as a blocker. On confirmation the order is closed as abandoned and
   the account is closed.
2. **Given** that unpaid order's payment is being processed at the moment they confirm, **When** they confirm, **Then**
   deletion is refused with "A payment for order {number} is going through. Try again in a few minutes." Nothing is
   closed.
3. **Given** a customer with a paid order still on its way, **When** they try to delete their account, **Then** they are
   blocked exactly as today: the order is named, there is a link to it, and they see when the block clears.

---

### User Story 4 - Phones that have gone quiet stop being registered (Priority: P3)

Every time the customer app, driver app or shop console is opened on a device, it confirms its registration. A
registration not confirmed for 270 days is removed, so Effy stops sending to phones that are gone. An account being
deleted loses its registrations when it is closed, so nothing is sent to it during the 30 days.

**Why this priority**: low risk and low visibility. It stops wasted sends and keeps the delivery figures honest (112's
"no phone" count), but nobody is blocked without it.

**Independent Test**: Give a test registration a last-confirmed date 271 days ago. After the next run it is gone, and a
registration confirmed yesterday is kept.

**Acceptance Scenarios**:

1. **Given** a registration last confirmed 271 days ago, **When** the clean-up runs, **Then** it is removed.
2. **Given** a driver who opens the app every day, **When** 300 days pass, **Then** their registration is still there.
3. **Given** a customer who closes their account, **When** an order update would have reached them, **Then** no
   notification is sent to their phone. If they sign in again during the 30 days, the app registers again.

---

### User Story 5 - Staff can see that the clean-ups are working (Priority: P2)

On one back-office page, staff see each clean-up: unpaid orders, account erasure and phone registrations.
For each one they see:
- when it last ran and whether it worked;
- what it did, for example "Closed 14 unpaid orders" or "Erased 2 accounts";
- when it runs next.

They can open a clean-up's activity to see earlier runs. On a customer's page, staff see when an account is being
deleted, and the date it will be erased. A failed run raises an alarm to the operator.

**Why this priority**: an erasure that silently stops working breaks a legal promise with nobody noticing. Staff also
need to answer a customer who phones to say they deleted their account by mistake.

**Independent Test**: Open the page after a night's runs. Each clean-up shows a time, a result and a count that matches
the database. Make a run fail: the page shows the failure and the alarm fires.

**Acceptance Scenarios**:

1. **Given** last night's runs, **When** a manager opens the page, **Then** each clean-up shows when it last ran, its
   result, its counts and when it runs next.
2. **Given** a clean-up that has not run within its bound (FR-022), or whose last run failed, **When** anyone opens the
   page, **Then** it is marked as a problem. The operator has already been alerted. A run that only partly worked is
   marked too.
3. **Given** a customer who deleted their account 5 days ago, **When** a CSA opens their page, **Then** it says
   "Being deleted: erased on {date}. Signing in before then restores the account." Staff can't restore it or erase it
   early.
4. **Given** an erased customer, **When** staff open one of their old orders, **Then** the customer is "Deleted
   customer", with no link to a customer page.
5. **Given** a CSA, **When** they open the clean-ups page, **Then** they can see it but not change the abandon time.

---

### Edge Cases

- **Restored, then deleted again.** A customer restores during the 30 days and later deletes again. Only the new date
  counts.
- **A paid order still unfinished at the erase date.** This can happen past 034's 7-day backstop. Erasure proceeds, and
  the order is kept like any other paid order. The delivery address is removed only after the order is finished or the
  erasure date passes, whichever is later. (In practice it is long past.)
- **A refund in progress at the erase date.** Erasure proceeds. The refund completes to the original payment method as
  it would have, and is recorded on the retained order.
- **The payment provider can't be reached.** Unpaid orders are left until it can be: an order is never closed while its
  payment might still be taken. If the provider's saved-card record can't be removed, erasure of that account is
  retried. It doesn't stop the rest of the run, and staff see it as a problem.
- **Thousands due at once.** A large backlog, such as the first run after this ships, is worked through in batches over
  as many runs as needed. Each account is erased whole, never half.
- **Erased customer in a saved message filter or promotion target list.** Removed from it (112 already does this for
  message filters).
- **The customer's email in staff activity logs.** After erasure no activity log, note or audit entry may show their
  name, email, phone or address. They read "Deleted customer".
- **Guest checkout.** There is none (sign-in is required), so every unpaid order belongs to an account.
- **The barred customer comes back.** They register with the same email after erasure. The registration is allowed (034
  FR-048), and staff are told it matches a barred, erased account (FR-016).

## Requirements *(mandatory)*

### Functional Requirements

**Unpaid orders**

- **FR-001**: An order awaiting payment MUST be closed as abandoned once the abandon time has passed since the customer
  last touched its checkout.
  - The abandon time defaults to 24 hours.
  - Admins can set it between 1 hour and 7 days; managers can see it.
- **FR-002**: Before closing an abandoned order, Effy MUST make sure its payment can no longer be taken. If the provider
  says the payment has been taken or is still being processed, or can't be asked, the order MUST be left alone and
  checked again on the next run.
- **FR-003**: Closing an abandoned order MUST, together:
  - free the points and promotion uses held for it;
  - release any delivery place it held;
  - keep the customer's cart.
- **FR-004**: An order that ended without being paid (abandoned or failed) MUST NOT appear in the customer's order list on any
  surface. It MUST NOT count as
  an order anywhere staff count orders, and it MUST NOT make a customer "has ordered" for promotions or message
  audiences.
- **FR-005**: A payment that succeeds for an order already closed as abandoned MUST be refunded in full automatically.
  It MUST be recorded and shown to staff.
- **FR-006**: Returning to checkout MUST restart the abandon time for the customer's unpaid order.
- **FR-006a**: A declined card MUST leave the order awaiting payment, so the customer can try again on the same screen and a
  later success places the order. Only the clean-up (FR-001), a payment that can no longer be taken, or closing the account
  (FR-007) ends an unpaid order. *(Found in planning: today a decline marks the order failed at once, and a retry that then
  succeeds is charged with no order placed.)*

**Account closure (amends 034 FR-042)**

- **FR-007**: An order awaiting payment MUST NOT block account deletion. Confirming deletion MUST close it as abandoned
  (FR-002, FR-003) in the same step.
  - If its payment is being processed, deletion MUST be refused with a message saying so, and nothing changes.
  - A paid order still on its way blocks exactly as 034 defines.
- **FR-008**: Closing an account MUST remove the account's phone registrations at once, so no notification reaches a
  phone during the 30 days. Signing in again to restore MUST let the app register again. *(Already true since 109; kept
  here so it is checked.)*

**Erasure**

- **FR-009**: A closing account MUST be erased no earlier than its stored erase date, and within 24 hours after it. An
  account restored before the date MUST NOT be erased. Once the date has passed, signing in MUST NOT restore it, even if
  erasure hasn't run yet: the customer was told it can't be undone after that date.
- **FR-010**: Erasure MUST delete:
  - name, email and phone;
  - saved addresses and delivery instructions;
  - business details for tax invoices;
  - cart, saved items and lists;
  - feedback the customer sent, and replies to it;
  - newsletter and marketing choices, and the record of consent answers;
  - notification choices and phone registrations;
  - the business name and ABN given for tax invoices on each order, the record of receipts emailed to them, and their email
    delivery history;
  - the address files on courier labels, and the free-text note on any delivery proof.
- **FR-010a**: Orders that were never paid (awaiting payment, failed or abandoned) MUST be stripped like paid orders
  (FR-013), not deleted: they can carry promotion, points and refund records that must stay whole.
- **FR-011**: Erasure MUST remove the customer's sign-in, including any linked Google sign-in, so the email is free.
  It MUST also remove the payment provider's record of their saved cards.
- **FR-012**: Erasure MUST forfeit any points left, recorded in the points history like any other forfeit (074 FR-024).
  It MUST happen before the person is detached from the history.
- **FR-013**: Erasure MUST keep paid orders and their items, amounts, delivery fees, promotions applied, points used,
  payments, refunds and parcel and delivery records. On these, and everywhere else, the customer MUST appear only as
  "Deleted customer".
  - The recipient name, phone, street address and delivery notes on these orders MUST be removed. Suburb and postcode
    are kept.
  - An order still on its way at erasure keeps its address until it is finished; the next erasure run after that removes
    it.
  - Delivery proof (photo or signature, and when it was taken) is kept as part of the delivery record.
- **FR-014**: A tax invoice Effy issued at the customer's request MUST be kept exactly as issued, because the law
  requires it.
- **FR-015**: After erasure, no back-office search, page, list, activity log, export or report may show the customer's
  name, email, phone or street address, apart from an issued tax invoice (FR-014).
- **FR-016**: For an account that was barred when it was erased, Effy MUST keep only a one-way fingerprint of its email
  and phone, and the date. Nothing else MUST be kept for security.
  - A new registration that matches it MUST be allowed. The new customer's back-office page MUST say it matches an
    account that was barred and deleted on {date}.
  - For an account that was not barred, nothing is kept for security.
  - The pre-deletion screen's "Security and fraud checks" line MUST be reworded to say exactly this (034 SC-010: every
    sentence must be true).
- **FR-017**: Erasure MUST be done whole for each account: either everything in FR-010 to FR-013 happened, or the
  account is still closing and is retried on the next run. It MUST be safe to run twice.
- **FR-018**: Each erasure MUST leave a record that it happened (when, and the closure's reference number) with nothing
  identifying the person. This lets Effy show that a deletion request was carried out.
- **FR-019**: A registration with an erased account's email MUST create a genuinely new account that inherits nothing
  (034 FR-048).

**Phone registrations**

- **FR-020**: The customer app, driver app and shop console MUST confirm their registration each time they are opened on
  a device that has one.
- **FR-021**: A registration not confirmed for 270 days MUST be removed.

**Seeing it work**

- **FR-022**: Back-office MUST have one page listing the three clean-ups. For each, it shows:
  - when it last ran, its result and what it did, in counts;
  - when it runs next;
  - whether it needs attention: the last run failed or partly failed, or it hasn't run within its bound (unpaid orders 1
    hour, account erasure 2 hours, phone registrations 26 hours).
  
  Admins, managers and CSAs can see the page. Only admins can change the abandon time. The page has a guided tour
  (HK, below).
- **FR-023**: Each clean-up MUST keep a history of its runs, opened from the page as an activity log. Older runs are kept
  for at least 90 days.
- **FR-024**: A failed run, a clean-up that hasn't run within its bound (FR-022), or an account that still can't be
  erased after three runs MUST alert the operator. The page and the alert use the same bounds.
- **FR-025**: A customer's back-office page MUST show when the account is being deleted and the erase date. It MUST NOT
  offer staff a way to restore the account or erase it early.
- **FR-026**: Each clean-up MUST work through a backlog in batches, without slowing customers' shopping. Accounts and
  orders left over carry to the next run.

### Key Entities

- **Unpaid order**: an order created at checkout and not yet paid, and when its checkout was last touched. It ends paid,
  failed or closed as abandoned. "Abandoned" is a new ending, kept apart from a payment that failed.
- **Closure request** (034): the customer's request, its erase date, and whether it was restored. Gains when it was
  erased.
- **Erasure record**: proof that a closure was carried out (reference and time), with nothing identifying the person.
- **Security fingerprint**: for a barred account only. A one-way fingerprint of email and phone, and the date.
- **Phone registration**: a device that may receive notifications, and when it was last confirmed.
- **Clean-up run**: one run of one clean-up. It records when it started and ended, the result, what it did in counts,
  and any problem.
- **Abandon time**: one setting, from 1 hour to 7 days, defaulting to 24 hours.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every account whose erase date has passed is erased within 24 hours of it. Checked on dev with accounts
  dated in the past, none is left closing after the next run.
- **SC-002**: After erasure, a search of back-office for the customer's name, email or phone returns nothing. A check of
  every place Effy stores personal details finds none of theirs, apart from an issued tax invoice.
- **SC-003**: Every sentence of the pre-deletion screen ("what is deleted", "what is kept and why") is true of the built
  system, checked one by one. This closes 034 SC-010 and SC-011, so the apps may be submitted to the stores as far as
  account deletion is concerned.
- **SC-004**: No order is left awaiting payment for longer than the abandon time plus one day, unless its payment is
  being processed at the provider.
- **SC-005**: No customer is charged for an order closed as abandoned. Any late payment is refunded within one run, and
  shown to staff.
- **SC-006**: A customer with only an unpaid checkout can delete their account in one go, with no refusal.
- **SC-007**: No phone registration on the platform is older than 271 days since it was last confirmed.
- **SC-008**: Staff can tell from one page, in under a minute, whether every clean-up ran last night and what it did. A
  failure reaches the operator without anyone opening the page.
- **SC-009**: Restoring an account during the 30 days never loses any of its data.

## Guided tours

The words below are the source for back-office's tour tests (107 rule).

### HK - Clean-ups (new page, Settings › Business)

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Page heading | Clean-ups | Jobs that run by themselves to close unpaid orders, erase deleted accounts and remove old phone registrations. | |
| 2 | The jobs | Did it work? | When each one last ran, what it did and when it runs next. One that failed or hasn't run is marked. | |
| 3 | Abandon time | Unpaid orders | How long an unpaid checkout waits before it is closed and its points and codes are freed. | |
| 4 | Activity | Earlier runs | Every run and every change to the abandon time, with who changed it. | |

## Assumptions

- **The erase date is the one already stored** for each closure (30 days after the request, 034). This spec doesn't
  change the 30 days or the words shown at deletion, except the security line (FR-016).
- **What counts as a legal record is decided by the existing disclosure**: completed sales (orders and receipts), and
  payments and refunds. Feedback isn't on that list, so it is deleted (FR-010) rather than kept anonymous. ⚠ The
  disclosure still "needs legal confirmation before launch" (034). This spec makes the system match the disclosure; it
  doesn't settle the legal question.
- **How long retained orders are kept** (for example, five years for tax and then deleted) is not decided here. They are
  kept as today.
- **Postcode and suburb stay on retained orders** for delivery and tax reporting. On their own they don't identify a
  person.
- **No email is sent at erasure.** The customer was told the date when they deleted the account, and an email would go to
  an address that is being erased.
- **Product analytics and crash reports** hold only the sign-in id, which no longer belongs to anyone after erasure.
  Nothing is sent to those services.
- **Only customer accounts** are erased by this spec. Driver, shop staff and back-office accounts are removed by staff
  through their existing tools.
- **How often they run**: unpaid orders every 15 minutes (so an abandon time of 1 hour means about an hour), account
  erasure every hour, phone registrations once a day.
- **Staff can't restore or erase early**: restoring is the customer's own deliberate act (034 FR-041a), and erasing
  before the promised date breaks the promise of 30 days.

## Out of Scope

- Sweeping old notifications (109 already does it) and the 112 report freeze.
- Deleting retained orders after a legal retention period.
- Exporting a customer's data on request ("download my data").
- Holding stock for an order at checkout (candidate register item 16), which this spec makes possible later.
- The event backbone (candidate item 1): its unread table was removed in the 2026-10-23 cleanup.

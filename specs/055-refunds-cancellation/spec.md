# Feature Specification: Refunds & Order Cancellation

**Feature Branch**: `055-refunds-cancellation`

**Created**: 2026-08-29

**Status**: Draft

**Input**: User description: "next let's move on to the G3 in ORDER-FLOW-GAPS.md — you need to understand the G3 and then need to have a solid industry standard plan to implement this!"

---

## Why this exists

**Effy can take money and cannot give it back.** There is no refund capability anywhere on the
platform — no record of one, no way for staff to issue one, no way for a shopper to ask. Gap **G3**
records it, and the code records it too: the shop's own shortfall handler says, at the top of the file,
that a customer is charged for *"something they will not receive, and that debt is left queryable for a
later refunds slice."* That slice is this one.

Three things make it the right next piece of work.

**1. ⚠ Effy already publishes a refunds policy it cannot honour.** The Refunds, Returns & Cancellations
policy is live on both customer surfaces today. It contains this table:

| What happened | What you get | How |
|---|---|---|
| Item missing | Refund of that item | To your original payment method |
| Item damaged, spoiled or incorrect | **Refund or replacement** | Refund to original method, **or replacement on a future order** |
| Order cancelled before dispatch | Full refund | To your original payment method |
| Major failure (ACL) | **Refund or replacement, your choice** | To your original payment method |

⚠ **Two of those four rows promise a replacement, and this slice builds only the refund arm.** That is
recorded rather than hidden: replacements are out of scope (below), and SC-010 is scoped to the refund
half accordingly. An earlier draft of this spec reproduced only three rows and counted four — which is
precisely how a promise goes unnoticed.

It also tells shoppers *"To cancel, use the app"* — **there is no such control** — and states the
Australian Consumer Law guarantees that *"cannot be excluded"*. A published promise the product cannot
keep is a different kind of defect from a missing feature.

**2. The shortfall path ends in an apology.** When a picker cannot find an item, the order total is
never adjusted. The customer's order page shows an "Unavailable" panel ending in *"Contact support
about this order and we'll sort it out"* — and until 053 nobody at Effy could even look the order up.
Support can now see it and still cannot act on it.

**3. ⚠ 054 sharpened this rather than solving it.** Inventory makes shortfalls rarer and catches them
earlier, which means the ones that remain are **real** — and a shopper who is oversold in 054's
accepted residual window is charged in full with no way to get anything back.

---

## Clarifications

### Session 2026-08-29

- Q: Can a customer *ask* for a refund, or only cancel? → A: A refund **request** attached to the order — the customer picks items and says what went wrong; it reaches back-office as awaiting a decision. No message thread.
- Q: How is the refund amount decided? → A: Two kinds, recorded distinctly. **Item-derived** — ticking order lines computes the amount, which is never hand-edited. **Goodwill** — a free amount with a mandatory note. Every refund records which kind it was.
- Q: When does the customer's cancellation window close? → A: **Before any shop begins preparing** — narrower than the published policy's "before it is dispatched". ⚠ The policy wording MUST be corrected as part of this slice; staff can still cancel later (FR-018).
- Q: Should a recorded shortfall refund itself? → A: **Auto-queue, human confirms.** A shortfall raises a pre-filled refund awaiting approval — items and amount already derived — that a person issues or dismisses. No money moves without a human step.
- Q: What happens when the refund submission itself fails? → A: **Distinguish the two.** An ambiguous failure (timeout, unreachable) is retried automatically under the same idempotency key so a duplicate is impossible; a definite refusal is not retried and is surfaced to staff with the provider's reason.

## What "cancellation" actually means here

⚠ **There is no free cancellation window, and the policy's wording hides that.** Effy captures payment
immediately when an order is placed. Once money is captured, "cancelling" an order is mechanically
**a full refund** — the payment provider's own cancel operation applies only to money that has not
been captured yet, which never describes an Effy order.

This has two consequences the spec takes as given:

- **A cancellation is a refund with a different name to the customer.** The word matters to a shopper
  ("cancel my order" is what they will look for) and the mechanism is identical underneath. Presenting
  them as one thing internally and two things externally is the correct shape.
- **⚠ Cancelling is not free to Effy.** The payment processor keeps its fee on a refunded payment. That
  is a business fact the platform should record, not hide — but it MUST NOT be deducted from what the
  customer gets back.

---

## Scope

**In scope**

- Recording a refund against an order, in whole or in part, with the reason it was issued.
- Issuing that refund to the customer's original payment method.
- ⚠ **Handling a refund that fails or is delayed** — refunds are asynchronous and can be rejected days
  later, which is the part naive implementations get wrong (see Assumption A3).
- A customer asking to cancel an order that has not yet been picked, and being told plainly when it is
  too late.
- Back-office staff issuing a refund against a whole order or specific items, with a reason and an audit
  trail.
- **A customer raising a refund request against a specific order** — naming the items and what went
  wrong — which reaches back-office as a decision to make. ⚠ The request does **not** move money and is
  not a promise; it replaces "email support and hope" with something attached to the order.
- Adjusting an order's recorded totals so the order tells the truth about what was ultimately charged.
- Telling the customer — the refund confirmed by email, and visible on the order.
- Returning refunded stock where the platform knows it should (054 left the door open for this).

**Out of scope** — each named so it is not mistaken for an oversight:

- **Physical returns and reverse logistics.** Groceries are perishable; the published policy asks
  customers to dispose of unusable items, not ship them back. A returns-merchandise flow is a different
  product.
- **Replacements and re-delivery.** The policy offers "refund **or** replacement" for damaged items;
  this slice builds only the refund arm and the wording must not promise the other.
- **Disputes and chargebacks.** A dispute is a provider-initiated process with its own evidence
  deadlines. Related, and its own slice.
- **Store credit, goodwill vouchers, or any refund to something other than the original payment method.**
- **Automatic refunds.** Every refund in this slice is a deliberate act by a person. Deciding *when*
  Effy should refund without being asked is a policy question, not an engineering one. A customer's
  request is an input to that decision, never a trigger for it.
- **A support conversation.** A refund request carries what the customer said and receives an outcome;
  it is not a thread. Messaging back and forth is a support product, and building half of one here
  would leave customers replying into something nobody reads.
- **Shop-level financial consequences.** Who bears the cost of a shortfall — Effy or the shop — is a
  commercial arrangement that does not exist yet. This slice records what happened; it settles nothing.
- **Partial-payment or instalment reversal**, and refunds to a payment method the platform no longer
  holds a reference for.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Staff refund an order that went wrong (Priority: P1)

A customer contacts support: an item was missing from their delivery. A back-office staff member opens
the order, sees the shortfall the picker recorded, chooses to refund that line, gives a reason, and
confirms. The customer's money starts its way back to the card they paid with, and the order now shows
what was actually charged.

**Why this priority**: It is the whole point. Everything else in this slice is a route into this
action or a consequence of it, and it is the one that discharges a promise Effy has already published.

**Independent Test**: Take a paid order with a recorded shortfall, refund the affected line from the
console, and confirm the money is returned, the order total reflects it, and the action is attributed.

**Acceptance Scenarios**:

1. **Given** a paid order with an item the picker could not find, **When** a staff member issues a
   refund for that item, **Then** the refund is sent to the original payment method, the order records
   it, and the staff member's identity and reason are recorded with it.
1a. **Given** a picker records a shortfall, **When** back-office next reads the orders queue, **Then**
   that order is identifiable as awaiting a decision and carries a proposed refund with the items and
   amount already filled in — **and no money has moved**.
1b. **Given** a proposed refund, **When** a staff member dismisses it, **Then** no money moves, the
   dismissal is recorded with who and why, and the order stops appearing as awaiting a decision.
1c. **Given** a picker edits the same shortfall twice, **When** back-office reads the order, **Then**
   there is one proposal, not two.
2. **Given** an order where everything went wrong, **When** a staff member refunds the whole order,
   **Then** the full amount the customer paid is returned, including the delivery fee.
3. **Given** an order that has already been refunded in part, **When** a staff member issues another
   refund, **Then** it is permitted up to what remains and refused beyond it, with the remaining
   amount stated.
3a. **Given** a staff member selects order lines, **When** they review the refund, **Then** the amount
   is computed from those lines and cannot be typed over.
3b. **Given** a line already refunded in full, **When** a staff member selects it again, **Then** it is
   refused — the same unit cannot be refunded twice.
3c. **Given** a staff member issues a goodwill refund, **When** they submit it without a note, **Then**
   it is refused: an amount with no line and no explanation is unaccountable.
4. **Given** a staff member without the required permission, **When** they attempt to issue a refund,
   **Then** they are refused, and the refusal does not depend on which order it was.
5. **Given** a refund is issued, **When** anyone later reads the order, **Then** they can see what was
   refunded, when, why, by whom, and whether the money actually reached the customer.
6. **Given** the same refund request is submitted twice — a double-click, a retried request — **When**
   it is processed, **Then** the customer is refunded once.
7. **Given** the provider cannot be reached, **When** the platform retries, **Then** it uses the same
   idempotency key, and however many attempts are made the customer is refunded at most once.
8. **Given** the provider definitively refuses a refund, **When** that answer arrives, **Then** it is
   NOT retried, and a staff member can read the provider's own reason.
9. **Given** a refund whose submission has not yet succeeded, **When** the order is read, **Then** it is
   not counted as refunded and the customer is not told money is on its way.

---

### User Story 2 - A customer asks to cancel an order (Priority: P1)

A shopper realises they ordered the wrong thing. They open the order, and if nobody has started
picking it they can cancel it themselves and get everything back. If picking has begun, the control is
not offered — instead they are told plainly what stage the order has reached and what they can do
instead.

**Why this priority**: P1 alongside Story 1 because the published policy tells customers this control
exists. Every day it does not is a promise being broken in writing, and it is the single most common
post-purchase request in any commerce product.

**Independent Test**: Place an order, cancel it before any shop opens it, and confirm the full amount
is returned and no shop is left holding work. Then take an order already being picked and confirm the
control is absent and the reason is stated.

**Acceptance Scenarios**:

1. **Given** a paid order no shop has begun preparing, **When** the customer cancels it, **Then** the
   whole amount is returned, the order is recorded as cancelled, and every shop's portion is withdrawn
   so nobody picks it.
2. **Given** an order where any shop has begun picking, **When** the customer opens it, **Then** no
   cancel control is offered, and the order says why and how to get help. ⚠ The wording must not imply
   the order can no longer be cancelled at all — staff still can (FR-018) — only that the customer
   cannot do it themselves.
3. **Given** an order that is already delivered or already cancelled, **When** the customer opens it,
   **Then** no cancel control is offered.
4. **Given** a customer attempts to cancel an order that is not theirs, **When** they try, **Then** the
   refusal is identical to the one for an order that does not exist.
5. **Given** a customer cancels, **When** the shop's queue is next read, **Then** the withdrawn portion
   is gone from the work to be done and its removal is recorded.
6. **Given** two cancel attempts arrive at once, **When** both are processed, **Then** the customer is
   refunded once and the order is cancelled once.

---

### User Story 3 - A customer asks for a refund on something that went wrong (Priority: P2)

A shopper's delivery arrives with an item spoiled. They open the order, choose that item, say what was
wrong, and send it. Back-office sees the request against the order, alongside the shortfall the picker
recorded and the payment. A staff member decides, and the customer is told the outcome either way.

**Why this priority**: P2 — the money is already reachable through Story 1 without this, so it is not
what makes refunds possible. What it changes is where the ask lands: today "Get help" opens a generic
feedback form with **no order reference attached**, so a refund request arrives as an unattributed
message and someone has to piece the order back together by hand.

**Independent Test**: Raise a request against a delivered order from both customer surfaces, confirm it
reaches back-office attached to that order, and confirm the customer is told the outcome.

**Acceptance Scenarios**:

1. **Given** a delivered order, **When** the customer raises a request naming an item and what went
   wrong, **Then** it is recorded against that order and appears to back-office as awaiting a decision.
2. **Given** a request, **When** back-office reads the order, **Then** they see what the customer said
   and can act on it without leaving the order.
3. **Given** a request, **When** a staff member issues a refund or declines it, **Then** the request is
   closed with that outcome and the customer is told which.
4. **Given** a request is raised, **When** nothing else happens, **Then** **no money moves** — a
   request is an ask, never an instruction (FR-005r).
5. **Given** a customer has already raised a request for the same items on the same order, **When**
   they try again, **Then** they are told one is already open rather than creating a duplicate.
6. **Given** an order that is not theirs, **When** a customer raises a request against it, **Then** the
   refusal is identical to the one for an order that does not exist.
7. **Given** an order with no request, **When** back-office reads it, **Then** nothing about requests is
   shown.

---

### User Story 4 - A refund that does not arrive is not silently lost (Priority: P1)

A refund is issued, and days later the customer's bank rejects it. Effy learns about it, the order stops
claiming the money was returned, and someone is told — rather than the platform believing a refund
succeeded because the request was accepted.

**Why this priority**: ⚠ **P1, and it is the requirement most likely to be skipped.** A refund is
asynchronous: the request being accepted means only that it was *submitted*. It can sit pending for
days and then fail — the card was cancelled, the account was closed, the customer disputed the charge
in the meantime. A platform that records "refunded" at submission time will tell a customer their money
is on its way when it is not, and will have no idea it is wrong.

**Independent Test**: Issue a refund, simulate the provider reporting a later failure, and confirm the
order no longer claims the money was returned and the failure is visible to staff.

**Acceptance Scenarios**:

1. **Given** a refund has been submitted, **When** the order is read before the provider confirms it,
   **Then** it reads as *in progress*, not as completed.
2. **Given** a refund the provider later confirms, **When** that confirmation arrives, **Then** the
   order records it as completed and the customer is told.
3. **Given** a refund the provider later rejects, **When** that rejection arrives, **Then** the order
   stops claiming the amount was returned, the reason is recorded, and staff can see it needs
   attention.
4. **Given** the provider reports the same outcome more than once, **When** each report arrives, **Then**
   the recorded state changes at most once.
5. **Given** a report arrives for a refund the platform has no record of, **When** it is processed,
   **Then** it is recorded rather than discarded, and it does not corrupt any order.

---

### User Story 5 - The customer can see what happened to their money (Priority: P2)

A shopper opens a past order and sees what they paid, what was refunded, when, and what they were left
paying — without contacting anyone. If a refund is still on its way, it says so and gives a realistic
expectation of when it will arrive.

**Why this priority**: P2 because Stories 1, 2 and 4 make the money correct, and this makes it legible.
Without it every refund generates a support contact asking "where is my money", which is the cost the
feature was supposed to remove.

**Independent Test**: Refund part of an order and confirm both customer surfaces show the refund, the
revised total, and an honest statement of timing.

**Acceptance Scenarios**:

1. **Given** an order with a completed refund, **When** the customer opens it on web or in the app,
   **Then** they see the amount refunded, the date, and what they ultimately paid.
2. **Given** a refund still in progress, **When** the customer opens the order, **Then** it says the
   refund is on its way and gives a realistic arrival expectation rather than implying it has arrived.
3. **Given** a fully refunded order, **When** the customer opens it, **Then** it is clearly identifiable
   as fully refunded.
4. **Given** an order with no refund, **When** the customer opens it, **Then** nothing about refunds is
   shown at all.
5. **Given** a refund is completed, **When** it completes, **Then** the customer receives an email
   confirming the amount and the order it belongs to.

---

### User Story 6 - A shop that cannot fulfil its portion has an exit (Priority: P3)

A shop realises it cannot supply its part of an order at all — a delivery failed, the fridge broke. It
marks its portion as unable to fulfil with a reason, which reaches back-office as something needing a
refund decision rather than sitting in a queue nobody can clear.

**Why this priority**: P3. It removes the last state a shop cannot get out of, but the refund itself is
still a back-office act, so the money is already reachable through Story 1 without it. Cuttable.

**Independent Test**: Mark a shop's portion unfulfillable and confirm it leaves the shop's active work
and appears to back-office as awaiting a decision.

**Acceptance Scenarios**:

1. **Given** a shop portion that has not been collected, **When** the shop marks it unable to fulfil
   with a reason, **Then** it leaves their active queue and the reason is recorded.
2. **Given** such a portion, **When** back-office reads the order, **Then** it is identifiable as
   awaiting a refund decision.
3. **Given** a portion already collected, **When** a shop attempts to mark it unfulfillable, **Then**
   they are refused — the goods have left the shop and it is no longer their decision.
4. **Given** a portion is marked unfulfillable, **When** nothing else happens, **Then** no money moves.
   The refund remains a deliberate decision by a person.

---

### Edge Cases

- **The whole order is refunded piece by piece.** When the last remaining amount is refunded, the order
  reads as fully refunded — it must not require a separate "refund everything" action to reach that state.
- **A refund is requested for more than remains.** Refused, stating what remains. The total refunded can
  never exceed what the customer paid.
- **The delivery fee.** A full cancellation returns it. A partial refund of items does not, unless a
  staff member deliberately includes it — the delivery still happened.
- **A refund is issued while a shop is still picking.** The picking continues; the two are independent.
  Staff refunding early is a judgement call the platform does not override.
- **A cancellation lands at the same moment a shop opens the order.** One of the two wins and the other
  is told plainly which; the order can never be both cancelled and being picked.
- **The customer's card has expired or been closed since paying.** The refund still goes to the original
  method — the provider handles reaching the customer — and if it ultimately fails, US4 applies.
- **An order is refunded and then the missing item turns up.** Nothing automatic happens. There is no
  un-refund; a correction is a new charge, which is out of scope.
- **A shortfall exists but nobody refunds it.** The order remains as it is. This slice adds no automatic
  refund, and the shortfall stays visible.
- **A refund is issued on an order whose stock was tracked.** Where the platform knows which items were
  refunded and they were never dispatched, the count returns; where it does not know, nothing moves
  rather than guessing.
- **Two staff members refund the same order at the same instant.** The total refunded still never exceeds
  what was paid.

---

## Requirements *(mandatory)*

### Functional Requirements

**Recording a refund**

- **FR-001**: A refund MUST be recorded against the order it belongs to, carrying the amount, the
  reason, who issued it, when, and the state of the money.
- **FR-002**: An order MUST be refundable in part, more than once, and the sum of all refunds MUST
  never exceed what the customer paid.
- **FR-003**: Every refund MUST be one of exactly two kinds, and MUST record which:
  - **Item-derived** — the issuer selects order lines and quantities, and the amount is **computed from
    them**. ⚠ The computed amount MUST NOT be hand-editable: a figure typed over a derived one makes
    the line selection a decoration, and the record would then say a refund covered items it did not.
  - **Goodwill** — a free amount not tied to any line. This exists because a late delivery or a bad
    experience has no line to point at, and forcing one would put a false statement in the audit trail.
- **FR-003a**: An item-derived refund MUST NOT exceed what those lines were charged, and the same line
  MUST NOT be refunded twice beyond the quantity that was paid for.
- **FR-003c**: A goodwill refund MUST carry a written note. An amount with no line and no explanation is
  unaccountable — nobody reading the record later can tell what it was for.
- **FR-003b**: The two kinds MUST be distinguishable wherever a refund is read, so that "we returned
  what they did not receive" and "we gave them something back" are never confused.
- **FR-004**: The record of refunds MUST be append-only. A refund, once recorded, is never edited away;
  its state may change as the money moves, and every change MUST be traceable.
- **FR-004a**: A recorded pick shortfall MUST raise a **proposed refund** against the order — its items
  and amount already derived from the shortfall — awaiting a person's decision. ⚠ A proposal MUST NOT
  move money, and MUST be dismissable without one, because a shortfall is sometimes resolved another
  way (the item is substituted, the customer declines a refund, the picker corrected a mistake).
- **FR-004b**: A proposal MUST be raised at most once per shortfall, however many times the shortfall
  is edited, so that correcting a quantity does not leave staff with a queue of near-duplicates to
  reconcile.
- **FR-004c**: An order awaiting a decision — from a proposal or a customer request — MUST be
  identifiable **without opening it**, or the queue is only worked by whoever happens to look.
- **FR-005r**: A customer MUST be able to raise a refund request against their own delivered or
  partly-delivered order, naming the items and what went wrong. ⚠ A request MUST NOT move money, and
  MUST NOT be presented to the customer as a decision — only as something Effy will look at.
- **FR-005r2**: A request MUST be visible to back-office on the order itself, with the customer's own
  words, and MUST be closeable with an outcome — refunded or declined.
- **FR-005r3**: The customer MUST be able to see that outcome **on the order**. ⚠ A *refund* is
  confirmed by email (FR-027); a **decline is not emailed**. An unsolicited "we said no" email invites a
  reply into something that is not a conversation (a thread is out of scope), and the order screen is
  where the shopper is already looking for the answer.
- **FR-005r4**: A second request for the same items on the same order MUST be refused as already open,
  rather than creating a duplicate for staff to reconcile.
- **FR-005**: Issuing a refund MUST be idempotent. A repeated request — a double click, a retry, a
  redelivered instruction — MUST return the customer's money once.

**Moving the money**

- **FR-005d**: ⚠ A submission that fails MUST be classified before anything is retried, because the two
  kinds of failure ask opposite things of the platform:
  - **Ambiguous** — a timeout, or the provider unreachable. The refund may or may not exist. It MUST be
    retried automatically, under the SAME idempotency key as the original attempt, so that a retry can
    never produce a second refund. Bounded, then escalated to staff.
  - **Definite** — the provider refused and said why. It MUST NOT be retried; retrying a decision will
    never change it. The reason MUST be surfaced to staff, in their words, not as a generic failure.
- **FR-005e**: A refund whose submission has not yet succeeded MUST NOT be described to the customer as
  refunded, and MUST NOT count toward what has been refunded against the order. Until the provider has
  it, no money is on its way.
- **FR-005f**: Staff MUST be able to tell, for any refund, **whether the money went** — submitted,
  completed, failed, or still being attempted — without reading a log or querying the database. That is
  the only question anyone asks about a refund, and a state that cannot answer it is not a state.
- **FR-006**: A refund MUST be sent to the payment method the customer originally paid with. The
  platform MUST NOT accept an alternative destination from anyone.
- **FR-007**: ⚠ A refund MUST NOT be recorded as completed when it is merely submitted. Until the
  payment provider confirms it, the platform MUST describe it as in progress.
- **FR-008**: When the provider reports a refund has completed, the platform MUST record that and tell
  the customer.
- **FR-009**: ⚠ When the provider reports a refund has **failed**, the platform MUST stop claiming the
  money was returned, record the reason, and surface it to staff as needing attention.
- **FR-010**: Reports from the provider MUST be processed idempotently — the same report arriving twice
  MUST change the recorded state at most once — and a report about a refund the platform does not
  recognise MUST be recorded rather than discarded.
- **FR-011**: ⚠ Effy's own cost of refunding (the processing fee the provider retains) MUST NOT be
  deducted from what the customer receives. The amount sent to the provider MUST equal the amount
  derived from the lines, or the goodwill amount entered — with nothing subtracted for any reason.

**Cancellation**

- **FR-012**: A customer MUST be able to cancel their own order while no shop has begun preparing any
  part of it.
- **FR-013**: Cancelling MUST return the entire amount the customer paid, including delivery.
- **FR-014**: Cancelling MUST withdraw every shop's portion so that no shop picks an order that is no
  longer wanted, and the withdrawal MUST be recorded.
- **FR-015**: Once any shop has begun preparing any part of an order, the customer MUST NOT be offered
  cancellation, and the order MUST say plainly why and what to do instead.
- **FR-016**: A cancellation MUST be refused for an order that is already cancelled, already delivered,
  or not the requesting customer's — and "not yours" MUST be indistinguishable from "no such order".
- **FR-017**: Cancelling and being picked MUST be mutually exclusive: an order can never end up both.
- **FR-018**: Back-office staff MUST be able to cancel an order on a customer's behalf at any stage
  before it is delivered, because a phone call arrives at a moment the customer's own control has closed.
- **FR-016a**: ⚠ The published Refunds, Returns & Cancellations policy MUST be corrected in step with
  this slice so that its cancellation wording describes what the product does. It currently says an
  order may be cancelled "before it is dispatched" and that customers should "use the app" to do it —
  the first is looser than FR-012 and the second describes a control that does not exist until this
  slice ships. **A published policy that outlives the product it describes is the defect, not the
  starting requirement.**

**Permissions**

- **FR-019**: Issuing a refund MUST be restricted to the higher back-office permission tier, decided
  from the platform's own staff record rather than from a token claim.
- **FR-020**: Any active back-office staff member MUST be able to *read* an order's refund history,
  including customer-service staff — they are the ones being asked about it.
- **FR-021**: A refusal MUST be uniform and MUST NOT vary with the order named.

**The order's own truth**

- **FR-022**: An order MUST record what was ultimately paid after refunds, distinctly from what was
  originally charged. Neither may overwrite the other.
- **FR-023**: An order that has been refunded in full MUST be identifiable as such **from the order
  itself, on every surface**, whether that happened in one action or several. ⚠ Reaching it by
  accumulation MUST look identical to reaching it in one act — a shopper refunded piece by piece is no
  less fully refunded.
- **FR-024**: ⚠ Refunding MUST NOT alter the original receipt. What was charged at the time is a
  historical record; a refund is a later event, not a rewrite.

**Telling the customer**

- **FR-025**: A customer MUST see, on both customer surfaces, what was refunded, when, and what they
  ultimately paid.
- **FR-026**: A refund still in progress MUST be shown as such, with a realistic expectation of when
  the money will arrive — never implying it has already arrived.
- **FR-027**: A completed refund MUST be confirmed to the customer by email, naming the amount and the
  order.
- **FR-028**: An order with no refunds MUST show nothing about refunds at all.
- **FR-029**: Customer-facing wording MUST NOT disclose which shop was responsible, or how many shops
  served the order.

**Consequences elsewhere**

- **FR-030**: Where a refund covers items that were never dispatched and the platform tracks their
  stock, that stock MUST return, recorded as such. Where the platform cannot know, nothing MUST move.
- **FR-031**: A shop MUST be able to mark its portion of an order as unable to fulfil, with a reason,
  provided it has not been collected — and that MUST NOT move money by itself.
- **FR-032**: A cancelled or fully refunded order MUST NOT block a customer from closing their account
  on the grounds of being in transit.

### Key Entities

- **Refund** — one attempt to return money for an order: its kind (item-derived or goodwill), how much,
  why, who decided it, when, and where the money has got to (submitted, completed, failed, and why).
  Append-only; several may exist per order.
- **Refunded line** — for an item-derived refund, which order line and how many units it covered. This
  is what makes the amount checkable against the order and what stops the same unit being refunded
  twice. Absent entirely on a goodwill refund.
- **Refund reason** — a closed set an issuer chooses from, distinguishing the causes that matter to the
  business: an item never supplied, an item unusable on arrival, an order cancelled, and a goodwill
  decision. Kept separate from any free-text note.
- **Proposed refund** — a refund the platform has drafted from evidence it already holds (today, a pick
  shortfall), awaiting a person's decision. Carries the same items and amount an issuer would have
  selected. ⚠ It is not a refund until someone issues it, and it can be dismissed.
- **Refund request** — a customer's ask, against one order: which items, what they said went wrong,
  when, and its outcome once staff decide. ⚠ Deliberately NOT a message thread — it carries one
  statement and receives one outcome.
- **Cancellation** — an order ending before fulfilment, at the customer's request or staff's. Not a
  separate record from the refund it causes; the order's own state carries it.
- **Order settlement** — what the customer ultimately paid once refunds are accounted for, held
  alongside — never instead of — what was originally charged.

---

## Success Criteria *(mandatory)*

- **SC-001**: A staff member can refund a specific item on an order in under 2 minutes from opening the
  console, without leaving it or using any external tool.
- **SC-001a**: Every order awaiting a refund decision is findable from the orders queue without opening
  each order, and a proposed refund from a shortfall is issuable in under 30 seconds because its items
  and amount are already derived.
- **SC-002**: The total refunded against an order never exceeds what the customer paid, in **100%** of
  attempts, including concurrent ones.
- **SC-003**: A refund submitted twice returns the customer's money exactly once, in 100% of attempts.
- **SC-004**: A customer can cancel an unpicked order themselves and see the full amount confirmed as
  on its way, without contacting anyone.
- **SC-005**: No shop ever picks an order that was cancelled before they opened it.
- **SC-006**: When a refund fails at the provider, the order stops claiming the money was returned
  within one processing cycle, and the failure is visible to staff without anyone querying the database.
- **SC-006a**: With the provider unreachable, no number of retries produces more than one refund —
  demonstrated by forcing repeated ambiguous failures against a single refund.
- **SC-006b**: For any refund, a staff member can state whether the money went, from the order screen
  alone, in under 10 seconds.
- **SC-007**: Every amount of money that moved is explicable from the order's own record — who, when,
  why, and against which lines where it was item-derived — with no unexplained difference between what
  was charged and what was kept.
- **SC-008**: 5 of 5 observers shown a refunded order correctly state how much was returned and whether
  it has arrived yet.
- **SC-009**: No customer-facing surface or message discloses shop identity or how many shops served an
  order.
- **SC-010**: Every **refund** outcome the published policy promises is achievable by a staff member on
  a real order — verified by walking each row of that table. ⚠ Scoped to the refund arm deliberately:
  two rows also offer a *replacement*, which this slice does not build (see Scope). A criterion that
  included them could never be ticked.
- **SC-010a**: No sentence in the published policy describes a cancellation capability the product does
  not have — verified by reading the policy against the built behaviour, not against this spec.
- **SC-011**: An order with no refunds is indistinguishable from its pre-slice self on every customer
  surface.
- **SC-012**: A customer can raise a refund request against a specific order in under 90 seconds from
  opening it, and a staff member can see which order it belongs to without searching for it.

---

## Assumptions

- **A1 — A cancellation is a refund with a different name to the customer.** Effy captures payment when
  the order is placed, so there is no uncaptured money to release; the provider's own cancel operation
  never applies. The word "cancel" is right for shoppers and the mechanism is a full refund underneath.
- **A2 — The cancellation window closes when the first shop begins preparing** (confirmed). Not at
  payment, not at dispatch. The moment a picker starts, someone is walking a shop floor with a trolley
  and perishables may already be off refrigeration; letting a customer cancel out from under that
  wastes real work that cannot be recovered. Staff judgement takes over from there, which is what
  FR-018 preserves — the customer is never stranded, they are just no longer served by a self-service
  button.
  - ⚠ **THIS IS NARROWER THAN WHAT IS PUBLISHED**, and the published wording is the one that must
    change. The policy says "before it is dispatched", which covers an order already picked, packed and
    waiting for collection. Correcting a sentence is far cheaper than building a cancel path that
    strands pickers mid-aisle — but a live legal document may not simply be left disagreeing with the
    product either, so **FR-016a makes the correction part of this slice's definition of done**.
- **A3a — "The request failed" and "the refund failed" are different facts.** A timeout leaves the
  platform not knowing whether a refund exists, so the only safe retry is one the provider will
  recognise as the same request — which is what an idempotency key is for, and the platform already
  uses that mechanism for payment creation. A refusal is a decision, and retrying a decision is how a
  queue fills with attempts that can never succeed.
- **A3 — ⚠ A refund is asynchronous and may fail days later.** Submission means submitted, not returned.
  This is the single most-skipped property of refund integrations and the reason US4 is P1 rather than
  polish: a platform that records success at submission will confidently tell customers their money is
  coming when it is not.
- **A4 — Refunds go only to the original payment method.** Accepting a destination from a request would
  make the endpoint a way to redirect other people's money; store credit and alternatives are out of
  scope precisely so this stays true.
- **A5b — A shortfall proposes a refund; it does not make one.** It is the one case where the platform
  has hard evidence from its own staff that a customer paid for something they did not receive, so
  making them ask for it is the failure G3 describes. But a payment triggered by a warehouse tap has no
  second pair of eyes, and a mis-tap becomes money out the door. Pre-filling the decision removes the
  work without removing the person.
- **A5a — A request is an input to a decision, never a trigger for one.** The customer asking is what
  the platform was missing; the platform deciding automatically is a policy the business has not set
  (A5). Keeping them separate is also what stops a request form becoming a way to withdraw money.
- **A5 — Every refund is a deliberate human act.** Nothing in this slice refunds automatically, not even
  a recorded shortfall. When Effy *should* refund unasked is a policy decision the business has not made.
- **A6 — The processing fee is Effy's cost, not the customer's.** The provider keeps its fee on a
  refunded payment. Deducting it from the customer would be unlawful under the consumer guarantees the
  published policy already invokes.
- **A7a — Item-derived refunds are computed, not typed.** A hand-editable amount beside a line
  selection means the two can disagree, and the record then claims a refund covered items it did not.
  Goodwill exists precisely so the honest case for a free amount does not have to borrow a line.
- **A7 — Refund reasons are a small closed set plus an optional note.** Free text alone cannot be
  reported on, and an open list becomes inconsistent within weeks. ⚠ One reason available at the payment
  provider — marking a payment fraudulent — has side effects on the payer beyond this order and is
  therefore **not** offered as an ordinary choice.
- **A8 — Refunding does not rewrite the receipt.** The original document records what was charged then;
  refunds are later events shown alongside it. Editing a receipt to match a later refund destroys the
  record of what actually happened.
- **A9 — Stock returns only where the platform can know it should.** An item refunded before it was
  dispatched can go back on the shelf; an item refunded because it arrived spoiled cannot. Where the
  distinction is not recorded, nothing moves — inventing stock is worse than not returning it.
- **A10 — Partial refunds do not return the delivery fee by default.** The delivery happened. A full
  cancellation does return it, because it did not.
- **A11 — Back-office is the only place refunds are issued.** Shops cannot refund. They do not hold the
  customer relationship, they do not see the payment, and who bears the cost is a commercial question
  that does not have an answer yet (A12).
- **A12 — This slice records what happened and settles nothing between Effy and its shops.** Shop payouts
  do not exist on the platform; when they arrive, the refund record is what they will need to read.

---

## Dependencies

- **The payment provider integration** — the existing payment reference on each order is what a refund
  is issued against, and the existing signed-event path is where the provider's later reports arrive.
  This slice extends both; it does not introduce a second way of talking to the provider. Its
  deterministic-idempotency-key pattern for payment creation is the same mechanism FR-005d needs for
  retrying an ambiguous refund submission.
- **The back-office order console (053)** — the only place staff can currently find an order. It is the
  natural and only sensible home for issuing a refund, and it already carries the shortfall the picker
  recorded.
- **The shop fulfilment state machine (020/049)** — cancellation must withdraw a shop's portion, and
  US6 adds the exit that machine currently lacks.
- **Inventory (054)** — FR-030's stock return. 054's movement record was deliberately built with no
  refund reason so that adding one is a values change, not a redesign.
- **Shop fulfilment shortfall (020)** — the picker's `unavailable` quantity is what FR-004a proposes a
  refund from. 054 recorded that this data has existed since 020 with nothing downstream reading it;
  this is what reads it.
- **The email system (038)** — FR-027's confirmation is one more template on the existing catalogue.
- **Customer feedback (046)** — the generic form remains what it is. A refund request is a different
  thing with a different destination, and routing refunds through a feedback inbox is precisely the
  problem this replaces.
- **Account closure (053)** — FR-032: a cancelled order must not read as in transit.

**Recorded, not owned by this slice:**

- **⚠ The published policy needs reconciling with what is built, and part of that is now IN scope.**
  FR-016a makes the **cancellation wording** this slice's responsibility: "before it is dispatched" is
  looser than what will be built, and "to cancel, use the app" only becomes true when this ships. The
  remaining mismatch — "refund **or** replacement" for damaged goods, when only the refund arm exists —
  stays with 045, because building replacements is a different product. Legal prose is authored in
  045's system; changing it is a values change there, not a new mechanism.
- **⚠ Substitutions.** The Food Safety notice tells customers they may decline substitutions at
  checkout and that they are "not charged for a substitute you do not accept". **No substitution
  capability exists** — flagged during 054 and still open. This slice's refund path is what such a
  feature would eventually settle against.
- **Disputes and chargebacks** — a provider-initiated process with evidence deadlines, related closely
  enough to be confused with refunds and different enough to need its own slice.
- **Shop payouts and cost attribution** (A12).
- **Replacements / re-delivery** — the other half of the policy's damaged-goods promise.

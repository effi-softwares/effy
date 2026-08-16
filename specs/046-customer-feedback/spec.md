# Feature Specification: Customer Feedback

**Feature Branch**: `046-customer-feedback`

**Created**: 2026-08-16

**Status**: Draft

**Input**: User description: "in the checkout page header we have feedback feature mentioned. so now we need to create a feedback feature in the platform. so we need to create a feedback page in /feedback and in the customer mobile app then create api for it. we can use edge api for this one. no need to use core api. then in the back office admins should have a way to read them, search them, manage them and reply to them. when reply that user who put the feedback should get a email with the reply. so we need a good template for that. also when feedback is submited we can also send thank you for sending feedback email. we need a template for that too! do a good research of about feedback features and define all the requiement we need and then we can implement it"

## Overview

Effy's checkout header already invites shoppers to "Give us feedback" and links to `/feedback` — a
route that does not exist. This feature makes that invitation real, end to end: a public feedback
form on the customer web storefront and in the customer mobile app; a submission that is stored and
acknowledged with a thank-you email; and a back-office capability for staff to read, search, filter,
triage, and reply to feedback, where a reply is delivered to the submitter as an email.

It is a **listening channel**, not a support ticketing system. A person tells Effy something — a bug,
an idea, a complaint, or a compliment — Effy records it, thanks them, and staff can respond. It is
distinct from order support, returns, and account recovery, which are separate flows.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A shopper sends feedback and is thanked (Priority: P1)

A shopper (signed-in customer or a guest) opens the feedback page from the checkout header or a
navigation entry, chooses what kind of feedback it is, writes a message, optionally leaves a rating,
provides a contact email if they want a reply, and submits. They immediately see an on-screen
confirmation, and — when they gave a contactable email — they receive a "thank you for your feedback"
email shortly after. The same capability is available in the customer mobile app.

**Why this priority**: This is the MVP. Without it the checkout header links to a dead route and the
platform has no way for shoppers to reach it at all. It delivers standalone value the moment it ships
(shoppers can be heard) even if no staff-facing tooling yet exists — the submissions are captured for
later reading.

**Independent Test**: Submit feedback from the web form and from the mobile app as both a signed-in
customer and a guest; confirm a stored submission exists, the on-screen confirmation appears, and a
thank-you email arrives when an email was provided.

**Acceptance Scenarios**:

1. **Given** a guest on the storefront, **When** they open `/feedback`, choose a category, type a
   message, enter their email, and submit, **Then** they see a success confirmation and receive a
   thank-you email at that address.
2. **Given** a signed-in customer, **When** they open the feedback page, **Then** their name and email
   are pre-filled from their profile, and on submit the submission is linked to their customer record.
3. **Given** a customer in the mobile app, **When** they open the feedback screen and submit a
   message, **Then** they see the same confirmation and the submission is captured identically to web.
4. **Given** a shopper who submits without any message text, **When** they attempt to submit, **Then**
   submission is refused with a clear inline explanation and nothing is stored.
5. **Given** a shopper who chose not to provide an email, **When** they submit, **Then** the feedback
   is stored and acknowledged on screen, and no thank-you email is sent (there is nowhere to send it).
6. **Given** a shopper who arrived from the checkout header, **When** they submit, **Then** the
   submission records that it originated from checkout, so staff can see the context later.

---

### User Story 2 - Staff read, search, and triage feedback (Priority: P2)

A back-office staff member opens the feedback area of the console and sees all submitted feedback,
newest first. They can search the text and submitter email, filter by category, status, rating, and
date range, and open any submission to read its full message and context (source, platform, whether
it came from a signed-in customer, when it arrived). They can change a submission's status to reflect
where it is in triage and add internal notes that the submitter never sees.

**Why this priority**: Once feedback is being collected (US1), it is only valuable if someone can
read and organise it. This turns a growing pile of submissions into something staff can work through.
It is independently testable and valuable even before replies exist.

**Independent Test**: With several submissions of varying category, status, and date present, load the
console list, apply each filter and a text search, open a submission to view its full detail and
context, change its status, and add an internal note — verifying the note is not visible to the
submitter.

**Acceptance Scenarios**:

1. **Given** staff on the feedback console, **When** the list loads, **Then** submissions appear
   newest-first with category, status, rating, submitter, a message preview, and arrival time.
2. **Given** many submissions, **When** staff search by a word in the message or by submitter email,
   **Then** only matching submissions remain.
3. **Given** many submissions, **When** staff filter by category, status, rating, and/or date range,
   **Then** the list narrows to those matching all active filters, and the result count is shown.
4. **Given** a submission, **When** staff open it, **Then** they see the full message, category,
   rating, submitter identity (or "guest"), origin source, platform, and timestamps.
5. **Given** an open submission, **When** staff set its status (e.g. to in-review, resolved,
   archived, or spam), **Then** the new status persists and is reflected in the list and its filters.
6. **Given** an open submission, **When** staff add an internal note, **Then** the note is saved,
   attributed to that staff member with a timestamp, and is never included in any email or shown to
   the submitter.

---

### User Story 3 - Staff reply and the submitter is emailed (Priority: P2)

A staff member reading a submission composes a reply. On send, the reply is delivered to the
submitter as an email that carries the staff message and quotes (or references) the original
feedback, and the submission is marked as replied. Every reply is recorded against the submission so
staff can see the full history of what was sent.

**Why this priority**: Closing the loop is what makes feedback a two-way channel rather than a
suggestion box. It depends on US1 (there must be feedback) and US2 (staff must be able to open it),
so it follows them, but it is the payoff that makes people feel heard and worth doing early.

**Independent Test**: Open a submission that has a contactable email, compose and send a reply,
confirm a reply email is delivered to the submitter containing the staff message, confirm the
submission's status becomes replied, and confirm the reply is listed in the submission's history.

**Acceptance Scenarios**:

1. **Given** a submission with a contactable email, **When** staff compose a reply and send it,
   **Then** the submitter receives an email containing the staff message and a reference to their
   original feedback, and the submission is marked replied.
2. **Given** a submission from a shopper who left no email, **When** staff open it, **Then** the reply
   action is unavailable (or clearly disabled) because there is no address to send to, and this is
   explained.
3. **Given** a submission that has been replied to, **When** staff view it, **Then** each reply is
   listed with its text, the staff member who sent it, and when it was sent.
4. **Given** a reply send that fails at the email layer, **When** staff send it, **Then** they are
   told the reply was not delivered and the submission is not falsely marked replied.
5. **Given** a staff member without permission to reply, **When** they open a submission, **Then** the
   reply action is not available to them.

---

### Edge Cases

- **No message, or whitespace-only message**: refused with an inline error; nothing stored.
- **Message far exceeds a sane length**: refused with a clear limit, before storage.
- **Invalid email shape** when an email is provided: refused inline using the same rule the rest of
  the platform enforces for email addresses; the message text is preserved on screen for retry.
- **Repeated rapid submissions from the same source** (accidental double-submit or abuse): the
  platform limits how frequently one source may submit, and excess submissions are refused without
  revealing internal thresholds.
- **Feedback submitted while signed in, then the account is later closed/barred**: the historical
  submission remains readable by staff; the customer link is retained as recorded at submission time.
- **A guest provides an email that belongs to a real customer account**: the submission is treated as
  a guest submission (unverified email); it is never linked to an account on the strength of an
  unverified email, and no account information is disclosed in any acknowledgement.
- **Reply attempted to an address that later hard-bounces**: staff see that delivery did not succeed;
  the submission is not represented as successfully replied.
- **Empty console (no feedback yet)**: staff see a clear empty state, not an error.
- **Very long message in a reply**: bounded to a sane length before send.
- **Submitting with the thank-you email temporarily undeliverable**: the submission is still stored;
  the acknowledgement email failing does not lose the shopper's feedback, and the shopper's on-screen
  confirmation still reflects that their feedback was received.
- **HTML/script pasted into the message or reply**: rendered as inert text everywhere it is shown
  (console and email), never interpreted.

## Requirements *(mandatory)*

### Functional Requirements

#### Submission (customer web + customer mobile)

- **FR-001**: The platform MUST provide a public feedback page at `/feedback` on the customer web
  storefront, reachable from the checkout header's existing "Give us feedback" link and discoverable
  from a stable navigation/footer entry.
- **FR-002**: The customer mobile app MUST provide a feedback screen offering the same submission
  capability as the web page, at parity in what can be submitted.
- **FR-003**: Feedback submission MUST be available to both signed-in customers and guests (no account
  required to submit), because the checkout flow and storefront are open to guests.
- **FR-004**: A submission MUST capture: a feedback category, a free-text message, an optional
  rating, an optional submitter name, and an optional submitter email for reply.
- **FR-005**: The set of categories MUST be a small, fixed, human-labelled list covering at least:
  bug/problem, suggestion/idea, complaint, compliment/praise, and something-else/other.
- **FR-006**: The message MUST be required and non-empty (after trimming); a submission with no
  message MUST be refused with a clear, inline reason and MUST NOT be stored.
- **FR-007**: The message MUST be bounded to a maximum length; input over the limit MUST be refused
  before storage with the limit clearly communicated.
- **FR-008**: When an email is provided it MUST be validated with the platform's shared email shape
  and length rule (the same one used elsewhere), and an invalid email MUST be refused inline while
  preserving the shopper's typed message.
- **FR-009**: For a signed-in customer, the form MUST pre-fill name and email from their profile, and
  the stored submission MUST be linked to their customer record.
- **FR-010**: For a guest, any provided email MUST be treated as unverified; the submission MUST NOT
  be linked to any customer account on the basis of an unverified email, and no account existence MUST
  be disclosed in response to a submission.
- **FR-011**: A submission MUST record the origin context it was made from (at minimum: the checkout
  header versus a general/other entry point) and the platform it came from (web, iOS, Android).
- **FR-012**: On successful submission the shopper MUST see an immediate on-screen confirmation that
  their feedback was received, on both web and mobile.
- **FR-013**: When a contactable email was provided, the platform MUST send that submitter a
  thank-you/acknowledgement email confirming their feedback was received.
- **FR-014**: When no email was provided, the platform MUST store and acknowledge the feedback
  on screen and MUST NOT attempt to send any email.
- **FR-015**: Failure to send the thank-you email MUST NOT cause the submission to be lost; the
  feedback MUST remain stored and the shopper's on-screen confirmation MUST still reflect success.
- **FR-016**: The platform MUST rate-limit submissions per source to resist accidental double-submits
  and abuse; excess submissions MUST be refused without disclosing the internal threshold.
- **FR-017**: Message and reply text MUST be treated as untrusted: rendered as inert text (never
  interpreted as markup or script) everywhere it is displayed or included in an email.

#### Staff reading, search, and triage (back office)

- **FR-018**: The back office MUST provide a feedback area that lists all submissions, newest-first,
  showing category, status, rating, submitter (or "guest"), a message preview, origin, and arrival
  time.
- **FR-019**: Staff MUST be able to full-text search submissions by message content and by submitter
  email.
- **FR-020**: Staff MUST be able to filter submissions by category, status, rating, and a date range,
  combinable, with the resulting count shown.
- **FR-021**: Staff MUST be able to open a submission to view its complete message and all captured
  context (category, rating, submitter identity or guest, origin source, platform, timestamps).
- **FR-022**: A submission MUST have a status reflecting its triage state, covering at least: new,
  in-review, replied, resolved, archived, and spam.
- **FR-023**: Staff MUST be able to change a submission's status, and the change MUST persist and be
  reflected in the list and its filters.
- **FR-024**: Staff MUST be able to record internal notes on a submission, attributed to the staff
  member and timestamped; internal notes MUST NEVER be shown to the submitter or included in any
  email.
- **FR-025**: Reading, searching, and viewing feedback MUST be permitted to any active back-office
  staff member (including customer-service agents), because feedback is diagnostic and CSAs are the
  people fielding shopper contact.
- **FR-026**: All list, search, and filter operations MUST remain responsive with a large volume of
  submissions (results paginated rather than returned unbounded).

#### Staff reply (back office → submitter email)

- **FR-027**: Staff MUST be able to compose and send a reply to a submission that has a contactable
  email; on send, the submitter MUST receive an email carrying the staff reply and a reference to (or
  quote of) their original feedback.
- **FR-028**: When a submission has no contactable email, the reply action MUST be unavailable and the
  reason (no address to reply to) MUST be clear to staff.
- **FR-029**: Sending a reply MUST mark the submission as replied and record the reply against the
  submission (its text, the sending staff member, and the time sent).
- **FR-030**: If the reply email fails to send, staff MUST be told it was not delivered, and the
  submission MUST NOT be marked replied nor represented as successfully answered.
- **FR-031**: A submission MUST support more than one reply over time, each recorded and delivered
  independently, forming a visible history of what Effy sent.
- **FR-032**: The reply email MUST clearly identify Effy as the sender using an approved
  customer-facing sender/reply identity, and MUST NOT expose staff personal contact details.
- **FR-033**: Permission to reply MUST be governed by staff role; a staff member without reply
  permission MUST NOT see or be able to use the reply action, while still being able to read.
- **FR-034**: Reply text MUST be bounded to a sane maximum length before send.

#### Email templates

- **FR-035**: The platform MUST provide a dedicated, on-brand thank-you/acknowledgement email template
  used on submission, consistent with the platform's monochrome email design system.
- **FR-036**: The platform MUST provide a dedicated, on-brand reply email template that presents the
  staff reply prominently and references the original feedback, consistent with the platform's email
  design system.
- **FR-037**: Both templates MUST render legibly in light and dark email clients, include a plain-text
  part, and carry no tracking or third-party asset requests, consistent with existing platform email
  standards.
- **FR-038**: Neither email MUST expose internal notes, internal identifiers, other submissions, or
  any personal data beyond what the submitter themselves provided.

#### Data & privacy

- **FR-039**: A submitter's email is personal data and MUST NOT appear in operational logs or
  analytics beyond what platform telemetry rules already permit.
- **FR-040**: Feedback submissions MUST be retained so staff can read and act on them; a submission's
  recorded context (customer link at submission time, origin, platform) MUST be immutable once stored
  (staff-owned fields — status, notes, replies — are the mutable parts).

### Key Entities *(include if data involved)*

- **Feedback submission**: one thing a shopper told Effy. Attributes: category, message text, optional
  rating, optional submitter name, optional submitter email, submitter identity (linked customer or
  guest, recorded at submission time), origin source (e.g. checkout, general), platform (web / iOS /
  Android), triage status, created and updated timestamps.
- **Feedback reply**: a message Effy sent back to the submitter in response to a submission.
  Attributes: parent submission, reply text, sending staff member, time sent, delivery outcome.
- **Internal note**: a staff-only annotation on a submission. Attributes: parent submission, note
  text, author staff member, timestamp. Never leaves the console.
- **Feedback category**: the fixed classification a shopper picks (bug, suggestion, complaint,
  compliment, other).
- **Thank-you email**: the acknowledgement message sent to the submitter on submission.
- **Reply email**: the message that delivers a staff reply to the submitter.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A shopper (guest or signed-in) can complete and submit feedback from the web page in
  under 90 seconds, and see confirmation immediately on submit.
- **SC-002**: The customer mobile app offers the same submission capability, verified by submitting
  from the app and confirming an identical stored submission.
- **SC-003**: When a contactable email is provided, a thank-you email arrives at the submitter's
  address for at least 99% of successful submissions.
- **SC-004**: The checkout header's "Give us feedback" link resolves to a working feedback page (no
  dead route), verified on the live storefront.
- **SC-005**: Staff can locate a specific submission among a large set within seconds using search
  and filters, and the console remains responsive at that volume.
- **SC-006**: When staff send a reply, the submitter receives an email containing the staff message
  for at least 99% of replies to contactable addresses, and the submission is marked replied only on
  successful send.
- **SC-007**: 100% of internal notes are absent from every email and from any submitter-facing view,
  verified by inspection of sent emails and submitter-visible surfaces.
- **SC-008**: No submitter email address appears in operational logs, verified by a log inspection
  across the submission and reply paths.
- **SC-009**: Pasted markup or script in a message or reply is displayed as inert text in the console
  and in emails 100% of the time (no interpretation), verified adversarially.
- **SC-010**: Excess rapid submissions from one source are refused by the rate limit without exposing
  the threshold, verified by exceeding it.

## Assumptions

- **Guests may submit.** The storefront and checkout are open to guests, and the checkout header link
  is reachable without an account, so anonymous submission is in scope; an email is optional and, when
  supplied by a guest, is treated as unverified and used only to send the acknowledgement/reply.
- **Cold path (edge API), not the hot path.** Feedback is low-frequency and its work is asynchronous
  email — the user explicitly directed the edge API — so it does not engage the hot-path commerce
  routing rule. Public submission fits the storefront's existing public cold-path precedent
  (newsletter, health checks); back-office reading/replying fits the existing admin console
  cold-path pattern with a role-gated authorizer.
- **Reuse the platform email system.** Both new emails are authored as templates in the existing
  shared email system and sent through the existing sender, using the approved customer-facing sender
  identity; no new email infrastructure is introduced.
- **One-directional replies.** A reply is a staff-composed message emailed to the submitter; there is
  no in-app two-way thread where the submitter replies back within the product. A submitter who wants
  to add more sends new feedback. (A conversational thread could be a later slice.)
- **Attachments/screenshots are out of scope for v1.** File uploads (e.g. a screenshot on a bug
  report) add media handling complexity and are deferred; the message is text-only initially.
- **No public status tracking for submitters.** Submitters do not get a portal to track their
  feedback's status; the only thing they receive is the acknowledgement and any reply email.
- **Rating is optional and lightweight.** A simple optional rating (e.g. a small star/sentiment
  scale) aids triage; it is never required to submit.
- **Existing back-office RBAC governs access.** Reading is open to any active staff (including CSA);
  replying and status/notes management follow the platform's established role gates
  (admin/manager for state-changing actions), decided from the staff record, not the token claim.
- **Feedback is separate from support/returns/order issues.** This is a general listening channel;
  order-specific problems, returns, and account recovery remain their own flows.

## Dependencies

- The platform email template system and sender (used to author and deliver the two new emails).
- The back-office console shell and its role-based authorization from the staff record.
- The customer web storefront (Next.js SSR) and customer mobile app shells to host the form/screen.
- The shared email shape/length validation rule used across the platform.
- The customer identity resolution used to link a signed-in submission to a customer record.

# Feature Specification: Messages That Do More

**Feature Branch**: `115-messages-email-automation`

**Created**: 2026-11-12

**Status**: Draft

**Input**: User description: "Messages that do more (notifications backlog E11–E13): back-office messages can also go by email to customers who said yes to marketing email, with a one-tap unsubscribe and Effy identified as the sender; staff can set up messages that send by themselves when something happens or on a repeating schedule (for example "hasn't ordered in 30 days", "points expire in 7 days"); and an inbox message can greet the customer by first name, never on the lock screen"

## Background

Back-office Messages (112) sends announcements, important notices, offers, news and direct messages to the inbox, and
optionally as a phone notification. Customers choose per category and channel, and offers and news reach only customers
who said yes (111). Three things were left for later in the notifications backlog, and this spec builds them:

- **E11**: email as a message channel, with the unsubscribe the law requires for marketing email;
- **E12**: messages that send by themselves, either when something happens to a customer or on a repeating schedule;
- **E13**: a customer's first name in a message, but never on the lock screen.

The points-expiry reminder (one of the examples in the request) already exists as a fixed message (110). This spec does not
add a second one; see Assumptions.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Send an offer by email too (Priority: P1)

A manager writes this week's offer and ticks **Email** as well as **Inbox** and **Phone**. It reaches customers who said yes
to offers. Those who also turned on email for offers get it in their mailbox, in Effy's own email design. The email says it
is from Effy and has a one-tap unsubscribe link at the bottom.

**Why this priority**: Email reaches website shoppers who never installed the app, and most marketing reaches people by
email.

**Independent Test**: As a customer, say yes to offers and turn on email for offers. Send an offer with Email ticked. It
arrives by email, from Effy, with an unsubscribe link. A second customer who said yes to offers but left email off gets the
inbox item and no email.

**Acceptance Scenarios**:

1. **Given** a customer said yes to offers and turned email for offers on, **When** an offer with Email is sent, **Then**
   they receive an email with the message's title, words, picture and button, from Effy, with Effy's contact address and a
   one-tap unsubscribe link.
2. **Given** a customer said yes to offers but email for offers is off, **When** the same offer is sent, **Then** they get
   the inbox item (and the phone notification, if on) and no email.
3. **Given** a customer has not said yes to offers, **When** the offer is sent, **Then** they get nothing at all, as today.
4. **Given** an Important notice to customers with Email ticked, **When** it is sent, **Then** every customer in the
   audience with an email address gets it by email, whatever their marketing choices, because a service notice needs no
   marketing consent.
5. **Given** the composer, **When** Email is ticked, **Then** the sender sees a preview of the email and can send a test
   email to the test account they pick, before sending.
6. **Given** a message is sent with Email, **When** the sender opens its report, **Then** it shows emails sent, failed,
   held for the night, over the daily limit, and not sent (no address, email off, address suppressed), and those numbers
   add up to the recipient count. Unsubscribes from the message's email are shown beside them, not in the sum.

---

### User Story 2 - Unsubscribe in one tap (Priority: P1)

A customer who no longer wants marketing email taps **Unsubscribe** at the bottom of an offer email. Without signing in,
they land on a page that says they won't get offers and news by email any more, with a way to undo it. Their app and
website settings show email off for offers and news.

**Why this priority**: The law requires a working, free unsubscribe in every marketing email, honoured promptly, and
customers trust a sender that makes leaving easy.

**Independent Test**: Tap the link in a test offer email in a private browser window. The page confirms without a
sign-in. The customer's settings now show email off for offers and news, and the next offer reaches them with no email.

**Acceptance Scenarios**:

1. **Given** a marketing email, **When** the customer taps Unsubscribe, **Then** marketing email (offers and news) is
   turned off for them at once, without signing in, and the page says so in plain words.
2. **Given** they have just unsubscribed, **When** they tap "Undo" on the same page within 7 days, **Then** email for offers
   and news is on again as it was. After 7 days they turn it back on in settings.
3. **Given** they unsubscribed, **When** they open notification settings in the app or on the website, **Then** email for
   offers and news shows off, and their inbox and phone choices are unchanged.
4. **Given** an unsubscribe link, **When** it is tampered with or used for someone else, **Then** it changes nothing and
   the page says the link didn't work, without revealing anything about any account.
5. **Given** an unsubscribe, **When** staff look at the customer in back-office, **Then** the change is recorded with when
   and "from an email".
6. **Given** a customer's mail program offers its own unsubscribe button, **When** they use it, **Then** it works the same
   way.

---

### User Story 3 - Messages that send themselves when something happens (Priority: P2)

A manager sets up an automatic message: "We miss you - here's 10% off your next order", to customers who **haven't
ordered for 30 days**. Each morning, customers who have just reached 30 days without an order get it once. Nobody gets it
twice in the same stretch, and it stops when the manager pauses it.

**Why this priority**: Win-back and reminder messages are the most valuable messages a shop sends, and doing them by hand
every day would be impossible.

**Independent Test**: Create an automatic "hasn't ordered for 30 days" offer. A test customer whose last order was 30 days
ago gets it at the next run. A second run sends nothing more. After they order and later reach 30 days again, they get it
again.

**Acceptance Scenarios**:

1. **Given** an active automatic message with the "hasn't ordered for N days" trigger, **When** a customer reaches N days
   since their last order, **Then** they receive it once, at the next daily run, through the same rules as any message
   (consent for offers and news, choices, quiet hours, daily limits).
2. **Given** the customer received it, **When** later runs happen and they still haven't ordered, **Then** they do not
   receive it again until they order and reach N days once more.
3. **Given** an automatic message with the "items left in the cart" trigger set to N hours, **When** a signed-in customer
   leaves items in their cart that long without paying, **Then** they receive it once, and not again until they have
   placed an order. It is never sent if their cart is empty when the check runs.
4. **Given** an automatic message, **When** a manager pauses it, **Then** nothing more is sent until it is resumed, and
   resuming does not send what was missed while paused.
5. **Given** an automatic message, **When** staff open it, **Then** they see when it last ran, how many it reached each
   time, and a running report, and its activity log shows who created, changed, paused and resumed it.
6. **Given** a customer has never ordered, **When** the "hasn't ordered" trigger runs, **Then** they are not counted, since
   they have no "last order". The "never ordered" audience filter from 112 covers them.

---

### User Story 4 - Messages on a repeating schedule (Priority: P2)

A manager sets "This week's specials" to send every Friday at 9:00 to customers who said yes to offers, starting next week
and ending at the end of the year. Each Friday's send is its own message in the list, with its own report.

**Why this priority**: Regular messages are common, and remembering to send them by hand is how they get missed.

**Independent Test**: Create a weekly repeating message starting on the next day at a set time. It sends at that time and
appears in the list with its own report. The next one is scheduled for a week later.

**Acceptance Scenarios**:

1. **Given** a repeating message (daily, weekly on chosen days, or monthly on a chosen date) with a start, an optional end
   and a time, **When** each time comes, **Then** it is sent to its audience as worked out at that moment, exactly once.
2. **Given** a repeating message, **When** a manager edits it, **Then** future sends use the new words and audience, and
   past sends keep what they said.
3. **Given** a repeating message whose time falls in the night hold, **When** it is offers or news, **Then** it is held to
   08:00 like any offer.
4. **Given** the end date has passed, **When** no more sends are due, **Then** it shows as finished.
5. **Given** a repeating send is still sending when the next one is due, **When** the next time comes, **Then** the next
   one waits for the first to finish and is not lost.

---

### User Story 5 - Greet the customer by name (Priority: P3)

A manager writes "Hi {first name}, your favourites are back" in the message body. In the inbox and the email, each customer
reads their own name. The phone notification on the lock screen never shows a name.

**Why this priority**: A personal greeting reads better, but it is a finishing touch.

**Independent Test**: Send a message whose body uses the first name to two customers, one with a first name on file and
one without. The first reads "Hi Sam", the second reads "Hi there". Neither phone notification shows a name.

**Acceptance Scenarios**:

1. **Given** a message body containing the first-name placeholder, **When** a customer with a first name opens it in the
   inbox or the email, **Then** they see their first name in its place.
2. **Given** a customer with no first name on file, **When** they open the same message, **Then** they see the fallback
   word the sender chose ("there" unless changed).
3. **Given** the placeholder, **When** the sender puts it in the title, **Then** the composer refuses it and says why.
   **When** the message also goes as a phone notification, **Then** the lock screen shows the fallback word ("Hi there"),
   never a name.
4. **Given** the composer, **When** the sender previews the message, **Then** the preview shows a sample name and the
   fallback.
5. **Given** a driver or shop message, **When** the placeholder is used, **Then** it works the same way with the person's
   first name.

---

### Edge Cases

- **A customer is in an automatic message's audience and also gets a manual message the same day**: the daily limit (111)
  applies across both. Over the limit, they get the inbox item only, as today.
- **A customer unsubscribes from email, then is sent a message with Email**: no email. The inbox and phone follow their
  other choices.
- **An email address bounces permanently or the customer marks an email as spam**: no further marketing email goes to
  that address. Staff see it on the customer's page. Service emails (orders, receipts) are unaffected.
- **A customer has no email address** (erased accounts, 113): not counted as an email recipient. The report says "no
  email".
- **Two staff edit the same automatic message at once**: the second save is refused and told to reload, as with other
  settings.
- **An automatic message's audience counts zero at a run**: the run is recorded with zero, and nothing is sent.
- **The cart trigger and a closed unpaid order (113)**: the cart is kept when an unpaid order closes. If the items stay,
  the cart trigger can still fire once.
- **Withdrawing a sent email**: an email cannot be recalled. Withdrawing a message removes the inbox items as today, and
  the screen says emails already sent stay sent.
- **The first-name placeholder in a direct message**: allowed. A CSA may greet the one person by name.

## Requirements *(mandatory)*

### Functional Requirements

**Email as a channel (E11)**

- **FR-001**: A message to customers MUST be able to go by email as well as to the inbox and phone. Email is not offered
  for driver or shop messages.
- **FR-002**: An offer or news email MUST go only to customers who said yes to that category (111) AND turned on email
  for it. A service email (Important, Direct) MUST go to every customer in the audience who has an email address and has
  not been suppressed for bounces or complaints.
- **FR-003**: Customers MUST be able to turn email on or off for offers and for news in their notification settings, on
  the app and the website. It is off until they turn it on, and each change is recorded with when, where and the wording
  version shown, like their other consent answers (111).
- **FR-004**: Every marketing email MUST identify Effy as the sender, give Effy's customer contact address, and include a
  working unsubscribe link. It MUST also offer the one-click unsubscribe that mail programs show.
- **FR-005**: Unsubscribing MUST turn off email for offers and news at once, without signing in, MUST be free, MUST be
  undoable from the same page for 7 days, and MUST be recorded with when and that it came from an email. Opening the link
  alone (a mail scanner checking it) MUST NOT unsubscribe anyone; the page acts once it has loaded in a browser.
- **FR-006**: An unsubscribe link MUST work only for the customer it was sent to and MUST reveal nothing about any account
  when it fails.
- **FR-007**: Emails MUST use Effy's standard email design: the message's title, words, picture, and one button to its
  destination.
- **FR-008**: Addresses that bounce permanently or report an email as spam MUST receive no further message email (marketing
  or service). The platform's own order and account emails are unchanged. Staff MUST see this on the customer's
  back-office page.
- **FR-009**: The composer MUST preview the email and MUST let the sender send a test email to the test account they pick.
  A test is never counted in any report.
- **FR-010**: The message report MUST count emails sent, failed, held for the night, over the daily limit and not sent (no
  address, email off, suppressed), adding up to the recipient count, and MUST show the message's unsubscribes beside them.
- **FR-011**: Offer and news emails MUST follow the same night hold as phone notifications, and MUST count towards the same
  daily and weekly limits (111). A customer gets at most the limit of marketing messages a day, whatever the channel.

**Automatic messages (E12)**

- **FR-012**: Admins and managers MUST be able to create, edit, pause, resume and end automatic messages. CSAs MUST be
  able to view them only.
- **FR-013**: An automatic message MUST be either **triggered** or **repeating**, with the kind, audience filters, words,
  picture, destination and channels of a normal message.
- **FR-014**: Triggered messages MUST be offers or news to customers. The triggers MUST be:
  - **"hasn't ordered for N days"**: customers whose last placed order was N days ago;
  - **"items left in the cart for N hours"**: signed-in customers whose cart has had items, unpaid, for N hours.
- **FR-015**: A triggered message MUST reach each customer at most once per occurrence:
  - once per stretch without an order;
  - for the cart trigger, once until the customer next places an order.

  Changing a trigger's number counts from the moment of the change, so it never sends to a backlog at once.
- **FR-016**: Triggered messages MUST be checked at least once a day ("hasn't ordered") or at least hourly ("items left in
  the cart").
- **FR-017**: A repeating message MUST support:
  - daily;
  - weekly on chosen days;
  - monthly on a chosen date;

  each at a chosen time on Effy's clock, with a start and an optional end. Each send MUST be its own message in the list,
  with its own report.
- **FR-018**: Every automatic send MUST go through the same rules as a manual message: consent, choices, quiet hours, daily
  limits, the per-message cap and the kill switch.
- **FR-019**: Pausing MUST stop all further sends. Resuming MUST NOT send anything missed while paused.
- **FR-020**: An automatic message MUST show its last run, its next run and what each run reached. Its activity log MUST
  record each creation, change, pause, resume and end, and who did it.
- **FR-021**: Offers and news remain customer-only. Automatic messages to drivers and shops MUST be repeating only (no
  triggers).

**First name (E13)**

- **FR-022**: Message bodies MUST accept a first-name placeholder, replaced per person in the inbox item and the email. A
  customer's first name is the given name on their account; a driver's or shop staff member's is the first word of their
  name.
- **FR-023**: The placeholder MUST be refused in the title. On the phone notification (the lock screen), the placeholder
  MUST show the fallback word, never a name. *(Amended at planning, research R8: the lock-screen words are the message's
  body, so refusing the placeholder there would make it unusable with a phone notification.)*
- **FR-024**: When a person has no first name on file, the sender's fallback word MUST be used ("there" by default).
- **FR-025**: The composer preview MUST show a sample name and the fallback.
- **FR-026**: The person's name MUST never appear in analytics, metrics or logs. Only the stored message words do.

### Key Entities

- **Email delivery**: one email for one recipient of one message. Its outcome is sent, failed, not sent (and why), or
  unsubscribed from.
- **Marketing email choice**: per customer, per category (offers, news), on or off, with its history (when, where, wording
  version).
- **Suppressed address**: an address that bounced permanently or complained, with when and why.
- **Unsubscribe link**: personal to one customer, usable without signing in, revealing nothing if wrong.
- **Automatic message**: a message template with either a trigger (kind and number) or a repetition (frequency, days or
  date, time, start, end), a status (active, paused, finished), and its runs.
- **Automatic run**: one check or send of an automatic message, with when and how many it reached. Each repeating send
  links to the message it created.
- **Trigger record**: per customer, per triggered message, the occurrence they were last sent, so nobody gets the same
  occurrence twice.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of marketing emails identify Effy, give the contact address, and carry a working unsubscribe link.
- **SC-002**: An unsubscribe takes effect for the very next send, and always within the legal limit of 5 working days.
- **SC-003**: No offer or news email reaches a customer who has not turned email on for that category (tested over every
  combination of yes/no and on/off).
- **SC-004**: Over 7 consecutive daily runs, no customer receives the same triggered message twice for the same
  occurrence.
- **SC-005**: A repeating message sends at its time, give or take 15 minutes, on every due date over 4 weeks, with no gap
  and no double send.
- **SC-006**: No phone notification sent by this feature contains a customer's name.
- **SC-007**: Each message report (manual or automatic, with or without email) adds up to its recipient count.

## Assumptions

- **Email is off for offers and news until the customer turns it on**, even if they already said yes to offers. 111's yes
  was given in words about notifications, and email is a separate switch the customer chooses. Turning it on is recorded as
  consent with the wording shown.
- **The sender is "Effy"** with the approved customer contact address (`hello@effyshopping.com`). The footer names Effy's
  legal entity from the legal identifiers, which are still placeholders; release is already blocked until they are set. Australian law requires identifying the sender and a working unsubscribe. It does not require
  a postal address, so none is added.
- **Unsubscribe turns off both offers and news email** in one tap, the simplest choice for the customer. Settings let them
  choose each.
- **The points-expiry reminder is not added as a trigger.** A fixed points-expiry reminder (push and email) already exists
  (110). A second, staff-made one would send customers two reminders. The two triggers here are the ones nothing covers
  today.
- **Automatic messages reuse the composer, audience filters, report and safeguards of 112.** They add only when they send.
- **Triggers run on Effy's operating clock**: "hasn't ordered" once a day in the morning, "items left in the cart" hourly.
- **Email for drivers and shops is out of scope.** They are Effy staff with the apps and the console inbox.
- **The first name** is the given name on the account (customers) or staff record (drivers, shop staff).
- **Email uses the platform's existing mail sending and Effy's email design.** There is no email designer and no A/B
  testing.
- **The website newsletter stays separate.** The footer newsletter (a double opt-in list not tied to an account) is not
  changed by this spec, and unsubscribing from a message email does not touch it.
- **Direct messages from a customer's back-office page** can also go by email, like other service messages.

## Out of Scope

- An email designer, newsletters with several articles, or A/B tests.
- Triggers beyond the two listed (birthdays, first-order anniversaries, back-in-stock alerts).
- Email to drivers or shops.
- Changing the fixed system messages (order updates, points expiry) or their timing.
- Web push for customers (backlog F8: not doing), the staff inbox (C8) and snooze (C9), all closed 2026-11-12.

## Dependencies

- 109 Notification Record (the one writer, deliveries, purge).
- 110 Inboxes.
- 111 Notification Preferences & Marketing Consent (categories, consent records, quiet hours, daily limits).
- 112 Back-Office Messages (composer, audiences, report, safeguards, the sending worker).
- 113 Data Lifecycle (erased customers have no email; unpaid orders closed, carts kept).
- 038 Email Template System (Effy's email design).
- 045 Legal (the legal entity name in the footer; the consent wording for marketing email, drafted for approval).

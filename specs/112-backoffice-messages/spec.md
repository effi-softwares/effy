# Feature Specification: Back-Office Messages

**Feature Branch**: `112-backoffice-messages`

**Created**: 2026-11-11

**Status**: Draft

**Input**: User description: "Back-office messages (notifications programme spec 4; docs/notifications-backlog.md Epic E, items E1–E10, E9 dropped). Staff write a message in back-office and send it to customers, drivers or shops. Kinds: promotion (customers only, only to those who said yes, Effy's name required), announcement, important, direct (one person). Messages area: list with status/audience/kind/sent/opened; composer with live previews of the lock-screen push and the inbox row/detail and character counters; audience builder with a live count from fixed reviewed filters (customers: all, chosen people, postcode or coverage group, ordered in last N days / never ordered, has points, app users; drivers: all, on duty, work today, collection/delivery run today, clearance, chosen people; shops: all active, chosen shops, by role); destination per audience (reuse 108's link picker for customers); picture; channels inbox ± push; schedule, test send to me, confirm "Send to N customers?"; cancel a scheduled message; withdraw removes it from everyone's inbox (pushes already shown cannot be recalled, the screen says so). Sending goes to everyone through the one writer so preferences, consent, daily limits and the night hold apply; resumes after a stop without a second copy. Report per message: recipients, delivered, push sent/failed/no device/muted/skipped/capped/held for the night, seen, opened, archived — adding up to the recipient count. Message one person from the back-office customer, driver and shop pages (direct, support category, no consent). Start a new message from a previous one. Safeguards: promotion to customers only and must name Effy; "all customers" needs a typed confirmation; a configurable cap per message; a kill switch that stops a sending message. Roles: admin and manager send to many people; CSA may send direct only; no second approval. Activity log per message. Guided tour on every new page. Story order: drivers and shops first (no consent), customer promotions last."

## Context

Spec 4 of the notifications programme ([docs/notifications-backlog.md](../../docs/notifications-backlog.md), Epic E).
Specs 1–3 built everything a message needs except a sender:

- **109**: one lasting notification per person, its phone and email deliveries, one writer, a closed list of places a
  tap can open per audience.
- **110**: an inbox with a live bell for customers (app and website), drivers and shop staff; important items pinned.
- **111**: categories, each person's choices, recorded marketing consent, the night hold and the daily and weekly limits
  for promotions.

Today every notification is triggered by something happening to an order, a run or a product. Effy staff have no way to
tell drivers "the hub opens late tomorrow", tell shops "new labels from Monday", tell customers "deliveries are paused
by the storm", or send an offer. They phone people or say nothing.

This spec gives back-office a **Messages** area to write a message once, choose who gets it, preview it as each person
will see it, send it now or later, and see what happened. It is the **first sender of offers and news**, and relies on
111 to keep them to people who said yes.

**Decisions already made by the operator (2026-11-08)**:
1. Administrators and managers may send to many people; customer-support staff may not. **No second approval.**
2. Customers receive offers and news only after a recorded yes (111).
3. Retention as 109 built: customers 180 days, drivers and shops 90 days.

## Kinds of message

Every message is one of these. The kind decides who may receive it and which of the person's categories (111) it is
filed under, and so which rules apply.

| Kind | Who may receive it | Filed under (per audience) | Consent and limits |
|---|---|---|---|
| **Announcement** | drivers, shops | driver Announcements · shop Announcements | none (always delivered) |
| **Important** | customers, drivers, shops | Important (each audience) | none; pinned at the top of the inbox until read |
| **Offer** | customers only | customer Offers | only customers who said yes to offers; night hold; limits |
| **News** | customers only | customer News | only customers who said yes to news; night hold; limits |
| **Direct** | one customer, one driver, or one shop | customer Support · driver Work · shop Announcements | none |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Staff send an announcement to drivers or shops (Priority: P1)

A manager opens **Messages** in back-office and starts a new message. They choose **Announcement**, choose **Drivers**,
narrow it to "on a delivery run today", and write a title and text. Beside the form they see the message as it will
appear: the phone's lock screen (iPhone and Android), the inbox row, and the opened item. A counter under each field shows
how much room is left and where the lock screen will cut the text off. They choose where a tap leads (Today), see a live
count ("12 drivers"), send a test to their own driver account, and press **Send**. A confirmation asks "Send to 12
drivers?" and, once confirmed, every one of those drivers has it in their inbox, with a phone notification.

**Why this priority**: Drivers and shops are Effy's own people, so no consent is involved. It proves the whole path
(write, choose, preview, send to many, record) with the lowest risk, and it is the message staff need most today.

**Independent Test**: Send an announcement to "all drivers" with a destination of Today: every active driver has it in
their inbox and, if signed in on a phone, a notification; tapping it opens Today. Send one to "shop managers" at two
chosen shops: only those managers get it.

**Acceptance Scenarios**:

1. **Given** a manager in Messages, **When** they start a new message, **Then** they choose a kind, one or more audiences
   allowed for that kind, filters per audience, a title, text, an optional picture, a destination per audience, and
   whether to send a phone notification as well as the inbox item.
2. **Given** the filters change, **When** the manager waits, **Then** the count of people who match updates within 2
   seconds.
3. **Given** a title or text longer than the lock screen shows, **When** the manager types, **Then** the lock-screen
   previews show where it is cut off, and the counter warns before the hard limit is reached.
4. **Given** the manager presses **Send to me** and picks one of their own driver or shop accounts, **When** it is sent,
   **Then** that account receives the message exactly as a recipient would, marked as a test, and it does not count in
   the report.
5. **Given** the manager presses **Send**, **When** the confirmation shows the number of people, **Then** nothing is sent
   until they confirm.
6. **Given** the message is sent, **When** the drivers open their inbox, **Then** it is there with the picture and the
   destination, filed under Announcements; a tap opens the destination.
7. **Given** a driver is deactivated or a shop is closed, **When** a message to "all drivers" or "all active shops" is
   sent, **Then** they are not included.
8. **Given** a message to shops, **When** it is sent, **Then** each staff member at each chosen shop gets it, or only the
   shop managers when the manager chose "managers only".

---

### User Story 2 - Staff send later, cancel, stop, or take a message back (Priority: P1)

A message can be scheduled for a time on Effy's clock. Until then it can be edited or cancelled. While it is going out, a
**Stop sending** button stops it at once; people who already have it keep it. After it is sent, **Withdraw** removes it
from every inbox; the screen says plainly that phone notifications already shown cannot be taken back.

**Why this priority**: The first wrong message is a matter of when, not if. Staff need the brakes before they need the
accelerator.

**Independent Test**: Schedule an announcement for 10 minutes from now, edit its text, and see the edited text arrive at
that time. Cancel another before its time: nobody gets it. Withdraw a sent one: it disappears from every driver's inbox
at once, and from open inboxes within a minute.

**Acceptance Scenarios**:

1. **Given** a scheduled message, **When** its time comes, **Then** it is sent to the people who match the filters at that
   moment (the count shown earlier was an estimate).
2. **Given** a scheduled message, **When** a manager edits or cancels it before its time, **Then** the edit is what is sent,
   or nothing is sent.
3. **Given** a message is going out, **When** a manager presses **Stop sending** and confirms, **Then** nobody else gets it,
   those who already have it keep it, and the message shows how many it reached before it stopped.
4. **Given** a sent or stopped message, **When** a manager withdraws it and confirms, **Then** it leaves every recipient's
   inbox, any phone notification not yet sent (held for the night, or queued) is not sent, and the confirmation says
   "Notifications already shown on phones can't be taken back."
5. **Given** a message was sending when the sender stopped working, **When** sending resumes, **Then** it carries on from
   where it was and nobody gets it twice.
6. **Given** a schedule time in the past, **When** the manager saves, **Then** it is treated as "send now" and the
   confirmation says so.

---

### User Story 3 - Staff see what happened to a message (Priority: P1)

Each message has its own page with a report: how many people it was for, how many it reached, and what happened to the
phone notifications (sent, the person has no phone signed in, failed, muted on the phone, turned off by the person, over
the promotion limit, held for the night, not sent because withdrawn), then how many saw it, opened it and archived it. Every line adds up: the parts of each group sum to its total. The page also opens the
message's activity log (who created, edited, tested, scheduled, sent, stopped or withdrew it, and when).

**Why this priority**: Without it staff cannot tell whether a message worked, or answer "did the drivers get it?".

**Independent Test**: Send an announcement to 5 drivers, one without a phone signed in: the report shows 5 reached, 4
phone notifications sent, 1 "no phone signed in"; open it as two drivers and the report shows 2 opened.

**Acceptance Scenarios**:

1. **Given** a sent message, **When** staff open its report, **Then** reached + not reached (no yes, for offers and news)
   equals the people it was for, and the phone outcomes add up to the number reached when a phone notification was chosen.
2. **Given** recipients open or archive the item, **When** staff look again, **Then** the report reflects it without a
   reload of the whole area (it updates when they come back to the page).
3. **Given** the people's own notification records have passed their retention, **When** staff open an old report,
   **Then** its numbers are still shown.
4. **Given** the message list, **When** staff look at it, **Then** each row shows title, kind, audience, status, when it
   was (or will be) sent, how many it reached and the share who opened it; the list can be searched, filtered by kind,
   audience and status, sorted and paged.

---

### User Story 4 - Message one person from their page (Priority: P2)

On a customer's, driver's or shop's page in back-office, **Send message** opens a short form already addressed to that
person (or that shop's staff): title, text, where a tap leads (for a customer, one of their orders if they like). It is a
**Direct** message: it reaches the person whatever their choices (for a customer it is filed under Support), and
customer-support staff may send it. The person's page lists the messages Effy sent them.

**Why this priority**: Support staff need to reach one person about one thing ("your order will be late, we've added
points") without a phone call. It reuses Story 1's path for one person.

**Independent Test**: As a customer-support user, open a customer and send "We've added 500 points for the late
delivery" with a tap leading to their points: the customer has it in their inbox under Support and a notification; the
customer page lists it; the message is in the Messages list as Direct.

**Acceptance Scenarios**:

1. **Given** a customer-support user on a customer page, **When** they send a direct message, **Then** it reaches that
   customer even if they turned off every channel they can turn off.
2. **Given** a customer-support user, **When** they try to send any other kind, or to more than one person, **Then** there
   is no way to, and any attempt through Effy's services is refused.
3. **Given** a direct message to a shop, **When** it is sent, **Then** every staff member of that shop gets it (or only its
   managers, if chosen).
4. **Given** a customer whose account is closed, a deactivated driver or a closed shop, **When** staff try to message them,
   **Then** it is refused with a reason.
5. **Given** a person's page, **When** staff open "Messages sent", **Then** they see every back-office message that person
   received, newest first, with whether they opened it.

---

### User Story 5 - An important message to customers (Priority: P2)

When something affects customers' deliveries (a storm, an outage, a public holiday), staff send an **Important** message to
customers, all of them or narrowed by postcode or coverage group, "ordered in the last N days" and so on. It reaches every
matching customer whatever their choices, and sits pinned at the top of their inbox until they read it.

**Why this priority**: The service message customers most need. It needs no consent, so it can go before promotions.

**Independent Test**: Send an Important message to customers in two postcodes who ordered in the last 7 days: exactly
those customers get it, pinned, including one who turned off every switch they can.

**Acceptance Scenarios**:

1. **Given** an Important message to customers, **When** it is sent, **Then** every matching customer gets it, whatever
   their choices, at any hour, and it does not count toward the promotion limits.
2. **Given** the audience is all customers with no filter, **When** the manager presses Send, **Then** they must type the
   number of people shown before the Send button works.
3. **Given** the words of an Important message, **When** it is reviewed before sending, **Then** the composer reminds the
   sender that Important is for service messages only (deliveries, safety, account), never offers.

---

### User Story 6 - Offers and news to customers who said yes (Priority: P2)

A manager writes an **Offer** (or **News**), chooses customers and filters, picks where a tap leads using the same picker as
information banners (a search, the sale, an aisle, a product), and sees two numbers: how many customers match and how many of
them said yes. The confirmation says "Send to 1,204 customers?" (those who said yes). Offers and news must name Effy;
otherwise Send is refused with the reason. They reach only customers whose current answer is yes, follow each customer's
push choice, are held until 08:00 when sent at night, and respect the daily and weekly limits (over the limit they go to
the inbox without a notification). Each one's inbox item offers "Stop offers like this" (111).

**Why this priority**: Promotions are the reason the programme exists commercially, but they carry the legal and trust
risk, so they come after the safer kinds have proven the path.

**Independent Test**: With customer A (said yes), B (said no) and C (never answered), send an offer to all customers at
22:00: only A has it in their inbox, and A's phone notification arrives at 08:00. Send a second offer the next morning: A
gets it in the inbox without a notification (daily limit). The report shows 3 matched, 1 reached, 2 "no yes".

**Acceptance Scenarios**:

1. **Given** an Offer or News, **When** the audience is chosen, **Then** only customers can be chosen and the count shows
   both "match" and "said yes".
2. **Given** words that do not contain "Effy", **When** the manager presses Send, Schedule or Send to me, **Then** it is
   refused with "Offers and news must say they're from Effy."
3. **Given** a customer whose answer changes to no after the message was scheduled, **When** it is sent, **Then** they do
   not get it.
4. **Given** an offer is sent at 22:00, **When** a customer who said yes has push on, **Then** the inbox item is there at once
   and the phone notification waits until 08:00; the report shows it as held until then.
5. **Given** an offer with an end time, **When** the end passes, **Then** it leaves every inbox and a push still held is not
   sent.
6. **Given** a test send to a customer account that has not said yes, **When** it is sent, **Then** nothing is delivered and
   the manager is told "This customer hasn't said yes to offers."

---

### User Story 7 - Start from a previous message (Priority: P3)

From any message's page, **Duplicate** opens a new draft with the same kind, audiences, filters, words, picture and
destinations, ready to change and send.

**Why this priority**: Repeated messages (weekly hub notice, monthly offer) become a minute's work. Not needed for the first
send.

**Independent Test**: Duplicate a sent announcement: a new draft opens with everything copied and no schedule; sending it
creates a second message with its own report.

**Acceptance Scenarios**:

1. **Given** any message (sent, cancelled, withdrawn), **When** staff duplicate it, **Then** a new draft is created with
   its content and filters and no schedule, test or report.

---

### Edge Cases

- **A person matches two filters, or is chosen by hand and also by a filter**: they get the message once.
- **The audience grows past the per-message limit between scheduling and sending**: the message is not sent; it shows
  "Not sent: more people than one message may reach" and staff narrow it and schedule again.
- **The per-message limit is lowered below a scheduled message's count**: judged at send time, as above.
- **Two staff edit the same draft at once**: the second save is refused with "Someone else changed this message", and they
  reload.
- **Edits to a message that has started sending**: not allowed; stop and withdraw it, or duplicate it.
- **A destination that no longer exists** (a product deleted, an aisle removed): the tap is handled as 109 handles a gone
  item (the closest screen with a short note).
- **A customer closes their account while a message is going out**: they are skipped.
- **A chosen-person list (from a file of email addresses) contains unknown or duplicate addresses**: the list shows how many
  were found, how many were not found and how many repeated, before it is used.
- **A message with no phone notification (inbox only)**: night hold and limits do not apply, and it does not count toward
  the limits.
- **Withdraw during sending**: sending stops and everyone who already has it loses it from their inbox.
- **A scheduled time during daylight-saving change**: the time is read on Effy's clock as written.
- **A shop with no staff accounts, or a driver never signed in**: they count as matched; the inbox item waits for them, and
  the phone outcome is "no phone signed in".
- **Sending to customers, drivers and shops in one message**: allowed for Important; each audience gets its own
  destination, and the report shows each audience separately as well as the total.

## Requirements *(mandatory)*

### Functional Requirements

**Messages and kinds**

- **FR-001**: Back-office MUST have a **Messages** area where staff create, schedule, send and review messages to
  customers, drivers and shops.
- **FR-002**: Every message MUST have one kind: Announcement, Important, Offer, News or Direct, with the audiences and
  filing in "Kinds of message". Effy MUST refuse a message whose kind does not allow one of its audiences (an offer to
  drivers, an announcement to customers).
- **FR-003**: A message MUST carry: a title (up to 60 characters), text (up to 500 characters), an optional picture, one
  destination per audience (from that audience's list of places a tap can open, default its home screen), whether a phone
  notification is sent besides the inbox item, an optional send time, and an optional end time after which it leaves
  every inbox.
- **FR-004**: A message's status MUST be one of: Draft, Scheduled, Sending, Sent, Stopped, Cancelled, Withdrawn, Not sent.

**Composer**

- **FR-005**: The composer MUST show live previews of the iPhone and Android lock-screen notification, the inbox row and the
  opened inbox item, for each chosen audience, and a counter for each field that marks where the lock screen cuts the
  text off.
- **FR-006**: The picture MUST be uploaded in the composer, shown in the opened inbox item on every surface, and kept at
  Effy's public picture address.
- **FR-007**: The destination for customers MUST be chosen with the same picker information banners use (a search, the
  sale, an aisle, a product) plus the customer's Home, Orders and Points; for drivers from Today and Account; for shops
  from the order queue and the catalogue.

**Audience**

- **FR-008**: The audience MUST be built only from these filters, combined with AND within an audience:
  - **Customers**: all; chosen people (search, or a file of email addresses); delivery postcode or coverage group; ordered
    in the last N days; never ordered; has a points balance; uses the app (has a phone signed in).
  - **Drivers**: all active; on duty now; with work today; on a collection run today; on a delivery run today; cleared for a
    function and area; chosen people.
  - **Shops**: all active; chosen shops; everyone or managers only.
- **FR-009**: The count of matching people MUST update within 2 seconds of a filter change; for Offer and News it MUST show
  both the customers who match and those of them whose current answer is yes.
- **FR-010**: The people who get a message MUST be worked out at the moment it is sent, not when it was written.
- **FR-011**: A person MUST receive one copy of a message, however many filters or audiences match them.

**Sending**

- **FR-012**: Every recipient's notification MUST be written through the one writer (109), so that their categories,
  choices, consent, the night hold and the limits (111) apply exactly as for any other notification.
- **FR-013**: Sending MUST survive the sender stopping part-way: it resumes where it left off and no person ever receives the
  same message twice.
- **FR-014**: A message to 20,000 people MUST finish being written to every inbox within 10 minutes.
- **FR-015**: **Send** MUST ask for confirmation with the number of people ("Send to 1,204 customers?"); an audience of all
  customers with no filter MUST also require typing that number.
- **FR-016**: **Send to me** MUST deliver the message to one account the sender picks (their own customer, driver or shop
  account), with every rule applied, marked as a test, and not counted in the report.
- **FR-017**: A scheduled message MUST be editable and cancellable until it starts sending; a send time in the past means now.
- **FR-018**: **Stop sending** MUST stop a sending message at once; those who already have it keep it.
- **FR-019**: **Withdraw** MUST remove the message from every recipient's inbox at once (an open inbox is told within a
  minute) and cancel every phone notification not yet sent; the confirmation MUST say phone notifications already shown cannot be taken back.

**Safeguards**

- **FR-020**: Offer and News MUST be refused (send, schedule and test) when the title and text do not name Effy, and when any
  audience other than customers is chosen.
- **FR-021**: No message MUST reach more people than the per-message limit (default 20,000). The limit MUST be set in
  back-office's Notification limits settings by administrators only, and every change MUST appear in that page's activity
  log. A message over it MUST be refused when scheduled and again when sent.
- **FR-022**: Important messages MUST show the sender a reminder that Important is for service messages only.

**Report and record**

- **FR-023**: Each message MUST have a report: people it was for; reached; not reached because they had not said yes (Offer
  and News); phone notifications sent, no phone signed in, failed, muted on the phone, turned off by the person, over the
  limit, held for the night, not sent because withdrawn; seen; opened; archived. Each group's parts MUST add
  up to its total, per audience and overall.
- **FR-024**: A report's numbers MUST remain after the recipients' own records pass their retention.
- **FR-025**: Each message MUST have an activity log (created, edited, test sent, scheduled, edited while scheduled,
  cancelled, sending started, stopped, sent, withdrawn, not sent) with who and when.
- **FR-026**: The Messages list MUST show title, kind, audiences, status, send time, people reached and share opened, with
  search, filters (kind, audience, status), sorting and paging.

**Direct messages**

- **FR-027**: The back-office customer, driver and shop pages MUST offer **Send message**, a direct message to that person
  (or that shop's staff, everyone or managers only) with title, text and destination (for a customer, optionally one of
  their orders).
- **FR-028**: Direct messages MUST reach the person whatever their choices, and MUST be refused for a closed account, a
  deactivated driver or a closed shop.
- **FR-029**: The customer, driver and shop pages MUST list the back-office messages that person (or shop) received, newest
  first, with whether each was opened.
- **FR-030**: **Duplicate** MUST create a new draft from any message, with its kind, audiences, filters, words, picture and
  destinations.

**Roles**

- **FR-031**: Administrators and managers MUST be able to create, send, schedule, stop, withdraw and duplicate any kind.
  Customer-support staff MUST be able to send Direct messages only, and to read the Messages area. Effy MUST refuse anything
  else from them, whatever route is used.
- **FR-032**: No message MUST need a second person's approval.

**Recipients' surfaces**

- **FR-033**: The inboxes of the customer app, customer website, driver app and shop console MUST show a message's picture in
  the opened item, and its destination as the tap target, like any other notification.

**Telemetry and tours**

- **FR-034**: Product analytics MUST record, with no personal details, a message opened from the inbox (by its kind).
- **FR-035**: Every new back-office page MUST have a guided tour with the words below, and the Notification limits tour MUST
  be rewritten to cover the per-message limit.

### Key Entities

- **Message**: what staff send. Kind, audiences, filters per audience, title, text, picture, destination per audience,
  phone notification yes/no, send time, end time, status, who created it, and the frozen report numbers.
- **Audience filter**: one of the fixed filters in FR-008 with its values (days, postcodes, chosen people, role).
- **Chosen-person list**: the people picked by hand or from a file, kept with the message.
- **Message event**: one entry of a message's activity log; append-only.
- **Message recipient**: one person a message was written for, with its notification (109) and delivery outcomes; the source
  of the report.
- **Per-message limit**: the most people one message may reach, set by administrators (beside 111's promotion limits).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A manager can write, preview, test and send an announcement to drivers in under 3 minutes from opening
  Messages.
- **SC-002**: A message to 20,000 people is in every inbox within 10 minutes of its send time.
- **SC-003**: Stopping the sender halfway through a 20,000-person message and letting it resume gives 0 duplicates and 0
  people missed.
- **SC-004**: In a test sending one offer to every customer, 0 customers without a current yes receive it in any form.
- **SC-005**: Every report's parts add up to its totals, for 100% of messages.
- **SC-006**: A withdrawn message is gone from every inbox the next time it is opened, and from every open inbox within
  a minute.
- **SC-007**: 100% of attempts by customer-support staff to send anything but a direct message to one person are refused.
- **SC-008**: The audience count updates within 2 seconds of each filter change.

## Assumptions

- **Customers get no "Announcement".** A service notice to customers is Important; anything that sells is Offer or News.
  This keeps every customer message either required (service) or consented (marketing), with nothing in between.
- **Direct messages are filed** under customer Support, driver Work and shop Announcements; all three always reach the
  person.
- **Channels are inbox and phone notification.** Email as a message channel is backlog E11 (later). The inbox item is always
  written; the phone notification is the sender's choice per message.
- **Personal words** (`{first name}`) are not offered (backlog E13).
- **Recurring and automatic messages** ("didn't order for 30 days") are not built (backlog E12).
- **The test account** is any account the sender picks each time; the last one picked is remembered on their computer.
- **The per-message limit** defaults to 20,000 and only administrators change it, since it is the guard against a mistake
  by anyone else.
- **Retention**: messages and their reports are kept; each recipient's own item follows 109's retention.
- **"Opened"** means the person opened the item in the inbox or tapped the phone notification (109's read); "seen" means it
  was shown in their open inbox (110).
- **Messages are written in English**, like the rest of the platform.

## Dependencies

- **109**: one writer, the places a tap can open, delivery outcomes, read and seen.
- **110**: inboxes, live updates to inboxes, pinning of Important, end times.
- **111**: categories, choices, consent, night hold, limits, "Stop offers like this", the Notification limits page.
- **108**: the destination picker for customers.
- **104**: the activity log drawer; **103**: the list; **106/107**: guided tours.
- **086**: Effy's public picture address.

## Guided tours

The words below are the source for back-office's tour tests (107 rule).

### ML - Messages (new page)

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Page heading | Messages | Everything Effy sends to customers, drivers and shops from here, and what happened to each. | |
| 2 | New message | Write a message | Start an announcement, an important notice, an offer or news. | Admin or manager |
| 3 | The list | Every message | Search, filter by kind, audience or status, and open one to see its report. | |
| 4 | Status | Where it's up to | Draft, scheduled, sending, sent, stopped, cancelled, withdrawn or not sent. | |

### ME - New message (new page; Admin or manager)

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Kind | What kind of message | Announcements go to drivers and shops. Important is for service notices only. Offers and news go only to customers who said yes. | |
| 2 | Audience | Who gets it | Choose customers, drivers or shops and narrow it down. The count shows how many people match now. | |
| 3 | Words | Say it short | The title and the start of the text are what a locked phone shows. The counters show where it's cut off. | |
| 4 | Previews | See it as they will | How it looks on a locked iPhone and Android phone, in the inbox, and opened. | |
| 5 | Destination | Where a tap leads | The screen that opens when someone taps it. | |
| 6 | Send to me | Try it first | Sends it to one of your own accounts exactly as others will get it. | |
| 7 | Send | Send or schedule | Send it now, or pick a time. You can edit or cancel a scheduled message until it starts. | |

### MS - A message (new page; needs a record)

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Report | What happened | How many people it reached, what happened to the phone notifications, and how many opened it. | |
| 2 | Actions | Stop or take it back | Stop sending halts it at once. Withdraw removes it from every inbox, but notifications already shown on phones stay. | Admin or manager |
| 3 | Duplicate | Use it again | Start a new message with the same words and audience. | Admin or manager |
| 4 | Activity | Activity | Who wrote, tested, sent, stopped or withdrew it, and when. | |

### CN - Notification settings (back-office; rewritten: version 1 → 2)

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Page heading | Notification limits | How often customers who said yes to offers and news may get one on their phone, and how many people one message may reach. Order updates, points and important messages are never limited. | |
| 2 | The limits | Promotional limits | The most promotional notifications a customer gets in a day and in a week. Any over the limit still reach their inbox, without a notification. | |
| 3 | Message limit | Largest message | The most people one message may reach. A bigger message is refused. Only administrators can change it. | |
| 4 | Activity | Rule changes | Every change to these limits, and who made it. | |

## Out of scope

- Email as a message channel and the marketing-email unsubscribe (backlog E11).
- Recurring or automatic messages (E12) and personal words (E13).
- A second person's approval (E9, dropped by decision 1).
- Replies from recipients.
- Messages to people who are not customers, drivers or shop staff (back-office staff themselves).
- iOS interruption levels (D7).

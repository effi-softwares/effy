# Feature Specification: Notification Preferences & Marketing Consent

**Feature Branch**: `111-notification-preferences`

**Created**: 2026-11-08

**Status**: Draft

**Input**: User description: "Notification preferences and marketing consent - spec 3 of the notifications programme (docs/notifications-backlog.md Epic D, items D1–D10, with the decisions answered 2026-11-08). Every notification type belongs to one category per audience, each with a default, a required flag and an importance. Customers choose per category and channel; required categories cannot be turned off; customers can mute push for order updates but the item always stays in the inbox. Marketing (offers, news) is OFF until the customer opts in through Effy's own wording; the apps ASK them once (after their first order, not at first launch); every yes and no is recorded with when, where and which wording version; no promotional push, email or inbox item reaches a customer without a yes. Consent wording and a privacy policy line drafted for operator approval. Settings screens in the customer app and website; driver and shop settings show their categories as fixed. Android notification channels per category. Quiet hours for offers and news (21:00–08:00 Effy time). A frequency cap for promotions (1 a day, 3 a week, configurable in back-office settings). iOS interruption levels deferred until the Apple account is paid."

## Context

Spec 3 of the notifications programme ([docs/notifications-backlog.md](../../docs/notifications-backlog.md)). Specs 1 (109)
and 2 (110) gave every audience one lasting record of what it was told, an inbox and a bell. Every kind of notification
already belongs to one **category** (orders, points, work, stock, products, …). What is missing is the person's say:

- A customer cannot turn anything off. Every order update buzzes their phone and every points message emails them.
- There is no record of marketing consent at all. Effy has never sent a promotion as a notification, and it must not
  until a customer has said yes in Effy's own words, with that yes recorded (Spam Act 2003; APP 7; Apple's rule that
  promotional push needs explicit opt-in, not the phone's permission alone).
- Drivers and shop staff see a switch for the device but nothing about what kinds of message they get, and nothing tells
  them why work messages cannot be turned off.

This spec builds the choices, the consent record, and the rules that decide, at the moment a message is sent, whether
it is sent and how. It sends **no promotion** itself: spec 4 (back-office messages) is the first sender of offers and
news, and it relies on everything here being in place.

**Decisions already made by the operator (2026-11-08)**:
1. Customer marketing is **off until the customer opts in**, and the apps **ask** them to.
2. Customers can turn off **push** for order updates; the item **always stays in the inbox**.
3. Shop push choices stay **per device** (spec 059); the inbox is per person.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A customer chooses how Effy reaches them (Priority: P1)

A customer opens Account → Notifications in the app (or Account → Notifications settings on the website) and sees every
kind of message Effy sends them, grouped by what it is about, with a switch for each way it can reach them: a phone
notification and an email. Order updates and points can be muted on either channel; the messages still appear in their
inbox. Important messages (an outage, a change to their delivery) and support messages (a direct reply about their
account or order) are shown as fixed, each with one plain sentence saying why. When the phone's own permission for
Effy's notifications is off, the screen says so at the top and offers a button that opens the phone's settings.

**Why this priority**: Without it a customer's only way to stop unwanted buzzing is to turn off every notification at the
phone level, which also silences "Your order is delivered". It is also the place consent is changed (Story 2).

**Independent Test**: Sign in as a customer, turn off push for Order updates, place an order and mark it paid: no phone
notification arrives, the "Order confirmed" item is in the inbox, and turning the switch back on makes the next update
buzz again.

**Acceptance Scenarios**:

1. **Given** a customer who has never changed anything, **When** they open Notifications settings, **Then** Order
   updates and Points show push on and email on, Offers and News show off, and Important and Support show as fixed
   with their reasons.
2. **Given** push for Order updates is off, **When** their order is delivered, **Then** no phone notification is sent,
   the email (if on) is sent, and "Delivered" appears in their inbox, unread.
3. **Given** email for Points is off, **When** their points are about to expire, **Then** no email is sent, and the
   push (if on) and the inbox item are.
4. **Given** a customer tries to turn off an Important or Support message by any means, **When** the change reaches
   Effy, **Then** it is refused and nothing changes.
5. **Given** the phone's permission for Effy's notifications is off, **When** the customer opens Notifications
   settings, **Then** the screen says "Notifications are off for Effy on this phone" with a button that opens the
   phone's settings for the app, and the switches still save their choices.
6. **Given** a customer changes a switch in the app, **When** they open the website settings, **Then** the website shows
   the same choice (one set of choices per person, not per device).

---

### User Story 2 - A customer is asked, once, whether they want offers (Priority: P1)

After a customer's first order is placed, the order confirmation (in the app or on the website, whichever they used) shows
a short, friendly ask in Effy's own words: would they like to hear about offers and new products? "Yes, tell me" turns on
Offers and News; "Not now" leaves them off. Either answer is recorded with when it happened, where (app, website,
settings), and which version of the wording was shown. They are not asked again by the prompt. They can change their
mind at any time in Notifications settings, and every change there is recorded the same way.

**Why this priority**: Decision 1. No promotion may ever reach a customer without this yes, so spec 4 cannot send a single
offer to customers until it exists.

**Independent Test**: As a new customer, place a first order on the website and choose "Yes, tell me": the consent history
shows one "yes" from the website with the current wording version, and the app does not ask again. As another new
customer, choose "Not now": Offers and News stay off, a "no" is recorded, and a test offer sent to all customers does not
reach them in any form.

**Acceptance Scenarios**:

1. **Given** a customer who has placed no order, **When** they use the app or website, **Then** they are never shown the
   offers ask (not at first launch, not at sign-up).
2. **Given** a customer's first order has just been placed, **When** the confirmation shows, **Then** the ask appears once,
   with both choices equally easy to pick and nothing pre-selected.
3. **Given** a customer answered the ask on the website, **When** they later open the app, **Then** the app does not ask
   them again.
4. **Given** a customer chose "Yes, tell me", **When** their record is examined, **Then** it shows: yes, for offers and
   news, at that moment, from the website (or app), with the wording version they saw.
5. **Given** a customer has said yes, **When** they turn Offers off in settings, **Then** a "no" for offers is recorded
   with source "settings", and from that moment no offer reaches them.
6. **Given** a customer has never said yes, **When** any offer or news message is sent to "all customers", **Then** they
   receive nothing at all: no inbox item, no push, no email.
7. **Given** a customer has never answered the ask and has never ordered, **When** they open Notifications settings and turn
   Offers on, **Then** that counts as a yes (source "settings") and the ask is not shown after their first order.
8. **Given** the phone has not yet granted notification permission, **When** the customer says yes to offers in the ask,
   **Then** the app may then ask the phone's permission, but the yes is recorded whatever the phone answers, and a phone
   permission alone is never treated as a yes.

---

### User Story 3 - Promotions respect the night and do not pile up (Priority: P1)

When a promotion (offer or news) is due to be sent between 21:00 and 08:00 on Effy's clock, the inbox item appears at once
but the phone notification waits until 08:00 (or is dropped if the promotion has ended by then). And no customer gets more
than one promotional phone notification a day or three a week; one over that limit still lands in the inbox, quietly. The
daily and weekly limits are set by Effy staff in back-office settings. Orders, points, important and support messages
ignore both rules.

**Why this priority**: These are the rules that keep the first campaigns (spec 4) from being the reason people delete the
app. They must be in place before the first promotion, not after the complaints.

**Independent Test**: With the clock at 22:00, send a promotion to an opted-in customer: it is in their inbox at once and the
push goes out at 08:00. Send a second promotion the same day: inbox only, no push. An order update at 22:00 buzzes
immediately.

**Acceptance Scenarios**:

1. **Given** a promotion is sent at 22:00 Effy time to an opted-in customer with push on, **When** it is written, **Then**
   the inbox item is there at once and the push is held until 08:00.
2. **Given** a held promotion's end time passes before 08:00, **When** 08:00 comes, **Then** its push is not sent (the
   inbox item has already left the inbox when it ended).
3. **Given** a customer has already had one promotional push today, **When** another promotion is sent, **Then** it goes
   to their inbox only, with no push, and the record says it was held back by the limit.
4. **Given** staff change the limits to 2 a day and 5 a week, **When** the next promotion is sent, **Then** the new limits
   apply; earlier sends are not re-judged.
5. **Given** it is 23:00, **When** an order update, points message, important or support message is sent, **Then** it is
   pushed at once and counts toward no limit.
6. **Given** staff try to set a limit below 0 or a weekly limit lower than the daily one, **When** they save, **Then** the
   change is refused with a reason.

---

### User Story 4 - Drivers and shop staff see what they get, and why it is fixed (Priority: P2)

In the driver app's Account screen and the shop console's Notifications settings, staff see the kinds of message Effy
sends them (driver: Work, Announcements, Important; shop: Orders, Stock, Products, Announcements, Important). Each is
shown as fixed with one plain sentence ("Work messages can't be turned off - they're part of your job"). The existing
per-device on/off for push stays exactly as it is: the shop console keeps its per-device choice of which kinds buzz this
device (spec 059), and the driver keeps the phone's on/off.

**Why this priority**: No silent dead ends. Without it a driver hunting for a switch finds none and no reason; with spec
4's announcements coming, staff should know they will receive them.

**Independent Test**: Open the driver app's Account → Notifications and the shop console's Settings → Notifications: each
lists its audience's categories as fixed with the reason, and the existing device choices still work unchanged.

**Acceptance Scenarios**:

1. **Given** a driver opens Account, **When** they look at Notifications, **Then** they see Work, Announcements and
   Important, each marked as always on with its reason, plus the phone's on/off as before.
2. **Given** a shop operator opens Settings → Notifications, **When** the page loads, **Then** the five categories are
   listed as always reaching their inbox, and the per-device push choices from 059 are unchanged.
3. **Given** any attempt to turn off a driver or shop category is made, **When** it reaches Effy, **Then** it is refused.

---

### User Story 5 - The phone files Effy's notifications by kind (Priority: P2)

On Android, Effy's notifications arrive in separate notification channels by kind, so a person can mute one kind in the
phone's own settings without muting the rest. Customer: Order updates (high), Points (default), Offers & news (default),
Important (high). Driver: Work (high), Announcements (default), Important (high). Each message is filed in the channel of
its category.

**Why this priority**: Android users often manage notifications at the phone level. Muting "Offers & news" there must not
silence "Out for delivery".

**Independent Test**: On an Android phone with the customer app, open the phone's Settings → Apps → Effy → Notifications:
the four channels are listed; muting Offers & news there and receiving an order update still makes a sound.

**Acceptance Scenarios**:

1. **Given** the customer app is installed on Android, **When** the phone's app notification settings are opened, **Then**
   it lists Order updates, Points, Offers & news and Important.
2. **Given** a delivery update is sent, **When** it arrives, **Then** it is filed under Order updates at high importance.
3. **Given** the driver app is installed, **When** its settings are opened, **Then** it lists Work, Announcements and
   Important.

---

### User Story 6 - Promotions say who they are from and how to stop them (Priority: P2)

Every offer or news message names Effy as the sender, and its inbox item offers a one-tap "Stop offers like this" that turns
off that category (recorded as a "no" with source "inbox"). The privacy policy and the consent ask use the same approved
wording, which is versioned: when the operator changes the wording, new answers record the new version and earlier answers
keep the version they saw.

**Why this priority**: The Spam Act requires the sender to be identified and an easy way to stop; the consent record is only
proof if it says what the customer agreed to.

**Independent Test**: Open an offer in the inbox as an opted-in customer and tap "Stop offers like this": Offers turns off,
a "no" from the inbox is recorded, and the next offer does not reach them.

**Acceptance Scenarios**:

1. **Given** an offer or news item in a customer's inbox, **When** they open it, **Then** "Stop offers like this" (or "Stop
   news like this") is shown, and tapping it turns that category off at once with a confirmation they can undo.
2. **Given** an offer or news message whose words do not name Effy, **When** it is sent, **Then** it is refused.
3. **Given** the operator publishes a new version of the consent wording, **When** a customer answers after that, **Then**
   their record carries the new version; earlier records are unchanged.
4. **Given** the privacy policy, **When** it is read, **Then** it says that Effy sends promotional notifications and email
   only with consent, how to stop them, and that order, points, important and support messages are service messages.

---

### User Story 7 - Staff can see a customer's choices and consent history (Priority: P3)

In back-office, a customer's page shows their current notification choices and the history of their marketing consent (each
yes and no, when, where, which wording). Staff can read it but cannot change it: only the customer can give or withdraw
consent.

**Why this priority**: When a customer says "I never agreed to this", staff can answer with the record. Not needed until
promotions are sent.

**Independent Test**: Open a customer who said yes on the website and later no in the app: both entries show with their
times, sources and wording versions; there is no control to change them.

**Acceptance Scenarios**:

1. **Given** a customer with a consent history, **When** staff open their page, **Then** the current choices and the full
   history are shown, newest first.
2. **Given** any staff member, **When** they look for a way to change a customer's choices, **Then** there is none, and any
   attempt to do so through Effy's services is refused.

---

### Edge Cases

- **Two devices, one change each, at the same moment**: the later change wins; both are recorded in the history.
- **A customer deletes their account**: their choices and consent history are deleted with it (no promotion can reach a
  deleted account anyway).
- **Consent withdrawn while a promotion's push is held for 08:00**: the push is not sent, because consent is judged again
  when the held push goes out. The inbox item, written while they had said yes, stays like any other they received.
- **A promotion sent to someone who has said yes to offers but not news (or the other way round)**: only the category they
  agreed to reaches them; the two are judged separately.
- **A guest (not signed in)**: has no choices and receives no notifications; the settings entry asks them to sign in.
- **The newsletter (signed up with an email on the website footer)**: unchanged by this spec. It is a separate, double
  opt-in email list that is not tied to an account; it neither grants nor withdraws notification consent.
- **A required category with a channel the person muted at the phone level**: Effy still sends it; what the phone does is
  the phone's choice, and the inbox always has it.
- **An existing message type with no category default for a channel** (for example a points email when email is off):
  nothing is sent on that channel and the delivery is recorded as skipped "by the person's choice", so reports can count it.
- **Clock change (daylight saving)**: quiet hours follow Effy's clock as it reads on the night; "a day" and "a week" for the
  limits are Effy-clock days and the seven days ending now.
- **A promotion with no push channel at all** (inbox only): quiet hours and limits do not apply, and it does not count
  toward the limits.
- **Staff set both limits to 0**: allowed; promotions then reach opted-in customers' inboxes only, never as a push.

## Requirements *(mandatory)*

### Functional Requirements

**Categories**

- **FR-001**: Every kind of notification MUST belong to exactly one category of its audience. Customer: Orders, Points,
  Offers, News, Important, Support. Driver: Work, Announcements, Important. Shop: Orders, Stock, Products, Announcements,
  Important.
- **FR-002**: Each category MUST declare, once, for the whole platform: whether it is required, whether it is marketing,
  its default for each channel, and its importance. Every surface MUST read these from that one declaration, and a check
  MUST fail when any surface's copy disagrees.
- **FR-003**: Required categories: customer Important and Support; every driver and shop category. A required category
  cannot be turned off on any channel.
- **FR-004**: Marketing categories: customer Offers and News. They MUST be off on every channel until the customer says yes.

**Customer choices**

- **FR-005**: A customer MUST be able to turn push and email on or off for Orders and Points, and push on or off for Offers
  and News (email is offered for Offers and News only once Effy sends marketing email, which this spec does not build).
- **FR-006**: Orders and Points items MUST always be written to the customer's inbox, whatever their channel choices.
- **FR-007**: Choices MUST belong to the person, not the device: a change on one surface MUST show on every other.
- **FR-008**: Each choice MUST record when it last changed and the surface it came from (app or website). The full
  history is kept for marketing consent (FR-010), not for every channel switch.
- **FR-009**: Effy MUST refuse a change that turns off a required category, names a category or channel that does not exist
  for the audience, or comes from anyone other than the customer themselves.

**Marketing consent**

- **FR-010**: Effy MUST keep, per customer and per marketing category, the full history of yes and no answers: when, where
  (app, website, settings, inbox), and the version of the wording shown. The current state is the latest answer.
- **FR-011**: No offer or news message MUST reach a customer in any form (inbox, push, email) unless their latest answer
  for that category is yes at the moment of sending. A held push MUST be judged again when it is released.
- **FR-012**: The customer app and website MUST show the offers ask once, on the confirmation of the customer's first
  order, unless the customer has already answered (by the ask or in settings) on any surface. It MUST NOT appear at first
  launch, at sign-up, or to a guest.
- **FR-013**: The ask MUST offer "Yes, tell me" and "Not now" equally prominently with nothing pre-selected; "Yes" records
  yes for both Offers and News; "Not now" records no for both; closing it without choosing counts as "Not now".
- **FR-014**: The phone's notification permission MUST never be taken as consent; consent is only ever given in Effy's own
  words.
- **FR-015**: Turning Offers or News on in settings MUST record a yes (source "settings") with the current wording version,
  shown beside the switch.
- **FR-016**: The consent wording and the privacy-policy lines MUST be published through Effy's legal content (versioned),
  drafted for the operator's approval; the ask and the settings screens MUST show the approved text word for word.

**At the moment of sending**

- **FR-017**: For each recipient and channel, sending MUST apply, in order: the category is required → send; marketing
  without a current yes → nothing at all; the person turned this channel off → skip that channel; otherwise send. A skipped
  channel MUST be recorded as skipped by choice.
- **FR-018**: Quiet hours: a push for Offers or News that falls between 21:00 and 08:00 on Effy's clock MUST be held until
  08:00; the inbox item MUST appear at once. A held push whose message has ended or been withdrawn by 08:00 MUST NOT be sent.
- **FR-019**: Limits: a customer MUST receive at most N promotional pushes per Effy day and M in the seven days ending now
  (defaults 1 and 3). A promotion over a limit MUST go to the inbox only, recorded as held back by the limit. Offers and
  News count together.
- **FR-020**: Staff (admin and manager) MUST be able to set N and M in back-office settings; values below 0, or a weekly
  limit below the daily one, MUST be refused. Every change MUST appear in the settings activity log.
- **FR-021**: Orders, Points, Important, Support and every driver and shop category MUST ignore quiet hours and limits.
- **FR-022**: An offer or news message whose words do not name Effy MUST be refused when it is sent.

**Settings screens**

- **FR-023**: The customer app and website MUST each have a Notifications settings screen listing the customer's categories
  in plain words, one switch per available channel, fixed categories shown with their reason, and, in the app, a notice with
  a button to the phone's settings when the phone's permission for Effy is off.
- **FR-024**: Each offer or news inbox item MUST offer "Stop offers like this" / "Stop news like this", which turns that
  category off (source "inbox") with an undo.
- **FR-025**: The driver app's Account screen and the shop console's Notifications settings MUST list their audience's
  categories as fixed, each with its reason, leaving the existing device choices unchanged.
- **FR-026**: A back-office customer page MUST show the customer's current choices and consent history, read-only.

**Phones**

- **FR-027**: On Android, each push MUST be filed in the channel for its category: customer Order updates (high), Points
  (default), Offers & news (default), Important (high, also used for Support); driver Work (high), Announcements (default),
  Important (high).

**Telemetry**

- **FR-028**: Product analytics MUST record, with no personal details: the ask shown, answered yes, answered no; a setting
  changed (category, channel, on/off); a "Stop offers like this" tap.

### Key Entities

- **Notification category**: one of an audience's kinds of message; declares required, marketing, a default per channel,
  importance, a label, a reason sentence when required, and its phone channel.
- **Notification choice**: a person's on/off for one category on one channel, with when it changed and from where. Absent
  means the category's default.
- **Marketing consent answer**: one yes or no from a customer for one marketing category, with when, where and the wording
  version shown. Append-only; the latest answer is the current state.
- **Consent wording**: a versioned, approved text (the ask and the settings line), published with Effy's legal content.
- **Promotion limits**: the daily and weekly maximum of promotional pushes per customer, set by staff.
- **Delivery outcome** (from 109): each push or email of a notification now also records "skipped by choice", "held for
  quiet hours" and "held back by the limit".

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a test sending one offer to every customer, 0 customers without a current yes receive it in any form.
- **SC-002**: A customer can find and change any notification choice in under 30 seconds from the Account screen, on the
  app and the website.
- **SC-003**: 100% of consent answers carry when, where and a wording version; no current yes exists without one.
- **SC-004**: With a customer's Order updates push turned off, 0 order pushes reach them, and 100% of their order updates are
  in their inbox.
- **SC-005**: Between 21:00 and 08:00 Effy time, 0 promotional pushes are sent; held ones go out by 08:05.
- **SC-006**: No customer receives more promotional pushes than the limits allow, in any day or any seven days.
- **SC-007**: A change of choice on one surface shows on another surface the next time it is opened, every time.
- **SC-008**: Turning off a required category is refused 100% of the time, however it is attempted.

## Assumptions

- **Email for Offers and News is not offered yet.** Effy sends no marketing email (backlog E11 is later). Consent is still
  recorded per category, not per channel, so it will cover marketing email when that comes; the email switch appears then.
- **Email for Orders and Points can be muted**, like push (Australian law treats them as service messages, so consent is
  not needed, but a customer may still opt out). The order confirmation receipt (052) is not a notification and is always
  sent.
- **Defaults**: Orders push on, email on; Points push on, email on; Offers and News off everywhere.
- **The ask counts "Not now" as a recorded no** and is not shown again automatically; the settings screen is always there
  for a change of mind. The ask appears on the first order's confirmation only; a customer whose first order was before
  this spec ships is asked on their next order's confirmation instead.
- **Support messages** use the Important channel on Android, since they are rare and about the customer's own order or
  account.
- **Quiet hours are fixed** at 21:00–08:00 Effy time (no setting); only the limits are configurable.
- **Wording versions** use the existing legal-content versioning; a new version needs no change to customers' records.
- **iOS interruption levels** (time-sensitive for important, passive for offers) wait until the Apple developer account is
  paid; nothing here depends on them.
- **No message of kind Offers or News exists yet**: this spec builds the rules and proves them with tests; spec 4 sends the
  first one.

## Dependencies

- Specs 109 (one notification record, one sender) and 110 (inboxes): choices and consent are applied where 109 sends.
- Spec 045 (legal content): the consent wording and privacy-policy lines are published there, versioned.
- Spec 059 (shop console push per device): kept unchanged.
- Spec 104 (activity log): the back-office settings change and the customer consent history are shown through it.

## Guided tours

The words below are the source for both consoles' tour tests (106 / 107 rule).

### NS - Settings · Notifications (shop console; rewritten: version 1 → 2)

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | This device | This device | Alerts for new orders and anything that needs attention, even when the console is closed. Each computer, tablet or phone is turned on separately. | |
| 2 | Send a test | Check it works | Shows one notification on this device now. | Notifications are on |
| 3 | Always in your inbox | Always in your inbox | Orders, stock, products, Effy's announcements and important notices always reach your inbox. They can't be turned off, so nobody at your shop misses one. | |
| 4 | What you're told about | What you're told about | Choose which alerts reach this device. Everything is on until you turn it off. | |
| 5 | Sound | Sound | A chime in this tab for new orders while the console is open. The Sound button at the top of every page does the same. | |
| 6 | The home-screen note | On iPad and iPhone | Notifications only work once Effy Shop is added to the home screen. | iPad / iPhone |

### CN - Notification settings (back-office, new page)

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Page heading | Promotional notifications | How often customers who said yes to offers and news may get one on their phone. Order updates, points and important messages are never limited. | |
| 2 | The limits | Limits | The most promotional notifications a customer gets in a day and in a week. Any over the limit still reach their inbox, without a notification. | |
| 3 | Activity | Rule changes | Every change to these limits, and who made it. Administrators and managers can change them. | |

## Out of scope

- Sending any promotion or announcement (spec 4).
- Marketing email and its unsubscribe link (backlog E11).
- iOS interruption levels (backlog D7, waits for the paid Apple account).
- Merging the website newsletter list with account consent.
- Staff changing a customer's choices on their behalf.
- Per-shop or per-driver choices beyond what exists today.

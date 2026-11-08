# Feature Specification: Notification Record & Destinations

**Feature Branch**: `109-notification-record`

**Created**: 2026-11-07

**Status**: Draft

**Input**: User description: "Notification record and destinations (spec 1 of the notifications programme;
docs/notifications-backlog.md, Epic A plus the destination vocabulary B1–B6 and F1, F3, F4 that spec 1 carries).
- Every notification the platform sends to a customer, driver or shop operator becomes one lasting notification per
  person: what it said, what it is about, where a tap leads, whether the person has seen, read or archived it, and
  when it expires.
- Push and email become deliveries of that notification rather than the record itself.
- Words are kept as they were sent.
- One closed list of destinations per audience says where a notification leads. A tap on a push opens that exact
  screen in the customer app, the driver app and the shop console. The destination is held through sign-in and a cold
  start, with a sensible fallback when the thing is gone, and the tap marks the notification read.
- Old notifications are cleared after a retention period: customers 180 days, staff 90 days, delivery records 30 days.
  A deleted customer account leaves none behind.
- Sending keeps up with large volumes: 20,000 pushes in under 10 minutes.
- Customers are no longer told their order is ready 'for handoff'.
- Out of scope: inbox screens (spec 2), preferences or consent (spec 3), staff-written messages (spec 4)."

## Context

Effy already sends notifications. Customers hear about their order and their points, drivers about their runs, and shop
operators about new orders, stock and their products. Two things are missing.

**Nothing is kept.** A notification exists only as an attempt to deliver it: one attempt for the phone, another for
email. Once it has been sent, Effy has no lasting record of it as something the person received. There is no record of
what it said that a person could look back on, nothing saying whether they opened it, and nothing tying the push and
the email together as one notification. The inbox (spec 2), preferences (spec 3) and staff-written messages (spec 4)
all need that record first. The delivery attempts are also never cleared, so they pile up for ever.

**A tap mostly just opens the app.**
- The customer app understands only "an order" and "points". Two order notifications ("With the courier" and "A change
  to your delivery") open the orders list instead of the order they are about. A tap made while signed out is lost.
- The driver app opens the run a notification is about, but understands nothing else.
- The shop console opens a page, but each app decides where a link goes in its own way, so nothing keeps the three
  in agreement.

This feature makes every notification **one lasting record per person**, with push and email as deliveries of it. It
also gives each audience **one closed list of places a notification can lead**, so a tap always opens the screen the
notification is about. No new screen is added: everything a person sees is the notifications they already receive,
now opening the right place.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A tap opens what the notification is about (Priority: P1)

A shopper gets "With the courier" on the lock screen and taps it. The app opens **that order**, not the orders list. A
driver taps "Run assigned" and lands on that run. A shop operator clicks "Product sent back" and lands on that product
in the console.

**Why this priority**: This is what people notice. A notification that only opens the app makes the person search for
the thing it was about, and important notices lose their point.

**Independent Test**: Trigger each kind of notification the platform sends today, for each audience. Tap it with the
app closed, in the background and open, and check that the screen it is about opens every time.

**Acceptance Scenarios**:

1. **Given** a customer with one order, **When** they tap any notification about that order (confirmed, packed, with
   the courier, a change to your delivery, delivered), **Then** the app opens that order's page.
2. **Given** a customer, **When** they tap "You've got Effy points", **Then** the app opens their points.
3. **Given** a driver with a run in Today, **When** they tap "Run assigned", "Run opens soon" or "Run updated" for it,
   **Then** the app opens that run.
4. **Given** a shop operator signed in to the console, **When** they click any shop notification, **Then** the console
   opens the page it names:
   - a new order, or orders waiting → the order queue (that order when there is one);
   - a refund waiting → that order;
   - a stock or product notification → that product;
   - products added from a list → the catalogue.
5. **Given** the app was not running, **When** the person taps a notification, **Then** the app starts and opens the
   screen the notification is about. It does not stop at the home screen.
6. **Given** the app is open on another screen, **When** the person taps a notification, **Then** the screen the
   notification is about opens on top. Back returns to where they were, or to the tab's start.

---

### User Story 2 - Every notification is kept, exactly as it was sent (Priority: P1)

When a customer's order is confirmed, Effy keeps **one notification** for that customer. It records:
- the words they were shown;
- what it is about;
- where a tap leads;
- when it was created;
- whether it has been seen, read or archived;
- whether it expires.

The phone push and the email are **deliveries** of that one notification, each with its own outcome: sent, the
person has no device, the person muted it, it failed, or it expired.

**Why this priority**: The inbox, preferences and staff messages all build on this record. Without it, nothing can be
shown again or counted.

**Independent Test**: Trigger an order confirmation. Check that exactly one notification exists for the customer, with
the words the phone showed, its destination and an unread state, and that the push and the email are each recorded
against it with their outcome. Trigger the same event again; still one.

**Acceptance Scenarios**:

1. **Given** any event that notifies someone today, **When** it happens, **Then** one notification is kept for each
   person told, holding the title and text they were shown, the destination, and the time.
2. **Given** a notification sent by push and email, **When** its deliveries finish, **Then** each delivery is recorded
   against the same notification with its own outcome.
3. **Given** the same event is processed twice, **When** the second one runs, **Then** no second notification and no
   second push or email is created.
4. **Given** a notification was sent last month, **When** Effy's wording for that kind of notification is changed
   today, **Then** the kept notification still says what was sent.
5. **Given** a person has no device registered, **When** they are notified, **Then** the notification is still kept
   (for the inbox in spec 2), and its push delivery is recorded as "no device".
6. **Given** a notification has an expiry, **When** a delivery has not been made by then, **Then** that delivery is
   abandoned and recorded as expired, never sent late. For example, "Run opens soon" after the run has opened.

---

### User Story 3 - A tap made while signed out is not lost (Priority: P2)

A shopper's session has ended. They tap "Your order is packed", sign in, and land on that order. If **someone else**
signs in on that phone instead, the notification is dropped, and they never see the first person's order.

**Why this priority**: Today the tap is silently thrown away, which is the exact moment a person wanted to look.
Sending it to the wrong person would be a privacy failure.

**Independent Test**: With the customer app signed out, tap a notification addressed to customer A.
- Sign in as A: their order opens.
- Repeat, signing in as B: B lands on their own home screen, and nothing of A's is shown.
- Repeat for the driver app and the shop console.

**Acceptance Scenarios**:

1. **Given** a signed-out app, **When** the person taps a notification and then signs in as its recipient, **Then**
   the screen the notification is about opens straight after sign-in.
2. **Given** a signed-out app, **When** someone other than the recipient signs in, **Then** the held notification is
   dropped without being shown or opened.
3. **Given** a held notification, **When** the person abandons sign-in and closes the app, **Then** nothing is opened
   later from that stale tap.

---

### User Story 4 - When the thing is gone, the person still lands somewhere useful (Priority: P2)

A driver taps "Run assigned", but the run has since been moved to another driver. The app opens Today, which shows
what is theirs now. A shopper taps a notification about an order that can no longer be shown. The app opens their
orders and says briefly that the order isn't available.

**Why this priority**: A dead end or an error screen after a tap feels broken, and notifications are often tapped late.

**Independent Test**: Tap a notification whose subject has gone (a withdrawn run, a product taken off sale, an order
that isn't theirs) and check that the person lands on the nearest useful screen with a short explanation and no error.

**Acceptance Scenarios**:

1. **Given** a run that is no longer the driver's, **When** they tap a notification about it, **Then** Today opens.
2. **Given** an order the customer can no longer open, **When** they tap a notification about it, **Then** their
   orders list opens with a short message that the order isn't available.
3. **Given** a product that no longer exists in the shop's catalogue, **When** the operator clicks a notification about
   it, **Then** the catalogue opens with a short message.
4. **Given** a notification whose destination this version of the app does not know, **When** it is tapped, **Then**
   the app opens its home screen. It never crashes or shows an error.

---

### User Story 5 - Opening a notification marks it read (Priority: P2)

When a person opens a notification, it becomes **read** (and so seen) on Effy's side, not just on that phone. When
spec 2's inbox arrives, it already shows the right unread state on every device the person uses.

**Why this priority**: Read state recorded from day one means the inbox starts out correct rather than showing
everything as unread.

**Independent Test**: Tap a notification on one device and check that the kept notification now records when it was
read and seen.

**Acceptance Scenarios**:

1. **Given** an unread notification, **When** the person taps it and its screen shows, **Then** the notification is
   recorded as read and seen at that time.
2. **Given** a notification already read, **When** it is tapped again (for example from a second device), **Then** the
   first read time is kept.
3. **Given** a tap that fell back (User Story 4), **When** the fallback screen shows, **Then** the notification is
   still marked read: the person did open it.

---

### User Story 6 - Sending keeps up with many people at once (Priority: P2)

When thousands of notifications are due together (the first staff announcement in spec 4, or a busy morning of
orders), every one is delivered within minutes, not hours. A single notification still arrives as quickly as today.

**Why this priority**: Today's sending would take hours to reach every customer, which would make staff announcements
useless before they exist.

**Independent Test**: Queue 20,000 push deliveries and measure the time until the last one is sent. While that runs,
trigger one order confirmation and measure how long it takes to arrive.

**Acceptance Scenarios**:

1. **Given** 20,000 push deliveries due at once, **When** sending runs, **Then** all are sent (or given a final
   outcome) within 10 minutes.
2. **Given** a large backlog is being sent, **When** a single new notification is created, **Then** it arrives within
   2 minutes. It does not wait behind the backlog.
3. **Given** a delivery fails for a reason that may pass, **When** sending retries it, **Then** it is retried a limited
   number of times and then recorded as failed. It is never sent twice to the same device.

---

### User Story 7 - Old notifications are cleared, and a deleted account leaves none (Priority: P3)

Notifications and their delivery records don't pile up for ever:
- **customers:** kept for 180 days;
- **drivers and shop operators:** 90 days;
- **delivery records:** 30 days.

When a customer deletes their account, every notification addressed to them and every device registration is removed.

**Why this priority**: Privacy and housekeeping. Nothing a person sees depends on it yet, but it must exist before the
inbox shows history.

**Independent Test**: Age notifications past each period and check that they are removed and younger ones are not.
Delete a test customer and check that nothing addressed to them remains.

**Acceptance Scenarios**:

1. **Given** a customer notification 181 days old, **When** clearing runs, **Then** it and its deliveries are removed.
   One 179 days old remains.
2. **Given** a driver or shop notification 91 days old, **When** clearing runs, **Then** it is removed.
3. **Given** a delivery record 31 days old, **When** clearing runs, **Then** the delivery record is removed and its
   notification (still within its own period) remains.
4. **Given** a customer deletes their account, **When** deletion completes, **Then** no notification, delivery or
   device registration addressed to them remains.

---

### User Story 8 - Customers are told things in customer words (Priority: P3)

When the shop has packed an order, the customer reads "**Your order is packed** – It will be on its way to you soon."
They are not told it is "ready for handoff", which is Effy's internal wording.

**Why this priority**: Small, but it is the notification every customer gets on every order.

**Independent Test**: Have the shop mark an order ready. Read the customer's notification.

**Acceptance Scenarios**:

1. **Given** a shop marks a customer's order ready, **When** the customer is notified, **Then** the notification reads
   "Your order is packed" / "It will be on its way to you soon."
2. **Given** every customer notification type, **When** their words are reviewed, **Then** none uses internal words:
   handoff, hub, fulfilment, package or parcel counts, run, or shop.

### Edge Cases

- **Several notifications about the same thing arrive close together** (confirmed, then packed). Each is kept as its
  own notification. On the lock screen, a later one replaces the earlier banner for the same order, as today.
- **A notification arrives while the app is open on the very screen it is about.** It is shown as a banner. Tapping it
  keeps the person where they are (the screen re-reads) and marks it read.
- **A person signs out.** Their device stops receiving their notifications, as today. Notifications created
  meanwhile are still kept, recorded as "no device".
- **The person who received the tap is a driver who is no longer active, or a shop operator removed from the shop.**
  The app's usual refusal applies after sign-in, and nothing about the notification is shown.
- **A tap arrives for a different audience's app**, for example a driver notification somehow in the customer app.
  It is ignored, and the app opens its home screen.
- **A notification whose words were never shown**, because no device and no email received it. It is still kept with
  the words it would have shown, ready for the inbox.
- **Clearing runs while a delivery is still being attempted.** Only notifications past their period are removed. A
  delivery in progress belongs to a recent notification and is untouched.
- **Old app versions.** There are no installed builds outside the team yet, so destinations replace the old link format
  outright. An unknown destination still falls back to the home screen.

## Requirements *(mandatory)*

### Functional Requirements

**The notification record**

- **FR-001**: Every notification sent to a customer, driver or shop operator MUST be kept as exactly one notification
  for that person, whatever channels deliver it.
- **FR-002**: A notification MUST record:
  - who it is for, and which of their accounts (customer, driver or shop operator);
  - its kind and its category;
  - the title and text as they were sent;
  - what it is about, and where a tap leads (FR-010);
  - its importance;
  - when it was created;
  - when it was seen, read and archived (each empty until it happens);
  - an optional expiry;
  - whether the platform created it or a person did. Every notification in this feature is created by the platform.
- **FR-003**: The words a notification was sent with MUST NOT change when Effy later changes the wording for that kind
  of notification.
- **FR-004**: Push and email MUST be recorded as **deliveries** of a notification. Each delivery has its own outcome:
  sent, no device, muted, failed after retries, or expired.
- **FR-005**: The same event MUST NOT produce a second notification or a second delivery for the same person and
  channel.
- **FR-006**: A notification MUST be kept even when no channel can deliver it.
- **FR-007**: A delivery not made before its notification expires MUST be abandoned and recorded as expired.
- **FR-008**: Every notification that is sent today, for every audience, MUST be created through this record, with no
  change to who is told, when they are told, or which channels are used. One exception is the wording in FR-026.
- **FR-009**: A notification MUST only be created together with the change it reports, so that a change that did not
  happen never produces a notification.

**Where a notification leads**

- **FR-010**: Each audience MUST have one closed list of destinations, the same list for every app that audience uses:
  - **Customer:** an order, the orders list, points, a product, an aisle, a search, the sale page, home.
  - **Driver:** Today, a run, account.
  - **Shop operator:** the order queue (optionally one order in it), an order, a product, the catalogue.
- **FR-011**: Every kind of notification sent today MUST name a destination from its audience's list:
  - customer order notifications → **that order**, including "With the courier" and "A change to your delivery",
    which today open only the orders list;
  - customer points → points;
  - driver run notifications → that run ("Run removed" → Today);
  - shop notifications → the pages in User Story 1, scenario 4.
- **FR-012**: A tap on a notification MUST open its destination in the customer app (Android and iOS), the driver app
  (Android and iOS) and the shop console, whether the app was closed, in the background, or open.
- **FR-013**: Opening a destination from an open app MUST put it on top of where the person is, so Back returns there
  or to the tab's start.
- **FR-014**: A tap made while signed out MUST be held and followed once the **recipient** signs in. If a different
  person signs in, or the app is closed first, the tap MUST be dropped without showing anything from it.
- **FR-015**: A tap whose subject is gone, or no longer the person's, MUST open the nearest useful screen with a short
  plain message, never an error:
  - a run → Today;
  - an order → the orders list;
  - a product → its aisle (customer) or the catalogue (shop).
- **FR-016**: A destination the app does not know MUST open the app's home screen.
- **FR-017**: A tap MUST record the notification as read and seen when its screen (or its fallback) has shown. A
  notification already read keeps its first read time.
- **FR-018**: The platform MUST be able to count how many notifications of each kind were opened. A notification
  counts as opened only once its screen has actually shown. No personal details are recorded beyond the account
  identifier the platform already uses.

**Sending**

- **FR-019**: 20,000 push deliveries due together MUST all reach a final outcome within 10 minutes.
- **FR-020**: A single new notification MUST still arrive within 2 minutes of its event while a large backlog is being
  sent.
- **FR-021**: A delivery that fails for a reason that may pass MUST be retried a limited number of times, then
  recorded as failed. A device the delivery service reports as gone MUST be removed, as today.
- **FR-022**: Operators MUST be able to see how many deliveries are waiting and be alerted when sending falls behind
  or fails repeatedly.

**Clearing and deletion**

- **FR-023**: Notifications MUST be removed once older than their retention period: customers 180 days; drivers and
  shop operators 90 days.
- **FR-024**: Delivery records MUST be removed once older than 30 days, independently of their notification.
- **FR-025**: When a customer deletes their account, every notification, delivery and device registration addressed to
  them MUST be removed as part of the deletion.

**Wording**

- **FR-026**: The customer "order ready" notification MUST read **"Your order is packed"** / **"It will be on its way
  to you soon."**
- **FR-027**: No customer notification may use internal words: handoff, hub, fulfilment, package or parcel counts,
  run, or shop.
- **FR-028**: No notification shown on a lock screen may name a person, an address, an amount, a product or a reason,
  as today.

### Key Entities

- **Notification**: one thing a person was told. For whom (person and audience), what kind, which category, the title
  and text as sent, what it is about, where a tap leads, importance, when created, when seen / read / archived, an
  optional expiry, and whether the platform or a person created it.
- **Delivery**: one attempt to bring a notification to the person by one channel (phone push or email). The channel,
  its outcome (waiting, sent, no device, muted, failed, expired), how many attempts, and when it finished. A
  notification has zero or more deliveries.
- **Destination**: where a tap leads, chosen from the audience's closed list, with the item it names when it names
  one (an order, a run, a product, an aisle, a search).
- **Device registration**: unchanged. A device that can receive a person's push notifications, removed when the person
  signs out, when the delivery service reports it gone, or when a customer deletes their account.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every kind of notification sent today (6 customer, 4 driver, 11 shop) opens the screen it is about when
  tapped: in the customer and driver apps on Android, in the iOS Simulator, and in the shop console. 21 of 21 pass.
- **SC-002**: A tap made while signed out reaches its screen straight after the recipient signs in, in each of the
  three apps. In 0 of the test runs does a different person see anything from it.
- **SC-003**: Every notification created after release can be found afterwards with its words as shown, its
  destination, its read state and each delivery's outcome. A repeated event produces 0 duplicates.
- **SC-004**: 20,000 push deliveries reach a final outcome in under 10 minutes. A single notification created during
  that run arrives in under 2 minutes.
- **SC-005**: After clearing runs, no notification is older than its retention period and no delivery record is older
  than 30 days. A deleted customer leaves 0 notifications, deliveries and device registrations.
- **SC-006**: A tapped notification is recorded as read within 5 seconds of its screen showing, in each of the three
  apps.
- **SC-007**: 0 customer notifications use the internal words listed in FR-027.
- **SC-008**: Nobody notices a change in which notifications they receive. In a week of normal use, the number of
  notifications per kind and audience matches the week before release, give or take normal variation in orders and
  runs.

## Assumptions

- **Retention periods** are the backlog's proposal (customers 180 days, staff 90 days, delivery records 30 days); they
  were not separately confirmed.
- **No new screens.** The inbox, the bell and its count are spec 2. Live updates of an unread count are left to spec 2
  too, because nothing displays a count until then.
- **No new notification kinds** and no change to who is told. "Out for delivery" stays unsent (it is decided in spec 2),
  and preferences and consent (spec 3) and staff-written messages (spec 4) come later. The record already has room for
  categories, importance, expiry, archiving and a person as the creator, so those specs add no new shape.
- **iOS** can only be checked in the Simulator until the paid Apple Developer account exists
  (`docs/observability-apple-blockers.md`). Real delivery to iPhones is not part of this feature's acceptance.
- **Shop console** device preferences (which kinds each device is told about) stay exactly as they are. They decide
  pushes, not whether a notification is kept.
- **There are no installed app builds outside the team yet**, so the old link format inside a push can be replaced
  rather than supported alongside the new one.
- **The category of every existing kind** is fixed in this feature so later specs can rely on it:
  - customer: orders or points;
  - driver: work;
  - shop: orders, stock or products.
- **Importance** is "normal" for every existing kind. "Important" is used first by spec 4.
- The 20,000 figure comes from the backlog as the scale of one announcement to every customer. It is a target for
  sending, not a forecast of customers.

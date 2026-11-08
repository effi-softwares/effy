# Feature Specification: Notification Inboxes

**Feature Branch**: `110-notification-inboxes`

**Created**: 2026-11-08

**Status**: Draft

**Input**: User description: "Notification Inboxes (notifications programme spec 2; backlog docs/notifications-backlog.md
items C1–C7, A7, F2, F6, F7, F9; builds on spec 109's lasting notification record and destination list). Every person
who receives notifications gets a real, industry-standard notification centre that holds everything they were told,
whether or not a push reached them: customers in the app (bell on Home) and on the website (bell in the header, an
account page), drivers in the driver app, shops in the console (a bell opening a side panel, plus a full page with a
guided tour). Newest first, grouped by day, category icons, unread markers, important items pinned; All / Unread and
category filters; opening the inbox clears the count, tapping an item marks it read and opens its screen; mark all
read; archive with undo; expired items disappear; endless scrolling; live updates with no timer; the app-icon badge
equals the unseen count; a person sees only their own notifications. Also: send 'Out for delivery' when the order
leaves with the driver (operator decision 4), send 'Points about to expire' as a push too, and give a driver who signs
in on a new phone the work they missed. Out of scope: preferences and consent (spec 3), staff-written messages
(spec 4), snooze, a back-office staff inbox, web push."

## Context

Since spec 109, every notification Effy sends is kept as one lasting record per person: what it said, what it is about,
where a tap leads, and whether the person has seen or read it. But nobody can look at those records yet.

- **A customer who misses a push has lost it.** If they swiped it away, had notifications off, or use the website,
  there is nowhere to see "Your order is packed" or "Points added". The app's Notifications screen exists but is always
  empty, and the website has none.
- **A driver who was not signed in when work was assigned is never told.** On 2026-11-07 a driver assigned a run
  before signing in on their phone got nothing, because there was no phone to send to.
- **A shop operator who closes a browser notification cannot find it again.** The console shows notifications only
  as they arrive.
- **"Out for delivery" is never sent.** The words exist, but nothing sends them, so customers hear "packed" and then
  "delivered" with nothing in between, at the moment they most want to know.
- **"Points about to expire" arrives by email only**, so an app-only shopper never sees it.

This feature gives each audience an inbox: a place to look back at everything they were told, with an unread count
that stays right without anyone refreshing. It also closes the two gaps above, so the inboxes fill with what customers
actually need.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A customer finds what they were told in the app (Priority: P1)

A shopper ordered this morning and dismissed the pushes without reading them. In the afternoon they see a bell with a
"3" on the Home screen. They tap it and see, newest first under **Today**: "Out for delivery", "Your order is packed",
"Order confirmed", each with an icon for its kind and a dot because they are unread. The bell's number goes away as soon
as the inbox opens. They tap "Out for delivery" and land on that order; when they come back, that item no longer has a
dot.

**Why this priority**: Customers are the largest audience and the ones who use the app most. Losing a notification
means a support contact or a worried customer. This is also what the empty Notifications screen promised.

**Independent Test**: As a customer, place an order and let it progress with push turned off on the phone. Open the
app, check the bell count, open the inbox, check every notification is there in order, tap one, and check it opens
the order and becomes read.

**Acceptance Scenarios**:

1. **Given** a customer has 3 notifications they have never seen, **When** they open Home, **Then** the bell shows 3.
2. **Given** the bell shows 3, **When** the customer opens the inbox, **Then** the bell shows nothing and the 3 items
   still show as unread.
3. **Given** an unread item that is about an order, **When** the customer taps it, **Then** that order opens and the
   item shows as read in the inbox, in the app and on the website.
4. **Given** notifications from today, yesterday and last week, **When** the inbox opens, **Then** they are grouped
   under Today, Yesterday and Earlier, newest first in each.
5. **Given** a customer who has never received a notification, **When** they open the inbox, **Then** they see a
   friendly empty state, never a blank screen or an error.
6. **Given** more notifications than fit on the screen, **When** the customer scrolls to the end, **Then** older ones
   keep loading until there are none left, and the end of the list is shown as the end.
7. **Given** a customer who is not signed in, **When** they tap the bell, **Then** they are asked to sign in and land in
   their inbox afterwards.

---

### User Story 2 - A shop operator keeps track in the console (Priority: P1)

A shop manager steps away from the counter for 20 minutes. When they come back, the bell in the console header shows
"4". They click it and a side panel lists: "New order", "Out of stock", "Refund waiting for approval" and "Product sent
back". They click "Refund waiting for approval" and the order queue opens. Later they use the full Notifications page
to filter to **Stock** and see every stock warning from the week.

**Why this priority**: Shops run on these notifications. Today a closed browser notification is gone, and an operator
who was away has no way to know what happened.

**Independent Test**: As a shop operator, cause several kinds of shop notification while the console is closed. Open
the console, check the bell count, open the panel, follow an item, then use the full page and its category filter.

**Acceptance Scenarios**:

1. **Given** 4 notifications the operator has not seen, **When** the console opens, **Then** the bell shows 4.
2. **Given** the bell shows 4, **When** the operator opens the side panel, **Then** the count clears and the latest
   items are listed with their category icons and unread markers.
3. **Given** the side panel is open, **When** the operator clicks an item, **Then** the page that item is about opens,
   the panel closes and the item becomes read.
4. **Given** the full Notifications page, **When** the operator filters by a category (Orders, Stock, Products,
   Announcements, Important) or by Unread, **Then** only matching items are listed, and the filter is kept in the
   page address so a reload or a shared link shows the same list.
5. **Given** an operator opens the Notifications page for the first time, **Then** its guided tour starts, like every
   other console page.
6. **Given** two operators at the same shop, **When** one reads or archives an item, **Then** the other operator's
   inbox is unchanged: the inbox is per person.

---

### User Story 3 - A driver sees their work even if they were not signed in (Priority: P1)

A driver gets a new phone. Two runs were assigned to them at 7 a.m. while they had no phone signed in. When they sign in
at 8 a.m., their inbox already holds both "Run assigned" notifications, and a notice pinned at the top says "You have 2
runs today". Tapping the notice opens Today.

**Why this priority**: A driver who misses an assignment means a late collection or a missed delivery window. This
exact failure happened in dev on 2026-11-07.

**Independent Test**: Assign work to a driver who has no phone signed in. Sign in on a phone. Check the inbox holds the
assignments, check the pinned notice and its count, and check it opens Today.

**Acceptance Scenarios**:

1. **Given** a driver with notifications, **When** they open the driver app, **Then** a bell shows how many they have
   not seen, and opening the inbox clears it.
2. **Given** a "Run assigned" item, **When** the driver taps it, **Then** that run opens (or Today, if the run is no
   longer theirs, as spec 109 decided).
3. **Given** work was assigned today while no phone of the driver's could be told, **When** the driver first signs in
   that day, **Then** they get one notice pinned to the top: "You have N runs today", where N is their runs for today,
   leading to Today.
4. **Given** the driver already got that notice today, **When** they sign in again or on another phone, **Then** no
   second notice is added.
5. **Given** a driver whose phone did receive the assignment pushes, **When** they sign in, **Then** no catch-up notice
   is added.
6. **Given** the driver inbox, **Then** it has All and Unread but no category filter.

---

### User Story 4 - Customers are told when their order is on its way (Priority: P2)

A customer's order leaves the hub with an Effy driver. Their phone shows "Out for delivery: Your order is on the way."
The same item appears in their inbox. They get it once, even though the order had parcels from two shops.

**Why this priority**: This is the notification customers most expect between "packed" and "delivered". It also fills
the inbox with something useful from day one.

**Independent Test**: Take an Effy-delivered order through to the van being loaded and check the customer gets one
"Out for delivery" by push and in the inbox. Take a courier order through to dispatch and check it does not.

**Acceptance Scenarios**:

1. **Given** an Effy-delivered order, **When** the first of its parcels leaves the hub with the driver, **Then** the
   customer is told "Out for delivery" once, and a tap opens the order.
2. **Given** the order's other parcels leave later, or the van is loaded again, **Then** no second "Out for delivery"
   is sent for that order.
3. **Given** a courier order, **When** it leaves with the courier, **Then** no "Out for delivery" is sent (the courier
   notifications already cover it).
4. **Given** a customer with no phone that can receive pushes, **Then** "Out for delivery" is still in their inbox.

---

### User Story 5 - The inbox stays tidy and current (Priority: P2)

A customer reads two items, archives an old one with a swipe, changes their mind and taps **Undo**. They tap **Mark all
read** and every dot disappears. While the inbox is open, a new notification arrives and appears at the top without
them doing anything. An offer that ended yesterday is no longer listed.

**Why this priority**: Without archive, mark all read and live updates the inbox becomes a pile people stop opening.
These are what every mainstream notification centre offers.

**Independent Test**: In any inbox, archive an item and undo it, archive another and leave it, mark all read, cause a
new notification while the inbox is open, and let an item pass its end time.

**Acceptance Scenarios**:

1. **Given** an item in the list, **When** the person archives it (swipe on a phone, an action on the web), **Then** it
   leaves the list at once and an Undo is offered for a few seconds.
2. **Given** Undo is offered, **When** the person taps it, **Then** the item returns to its place, as read or unread as
   it was.
3. **Given** unread items, **When** the person chooses Mark all read, **Then** every item in their inbox becomes read,
   including ones not yet scrolled to.
4. **Given** the inbox or any screen with the bell is open, **When** a new notification arrives for that person,
   **Then** the bell count and the open list update within a few seconds, with no manual refresh and no repeated
   checking on a timer.
5. **Given** an item with an end time, **Then** the list shows when it ends ("Ends Sun"), and once that time passes the
   item is no longer listed or counted.
6. **Given** an important item, **Then** it stays pinned above everything else until it is read or its pin ends, then
   takes its normal place by date.

---

### User Story 6 - Customers on the website have the same inbox (Priority: P2)

A shopper who only uses the website sees a bell with a count in the header. It opens their notifications in their
account area: the same items, the same grouping, the same filters, archive, undo and mark all read as the app.

**Why this priority**: The customer website and app are kept at parity, and a website-only shopper currently has no
notifications at all.

**Independent Test**: As a customer on the website, check the bell count, open the notifications page, follow an item,
archive and undo one, and check the same changes show in the app for the same account.

**Acceptance Scenarios**:

1. **Given** a signed-in customer on the website, **Then** the header shows a bell with their unseen count.
2. **Given** they open the notifications page, **Then** it shows the same items, grouping and filters as the app, and
   the count clears.
3. **Given** an item read or archived on the website, **When** the customer opens the app, **Then** it shows the same.
4. **Given** a guest on the website, **Then** no bell count is shown and the notifications page asks them to sign in.

---

### User Story 7 - The phone's app icon shows the count (Priority: P3)

A customer's app icon shows a "2" badge after two new notifications. When they open the inbox, the badge goes away.

**Why this priority**: Useful but secondary to the inbox itself. On iPhone it can only work once Effy's paid Apple
account lets the app receive pushes at all.

**Independent Test**: With the app closed, cause two notifications, check the icon badge, open the inbox, check the
badge clears.

**Acceptance Scenarios**:

1. **Given** N unseen notifications, **When** a push arrives, **Then** the customer and driver app icons show N where
   the phone supports a number, or a dot where it supports only a dot.
2. **Given** the person opens the inbox, **Then** the icon badge clears.

---

### User Story 8 - "Points about to expire" reaches app users (Priority: P3)

A customer whose points expire next week gets a push "Points expiring soon", not only an email. The item is in their
inbox under Points.

**Why this priority**: Small, but points left to expire are lost value and a common complaint.

**Independent Test**: Give a customer points that expire within the warning period and check they get a push and an
inbox item as well as the email, once.

**Acceptance Scenarios**:

1. **Given** a customer's points are about to expire, **When** the warning is due, **Then** they get it by push, in
   their inbox and by email, once for that expiry.
2. **Given** a tap on it, **Then** their points screen opens.

---

### Edge Cases

- **A tap on an item about something that no longer exists** (an order the customer can no longer see, a product
  removed): the fallback spec 109 defined applies (the nearest list, with a short note); the item is still marked read.
- **An item with no destination**: tapping it opens a detail view with its full title and text, and marks it read.
- **Archived, then the same event happens again**: a repeat of the same event never adds a second item (spec 109), so
  an archived item stays archived.
- **The inbox is open on two devices**: a read, archive or mark-all on one shows on the other through the live update.
- **The live update is missed** (phone asleep, connection dropped): the inbox and count are read again when the app
  comes back to the front, so they are never stale for long.
- **Undo after the item has expired or been removed by retention**: Undo does nothing harmful; the item simply does not
  come back.
- **Mark all read while new items arrive**: items that arrive after the person chose Mark all read stay unread.
- **A filter with no matching items**: shows an empty state for that filter with a way back to All, not the
  first-use empty state.
- **Customer categories**: only categories the customer has items in are offered as filters, so a new customer is not
  shown Offers or News chips before spec 3 sends any.
- **A driver with no runs today signs in**: no catch-up notice.
- **A driver whose runs are taken off them before they sign in**: the notice counts only runs that are still theirs
  when they sign in; with none left, no notice.
- **Very old items**: items removed by retention (customers after 180 days, drivers and shops after 90) are simply no
  longer listed.
- **A closed customer account**: its inbox is gone with it (spec 109).
- **Someone signed in as a different audience**: a shop sign-in cannot read a customer's or driver's inbox, and the
  other way round; asking for another person's item answers as if it does not exist.

## Requirements *(mandatory)*

### Functional Requirements

**The inbox (all audiences)**

- **FR-001**: Customers (app and website), drivers (app) and shop operators (console) MUST each have an inbox listing
  their own notifications from spec 109's record, newest first, grouped under Today, Yesterday and Earlier on Effy's
  clock.
- **FR-002**: Each item MUST show its title, its text (shortened in the list, in full in the detail view), how long ago
  it arrived, an icon for its category, and a marker while it is unread.
- **FR-003**: Important items MUST be pinned above all others until the person reads them or their pin end passes.
- **FR-004**: Items past their end time MUST NOT be listed or counted. Items with an end time MUST show it in words
  ("Ends Sun", "Ends 5 pm").
- **FR-005**: Archived items MUST NOT be listed or counted.
- **FR-006**: The list MUST load older items as the person scrolls, without limit, until there are no more, and show
  the end of the list.
- **FR-007**: Every inbox MUST offer All and Unread. Customer and shop inboxes MUST also offer a category filter;
  customers see only categories they have items in; shops see Orders, Stock, Products, Announcements and Important.
  The driver inbox MUST NOT have a category filter.
- **FR-008**: On the shop console's full page and the customer website's page, the chosen filter MUST be kept in the
  page address.
- **FR-009**: Loading MUST show the inbox's own shape (rows with placeholders), never a single grey block or the word
  "Loading". Empty inboxes and empty filters MUST each have their own friendly message.

**Seen, read and counts**

- **FR-010**: Each audience MUST have a bell showing the number of items the person has not yet seen. When the person
  opens their inbox, every item up to that moment MUST become seen and the count MUST clear.
- **FR-011**: Seen and read MUST be separate: opening the inbox does not make items read.
- **FR-012**: Tapping or clicking an item MUST mark it read and then open the place its destination names, using spec
  109's routing (held through sign-in, with its fallback when the thing is gone).
- **FR-013**: An item with no destination MUST open a detail view with its full text, and mark it read.
- **FR-014**: Mark all read MUST make every item in the person's inbox read, including items not yet loaded, and leave
  items that arrive afterwards unread.
- **FR-015**: A read, archive, undo or mark-all MUST show on every device and surface the person uses (app and website
  for a customer).

**Archive**

- **FR-016**: A person MUST be able to archive any of their items: by swiping on a phone, and by an action on the web.
- **FR-017**: Archiving MUST offer Undo for a few seconds; Undo MUST restore the item as it was (read or unread).

**Live updates**

- **FR-018**: When a notification is created for a person, every open screen of theirs showing the bell or the inbox
  MUST update within a few seconds, through the existing live-update channel, with no timed refreshing.
- **FR-019**: The live update MUST go only to that person and MUST carry only the fact that their inbox changed,
  nothing of its content.
- **FR-020**: When an app or browser tab comes back after being away, it MUST read the count (and the inbox, if open)
  once.

**Where each inbox lives**

- **FR-021**: Customer app: a bell on Home opens the inbox; the Account screen's Notifications entry opens the same
  inbox. The old always-empty Notifications screen MUST be removed. A guest tapping the bell is asked to sign in and
  then lands in the inbox.
- **FR-022**: Customer website: a bell with the count in the header for a signed-in customer, opening a notifications
  page in the account area. Guests see no count. The page MUST offer everything the app does except swipe.
- **FR-023**: Driver app: a bell with the count, placed where the design decides (on Today or Account), opening the
  inbox.
- **FR-024**: Shop console: a bell with the count in the console header opening a side panel with the latest items and
  a link to a full Notifications page. The full page MUST have a guided tour, like every console page.
- **FR-025**: The customer app MUST use sheets, not centred dialogs, for anything the inbox opens over the screen
  (customer app rule).

**App icon badge**

- **FR-026**: Each push to a customer or driver MUST carry the person's unseen count, so the app icon shows it; opening
  the inbox MUST clear the icon badge. Where the phone shows only a dot, a dot is enough.

**Privacy and access**

- **FR-027**: A person MUST only ever be able to list, count, read or archive their own notifications. Asking for
  someone else's item MUST answer as though it does not exist.
- **FR-028**: A sign-in for one audience MUST NOT be able to reach another audience's inbox.

**New and changed notifications**

- **FR-029**: When the first parcel of an Effy-delivered order leaves the hub with a driver, the customer MUST be told
  "Out for delivery" once for that order, leading to the order. Courier orders MUST NOT get it.
- **FR-030**: "Points about to expire" MUST also be sent as a push (as well as email), once per expiry, leading to the
  points screen.
- **FR-031**: When a driver signs in for the first time on a given day and that day's work was assigned to them while
  no phone of theirs could be told, they MUST get one notice pinned to the top of their inbox: "You have N runs today"
  (N = their runs still theirs for today), leading to Today. At most one such notice per driver per day.

**Measurement**

- **FR-032**: Opening the inbox, opening an item from it, archiving, undoing and marking all read MUST each be recorded
  in product analytics with the notification's kind and category, and no personal details.

### Key Entities

- **Notification** (from spec 109): one thing a person was told, with its words, category, importance, destination,
  and when it was created, seen, read, archived and when it ends. This feature adds **when its pin ends** (for
  important items) and reads all the rest.
- **Inbox**: one person's notifications in one audience, excluding archived and ended ones, newest first with pinned
  items on top.
- **Unseen count**: how many of a person's listed notifications arrived after they last opened their inbox.
- **Catch-up notice**: a driver's pinned "You have N runs today", one per driver per day.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of notifications created for a person appear in that person's inbox, whether or not a push or email
  reached them.
- **SC-002**: The bell count matches the number of unseen, listed items in 100% of checks, on every surface, after
  opening the inbox, reading, archiving and marking all read.
- **SC-003**: A new notification shows in an open inbox and on the bell within 5 seconds, with no screen checking for
  changes on a timer.
- **SC-004**: The inbox's first screen of items shows within 2 seconds on a typical phone connection, and each further
  page within 1 second.
- **SC-005**: Scrolling a person's full history of 1,000 notifications loses or repeats no item.
- **SC-006**: Every Effy-delivered order that leaves the hub produces exactly one "Out for delivery" for its customer;
  no courier order produces one.
- **SC-007**: A driver assigned work with no phone signed in sees it within 1 minute of signing in.
- **SC-008**: No person can see, count, read or archive another person's notification (checked for every audience
  pair and every inbox action).
- **SC-009**: Customers' support contacts asking "did my order go out?" fall, measured over the first month after
  release against the month before.

## Assumptions

- **Built on spec 109.** The lasting record, its categories, words, destinations, read action and routing already exist
  and are deployed in dev. This feature adds the inbox screens, the list, count, seen, mark-all and archive actions, the
  pin end, and the three notification changes.
- **No new kinds of item for customers yet.** Offers, news, important and support items arrive with specs 3 and 4; the
  customer category filter shows only categories that have items, so it starts with Orders and Points.
- **"Leaves the hub"** means the moment the driver confirms the van is loaded and the order's parcels move to "Out for
  delivery" (one of the nine package status words). If some of an order's parcels are held back, the customer is still
  told once; anything held is handled by the existing delivery-change process.
- **"No phone could be told"** means the driver had no phone signed in to receive pushes when the work was assigned, so
  the push was skipped.
- **The catch-up notice is per Effy day** (operating time zone), counting both collection and delivery runs.
- **Undo lasts about 5 seconds**, as in common mobile apps.
- **The side panel in the console** shows the latest 20 or so items, with the full page for everything else and the
  filters.
- **The app icon badge on iPhone** follows when iPhone pushes start working (paid Apple account, outside this spec);
  Android works now.
- **Retention is unchanged**: customers 180 days, drivers and shops 90 days.
- **Shop push settings stay per device** (059); the inbox is per person.
- **The design** of each inbox follows each surface's existing identity (customer storefront look in the customer app
  and website, the driver app's look, the console look) and its loading-shape and no-card rules.

## Dependencies

- Spec 109 deployed (done in dev, 2026-11-08) and, for a clean record, its Stage B.
- The live-update channel (071) for the new "inbox" kind.
- The guided tour rules (106) for the console's Notifications page.

## Guided tour: shop console Notifications page

The page's tour, word for word (it also goes in 106's Tour Inventory, which the tour test reads):

**Notifications** (starts on the first visit to the Notifications page)

1. **Everything you were told**: "Every notification for you is kept here for 90 days, even ones you closed or missed. The newest is at the top."
2. **Find what you need**: "Show everything or only what you haven't read, and narrow it to orders, stock, products, announcements or important notices."
3. **Go straight there** (when there are notifications): "Click a notification to open what it's about. It's then marked read."
4. **Catch up in one click** (when something is unread): "Mark everything read once you've dealt with it, or archive a notification to take it off the list."

## Out of scope

- Turning categories or channels on and off, quiet hours, and marketing consent, including asking customers to opt in
  to offers (spec 3).
- Staff writing and sending messages, targeting and reports (spec 4).
- Snooze, a back-office staff inbox, web push on the customer website, links in emails that open the app.

# Feature Specification: Reaching the Right Place

**Feature Branch**: `116-links-badges-urgency`
**Created**: 2026-11-12
**Status**: Draft
**Input**: User description: "116 Reaching the right place - completes docs/notifications-backlog.md (the last open items B7, C6,
D7). B7: Effy links in emails and texts open the customer app on the matching screen when it is installed, and the website
otherwise. C6: the app icon badge on the customer and driver apps equals the person's unseen inbox count. D7: on iOS, an
important notification breaks through Focus as time-sensitive; marketing is never time-sensitive. Android now; the iOS parts
built and switched off until the paid Apple account exists, with the operator steps to switch them on."

## Background

This is the last spec of the notifications programme (`docs/notifications-backlog.md`). Specs 109–115 built:
- the lasting notification and the closed list of places a tap may open (109);
- the inboxes, their bells and the first icon badge (110);
- the shopper's choices and consent (111);
- back-office messages (112);
- email as a channel, automatic messages and the first name (115).

Three backlog items are still open:
- **B7 - Effy links open the app.** Today, a link to Effy in an email (an order receipt, a message by email) always opens
  the website, even on a phone that has the Effy app.
- **C6 - The icon badge is always right.** 110 puts the unseen count on each push and clears it when the inbox is opened.
  But the number goes stale when the person reads their inbox somewhere else (the website, another phone), or when items
  leave the inbox, until the next push arrives.
- **D7 - Urgency matches importance on iPhones.** An important notice (a delivery problem, a safety message) should reach a
  shopper or driver through Focus. An offer should arrive quietly. iPhones need this said per notification. Android already
  does it through its categories (111).

Effy cannot yet use the paid Apple developer account. Anything that needs it is built, tested as far as possible, and switched
off, with the steps written down for the day it is paid for. Android ships fully now.

Decisions already taken (2026-11-12): web push (F8) is not being done; C8 and C9 are closed as not needed; disputes are
spec 117.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An Effy link opens the app on the right screen (Priority: P1)

A shopper with the Effy app gets an email from Effy: their order receipt, or an offer. They tap "View your order" or
"Shop the offer". The app opens straight on that order or that offer, not on the website. On a phone without the app, or on
a computer, the same link opens the website on the same page, as it does today.

**Why this priority**: emails (115) and order receipts are where most links to Effy now come from. Opening the app is where
the shopper is signed in and where Effy wants them to shop. It is also the largest of the three items.

**Independent Test**: on an Android phone with the customer app, tap an order link and an offers link from a real Effy
email. Each opens the app on that screen. Remove the app and tap the same links: each opens the same page on the website.

**Acceptance Scenarios**:

1. **Given** the app is installed, **When** the shopper taps a link to one of Effy's shopper pages (their orders, one order,
   their points, a product, an aisle, a search, the offers page, the home page), **Then** the app opens on that screen.
2. **Given** the app is not installed, or it is a computer, **When** the same link is tapped, **Then** the website opens on
   the same page.
3. **Given** the shopper is signed out in the app, **When** a link to their own order or points opens the app, **Then** they
   are asked to sign in and then land on that screen. This is the same rule a notification tap follows (109).
4. **Given** a link to an order that is not theirs, or to a product that is gone, **When** it opens the app, **Then** the
   app shows its usual "not found" or "no longer available" screen. It never crashes, and never shows someone else's order.
5. **Given** a link to an Effy page the app does not have (help, legal pages, delete account, the email unsubscribe page),
   **When** it is tapped on a phone with the app, **Then** it opens the website, as today.
6. **Given** a link carries extra marks (campaign tags, a message reference), **When** it opens the app, **Then** the app still
   opens the right screen, and the opening is recorded by page kind only.

---

### User Story 2 - The app icon shows exactly how many new items there are (Priority: P2)

A shopper sees "3" on the Effy app icon after three new inbox items. They open their inbox on the website. Within a couple
of minutes, the icon on their phone shows nothing, without them opening the app. A driver's icon behaves the same way for their own
inbox.

**Why this priority**: a wrong number teaches people to ignore the badge. 110 got it right on arrival; this keeps it right
after the inbox changes anywhere else.

**Independent Test**: get three new items on a phone (badge 3). Open the inbox on the website, or on a second phone: the first
phone's badge goes to 0 within two minutes. Archive an unseen item on the website: the badge drops by one.

**Acceptance Scenarios**:

1. **Given** three unseen items, **When** the person opens their inbox anywhere (that app, another phone, the website),
   **Then** every one of their phones shows no badge within two minutes.
2. **Given** a badge of 3, **When** one unseen item is archived, withdrawn (112) or expires, **Then** the badge shows 2 within
   two minutes.
3. **Given** the app is open, **When** the inbox count changes, **Then** the icon badge matches the count the app shows, with
   no push needed.
4. **Given** the person has turned notifications off on that phone, **When** the count changes, **Then** nothing is shown or
   sounded. Correcting the badge never makes a phone buzz or light up.
5. **Given** a person signs out of the app, **When** they are signed out, **Then** the badge clears and stays clear for that
   phone until someone signs in.

---

### User Story 3 - Important notices break through; offers arrive quietly (Priority: P3)

A shopper has a Focus mode on during work. A delivery problem notice from Effy, marked important, still appears. A weekly
offer does not interrupt them: it waits in their notification list. A driver's important notice ("the hub is closed")
reaches them the same way.

**Why this priority**: it matters, but it only works on iPhones once the paid Apple account exists. Android already behaves
this way through its categories.

**Independent Test**: on Android, check that important, ordinary and marketing notifications already use their categories'
urgency (111). For iPhones, a sender test shows that each notification Effy sends carries the urgency of its importance and
category, and that with the switch off nothing asks for more than an ordinary notification.

**Acceptance Scenarios**:

1. **Given** an important notification (a system one, or an important message from back-office), **When** it is sent to an
   iPhone with the switch on, **Then** it is marked time-sensitive and can break through Focus.
2. **Given** an offer or news notification, **When** it is sent to an iPhone, **Then** it is marked to arrive quietly: no
   sound and no lighting up, kept in the list.
3. **Given** any other notification (an order update, points, support), **When** it is sent, **Then** it arrives as an ordinary
   notification.
4. **Given** the switch is off (before the paid Apple account), **When** an important notification is sent, **Then** it arrives
   as an ordinary notification and nothing fails.
5. **Given** any notification, **When** it is sent, **Then** it is never marked "critical" (the level that ignores silent mode).
   That level is for health and safety apps, needs Apple's special approval, and Effy does not use it.

---

### Edge Cases

- A link to an order whose shopper is signed in as someone else in the app: the app shows "not found", the same as a wrong
  order today, and never switches accounts by itself.
- An old email whose link points at a page that has since been renamed on the website: the link is no longer one the app
  claims, so it opens the website, whose redirect lands the person on the page.
- A link with a search containing unusual characters: the app opens the search with exactly the words the website would show.
- A link tapped inside an email app's own built-in browser: phones do not always hand these links to the app. The website
  page then opens and works as today. That is accepted, not a failure.
- Two phones signed in to the same account, one offline for a day: when it comes back, its badge is corrected on its next
  check-in. A stale number is never shown for longer than it takes the phone to be told.
- The badge correction for a phone that has been uninstalled: the delivery fails and that phone's registration is dropped,
  as for any push (050).
- Many inbox changes in a minute (mark all read, then archive): one correction carries the final count. Phones are never sent
  a burst of badge updates.
- Quiet hours (111): a badge correction is silent, so it is not held to 08:00.
- A new item whose phone notification is not sent at once (its category's push is off, the daily limit, or held to 08:00):
  the item still raises the count, so a badge correction is sent for it.
- An Android phone in deep sleep (Doze): a silent correction can wait until the phone next wakes. That is accepted; the
  badge is right as soon as it does.
- A shopper with notifications off on the phone: the badge correction is still sent where the phone allows a silent number. Where it
  does not, nothing is shown.

## Requirements *(mandatory)*

### Functional Requirements

**Links open the app (B7)**

- **FR-001**: A link to one of Effy's shopper pages MUST open the customer app on the matching screen when the app is
  installed, and the website on the same page otherwise. The shopper pages are the ones a notification can open: home, orders,
  one order, points, a product, an aisle, a search, the offers page.
- **FR-002**: The app MUST open each of those pages with the same meaning as the website: the same order, product, aisle or
  search words. Any page outside that list MUST keep opening the website.
- **FR-003**: Links that must stay on the website MUST never open the app: the email unsubscribe page (115), help and legal
  pages, delete account, password reset and sign-in links.
- **FR-004**: A link to a signed-in screen opened while signed out MUST be held through sign-in and then followed, exactly as
  a notification tap is (109).
- **FR-005**: A link the app cannot show (a missing product, another person's order, an unknown page) MUST land on the app's
  usual not-found or home screen. It never crashes and never errors.
- **FR-006**: Opening the app from a link MUST be recorded in product analytics with the page kind only. No message, campaign
  or personal detail is recorded (Principle VII).
- **FR-007**: Every link Effy writes in its emails (order emails, message emails) MUST be a link of the kind FR-001 names when
  it points at a shopper page, so the same link works for both.
- **FR-008**: Where a phone does not hand a link to the app (for example inside an email app's own browser), the website page
  MUST open and work exactly as today.
- **FR-009**: Links MUST open the app on Android now. On iPhones it MUST be ready and switched off until the paid Apple account
  exists. Until then, iPhone links open the website.
- **FR-010**: Only Effy's customer app MAY open Effy's links. A link's ownership is published by the website for the app's
  own signing identity, and that identity is supplied by the operator, never guessed.

**The badge is always right (C6)**

- **FR-011**: The app icon badge MUST follow the person's unseen inbox count for that app's audience (110's count):
  - on iPhones the icon shows that number;
  - on Android, where the launcher counts the notifications on screen and no number can be set, the Effy notifications still
    shown MUST be exactly the pushed items that are still unseen, and none when the count is 0.
- **FR-012**: When the count changes anywhere other than on that phone (the inbox opened on another device or the website,
  an item archived, withdrawn or expired, mark all read, or a new item whose push did not go out at once), every phone signed
  in as that person MUST show the new count within two minutes while the phone is awake.
- **FR-013**: A badge correction MUST be silent: no sound, no banner, no vibration, no inbox item, and it is never held by quiet
  hours.
- **FR-014**: Corrections for one person MUST be combined, so a burst of changes sends one correction carrying the final count.
- **FR-015**: While the app is open, the badge MUST follow the count the app shows, with no push (FR-011's rule per platform).
- **FR-016**: Signing out MUST clear the badge on that phone.
- **FR-017**: Badge corrections MUST work on Android now. On iPhones they MUST be ready and take effect when push delivery to
  iPhones does (the paid Apple account).

**Urgency by importance on iPhones (D7)**

- **FR-018**: Every notification sent to an iPhone MUST carry an urgency from its importance and category:
  - important → time-sensitive (importance wins over category);
  - offers and news → quiet;
  - everything else → ordinary.
- **FR-019**: A notification MUST NEVER be marked critical.
- **FR-020**: The time-sensitive level MUST be switchable: while off, important notifications are sent as ordinary ones. It is
  off until the paid Apple account exists and the app has permission for it.
- **FR-021**: The Android equivalent MUST stay as 111 set it (each category's channel and its importance), and is confirmed by
  test, not changed.

**Switching on the iPhone parts**

- **FR-022**: Every iPhone part of this spec (links, time-sensitive) MUST be off by a single setting per environment, and
  switching it on MUST NOT need a code change beyond the steps written for the paid account.
- **FR-023**: The operator steps to switch them on MUST be written in the existing "after paying" checklist, in order, with what to
  check after each step.

### Key Entities

- **Effy link**: a website address for a shopper page that the app can also open. Defined by the page kind and its details
  (an order, a product, an aisle, search words), the same list a notification destination uses.
- **Link ownership statement**: what the website publishes so phones know the Effy app may open its links. It names the app
  and its signing identity, and only the pages of FR-001.
- **Badge correction**: a silent message to a person's phones carrying only their new unseen count.
- **Urgency**: per notification, one of ordinary, quiet or time-sensitive, from its importance and category.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On Android with the app installed, 8 of 8 shopper page kinds open the app on the matching screen from an email
  link, and 0 of the excluded pages (FR-003) do.
- **SC-002**: With the app removed, the same links open the same website pages, with no difference from today.
- **SC-003**: After the inbox is opened on the website, every one of the person's awake Android phones shows the right badge
  within two minutes in 10 of 10 tries.
- **SC-004**: A burst of 20 inbox changes in one minute causes at most 2 badge corrections per phone, and none makes a sound or
  shows a banner.
- **SC-005**: A sender test shows 100% of iPhone notifications carry the urgency FR-018 gives them, and 0 are marked critical.
- **SC-006**: With the iPhone switch off, 0 notifications ask for time-sensitive delivery and 0 sends fail because of this
  feature.
- **SC-007**: After the paid account, the operator switches on the iPhone parts following the written steps alone, with no
  code change beyond those steps (FR-022).

## Assumptions

- The pages a link may open are 109's customer destinations, and the website paths the inbox already uses for them (110). No
  new destination is added.
- Driver and shop links are out of scope: drivers and shop staff are not sent emails that link into their apps. The shop
  console is a website.
- Effy sends no text messages today. "Texts" means any Effy link a person shares or receives (a text, a chat), which works the
  same way.
- The app's signing identity for Android (the fingerprint of the key that signs the app) and the Apple team identity are
  supplied by the operator. Until they are, the link ownership statement is not published, and links open the website.
- The badge corrections reuse the existing push path and its registrations (050, 109). There is no new channel.
- The existing night hold (111) applies to marketing notifications only. Badge corrections are not notifications and have no
  inbox item.
- The shop console's badge (the installed console, 110) already follows the count live and is not changed.

## Out of Scope

- Web push (F8, not doing).
- Links that open the driver app or the shop console.
- A "get the app" or "open in the app" banner on the website (the website cannot tell whether the app is installed).
- Changing any notification's words, categories, or Android channels.
- Critical alerts.

## Dependencies

- 109 Notification Record & Destinations (the closed list, held through sign-in).
- 110 Notification Inboxes (the unseen count, the first badge).
- 111 Notification Preferences (categories, Android channels, quiet hours).
- 115 Messages That Do More (message emails and their links).
- The paid Apple Developer account, for the iPhone parts (`docs/observability-apple-blockers.md`).

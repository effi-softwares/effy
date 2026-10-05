# Feature Specification: Live Updates on Every Surface

**Feature Branch**: `071-live-updates`

**Created**: 2026-10-05

**Status**: Draft

**Input**: User description: "Live updates on every surface, without polling. Each screen that shows changing data today re-reads on a timer or does not update until the person refreshes. The operator wants live updates on all six surfaces, with no polling, not dependent on push notifications, a content-free 'something changed' signal the moment a change is committed, catch-up on reconnect instead of a timer, running cost near zero and under 5 USD a month with no always-on compute, and each audience told only about its own things."

## Background

Screens that show things other people change — a shop's incoming orders, a customer's order
progress, a driver's assigned work — are only as good as how soon they notice a change.

Today they notice in one of two ways. Some **re-read on a timer**: the shop console's Today screen
every 30 seconds, its order queue every 15, shop mobile's queue on its own interval, back-office's
drivers and delivery-slot screens every 30. The rest **do not notice at all** until the person
refreshes: a customer's order page, a driver's work list, back-office's order console.

Feature 058 once gave the shop console updates within ten seconds, over a connection held open by
a standing server. Feature 070 retired that server to stop paying for it around the clock, and the
promise was withdrawn with it. This feature brings live updates back — to every surface, not one —
without bringing back anything that runs all the time.

The operator has settled the shape of it:

- **No polling.** No screen refreshes on a timer.
- **Independent of push notifications.** A notification can be undelivered, delayed, or switched
  off on the device. A new order must still appear on an open screen without one.
- **Tell, don't send.** The platform tells an open app that something it is showing has changed; the
  app then reads the current state the way it always has. The message says *that* something
  changed, never *what*.
- **Catch up, don't tick.** An app that was disconnected, in the background or asleep reads once
  when it comes back, rather than on a schedule while it was away.
- **Near-zero running cost**, with nothing that runs when nobody is using it.
- **Each audience hears only about its own things.**

## Clarifications

### Session 2026-10-05

- Q: Should this replace polling, or sit beside it as the fast path? → A: Replace it. No screen may
  refresh on a timer.
- Q: May it rely on push notifications to trigger a refresh? → A: No. It is a separate channel and
  must work with notifications off, undelivered or late.
- Q: Which surfaces? → A: All six — customer web and mobile, shop web and mobile, driver mobile,
  back-office.
- Q: What does it cost to run? → A: Near zero at current scale, never above 5 USD a month without
  the operator being told first, and nothing always-on.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A shop sees a new order the moment it is paid (Priority: P1)

A shop has its console open on a bench tablet, or the shop app open on a phone. A customer pays.
The order appears in the shop's list by itself, within a few seconds, without anyone touching the
screen and whether or not that device has notifications switched on.

**Why this priority**: This is the behaviour the platform had and lost, and the one the operator
asked for by name. A shop that learns of an order half a minute late, or only when someone thinks
to look, starts every order behind. It is also the smallest complete slice: one audience, one
change, both of its surfaces.

**Independent Test**: With a shop console open and its notifications switched off, pay for an
order containing that shop's product. The order appears on the open screen within five seconds.

**Acceptance Scenarios**:

1. **Given** a shop console open on Today, **When** a customer's payment for an order containing
   that shop's goods completes, **Then** the order appears in Live orders and the pick backlog
   updates, within five seconds, with no action by the operator.
2. **Given** the same on the shop mobile app's order queue, **When** the payment completes,
   **Then** the order appears in the queue within five seconds.
3. **Given** a device where notifications are denied or switched off, **When** an order is paid,
   **Then** the order still appears on the open screen within five seconds.
4. **Given** two shops, **When** an order is paid that involves only the first, **Then** nothing
   refreshes on the second shop's screens.
5. **Given** a console left open and untouched for an hour with no orders, **When** that hour is
   examined, **Then** the console made no repeated requests for the list while nothing changed.

---

### User Story 2 - A screen that was away catches up when it comes back (Priority: P1)

A tablet goes to sleep, a phone app is put in the background, a connection drops in the storeroom.
When the screen comes back, it shows the current state straight away — every order that arrived
while it was away — and carries on live from there.

**Why this priority**: Without a timer, this is the only thing that makes the first story safe.
A live signal that is missed must not leave a screen showing a past that looks like the present. It
ships with Story 1 or Story 1 is not trustworthy.

**Independent Test**: Open a shop console, take the device offline, pay for two orders, bring the
device back online. Both orders are on screen within five seconds of the connection returning,
without the operator doing anything.

**Acceptance Scenarios**:

1. **Given** an open screen whose connection drops, **When** the connection returns, **Then** the
   screen reads the current state once and shows everything that changed while it was away.
2. **Given** a screen in a background tab or a backgrounded app, **When** it returns to the
   foreground, **Then** it reads the current state once.
3. **Given** a screen that cannot currently receive live updates, **When** the person looks at it,
   **Then** it says so plainly and says how old what they are reading is — it never looks live when
   it is not.
4. **Given** a screen that cannot receive live updates, **When** the person asks it to refresh,
   **Then** it reads the current state, so the screen is never unusable.
5. **Given** a connection that drops and returns repeatedly, **When** that happens, **Then** the
   screen reads once per return, not continuously.

---

### User Story 3 - A shop sees everything else that changes under it (Priority: P2)

Beyond new orders, a shop's screens change when a colleague picks an item, when an order is
cancelled or refunded, when stock runs out, and when something needs attention. Each of those shows
up on the open screens of that shop without a refresh.

**Why this priority**: These are the changes that today make two people in one shop work from
different pictures — one picking an order the other has just seen cancelled. They build directly on
Story 1 and remove the last timers from the shop surfaces.

**Independent Test**: With the same order open on two devices in one shop, mark an item picked on
one. The other shows it within five seconds.

**Acceptance Scenarios**:

1. **Given** an order open on two devices in one shop, **When** a colleague records pick progress
   on one, **Then** the other shows it within five seconds.
2. **Given** an order in a shop's queue, **When** it is cancelled or refunded — by the customer,
   by back-office, or by the shop's own manager — **Then** every open screen of that shop reflects
   it within five seconds.
3. **Given** a product that sells out or falls below its low-stock level, **When** that happens,
   **Then** the shop's attention list shows it within five seconds.
4. **Given** the shop console's order queue, order detail and Today screens, **When** this story
   is complete, **Then** none of them refreshes on a timer.

---

### User Story 4 - A customer watches their own order move (Priority: P2)

A customer has their order page open, on the web or in the app. As the order is packed, sent and
delivered — or cancelled, or refunded — the page changes by itself.

**Why this priority**: A customer's order page does not update at all today; they refresh, or they
assume. It is the surface where a stale answer generates a support contact. It is independent of
the shop stories and proves the second audience.

**Independent Test**: With a customer's order page open, advance that order's fulfilment in the
shop console. The customer's progress wording changes within five seconds, without a refresh.

**Acceptance Scenarios**:

1. **Given** a customer's order page is open, **When** the order's progress changes, **Then** the
   page shows the new progress within five seconds.
2. **Given** the same, **When** the order is cancelled or a refund is issued or settles, **Then**
   the page shows it within five seconds.
3. **Given** a customer's order list is open, **When** one of their orders changes, **Then** the
   list reflects it.
4. **Given** two customers, **When** the first customer's order changes, **Then** nothing
   refreshes for the second.
5. **Given** an order fulfilled by more than one shop, **When** one shop's part changes without
   changing what the customer is shown, **Then** the customer's page gives no sign that anything
   happened.

---

### User Story 5 - A driver's work changes in their hand (Priority: P2)

A driver has the app open. Dispatch assigns them a collection, moves a drop to another driver, or
withdraws work because an order was cancelled. Their list changes by itself.

**Why this priority**: A driver acting on a list that changed five minutes ago drives to a shop for
a package that has been reassigned. Today the app learns only when the driver reopens a screen.

**Independent Test**: With a driver's work list open, assign that driver a new task from the
back-office dispatch console. It appears in the driver's list within five seconds.

**Acceptance Scenarios**:

1. **Given** a driver's work list is open, **When** work is assigned to them, **Then** it appears
   within five seconds.
2. **Given** the same, **When** a task is reassigned to someone else or withdrawn, **Then** it
   leaves their list within five seconds.
3. **Given** a driver who is part-way through recording a collection or a delivery, **When** a
   live update arrives, **Then** what they have entered and where they are on the screen are
   kept.
4. **Given** a driver with no signal, **When** signal returns, **Then** their list is brought up
   to date (Story 2) and anything they recorded offline is still sent.
5. **Given** two drivers, **When** work changes for the first, **Then** nothing refreshes for the
   second.

---

### User Story 6 - Back-office watches operations without refreshing (Priority: P3)

Back-office staff have the orders console, the dispatch console, the drivers list, delivery-slot
load or the product review queue open. Each stays current by itself.

**Why this priority**: Staff screens are used by few people, deliberately and for short periods,
and a refresh is a small cost to them. It is last because it is the least painful today — but it
removes the remaining timers, and dispatch in particular is managing the same work the drivers in
Story 5 are being told about.

**Independent Test**: With the dispatch console open, have a driver check a package in at the hub.
The console shows it within five seconds.

**Acceptance Scenarios**:

1. **Given** the orders console is open, **When** an order is paid, cancelled, refunded or
   progresses, **Then** the list and an open order reflect it within five seconds.
2. **Given** the dispatch console or drivers list is open, **When** work is assigned, collected,
   checked in or delivered, or a driver goes on or off duty, **Then** the screen reflects it within
   five seconds.
3. **Given** the delivery-slot screen is open, **When** a place in a slot is held, confirmed or
   released, **Then** the slot's load updates within five seconds.
4. **Given** the product review queue is open, **When** a shop submits a product or a colleague
   decides one, **Then** the queue reflects it within five seconds.
5. **Given** every back-office screen, **When** this story is complete, **Then** none of them
   refreshes on a timer.

---

### Edge Cases

- **A burst.** Twenty orders are paid in one minute, or one pick records twenty lines. The screen
  must end up correct without re-reading twenty times in a row.
- **A change the person made themselves.** They pick an item; their own screen already shows it.
  The update about their own action must not make the screen flicker, lose their place or undo
  what they are typing.
- **A change that is undone.** A change that did not actually take effect must never be announced.
- **A missed update.** Any single update may be lost. The screen must still become correct at the
  next update, the next return to the foreground, or the next reconnect — never stay wrong
  silently.
- **Someone whose access ends.** A shop staff member is disabled or moved to another shop, a driver
  is suspended, a customer's account is barred or closed. They must stop being told about things
  they may no longer see, promptly, even if their screen stays open.
- **Sign-out and shared devices.** After sign-out, a device must receive nothing more for the
  account that was signed in.
- **A guest.** A customer who is not signed in has no order to watch; nothing is offered and
  nothing is attempted.
- **The live channel itself is unavailable.** Every screen must remain fully usable by reading on
  open, on return and on request (Story 2). Being unable to update live is never an error page.
- **Several windows.** The same person has the same screen open in three tabs or on two devices.
  All are updated; none is starved.
- **A long-open screen.** A tablet is left open for a full trading day. It must still be receiving
  updates at the end of it.
- **The environment is paused.** In a non-production environment the database may be stopped to
  save money. Screens must say they cannot update, not spin.

## Requirements *(mandatory)*

### Functional Requirements

**The live channel**

- **FR-001**: The platform MUST tell an open, signed-in app when something that app is showing has
  changed, without the app asking.
- **FR-002**: An update MUST say only *that* something changed and, at most, what kind of thing. It
  MUST NOT carry any business information — no order contents, no amounts, no names, no addresses,
  no statuses. The app obtains the current state by reading it the way it already does.
- **FR-003**: Because an update carries no information, receiving it twice, late, or out of order
  MUST NOT be able to make a screen show anything incorrect.
- **FR-004**: An update MUST be sent only for a change that has actually taken effect. A change
  that fails or is undone MUST NOT be announced.
- **FR-005**: An update MUST be sent promptly after the change takes effect, such that the
  freshness target in SC-001 is met.
- **FR-006**: Failing to send an update MUST NOT cause the change itself to fail, be delayed, or be
  reported as failed to the person who made it. A payment, a pick, a refund or an assignment
  succeeds regardless.
- **FR-007**: The live channel MUST work independently of push notifications. It MUST deliver with
  notifications denied, disabled, undelivered or delayed, and nothing in it may depend on a
  notification arriving.
- **FR-008**: Existing push notifications MUST continue to behave exactly as they do now.

**No timers**

- **FR-009**: No screen on any surface MAY refresh its data on a repeating timer. Every existing
  timed refresh of data MUST be removed.
- **FR-010**: A screen MUST read the current state when it is opened, when it returns to the
  foreground, when its connection returns, when it is told something changed, and when the person
  asks — and at no other time.
- **FR-011**: A clock that only changes how already-loaded information is worded ("3 minutes ago")
  is not a refresh and is permitted.
- **FR-012**: An idle open screen MUST NOT cause repeated requests for the data it shows.

**Catching up**

- **FR-013**: A screen that could not receive updates for any period MUST read the current state
  once when it can again, without the person asking.
- **FR-014**: When updates arrive in quick succession, the app MUST combine them so the screen
  re-reads at most once per short interval, and MUST always re-read once after the last of them.
- **FR-015**: A screen that is not currently able to receive live updates MUST say so, MUST show
  how old what it is displaying is, and MUST offer a way to refresh by hand. It MUST NOT present
  stale information as current.
- **FR-016**: A live update MUST NOT discard anything the person is entering, move them off the
  item they are working on, or reset their place on the screen.

**Who hears what**

- **FR-017**: A shop's staff MUST be told only about changes to their own shop's orders, stock and
  attention list.
- **FR-018**: A customer MUST be told only about changes to their own orders.
- **FR-019**: A driver MUST be told only about changes to their own assigned work.
- **FR-020**: Back-office staff MUST be told about changes to the operations they are permitted to
  see.
- **FR-021**: It MUST be impossible for a person to receive updates for another shop, another
  customer or another driver — including by asking for them directly rather than through the app.
- **FR-022**: A person signed in to one audience's app MUST NOT be able to receive another
  audience's updates.
- **FR-023**: When a person's access ends — they are disabled, suspended, barred, reassigned to
  another shop, or sign out — they MUST stop receiving updates within fifteen minutes, without
  needing to close the app.
- **FR-024**: Nothing a customer receives, and nothing about when they receive it, MAY reveal which
  shop is handling their order, how many shops are involved, or anything about a shop's internal
  progress beyond what the customer's own order page already states.
- **FR-025**: A customer MUST be told about a change to their order only when what the customer is
  shown has changed.

**What goes live**

- **FR-026**: On shop web and shop mobile: a newly paid order; an order cancelled or refunded; pick
  progress recorded by anyone in the shop; a portion handed over or collected; stock running out or
  falling below its low-stock level; anything entering or leaving the attention list.
- **FR-027**: On customer web and customer mobile: a change to the progress, status, refunds or
  cancellation of the customer's own order, on the order page and the order list.
- **FR-028**: On driver mobile: work assigned, reassigned, withdrawn or changed for that driver.
- **FR-029**: On back-office: orders (paid, cancelled, refunded, progressed, handed over, arrived);
  dispatch and drivers (assignment, collection, hub check-in, delivery, duty status); delivery-slot
  load; the product review queue.
- **FR-030**: Screens outside FR-026 to FR-029 are unchanged by this feature.

**Cost and running**

- **FR-031**: Nothing introduced by this feature MAY run continuously or incur cost while no app is
  open and nothing is changing.
- **FR-032**: The running cost of this feature MUST stay within the bound in SC-006.
- **FR-033**: The operator MUST be alerted if the feature's cost approaches that bound, or if
  updates are failing to be sent, through the platform's existing alerting.
- **FR-034**: The platform MUST record how many updates are sent and how many fail to send, without
  recording who received them or what they were about beyond the kind of thing.

### Key Entities

- **Live update**: A message from the platform to open apps saying that something has changed. It
  names a kind of thing and whose it is; it holds no business information.
- **Audience scope**: Whose thing a change belongs to — one shop, one customer, one driver, or
  operations as a whole. It decides who may hear an update.
- **Live connection**: An open app's standing ability to receive updates for the scopes its
  signed-in person is entitled to. It exists only while the app is open and in use.
- **Change**: Something that has taken effect in the platform and alters what one or more
  audiences are shown: an order paid, a pick recorded, work assigned, a refund settled.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On an open, connected screen, **95%** of changes are visible within **5 seconds** of
  taking effect, and **99%** within **15 seconds**.
- **SC-002**: With notifications switched off on the device, a newly paid order appears on an open
  shop screen within **5 seconds** in **20 of 20** trials.
- **SC-003**: A screen left open and idle for **one hour** makes **no** repeated requests for the
  data it shows.
- **SC-004**: After a connection is lost and restored, a screen shows the current state within
  **5 seconds** of the connection returning, in **20 of 20** trials, with no action by the person.
- **SC-005**: In an attempt to receive another shop's, another customer's or another driver's
  updates — through the app and by asking directly — **0 of 50** attempts succeed.
- **SC-006**: At current usage the feature costs under **1 USD** a month to run; it does not exceed
  **5 USD** a month at fifty shops each trading a full day.
- **SC-007**: With no app open and nothing changing, the feature costs **nothing** for that period.
- **SC-008**: Across **100** changes made while a live update is deliberately prevented from being
  sent, **100** of the changes themselves succeed.
- **SC-009**: A person whose access is removed stops receiving updates within **15 minutes**, in
  **10 of 10** trials.
- **SC-010**: A search of all six apps finds **no** timed refresh of data remaining.
- **SC-011**: On an order fulfilled by two shops, a customer watching their order page cannot tell,
  from what they receive or when, that more than one shop is involved, in **10 of 10** trials.
- **SC-012**: Across **20** bursts of ten or more changes within ten seconds, each open screen
  re-reads **no more than three times** per burst and ends showing the correct state every time.

## Assumptions

- "Live" means within a few seconds, not instantaneous. Nobody is making a decision that turns on
  less than that.
- The platform is pre-launch: tens of people at most use it at once. The cost bound is set against
  that and against a first real scale of fifty shops; a much larger scale would revisit the bound,
  not the design.
- Every surface already reads the current state correctly on demand. This feature changes *when*
  they read, not what they read or how.
- A signed-out customer browsing the catalogue sees no live updates. Catalogue prices and stock
  shown to shoppers are not in scope; a product that sells out is still caught at the cart and at
  checkout, as it is today.
- A customer's cart is already kept in step across their devices by its own mechanism and is not
  changed here.
- Push notifications stay as they are, as a way to reach someone whose app is closed. This feature
  reaches someone whose app is open. Neither replaces the other.
- A person whose access ends keeps whatever is already on their screen until they next read; this
  feature controls what they are *told*, and every read is still checked as it is today.
- Where a device or network cannot hold a live connection at all, the screen works by reading on
  open, on return and on request. That is a supported state, not a failure.
- Back-office staff see operations as a whole; finer limits by role follow the limits their screens
  already apply when reading.
- The withdrawn promise recorded by 070 — shop console updates within ten seconds — is superseded
  by SC-001 when this ships.

# Feature Specification: Effy's Own Toasts

**Feature Branch**: `118-effy-toasts`
**Created**: 2026-11-13
**Status**: Draft
**Input**: User description: "Effy's own transient feedback ("toasts") for all three web surfaces (shop console, back-office,
customer storefront), designed and built by us from scratch (not ported from any library), replacing the two toast systems
in use today with ONE. Spring-like motion that opens from a status mark and changes in place; one toast at a time; a failure
is never replaced by a lesser message; kinds success / failure / warning / information / in progress; up to two buttons, a
progress bar, a picture; generated sounds per kind (shop console with its Sound setting, back-office on scanning only, never
on the storefront); screen readers hear every message; Effy's theme; every existing toast moved with the same words.
Phase 2: a toast when a new item arrives in the notification inbox (shop console, signed-in storefront)."

> Number note: 117 is held for disputes (decided in 116's spec), so this is 118.

## Background

A **toast** is the short message that confirms or refuses something a person just did ("Saved.", "No bag has that label.")
and then goes away by itself. Today Effy has two toast systems:
- the **shop console and back-office** use an outside product, about 75 messages across 34 screens;
- the **storefront** has its own small one (add to cart, saved items, the cart, the inbox, notification settings), because
  the outside product is too heavy for pages a guest opens first.

They look and behave differently, neither has sound, and the consoles' one belongs to someone else.

Effy wants **one toast of its own** for all three web surfaces: it moves with a physical, springy feel, says what happened
with a small gesture and (where it helps) a soft sound, never hides a failure, and is ours to change. Outside toast products
were studied for what makes them feel good; nothing is copied from them.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A shop worker sees, and hears, what just happened (Priority: P1)

A shop worker marks a batch of orders ready in the shop console. A toast appears from the corner as a small "in progress"
mark, opens into "Marking 6 orders ready…", and when the work is done the same toast turns into "6 orders ready" with a
tick that settles with a small pulse and a soft rising tone. If one order could not be marked, the toast turns into the
failure instead, shakes once, plays a soft falling tone, and stays until the worker closes it.

**Why this priority**: the shop console is where toasts are used most (bulk actions, fulfilment, the Today page) and where a
missed failure costs most: an order a worker believes is ready but is not.

**Independent Test**: in the shop console with Sound on, run a bulk action that succeeds and one that partly fails; each
result is shown in place of the in-progress message, with its gesture and tone; the failure stays until closed. Turn Sound
off and repeat: same toasts, no tones.

**Acceptance Scenarios**:

1. **Given** Sound is on, **When** an action succeeds, **Then** the toast shows success with its gesture and the success tone, and closes by itself after about five seconds.
2. **Given** an action is in progress, **When** it finishes, **Then** the same toast changes into the result in place (it does not close and reopen).
3. **Given** a failure toast is showing, **When** another action reports success, **Then** the failure stays and the success waits until the failure is closed.
4. **Given** Sound is off, **When** any toast appears, **Then** no tone plays.
5. **Given** the worker asked their device for reduced motion, **When** any toast appears or changes, **Then** it fades in and out with no movement, shake, hop or pulse.

---

### User Story 2 - Back-office staff get the same toast, with sound only when scanning (Priority: P1)

A back-office user saves settings, assigns a driver, credits points: the same toast confirms each, silently. At the hub, a
person scanning bag labels hears a soft confirming tone for a found label and a falling tone for "No bag has that label.",
so they can keep their eyes on the bags.

**Why this priority**: back-office is the second console using the outside product; it has to move at the same time so the
outside product can be removed. Scanning is where a sound saves real effort.

**Independent Test**: save a setting (silent toast); scan a known label and an unknown one (each with its tone).

**Acceptance Scenarios**:

1. **Given** any back-office screen other than scanning, **When** a toast appears, **Then** no tone plays.
2. **Given** a person scans a label, **When** the result is shown as a toast, **Then** its tone plays (after the person's first click or key press in that tab, as browsers require).

---

### User Story 3 - Shoppers get the same toast on the storefront, silently (Priority: P2)

A shopper adds an item to the cart, saves an item, removes something from the cart with an Undo, changes notification
settings: the same Effy toast confirms each, at the bottom of the screen, with the same motion and no sound. Pages a guest
opens first load no slower than they do today.

**Why this priority**: one toast for the whole platform is the goal, but the storefront already has a working toast; it
moves after the consoles.

**Independent Test**: as a guest, add to cart and save an item; as a signed-in shopper, remove a cart line and press Undo.
No sound at any point. The storefront's first-load size check for guest pages still passes.

**Acceptance Scenarios**:

1. **Given** any storefront page, **When** a toast appears, **Then** no tone ever plays, whatever the shopper's device or settings.
2. **Given** a toast with an Undo button, **When** the shopper presses Undo, **Then** the action is undone and the toast changes in place to say so.
3. **Given** a guest opens any public page, **When** the page loads, **Then** it is within the storefront's existing first-load size budget.

---

### User Story 4 - Everyone, including screen-reader and keyboard users, can read and act on a toast (Priority: P2)

A person using a screen reader hears every toast as it appears or changes, failures straight away and others politely,
without losing their place. A keyboard user can jump into the toast with a shortcut, press its button, and close it with
Escape. On a touch screen, a toast can be swiped away.

**Why this priority**: a confirmation that cannot be perceived has not been given; this is required for every surface.

**Independent Test**: with a screen reader on, trigger success, failure and an in-progress toast that finishes; each is
announced once, the failure urgently. Use only the keyboard to reach a toast's button and to close a toast.

**Acceptance Scenarios**:

1. **Given** a screen reader is on, **When** a toast appears or its message changes, **Then** the new words are announced once, without focus moving.
2. **Given** the same message is announced twice in a row, **When** it happens, **Then** it is announced both times.
3. **Given** a toast is showing, **When** the person presses the shortcut, **Then** focus moves into the toast; Escape closes it and returns focus to where it was.
4. **Given** a progress bar is moving, **When** it updates, **Then** nothing is announced for the percentage alone.

---

### User Story 5 - A new notification shows up while you are working (Priority: P3, phase 2)

A shop worker is on the order queue when a new item arrives in their notification inbox. A toast says what arrived, with
an "Open" button that goes where the inbox item would. A signed-in shopper browsing the storefront sees the same when, say,
their order is out for delivery. The shop console's new-order alert is unchanged: it stays a banner until someone opens the
order.

**Why this priority**: valuable, but it depends on the toast itself (stories 1–3) and on the inboxes (110), which already
show a count on the bell.

**Independent Test**: with the shop console open on any page but the inbox, send that shop a notification from back-office
› Messages; a toast appears naming it, and "Open" goes to its destination. Repeat on the storefront as a signed-in shopper.

**Acceptance Scenarios**:

1. **Given** a person is signed in and not on their inbox, **When** one new inbox item arrives, **Then** a toast shows its title with an "Open" button that goes to the item's destination and marks it read as opening it from the inbox would.
2. **Given** several new items arrive together, **When** they arrive, **Then** one toast says how many arrived, with an "Open" button that opens the inbox.
3. **Given** the person is on their inbox, **When** a new item arrives, **Then** no toast is shown.
4. **Given** a new order arrives at a shop, **When** the shop console is open, **Then** the new-order banner behaves exactly as today and no extra toast is shown for it.

---

### Edge Cases

- **Many toasts at once** (a bulk action reporting per order): one toast is visible; a newer message takes it over, except over an unread failure (FR-007). An identical message repeats as a count ("×3") instead of a new toast.
- **A slow earlier action finishes after a newer one**: it must not overwrite the newer message (FR-008).
- **Several failures in a row**: the newest failure takes over the older one (a failure is never replaced by a *lesser* message; two failures are equals). The older one is not lost to screen readers: it was announced when it appeared.
- **A failure with nobody there**: it stays until closed; a later page change in the same tab does not close it.
- **Very long message**: wraps to at most a fixed width; never wider than the screen less its margins; the full text is readable.
- **Sound before any click**: browsers block sound until the person has clicked or pressed a key in the tab; the first toast before that is silent, never an error.
- **Sound turned off mid-toast**: the next toast is silent.
- **Dark and light**: the toast follows the surface's appearance (consoles: the person's choice; storefront: light only).
- **Toast and an open dialog or side panel**: the toast is above them and stays readable; its buttons still work.
- **Toast during a guided tour (106/107)**: the toast stays visible and usable above the tour's dimming, like the new-order alert does.
- **Swipe started on a button**: pressing a button never starts a swipe.
- **Pause**: hovering or focusing the toast pauses its countdown; leaving resumes with the time that was left.

## Requirements *(mandatory)*

### Functional Requirements

**One toast, Effy's own**
- **FR-001**: The shop console, back-office and the customer storefront MUST all show toasts through ONE Effy toast. The two toast systems in use today MUST be removed.
- **FR-002**: The toast MUST be designed and built by Effy. It MUST NOT use, include or copy any outside toast product.
- **FR-003**: Every existing toast message MUST move to the Effy toast with **the same words**, the same kind (a message that is neither success nor failure today becomes information), and the same buttons.

**Kinds and contents**
- **FR-004**: A toast MUST be one of five kinds: **success, failure, warning, information, in progress**. Each kind has its own mark and colour from Effy's theme; a mark always accompanies the colour (colour is never the only signal).
- **FR-005**: A toast MAY carry: a second line of text; up to **two** buttons (a main one and a quieter one); a progress bar from 0 to 100%; a small round picture in place of the mark; a short trailing note (for example "now").
- **FR-006**: An action's toast MUST be able to change in place: an in-progress toast becomes success or failure; a button press may change the toast into a new message (for example Undo → "Restored") instead of closing it.

**One at a time, never hiding a failure**
- **FR-007**: At most **one** toast is visible on a surface. A new message takes over the visible toast, changing it in place, EXCEPT that a **failure still showing MUST NOT be replaced by a success, information or in-progress message**; those wait and are shown, newest only, once the failure is closed. A warning MUST NOT replace a failure either.
- **FR-008**: Only the most recent message from an action may change the visible toast; a slower, earlier action MUST NOT overwrite a newer message.
- **FR-009**: The same message (same kind, same words) shown again while it is visible MUST show a repeat count (×2, ×3…) and restart its countdown instead of showing again.

**How long it stays**
- **FR-010**: A toast without buttons that is success, warning or information MUST close by itself after **5 seconds**. A failure, an in-progress toast, and any toast with a button MUST stay until the person closes it or the action changes it. A caller may set a different time for one toast.
- **FR-011**: While the pointer is over the toast or keyboard focus is in it, its countdown MUST pause, and resume with the remaining time afterwards.
- **FR-012**: A toast that stays until closed MUST show a close button. Every toast MUST close with **Escape** when focus is in it, and by **swiping** it away on a touch screen.
- **FR-013**: A keyboard **shortcut** MUST move focus into the visible toast; it MUST NOT clash with any existing console or storefront shortcut.

**Motion**
- **FR-014**: A toast MUST arrive and change with **physical, spring-like motion**: it appears as its small mark, then opens to fit its message; when its message changes, the old words leave and the new ones arrive while the toast reshapes to the new length, all in one movement. Closing reverses the opening.
- **FR-015**: Each kind MUST have its own small gesture when it appears or becomes that kind: success settles with a pulse, a failure shakes once sideways, a warning hops, in progress turns until it becomes its result.
- **FR-016**: When the person's device asks for **reduced motion**, toasts MUST only fade in and out: no travel, spring, shake, hop, pulse or turning.
- **FR-017**: Motion MUST stay smooth while the page is busy, and text MUST be crisp once the toast is at rest.

**Sound**
- **FR-018**: Each kind except in progress MUST have its own short, soft **tone**: success rises, failure falls, warning taps twice, information is one note. In-progress toasts and progress updates MUST be silent. Tones MUST be made by the browser, not played from recorded files.
- **FR-019**: **Shop console**: tones play when, and only when, the shop console's existing **Sound** setting is on. The existing **new-order chime** MUST become part of the same set of Effy sounds and keep its current behaviour (when it plays, how often it repeats, the settings preview).
- **FR-020**: **Back-office**: tones play only for **scanning results** shown as toasts.
- **FR-021**: **Storefront**: a tone MUST NEVER play.
- **FR-022**: A tone that the browser will not allow yet (before the person's first click or key press) MUST be skipped silently; sound MUST never cause an error or stop a toast.

**Reading and accessibility**
- **FR-023**: Every toast's words MUST be announced to screen readers when it appears and whenever its words change, **failures urgently and the rest politely**, without moving focus. A repeat of identical words MUST be announced again.
- **FR-024**: Buttons in a toast MUST NOT be reachable by Tab until the toast has finished opening; every button MUST have a touch target of at least 44 by 44 points.

**Appearance**
- **FR-025**: The toast MUST wear Effy's one theme: its colours, type, corner shape and both appearances (the consoles in light and dark as the person chose; the storefront in light), with no gradients. Its shape MUST pass the design system's shape and colour checks; text MUST meet the contrast the rest of the theme meets.
- **FR-026**: Toasts appear where they appear today: **bottom right** in the consoles, **bottom centre** on the storefront, clear of the screen's safe areas.
- **FR-027**: The toast MUST stay visible and usable above dialogs, side panels and guided tours.

**Storefront size**
- **FR-028**: Adding the Effy toast MUST NOT push any storefront page a guest opens first past the storefront's **existing first-load size budget**.

**Notifications arriving (phase 2)**
- **FR-029**: In the **shop console** and on the **storefront when signed in**, when one new item arrives in the person's notification inbox while they are not on the inbox, an **information** toast MUST show the item's title with an **"Open"** button that goes to the item's destination and marks it read, exactly as opening it from the inbox does.
- **FR-030**: When more than one new item arrives together, ONE toast MUST say how many ("3 new notifications") with an "Open" button to the inbox.
- **FR-031**: The arrival toast MUST follow the surface's sound rule (shop console: Sound setting; storefront: never). It MUST NOT be shown for the shop console's new-order alert, which stays a banner, unchanged.
- **FR-032**: Arrivals are learned the way the inbox already learns of changes; a screen MUST NOT check for new items on a timer.

**Guards**
- **FR-033**: The platform's checks MUST fail if any web surface again uses an outside toast product or adds a second toast system, and the toast's behaviour rules (FR-007 to FR-012, FR-016, FR-018 to FR-023) MUST be held by automated tests.

### Key Entities

- **Toast**: one message on screen. Kind; words (title and optional second line); optional buttons (at most two), progress, picture, trailing note; how long it stays; repeat count; who may change it (the most recent action).
- **Sound set**: Effy's tones, one per kind plus the new-order chime; whether each surface may play them.
- **Arrival**: one or more new inbox items noticed while a person is using a surface (phase 2).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the toast messages on the three web surfaces (about 81 today) are shown by the Effy toast with unchanged words, and no outside toast product remains in any web surface.
- **SC-002**: In a bulk action that produces a failure followed by a success within 5 seconds, the failure is still on screen afterwards in 100% of trials.
- **SC-003**: A toast begins to appear within 100 ms of the action reporting its result, and its motion shows no visible stutter on a mid-range laptop and a mid-range phone.
- **SC-004**: With reduced motion asked for, no toast moves, shakes or scales in any test.
- **SC-005**: Every storefront page a guest opens first stays within its existing first-load size budget.
- **SC-006**: A screen reader announces 100% of toast messages and message changes in a scripted pass, failures urgently, and nothing for progress-only updates.
- **SC-007**: In the shop console with Sound on, each kind plays its own tone; with Sound off, and on the storefront always, zero tones play.
- **SC-008** (phase 2): A new inbox item shows its toast within 5 seconds of arriving, and "Open" lands on the same screen the inbox would open, in 100% of trials.

## Assumptions

- **Positions, durations and words** are kept as they are today, except that the storefront's toasts now follow the one-at-a-time rule (the storefront rarely shows two at once).
- **"Scanning results"** in back-office are the toasts shown by label scanning (the shell's scan box and the hub's scanning screens); everything else in back-office is silent.
- **The tones** are designed by Effy, short (under half a second) and soft; their exact pitches are chosen during design and tried on a laptop speaker and a phone before sign-off.
- **The new-order chime** keeps its sound and its rules; it moves into the shared sound set so the platform has one place for sound, not a second sound system.
- **The keyboard shortcut** is chosen during design from keys no console or storefront page already uses.
- **The mobile apps** are out of scope; they have their own native feedback.
- **Push notifications** are unchanged; phase 2 only adds an in-page toast for something that already arrives in the inbox.
- **No message wording changes** in this feature; a wording found wrong is recorded, not changed here.
- **Phase 2** depends on the inboxes and their live updates (110) being deployed, which they are in dev.

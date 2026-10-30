# Feature Specification: Driver App Redesign

**Feature Branch**: `092-driver-mobile-redesign`

**Created**: 2026-10-16

**Status**: Draft

**Input**: User description: "Move on to the redesign of the driver app UI (driver backlog G1–G3), from the
design canvas 'Effy Driver Mobile Redesign' (docs/reference-screens/Effy Driver Mobile v2/), the redesign
brief and the scanning design - including the simplifications it implies (E1–E5), customer contact (F1),
the scanning screens (H6–H11) and the offline and notification states."

## Background

The driver app works but carries more than a simple work tool needs - a Map tab, an activity feed, day
stats and a shift timer, a four-step drop - and its look predates the platform's current identity.
The redesign canvas (61 artboards, light and dark, committed in
`docs/reference-screens/Effy Driver Mobile v2/`) is the target: three tabs, the customer app's identity
used for a work tool, bigger targets for one-handed outdoor use, scanning as the main way to move work
forward, and every screen designed for no signal.

Everything underneath is already built: offline saving and sending (C1–C6), proof that survives no signal
(B3), returning failed parcels (088), package labels (089), the scan rule, camera reader, hand-over record,
hub instructions and "load the van" (090). This feature is the screens.

## Clarifications

### Session 2026-10-16

- Q: Which identity - the brief's console palette or the canvas's? → A: **The canvas** (operator, 2026-10-16):
  the storefront identity (Effy blue for the next action, Effy green for done, a problem is black with an
  icon - no red or orange), Geist, Lucide icons, its light and dark palettes. Constitution amended to v3.5.0.
- Q: How does the driver reach the customer? → A: **A direct call from the drop** (operator, 2026-10-16), to
  the number the customer gave at checkout, sent only to the driver holding that drop and only while it
  is open. No masked relay (it would need a telephony vendor).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Today, in three tabs (Priority: P1)

A driver opens the app to **Today · History · Account**. Today shows exactly where they are: off duty (one
big "Go on duty"); on duty with no work ("You'll get a notification", or "Notifications are off" with a
way to turn them on); a run not open yet (shown in full, with when it opens); a collection or delivery run
under way, with a hero for the current stop or drop, its next actions (Navigate, Scan packages / Deliver,
View) and what comes next; a dispatch change as a dismissible note; failed parcels to return. Connection
banners (offline, updates waiting to send, not recorded, live updates paused) push content down and never
cover it. There is no Map tab, no activity feed, no day stats and no shift timer.

**Why this priority**: It is the screen a driver lives on; every other flow starts and ends here.

**Independent Test**: Walk Today through each state in the canvas's "Today and duty" page, in light and dark.

**Acceptance Scenarios**:

1. **Given** an off-duty driver, **When** they open the app, **Then** Today shows only the go-on-duty control
   (and a later run, if any).
2. **Given** a collection run under way, **When** Today shows, **Then** the hero is the next shop with
   Navigate, Scan packages and View stop, and "Up next" lists the remaining shops ending at the hub.
3. **Given** the phone is offline with updates waiting, **Then** the offline and waiting banners show above
   the content, and the last loaded copy is marked as such.
4. **Given** a driver holding work, **When** they go off duty, **Then** a sheet asks them to confirm and says
   what they still hold.

---

### User Story 2 - Two taps to a delivered drop (Priority: P1)

From a drop: **Deliver** (or **Scan to deliver**) → how it was handed over (photo, signature, left safely
- led by the customer's preference) → **Delivered**, with **Next drop**. Arrival is recorded by itself; there
is no separate Start / On my way / Arrived. **Can't deliver** records a reason (Other needs a note) and tells
the driver to keep the parcels for the hub. The drop shows the customer's first name, address, window
(Due now / Late), instructions, packages by position, **Navigate** and **Call** the customer.

**Why this priority**: It is the job. Four steps per drop become two.

**Independent Test**: Deliver a drop by photo, by signature and left safely; fail one; with signal and without.

**Acceptance Scenarios**:

1. **Given** a drop, **When** the driver taps Deliver and takes a photo, **Then** the drop is delivered
   (arrival recorded with it) and Next drop is offered.
2. **Given** no signal, **When** a drop is delivered, **Then** it reads "Saved - sending when you're back online"
   and the driver carries on.
3. **Given** a drop, **When** the driver taps Call, **Then** the phone dials the customer's number.
4. **Given** Can't deliver → Something else with no note, **Then** the platform's own message shows at the field.

---

### User Story 3 - A collection run (Priority: P1)

The run overview lists the shops in order (Collected / Short / Next / To collect), ending at the hub. At a
shop the driver ticks each package (or reports it missing, damaged, not ready), sees EFFY · window or
COURIER per package, and swipes "Collected n of m"; an unticked package asks first. At the hub, one action
checks everything in and shows where parcels go - Effy by day and window (load now / shelve) and Courier
(with the next courier pickup) - or, offline, "Checked in - sending".

**Why this priority**: Half of every driver's day.

**Independent Test**: Collect three shops (one short), check in at the hub, online and offline.

---

### User Story 4 - Scanning moves the work (Priority: P2)

Each step offers **Scan packages** first, with ticking by hand as the fallback: at a shop (the last scan
collects after a 3-second "Collecting… Undo"), at the hub (each scan shows LOAD NOW / SHELVE / COURIER BAY;
the last scan checks in), loading the van (the run's drops go out together), at the door (a package for
another address is a hard stop; all scanned goes straight to proof), and returning failed parcels. A torn
label's code can be typed. Each scan gives a flash, a sound (silent mode respected) and a haptic; a wrong
package stops the driver.

**Why this priority**: The main way of working once labels are printed; every scan rule already exists.

**Independent Test**: Scan a shop, the hub, the van, a door and a return with printed labels; mis-scan at each.

---

### User Story 5 - History, Account and Help (Priority: P2)

History lists finished runs and deliveries by day, with a delivery's proof. Account shows the driver, hub,
vehicle, duty, appearance (Match phone / Light / Dark inline), notifications and camera status, Help (call
dispatch, call the hub desk, handbook - "Not set up" when unconfigured), the app version and Sign out
(which says it also goes off duty and warns about held work).

**Independent Test**: Open each; sign out holding work.

---

### User Story 6 - Getting in (Priority: P3)

Splash, sign in by work email, the 6-digit code (wrong, expired, too many, offline), account can't be used,
the permissions explainer (asked once) and permission refused - in the new identity.

**Independent Test**: Sign in from scratch, with a wrong code, and as a disabled driver.

### Edge Cases

- A run reassigned while open - "This stop was moved", back to Today.
- An action before the round opens - "Opens at …", nothing changed.
- An offline write later refused - the "Not recorded" banner with Call dispatch.
- A driver with no vehicle or hub - the row says so, never blank.
- Installed builds in the field keep working until the new build reaches them (every new server field is optional).

## Requirements *(mandatory)*

### Functional Requirements

**Shell and identity**

- **FR-001**: The app MUST have three tabs - Today, History, Account - on phones, and a rail on tablets;
  no Map tab and no activity feed.
- **FR-002**: The app MUST use the identity of the canvas: its colours in light and dark (chosen in Account:
  Match phone / Light / Dark), Geist (Geist Mono for references), Lucide icons, its radii, and targets of at
  least 48 dp with primary actions of 52–56 dp pinned at the bottom.
- **FR-003**: Status MUST be said with the canvas's words and looks only (Next, To collect, Collected,
  Delivered, Due now, Late, Short, Not delivered); a problem is black with an icon, never red or orange.

**Today**

- **FR-004**: Today MUST show each state in the canvas (off duty, no work, notifications off, not open yet,
  collection under way, delivery under way, dispatch change note, parcels to return) and the connection
  banners in the canvas's order, pushing content down.
- **FR-005**: Going off duty while holding work MUST be confirmed in a sheet naming what is held.

**Delivery**

- **FR-006**: A drop MUST be delivered in two steps - Deliver (or a completed door scan), then proof - with
  arrival recorded as part of it.
- **FR-007**: The proof choice MUST lead with the customer's handover preference; left safely MUST take a
  photo and a "left at" place.
- **FR-008**: The drop MUST offer Call to the customer's phone number, for the driver holding the drop and
  only while it is open.
- **FR-009**: Loading the van MUST be one step for the run (scanned or "Mark all loaded"), replacing
  "Start this drop".

**Collection**

- **FR-010**: A shop stop MUST let the driver tick, report and swipe to collect, asking before collecting
  with an unticked package; the hub check-in result MUST show Effy groups and Courier with the next courier pickup.

**Scanning**

- **FR-011**: Every scanning step (shop, hub, load, door, return) MUST use the one scan rule and the camera
  reader, with typed codes, a hard stop for a wrong package, feedback by flash, sound and haptic, and ticking
  by hand as the fallback; the method of each hand-over MUST be sent with it.

**Everywhere**

- **FR-012**: Every screen MUST have its offline state as drawn ("saved on this phone", last loaded copy),
  its loading skeleton, its error with retry, and "no longer yours".
- **FR-013**: The app MUST never show money, ETA, distance, shop names at the customer's door, or the words
  "same-day" and "standard".
- **FR-014**: Help MUST call dispatch and the hub desk and open the handbook when configured, and say "Not
  set up" when not.

### Key Entities

- **Customer contact** (new to the driver): the customer's first name and phone number on an open drop.
- Everything else exists: runs, stops, drops, packages and codes, hub instructions, hand-overs, parcels to return.

## Success Criteria *(mandatory)*

- **SC-001**: A drop goes from open to delivered in two taps plus the proof (four before).
- **SC-002**: Every artboard in the canvas has a matching screen or state in the app, in light and dark.
- **SC-003**: Every primary action is at least 52 dp and within the bottom third of the screen.
- **SC-004**: With no signal, a driver can complete a collection, a check-in, a delivery and a return
  without an error screen.
- **SC-005**: A printed label is scanned and accepted in under a second at each step.

## Assumptions

- The canvas is the authority where it and the brief differ (identity, words).
- iOS push stays blocked on the Apple account (D3); the notification screens are designed for both.
- Dispatch, hub desk and handbook contacts are operator configuration; unconfigured shows "Not set up".
- The current app's ViewModels, repositories and offline machinery are kept; this replaces screens.

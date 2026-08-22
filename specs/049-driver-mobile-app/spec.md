# Feature Specification: Driver Delivery App

**Feature Branch**: `049-driver-mobile-app`

**Created**: 2026-08-22

**Status**: Draft

**Input**: User description: "i want to start development of the driver application. for the driver app we only need KMP application for android and mobile [Android + iOS]. no need for web. and we should use the same technology as we use in customer and shop apps. [full Claude Design handoff: the 46-screen 'Effy Driver App v2' (superseding the 40-screen v1), plus docs/driver-app-design-brief.md]"

## Overview

The Effy Driver app is the platform's **sixth and final client surface** and its **third audience-facing
mobile app** (after customer and shop). It is a **delivery-operations work tool for salaried Effy
courier employees** — not a gig-economy app: no earnings, tips, pay, offers, or accept/decline bidding.
Work is **assigned**, not chosen.

Effy runs a **hub-and-spoke logistics model** (settled with the operator on 2026-08-22 — see
Clarifications, and now recorded in the platform description). An Effy driver does **not** do
one-order-one-drop courier runs. Instead a driver:

1. Goes **on duty** and is **auto-assigned packages to collect**.
2. Drives a **collection run** — a round of fulfillment shops — picking up **all** assigned packages
   (both same-day and standard).
3. **Checks the packages in at a single central Effy hub/warehouse**, which ends the collection run.
4. Takes the **same-day** packages and does a **same-day delivery run** — a multi-drop round to
   customers — completing each drop with **proof** (photo / delivery code / signature / contactless).
5. **Standard** packages leave the driver app at hub check-in — they are handed to an **external
   delivery company**. The driver app's responsibility for a standard package **ends at "checked in at
   hub"**.

The same-day-vs-standard split is **already a known property of each package from checkout** (feature
047); the driver never classifies anything. Collection runs follow the **configurable collection
schedule** 047 already defines (e.g. a 2 pm cutoff), which is exactly what gates same-day eligibility at
checkout. Work is modeled as **typed tasks** (`collection` / `same_day_delivery`) in a driver's queue,
not as hard driver roles.

This slice closes the platform's **commerce → fulfilment → delivery loop**. Today a paid order fans out
to shops (020) and a shop advances its portion to `ready_for_pickup`; the final `collected` and
`delivered` transitions are written only by **dev-only stubs** that were always meant to be "removed
when the real driver slice ships." This is that slice.

The spec covers the **full app** with user stories **prioritized** so P1 (collection run + same-day
delivery run) is the shippable MVP and later priorities are carved out during planning.

## Clarifications

### Session 2026-08-22

- Q: How should this one spec be scoped? → A: Full app in one spec, with user stories prioritized (P1 = shippable core loop).
- Q: How is a delivery assigned to a driver (no dispatch backend exists today)? → A: Automatic assignment engine — deliveries/tasks are pushed to eligible on-duty drivers with no human dispatcher and no accept/decline.
- Q: How much mapping/location is in scope? → A: External navigation hand-off + a basic in-app stop map (pins + ordered stop list); no live GPS streaming to the backend. Nearest-driver preference, where used, reads a point-in-time location snapshot at assignment.
- Q: How should the app model the two kinds of work (collection run vs same-day delivery run) relative to a driver? → A: Typed tasks (`collection` / `same_day_delivery`), no hard driver roles; one driver typically does a collection run then a same-day round in a shift.
- Q: At the hub, is same-day/standard sorting a manual driver decision or already known? → A: Already known per package from checkout (047); the app has an explicit hub check-in step that surfaces the split; no manual sort.
- Q: Does the driver app perform standard *delivery* drops in v1? → A: No — collection + same-day delivery only; standard packages leave the app at hub check-in and go to an external carrier.
- Q: How many hubs/warehouses does the app assume? → A: A single central hub (matches 047's single operating-hub point); multi-hub deferred.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run a collection round: shops → hub (Priority: P1)

A provisioned driver signs in with their work email and a 6-digit code, goes **on duty**, and is
**automatically assigned a set of packages to collect**. They see a collection run as an ordered round
of fulfillment shops, drive to each, verify the item manifest and mark each shop's packages
**collected**, and finally **check all packages in at the Effy hub** — which shows the same-day vs
standard split and ends the run.

**Why this priority**: Collection is the front half of the whole operation and the platform's missing
link — nothing reaches customers (or the external carrier) until packages leave the shops and reach the
hub. It proves employee auth, the auto-assignment engine, multi-shop pickup, and retires the shop-side
`ready_for_pickup → collected` dev stub.

**Independent Test**: Provision a driver; produce paid orders whose shop portions are `ready_for_pickup`
across two shops; sign in, go on duty; confirm collection tasks are auto-assigned, appear as an ordered
shop round, each shop's manifest is verifiable and markable collected, and hub check-in records every
package as `collected` and displays the same-day/standard split.

**Acceptance Scenarios**:

1. **Given** a driver account provisioned by back-office and never signed in, **When** they enter their
   work email and the correct 6-digit code, **Then** they reach the app's home with **no** sign-up,
   password, or account-creation path anywhere.
2. **Given** a signed-in driver who is **off duty**, **When** they go **on duty**, **Then** they become
   eligible for assignment and see a calm "waiting for the next assignment" state until work arrives.
3. **Given** on-duty capacity and shop portions ready for pickup in the driver's zone, **When** the
   collection run becomes assignable, **Then** collection tasks are **automatically assigned** to that
   driver and appear as an **ordered round of shops**, each row showing the shop name + address and the
   package/item count to collect (no monetary value).
4. **Given** a shop stop, **When** the driver opens it, **Then** they see the item manifest as a
   checkable list and a large collect confirm (swipe-to-confirm), and marking it collected advances that
   shop portion to `collected`.
5. **Given** all assigned shops are collected, **When** the driver reaches the hub, **Then** a **hub
   check-in** step lets them confirm the packages in, shows each package's **same-day vs standard**
   method (already known from checkout), and **ends the collection run**.
6. **Given** the collection run is checked in, **Then** the same-day packages are ready to become a
   same-day delivery run (US2) and the standard packages are marked for the external carrier and leave
   the driver app.

---

### User Story 2 - Run a same-day delivery round: hub → customers, with proof (Priority: P1)

After hub check-in, the driver takes the **same-day** packages and does a **multi-drop delivery round**.
For each drop they navigate to the customer, mark **arrived**, and **complete the delivery with proof**,
reaching a success state — and the underlying order moves to `delivered`.

**Why this priority**: This is the back half of the core loop and Effy's premium same-day promise. With
US1 it forms the complete collection→delivery loop that replaces the 020 dev-only stubs. It is
independently testable against packages already staged at the hub.

**Independent Test**: With same-day packages checked in at the hub (seeded or via US1), confirm the app
presents a same-day delivery run of ordered customer drops; open a drop, navigate, mark arrived, complete
with any one proof method (photo/code/signature/contactless), reach success, and confirm the order's
fulfilment reaches `delivered`.

**Acceptance Scenarios**:

1. **Given** same-day packages checked in at the hub, **When** the driver starts their delivery run,
   **Then** the app presents an ordered list of **customer drops**, each showing order reference,
   customer suburb/short address, package count, a same-day badge and/or delivery window, and a status.
2. **Given** a customer drop, **When** the driver opens it, **Then** they see the customer name + full
   address + delivery instructions, the packages for that drop, a mini-map, and the **next action** as a
   large bottom button or swipe-to-confirm control.
3. **Given** the driver is heading to a drop, **When** they tap Navigate, **Then** the device's maps app
   opens directed to the customer address, delivery instructions stay pinned, and masked contact is
   available.
4. **Given** the driver has arrived, **When** they complete the drop with any one proof method (photo,
   delivery code, signature, or contactless leave-at-door, optionally with a note), **Then** a success
   state is shown, the proof is stored against the delivery, and the underlying order reaches
   `delivered`.
5. **Given** a completed drop, **When** the driver taps "Next," **Then** the next queued drop (if any)
   becomes active, otherwise a calm "delivery run complete" state is shown.
6. **Given** a single customer has same-day packages that were collected from more than one shop,
   **When** they appear on the delivery run, **Then** they are presented as **one customer drop** (not
   one per shop).

---

### User Story 3 - Handle exceptions: missing items, failed drops, standard hand-off (Priority: P2)

At a shop the driver finds a package missing or short; at a customer nobody is home or the address is
wrong. The driver reports the problem or marks the drop **failed / undeliverable** with a reason. At the
hub, standard packages are staged for the external carrier.

**Why this priority**: A work tool that only models the happy path strands drivers. These paths build on
the US1/US2 lifecycle.

**Independent Test**: On a collection stop, report a missing/short package and confirm the rest still
collect; mark a same-day drop undeliverable with a reason and confirm the resulting state and order
reflect the failure; confirm hub check-in stages standard packages for the external carrier and removes
them from the driver's active work.

**Acceptance Scenarios**:

1. **Given** the driver is verifying items at a shop, **When** a package is missing or short, **Then**
   they can report it (affected item + reason) and still collect the rest of that shop's packages.
2. **Given** an active same-day drop, **When** the driver marks it undeliverable, **Then** they must pick
   a reason (nobody home, wrong/incomplete address, customer refused, access blocked, other + note) and
   confirm, after which the drop leaves the active run in a failed state recorded for back-office.
3. **Given** hub check-in, **When** standard packages are present, **Then** they are staged/labelled for
   the **external carrier** and are removed from the driver's active work (their driver-app lifecycle
   ends at "checked in at hub").

---

### User Story 4 - See the route and navigate each run (Priority: P2)

The driver views a full-screen map of the current run's stops — shops + hub for a collection run, hub +
customer drops for a delivery run — with an ordered stop list, hands off to the device's maps app for
turn-by-turn, and contacts the customer through a masked channel.

**Why this priority**: "Get me there" is essential but sits on top of having a run to route (US1/US2),
and turn-by-turn is delegated to the device rather than built.

**Independent Test**: Open the map for a collection run and confirm it shows shop pins + the hub pin and
an ordered stop list; open it for a delivery run and confirm hub + customer pins; confirm Navigate opens
the device maps app to the correct address and a masked Contact customer action exists on delivery drops.

**Acceptance Scenarios**:

1. **Given** an active collection run, **When** the driver opens the map, **Then** it shows the shop
   pin(s), the hub pin, current location, and a bottom sheet listing the ordered stops.
2. **Given** an active same-day delivery run, **When** the driver opens the map, **Then** it shows the
   hub pin, the customer drop pins, current location, and the ordered stop list.
3. **Given** the driver taps **Navigate** on a stop, **Then** the device's maps application opens directed
   to that stop's address (the app provides no turn-by-turn of its own).
4. **Given** a customer drop, **When** the driver taps **Contact customer**, **Then** they can call or
   message via a **masked** channel that exposes neither party's real number.
5. **Given** any appearance, **When** the map is shown, **Then** its styling — pins and route lines — is
   monochrome/neutral in both light and dark, using no third hue.

---

### User Story 5 - Review completed work and its proof (Priority: P3)

The driver reviews a read-only history of completed same-day deliveries (and collection runs) grouped by
day, and opens any one to see its status timeline with timestamps and, for deliveries, the captured
proof.

**Why this priority**: Valuable for the driver's reference and dispute follow-up, but a read-only view of
work already done.

**Independent Test**: After completing at least one delivery, open History and confirm it lists the drop
under its day with order ref, customer suburb, completion time, and a proof indicator; open its detail and
confirm the status timeline and captured proof render read-only.

**Acceptance Scenarios**:

1. **Given** completed deliveries exist, **When** the driver opens History, **Then** they are grouped by
   day, each row showing order reference, customer suburb, completion time, and a proof indicator.
2. **Given** a completed delivery, **When** the driver opens its detail, **Then** it shows the status
   timeline with timestamps, the captured proof (photo/signature/code), addresses, and the packages, all
   **read-only**.
3. **Given** no completed work, **When** the driver opens History, **Then** a clear empty state is shown.

---

### User Story 6 - Be notified of new work and reminders (Priority: P3)

The driver receives push notifications for a new collection assignment, packages becoming ready to
collect at a shop, the start of the same-day delivery window, and completion/shift reminders, and can
review them in an in-app activity feed.

**Why this priority**: Improves responsiveness, but the core runs (US1/US2) work without it.

**Independent Test**: Trigger a new assignment and confirm a push notification with correct anatomy is
delivered, that tapping it opens the relevant run/stop, and that the in-app activity feed lists the event
(with an empty state when there is none).

**Acceptance Scenarios**:

1. **Given** an on-duty driver is assigned new work, **When** the assignment is made, **Then** a push
   notification announces it and tapping it opens the relevant run/stop.
2. **Given** the driver opens the in-app activity feed, **When** notifications exist, **Then** they are
   listed chronologically; **when** none exist, an empty state is shown.
3. **Given** notification permission was denied, **When** the driver would otherwise be notified, **Then**
   the app still surfaces the work in-app and offers a path to re-enable notifications.

---

### User Story 7 - Manage identity, duty, and appearance (Priority: P3)

The driver views their identity, assigned delivery zone, and vehicle info; toggles duty status; chooses
appearance (Light / Dark / Follow-System); reaches help; and signs out.

**Why this priority**: Necessary account hygiene; the one load-bearing part (the duty toggle) already
lives on the home screen for US1.

**Independent Test**: Open Account and confirm identity, zone, and vehicle render as detail rows (not
cards); change appearance and confirm it applies and persists; sign out via a confirm dialog and land at
sign-in.

**Acceptance Scenarios**:

1. **Given** a signed-in driver, **When** they open Account, **Then** name, work email, assigned zone,
   assigned hub, and vehicle info show as **detail rows**, plus a counts-only "today" summary (no
   currency).
2. **Given** any appearance setting, **When** the driver selects Light / Dark / Follow-System, **Then**
   the choice applies immediately and persists across launches, defaulting to Follow-System.
3. **Given** a signed-in driver, **When** they sign out and confirm, **Then** the session ends and they
   return to the sign-in screen.

---

### Edge Cases

- **Offline / no connectivity**: the current run shows the cached last-known list with a persistent
  degraded banner; status-advance actions (collect, check-in, deliver) taken offline are queued and sync
  on reconnect **without double-applying**.
- **Going off duty mid-run**: a collection run or delivery run in progress is not silently dropped; the
  driver is prevented from abandoning in-progress work, or its remaining stops are explicitly returned to
  the assignment pool for reassignment (never orphaned).
- **Assignment while app is closed**: new work assigned while backgrounded/closed is surfaced on next
  open (and by push, US6).
- **Unreachable / non-responding driver**: work assigned to a driver who goes off duty or is unreachable
  returns to the pool for reassignment.
- **Late package / missed collection cutoff**: a same-day package not collected before the run's cutoff is
  handled explicitly (flagged, not silently delivered late) — the same-day promise is not quietly broken.
- **Mixed-method order**: an order with both same-day and standard packages has its same-day packages
  delivered by the driver and its standard packages handed to the external carrier at hub check-in;
  neither blocks the other.
- **OTP failures**: wrong code (attempts remaining shown), expired code (resend), and too-many-attempts
  lockout each have a distinct, non-alarming state.
- **Permission denied**: location denied blocks assignment-relevant features with a path to settings;
  camera denied blocks the photo proof method but not the others; notifications denied falls back to
  in-app surfacing.
- **Proof capture interrupted**: a half-captured photo/signature can be retaken/cleared before confirm; a
  drop is never marked delivered without a completed proof.
- **Empty states**: on duty with no work; no completed history; no activity — each calm and explicit.
- **Loading**: run lists and stop detail show skeletons rather than blank screens.
- **Manifest mismatch**: collected counts are reconciled so a shortfall reported at a shop is visible
  downstream rather than silently accepted.

## Requirements *(mandatory)*

### Functional Requirements

#### Identity & authentication
- **FR-001**: The app MUST allow a driver to sign in with their **work email** and a **6-digit one-time
  code**, with **no** sign-up, password, or self-service account creation anywhere.
- **FR-002**: Driver accounts MUST be **provisioned by back-office staff**; a person who is not a
  provisioned, active driver MUST NOT obtain a working session.
- **FR-003**: The OTP entry MUST present distinct states for entering, verifying, invalid code (attempts
  remaining), expired code (resend), and too-many-attempts lockout.
- **FR-004**: The app MUST prime the driver for the OS permission prompts it needs — **location**,
  **notifications**, and **camera** — with a plain rationale before each system prompt.

#### Duty
- **FR-005**: The driver MUST be able to go **on duty** / **off duty**, reachable from the home screen;
  duty status MUST gate whether new work is assigned to them.
- **FR-006**: An off-duty driver MUST see a calm "start shift" state and MUST NOT receive new assignments.

#### Work model & automatic assignment
- **FR-007**: Driver work MUST be modeled as **typed tasks** — `collection` (a package to collect from a
  shop) and `same_day_delivery` (a customer drop) — grouped into runs; the app MUST NOT hard-code a
  "collector" vs "deliverer" role. One driver MAY be assigned collection work, same-day delivery work, or
  both in a shift.
- **FR-008**: The system MUST **automatically assign** work to eligible on-duty drivers with **no human
  dispatcher** and **no accept/decline step** — work is assigned, not offered.
- **FR-009**: A collection task MUST become assignable only when the shop portion is **ready for pickup**
  (020's `ready_for_pickup`). Same-day delivery tasks MUST become assignable only after their packages are
  **checked in at the hub**.
- **FR-010**: Assignment MUST respect the driver's **assigned delivery zone** and balance work across
  eligible drivers; where a driver location **snapshot** is available it MAY prefer the nearest eligible
  driver. Assignment MUST NOT depend on continuous location streaming.
- **FR-011**: Work assigned to a driver who becomes ineligible (goes off duty, unreachable) MUST be
  **returned to the assignment pool** for reassignment, never orphaned. Releasing work MUST only affect
  **not-yet-collected** packages / not-yet-started drops — an in-progress step MUST NOT be yanked
  mid-action; and a driver MUST NOT be able to abandon an in-progress run silently (either they are
  prevented from going off duty mid-step, or the remaining stops are explicitly released).
- **FR-012**: Each driver MUST see only the work assigned to them; a driver MUST NOT view or act on
  another driver's or another audience's work.

#### Collection run (shops → hub)
- **FR-013**: The app MUST present an assigned collection run as an **ordered round of shop stops**, each
  showing the shop name + address and the package/item count to collect, with pull-to-refresh; rows MUST
  NOT show any monetary value.
- **FR-014**: At a shop the driver MUST see the **package manifest** as a **checkable (tick-or-scan)
  list** — each package showing its reference, destination suburb, and same-day/standard method — and a
  large collect confirm (swipe-to-confirm); marking a shop's packages collected MUST advance that shop
  portion to `collected`.
- **FR-015**: The driver MUST be able to **report a missing or short package** at a shop, recording the
  affected item and a reason, without blocking collection of the rest.
- **FR-016**: When all assigned shops are collected, the app MUST present a **hub check-in** step that
  confirms the packages in (a scanned/checked total), surfaces the **same-day vs standard split** as
  counts (each package's method already known from checkout — the driver does not classify), and via a
  single confirm (swipe) **ends the collection run** and **unlocks** the same-day delivery run. A
  "nothing same-day today" variant MUST exist.
- **FR-017**: At hub check-in, **standard** packages MUST be staged/labelled for the **external delivery
  carrier** and removed from the driver's active work; a standard package's driver-app lifecycle MUST end
  at "checked in at hub".

#### Same-day delivery run (hub → customers)
- **FR-018**: After hub check-in, the app MUST present the **same-day** packages as an **ordered
  same-day delivery run** of **customer drops**, each showing order reference, customer suburb/short
  address, package count, a same-day badge and/or delivery window, and a status; a customer's same-day
  packages collected from multiple shops MUST appear as **one drop**.
- **FR-019**: A same-day drop MUST move through **out for delivery → en route → arrived → delivered**, plus
  a terminal **failed / undeliverable** branch; each transition MUST be a distinct app state, and
  advancing MUST take **at most one primary action** (large bottom button or swipe-to-confirm) reachable
  one-handed at the bottom.
- **FR-020**: The drop detail MUST show the customer name + full address + delivery instructions (pinned
  during en-route and arrived), the packages for the drop, a mini-map, and the current status + next
  action.
- **FR-021**: The home ("Today") MUST be **phase-aware** — a two-up phase indicator showing **Collection
  run vs Same-day run** with the current phase active and the active stop/drop shown below it, plus the
  queue — and MUST show a **counts-only** "N stops/drops remaining today" summary (never currency).

#### Navigation & contact
- **FR-022**: The app MUST hand off turn-by-turn navigation to the device's maps application directed to
  the selected stop's address; it MUST NOT provide its own turn-by-turn.
- **FR-023**: The app MUST provide a **contact customer** affordance on a drop, and any contact it
  enables MUST go through a **masked** channel (call/message) that exposes neither party's real contact
  details — the app MUST NEVER surface a real phone number. ⚠ The masking **relay is a platform
  dependency that does not exist yet** (research R6); until it does, the affordance MAY be
  disabled/limited rather than exposing raw details. The masked relay itself is a recorded follow-on.

#### Proof of delivery
- **FR-024**: On completing a same-day drop the driver MUST choose a proof method from: **photo**,
  **delivery code/OTP**, **signature**, or **contactless leave-at-door**, with an optional **note**.
- **FR-025**: Photo proof MUST support capture, review, and retake before confirm; signature proof MUST
  support draw, clear, and confirm; delivery-code proof MUST verify the entered code and show valid/invalid
  states.
- **FR-026**: A drop MUST NOT be marked **delivered** without a completed proof; on completion the proof
  MUST be stored against the delivery and the underlying order MUST reach `delivered`.
- **FR-027**: On success the app MUST show a satisfying success state and a "Next" affordance.

#### Failed / undeliverable
- **FR-028**: The driver MUST be able to mark a same-day drop **undeliverable** with a required reason
  (nobody home, wrong/incomplete address, customer refused, access blocked, other + note) and a confirm;
  the resulting failed state MUST be recorded for back-office follow-up.

#### Map
- **FR-029**: The app MUST provide a route/all-stops view for the active run, switchable per run via a
  **segmented control** (collection: shop pins → **hub**; delivery: **hub** → customer drop pins), with
  the hub shown as a distinct pin, current location, and a bottom sheet listing the ordered stops; tapping
  a stop MUST open its detail.
- **FR-030**: Map styling — pins and route lines — MUST be **monochrome/neutral** in both light and dark,
  using no third hue.

#### Notifications
- **FR-031**: The system MUST record driver-facing events — **new assignment**, **packages ready to
  collect**, the **same-day delivery window start**, and **completion/shift reminders** — and surface
  them so a driver learns of new work without polling; tapping an assignment MUST open the relevant
  run/stop. ⚠ **Push delivery** of these events is **deferred with a recorded dependency on the platform
  notifications path** (FCM/APNs), which is not yet built; the **in-app activity feed (FR-032) is the
  surface that ships this slice**.
- **FR-032**: The app MUST provide an in-app **activity feed** listing notifications chronologically, with
  an empty state.

#### History
- **FR-033**: The app MUST provide a **read-only** history holding **both record types** — completed
  **collection runs** (with their own timeline) and completed **same-day drops** (with captured proof) —
  grouped by day; drop rows MUST show order reference, customer suburb, completion time, and a proof
  indicator; an empty state MUST exist.
- **FR-034**: A history detail MUST show the status timeline with timestamps, the captured proof (for
  deliveries), addresses, and the packages, all read-only.

#### Account & appearance
- **FR-035**: Account MUST show driver name, avatar/initials, work email, assigned delivery zone,
  **assigned hub**, and vehicle info as **detail rows** (not cards), plus a counts-only "today" summary
  and help/version.
- **FR-036**: The driver MUST be able to select appearance **Light / Dark / Follow-System** (default
  Follow-System), applied immediately and persisted across launches.
- **FR-037**: The driver MUST be able to **sign out** via a confirm dialog, ending the session.

#### Cross-cutting states & resilience
- **FR-038**: The app MUST show loading **skeletons** for run lists and stop detail, a failed-load
  **error + retry** state, a persistent **offline banner**, and a **permission-denied recovery** path.
- **FR-039**: When offline, the app MUST show the cached last-known work and MUST **queue** status-advance
  actions, applying them on reconnect **without double-applying** (a retried action is recognized as the
  same action).

#### Platform & design system
- **FR-040**: The app MUST ship on **Android and iOS** and feel native on each (platform HIG/Material
  chrome); **no web surface** is in scope.
- **FR-041**: The entire UI MUST follow the platform's **monochrome** design system: a neutral grayscale
  ramp as the only accent (inverting between light and dark), the typeface **General Sans**, and exactly
  two semantic colors — error and a non-text success indicator — with **no third hue**.
- **FR-042**: **Dark mode is required** and every screen MUST be designed for both light and dark with
  **WCAG AA** text contrast in both.
- **FR-043**: Primary actions MUST be large, thumb-reachable, and use **fat-finger touch targets** (every
  tappable target at least 48dp), suited to a one-handed driver moving outdoors.
- **FR-044**: The app MUST NOT contain any earnings, tips, pay, cash-out, offer/accept-decline,
  ratings-of-driver, gamification, or storefront/catalog/cart/checkout surfaces.

### Key Entities *(include if feature involves data)*

- **Driver**: an Effy courier employee — identity (name, work email, avatar), assigned **delivery zone**,
  assigned **hub**, **vehicle** info (type, plate), current **duty status**, and account status
  (active/disabled).
- **Duty session**: a period a driver is on duty (start/end), gating assignment.
- **Hub**: the single central Effy warehouse packages are collected back to and same-day runs dispatch
  from — a configurable location (aligned to 047's operating-hub point).
- **Package**: a per-shop portion of a customer order (maps to a shop fulfilment portion) — references the
  order and the shop, carries the **method** (same-day / standard, known from checkout), and moves through
  collection and (for same-day) delivery.
- **Collection task / run**: an assigned task to collect a package (or a shop's packages) from a shop; a
  collection run is the ordered set a driver works before hub check-in.
- **Hub check-in**: the event ending a collection run — records packages as `collected`/received at the
  hub and splits same-day (→ delivery run) from standard (→ external carrier).
- **Same-day delivery task / run**: an assigned customer drop for that customer's same-day packages at the
  hub; a delivery run is the ordered set of drops a driver works.
- **Proof of delivery**: completion evidence for a drop — method (photo/code/signature/contactless), the
  captured artifact and optional note, timestamped, stored privately.
- **Failure record**: the reason + note when a drop is marked undeliverable (or a package missing/short at
  a shop).
- **Status event**: an entry in a task's timeline — status + timestamp — powering history.
- **Notification / activity item**: a driver-facing event (new assignment, ready-to-collect, delivery
  window start, reminder) with a type, timestamp, and link to the relevant run/stop.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A driver can advance any stop (collect, check-in, deliver) to its next state in **one
  primary action** (single tap or single swipe), one-handed.
- **SC-002**: A provisioned driver can go from app launch to **on duty and ready for work** in under
  **60 seconds** (including OTP sign-in) on first use.
- **SC-003**: When an on-duty driver in a zone becomes eligible, ready work is **auto-assigned and
  visible** to them within **30 seconds**, with no manual dispatch by anyone.
- **SC-004**: A collection run of multiple shops ends with **every** collected package recorded and its
  same-day/standard method shown at hub check-in; standard packages are staged for the external carrier
  and no longer appear in the driver's active work.
- **SC-005**: **100%** of same-day drops marked delivered have a stored proof, and no drop can reach
  delivered without one.
- **SC-006**: A customer with same-day packages collected from two shops appears as **exactly one** drop
  on the delivery run.
- **SC-007**: With connectivity lost, the driver still sees the last-known run and can queue at least one
  status-advance action that applies exactly once on reconnect (no duplicate application).
- **SC-008**: A driver only ever sees work assigned to them; an attempt to view another driver's work is
  refused (privacy/isolation holds).
- **SC-009**: Every screen is legible in both light and dark with WCAG AA text contrast, and the UI
  contains **no hue** beyond the neutral ramp and the two permitted semantic colors.
- **SC-010**: Every primary action and tappable row meets the **48dp** minimum touch target.
- **SC-011**: Completing the P1 loop (collection run + same-day delivery run) moves the underlying
  order/fulfilment to **delivered**, replacing the 020 dev-only pickup/delivery stubs.
- **SC-012**: The app contains **zero** earnings/tips/offer/accept-decline surfaces (verified against the
  non-goals list).

## Assumptions

- **Hub-and-spoke model is authoritative.** The driver's flow is collection run (shops → hub) → hub
  check-in → same-day delivery run (hub → customers); standard packages go to an external carrier at hub
  check-in. This is now recorded in the platform description (CLAUDE.md, "Driver logistics model") and
  **evolves 047's "Effy does all delivery"** (standard is now mostly external).
- **Same-day/standard is already known per package** from checkout (047); the driver never classifies.
- **Existing driver Cognito pool is reused.** The driver audience pool already exists and is configured
  for passwordless 6-digit email one-time codes (the platform's custom challenge); a dedicated mobile app
  client may need to be added (as for customer-mobile and shop-mobile).
- **Shared foundations are reused, not rebuilt.** The app reuses the shared design-system (monochrome
  tokens, General Sans, Compose theme), the mobile navigation shell/adaptive kit (015), and the same
  architecture as customer-mobile/shop-mobile (Clean Architecture + MVVM, KMP + Compose).
- **The Claude Design handoff (v2) matches this model.** The updated 46-screen handoff ("Effy Driver App
  v2") re-designed the flow to the hub-and-spoke IA settled here: phase-aware home, a collection run of
  ordered shop stops, the **hub check-in** pivot (scanned total + same-day/standard split, standard staged
  for the carrier), the same-day delivery run, per-run map, and a history holding both run types. The
  design system is unchanged. This spec is the source of truth; where a v2 screen is only partially updated
  or absent it is a design carry-forward, not a spec change.
- **Driver provisioning and management live in back-office.** Creating driver accounts, setting
  zone/vehicle, and disabling them is a back-office responsibility (analogous to 009 shop-user
  provisioning). A minimal provisioning path is assumed available; a full driver-management console is out
  of scope for this slice unless folded in during planning.
- **The hub is a single, configurable location** (aligned to 047's operating-hub point); multi-hub is
  deferred.
- **Standard delivery beyond hub check-in is out of scope.** The external-carrier hand-off mechanism
  (how packages physically reach the carrier, tracking) is not built by the driver app; the app's job is
  to stage/label standard packages at check-in.
- **Auto-assignment uses a point-in-time location snapshot, not streaming.** The app does not continuously
  stream GPS, and live driver location is not exposed to customers in this slice.
- **Turn-by-turn is delegated** to the device's Google/Apple Maps; the in-app map shows pins + an ordered
  stop list only.
- **Masked contact and private proof media reuse platform infrastructure** (a masked relay; private object
  storage with signed access). Exact mechanisms are planning details.
- **Locale.** Placeholder content is Australian (Melbourne suburbs/addresses), timezone
  Australia/Melbourne; no real personal data; no currency is ever shown to the driver.

## Dependencies

- **Fulfilment lifecycle (020)** produces `ready_for_pickup` shop portions — the trigger for a collection
  task — and defines the shop-side states this app advances (`collected`). This slice retires 020's
  dev-only `collected`/`delivered` stubs.
- **Commerce flow / fan-out (019/020)** provides orders, per-shop fulfilment split, customer address, and
  package manifests the driver consumes.
- **Delivery & shipping engine (047)** provides delivery zones, the same-day/standard method per package,
  the operating hub, and the configurable collection schedule + same-day cutoff this model runs on.
- **Notifications/push path** (the platform notifications backbone) is required for US6.
- **Back-office driver provisioning** (assumed minimal adjunct) is required to create the driver accounts
  US1 signs in as.
- **External delivery carrier** consumes standard packages after hub check-in (integration beyond
  staging/labelling is out of scope for this slice).

## Design carry-forwards (from v2 handoff)

- **Return-to-hub for undelivered packages is not yet designed.** A failed/undeliverable drop (FR-028)
  records the failure, but the physical "bring the package back to the hub" step is a v2 "try next" idea,
  not a built screen — treat it as a later refinement, not part of this slice's happy path.
- **Scan-driven check-in is optional.** The design supports tick-or-scan at shop stops and hub check-in;
  a fully scan-driven (barcode) check-in is a possible enhancement, not required by this spec.
- **Partially-completed same-day run** presentation and richer notification anatomy are design polish items
  the plan can refine; the requirements above bound the behavior.

# Feature Specification: Driver Mobile UI Completion

**Feature Branch**: `060-driver-mobile-ui`

**Created**: 2026-09-20

**Status**: Draft

**Input**: User description: "Driver Mobile UI Completion — build every screen of the Effy Driver app (apps/driver-mobile) to match the imported Claude Design project 'Effy Driver App v2' (026586a0-11d6-4403-b0b2-d1f4866d6046, file `Effy Driver App v2.dc.html`, screens in `EffyScreenV2.dc.html`). All 46 design screens must exist and be visually complete. KEEP THE CURRENT COBALT THEME — do NOT adopt the design's retired monochrome inverting accent; adapt the design's layouts/structure/interactions to the live cobalt token set. Where a screen needs data the backend does not supply, render it with clearly-labelled dummy/placeholder data rather than leaving the screen unbuilt, and keep a written register of every screen and field recording whether it is backed by real data or dummy data."

---

## Context

The driver app is the platform's sixth and final client surface. Feature 049 built its **structure** —
sign-in, duty toggle, collection runs, hub check-in, same-day delivery runs, proof capture, history and
activity all exist as working flows against a live backend. What it did not build is the app's
**appearance**: most screens are unstyled functional scaffolding, fourteen screens the design specifies
do not exist at all, and the Map tab is a "coming soon" placeholder.

An audit against the design on 2026-09-20 found, of the design's 46 screens:

- **14 absent entirely** — the map (both modes), en-route, arrived, the report-a-problem screen, help,
  the appearance sub-screen, permission-denied recovery, the offline state, the locked-OTP state, the
  in-app photo proof screen, both loading skeletons, and the failed-load screen.
- **23 present but substantially unstyled** — they render the right information with none of the design's
  layout, hierarchy, or interaction (no swipe-to-confirm, no per-package ticking, no in-app keypad,
  no hero cards, no progress bars, no proof notes).
- **8 close enough** to carry over with content tweaks.
- **1 not an app screen** (the lock-screen push anatomy).

Two additional defects were found in the same audit:

- The sign-in screen shows **shop-operator copy** ("Shop workspace", "Passwordless access for provisioned
  shop operators") — carried over from the shop app and never corrected for drivers.
- The bottom navigation renders **the first letter of each tab label** ("T", "M", "H", "A") where the
  design specifies four distinct glyphs. It is a placeholder that shipped.

⚠ **The design predates the platform's current appearance.** It is drawn on the retired monochrome
inverting accent (near-black on light, near-white on dark). The platform adopted a **cobalt** accent
platform-wide on 2026-09-17. This feature takes the design's **layout, structure, copy and interactions**
and renders them in the **live** token set. The design's colour values are reference, not instruction.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A driver can walk an entire shift on finished screens (Priority: P1)

A driver opens the app off duty, goes on duty, is shown a collection run, drives to each shop, confirms
the packages at every stop, checks the whole load in at the hub, sees the same-day / standard split,
starts the same-day run, drives to a customer, arrives, captures proof, and sees the drop close — and
every screen on that path looks finished.

Today this path is walkable but most of it is unstyled: the Today screen has no current-stop card and no
queue, a shop stop is a read-only list with one button instead of a tickable manifest with a swipe
confirm, the hub split is three plain rows, and "en route" and "arrived" have no screens at all — the
driver taps a button and the status silently changes.

**Why this priority**: This is the app's entire reason to exist and the exact path the design's own
working prototype demonstrates. It is also the only story that, delivered alone, gives Effy something
it can put in front of a real driver.

**Independent Test**: Install the app, sign in, and walk off-duty → on-duty → collection run → shop stop
→ hub check-in → same-day run → drop → en route → arrived → proof → complete, in both light and dark.
Every screen matches its design counterpart in layout, hierarchy and interaction. No screen on the path
is a bare list of default controls.

**Acceptance Scenarios**:

1. **Given** a driver who is off duty, **When** they open the app, **Then** they see the designed
   off-duty screen — a duty pill, the date and location line, the large personal greeting, the shift
   summary figures and a single prominent "Go on duty" action — not a small informational panel.
2. **Given** a driver on duty with an assigned collection run, **When** they open Today, **Then** they
   see a two-phase indicator carrying each phase's own progress detail, a prominent current-stop card,
   a numbered queue of the shops still to come, and the hub as the run's final row.
3. **Given** a driver at a shop stop, **When** they view the manifest, **Then** each package is an
   individually confirmable row showing its reference, destination and method, a running confirmed
   count is visible, and the stop is completed by a deliberate swipe rather than a single tap.
4. **Given** a driver who has collected every shop, **When** they check in at the hub, **Then** they see
   the total checked in, a proportional split between same-day and standard, the state of each portion,
   and a deliberate swipe that ends the collection run and unlocks the delivery run.
5. **Given** a driver with a same-day drop, **When** they start it, **Then** they pass through a distinct
   en-route screen and a distinct arrived screen, each with its own layout and actions, before proof.
6. **Given** a driver capturing proof, **When** they choose a method, **Then** each method has its own
   designed screen, and a note can be attached on every method and on the undeliverable path.
7. **Given** a completed drop, **When** it closes, **Then** the driver sees a designed completion screen
   with the drop's detail, their progress through the run, and a clear route to the next drop.

---

### User Story 2 - Anyone can tell which parts of the app are real (Priority: P1)

An Effy engineer, operator or reviewer opens any screen and can establish, without reading code, whether
what they are looking at came from the platform or was invented to make the screen look finished.

Completing the UI necessarily means rendering things the platform cannot currently supply — a stop's
ETA and distance, a shop's coordinates, a delivery window, a geotag on a proof photo, a dispatch phone
number. Left unmarked, a screen-complete app is indistinguishable from a working one, and someone will
make a decision on a number nobody computed.

**Why this priority**: The repo has shipped defects specifically because something looked correct and
was not. A fabricated ETA on a driver's screen is worse than a blank one: the driver acts on it. The
register is what makes the rest of this feature safe to demonstrate.

**Independent Test**: Open the register document and pick any screen; every field visible on that screen
is listed and classified. Then open the app on that screen and confirm the classification matches what is
rendered. Someone who did not build the feature can do this unaided.

**Acceptance Scenarios**:

1. **Given** the completed feature, **When** a reviewer opens the provenance register, **Then** every one
   of the app's screens appears, and for each screen every field a person can read is classified as
   platform-supplied or placeholder.
2. **Given** a reviewer looking at any screen in the app, **When** they consult the register for that
   screen, **Then** they can classify every field on it without reading code. The app itself carries no
   visual marking — the register is the sole record (operator decision, 2026-09-20).
3. **Given** a field the platform already supplies today, **When** the screen is rebuilt, **Then** it
   continues to read from the platform and is not replaced by a placeholder for visual convenience.
4. **Given** a later slice that makes a placeholder field real, **When** it lands, **Then** the register
   entry for that field is the single place that has to change.
5. **Given** a placeholder value that a driver could act on to their detriment — a stop's ETA, a
   distance, a delivery window — **When** the screen is built, **Then** that field is omitted or shown as
   unavailable rather than invented, because with no in-app marking a fabricated number is
   indistinguishable from a computed one.

---

### User Story 3 - A driver can see their run on a map (Priority: P2)

A driver opens the Map tab and sees the shape of their work — for a collection run, the shops leading to
the hub; for a same-day run, the hub leading out to the drops — with a segmented control to switch
between them and an ordered list of stops beneath.

Today the Map tab opens a "coming soon" message. It is the app's only dead end, and it occupies a
permanent quarter of the bottom navigation.

**Why this priority**: It is the single most visible hole in the app — a driver taps a tab that exists
and is told to come back later. It is separable from the shift loop and can be demonstrated on its own.

**Independent Test**: Open the Map tab. Both modes render, the segmented control switches between them,
the stop list beneath matches the active run, and nothing says "coming soon" anywhere in the app.

**Acceptance Scenarios**:

1. **Given** a driver on a collection run, **When** they open the Map tab, **Then** they see the
   collection view with the hub distinguished from the shops, and an ordered stop list beneath.
2. **Given** that view, **When** they switch the segmented control to the same-day mode, **Then** the
   view and the list change to the delivery run without leaving the tab.
3. **Given** any stop in the list, **When** the driver taps it, **Then** they reach that stop's or drop's
   own screen.
4. **Given** the completed feature, **When** any tab is opened, **Then** no "coming soon" placeholder
   appears anywhere in the app.
5. **Given** the map view, **When** it renders, **Then** it shows real **OpenStreetMap** cartography
   (operator decision, 2026-09-20 — chosen because it needs no vendor key, account or billing), with the
   attribution its licence requires.
6. **Given** that the platform holds no coordinates for shops, the hub or customer addresses, **When**
   the map places its markers, **Then** those positions are placeholder and recorded as such in the
   register — the map itself is real, the points on it are not.

---

### User Story 4 - A driver can manage their own account (Priority: P2)

A driver opens Account and sees who they are, their zone, hub and vehicle, their current duty status,
and can reach appearance settings, help and sign-out — each as its own finished screen.

Today Account shows a name, an email, three rows, an inline appearance control and a sign-out button.
There is no avatar, no duty-status row, no appearance screen, and **no help screen at all** — a driver
who needs dispatch has nowhere in the app to find them.

**Why this priority**: Self-service is what stops a driver phoning a supervisor, and "how do I reach
dispatch" is the most likely thing a driver needs and cannot currently get. Independent of the shift loop.

**Independent Test**: Open Account and reach every sub-screen. Change appearance and see it applied and
remembered. Open help and find dispatch contact. Attempt sign-out and see the confirmation.

**Acceptance Scenarios**:

1. **Given** a signed-in driver, **When** they open Account, **Then** they see an identity block with
   their initials, and a single list of rows covering duty status, zone, hub, vehicle, appearance, help
   and sign out, with sign out visually distinguished as the destructive one.
2. **Given** Account, **When** the driver opens appearance, **Then** a dedicated screen offers light,
   dark and follow-system, each with an explanation, and the current choice is shown as selected.
3. **Given** Account, **When** the driver opens help, **Then** they can reach dispatch and find the
   information the design specifies for that screen.
4. **Given** a driver with work remaining, **When** they attempt to sign out, **Then** the confirmation
   states what happens to the work they still hold, not a generic warning.

---

### User Story 5 - First run and sign-in look like the driver's app (Priority: P3)

A driver launching the app for the first time sees an Effy Driver splash, a sign-in screen written for
drivers, a code entry that behaves the same way every time, and a permissions explanation before the
operating system asks for anything.

Today the launch screen is a centered word and a spinner, the sign-in screen tells drivers they are
signing into a **shop workspace**, and there is no state for an account locked out after too many
attempts — a driver who is locked out sees the same message as one who mistyped.

**Why this priority**: It is every driver's first impression and it currently names the wrong audience.
It is contained entirely within the pre-session flow and touches nothing else.

**Independent Test**: Launch cold, sign in, and force each code-entry outcome — correct, wrong,
expired, locked. Every state is distinguishable and correctly worded for a driver.

**Acceptance Scenarios**:

1. **Given** a cold launch, **When** the app starts, **Then** a branded Effy Driver splash appears.
2. **Given** the sign-in screen, **When** a driver reads it, **Then** every word addresses a driver and
   an Effy work email; no text refers to shops, shop operators or a shop workspace.
3. **Given** code entry, **When** a driver submits a wrong, expired or exhausted code, **Then** each
   outcome is a distinct, named state telling them what to do next.
4. **Given** a first sign-in, **When** onboarding runs, **Then** the driver is told why each permission
   is needed before the operating system asks, with the design's progress indication.
5. **Given** a driver who refused a permission the app needs, **When** they reach a screen that needs it,
   **Then** they see a recovery screen explaining the consequence and offering a route to settings.

---

### User Story 6 - Every wait, failure and outage has a designed state (Priority: P3)

A driver loading a screen, hitting a failure, or working without signal sees something the team designed,
not a spinner in the middle of an empty frame.

Today every load is a centered progress indicator, every failure is a line of red text in place, and the
offline case — despite a working offline write queue underneath — has no interface at all. A driver in a
basement loading dock cannot tell whether the app is broken or the signal is.

**Why this priority**: A loading dock is where this app is used. Getting this wrong makes a working app
feel broken. Independent of every other story.

**Independent Test**: Force each condition — slow load, failed load, no connectivity — on both a list
screen and a detail screen, and confirm each shows its designed state.

**Acceptance Scenarios**:

1. **Given** a screen loading, **When** it has not yet resolved, **Then** the driver sees a skeleton
   matching the shape of the content that is coming, not a generic spinner.
2. **Given** a load that failed, **When** the driver sees it, **Then** they get a named failure, an
   explanation that their work is safe, and a retry action.
3. **Given** no connectivity, **When** the driver uses the app, **Then** a persistent indicator says so,
   the last synced run stays readable and is marked as cached, and the driver is told their confirmations
   will upload on reconnect.

---

### User Story 7 - History and activity are complete records (Priority: P3)

A driver reviewing past work sees both run types with their own records, the proof they captured, and an
activity feed they can clear.

Today history exists but a completed drop says "photo captured" instead of showing it, a collection run
gets the same generic detail layout as a drop, and the activity feed shows a body with no title and has
no way to mark everything read.

**Why this priority**: Read-only, lowest risk, and a driver only needs it when something is disputed —
which is exactly when showing the actual proof matters.

**Independent Test**: Complete a drop and a run, open each from history, and confirm each has its own
record layout, its timeline, and — for a drop — the proof as captured.

**Acceptance Scenarios**:

1. **Given** a delivered drop, **When** the driver opens its history record, **Then** the captured proof
   is shown, with when and where it was taken.
2. **Given** a completed collection run, **When** the driver opens its record, **Then** they see the
   run's own summary and timeline, distinct from a drop's.
3. **Given** unread activity, **When** the driver marks all read, **Then** every item clears at once, and
   each item shows both its headline and its detail.

---

### Edge Cases

- What happens when a collection run has exactly one shop, or a same-day run exactly one drop — does the
  queue section collapse or show an empty heading?
- What happens when a hub check-in produces zero same-day packages? (The design gives this its own screen
  with different copy and a different closing action.)
- What happens when a driver arrives at a drop whose customer has no delivery instructions — does the
  instruction call-out disappear or show an empty box?
- What happens when a driver's profile has no zone, hub or vehicle assigned — a common state for a newly
  provisioned driver?
- How does a screen behave when a field is placeholder AND empty, versus platform-supplied and empty?
  These must not look the same.
- What happens on a tablet or a large phone in landscape — the design is drawn at one phone size only.
- What happens when a driver rotates the device or the app is killed mid-swipe on a confirm gesture?
- How does a partially-confirmed package manifest behave if the driver leaves the stop and returns?
- What happens when a driver is signed out remotely while a run is open?
- What does the app do with the design's sample content (a named person, Melbourne street addresses,
  order references) — none of it may reach a real driver's screen as if it were theirs.

---

## Requirements *(mandatory)*

### Functional Requirements

#### Screen coverage

- **FR-001**: The app MUST provide a finished screen for each of the 45 in-app screens the design
  specifies: `splash`, `email`, `otp`, `otp-verifying`, `otp-invalid`, `otp-expired`, `otp-locked`,
  `perms`, `perm-denied`, `offduty`, `home`, `home-delivery`, `home-empty`, `home-offline`, `skeleton`,
  `error`, `collection-run`, `shop-stop`, `shop-problem`, `hub-checkin`, `hub-checkin-empty`,
  `delivery-run`, `drop-detail`, `enroute`, `arrived`, `proof-pick`, `proof-photo`, `proof-code`,
  `proof-sign`, `proof-contactless`, `success`, `failed`, `map-collection`, `map-delivery`, `activity`,
  `activity-empty`, `history`, `history-detail`, `history-run`, `history-empty`, `account`, `appearance`,
  `help`, `signout`, `detail-skeleton`.
- **FR-002**: The 46th design screen, `push`, is the operating system's own lock-screen rendering and is
  NOT an app screen. Its **content** (what each notification says) MUST match the design; its
  presentation is the OS's.
- **FR-003**: No screen in the app may present a "coming soon" or equivalent placeholder. Every
  navigable destination MUST render its own finished content.
- **FR-004**: Each screen MUST reproduce its design counterpart's information architecture — the same
  content in the same order, hierarchy and grouping — and its stated interactions.

#### Appearance

- **FR-005**: The app MUST render in the platform's **current** accent (cobalt), taken from the shared
  design-system token source. The design's retired monochrome inverting accent MUST NOT be adopted, and
  no colour value MUST be transcribed from the design into the app.
- **FR-006**: Every screen MUST work in both light and dark appearance, and the driver MUST be able to
  choose light, dark or follow-system.
- **FR-007**: The app MUST NOT introduce any colour outside the shared token set. Where the design uses
  its accent to carry meaning, the app MUST use the live accent in the same role.
- **FR-008**: Every interactive target MUST meet the platform's minimum touch-target size. The bottom
  navigation MUST use distinct per-tab glyphs, not letters derived from the tab's label.
- **FR-009**: Transitions and state changes MUST carry the design's micro-animations, and MUST respect a
  device-level reduced-motion preference.

#### Content and copy

- **FR-010**: All copy MUST address the **driver** audience. No text anywhere in the app may refer to
  shops, shop operators or a shop workspace as the signed-in audience.
- **FR-011**: The app MUST NOT display currency, earnings, pay, tips or any monetary figure. Every number
  a driver sees is a count, a distance, a time or a duration. This is the design's own stated boundary
  and the driver app's existing rule.
- **FR-012**: The design's sample content — its named driver, its street addresses, its order references,
  its dispatch phone number — MUST NOT be presented to a real driver as their own data.

#### Data provenance

- **FR-013**: The feature MUST produce a **provenance register** listing every screen in the app and,
  for each, every field a person can read, classified as **platform-supplied** or **placeholder**.
- **FR-014**: A field the platform supplies today MUST continue to be read from the platform. This
  feature MUST NOT replace real data with placeholder data to simplify a layout.
- **FR-015**: Where the design shows a field the platform cannot supply, the app MUST render it as a
  placeholder rather than omitting the field and losing the design's layout — EXCEPT where showing a
  fabricated value would mislead a driver into acting on it, in which case the field MUST be omitted or
  shown as explicitly unavailable, and the register MUST record that decision and its reason.
- **FR-016**: Placeholder content MUST NOT be visually marked in the running app (operator decision,
  2026-09-20). The register is the sole record. ⚠ **Consequence**: because a driver cannot see which
  values are invented, FR-015's carve-out is the only protection against a fabricated number being
  acted on — so any placeholder a driver could reasonably act on MUST be omitted or shown as
  unavailable, not invented. Decorative and structural placeholders (a shop's sample name, a photo
  thumbnail, a map marker's position) are unaffected.
- **FR-017**: The register MUST be the single place a field's provenance is recorded, so that a later
  slice making a field real changes one entry.
- **FR-017a**: The register MUST record, for each placeholder field, the condition that would make it
  real — so it doubles as the backlog of what the platform still owes this app.

#### Interactions the design introduces

- **FR-018**: Completing a shop stop and ending a collection run MUST each require a deliberate swipe
  gesture, not a single tap, and the gesture MUST be cancellable before it commits.
- **FR-019**: A shop stop's packages MUST be individually confirmable, with a visible running count of
  how many are confirmed, and the stop's completion action MUST reflect that count.
- **FR-020**: Code entry — both the sign-in code and the delivery code — MUST use the design's discrete
  digit boxes with an in-app keypad, so the driver's hands do not leave the app's own surface.
- **FR-021**: Reporting a problem at a shop MUST be its own screen on which the driver identifies the
  package, states what is wrong, and may add a note — and MUST NOT block the rest of the stop or the run.
- **FR-022**: Every proof method MUST accept an optional note, and the undeliverable path MUST accept a
  reason **and** an optional note.
- **FR-023**: The contactless proof path MUST offer the design's set of named drop locations as a
  selection, rather than requiring the driver to type where they left the package.

#### The map

- **FR-023a**: The map MUST render **OpenStreetMap** cartography and MUST NOT require a vendor account,
  API key or billing relationship.
- **FR-023b**: The map MUST carry the attribution OpenStreetMap's licence requires, visible to the
  driver on any screen showing map cartography.
- **FR-023c**: Marker positions MUST be placeholder, because the platform holds no coordinates for
  shops, the hub or customer addresses. The register MUST record this, and MUST name obtaining that
  geodata as the condition that makes the map real.
- **FR-023d**: The map MUST distinguish the hub from ordinary stops, and MUST show the run's stops in
  their sequence.
- **FR-023e**: ⚠ If planning finds that OpenStreetMap cartography cannot be rendered on **both**
  platforms without unacceptable cost, the fallback is the design's own stylised route representation,
  and the reason MUST be recorded in the plan. Under no circumstances does the Map tab remain a
  placeholder (FR-003).

#### Not breaking what works

- **FR-024**: Every flow feature 049 built MUST continue to work end to end. This feature changes how
  screens look and what they contain, not what the app can do.
- **FR-025**: The shared mobile packages this app uses MUST NOT change in a way that alters the customer
  or shop mobile apps. Where a component is genuinely shared, a change MUST be proven not to affect them.

### Key Entities

- **Screen**: One of the app's destinations. Has a design counterpart, an appearance in light and dark,
  a set of readable fields, and a set of states (loading, loaded, empty, failed, offline).
- **Readable Field**: Anything on a screen a driver can read. Carries exactly one provenance
  classification and, when placeholder, a reason it cannot yet be real and the condition that would make
  it real.
- **Provenance Register**: The document binding screens to their fields' classifications. The single
  authority on what in this app is real.
- **Placeholder Fixture**: A set of invented values standing in for data the platform does not supply.
  Never derived from the design's own sample people or addresses.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All 45 in-app design screens exist and render. A reviewer can reach and photograph every
  one of them.
- **SC-002**: Zero destinations in the app show a "coming soon" or unfinished placeholder.
- **SC-003**: A reviewer who did not build the feature can walk the design's own demonstration path —
  off duty through to a completed drop — without encountering a screen that looks unfinished.
- **SC-004**: The provenance register covers 100% of the app's screens, and 100% of the fields visible on
  each, with no field unclassified.
- **SC-005**: Given any screen in the running app, a reviewer holding the register can correctly
  classify every field on it within 30 seconds. Picking five screens at random, the register's
  classification matches what the app renders in all five.
- **SC-006**: Every screen is legible and correctly laid out in both light and dark appearance, verified
  screen by screen.
- **SC-007**: No monetary figure appears anywhere in the app, verified by an exhaustive sweep.
- **SC-008**: No text in the app refers to the signed-in person as a shop or shop operator, verified by
  an exhaustive sweep.
- **SC-009**: Every field that reads from the platform before this feature still reads from the platform
  after it — none regressed to a placeholder.
- **SC-010**: The app's accent matches the platform's current accent on every screen; no colour value
  from the design appears in the app's source.
- **SC-011**: Every interactive target meets the platform's minimum touch-target size, verified on the
  smallest supported screen.
- **SC-012**: All of the customer and shop mobile apps' existing checks pass unchanged, demonstrating
  this feature did not alter shared behaviour.
- **SC-013**: A driver can complete a shop stop and end a collection run only by a deliberate gesture;
  an accidental single tap cannot advance either.
- **SC-014**: The Map tab renders OpenStreetMap cartography with its required attribution on both
  platforms, and the app ships with no map vendor key or credential of any kind.
- **SC-015**: No placeholder value that a driver could act on operationally — an ETA, a distance, a
  delivery window, a dispatch number — is presented as though it were computed. Verified field by field
  against the register.

---

## Assumptions

- **The design is reference, not source.** It is read from the Claude Design project through the design
  tooling and is not committed to this repository. Its layout, structure, copy, interactions and
  information architecture are adopted; its colour values are not.
- **No backend work.** This feature changes the driver app's presentation only. It adds no endpoint, no
  database column and no migration. Any field the platform does not already supply becomes a placeholder
  and a register entry, not a backend request.
- **✅ Governance dependency — DISCHARGED 2026-09-20.** The constitution stated, at v1.13.0, that the
  brand was monochrome with an inverting accent and no brand hue — which would have forbidden this
  feature outright. It was amended to **v2.0.0** (MAJOR) before planning: cobalt is now the one action
  colour, the inverting-accent rule is retired, and the monochrome ramp joins Emerald and Jade as a
  retired palette. This feature builds on the amended law, not against the old one.
- **⚠ Card layouts.** The design is built on cards — a hero stop card, per-stop cards, a proof-method
  list. The constitution's "no card layouts" rule carries an escape clause requiring the justification
  to be recorded in the plan. That justification is owed during planning, per screen that uses one.
- **⚠ The map is real; its contents are not.** OpenStreetMap was chosen (operator, 2026-09-20) because
  it is free of vendor keys and billing. But feature 049 recorded — and it is still true — that **shops
  carry no address or coordinates and orders carry an un-geocoded address**, so nothing on the platform
  can be plotted. Real cartography with placeholder markers is therefore the honest outcome: the map is
  genuine, the pins are invented, and the register says so. Acquiring shop addresses and geocoding is a
  backend slice this feature deliberately does not attempt.
- **⚠ The map is this feature's largest unknown.** Rendering OpenStreetMap inside a shared mobile
  presentation layer needs a per-platform component on both Android and iOS. Cost and approach are a
  planning question; FR-023e records the fallback so the Map tab cannot end up unfinished either way.
- **Placeholder content is unmarked in the app.** The operator chose the register as the sole record
  (2026-09-20), keeping screens clean for review and screenshots. This raises the stakes on FR-015: with
  no visual marking, the judgement about what may be invented and what must be omitted is the only
  safeguard, and each such decision is recorded in the register with its reason.
- **Phone-first.** The design is drawn at a single phone size. Larger screens are expected to reflow
  sensibly but are not separately designed; the app's existing adaptive navigation behaviour is retained.
- **The register lives in the repository** as a document beside this specification, so it is versioned
  with the code it describes and can be checked as part of the feature's own gates.
- **Sample content is discarded.** Every name, address, order reference and phone number in the design is
  illustrative. Placeholder fixtures are authored fresh and are recognisably not real.
- **Both platforms.** The app ships on Android and iOS from one shared presentation layer; "every screen
  exists" means on both.
- **Existing flows are the contract.** What feature 049 built — the runs, the statuses, the proof
  methods, the offline queue — defines what the screens are allowed to do. This feature does not
  redesign the operating model.

---

## Out of Scope

- Any backend, database or infrastructure change.
- Making a placeholder field real — each is recorded in the register as a later slice's work.
- The masked-contact relay (a driver calling a customer without seeing their number), which remains
  unbuilt and stays a disabled affordance with a stated reason.
- Redesigning the hub-and-spoke operating model, the run types, or the proof methods.
- The customer, shop and back-office surfaces.
- Telemetry and analytics events for the new screens.

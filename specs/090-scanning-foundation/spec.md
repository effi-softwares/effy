# Feature Specification: Package Scanning — Foundations

**Feature Branch**: `090-scanning-foundation`

**Created**: 2026-10-16

**Status**: Draft

**Input**: User description: "Scanning foundations (driver backlog H4–H11, the parts that don't depend on the redesign's screens): the one scan rule in the driver app's shared code (H5), the camera scanner component — Android and iOS — (H4), and the platform side: recording how each package was handed over (scan / typed / by hand), a per-package hub sort instruction, and a 'load the van' step. Screens wait for the design."

## Background

Every package now carries a label with its own code (089). Scanning will make each hand-over — shop to
driver, driver to hub, hub to van, van to door, and failed parcels back to the hub — a scan of the bag,
with today's ticks and swipes kept as the fallback ([docs/driver-app-barcode-scanning.md](../../docs/driver-app-barcode-scanning.md)).

The scanning SCREENS belong to the driver app redesign, which is not ready. This feature builds
everything underneath them, so the screens can be drawn onto finished parts:

- the one rule that decides what a scan means, in the app, working with no signal;
- the camera component that reads labels;
- the platform recording how each package was handed over, giving each package its sorting
  instruction at the hub, and accepting "the van is loaded" as one step.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Every scan means one thing, decided on the phone (Priority: P1)

Whatever step a driver is on, a read from the camera (or a typed code) is judged by one rule: it is a
package expected here and not yet scanned (accepted), one already scanned (ignored quietly), a package
for another stop or address on the driver's work (a hard stop that names where it belongs), a package
not on the driver's work at all, or not an Effy label (a product's own barcode — ignored silently).

**Why this priority**: Every scanning screen to come is a view of this rule. Getting it right once, on
the phone and offline, is what makes the wrong-bag-at-the-wrong-door mistake impossible.

**Independent Test**: Feed the rule each kind of read for each step (shop, hub, load, door, return) and
check the outcome.

**Acceptance Scenarios**:

1. **Given** a shop stop expecting packages A and B, **When** A's label is read, **Then** it is accepted
   and the stop shows 1 of 2.
2. **Given** A was already accepted, **When** A is read again, **Then** it is "already scanned" and
   nothing changes.
3. **Given** a drop for one address, **When** the label of a package for another drop on the same run
   is read, **Then** the result is a hard stop naming that other drop, and it is not counted.
4. **Given** any step, **When** a label for a package on none of the driver's work is read, **Then**
   the result is "not on your work".
5. **Given** any step, **When** a product barcode or anything that is not an Effy label is read,
   **Then** it is ignored without a sound or message.
6. **Given** the phone has no signal, **When** labels are read, **Then** every result above is still given.

---

### User Story 2 - The phone's camera reads labels (Priority: P1)

A camera view, ready to be placed on any scanning screen, reads Effy labels continuously — QR code or
barcode, at any angle — with a torch for dark loading docks, and reports each code once per pass (the
same label held in view is not read again for two seconds).

**Why this priority**: Without a reader there is nothing to judge. Both platforms the drivers carry
must read the same labels the same way.

**Independent Test**: Point the camera view at printed labels on each layout (roll, 4×6, A4) on an
Android and an iOS phone; each reads first time, product barcodes are ignored, the torch works.

**Acceptance Scenarios**:

1. **Given** a printed label, **When** the camera view sees its QR code or its barcode, **Then** the
   label's code is reported once.
2. **Given** a label held in view, **When** two seconds have not passed, **Then** it is not reported again.
3. **Given** a product's own barcode, **When** it is in view, **Then** nothing is reported.
4. **Given** a dark loading dock, **When** the driver turns the torch on, **Then** the camera light comes on.
5. **Given** the driver has refused the camera, **When** the view is shown, **Then** it says so and the
   screen's tick-by-hand fallback remains.

---

### User Story 3 - The platform records how each package was handed over (Priority: P2)

Every hand-over the driver makes (collected at a shop, checked in at the hub, loaded into the van,
handed over at the door, returned to the hub) can say, per package, whether it was scanned, typed or
ticked by hand. The platform keeps that record.

**Why this priority**: It is what lets dispatch see which shops' labels fail and which hand-overs skip
scanning (backlog H12). It costs nothing to the driver.

**Independent Test**: Send each hand-over with methods for its packages; the record shows one entry per
package per hand-over, with its method. Send it without methods (today's app); nothing is recorded and
nothing else changes.

**Acceptance Scenarios**:

1. **Given** a collect with A scanned and B ticked by hand, **When** it is sent, **Then** the record
   shows A as scan and B as manual for that collection.
2. **Given** a hand-over sent twice (a retry), **When** it is recorded, **Then** each package has one
   entry for it.
3. **Given** a hand-over from an app that sends no methods, **When** it is recorded, **Then** it behaves
   exactly as today.

---

### User Story 4 - Each package knows where it goes at the hub (Priority: P2)

Before the driver reaches the hub, each package on their collection run carries its sorting instruction
in the platform's own words: **LOAD NOW** with its window for today's Effy delivery, **SHELVE** with its
day for a later Effy delivery, or **COURIER BAY**.

**Why this priority**: The hub scan (H7) shows this per package with no signal; the instruction has to
be on the phone before the scan.

**Independent Test**: Read a collection run holding a today parcel, a later-day parcel and a courier
parcel; each carries the right instruction.

**Acceptance Scenarios**:

1. **Given** an Effy parcel for a window today, **When** the run is read, **Then** its instruction is
   LOAD NOW with the window's words.
2. **Given** an Effy parcel for a later day, **Then** SHELVE with the day's words.
3. **Given** a courier parcel, **Then** COURIER BAY.

---

### User Story 5 - "The van is loaded" is one step (Priority: P2)

When a delivery run opens, the driver loads the van once; every drop on the run becomes out for
delivery together, instead of being started one by one.

**Why this priority**: It replaces the per-drop "Start this drop" (backlog E2/H8) with what actually
happens at the hub, and it is what the load scan (S3) will complete.

**Independent Test**: Load a run with three staged drops; all three are out for delivery, once, however
many times the request is sent; refused before the run opens.

**Acceptance Scenarios**:

1. **Given** a run with staged drops, **When** it is loaded, **Then** every staged drop is out for
   delivery and no drop already further along is moved back.
2. **Given** the run has not opened, **When** loading is attempted, **Then** it is refused with when it opens.
3. **Given** the same load sent again, **Then** nothing changes the second time.

### Edge Cases

- **A torn label** — the code is typed instead; the same rule judges it; recorded as typed.
- **One package read at two steps of the same visit** — each step judges against its own expected list.
- **A drop with two packages from different shops** — both are expected at the door; one scanned is "1 of 2".
- **A parcel moved to courier after collection** — its instruction is COURIER BAY on the next read.
- **A load while one drop is already arrived** (driver started it the old way) — that drop stays where it is.
- **Unknown method value from a future app** — ignored, the hand-over still succeeds.

## Requirements *(mandatory)*

### Functional Requirements

**The scan rule (app)**

- **FR-001**: The app MUST judge every read with one rule shared by all scanning steps, returning exactly
  one of: accepted, already scanned, belongs elsewhere (naming the other stop or drop), not on your work,
  not an Effy label.
- **FR-002**: The rule MUST work with no connection, from the work the phone already holds.
- **FR-003**: The app's reading of a label MUST match the platform's (`EFY1:` + code, 089), proven by one
  set of example reads both sides are tested against.

**The camera reader (app)**

- **FR-004**: The app MUST provide a camera reader for Android and iOS that reads only the two label
  symbologies (QR and Code 128), reports a code at most once per two seconds while it stays in view, and
  ignores anything that is not an Effy label.
- **FR-005**: The reader MUST offer the torch where the phone has one, and MUST report that the camera is
  unavailable or refused so the screen can fall back to ticking by hand.

**Hand-over methods (platform)**

- **FR-006**: The collect, hub check-in, proof of delivery and return-to-hub actions, and the new load
  action, MUST accept for each package how it was handed over: scan, typed or manual. The field is optional.
- **FR-007**: The platform MUST keep one record per package per hand-over (step, method, driver, time),
  written with the hand-over itself, never duplicated by a retry.
- **FR-008**: A hand-over sent without methods MUST behave exactly as today.

**Sort instruction (platform)**

- **FR-009**: Each package on a collection run read MUST carry its hub instruction: LOAD NOW (Effy,
  today, with the window's words), SHELVE (Effy, a later day, with the day's words) or COURIER BAY —
  in the platform's words, never derived by the app.

**Load the van (platform)**

- **FR-010**: Drivers MUST be able to mark a delivery run loaded in one action: every staged drop becomes
  out for delivery; drops further along are untouched; refused before the run opens; safe to repeat.

**Out of scope**

- **FR-011**: The scanning screens, sounds, flashes and the auto-complete bar (they follow the redesign),
  Bluetooth ring scanners (H14), and dispatch's scan-versus-manual views (H12).

### Key Entities

- **Hand-over record**: one package, one hand-over step (collect, check-in, load, deliver, return), how
  it was done (scan, typed, manual), which driver, when.
- **Sort instruction**: per package on a collection run — LOAD NOW / SHELVE / COURIER BAY, with words.
- **Scan result** (app only): accepted / already scanned / belongs elsewhere / not on your work / not an
  Effy label.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A printed label is read in under 1 second in normal light on a mid-range phone, on both platforms.
- **SC-002**: 100% of wrong-address reads in the rule's tests are hard stops; 0 are counted.
- **SC-003**: Every scan result is available with the phone offline.
- **SC-004**: Every hand-over sent with methods produces exactly one record per package.
- **SC-005**: A delivery run's drops all go out for delivery in one action.

## Assumptions

- Package codes are on the phone already (089) for collection and delivery work.
- The camera permission is asked by the existing permission screen; the reader only reports its state.
- The current app keeps its per-drop "Start this drop"; the load step is available for the redesign to use.
- One hub.

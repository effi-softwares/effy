# Feature Specification: Package Labels

**Feature Branch**: `089-package-labels`

**Created**: 2026-10-16

**Status**: Draft

## Clarifications

### Session 2026-10-16

- Q: Does the label show the customer's delivery window or day? → A: **No — EFFY or COURIER only.** The
  platform's locked rule is that a shop is told who takes a package away ("Effy driver" / "Courier")
  and nothing else about delivery — never a window, day or estimate (079). The shop prints and sees the
  label, so a window on it would breach that. Where a parcel goes at the hub is given by the scan
  (backlog H7), not read off the bag. (Planning decision; the operator may revisit.)

**Input**: User description: "Package labels (driver backlog H1–H3). Every package — one shop's portion of one order — gets its own short package code (6 characters, no look-alike characters, unique, created when the order is paid; older paid orders get one the first time they are read). Shops print a label per package at the pack step in the shop console: a QR code and a Code 128 barcode carrying the same token EFY1:<code>, the code in large type, the order number with "package n of m", who delivers (EFFY with its window/day, or COURIER), the destination suburb, and a cold/frozen mark. Never the shop name, customer name, street or prices. Layouts: 62 mm thermal roll, 4x6 in, and A4 sticker sheet; reprint any time; courier parcels get one too. The driver's reads (today, collection stop, hub, delivery run, drop) carry each package's code so the driver app can later match scans with no signal. This is the prerequisite for scanning (H4–H11); no scanning is built here. Source: docs/driver-app-backlog.md Epic H and docs/driver-app-barcode-scanning.md §3 and §6."

## Background

An Effy order can be filled by several shops; each shop's portion travels as one **package**. Today a
package has no identity a person or a phone can read off the bag: every package of an order carries
the same order number, so "EF-20481" on three bags says nothing about which bag is which. Drivers tick
packages by hand from a list, and nothing stops the wrong bag being handed to the wrong door.

Scanning (driver backlog H4–H11) will make each hand-over — shop to driver, driver to hub, hub to van,
van to door — a scan of the bag. Nothing can be scanned until each bag carries a label. This feature
gives every package its own code and lets shops print its label. No scanning is built here.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Every package has its own code (Priority: P1)

When an order is paid, each of its packages is given a short code of its own, which nobody else's
package will ever have. Staff, shops and drivers see the code beside the package wherever the package
is shown.

**Why this priority**: Every other part of this feature — and all of scanning — identifies a package
by this code.

**Independent Test**: Pay an order filled by two shops. Each package shows a different 6-character
code, and the same code everywhere it appears (shop console, back-office order, driver's stop).

**Acceptance Scenarios**:

1. **Given** an order filled by three shops, **When** it is paid, **Then** it has three packages with
   three different codes, each 6 characters from an alphabet without look-alike characters.
2. **Given** an order paid before this feature, **When** any of its packages is first shown with its
   code, **Then** it is given one then, and keeps it.
3. **Given** a package with a code, **When** it is shown again anywhere, **Then** the code is the same.

---

### User Story 2 - A shop prints a label for each package (Priority: P1)

At the pack step, shop staff press "Print labels" and get one label per package of that order from
their shop, laid out for their printer. They stick it on the bag. They can print it again at any time
(a torn or lost label).

**Why this priority**: The label is what puts the code on the bag. Without it nothing can be scanned.

**Independent Test**: Open a packed order in the shop console, print labels on each layout, and check
each label shows every required element and none of the forbidden ones.

**Acceptance Scenarios**:

1. **Given** an order the shop is packing, **When** staff choose "Print labels", **Then** they get one
   label per package of that order from their shop, and choose the layout: 62 mm thermal roll,
   4×6 in, or an A4 sticker sheet.
2. **Given** a label, **When** it is printed, **Then** it shows: a QR code and a barcode carrying the
   same machine-readable value; the package code in large type; the order number with "package n of
   m"; who delivers — **EFFY** with the day and window the customer chose, or **COURIER**; the
   destination suburb; and a cold or frozen mark when the package holds such goods.
3. **Given** any label, **When** it is printed, **Then** it never shows the shop's name, the
   customer's name, the street address, or any price.
4. **Given** a package whose label was printed earlier, **When** staff print again, **Then** the same
   label comes out (same code).
5. **Given** a courier order, **When** its labels are printed, **Then** each package gets an Effy
   label as well as the courier's own label.

---

### User Story 3 - The driver's phone knows every package's code (Priority: P2)

Everything the driver app reads about the packages in a driver's work — a collection run and its shop
stops, a delivery run and its drops — carries each package's code, so a later version of the app can
match a scanned label to a package with no signal.

**Why this priority**: Not visible to anyone yet; it is what lets scanning work offline when it
arrives, and it is cheap to do with the code in place.

**Independent Test**: Read a driver's collection stop and delivery drop; every package listed carries
its code, matching the printed label.

**Acceptance Scenarios**:

1. **Given** a driver's shop stop, **When** it is read, **Then** each package on it carries its code.
2. **Given** a delivery run and a drop, **When** they are read, **Then** each package carries its code.
3. **Given** an installed driver app from before this feature, **When** it reads the same work,
   **Then** it keeps working unchanged.

### Edge Cases

- **A package added or split after payment** (a substitution moves items between shops): any new
  package gets its own code when it comes into existence; existing codes never change.
- **An order cancelled or refunded**: its codes are kept — they must never be given to another
  package, so a stale label can never match someone else's bag.
- **A label read by a person** (torn, wet): the code in large type is enough to identify the package;
  typing it is a later scanning feature (H11).
- **Who delivers changes after printing** (staff move the order to courier): the printed label shows
  what was true when printed; reprinting shows the current one. The code — what a scan reads — never
  changes.
- **A package with both cold and frozen goods**: the label shows the colder mark (frozen).
- **The browser's print dialog is cancelled**: nothing is recorded; printing has no effect on the
  order.

## Requirements *(mandatory)*

### Functional Requirements

**The code**

- **FR-001**: Every package MUST have a package code: 6 characters from an alphabet that excludes
  look-alike characters (no O/0, I/1/L, and similar), unique across all packages ever.
- **FR-002**: A code MUST be given when the order is paid; a package from before this feature MUST be
  given one the first time it is read with its code, and keep it.
- **FR-003**: A code MUST never change, never be reused, and carry nothing about the customer, the
  shop or the contents.
- **FR-004**: The machine-readable value on a label MUST be `EFY1:` followed by the code, so a reader
  can tell an Effy package label from any other barcode (for example a product's own barcode).

**The label**

- **FR-005**: The shop console MUST offer "Print labels" for an order the shop is packing or has
  packed, producing one label per package of that order from that shop, and allow reprinting at any
  time afterwards.
- **FR-006**: The label MUST show the value as both a QR code and a Code 128 barcode, the code in
  large type, the order number and "package n of m" (n of all the order's packages, across shops), who
  delivers (EFFY or COURIER — never a window, day or estimate; see Clarifications), the destination
  suburb, and a cold or frozen mark when applicable.
- **FR-007**: The label MUST NOT show the shop's name, the customer's name, the street address, or
  any price or amount.
- **FR-008**: Labels MUST be laid out for a 62 mm thermal roll, a 4×6 in label, and an A4 sticker
  sheet; the shop chooses, and the console remembers the choice for next time.
- **FR-009**: Printed codes MUST be legible to a phone camera at arm's length and to a handheld
  barcode scanner at the chosen layout's size.

**Where the code appears**

- **FR-010**: The package code MUST be shown beside the package in the shop console's order view and
  in back-office's order view.
- **FR-011**: The driver's reads of their work — a collection run and its shop stops (which is also
  what is checked in at the hub), a delivery run and its drops — MUST carry each package's code, as an
  addition installed driver apps ignore.

**Out of scope**

- **FR-012**: No scanning, typed-code entry or scan record is part of this feature (driver backlog
  H4–H14).

### Key Entities

- **Package** (exists): one shop's portion of one order. Gains its **package code**.
- **Package label**: a printable view of one package — the code (as QR, barcode and text), order
  number and position, who delivers and when, suburb, cold mark. Not stored; rendered from current
  facts each time it is printed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of paid packages have a code; no two packages share one.
- **SC-002**: A shop can print every label for an order in under 30 seconds from opening it.
- **SC-003**: A printed label at each layout reads first time with a phone camera in normal light in
  at least 95% of attempts.
- **SC-004**: No label ever carries a shop name, customer name, street address or price (checked on
  every layout).
- **SC-005**: Every package the driver app reads carries the code printed on its label.

## Assumptions

- Shops print from the shop console in a browser to a printer they already have; no printer driver
  or app is installed by Effy. Thermal roll and 4×6 layouts assume the printer is set to that label size.
- The cold/frozen mark comes from the product storage classes already recorded (065).
- "Package n of m" counts all the order's packages across shops; a shop only prints its own.
- Shop mobile app printing is out of scope (the shop web console is where packing happens).
- The courier's own label (080) is unchanged; Effy's label goes beside it.

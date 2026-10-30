# Feature Specification: Parcel Labels, Scanning & Order Documents

**Feature Branch**: `096-parcel-labels-scanning`

**Created**: 2026-10-21

**Status**: Draft

## Clarifications

### Session 2026-10-21

- Q: Where is the paper delivery note produced? → A: **Digital only, for now** (website, app and the
  order email). No paper note goes in the bag in this feature. A note printed and added at the hub may
  follow later. One note per shop would show the customer how many shops filled the order, which
  breaks hidden fulfilment.
- Q: Who sets a product's GST status? → A: **The shop sets it, and back-office reviews it** like any
  other product change (067's review). Back-office can also set it directly, and in bulk for existing
  products.
- Q: The current label (089) is not professional, and the operator wants it redesigned to show the
  data a parcel needs. What goes on it? → A: **A carrier-style label in fixed blocks** (US10). ⚠
  **This reverses 089's "never the customer's name or street"**: the label now shows the **recipient's
  name and full delivery address**. Every parcel label in the industry carries them, so a bag separated
  from its run can still be delivered or returned. The shop already sees both in its console and on
  the pick list, so nothing new is exposed. Still never on a label: the shop's name, any price, the
  customer's phone or email, and any delivery window, day or estimate (079).
- Q: Which sizes? → A: **4×6 in / A6 (100×150 mm) is the main label**, for thermal printers. There is
  also **A4 with four A6 labels per sheet**, for office printers, and a compact **62 mm roll** label.
  The A4 21-up sheet (63.5×38.1 mm) is **retired**: it cannot hold an address at a readable size.

**Input**: User description: "Order Package Labels, Scanning & Printed Documents - a complete system for identifying, labelling, scanning and documenting every physical bag/box of an order. Grounded in docs/research/logistics/research-08-labels-scanning-documents.md. Audiences: shop (shop-web only - the shop mobile app is stopped), driver app, back-office (incl. a hub station), customer (documents only). Scope: (1) one label per physical bag/box, declared per temperature zone, 'Bag n of N' for this shop's portion only, void and reprint, 089 labels keep working; (2) printing done properly - reliable at every label size, optional direct thermal printing, every print recorded, Printed / Not printed, batch printing, no ready-for-pickup without every bag labelled; (3) scanning wherever a bag changes hands or is looked up - shop pack confirmation, driver per bag at every step, back-office scan-to-find and a hub station; handheld scanners, cameras and typed codes; (4) a complete scan and custody record, including refused reads, with reports; (5) an Effy-branded delivery note in the bag and an Australian-compliant tax invoice, which needs a GST status on every product. Constraints: hidden fulfilment; a shop is told only who takes a package away; no product barcodes in this feature."

## Background

An Effy order can be filled by several shops. Each shop's share of an order is a **package** (089),
and each package has one permanent code printed on one label. But a shop rarely packs its share into
exactly one bag. Three bags of groceries go out today carrying the **same** code, so:

- the driver scans one bag and the other two answer "already scanned". A bag left on the counter, at
  the hub or in the van **cannot be noticed by scanning**;
- "package 1 of 2" counts **shops**, not bags, and every bag of the portion says the same thing;
- frozen and chilled goods are marked with one word on one label ("coldest wins"), and nothing makes
  the shop pack them apart from the bread.

Printing goes through the browser's print dialog with nothing recorded, and a portion can be marked
ready with no label at all. Only the driver can scan: the shop, the hub and back-office cannot. The
record of hand-overs keeps only what each driver's app reports, and throws away every refused scan.
The customer gets a receipt but no delivery note in the bag and no tax invoice, which they are
entitled to on request.

This feature makes the **bag** (here called a **parcel**) the unit that is labelled, scanned, counted
and recorded at every hand-over, from the shop's counter to the customer's door. It also adds the two
documents an order should carry: a delivery note and a tax invoice. The industry comparison behind it
is `docs/research/logistics/research-08-labels-scanning-documents.md`.

**Terms used in this spec**

- **Order**: what the customer bought, from Effy (one brand).
- **Package**: one shop's share of one order (exists today, 089).
- **Parcel**: one physical bag or box of a package. A package has one or more parcels.
- **Temperature zone**: ambient, chilled or frozen.
- **Hand-over**: a moment a parcel changes hands - shop to driver, driver to hub, hub to van, van to
  customer, or driver back to hub.
- **Read**: one attempt to identify a parcel by scanning or typing its code, whatever the outcome.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Every bag has its own label (Priority: P1)

A shop worker finishes picking a portion: some ambient goods, a tub of ice cream and some yoghurt.
They tell the console what they packed: two ambient bags, one frozen bag and one chilled bag. The
console prints four labels. Each label has its own code and reads "Bag 1 of 4 · AMBIENT", "Bag 3 of 4
· FROZEN" and so on. The worker sticks one on each bag. A torn label is reprinted with the same code.
A bag that turns out not to be needed is voided, so its label no longer counts.

**Why this priority**: every other part of this feature (counting, scanning, recording) works on
parcels. Without one code per bag, nothing downstream can notice a missing bag.

**Independent Test**: pack a portion as four bags, print, and check four distinct codes with correct
"n of 4" and zones. Pack a portion with frozen lines and declare no frozen bag: the console refuses.
Void a bag: its code is refused afterwards and the count becomes "of 3".

**Acceptance Scenarios**:

1. **Given** a portion being picked, **When** the shop declares 2 ambient + 1 chilled + 1 frozen bag,
   **Then** four parcels exist, each with its own permanent code, numbered 1–4 of 4 with its zone.
2. **Given** a portion containing at least one frozen line, **When** the shop declares no frozen bag,
   **Then** the declaration is refused with a sentence naming the zone that needs a bag (and likewise
   for chilled).
3. **Given** a printed label, **When** the shop reprints it, **Then** the same code is printed again
   and the reprint is recorded.
4. **Given** four declared bags, **When** the shop voids bag 4 before hand-over, **Then** the
   remaining bags read "of 3" on reprint, bag 4's code is refused by every scan from then on, and the
   void is recorded with who and when.
5. **Given** a portion packed before this feature with a single 089 package label, **When** a driver,
   the hub or back-office scans that label, **Then** it counts as that portion's one parcel and every
   step works as before.
6. **Given** any label, **Then** it never shows the shop's name, any price, the customer's phone or
   email, or any delivery window, day or estimate. Its content and layout are defined in US10.

---

### User Story 2 - Labels print reliably, and the console knows they were printed (Priority: P1)

The shop prints labels at its own size (62 mm roll, 4×6 in / A6, or an A4 sticker sheet). The
barcode reads first time with a handheld scanner and with a phone. A shop with a thermal label printer
can print directly, without a print dialog. The order shows **Printed** or **Not printed** for each
bag. A portion cannot be marked ready for pickup while any bag is unprinted. From the order list, the
shop can print the labels for several portions in one go.

**Why this priority**: a label that does not scan, or a bag with no label, turns every later scan into
a typed code or a manual tick. That is exactly the gap this feature exists to close.

**Independent Test**: print each size on paper and read every label with a handheld scanner and a
phone camera. Try to mark a portion ready with one bag unprinted: refused. Batch print three portions
from the list and check each bag is marked Printed with who and when.

**Acceptance Scenarios**:

1. **Given** a label printed at any supported size, **When** read by a handheld scanner or a phone
   camera at a normal working distance, **Then** it reads on the first attempt.
2. **Given** a shop with a direct-print label printer set up, **When** it prints, **Then** labels go
   straight to that printer without a print dialog. **Given** none is set up, **Then** printing falls
   back to the browser's printing at the correct size, without scaling the barcode.
3. **Given** a portion with any unprinted bag, **When** the shop marks it ready for pickup, **Then**
   it is refused with a sentence naming how many bags are unprinted.
4. **Given** several portions selected in the order list, **When** the shop chooses "Print labels",
   **Then** every bag of every selected portion prints, and each is recorded.
5. **Given** the print could not start (for example, the browser blocked it), **Then** nothing is
   recorded as printed and the shop is told why.

---

### User Story 3 - The driver accounts for every bag at every hand-over (Priority: P1)

At the shop counter the driver scans each bag. The stop shows "3 of 4 bags" until the fourth is
scanned. At the hub, when loading the van, at the door, and when returning a failed delivery, every
bag of every package must be scanned, typed or declared missing. A missing bag is declared per bag
with a reason. The rest of its package carries on, and dispatch sees the missing bag.

**Why this priority**: this is the outcome the operator asked for. The work-order gates (093) and the
scanning screens (090–092) exist, but they count packages, so a missing bag passes.

**Independent Test**: collect a 4-bag portion scanning three bags. The stop stays open with 1 bag
outstanding until it is scanned or declared missing. Repeat at check-in, load, door and return.

**Acceptance Scenarios**:

1. **Given** a stop with a 4-bag portion, **When** the driver scans 3 bags, **Then** the stop shows 1
   bag outstanding and cannot be completed until it is scanned, typed, or declared missing with a
   reason.
2. **Given** a bag already scanned at this step, **When** it is scanned again, **Then** the driver is
   told "already scanned" and nothing is counted twice.
3. **Given** a bag belonging to another shop's stop, another drop or another driver's work, **When**
   scanned, **Then** the driver gets the existing hard stop naming where it belongs, and the refused
   read is recorded.
4. **Given** a bag declared missing at load, **Then** it is not loaded, dispatch sees it on the
   exceptions list, and the rest of its package continues.
5. **Given** the door step, **When** a drop has 3 bags, **Then** the drop shows "Scan 3 bags" and is
   completed only when all 3 are accounted for.
6. **Given** no signal, **Then** every scan and declaration is accepted on the device and recorded
   when the signal returns, keeping the time it happened on the device.

---

### User Story 4 - The shop confirms each bag as it is packed (Priority: P2)

After printing, the shop worker scans each label as they put it on its bag. The console ticks the bag
off: "Packed 3 of 4". When every bag is confirmed, the portion is ready to hand over. At the counter,
the shop sees which bags the driver has scanned, so a bag the driver missed is noticed before the van
leaves.

**Why this priority**: it catches a label stuck on the wrong bag or never stuck at all, before the
driver arrives. It is valuable, but the driver's per-bag scan (US3) already catches the worst case.

**Independent Test**: print 4 labels, scan 3 at the pack step. The console shows 1 unconfirmed. When
pack scanning is required, the portion cannot be marked ready.

**Acceptance Scenarios**:

1. **Given** printed labels, **When** the shop scans a label of this portion, **Then** that bag shows
   as packed, with who and when.
2. **Given** a label of a different portion or order, **When** scanned at the pack step, **Then** the
   shop is told it belongs to a different order, and nothing changes.
3. **Given** pack scanning is required for this shop, **When** the shop marks the portion ready with
   an unconfirmed bag, **Then** it is refused. When it is optional, the bag is recorded as "not pack
   scanned" and the portion may proceed.
4. **Given** a driver collecting at the counter, **Then** the shop's order shows each bag as "With
   driver" once scanned, and which bags are still at the counter.

---

### User Story 5 - Back-office finds anything by scanning, and the hub works its own station (Priority: P2)

A staff member holds an unlabelled-looking bag found on the hub floor. They scan its label in
back-office and land on the order, with the bag highlighted and its full hand-over history. Hub staff
use a hub station page with a handheld scanner. They check in bags arriving from collection runs and
are told where each bag goes ("Load now · window", "Shelve · day", "Courier bay"). They can check in
a bag without the driver's phone.

**Why this priority**: today the hub depends entirely on the driver's phone, and a found bag means
typing a code into a search that does not search codes.

**Independent Test**: scan a bag label, a package label and an order number in back-office's scan box.
Each opens the right order with the right bag highlighted. At the hub station, check in a collected
bag. It shows At hub with its sort instruction, and the hand-over is recorded against the hub staff
member.

**Acceptance Scenarios**:

1. **Given** back-office, **When** a parcel label, a package label or an order number is scanned or
   typed into the scan box, **Then** the matching order opens with that bag or package highlighted.
   **When** nothing matches, **Then** staff are told so.
2. **Given** the hub station, **When** hub staff scan a bag that was collected and not yet checked in,
   **Then** it is checked in, shows At hub, and the screen shows its sort instruction.
3. **Given** the hub station, **When** a bag not expected at the hub is scanned (not collected, already
   delivered, voided, or a courier pickup-from-shop parcel), **Then** it is refused with a sentence
   saying why, and the read is recorded.
4. **Given** a collection run's bags, **When** the driver has checked in some and hub staff the rest,
   **Then** both are recorded with who did each, and the run's check-in is complete when every bag is
   accounted for.

---

### User Story 6 - Every read and hand-over is on record, and failures are visible (Priority: P2)

Every read is recorded: by a shop, a driver, hub staff or back-office, accepted or refused, scanned or
typed. The record says who made it, at which step, when it happened on the device, on which device,
what was read and the outcome. Dispatch and the operator see reports: labels that would not scan (read
by typing or ticked by hand), refused reads by kind, exceptions per 1,000 hand-overs, and shops whose
bags are most often handed over unscanned.

**Why this priority**: it shows which labels, printers and shops are failing, so the process can be
fixed rather than guessed at. It also gives a defensible trail when a bag goes missing.

**Independent Test**: perform a scan, a typed entry, a manual tick, a wrong-shop scan and a void.
Check that each appears in the record with every field, and that the reports count them.

**Acceptance Scenarios**:

1. **Given** any read anywhere, **Then** a record exists with: who, their role (shop / driver / hub /
   back-office), step, device time, recorded time, device, what was read, how (scan / typed / manual)
   and the outcome (accepted, already counted, belongs elsewhere, not on this work, voided, not a
   label).
2. **Given** reads made offline, **When** they arrive later, **Then** each keeps its device time, and
   a read sent twice is recorded once.
3. **Given** the records, **Then** no record is ever changed or deleted. A correction is a new record
   that refers to the one it corrects.
4. **Given** back-office reports for a chosen period, **Then** they show: bags handed over by scan vs
   typed vs manual (overall, per shop, per driver), refused reads by kind, and exceptions per 1,000
   hand-overs.
5. **Given** any record or report, **Then** it is never shown to a customer. A shop sees only its own
   bags' records, and never a driver's name (073).

---

### User Story 7 - A delivery note travels with the order (Priority: P2)

The customer opens their bags and finds an Effy delivery note listing what they bought and the
quantity of each. Anything the shop could not supply, or supplied only partly, is marked as such.
There are no prices and nothing that names a shop. The same note is available on the customer's order
on the website and in the app.

**Why this priority**: it lets the customer check their delivery at the door, and it makes a short
pick visible on paper rather than as a surprise.

**Independent Test**: complete an order with one part-picked line and one unavailable line. Print its
note and view it on the website and in the app. Items, quantities and the two exceptions are correct.
No price or shop name appears.

**Acceptance Scenarios**:

1. **Given** an order, **Then** its delivery note lists each item and quantity delivered, and marks
   each part-picked or unavailable line with what was supplied.
2. **Given** any delivery note, **Then** it carries the Effy brand, the order number, the date and
   Effy's customer contact (`hello@effyshopping.com`). It carries no prices, no shop name and no
   supplier count.
3. **Given** the customer's order on the website or app, **Then** the delivery note can be viewed and
   downloaded.
4. **Given** an order is delivered, **Then** the customer is sent the delivery note with the
   "delivered" message, as a link to their order. No paper note goes in the bag in this feature
   (Clarifications).

---

### User Story 8 - The customer can get a tax invoice (Priority: P2)

A customer, perhaps a small business buying supplies, downloads a tax invoice from their order. It
says "Tax invoice", shows Effy's ABN, the date, each item, and which items are taxable and which are
GST-free. It shows the GST included in the total. For a purchase of $1,000 or more it shows the
buyer's identity. After a refund, the customer can get a document showing the adjustment.

**Why this priority**: the law entitles a customer to a tax invoice for a taxable sale over $82.50
(incl. GST) on request, and Effy cannot produce one today. It follows US1–US3 because it does not
depend on parcels.

**Independent Test**: place an order with taxable and GST-free products and download the invoice.
Every required element is present and the GST amount is correct to the cent. Refund one taxable item
and check the adjustment document.

**Acceptance Scenarios**:

1. **Given** a paid order, **When** the customer asks for its tax invoice on the website or in the
   app, **Then** they can view and download a document headed "Tax invoice" with: Effy's legal name
   and ABN, the issue date, an invoice number, each item with quantity and price, each item marked
   taxable or GST-free, the GST amount, and the total.
2. **Given** an order total of $1,000 or more, **Then** the invoice also shows the buyer's identity
   (name, and the business ABN when the customer gave one).
3. **Given** a refund on the order, **Then** an adjustment document shows the refunded items and the
   GST adjustment, and the original invoice is never altered.
4. **Given** Effy's ABN or legal name is not configured, **Then** no tax invoice is issued, the
   customer is told it is not available yet, and back-office is alerted. A placeholder is never
   printed.
5. **Given** a product with no GST status, **Then** an order containing it cannot be sold until the
   status is set (see FR-055).

---

### User Story 9 - Every product carries a GST status (Priority: P3)

Every product is marked taxable or GST-free. The shop sets it when it creates or edits a product, and
back-office reviews the change like any other product change. Back-office can also set it directly.
Products already in the catalogue must all be given a status before tax invoices are issued.

**Why this priority**: it is a prerequisite for US8 only. It is P3 because it is data entry, not a
workflow.

**Independent Test**: set and change a product's status through the chosen path. The catalogue shows
how many live products have no status, and goes to zero.

**Acceptance Scenarios**:

1. **Given** a product, **Then** its GST status is one of taxable or GST-free, and every change to it
   is recorded with who and when.
2. **Given** existing products, **Then** back-office can list every live product with no status, and
   set statuses in bulk.
3. **Given** an order, **Then** each line keeps the GST status it was sold with, even if the product's
   status changes afterwards.

---

### User Story 10 - A professional, carrier-style label (Priority: P1)

Today's label is a barcode, a QR code and a few loose lines (see `label-redesign.md`). The code runs
off the edge, most of the label is empty, an extra blank page prints, and the data that matters is
missing or unclear: which bag of how many, temperature, and who it is for. The new label is laid out
like a carrier's parcel label. Fixed blocks are separated by rules, and each block answers one
question for whoever holds the bag: shop, driver, hub staff or customer. The most important facts are
the largest.

**Why this priority**: the label is the one thing every person in the chain reads. A cluttered or
clipped label costs a scan, a misplaced bag or a frozen bag left warm.

**Independent Test**: print each size for an ambient, a chilled and a frozen bag, Effy and courier,
with a long name and a long address. Every block is present and in order, nothing is clipped or runs
off the label, exactly one page per label (four per A4 sheet), and every barcode reads first time.

**Acceptance Scenarios**:

1. **Given** a 4×6 / A6 label, **Then** it shows, top to bottom, in separated blocks:
   - **Header**: the Effy mark and the service in large reversed type, "EFFY DELIVERY" or "COURIER".
   - **Deliver to**: the recipient's name, the street address, then the suburb, state and postcode.
     The postcode is the largest text in the block.
   - **Temperature band**: full width. FROZEN and CHILLED are reversed (white on black) with their
     storage line ("Keep frozen · −18 °C or colder", "Keep chilled · 5 °C or colder"). AMBIENT is outlined,
     not reversed.
   - **Bag**: "BAG 2 OF 3" in the largest type on the label, with the order number and the packed
     date beside it.
   - **Barcode**: full width, with its human-readable value printed beneath.
   - **Code**: the 2D code with the parcel code in large type grouped for reading aloud ("WTM ZHX"),
     and "Scan, or type this code".
   - **Footer**: "Questions? hello@effyshopping.com".
2. **Given** the 62 mm roll, **Then** the same blocks appear in the same order, compacted.
   **Given** A4, **Then** four complete A6 labels print per sheet, one per quarter.
3. **Given** a recipient name or address too long for its block, **Then** the text shrinks to a set
   minimum and then wraps to at most two lines, and is never cut off mid-character or pushed outside
   the label. The barcode, bag number and temperature band never shrink.
4. **Given** any label, **Then** it prints in black only, with no greys or tints, so it prints
   cleanly on direct-thermal paper.
5. **Given** a label preview in the console, **Then** it is the same as what prints.

---

### User Story 10 - A professional, carrier-style label (Priority: P1)

Today's label is a barcode, a QR code and a few loose lines (see `label-redesign.md`). The code runs
off the edge, most of the label is empty, an extra blank page prints, and the data that matters is
missing or unclear: which bag of how many, temperature, and who it is for. The new label is laid out
like a carrier's parcel label. Fixed blocks are separated by rules, and each block answers one
question for whoever holds the bag: shop, driver, hub staff or customer. The most important facts are
the largest.

**Why this priority**: the label is the one thing every person in the chain reads. A cluttered or
clipped label costs a scan, a misplaced bag or a frozen bag left warm.

**Independent Test**: print each size for an ambient, a chilled and a frozen bag, Effy and courier,
with a long name and a long address. Every block is present and in order, nothing is clipped or runs
off the label, exactly one page per label (four per A4 sheet), and every barcode reads first time.

**Acceptance Scenarios**:

1. **Given** a 4×6 / A6 label, **Then** it shows, top to bottom, in separated blocks:
   - **Header**: the Effy mark and the service in large reversed type, "EFFY DELIVERY" or "COURIER".
   - **Deliver to**: the recipient's name, the street address, then the suburb, state and postcode.
     The postcode is the largest text in the block.
   - **Temperature band**: full width. FROZEN and CHILLED are reversed (white on black) with their
     storage line ("Keep frozen · −18 °C or colder", "Keep chilled · 5 °C or colder"). AMBIENT is outlined,
     not reversed.
   - **Bag**: "BAG 2 OF 3" in the largest type on the label, with the order number and the packed
     date beside it.
   - **Barcode**: full width, with its human-readable value printed beneath.
   - **Code**: the 2D code with the parcel code in large type grouped for reading aloud ("WTM ZHX"),
     and "Scan, or type this code".
   - **Footer**: "Questions? hello@effyshopping.com".
2. **Given** the 62 mm roll, **Then** the same blocks appear in the same order, compacted.
   **Given** A4, **Then** four complete A6 labels print per sheet, one per quarter.
3. **Given** a recipient name or address too long for its block, **Then** the text shrinks to a set
   minimum and then wraps to at most two lines, and is never cut off mid-character or pushed outside
   the label. The barcode, bag number and temperature band never shrink.
4. **Given** any label, **Then** it prints in black only, with no greys or tints, so it prints
   cleanly on direct-thermal paper.
5. **Given** a label preview in the console, **Then** it is the same as what prints.

---

### Edge Cases

- **Packed before this feature**: an 089 package label with no declared parcels counts as that
  package's one parcel at every step (FR-007).
- **Bags declared, then the portion is reopened for picking** (the one permitted reversal): declared
  parcels stay. The shop may add, void or reprint. Nothing already handed to a driver may be voided.
- **A bag added after the driver has collected** (it was forgotten): refused while any parcel of the
  package is with a driver. The shop contacts dispatch, who decide (outside this feature's flows).
- **The same label printed twice and stuck on two bags**: the second scan at a step is "already
  scanned", and the shop or driver count shows one fewer bag than expected. This is reported as an
  exception.
- **A voided label scanned anywhere**: refused as "voided", recorded, and never counted.
- **Courier orders**: parcels are declared and labelled the same way. A courier service's own label
  (080) is separate and stays. Pickup-from-shop parcels never pass the hub, so the hub station refuses
  them.
- **Courier override (081) moves a package after its parcels are labelled**: labels stay valid. The
  "Effy / Courier" word on reprints follows the package's current type, and existing printed labels
  are not required to be reprinted.
- **A package that is cancelled or refunded in full**: its parcels can no longer be handed over, and
  any read says so.
- **Empty bag declaration** (zero bags): refused. A portion has at least one parcel.
- **Very large portions**: a portion may have up to 50 parcels. More is refused with a sentence (an
  assumption to revisit with real orders).
- **Offline driver scanning a bag voided while offline**: when the reads arrive, the void wins. The
  read is recorded as made on a voided label and raised as an exception, and nothing is silently
  undone.
- **Device clock wrong**: the device time is recorded as reported, and the received time is always
  recorded too. Reports use the received time when the two differ by more than a set tolerance.
- **Tax invoice for an order paid partly with points**: points are a way of paying (074). The
  invoice's prices and GST are unchanged, and points appear as a payment.
- **Discount from a promotion across taxable and GST-free lines**: the invoice shows prices after
  discount, and GST is worked out on the discounted taxable amounts.
- **Delivery fee and small-order fee on the invoice**: shown as their own lines with their tax
  treatment (see Assumptions).

## Requirements *(mandatory)*

### Functional Requirements

**Parcels and their codes**

- **FR-001**: Every package MUST consist of one or more parcels. A parcel is one physical bag or box.
- **FR-002**: The shop MUST declare its parcels when it packs a portion, as a number of bags per
  temperature zone (ambient, chilled, frozen). Each declared bag becomes one parcel.
- **FR-003**: Each parcel MUST have a permanent code that is unique across all parcels and packages,
  readable by a person, never reused, and in the same family as package codes (089), so one scan rule
  reads both.
- **FR-004**: When a portion contains chilled lines, at least one chilled parcel MUST be declared.
  When it contains frozen lines, at least one frozen parcel MUST be declared. A declaration that
  breaks this MUST be refused with a sentence naming the zone.
- **FR-005**: Parcels MUST be numbered 1 to N within their package, and N MUST count only this
  package's live (not voided) parcels.
- **FR-006**: The shop MUST be able to add parcels and void parcels until any parcel of the package has
  been handed to a driver or courier. Voiding MUST be recorded with who and when, and a voided code
  MUST be refused by every scan from then on.
- **FR-007**: A package that has no declared parcels (packed before this feature) MUST be treated as
  having exactly one parcel whose code is the package's existing code, so its 089 label works at every
  step.
- **FR-008**: The number of parcels or packages in an order MUST NOT be shown to a customer on any
  screen, message or document. The one exception is the bag's own label ("Bag n of N", where N counts
  this package's bags only), which the customer may see on the bag itself. ⚠ Known limit: a customer
  who receives bags from two shops may notice two separate "1 of N" sequences. This is accepted
  because the count is needed to work the bags. Numbering bags across the whole order would need every
  shop to finish packing first.

**Labels and printing**

- **FR-010**: Each parcel's label MUST carry its code as a 1D barcode, as a 2D code and in large
  type. It MUST show, in the fixed blocks and order of US10: the service (Effy delivery or Courier),
  the recipient's name and full delivery address with the postcode largest, the temperature zone
  (reversed for chilled and frozen, with a storage line), "Bag n of N", the order number, the packed
  date, and Effy's customer contact.
- **FR-011**: A label MUST NOT show the shop's name, any price, the customer's phone or email, or any
  delivery window, day or estimate.
- **FR-012**: Labels MUST be available at 4×6 in / A6 (the main size), A4 with four A6 labels per
  sheet, and 62 mm roll (compact), with the shop's choice remembered. The A4 21-up sheet is retired.
- **FR-012a**: Every label MUST print as exactly one label, with nothing clipped, nothing running off
  the edge, and no blank extra page. Long names and addresses MUST shrink to a minimum size and then
  wrap to at most two lines. The barcode, the bag number and the temperature band MUST never shrink.
- **FR-012b**: Labels MUST be printed in black only (no greys or tints), and the console's preview
  MUST match the printed label.
- **FR-013**: Every printed label MUST read on the first attempt with a standard handheld scanner and
  with a phone camera (see SC-002), which means the barcode is never resized by the printing path.
- **FR-014**: A shop MUST be able to send labels directly to a supported thermal label printer without
  a print dialog. Without one, printing MUST fall back to ordinary printing at the correct size.
- **FR-015**: Every print and reprint MUST be recorded per parcel (who, when, how many times), and the
  order MUST show each parcel as Printed or Not printed.
- **FR-016**: A portion MUST NOT be marked ready for pickup while any live parcel is unprinted.
- **FR-017**: The shop MUST be able to print all labels for several selected portions at once from
  the order list.
- **FR-018**: When printing could not start, nothing MUST be recorded as printed, and the shop MUST be
  told why.

**Pack confirmation (shop)**

- **FR-020**: The shop MUST be able to confirm each parcel by scanning or typing its label at the pack
  step, recorded with who and when.
- **FR-021**: A label from a different package scanned at the pack step MUST be refused with a
  sentence, and recorded.
- **FR-022**: Whether pack confirmation of every parcel is required before ready for pickup MUST be a
  per-shop setting held by back-office. The default MUST be **optional**: an unconfirmed parcel is
  recorded as "not pack scanned" and the portion may proceed.
- **FR-023**: The shop's order MUST show, per parcel, whether it is still at the shop or has been taken
  by a driver or courier. It MUST never show a driver's name.

**Driver hand-overs (per parcel)**

- **FR-030**: At every driver step (collect, hub check-in, load, door, return), every live parcel of
  every package in that step MUST be accounted for, as scanned, typed, ticked by hand, or declared
  missing with a reason, before the step can complete.
- **FR-031**: Progress at each step MUST be shown in parcels ("3 of 4 bags").
- **FR-032**: A parcel MUST be declarable missing on its own, with a reason (and a note when the
  reason is "other"). The rest of its package MUST continue, and the missing parcel MUST appear on
  dispatch's exceptions with the existing Found / Lost resolution (093).
- **FR-033**: The existing hard stop for a parcel that belongs elsewhere MUST apply per parcel and name
  where it belongs, in the existing words.
- **FR-034**: All driver reads and declarations MUST work offline and be recorded when the signal
  returns, keeping the device time.
- **FR-035**: A package's hand-over at a step MUST be considered complete only when all its live
  parcels have been handed over or declared missing at that step. A package with a missing parcel
  MUST be shown as such everywhere its status is shown to staff.

**Hub station and back-office**

- **FR-040**: Back-office MUST offer a single scan box that accepts a parcel code, a package code or
  an order number (scanned or typed) and opens the matching order with that parcel or package
  highlighted.
- **FR-041**: Back-office MUST offer a hub station where permitted staff check in arriving parcels by
  scanning, each answered with its sort instruction in the existing words (load now · window / shelve
  · day / courier bay).
- **FR-042**: A hub-station check-in MUST be recorded against the staff member and MUST count toward
  completing the collection run's check-in, alongside any parcels the driver checked in.
- **FR-043**: The hub station MUST refuse, with a sentence, a parcel that is not expected at the hub:
  not yet collected, already checked in, delivered, voided, cancelled, or a pickup-from-shop courier
  parcel.
- **FR-044**: Which back-office staff may use the hub station MUST be controlled by the existing
  back-office access model.

**Scanning (all surfaces)**

- **FR-050**: Every surface that reads labels MUST accept a handheld scanner that types like a
  keyboard, a camera where the device has one, and a typed code. Each read MUST be told apart as scan
  or typed.
- **FR-051**: A handheld scan MUST be recognised without first clicking into a field, and MUST never
  leak into whatever text field has focus.
- **FR-052**: Every surface MUST judge a read with the same rule and give the same outcomes and words:
  accepted, already counted, belongs elsewhere, not on this work, voided, not a label.

**Custody record and reports**

- **FR-060**: Every read on every surface MUST be recorded, accepted or refused, with: who, their role,
  step, device time, received time, device, what was read, how (scan / typed / manual) and outcome.
- **FR-061**: Every hand-over MUST be recorded per parcel, including hand-overs by shop staff (pack,
  hand to driver or courier) and hub staff (check-in).
- **FR-062**: Records MUST be append-only. A correction MUST be a new record referring to the one it
  corrects. A read received twice MUST be recorded once.
- **FR-063**: Back-office MUST report, for a chosen period: hand-overs by scan / typed / manual
  (overall, per shop, per driver), refused reads by outcome, parcels declared missing, and exceptions
  per 1,000 hand-overs.
- **FR-064**: A shop MUST see only its own parcels' records, and never a driver's name. A customer
  MUST see none of them.

**Delivery note**

- **FR-070**: Every order MUST have a delivery note listing each item and the quantity supplied, and
  marking each part-picked or unavailable line with what was supplied.
- **FR-071**: The delivery note MUST carry the Effy brand, the order number, the date, and Effy's
  customer contact address. It MUST carry no prices, no shop name and no count of shops or bags.
- **FR-072**: The customer MUST be able to view and download the delivery note from their order on
  the website and in the app.
- **FR-073**: The delivery note MUST be digital only in this feature: on the order on the website and
  in the app, and linked from the "delivered" message. No paper note goes in the bag.

**Tax invoice**

- **FR-080**: A customer MUST be able to view and download a tax invoice for any paid order, from the
  website and the app.
- **FR-081**: The tax invoice MUST be headed "Tax invoice" and MUST show: Effy's legal name and ABN,
  the issue date, a unique invoice number, each item with quantity and price, each item marked taxable
  or GST-free, the total GST, and the total payable. For a total of $1,000 or more it MUST also show
  the buyer's identity.
- **FR-082**: Each order line MUST keep the GST status it was sold with. The invoice MUST use that,
  not the product's current status.
- **FR-083**: A refund MUST produce an adjustment document that shows the refunded items and the GST
  adjustment. An issued invoice MUST never be altered.
- **FR-084**: Effy's legal name and ABN MUST be set by the operator. Until both are set, no tax invoice
  MUST be issued, the customer MUST be told it is not yet available, and back-office MUST be alerted.
  A guessed or placeholder value MUST never be printed.
- **FR-085**: Customers MAY give a business name and ABN for an order, used only on its tax invoice.

**GST status of products**

- **FR-090**: Every product MUST have a GST status: taxable or GST-free. Every change MUST be recorded
  with who and when.
- **FR-091**: The shop MUST set a product's GST status when creating or editing it, and the change MUST
  go through back-office's product review like any other product change. Back-office MUST also be
  able to set it directly.
- **FR-092**: Back-office MUST list live products with no GST status and MUST be able to set statuses
  in bulk.
- **FR-093**: A product with no GST status MUST NOT be sold once tax invoices are turned on. Until
  then, sales continue as today.

### Key Entities

- **Parcel**: one physical bag or box of a package. It has a permanent code, a position (n of N
  within its package), a temperature zone, its state (live / voided), and its print and pack-scan
  status. It belongs to exactly one package.
- **Package** (exists): one shop's share of one order. It now has one or more parcels. One with none
  declared stands for a single parcel carrying its own code.
- **Label print**: one print or reprint of a parcel's label - who, when, which size, which printing
  path.
- **Read**: one attempt to identify a parcel or package - who, role, step, device, device time,
  received time, what was read, how, and the outcome. Never changed.
- **Hand-over** (exists, extended): one parcel passing from one holder to another at a step - now
  per parcel and including shop and hub staff.
- **Missing-parcel declaration**: a parcel declared not present at a step, with its reason and its
  resolution (found / lost).
- **Delivery note**: per order. The items and quantities supplied, with exceptions marked. No prices.
- **Tax invoice / adjustment document**: per order and per refund. Numbered, never altered, carrying
  the GST status each line was sold with.
- **Business tax details**: Effy's legal name and ABN, set by the operator.
- **GST status**: per product (taxable / GST-free), with its change history, copied to each order
  line at sale.
- **Shop scanning setting**: per shop, whether pack confirmation is required.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every physical bag that leaves a shop carries its own code: 100% of parcels handed over
  after release have a distinct code, and no two parcels share one.
- **SC-002**: At least 98% of labels read on the first attempt with a handheld scanner and with a phone
  camera, at every supported size, measured on a test batch of 100 labels per size before release, and
  then from the read record in use.
- **SC-003**: A bag left behind is noticed at the next hand-over: in a test where one bag of a
  multi-bag portion is withheld, 100% of trials leave the step unable to complete until the bag is
  scanned or declared missing.
- **SC-004**: No portion is handed to a driver with an unprinted bag: 0 parcels collected without a
  recorded print after release.
- **SC-005**: After the first month in use, at least 90% of hand-overs are by scan (not typed or
  ticked), visible in the reports.
- **SC-006**: Staff find any bag from its label in under 10 seconds from the back-office scan box.
- **SC-007**: Every read and hand-over appears in the record with all its fields: 100% complete, 0
  changed or deleted.
- **SC-008**: A customer can download a tax invoice for any paid order in under 30 seconds. Every
  invoice carries every element required for its amount, and its GST is correct to the cent in a
  test set covering taxable, GST-free, discounted, fee-bearing and points-paid orders.
- **SC-009**: Chilled and frozen goods always travel in a bag of their zone: 0 portions with chilled or
  frozen lines handed over without a parcel of that zone.
- **SC-010**: Hidden fulfilment holds: across every label, note, invoice, screen and message a
  customer sees, 0 occurrences of a shop name or a shop count, and no bag count anywhere except on the
  bag's own label (FR-008).
- **SC-011**: The redesigned label passes a printed review at every size, for ambient, chilled and
  frozen and for Effy and courier, including a long name and a long address. Every US10 block is
  present, nothing is clipped, and there is exactly one label per label position.

## Assumptions

- **Shop surface**: shop-web only. The shop mobile app is stopped and gets nothing.
- **Hardware (to confirm during planning, not blocking the spec)**: shops use a common 203 dpi or 300
  dpi direct-thermal label printer at one of the three sizes, or an ordinary office printer for A4
  sheets. Shops and the hub may use any handheld scanner that types like a keyboard and can be set to
  send a suffix. Phones and laptops may use their camera. Direct printing supports at least the most
  common thermal printer family; others use ordinary printing.
- **Parcel codes** reuse the 089 code family and the existing `EFY1:` token, so labels already printed
  and the driver app's scan rule stay valid. Package labels are no longer printed for new portions.
- **The driver app has no installed users yet** (093), so driver-side changes ship with the server and
  need no compatibility period. Shop-web and back-office deploy with the server.
- **Hub staff** are back-office staff. No new audience, sign-in or pool is created.
- **Temperature zones** follow the order lines' storage class captured at sale (065). "Ambient" is
  everything not chilled or frozen.
- **Pack scanning** defaults to optional per shop (FR-022). Back-office can require it per shop.
- **Tax treatment of fees and discounts**: the delivery fee, the small-order fee and promotion
  discounts are shown as their own lines. Their GST treatment (taxable, GST-free, or apportioned) is to
  be confirmed with Effy's accountant during planning, and is configurable rather than hard-coded.
- **Tax invoice legal rules** come from secondary sources (research-08 §1.7). The operator confirms
  them against the ATO before release.
- **Delivery note on courier orders**: the same as for Effy orders (digital).
- **State** on the label comes from the delivery address. The packed date is the day the labels were
  first printed.
- **Retention**: reads, hand-overs, prints and tax documents are kept at least as long as order
  records. Tax documents are kept for at least five years (Australian record-keeping).
- **Out of scope**: product barcodes (EAN/GTIN) and scan-to-pick, which come in a later feature;
  carrier-issued courier labels via a carrier's system (080's manual label upload stays); shelf or
  location labels at the hub; multiple hubs.
- **Dependencies**: 088–093 migrated, deployed and walked on dev before this feature's own walk
  (research-08 Phase 0). 073 (package status words), 080/081 (courier parcels and override), 093
  (missing-package holds) are extended, not replaced.

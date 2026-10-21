# Research — 096 Parcel Labels, Scanning & Order Documents

Industry background is in [research-08](../../docs/research/logistics/research-08-labels-scanning-documents.md).
This file records the design decisions. Each one gives the **Decision**, the **Rationale**, and the
**Alternatives** rejected.

---

## R1 — A parcel is a row under the package; bag 1 reuses the package code

**Decision.** Add a new table `public.package_parcel`, with one row per physical bag. **Every package always
has at least one parcel.**
- The migration backfills one parcel for every existing `shop_fulfillment`.
- An insert trigger creates parcel 1 for every new package.
- **Parcel 1's code is the package's own `package_code`.** Parcels 2…N get new codes.

When the shop declares its bags at pack time, parcel 1 is re-zoned and kept, and parcels are added or voided
from the tail. **Parcel 1 can never be voided**: its code is the package code, which old labels and
back-office lookups resolve to (spec Clarifications).

**Rationale.**
- FR-007 holds **by data, not by special cases**. A label printed under 089 reads as parcel 1 at every step,
  because it is parcel 1.
- Every reader works on parcels only. No code path has a "no parcels yet" branch.
- The package code stays the human handle for the shop's share of the order. Back-office lookups by package
  code resolve to parcel 1 and its package.

**Alternatives.**
- *Parcels only when declared, with legacy packages as a virtual parcel.* This puts an `if` in every reader;
  a missed one is a silent miscount.
- *A separate code space for parcels.* Codes would no longer read as one family, and the scan rule would
  need two parsers.

## R2 — One code space, enforced by one unique index

**Decision.**
- `package_parcel.parcel_code` is `UNIQUE` with the 089 CHECK, so it holds every package code (through
  parcel 1) and every parcel code.
- `new_package_code()` is replaced to test **both** `shop_fulfillment.package_code` and
  `package_parcel.parcel_code`. `new_parcel_code()` is an alias of it.
- The tiny race (the same random code issued as a package code and a parcel code at once) fails at the
  parcel-1 insert, inside the package's own transaction, and that insert retries once.

The token stays `EFY1:<code>`. `parsePackageToken` and Kotlin's `PackageToken` are unchanged.

**Rationale.** The alphabet has 30 symbols over 6 places, about 729 million codes. A collision needs two
inserts drawing the same code in the same instant. The unique index guarantees correctness, and the
generator's check keeps collisions rare.

**Alternatives.** A registry table of every code. That would be a third place holding the same fact.

## R3 — Temperature zones, and the rule a declaration must pass

**Decision.**
- `package_parcel.zone` is one of `ambient | chilled | frozen`.
- A pack declaration is `{ambient, chilled, frozen}` counts.
- It is refused (422 `zone_bag_required`, naming the zone) when the package's lines include
  `order_item.storage_class = 'chilled'` and the chilled count is 0, and likewise for frozen.
- The total must be between 1 and 50 (422 `parcel_count`).
- The backfilled parcel 1 takes the coldest class among the package's lines. This is 089's rule, and here
  it applies to one bag only.

**Rationale.** 065's line snapshot is the fact the driver manifest already uses. Reading the product's live
attribute would let a shop's later edit change a sold order.

## R4 — Declaring, voiding and the ready gate (shop)

**Decision.**
- `PUT …/parcels` with a `changeId` sets the counts. Parcels are matched per zone in sequence order:
  - existing live parcels of a zone are kept;
  - shortfalls are added;
  - extras are voided, highest sequence first;
  - sequence numbers are renumbered over the live set.
- `POST …/parcels/{id}/void` voids one parcel.
- Both are refused (409 `parcels_with_driver`) once any parcel of the package has a `collect`,
  `courier_handover` or `shop_pickup` hand-over (a supplier-pickup courier has taken it).
- **Voiding after printing**: once any parcel of the package has a print, only the **last live** parcel
  may be voided (409 `void_last_bag_only`, "Re-declare the bags and reprint every label"). A
  re-declaration that changes the count after printing renumbers every live parcel and clears the printed
  state, so every label must be reprinted before ready. **Parcel 1 is never voided** (409
  `first_bag_not_voidable`); a re-declaration to fewer bags keeps it.
- Moving the fulfilment to `ready_for_pickup` is refused when:
  - a live parcel has no print: 409 `labels_not_printed`, with a count;
  - the shop requires pack scanning and a live parcel is not pack-scanned: 409 `bags_not_packed`;
  - no declaration was ever made **and** the package has chilled or frozen lines: 409
    `zone_bag_required`. This stops the backfilled single "frozen" bag from silently standing in for
    mixed goods.
- "n of N" is `seq` of N live parcels. Because only the last bag can be voided once printed, `seq` stays
  contiguous, so a printed "n" is always still true; only N changes, and the shop reprints to show it.

**Rationale.** A label that has been printed must stay true. Voiding a middle bag would leave a stuck
label whose number no longer matches any reprint (analysis A1), so it is not allowed; the shop starts the
labels again instead.

## R5 — Hand-overs become per parcel, in the existing table

**Decision.** The migration evolves `package_hold` and `package_handover` in place rather than adding
parallel tables.

`package_handover` gains:
- `parcel_id` (NOT NULL after backfill; existing rows map to parcel 1);
- `actor_kind` (`driver | shop_staff | admin_staff`), `shop_staff_id` and `admin_sub`;
- `device_at`.

It also changes:
- `driver_id` and `round_id` become nullable, with a CHECK that the column matching `actor_kind` is set;
- the step set grows by `pack`, `courier_handover` and `shop_pickup`. **Arrival at the hub is ONE step,
  `checkin`**, whoever scans it; a driver's and hub staff's check-ins differ only by `actor_kind`;
- `UNIQUE (change_id, parcel_id)` replaces `(change_id, shop_fulfillment_id)`.

`recordHandovers` moves to `@effy/edge-shared/labels/handovers.ts` and stays **the one writer**. The driver,
shop and fleet services all call it. 091's three readers switch to per-parcel rows, and a package's summary
is derived from them.

**Rationale.** One record of each hand-over. A second "parcel_handover" table beside a "package_handover"
would be two sources for one fact, a pattern this repository has shipped defects through. Phase 0 migrates
090 first, so this migration evolves a table that may already hold rows; the backfill maps each to parcel 1,
which is exactly the bag those hand-overs moved.

## R6 — Every step accounts for every live parcel; the server enforces it

**Decision.** Each driver step request carries:
- `parcels[] {parcelId | parcelCode, method}`;
- `missingParcels[] {parcelId | parcelCode, reason, note?}`.

The steps are collect, check-in, load, door (proof) and return. The server works out the step's
**expected parcels** with one shared function, `expectedParcels(tx, step, scope)` in
`@effy/edge-shared/labels/parcels.ts`. Expected parcels are the live parcels of the step's packages that
have no open hold and no hand-over yet at this step.

A request that leaves any expected parcel unaccounted for is refused with 409 `parcels_unaccounted` and the
list, and the EMF metric `ParcelsUnaccounted{step}` is emitted. A retry of a step already completed answers as completed. This follows 093's gate order:
1. ownership
2. open
3. retry answer
4. sequence gates
5. **parcels**
6. write

The rules for missing parcels:
- **Some** of a package's parcels missing: a parcel hold is written (`package_hold.parcel_id` set) and the
  package carries on.
- **All** of a package's live parcels missing: a **package** hold is written, as in 093 today. At load this
  also takes the package off the run (`removeAssignment`).
- `heldSql` keeps excluding packages only for package-level holds (`parcel_id IS NULL`).
- A parcel with an open hold is not expected at later steps. When dispatch resolves it **Found**, it is
  expected again at the next step its package has not yet completed.

The old package-level fields (`packages`, `missing`, `notLoaded`) are **removed** from the driver
contract. The app has no installed users (093), and the app and `driver` ship together.

**Rationale.** 093 left completeness to the app ("Mark all loaded" asks about unscanned packages). FR-030
and SC-003 need the server to refuse a step that leaves a bag unaccounted for. Otherwise a modified or
buggy client recreates the original fault.

**Alternatives.** Keeping completeness client-only. That fails SC-003 for any client but ours.

## R7 — Reads: an append-only event per attempt, deduplicated by the client's id

**Decision.** Add a new table `public.label_read`. Each row holds:
- `id`, and `client_read_id uuid UNIQUE` (deduplication);
- `actor_kind` with its actor id columns, and `surface` (`driver_app | shop_web | back_office`);
- `step`, `raw` (≤ 64 characters), `method` (`scan | typed`);
- `outcome`: `accepted | already_counted | belongs_elsewhere | not_on_this_work | voided | cancelled |
  not_a_label | not_found` (`cancelled`: the bag's package was cancelled or fully refunded);
- `parcel_id` (nullable);
- `device_id`, `app_version`, `device_at`, `received_at`;
- `corrects_read_id`.

There are no UPDATE or DELETE grants for application roles, and a guard test checks for writers.

Clients **judge** a read locally with the scan rule (R12) and **report** it. The server records the
outcome the client saw **and** re-judges it against the database. When the two disagree (`server_outcome`
is stored too), the read is an exception: a clock or offline race, for example a parcel voided while the
driver was offline.

The driver sends reads in two ways:
- inline with each hand-over request (`reads[]`);
- through `POST /driver/v1/reads`, for reads with no hand-over (refused reads, a lookup). The offline
  queue replays them.

The shop's pack-scan route and back-office's lookup and hub routes record their own reads.

**One writer**: `@effy/edge-shared/labels/reads.ts`.

A read's `method` is `scan | typed` only. A bag ticked by hand is not a read; it is a hand-over with
method `manual` (R5).

**Clock tolerance**: reports trust `device_at` except for a read sent online whose `device_at` differs
from `received_at` by more than **10 minutes**; for those, reports use `received_at` and count the read
under "device clock wrong".

**Possible duplicate label** (spec Edge Cases): at one step, a package's parcel read `already_counted`
while another live parcel of the same package was declared missing in the same request. The report lists
these; nothing is blocked.

**Corrections** (`corrects_read_id`): the column exists so the record can be corrected without editing
it, but **no flow writes a correction in this feature**. A back-office correction tool is a later
feature.

**Rationale.** FR-060 needs the refused reads that 090 throws away. A client id makes an offline replay
idempotent (FR-062). Keeping both outcomes turns "the client said X, the server says Y" into data rather
than a silent overwrite.

## R8 — The hub station: hub staff check in parcels through the same core as drivers

**Decision.** Check-in becomes **per parcel** and can be done by anyone permitted:

- The run-level function `hubCheckin` moves into `@effy/edge-shared/delivery/hub-checkin.ts`. It is split
  into:
  - `checkInParcels(tx, actor, parcels)`, which records `checkin` hand-overs (actor driver or admin staff), refuses parcels not
    expected at the hub, and returns each parcel's sort instruction from 090's `hubSort`;
  - `closeRunCheckin(tx, runId, closer)`, which writes the existing `hub_checkin` row and closes the hub
    stop and the run **when every collected live parcel of the run is checked in or held**.
- The driver's check-in route calls both, as today.
- The new fleet routes call `checkInParcels`, then `closeRunCheckin` for every run the scanned parcels
  complete.
- `hub_checkin.driver_id` stays (the run's driver). A new column `closed_by` records `driver | admin_staff`.

The hub station answers **one result per read** in the scan rule's words (200, never a 409 for a refused
read, so a batch of reads is never lost to one bad bag). Refused, with a sentence (FR-043): not yet
collected, already checked in, delivered, voided, cancelled, and pickup-from-shop courier parcels
(`courier_collection = 'pickup'`). The hand-over step is `checkin` with `actor_kind = admin_staff` (R5).

**Access.** Hub routes require `admin` or `manager`, the same rule as 053's recording of order progress
(`canRecordOrderProgress`), enforced on the server from the staff record.

**Rationale.** One rule, one implementation (Principle III). Check-in by hub staff is the industry norm
(Shipsy in-scan, Amazon station). The driver's phone stops being the hub's only scanner.

## R9 — The label is one SVG document; every output is made from it

**Decision.** `labels.ts` is rewritten as a **pure function from a label document to an SVG string** sized
in printer dots for a chosen dpi (203 or 300), at 100% scale. The output paths are:

- **Browser print**: the SVG is placed in a print window with `@page { size: <label>; margin: 0 }`, one SVG
  per page, and the print dialog is told the exact size. On A4, four SVGs sit on a 2×2 grid. The final page
  break is removed, which fixes the blank second page.
- **Direct thermal (ZPL)**: the same SVG is drawn to a canvas at the printer's dpi, thresholded to 1 bit,
  and sent as one ZPL `^GFA` graphic field with Z64 compression. **The preview and the print are the same
  pixels** (FR-012b).
- **Preview** in the console: the same SVG, inline.

Rules carried into the renderer:
- Barcode modules are whole printer dots: 4 dots at 203 dpi and 6 at 300 dpi on A6/A4; 2 and 3 on the
  62 mm roll.
- The barcode, the bag number and the zone band have fixed sizes.
- Black only.
- The QR uses error correction level M.

**Rationale.**
- One renderer means one design. A ZPL layout written separately would drift from the HTML one, and the
  drift would reach paper.
- Rasterising at the printer's own dpi with whole-dot modules prints exact bar widths.
- This is the fix for W4 in research-08.

**Alternatives.**
- *Native ZPL text and barcode commands.* This is a second layout language for one design.
- *A PDF* through the browser. This still passes through the print dialog's scaling.

## R10 — Text fits by measured width, from a pinned metrics table

**Decision.**
- Labels set text in **Helvetica / Arial**, which are metric-compatible.
- Widths come from the standard Helvetica and Helvetica-Bold advance-width tables (Adobe core-14 AFM),
  pinned as a data file in shop-web.
- `fitText(text, maxWidth, sizes[], maxLines=2)` steps down through the block's sizes, then wraps on word
  boundaries to two lines, then ellipsises the second line. Clipping is not possible.
- The minimums are 9 pt for the name and 8 pt for the address on A6, and 5.5 pt on the 62 mm roll.

**Rationale.** It is deterministic and testable in vitest without a DOM. jsdom has no `measureText`, and a
DOM-dependent fit would differ between test and print.

## R11 — Direct printing through Zebra Browser Print's local service

**Decision.** Direct printing is optional per browser and supports **Zebra (ZPL) printers** through
**Zebra Browser Print**, Zebra's free local helper. shop-web talks to its local endpoint
(`https://localhost:9101` — `/available`, `/default`, `/write`) with `fetch`; no vendor script is bundled.

Settings → Printing lists the printers it finds and remembers the chosen one per browser. If the helper is
missing or fails, printing falls back to the browser print (FR-014), and the shop is told why.

**A print is recorded only after a successful send**: the window opened, or `/write` returned 200
(FR-018).

**Rationale.**
- Zebra is the most common thermal family and Browser Print is free.
- QZ Tray's silent printing is licensed at US$749 or more a year (research-08 §1.4).
- Other brands such as Brother QL print through the browser path at the correct size.

**Open (operator).** Which printers shops actually use. If it is Brother QL rather than Zebra, direct
printing adds Brother's web SDK in a later task. Nothing else changes, because the label is the same SVG.
Recorded in quickstart as a hardware check.

## R12 — One scan rule, in TypeScript as well as Kotlin, held to shared fixtures

**Decision.** Add `packages/shared-types/src/scan-rule.ts`, a pure `judgeRead(raw, method, context)`
returning the outcome and its words.
- The context lists the step's expected parcels plus where known other parcels belong.
- Kotlin's `ScanRule.kt` is extended to parcels.
- Both are pinned to `packages/shared-types/scan-rule.fixtures.json`. The app embeds a copy, which a TS test
  checks, in the same way as 090's `package-code.fixtures.json`.
- The words are shared: "Already scanned", "This bag is for Drop 3 · Northcote", "Not on this run", "This
  label was cancelled", "Not an Effy label".

**Rationale.** FR-052 requires the same outcomes everywhere. Two hand-written rules held to one fixture
file is this repository's established pattern for the TS/Kotlin pair (089, 085).

## R13 — Web scanning: keyboard-wedge detection, then camera through a BarcodeDetector polyfill

**Decision.** Add a new module `@effy/web-kit/scanner`, used by both shop-web and back-office.

- **Handheld scanners** are detected by a document-level `keydown` listener. A scan is a burst of printable
  keys arriving within 35 ms of each other, ending in Enter or Tab or a 60 ms idle, **and** matching
  `EFY1:` + 6 characters, an order number, or another token the screen accepts.
- Caps Lock and a stray key before the scan are tolerated, the same as the driver app's
  `HardwareScanner.kt` (092).
- While the scan box is active, keys in a burst are prevented from reaching a focused text field (FR-051).
- Typed entry is a field with explicit submit, recorded as `typed`.
- **Camera**: the native `BarcodeDetector` where present (Chrome on Android, ChromeOS, macOS). Otherwise the
  `barcode-detector` polyfill, which wraps zxing-wasm and exposes the same API.
  - Formats are limited to `qr_code` and `code_128`.
  - **The wasm file is self-hosted** with the app, never fetched from a CDN at run time.
  - The exact version is pinned at implementation, at least two weeks old.

**Rationale.**
- Keyboard-wedge timing and prefix detection is the documented practice (research-08 §1.5).
- Safari ships `BarcodeDetector` disabled, so a fallback is required.
- A polyfill with the standard API means one code path.

## R14 — Delivery note: one server document, digital only

**Decision.**
- The commerce route `GET /commerce/v1/orders/{id}/delivery-note` returns a `DeliveryNoteDTO`:
  - order number and date;
  - lines merged across packages by product (so no shop count leaks), each with ordered and supplied
    quantities and a status (`supplied | part | unavailable`);
  - the contact address.
- Supplied quantity comes from the shop's pick record (020's item progress, part and unavailable).
- The same route with `?format=pdf` returns the PDF (R16).
- customer-web and the app show the note and offer "Download".
- The delivered email and push (053's delivered notification) gain a link to the order's note.
- It is available only once the order has at least one delivered package. Before that, 409 `not_delivered`.
- It shows the order date and the delivered date (the latest delivery among its packages).

**Rationale.** It is digital by operator decision (spec Clarifications). Merging lines by product keeps
hidden fulfilment.

## R15 — Tax invoice: issued on first request, numbered, a frozen snapshot, never altered

**Decision.** Add a new table `public.tax_document` with these columns:
- `id`, `kind` (`invoice | adjustment`), `order_id`, `refund_id` (adjustments only);
- `number`, from the sequence `tax_document_number_seq`, formatted `EFY-INV-000001` and `EFY-ADJ-000001`;
- `issued_at`, a `snapshot jsonb` holding exactly what the PDF prints, and `issuer` (legal name and ABN as
  printed).

When a document is created:
- **The invoice** is created on the first request, once the order is paid. The same snapshot is returned
  for ever after.
- **An adjustment** is created on the first request after a refund settles, one per refund.
  `issueAdjustment` **issues the invoice first** when none exists, in the same transaction, so every
  adjustment refers to an invoice.
- **Orders from before 096** (any line with `order_item.gst_status IS NULL`) have no invoice entitlement:
  the route answers 409 `invoice_not_available_for_order` ("A tax invoice isn't available for this
  order"), and their refunds produce no adjustment.

GST is calculated as follows:
- Lines are marked taxable or GST-free from `order_item.gst_status`, which is captured at checkout.
- GST is `round_half_up(taxable_total_incl × 1/11)` over the invoice's taxable lines, after promotion
  discounts already applied to line amounts.
- Fees (delivery, small-order) are taxed per `business_tax.fee_treatment`: `taxable` or `gst_free`.
- **Points do not change GST.** They are a payment and are listed under payments (074).
- A customer may add a business name and ABN to **any** order (FR-085). When the order total is $1,000 or
  more, the buyer's identity (name, or business name and ABN) is printed and is required. If the customer gave no name, the invoice route answers 409
  `buyer_identity_required`, and the clients ask for it.
- An adjustment's GST is the refund's taxable share:
  - itemised refunds use their lines;
  - an amount-only refund uses `refund × invoice_gst / invoice_total`.

**Rationale.**
- ATO practice requires an invoice on request, and an adjustment note when a refund changes the GST
  (research-08 §1.7).
- A snapshot makes "never altered" structural: the PDF renders from the snapshot, not from live rows.
- **⚠ The fee treatment and the rounding approach are to be confirmed by Effy's accountant.** They are
  configuration, not code (spec Assumptions).

**Alternatives.**
- *Issuing at payment for every order.* This fails while the ABN is unset, and the ABN is supplied by the
  operator.
- *Per-line GST rounding.* It is allowed, but it diverges from the total. Whole-invoice rounding is the
  common practice.

## R16 — PDFs are rendered in the backend with `pdf-lib`

**Decision.** Add a new shared module `@effy/edge-shared/documents/pdf.ts` using **`pdf-lib`**. It is pure
JavaScript and needs no native binaries. It embeds Helvetica, a standard PDF font with no font file.

The commerce routes return `application/pdf`, base64-encoded through the gateway. Documents are about 20 KB,
far below Lambda's 6 MB response limit.

Both the tax invoice and the delivery note render from their snapshot or DTO. customer-web downloads through
the session-cookie proxy. The app downloads with its bearer client and hands the file to the platform share
or viewer through a `core/platform` driver.

**Rationale.** One renderer for web and app (Principle II). A client-side PDF in two languages would be two
layouts.

**Alternatives.**
- *Headless Chrome in Lambda.* It is about 50 MB and slow to start.
- *Printable HTML only.* The app has no print-to-PDF path that matches the web's.

## R17 — GST status on products: shop sets it, back-office reviews

**Decision.**
- `product.gst_status` is `taxable | gst_free`, nullable until classified.
- `order_item.gst_status` is captured at checkout.
- The shop sets it on create (**required**: a product cannot be created without it, so nothing new
  becomes unsellable once invoices are on) and on edit: shop-web's Basics dialog gains a "GST" choice.
- A change on a live product goes through 067's review as a proposed field (`gst_status`), shown in the
  catalog review diff.
- New routes in `catalog` (staff):
  - `GET /catalog/v1/admin/products/gst-missing` lists live products with no status;
  - `POST /catalog/v1/admin/products/gst` sets statuses in bulk, recorded in a history table
    `product_gst_change`.
- **Selling an unclassified product**: once `business_tax.invoices_enabled` is true, checkout refuses a cart
  holding one with 409 `product_unavailable`. The customer is told the item cannot be bought right now,
  never why. Until then, nothing changes (FR-093).

**Rationale.** This is the operator's decision (spec Clarifications), using the existing review machinery.

## R18 — Business tax details: set by the operator, failing loudly

**Decision.** Add a singleton `public.business_tax` with:
- `legal_name`, `abn` (11 digits, validated against the **ABN checksum**), `fee_treatment`;
- `invoices_enabled boolean DEFAULT false`, `updated_by_sub`, `updated_at`.

It is set through `orders` (staff): `GET/PUT /orders/v1/admin/tax-settings`. `invoices_enabled` can only be
turned on when the legal name, the ABN, the fee treatment and **zero unclassified live products** are all
in place (409 `tax_setup_incomplete`, listing what is missing).

While it is off, the invoice route answers 409 `invoices_unavailable` and the clients say "Tax invoices are
not available yet". A metric alarm fires when a customer asks during that time (FR-084).

**Rationale.** These are real-world identifiers, supplied by the operator (constitution, *Real-World
Identifiers*). There are no defaults and no placeholders.

## R19 — Services and gateways

| Service | Gateway | Adds |
|---|---|---|
| `shop` | shared | parcel declaration, void, prints, pack-scans (+4 routes). The status transition gains the ready gate. Courier and shop pickup hand-overs per parcel. |
| `driver` | shared | `POST /driver/v1/reads` (+1). Every step's body becomes per parcel. Reads carry parcel lists. |
| `commerce` | shared | delivery note, tax documents (each JSON or PDF) and the order's business identity (+3). Checkout captures `gst_status`. |
| `fleet` | staff | hub expected and hub check-in (+2), hand-over report (+1), **the shop's pack-scanning setting** `PUT /fleet/v1/shops/{id}/pack-scanning` (+1, admin or manager; fleet owns dispatch-side shop operations, and `admin` cannot take routes). Exceptions gain parcel holds. |
| `orders` | staff | scan lookup (+1), tax settings get/put (+2). Order detail lists parcels and their hand-overs. |
| `catalog` | staff | GST missing and GST bulk (+2). Review shows `gst_status`. |
| `notifications` | — | The delivered message links the delivery note (no route). |

That is **shared +8 and staff +9**. 093 left both gateways at 54% of 300. `gateway-capacity.contract.test.ts`
confirms the totals.

**`admin` gains nothing.** It is the stack that reached CloudFormation's 500-resource limit in 095.

## R20 — Live updates

Each route below announces after commit using the existing helpers (071):
- parcel declaration, void and print: `announceMoves` to the shop's `orders`, because the order moved;
- pack-scan: `orders`;
- hub check-in: `announce('dispatch')`, plus the run's driver `today`;
- parcel holds: `dispatch`.

`change-map.guard.test.ts` covers the new routes. The customer receives nothing new: documents are read on
demand.

## R21 — What the label is fed (shop label DTO)

`ShopPackageLabelDTO` is replaced by `ShopParcelLabelDTO[]` on the order detail. Each entry has:
- `parcelId`, `code`, `seq`, `of`, `zone`, `voided`, `printed {count, firstAt, lastAt, lastBy}`, and
  `packScanned {at, by}`;
- the label's shared fields once per package: `service` (`effy | courier`), `recipientName`, `street`,
  `suburb`, `state`, `postcode`, `orderNumber`, and `packedOn` (the first print's date, or today on the
  first print).

The recipient's name and address come from the order's `delivery_address`, which the shop's detail already
carries (spec Clarifications reverse 089's exclusion of them).

**Rationale.** The data already reaches the shop. Nothing new is exposed.

## R22 — Retention

Reads, hand-overs, prints and tax documents follow the order records' retention. Tax documents are kept
for at least five years. Nothing is purged by this feature. A retention job is out of scope, and none
exists for orders today.

## R23 — Hardware (operator, not blocking)

Not yet known. The defaults the build assumes:
- 203 or 300 dpi direct-thermal printers at 4×6 / A6 or 62 mm;
- A4 office printers for 4-up A6 sheets;
- USB or Bluetooth keyboard-style scanners that send Enter or Tab after a scan.

Quickstart Q0 asks the operator to name the models before the walk.

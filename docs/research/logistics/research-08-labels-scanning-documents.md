# Research 08 — Labels, scanning and printed documents: industry vs Effy

2026-10-21. Question from the operator: how does the industry handle order paperwork and barcodes —
barcode and box-label printing, scanning, bills — what are the methods and best practices, how does
Effy compare, and what have we done wrong? Scope: shop-web, the driver app, back-office and the
customer surfaces. **The shop mobile app is out of scope** (stopped 2026-10-21).

> **Status:** §5's plan is **built as feature 096** ([specs/096-parcel-labels-scanning](../../../specs/096-parcel-labels-scanning/tasks.md),
> 2026-10-22): a code and label per bag, per-bag hand-overs and reads, pack scanning, scan-to-find, the hub
> station, the hand-over report, the delivery note, GST status and the tax invoice. Not yet migrated, deployed
> or walked — see FEATURE-HISTORY.md (096). The analysis below is kept as written.

**Short answer.** The label *code* is well designed: a permanent code with no look-alike characters, a
versioned prefix, one definition shared by TypeScript and Kotlin, and no customer details on the label.
The driver-side scan rule is also close to what Onfleet, Bringg and Amazon do. **The problems are in
what the code is attached to and in everything around it:**

1. **One code per shop portion, not per physical bag.** That breaks every count downstream.
2. **Temperature is a word on the label, not a separate bag.**
3. **Picking is a tick-box.** Product barcodes are unvalidated free text, so there is nothing reliable
   to scan against.
4. **Printing goes through the browser's print dialog.** Bar widths are not on the printer's dot grid,
   and nothing records that a label was printed.
5. **The hand-over record is thin.** It holds no device time, no device, and no raw read. Refused
   scans are never recorded.
6. **No packing slip or delivery note, and no tax invoice.**
7. **Back-office and the hub cannot scan.**
8. **None of 089–093 has been migrated, deployed or walked.**

---

## 1. What the industry does

### 1.1 Identity: one barcode per physical unit

| Practice | What it means | Source |
|---|---|---|
| **Every handling unit has its own ID** | GS1's logistic label rests on one mandatory element: a unique serial per logistic unit (the SSCC, 18 digits, AI `(00)`, in GS1-128), "like a licence plate". Each unit's ID is shown both as a barcode and in human-readable text. | [GS1 AU logistic labels](https://www.gs1au.org/download/GS1au-fact-sheet-logistic-labels.pdf/file), [GS1 Logistic Label Guideline 1.3](https://www.gs1.org/standards/gs1-logistic-label-guideline), [GS1 UK SSCC](https://www.gs1uk.org/knowledge-hub/barcodes/how-do-i-create-ssccs-and-logistics-labels) |
| **Multi-piece shipments: each piece scanned on its own** | "Each piece in an MPS is labeled and scanned individually, so it has its own barcode and piece-level tracking number", linked to a master number and printed "2 of 4". Amazon FBA box labels use per-box suffixes (`…U000001`, `…U000002`). Global-e makes a per-parcel code mandatory on a split order. | [Racklify MPS](https://racklify.com/encyclopedia/foundations-of-multi-piece-shipments-mps/), [Amazon FBA label spec](https://docs.developer.amazonservices.com/en_DE/fba_guide/FBAGuide_ShipLabelSpec.html), [Global-e labels](https://docs.global-e.com/preview/en/labels-and-shipping-documents.html), [Shippo MPS](https://docs.goshippo.com/shipments/multi-piece-shipment) |
| **Dark stores: every bag tagged and scanned at hand-over** | The picker bags, labels and stages the order. "Each bag is scanned and tagged to the specific order ID." The rider scans the bag at hand-over, and that scan is what starts live tracking. Readiness is a clear set of states: packed, staged, ready, handed to rider. | [Forbes India — dark stores](https://www.forbesindia.com/article/enterprise/startups/dark-stores-explained-the-tech-behind-10-min-delivery/2987880/1), [Shipsy dark-store dispatch](https://www.shipsy.ai/insights/quick-commerce-dark-store-dispatch-operations), [Dark store WMS checklist](https://www.webbytemplate.com/blog/dark-store-wms-checklist-quick-commerce/) |

### 1.2 Picking and packing are verified by scanning

| Practice | Source |
|---|---|
| **Scan to pick:** the picker scans each item as it is picked, and a wrong item is stopped at the shelf. Partial picks get scan-and-count prompts. Vendors claim 99.5–99.9% accuracy with enforced scanning (treat as directional). | [Cleverence](https://www.cleverence.com/articles/business-blogs/barcode-scanning-picking-4927/), [Dynamics Mobile](https://www.dynamicsmobile.com/insights/barcode-scanning-best-practices-eliminating-picking-errors-in-your-warehouse), [ChannelDock](https://channeldock.com/en/how-to-reduce-picking-errors-warehouse/) |
| **Scan to pack:** scan the container's ID (an LPN, a "licence plate number" for the box or bag), then each item going into it. The system flags missing items, wrong items and over-quantities. Verification ends in label printing. | [Racklify scan-to-pack](https://racklify.com/encyclopedia/what-is-scan-to-pack-definition-core-concept/), [Jasci Pack Scan](https://jasci.atlassian.net/wiki/spaces/MFS/pages/8683558/Pack+Scan+Product), [Cahoot](https://support.cahoot.ai/hc/en-us/articles/5844278434967) |
| **Grocery picking (Instacart):** "Found item" → scan the barcode, and the app says immediately if the item is wrong. Weighed produce is entered by weight. "Can't find" → substitute or refund, with the customer asked. Instacart moved to a commercial scanning SDK because the open-source one failed in glare and dim light. | [Instacart Quick Scan](https://company.instacart.com/shopper-community/making-shopping-more-efficient-with-quick-scan), [Scandit × Instacart](https://www.scandit.com/resources/case-studies/instacart/) |
| **Clean barcode data comes first.** Reliable SKU and barcode master data is a stated prerequisite. | [Extensiv](https://www.extensiv.com/blog/best-practices-for-scanning-warehouse-inventory) |

### 1.3 Temperature: separate bags, not a word on one bag

Grocery picks and buffers goods **by zone**: ambient, chilled and frozen, with large stores using 5–9
zones. Labels make totes and bags easy to sort by zone, and some operators colour-code the totes.
Frozen and chilled go in **their own bags**, using insulated bags or liners and gel packs or dry ice
on longer routes. Chilled is about 0–8 °C and frozen about −18 °C.
Sources: [StrongPoint picking whitepaper](https://www.strongpoint.com/app/uploads/2023/08/strongpoint_whitepaper_pillars_picking_profitability_2023.pdf),
[Racklify grocery workflows](https://racklify.com/encyclopedia/what-is-grocery-delivery-models-and-last-mile-workflows/),
[Racklify chilled labels](https://racklify.com/encyclopedia/chilled-product-label-vs-refrigerated-label-which-to-use-and-when/),
[Webvan zone totes](https://www.warehouse-science.com/wh/sites/Webvan/Webvan-Pages/Image1.html),
[VTEX grocery logistics](https://help.vtex.com/en/docs/tutorials/logistics-in-the-grocery-segment-supermarkets),
[Woolworths click & collect (one shopper's account)](https://blog.tomw.net.au/2021/09/wollies-direct-to-boot-worked-better.html).

### 1.4 Printing labels

| Practice | Source |
|---|---|
| **The standard parcel label is 4×6 in / 100×150 mm (A6) on a direct-thermal printer.** Australia Post's label API offers `THERMAL-LABEL-A6-1PP` alongside A4. Shopify supports thermal 4×6, Letter and A4, and can combine a packing slip with the label. The GS1 AU logistic label is a constant 105 mm wide. | [AusPost labels API](https://developers.auspost.com.au/content/apis/shipping-and-tracking/info/api-resources/labels.html), [Shopify labels](https://help.shopify.com/en/manual/fulfillment/shopify-shipping/managing-labels/printing-shipping-documents?ld=1), [GS1 AU](https://www.gs1au.org/download/GS1au-fact-sheet-logistic-labels.pdf/file) |
| **Web apps print to thermal printers directly, without the browser's dialog**, by sending ZPL (Zebra's printer language). The two common routes are Zebra Browser Print (free, a local helper on the PC) and QZ Tray (silent printing needs a paid licence: US$749/yr+). | [Zebra — print from a web application](https://developer.zebra.com/content/print-web-application), [QZ](https://qz.io/) |
| **Bar width is a whole number of printer dots.** At 203 dpi one dot is 0.125 mm. A 2-dot (0.25 mm, ~10 mil) or 3-dot (0.375 mm) module prints cleanly. A width between dots is rounded per bar, so bars come out uneven. Print quality is graded A–F under ISO/IEC 15416, and C is the minimum. | [TSC](https://fs.tscprinters.com/fr/dl/3/7795), [Seagull X-dimension](https://support.seagullsoftware.com/hc/de/community/posts/216570067-X-Dimension-Label-Width) |
| **Each label records whether it was printed**, and reprinting is a normal, recorded action. Batch printing runs from the order list (Shopify: up to 100 labels). Pop-up blockers are a known failure. | [Shopify labels](https://help.shopify.com/en/manual/fulfillment/shopify-shipping/managing-labels/printing-shipping-documents?ld=1) |
| **Courier labels come from the carrier's API**, as A6 PDF or ZPL, with the tracking number attached automatically. They are not uploaded by hand. | [AusPost labels API](https://developers.auspost.com.au/content/apis/shipping-and-tracking/info/api-resources/labels.html), [EasyPost AusPost](https://docs.easypost.com/carriers/australia-post-guide) |

### 1.5 Scanners

- **Handheld USB/Bluetooth scanners act as keyboards ("keyboard wedge").** A page cannot tell a scan
  from typing, so it detects a scan by a **programmed prefix/suffix** plus **timing** (a burst within
  ~100 ms). It keeps scans out of whatever text field has focus, and **validates on the server**.
  Sources: [QEST web app guide](https://spectraqest.atlassian.net/wiki/x/VoC7w),
  [Rockwell example](https://www.rockwellautomation.com/en-fi/docs/factorytalk-batch/18-00/factorytalk-eprocedure-online-help-ditamap/sample-html-code/control-step-with-other-web-content/bar-code-scanner-integration-example.html),
  [Datalogic forum](https://discussion.datalogic.com/t/how-to-suppress-keyboard-events-for-scanned-data/1593),
  [Laracasts](https://laracasts.com/discuss/channels/general-discussion/has-anyone-implemented-an-barcode-scanner-for-their-webapp-before).
- **Camera scanning in a browser.** `BarcodeDetector` works in Chrome on Android, is partial on
  desktop Chrome, is **off by default in Safari** and absent in Firefox. The usual pattern is to
  detect the feature and fall back to a JS decoder (ZXing).
  Sources: [caniuse](https://caniuse.com/mdn-api_barcodedetector), [MDN](https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector).

### 1.6 Hand-over and custody records

**Scan at every hand-over:** pick, pack, load, departure, arrival, out for delivery, delivery attempt.
Research-07 §1 covers the driver half (Onfleet Route Load, Bringg, Track-POD, Amazon, Shipsy).

A custody event records **who handled it, when, where, which device, and the evidence**. The record is
**append-only**: a correction supersedes an earlier event and links back to it. The design decides up
front whether a repeat scan is a duplicate or a second action. **Offline capture** must still produce
a verifiable record later. The **raw device log** is kept. Useful measures are the share of hand-overs
with a complete record and exceptions per 1,000 hand-overs.

Sources: [Racklify chain of custody](https://racklify.com/encyclopedia/how-to-implement-chain-of-custody-delivery-in-your-warehouse/),
[Racklify best practices](https://racklify.com/encyclopedia/chain-of-custody-best-practices-implementation-vs-alternatives/),
[IT Supply Chain — status is an event](https://itsupplychain.com/a-shipment-status-is-an-event-not-a-location/),
[PackageX](https://packagex.io/blog/chain-of-custody-in-logistics).

### 1.7 Documents

| Document | Who it is for | What is on it | Source |
|---|---|---|---|
| **Pick list** | Internal, for the shelves | Lines, SKU, quantity, often a location. No money. | [ShipBob](https://www.shipbob.com/au/blog/packing-slip/) |
| **Packing slip / delivery note** | The **recipient**, in the box | Order number and date, address, items and quantities, **no prices**, return/contact notes. Generated by the fulfilment system, not the payment system. | [ShipBob](https://www.shipbob.com/au/blog/packing-slip/), [WebAppick](https://webappick.com/packing-slip-vs-invoice/), [Shopify packing slips](https://help.shopify.com/en/manual/orders/packing-slips) |
| **Tax invoice (Australia)** | The payer | Must be supplied **on request within 28 days** for a taxable sale **over $82.50 incl. GST**. It shows the words "Tax invoice", the seller's identity and **ABN**, the date, the items, GST (or "total includes GST"), and which items are taxable. At **$1,000+** it also shows the buyer's identity or ABN. ⚠ Secondary sources: confirm on ato.gov.au (the ATO page refused our fetch). | [Stripe AU](https://stripe.com/resources/more/tax-invoice-vs-regular-invoice-in-australia), [Sprintlaw](https://sprintlaw.com.au/articles/ato-tax-invoice-requirements-what-must-be-on-your-invoices/), [Airwallex](https://www.airwallex.com/en-au/blog/tax-invoice-requirements) |

### 1.8 Product barcodes

- **Validate the check digit when a barcode is entered.** Store one canonical **14-digit** key
  (zero-padded), keep the original, and match scans on that key.
  Sources: [GS1 check digit (via SyncForce)](https://support.syncforce.com/knowledge/how-to-check-the-correctness-of-a-gtin), [DataFeedWatch](https://www.datafeedwatch.com/blog/how-to-validate-your-gtins-in-5-steps).
- **Variable-measure items** (deli, meat, produce) carry in-store EAN-13s with a 02/2x prefix and the
  price or weight inside the barcode. The layout varies by country and retailer, so a parser is
  configured per shop.
  Sources: [GS1 UK variable measure](https://www.gs1uk.org/knowledge-hub/barcodes/how-to-barcode-variable-measure-items), [GS1 BE-LU](https://www.gs1belu.org/fr/media/1601/download), [Tapa price-embedded](https://help.tapapos.com/kb/price-embedded-barcodes).
- **GS1 Sunrise 2027:** retail tills are expected to read 2D codes (GS1 DataMatrix, and QR using GS1
  Digital Link) alongside EAN/UPC by the end of 2027. Any product scanner we build should accept both.
  Sources: [Keyence](https://www.keyence.com/blog/gs1-sunrise-2027-explained-requirements-timeline-and-preparation.jsp), [Dynamsoft](https://www.dynamsoft.com/blog/insights/gs1-sunrise-2027-transition-to-2d-barcodes-for-global-commerce/).

---

## 2. Effy today

| Area | What exists | Where |
|---|---|---|
| Package code | `shop_fulfillment.package_code`: 6 characters from an alphabet with no look-alikes, permanent and unique. One per **shop portion of an order**. | `db/migrations/20261016150000_package_code.sql` |
| Token | `EFY1:<code>`. The parser ignores anything else. A Kotlin copy is held to the same fixtures. | `packages/shared-types/src/package-code.ts`, driver `core/scan/PackageToken.kt` |
| Label | shop-web "Print label": Code 128 B (our own encoder) full width, plus a QR. Layouts: 62 mm roll, 4×6 in, A4 21-up. Says EFFY/COURIER, order number, "package n of m" (n of **shops**), suburb, and FROZEN/CHILLED (coldest wins). Printed through `window.open` + `print()`. Has a `copies` option that prints **the same code** again. | `apps/shop-web/src/features/fulfillment/labels/` |
| Pick | A printed pick list (no money). On screen, every line is a tick-box, with an "Adjust" dialog for part-picked or unavailable lines. **No scanning.** | `fulfillment/pickList.ts`, `components/ItemsAndFulfilment.tsx` |
| Product barcode | `product.gtin`: free text, not unique, no check digit, not searchable. Editable in shop-web and shown in back-office review as "Barcode". | `20260716092105_product_catalog.sql:93`, `ProductEditDialogs.tsx` |
| Driver scanning | Camera (ML Kit / AVFoundation, QR + Code 128), Bluetooth keyboard-style scanners, or typing the code. One offline `ScanRule` with a hard stop for another shop's package. Used at five steps: shop, hub, load, door, return. | `apps/driver-mobile/.../core/scan/` |
| Hand-over record | `package_handover`: step, `scan`/`typed`/`manual` as **reported by the app**, server `recorded_at` only. Refused reads are not sent. | `20261016160000_package_handover.sql`, `driver/src/work/handover.ts` |
| Work order | Server-enforced gates: collect → check-in → load → deliver (093). | `driver/src/work/sequence.ts` |
| Back-office | Shows each package's code and its hand-overs, plus scan rates per round and per shop (091). **No scanner input.** | `features/orders/components/PackageRows.tsx` |
| Courier labels | A file staff upload by hand to `courier-label/`, read through presigned links. | `shared/src/lib/media.ts`, `delivery/consignment.ts` |
| Customer | Receipt page and email (052). No tax invoice, no ABN, no GST, no delivery note. Products carry **no GST classification**. | `notifications/src/receipts/` |
| Live? | 089, 090, 091 and 093: **not migrated, deployed or walked.** 092: `driver` deployed, but the app has not been walked. | FEATURE-HISTORY |

---

## 3. Side by side

| # | Area | Industry | Effy | Verdict |
|---|---|---|---|---|
| 1 | Unit identity | One ID per physical unit; "2 of 4" counts physical pieces | One ID per shop portion; "n of m" counts shops; copies repeat the code | ❌ **Wrong** |
| 2 | Code design | Unique, permanent, human-readable, prefix-scoped | Same, and no look-alike characters | ✅ Good |
| 3 | Temperature | Separate bags per zone, each labelled | One coldest-wins word on one label | ❌ Wrong |
| 4 | Pick verification | Scan each item; a mismatch stops the pick | Tick-box | ❌ Gap |
| 5 | Pack verification | Scan the container, then items into it; bag count confirmed | None; "Ready" needs no label | ❌ Gap |
| 6 | Product barcode data | Check digit validated, one canonical key, searchable | Free text, unvalidated | ❌ Wrong |
| 7 | Weighed items | Weight entered or read from a price-embedded barcode | Not modelled | ❌ Gap |
| 8 | Label printing | Direct thermal (ZPL) or a fixed-size PDF; bars on the dot grid | Browser dialog (may scale); 0.31/0.53/0.34 mm bars = 2.4/4.2/2.7 dots | ⚠ Weak |
| 9 | Print record | Printed / not printed; reprints recorded | None (telemetry only) | ❌ Gap |
| 10 | Shop scanner input | Keyboard wedge with prefix/suffix and timing | None | ❌ Gap |
| 11 | Driver scanning | Scan at every hand-over; reasons for misses | Built (camera, wedge, typed, manual with reason) | ✅ Good (not walked) |
| 12 | Custody record | Who, when (device time), where, device, raw read, refused reads, append-only | Who, step, self-reported method, server time | ⚠ Thin |
| 13 | Back-office / hub scanning | Scan any label to find it; a hub sort station | Neither | ❌ Gap |
| 14 | Delivery note in the bag | Standard; no prices | None | ❌ Gap |
| 15 | Tax invoice | ATO-compliant, on request | Receipt only; no ABN/GST; no GST classification | ❌ **Compliance gap** |
| 16 | Courier labels | Carrier API, tracking attached | Uploaded by hand | ⚠ Manual |
| 17 | Proven in use | Walked before it is built on | 089–093 never walked | ❌ Process |

---

## 4. What we did wrong (the deep dive)

### W1 — The barcode identifies a shop's portion, not a bag (the root mistake)

`package_code` sits on `shop_fulfillment`: one shop's share of one order. A grocery portion is often
several physical bags. The label has a `copies` option, and it prints **the same code** on each bag.
What follows:

- The driver scans bag 1 and the portion counts as collected. Bags 2 and 3 answer "already scanned",
  so **a bag left on the counter is invisible**. The same goes at hub check-in, at load and at the door.
  The scan rule that 090–093 built is exact, but it is counting the wrong thing.
- "Package 1 of 2" means *shop 1 of 2*, but it appears on every bag. A driver holding three bags that
  all say "1 of 2" has no way to know what is complete.
- There is no physical count anywhere (bags per order, per stop, per van), so dispatch cannot check
  load or space, and "missing" (093 US4) can only be declared for a whole portion.

Industry practice (§1.1) is unambiguous: **the scannable ID belongs to the physical unit**, with a
link up to the order.

### W2 — Temperature is a word, not a bag

The label's cold mark is the *coldest* class in the portion. A portion with ice cream and bread gets
one FROZEN label. Nothing tells the shop to pack frozen separately, and nothing lets the hub or van
keep it cold or check that it was. The driver manifest (065) knows each line's storage class, but the
physical bags do not. This is food safety, not just tidiness.

### W3 — Picking trusts a tick, and the product barcode cannot be trusted

Picking is one click per line. Even if we added scanning, `product.gtin` is unvalidated free text with
no canonical form, so a scanned EAN-13 would not reliably match what the shop typed (leading zeros,
UPC vs EAN, typos). Weighed goods are not modelled at all. **Validated barcode data has to come first,
and scanning can only be built on top of it.**

### W4 — Printing assumes the browser behaves like a label printer

- The labels are HTML sent to `window.print()`. Browsers default to scaling ("fit to page") and add
  margins, so a bar width chosen in mm reaches the paper at a different size, and pop-up blockers stop
  it (we handle that one).
- The chosen bar widths (0.31 / 0.53 / 0.34 mm) are **not whole printer dots** at 203 or 300 dpi.
  Each bar is rounded separately, which skews the bar/space ratios that Code 128 depends on. It may
  scan with a phone. It will grade worse with a handheld, and that handheld is the reason the barcode
  was made the main element.
- No label is ever recorded as printed. "Mark ready for pickup" does not require one, so a package can
  be handed to a driver with no label, and the driver's scan step then has nothing to scan.

### W5 — The custody record says less than it seems to

`package_handover` stores the step and what **the app says** the method was, timed by the server.
What is missing:

- The device's own scan time. An offline load synced an hour later is stamped an hour late.
- The device or app version.
- The raw read.
- Any refused read. A wrong-shop or not-your-work scan stops the driver on screen, but the server
  never hears of it, so the most useful exception data (91's "which labels fail") is thrown away.
- The shop side. No shop staff member is recorded as handing over.

091's "8 scanned · 2 not scanned" is accurate about what was *reported*, but it cannot show which
labels fail to read.

### W6 — The bag goes out with no paper, and the customer gets no tax invoice

- **No delivery note in the bag.** The customer cannot check contents at the door, and a part-picked
  or unavailable line shows up only on a screen. Because Effy hides which shop fulfilled an order, the
  note must be Effy-branded and must not name the shop, and the label already follows that rule.
- **No tax invoice.** The receipt has no "Tax invoice" heading, no ABN, no GST and no taxable or
  GST-free marking, and **products have no GST classification**, so a compliant invoice cannot be
  produced today. Most basic food in Australia is GST-free, but many grocery lines are not, so it has
  to be per product. This is a legal obligation when a customer asks (> $82.50), not a nice-to-have.

### W7 — Back-office and the hub cannot scan

Staff can see a code but cannot scan one: there is no "scan anything to find it" box, and no hub
station screen for hub staff (check-in and sort are driver-only today). When a label is found on the
floor, someone has to type its code into a search that does not search by code.

### W8 — We kept building on a foundation nobody had used

Five features (089–093) are stacked on each other, and none has been migrated, deployed and walked on
a device with a printed label. W1 and W4 would very likely have surfaced in the first walk: three bags
on a counter and a 4×6 label through Chrome's print dialog.

### What we did right (keep)

- A permanent code with no look-alike characters, a versioned `EFY1:` prefix (so a product's EAN can
  never match), and one definition shared by TypeScript and Kotlin through fixtures.
- No shop, customer name, street or price on the label (hidden fulfilment), and the label tells the
  shop only who takes the package away.
- The offline scan rule with a hard stop for another shop's package, and a reason required when a
  package is not scanned.
- Server-enforced work order (093), which matches Onfleet and Bringg.
- Support for camera, wedge, typed and manual entry from the start.

---

## 5. Plan: proposed features

Order matters. **Phase 0 comes first**, because every later feature changes code that has not been
run yet.

### Phase 0 — Make 088–093 real (no new feature; operator steps plus one fix)

1. Migrate and deploy 088–093 to dev in the recorded order. Walk 089's quickstart with a **real
   printer and a real handheld scanner**, then walk 092 and 093 on a device.
2. Quick fix before the walk: snap `barModuleMm` to whole dots (0.25 or 0.375 mm at 203 dpi) and
   print at 100% scale with `@page` margins of 0.

### F1 — Parcels: one barcode per physical bag (fixes W1 and W2)

- New `package_parcel`: `parcel_code` (same alphabet and same uniqueness space as package codes, so
  the `EFY1:` token and the parser are unchanged), `shop_fulfillment_id`, sequence, `temperature_zone`
  (`ambient`/`chilled`/`frozen`), and created/voided fields.
- **Pack step in shop-web.** When a portion is marked ready, the shop says how many bags per zone. If
  the portion has frozen or chilled lines, at least one bag of that zone is **required**. One label
  prints per bag: "Bag 2 of 3 · FROZEN". "Of 3" counts **this portion's bags only**, so another shop's
  bags are never counted (hidden fulfilment). Labels can be voided and reprinted.
- **Driver:** `ScanRule` counts parcels. Every step expects every bag. "Missing" (093) is declared
  per bag. Hand-overs record per parcel.
- **Compatibility:** a scan of an existing *package* code still resolves to all of its parcels, so
  labels printed before F1 keep working. The customer is **never** shown a bag count, because that
  would reveal how many shops filled the order.

### F2 — Validated product barcodes (fixes the first half of W3)

- Check-digit validation on `gtin` (GTIN-8/12/13/14). Store a canonical 14-digit `gtin14`, indexed
  but not unique (one product can be stocked by more than one shop). Find products by barcode in the
  shop catalogue and in back-office.
- Find the rows that are invalid today and report them to shops, rather than silently rejecting them.
- Weighed items: a "sold by weight" flag. A price-embedded barcode format (02/2x) can be set per shop
  later.
- Accept GS1 Digital Link and DataMatrix input as well as EAN/UPC (Sunrise 2027).

### F3 — Scanning in shop-web: pick and pack (fixes the second half of W3, and W10)

- One web scanner module in `@effy/web-kit`, used by both shop-web and back-office:
  - Keyboard wedge: a prefix/suffix plus a timing burst, kept out of focused fields.
  - Camera: `BarcodeDetector`, falling back to ZXing.
  - Typed entry.
  - One TS scan rule, with the same outcomes as the driver's `ScanRule`.
- **Pick:** scanning a product counts against its line. A wrong product is a hard stop. A weighed item
  asks for its weight. Ticking by hand stays available, but each tick is recorded as manual.
- **Pack:** scan each bag's label as it is filled, so every bag label is confirmed. A portion can be
  marked ready **only once every bag label is printed and scanned**.

### F4 — Printing done properly (fixes W4)

- Render labels for the printer's dots: 203/300 dpi profiles, whole-dot bar widths and fixed-size
  output. Optional **direct thermal printing** through Zebra Browser Print (ZPL), with the browser
  print as a fallback.
- Record every print: label, parcel, who, when and the reprint count. Show "Printed / Not printed".
  Batch print from the order list.
- **Hardware is a decision for you:** which printers and scanners shops have, or should be given.

### F5 — Documents: delivery note and tax invoice (fixes W6)

- **Delivery note** (Effy-branded, no shop, no prices): items, quantities, what was part-picked or
  unavailable, and Effy contact. Printed with the labels, one per **order**. ⚠ Open design question:
  an order is packed by several shops, so either each shop prints a note for its own lines, or the
  note is added at the hub. An email or app version is the alternative.
- **Tax invoice:** a GST classification on every product (taxable or GST-free, which is a catalogue
  change that shops and back-office review), Effy's ABN in settings, a GST line on the receipt, the
  words "Tax invoice", and a downloadable PDF from customer-web and the app. Handle buyer identity at
  $1,000 or more. Refunds may need adjustment notes (to be checked during the plan).

### F6 — Custody record and back-office scanning (fixes W5 and W7)

- An append-only `scan_event` for every read, including refused ones: raw value, outcome, device scan
  time, device and app version, step, and actor (driver **or shop staff or hub staff**). The driver app
  queues these offline. `package_handover` stays as the per-step summary.
- **Back-office:** one "scan anything" box that finds by label, product barcode or order number. A
  **hub station** screen (a back-office page with a USB scanner) for check-in and sort by hub staff, so
  the hub no longer depends on the driver's phone.
- Reports built on the events: labels that fail to read, exceptions per 1,000 hand-overs, and shops
  with a high rate of manual hand-overs.

### F7 — Courier labels from the carrier (W "16"; deferred)

Book through a carrier or aggregator API (AusPost eParcel / Sendle / an aggregator) and receive the
A6 label (PDF or ZPL) and tracking automatically, replacing the hand upload. **Needs a carrier
decision first.**

### Customer surfaces

They change only through F5 (delivery note and tax invoice) and F2 (an optional "scan a product to
find it" in the customer app, low priority). Nothing about bags, parcels or scanning reaches a
customer.

### Decisions needed from the operator before `/specify`

1. **Hardware:** printer model, dpi and roll size per shop, and handheld scanners for shops and the
   hub. This sets F3 and F4.
2. **Delivery note:** one per shop portion, added at the hub, or digital only.
3. **GST:** the ABN to print, and who sets each product's GST status (shop, back-office, or both with
   review).
4. **Carrier** for F7, if it is pursued now.
5. **Pick scanning:** required for every shop, or a setting per shop.

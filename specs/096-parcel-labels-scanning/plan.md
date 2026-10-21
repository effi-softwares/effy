# Implementation Plan: Parcel Labels, Scanning & Order Documents

**Branch**: `dev` (feature directory `096-parcel-labels-scanning`) | **Date**: 2026-10-21 | **Spec**: [spec.md](spec.md)

## Summary

The **bag** becomes the unit that is labelled, scanned, counted and recorded.

- **Parcels.** Every package has one or more parcels. Parcel 1 reuses the package's 089 code, so old labels
  keep working by data, not by special cases (R1). The shop declares bags per temperature zone and prints one
  professional, carrier-style label per bag (US10).
- **Printing.** Labels come from **one SVG renderer**, whose bars sit on the printer's dot grid. The same SVG
  goes through the browser print at exact size or, rasterised, to a Zebra printer as ZPL (R9).
- **The ready gate.** A shop cannot mark a portion ready until every bag is printed, and pack-scanned when
  the shop requires it.
- **Per-bag hand-overs.** Every driver step must account for every live bag, and the **server** enforces it
  (R6). Missing bags are held one by one.
- **Hub station.** Hub staff check in bags from a back-office hub station through the same check-in core as
  drivers (R8).
- **Reads.** Every read on every surface is an append-only event, refused reads included (R7), and feeds the
  hand-over reports.
- **Customer documents.** Customers get a digital delivery note and an Australian tax invoice, rendered once
  to PDF in the backend (R14–R16). Products carry a GST status that the shop sets and back-office reviews (R17).

Decisions: [research.md](research.md) R1–R23. Data: [data-model.md](data-model.md). Contracts:
[contracts/api.md](contracts/api.md), [contracts/label.md](contracts/label.md). Walk: [quickstart.md](quickstart.md).

## Technical Context

**Language/Version**:
- TypeScript: edge-api `shop`, `driver`, `fleet`, `orders`, `commerce`, `catalog`, `notifications` and
  `shared`; `@effy/shared-types`; `@effy/web-kit`; shop-web and back-office (React 19); customer-web
  (Next.js 16).
- Kotlin 2.4 / CMP: the driver app and the customer app.

**Primary Dependencies**: three new ones.
- **`pdf-lib`** (edge-shared): PDF rendering in pure JS.
- **`barcode-detector`** (web-kit): a BarcodeDetector polyfill over zxing-wasm, with the wasm self-hosted.
- **Zebra Browser Print**: the operator's local helper. No package is bundled; shop-web uses `fetch` to
  localhost.

Each version is pinned at implementation, at least two weeks old.

**Storage**: PostgreSQL 16. One goose migration, `20261024090000_parcels_scanning_documents.sql`:
- six new tables;
- columns on seven existing tables;
- two backfills: parcel 1 per package, and `parcel_id` on 090's hand-over rows.

**Testing**:
- vitest unit and container tests per service;
- shared-types fixtures (scan rule, package code);
- shop-web label tests: SVG rules, fitting, page count, ZPL raster;
- back-office and customer-web vitest;
- KMP host tests: driver ScanRule, parcel steps, offline replay; customer documents;
- the guard scripts.

**Target Platform**: AWS Lambda behind the shared and staff gateways; browsers (console PCs and phones);
Android and iOS.

**Project Type**: monorepo, with web, mobile and serverless parts.

**Performance Goals**:
- A label renders in under 50 ms and a ZPL raster in under 300 ms per label, in the browser.
- PDFs render in under 500 ms in Lambda.
- A hub-station read gets its answer in under 1 s.

**Constraints**:
- Hidden fulfilment: no shop name on any label, note or invoice, and no shop or bag count except the bag's
  own label (FR-008).
- A shop is told only who takes a package away (079).
- No refresh timers (071).
- Every write is idempotent on `changeId` or `clientReadId`.
- The driver app and `driver` ship together, with no compatibility (R6).
- Real-world identifiers (ABN, legal name) are supplied by the operator and fail loudly (R18).
- `admin` gains no routes, because it is at the CloudFormation resource limit (R19).

**Scale/Scope**: shared gateway +7 routes, staff gateway +8 (both were at 54% after 093).

## Constitution Check

| Principle | Verdict | Notes |
|---|---|---|
| I. Spec-driven | ✅ | Spec 096 with Clarifications 2026-10-21 (note digital, GST via review, label redesign, recipient on label). |
| II. Shared contracts | ✅ | DTOs, the scan rule and its fixtures are in `@effy/shared-types`. The web scanner is in `@effy/web-kit`. The parcel, read and hand-over rules are in `@effy/edge-shared/labels`. The PDF renderer is in `@effy/edge-shared/documents`. The Kotlin contracts are regenerated. |
| III. One backend | ✅ | Routes go only into existing services: `shop`, `driver`, `commerce` (shared); `fleet`, `orders`, `catalog` (staff). There is no new compute. Zebra Browser Print runs on the operator's PC, a printer driver, not platform compute. The check-in rule exists once and is used by `driver` and `fleet` (R8). |
| IV. Auth isolation | ✅ | Each route is behind its own audience's pool. Hub and lookup routes require `admin`/`manager` from the staff record (R8). Customer documents are owner-only, with byte-identical refusals (052's oracle rule). |
| V. Design | ✅ | The consoles use the existing kit and tables (hub station = a scan field above a table; reports = tables, no metric cards). ⚠ **Print exemption**: labels and PDFs are black and white documents for paper and toner, and carry no tokens. This is the same documented exemption as `pickList.ts` and 089's labels. The customer apps use the storefront kit (a "Documents" section on the order). |
| VI. Layering | ✅ | handler → service → repository in every service. Label rendering and the scan rule are pure functions. Scanner and printer access sit behind web-kit and a `core/platform` driver (mobile file share). |
| VII. Observability | ✅ | EMF metrics: `ParcelsUnaccounted`, `ReadRefused{outcome}`, `LabelPrinted{path}`, `TaxInvoiceRequestedWhileDisabled` (alarm), `PdfRenderMs`. PostHog: `parcels_declared`, `labels_printed`, `pack_scanned`, `hub_checkin_scanned`, `delivery_note_viewed`, `tax_invoice_downloaded`. No PII in telemetry. |
| Real-World Identifiers | ✅ | The ABN and legal name are operator-entered. Nothing is seeded, and invoices stay disabled until they are set (R18). The label's contact is the approved `hello@effyshopping.com`. |
| Hidden fulfilment | ✅ (one recorded limit) | The delivery note merges lines across packages. Invoices name Effy only. The bag's "n of N" counts this package only and is visible on the bag itself, an accepted limit recorded in spec FR-008. |

Post-design re-check: ✅. No violations; no complexity table.

## Project Structure

### Documentation (this feature)

```text
specs/096-parcel-labels-scanning/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md
├── label-redesign.md · label-mockup.html · label-before.png · label-after.png
├── contracts/{api.md, label.md}
├── checklists/requirements.md
└── tasks.md            (/speckit-tasks)
```

### Source code

```text
db/migrations/20261024090000_parcels_scanning_documents.sql                         NEW

packages/shared-types/src/{parcels.ts, scan-rule.ts, documents.ts, tax.ts}(NEW), driver.ts, shop-order-console.ts, order-admin.ts, catalog.ts, index.ts
packages/shared-types/scan-rule.fixtures.json                                        NEW
packages/shared-types/contract-driver/*, contract/*                                  regenerated
packages/web-kit/src/scanner/{wedge.ts, camera.ts, ScanField.tsx, index.ts}(NEW)

apis/edge-api/shared/src/labels/{parcels.ts, reads.ts, handovers.ts, resolve.ts}(NEW)   expectedParcels, recordReads, recordHandovers (moved from driver), resolveCode
apis/edge-api/shared/src/delivery/{hub-checkin.ts(NEW, moved from driver/work/complete.ts), held.ts}
apis/edge-api/shared/src/documents/{pdf.ts, delivery-note.ts, tax-invoice.ts, gst.ts}(NEW)
apis/edge-api/shop/src/parcels/{service.ts, repository.ts}(NEW) ; fulfillments/service.ts (ready gate) ; orders/repository.ts (parcels on detail) ; products/* (gstStatus)
apis/edge-api/shop/src/functions/{parcels-put, parcel-void, parcel-prints, parcel-pack-scans}-v1.ts(NEW) ; fulfillment-courier-handover / fulfillment-pickup (per-parcel hand-overs)
apis/edge-api/driver/src/work/{complete.ts, load.ts, return.ts, sequence.ts}, proof/repository.ts, functions/driver-reads-v1-post.ts(NEW)
apis/edge-api/fleet/src/hub/{service.ts, repository.ts}(NEW), reports/handovers.ts(NEW), exceptions/* (parcel holds), dispatch/sql.ts (091 per parcel)
apis/edge-api/orders/src/{lookup, tax-settings}/*(NEW), orders/repository.ts (parcels + hand-overs)
apis/edge-api/commerce/src/documents/*(NEW), checkout/store.ts (order_item.gst_status; refuse unclassified when enabled)
apis/edge-api/catalog/src/gst/*(NEW), review/service.ts (gst_status in the diff)
apis/edge-api/notifications/src/worker/copy.ts                                       delivered message links the note

apps/shop-web/src/features/fulfillment/labels/{render.ts, fit.ts, helvetica-metrics.json, zpl.ts, print.ts, code128.ts}   render.ts replaces labels.ts
apps/shop-web/src/features/fulfillment/components/{PackBags.tsx(NEW, replaces PrintLabels.tsx), BulkActions.tsx}
apps/shop-web/src/features/settings/printing/*(NEW)                                  printer choice, Browser Print discovery
apps/shop-web/src/features/catalog/ProductEditDialogs.tsx                            GST choice

apps/back-office/src/components/shell/ScanBox.tsx(NEW)                               global scan-to-find
apps/back-office/src/features/hub/*(NEW)                                             hub station
apps/back-office/src/features/reports/handovers/*(NEW)
apps/back-office/src/features/orders/components/PackageRows.tsx                      parcels + hand-overs
apps/back-office/src/features/{exceptions, shops, catalog, settings/tax}/*           parcel holds, pack_scan_required, GST missing + bulk, tax settings

apps/customer-web/app/orders/[id]/documents/*(NEW) ; app/api/orders/[id]/documents/* (cookie proxy)
apps/customer-mobile/shared/.../features/orders/{documents/*(NEW)}, core/platform/FileShare.*(NEW expect/actual)
apps/driver-mobile/shared/.../core/scan/{ScanRule.kt, ScanContexts.kt, ScanPanel.kt, AccountSheet.kt}  parcels
apps/driver-mobile/shared/.../features/{collection, delivery, today}/*                parcels in DTOs and requests, reads queue
```

**Structure decision**: the existing monorepo layout. Everything goes into existing apps and services, with
two shared-library folders added (`edge-shared/labels`, `edge-shared/documents`) and one web-kit module
(`scanner`).

## Implementation notes

- **Migration order inside the file**:
  1. `package_parcel` with the generator replacement, the backfill and the trigger;
  2. the hand-over and hold evolutions, with backfill to parcel 1;
  3. `label_print`, `label_read`;
  4. the tax tables, product and order-item columns, and `shop.pack_scan_required`.
  The backfills run row by row in a `DO` block, as in 089.
- **The shop's ready gate** is in the shop service's `transition`, before `repo.transition`. It is read under
  the package row lock, so a print recorded at the same moment is seen.
- **Printing order in shop-web**:
  1. render the SVGs;
  2. open the print window, or `POST /write` to Browser Print;
  3. **only then** call `POST …/parcels/prints`.
  A failed record is retried from a small local queue. A print that never started records nothing (FR-018).
- **`expectedParcels`** is the single definition of "what this step still needs" (R6). Every driver step and
  the hub station call it. Write a guard test so no route checks completeness another way, in the same
  spirit as `sequence.guard.test.ts`.
- **The driver app**:
  - `ScanSession` counts parcels;
  - progress reads "3 of 4 bags";
  - "Mark all" and "Check in without scanning" ask about each unscanned **bag** (`AccountSheet`);
  - each read is queued as a `LabelReadDTO`, and refused reads go to `POST /driver/v1/reads` (offline replay,
    in order).
- **The hub station UI**: a `ScanField` with wedge and camera, a result line per read in the scan rule's
  words (large, for a glance), and below it the table of expected bags by run. There are no cards.
- **The back-office scan box** sits in the shell header and listens for the wedge on every page. A scan
  navigates; a typed entry needs Enter. It is disabled while a text field has focus, unless the burst
  matches a token (FR-051).
- **PDFs** are rendered in A4 portrait with Helvetica, black only, and the Effy wordmark drawn as vector paths
  from `@effy/brand`.
- **The GST capture at checkout** copies `product.gst_status` into `order_item` in the same insert as the
  line. The refusal for unclassified products checks only while `invoices_enabled`.

## Deploy order

1. **Phase 0**: 088–093 migrations, then `driver`/`fleet`/`shop`/`orders`/`admin` as recorded, then the walk.
2. `make db-up ENV=dev`: 096's migration.
3. `shop`, `orders`, `fleet`, `catalog`, `commerce`, `notifications`, in any order. Each reads only columns
   the migration added.
4. **`driver` together with the driver app build.** The step bodies changed with no compatibility.
5. shop-web, then back-office, then customer-web.
6. The customer app build.
7. The operator sets the tax settings and classifies products, then turns invoices on.

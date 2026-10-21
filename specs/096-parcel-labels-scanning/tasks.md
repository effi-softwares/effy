# Tasks: Parcel Labels, Scanning & Order Documents

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md),
[contracts/api.md](contracts/api.md), [contracts/label.md](contracts/label.md), [quickstart.md](quickstart.md)

**Abbreviations**

| Short | Path |
|---|---|
| `ESH` | `apis/edge-api/shared/src` |
| `SHP` | `apis/edge-api/shop/src` |
| `DRV` | `apis/edge-api/driver/src` |
| `FLT` | `apis/edge-api/fleet/src` |
| `ORD` | `apis/edge-api/orders/src` |
| `COM` | `apis/edge-api/commerce/src` |
| `CAT` | `apis/edge-api/catalog/src` |
| `ST` | `packages/shared-types/src` |
| `WK` | `packages/web-kit/src` |
| `SW` | `apps/shop-web/src/features` |
| `BO` | `apps/back-office/src` |
| `CW` | `apps/customer-web/app` |
| `DM` | `apps/driver-mobile/shared/src/commonMain/kotlin/com/effyshopping/driver/mobile` |
| `CM` | `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile` |

**Tests are included.** Each success criterion (SC-001…SC-011) is proven by a test, and each one-writer rule
has a guard, as in 089–093.

**Prerequisite (not a task here)**: research-08 **Phase 0**. 088–093 must be migrated, deployed and walked on
dev before this feature's walk.

---

## Phase 1: Setup

- [X] T001 Write `db/migrations/20261023090000_parcels_scanning_documents.sql` per data-model.md, in the order plan.md gives:
  - `package_parcel`;
  - the replaced `new_package_code()`, plus `new_parcel_code()`;
  - the parcel-1 trigger on `shop_fulfillment`, and the row-by-row backfill using the coldest line zone;
  - the `package_handover` and `package_hold` evolutions, backfilled to parcel 1;
  - `hub_checkin.closed_by` / `closed_by_sub`;
  - `label_print` and `label_read` (INSERT and SELECT grants only);
  - `tax_document`, the `tax_document_number_seq` sequence, `business_tax` (no seed), `product_gst_change` and `order_business_identity`;
  - `shop.pack_scan_required`, `product.gst_status` and `order_item.gst_status`.

  Include CHECKs, indexes, COMMENTs and a Down section.
- [X] T002 [P] Add `pdf-lib` (exact version, at least two weeks old) to `apis/edge-api/shared/package.json`, and `barcode-detector` (exact, at least two weeks old) to `packages/web-kit/package.json`. Copy the zxing wasm into each console's `public/` through a build step, so it is never fetched from a CDN. Run `pnpm install`.
- [ ] T003 [P] Add the migration's tables and columns to every hand-written container-test schema that mirrors them: the orders, fleet, shop and driver test schemas, located with `grep -rl "package_handover" apis/edge-api/*/src/**/schema*`. Keep `schema-drift.guard.test.ts` green.

## Phase 2: Foundational (blocks every story)

- [X] T004 [P] Add the shared parcel types to `ST/parcels.ts`, exported from `ST/index.ts`: `ParcelZone`, `ReadMethod`, `ReadOutcome`, `ParcelMissingReason`, `ParcelRef`, `ParcelHandover`, `ParcelMissing`, `LabelReadDTO` and `ParcelDTO`, per contracts/api.md.
- [X] T005 [P] Implement the scan rule in `ST/scan-rule.ts`: `judgeRead(raw, method, context)` → `{outcome, words, parcelId?}`, with the context shape `{expected: ParcelDTO[], counted: Set<code>, elsewhere: Map<code, words>, voided: Set<code>}`.
  - Write the fixtures `packages/shared-types/scan-rule.fixtures.json`, with at least 20 cases covering every outcome (including `cancelled` and `not_found`), Caps Lock and whitespace.
  - Test with `ST/scan-rule.test.ts`, which also checks that the driver app's embedded copy is byte-identical.
- [X] T006 Move `recordHandovers` from `DRV/work/handover.ts` to `ESH/labels/handovers.ts`:
  - make it write per parcel, with `actor`, `device_at` and the new steps;
  - resolve codes against the allowed parcels, so a foreign code names nothing;
  - keep `DRV/work/handover.ts` as a re-export only until T040, then delete it.

  Add `ESH/labels/handovers.guard.test.ts`, which fails any `INSERT INTO public.package_handover` outside this file.
- [X] T007 Write `ESH/labels/reads.ts`:
  - `recordReads(tx, actor, surface, step, reads)`, which inserts with `ON CONFLICT (client_read_id) DO NOTHING`;
  - re-judge each read with `resolveCode` and store `server_outcome`;
  - emit `ReadRefused{outcome}`.

  Add `ESH/labels/reads.guard.test.ts`, which fails any other writer of `label_read` and any UPDATE or DELETE of it.
- [X] T008 Write `ESH/labels/resolve.ts`:
  - `resolveCode(db, raw)` takes an `EFY1:` token or a bare code and returns `{parcel, package, order}`, or null;
  - when given an order number it returns the order.

  Use `parsePackageToken` from `ST/package-code.ts`. Add a container test.
- [X] T009 Write `ESH/labels/parcels.ts`:
  - `liveParcels(db, packageIds)` → `ParcelDTO[]` with `of` derived;
  - `expectedParcels(db, step, scope)` per data-model "What a step expects", where open holds are not expected and Found parcels are expected again;
  - `accountFor(expected, parcels, missing)` → `{unaccounted, holds}`, throwing `ParcelsUnaccounted` (→ 409 `parcels_unaccounted` with codes) and emitting the EMF metric `ParcelsUnaccounted{step}`.

  Add `ESH/labels/parcels.container.test.ts`, and the guard `ESH/labels/expected.guard.test.ts`, which fails a driver or fleet route that checks completeness without `expectedParcels`.
- [X] T010 Update `ESH/delivery/held.ts`: `heldSql` counts only `parcel_id IS NULL` holds. Add `parcelHoldsSql(packageId)`. Extend the existing held tests.
- [X] T011 [P] Register the new request and response types in `ST/driver-contract.ts`, and change every driver step body per contracts/api.md (the `parcels`, `missingParcels` and `reads` fields; the old `packages`/`missing`/`notLoaded` hand-over fields removed). Regenerate with `pnpm --filter @effy/shared-types driver-contract:gen` → `packages/shared-types/contract-driver/*`.

**Checkpoint**: the migration applies on a fresh database and on a copy of dev, and every package has exactly one parcel whose code equals its `package_code`.

---

## Phase 3: User Story 1 — Every bag has its own label (P1) 🎯 MVP

**Goal**: the shop declares bags per zone, and each bag is a parcel with its own code. Bags can be voided. 089 labels still work.
**Independent test**: spec US1. Declare 2 ambient + 1 chilled + 1 frozen, and get 4 distinct codes numbered 1–4 of 4. A frozen line with no frozen bag is refused. A voided code is refused everywhere.

- [X] T012 [US1] Write `SHP/parcels/repository.ts` and `service.ts`:
  - `declareParcels(actor, fulfillmentId, counts, changeId)` per R3 and R4: zone rule from `order_item.storage_class`; 1–50 parcels; keep, add and void per zone, never voiding parcel 1; after any print, a changed count renumbers every live parcel and clears the printed state; set `declared`; refuse with `parcels_with_driver` once any parcel has a `collect`, `courier_handover` or `shop_pickup` hand-over;
  - `voidParcel(...)`: refuse `first_bag_not_voidable` for parcel 1, and `void_last_bag_only` for any parcel but the last live one once the package has a print.

  Both run under the package row lock and are idempotent on `changeId`.
- [X] T013 [US1] Add the handlers `SHP/functions/parcels-put-v1.ts` (`PUT /shop/v1/fulfillments/{id}/parcels`) and `SHP/functions/parcel-void-v1-post.ts`, and register them in `apis/edge-api/shop/serverless.yml`. Errors are `zone_bag_required`, `parcel_count` and `parcels_with_driver`, as a `{type, detail}` sentence. Announce with `announceMoves` to the shop's orders.
- [X] T014 [US1] In `SHP/orders/repository.ts` `readOrder`, replace `READ_LABEL` and the `label` field with:
  - `parcels: ShopParcelLabelDTO[]`, with printed, pack-scanned and custody derived (never a driver's name);
  - `labelCommon: ShopLabelCommonDTO`, with service, recipient name, street, suburb, state, postcode, order number and `packedOn`.

  Update `ST/shop-order-console.ts`, and remove `ShopPackageLabelDTO`. Do the same for the batch read used by the order list.
- [X] T015 [P] [US1] Write `SHP/parcels/parcels.container.test.ts`. Cover:
  - the declaration matrix (zone refusals, counts, keep/add/void, idempotent retry);
  - voiding: the last bag after printing passes; a middle bag after printing → `void_last_bag_only`; parcel 1 → `first_bag_not_voidable`; a re-declaration after printing renumbers and clears printed;
  - refusal after `collect`, after `courier_handover` and after `shop_pickup`;
  - a legacy package reading as one parcel with its `package_code`;
  - the backfill zone.
- [X] T016 [US1] Build `SW/fulfillment/components/PackBags.tsx`, which replaces `PrintLabels.tsx`:
  - three steppers (Ambient, Chilled, Frozen), with chilled and frozen marked "needed" when the portion has such lines;
  - a bag list showing code, "n of N", zone, Printed/Not printed and Packed;
  - a Void action per bag (confirm sheet) and a Reprint action per bag.

  Mount it in `SW/fulfillment/components/ItemsAndFulfilment.tsx` below the totals, and add the mutation in `SW/fulfillment/queries.ts` / `repo.ts`. Errors are worded in `SW/fulfillment/errorText.ts`.
- [X] T017 [P] [US1] Write `SW/fulfillment/__tests__/pack-bags.test.tsx`: the stepper rules, the "needed" marks, the void flow (Void offered only on the last bag after printing, never on bag 1), and the error sentences.

**Checkpoint**: US1 works with the existing print path (labels print through the old renderer's data until US10 lands).

---

## Phase 4: User Story 10 — A professional, carrier-style label (P1)

**Goal**: the label in contracts/label.md. One SVG renderer, whole-dot bars, fitted text, black only.
**Independent test**: spec US10 and SC-011. Every size, every zone, Effy and courier, long name and long address: every block present, nothing clipped, one page per label.

- [X] T018 [P] [US10] Add `SW/fulfillment/labels/helvetica-metrics.json`, the Helvetica and Helvetica-Bold advance widths from the Adobe core-14 AFM (with its source noted in the file). Write `SW/fulfillment/labels/fit.ts`, `fitText(text, maxWidthMm, sizesPt[], maxLines, bold)` → `{sizePt, lines[]}` per R10. Test it in `fit.test.ts`.
- [X] T019 [US10] Write `SW/fulfillment/labels/render.ts`, `renderLabelSvg(doc, layout, dpi)` per contracts/label.md:
  - the seven blocks, in order;
  - the geometry table, with whole-dot modules from `code128.ts` (extend `code128BSvg` to take `moduleDots` and `dpi`);
  - the QR at level M;
  - the wordmark paths from `packages/brand/src/wordmark.svg`, filled black;
  - `#000`/`#fff` only.

  Delete `SW/fulfillment/labels/labels.ts`, then update its imports.
- [X] T020 [US10] Write `SW/fulfillment/labels/print.ts`:
  - `printBrowser(docs, layout)`: one SVG per page, with `@page` at the exact size and margin 0 and no trailing break; `a4x4` lays out four per page in a 2×2 grid;
  - return 0 when the window is blocked.
- [X] T021 [P] [US10] Write `SW/fulfillment/labels/render.test.ts` and `print.test.ts`. Cover:
  - block order and presence for every layout × zone × service;
  - fitted text inside its box for the long-name and long-address fixtures;
  - only black and white;
  - the forbidden-content scan (shop name, `$`, phone, any email but `hello@`, window/day words);
  - the bar module as a whole number of dots at 203 and 300 dpi;
  - the page count (1 per label; 1 per 4 on A4, no blank last page);
  - the barcode decodes back to `EFY1:<code>`, using the existing decode helper from 089's `labels.test.ts`.
- [X] T022 [US10] Show the live preview: `PackBags.tsx` renders `renderLabelSvg` inline for the selected bag (FR-012b). The layout choice is remembered per browser, with layouts `a6` (default), `a4x4` and `roll62`. Extend `scripts/check-shop-delivery-words.sh` to scan `SW/fulfillment/labels/`.

---

## Phase 5: User Story 2 — Labels print reliably, and the console knows (P1)

**Goal**: print records, Printed/Not printed, the ready gate, batch printing, and optional Zebra direct print.
**Independent test**: spec US2. Marking ready with an unprinted bag is refused. A batch print records every bag. A blocked print records nothing.

- [X] T023 [US2] Write `SHP/parcels/service.ts` `recordPrints(actor, parcelIds, layout, path, changeId)`: the whole call is refused (404) if any parcel is not this shop's, and it is idempotent. Add the handler `SHP/functions/parcel-prints-v1-post.ts` and register it. Emit `LabelPrinted{path}` and announce to the shop's orders. Add `ESH/labels/prints.guard.test.ts`, which fails any UPDATE or DELETE of `label_print`.
- [X] T024 [US2] Add the ready gate in `SHP/fulfillments/service.ts` `transition`, read under the package row lock before `repo.transition`:
  - `labels_not_printed` with `{unprinted}`;
  - `bags_not_packed` when `shop.pack_scan_required` is set;
  - `zone_bag_required` when the package was never declared and has chilled or frozen lines (R4).

  Map these to 409 in `SHP/functions/fulfillment-status-v1-post.ts`.
- [X] T025 [P] [US2] Write `SHP/parcels/prints.container.test.ts`: recording, foreign-parcel refusal, idempotency, and every ready-gate refusal and its pass.
- [X] T026 [US2] Wire printing in shop-web through `SW/fulfillment/labels/printer.ts`: render, then send (browser or ZPL), then **and only then** `POST …/parcels/prints`. A failed record is kept in a small `localStorage` retry queue (try/catch around storage). The shop is told when the print could not start (FR-018).
- [X] T027 [US2] Add batch printing to `SW/fulfillment/components/BulkActions.tsx` and `SW/fulfillment/bulk.ts`: "Print labels" for the selected portions, printing every live bag of each through `printer.ts`. Retire the old per-package path in `SW/fulfillment/orderConsole.ts`.
- [X] T028 [P] [US2] Write `SW/fulfillment/labels/zpl.ts` and `toZpl(svg, layout, dpi)`:
  - draw the SVG to a canvas at the dpi, threshold to 1 bit, and build a `^GFA` with Z64 (zlib deflate via `CompressionStream`, base64, CRC);
  - test against a known small bitmap in `zpl.test.ts`, mocking the canvas.
- [X] T029 [US2] Write `SW/settings/printing/*`, the Settings → Printing page:
  - discover a Zebra Browser Print helper at `https://localhost:9101/available`;
  - choose a printer, remembered per browser;
  - offer "Print a test label";
  - explain how to install the helper and accept its certificate;
  - fall back to browser printing when no helper is found (R11).

  Add its nav entry in shop-web's shell.
- [X] T030 [P] [US2] Write `SW/fulfillment/__tests__/printing.test.tsx`: the record happens only after a successful send, a blocked window records nothing and shows the sentence, the ZPL path is chosen when a printer is set, and the ready refusal sentences.

---

## Phase 6: User Story 3 — The driver accounts for every bag (P1)

**Goal**: every driver step is per parcel and enforced by the server. Missing bags are held one by one. Reads are recorded.
**Independent test**: spec US3 and SC-003. Withhold 1 bag of a 4-bag portion: every step stays unable to complete until it is scanned or declared missing.

- [ ] T031 [US3] Add `parcels: ParcelDTO[]` per package to every driver read (Today, collection run and stop, hub, delivery run, drop) in `DRV/work/sql.ts`, `repository.ts`, `service.ts` and `delivery.ts`, using `liveParcels`. Add them to `HubSort` items per parcel.
- [ ] T032 [US3] Update `DRV/work/complete.ts` `collectStop`:
  - after the sequence gates, call `expectedParcels('collect')`, then `accountFor`;
  - partial missing → parcel holds (step `collect`), and the package is collected;
  - all missing → the package's outcome is `not_available`, as 049 does;
  - record hand-overs per parcel and `recordReads`.
- [ ] T033 [US3] Move the run-level check-in to `ESH/delivery/hub-checkin.ts`:
  - `checkInParcels(tx, actor, parcels)` returns per-parcel results and sort instructions using `hubSort`, and refuses anything not expected (R8);
  - `closeRunCheckin(tx, runId, closer)` writes `hub_checkin` with `closed_by`, closes the hub stop and the run when every collected live parcel is in or held, and keeps the existing response counts.

  `DRV/work/complete.ts` `hubCheckin` calls both, with parcel holds (step `checkin`).
- [ ] T034 [US3] Update `DRV/work/load.ts` `loadRun` to use `expectedParcels('load')`:
  - partial missing → parcel holds, and the package loads;
  - all of a package's parcels missing → a package hold plus `removeAssignment`, as 093 does.

  Record per-parcel hand-overs and reads.
- [ ] T035 [US3] Update `DRV/proof/repository.ts` (door) and `DRV/work/return.ts` the same way, with steps `deliver` and `return`. A drop completes only when all its live parcels are accounted for.
- [ ] T036 [US3] Add the handler `DRV/functions/driver-reads-v1-post.ts` (`POST /driver/v1/reads`) → `recordReads` with actor driver and surface `driver_app`, and register it. Map `ParcelsUnaccounted` → 409 `parcels_unaccounted` in every step handler, beside `sequenceProblem`.
- [ ] T037 [P] [US3] Write `DRV/work/parcels.container.test.ts`. Cover each step:
  - full scan;
  - one unaccounted → 409 with codes;
  - one missing → a parcel hold, and the package continues;
  - all missing → a package hold (load removes it);
  - a Found parcel expected again at the next step;
  - a retried step answers as done;
  - a voided parcel refused.

  Update `sequence.container.test.ts`, `checkin.container.test.ts` and `drop-progress.container.test.ts` to the new bodies.
- [ ] T038 [US3] Driver app: regenerate the DTOs, then change `DM/core/scan/ScanRule.kt`, `ScanContexts.kt` and `ScanPanel.kt` to count parcels:
  - progress reads "3 of 4 bags";
  - the hard stop names the drop or shop in the shared words;
  - embed `scan-rule.fixtures.json` under `DM/../commonTest/resources`.
- [ ] T039 [US3] Driver app: in `DM/core/scan/AccountSheet.kt`, "Mark all" and "Check in without scanning" ask about each unscanned **bag**, with the reasons `ParcelMissingReason`.
  - Requests in `DM/features/collection/data/HttpCollectionRepository.kt` and `DM/features/delivery/data/HttpDeliveryRepository.kt` send `parcels`, `missingParcels` and `reads`.
  - Refused reads are queued to `/driver/v1/reads` through the offline queue, in order, keeping `deviceAt`.
  - Each read has a `clientReadId` of uuid v4 and a device id, kept per install.
- [ ] T040 [P] [US3] Write the driver app tests in `DM/../commonTest`: `ScanRuleTest` against the fixtures, parcel progress per step, offline replay of reads (recorded once), and the `parcels_unaccounted` sentence surfaced. Delete `DRV/work/handover.ts`, the re-export from T006.

**Checkpoint (MVP)**: US1 + US10 + US2 + US3. Bags are labelled professionally, printing is recorded and gated, and drivers account for every bag. Walk quickstart Q1–Q5, Q7, Q8, Q10, Q11 and Q13.

---

## Phase 7: User Story 4 — The shop confirms each bag as it is packed (P2)

**Goal**: pack-scan in shop-web, the per-shop requirement, and the custody each bag shows.
**Independent test**: spec US4. Scan 3 of 4 labels: 1 unconfirmed. With "required" on, ready is refused.

- [X] T041 [US4] Write `WK/scanner/wedge.ts`, `WK/scanner/camera.ts`, `WK/scanner/ScanField.tsx` and `WK/scanner/index.ts` per R13:
  - wedge detection by burst timing, a token match, Caps Lock tolerance, and suppression from a focused field;
  - the camera through the native `BarcodeDetector` or the `barcode-detector` polyfill, with formats limited to `qr_code` and `code_128`;
  - typed entry recorded as `typed`;
  - each read emitted as a `LabelReadDTO`.

  Export it from `packages/web-kit/package.json` `exports`.
- [X] T042 [P] [US4] Write `WK/scanner/wedge.test.ts`: a burst counts as a scan, slow typing does not, an Enter/Tab/idle suffix, Caps Lock, a stray key before, and no leak into an input.
- [ ] T043 [US4] Write `SHP/parcels/service.ts` `packScan(actor, fulfillmentId, reads)`. It judges each read against this package's parcels (`resolveCode`), sets `pack_scanned_at`/`by` for accepted ones, records a `pack` hand-over and the reads, and refuses a different package with a sentence. Add the handler `SHP/functions/parcel-pack-scans-v1-post.ts` and register it.
- [ ] T044 [US4] Record shop hand-overs per parcel in the existing courier hand-over and pickup routes (`SHP/functions/fulfillment-courier-handover-v1-post.ts`, `fulfillment-pickup-v1-post.ts`), with actor shop staff and steps `courier_handover` / `shop_pickup`.
- [ ] T045 [US4] In shop-web's `PackBags.tsx`, add a "Scan bags" `ScanField`, "Packed n of N" and a result line per read. Each bag shows its custody ("At shop", "Packed", "With driver", "With courier") and never a driver's name.
- [ ] T046 [US4] Pack-scanning setting: write `FLT/shops/pack-scanning.ts` and the handler `FLT/functions/shop-pack-scanning-v1-put.ts` (`PUT /fleet/v1/shops/{shopId}/pack-scanning`, admin or manager from the staff record), writing `shop.pack_scan_required`, idempotent on `changeId`, announcing the shop's `orders`; register it in `apis/edge-api/fleet/serverless.yml`. Back-office: a "Require pack scanning" switch on the shop detail in `BO/features/shops/*` calling it. Container test `FLT/shops/pack-scanning.container.test.ts` (set, idempotent, csa refused).
- [ ] T047 [P] [US4] Write `SHP/parcels/pack-scan.container.test.ts` (accepted, foreign package, repeat counted once, the required gate) and `SW/fulfillment/__tests__/pack-scan.test.tsx`.

---

## Phase 8: User Story 5 — Back-office scan-to-find and the hub station (P2)

**Goal**: one scan box finds anything, and hub staff check bags in.
**Independent test**: spec US5. Scan a bag, an 089 package label or an order number, and the order opens highlighted. A hub check-in shows At hub with the sort words.

- [ ] T048 [US5] Write `ORD/lookup/service.ts`, `repository.ts` and the handler `ORD/functions/admin-lookup-v1-get.ts` (`GET /orders/v1/admin/lookup?q=`). It calls `resolveCode`, records a `lookup` read with actor admin staff and surface `back_office`, and returns 404 with a sentence when nothing matches. Register it in `apis/edge-api/orders/serverless.yml`.
- [ ] T049 [US5] Write `BO/components/shell/ScanBox.tsx`, mounted in the shell header:
  - a `ScanField` listening for the wedge on every page;
  - typed entry with Enter;
  - navigate to `/orders/$orderId?parcel=` or `?package=`.

  Make `BO/features/orders/OrderDetailScreen.tsx` scroll to and highlight that bag or package.
- [ ] T050 [US5] Write `FLT/hub/repository.ts`, `service.ts`, and the handlers `FLT/functions/hub-expected-v1-get.ts` and `hub-checkins-v1-post.ts`. Each read is judged, `checkInParcels` is called with actor admin staff, then `closeRunCheckin` for every completed run. Results come back in the scan rule's words with the sort instruction. Access is `admin`/`manager` from the staff record. Announce `dispatch` and the run driver's `today`. Register them in `apis/edge-api/fleet/serverless.yml`.
- [ ] T051 [US5] Write `BO/features/hub/HubStationScreen.tsx`, the route and the nav entry (admin and manager):
  - a large `ScanField` (wedge and camera);
  - the last read's result in large type (outcome and sort words);
  - a table of expected bags grouped by run (code, n of N, zone, order, checked in);
  - no cards.

  Live updates for `dispatch` go through `BO/features/live/routes.ts`.
- [ ] T052 [US5] Order detail: `ORD/orders/repository.ts` returns `parcels[]`, each with its hand-overs (091 moves from package to parcel). Update `ST/order-admin.ts`, and render bags inside `BO/features/orders/components/PackageRows.tsx` (code, n of N, zone, printed count, custody, hand-over history). Update `ORD/orders/handovers.container.test.ts`.
- [ ] T053 [P] [US5] Write the tests `ORD/lookup/lookup.container.test.ts`, `FLT/hub/hub.container.test.ts` (accepted with sort, every refusal from FR-043, run closes when complete, driver and staff mixed, a csa refused) and `BO/features/hub/HubStationScreen.test.tsx`.

---

## Phase 9: User Story 6 — Every read is on record, and the failures are visible (P2)

**Goal**: reports over reads and hand-overs, and parcel holds on Exceptions.
**Independent test**: spec US6. A scan, a typed entry, a manual tick, a wrong-shop scan and a void each appear with every field, and the reports count them.

- [ ] T054 [US6] Write `FLT/reports/handovers.ts`, `repository.ts` and the handler `FLT/functions/reports-handovers-v1-get.ts` (`GET /fleet/v1/reports/handovers?from&to`). It returns counts by method overall, per shop and per driver, refused reads by `server_outcome`, missing parcels, exceptions per 1,000 hand-overs, client/server outcome disagreements, the **first-read rate** (accepted on the first scan of a parcel at a step), **possible duplicate labels** (R7), and **clock-suspect reads** (online, `device_at` more than 10 minutes from `received_at`; use `received_at` for those). Register it.
- [ ] T055 [US6] Exceptions: in `FLT/exceptions/*`, held items gain `parcel {code, seq, of, zone}`, and Found/Lost resolve parcel holds. Parcel holds show the existing "Problem" word to staff in `ESH/status/status.ts` `packageStatus` (staff views only; the shop and the customer are unchanged).
- [ ] T056 [US6] Write `BO/features/reports/handovers/*`: the report page with a date range, tables (method mix, first-read rate, per shop, per driver, refused by kind, possible duplicate labels) and no metric cards. Add its nav entry under Dispatch, and its exceptions row additions in `BO/features/exceptions/*`.
- [ ] T057 [P] [US6] Write `FLT/reports/handovers.container.test.ts`, seeding each read and hand-over kind and asserting every count, the per-1,000 figure, the first-read rate, a possible duplicate label and a clock-suspect read. Extend `ESH/labels/reads.guard.test.ts` with an assertion that no shop route returns a driver's name in a read.

---

## Phase 10: User Story 7 — A delivery note travels with the order (P2)

**Goal**: a digital delivery note, as JSON and PDF, on the web and in the app, linked from the delivered message.
**Independent test**: spec US7. A part-picked and an unavailable line are both correct. No price, no shop.

- [ ] T058 [US7] Write `ESH/documents/pdf.ts`: the `pdf-lib` helpers (A4, Helvetica, black, the wordmark as vector paths from `@effy/brand`, table rows, page breaks), and emit `PdfRenderMs`.
- [ ] T059 [US7] Write `ESH/documents/delivery-note.ts`:
  - `buildDeliveryNote(db, orderId)` → `DeliveryNoteDTO`, with lines merged by product across packages and supplied quantities from `fulfillment_item.gathered_quantity`/`unavailable_quantity`, the order date and the delivered date (latest delivery among its packages);
  - `renderDeliveryNotePdf(dto)`.

  Add the types to `ST/documents.ts`.
- [ ] T060 [US7] Write `COM/documents/service.ts` and the handler `COM/functions/order-delivery-note-v1-get.ts`. It is owner-only, with byte-identical refusals; returns 409 `not_delivered` before any delivery; and answers `?format=pdf` → base64 `application/pdf`. Register it in `apis/edge-api/commerce/serverless.yml`.
- [ ] T061 [US7] Add the delivery-note link to the delivered email and push copy in `apis/edge-api/notifications/src/worker/copy.ts` (the order URL, `…/orders/{id}#documents`).
- [ ] T062 [US7] Customer web: add the "Documents" section on the order page (`CW/orders/[id]/…`), with the delivery note rendered from the DTO and a Download PDF button through `CW/api/orders/[id]/documents/*` (the cookie proxy, as for other order routes).
- [ ] T063 [US7] Customer app: add the "Documents" section in the order screen (`CM/features/orders/…/documents/*`), the use case, and the repository (Ktor bytes) feeding an expect/actual `CM/core/platform/FileShare.kt` (Android `FileProvider` + share intent; iOS `UIActivityViewController`). Use the storefront kit, and sheets only (`scripts/mobile-guard.sh`).
- [ ] T064 [P] [US7] Write the tests `ESH/documents/delivery-note.container.test.ts` (merge, part, unavailable, no shop, no price), `COM/documents/delivery-note.container.test.ts` (owner, not delivered, PDF bytes start `%PDF`), a customer-web component test, and a KMP host test of the documents ViewModel.

---

## Phase 11: User Story 9 — Every product carries a GST status (P3; required before US8)

**Goal**: GST status on products: the shop sets it, back-office reviews it, bulk setting exists, and it is captured on order lines.
**Independent test**: spec US9. Set it through each path, and the count of unclassified products goes to zero.

- [ ] T065 [US9] Accept `gstStatus` in shop product create (**required**, 422 `gst_status_required`) and edit: `SHP/products/types.ts`, `service.ts`, `repository.ts` and `change.ts` (a proposed field for live products, per 067). Show it in `CAT/review/service.ts`'s diff as "GST", and write `product_gst_change` on apply (`via: review` or `direct`). Update `ST/catalog.ts`.
- [ ] T066 [US9] Write `CAT/gst/*` and the handlers `CAT/functions/gst-missing-v1-get.ts` and `gst-bulk-v1-post.ts` (staff), recording `via: bulk`. Register them in `apis/edge-api/catalog/serverless.yml`.
- [ ] T067 [US9] Checkout: in `COM/checkout/store.ts`, copy `product.gst_status` into `order_item.gst_status` in the same insert. While `business_tax.invoices_enabled`, refuse a cart holding an unclassified product with 409 `product_unavailable` (no reason given to the customer).
- [ ] T068 [US9] shop-web: add the GST choice in `SW/catalog/ProductEditDialogs.tsx` (Taxable / GST-free), and show it on `ProductDetailScreen.tsx` and in `SW/catalog/review.ts`'s proposed diff. Back-office: add a "GST missing" list with bulk set under `BO/features/catalog/*`.
- [ ] T069 [P] [US9] Write the tests: `SHP/products/gst.container.test.ts` (create, edit proposes, review applies and records history), `CAT/gst/gst.container.test.ts`, `COM/checkout/gst.container.test.ts` (captured, refused only while enabled), and the shop-web dialog test.

---

## Phase 12: User Story 8 — The customer can get a tax invoice (P2)

**Goal**: ATO-compliant tax invoices and adjustment notes, operator-set tax details, and a fail-loud state while unset.
**Independent test**: spec US8 and SC-008. Every required element is present, GST is correct to the cent across the test set, and an issued invoice is never altered.

- [ ] T070 [US8] Write `ESH/documents/gst.ts`:
  - `invoiceTotals(lines, fees, feeTreatment)`, which applies R15 (GST = round half-up of taxable incl. ÷ 11, after discounts; fees per treatment; points as a payment);
  - `adjustmentGst(refund, invoice)`;
  - `isValidAbn(abn)` (the ABN checksum).

  Unit-test it in `gst.test.ts` with taxable, GST-free, discounted, fee-bearing and points-paid orders, plus itemised and amount-only refunds.
- [ ] T071 [US8] Write `ESH/documents/tax-invoice.ts`:
  - `issueInvoice(tx, orderId)`, which creates the invoice once, with the number from the sequence and a frozen `snapshot` and `issuer`;
  - `issueAdjustment(tx, refundId)`, which issues the invoice first in the same transaction when none exists;
  - both refuse orders placed before 096 (any line with `order_item.gst_status IS NULL`): 409 `invoice_not_available_for_order`, and no adjustment is issued for their refunds;
  - `renderTaxDocumentPdf(snapshot)`, headed "Tax invoice" / "Adjustment note", showing legal name, ABN, date, number, lines with taxable marks, GST, total, payments, and the buyer at $1,000 or more.
- [ ] T072 [US8] Write `ORD/tax-settings/*` and the handlers `ORD/functions/admin-tax-settings-v1-get.ts` and `-put.ts` (staff, admin only). Validate the ABN. `invoicesEnabled` only when the legal name, ABN, fee treatment and zero unclassified live products are all set (409 `tax_setup_incomplete`, listing what is missing). Register them.
- [ ] T073 [US8] Write `COM/documents/service.ts` tax documents and the handlers `COM/functions/order-tax-documents-v1-get.ts` (JSON or `?doc=&format=pdf`) and `order-business-identity-v1-put.ts`.
  - Return 409 `invoices_unavailable` while disabled, emitting `TaxInvoiceRequestedWhileDisabled`.
  - Return 409 `invoice_not_available_for_order` for orders placed before 096.
  - Return 409 `buyer_identity_required` at $1,000 or more with no name. The business identity can be set on any order.
  - Make it owner-only, and register it.

  Declare the CloudWatch alarm on the metric in Terraform beside the existing commerce alarms (`infra/` — find them with `grep -rn "metric_name" infra | grep -i commerce`).
- [ ] T074 [US8] Back-office: add `BO/features/settings/tax/*` (legal name, ABN, fee treatment, enable switch, a link to the GST-missing list). Customer web and app: add "Tax invoice" and "Adjustment notes" rows to the Documents section (T062/T063), the "not available yet" and "not available for this order" sentences, and an "Add business details" sheet offered on every order (required before the invoice at $1,000 or more).
- [ ] T075 [P] [US8] Write `ESH/documents/tax-invoice.container.test.ts` (issued once, the snapshot unchanged after a product's GST changes, numbering, an adjustment per refund, a refund before any invoice issues the invoice first, a pre-096 order refused with no adjustment) and `COM/documents/tax.container.test.ts` (disabled, the buyer identity gate, owner-only, PDF bytes). Add a guard that `tax_document` has no UPDATE anywhere.

---

## Phase 13: Polish & cross-cutting

- [ ] T076 [P] Run `apis/edge-api/shared/src/live/change-map.guard.test.ts`, covering every new mutating route (parcels, prints, pack-scans, hub check-ins, reads), and fix any gaps.
- [ ] T077 [P] Run the gateway capacity contract test (`gateway-capacity.contract.test.ts`): shared +8, staff +9. Record the new percentages in FEATURE-HISTORY.
- [ ] T078 [P] Hidden-fulfilment sweep: a test over every customer-facing DTO and PDF builder (delivery note, tax documents) asserting no shop name, no shop count and no bag count (SC-010). Extend `scripts/mobile-guard.sh` if a customer screen could show a count.
- [ ] T079 [P] Add the analytics events to each surface's typed taxonomy (`parcels_declared`, `labels_printed`, `pack_scanned`, `hub_checkin_scanned`, `delivery_note_viewed`, `tax_invoice_downloaded`), with no PII.
- [ ] T080 Run every guard and test in quickstart.md, `pnpm -w typecheck`, the driver and customer app builds (Android + iOS), and the design-system guards. Fix anything that fails.
- [ ] T081 Write the FEATURE-HISTORY.md entry for 096 (what changed, defects found, what was verified, operator steps and deploy order), update CLAUDE.md's feature list and the "Driver operations" / delivery sections where the parcel becomes the unit, and update research-08's status line.

---

## Dependencies

```text
Phase 1 → Phase 2 → US1 → US10 → US2 ─┐
                       └──────→ US3 ──┼→ (MVP checkpoint)
US2 + web-kit scanner (T041) → US4
US3 (hub-checkin core T033) + T041 → US5 → US6
Phase 2 → US7 (independent of parcels)
US7 + US9 → US8   (US8 extends US7's documents service and Documents sections; invoices cannot be enabled until products are classified)
All → Phase 13
```

- US1 blocks US10, US2, US3, US4 and US5 (parcels exist).
- US3 can run in parallel with US10 and US2 once US1 is done (different services and apps).
- US7 and US9 depend only on Phase 1–2 and can be built in parallel with US1–US6 by a second stream; US8 follows both.

## Parallel examples

- **After Phase 2**: T015 (shop container tests) ∥ T018 (metrics + fit) ∥ T031 (driver reads) ∥ T058 (pdf helpers) ∥ T065 (product GST).
- **US10**: T018 and T021 in parallel with T019 once its interface is fixed.
- **US3**: T037 (server tests) ∥ T038–T040 (app).
- **US5**: T048 (lookup) ∥ T050 (hub routes) ∥ T052 (order detail).
- **US8/US9**: T070 (GST maths) ∥ T066 (catalog bulk) ∥ T072 (tax settings).

## Implementation strategy

1. **MVP = US1 + US10 + US2 + US3** (the P1 set): one labelled bag per bag, a professional label, gated and recorded printing, and drivers who must account for every bag. Deploy and walk quickstart Q1–Q5, Q7, Q8, Q10, Q11 and Q13 before continuing.
2. **Then US4 + US5 + US6**: pack scanning, the hub station and scan-to-find, then the reports.
3. **Documents stream (US7, US9 → US8)** in parallel. Tax invoices stay disabled until the operator enters the ABN and legal name, the accountant confirms the fee treatment and rounding (research R15), and every product is classified.

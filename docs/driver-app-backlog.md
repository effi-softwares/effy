# Effy Driver App - Backlog

From [driver-app-review.md](driver-app-review.md) (2026-10-15). The new UI is in
[driver-app-redesign-brief.md](driver-app-redesign-brief.md).

**Priority:** P0 = the core flow is broken · P1 = needed for field use · P2 = simplify / polish ·
P3 = later.
**Size:** S ≤ ½ day · M ≈ 1–2 days · L ≈ 3+ days.
**Where:** `BE` = `apis/edge-api/driver` (or another service named) · `APP` = `apps/driver-mobile` ·
`DB` = migration · `DESIGN` = waits on the new UI.

Items marked **DESIGN** should be built against the new design rather than restyled twice.

## Status - 2026-10-16

**Built and tested (not yet deployed or walked):** A1, A2, A3, B1, B2, B3, C1, C2, C3, C4, C5, C6, D1,
D2, D4, D5, F2, F3, and the M4 half of E5 (the shift timer stops on sign-out).

- Backend: `driver` (A1, A3), `fleet` (D1, D2), `notifications` (D2 copy). Container tests cover each.
- Migrations: `20261016120000_close_finished_delivery_rounds.sql` (A2),
  `20261016130000_driver_work_notifications.sql` (D2 - the three new push types).
- App: Android and iOS both build (`assembleDebug`, `xcodebuild` simulator); host tests pass.
  - B3 keeps proof photos in an app-owned directory (`DirectoryProofFiles`) and sends them after the
    offline queue. C3 keeps the last `/me` and `/today` on the phone (cleared on sign-out).
  - F3: analytics stay **on** by default (as before) with an Account → "Usage analytics" switch.
  - D4: a push names the round; the app opens it when Today still holds it, else Today.

**Deploy order:** run both migrations → deploy `notifications` → `driver` → `fleet` → ship the app.
The Android app adds `ACCESS_NETWORK_STATE` and a FileProvider (`<applicationId>.proofphoto`).

**A4 - built as feature 088** ([specs/088-failed-parcel-return](../specs/088-failed-parcel-return/tasks.md)),
2026-10-16: not yet migrated or deployed. Needs `20261016140000_parcel_return.sql`, then `fleet` + `driver`,
back-office, and the app.

**H1–H3 - built as feature 089** ([specs/089-package-labels](../specs/089-package-labels/tasks.md)),
2026-10-16: not yet migrated or deployed. ⚠ The label says EFFY or COURIER only - no window (a shop is
never told one); where a parcel goes at the hub will come from the scan (H7).

**H4, H5 and the platform halves of H6–H10 - built as feature 090**
([specs/090-scanning-foundation](../specs/090-scanning-foundation/tasks.md)), 2026-10-16: the scan rule, the
camera reader (Android + iOS), hand-over records, per-package hub instructions and "load the van". The
scanning SCREENS (H6–H11 UI) follow the redesign. Not yet migrated or deployed.

**H12 - built as feature 091** ([specs/091-handover-visibility](../specs/091-handover-visibility/tasks.md)):
hand-overs on the order, counts per stop on a round, labels that didn't scan per shop. Not yet deployed.

**H13 - done** (2026-10-16): iOS photo proof has a live in-app viewfinder (AVFoundation, `CameraPreviewSurface.ios.kt`),
shrinking and uprighting the photo exactly as the system-camera path does. Ships with the next app build; check
on a device.

**G1–G3, E1–E5, F1 and H6–H11 - built as feature 092**
([specs/092-driver-mobile-redesign](../specs/092-driver-mobile-redesign/tasks.md)), 2026-10-16: the app on the
storefront identity, three tabs, two-tap drops (arrival recorded silently), Call the customer, the scanning
screens at all five steps with Type a code and Undo. E6 done screen by screen. Not yet deployed or walked.
E4's change note shows on Today (`changedNote` added to the driver's Today read); E7 done.

**Still open:** B4/F4/H15 (decisions), D3 (Apple account), H14 (ring scanners), a hub address (for
"Navigate to the hub").

---

## Epic A - Make the delivery loop finish (P0)

| ID | Pri | Where | Size | Item | Done when |
|---|---|---|---|---|---|
| A1 | P0 | BE | M | **Close a delivery round when its last drop is delivered or failed.** In `proof/repository.ts`, inside the proof and failure transactions, set `driver_round.status = 'completed'` when no drop on the round is still open. Announce the change on the live channel. | After the last drop, Today moves to the next round, and the run appears in History. Covered by a test. |
| A2 | P0 | DB/BE | S | **Clean up rounds already stuck.** One-off migration: delivery rounds that are `in_progress` with every drop `done` or `skipped` become `completed`. | No such rounds remain in dev. |
| A3 | P0 | BE | S | **Never move a drop backwards.** In `work/delivery.ts` `setDropStatus`, refuse or ignore any `to` that is earlier than the current status. | A replayed `out_for_delivery` after `arrived` leaves the drop at `arrived`. |
| A4 | P1 | BE+APP | L | **Return failed parcels to the hub.** A failed drop's parcel stays on the driver. Add a hub-return step: a stop at the end of the delivery round, or a "Return to hub" item on Today, and record it. Needs a short spec. | A failed parcel shows on the driver's work until it is checked back in at the hub. Dispatch sees it. |

## Epic B - Proof of delivery that always works (P0/P1)

| ID | Pri | Where | Size | Item | Done when |
|---|---|---|---|---|---|
| B1 | P0 | APP | M | **Send proof photos as JPEG, resized and upright.** Android CameraX: decode off the main thread, apply rotation, scale the long side to about 1600px, JPEG quality ~80. iOS: the same, using `UIImageJPEGRepresentation`. Send `image/jpeg`. Remove the `TakePicturePreview` thumbnail path. | A proof photo is under 1 MB, upright, and readable, on both platforms. |
| B2 | P0 | APP | S | **Show the server's message for a 422.** In `HttpErrors.appErrorFor`, map 422 to `Validation`, using the problem's `detail`. | Choosing "Other" with no note shows "Tell us what happened…". |
| B3 | P1 | APP | L | **Complete a drop with no signal.** Save the proof photo to app storage and queue it (presign → upload → submit) under one `changeId`. Send it when the connection returns. Show the drop as "Delivered - sending proof". Delete the file once the server confirms. | In airplane mode, a drop can be completed and its proof arrives after reconnecting. Nothing is lost if the app is killed. |
| B4 | P3 | APP | M | (Decision needed) Add location to the proof photo. | - |

## Epic C - Offline and session behaviour (P1)

| ID | Pri | Where | Size | Item | Done when |
|---|---|---|---|---|---|
| C1 | P1 | APP | M | **Treat a queued write as accepted.** When `withReplay` queues a write, the ViewModel treats it as done (the stop shows "saved, sending") instead of an error. The `changeId` is made once per action, not once per tap. | Collecting offline moves the driver on. A second tap cannot queue a duplicate. |
| C2 | P1 | APP | S | **Hub check-in offline.** Show "Checked in - sending" and fetch the result (how many parcels go where) once the write is sent. | No blank or error screen at the hub with no signal. |
| C3 | P1 | APP | M | **Stay signed in offline.** `currentSession` tells "no session" apart from "could not check". `SessionManager` keeps the last driver record on the phone and opens the app offline with it, showing a banner. | Opening the app in airplane mode shows Today (from the last copy), not sign-in. |
| C4 | P1 | APP | S | **Sign out on 401 and 403.** Add a response hook on the HTTP client that calls `session.bootstrap()` on 401, or on 403 from `/me`. | A driver disabled mid-shift is taken to the refusal screen on their next request. |
| C5 | P1 | APP | S | **Network error at Android sign-in.** Map network and timeout exceptions in `AmplifyAuthDriver.mapError` to `AuthError.Network`. | Signing in offline says "You're offline". |
| C6 | P2 | APP | S | **Flush the queue when the connection returns**, using a connectivity listener, as well as on refresh and live reconnect. | Queued writes send without the driver touching anything. |

## Epic D - Notifications (P1)

| ID | Pri | Where | Size | Item | Done when |
|---|---|---|---|---|---|
| D1 | P1 | BE (fleet) | M | **Send drivers a push when work arrives.** Insert a `notification_request` (`audience 'driver'`, `run_assigned`) when the planner or dispatch gives a driver a new round, or adds to one in progress. Keep one per round with `dedupe_key`. | A driver with the app closed gets a push within one 5-minute planning pass. |
| D2 | P1 | BE | M | **New notification types:** `run_changed` (re-ordered, stops removed), `run_withdrawn`, `run_opens_soon` (N minutes before `round_opens_at`). Add their wording to `copy.ts`. | Each has wording and is sent once. |
| D3 | P1 | APP (iOS) | L | **iOS push.** APNs key and entitlement, an `aps-environment` entitlement, a Swift push bridge that registers the FCM/APNs token through `/driver/v1/devices`, and tap handling that sets `openedNotification`. Blocked on the Apple Developer account (`docs/observability-apple-blockers.md`). | An iOS driver receives the D1/D2 pushes, and tapping one opens Today. |
| D4 | P1 | APP | S | **Open the right screen from a push.** Use the push's `entityId` to open that run, not just the Today tab. | Tapping "Run assigned" opens that run. |
| D5 | P2 | APP | S | **Ask for notification permission once.** Remove the request from `MainActivity.onCreate`; the explanation screen asks. If refused, show a "Notifications are off" row on Today and in Account. | One prompt. A driver with notifications off is told so. |

## Epic E - Simplify (P2, decide before the redesign)

| ID | Pri | Where | Size | Item |
|---|---|---|---|---|
| E1 | P2 | APP | S | **Remove the Map tab** (`features/map/`, `EffyMapCanvas`, the `MapRoot` route), leaving three tabs. Navigate stays on each stop and drop. **DESIGN** |
| E2 | P2 | APP+BE | M | **Shorten the drop flow** to Navigate → **Deliver** (arrival is implied), with an optional single **Start round**. Keep the server statuses; the app sends `arrived` silently, or the server accepts proof from `en_route`. **DESIGN** |
| E3 | P2 | APP | S | **Remove the placeholder framework** (`core/placeholder/`, the `PlaceholderData.kt` files, `PlaceholderRegisterGuardTest`, the provenance register). Fields with no data are not drawn. |
| E4 | P2 | APP | M | **Remove the activity feed.** Show the round's change note ("Added EFY-…") on Today instead. Drop `ActivityRoute`, `SettingsActivitySeen` and the badge. The backend route can stay for old app builds. **DESIGN** |
| E5 | P2 | APP | S | **Remove day stats and the shift timer**, or fix them: day stats from a small server count; stop the timer on sign-out (review M4). |
| E6 | P2 | APP | M | **Trim the comments.** Move change history to FEATURE-HISTORY.md and keep only "why" comments in code. Do this alongside each rewritten screen, not as a big-bang change. |
| E7 | P2 | APP | S | **Rename the code's words.** `Phase.SAME_DAY_DELIVERY` → `DELIVERY`, `MapMode.SAME_DAY`, and so on. The wire values stay. |

## Epic F - Field essentials (P1/P2)

| ID | Pri | Where | Size | Item |
|---|---|---|---|---|
| F1 | P1 | BE+APP | M | **Customer contact from the drop.** Add the customer's phone (or a masked or relayed number) to the drop for the assigned driver only, and add a Call button. **DESIGN** |
| F2 | P2 | APP | S | **Load hub check-in on its own**, so it works after the app is reclaimed (review M5). |
| F3 | P2 | APP | S | **Analytics consent** respects a setting instead of a hard-coded `true` (review M7). |
| F4 | P3 | APP | M | Scan barcodes at the shop stop and hub (optional; the ticks work today). |

## Epic G - UI redesign (after the design is ready)

| ID | Pri | Where | Size | Item |
|---|---|---|---|---|
| G1 | P1 | DESIGN | - | Generate the new design in Claude Design from [driver-app-redesign-brief.md](driver-app-redesign-brief.md). Save it under `docs/reference-screens/Effy Driver Mobile v2/`. |
| G2 | P1 | APP | L | Write the redesign up as a feature: `/speckit-specify` → plan → tasks, including E1, E2, E4, F1 and the offline and notification states from B3, C1–C3 and D5. |
| G3 | P1 | APP | L | Build the screens from the design, screen by screen, on the current ViewModels. |

## Epic H - Package scanning as the main way to work (P1)

Design and research: [driver-app-barcode-scanning.md](driver-app-barcode-scanning.md). Scanning
replaces taps as the primary path; every tap and swipe stays as the fallback. **H1–H3 must ship
first** - nothing can be scanned until packages carry a label.

| ID | Pri | Where | Size | Item | Done when |
|---|---|---|---|---|---|
| H1 | P1 | DB/BE | M | **A package code for every package.** A short code (6 characters, no look-alike characters) unique to each shop fulfilment, created at payment. The token `EFY1:<code>` is printed as both a QR code and a Code 128 barcode. | Every paid order's packages have a code, and old orders get one on first read. |
| H2 | P1 | BE (driver) | S | **Carry codes to the phone.** Add each package's code to the stop, drop, run and today reads, so scans are checked on the phone with no signal. | The app can match a scanned code to a package without asking the server. |
| H3 | P1 | APP (shop-web) | M | **Print package labels.** "Print labels" at the pack step: a QR code and a Code 128 barcode (same token), the large package code, `EF-… · package n of m`, EFFY · window or COURIER, suburb, cold mark. No shop name, customer name or price. 62 mm thermal, 4×6 in and A4 sheet layouts. | A shop can print and reprint a label per package; a courier parcel gets one too. |
| H4 | P1 | APP | L | **The scanner component.** `expect` `PackageScanner`: Android CameraX + ML Kit (bundled model, QR + Code 128 only); iOS AVFoundation through a Swift bridge, with the same two types. Reads that don't start with `EFY1:` (product EAN codes) are ignored. Continuous multi-scan, 2 s debounce, torch, beep + haptic + green flash, camera permission handling. **DESIGN** | Reads a printed label in under 1 s in good light on a mid-range phone; works with no signal. |
| H5 | P1 | APP | M | **One scan rule, in common code.** Decide each read: accepted / already scanned / belongs to another stop or address / not on your run. Unit-tested once and used by every step. | Tests cover every result for S1–S5. |
| H6 | P1 | APP+BE | M | **S1 - scan at the shop.** Scan mode on the shop stop. The last expected scan auto-collects after a 3 s "Collecting… Undo". Each package is sent with method `scan`/`manual`/`typed`. A package for another stop is refused. **DESIGN** | A stop can be collected by scanning alone; tick + swipe still works. |
| H7 | P1 | APP+BE | M | **S2 - scan at the hub, with sorting.** Each scan shows that package's instruction (LOAD NOW · window / SHELVE · day / COURIER BAY). The last scan checks in. The check-in answer gives an instruction per package. **DESIGN** | A driver sorts and checks in a van load by scanning, without reading a summary. |
| H8 | P1 | APP+BE | M | **S3 - load the van.** A new "Load the van" step when a delivery run opens: scan its packages, and all drops go out for delivery together. **Replaces the per-drop "Start this drop"** (backlog E2). New `load` route. **DESIGN** | Loading by scan, or "Mark all loaded", puts every drop out for delivery. |
| H9 | P1 | APP+BE | M | **S4 - scan at the door.** "Scan to deliver" on the drop. A package for another address is a hard stop. Once all are scanned, arrival is recorded and the proof step opens. "Deliver without scanning" is recorded as manual. **DESIGN** | Handing over the wrong customer's package is refused; scanning skips the Arrived tap. |
| H10 | P1 | APP+BE | S | **S5 - return failed parcels by scan** (with A4). | Returned parcels are checked in by scanning. |
| H11 | P1 | APP | S | **Type the code.** Manual entry of the 6-character code, for a torn or wet label. | A typed code goes through the same rule as a scan. |
| H12 | P2 | BE + back-office | M | **Show scan versus manual** for every hand-over on the order and run screens, and a per-shop "labels that didn't scan" count. | Dispatch can see which labels and drivers skip scanning. |
| H13 | P2 | APP (iOS) | S | **Reuse the scanner's live camera for photo proof on iOS** (it has no live viewfinder today). | iOS photo proof uses an in-app camera. |
| H14 | P3 | APP | S | **Bluetooth ring scanners**: accept keyboard-style input on scan screens. | A paired ring scanner works on S1–S5. |
| H15 | P3 | BE+APP | M | (Decision needed) QR codes on the shop counter or hub wall, to record arrival. | - |

---

## Suggested order

1. **Sprint 1 (fixes, no design needed):** A1, A2, A3, B1, B2, C4, C5.
2. **Sprint 2 (field use):** C1, C2, C3, B3, D1, D4, D5.
3. **Design:** G1 in parallel with sprint 2; agree on E1–E5.
4. **Sprint 3 (redesign):** G2, G3 with E1–E4 and F1; D2 and A4.
   - **Scanning:** H1–H3 (labels) can start any time - they're independent of the app. H4–H11 build on
     the redesign, and H8 replaces E2.
5. **When the Apple account allows:** D3.

## Operator steps (yours to run)

A1–A3, D1 and D2 need `apis/edge-api/driver` (and `fleet`) deployed. A2 needs a migration run.
F1 needs a contract change, and `driver` must be deployed before the app ships. D3 needs the APNs key
in the Firebase project.

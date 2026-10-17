# Map 3 — The Effy Driver App (`apps/driver-mobile`)

Mapped 2026-10-18, read-only, against the code on `dev` (`f9118e04`). Paths are relative to
`apps/driver-mobile/shared/src/commonMain/kotlin/com/effyshopping/driver/mobile/` unless they start with
`apps/`, `apis/`, `docs/`, `specs/` or `packages/`.

## 0. State in one paragraph

A KMP + Compose app (Android + iOS), 121 common Kotlin files (~14k lines), Clean Architecture + MVVM,
hand-wired `app/AppContainer.kt`, Ktor to `apis/edge-api/driver` on the shared gateway. Feature 049
(2026-08) built the operation; 060 restyled it (no FEATURE-HISTORY entry exists for 060 — only
`specs/060-driver-mobile-ui/`); the 2026-10-15 review (`docs/driver-app-review.md`) found the core loop
broken; backlog sprints + 088 (return to hub), 089 (labels), 090 (scan foundations), 091 (scan visibility),
092 (redesign: storefront identity, three tabs, two-tap drops, scanning screens, Bluetooth scanners) and
093 (server-enforced work order, load-the-van, missing-package holds, vehicle check) rebuilt it in three
days. **Almost none of 088–093 is migrated, deployed or walked on a device** (092's `driver` is deployed
to dev; 093 explicitly requires the app and `driver` to ship together with no compatibility). The review
doc is therefore largely superseded; its C1–C4/H1–H4/M1–M7 items are recorded as fixed in
`docs/driver-app-backlog.md` "Status — 2026-10-16" — I verified most of them in code (below).

## 1. Shell, navigation and screens

| Piece | File(s) | Notes |
|---|---|---|
| Root / session gate | `app/App.kt` | `Restoring` → intro covers it; `SignedOut` → `SignInFlow`; `Refused` → `RefusedScreen`; `SignedIn` → one-time `PermissionPrimingScreen` then `DriverShell`. Holds the live channel (`LiveLifecycle`) while foreground + signed in; flushes the offline queue on launch and whenever `connectivity.online` turns true. |
| Launch intro | `app/DriverIntro.kt` | "e. → effy." animation with a steering-wheel full stop + "DRIVER". |
| Shell | `app/DriverShell.kt` | Per-tab back stacks (mobile-kit `rememberTabBackStacks`), one shared snackbar, slide/fade transitions (off under reduced motion), tab bar only on the three roots. Every ViewModel is constructed here (`newTodayVm`, `newCollectionVm`, `newDeliveryVm`, `newHistoryVm`). |
| Routes | `core/nav/DriverRoutes.kt` | Tabs: **Today · History · Account** (Map and Activity removed in 092). Pushed: `CollectionRunRoute`, `ShopStopRoute(scan)`, `HubCheckinRoute`, `DeliveryRunRoute`, `DropRoute(scan)`, `ReturnHubRoute(scan)`, `HistoryDetailRoute`, `HelpRoute`, `PermissionDeniedRoute`. `RouteSerializerGuardTest` enforces the serializer module. |
| Kit | `core/presentation/*` | Driver-local design kit (buttons, bars, rows, pills, alerts, banners, sheet, snackbar, swipe-to-confirm, skeletons). `scripts/driver-guard.sh` bans colour literals, red/warning, money, Map/Activity. |
| Push tap | `DriverShell.kt` `openedNotification` effect | Goes to Today, pops to root, and if `type` starts `run_` and Today still holds `entityId`, pushes that run (backlog D4). |

**Screens** (all Compose, common code):
- Sign in: `features/auth/presentation/SignInScreen.kt`, `AuthScreens.kt`, `AuthViewModel.kt` (email → 6-digit code; refusal screen).
- Permissions: `features/onboarding/PermissionPrimingScreen.kt` (Notifications + Camera), `PermissionDeniedScreen.kt`.
- Today: `features/today/presentation/TodayScreen.kt`, `VehicleCheckForm.kt`, `TodayViewModel.kt`.
- Collection: `features/collection/presentation/CollectionScreens.kt` (`CollectionRunScreen`, `ShopStopScreen`, `HubCheckinScreen`), `CollectionViewModel.kt`.
- Delivery: `features/delivery/presentation/DeliveryRunScreen.kt` (run + `ReturnHubScreen`), `DropScreen.kt`, `ProofFlow.kt` (chooser, camera, review, signature, can't-deliver, delivered/not-delivered views), `SignaturePad.kt`, `DeliveryViewModel.kt`.
- Scanning (shared by all five steps): `core/scan/ScanPanel.kt`, `ScanRule.kt`, `ScanContexts.kt`, `AccountSheet.kt` ("say what happened to each unscanned package"), `HardwareScanner.kt`, `PackageScanner.kt` (expect), `ReadDebouncer.kt`, `ScanTone.kt`, `PackageToken.kt`.
- Item manifest (per-package item list, cold markers): `features/manifest/*`.
- History: `features/history/presentation/HistoryScreens.kt`, `HistoryViewModel.kt`.
- Account / Help: `features/account/AccountScreen.kt`, `HelpScreen.kt`.
- Schematic map: `core/map/RunMapView.kt` (+ `RunMap.kt`, `RunMapWire.kt`), drawn on Today, collection run, delivery run, past run.
- Debug-only design gallery: `apps/driver-mobile/androidApp/src/debug/.../DesignGalleryActivity.kt`.

## 2. Backend routes the app calls

Driver service `apis/edge-api/driver/serverless.yml` declares 26 routes. The app calls 21:

| Route | Caller |
|---|---|
| `GET /driver/v1/me` | `features/driver/data/HttpDriverRepository.kt` (session bootstrap, duty re-read, vehicle-check re-read, on every WorkChanges) |
| `POST /driver/v1/duty` | same |
| `POST /driver/v1/vehicle-check` | same (093) |
| `GET /driver/v1/today` | `features/today/data/HttpTodayRepository.kt` (last copy persisted, backlog C3) |
| `GET /driver/v1/collection/runs/{runId}` | `features/collection/data/HttpCollectionRepository.kt` |
| `GET …/collection/runs/{runId}/stops/{stopId}` | same (in-memory `LastRead`) |
| `POST …/stops/{stopId}/collect` | same (offline-queued) |
| `POST /driver/v1/hub/checkin` | same (offline-queued; answer re-read later under the same changeId) |
| `GET /driver/v1/delivery/runs/{runId}` | `features/delivery/data/HttpDeliveryRepository.kt` |
| `POST …/delivery/runs/{runId}/load` | same (090/093; offline-queued) |
| `POST …/delivery/runs/{runId}/return` | same (088; offline-queued) |
| `GET /driver/v1/delivery/drops/{dropId}` | same (in-memory `LastRead`) |
| `POST …/drops/{dropId}/status` | same — now only ever `arrived` (sent silently before proof) |
| `POST …/drops/{dropId}/proof/presign` → S3 PUT → `POST …/proof` | same (proof outbox when offline) |
| `POST …/drops/{dropId}/fail` | same (offline-queued) |
| `GET /driver/v1/history`, `GET /driver/v1/history/{kind}/{id}` | `features/history/data/HttpHistoryRepository.kt` |
| `POST /driver/v1/devices`, `DELETE /driver/v1/devices/{token}` | `core/push/HttpDeviceRepository.kt` |
| `GET /driver/v1/live` | `AppContainer.live` (AppSync Events descriptor) |

**Not called** (kept for older builds): `POST …/stops/{stopId}/issue` (the app stopped using it because it
named no package and marked a whole stop unavailable — comment in `HttpCollectionRepository.kt:69`),
`GET /driver/v1/activity`, `POST /driver/v1/activity/read`, `/driver/healthz`, `/driver/readyz`.
Staff-side: `POST /fleet/v1/dispatch/rounds/{id}/waive-sequence`, `/fleet/v1/vehicle-checks/{id}/clear`,
`/fleet/v1/dispatch/rounds/{roundId}/return` (record a return on the driver's behalf).

## 3. The driver's day, step by step

### 3.1 Sign-in and session
- **Screens/VM**: `SignInScreen.kt`, `AuthViewModel.kt`; use cases `features/auth/domain/AuthUseCases.kt`.
  Platform `AuthDriver`: Android `shared/src/androidMain/.../core/auth/AmplifyAuthDriver.kt`, iOS
  `iosApp/iosApp/SwiftAuthBridge.swift` + `shared/src/iosMain/.../IosAuthDriver.kt`. Driver Cognito pool,
  passwordless 6-digit code issued by the platform (035).
- **Session**: `core/session/SessionManager.kt`. After the token, `GET /me` decides SignedIn / Refused
  (403 → sign out + refusal screen) / SignedOut (401). Network failure after 2 retries opens on the last
  `/me` kept on the phone with `offline = true` (backlog C3), re-checked when connectivity returns. A 401/403
  on any request triggers `onRequestRejected()` → re-bootstrap (backlog C4).
- **Driver must**: type work email, type code. No password, no self-signup.
- **Then**: one-time permission priming (Notifications, Camera) — `PermissionPrimingScreen.kt`. On iOS the
  requester does nothing up front (`iosMain/.../PermissionRequester.ios.kt` comment: notification/location
  pre-requests "a recorded follow-up").

### 3.2 Duty ("shift")
- `TodayScreen.kt` `DutyToggle` in the large title bar; off duty shows "You're off duty / Go on duty".
- `TodayViewModel.toggleDuty()` → `POST /duty` then `GET /me`. Not offline-queued (fails with "You're
  offline"). Off-duty confirmation sheet `GoOffDutySheet` names the stops and packages still held.
- There is no shift schedule, clock-in time, break or end-of-shift summary. Backend accepts
  `expectedEndAt` on duty; the app never sends it. Shift timer and day stats were removed in 092.

### 3.3 Vehicle check (093)
- `VehicleCheckForm.kt`, shown on Today instead of everything else while `vehicleCheck == DUE`; six items
  (tyres, lights, brakes, mirrors, cold storage, body) each OK / Minor / Unsafe + note.
  `POST /driver/v1/vehicle-check` → OK or UNSAFE; UNSAFE shows a problem alert and the driver gets no work
  until a dispatcher clears it (`/fleet/v1/vehicle-checks/{id}/clear`; the app re-reads `/me` on the next
  work change).
- ⚠ **Off by default** (`delivery_settings.vehicle_check_required`) — turning it on before this app is
  installed would starve every driver of work.

### 3.4 Today (the home)
`TodayScreen.kt` renders, in priority: off duty → vehicle check → load error → skeleton → on duty:
- **Current run** (`CurrentRun`/`RunCard`): run head (Collection/Delivery run, "Finish by…", window,
  progress bar from `TodayProgress`), dispatch change note with "Got it" (`changedNote`), "Opens at…"
  info alert when the round is not open (072), stale-copy line, the schematic map, the next stop/drop card
  with **Navigate** + primary (`Scan packages` at a shop, `Check in` at the hub stop, `I'm here — scan` at a
  drop, `View …` before opening), "Up next" list.
- **Load the van** card (093 `loadStep`) — the only step of a delivery run until loaded.
- **Return N parcels to the hub** (088 `toReturn`) — "To the hub" (navigate to the hub's lat,lng) + "Scan in".
- **No work yet** + "Notifications are off" alert (only in this state).
- **Later today** — other rounds held (072), each opens its run screen.
- Banners above everything (`DriverBanners`, ordered: offline → waiting to send → refused → live paused).

### 3.5 Collection run → shop stop (S1)
- `CollectionRunScreen`: stops in order (shop name, street, package count, status), map, hub line,
  "Check in at the hub" once stops are settled.
- `ShopStopScreen`: Navigate (address text), Dispatch call (only if `DISPATCH_PHONE` is set at build
  time), "Opens at…" gate, **Scan packages** (→ `ScanPanel`) or tick each package by hand and
  **swipe to confirm collected**. Per-package ••• → `ReportSheet` (missing / damaged / not ready + note).
  Ticks and reports are kept on the phone (`features/collection/data/SettingsStopDrafts.kt`) and sent
  only with the collect. Unticked packages trigger "Is everything in the van?" before committing.
- Scanning: last expected scan auto-collects after a 3-second "Collecting… Undo" bar. Another stop's
  label is a hard stop naming that shop; a label not on the driver's work is "not yours".
- **Write**: `POST …/collect` with every package's outcome (`picked_up` / `not_available` + note) and its
  method (`scan` / `typed` / `manual`). 093: only named packages settle; a package added while the driver
  stood there comes back as `remaining` and the VM says "1 more package was added — collect it".
- Server gates (093 `apis/edge-api/driver/src/work/sequence.ts`): no collect with deliveries in the van
  (`finish_deliveries_first`); 072 `round_not_open`.

### 3.6 Hub check-in (S2)
- `HubCheckinScreen` (restorable on its own, backlog F2). "Scan packages off the van": each scan shows a
  sort instruction per package (`hubSort`: LOAD NOW · window / SHELVE · day / COURIER BAY), load-now first.
  Last scan checks in. Fallback "Check in without scanning" → `AccountSheet` asks It's here / Not in the
  van for each unscanned package → `missing` list → `package_hold` server-side.
- **Write**: `POST /hub/checkin` (`runId`, packages + methods, `missing`). Answer `HubSplit`: counts by
  window group (`effyGroups`), courier count, `nextCourierPickupLabel`, `held`. Offline: "Checked in —
  sending", the split is re-read under the same changeId when the queue sends it (`readSavedCheckIn`).
- Then `CheckedIn` says when the delivery run opens ("Your delivery run opens at 3:15 pm · finish by 6 pm ·
  7 drops · it's on Today", `DriverShell.nextDeliveryRun`).
- Gate: `stops_outstanding` until every shop is settled. Server completes the collection round here.

### 3.7 Load the van (S3, 090/093)
- `DeliveryRunScreen` → "Scan to load" (ScanPanel grouped by drop) or "Can't scan? Mark all loaded" →
  `AccountSheet` ("It's in the van" / "Not loaded" with reason; "other" needs a note).
- **Write**: `POST /delivery/runs/{runId}/load` with packages + `notLoaded`. Every staged drop becomes
  `out_for_delivery` together (the only writer of that status now); not-loaded packages come off the run
  (`removeAssignment`), a drop left empty goes with them. Snackbar "Van loaded · …".
- Gates: `finish_collection_first` (holding collected-not-checked-in parcels), `return_parcels_first`.
  Dispatch may waive per run (`round_sequence_waiver`).

### 3.8 Delivery run → each drop (S4)
- `DeliveryRunScreen`: run window, "From {hub} · finish by…", map, "Open next drop · {street}", drops in
  order with status pills (window-aware: Due now / Late via `DeliveryCommon.windowStatus`), "Return to hub"
  block at the foot when failed parcels exist.
- `DropScreen` (`OpenDrop` state machine: Detail → Scan → Choose → Camera → Review / Signature,
  or CantDeliver):
  - Detail: "Drop n of N", customer first name, full address, window pill, customer instructions callout
    ("Leave at the door" / "Hand it over in person" + free text), packages with item manifests and cold
    marks, **Navigate** (address → external maps), **Call {name}** (`customerPhone`, sent only for open
    drops of the caller's round — 092 F1), **Can't deliver**, **Scan to deliver**.
  - Not loaded yet → "Load the van first — then this drop opens." + "Go to Load the van".
  - Scan: the drop's packages; another drop's package is a hard stop ("Drop 3 · Carlton"); fallback
    "Deliver without scanning" (recorded manual).
  - Choose ("How did you hand it over?", preselected from the customer's preference): **Left safely**
    (contactless, photo + "Where did you leave it?" chips Front door / Reception / Mailroom / Neighbour),
    **Handed over — photo**, **Handed over — signature** (pad + "Signed by").
  - **Writes, in order**: `POST …/status {to: arrived}` silently (only if not already arrived), then presign
    → upload → `POST …/proof` (method, mediaKey, note, packages + methods). The drop is only completed if
    the image landed (064 FR-006).
  - Delivered view: method, time ("in the window"), "This run: n of N done", Next drop / Back to the run;
    offline variant "Saved — sending when you're back online".
- **Contact**: customer call is a direct `tel:` dial of the checkout phone (no masking/relay; 049's
  masked-contact 503 path is gone). No SMS, no in-app chat, no "notify customer I'm outside".
- Photo: Android CameraX in-app viewfinder (`androidMain/.../CameraPreviewSurface.android.kt`) → JPEG,
  upright, long side 1600 px (`androidMain/.../ProofJpeg.kt`); iOS AVFoundation viewfinder
  (`iosMain/.../CameraPreviewSurface.ios.kt`, backlog H13). Signature is PNG (`PngEncode`).

### 3.9 Failed delivery
- `CantDeliverScreen` (`ProofFlow.kt`): Nobody home / Wrong or incomplete address / Customer refused /
  Couldn't get in / Something else (note required); a "Call {name}" action is offered.
  **Write**: `POST …/fail {reason, note}` (offline-queued). No photo, no arrival record, no wait timer.
- `NotDeliveredView`: "Recorded · time · dispatch told", keep the parcel, back to the run / Call dispatch.
- The parcel stays in the driver's custody (088 `TO_RETURN_SQL`); the delivery round finishes only once
  every stop is closed AND nothing is left to return (`completeDeliveryRoundIfFinished`).

### 3.10 Return to hub (S5, 088)
- `ReturnHubScreen` (`DeliveryRunScreen.kt:362`) from Today or the run: list of failed parcels, scan in
  or check in by hand. **Write**: `POST /delivery/runs/{runId}/return` (packages + methods; idempotent;
  offline-queued). Returned parcels wait "At hub" for staff to choose a next step.
- Navigate to hub uses `delivery_settings.hub_latitude/longitude` via the run map (`today.map.hub`); with
  no hub point set, the "To the hub" button is disabled. There is still no hub ADDRESS record
  (`HUB_LABEL` constant in `driver/service.ts`).

### 3.11 End of shift
- Go off duty from the Today header (sheet warns about held stops/packages) or sign out from Account
  (`SignOutSheet` names outstanding work, parcels to return and pending unsent updates; sign-out sets the
  driver off duty best-effort). No end-of-day summary, no handover of the van/keys, no cash.

### 3.12 History and Account
- History: list by day (runs and deliveries with street, proof, reason, window); run detail lists its
  stops and how each ended (fixes a defect where run detail looked the id up as a stop); drop detail
  shows proof (photo/signature), method, time, note. Only `completed` rounds appear.
- Account: name, email, vehicle, hub, duty row, Appearance (Match phone / Light / Dark inline), Usage
  analytics switch (F3), Help (Call dispatch, Call hub desk, Driver handbook — all from BuildKonfig
  `DISPATCH_PHONE` / `HUB_DESK_PHONE` / `HANDBOOK_URL`, empty in the local `secrets.properties`), app
  version, sign out.

## 4. Cross-cutting behaviour

### 4.1 Offline
- **Writes**: `core/offline/OfflineQueue.kt` (persisted in multiplatform-settings) via `withReplay` — on a
  network failure the write is saved and answered `QUEUED`; VMs treat queued as done (backlog C1) and keep
  one changeId per action until settled (`ActionIds`). `SyncCoordinator.kt` drains FIFO on launch,
  connectivity-up (`AndroidConnectivity` / `IosConnectivity`), refresh and live reconnect; definitive
  refusals go to a "Not recorded" banner.
- **Proof**: `core/offline/ProofOutbox.kt` + `DirectoryProofFiles` — image saved in an app-owned
  directory, sent after the queue drains (so "arrived" lands first), deleted on success, up to N attempts.
- **Reads**: `/me` and `/today` last copies persisted (`core/offline/LastCopies.kt`, cleared on sign-out);
  stop and drop reads only in memory (`LastRead`), delivery and collection RUN reads not cached at all
  (survive only while the ViewModel lives).
- Scan checking is local (`ScanRule`), so scanning works with no signal.

### 4.2 Live updates
- `AppContainer.live` (AppSync Events, `LiveKind.WORK`) + the driver's own landed writes, merged in
  `core/live/WorkChanges.kt`; every work VM re-reads quietly (never mid-action). Foreground only. Screens
  also re-read on being shown again (fallback). No timers (guarded by `scripts/check-no-refresh-timers.sh`).

### 4.3 Push
- Android: FCM (`androidMain/.../push/EffyFirebaseMessagingService.kt`, `FirebasePushTokenProvider.kt`),
  token registered via `/driver/v1/devices` on sign-in, removed on sign-out. Producers now exist
  (`apis/edge-api/fleet/src/shared/driver-push.ts`: `run_assigned`, `run_changed`, `run_withdrawn`,
  `run_opens_soon`; copy in `notifications/src/worker/copy.ts`), but they need the 2026-10-16 migrations
  and deploys.
- **iOS: no push.** `MainViewController.kt` keeps `NoOpPushTokenProvider` ("Push stays NoOp on iOS
  until…"); no `aps-environment`, no background modes in `iosApp/iosApp/Info.plist`. Backlog D3 blocked
  on the Apple Developer account.

### 4.4 Permissions
- Android manifest: `INTERNET`, `ACCESS_NETWORK_STATE`, `POST_NOTIFICATIONS`, `CAMERA`, FileProvider for
  proof photos. **No location permission.**
- iOS Info.plist: only `NSCameraUsageDescription` = "uses the camera to photograph proof of delivery"
  (does not mention label scanning, which is now the main camera use). No location, no Bluetooth key
  (not needed — scanners are HID keyboards).
- Bluetooth ring/handheld scanners: `core/scan/HardwareScanner.kt` — a keyboard-wedge listener on every
  scan screen; `EFY1:` + 6 chars counts as a SCAN (Enter/Tab/no suffix, Caps Lock tolerated, iOS key
  mapping). Tested by `KeyboardWedgeTest` + iOS tests.

### 4.5 Location, navigation, maps
- **No GPS anywhere.** No device location is read, sent, or stored; a backend guard keeps location out
  of the driver service except `run-map.ts` (decision D22 "never a device position"). No live driver
  position for dispatch, no customer tracking/ETA, no geofenced arrival, no geotag on proof (backlog B4
  "decision needed").
- **Navigation hand-off**: Android `geo:0,0?q=<address>` (falls back to `https://maps.google.com/?q=`)
  — `androidMain/.../AndroidMapLauncher.kt`; iOS `http://maps.apple.com/?q=<address>` —
  `iosMain/.../IosMapLauncher.kt`. Both are a **search/pin**, not directions mode: the driver must then
  tap "Directions"/"Start". No Waze/Google choice on iOS, no multi-stop route export.
- **Schematic map** (`core/map/RunMapView.kt`, D25): seeded fake streets, legs, pins, van, legend;
  points are postcode/locality centroids from `apis/edge-api/driver/src/work/run-map.ts` (+ hub point
  from `delivery_settings`). Explicitly "this side of town", not cartography. MapLibre was adopted and
  removed in 060 (`MapLibreAbsentGuardTest`). Note the 2026-10-15 redesign brief listed "Map tab or
  in-app map" as **not in this app**; 092 rev 2 brought a map back as decoration on four screens.
- No route optimisation in the app; stop order is the server's (`ordered()` / dispatcher reorder).

### 4.6 Barcode scanning (summary)
Labels (089): `EFY1:<6-char code>`, Code 128 (primary) + QR, printed by shops. Reader (090):
Android CameraX + ML Kit bundled (QR + Code 128 only); iOS AVFoundation metadata output in Kotlin/Native.
2 s debounce per code, torch, beep/haptic, hard-stop tone. One rule (`ScanRule`) for S1–S5; every
hand-over records `scan`/`typed`/`manual` into `package_handover` (091 shows it to back-office).
Type-a-code sheet for torn labels. Auto-complete with 3 s Undo.

### 4.7 Error states
`core/error/AppError.kt` + `core/http/HttpErrors.kt`: 401 Unauthenticated, 403 Forbidden, 404 NotFound,
409 → `NotOpenYet` (round_not_open, with label) / `OutOfTurn` (093 sequence types, server sentence) /
`Conflict` (anything else), 422/400 → `Validation(detail)` (backlog B2 fixed), 429, 5xx Unavailable,
transport → Network. Messages in `core/presentation/AppErrorMessages.kt`. Screens: full-page "couldn't
load" states with Try again, inline problem alerts, refusal banner for queued writes.

## 5. Half-built, flagged, or not wired

- **Everything 088–093 is unwalked**; 088/089/090/091/093 not migrated or deployed; the 093 app build and
  `driver` must ship together.
- **Vehicle check** behind `vehicle_check_required` (off).
- **iOS push**: absent (NoOp).
- **Dispatch / hub desk / handbook contacts**: build-time BuildKonfig values, empty locally → every
  "Call dispatch" button is hidden in a local build; changing a number needs an app release.
- **Hub address**: none; only a lat/lng point.
- **`TodayViewModel.returnParcels()`** and `isReturning` — dead: Today now pushes `ReturnHubRoute`, which
  uses `DeliveryViewModel.returnParcels`. `DeliveryViewModel.advance()` is unused (only `deliver()` calls
  `advanceDrop`), and `en_route` is never sent any more; `deliverContactless/WithPhoto/WithSignature`
  wrappers are test-only.
- **Unused routes** kept: `/issue`, `/activity`, `/activity/read`.
- **Analytics consent** defaults to ON (switch in Account) — not opt-in.
- **Masked customer contact** (049 R6) never built; raw phone number exposed instead.

## 6. Test coverage

31 test files, ~185 `@Test` (FEATURE-HISTORY reports "310 host tests"; the gap is presumably iOS/Android
duplicates or parameterised runs — not verified). `shared/src/commonTest`, `androidHostTest`, `iosTest`.
- Strong: `CollectionViewModelTest` (18), `DeliveryViewModelTest` (18, incl. two-tap order online/offline,
  load, scan methods), `ScanRuleTest` (10), `KeyboardWedgeTest` (9), `OpeningTest`, `ManifestTest`,
  `DeliveryWindowTest`, `OfflineQueueTest`, `OfflineWritesTest` (incl. proof survives restart),
  `LastReadTest`, `SessionManagerTest`, `WorkChangesTest`, `HttpErrorsTest`, `HubSplitTest`,
  `HandoverTest`, iOS `DoorScanTypedCodeIosTest`, `ScanBannerWhenIosTest`; guards
  `RouteSerializerGuardTest`, `MapLibreAbsentGuardTest`, `AudienceCopyGuardTest`, `AnalyticsEventDriftTest`.
- Thin/absent: `TodayViewModelTest` (7; nothing on the vehicle check, load step or return step),
  **no `SyncCoordinator` test** (drain order, 409→Applied rule), no `HttpDeliveryRepository.flushProofs`
  test, no `AccountSheet` / hub-accounting test, no Compose UI or screenshot tests (only the debug design
  gallery), no device/E2E test, and the app has never been walked against dev since 092.
- Backend (driver 224/224, fleet 328/328 container tests per 093) is far better covered than the app UI.

## 7. Observations

### 7.1 Bugs and contract mismatches found in code

1. **Going off duty while holding parcels always fails with the wrong message.** The server refuses
   `POST /duty {onDuty:false}` with 409 `holding_packages` unless `acknowledgeHeldPackages: true`
   (`apis/edge-api/driver/src/functions/driver-duty-v1-post.ts:40-66`). The app never sends that field
   (`HttpDriverRepository.setDuty`, the DTO has it: `packages/shared-types/contract-driver/DriverDto.kt:833`).
   `GoOffDutySheet` tells the driver "Packages in the van stay with you" and offers "Go off duty", then
   the 409 maps to `AppError.Conflict` → "Someone else just changed this. Pull to refresh." The same call
   on sign-out is wrapped in `runCatching`, so a driver who signs out holding parcels stays ON duty on the
   server and keeps being assigned work.
2. **Hub scan auto-complete can never fire when a package was left at a shop.** `ScanContexts.hub(run)`
   expects `stops.packageCodes + hubSort codes` (`core/scan/ScanContexts.kt`), and the server's stop
   `packageCodes` include `not_available` packages while `hubSort` excludes them
   (`apis/edge-api/driver/src/work/service.ts:285` vs `:307`). The scan list also shows them as
   "CHECK IN". Result: after any short collection, the driver can never finish S2 by scanning and must use
   the fallback (whose accounting sheet *does* filter by `coming`, so the two paths disagree).
3. **"The customers are told you're on the way" is false.** The load screen's note
   (`DeliveryRunScreen.kt`, `listNote`) promises a customer message; nothing in the platform produces
   `order_out_for_delivery` (copy exists in `notifications/src/worker/copy.ts:104`, no producer;
   `ORDER-FLOW-GAPS.md` Tier 5). Same risk for the Delivered view's "Proof recorded · customer told" on
   web/iOS customers, who get the `order_delivered` email only.
4. **Offline load-then-deliver can dead-end at the door.** After "Load the van" is queued offline, the run
   copy is moved to out-for-delivery, but `getDrop` falls back to an in-memory `LastRead` copy taken
   *before* loading (status STAGED → `loaded == false`), so the drop shows "Load the van first" and
   `refuseIfNotLoaded` blocks delivery (`DeliveryViewModel.kt`, `DropScreen.kt:329`). A drop never opened
   before the dropout has no copy at all ("This drop didn't load"). Runs and drops are not persisted, so
   after the OS kills the app offline nothing beyond Today is readable.
5. **Any 409 other than the named ones is treated as "applied" by the sync drain**
   (`SyncCoordinator.replay`: `AppError.Conflict -> Result.Applied`). A queued write genuinely refused
   with a 409 (e.g. a future gate, or `holding_packages`) is silently dropped with no "Not recorded"
   banner, while the phone already showed it as done.
6. **Hub check-in re-read after an offline send drops the payload.** `readSavedCheckIn` calls
   `checkInHub(runId, id)` with empty `handed`/`missing` under the same changeId. Correct only if the
   server replays the stored answer for that changeId; if it re-executes, it checks in with no methods and
   no missing list. Also `savedCheckIn` lives only in the ViewModel, so a process death loses the split.
7. **Shared-device leak**: sign-out clears last copies but not `OfflineQueue`, `ProofOutbox` or
   `StopDrafts` (`AppContainer.session` → `onSignedOut = { lastCopies.clear() }`). The next driver to sign
   in would replay the previous driver's writes and proofs under their own token (refused → "Not recorded"
   banner; the first driver's proof is lost).
8. **Scan progress is not saveable.** `ScanPanel` keeps the session, methods and Undo state in `remember`,
   not `rememberSaveable`; at the door `handed` and the photo are `remember` too. Rotation, a phone call
   that reclaims the app, or backing out loses a half-scanned van/hub load.
9. Small: `TodayViewModel.toggleDuty` uses a fresh changeId per tap (not `ActionIds`); collection run
   DTO hard-codes `status: "assigned"` (`service.ts:279`); camera permission copy on both platforms only
   mentions proof photos though scanning is now the main use; iOS priming screen's "Continue" asks for
   nothing.

### 7.2 Missing vs Uber / DoorDash / Onfleet / Amazon Flex-style driver apps
- **No location at all.** Industry baseline is background GPS for dispatch visibility, live customer
  tracking/ETA, geofenced "arrived" (auto-arrive, prevents fake arrivals), geotagged proof, and proof of
  presence on a failed attempt. Effy has none by deliberate decision (D22, B4 pending). Dispatch cannot
  see where a van is; a customer cannot see the driver approaching; "Late" is guessed from the window.
- **Navigation is a search, not a route.** `geo:0,0?q=` / `maps.apple.com/?q=` drop a pin; Flex/Onfleet
  open turn-by-turn directly (`google.navigation:q=`, `maps.apple.com/?daddr=…&dirflg=d`) and let the
  driver choose Google/Waze/Apple. No multi-stop export, no in-app route line (the map is decorative).
- **Failed attempts are weakly evidenced**: no photo, no arrival/position, no "wait N minutes / call
  first" timer, no customer contact attempt recorded. DoorDash/Flex require a call/text attempt and a
  wait timer before "customer unavailable".
- **Customer contact**: direct dial of the real number (privacy issue — the driver keeps it in their
  call log), no SMS template ("I'm outside"), no masked relay, no in-app chat. Shop contact absent too
  (dispatch phone only, and only if built in).
- **Notifications**: iOS has none; Android only once migrations/deploys land. No in-app alert sound for
  new work while the app is open beyond a silent re-read.
- **No ETA/route sequencing help**, no "next stop" auto-advance after delivery beyond the Next button, no
  age-verification/ID check flow (alcohol), no temperature/cold-chain confirmation at handover, no
  damage/photo at pickup, no support chat or in-app incident reporting (only phone).
- **No shift model**: no scheduled shift, start/end times, breaks, end-of-day summary or van/vehicle
  handback; duty is a toggle.

### 7.3 Over-complexity / friction
- **Many gated states the driver must reason about**: round not open, load first, finish collection
  first, return parcels first, stops outstanding, vehicle check due/unsafe — each with its own wording. The
  server enforcing order (093) is good; the app still surfaces many dead-end screens ("Load the van first"
  on a drop) rather than routing the driver to the one next action.
- **Three fallbacks per scan step** (scan, type a code, tick by hand + accounting sheet) plus Undo and
  auto-complete — powerful, but a lot of UI per step; and the two paths at the hub already disagree (bug 2).
- **Decorative schematic map** costs 455 lines (`RunMapView.kt`) plus a backend endpoint shape and
  postcode-centroid SQL, contradicts the brief's "no in-app map", and may mislead (fake streets, pins at
  suburb centroids, not the house).
- **Comment volume** remains very high (multi-paragraph defect histories in code), despite backlog E6.
- **Two "return" entry points** (Today and run foot) and two ViewModel implementations of returning (one
  dead).

### 7.4 Inconsistencies between docs and code
- `docs/driver-app-review.md` is stale (Map tab, activity feed, four-step drops, 422 handling, offline
  sign-out — all changed); it should be marked superseded.
- CLAUDE.md says the driver map is "a schematic, not cartography" from 060; 092 rev 2 re-introduced a
  different schematic (D25) while the redesign brief §6 says no map.
- FEATURE-HISTORY has no 060 entry although CLAUDE.md and code comments cite it heavily.
- 092 entry says "Not drawn, no data: Navigate to the hub" — the app now draws "To the hub" using the
  hub lat/lng point (enabled only when `delivery_settings` has one).

### 7.5 Things that are solid
Idempotent writes by changeId everywhere; queued-write UX (C1) and persistent proof outbox (B3); session
survives offline (C3) and 401/403 re-check (C4); one scan rule tested once; per-package outcomes in one
collect (the old `/issue` defect is gone); server-enforced work order with a dispatcher waiver; label
scanning works offline and with Bluetooth wedge scanners; one change stream (`WorkChanges`) instead of
timers; JPEG proof sized and uprighted on both platforms.

### 7.6 Suggested priorities (for the caller)
1. Fix bug 1 (send `acknowledgeHeldPackages` after the sheet, map `holding_packages` to its own error,
   and make sign-out not silently leave the driver on duty).
2. Fix bug 2 (filter `not_available` from `ScanContexts.hub` / server `packageCodes`).
3. Either produce `order_out_for_delivery` on load or remove the promise from the load screen (bug 3).
4. Persist run/drop reads and patch the drop copy on an offline load (bug 4); clear queues on sign-out
   (bug 7); make scan sessions saveable (bug 8).
5. Decide location (B4 + dispatch visibility) and switch Navigate to directions-mode deep links.
6. Walk 088–093 on a device against dev before more features; add `SyncCoordinator` and Today-state tests.

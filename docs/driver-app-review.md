# Effy Driver App — Review (2026-10-15)

Scope: `apps/driver-mobile` (KMP + Compose, Android + iOS) and the backend it calls,
`apis/edge-api/driver`. Work items from this review are in
[driver-app-backlog.md](driver-app-backlog.md). The brief for the new UI is
[driver-app-redesign-brief.md](driver-app-redesign-brief.md).

## Verdict

The app is **not** early-stage. It has about 14k lines across 159 Kotlin files and calls 21 of the 23
driver API routes (all but the two health checks). It has a full set of screens, and its host unit
tests pass (`./gradlew :shared:testAndroidHostTest`).

What it lacks is not features. **A few things in the core delivery flow are broken.
Notifications don't exist end to end. It behaves badly offline. And it carries more surface than a
simple driver tool needs.**

## What is built

| Area | State |
|---|---|
| Sign-in (work email + 6-digit code), session restore, refusal of a disabled driver | Works |
| Duty on/off; Today (current round, up next, upcoming rounds, "opens at…") | Works |
| Collection: run → shop stop → tick packages / report a problem → swipe to collect → hub check-in | Works |
| Delivery: run → drop → Start → On my way → Arrived → proof (photo / signature / contactless) or fail with reason | Works, but see C1–C3 |
| Live updates while the app is open (AppSync Events) | Works |
| Offline write queue, last-read copy of stops and drops | Built, but see H1–H3 |
| History, activity feed, Map tab, Help, Appearance, Account, permission screens | Built |
| Push | Android shows pushes and registers its token. **iOS has none. The backend never sends one.** |

## Critical: the core flow is broken

### C1. Delivery rounds never finish (backend)
The only place a round becomes `completed` is hub check-in, which is collection only
(`apis/edge-api/driver/src/work/complete.ts:239`). Delivering or failing the last drop never closes the
round. The consequences:
- A finished delivery round stays `in_progress` and sorts first in `OPEN_ROUNDS`
  (`work/sql.ts:55`). Today keeps showing it as current with nothing left in it.
- The driver's next round stays stuck under "upcoming".
- Delivery runs never appear in History, which lists only `status = 'completed'`.

### C2. Android photo proof is likely to be refused
The CameraX frame is re-encoded at full resolution as a PNG at quality 100
(`shared/src/androidMain/.../CameraPreviewSurface.android.kt:101`). A 12-megapixel PNG routinely
exceeds the server's 10 MB limit (`apis/edge-api/shared/src/lib/media.ts:27`), which answers 422.
Other problems on the same path:
- The image is decoded on the main thread.
- EXIF and sensor rotation are ignored.
- The fallback system-camera path (`TakePicturePreview`) returns only a thumbnail, which is too small
  to settle a dispute.

### C3. Server error messages are swallowed
The proof, presign and fail routes answer **422** with a readable message. The app maps only 400 to
`Validation`, so a 422 becomes "Something went wrong"
(`shared/src/commonMain/.../core/http/HttpErrors.kt:16-26`). For example, a driver who chooses
"Other" without a note never sees "Tell us what happened".

### C4. No push notification ever reaches a driver
No backend code inserts a `notification_request` with `audience = 'driver'`. The `run_assigned`
wording exists in `notifications/src/worker/copy.ts`, but nothing produces one. The permission screen
promises "the moment new work is assigned".
- iOS has no push at all: the push provider is a no-op and APNs is not set up.
- The live channel runs only while the app is in the foreground.

So a driver with the app closed never learns about new or changed work.

## High: offline use and the session

### H1. Offline writes report themselves as failures
`OfflineQueue.withReplay` queues the write and then throws `Network` anyway. The screen shows
"You're offline" and the driver stays on the stop. If they tap again, a second write is queued under a
**new** `changeId`; the queue only removes duplicates by `changeId`. That duplicate can later be
refused and show a false "Not recorded" banner.

A hub check-in made offline is queued, but its result (how many parcels go where) is lost.

### H2. Proof can't be captured offline, and the message says otherwise
Proof is never queued (`HttpDeliveryRepository.completeWithMedia`), yet the error text is "We'll retry
when you're back". A doorstep with no signal is a dead end.

### H3. Opening the app offline signs the driver out
- `AmplifyAuthDriver.currentSession` swallows every error and returns null.
- `SessionManager.loadRecord` turns a network failure into `SignedOut` after two retries.

A driver who opens the app in a loading dock lands on the sign-in screen. Android sign-in also has no
network error case, so it says "Something went wrong" instead of "You're offline".

### H4. A 401 or 403 in the middle of a shift ends nothing
Screens show "Your session ended. Please sign in again.", but the driver stays in the app. A driver
disabled during a shift keeps working until they restart it.

## Medium

- **M1.** A failed drop disappears from the driver's work, though they still have the parcel
  (`proof/sql.ts`, `INSERT_FAILURE`). There is no "return to hub" step anywhere.
- **M2.** The drop-status route writes whatever it is given, so a late offline replay can move a drop
  backwards, for example from `arrived` to `out_for_delivery` (`work/delivery.ts:165`).
- **M3.** Android asks for notification permission in `MainActivity.onCreate`, before the permission
  explanation screen, so the driver sees two prompts.
- **M4.** Signing out sets the driver off duty but does not stop the shift timer
  (`app/DriverShell.kt:417`).
- **M5.** The hub check-in route has no load of its own. After the app is reclaimed by the system, the
  shop and package counts are blank.
- **M6.** A drop carries no customer phone number, so the driver cannot call from the door.
- **M7.** Analytics consent is hard-coded to true on both platforms (`EffyApp.kt`,
  `MainViewController.kt`).

## Over-built for a simple driver app

- **Map tab.** A drawing of the stop order with no real positions, repeating Today's list
  (`features/map/`, `core/platform/EffyMapCanvas.kt`). Navigate already hands the address to Google or
  Apple Maps.
- **Four steps per drop.** Start (`out_for_delivery`) → On my way (`en_route`) → Arrived → proof.
  "Out for delivery" per drop has no meaning; loading the van happens once per round.
- **Placeholder framework.** `core/placeholder/`, four `PlaceholderData.kt` files and
  `PlaceholderRegisterGuardTest` exist only to render "—" for ETA, distance, bay and geotag.
- **Activity feed.** Its badge and on-phone "seen" store duplicate live updates, and the backend
  always returns `read: false`.
- **Day stats and shift timer.** Day stats download the whole history to count today. Both are nice
  to have, not needed.
- **Comment volume.** Roughly half of many files is change history ("⚠ this was a defect in 060…").
  That history belongs in FEATURE-HISTORY.md; it makes the code hard to change.

## Missing for a simple driver app

1. Push for: work assigned, round changed or withdrawn, round opens soon — on Android and iOS.
2. A customer phone number (or a masked call) on the drop.
3. A return-to-hub step for failed parcels.
4. Saving the proof photo on the phone and sending it later, so a drop can be completed with no signal.
5. Keeping the driver signed in while offline.
6. (Decision needed) Location on the proof photo, and/or the driver's position for dispatch.

## What I'd keep

- The **Clean Architecture split** and the hand-wired `AppContainer`.
- **Mapping DTOs to domain models** in each repository.
- **Idempotent writes** keyed by `changeId`.
- **"Opens at…" handling** (`NotOpenYet`).
- The **live-update client**.
- **Proof that is only recorded once the image has uploaded.**
- The **draft ticks kept on the phone** at a shop stop.

All of these are sound, and the redesign should keep them.

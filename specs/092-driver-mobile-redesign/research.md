# Research: Driver App Redesign (092)

Read from the tree and the canvas on 2026-10-16. Most decisions follow 087, which moved the customer app
onto the same identity.

### R1 — The driver theme reads the storefront file (constitution v3.5.0)
`gen-compose-theme.mjs`'s driver target switches to `identity: "storefront"` (source
`src/storefront/tokens.css`, both blocks), as 087 did for the customer target. Output stays in
`packages/design-system/compose-driver/`. Roles without an M3 slot (brand green, its muted tint,
primary-muted) are read through a driver `EffyRoles`, following the appearance — the customer app's pattern.
`tokens:check` fails an undeclared hex in the driver theme.

### R2 — Geist bundled; Lucide generated
Geist / Geist Mono TTFs (+ OFL) are copied into the driver's `composeResources/font` (General Sans removed).
`gen-lucide-drawables.mjs` gains a driver glyph list and output folder; the canvas's driver icons (navigate,
phone, camera, snowflake, warehouse, wifi-off, scan, flashlight, …) are added there.

### R3 — A driver kit in `core/presentation/`, never mobile-kit
As 087: the kit is app-local (buttons, action bar, rows, status pill, banners, sheet, snackbar, states,
hero, app bar). mobile-kit keeps navigation and SwipeToConfirm (restyled through the theme). A
`scripts/driver-guard.sh` enforces: no colour literal in a screen, no red/orange hue, no "same-day"/"standard",
no currency.

### R4 — Three tabs; Map and Activity removed (E1, E4)
`DriverTab` becomes Today · History · Account. `features/map`, `EffyMapCanvas`, `MapRoot`, `features/activity`,
`ActivityRoute`, `SettingsActivitySeen` are deleted. The round's change note shows on Today (the server already
sends `changedNote`). The activity route stays on the server for old builds.

### R5 — Two taps per drop (E2, H8)
Deliver opens the proof sheet directly. On submit the app records arrival silently (`advance(arrived)` then proof,
both queued offline in order), so the server's statuses are unchanged. "Start this drop" / "On my way" screens
(`EnRouteScreen`, `ArrivedScreen`) are deleted. The run's "Load the van" (090 route) replaces per-drop start.

### R6 — Placeholders, stats and the shift timer go (E3, E5)
`core/placeholder`, the `PlaceholderData.kt` files and `PlaceholderRegisterGuardTest` are deleted with the screens
that used them; fields with no data are not drawn. Day stats and `ShiftClock` are removed (not in the canvas).

### R7 — Call the customer (F1)
`DeliveryDropDTO.customerPhone?: string | null` — `order.delivery_address ->> 'phone'` (what checkout stores),
returned only on an open drop (status not done/skipped) of the caller's round, never in history or run lists.
The app dials with the platform dialler (`MapLauncher` gains `dial`, as Help already does for dispatch).

### R8 — Hub check-in shows the next courier pickup
`HubCheckinResponse.nextCourierPickupLabel?: string | null` — from 080's `nextCourierPickup` for the default
courier service, in server words ("4:00 pm"). Optional.

### R9 — Scanning screens on 090's parts
A `ScanPanel` composable (camera top half, torch, Type a code, result banner, count, auto-complete bar with a
3-second Undo) wraps `PackageScanner` + `ScanSession`. Feedback: a platform `ScanFeedback` (haptic + short tone,
silent mode respected). Each step's write sends `packages[].method` (`scan` / `typed` / `manual`).

### R10 — Screens rebuilt on the existing ViewModels
ViewModels, repositories and the offline machinery stay; their state gains only what the canvas needs. Each
screen is rebuilt against its artboard, and its change-history comments go with the old code (E6).

# Tasks: Driver App Redesign

**Input**: `specs/092-driver-mobile-redesign/` — plan, spec, research (R1–R10), contracts, quickstart.
**Reference**: every screen task names its artboard in `docs/reference-screens/Effy Driver Mobile v2/`.
**Tests**: ViewModel and kit host tests per story; builds and guards in every checkpoint.
**Paths**: `DM` = `apps/driver-mobile/shared/src/commonMain/kotlin/com/effyshopping/driver/mobile`,
`DS` = `packages/design-system`, `EA` = `apis/edge-api`.

## Phase 1: Setup — identity

- [X] T001 Switch the driver target in `DS/scripts/gen-compose-theme.mjs` to the storefront identity (light + dark); regenerate `DS/compose-driver/*`; `tokens:check` green (R1)
- [X] T002 [P] Copy Geist / Geist Mono TTFs + OFL into `apps/driver-mobile/shared/src/commonMain/composeResources/font`; remove General Sans (R2)
- [X] T003 [P] Add a driver glyph list + output to `DS/scripts/gen-lucide-drawables.mjs`; generate into the driver's `composeResources/drawable` (R2)
- [X] T004 Driver `EffyRoles` (brand, brandMuted, primaryMuted, scrim) in `DM/core/theme/EffyTheme.kt`, following the appearance (R1)
- [X] T005 [P] `scripts/driver-guard.sh`: no colour literal in a screen, no red/orange, no "same-day"/"standard", no currency (R3)

## Phase 2: Foundational — kit and shell

- [X] T006 Driver kit in `DM/core/presentation/`: buttons (primary / outline / ghost / problem), pinned action bar, list rows, status pill (the eight words), banners (offline, waiting, refused, live paused, stale), sheet, snackbar, empty / error / no-longer-yours states, skeleton, app bar (large title / inline back) — from `Foundations`, `Patterns`, `AppBar`
- [X] T007 Restyle `SwipeToConfirm` and the tab bar through the theme (`SwipeConfirm`, `TabBar`)
- [X] T008 Three tabs: `DriverTab` = Today · History · Account; delete `features/map`, `EffyMapCanvas`, `MapRoot`, `features/activity`, `ActivityRoute`, `SettingsActivitySeen` (R4)
- [X] T009 Delete `core/placeholder`, every `PlaceholderData.kt`, `PlaceholderRegisterGuardTest`, `ShiftClock` and day stats (R6)
- [X] T010 Kit host tests (status words, banner order) + Android/iOS builds

## Phase 3: US1 — Today (P1) 🎯 MVP

- [X] T011 [US1] Rebuild `DM/features/today/presentation/TodayScreen.kt` from `Main`, `Today-Delivery`, `Today-OffDuty`, `Today-NoWork`, `Today-NotOpen`, `Today-Offline`, `Today-ReturnHub`: header (date · hub · vehicle, duty toggle), banners, hero, Up next, Later today, change note
- [X] T012 [US1] Go-off-duty sheet (`Today-GoOffDuty`), naming held work
- [X] T013 [US1] TodayViewModel tests for each state

## Phase 4: US2 — Delivery (P1)

- [X] T014 [P] [US2] Server: `customerPhone` on the drop read for open drops only (`EA/driver/src/work/delivery.ts`), contract + Kotlin regenerated; container test (R7)
- [X] T015 [US2] Delivery run (`DeliveryRun`, `LoadVan`): drops with status chips, progress, "Load the van" / "Mark all loaded" via the 090 route
- [X] T016 [US2] Drop (`Drop`): name, address, window chip, instructions callout, packages by position, Navigate, Call, Deliver, Can't deliver
- [X] T017 [US2] Two taps: Deliver → proof sheet (`ProofChoose`); photo (`ProofPhoto`), left safely (`ProofContactless`), signature (`ProofSignature`); arrival recorded silently before proof; delete `EnRouteScreen`, `ArrivedScreen` (R5)
- [X] T018 [US2] Delivered (`Delivered`, `Delivered-Offline`); Can't deliver (`CantDeliver`, `CantDeliver-Done`); Return to hub (`ReturnHub`)
- [X] T019 [US2] DeliveryViewModel tests (two-tap order, offline, call availability)

## Phase 5: US3 — Collection (P1)

- [X] T020 [P] [US3] Server: `nextCourierPickupLabel` on the hub check-in response; contract; test (R8)
- [X] T021 [US3] Collection run (`CollectionRun`), shop stop (`ShopStop`, `ShopStop-Report`, `ShopStop-Check`)
- [X] T022 [US3] Hub check-in (`HubCheckin`, `HubCheckin-Done`, `HubCheckin-Offline`)
- [X] T023 [US3] CollectionViewModel tests

## Phase 6: US4 — Scanning (P2)

- [X] T024 [US4] `ScanPanel` (camera, torch, Type a code, result banner, count, auto-complete bar with Undo) + platform `ScanFeedback` (`Scanner`, `ScanStates`, `TypeCode`) (R9)
- [X] T025 [US4] Wire S1 shop (`ScanShop*`), S2 hub (`ScanHub`), S3 load (`LoadVan`), S4 door (`ScanDoor*`), S5 return (`ScanReturn`), sending each package's method
- [X] T026 [US4] Scan panel state tests

## Phase 7: US5 — History, Account, Help (P2)

- [X] T027 [US5] History (`History`, `HistoryRun`, `HistoryDrop`)
- [X] T028 [US5] Account with inline appearance, notifications/camera rows, Help rows, version (`Account`), Sign out sheet (`SignOut`), Help (`Help`); delete `AppearanceScreen`

## Phase 8: US6 — Getting in (P3)

- [X] T029 [US6] Splash, sign in, code, error, refused (`Splash`, `Auth*`); permissions (`Permissions`, `PermissionDenied`)

## Phase 9: Polish

- [X] T030 Dark appearance pass against `DarkMode`; reduced motion
- [X] T031 Guards (`driver-guard.sh`, delivery words, refresh timers, tokens), host tests, Android + iOS builds
- [X] T032 Record 092 in `FEATURE-HISTORY.md`, `CLAUDE.md` (design system section: driver app on the storefront identity), backlog (G, E1–E6, F1, H6–H11)

## Dependencies

Phase 1 → Phase 2 → stories. US1–US3 are independent after Phase 2; US4 builds on US2/US3 screens.

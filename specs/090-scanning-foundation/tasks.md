# Tasks: Package Scanning — Foundations

**Input**: `specs/090-scanning-foundation/` — plan, spec, research (R1–R6), data-model, contracts, quickstart (P1–P7)
**Tests**: included (quickstart P1–P7).
**Paths**: `EA` = `apis/edge-api`, `ST` = `packages/shared-types/src`, `DM` = `apps/driver-mobile/shared/src/commonMain/kotlin/com/effyshopping/driver/mobile`.

## Phase 1: Setup

- [X] T001 Write `db/migrations/20261016160000_package_handover.sql` (data-model.md)
- [X] T002 [P] Add `HandoverMethod`, `PackageHandover`, `LoadRequest`/`LoadResponse`, method fields, `hubSort`, `ParcelsToReturn.packageCodes` to `ST/driver.ts` and `ST/driver-contract.ts`; regenerate `contract-driver/DriverDto.kt`
- [X] T003 [P] Create `packages/shared-types/package-code.fixtures.json` (reads → expected code or null) and test `ST/package-code.test.ts` against it

## Phase 2: Foundational

- [X] T004 Create `EA/driver/src/work/handover.ts` — `recordHandovers(tx, { step, roundId, driverId, changeId, packages, allowed })` (filters to allowed package ids and known methods; `ON CONFLICT DO NOTHING`)

## Phase 3: US1 — one scan rule (P1) 🎯 MVP

- [X] T005 [US1] `DM/core/scan/PackageToken.kt` (Kotlin twin) + `PackageTokenTest` reading the shared fixture
- [X] T006 [US1] Map package codes into the domain: `CollectionPackage.packageCode`, `CollectionStop.packageCodes`, `CollectionRun.hubSort`, `DropPackage.packageCode`, `DropSummary.packageCodes`, `ParcelsToReturn.packageCodes` (collection/delivery/today data mappers)
- [X] T007 [US1] `DM/core/scan/ScanRule.kt` (outcomes, `judge`) and `ScanContexts.kt` (shop stop, hub, load, drop, return builders)
- [X] T008 [P] [US1] `ScanRuleTest` covering every outcome at every step (P1)

## Phase 4: US2 — the camera reader (P1)

- [X] T009 [US2] `DM/core/scan/ReadDebouncer.kt` + test (P3)
- [X] T010 [US2] `expect fun PackageScanner` in common; Android actual (CameraX ImageAnalysis + ML Kit bundled, QR + Code 128, torch) with the dependency in `gradle/libs.versions.toml` and `shared/build.gradle.kts`
- [X] T011 [US2] iOS actual (AVCaptureSession + metadata output + preview layer in `UIKitView`, torch)
- [X] T012 [US2] Build Android + iOS (P7)

## Phase 5: US3 — hand-over records (P2)

- [X] T013 [US3] Record hand-overs in collect (`work/complete.ts`), hub check-in (`complete.ts` + handler), proof (`proof/repository.ts` + service), return (`work/return.ts`)
- [X] T014 [P] [US3] Driver container test: one record per package per hand-over; retry records once; none without methods; foreign packages ignored (P4)

## Phase 6: US4 — hub sort (P2)

- [X] T015 [US4] `EA/driver/src/work/hub-sort.ts` (`hubSortOf`) + unit test; `hubSort` on the collection run read (`work/service.ts`)
- [X] T016 [P] [US4] Container assertion on a run with today / later-day / courier parcels (P5)

## Phase 7: US5 — load the van (P2)

- [X] T017 [US5] `EA/driver/src/work/load.ts` (`loadRun`, gated) + `functions/driver-delivery-load-v1-post.ts` + route; register in `work/open.guard.test.ts`; announce
- [X] T018 [P] [US5] Container test (P6)

## Phase 8: Polish

- [X] T019 Guards (change map, gateway capacity, delivery words), full driver suites, driver-mobile host tests
- [X] T020 Record 090 in `FEATURE-HISTORY.md`, `CLAUDE.md`, and the backlog (H4, H5 and the platform halves of H6–H10 done)

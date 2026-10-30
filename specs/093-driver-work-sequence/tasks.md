# Tasks: Driver Work in One Order, and Trips That Join Up

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/api.md](contracts/api.md)

Abbreviations: `DRV` = `apis/edge-api/driver/src`, `FLT` = `apis/edge-api/fleet/src`, `ESH` = `apis/edge-api/shared/src`,
`ST` = `packages/shared-types/src`, `BO` = `apps/back-office/src/features`,
`DM` = `apps/driver-mobile/shared/src/commonMain/kotlin/com/effyshopping/driver/mobile`.

Tests are included: the spec's SC-001/SC-002 are proven by tests, and every gate has a guard (R1).

## Phase 1: Setup

- [X] T001 Write `db/migrations/20261017100000_driver_work_sequence.sql`: `package_hold`, `round_sequence_waiver`, `vehicle_check`, and the two `delivery_settings` columns, with CHECKs, indexes and COMMENTs per data-model.md, plus a Down section

## Phase 2: Foundational (blocks every story)

- [X] T002 [P] Add the run stage to `ST/run-stage.ts`: `RunStage`, the `runStage(facts)` pure function and `RUN_STAGE_WORDS` per R7, exported from `ST/index.ts`; unit test `ST/run-stage.test.ts`
- [X] T003 [P] Contract types in `ST/driver.ts`:
  - `SequenceProblemType`;
  - `CollectRequest.packages` required, and `CollectResult` with `remaining`;
  - `DropStatusRequest.to` without `out_for_delivery`;
  - `LoadRequest.notLoaded`, `LoadResponse.held` and `dropsRemoved`, `MissingReason`;
  - `HubCheckinRequest.missing`, `HubCheckinResponse.held`;
  - the `TodayDTO.stage`/`stageLabel`/`loadStep` fields, the run DTOs' `stage`/`stageLabel`, and `DeliveryDropDTO.loaded`;
  - the vehicle-check types and `MeDTO.vehicleCheck`.

  Register new request types in `ST/driver-contract.ts`. Regenerate `pnpm --filter @effy/shared-types driver-contract:gen`.
- [X] T004 [P] Fleet contract types in `ST/delivery-admin.ts` (or the fleet types file that holds `DeliveryExceptionListDTO`):
  - `HeldPackageDTO`, `OverdueRunDTO`, `VehicleCheckDTO`, plus `held`, `overdue` and `vehicleChecks` on the exceptions list;
  - stage, `outOfOrder` and waiver on the dispatch round DTOs;
  - `loadOverdueMin` and `checkinOverdueMin` on `DeliveryDaysDTO`;
  - the request bodies for waive, resolve and clear.
- [X] T005 [P] Add `HELD_SQL(sfAlias)` to `ESH/delivery/held.ts` (an open or lost hold exists) and `ROUND_STAGE_FACTS` to `ESH/delivery/round-stage.ts` (per-round counts for `runStage`), exported via the delivery barrel
- [X] T006 Add the sequence gates to `DRV/work/sequence.ts`:
  - the `SequenceError` class and the `sequenceProblem(err, scope)` helper (409 shape per contracts/api.md);
  - `assertStopsSettled(tx, runId)`, `assertDropLoaded(tx, dropId, driverId)`, `assertNothingToHandIn(tx, driverId, runId)` (collection custody not checked in, or parcels to return, unless waived) and `assertNoDeliveriesOpen(tx, driverId, runId)` (in-transit custody, unless waived).

## Phase 3: US1 - One step unlocks the next (P1) 🎯 MVP

**Independent test**: each out-of-order step, sent directly, is refused with its sentence, and nothing is written.

- [X] T007 [US1] In `hubCheckin` (`DRV/work/complete.ts`), call `assertStopsSettled` after `assertRoundOpen`, keeping the retry answer for a run already checked in ahead of the gate
- [X] T008 [US1] In `DRV/work/delivery.ts` `setDropStatus`, drop `out_for_delivery` from the allowed set and call `assertDropLoaded` after the finished-drop answer; add `loaded` to `deliveryDrop`
- [X] T009 [US1] In `DRV/proof/repository.ts`, call `assertDropLoaded` in proof and failure, after the idempotent replay answer
- [X] T010 [US1] In `DRV/work/load.ts`, call `assertNothingToHandIn` before moving drops; a retry where nothing is staged still answers `loaded: 0`
- [X] T011 [US1] In `DRV/work/complete.ts` `collectStop`, call `assertNoDeliveriesOpen` after the done-stop retry answer
- [X] T012 [US1] Map `SequenceError` → `sequenceProblem` in every gated handler: `DRV/functions/driver-hub-checkin-v1-post.ts`, `driver-drop-status-v1-post.ts`, `driver-drop-proof-v1-post.ts`, `driver-drop-fail-v1-post.ts`, `driver-delivery-load-v1-post.ts` and `driver-collect-v1-post.ts`
- [X] T013 [US1] Add `DRV/work/sequence.guard.test.ts`: every route that progresses a stop, drop, load or check-in calls its gate (model on `open.guard.test.ts`)
- [X] T014 [US1] Add `DRV/work/sequence.container.test.ts`: check-in refused with a shop open; drop status, proof and fail refused on a pending drop; load refused while holding collected or to-return parcels, allowed with a waiver; collect refused with drops in transit; retries answer as done
- [X] T015 [US1] Today in `DRV/work/service.ts`: when the current round is a delivery round with pending drops, set `active = null` and `loadStep = {runId, packageCount, dropCount}`; add `stage`/`stageLabel` to Today and the collection and delivery run reads from `ROUND_STAGE_FACTS` + `runStage`
- [X] T016 [US1] Waiver route: add `FLT/dispatch/waiver.ts` (insert the waiver, audit, announce `dispatch` + the driver's `work`) and `FLT/functions/fleet-dispatch-round-waive-sequence-v1-post.ts`; register in `apis/edge-api/fleet/serverless.yml`
- [X] T017 [P] [US1] Driver app data: map the new problem types to a `SequenceRefusal(sentence)` app error in `DM/core/network/HttpErrors.kt` (or the existing problem mapper), and decode `stage`, `stageLabel`, `loadStep` and `loaded` in `DM/features/today/data`, `DM/features/delivery/data` and `DM/features/collection/data`
- [X] T018 [US1] Driver app delivery: in `DM/features/delivery/presentation/DropScreen.kt`, while `!drop.loaded` show "Load the van first" with Deliver and Can't deliver disabled, plus a "Go to Load the van" action; remove every per-drop `out_for_delivery` call in `DeliveryViewModel.kt` and `HttpDeliveryRepository.kt`; show the refusal sentence from `SequenceRefusal`
- [X] T019 [US1] Driver app Today: in `DM/features/today/presentation/TodayScreen.kt`, make `loadStep` the hero ("Load the van · n packages for m drops" → opens the run's load); show the server's `stageLabel` on the run screens
- [X] T020 [US1] Driver app collection: show `SequenceRefusal` sentences on the collection screens and the check-in in `CollectionViewModel.kt`; keep the hub row gated on `allCollected`
- [X] T021 [US1] Back-office: add "Allow loading anyway" with a reason dialog on round detail (`BO/dispatch/RoundDetailScreen.tsx`, `repo.ts`, `queries.ts`), shown when the round's stage is `to_load` and no waiver exists; show an existing waiver's reason

## Phase 4: US2 - A package the driver did not see is never marked collected (P1)

**Independent test**: add a package to an open stop, then collect the shown ones; the new one stays waiting.

- [X] T022 [US2] In `DRV/work/complete.ts` `collectStop`, settle only the named packages; mark the stop done only when no `assigned` row remains; return `remaining`; validate `packages` non-empty in `DRV/functions/driver-collect-v1-post.ts` (400)
- [X] T023 [US2] Add the container test in `DRV/work/collect-remaining.container.test.ts`: two named + one unnamed → `remaining: 1`, stop open; then the third → stop done; a retry answers the same
- [X] T024 [US2] Driver app: when the collect result has `remaining > 0`, `CollectionViewModel.kt` re-reads the stop and shows "n more package(s) were added - collect before you leave"; the stop screen stays open (`CollectionScreens.kt`)

## Phase 5: US3 - Trips that join up (P1)

**Independent test**: driver A checks in today's parcels; A's delivery run gets them, with the "collected it" note.

- [X] T025 [US3] Planner gather in `FLT/planner/sql.ts`: return `dr.driver_id AS collected_by` from the delivery gather; add `HELD_SQL` to both gathers; map it to `PlannablePackage.collectedBy` in `FLT/planner/types.ts` and `FLT/planner/repository.ts`
- [X] T026 [US3] Collector preference in `FLT/planner/assign.ts`: for delivery, after the visiting rule, pick the collector's target when they are eligible, with the note "Auto-assigned - collected it, continuing to delivery"
- [X] T027 [US3] Add unit tests to `FLT/planner/assign.test.ts`: the collector is preferred over a lighter-loaded driver; an ineligible collector falls back to load balance; the visiting rule beats the collector; an in-progress delivery round never gets additions
- [ ] T028 (deferred - the check-in result already names the next run when one exists) [US3] Driver app: after the check-in result, `CollectionViewModel.kt` / Today shows "Your delivery run will appear here shortly" until the live `work` update brings the run (`TodayScreen.kt`)

## Phase 6: US4 - Missing packages are declared (P2)

**Independent test**: load with one package declared and check in with one missing; both are held and listed to dispatch.

- [X] T029 [US4] In `DRV/work/load.ts`, accept `notLoaded` (resolve codes to ids on the run); per package, insert `package_hold` (step `load`) and delete its delivery `round_package` row; delete drops left with no packages; then move the remaining pending drops; return `held` and `dropsRemoved`; validate the reason and the note for `other` in the handler
- [X] T030 [US4] In `DRV/work/complete.ts` `hubCheckin`, accept `missing`: insert `package_hold` (step `checkin`, reason `not_in_van`); `packages_arrived` excludes them; return `held`
- [X] T031 [US4] Add the container test in `DRV/work/holds.container.test.ts`: a load hold removes the row and the empty drop; a held package is not gathered by the planner (`FLT/planner/planner.container.test.ts` addition); a check-in hold is not gathered; retries are idempotent
- [X] T032 [US4] Fleet held packages: in `FLT/exceptions/sql.ts` + `service.ts`, list open holds in the exceptions read; add `FLT/exceptions/held.ts` to resolve (`found` | `lost`, audit, announce `dispatch`); add `FLT/functions/fleet-held-package-resolve-v1-post.ts` + `serverless.yml`
- [X] T033 [US4] Driver app load: in `DeliveryRunScreen.kt` / `DeliveryViewModel.kt` add "Can't find a package" on the load scan and list: pick the package and a reason (and a note for Other); finishing with unscanned packages lists each one as "It's here" / "Missing"; send `notLoaded`
- [X] T034 [US4] Driver app check-in: in `CollectionScreens.kt` / `CollectionViewModel.kt`, finishing with unscanned packages lists each one as "It's here" / "Not in the van"; send `missing`
- [X] T035 [US4] Back-office Exceptions: add a "Held packages" table in `BO/exceptions/ExceptionsScreen.tsx` with the actions Found - plan again / Lost (confirm) (`repo.ts`, `queries.ts`, `model.ts`)

## Phase 7: US5 - Dispatch sees where every run is (P2)

**Independent test**: walk a run through every stage; the dispatch stage matches; an unloaded run past 20 minutes is listed.

- [X] T036 [US5] Fleet dispatch: add `stage`, `stageLabel`, `outOfOrder` and `waiver` to the day and round reads in `FLT/dispatch/sql.ts` + `service.ts` (`ROUND_STAGE_FACTS`, out of order per R9)
- [X] T037 [US5] Fleet overdue: add an overdue query in `FLT/exceptions/sql.ts` and `overdue[]` on the exceptions read; in the planner pass (`FLT/planner/service.ts`), announce `dispatch` when a round crossed its threshold within the pass interval
- [X] T038 [US5] Thresholds: read and write `load_overdue_min` / `checkin_overdue_min` in `FLT/deliverydays/repository.ts` + `service.ts` + validation; add the fields on the Delivery days page (`BO/delivery/…` days form)
- [X] T039 [US5] Back-office Dispatch: add a stage column on the day view and stage, "Worked out of order" and waiver on round detail (`BO/dispatch/*`); add an "Overdue" table on Exceptions
- [X] T040 [US5] Tests: `FLT/exceptions/exceptions.container.test.ts` (overdue appears and clears); `BO/dispatch/model.test.ts` (stage words)

## Phase 8: US6 - Pre-trip vehicle check (P3)

**Independent test**: an unsafe answer means no work; clearing restores work.

- [X] T041 [US6] Eligibility: add `vehicle_check_due` / `vehicle_unsafe` to `ExclusionReason` in `ESH/lib/driver-eligibility.ts`, plus candidate field `vehicleCheck`; load it in the planner and dispatch candidate SQL (`FLT/planner/sql.ts`, `FLT/dispatch/sql.ts`); ~~add both to `BLOCKED_REASONS`~~ (deferred: shown on Exceptions and as unassigned reasons) and the reason words in shared-types
- [X] T042 [US6] Driver vehicle check: add `DRV/vehicle/{repository,service}.ts` (submit idempotent on change_id and unique per day; returns state) and `DRV/functions/driver-vehicle-check-v1-post.ts` + `serverless.yml`; add `vehicleCheck` to `/me` (`DRV/driver/service.ts`)
- [X] T043 [US6] Fleet clear: add `FLT/vehicles/check.ts` (clear with note, audit, announce `work` + `dispatch`) and `FLT/functions/fleet-vehicle-check-clear-v1-post.ts` + `serverless.yml`; add today's checks to the exceptions read
- [X] T044 [US6] Driver app: add `DM/features/vehiclecheck/{domain,data,presentation}` (six items: OK / Minor / Unsafe + note); shown after Go on duty when `me.vehicleCheck.state == "due"`; an unsafe result shows "Dispatch has been told - you'll get work once it's cleared"
- [X] T045 [US6] Back-office: add a "Vehicle checks" table on Exceptions with Clear (note) in `BO/exceptions/*`
- [X] T046 [US6] Tests: unit-test eligibility for both reasons (`ESH/lib/driver-eligibility.test.ts`); add a vehicle check submit/clear container test in `DRV/vehicle/vehicle.container.test.ts`

## Phase 9: Polish

- [X] T047 Run every suite: shared-types, edge-shared, driver, fleet, back-office tests + typecheck; the driver app host tests + Android build; `scripts/driver-guard.sh`; `pnpm --filter @effy/shared-types driver-contract:check`; the gateway capacity test
- [X] T048 Docs: a FEATURE-HISTORY.md entry for 093 (operator steps, deploy order); a CLAUDE.md feature line; mark S1–S9 / A / B items in `docs/research/logistics/research-07-driver-task-sequencing.md` as built

## Dependencies

- T001–T006 come before everything else.
- US1 (T007–T021) is the MVP. US2 and US3 are independent of US1 apart from the foundation.
- US4 depends on US1's load and check-in paths (same functions).
- US5 depends on T005 and on US4's holds (for the Exceptions screen).
- US6 depends only on the foundation.

## Parallel opportunities

- T002–T005 in parallel.
- Within US1, the backend (T007–T016) and the app data layer (T017) in parallel.
- US2's backend (T022) and US3's planner (T025–T027) in parallel with each other.
- The back-office tasks (T021, T035, T039, T045) in parallel with the driver app tasks.

## Implementation strategy

MVP = Phases 1–3 (the gates). Then US2 + US3 (P1) as one increment, US4 + US5, and US6 last.

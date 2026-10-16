# Tasks: Return Failed Parcels to the Hub

**Input**: Design documents from `specs/088-failed-parcel-return/`
**Prerequisites**: plan.md, spec.md, research.md (R1–R10), data-model.md, contracts/, quickstart.md (P1–P12)

**Tests**: included — every behaviour in quickstart.md P1–P12 is pinned by a test, as on every slice of
this platform. Container tests need Docker and `CONTAINER_TESTS=1`.

**Paths**: `EA` = `apis/edge-api`, `DM` = `apps/driver-mobile/shared/src/commonMain/kotlin/com/effyshopping/driver/mobile`.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Write migration `db/migrations/20261016140000_parcel_return.sql`: widen `round_package_state_check` with `'returned'`; create `public.parcel_return` (id, round_id → driver_round, driver_id → driver, recorded_by CHECK IN ('driver','staff'), recorded_by_sub, package_count CHECK > 0, returned_at DEFAULT now(), change_id UNIQUE); add `round_package.return_id uuid NULL → parcel_return`; Down refuses if any row is `returned` (data-model.md)
- [X] T002 [P] Add `ParcelReturnRequest`, `ParcelReturnResponse`, `ParcelsToReturn` and optional `toReturn` on `TodayDTO` and `DeliveryRunDTO` in `packages/shared-types/src/driver.ts`; regenerate `packages/shared-types/contract-driver/DriverDto.kt` (`node packages/shared-types/scripts/gen-kotlin-driver-contract.mjs`) so `toReturn` defaults to null (contracts/driver-return.md)
- [X] T003 [P] Add `roundId`, `returnedAt` to `DeliveryExceptionDTO`, `failedParcels` to `DispatchDayDTO`, `toReturn` to `CustodyPackageDTO`, and `ParcelReturnRequest/Response` reuse for the staff route in `packages/shared-types/src/dispatch.ts` (contracts/fleet-return.md)

---

## Phase 2: Foundational (blocks every story)

- [X] T004 Create `EA/shared/src/delivery/parcel-return.ts`: export SQL fragments `TO_RETURN_PACKAGES` (delivery `round_package` `assigned` on a `skipped` stop, no `package_arrival`) and `IN_TRANSIT_PACKAGES`, and `recordParcelReturn(tx, { roundId, driverId?, recordedBy, recordedBySub, changeId })` — replay by `change_id` answers the first result; locks the round; sets `state='returned', settled_at, return_id`; inserts one `parcel_return` when n > 0; then runs the delivery completion rule (T005); returns `{ returned, roundComplete }`; export from `EA/shared/src/delivery/index.ts` (research R1, R5)
- [X] T005 Move the delivery round completion rule into `EA/shared/src/delivery/parcel-return.ts` as `completeDeliveryRoundIfFinished(tx, roundId)` (no open stop AND nothing to return) and make `EA/driver/src/proof/repository.ts` + `EA/driver/src/proof/sql.ts` call it instead of A1's `COMPLETE_ROUND_IF_FINISHED` (research R3)
- [X] T006 Rewrite `CUSTODY_BY_DRIVER` in `EA/shared/src/lib/custody.ts` to add the delivery half (in transit or to return, via T004's fragments) and a `to_return` column; keep the collection half unchanged (research R2)
- [X] T007 [P] Write `EA/shared/src/delivery/parcel-return.container.test.ts`: P2 (idempotent; second action returns 0), P3 (failed drop later proven is not to return), completion only after the return, custody lists in-transit + to-return but not staged (quickstart P2–P4)

**Checkpoint**: one writer, one custody definition, one completion rule.

---

## Phase 3: User Story 1 — The driver brings failed parcels back (P1) 🎯 MVP

**Goal**: a failed parcel stays on the driver's work as "to return"; one action returns them; the round finishes then.
**Independent test**: fail one drop of two, deliver the other → Today shows "Return to hub · 1"; return → round in History (quickstart walk 1–4).

### Backend

- [X] T008 [US1] Add `toReturn` to the run read in `EA/driver/src/work/delivery.ts` (count + order numbers for the run, from `TO_RETURN_PACKAGES`) (contracts/driver-return.md)
- [X] T009 [US1] Add `toReturn` for the current round to Today in `EA/driver/src/work/service.ts`; keep `active` null when only the return is left on that round (research R4)
- [X] T010 [US1] Create `EA/driver/src/functions/driver-delivery-return-v1-post.ts` (auth via `authenticate`, 404 for not-yours, 409 `round_not_open` via `assertRoundOpen`, `recordParcelReturn` with `recordedBy='driver'`, EMF `ParcelsReturned`, then announce DISPATCH + ops/orders + shops via a new `announceReturned(roundId)` in `EA/driver/src/work/announce.ts`) and route `POST /driver/v1/delivery/runs/{runId}/return` in `EA/driver/serverless.yml`
- [X] T011 [US1] Update `EA/driver/src/proof/completion.container.test.ts`: a failure on the last drop leaves the round `in_progress` with 1 to return; the return completes it and it appears in History (quickstart P1)
- [X] T012 [P] [US1] Add a driver container test `EA/driver/src/work/to-return.container.test.ts`: Today and the run carry `toReturn`; `active` null when only the return is left; route idempotent on `changeId` (quickstart P10)
- [X] T013 [P] [US1] Confirm `EA/driver/src/driver/service.test.ts` covers go-off-duty refusal while a delivery parcel is to return (`HoldingPackagesError`, research R9)

### Driver app

- [X] T014 [US1] Map `toReturn` into the domain: `ParcelsToReturn` on `Today` (`DM/features/today/domain/Today.kt`, `DM/features/today/data/HttpTodayRepository.kt`) and `DeliveryRun` (`DM/features/delivery/domain/Delivery.kt`, `DM/features/delivery/data/HttpDeliveryRepository.kt`)
- [X] T015 [US1] Add `returnToHub(runId, changeId): WriteOutcome` to `DeliveryRepository` + use case `ReturnToHub`, implemented in `HttpDeliveryRepository` through `offline.withReplay` (label "Return parcels to the hub"), wired in `DM/app/AppContainer.kt`
- [X] T016 [US1] Add `returnToHub()` to `DM/features/delivery/presentation/DeliveryViewModel.kt` (one `ActionIds` key per run; QUEUED clears `toReturn` locally) and expose the same action to Today in `DM/features/today/presentation/TodayViewModel.kt`
- [X] T017 [US1] Draw the "Return to hub" hero (count, order numbers, one `SwipeToConfirm`) in `DM/features/today/presentation/CurrentWorkCard.kt` when `today.toReturn != null && today.active == null`, and the same block at the foot of the run in `DM/features/delivery/presentation/DeliveryScreens.kt`; wire both in `DM/app/DriverShell.kt`
- [X] T018 [US1] Name the to-return count in the sign-out / off-duty confirmation in `DM/features/account/AccountScreen.kt` and the duty toggle path (FR-007)
- [X] T019 [P] [US1] Host tests: `DM`-side `DeliveryViewModelTest` / `TodayViewModelTest` (return sent and queued; one changeId on retry) and a decode test of a Today fixture with and without `toReturn` in `apps/driver-mobile/shared/src/commonTest/.../features/today/` (quickstart P10–P11)

**Checkpoint**: MVP — every failed parcel has an owner and a way back.

---

## Phase 4: User Story 2 — Dispatch sees where failed parcels are (P1)

**Goal**: back-office can tell "with [driver], to return" from "returned to the hub".
**Independent test**: fail a drop → Exceptions "With driver", dispatch counts 1 with drivers; return → "At hub" (quickstart walk 3, 5).

- [X] T020 [US2] Add the `returned` fact to `EA/shared/src/status/sql.ts` (`PACKAGE_STATUS_FACTS`: latest delivery row state) and `EA/shared/src/status/status.ts` (`packageStatus`: failed+returned+unresolved → `at_hub` "Returned after a failed delivery — needs a next step"; failed+not returned → `problem` as today) (research R7)
- [X] T021 [P] [US2] Table rows for P5 in `EA/shared/src/status/status.test.ts`
- [X] T022 [US2] Derive `package_location` in `EA/fleet/src/exceptions/sql.ts` from T004's fragments (fixes the `picked_up` defect); add `round_id`, `returned_at`; map in `EA/fleet/src/exceptions/service.ts`
- [X] T023 [P] [US2] Extend `EA/fleet/src/exceptions/exceptions.container.test.ts`: `with_driver` before the return, `at_hub` after (quickstart P9)
- [X] T024 [US2] Add `failedParcels { withDrivers, returnedAwaitingDecision }` to the day read in `EA/fleet/src/dispatch/service.ts` / `EA/fleet/src/dispatch/sql.ts`; include `toReturn` in `EA/fleet/src/dispatch/custody.ts` rows
- [X] T025 [US2] Back-office: show "With {driver} — to return" / "Returned {time}" in `apps/back-office/src/features/exceptions/ExceptionsScreen.tsx`; show the two counts in the header of `apps/back-office/src/features/dispatch/DispatchDayScreen.tsx` (text, no cards); component tests beside each

---

## Phase 5: User Story 3 — A returned parcel gets a next step (P2)

**Goal**: returned parcels are held for staff; staff delivery tools release them; nothing moves a parcel still in a van.
**Independent test**: returned parcel is not planned; after "choose a new window" it is (quickstart walk 5).

- [X] T026 [US3] Hold in `EA/fleet/src/planner/sql.ts` `GATHER_DELIVERY`: exclude a package whose latest delivery row is `returned` with an unresolved failure on its stop (research R6)
- [X] T027 [US3] In `EA/shared/src/delivery/override.ts`: new refusal `with_driver_after_failure` (checked before `out_for_delivery`) when a package is to return; `changeEffyWindow`, `moveToEffy`, `moveToCourier` set `resolved_at = now()` on the order's open failures in their transaction (research R6)
- [X] T028 [US3] Refuse `reassign` / `unassign` of a round with parcels to return in `EA/fleet/src/dispatch/service.ts` (`DispatchError("parcels_to_return")` → 409 in the handlers) (research R10)
- [X] T029 [P] [US3] Tests: gather hold + release in `EA/fleet/src/planner/planner.container.test.ts` (P6); refusal words + resolve in `EA/shared/src/delivery/override.container.test.ts` (P7); dispatch refusal (P8) in the planner container test

---

## Phase 6: User Story 4 — Staff record a return on a driver's behalf (P3)

**Goal**: a parcel handed in without the app can be returned from back-office, attributed to the staff member.
**Independent test**: quickstart walk 6.

- [X] T030 [US4] Create `EA/fleet/src/functions/dispatch-return-v1-post.ts` (`recordParcelReturn` with `recordedBy='staff'`, audit `dispatch.parcels_returned` — add the action to `EA/fleet/src/shared/audit.ts`; announce DISPATCH, ops/orders, shops and `driver/work` via `EA/fleet/src/lib/live.ts`) and route `POST /fleet/v1/dispatch/rounds/{roundId}/return` in `EA/fleet/serverless.yml`
- [X] T031 [US4] Back-office "Record return" action on `with_driver` rows in `apps/back-office/src/features/exceptions/ExceptionsScreen.tsx` (+ `repo.ts`, `queries.ts`, `access.ts` — any active staff), with a confirm naming the driver and count
- [X] T032 [P] [US4] Container test: staff return attributed, driver's `toReturn` cleared, idempotent (fleet)

---

## Phase 7: Polish & cross-cutting

- [X] T033 Add both routes to `EA/shared/src/live/change-map.guard.test.ts`; run `EA/shared/src/lib/gateway-capacity.contract.test.ts` (shared +1, staff +1)
- [X] T034 [P] Run `pnpm --filter @effy/shared-types driver-contract:check`, `scripts/check-driver-delivery-words.sh`, `scripts/check-no-refresh-timers.sh`
- [X] T035 Run the full suites in quickstart.md (shared, driver, fleet with containers; back-office; driver-mobile host tests + `assembleDebug` + iOS compile)
- [X] T036 Record 088 in `FEATURE-HISTORY.md` and the features list in `CLAUDE.md` (deploy order: migration → fleet + driver → back-office → app); mark A4 done in `docs/driver-app-backlog.md`

---

## Dependencies & order

- Setup (T001–T003) → Foundational (T004–T007) → stories.
- **US1** needs only Foundational. **US2** needs Foundational (T020–T025 independent of US1's app work).
  **US3** needs US1's return (a parcel must be `returned` to be held). **US4** needs T004 only.
- Within US1: T008–T010 before T014–T017 (the app reads the new fields); T011–T013 alongside.

## Parallel opportunities

- T002 ∥ T003; T007 ∥ T005–T006 once T004 exists.
- After Foundational: US1 backend (T008–T013) ∥ US2 (T020–T025) ∥ US4 backend (T030, T032).
- Tests marked [P] run beside their story's implementation.

## Implementation strategy

1. **MVP** = Setup + Foundational + US1: failed parcels are tracked and returned; the round ends right.
2. Add US2 (visibility, and the two `picked_up` defect fixes) — deployable with US1.
3. Add US3 (the hold) and US4 (staff return) — then walk the quickstart end to end.

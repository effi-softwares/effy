# Tasks: Immediate Driver Work Assignment

**Input**: Design documents from `specs/072-immediate-driver-assignment/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/routes.md](contracts/routes.md),
[quickstart.md](quickstart.md)

**Tests**: each implementation task carries its own tests, per the plan's Testing section and the
repository's convention (unit beside the source; `*.guard.test.ts`; `*.container.test.ts` against the
real migrations). A task is not done until its tests pass. `C1`–`C16` are the container proofs listed
in [quickstart.md](quickstart.md); each is proven by breaking the code it covers, once.

**Conventions**: `[P]` = different files, no dependency on an unfinished task. **OPERATOR** = run by
the operator, never by Claude; all AWS commands use `AWS_PROFILE=ef`. `KT` =
`apps/driver-mobile/shared/src/commonMain/kotlin/com/effyshopping/driver/mobile/features`.
"Opening time" always means `public.round_opens_at(kind, deadline_at, window_start_at)` — no task may
compute it another way.

**Order**: phases follow the spec's priorities. Nothing is deployed until Phase 7, where the operator
deploys `driver` **before** `fleet` (research R13) — so building US1 before US2 is safe.

## Phase 1: Setup

- [X] T001 Scaffold the migration with `make db-new name=immediate_driver_assignment` and write `db/migrations/<ts>_immediate_driver_assignment.sql` exactly per [data-model.md](data-model.md): `driver_round.window_start_at`; `driver_round_bucket_idx`; the `STABLE` function `public.round_opens_at(text, timestamptz, timestamptz)`; `assignment_exclusion` gains `kind` and `updated_at`, `wave_id` becomes nullable, existing rows deleted, partial unique index `NULLS NOT DISTINCT WHERE kind IS NOT NULL`; updated `COMMENT`s on `dispatch_wave`, `assignment_exclusion` and `delivery_settings.planning_lead_min`; the Down block as specified. Do not run it
- [X] T002 [P] Mark what this feature replaces: add a "Superseded by 072" note at FR-001/FR-002 in `specs/063-driver-work-assignment/spec.md`, and at the wait-at-hub-until-the-window rule (research R10) in `specs/069-delivery-slots-dates/research.md` and `spec.md`

---

## Phase 2: Foundational (blocks every story)

- [X] T003 [P] Add optional `startAt?: Date` to `EligibilityInput` in `apis/edge-api/shared/src/lib/driver-eligibility.ts`; the finish estimate becomes `(startAt ?? now) + stops × allowance`, compared to the deadline and the stated shift end as today; licence expiry stays judged at `now`. Extend `driver-eligibility.test.ts`: default is unchanged, a future `startAt` shortens what fits, a shift ending before `startAt` yields `cannot_meet_deadline`
- [X] T004 [P] Add `nextRunInstant(runs, now): Date | null` to `apis/edge-api/shared/src/lib/collection-deadline.ts` — the earliest active run instant strictly after `now` across today and tomorrow, built from `instantAtLocalTime`. Export it from the package index. Unit tests: before the first run, between runs, after the last (tomorrow's first), no runs (`null`), and both DST transition days using the existing fixtures
- [X] T005 Extend the container-test fixtures in `apis/edge-api/fleet/src/planner/planner.container.test.ts` and `apis/edge-api/driver/src/work/` helpers so a test can set the clock-relative run time, `planning_lead_min`, a delivery window, and a driver's duty state; confirm the suite loads the new migration from `db/migrations` (depends on T001)
- [X] T006 [P] Wire types per [contracts/routes.md](contracts/routes.md): in `packages/shared-types/src/driver.ts` add `UpcomingRound`, `TodayDTO.{opensAt,deadlineAt,upcoming}`, `opensAt`/`deadlineAt` on `DriverCollectionRunDTO` and `DeliveryRunDTO`, and `RoundNotOpenResponse`; in `packages/shared-types/src/dispatch.ts` add `RoundDTO.opensAt`, `UnassignedWorkDTO.{stage,targetAt}`. Run `pnpm --filter @effy/shared-types driver-contract:gen` and commit `contract-driver/`; `driver-contract:check` must pass

**Checkpoint**: `pnpm -r typecheck` green; nothing behaves differently.

---

## Phase 3: User Story 1 — Work is given to a driver as soon as a driver can take it (P1) 🎯 MVP

**Goal**: every pass assigns every package a driver can take, however far off its run or window.

**Independent test**: with a run hours away, a cleared on-duty driver and a package marked ready, one
pass assigns it (C1); same for a hub-side package hours before its window (C2).

- [X] T007 [US1] Put the whole pass on one transaction: change `gatherCollectionWork`, `gatherDeliveryWork`, `loadCandidates`, `loadSchedule`, `findOpenStopForShop` and `commitWave` in `apis/edge-api/fleet/src/planner/repository.ts` to take a `tx`, and add `tryPassLock(tx)` using `pg_try_advisory_xact_lock` with a fixed key. No behaviour change yet; existing tests stay green
- [X] T008 [US1] Create `apis/edge-api/fleet/src/planner/release.ts` (research R10): `releaseUnworkable(tx)` — for drivers with no open duty session or `status <> 'active'`, on rounds with `locked_by_sub IS NULL`: `planned` → delete `assigned` `round_package` rows and set `cancelled`; `in_progress` collection → delete `assigned` rows at stops not `done`/`skipped`; `in_progress` delivery → nothing. Also cancel a `planned`, unlocked collection round whose `deadline_at` is not an active run instant for its local date. Write a `driver.work_released` audit row per round through `fleet/src/shared/audit.ts`. Returns the affected driver ids. Container proofs **C10**, **C11** (release half) and **C12** in `release.container.test.ts`
- [X] T009 [US1] Rewrite `apis/edge-api/fleet/src/planner/service.ts` as `runPass(now)`: open a transaction, `tryPassLock` (return a `skipped: "pass_in_progress"` outcome if not taken), `releaseUnworkable`, then collection, then delivery, commit. Collection: `deadlineAt = nextRunInstant(runs, now)`; no active run → plan nothing, as today. Delete `runDuePlanning`'s due-gating, the `no_run_due` and `window_not_due` outcomes. Keep the exported name the handler imports or update `functions/plan-waves-scheduled.ts` in the same task
- [X] T010 [US1] In `apis/edge-api/fleet/src/planner/assign.ts` add `opensAt: Date | null` to `AssignInput` and pass `startAt = max(now, opensAt)` to both `eligibilityReasons` calls. Collection `opensAt = deadlineAt − planningLeadMin`; delivery `opensAt = windowStart − planningLeadMin`, `null` when the group has no window. Unit tests in `assign.test.ts`: a round planned five hours early is allowed no more stops than one planned at opening; a driver whose shift ends before opening is excluded
- [X] T011 [US1] Delivery per window without waiting: in `service.ts` plan every group from `groupByWindow` on every pass; delete `isDue` and `plannedAt` from `apis/edge-api/fleet/src/planner/windows.ts` and their tests in `windows.test.ts`; keep `deadlineFor`. `commitWave` writes `window_start_at` on a delivery round (null for a windowless group or when `deadlineFor` fell back to end of day)
- [X] T012 [US1] Remove what nothing calls now: `runsDueForPlanning`, `nextPlanningTime`, `wavePlanningTime` from `apis/edge-api/shared/src/lib/collection-deadline.ts`, its index exports, and their unit tests; update the cross-language contract test only if it references them. `pnpm -r typecheck` proves nothing else used them
- [X] T013 [US1] Container proofs in `apis/edge-api/fleet/src/planner/planner.container.test.ts`: **C1**, **C2**, **C5** (a second driver coming on duty takes nothing already assigned), **C6** (after the last run, the deadline is tomorrow's run instant), **C16** (two passes started together — one skips, no package in two rounds). Update or delete existing tests that asserted "not planned before the window"

**Checkpoint**: the engine assigns immediately. Each pass still creates a new round (fixed in US3).

---

## Phase 4: User Story 2 — A driver sees their work early and cannot start it early (P2)

**Goal**: an assigned round is fully readable at once; every action on it is refused until it opens,
and the app unlocks by itself.

**Independent test**: with a round whose opening time is ahead, every progressing route answers 409
`round_not_open` and writes nothing (C7); after opening the same calls succeed (C8).

### Backend

- [X] T014 [US2] Create `apis/edge-api/driver/src/work/open.ts`: `RoundNotOpenError { opensAt: string }` and `assertRoundOpen(tx, roundId)` — one query selecting `public.round_opens_at(kind, deadline_at, window_start_at)` and comparing it to the database's `now()`; throws when the result is a future instant. Unit test with a mocked `tx` in `open.test.ts`
- [X] T015 [US2] Call `assertRoundOpen` inside the existing transaction, after the ownership check and after the already-done idempotent return, in `collectStop`, `hubCheckin`, `reportIssue` (`apis/edge-api/driver/src/work/complete.ts`), `setDropStatus` (`work/delivery.ts`), and `presignProof`, `submitProof`, `submitFailure` (`proof/service.ts` / `proof/repository.ts`)
- [X] T016 [US2] Map `RoundNotOpenError` to `409 { "error": "round_not_open", "opensAt" }` in the seven handlers: `driver-collect-v1-post.ts`, `driver-collect-issue-v1-post.ts`, `driver-hub-checkin-v1-post.ts`, `driver-drop-status-v1-post.ts`, `driver-drop-proof-presign-v1-post.ts`, `driver-drop-proof-v1-post.ts`, `driver-drop-fail-v1-post.ts` under `apis/edge-api/driver/src/functions/`
- [X] T017 [US2] Guard test `apis/edge-api/driver/src/work/open.guard.test.ts`: read every `POST`/`DELETE` route from `apis/edge-api/driver/serverless.yml`, subtract an explicit allow-list (`duty`, `devices`, `activity/read`) with a reason each, and fail naming any remaining route whose service function does not reference `assertRoundOpen`. Prove it by removing one call
- [X] T018 [US2] Multi-round reads in `apis/edge-api/driver/src/work/sql.ts`, `repository.ts`, `service.ts`: replace `CURRENT_ROUND` with a query returning all the driver's `planned`/`in_progress` rounds with `opens_at`, ordered in-progress first, then open by `deadline_at`, then unopened by `opens_at`; `today()` uses the first as current and maps the rest to `upcoming` (stop and package counts in the same query, hub stop excluded from the stop count); add `opensAt`/`deadlineAt` to `today`, `collectionRun` and `deliveryRun`. Unit tests in `service.test.ts` for the selection rule
- [X] T019 [US2] Container proofs in `apis/edge-api/driver/src/work/open.container.test.ts`: **C7** (all seven routes, nothing written), **C8**, **C9** (changing `planning_lead_min` moves an existing round's opening), **C15** (open round is current when an unopened one exists); plus a windowless delivery round is open at once (spec US2 scenario 5)

### Driver app

- [X] T020 [P] [US2] Domain and mapping: add `opensAt` / `deadlineAt` / `upcoming` to `KT/today/domain/Today.kt` and `KT/today/data/HttpTodayRepository.kt`; `opensAt` / `deadlineAt` to `KT/collection/domain/Collection.kt` + `data/HttpCollectionRepository.kt` and `KT/delivery/domain/Delivery.kt` + `data/HttpDeliveryRepository.kt`; map a 409 `round_not_open` body to a typed `RoundNotOpen(opensAt)` failure in the three repositories. An absent `opensAt` is treated as open
- [X] T021 [US2] One shared lock presentation in `KT/today/presentation/OpensLine.kt`: `rememberIsOpen(opensAt)` — a `produceState` clock re-judging every 30 s exactly as `KT/delivery/presentation/WindowLine.kt` does, reading nothing — and `OpensLine(opensAt)` saying "Opens h:mm" (with the day when it is not today), in words with a mark, never colour alone, formatted in the operating zone with the helper `DeliveryWindow.kt` already uses. `commonTest` for the label and the open/closed judgement around the boundary
- [X] T022 [US2] Today screen: in `KT/today/presentation/TodayViewModel.kt`, `TodayScreen.kt`, `CurrentWorkCard.kt`, `UpNextList.kt` show the current round with `OpensLine` and its primary action disabled while closed; add an "Upcoming" list (rows, not cards) of the other rounds, each opening its read-only run screen. No `delay` loop that re-reads; the ViewModel still refreshes only from `LiveClient.changes(…)`
- [X] T023 [P] [US2] Collection screens: in `KT/collection/presentation/CollectionViewModel.kt`, `CollectionScreens.kt`, `ShopProblemScreen.kt` (and the hub check-in screen in the same package) disable collect, report-issue and check-in while `rememberIsOpen` is false, show `OpensLine`, and on a `RoundNotOpen` failure show the opening time rather than a generic error
- [X] T024 [P] [US2] Delivery screens: the same in `KT/delivery/presentation/DeliveryViewModel.kt`, `DeliveryScreens.kt`, `EnRouteScreen.kt`, `ArrivedScreen.kt`, `ProofScreens.kt` for start, on-my-way, arrived, proof and fail
- [X] T025 [US2] Run `scripts/check-no-refresh-timers.sh`, `:shared:testAndroidHostTest` and an iOS simulator test compile for `apps/driver-mobile`; add `OpensLine.kt` to the allowed-clock list in the script's header comment

**Checkpoint**: a round assigned hours ahead is visible and inert, and opens on its own.

---

## Phase 5: User Story 3 — One round per run, not a new one every few minutes (P3)

**Goal**: packages for one run or window accumulate in one not-yet-begun round per driver.

**Independent test**: three shops readying packages at three times before one run leave the driver
with a single round holding all of them (C3).

- [X] T026 [US3] Add `OPEN_PLANNED_ROUNDS` to `apis/edge-api/fleet/src/planner/sql.ts` and `loadPlannedRounds(tx)` to `repository.ts`: every `planned`, unlocked round with its bucket (`driver_id, kind, deadline_at, window_start_at`), its stops (shop id or order id) and its total weight in grams (same weight expression as the gather queries)
- [X] T027 [US3] Seed the planner in `apis/edge-api/fleet/src/planner/assign.ts`: `AssignInput` gains `existing: Map<driverId, { roundId, weightGrams, stopKeys }>` for this bucket; `Running` starts from it so `over_capacity` and the stop count cover the whole round; `WavePlan.assignments` records the target `roundId` (or none). Unit tests in `assign.test.ts`: a fourth stop is refused although only one package is new; weight accumulates across passes
- [X] T028 [US3] Find-or-create in `commitWave` (`repository.ts`): when the plan names an existing round, add each package to that round's stop for its shop/order, creating the stop if absent (keeping the hub stop last for a collection round); otherwise create the round as today. Never touch a round with `locked_by_sub`. Write `changed_note` only when the round is `in_progress` (the existing late-join path), never for a `planned` round
- [X] T029 [US3] Insert a `dispatch_wave` row only when a pass assigned or released at least one package (`service.ts` / `repository.ts`); `planned_for` is the pass instant; a round created in the pass references it
- [X] T030 [US3] Container proofs in `planner.container.test.ts`: **C3**, **C4**, **C11** (a locked round is not added to; the package goes to a new round or another driver); a round already `in_progress` gains a package only at an outstanding stop for the same shop and its `changed_note` is set; a delivery round in progress gains nothing

**Checkpoint**: US1 + US3 together are the engine's final behaviour.

---

## Phase 6: User Story 4 — Back-office sees the day take shape (P4)

**Goal**: rounds show whether and when they open; each unassignable package appears once with its
current reason; overrides hold on unopened rounds.

**Independent test**: an hour of passes over one unassignable package leaves one entry with its
current reason (C13).

- [X] T031 [US4] Standing reasons in `apis/edge-api/fleet/src/planner/repository.ts`: `replaceExclusions(tx, kind, exclusions)` — read the stored set for the kind, and only if it differs delete and insert (with `kind`, no `wave_id`); remove the per-wave insert from `commitWave`. Returns whether anything changed. Container proof **C13** (ten passes: one set of rows, unchanged `updated_at`, no wave rows)
- [X] T032 [US4] Dispatch reads in `apis/edge-api/fleet/src/dispatch/sql.ts` and `service.ts`: `DAY_ROUNDS` returns every unfinished round plus rounds finished today, with `round_opens_at(...) AS opens_at`; `UNASSIGNED_WORK` drops the latest-wave CTE, joins `assignment_exclusion` on `kind`, adds hub-side same-day packages with no open assignment, and returns `stage` and `targetAt`; `ROUND_FOR_UPDATE`/`readRound` return `opensAt` and `deadlineAt`. Replace `unassigned-wave-scope.guard.test.ts` with a guard that the query joins on `kind`
- [X] T033 [US4] Real reassign check in `apis/edge-api/fleet/src/dispatch/service.ts` (research R11): build the `WorkUnit` from the round — its actual `deadline_at`, `startAt = max(now, opens_at)`, refrigeration from its packages' `storage` attribute, `per_stop_allowance_min` from settings — and evaluate `eligibilityReasons` once per distinct zone on the round, collecting every reason. Container proof **C14**, plus: reassign, unassign, reorder and lock all succeed on an unopened round
- [X] T034 [US4] Announce only on change in `apis/edge-api/fleet/src/functions/plan-waves-scheduled.ts`: call `announceDispatch(driverIds)` only when the pass assigned, released or changed reasons, with the drivers from the release step and from rounds created or added to
- [X] T035 [P] [US4] Back-office model and data in `apps/back-office/src/features/dispatch/model.ts`, `repo.ts`, `queries.ts`: carry `opensAt`, `stage`, `targetAt`; a pure `roundOpenState(round, now)` returning `open | opens at …`; tests in `model.test.ts`
- [X] T036 [US4] Back-office screens: `components/RoundTable.tsx` and `RoundDetailScreen.tsx` show "Open" or "Opens h:mm" (day included when not today) as text in an existing column; `components/UnassignedPanel.tsx` shows the stage and what the package is waiting for; `DispatchDayScreen.tsx` labels the passes list as passes that changed something. No card, no new colour token, no `refetchInterval`. Update `UnassignedPanel.test.tsx`

---

## Phase 7: Polish, observability and release

- [X] T037 Metrics and logging in `apis/edge-api/fleet/src/functions/plan-waves-scheduled.ts`: one `dispatch.pass` line per pass (assigned, released, unassigned by kind, skipped reason); emit `DispatchPackagesAssigned`, `DispatchPackagesUnassigned` and new `DispatchUnassignedPastOpening` (unassigned packages whose target round's opening time has passed, counted in the pass); stop emitting `DispatchWaveAssignedNothing`. Update `plan-waves-scheduled.test.ts`
- [X] T038 [P] Terraform `infra/envs/dev/dispatch.tf`: replace the `DispatchWaveAssignedNothing` alarm with one on `DispatchUnassignedPastOpening` > 0 for three consecutive 5-minute periods, to the existing alerts topic; keep the held-hours alarm. `terraform validate` and `fmt` only
- [X] T039 [P] Update the scheduled function's description and comments in `apis/edge-api/fleet/serverless.yml` (it no longer waits for `run_time − lead`); no schedule change
- [X] T040 Run every machine check in [quickstart.md](quickstart.md) and record the counts; for each of C1–C16 record the one-line break that made it fail
- [X] T041 Documents: add the 072 entry at the top of `FEATURE-HISTORY.md` and to the list in `CLAUDE.md`; rewrite the hub-and-spoke paragraph in `CLAUDE.md` where it says the delivery wave is planned per window and collection runs gate planning; add §072 to `docs/audiences/driver-capabilities.md`; correct 063's entry where it claims FR-035 was built
- [X] T042 Write `specs/072-immediate-driver-assignment/SIGNOFF.md`: what was verified by machine, what was not looked at by a person, and the operator steps below in order
- [X] T043 **OPERATOR** `make db-up ENV=dev`
- [X] T044 **OPERATOR** `make edge-deploy SERVICE=driver ENV=dev` — ⚠ before `fleet`
- [X] T045 **OPERATOR** build and install the driver app
- [X] T046 **OPERATOR** `make edge-deploy SERVICE=fleet ENV=dev`
- [X] T047 **OPERATOR** `make apply ENV=dev` (the alarm), and let the back-office pipeline deploy
- [ ] T048 **OPERATOR** walks W1–W9 in [quickstart.md](quickstart.md); W7 first

---

**Built differently from the task text (2026-10-07), and why:**
- **T006 / T020** — the driver contract carries `opening: { at, label } | null` and `dueLabel`, not a
  bare `opensAt`. The app never formats a time (no timezone database — `DeliveryWindow.kt`), so the
  server sends the moment in words too. The 409 carries `opensAt` and `opensLabel` as problem field
  issues rather than a new body type, the carrier the off-duty refusal already uses.
- **T021** — `OpensLine` / `rememberIsOpen` live in `core/presentation/`, not `features/today/`: three
  features use them.
- **T026–T028** — the planner loads every unlocked round for the run or window (not only `planned`),
  because the in-progress late-join rule (063 FR-004a) now goes through the same path; the old
  `findOpenStopForShop` / `openStops` input is gone.
- **Found while building, fixed in scope**: the gather multiplied weight by attribute count; a
  delivered package re-entered the delivery gather; `nextRunInstant`'s first draft skipped a day across
  DST. Each has a container or unit proof that was broken once.

## Dependencies

```text
Phase 1 (T001–T002) → Phase 2 (T003–T006) → US1 (T007–T013)
                                          → US2 backend (T014–T019) → US2 app (T020–T025)
US1 → US3 (T026–T030) → US4 (T031–T036) → Phase 7
```

- **US1** needs T001, T003, T004, T005.
- **US2** needs T001, T005, T006. It does not need US1: its tests create rounds directly. US1 and US2
  can be built in parallel.
- **US3** needs US1 (it changes the pass US1 rewrote).
- **US4** needs US3 (T029's wave rows) and T006.
- T015 → T016 → T017 are sequential (same call chain). T009 → T010 → T011 touch `service.ts`/`assign.ts` in turn.

## Parallel opportunities

- Phase 2: T003, T004, T006 together.
- After Phase 2: the US1 track (T007 onward) alongside the US2 backend track (T014 onward).
- US2 app: T020 first, then T023 and T024 together once T021 exists.
- US4: T035 alongside T031–T034.
- Phase 7: T038 and T039 alongside T037.

## Implementation strategy

- **MVP = US1 + US2.** US1 alone must not be deployed: it hands drivers work they could act on hours
  early. The smallest releasable set is the engine with the lock.
- **Then US3** before any real use — without it a driver collects a new round every five minutes.
- **Then US4**, which makes the result legible to a dispatcher and closes the reassign gap.
- Each container proof is written with its task and broken once to show it can fail. A proof that
  cannot be made to fail is reported, not ticked.

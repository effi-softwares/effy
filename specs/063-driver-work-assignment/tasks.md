---
description: "Task list for 063 — Driver Work Assignment & Wave Planning"
---

# Tasks: Driver Work Assignment & Wave Planning

**Input**: Design documents from `/specs/063-driver-work-assignment/`

**Prerequisites**: [plan.md](./plan.md) · [spec.md](./spec.md) · [research.md](./research.md) · [data-model.md](./data-model.md) · [contracts/routes.md](./contracts/routes.md) · [quickstart.md](./quickstart.md)

**Tests**: INCLUDED. The quickstart defines 18 container proofs (C1–C18) and 12 negative proofs
(NP1–NP12) as the acceptance evidence for this slice; they are tasks, not optional extras.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete work)
- **[Story]**: US1–US4, mapping to the spec's user stories
- Every task carries an exact file path

---

## Phase 1: Setup

**Purpose**: The scaffolding both backends and the console need before any domain code.

- [X] T001 [P] Create `apis/edge-api/fleet/src/dispatch/` and `apis/edge-api/fleet/src/planner/` directories
- [X] T002 [P] Create `apis/edge-api/driver/src/work/` directory
- [X] T003 [P] Create `apps/back-office/src/features/dispatch/components/` directory
- [X] T004 Add `@testcontainers/postgresql` to `apis/edge-api/fleet/package.json` devDependencies if absent, and run `pnpm install --filter @effy/edge-fleet`
- [X] T005 Verify the handler headroom recorded in research R4 is still true — count handlers in `apis/edge-api/fleet/serverless.yml` and `apis/edge-api/driver/serverless.yml` and record the numbers in this file. **VERIFIED 2026-09-21: fleet 23, driver 6, admin 72 — unchanged from R4; ample headroom, no new service needed.** ⚠ 053/054/056 each hit the CloudFormation 500-resource ceiling; the count is checked, never assumed

---

## Phase 2: Foundational (BLOCKING — no user story may start before this phase completes)

**Purpose**: The migration and the three shared rules. ⚠ The plan states these must land **before** any
user-story service code: a rule written first in `fleet` and copied into `driver` later is exactly the
divergence research R5 exists to prevent.

### The migration

- [X] T006 Create `db/migrations/<ts>_driver_work_assignment.sql` via `make db-new name=driver_work_assignment`
- [X] T007 Write `public.dispatch_wave` per [data-model.md](./data-model.md) — run, kind, planned_for, started/finished, trigger, triggered_by_sub, three counters
- [X] T008 Write `public.driver_round` — wave, driver, kind, status, deadline_at, `locked_by_sub`/`locked_at`, `created_at`/`updated_at`
- [X] T009 Write `public.round_stop` — round, seq, kind, shop_id, customer_address_id, zone_id, status, completed_at
- [X] T010 Write `public.round_package` — stop, shop_fulfillment_id, state
- [X] T011 ⚠ Write `CREATE UNIQUE INDEX round_package_open_uq ON public.round_package (shop_fulfillment_id) WHERE state = 'assigned'`. **This index IS FR-005**, not a safeguard around it — a service that SELECTs then INSERTs is not a guarantee (research R6, 039/052's check-then-write lesson)
- [X] T012 ⚠ Write a comment on T011's index stating why it is **partial**: a `picked_up` or `not_available` package MUST be re-assignable in a later wave, and a total index would forbid that forever (the asymmetry 052 needed for receipt resends)
- [X] T013 Write `public.hub_checkin` — round, driver, checked_in_at, packages_expected, packages_arrived, `UNIQUE (round_id)`
- [X] T014 Write `public.assignment_exclusion` — wave, shop_fulfillment_id, nullable driver, reason CHECK over the eight reasons in data-model.md
- [X] T015 ⚠ Add a table comment to `assignment_exclusion` recording that its reader ships in this same slice (FR-028). 056's finding was two tables written for a reader that never existed — **if the dispatcher view is cut, this table is cut with it**
- [X] T016 Add indexes: `driver_round (driver_id, status)`, `round_stop (round_id, seq)`, `round_package (stop_id)`, `assignment_exclusion (wave_id)`
- [X] T017 Verify the migration is purely additive — no `DROP`, no `ALTER … DROP COLUMN`, no data rewrite — and state that in the migration header

### Shared rules (Principle II — promoted before a second copy can exist)

- [X] T018 [P] Write `apis/edge-api/shared/src/lib/round-ordering.ts` — `orderRoundStops()` implementing D20's key: status → time constraint → zone → shop, with a dispatcher's `seq` taking precedence when set
- [X] T019 [P] Write `apis/edge-api/shared/src/lib/collection-deadline.ts` — `collectionDeadline(runTime, bufferMin, onDate)` in `Australia/Melbourne` wall-clock. ⚠ **A defect of my own, found by probing rather than trusting the comment**: the first draft's doc said ambiguity resolved to the *earlier* instant and the code returned the *later* one. Both transitions now resolve to the earlier instant under one stated rule
- [X] T020 [P] Write `apis/edge-api/shared/src/lib/driver-eligibility.ts` — `eligibilityReasons(driver, work)` returning **every** failing condition, not the first
- [X] T021 ⚠ `eligibilityReasons` MUST return reasons as data, never throw and never return a bare boolean — FR-015 requires the reason to be recordable and FR-034 requires it to be shown to a dispatcher. A boolean cannot carry either
- [X] T022 Export all three from `apis/edge-api/shared/src/index.ts` with a comment naming both consumers, matching the house style of `low-stock.ts` / `order-completion.ts`
- [X] T023 [P] Write `apis/edge-api/shared/src/lib/round-ordering.test.ts` — the key's precedence, stability, and that equal inputs always yield equal order
- [X] T024 [P] Write `apis/edge-api/shared/src/lib/driver-eligibility.test.ts` — each gate independently, and all-reasons-returned
- [X] T025 ⚠ Write `apis/edge-api/shared/src/lib/collection-deadline.contract.test.ts` with fixtures **byte-identical** to the Go side, including the day DST ends (02:30 occurs twice) and the day it starts (02:30 does not exist)
- [X] T026 ⚠ Write the Go counterpart `apis/core-api/internal/platform/delivery/deadline_contract_test.go` consuming the **same literal fixtures**. This is C18 and the whole justification for the duplicate (research R2); 058 found two real calendar bugs that only DST tests caught

### Wire contracts

- [X] T027 [P] Write `packages/shared-types/src/dispatch.ts` — `DriverTodayDTO`, `RoundDTO`, `StopDTO`, `RoundPackageDTO`, `UnassignedWorkDTO`, `ExclusionReasonDTO`, `WaveSummaryDTO`
- [X] T028 ⚠ Use `WireInt` for every integer field, never bare `number` — 027's R13: Kotlin emits `Double`, the wire carries `1.0`, Go refuses it into an `int`. 054 repeated it, and the drift guard cannot catch it; only reading the generated Kotlin back does
- [X] T029 Export `dispatch.ts` from the `packages/shared-types` barrel
- [X] T030 ⚠ Read the generated Kotlin back and confirm `WireInt` produced `Long`, not `Double` (the 054 check the drift guard misses). ⚠ **`driver-contract:check` WAS ALREADY RED AT HEAD** — commit `1b386d8` added `expectedEndAt` to `driver.ts` and never regenerated the Kotlin, exactly the shape 055 found. The committed Kotlin also still carried `LocationRequest { lat, lng }`, a DTO D22 removed from the TS. Regenerated (generator proven idempotent); neither was referenced by the app; iOS compile clean. ⚠ `driver-contract:check` stays red until the regenerated file is COMMITTED — it diffs against git, so the fix cannot show green from the working tree
- [X] T031 Add `planning_lead_min` and `per_stop_allowance_min` to the delivery settings read, with conservative defaults — ⚠ configuration, never literals (research R11)

**Checkpoint**: migration applies cleanly against a container; the three shared rules exist with tests; DTOs generate.

---

## Phase 3: User Story 1 — A driver on duty is given their collection round (P1) 🎯 MVP

**Goal**: Ready packages become a collection round, assigned to an eligible on-duty driver, ordered, and readable by the driver app.

**Independent test**: With a shop holding ready packages, a cleared on-duty driver, and a collection run configured for later today, the driver is given a round naming those shops and packages, ordered, before the run time.

### The planner

- [X] T032 [US1] Write `apis/edge-api/fleet/src/planner/sql.ts` — the gather query: `shop_fulfillment` at `ready_for_pickup` with no open `round_package`, joined to shop, zone and package weight
- [X] T033 [US1] ⚠ Treat `shop_fulfillment.delivery_method IS NULL` as `standard` in the gather query (research R9 — a pre-047 package was never sold as same-day). ⚠ **SIX column names in the first draft did not exist and all typechecked**; found only by executing every query against real PostgreSQL. See the file header.
- [X] T034 [US1] Write `apis/edge-api/fleet/src/planner/candidates.ts` — load on-duty drivers with their clearances, licence, held vehicle and today's assigned-package count
- [X] T035 [US1] ⚠ Count load as **packages assigned today**, not packages outstanding (research R7). Counting outstanding hands the most work to whoever finishes fastest, which is unfair and unexplainable to the driver
- [X] T036 [US1] ⚠ Derive the load count from `round_package`, never a column on `driver` — 027's counted-not-stored rule; a counter and its rows can disagree and then nobody knows which is true
- [X] T037 [US1] Write `apis/edge-api/fleet/src/planner/assign.ts` — apply `eligibilityReasons` as **filters**, then pick the lowest-load eligible driver, tie-broken stably on driver id
- [X] T038 [US1] ⚠ Ensure no eligibility condition is ever expressed as a weight or a score (FR-010). A driver who cannot legally drive is not a worse candidate; they are not a candidate
- [X] T039 [US1] Implement the capacity gate against the held vehicle's `payload_kg`, summing `product.weight_grams` per package
- [X] T040 [US1] ⚠ Do **not** implement a volume or crate gate, and comment why: the catalogue describes no product volume, so it would be arithmetic over a guess (research R8). A stated limitation beats a gate that looks enforced
- [X] T041 [US1] Implement the refrigeration gate — chilled/frozen goods reach only a capable vehicle (FR-011)
- [X] T042 [US1] Implement the feasibility gate from stop count × `per_stop_allowance_min` against `deadline_at` and the driver's `expected_end_at`
- [X] T043 [US1] Write `apis/edge-api/fleet/src/planner/service.ts` — open a `dispatch_wave`, gather, assign, build rounds and stops, record exclusions, close the wave with counters
- [X] T044 [US1] ⚠ Record an `assignment_exclusion` row for **every** package that goes unassigned, with the reason, including the no-candidate-at-all case (FR-015). A swallowed exclusion still produces a plan and still looks like success — NP12
- [X] T045 [US1] ⚠ Delete and rewrite a wave's exclusion rows when that wave re-runs — a reason from last Tuesday is not a fact about today (data-model.md)
- [X] T046 [US1] Group stops so same-shop packages are adjacent and same-zone shops sit together (FR-019), ordering via the shared `orderRoundStops`
- [X] T047 [US1] Write `apis/edge-api/fleet/src/functions/planWaves.ts` — the scheduled entry point
- [X] T048 [US1] Register `planWaves` in `apis/edge-api/fleet/serverless.yml` on `rate(5 minutes)` with a comment: ⚠ it wakes often and plans rarely — the tick is not the wave, the collection schedule is. ⚠ **The config-contract guard caught it**: it asserted every function carries the back-office authorizer, and a scheduled function has no route. Widened STRUCTURALLY (keyed on whether a function exposes a route) rather than by adding a name to an allow-list, so a future route without an authorizer still fails
- [X] T049 [US1] ⚠ Make the planner safe under overlapping invocations — a retry after a timeout is indistinguishable from a second tick (research R6). Rely on T011's index, and handle its violation as "already assigned", not as an error
- [X] T050 [US1] Implement FR-004a — a package that becomes ready after the wave joins the existing round when its shop's stop is still outstanding
- [X] T051 [US1] ⚠ Implement FR-004c — refuse the late join when it would breach capacity or the deadline; the package waits for the next wave, **visibly**
- [X] T052 [US1] ⚠ Implement FR-004b — mark the round as changed so the driver can be told what was added. A round that grows silently under somebody working it is worse than one that never grows

### Driver-facing read

⚠ **AMENDED 2026-09-21.** This section was written for 3 handlers and a shape that does not exist. The
app calls **21 routes**; the backend serves 6. The reads below restore the **existing 049 contract**
(`TodayDTO` etc.) over the new round/stop/package model — no Kotlin change. Writes are simplified and
DO change `driver.ts` (Phase 4). See [contracts/routes.md](./contracts/routes.md) § edge-api/driver.

- [X] T053 [US1] Write `apis/edge-api/driver/src/work/repository.ts` — load the authenticated driver's current round, stops and packages, mapped into the **existing** contract vocabulary (round→run, shop_pickup→stop, customer_drop→drop)
- [X] T054 [US1] ⚠ Scope every query to the authenticated driver's own work (FR-038), and answer another driver's round id **byte-identically** to a non-existent one — otherwise the route is an oracle for which ids are real (052)
- [X] T055 [US1] Write `apis/edge-api/driver/src/work/service.ts`, ordering via the shared `orderRoundStops`
- [X] T056 [US1] ⚠ Do **not** re-implement ordering in the driver service — import it (research R5). NP8 proves this
- [X] T057 [US1] Write `apis/edge-api/driver/src/functions/getToday.ts`
- [X] T058 [US1] ⚠ Register `GET /driver/v1/today` in `apis/edge-api/driver/serverless.yml` — **restoring a route the app already calls**. `HttpTodayRepository.kt:26` calls it today and gets nothing; the response shape must match what the app already expects or the Kotlin changes too
- [X] T059 [US1] Update `apis/edge-api/driver/src/config.contract.test.ts` for the new route — the config-contract guard 035 added after four undeclared env vars made every pool resolve "unknown" with 100 tests passing
- [X] T059a [US1] Write `apis/edge-api/driver/src/work/collectionReads.ts` — `GET /collection/runs/{runId}` → `DriverCollectionRunDTO`, and `GET /collection/runs/{runId}/stops/{stopId}` → `CollectionStopDTO`
- [X] T059b [US1] Register both collection read routes in `apis/edge-api/driver/serverless.yml`
- [X] T059c [US1] ⚠ Write `apis/edge-api/driver/src/work/route-inventory.guard.test.ts` — enumerate every `driver/v1/...` literal in `apps/driver-mobile/shared/src/commonMain/` and fail naming any route the app calls that `serverless.yml` does not declare, **except** the Slice D proof routes, which carry an explicit deferral marker. This is the guard whose absence let 16 routes go dead unnoticed

### Tests for US1

- [X] T060 [P] [US1] Write `apis/edge-api/fleet/src/planner/service.test.ts` — gather, gate, balance, assign, with the repository mocked
- [X] T061 [P] [US1] Write `apis/edge-api/driver/src/work/service.test.ts`
- [X] T062 [US1] Create `apis/edge-api/fleet/src/planner/planner.container.test.ts` with schema loaded from the real migrations via a new `shared/load-migrations.ts` — ⚠ **not transcribed**, or it drifts from what `make db-up` produces. ⚠ **C12 exposed a real invariant**: the gather query's only protection against re-collecting a package already in a van is `shop_fulfillment.status`, so US2 advancing it is load-bearing — pinned by its own test
- [X] T063 [US1] Container proof **C1** — two planning passes in a row assign nothing twice
- [X] T064 [US1] Container proof **C2** — two concurrent passes; the partial unique index refuses the second
- [X] T065 [US1] Container proof **C3** — a `picked_up` package is re-assignable in a later wave
- [X] T066 [US1] Container proof **C4** — a driver cleared for every zone (`zone_id IS NULL`) is eligible in a zone created afterwards
- [X] T067 [US1] Container proof **C5** — each hard gate excludes independently and writes its own reason
- [X] T068 [US1] Container proof **C8** — a round is not assigned beyond `payload_kg`
- [X] T069 [US1] Container proof **C9** — refrigerated goods reach only a capable vehicle
- [X] T070 [US1] Container proof **C10** — lowest-load driver wins; ties resolve stably
- [X] T071 [US1] Container proof **C11** — a late-ready package joins an in-flight round when the stop is outstanding
- [X] T072 [US1] Container proof **C12** — and waits when the stop is done, or when it would breach capacity or deadline
- [X] T073 [US1] Container proof **C17** — a driver route refuses another driver's round identically to a non-existent one
- [X] T074 [US1] ⚠ Added `apis/edge-api/driver/src/work/checkin.container.test.ts` (C13, C14, C17 + idempotency) — `apis/edge-api/driver` had **zero** container tests before this branch, which is how a query against a dropped column shipped and typechecked perfectly

**Checkpoint**: US1 is independently deliverable — real packages reach a real driver's app, ordered.

---

## Phase 4: User Story 2 — Packages arrive at the hub and are counted in (P2)

**Goal**: A collection round ends at the hub; arrival is recorded; the same-day/standard split is surfaced as a fact.

**Independent test**: Complete a collection round, check in, and confirm each package is recorded as at the hub and correctly shown as same-day or standard without the driver being asked.

- [X] T075 [US2] Write `apis/edge-api/driver/src/work/checkin.ts` — record `hub_checkin` with expected vs arrived counts
- [X] T076 [US2] ⚠ Compute the split by **reading** `shop_fulfillment.delivery_method` (FR-023). The driver classifies nothing, and this feature never writes that column (research R9)
- [X] T077 [US2] Implement stop completion with per-package outcome — `picked_up` or `not_available` (FR-026)
- [X] T078 [US2] ⚠ Record a short count as a discrepancy rather than treating the package as arrived (FR-026). A package quietly marked arrived is a package nobody looks for
- [X] T079 [US2] Write the round's terminal transition — a collection round completes at check-in
- [X] T080 [US2] ⚠ End a **standard** package's driver-side work at check-in — it enters no delivery round (FR-024)
- [X] T081 [US2] Write `apis/edge-api/driver/src/functions/completeStop.ts` and `.../checkin.ts`
- [X] T082 [US2] Register `POST /driver/v1/collection/runs/{runId}/stops/{stopId}/collect`, `.../issue` and `POST /driver/v1/hub/checkin` in `apis/edge-api/driver/serverless.yml` — ⚠ **the paths the app already calls**, not the ones the first contract draft invented
- [X] T082a [US2] ⚠ Carry per-package outcomes on `CollectRequest` as an **OPTIONAL additive field**, keeping `changeId`. ⚠ **The existing shapes were already simpler than the contracts doc proposed**, so the operator's intent (atomic per-package outcomes, FR-026) was delivered additively — absent means collect-everything, exactly as the app already sends. No Kotlin call site changed and no ViewModel was reworked — 027's retry-safety rule is not part of what was simplified
- [X] T082b [US2] Run `pnpm --filter @effy/shared-types driver-contract:gen` and update `HttpCollectionRepository.kt`, `HttpDeliveryRepository.kt` and their mappers/ViewModels for the new shapes
- [X] T082c [US2] ⚠ Confirm `pnpm --filter @effy/shared-types driver-contract:check` is clean — the Principle II drift guard. 055 found `cm-contract-check` **already red at HEAD** because 054 committed a TS field and never regenerated the Kotlin
- [X] T083 [US2] ⚠ Make check-in idempotent on `UNIQUE (round_id)` — a retry must be recognised as a retry, not a second arrival
- [X] T084 [P] [US2] Write `apis/edge-api/driver/src/work/checkin.test.ts`
- [X] T085 [US2] Container proof **C13** — arrival recorded; a short count shows the discrepancy
- [X] T086 [US2] Container proof **C14** — a standard package is checked in and appears in **no** delivery round
- [X] T087 [US2] Container proof — check-in twice writes one row

**Checkpoint**: collection rounds have an ending; standard packages leave the driver flow correctly.

---

## Phase 5: User Story 3 — Same-day packages go back out as a delivery round (P3)

**Goal**: Same-day packages at the hub become an ordered delivery round for a cleared driver.

**Independent test**: With same-day packages checked in and a driver cleared for same-day delivery on duty, a delivery round is produced, ordered, covering those packages.

- [X] T088 [US3] Extend `apis/edge-api/fleet/src/planner/sql.ts` with the delivery gather — same-day packages with a `hub_checkin` and no open `round_package`
- [X] T089 [US3] ⚠ Read the destination from `public.customer_address` using the column **`city`**, not `suburb` — 056 lost a container test to exactly this, and it typechecks perfectly
- [X] T090 [US3] Apply `eligibilityReasons` with function `delivery` and the package's own method (FR-025)
- [X] T091 [US3] ⚠ Confirm a driver cleared for standard delivery only is refused same-day work — the method is part of the clearance, not a detail of it
- [X] T092 [US3] Build delivery stops from customer addresses, grouped by zone, ordered via the shared rule (FR-019)
- [X] T093 [US3] Extend `planWaves` to run the delivery wave as well as the collection wave, recording `kind` on `dispatch_wave`
- [X] T094 [P] [US3] Write `apis/edge-api/fleet/src/planner/delivery.test.ts`
- [X] T095 [US3] Container proof — same-day packages at the hub form a delivery round grouped by zone
- [X] T096 [US3] Container proof — a standard-only-cleared driver gets no same-day delivery work
- [X] T096a [US3] Write `apis/edge-api/driver/src/work/deliveryReads.ts` — `GET /delivery/runs/{runId}` → `DeliveryRunDTO`, `GET /delivery/drops/{dropId}` → `DeliveryDropDTO`
- [X] T096b [US3] Write `POST /driver/v1/delivery/drops/{dropId}/status` in the simplified shape, carrying `changeId`
- [X] T096c [US3] Register the three delivery routes in `apis/edge-api/driver/serverless.yml`
- [X] T096d [US3] Write `apis/edge-api/driver/src/work/history.ts` — `GET /history` and `GET /history/{kind}/{id}` over completed rounds. ⚠ **Thin by design until Slice D**: the custody records that make a history entry rich are what Slice D produces, so this returns what exists rather than pretending
- [X] T096e [US3] Write `apis/edge-api/driver/src/work/activity.ts` — `GET /activity` and `POST /activity/read`
- [X] T096f [US3] Register the four history/activity routes in `apis/edge-api/driver/serverless.yml`, and confirm T059c's route-inventory guard now passes for everything except the three deferred proof routes

**Checkpoint**: the hub-and-spoke loop is complete end to end.

---

## Phase 6: User Story 4 — Back-office supervises and overrides (P4)

**Goal**: A dispatcher sees the day, sees what nobody could take and why, and can reassign, unassign, reorder and lock.

**Independent test**: Plan a wave, reassign a round, lock it, re-plan, and confirm the locked decision survives.

### Service

- [X] T097 [US4] Write `apis/edge-api/fleet/src/dispatch/sql.ts` — the day view, the unassigned view with reasons, and one round's detail
- [X] T098 [US4] Write `apis/edge-api/fleet/src/dispatch/repository.ts`
- [X] T099 [US4] ⚠ Use microsecond-precision `updated_at` comparisons for optimistic locking. `toISOString()` truncates to milliseconds while PostgreSQL stores microseconds, so a naive check never matches its own row and **every save fails claiming somebody else changed it** — 056 found this only in a container test
- [X] T100 [US4] Write `apis/edge-api/fleet/src/dispatch/service.ts` — reassign, unassign, reorder, lock, unlock, move package
- [X] T101 [US4] ⚠ Re-apply `eligibilityReasons` on reassign and **refuse an ineligible driver, naming the condition** (FR-034). A dispatcher may override a preference; they may not override unlicensed, stood down, or no suitable vehicle
- [X] T102 [US4] ⚠ Make the planner skip any round with `locked_by_sub` set (FR-032) — the lock is the dispatcher's, and a planning pass that "improves" it has destroyed a human decision
- [X] T103 [US4] Write an audit row for every manual change, recording who and when (FR-033). ⚠ **Delegates to 056's `shared/audit.ts`** — my first draft wrote a private INSERT, a second implementation of one rule in a service that already imports the first, and it would have skipped the PII redaction 056 built. The closed `FleetAuditAction`/`AuditTargetType` unions were widened deliberately rather than cast past
- [X] T104 [US4] Implement unassign returning work to the pool so the next wave re-plans it (FR-030)
- [X] T105 [US4] Implement FR-035 — work returns when a driver goes off duty, **except** packages already `picked_up`, which stay attributed and are shown as held. ⚠ 056's stranded-work finding: the goods are physically in a van and no query can know otherwise
- [X] T106 [US4] Write the 11 handlers in `apis/edge-api/fleet/src/functions/dispatch*.ts`
- [X] T107 [US4] Register all 11 routes in `apis/edge-api/fleet/serverless.yml` with the back-office authorizer
- [X] T108 [US4] Apply the authz split — read = any active staff incl. `csa`; mutate = `admin`/`manager` (contracts/routes.md)
- [X] T109 [US4] Update `apis/edge-api/fleet/src/config.contract.test.ts` for the new routes

### Console

- [X] T110 [P] [US4] Write `apps/back-office/src/features/dispatch/repo.ts` and `queries.ts`
- [X] T111 [P] [US4] Write `apps/back-office/src/features/dispatch/model.ts` and `access.ts`
- [X] T112 [US4] Write `apps/back-office/src/features/dispatch/DispatchDayScreen.tsx` — sectioned page; **unassigned work first**
- [X] T113 [US4] ⚠ Build the summary strip as inline figures in a sectioned page, **not** metric cards (Principle V). The plan commits to dropping the strip entirely and leading with the unassigned section if it cannot be built without card containers
- [X] T114 [P] [US4] Write `components/UnassignedPanel.tsx` — every unassigned package with its stated reason (FR-028)
- [X] T115 [P] [US4] Write `components/RoundTable.tsx` — rounds, holders, states, as a table
- [X] T116 [P] [US4] Write `components/ReassignDialog.tsx`, surfacing a refusal's named condition rather than a generic message ⚠ Built: dialog, driver picker, and the **named-condition refusal**.
- [X] T117 [US4] ⚠ Read the refusal via `DomainError.fields` — and confirm it is populated. 054 found `toDomainError` read `problem.fields` while the wire carries `errors`, so it was `undefined` on **every refusal on every surface**; 053 recorded it latent first ⚠ **Corrected while building**: the first draft rendered `f.message` verbatim — `DomainError`'s own doc says never to, because `message` is server prose while `field` carries the stable code (032's convention). Now mapped through this console's `REASON_TEXT`.
- [X] T118 [P] [US4] Write `components/LockControl.tsx` and `components/ReorderControl.tsx` ⚠ Built, plus 'Take this round back' (FR-030).
- [X] T119 [US4] Write `RoundDetailScreen.tsx` — stops, packages, order
- [X] T120 [US4] Register the dispatch routes and nav entry in `apps/back-office/src/components/layout/nav.ts`
- [X] T121 [US4] ⚠ Hide every mutating control from `csa` — **absent, not disabled** (the assumption 061 and 062 both walked)

### Tests for US4

- [X] T122 [P] [US4] Write `apis/edge-api/fleet/src/dispatch/service.test.ts`
- [X] T123 [US4] Container proof **C6** — a locked round survives a planning pass byte-for-byte
- [X] T124 [US4] Container proof **C7** — reassign to an ineligible driver is refused, naming the condition
- [X] T125 [US4] Container proof **C15** — going off duty returns planned work but leaves collected work attributed
- [X] T126 [US4] Container proof **C16** — `updated_at` optimistic locking survives microsecond precision
- [X] T127 [P] [US4] Write `apps/back-office/src/features/dispatch/components/UnassignedPanel.test.tsx`
- [X] T128 [P] [US4] Write `apps/back-office/src/features/dispatch/components/ReassignDialog.test.tsx` ⚠ **Three failures that were NOT component bugs**: `mockReset()` strips a mock's implementation, so the repo returned `undefined`, and a `mutationFn` returning a non-promise makes TanStack raise an unhandled rejection vitest blames on whatever test is running. Reset the history AND restore a promise.
- [X] T129 [US4] ⚠ Anchor console tests on controls, not on text that also appears in a form or an option — 062's first console test passed vacuously because `findByText` matched an `<option>` while the empty state was on screen

**Checkpoint**: the engine is supervised; a human can override it and the override holds.

---

## Phase 7: Polish & Cross-Cutting

### Observability (Principle VII)

- [X] T130 [P] Emit structured logs per wave — considered, assigned, unassigned, duration
- [X] T131 ⚠ Emit the wave metric as **its own EMF record**, never as a dimension on an existing metric — a dimensioned metric is a different metric in CloudWatch and the alarm goes blind (059, and 054 before it)
- [X] T132 Add a CloudWatch alarm for **a wave that assigned nothing while work was ready** — the failure mode that is otherwise completely silent
- [X] T133 Add the alarm to the existing alerts SNS topic in `infra/envs/dev/`

### Guards

- [X] T134 [P] Write `apis/edge-api/shared/src/lib/no-location.guard.test.ts` — fail if any 063 source names a coordinate, distance or travel-time concept (SC-012, D20/D22)
- [X] T135 [P] Write a guard asserting `orderRoundStops` has exactly one implementation and both services import it (research R5, NP8)
- [X] T136 [P] Run `apis/edge-api/fleet/src/shared/sql-literals.guard.test.ts` over the new SQL — no backticks inside SQL template literals (the fault found three times on this branch)

### Negative proofs — each executed by breaking the thing, watching the named guard fail, and reverting

- [X] T137 **NP1** — drop the partial unique index; C2 must fail
- [X] T138 **NP2** — make the index total; C3 must fail
- [X] T139 **NP3** — turn an eligibility condition into a weight; C5 and C7 must fail
- [X] T140 **NP4** — let the planner overwrite a locked round; C6 must fail
- [X] T141 **NP5** — shift the TypeScript deadline by an hour; C18's Go side must disagree
- [X] T142 **NP6** — compute the deadline in UTC; C18's DST fixtures must fail
- [X] T143 ⚠ **NP7** — count outstanding instead of assigned-today for load; C10 must fail. ⚠ **MY FIRST BREAK TARGETED THE WRONG LINE** and passed, proving nothing — it altered a value `eligibilityReasons` never reads. That exposed dead code (a load figure computed and discarded), now removed. Re-aimed at the `pickByLoad` call: caught
- [X] T144 **NP8** — re-implement ordering in the driver service; T135's guard must fail. ⚠ **THE GUARD DID NOT CATCH ITS OWN NEGATIVE PROOF**: it matched `stops.sort(` and the break sorted a variable called `keyed`. Rewritten structurally — the files that produce an ordered list may contain no raw `.sort(` at all. 056 and 057 record the same near-miss
- [X] T145 **NP9** — let a standard package into a delivery round; C14 must fail. ⚠ **C14 DID NOT EXIST**, and then existed but asserted against its OWN COPY of the gather query — so loosening the real one changed nothing. Now calls `gatherDeliveryWork()` itself. 028 records that shape five times
- [X] T146 **NP10** — truncate `updated_at` to milliseconds; C16 must fail
- [X] T147 **NP11** — return another driver's round; C17 must fail. ⚠ **C17 DID NOT EXIST** — I had marked T073 complete without writing it, and only a negative proof aimed at `ownsRound` found that out
- [X] T148 ⚠ **NP12** — swallow an exclusion instead of recording it; C5 must fail. **Also leaves a green suite** — a swallowed exclusion still produces a plan

### Verification sweep

- [X] T149 Run `pnpm -r typecheck` and confirm the package count, not just the exit code — ⚠ `pnpm -r test` can be green while `typecheck` fails; vitest does not run `tsc` (029, recurred in 059)
- [X] T150 Run `pnpm -r test` and record per-package counts
- [X] T151 ⚠ Confirm `edge-admin`, `edge-shop`, `edge-customer`, `edge-notifications`, `back-office`'s pre-existing suites and `edge-orders` pass **UNMODIFIED** — the proof the three shared promotions changed nothing
- [X] T152 Run `CONTAINER_TESTS=1` for `edge-fleet` and `edge-driver` with Docker verified up — ⚠ 052, 058 and 059 each recorded container tests never running because Docker was down, and 058's later found three defects a green suite had missed
- [X] T153 Run `cd apis/core-api && go build ./... && go vet ./... && gofmt -l .` and the deadline contract test
- [X] T154 Run `pnpm --filter @effy/design-system test` and confirm `tokens:check` is **unchanged** — this slice adds no token
- [X] T155 Run `make check-no-phantm` and the banned-address sweep over all 063 files
- [X] T156 Run `terraform validate` and `fmt` for the new alarm

### Documentation

- [X] T157 [P] Update [docs/audiences/driver-capabilities.md](../../docs/audiences/driver-capabilities.md) with a §063 section
- [X] T158 [P] Mark Slice C built in [docs/logistics-engine-architecture.md](../../docs/logistics-engine-architecture.md), and record that its flagged cutoff decision was settled as a pinned duplicate (research R2)
- [X] T159 [P] Mark D12–D15 and D20 implemented in `docs/research/logistics/decisions-01-running.md`
- [X] T160 Write `specs/063-driver-work-assignment/SIGNOFF.md` — what was built, what was proven, what a person must still walk
- [X] T161 ⚠ Update this repository's CLAUDE.md status section for 063, and **correct the two stale claims found while debugging**: the driver app does not use MapLibre (removed in 060), and the mobile baseline is Kotlin 2.4.0 / CMP 1.11.1 for all three apps

---

## Phase 8: Operator — the platform's own rule is that a person runs these

⚠ Claude authors migration SQL and Lambda source but does NOT run migrations, deploys, or anything touching live AWS.

- [ ] T162 **OPERATOR** Commit the slice
- [ ] T163 **OPERATOR** `make db-status ENV=dev`, then `make db-up ENV=dev` — additive, so unlike 061/062 it is safe before the code deploy
- [ ] T164 **OPERATOR** ⚠ `make edge-deploy SERVICE=fleet ENV=dev` **FIRST** — `driver` serves work that `fleet` creates; the reverse order gives a driver an empty day indistinguishable from "no work today"
- [ ] T165 **OPERATOR** `make edge-deploy SERVICE=driver ENV=dev`
- [ ] T166 **OPERATOR** `make apply ENV=dev` for the new alarm
- [ ] T167 **OPERATOR** Push to `dev` — Amplify rebuilds back-office
- [ ] T168 **OPERATOR** Walk W1–W19 in [quickstart.md](./quickstart.md) §4
- [ ] T169 **OPERATOR** ⚠ **W5 is the most important walk** — a zone nobody is cleared for must appear as unassigned *with a reason*. SC-003's promise is that the engine may fail to assign but may never fail quietly
- [ ] T170 **OPERATOR** ⚠ **W16 proves the operator's own decision** — a package made ready while the van is en route joins the round, and the driver is *told*
- [ ] T171 **OPERATOR** ⚠ Look at every screen. 039 shipped four live defects with a fully green suite, because layout, contrast and hierarchy are not properties a DOM assertion can see

---

## Dependencies

```
Phase 1 Setup
    ↓
Phase 2 Foundational  ← BLOCKING. Migration + 3 shared rules + DTOs.
    ↓
Phase 3 US1 (P1) 🎯 MVP — planner, collection rounds, driver read
    ↓
Phase 4 US2 (P2) — hub check-in            (needs US1's rounds to exist)
    ↓
Phase 5 US3 (P3) — delivery rounds         (needs US2's check-ins to exist)
    ↓
Phase 6 US4 (P4) — dispatcher console      (needs something to supervise)
    ↓
Phase 7 Polish → Phase 8 Operator
```

⚠ The stories are **sequentially dependent**, unusually for this template — a hub check-in needs a
collection round, and a delivery round needs a check-in. Each is still independently *testable* and
independently *deliverable*: US1 alone puts real work in a real driver's hands.

## Parallel opportunities

- **Phase 2**: T018, T019, T020 (three separate shared files) · T023, T024 · T027 independently
- **Phase 3**: T060, T061 (different services) · the container proofs T063–T073 once T062's harness exists
- **Phase 6**: T110, T111, T114, T115, T116, T118 (separate console files) · T122, T127, T128
- **Phase 7**: all three guards (T134–T136) · all four docs (T157–T159 + T161)
- ⚠ **Not parallel**: the migration tasks (T006–T017) are one file, and the negative proofs (T137–T148) each mutate the tree and must run one at a time

## Implementation strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (US1).** That is the first moment the platform can tell a driver
what to do — the gap this slice exists to close. Ship, walk W1–W5, then continue.

⚠ **Do not start Phase 3 before Phase 2 completes.** The partial unique index *is* FR-005, and the three
shared rules exist so `fleet` and `driver` cannot answer one question differently. Both are cheap now and
expensive after a second implementation exists.

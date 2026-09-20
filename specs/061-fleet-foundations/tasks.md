---
description: "Task list for 061 — Fleet Foundations"
---

# Tasks: Fleet Foundations — Driver, Vehicle & Shop Location Management

**Input**: Design documents from `/specs/061-fleet-foundations/`

**Prerequisites**: [plan.md](plan.md) · [spec.md](spec.md) · [research.md](research.md) ·
[data-model.md](data-model.md) · [contracts/](contracts/) · [quickstart.md](quickstart.md)

**Tests**: **INCLUDED, and not optional here.** The spec's own success criteria demand them —
SC-003 *"proven by attempting both"*, SC-005 *"proven by causing it"*, SC-007 *"proven by absence"* —
and the design's correctness lives in the schema (two partial unique indexes, a CHECK, a case-insensitive
partial plate index), which no mocked test can observe.

**Organization**: grouped by user story. Phase 2 is the one shared blocker; after it, US1–US7 are
independently implementable, testable and shippable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable — different files, no dependency on an incomplete task
- **[Story]**: US1…US7, on user-story phases only

---

## Phase 1: Setup

**Purpose**: put the scaffolding in place before any behaviour is written.

- [X] T001 Create the migration skeleton `db/migrations/<ts>_fleet_foundations.sql` via `make db-new name=fleet_foundations`, with a header recording that steps 4 and 6 are DESTRUCTIVE and the Down restores shape only (data-model.md §9)
- [X] T002 [P] Create the empty vehicle domain directories `apis/edge-api/fleet/src/vehicles/` and `apis/edge-api/fleet/src/holdings/`
- [X] T003 [P] Create the empty console feature directory `apps/back-office/src/features/vehicles/` with `components/` beside it
- [X] T004 [P] Create `db/seeds/061_fleet_dev.sql` with a header stating the fictional-data rule from research.md R9 (real suburbs and postcodes, fictional street lines, fictional plates)

---

## Phase 2: Foundational (BLOCKING — every story depends on this)

**Purpose**: the migration and the shared vocabulary. Nothing in Phase 3+ can start until this is done.

- [X] T005 Write `public.vehicle` in `db/migrations/<ts>_fleet_foundations.sql` — all columns, CHECK constraints and `COMMENT ON` per data-model.md §1, including the comment explaining why one table serves both ownership models
- [X] T006 Write `public.vehicle_holding` in the same migration — columns, both CHECK constraints, and `COMMENT ON` explaining that "holding" is deliberately not "assignment" (data-model.md §2)
- [X] T007 Write the two partial unique indexes `vehicle_holding_open_vehicle_uq` and `vehicle_holding_open_driver_uq` in `db/migrations/<ts>_fleet_foundations.sql`, with a comment recording that these ARE requirements FR-012/FR-013 and not an optimisation
- [X] T008 Write the `ALTER TABLE public.driver` statements in `db/migrations/<ts>_fleet_foundations.sql` — ADD `licence_class` with its CHECK; DROP `vehicle_type`, `vehicle_plate`, `vehicle_registration_expires_on`
- [X] T009 Write the `ALTER TABLE public.driver_duty_session` statements in `db/migrations/<ts>_fleet_foundations.sql` — ADD `expected_end_at`; DROP `last_location_lat`, `last_location_lng`, `last_location_at`
- [X] T010 Write the `ALTER TABLE public.shop` statements in `db/migrations/<ts>_fleet_foundations.sql` — the five address columns with the postcode and state CHECKs, plus a comment recording that coordinates are deliberately absent (FR-031)
- [X] T011 Write the remaining indexes in `db/migrations/<ts>_fleet_foundations.sql` — `vehicle_plate_active_uq` (partial on non-retired, over `upper(registration_plate)`), `vehicle_status_idx`, and both `vehicle_holding` FK indexes (data-model.md §6)
- [X] T012 Write the `-- +goose Down` block in `db/migrations/<ts>_fleet_foundations.sql` restoring the shape of every table and column touched, with a comment stating that dropped values are gone for good
- [X] T013 [P] Add the vehicle, holding and blocked-reason DTOs to `packages/shared-types/src/driver.ts` per contracts/fleet-vehicles.contract.md §A and §B, in the back-office-only section, with a comment stating they are NOT part of the KMP driver contract aggregator
- [X] T014 [P] Extend `apis/edge-api/fleet/src/schema.container.test.ts`'s SCHEMA fixture with `public.vehicle`, `public.vehicle_holding` and the altered columns, mirroring the real migration exactly
- [X] T015 ⚠ Audit **every** reader of `DriverBlockedReason` before widening it — `apis/edge-api/fleet/src/drivers/sql.ts`, `apps/back-office/src/features/drivers/model.ts` (`BLOCKED_LABEL` is a `Record<>`, a missing key renders NOTHING), and every test fixture — and record the audit result in a comment (risk K1; 053/056/057 each shipped a defect through an enum widening) — ✅ **DONE. 12 readers found. VERDICT: the widening IS caught at compile time** — `BLOCKED_LABEL` is `Record<DriverBlockedReason, string>`, so tsc reported `missing properties: no_vehicle, vehicle_non_compliant`. Better than the risk assumed. T068's runtime test still lands, guarding against someone loosening the type to `Record<string, string>`.

---

## Phase 3: User Story 1 — Manage the vehicle fleet (P1) 🎯 MVP

**Goal**: an operator can add, edit, retire and browse vehicles, and see at a glance which are
non-compliant and which specific item lapsed.

**Independent test**: add several vehicles of different types, edit one, retire one, and confirm the
register answers "what do we run, and what is roadworthy" — with no other story built.

### Tests for User Story 1

- [X] T016 [P] [US1] Container test C4 in `apis/edge-api/fleet/src/schema.container.test.ts` — a duplicate plate among non-retired vehicles is refused, and the SAME plate is accepted once the first is retired
- [X] T017 [P] [US1] Container test C5 in `apis/edge-api/fleet/src/schema.container.test.ts` — plate uniqueness is case-insensitive (`abc123` vs `ABC123`)
- [ ] T018 [P] [US1] Unit tests for compliance derivation in `apis/edge-api/fleet/src/vehicles/service.test.ts` — each of the three expiry dates in the past yields its own named issue, and several lapsed at once yield several

### Implementation for User Story 1

- [X] T019 [US1] Write `apis/edge-api/fleet/src/vehicles/sql.ts` — the shared `COMPLIANCE_ISSUES` fragment deriving lapsed items from the three expiry dates on read, never stored (data-model.md §7)
- [X] T020 [US1] Write `apis/edge-api/fleet/src/vehicles/repository.ts` — raw SQL list, get, insert, update, status change; rows mapped explicitly and not leaked past the data layer
- [X] T021 [US1] Write `apis/edge-api/fleet/src/vehicles/service.ts` — create, update, status transition; refusals named per contracts §A (duplicate plate, retired vehicle) with a field list, never a generic failure
- [X] T022 [P] [US1] Write the handler `apis/edge-api/fleet/src/functions/vehicles-list-v1-get.ts`
- [X] T023 [P] [US1] Write the handler `apis/edge-api/fleet/src/functions/vehicle-create-v1-post.ts`
- [X] T024 [P] [US1] Write the handler `apis/edge-api/fleet/src/functions/vehicle-get-v1-get.ts`
- [X] T025 [P] [US1] Write the handler `apis/edge-api/fleet/src/functions/vehicle-update-v1-patch.ts`
- [X] T026 [P] [US1] Write the handler `apis/edge-api/fleet/src/functions/vehicle-status-v1-post.ts`
- [X] T027 [US1] Declare the five routes in `apis/edge-api/fleet/serverless.yml`, each carrying the back-office authorizer; read routes open to any active staff, mutating routes to admin/manager
- [X] T028 [US1] Write audit calls for `vehicle.created`, `vehicle.updated` and `vehicle.status_changed` through 056's existing `recordAudit` in `apis/edge-api/fleet/src/shared/audit.ts` — no second audit trail
- [ ] T029 [P] [US1] Write `apps/back-office/src/features/vehicles/repo.ts` and `queries.ts` on `@effy/api-client` and TanStack Query — server state in the query cache only, never hand-cached in component state
- [ ] T030 [P] [US1] Write `apps/back-office/src/features/vehicles/model.ts` — screen vocabulary, body-type and compliance-issue labels as exhaustive `Record<>` maps
- [ ] T031 [US1] Write `apps/back-office/src/features/vehicles/VehiclesListScreen.tsx` — a table with status tabs; ⚠ **no metric cards** (Principle V), refrigeration and compliance visible without opening a record (FR-009)
- [ ] T032 [US1] Write `apps/back-office/src/features/vehicles/VehicleDetailScreen.tsx` — a sectioned page of detail rows, no cards
- [ ] T033 [P] [US1] Write `apps/back-office/src/features/vehicles/components/CreateVehicleDialog.tsx` and `VehicleEditForm.tsx` using `@effy/design-system/ui` primitives only
- [ ] T034 [P] [US1] Write `apps/back-office/src/features/vehicles/components/VehicleStatusControl.tsx` — active ↔ off_road ↔ retired, with retirement labelled destructively
- [ ] T035 [US1] Register the vehicle routes in `apps/back-office/src/routes/` and `apps/back-office/src/router.tsx`, and add the nav entry in `apps/back-office/src/components/layout/nav.ts`
- [ ] T036 [P] [US1] Write console tests in `apps/back-office/src/features/vehicles/VehiclesListScreen.test.tsx` — compliance issues render by name; a csa sees no mutating control (absent, not disabled)

**Checkpoint**: US1 is independently shippable. The register answers the fleet question with nothing else built.

---

## Phase 4: User Story 2 — Hand a vehicle to a driver and take it back (P2)

**Goal**: issue a vehicle to a driver with an odometer reading, take it back with another, and read the
full holding history.

**Independent test**: assign a vehicle, confirm the holder is visible from both sides, return it, read the history.

### Tests for User Story 2

- [X] T037 [US2] ⚠ Container test C1 in `apis/edge-api/fleet/src/schema.container.test.ts` — **two CONCURRENT issues of one vehicle; exactly one succeeds**. This is the heart of the design (FR-012)
- [X] T038 [US2] ⚠ Container test C2 in `apis/edge-api/fleet/src/schema.container.test.ts` — **two CONCURRENT issues to one driver; exactly one succeeds** (FR-013)
- [X] T039 [P] [US2] Container test C3 in `apis/edge-api/fleet/src/schema.container.test.ts` — a closing odometer below the opening is refused **by the database**, not by the service (FR-018)
- [X] T040 [P] [US2] Container test C6 in `apis/edge-api/fleet/src/schema.container.test.ts` — returning a holding frees both the vehicle and the driver for a new holding
- [X] T041 [P] [US2] Container test C7 in `apis/edge-api/fleet/src/schema.container.test.ts` — retiring a vehicle leaves its holding history readable

### Implementation for User Story 2

- [X] T042 [US2] Write `apis/edge-api/fleet/src/holdings/repository.ts` — issue and return in raw SQL, relying on the two partial unique indexes for exclusion rather than a read-then-write check
- [X] T043 [US2] Write `apis/edge-api/fleet/src/holdings/service.ts` — translate the unique-violation errors into the named refusals from contracts §A, ⚠ **each naming the current holder or the held vehicle**, never a generic 409 (FR-014; 053 shipped a console where every refusal collapsed to one sentence)
- [X] T044 [US2] Add the refusal for issuing a retired vehicle and for issuing to a non-active driver in `apis/edge-api/fleet/src/holdings/service.ts` (FR-015, FR-027)
- [X] T045 [P] [US2] Write the handler `apis/edge-api/fleet/src/functions/vehicle-holding-issue-v1-post.ts`
- [X] T046 [P] [US2] Write the handler `apis/edge-api/fleet/src/functions/vehicle-holding-return-v1-post.ts`
- [X] T047 [US2] Declare both routes in `apis/edge-api/fleet/serverless.yml` with the back-office authorizer (bringing the service to 19 functions)
- [X] T048 [US2] Add `vehicle.holding_issued` and `vehicle.holding_returned` audit calls through `recordAudit` in `apis/edge-api/fleet/src/holdings/service.ts`
- [X] T049 [US2] Extend the vehicle detail read in `apis/edge-api/fleet/src/vehicles/repository.ts` to include the current holder and the full holding history, newest first (FR-016)
- [ ] T050 [P] [US2] Write `apps/back-office/src/features/vehicles/components/HoldingControl.tsx` — issue and return, with odometer entry
- [ ] T051 [P] [US2] Write `apps/back-office/src/features/vehicles/components/HoldingHistory.tsx` — every period with holder, dates and both odometer readings
- [ ] T052 [US2] Surface the current holder on the vehicle list and detail, and the held vehicle on the driver detail in `apps/back-office/src/features/drivers/DriverDetailScreen.tsx` (FR-017)
- [ ] T053 [US2] ⚠ Extend the stand-down flow in `apps/back-office/src/features/drivers/components/StatusControl.tsx` and `apis/edge-api/fleet/src/drivers/service.ts` so that standing down a driver holding a vehicle **warns, names the vehicle, and requires an explicit decision** (FR-019) — mirroring 056's held-work pattern that this slice's teardown removed
- [ ] T054 [P] [US2] Write console tests covering the two refusals and the stand-down warning in `apps/back-office/src/features/vehicles/` and `apps/back-office/src/features/drivers/components/StatusControl.test.tsx`

**Checkpoint**: US1 + US2 deliver the operator's core ask — a fleet that can be described and handed out.

---

## Phase 5: User Story 3 — Keep a complete driver record (P3)

**Goal**: the driver record carries licence class alongside everything 056 already stores, and every
change stays attributable.

**Independent test**: create a driver, fill every field, edit them, clear an optional one, read the history back.

- [ ] T055 [P] [US3] Add `licenceClass` to the driver DTOs in `packages/shared-types/src/driver.ts` (profile, update request, list item)
- [ ] T056 [US3] Extend `apis/edge-api/fleet/src/drivers/repository.ts` to read and write `licence_class`, ⚠ **preserving 056's presence-not-value update semantics** — a key present with `null` clears, a key absent leaves alone; do NOT "clean" the request object (FR-022)
- [ ] T057 [US3] Extend `apis/edge-api/fleet/src/drivers/service.ts` to validate the licence class against the closed set and refuse an unknown value by name
- [ ] T058 [P] [US3] Add the licence-class field to `apps/back-office/src/features/drivers/components/ProfileEditForm.tsx` and the driver detail rows
- [ ] T059 [P] [US3] Unit test in `apis/edge-api/fleet/src/drivers/service.test.ts` — clearing an optional field persists as cleared, proven by round-tripping rather than by asserting the request shape
- [ ] T060 [P] [US3] Test in `apis/edge-api/fleet/src/shared/audit.test.ts` — a change to the emergency contact records **that the field changed and NOT its value** (FR-024)

**Checkpoint**: the driver record is complete and the licence is a fact the platform can act on.

---

## Phase 6: User Story 4 — See who cannot be given work, and why (P4)

**Goal**: one view lists every blocked driver with **every** applicable reason in words.

**Independent test**: create drivers in each blocked state and confirm each shows its own reason; an unblocked driver appears nowhere.

- [ ] T061 [US4] Extend `BLOCKED_REASONS` in `apis/edge-api/fleet/src/drivers/sql.ts` with `no_vehicle` and `vehicle_non_compliant`, derived by joining the open holding and its vehicle — ⚠ extending the existing fragment, never writing a second predicate (research R8)
- [ ] T062 [US4] Add the licence-class rule to `apis/edge-api/fleet/src/drivers/sql.ts` as a rule with a single current case, so `licence_class_insufficient` is reachable the day a heavier vehicle exists (research R7, FR-027)
- [ ] T063 [P] [US4] Container test C8 in `apis/edge-api/fleet/src/schema.container.test.ts` — `BLOCKED_REASONS` emits **every** applicable reason, not the first found (FR-026)
- [ ] T064 [P] [US4] Container test C9 in `apis/edge-api/fleet/src/schema.container.test.ts` — an expired licence yields a reason naming the licence (FR-027, SC-005)
- [ ] T065 [P] [US4] Container test C10 in `apis/edge-api/fleet/src/schema.container.test.ts` — a holder of a non-compliant vehicle is blocked with a reason naming **the vehicle**, not the driver (FR-027)
- [ ] T066 [US4] Extend `apis/edge-api/fleet/src/readiness/repository.ts` and `service.ts` to carry the new reasons through to the readiness payload
- [ ] T067 [US4] Add the two new labels to `BLOCKED_LABEL` in `apps/back-office/src/features/drivers/model.ts` and render them in `components/ReadinessPanel.tsx`
- [ ] T068 [P] [US4] Test in `apps/back-office/src/features/drivers/model.test.ts` that `BLOCKED_LABEL` is **exhaustive over `DriverBlockedReason`**, so a future widening fails the suite instead of rendering a blank reason (risk K1, NP12)
- [ ] T069 [P] [US4] Test in `apis/edge-api/fleet/src/readiness/service.test.ts` that a driver who can work does **not** appear in the readiness view at all (FR-028)

**Checkpoint**: the recorded facts now produce an operational answer, and it is the answer slice C's engine will agree with.

---

## Phase 7: User Story 5 — Record where each shop is (P5)

**Goal**: every fulfillment shop carries a street address; a missing one is visible as a gap.

**Independent test**: give every active shop an address, leave one without, confirm the gap shows.

- [ ] T070 [P] [US5] Add the five address fields to the shop DTOs in `packages/shared-types/src/shop.ts` (or the existing shop admin types), all optional
- [ ] T071 [US5] Extend `apis/edge-api/admin/src/shops/repository.ts` and `service.ts` to read and write the address fields, ⚠ **on the routes that already exist — no new function** (research R3, `edge-admin` is at ~434/500 CloudFormation resources)
- [ ] T072 [US5] Validate `postcode` against `^[0-9]{4}$` in `apis/edge-api/admin/src/shops/service.ts` and refuse a malformed value by name — a bad postcode matches no zone in slice C and would produce a shop nobody can be sent to, silently
- [ ] T073 [P] [US5] Add the address fields to the shop form and detail rows in `apps/back-office/src/features/shops/`
- [ ] T074 [US5] Render a missing address as a **named gap** in `apps/back-office/src/features/shops/ShopsListScreen.tsx` rather than as blank space (FR-030)
- [ ] T075 [US5] ⚠ Write a source guard in `apis/edge-api/admin/src/shops/hidden-fulfilment.guard.test.ts` asserting no customer-facing payload carries a shop address field — hidden fulfilment is a platform invariant (FR-031 neighbourhood, risk K4, NP9)
- [ ] T076 [P] [US5] Write a guard in `apis/edge-api/fleet/src/vehicles/no-coordinates.guard.test.ts` asserting `public.shop` and `public.vehicle` declare no `latitude`/`longitude` column, reading the migration source (FR-031, NP10)

**Checkpoint**: a driver can be told where to collect from, in the slice that needs it.

---

## Phase 8: User Story 6 — A driver says when they expect to finish (P6)

**Goal**: an optional expected finish time on a duty period, presented as **unknown** when absent.

**Independent test**: go on duty with and without a finish time; confirm the two are distinguishable everywhere.

- [ ] T077 [P] [US6] Add `expectedEndAt` to `DutyRequest`, `DutyResponse` and `OnDutyDriver` in `packages/shared-types/src/driver.ts`
- [ ] T078 [US6] Extend `apis/edge-api/driver/src/driver/repository.ts` and `service.ts` to accept and store `expected_end_at` when going on duty
- [ ] T079 [US6] Extend `apis/edge-api/fleet/src/duty/repository.ts` to return `expectedEndAt` and whether it has passed, for the back-office duty panel (FR-034)
- [ ] T080 [P] [US6] Render the expected finish, or the word **unknown**, in `apps/back-office/src/features/drivers/components/DutyPanel.tsx` — ⚠ never a substituted default (FR-033)
- [ ] T081 [P] [US6] Add the optional finish-time entry to the go-on-duty flow in `apps/driver-mobile/shared/src/commonMain/kotlin/com/effyshopping/driver/mobile/features/driver/`
- [ ] T082 [P] [US6] ⚠ Write the test in `apps/back-office/src/features/drivers/components/DutyPanel.test.tsx` that a null `expectedEndAt` renders as unknown and that **no default shift length is substituted anywhere** (NP11 — one of the two negative proofs that otherwise leave a green suite)

**Checkpoint**: slice C's feasibility gate has an input, and an honest answer when it does not.

---

## Phase 9: User Story 7 — The platform stops being able to record a driver's location (P7)

**Goal**: no interface accepts a driver location; nothing stores one.

**Independent test**: confirm by searching the platform's own surfaces that neither exists.

- [X] T083 [US7] Delete `apis/edge-api/driver/src/functions/driver-location-v1-post.ts` and the `recordLocation` function in `apis/edge-api/driver/src/driver/service.ts` and its repository counterpart
- [X] T084 [US7] Remove the `driverLocationV1` function and its route from `apis/edge-api/driver/serverless.yml`
- [X] T085 [US7] Remove `LocationRequest` from `packages/shared-types/src/driver.ts` and from the `DriverContract` aggregator in `packages/shared-types/src/driver-contract.ts`
- [X] T086 [US7] ⚠ Regenerate the committed Kotlin contract with `pnpm --filter @effy/shared-types driver-contract:gen` and verify the driver app still compiles — note in the task record that `driver-contract:check` was **already red at clean HEAD** (a pre-existing `ProblemJSON` and `DriverRunType` drift), so the diff must be inspected rather than trusted
- [X] T087 [US7] ⚠ Add a negative route guard to `apis/edge-api/driver/src/config.contract.test.ts` asserting no route path contains `location` — the same shape as the "schedules nothing" guard added when 049's sweep was removed (risk K6, NP8)
- [X] T088 [US7] Update the comment in `apis/edge-api/fleet/src/duty/repository.ts` that refers to the location snapshot, so no comment outlives the thing it describes

**Checkpoint**: the trap identified in the audit is closed — a receiver with no sender is gone, not dormant.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [ ] T089 [P] Write `db/seeds/061_fleet_dev.sql` — Melbourne shop addresses (real suburbs and postcodes, fictional street lines) and vehicles covering every body type and every refrigeration capability, with fictional plates (FR-039, FR-040)
- [ ] T090 [P] Run `make check-no-phantm` and the banned-address sweep over `db/seeds/061_fleet_dev.sql` and `specs/061-fleet-foundations/`
- [ ] T091 [P] Update the parity register `docs/audiences/driver-capabilities.md` with a §061 section, replacing the teardown notice's claim that vehicle and licence facts are unbuilt
- [ ] T092 [P] Update `docs/logistics-engine-architecture.md` §5 to mark Slice A built, and `docs/research/logistics/decisions-01-running.md` where D8/D9/D21/D22/D23/D24 are now implemented rather than decided
- [ ] T093 Execute negative proofs **NP1–NP6** from [quickstart.md](quickstart.md) §6 by breaking each constraint and confirming the matching container test fails
- [ ] T094 Execute negative proofs **NP7–NP12** from quickstart §6 — ⚠ **NP11 and NP12 are the two that otherwise leave a green suite and a feature that looks like it works**
- [ ] T095 [P] Run the full machine sweep from quickstart §1 — `pnpm -r typecheck` (expect 20/20), `pnpm -r test`, `tokens:check` **unchanged**, `brand-check`, the retired-hue sweeps
- [ ] T096 [P] Confirm the **unchanged-suite proof** by running `pnpm -r test` and inspecting `git diff` for edited expectations: `edge-admin`, `edge-customer`, `edge-shop`, `edge-orders`, `customer-web` and `shop-web` all pass **without their expectations being edited**
- [ ] T097 Run `CONTAINER_TESTS=1 pnpm --filter @effy/edge-fleet test` with Docker up and record C1–C10 — ⚠ **if Docker is down, say so in the sign-off rather than reporting a green suite** (risk K2; 059 shipped 40 container tests that had never run, 058's found three defects afterwards)
- [ ] T098 Write `specs/061-fleet-foundations/SIGNOFF.md` recording what is verified, what is unrun, and every open operator item

### Operator steps (NOT run by Claude — hand these over with exact commands)

- [ ] T099 **OPERATOR** Commit the migration, then `make db-up ENV=dev` (003 commit-guard) — ⚠ DESTRUCTIVE, drops six columns
- [ ] T100 **OPERATOR** Load the seeds: `psql "$(infra/scripts/db-dsn.sh dev)" -f db/seeds/061_fleet_dev.sql`
- [ ] T101 **OPERATOR** `make edge-deploy SERVICE=fleet ENV=dev` — ⚠ **before** the console, or every screen 404s
- [ ] T102 **OPERATOR** `make edge-deploy SERVICE=admin ENV=dev` (shop address fields)
- [ ] T103 **OPERATOR** `make edge-deploy SERVICE=driver ENV=dev` — last; it is the step that removes a route
- [ ] T104 **OPERATOR** Push to `dev` so Amplify deploys the back-office console
- [ ] T105 **OPERATOR** Walk **W1–W20** from [quickstart.md](quickstart.md) §5 — ⚠ **W18 is the most important** (stand down a driver holding a vehicle). 039 shipped four live defects with a fully green suite because layout, contrast and hierarchy are not properties a DOM assertion can see

---

## Dependencies & Execution Order

### Phase dependencies

```
Phase 1 Setup
   ↓
Phase 2 Foundational  ← BLOCKING: the migration + shared types + the enum audit
   ↓
   ├── Phase 3  US1 vehicle register      (P1) 🎯 MVP
   │      ↓
   │   Phase 4  US2 holdings              (P2) — needs US1's vehicle to exist
   ├── Phase 5  US3 driver record         (P3) — independent of US1/US2
   ├── Phase 7  US5 shop address          (P5) — fully independent, different service
   ├── Phase 8  US6 duty finish time      (P6) — fully independent, different service
   └── Phase 9  US7 remove location       (P7) — fully independent, different service
          ↓
       Phase 6  US4 readiness             (P4) — needs US2 (vehicle facts) + US3 (licence class)
          ↓
       Phase 10 Polish
```

### User story dependencies

- **US1** depends only on Phase 2.
- **US2** depends on US1 — there must be a vehicle to hand over.
- **US3, US5, US6, US7** are independent of everything except Phase 2, and of each other. US5, US6 and US7 touch **different services** (`edge-admin`, `edge-driver`) and can proceed entirely in parallel with the `edge-fleet` work.
- **US4** is the only story that genuinely needs two others — it reports on vehicle facts (US2) and licence facts (US3).

### Parallel opportunities

- **Phase 1**: T002, T003, T004 together.
- **Phase 2**: T013, T014 together after the migration statements land. ⚠ **T015 (the enum-reader audit) must finish before any Phase 6 work begins.**
- **Phase 3**: T022–T026 (five independent handler files); T029, T030 with them; T033, T034 together.
- **Phase 4**: T039, T040, T041 together; T045, T046 together; T050, T051 together. ⚠ **T037 and T038 are NOT parallel with each other** — both exercise concurrency and must be observed separately.
- **Across phases**: a second person can take US5 + US6 + US7 (three different services, no shared file) while the first builds US1 → US2.

### Within each user story

Tests → repository → service → handlers → routes → console → console tests.

---

## Implementation Strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (US1).** That alone answers the question Effy cannot answer today —
what vehicles do we have, and which are roadworthy. It ships without any other story.

**Then US2**, which together with US1 delivers the operator's actual ask: a fleet that can be described
and handed out.

**US5, US6 and US7 can be done at any point after Phase 2** and are the natural parallel track, because
each lives in a different service from the vehicle work.

**US4 last among the feature stories**, because it reports on facts the earlier ones create.

⚠ **Do not start Phase 6 until T015 is done.** Widening `DriverBlockedReason` without auditing its
readers is the defect 053, 056 and 057 each shipped — and the console's `BLOCKED_LABEL` is a `Record<>`
where a missing key renders nothing at all, which reads as "this driver is not blocked".

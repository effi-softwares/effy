---
description: "Task list for 056-driver-management"
---

# Tasks: Back-Office Driver Management

**Input**: Design documents from `/specs/056-driver-management/`

**Prerequisites**: [plan.md](./plan.md) · [spec.md](./spec.md) · [research.md](./research.md) ·
[data-model.md](./data-model.md) · [contracts/fleet-api.contract.md](./contracts/fleet-api.contract.md) ·
[quickstart.md](./quickstart.md)

**Tests**: Included. Not because TDD was requested, but because this feature's three highest-value
requirements are each **a correction of a defect that a passing test suite already covers**, and a
correction with no test is indistinguishable from a comment. Where a test exists to prove a fix, the
task says **how to prove it by breaking it**.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelisable — different files, no dependency on an incomplete task
- **[Story]**: US1…US6 from [spec.md](./spec.md); Setup/Foundational/Polish carry no story label
- **[OPERATOR]**: run by the operator, never by the assistant (CLAUDE.md § Mode of work)

---

## Phase 1: Setup — the new cold-path service

**Purpose**: stand up `apis/edge-api/fleet` as a deployable, testable, empty service before any
behaviour goes in it. Research [R1](./research.md#r1).

- [X] T001 Create `apis/edge-api/fleet/package.json` as `@effy/edge-fleet`, modelled on `apis/edge-api/inventory/package.json` — same dependency set (`@effy/edge-shared`, `@effy/shared-types`, `pg`, `pino`) and the same `lint`/`typecheck`/`test` scripts
- [X] T002 [P] Create `apis/edge-api/fleet/.gitignore` — ⚠ **mandatory and first-class**: 052 found `edge-api/notifications` was the only service without one and had committed 1.7 MB of build artifacts including a `serverless-state.json` carrying resolved DB hostname, username and secret ARNs, which is **still in history**. Copy `apis/edge-api/inventory/.gitignore` verbatim
- [X] T003 [P] Create `apis/edge-api/fleet/tsconfig.json` and `apis/edge-api/fleet/vitest.config.ts` from the inventory service's
- [X] T004 Create `apis/edge-api/fleet/serverless.yml` — `service: effy-edge-fleet`, `provider.httpApi.id` from `/effy/${sls:stage}/edge/http_api_id`, `versionFunctions` left at its default (this stack is new and has ~90 resources of headroom), health routes `/fleet/healthz` + `/fleet/readyz` only
- [X] T005 Declare the fleet service's IAM in `apis/edge-api/fleet/serverless.yml`: the four scoped `cognito-idp:Admin*` actions on `${ssm:/effy/${sls:stage}/auth/driver/user_pool_arn}` ONLY (copied from the admin stack's driver block — **no `AddUserToGroup`**, the driver pool defines no groups) and `s3:GetObject` on the media bucket for proof presigning ([R4](./research.md#r4))
- [X] T006 Register the service in the workspace: add `apis/edge-api/fleet` wherever `apis/edge-api/inventory` is listed (`pnpm-workspace.yaml` glob check, then `pnpm install`)
- [X] T007 Add `fleet` to the `SERVICE=` usage strings of `edge-deploy` and `edge-remove` in `Makefile:307` and `Makefile:314`
- [X] T008 Verify the empty service builds and deploys shape-only: `cd apis/edge-api/fleet && pnpm typecheck && pnpm exec serverless package --stage dev`

**Checkpoint**: an empty service exists, packages cleanly, and is registered everywhere.

---

## Phase 2: Foundational — blocking prerequisites

**⚠ CRITICAL**: no user story may begin until this phase is complete.

### The migration

- [X] T009 Create `db/migrations/<ts>_driver_management.sql` per [data-model §1–§3](./data-model.md): widen `public.driver.status` to `('active','suspended','offboarded')` mapping `disabled → offboarded` **before** replacing the CHECK; add the ten profile columns; add `resolved_at`/`resolved_by_sub`/`resolution_note` + a partial index to **both** `public.delivery_failure` and `public.collection_task_issue`; add the three driver indexes. `COMMENT ON` every new column
- [X] T010 Confirm the migration creates **no new table** and drops nothing — read it back against [data-model.md](./data-model.md). This feature is a reader; a new table in this file is a design error, not a detail

### The status widening (the one edit outside this feature's own code)

- [X] T011 Widen the status union at `apis/edge-api/driver/src/driver/repository.ts:22` from `"active" | "disabled"` to the three-value union. ⚠ It **must fail to compile** first — that failure is the proof the type was load-bearing
- [X] T012 Add `apis/edge-api/fleet/src/drivers/status-guard.test.ts` asserting that a `suspended` and an `offboarded` driver are **not** returned by the assignment-eligibility predicate. ⚠ Prove it by breaking it: change one of the six `d.status = 'active'` sites to `d.status <> 'offboarded'` and confirm the test goes red. Restore. This is the 055 lesson ([R2](./research.md#r2)) — a negative test against a widening enum is a latent defect, and "all six happen to be positive today" is not a property that survives the next edit

### Shared contracts

- [X] T013 Expand the `AdminDriver*` family in `packages/shared-types/src/driver.ts` per [contracts/fleet-api.contract.md](./contracts/fleet-api.contract.md) — `AdminDriverListItem`, `AdminDriverProfile`, `AdminDriverCreateRequest`, `AdminDriverUpdateRequest`, `AdminDriverStatusRequest`, `DriverException`, `OnDutyDriver`, `UnassignedWorkSummary`, `StrandedWork`, `DriverRunSummary`, `DriverRunDetail`, `DriverPeriodSummary`, `DriverAuditEntry`, `BlockedDriver`, `ZoneCoverage`, `ExpiringCredential`. Counts are `WireInt`; **no money field anywhere** (FR-049); phone and emergency contact appear on the profile DTO **only**, never in a list item
- [X] T014 Widen `DriverStatus` to the three values and confirm nothing regenerates Kotlin: `apps/driver-mobile` has no `core/contract/` directory and no drift guard ([R13](./research.md#r13)) — assert by running `make cm-contract-check` and `make sm-contract-check`, both of which must be unaffected

### Service spine

- [X] T015 [P] Move `apis/edge-api/admin/src/drivers/authz.ts` to `apis/edge-api/fleet/src/shared/authz.ts` unchanged (`isActiveStaff` / `canManageDrivers`, decided from `admin.staff`, fail-closed)
- [X] T016 [P] Move `apis/edge-api/admin/src/drivers/handler-support.ts` to `apis/edge-api/fleet/src/shared/handler-support.ts`; extend the problem mapping with `409` (conflict) and keep the `503`-on-authz-throw behaviour
- [X] T017 [P] Create `apis/edge-api/fleet/src/shared/audit.ts` — one writer for `admin.audit_log` with `target_type = 'driver'` and the seven actions in [data-model §6](./data-model.md). ⚠ It MUST strip PII from `detail`: a changed phone, emergency contact or licence reference is recorded as **changed**, never as a before/after value
- [X] T018 [P] Create `apis/edge-api/fleet/src/shared/config.ts` — the two thresholds from [R11](./research.md#r11) (`FLEET_DUTY_OVERDUE_HOURS` default 14, `FLEET_EXPIRY_WARNING_DAYS` default 30), declared in `serverless.yml`
- [X] T019 Create `apis/edge-api/fleet/src/shared/config.contract.test.ts` reading the **real** `serverless.yml` and asserting every env var the service reads is declared there. ⚠ This is the fifth guard against 035's defect — four env vars the code read and `serverless.yml` never declared, where 100 passing tests missed it **because the tests set those vars themselves**
- [X] T020 Add `apis/edge-api/fleet/src/shared/audit.test.ts` proving the PII strip: edit every profile field, assert the resulting `detail` payload contains no phone, emergency contact or licence reference (FR-050)

### Console spine

- [X] T021 [P] Create `apps/back-office/src/features/drivers/repo.ts` and `queries.ts` — the api-client calls and TanStack Query keys for the fleet service
- [X] T022 [P] Create `apps/back-office/src/features/drivers/errorText.ts` mapping refusals to sentences. ⚠ It **must handle the api-client's plain-object throw**, not `e instanceof Error`: 053 shipped a console where every refusal collapsed to one generic sentence for exactly this reason, after the server had got the refusal right. Add `errorText.test.ts` constructing the real throw shape
- [X] T023 [P] Create `apps/back-office/src/features/drivers/access.ts` — in-screen role gating that mirrors the backend gate (read = any active staff incl. csa; mutate = admin/manager), never a second source of truth
- [X] T024 Create `apps/back-office/src/routes/drivers.tsx` with `/drivers` and `/drivers/$driverId` nested under `appRoute`, and add the `Drivers` entry to `apps/back-office/src/components/layout/nav.ts` with **no `requiredRole`** and a comment recording why csa reads it (FR-022)

**Checkpoint**: migration written, contracts shared, service spine and console shell in place. User stories may now proceed.

---

## Phase 3: User Story 1 — the register and the profile of record (P1) 🎯 MVP

**Goal**: find any driver and read a complete profile of record; edit it, including clearing fields.

**Independent test**: with several drivers seeded, find one by partial name, by email and by zone; open
the profile; confirm every recorded fact is on the page; set and then clear each optional field and
confirm it stays cleared after reload.

### Backend

- [X] T025 [US1] Create `apis/edge-api/fleet/src/drivers/repository.ts` — `listDrivers` (search on `name` via trigram + `work_email` equality, filters on status and zone, `includeOffboarded` default false) and `getDriver` (full profile join to zone and hub). ⚠ Keyset paging ordered `(name, id)` with the cursor minted from **the same expression the ORDER BY uses** ([R9](./research.md#r9))
- [X] T026 [US1] Add `updateDriver` to `apis/edge-api/fleet/src/drivers/repository.ts` — ⚠ **absent ≠ null**: build the SET clause from the keys **present** in the patch, so a key with `null` clears the column. This replaces the `COALESCE($n, col)` form, which cannot distinguish "leave alone" from "clear" (FR-010). Guard with `AND updated_at = $n` for optimistic concurrency ([R12](./research.md#r12))
- [X] T027 [US1] Create `apis/edge-api/fleet/src/drivers/service.ts` — validation (name required and trimmed; email format; dates sane), `not_found`, `conflict` and `validation` error kinds, and the audit write on update
- [X] T028 [P] [US1] Create `apis/edge-api/fleet/src/functions/drivers-list-v1-get.ts` and wire `GET /fleet/v1/drivers` in `serverless.yml` behind the back-office authorizer
- [X] T029 [P] [US1] Create `apis/edge-api/fleet/src/functions/driver-get-v1-get.ts` and wire `GET /fleet/v1/drivers/{driverId}`
- [X] T030 [P] [US1] Create `apis/edge-api/fleet/src/functions/driver-update-v1-patch.ts` and wire `PATCH /fleet/v1/drivers/{driverId}`
- [X] T031 [US1] Add `accountState` resolution to `getDriver` (`ok | record_only | identity_only`) by reading the identity account, so a half-provisioned driver **shows the discrepancy** rather than rendering as normal ([plan risk 1](./plan.md#risks-carried-into-implementation))

### Backend tests

- [X] T032 [US1] Add `apis/edge-api/fleet/src/drivers/repository.container.test.ts` — the **SC-013 paging proof**: seed 500 drivers, page the whole register at `limit=25` **through the service**, assert 500 distinct ids with no duplicate and no gap. ⚠ It must go through the service because that is where the cursor is minted — 053's paging test called the repository directly, supplied its own cursor, and **passed with the defect in place**
- [X] T033 [US1] Add the **SC-010 clearing proof** to the same container test: set every optional column, then patch each to `null`, re-read and assert each is actually `NULL`. ⚠ Prove it by breaking it: restore the `COALESCE` form and confirm the test goes red
- [X] T034 [P] [US1] Add `apis/edge-api/fleet/src/drivers/service.test.ts` — search, filter and validation refusals, each asserting the refusal names the field

### Console

- [X] T035 [US1] Create `apps/back-office/src/features/drivers/DriversListScreen.tsx` — a **table** (Principle V: no cards), columns name / work email / zone / duty state / status, with the search box and the status + zone filters. ⚠ It **must consume `nextCursor`**: 053 shipped one no UI read, capping its console at the newest 25 rows
- [X] T036 [US1] Create `apps/back-office/src/features/drivers/DriverDetailScreen.tsx` — a sectioned page of **detail rows** (no cards): identity, contact, work assignment, vehicle, credentials, employment, notes, account state
- [X] T037 [P] [US1] Create `apps/back-office/src/features/drivers/components/ProfileEditForm.tsx` — sends only the keys the operator touched, `null` for a cleared field, and carries `updatedAt`; renders the `409` conflict as a named refusal, not a generic failure
- [X] T038 [P] [US1] Wire the zone picker to the **existing** `GET /admin/v1/delivery/zones` — no new route (verified: `apis/edge-api/admin/serverless.yml:872`)
- [X] T039 [P] [US1] Add `apps/back-office/src/features/drivers/DriversListScreen.test.tsx` and `DriverDetailScreen.test.tsx` — empty state, loading state, error state, csa sees **no** editing control (absent, not disabled)

**Checkpoint**: US1 is independently shippable — a usable register and a readable, editable profile.

---

## Phase 4: User Story 2 — onboarding and offboarding (P1)

**Goal**: create a driver who can sign in; suspend, restore and offboard them safely, with every action
audited and held work surfaced rather than stranded silently.

**Independent test**: create a driver, sign in to the driver app as them; suspend, confirm sign-in fails;
restore, confirm it works; offboard, confirm the record and history survive.

### Backend

- [X] T040 [US2] Move `apis/edge-api/admin/src/drivers/cognito.ts` to `apis/edge-api/fleet/src/drivers/cognito.ts`. ⚠ **Change `ensureDriverUser`**: it currently swallows `UsernameExistsException`, re-enables a disabled account and returns the existing sub. Split it into `createDriverUser` (which **propagates** the exists exception) and `enable`/`disable`, so create can refuse (FR-014)
- [X] T041 [US2] Add `createDriver` to `apis/edge-api/fleet/src/drivers/service.ts` — Cognito-first, then the record insert keyed on the returned sub. ⚠ **Refuse a duplicate work email with `409`**, naming the existing driver's id, name and status. It must **never** edit or re-activate them. Today's path upserts on conflict; the `citext UNIQUE` index that makes the refusal a database guarantee already exists
- [X] T042 [US2] Add `setStatus` to `apis/edge-api/fleet/src/drivers/service.ts` — the three-state transition with a required reason, writing `status`, `status_reason`, `status_changed_at`, mirroring onto the identity account, and auditing. `offboarded` is terminal for access (no restore path offered)
- [X] T043 [US2] Create `apis/edge-api/fleet/src/stranded/repository.ts` — the derived stranded-work query from [data-model §5a](./data-model.md). ⚠ **Derived, never stored** (027's counted-not-stored rule): collection tasks in `('collected','short')` on a live run, or delivery tasks in `('out_for_delivery','en_route','arrived')`, owned by a driver who is not active or has no open duty session
- [X] T044 [US2] Add the held-work guard to `setStatus`: leaving `active` while the driver holds started work returns `409 held_work` itemising the packages and the affected orders, unless `acknowledgeHeldWork` is `true` (FR-020)
- [X] T045 [P] [US2] Create `apis/edge-api/fleet/src/functions/driver-create-v1-post.ts` and wire `POST /fleet/v1/drivers`
- [X] T046 [P] [US2] Create `apis/edge-api/fleet/src/functions/driver-status-v1-post.ts` and wire `POST /fleet/v1/drivers/{driverId}/status`
- [X] T047 [P] [US2] Create `apis/edge-api/fleet/src/functions/stranded-list-v1-get.ts` and wire `GET /fleet/v1/stranded`
- [X] T048 [P] [US2] Create `apis/edge-api/fleet/src/functions/driver-audit-v1-get.ts` and wire `GET /fleet/v1/drivers/{driverId}/audit` (FR-025)

### Backend tests

- [X] T049 [US2] Add the **SC-005 duplicate-refusal proof** to `apis/edge-api/fleet/src/drivers/service.test.ts`: creating with an in-use work email is refused, and the existing driver's name, zone, vehicle and status are **byte-identical before and after the attempt**. Repeat for an **offboarded** driver and assert their identity account **stays disabled**
- [X] T050 [US2] Add the **SC-006 held-work proof** (container-backed): a driver holding a `collected` package cannot be suspended without acknowledgement; once suspended, the package appears in the stranded query attributed to that driver and that order. ⚠ Prove the query by breaking it — widen it to include `assigned` tasks and confirm it starts reporting work the sweep would have reclaimed on its own
- [X] T051 [P] [US2] Add `apis/edge-api/fleet/src/drivers/status.test.ts` — every transition, the required reason, the identity mirror, and the audit row per transition

### Console

- [X] T052 [US2] Create `apps/back-office/src/features/drivers/components/CreateDriverDialog.tsx` — name + work email required, every profile field optional; renders the duplicate refusal with the existing driver named and linked
- [X] T053 [US2] Create `apps/back-office/src/features/drivers/components/StatusControl.tsx` — the three-state control with a required reason. ⚠ On `409 held_work` it renders the itemised held work and the affected orders and requires a second, explicit confirmation. ⚠ Its copy must say **access ends now, work is reclaimed on the next round** — implying a suspended driver is cleared of work when they are not is the exact failure this feature exists to prevent ([plan risk 2](./plan.md#risks-carried-into-implementation))
- [X] T054 [P] [US2] Create `apps/back-office/src/features/drivers/components/AuditTrail.tsx` — the change history on the profile, newest first, in plain language
- [X] T055 [P] [US2] Add `StatusControl.test.tsx` asserting the held-work warning renders its itemisation and that confirming without acknowledgement is impossible

**Checkpoint**: a driver can be hired, stood down, restored and offboarded, with every action audited.

---

## Phase 5: User Story 3 — delivery exceptions reach a person (P2)

**Goal**: read every undeliverable drop and every missing/short package report, link to the order, and
resolve them. ⚠ This closes the order-flow register's **top structural gap**.

**Independent test**: have a driver mark a drop undeliverable and report a short package; confirm both
appear in back-office in the same session with reason, note, driver and order, and can be resolved.

**Depends on**: Phase 2 only. Independent of US1 and US2.

### Backend

- [X] T056 [US3] Create `apis/edge-api/fleet/src/exceptions/repository.ts` — a union read over `public.delivery_failure` and `public.collection_task_issue` with the `kind`, `resolved`, `driverId` and date filters, each row carrying `orderId` + `orderReference` for the one-step link (FR-030). ⚠ Until this task, **nothing on the platform read either table**
- [X] T057 [US3] Add `outstandingCount` to the same repository, served from the two partial indexes so the landing count is cheap (FR-032)
- [X] T058 [US3] Create `apis/edge-api/fleet/src/exceptions/service.ts` — `resolve(kind, id, note)` writing `resolved_at`/`resolved_by_sub`/`resolution_note` and an audit row; `409` if already resolved; resolution is one-way and never deletes (FR-031)
- [X] T059 [P] [US3] Create `apis/edge-api/fleet/src/functions/exceptions-list-v1-get.ts` and wire `GET /fleet/v1/exceptions`
- [X] T060 [P] [US3] Create `apis/edge-api/fleet/src/functions/exception-resolve-v1-post.ts` and wire `POST /fleet/v1/exceptions/{kind}/{exceptionId}/resolve`

### Backend tests

- [X] T061 [US3] Add `apis/edge-api/fleet/src/exceptions/repository.container.test.ts` — the **SC-003 completeness proof**: insert N failures and M issues directly, assert the unfiltered read returns exactly N+M. This is a **measurement, not a spot check**; a filter that silently drops a kind is the failure mode
- [X] T062 [P] [US3] Add `apis/edge-api/fleet/src/exceptions/service.test.ts` — resolve once, resolve twice (`409`), and assert a resolved exception is still readable

### Console

- [X] T063 [US3] Create `apps/back-office/src/features/drivers/components/ExceptionsList.tsx` — a **list** (no cards) with reason, note, driver, order, suburb and time; filters for kind, resolved and driver
- [X] T064 [US3] Surface the outstanding count on entering Drivers as a **labelled figure in a section header** — ⚠ explicitly **not a metric card** (Principle V; [R15](./research.md#r15))
- [X] T065 [P] [US3] Add the per-driver exceptions section to `DriverDetailScreen.tsx` (FR-029, US3 scenario 6)
- [X] T066 [P] [US3] Create `apps/back-office/src/features/drivers/components/ResolveExceptionDialog.tsx` — note required, records who resolved it
- [X] T067 [P] [US3] Add `ExceptionsList.test.tsx` — empty state, the one-step order link, and that a resolved exception leaves the outstanding list but stays readable

**Checkpoint**: the exceptions the driver app has been writing since 049 finally have a reader.

---

## Phase 6: User Story 4 — who is working right now (P2)

**Goal**: see who is on duty and what they are doing, see work waiting for a driver, end a stuck duty
session, and release stranded work back to the pool.

**Independent test**: with one driver on duty mid-run and one off duty, the duty view distinguishes them,
shows the run's progress, and reports ready work no driver has been given.

**Depends on**: Phase 2; and on **T043** (stranded detection) from US2 for the release action.

### Backend

- [X] T068 [US4] Create `apis/edge-api/fleet/src/duty/repository.ts` — on-duty drivers with session start, current run type, progress against total, and next stop (FR-034, FR-035)
- [X] T069 [US4] Extract the assignment sweep's candidate predicate to a shared SQL constant and use it for the unassigned-work count. ⚠ Add a test asserting the console's predicate and `apis/edge-api/driver/src/assignment/repository.ts`'s **agree** ([R6](./research.md#r6)) — if the console computed it independently the screen would eventually be confidently wrong about the one question it exists to answer
- [X] T070 [US4] Add overdue-session detection using `FLEET_DUTY_OVERDUE_HOURS`, and `endDutySession` closing an open session with an audit row (FR-037)
- [X] T071 [US4] Create `apis/edge-api/fleet/src/stranded/service.ts` — `release()` deleting the task rows the way the sweep does for un-started work, writing a `driver_task_event` and an audit row, in one transaction (FR-021)
- [X] T072 [P] [US4] Create `apis/edge-api/fleet/src/functions/duty-v1-get.ts` and wire `GET /fleet/v1/duty`
- [X] T073 [P] [US4] Create `apis/edge-api/fleet/src/functions/duty-end-v1-post.ts` and wire `POST /fleet/v1/duty/{sessionId}/end`
- [X] T074 [P] [US4] Create `apis/edge-api/fleet/src/functions/stranded-release-v1-post.ts` and wire `POST /fleet/v1/stranded/release`

### Backend tests

- [X] T075 [US4] Add `apis/edge-api/fleet/src/duty/repository.container.test.ts` — on/off duty separation, run progress, and that ready-but-unassigned work is counted when nobody is on duty
- [X] T076 [US4] Add the **release proof** (container-backed): release a stranded package, then run the assignment sweep and assert an eligible driver receives it. ⚠ This is the proof the release is real and not just a delete
- [X] T077 [US4] Add the **FR-038 negative proof** — a test over the whole `serverless.yml` route table asserting **no route accepts a target driver id for work**. Assignment stays automatic; assert it mechanically rather than trusting review

### Console

- [X] T078 [US4] Create `apps/back-office/src/features/drivers/components/DutyPanel.tsx` — a **list** of on-duty drivers with time on duty, current activity, run progress and next stop
- [X] T079 [US4] Add the unassigned-work statement to the duty panel — ⚠ when nobody is on duty while work is ready, the screen must **say so**, not leave it invisible
- [X] T080 [P] [US4] Create `apps/back-office/src/features/drivers/components/StrandedWorkPanel.tsx` — the stranded list with the release action (admin/manager only), note required
- [X] T081 [P] [US4] Add the overdue-session flag and the end-session action to `DutyPanel.tsx`, gated to admin/manager
- [X] T082 [P] [US4] Add `DutyPanel.test.tsx` and `StrandedWorkPanel.test.tsx` — empty states, the csa read-only gate, and the "nobody on duty, work waiting" statement

**Checkpoint**: the automatic assignment model is observable, and stranded work is recoverable.

---

## Phase 7: User Story 5 — a driver's work record (P3)

**Goal**: read what a driver actually did, including the proof captured for a disputed delivery.

**Independent test**: for a driver who has completed a collection run and a delivery round, the history
lists both by working day, and a completed drop shows its proof.

**Depends on**: Phase 2 and US1's profile screen.

### Backend

- [X] T083 [US5] Create `apis/edge-api/fleet/src/history/repository.ts` — runs by working day newest first with type, outcome and volume; keyset paging on `(created_at, id)` with the cursor minted from the same expression ([R9](./research.md#r9))
- [X] T084 [US5] Add `getRunDetail` — ordered stops/drops with the time each state was reached, projected from `driver_task_event` (FR-040)
- [X] T085 [US5] Add `getProof` — reuse `presignRead` from `@effy/edge-shared` ([R4](./research.md#r4)); write an `admin.audit_log` `driver.proof.viewed` row when the URL is issued. ⚠ Comment at the call site that this records the **issuing**, not the fetching — the honest limit of presigning
- [X] T086 [US5] Add `getPeriodSummary` — days worked, runs completed, packages collected, drops delivered, drops failed. ⚠ Counts only; **no currency** (FR-049)
- [X] T087 [P] [US5] Create `apis/edge-api/fleet/src/functions/driver-history-v1-get.ts` and wire `GET /fleet/v1/drivers/{driverId}/history`
- [X] T088 [P] [US5] Create `apis/edge-api/fleet/src/functions/run-get-v1-get.ts` and wire `GET /fleet/v1/runs/{runId}`
- [X] T089 [P] [US5] Create `apis/edge-api/fleet/src/functions/drop-proof-v1-get.ts` and wire `GET /fleet/v1/drops/{deliveryTaskId}/proof`

### Backend tests

- [X] T090 [US5] Add `apis/edge-api/fleet/src/history/repository.container.test.ts` — history paging (no duplicate, no gap), run detail ordering, and that period summary counts match the underlying rows
- [X] T091 [P] [US5] Add a test asserting the proof response carries **no durable URL** and that issuing one writes the audit row (SC-012's second half)

### Console

- [X] T092 [US5] Create `apps/back-office/src/features/drivers/components/WorkHistory.tsx` — runs by day as a **list**, each openable to its stops/drops timeline
- [X] T093 [P] [US5] Create `apps/back-office/src/features/drivers/components/ProofViewer.tsx` — renders photo/signature/code/contactless. ⚠ Missing or unreadable media must **say so**, never a broken placeholder (spec edge case)
- [X] T094 [P] [US5] Add the period summary to the profile as detail rows — ⚠ **not metric cards**
- [X] T095 [P] [US5] Add `WorkHistory.test.tsx` — the empty history state is worded, never a blank panel or a bare zero

**Checkpoint**: the profile is a record of employment, and a disputed delivery has evidence.

---

## Phase 8: User Story 6 — readiness and coverage (P3)

**Goal**: find the gaps — drivers who cannot receive work, zones with nobody in them, credentials about
to expire — before an order is affected.

**Independent test**: a driver with no zone and a zone with no drivers are both reported as gaps with the
consequence stated; fixing them clears the report.

**Depends on**: Phase 2.

### Backend

- [X] T096 [US6] Create `apis/edge-api/fleet/src/readiness/repository.ts` — blocked drivers with an **enumerated cause list** (`no_zone | suspended | offboarded | licence_expired`), never a bare boolean; uncovered zones; expiring credentials against `FLEET_EXPIRY_WARNING_DAYS`
- [X] T097 [P] [US6] Create `apis/edge-api/fleet/src/functions/readiness-v1-get.ts` and wire `GET /fleet/v1/readiness`
- [X] T098 [P] [US6] Add `apis/edge-api/fleet/src/readiness/repository.container.test.ts` — each blocking cause is detected independently and reported with its reason

### Console

- [X] T099 [US6] Create `apps/back-office/src/features/drivers/components/ReadinessPanel.tsx` — blocked drivers, uncovered zones and expiring credentials as **lists** (⚠ no cards, and no metric card for the counts)
- [X] T100 [P] [US6] Add the "cannot receive work" flag to the register row and the profile header, with the reason stated — ⚠ **SC-009**: a driver with no zone must be identified on the register, before any order is affected
- [X] T101 [P] [US6] Add `ReadinessPanel.test.tsx` — each gap type renders with its reason; a fixed gap disappears with no further action

**Checkpoint**: all six stories complete.

---

## Phase 9: Polish, telemetry and cross-cutting proofs

### Retire the old implementation

- [X] T102 Delete `apis/edge-api/admin/src/drivers/` and remove its five function entries from `apis/edge-api/admin/serverless.yml` (`driversListV1`, `driverGetV1`, `driverCreateV1`, `driverUpdateV1`, `driverStatusV1`) and the five files in `apis/edge-api/admin/src/functions/driver-*`
- [X] T103 Remove the now-unused driver-pool Cognito IAM block from `apis/edge-api/admin/serverless.yml` (it moved to fleet in T005), and `DRIVER_USER_POOL_ID` from its environment. ⚠ Confirm `apis/edge-api/admin`'s existing test suite passes **unmodified** — that is the proof the extraction changed no other behaviour
- [X] T104 Record the reclaimed CloudFormation headroom: count `effy-edge-admin`'s handlers before and after (77 → 72) and note it in the sign-off

### Telemetry (Principle VII, [R16](./research.md#r16))

- [X] T105 [P] Emit the four PostHog events from the console — `driver_created`, `driver_status_changed`, `driver_exception_resolved`, `driver_work_released`. ⚠ Driver **id only**, never name, email, phone or emergency contact (FR-050)
- [X] T106 [P] Emit the three structured metric log lines from the service — `fleet.driver_provision_failed`, `fleet.stranded_work_released`, `fleet.exception_outstanding_count`. ⚠ Low-cardinality labels only — no driver id as a label
- [X] T107 Add the `fleet.driver_provision_failed` metric filter and alarm to the fleet `serverless.yml`, notifying the existing alerts topic. ⚠ Deliberately **no alarm on outstanding exceptions** — that is workload, and alarming on workload teaches operators to ignore alarms

### Cross-cutting proofs

- [X] T108 Add the **SC-011 role negative** — one request per mutating route as a `csa` subject, each asserted `403`. Cover create, update, status, resolve, release and end-duty
- [X] T109 Add the **SC-014 PII sweep** as a test: exercise every route and grep the captured log output for `contact_phone`, `emergency`, `licence_reference` and long digit runs; expect no match
- [X] T110 Add a design guard test asserting no `Card` primitive is imported anywhere under `apps/back-office/src/features/drivers/` (Principle V, no exception claimed)
- [X] T111 Run the full machine sweep per [quickstart §11](./quickstart.md): `pnpm -r typecheck`, `pnpm -r test`, both container suites, `apps/back-office` tests, `make brand-check`, and `tokens:check` — ⚠ which must be **unchanged**, the mechanical proof this slice adds no design token. Record the package count, not just "green": 029 found `pnpm -r test` passing while `typecheck` failed, caught only because the reporting count fell
- [ ] T112 [OPERATOR] Re-run `apis/edge-api/driver`'s container suite against a migrated database and compare to the **T117 baseline** — any new failure is the status widening and blocks everything else. ⚠ This can only run once the operator has applied the migration (T119); until then it is pending, not passing

### Documentation

- [X] T113 Update `docs/audiences/driver-capabilities.md` with a §056 section, replacing the §049 "Provisioning" paragraph that describes the minimal adjunct this feature retires
- [X] T114 [P] Update `ORDER-FLOW-GAPS.md`: **failed-delivery visibility** moves from "top structural gap" to closed-for-visibility, ⚠ with the boundary stated plainly — this slice makes a failed delivery visible **to Effy**; customer notification and re-attempt remain open and are unblocked by it
- [X] T115 [P] Write `specs/056-driver-management/SIGNOFF.md` recording what is verified, what is not, and every open operator item
- [X] T116 [P] Update `CLAUDE.md` § Active feature with the 056 entry

---

## Phase 10: Operator steps — deploy and walk

⚠ Every task below is **[OPERATOR]**. The assistant authors and hands over; it does not run these.

- [ ] T117 [OPERATOR] **Baseline first** per [quickstart §1](./quickstart.md): record `pnpm -r typecheck` counts, `pnpm -r test` totals, and `apis/edge-api/driver`'s container result **before** the migration. ⚠ An unrecorded baseline makes a real regression look pre-existing
- [ ] T118 [OPERATOR] Commit the feature (spec, plan, migration, service, console) — the 003 commit-guard requires the migration committed before `db-up`
- [ ] T119 [OPERATOR] `make db-up ENV=dev`, then verify per [quickstart §2](./quickstart.md): no `disabled` remains, ten new columns, the three-value CHECK, resolution columns on both exception tables
- [ ] T120 [OPERATOR] `make edge-deploy SERVICE=fleet ENV=dev` — ⚠ **before** the admin deploy, so there is no window in which driver management is unreachable
- [ ] T121 [OPERATOR] `make edge-deploy SERVICE=admin ENV=dev` (removes the five old routes), then `SERVICE=driver ENV=dev` (the status union)
- [X] T122 ⚠ **NO `make apply` NEEDED — verified, and this task's original wording was WRONG.** The slice touches zero Terraform files; the IAM statements and the alarm live in the fleet `serverless.yml` (created by `edge-deploy`), and all seven SSM parameters the service reads already exist in `/effy/dev/*`. Checked live rather than assumed
- [ ] T123 [OPERATOR] Walk [quickstart §4](./quickstart.md) — US1, including **SC-001** timed and the **SC-010** clearing proof on every optional field
- [ ] T124 [OPERATOR] Walk [quickstart §5](./quickstart.md) — US2, including **SC-005** (create with an in-use email, then confirm the existing driver is byte-identical) and **SC-004** (revocation effective within 60 s)
- [ ] T125 [OPERATOR] ⚠ Walk [quickstart §6](./quickstart.md) — **the most important walk in this feature**: collect a real package, try to suspend the driver, confirm the warning itemises the held work, confirm, find it in stranded, release it, and confirm the next sweep gives it to someone else
- [ ] T126 [OPERATOR] Walk [quickstart §7](./quickstart.md) — US3, with **SC-003 measured** by SQL count against the console total, not spot-checked
- [ ] T127 [OPERATOR] Walk [quickstart §8](./quickstart.md) — US4, including the "nobody on duty, work waiting" statement and the FR-038 route-table negative
- [ ] T128 [OPERATOR] Walk [quickstart §9](./quickstart.md) — US5, including **SC-012** both halves: the presigned URL expires, and issuing it wrote an audit row
- [ ] T129 [OPERATOR] Walk [quickstart §10](./quickstart.md) — US6, with **SC-009** confirmed on the register before any order is affected
- [ ] T130 [OPERATOR] ⚠ Walk [quickstart §12](./quickstart.md) — **look at it**. Every screen, light and dark, narrow width. 039 shipped **four live defects with a fully green suite**, because layout, contrast and hierarchy are not properties a DOM assertion can see. This is a required step, not polish

---

## Dependencies

```
Phase 1 (Setup)
   └─► Phase 2 (Foundational) ── blocks everything
          ├─► Phase 3  US1  (P1) 🎯 MVP
          ├─► Phase 4  US2  (P1)          ── T043 (stranded detection) feeds US4
          ├─► Phase 5  US3  (P2)          ── fully independent
          ├─► Phase 6  US4  (P2)          ── needs T043 from US2
          ├─► Phase 7  US5  (P3)          ── console lives on US1's profile screen
          └─► Phase 8  US6  (P3)          ── register flag lives on US1's list
                 └─► Phase 9 (Polish)
                        └─► Phase 10 (Operator)
```

**Story independence**: US3 is the only story with **no** dependency on another story — it can be built
and shipped alone, and given it closes the register's top structural gap, that is the story to pull
forward if anything is cut. US4 needs one task from US2. US5 and US6 need US1's screens as a host but
their backends are independent.

## Parallel execution opportunities

- **Phase 1**: T002, T003 together after T001.
- **Phase 2**: T015–T018 (four independent files) together; T021–T023 (three console files) together.
- **Phase 3**: T028–T030 (three handlers) together; T037–T039 together.
- **Phase 4**: T045–T048 (four handlers) together.
- **Phase 5**: T059/T060 together; T065–T067 together.
- **Phase 6**: T072–T074 together; T080–T082 together.
- **Phase 7**: T087–T089 together; T093–T095 together.
- **Phase 9**: T105/T106 together; T113–T116 together.
- **Across stories**: once Phase 2 lands, US1, US2, US3 and US6 backends can proceed in parallel;
  US4's release action waits on T043 only.

## Implementation strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (US1).** That alone delivers a searchable register and a complete,
editable profile of record — the explicit ask, and the front door every other story is reached through.

**Then, in value order rather than number order:**

1. **US3 (Phase 5)** next, not US2. It closes the order-flow register's top structural gap, it has no
   dependency on any other story, and it is the only place in this feature where an unbuilt screen is
   currently causing customer orders to sit permanently stuck.
2. **US2 (Phase 4)** — the credential-control half, and the source of the stranded-work detection US4
   needs.
3. **US4 (Phase 6)** — makes automatic assignment observable.
4. **US5, US6 (Phases 7–8)** — the retrospective and preventative halves; both are cuttable to a later
   slice without leaving anything broken.

**Cut line if the slice must shrink**: Phases 7 and 8 (US5, US6) are the honest cut. Everything through
Phase 6 leaves the platform strictly better and internally consistent; cutting anything earlier leaves a
half-built lifecycle.

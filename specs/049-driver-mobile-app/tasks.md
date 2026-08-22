---

description: "Task list for 049 Driver Delivery App"
---

# Tasks: Driver Delivery App

**Input**: Design documents from `specs/049-driver-mobile-app/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: The platform is test-heavy; test tasks reflect its standing patterns (edge Vitest suites,
config-contract tests reading the real `serverless.yml`, KMP `commonTest`, a shared-types↔Kotlin
contract-drift guard). They are included where the platform normally requires them, not full TDD.

**Organization**: By user story (US1…US7) on a shared Setup + Foundational spine. **P1 = US1 (collection
run) + US2 (same-day delivery run)** together form the MVP loop that closes commerce→fulfilment→delivery.

## Path conventions

- Mobile: `apps/driver-mobile/shared/src/commonMain/kotlin/com/effyshopping/driver/mobile/`
- Cold path (driver): `apis/edge-api/driver/src/`
- Provisioning: `apis/edge-api/admin/src/drivers/`
- DTO SSOT: `packages/shared-types/src/driver.ts`
- Migration: `db/migrations/<ts>_driver_delivery.sql`
- Infra: `infra/envs/dev/`

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Build out `apps/driver-mobile` from the base KMP template (Android + iOS, native feel — FR-040): Gradle modules (`shared`+`androidApp`+`iosApp`), package root `com.effyshopping.driver.mobile`, `minSdk 24`/`compileSdk 36`; srcDir the `design-system` `compose-driver` theme and `packages/mobile-kit`; remove the `Greeting`/`Platform` stubs.
- [X] T002 [P] Scaffold cold-path service `apis/edge-api/driver/` (`serverless.yml` on arm64/Node 22, `tsconfig`, `package.json`, `@effy/edge-shared` dep, `/driver/v1` base, driver JWT authorizer referenced by SSM id `/effy/dev/edge/authorizer/driver_id`).
- [X] T003 [P] Create `packages/shared-types/src/driver.ts` DTO module (all `/driver/v1` shapes; counts use `WireInt`/`@asType integer`) and export it; wire Kotlin generation for the driver app.
- [X] T004 [P] Terraform: add `aws_cognito_user_pool_client.driver_mobile` (+ SSM `driver_mobile_app_client_id`) in `infra/envs/dev/auth-driver.tf` (EMAIL_OTP only, no SRP, 30-day refresh — shop-mobile pattern) and register its id in the driver authorizer `extra_client_ids` in `infra/envs/dev/edge-gateway.tf`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: Every user story depends on this phase.

- [X] T005 Author the forward-only migration `db/migrations/<ts>_driver_delivery.sql` per data-model.md: `driver`, `driver_duty_session`, `driver_run`, `collection_task`, `collection_task_issue`, `delivery_task`, `delivery_task_package`, `proof_of_delivery`, `delivery_failure`, `driver_task_event`, `driver_activity` (text CHECK enums, FK indexes, `COMMENT ON`, partial-unique on open duty session, `UNIQUE(shop_fulfillment_id)` on collection_task + delivery_task_package); re-affirm the `shop_fulfillment` status enum and add the driver transition guards (retire the 020 dev-stub path).
- [X] T006 [P] Implement the driver-service pg layer + repositories base in `apis/edge-api/driver/src/lib/` (pgx-equivalent pool via edge-shared, RDS CA, raw SQL repository pattern).
- [X] T007 [P] Mobile core: `core/auth/AuthDriver.kt` (commonMain interface — strictly passwordless EMAIL_OTP, **no** password/sign-up/recovery; single access-token bearer), Android Amplify actual + iOS bridge; `core/http` Ktor client sending the single access token to `/driver/v1/*`; `core/session`, `core/config`, `core/error/AppError.kt` (incl. `NotFound`).
- [X] T008 [P] Mobile sign-in flow in `features/auth/`: work-email screen (no sign-up path), 6-digit OTP screen with entering/verifying/invalid/expired/locked states (FR-001/003); wire to `AuthDriver`.
- [ ] T009 [P] Mobile permission priming in `features/auth/` for location, notifications, camera with per-permission rationale before the OS prompt (FR-004).
- [X] T010 Mobile app shell in `app/` + `core/nav/`: adaptive nav (mobile-kit) with tabs Today / Map / History / Account; explicit container wiring (no DI framework); session gate → sign-in when signed out.
- [X] T011 `GET /driver/v1/me` in `apis/edge-api/driver/src/me/` — **reads the existing back-office-provisioned `driver` record** by `sub` and **refuses with 404/403 when none exists** (drivers are admin-provisioned per FR-002 — NO JIT upsert that would create a zone-less record; assignment needs a zone from the record). Returns zone/hub (from `delivery_settings`)/vehicle/dutyStatus, and **refuses a disabled driver (uniform 403)** (Principle IV, I2 resolution); mobile identity read.
- [X] T012 Duty: `POST /driver/v1/duty` + `POST /driver/v1/location` in `apis/edge-api/driver/src/duty/` (open/close `driver_duty_session`, optional location snapshot), and the phase-aware "Today" home shell + on/off-duty control in `features/duty/` (FR-005/006, offduty + on-duty-empty states).
- [X] T013 Assignment worker scaffold in `apis/edge-api/driver/src/assignment/`: EventBridge-scheduled handler (cadence from env), the sweep loop, driver eligibility (on-duty + zone), candidate selection `FOR UPDATE SKIP LOCKED`, and idempotent task creation + `driver_task_event` writes (R2/R10). (Per-type detection added in US1/US2.)
- [X] T014 [P] Minimal provisioning domain `apis/edge-api/admin/src/drivers/` per contracts/admin-drivers.contract.md (Cognito-first→`driver` record, 006/009 pattern; RBAC read=any active staff, mutate=admin/manager; audit to `admin.audit_log`); add scoped `cognito-idp` IAM on the **driver pool ARN** to the admin `serverless.yml`.
- [ ] T015 [P] Mobile offline sync coordinator in `core/` (debounce/drain/backoff + persisted queue; every write carries a per-action `changeId`) — the 027 pattern reused for driver writes (FR-039).
- [X] T016 [P] Config-contract test in `apis/edge-api/driver/` reading the real `serverless.yml` against the service's required env keys (035 defect guard); shared-types↔Kotlin **contract-drift** guard + a serialization test proving counts round-trip as integers (not `1.0`).
- [X] T060 **Reassignment / return-to-pool** (FR-011) in `apis/edge-api/driver/src/assignment/` + `src/duty/`: on duty-close and on every worker sweep, release the **not-yet-collected** `collection_task` rows and **not-yet-started** `delivery_task` rows of ineligible drivers (off-duty/unreachable) back to the pool so the next sweep re-assigns them — idempotent, `FOR UPDATE SKIP LOCKED`, guarded by current owner so an **in-progress step is never yanked mid-action**; and enforce the off-duty-mid-run guard on `POST /duty` (refuse, or release remaining stops — never abandon silently). Covers the "going off duty mid-run" edge case.

**Checkpoint**: a provisioned driver can sign in, go on duty, and see an (empty) phase-aware home; the worker runs, assigns nothing yet, and correctly releases work when a driver goes ineligible.

---

## Phase 3: User Story 1 - Collection run: shops → hub (Priority: P1) 🎯 MVP

**Goal**: On-duty driver is auto-assigned a collection run, collects packages across an ordered shop round, and checks them in at the hub (same-day/standard split; standard staged for the carrier).

**Independent Test**: Provision a driver; two shops' portions `ready_for_pickup` in a served zone (mixed methods); sign in → on duty → run auto-assigned ≤30 s → verify+collect each shop → hub check-in shows the split and stages standard.

- [X] T017 [US1] Assignment worker: collection-work detection in `apis/edge-api/driver/src/assignment/` — find `ready_for_pickup` `shop_fulfillment` portions with no open `collection_task`, group into a `driver_run(type=collection)` per zone, assign to an eligible driver (nearest by snapshot else load-balanced) (FR-007/008/009).
- [X] T018 [P] [US1] Collection reads in `apis/edge-api/driver/src/collection/`: `GET /collection/runs/{id}` (ordered shop stops + counts) and `GET /collection/tasks/{id}` (package manifest: ref, destination suburb, method, items) (FR-013/014).
- [X] T019 [US1] Collection writes in `apis/edge-api/driver/src/collection/`: `POST /collection/tasks/{id}/collect` (advance the package `shop_fulfillment`→`collected`, idempotent by `changeId`) (FR-014).
- [X] T020 [US1] Hub check-in in `apis/edge-api/driver/src/hubcheckin/`: `POST /hub/checkin` — require every collection task terminal, end the run (`checked_in`), compute + return the scanned total and same-day/standard split, stage standard packages for the external carrier and drop them from active work (FR-016/017).
- [X] T021 [P] [US1] Mobile collection run overview in `features/collection/` — ordered shop stops with package counts, progress, pull-to-refresh (FR-013).
- [X] T022 [P] [US1] Mobile shop stop verify+collect in `features/collection/` — package manifest as a tick list, swipe-to-collect (FR-014); phase-1 "Today" home wiring (active stop).
- [X] T023 [US1] Mobile hub check-in screen in `features/hubcheckin/` — scanned total + same-day/standard split, "nothing same-day" variant, swipe to end the run and unlock phase 2 (FR-016).
- [ ] T024 [P] [US1] Tests: edge-driver collection + hub-checkin suites (assign→collect→checkin, double-assign refused, idempotent re-collect); mobile collection/hubcheckin ViewModel+UseCase `commonTest`.
- [ ] T061 [US1] **Missed-collection-cutoff flag** in `apis/edge-api/driver/src/assignment/` + `src/hubcheckin/`: detect a same-day package still uncollected past its collection run's derived cutoff (047 `delivery_collection_run` + prep buffer, Australia/Melbourne) and flag it (surfaced at hub check-in / activity) so the same-day promise is not silently broken; not delivered late without a signal (spec "late package / missed collection cutoff" edge case).

**Checkpoint**: US1 fully functional — a collection run runs end to end and ends at the hub with the split; missed-cutoff same-day packages are flagged, not silently late.

---

## Phase 4: User Story 2 - Same-day delivery run: hub → customers, with proof (Priority: P1)

**Goal**: After hub check-in, the same-day packages become an ordered multi-drop run; each drop is navigated to, marked arrived, and completed with proof; the order reaches `delivered`.

**Independent Test**: With same-day packages checked in (seeded or via US1), a delivery run of ordered drops appears; complete a drop with each proof method; a two-shop customer shows as one drop; order/fulfilment → `delivered` (retires the 020 stub).

- [X] T025 [US2] Assignment worker: delivery-work detection in `apis/edge-api/driver/src/assignment/` — find checked-in **same-day** packages not in a `delivery_task`, group by order/`customer_address` into drops (one drop per order, SC-006), create a `driver_run(type=same_day_delivery)` + `delivery_task` + `delivery_task_package`, assign to an eligible driver.
- [X] T026 [P] [US2] Delivery reads in `apis/edge-api/driver/src/delivery/`: `GET /delivery/runs/{id}` (ordered drops) and `GET /delivery/drops/{id}` (customer, address+instructions, aggregated packages) (FR-018/020).
- [X] T027 [US2] Delivery status writes in `apis/edge-api/driver/src/delivery/`: `POST /delivery/drops/{id}/status` (`out_for_delivery`/`en_route`/`arrived`, idempotent) (FR-019).
- [X] T028 [US2] Proof media presign in `apis/edge-api/driver/src/proof/`: `POST /delivery/drops/{id}/proof/presign` (presigned PUT to the private media bucket via edge-shared) + S3 IAM on the driver `serverless.yml` (R7).
- [X] T029 [US2] Complete-with-proof in `apis/edge-api/driver/src/proof/`: `POST /delivery/drops/{id}/proof` — verify `code` server-side when method=code; write `proof_of_delivery` and advance every package `shop_fulfillment`→`delivered` in **one transaction**; refuse `delivered` without a proof (FR-024/025/026/027).
- [X] T030 [P] [US2] Mobile delivery run overview + drop detail in `features/delivery/` (ordered drops; customer/address/instructions/packages); phase-2 "Today" home wiring (FR-018/020/021).
- [X] T031 [US2] Mobile lifecycle + proof in `features/delivery/`: out-for-delivery/en-route/arrived, proof method picker + photo (capture/review/retake) + delivery-code (valid/invalid) + signature (draw/clear) + contactless + note, success state + "Next" (FR-019/024–027).
- [ ] T032 [P] [US2] Tests: edge-driver delivery+proof suites (grouping to one drop, no-proof→no-delivered, code verify, idempotent proof); mobile delivery ViewModel+UseCase `commonTest`.

**Checkpoint**: US1+US2 = the MVP loop; a paid order is collected and same-day-delivered with proof, order→`delivered`.

---

## Phase 5: User Story 3 - Exceptions: missing items & undeliverable drops (Priority: P2)

**Goal**: Report a missing/short package at a shop without blocking the rest; mark a drop undeliverable with a reason for back-office follow-up.

**Independent Test**: On a collection stop report a missing item and still collect the rest; mark a drop undeliverable with a reason and confirm it leaves the active run in a failed state recorded for back-office.

- [X] T033 [US3] `POST /collection/tasks/{id}/issue` in `apis/edge-api/driver/src/collection/` (write `collection_task_issue`, mark `short`, non-blocking) (FR-015).
- [X] T034 [US3] `POST /delivery/drops/{id}/fail` in `apis/edge-api/driver/src/delivery/` (write `delivery_failure` + `failed`, remove from active run) (FR-028).
- [X] T035 [P] [US3] Mobile report missing/short package UI in `features/collection/` (affected item + reason) (FR-015).
- [X] T036 [P] [US3] Mobile mark-undeliverable reason picker + confirm in `features/delivery/` (nobody home/wrong address/refused/access blocked/other+note) (FR-028).
- [ ] T037 [P] [US3] Tests: edge-driver issue + fail suites; mobile exception ViewModel `commonTest`.

**Checkpoint**: happy paths (US1/US2) plus the problem/fail branches.

---

## Phase 6: User Story 4 - Route map & navigation (Priority: P2)

**Goal**: Per-run monochrome map (shops→hub, hub→drops) with external navigate hand-off and masked customer contact.

**Independent Test**: Open the per-run map; pins + ordered stop sheet render monochrome in both modes; Navigate opens the device maps app; masked contact returns a relay handle or degrades gracefully.

- [ ] T038 [US4] **Spike**: MapLibre KMP integration on Android + iOS (record effort; Google Maps SDK is the recorded fallback) (research R5) — capture in `specs/049-driver-mobile-app/research.md`.
- [ ] T039 [US4] `GET /driver/v1/runs/{id}/map` in `apis/edge-api/driver/src/delivery/` (hub + ordered stop coordinates + current location) (FR-029).
- [ ] T040 [P] [US4] Mobile `MapDriver` `expect/actual` + monochrome MapLibre style (hub square pin, stops circles) in `core/platform/` and `features/map/` (FR-029/030).
- [ ] T041 [P] [US4] Mobile per-run map screens (segmented collection/delivery) + external navigate hand-off (`geo:`/`maps://` behind a platform driver) in `features/map/` (FR-022/029).
- [ ] T042 [US4] Masked contact: `POST /delivery/drops/{id}/contact` (capability-flagged; `503 contact_unavailable` until the relay exists — R6) + mobile Contact-customer affordance that hides/disables gracefully (FR-023).

**Checkpoint**: navigation and contact available; masking relay recorded as a dependency.

---

## Phase 7: User Story 5 - History & proof records (Priority: P3)

**Goal**: Read-only history holding both record types (collection runs + same-day drops with proof).

**Independent Test**: After a completed delivery, History lists it under its day with a proof indicator; detail shows timeline + captured proof, read-only.

- [ ] T043 [P] [US5] `GET /driver/v1/history` + `GET /driver/v1/history/{kind}/{id}` in `apis/edge-api/driver/src/history/` (both record types; timeline from `driver_task_event`; signed proof GET) (FR-033/034).
- [ ] T044 [P] [US5] Mobile history list (runs + drops by day, empty state) + detail (timeline + proof, read-only) in `features/history/` (FR-033/034).
- [ ] T045 [P] [US5] Tests: edge-driver history suite; mobile history ViewModel `commonTest`.

**Checkpoint**: completed work is reviewable with proof.

---

## Phase 8: User Story 6 - Notifications & activity feed (Priority: P3)

**Goal**: In-app activity feed of assignment/ready/window/reminder events; push when the notifications path lands.

**Independent Test**: An assignment writes an activity item; the feed lists it chronologically (empty state otherwise); tapping opens the run/stop.

- [ ] T046 [US6] Populate `driver_activity` from the assignment worker + lifecycle events (run assigned, packages ready, same-day window, reminders) in `apis/edge-api/driver/src/assignment/` and service handlers (FR-031 back-end half).
- [ ] T047 [P] [US6] `GET /driver/v1/activity` + `POST /driver/v1/activity/read` in `apis/edge-api/driver/src/activity/` (FR-032).
- [ ] T048 [P] [US6] Mobile activity feed + empty state in `features/notifications/`, tap-through to the run/stop (FR-032); push registration deferred to the notifications path (recorded).
- [ ] T049 [P] [US6] Tests: edge-driver activity suite; mobile feed ViewModel `commonTest`.

**Checkpoint**: drivers see new work in-app without polling.

---

## Phase 9: User Story 7 - Account, appearance & duty (Priority: P3)

**Goal**: Identity/zone/hub/vehicle as detail rows, appearance selector, help, sign out.

**Independent Test**: Account shows identity/zone/hub/vehicle as detail rows + counts-only today; appearance persists; sign out returns to sign-in.

- [X] T050 [P] [US7] Mobile Account screen in `features/account/` — name/avatar/work email/zone/**hub**/vehicle as detail rows (no cards), counts-only today summary, help & version (FR-035).
- [X] T051 [P] [US7] Mobile appearance selector Light/Dark/Follow-System (persisted, default Follow-System) in `features/account/` + `core/theme/` (FR-036).
- [X] T052 [P] [US7] Mobile sign-out confirm dialog in `features/account/` → ends session, returns to sign-in (FR-037).

**Checkpoint**: all seven stories independently functional.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [ ] T053 [P] Cross-cutting mobile states: loading skeletons (Today + drop detail), failed-load error+retry, persistent offline banner, permission-denied recovery in `core/presentation/` + relevant features (FR-038/039).
- [ ] T054 Wire the offline queue (T015) through every write path and prove exactly-once apply on reconnect (FR-039, SC-007).
- [ ] T055 [P] Telemetry: Crashlytics via `core/platform/`; declare the driver PostHog event taxonomy (duty toggled, run started, stop collected, hub checked in, drop delivered, drop failed) with emission deferred (recorded); backend metrics (`assignment_latency`, `unassigned_work` gauge, `proof_upload_failed`) + a stale-unassigned-work alarm in `apis/edge-api/driver/` + `infra/envs/dev/` (Principle VII).
- [ ] T056 [P] Verify monochrome/design compliance: `compose-driver` tokens check + `mobile-guard` for driver-mobile; every screen light+dark AA; 48dp targets; and a **non-goals sweep covering the full FR-044 list** (no earnings/tips/pay/cash-out, no offer/accept-decline, no ratings/gamification, no storefront/catalog/cart/checkout — not just currency) (SC-008/009/010/012, FR-044, Principle V).
- [ ] T057 [P] Create the parity register `docs/audiences/driver-capabilities.md` (single mobile column — no driver web) and record §049.
- [ ] T058 `terraform validate`/`fmt`; banned-address + source secret sweeps; `pnpm -r typecheck` + `pnpm -r test` green.
- [ ] T059 Operator/live run of `quickstart.md` (⚙ `make db-up`, `make edge-deploy SERVICE=driver` + admin redeploy, provision a driver, worker schedule on, on-device Android + iOS walk of US1→US2, offline + isolation + no-currency proofs).

---

## Dependencies & Execution Order

- **Setup (P1)** → **Foundational (P2)** blocks everything. **US1 & US2 (P1)** are the MVP; **US3–US7** follow in priority order.
- **US1** needs T013 (worker scaffold) + T017 (collection detection). **US2** needs T025 (delivery detection) and, for a full loop, US1's hub check-in (T020). US2 is independently testable by seeding checked-in same-day packages.
- **US3** extends US1/US2 handlers. **US4** needs the map spike (T038) first. **US5/US6/US7** depend only on Foundational.
- **T060** (return-to-pool / off-duty-mid-run, FR-011) depends on the worker scaffold (T013) + duty (T012); it is foundational to correct assignment and should land with US1. **T061** (missed-cutoff flag) depends on collection assignment (T017) + hub check-in (T020).
- **Within a story**: assignment detection → reads → writes → mobile screens → tests.

## Parallel Opportunities

- Setup: T002, T003, T004 in parallel (T001 first for the app skeleton).
- Foundational: T006, T007, T008, T009, T014, T015, T016 are largely parallel (different files) after T005 (migration).
- Per story, `[P]` tasks touch different files (e.g., US1 T018/T021/T022/T024; US2 T026/T030/T032).
- After Foundational, US1/US2 (backend vs mobile), and US5/US6/US7 can be staffed in parallel.

## Implementation Strategy

- **MVP** = Phases 1–2 + US1 + US2 → the full collection→hub→same-day-delivery loop with proof; **stop and validate** (retires the 020 stubs), then demo.
- **Incremental**: add US3 (exceptions) → US4 (map/contact) → US5 (history) → US6 (notifications) → US7 (account), each independently testable.
- Commit after each task or logical group. Nothing touching live AWS/DB is run by Claude — those steps (⚙ in quickstart) are handed to the operator.

## Notes

- `[P]` = different files, no incomplete-task dependency. `[US#]` maps to spec user stories.
- Reuse over rebuild: hub = `delivery_settings`, schedule = `delivery_collection_run`, package = `shop_fulfillment`, method = `order_package_delivery.method` (research R3).
- Deferred/dependencies (recorded, not gaps): the masking relay (R6), push via the notifications path (US6), mobile PostHog emission (R11), MapLibre-iOS effort (T038), return-to-hub for undelivered packages (design carry-forward).

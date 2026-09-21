# Tasks: Driver Proof of Delivery & Custody

**Feature**: 064-driver-proof-custody · **Date**: 2026-09-21
**Spec**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Research**: [research.md](research.md)
**Data model**: [data-model.md](data-model.md) · **Contracts**: [contracts/routes.md](contracts/routes.md)
**Walks**: [quickstart.md](quickstart.md)

## Format: `[ID] [P?] [Story] Description`

- **[P]** — parallelisable: different file, no dependency on an incomplete task.
- **[US1]…[US5]** — the user story from `spec.md`. Setup, Foundational and Polish carry no label.

## Path Conventions

- Cold path services: `apis/edge-api/{driver,fleet,shared}/src/`
- Migration: `db/migrations/`
- Contract: `packages/shared-types/src/driver.ts`
- Mobile: `apps/driver-mobile/shared/src/commonMain/kotlin/com/effyshopping/driver/mobile/`
- Console: `apps/back-office/src/features/`
- Infra: `infra/envs/dev/`

⚠ **Tests are written throughout, not at the end.** This repo has shipped defects behind fully green
suites in 039, 049, 057, 058, 059 and 063. Container tests against real PostgreSQL are the ones that
have historically caught what unit tests missed.

---

## Phase 1: Setup

- [X] T001 Read `apis/edge-api/driver/src/work/complete.ts` and `apis/edge-api/shared/src/lib/order-completion.ts` end to end and record in `research.md` the exact transaction shape the proof route must match
- [X] T002 [P] Confirm `pnpm -r typecheck` and the driver/fleet/shared suites are green at HEAD, and record the counts — a baseline, so a later failure is attributable
- [X] T003 [P] Run `pnpm --filter @effy/driver-contract check` and record the result. ⚠ It was **already red at HEAD** before 063 began; if it is red now, fix it before adding to the contract or the drift guard is worthless
- [X] T004 [P] Verify Docker is up and `CONTAINER_TESTS=1 pnpm --filter @effy/edge-driver test` runs. ⚠ 058's container tests found three defects a green suite missed; 059 and 052 both shipped with them never run

---

## Phase 2: Foundational (blocking — no user story starts before these land)

- [X] T005 Write `db/migrations/<ts>_driver_proof_custody.sql` creating `public.delivery_proof` and `public.delivery_attempt_failure` exactly per [data-model.md](data-model.md), forward-only and additive
- [X] T006 In the same migration, add the CHECK constraints that make invalid states unrepresentable: `method` closed to `photo|signature|contactless` (⚠ **no `code`** — R4), `UNIQUE (stop_id)` on proof, `UNIQUE (change_id)` on both, media-required-for-photo/signature, and note-required-for-`other`
- [X] T007 [P] Add `"hub_checkin"` to `TodayItemRef.kind` in `packages/shared-types/src/driver.ts`
- [X] T008 [P] Add `DeliveryExceptionListDTO`, `ResolveExceptionRequest` and `CustodyDTO` to `packages/shared-types/src/driver.ts` per [contracts/routes.md](contracts/routes.md), using `WireInt` for every integer (⚠ 027 R13 — a bare `number` generates Kotlin `Double` and Go/pg refuse it)
- [X] T009 Regenerate the Kotlin contract and **read the generated file back**, not just the drift guard. ⚠ 027 R13 and 054 both record a generated file matching its source exactly while being wrong
- [X] T010 [P] Write `apis/edge-api/shared/src/lib/proof-prefix.ts` exporting the single `proof/` constant the presign call and the Terraform lifecycle filter must agree on, and import it in both places it is needed
- [X] T011 Container test `apis/edge-api/driver/src/proof/schema.container.test.ts` loading the **real** migrations from `db/migrations` (not transcribed — 063 found ten fixture errors that way) and asserting every constraint in T006 by violating it

**Checkpoint**: migration applies, contract typechecks, Kotlin regenerates, constraints proven.

---

## Phase 3: User Story 1 — Complete a delivery with proof (P1) 🎯 MVP

**Goal**: A driver completes a drop with photo, signature or contactless, and the order reaches
`delivered` — which no driver has ever been able to cause (R2).

**Independent test**: Complete one drop by each of the three methods; confirm each stores proof,
writes `package_arrival`, and moves the order to delivered. Walk [quickstart.md](quickstart.md) W1–W2.

- [X] T012 [P] [US1] Create `apis/edge-api/driver/src/proof/sql.ts` with the proof insert, the stop/fulfillment status writes and the ownership predicate, every query scoped to the authenticated driver
- [X] T013 [P] [US1] Create `apis/edge-api/driver/src/proof/types.ts` mapping wire DTOs to domain shapes, explicitly, at the boundary
- [X] T014 [US1] Create `apis/edge-api/driver/src/proof/repository.ts` — the proof insert plus `package_arrival`, idempotent on `changeId`
- [X] T015 [US1] ⚠ Create `apis/edge-api/driver/src/proof/service.ts` performing **in ONE transaction**: insert proof → stop `done` → `shop_fulfillment='delivered'` → insert `package_arrival` → call `enqueueOrderDeliveredIfComplete` from `@effy/edge-shared`. **Do not write a second completion rule** (R3, Principle II)
- [X] T016 [US1] Add the `code` refusal to the service: **422 with `field: "method"`** naming the deferral (FR-003). Not a 500, not silent acceptance
- [X] T017 [P] [US1] Create `apis/edge-api/driver/src/functions/driver-drop-proof-presign-v1-post.ts` calling the shared `presignUpload` with the `proof/` prefix constant from T010
- [X] T018 [P] [US1] Create `apis/edge-api/driver/src/functions/driver-drop-proof-v1-post.ts` wiring the service, mapping `MediaValidationError` to field-scoped 422s
- [X] T019 [US1] Declare both routes in `apis/edge-api/driver/serverless.yml`, and add `S3_MEDIA_BUCKET` plus `s3:PutObject`/`s3:GetObject` scoped to the media bucket ARN — the service has **no S3 wiring at all** today
- [X] T020 [US1] ⚠ Remove `driver/v1/delivery/drops/{}/proof` and `.../proof/presign` from `DEFERRED_TO_SLICE_D` in `apis/edge-api/driver/src/work/route-inventory.guard.test.ts`; the guard fails if a deferred route is one the app no longer calls
- [X] T021 [US1] Unit tests for `service.ts`: each method, the `code` refusal, the not-yours 404 byte-identical to no-such-drop
- [X] T022 [US1] ⚠ Container test: proof writes `package_arrival` **and** enqueues the notification, in one transaction. **Assert the arrival row explicitly** — order completeness keys on it, and a proof that skips it leaves the order permanently incomplete with nothing failing (R3)
- [X] T023 [US1] ⚠ Container test W8: a **mixed** order (one same-day, one standard) stays silent when only the same-day half is proven. 053 fixed exactly this defect; re-introducing a drop-scoped announcement reproduces it
- [X] T024 [US1] Container test SC-007: two concurrent submissions for one drop yield one delivery, one arrival, one notification
- [X] T025 [P] [US1] Wire `HttpDeliveryRepository.kt` to both routes: presign → `uploadBytes` → submit
- [X] T026 [US1] ⚠ Wire `ProofScreens.kt` and `DeliveryViewModel.kt` to real state, ordering **upload before queueing the submission** (R9). Hide the **Code** option. Do not build capture — `PhotoCapture`, `SignaturePad`, `PngEncode` and `ImageUpload` already exist (R8)
- [X] T027 [US1] FR-006: a failed upload leaves the drop incomplete and says so. Prove by disabling the network between presign and PUT
- [X] T028 [US1] FR-008: route the submission through the existing `core/offline/OfflineQueue.kt`; ⚠ media bytes must **never** enter the queue (R9)
- [X] T029 [US1] ViewModel tests for capture → upload → submit, including the upload-failure branch. ⚠ 049 deferred mobile ViewModel tests three times; not again

**Checkpoint**: W1, W2, W4, W5, W6 walkable. **This is the MVP** — a delivery can be completed by the
driver who made it.

---

## Phase 4: User Story 2 — Record a delivery that could not be completed (P1)

**Goal**: A driver records a failed attempt with a reason; the package stays theirs; Effy is told.

**Independent test**: Record each of the five reasons; confirm stored, order not delivered, package
still in custody. Walk W7.

- [X] T030 [P] [US2] Add the failure insert to `apis/edge-api/driver/src/proof/sql.ts`
- [X] T031 [US2] Add `recordFailure` to `service.ts`: insert `delivery_attempt_failure`, idempotent on `changeId`. ⚠ Does **not** mark delivered and does **not** release the package (FR-011)
- [X] T032 [US2] Refuse `reason: "other"` without a note with a field-scoped 422 (FR-010), matching the CHECK from T006
- [X] T033 [P] [US2] Create `apis/edge-api/driver/src/functions/driver-drop-fail-v1-post.ts` and declare it in `serverless.yml`
- [X] T034 [US2] Remove `driver/v1/delivery/drops/{}/fail` from `DEFERRED_TO_SLICE_D`
- [X] T035 [US2] ⚠ Container test SC-011: across **every** failure reason, the order never reports delivered
- [X] T036 [US2] Container test: a failed drop stays failed and cannot be completed as delivered without a new attempt row (FR-013)
- [X] T037 [P] [US2] Wire the fail route in `HttpDeliveryRepository.kt` and the reason screen in `ProofScreens.kt`
- [X] T038 [US2] Emit `driver.drop_failed` with the reason, so the exception mix is reportable. ⚠ No address, no recipient name (FR-028)

**Checkpoint**: W7 walkable. A driver can tell the truth about a failed delivery.

---

## Phase 5: User Story 4 — Custody is continuous (P2)

**Goal**: Hub check-in becomes real work; the platform can always name who holds a package.

**Independent test**: Complete every shop stop, leave the app, return — the hub check-in is the stated
next action. Walk W9–W10.

- [X] T039 [US4] ⚠ In `apis/edge-api/fleet/src/planner/repository.ts`, make `commitWave` append a `round_stop` of kind `'hub_checkin'` to every collection round. `round_stop_kind_check` already permits it (R11)
- [X] T040 [US4] Update `todayView` in `apis/edge-api/driver/src/work/service.ts` so the hub stop enters `outstanding`, becomes `active` when shop stops are done, and counts toward `remainingCount`
- [X] T041 [US4] ⚠ Update `collectionRun` in the same file to **exclude** the hub stop from its stop projection — `CollectionStopSummary` requires a shop name and code the hub has neither of, and an identity-less row renders as nothing with no error (R11)
- [X] T042 [US4] Complete the hub stop in `apis/edge-api/driver/src/work/complete.ts` when the hub check-in is recorded
- [X] T043 [P] [US4] Add the custody query to `apis/edge-api/fleet/src/dispatch/sql.ts` — derived from `round_package.state`, `hub_checkin` and `package_arrival`, **never stored** (R7)
- [X] T044 [US4] Create `GET /fleet/v1/custody` — handler, service, route declaration
- [X] T045 [US4] ⚠ FR-018: the duty-end path states what a driver is holding before the shift can end. 056 found standing a driver down could strand physical goods permanently and invisibly
- [X] T046 [US4] Render the hub stop in the app's Today and run-detail screens using the new `hub_checkin` kind
- [X] T047 [US4] ⚠ Once T040 lands, revisit the UI patch in `features/today/presentation/UpNextList.kt` — `HubRow` was made clickable on 2026-09-21 as a workaround. Keep the affordance, but the comment must now describe the model, not the workaround. ⚠ A comment asserting a limitation that no longer holds is the stale-claim shape 060 and 063 both record
- [X] T048 [US4] Container test: a collection round has a hub stop; completing all shop stops leaves exactly one outstanding; checking in completes it
- [X] T049 [US4] ⚠ Negative proof: revert T041 and confirm a test fails. Without it the run detail shows a stop with no name and nothing errors
- [X] T050 [US4] Alarm `DriverPackagesHeldOvernight` in `infra/envs/dev/monitoring.tf` — FR-018's failure, which nothing else reports

**Checkpoint**: W9, W10 walkable. The 2026-09-21 stranding defect is fixed at the model, not the UI.

---

## Phase 6: User Story 3 — Back-office sees delivery exceptions (P2)

**Goal**: Rebuild the reader 056 built and 063's teardown orphaned (R12).

**Independent test**: Fail several drops, confirm each appears with reason, note, driver, order and
time, and that a `csa` can read but not resolve. Walk W11.

- [X] T051 [P] [US3] Create `apis/edge-api/fleet/src/exceptions/sql.ts` — the list query, joining custody so a van is distinguishable from the hub (FR-020)
- [X] T052 [P] [US3] Create `apis/edge-api/fleet/src/exceptions/repository.ts`
- [X] T053 [US3] Create `apis/edge-api/fleet/src/exceptions/service.ts` with the two-tier gate: read = any active staff incl. `csa`; resolve = staff permitted to change an order's fate (FR-021)
- [X] T054 [P] [US3] Create `GET /fleet/v1/exceptions` and `POST /fleet/v1/exceptions/{id}/resolve` handlers and declare both in `apis/edge-api/fleet/serverless.yml`
- [X] T055 [US3] Write the audit row on resolve, reusing `apis/edge-api/fleet/src/shared/audit.ts`. ⚠ Do **not** write a second audit writer — 063 nearly did and would have skipped PII redaction
- [X] T056 [P] [US3] Create `apps/back-office/src/features/exceptions/{repo,queries,model,access,errorText}.ts` following the `features/dispatch/` shape
- [X] T057 [US3] ⚠ Create `apps/back-office/src/features/exceptions/ExceptionsScreen.tsx` as a **table**, not metric cards (Principle V). Render refusals through `errorText`, never `f.message` verbatim — `DomainError`'s own doc forbids it
- [X] T058 [US3] Register the route and nav entry in the back-office router
- [X] T059 [US3] ⚠ Delete the now-false comment at `apps/back-office/src/features/drivers/DriversListScreen.tsx:173` referencing the dropped `delivery_failure` tables
- [X] T060 [US3] Container test: the `csa` read/resolve split, proven in both directions
- [X] T061 [P] [US3] Component tests for the screen, including the empty state and a resolved exception leaving the list

**Checkpoint**: W11 walkable. Recorded exceptions finally have a reader again.

---

## Phase 7: User Story 5 — Proof is retrievable afterwards (P3)

**Goal**: History carries real proof instead of the hardcoded nulls.

**Independent test**: Complete deliveries by each method, retrieve each afterwards. Walk W12.

- [X] T062 [US5] ⚠ In `apis/edge-api/driver/src/work/delivery.ts`, replace the hardcoded `proofCaptured: false` and `proof: null` with real reads, and **correct the file header** which says they are always false "until Slice D" (stale-claim shape)
- [X] T063 [US5] Mint media URLs with the shared `presignRead`. ⚠ **No expiry logic** — nothing deletes media and an archived object reads identically (R5/R6)
- [X] T064 [US5] ⚠ Emit `ProofMediaMissingOnRead` when a `media_key` resolves to nothing. Since nothing deletes media this always means a fault; it must **never** render as a tidy empty state (R6, FR-026)
- [X] T065 [US5] Distinguish contactless-without-media (`media_key IS NULL`, legitimate) from media that should exist and does not (FR-026)
- [X] T066 [P] [US5] Render proof in the app's history detail screen
- [X] T067 [US5] FR-024: container test that proof media is unreachable by another driver and by another audience

**Checkpoint**: W12's first half walkable.

---

## Phase 8: Infrastructure & Archival

- [X] T068 ⚠ Add `aws_s3_bucket_lifecycle_configuration` to `infra/envs/dev/media.tf`: `filter { prefix = "proof/" }`, `transition { days = 90, storage_class = "GLACIER_IR" }`, `noncurrent_version_transition`, `abort_incomplete_multipart_upload`, and **no `expiration` block of any kind** (R5)
- [X] T069 ⚠ Assert the filter prefix matches T010's constant. An unscoped rule pushes the **live product catalogue** into an archive tier, where every storefront read still works and silently bills a retrieval fee per page view
- [X] T070 ⚠ Assert the storage class is never `GLACIER` or `DEEP_ARCHIVE` — either forks every read path into "recent" and "archived" behaviour and needs an asynchronous restore, for about $0.11/month (R5)
- [X] T071 `terraform validate` and `fmt -check` clean

---

## Phase 9: Polish & Verification

- [X] T072 [P] Emit `driver.proof_captured` and `driver.proof_upload_failed`. ⚠ EMF as its **own** record, never a dimension on an existing metric — a dimensioned metric is a different metric in CloudWatch and the alarm goes blind (059, 054, 063)
- [X] T073 [P] Sweep every new log line and telemetry payload for an address, recipient name, media URL or coordinate (FR-028); `make check-no-phantm`
- [X] T074 ⚠ Negative proof: remove the `package_arrival` write from T015 and confirm a test fails. **DONE early (during Phase 3, while the code was fresh): 3 tests fail, including "tells the shopper the order arrived" — the real-world consequence, not just the row.**
- [X] T075 ⚠ Negative proof: widen the `method` CHECK to admit `code` and confirm the deferral test fails
- [X] T076 ⚠ Negative proof: point the lifecycle filter at the bucket root and confirm T069 fails
- [X] T077 ⚠ Negative proof: make the proof route announce delivery on the drop id and confirm T023 fails
- [X] T078 [P] Update `docs/audiences/driver-capabilities.md` §064
- [X] T079 [P] Write `specs/064-driver-proof-custody/SIGNOFF.md` recording what is proven, what is walked and what is open — honestly
- [X] T080 Full sweep: `pnpm -r typecheck`, every affected suite, `CONTAINER_TESTS=1`, both mobile compiles + host tests, `driver-contract:check`, `terraform validate`. ⚠ Run `typecheck` separately — `pnpm -r test` can be green while `tsc` fails (029, 059)

---

## Phase 10: Operator (Claude does not run these)

- [ ] T081 `make db-up ENV=dev`
- [ ] T082 ⚠ `make edge-deploy SERVICE=fleet ENV=dev` **BEFORE** `SERVICE=driver` — fleet creates the hub stop, driver serves it. The reverse gives a driver a round whose final stop does not exist, which looks exactly like the defect this slice fixes
- [ ] T083 `make edge-deploy SERVICE=driver ENV=dev`
- [ ] T084 `make apply ENV=dev` — the lifecycle configuration and both alarms
- [ ] T085 `git push` (Amplify deploys back-office); rebuild driver-mobile in Xcode
- [ ] T086 ⚠ Walk W1–W14 in [quickstart.md](quickstart.md). **W1 matters most** — the first time a delivery can be completed by the driver who made it. **W12 cannot be faked**: an archive nobody has read back is an assumption

---

## Dependencies & Execution Order

### Phase dependencies

```
Setup (1) → Foundational (2) → ┬→ US1 (3) ─┬→ US5 (7) → Infra (8) → Polish (9) → Operator (10)
                               ├→ US2 (4) ─┤
                               ├→ US4 (5) ─┤
                               └→ US3 (6) ─┘        (US3 needs US2's writer to have data)
```

### User story dependencies

- **US1** — depends only on Foundational. Independently shippable. **MVP.**
- **US2** — depends only on Foundational. Independently shippable.
- **US3** — needs **US2** to exist for the list to have anything in it.
- **US4** — independent of US1/US2/US3 entirely; touches the collection leg.
- **US5** — needs **US1**, since it retrieves what US1 captures.

### Parallel opportunities

- T002/T003/T004 together.
- T007/T008/T010 together (different files); T009 after both contract edits.
- **US1, US2 and US4 can proceed in parallel after Phase 2** — they touch different files. US4 is the
  only one that touches `edge-api/fleet` and the collection leg.
- Within US1: T012/T013 together; T017/T018 together; T025 alongside the backend tests.
- Within US3: T051/T052 together; T056 alongside the service work.

### Parallel example — User Story 1

```
T012 ─┐
T013 ─┴→ T014 → T015 → T016 ─┬→ T017 ─┬→ T019 → T020
                             └→ T018 ─┘
T025 (mobile) can start once T019 declares the routes
T021–T024 (tests) follow T015
```

---

## Implementation Strategy

**MVP = Phase 1 + 2 + 3 (US1).** That alone changes something true of the platform today: a same-day
order becomes capable of reaching `delivered` without a back-office admin asserting it.

**Then US2** (equal P1, small) — a driver can tell the truth about a failed delivery.
**Then US4** — fixes the live stranding defect at the model.
**Then US3** — gives the exceptions a reader.
**Then US5 + infra** — retrieval and archival.

⚠ **Do not defer the container tests to the end.** 058's were written after the fact and found three
defects the whole green suite had missed; 059's and 052's never ran at all.

⚠ **Do not mark a task complete without running it.** 063 marked T073 complete without writing it,
C14 and C17 done without writing them, and four console controls done without building them — all
found later by someone asking.

---

## Task Summary

| Phase | Tasks | Story |
|---|---|---|
| 1 — Setup | T001–T004 (4) | — |
| 2 — Foundational | T005–T011 (7) | — |
| 3 — Proof | T012–T029 (18) | US1 🎯 |
| 4 — Failure | T030–T038 (9) | US2 |
| 5 — Custody | T039–T050 (12) | US4 |
| 6 — Exceptions | T051–T061 (11) | US3 |
| 7 — Retrieval | T062–T067 (6) | US5 |
| 8 — Infrastructure | T068–T071 (4) | — |
| 9 — Polish | T072–T080 (9) | — |
| 10 — Operator | T081–T086 (6) | — |

**Total: 86 tasks.** 80 for Claude, 6 operator-run.

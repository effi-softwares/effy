# Tasks: Simple Order Status & Driver Assignment in Orders

**Input**: Design documents from `specs/073-order-dispatch-control/` (revised, simplified)

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/routes.md](contracts/routes.md), [quickstart.md](quickstart.md)

**Tests**: each task carries its own tests (unit beside the source; `*.container.test.ts` on the real
migrations; `*.guard.test.ts`). S1–S7 and M1–M5 are the proofs in [quickstart.md](quickstart.md); each
is broken once to show it can fail.

**Conventions**: `[P]` = different files, no dependency on an unfinished task. **OPERATOR** = run by
the operator. `EA` = `apis/edge-api`, `BO` = `apps/back-office/src`, `SW` = `apps/shop-web/src`,
`KT` = `apps/driver-mobile/shared/src/commonMain/kotlin/com/effyshopping/driver/mobile/features`.
New mutating routes must satisfy `EA/shared/src/live/change-map.guard.test.ts`.

## Phase 1: Setup

- [X] T001 Scaffold and write `db/migrations/<ts>_assignment_note.sql` (`make db-new name=assignment_note`): `round_package.assigned_by_sub text NULL`, `round_package.assigned_note text NULL`, comments; update the comment on `driver_round.locked_by_sub` to "unused since 073, dropped later"; Down block. Do not run it
- [X] T002 [P] `packages/shared-types/src/package-status.ts`: `PackageStatus` (9 values), `STATUS_WORD`, `PackageStatusView`; export from the index; unit test every status has a word

---

## Phase 2: Foundational

- [X] T003 `EA/shared/src/status/status.ts`: pure `packageStatus(facts)` per [research.md](research.md) R1 (furthest fact wins; `problem` detail line; driver name for staff); table-driven `status.test.ts` — every status and every precedence pair (**S1**)
- [X] T004 `EA/shared/src/status/sql.ts`: `PACKAGE_STATUS_FACTS` (one round trip for many fulfillment ids: shop status, collection round_package state + driver name, hub check-in, delivery round_package + stop status + driver name, last failure vs last proof, handoff, arrival) and `toStatusView(row, { withDriver })`; export as `@effy/edge-shared/status`; container test seeding each status (depends on T001)
- [X] T005 [P] `EA/shared/src/status/severity.ts`: `reasonSeverity(reason)` → `cannot` | `concern` and `reasonWords(reason)` (plain words, e.g. "Not cleared for this area", "Van can't carry chilled"); unit test covers every `ExclusionReason`

**Checkpoint**: typecheck green; nothing changes on screen.

---

## Phase 3: User Story 1 — One simple status, the same everywhere (P1) 🎯 MVP

**Goal**: the same correct word on back-office, shop console and driver app, live.
**Independent test**: walk one same-day and one standard package Ready → Delivered with all three open (V1).

- [X] T006 [US1] `orders` service: `statusView` per package and the least advanced on each list row, via `PACKAGE_STATUS_FACTS`, in `EA/orders/src/orders/repository.ts` + `service.ts`; types in `packages/shared-types/src/order-admin.ts`; container proofs **S2**, **S4**, **S5** in `EA/orders/src/orders/status.container.test.ts`
- [X] T007 [P] [US1] `shop` service: `statusView` without driver names on order and fulfillment reads in `EA/shop/src/orders/{repository,service,types}.ts` and `EA/shop/src/fulfillments/`; extend `EA/shop/src/delivery-isolation.contract.test.ts` (**S6**)
- [X] T008 [US1] Hub check-in tells the shops: `announceCheckedIn(roundId)` in `EA/driver/src/work/announce.ts` (shop `orders` per shop on the round + ops `orders` + `dispatch`), called from `EA/driver/src/functions/driver-hub-checkin-v1-post.ts`; drop status and failure handlers also announce ops `orders`; container proof **S3**
- [X] T009 [P] [US1] ~~SKIPPED, see note~~ Driver history rows carry `statusView` in `EA/driver/src/work/delivery.ts` and `packages/shared-types/src/driver.ts`; run `pnpm --filter @effy/shared-types driver-contract:gen`
- [X] T010 [US1] Back-office: delete `packagePositionFor` from `BO/features/orders/model.ts`; show the status pill + word (+ detail line) in `BO/features/orders/components/PackageRows.tsx` and a Status column in `BO/features/orders/OrdersListScreen.tsx`; pill tone by the closed mapping; update tests
- [X] T011 [P] [US1] Shop-web: replace `STATUS_LABEL` (`SW/features/fulfillment/model.ts`), the map in `SW/features/fulfillment/orderConsole.ts` and in `SW/features/fulfillment/components/OrderPill.tsx` with `STATUS_WORD`; list and detail show With driver / At hub / Out for delivery / With carrier / Delivered after collection; keep the `ready_for_pickup` tab; update `OrderDetailScreen.test.tsx`
- [X] T012 [P] [US1] ~~SKIPPED, see note~~ Driver app: map `statusView` in `KT/history/data/HttpHistoryRepository.kt` and `KT/history/domain/History.kt`; show the word in `KT/history/presentation/HistoryScreens.kt`; `commonTest` for the mapping (exhaustive `when`)
- [X] T013 [US1] Guard `packages/shared-types/src/package-status.guard.test.ts` (**S7**): no file in `apps/back-office/src` or `apps/shop-web/src` maps `collected` / `ready_for_pickup` / `delivered` to a display word except through `package-status.ts`; prove it by restoring one old map

**Checkpoint**: the reported defect is fixed; deployable alone.

---

## Phase 4: User Story 2 — See who has each order (P2)

**Goal**: Driver column, assignments with a one-line "how", Assignments tab; lock and passes list gone.
**Independent test**: every assigned order shows its driver; an unassigned one shows a reason (V2, V3).

- [X] T014 [US2] Planner writes `assigned_note` on every `round_package` it inserts, in `EA/fleet/src/planner/assign.ts` (return the note per package: "Auto-assigned — fewest packages today (N)", "Auto-assigned — already collecting at this shop", "Auto-assigned — only driver available") and `EA/fleet/src/planner/repository.ts`; container proof **M1**
- [X] T015 [US2] Remove the round lock: delete `EA/fleet/src/functions/dispatch-lock-v1-post.ts`, `dispatch-unlock-v1-delete.ts` and their `serverless.yml` routes; `setLock` from `EA/fleet/src/dispatch/service.ts`; `locked_by_sub` filters from `EA/fleet/src/planner/{sql,repository,release}.ts` and `EA/fleet/src/dispatch/sql.ts`; update the 072 container tests that asserted lock behaviour (C11, C6 overrides) — delete them with a note; container proof **M5**
- [X] T016 [US2] `orders` reads: per package `collect` / `deliver` `Assignment` (driver, opens, due, round, `how`, `unassignedReason` from `assignment_exclusion` via `reasonWords`, `movable`), and on list rows `drivers` + `needsDriver` with filter `?needsDriver=true`, in `EA/orders/src/orders/{repository,service}.ts` + list handler; types in `order-admin.ts`
- [X] T017 [US2] Back-office Orders tabs: `BO/features/orders/OrdersLayout.tsx` (Orders · Assignments · Handover); routes in `BO/routes/orders.tsx`; `BO/routes/dispatch.tsx` → redirects to `/orders/assignments…`; remove Dispatch from `BO/components/layout/nav.ts`; live `dispatch` → also `["orders"]` in `BO/features/live/routes.ts`
- [X] T018 [US2] Move `BO/features/dispatch/` → `BO/features/assignments/`; trim: remove `LockControl.tsx` and the passes list; screen = "Needs a driver" list then a table (driver · collecting · delivering · opens · due), driver row → round page; "auto-assign" wording; remove `waves` from `EA/fleet/src/dispatch/service.ts` `readDay`; tests updated
- [X] T019 [P] [US2] Order list Driver column and "Needs a driver" filter in `BO/features/orders/OrdersListScreen.tsx`, `repo.ts`, `queries.ts`
- [X] T020 [US2] Order detail: under each package in `PackageRows.tsx`, "Collect: Ada · opens 1:15 pm" and "Deliver: Ben · due 7 pm" with the how line (or "Unassigned — <reason>"); component test

---

## Phase 5: User Story 3 — Assign or change a driver by hand (P3)

**Goal**: Assign to… and Unassign, safe, with one-line updates.
**Independent test**: assign an unassigned package, move one, unassign one (V4–V7).

- [X] T021 [US3] Extract `placePackage(tx, driverId, stage, bucket, pkg, note, bySub)` from `commitWave` in `EA/fleet/src/planner/repository.ts`; `commitWave` calls it; all 072 planner container tests stay green
- [X] T022 [US3] `GET /fleet/v1/dispatch/packages/{packageId}/drivers?stage=` in `EA/fleet/src/assignments/{sql,service}.ts` + handler + route: every active driver with `packagesToday`, `fit` (via `eligibilityReasons` against the round the package would join and `reasonSeverity`), `notes` (via `reasonWords`); fine → concern → cannot
- [X] T023 [US3] `POST …/assign` and `POST …/unassign` in `EA/fleet/src/assignments/service.ts` + handlers + routes: planner advisory lock, `FOR UPDATE` on the fulfillment, `expectedAssignmentId` check (409 `changed`), collected check (409 `collected`), cannot → 422 `cannot_take`, concerns without `acceptConcerns` → 409 `needs_confirm`; assign removes any open assignment then `placePackage` with `assigned_by_sub` and note "Assigned by <name>" (+ accepted concern); return `{ message }`; audit; announce ops `dispatch` + `orders` and both drivers' `work`; container proofs **M2**, **M3**, **M4**
- [X] T024 [US3] `BO/features/orders/components/AssignSheet.tsx` — side sheet with search; groups Fine / Concern / Can't take it (greyed); today's count and notes per driver; a Concern asks once; refusals shown as one line from `detail`; success → `sonner` toast with `message`; opened from each assignment line and from "Needs a driver"; absent for CSA; component test
- [X] T025 [US3] "Unassign" in the assignment line's menu (`dropdown-menu`) with the one-line toast; collected lines show "In <driver>'s van" and no menu; `changed` → toast "This changed — showing the latest" and refetch; component test

---

## Phase 6: Polish and release

- [X] T026 [P] `dispatch.manual` log line in the two mutation handlers
- [X] T027 Run every check in [quickstart.md](quickstart.md); break each S/M proof once and record it
- [X] T028 Documents: 073 entry in `FEATURE-HISTORY.md` and `CLAUDE.md` list; update the 072 paragraph in `CLAUDE.md` (lock removed); §073 in `docs/audiences/driver-capabilities.md`
- [X] T029 Write `specs/073-order-dispatch-control/SIGNOFF.md`
- [X] T030 **OPERATOR** `make db-up ENV=dev`
- [X] T031 **OPERATOR** `make edge-deploy` for `fleet`, `orders`, `shop`, `driver`
- [X] T032 **OPERATOR** deploy back-office and shop-web; build and install the driver app
- [ ] T033 **OPERATOR** walks V1–V8; V1 first

---

**Built differently from the task text (2026-10-07), and why:**
- **T004** — the facts query's container proof lives in the orders service (`status.container.test.ts`),
  which exercises it through the real reads, rather than a separate shared-library test.
- **T009 / T012 skipped** — driver history lists only delivered drops, so a status there would always
  read "Delivered". The driver app's own screens already use matching words. Nothing added.
- **T018** — the dispatch screens stay in `features/dispatch/` (renaming the folder was churn with no
  user-visible effect); they are mounted under `/orders/assignments`, with the lock control and the
  passes list removed and the old `/dispatch` routes redirecting.
- **T021** — no `placePackage` extraction: "Assign to…" builds a one-package plan and hands it to the
  planner's own `commitWave`, which already does find-or-create. One placement path, no new function.
- **Also changed**: drop started / failed / not-collected now tell the affected shops too
  (`announceStop`), not just hub check-in — each changes what the shop console shows.

## Dependencies

```text
T001–T002 → T003–T005 → US1 (T006–T013) → US2 (T014–T020) → US3 (T021–T025) → T026–T033
```

- US1 needs T002–T004 only (not the migration) and ships alone.
- US2 needs T001 (the note column). US3 needs US2's reads and T005.

## Parallel opportunities

- T001 ∥ T002; T005 ∥ T003.
- US1: after T006 — T007, T009, T011, T012 in parallel.
- US2: T019 alongside T020.

## Implementation strategy

- **MVP = US1** — the status fix. Deploy, walk V1.
- **Then US2** — read-only visibility and the removals.
- **Then US3** — the two manual actions; walk V4–V8 before relying on them.

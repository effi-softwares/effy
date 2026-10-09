# Tasks: Driver Operations Realignment

**Input**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md),
[contracts/routes.md](contracts/routes.md), [quickstart.md](quickstart.md)

**Tests**: included — proofs P1–P13 are the definition of done; each named one is broken once and restored.

Abbreviations: `EA` = `apis/edge-api`, `ST` = `packages/shared-types/src`, `BO` = `apps/back-office/src/features`,
`DM` = `apps/driver-mobile/shared/src/commonMain/kotlin/com/effyshopping/driver/mobile`.

⚠ Claude writes code; the operator deploys. ⚠ **No migration** (research R4).
⚠ **The driver wire is additive**: nothing the previous app reads is removed or renamed (FR-013).
⚠ Customer and supplier surfaces are not touched: "Same-day"/"Standard" stay for customers.
⚠ Known red before this feature: `EA/shop/src/attention/repository.container.test.ts` (079 SIGNOFF).

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 [P] In `ST/driver.ts` (and `ST/driver-contract.ts` if it re-exports): `HubCheckinResponse` gains `effyCount` and `effyGroups: { date; windowStart; windowEnd; label; count }[]`; mark `sameDayCount` / `standardCount` deprecated (kept until E9). Do NOT change the `same_day_delivery` kind value.
- [X] T002 [P] In `ST/dispatch.ts`: add `DispatchWindowsResponse` (days, date, windows with parcels — contracts § dispatch windows); remove `method` from unassigned/board row types and add `collectLate`; capability types become `{ function, zoneId }` (method optional-and-ignored on input, absent on output); coverage gap without method; the assign refusal `not_yet`.
- [X] T003 Regenerate the driver Kotlin contract (`pnpm --filter @effy/shared-types driver-contract:gen`); compile driver-mobile; `pnpm -r typecheck` (expect the readers fixed in later tasks to be the only errors — list them in a scratch note).

---

## Phase 2: Foundational (blocks every story)

- [X] T004 `EA/shared/src/lib/collection-deadline.ts`: `collectionRunFor(windowStart, runs, turnaroundMin, { noWeekdays, noDates }, maxDaysBack = 7)` — the latest run instant `R` with `R + turnaroundMin ≤ windowStart`, on the window's local day then earlier delivery days; null when none. **P1** in its test file (same day; previous delivery day's last run; skips a non-delivery weekday and date; the 2026-10-04 and 2027-04-04 DST days; no runs → null). Break once (drop the turnaround).
- [X] T005 `EA/shared/src/lib/driver-eligibility.ts`: remove `method` from `CandidateDriver.clearances` and `WorkUnit`; `isCleared` = a clearance for the function whose `zoneId` is null or equals the work's, **or any clearance for the function when the work's `zoneId` is null**. **P5** (unit) in its test: single-group driver + ungrouped postcode → cleared; no delivery grant → `not_cleared`; other group → `not_cleared`. Break once (restore the every-zone-only rule).
- [X] T006 `EA/shared/src/lib/driver-coverage.ts` and every caller of `eligibilityReasons` (`EA/fleet/src/planner/{assign,types,repository}.ts`, `EA/fleet/src/dispatch/service.ts`, `EA/fleet/src/assignments/service.ts`): drop `method` from the work unit and candidate mapping; "Every zone" label → "Everywhere", "N zones" → "N areas".

---

## Phase 3: User Story 1 — A later-day window is delivered on its own day (P1) 🎯 MVP

**Independent test**: an Effy parcel for a window two days ahead, at the hub: on no delivery round until its day; on its day on its window's round.

- [X] T007 [US1] `EA/fleet/src/planner/sql.ts` `GATHER_DELIVERY`: replace `sf.delivery_method = 'same_day'` with `${deliveredBySql("o", "COALESCE(opd.method, sf.delivery_method)", "opd.slot_id")} = 'effy'`; add `AND (opd.window_start IS NULL OR opd.window_start < $2::timestamptz)` (end of local today); select the real method no more (remove the `'same_day'::text AS method` column and its readers). `EA/fleet/src/planner/repository.ts` `gatherDeliveryWork(tx, packageId?, endOfToday)`; `service.ts` `planDelivery` passes `endOfLocalDay(now)`. The `$1` (one package) path keeps the day predicate too.
- [X] T008 [US1] **P2, P3, P11** in `EA/fleet/src/planner/planner.container.test.ts`: a `standard` parcel with a window two days ahead, checked in today → no round today or tomorrow, a round on its day for its window; a `standard` parcel with no window on a courier/legacy-carrier order → never; an order moved back to Effy by `moveToEffy` for a later day → a round on that day; today's window unchanged. Break P2 once (remove the day predicate) and P3 once (restore the method test).
- [X] T009 [US1] `EA/fleet/src/assignments/service.ts` `prepare`: for stage `delivery`, a parcel whose `window_start` is on a later local day → `AssignmentError("not_yet", "This delivery is for <day>. Its round is planned on the day.")`; map it in `assignments/handler-support.ts` (409). **P10** in the fleet container tests.
- [X] T010 [US1] `EA/orders/src/orders/assignments.ts` + its SQL: "waiting for a delivery driver" = delivered by Effy (`deliveredBySql`) AND collected AND at hub AND `public.round_opens_at('delivery', <deadline>, opd.window_start) <= now()` (windowless → waiting now); a parcel waiting for a later day returns a non-waiting state carrying its window. `EA/orders/src/orders/repository.ts` `needsDriver` filter uses the same expression (one shared SQL fragment in that file). **P8** in the orders container tests (not listed before opening; listed after; any day). Break once (drop the opened test).

---

## Phase 4: User Story 2 — Collected in time for the window (P1)

**Independent test**: runs at known times; parcels for today, tomorrow morning, two days ahead afternoon → each first offered on the latest run that reaches the hub in time; supplier pickup on none.

- [X] T011 [US2] `EA/fleet/src/planner/sql.ts` `GATHER_COLLECTION`: also select `opd.window_start` (LEFT JOIN `order_package_delivery`) and `delivered_by` (`deliveredBySql`); remove the `method` column. `repository.ts` maps them; `loadSchedule` also returns `turnaroundMin` (`delivery_settings.sameday_hub_turnaround_min`) and the delivery calendar (`standard_no_delivery_weekdays`, non-delivery dates — reuse `nonDeliveryDates` from `@effy/edge-shared/delivery`).
- [X] T012 [US2] `EA/fleet/src/planner/service.ts` `planCollection`: keep only parcels with `collectionRunFor(windowStart, …) === null || ≤ deadlineAt` when delivered by Effy with a window; courier-via-hub and windowless parcels are always kept. The one-package (`$1`) path used by "Assign to…" is NOT filtered. Count parcels whose intended run has passed and emit EMF `ParcelsCollectLate` (namespace as the pass's other metrics) from `functions/plan-waves-scheduled.ts`.
- [X] T013 [US2] **P4** in `planner.container.test.ts`: not offered on an earlier run; offered on the intended run; offered on the next run after missing it; a window too early for its own day's runs → the previous delivery day's last run; courier via hub → next run; supplier pickup → never. Break once (always keep).

---

## Phase 5: User Story 3 — Two groups at the hub, in plain words (P1)

**Independent test**: check in a run with a parcel for today, one for a later day and a courier parcel → two groups with day and window; no driver screen says the old words.

- [X] T014 [US3] `EA/driver/src/work/complete.ts`: the check-in read groups picked-up parcels by `delivered_by`; Effy parcels by (`opd.window_start`, `opd.window_end`) with `label = formatArrival(…)` (windowless → "Effy delivery"), sorted by window start; returns `effyCount`, `effyGroups`, `courierCount`, and the deprecated `sameDayCount` / `standardCount` unchanged. `functions/driver-hub-checkin-v1-post.ts` comment + response. **P7** in `EA/driver/src/work/checkin.container.test.ts` (+ `checkin.test.ts`). Break once (group by method).
- [X] T015 [US3] `EA/driver/src/work/{service,delivery,repository,sql}.ts`: any server-written label that says "Same-day"/"Standard" becomes "Delivery"/"Effy delivery"/"Courier"; a delivery round's title carries its day and window (`formatArrival`). Kind values unchanged. Port assertions in `hub-stop`, `drop-window`, `open`, `drop-progress`, `manifest` container tests.
- [X] T016 [US3] Driver app: `DM/features/collection/{domain/Collection.kt,data/HttpCollectionRepository.kt,presentation/CollectionScreens.kt}` — check-in result shows "Effy delivery" (one row per group: label + count) and "Courier" (count), falling back to the old counts when `effyGroups` is absent (older server); a single group present shows alone. Host test in `commonTest/.../collection` (**P13**).
- [X] T017 [P] [US3] Driver app wording: `DM/features/today/presentation/{UpcomingRounds,UpNextList,TodayScreen}.kt`, `DM/features/delivery/{domain/Delivery.kt,domain/DeliveryWindow.kt,presentation/DeliveryScreens.kt}`, `DM/features/map/presentation/MapScreen.kt`, `DM/features/history/presentation/HistoryScreens.kt`, `DM/core/nav/DriverRoutes.kt`, `DM/app/AppContainer.kt` — "Same-day delivery"/"Standard" → "Delivery"/"Effy delivery"/"Courier"; route and type NAMES may keep `sameDay` (not shown). Update host tests that assert the words.
- [X] T018 [US3] `scripts/check-driver-delivery-words.sh` (the shape of `scripts/check-shop-delivery-words.sh`): fail on a user-visible string matching `same[- ]day|standard` (case-insensitive) in `apps/driver-mobile/shared/src/commonMain` and in `BO/dispatch`, `BO/drivers`; allow identifiers and comments. Wire it where the shop script is run (CI / `package.json`). **P12** (script half): prove by planting one string.

---

## Phase 6: User Story 4 — Permissions: collects, delivers, and where (P2)

**Independent test**: a driver with mixed old grants shows as Collects/Delivers with areas, nothing lost; an ungrouped postcode's delivery is offered to a single-group driver.

- [X] T019 [US4] `EA/fleet/src/planner/sql.ts` `CANDIDATE_DRIVERS`: clearances as `DISTINCT (function, zone_id)` — no `method`. `EA/fleet/src/capabilities/{sql,repository,service}.ts`: list returns one entry per (function, area); grant inserts one row (`method = 'standard'`, with a comment: unread since 082, dropped at E9) unless a row for that (function, area) exists; revoke deletes every row for that (function, area); validation ignores an incoming `method`; remove `CAPABILITY_METHODS`. Update `capabilities/service.test.ts`.
- [X] T020 [US4] `EA/fleet/src/coverage/repository.ts` (+ service): gaps per (group, function) — a group nobody is cleared for; drop the method enumeration. `EA/fleet/src/drivers/sql.ts`, `EA/fleet/src/duty/repository.ts`, `EA/fleet/src/shared/audit.ts`, `EA/driver/src/driver/{repository,types}.ts`: no `method` in what they read or record.
- [X] T021 [US4] **P6** in the fleet container tests: a driver holding only `same_day` rows and one holding only `standard` rows for delivery in a group are both candidates for an Effy delivery there; granting when one row exists adds none; revoking removes both rows. **P5** (container): ungrouped postcode → single-group driver assigned.
- [X] T022 [US4] `EA/fleet/src/driver-method.guard.test.ts` (**P12**, guard half): no `c.method` / `cap.method` / `needed.method` read and no `'same_day'` literal in `fleet/src/{planner,dispatch,capabilities,coverage,assignments}`; `delivery_method = 'same_day'` appears nowhere in `fleet` or `orders/src/orders`. Break once.
- [X] T023 [P] [US4] Back-office: `BO/drivers/capabilityModel.ts`, `components/CapabilityEditor.tsx` (+ test), `components/CoveragePanel.tsx` (+ test), `components/ProfileEditForm.tsx` — two sections, **Collects** and **Delivers**, each "Everywhere" or chosen areas; no method anywhere; coverage gaps per area and function.

---

## Phase 7: User Story 5 — Dispatch sees every day on sale (P2)

**Independent test**: parcels for today and two later days → switch days, see each window's parcels and state; "needs a driver" lists a hub parcel only once its round has opened.

- [X] T024 [US5] `EA/fleet/src/dispatch/windows.{repository,service}.ts`: days from `effyDays` (settings + non-delivery dates); for the date, Effy parcels with a window that local day grouped by window — status through `packageStatuses` (`@effy/edge-shared/status`), `collectLate` (ready, uncollected, `collectionRunFor < next run`), `coldOvernight` (chilled/frozen and hub check-in local date < window date), group name, and the window's round (driver, `round_opens_at`) or null. Function `EA/fleet/src/functions/dispatch-windows-v1-get.ts` (read gate = active staff) registered in `EA/fleet/serverless.yml` (staff gateway); route inventory / `gateway-capacity.contract.test.ts` green. **P9** in a fleet container test.
- [X] T025 [US5] `EA/fleet/src/dispatch/{sql,service}.ts`: `UNASSIGNED_WORK` delivery half uses `deliveredBySql` + the on-its-day predicate (same as T007); rows lose `method`, gain `collectLate`; round capability questions per distinct zone only. Update `dispatch/service.test.ts`.
- [X] T026 [US5] Back-office: `BO/dispatch/{repo,queries,model}.ts` + `DispatchDayScreen.tsx` — day tabs (today first) from the new read; a table per window (parcel, status pill via `PackageStatusPill`, "Collect late", "Needs cold storage", driver or "Planned on the day"); `components/UnassignedPanel.tsx`, `RoundDetailScreen.tsx`, `model.ts` without method words; `errorText.ts` gains `not_yet`. Live: the new query key under the dispatch kinds in `features/live/routes.ts`. Tests beside each.

---

## Phase 8: Polish & cross-cutting

- [X] T027 Run every affected suite with containers (shared, fleet, driver, orders, commerce, admin), back-office, shared-types, driver-mobile host tests, `pnpm -r typecheck`, `scripts/check-driver-delivery-words.sh`, `scripts/check-shop-delivery-words.sh`, `scripts/check-no-refresh-timers.sh`, design-system guards.
- [X] T028 [P] Docs: `docs/logistics-engine-architecture.md` (who is Effy's, on-its-day planning, the run rule, permissions), `docs/driver-app-design-brief.md` (check-in groups, words), `docs/order-console-guide.md` (Assignments day selector, needs a driver, cold storage).
- [X] T029 `specs/082-driver-operations-realignment/SIGNOFF.md`, `FEATURE-HISTORY.md` 082 entry (deploy order: `fleet`, `driver`, `orders`; back-office build; driver app release), CLAUDE.md (feature line; update the driver-logistics bullets that say the planner gathers `same_day` only and that an ungrouped postcode needs an every-zone driver), backlog E8 status and task ticks.

---

## Dependencies

- Setup (T001–T003) → Foundational (T004–T006) → stories.
- US1 (T007–T010) needs T005–T006. US2 (T011–T013) needs T004. US3 (T014–T018) needs T001.
- US4 (T019–T023) needs T005–T006; US5 (T024–T026) needs T004, T007.
- US1, US2, US3 are independent of each other after Foundational.

## Parallel examples

- After Foundational: US1 (fleet planner delivery), US3 (driver service + app) and US4's back-office T023 touch different files.
- T017 and T023 alongside any backend task.

## Implementation strategy

MVP = Phases 1–3: later-day windows get a round on their day and "needs a driver" is right — the thing
the model switch waits for. Then US2 (collection timing), US3 (check-in and words), US4 (permissions),
US5 (dispatch day view), polish. Each phase ends with its proofs green and the named one broken once.

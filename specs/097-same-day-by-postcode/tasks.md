---

description: "Task list for 097 — Delivery Today, Postcode by Postcode"
---

# Tasks: Delivery Today, Postcode by Postcode

**Input**: Design documents from `specs/097-same-day-by-postcode/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/admin-coverage.md](contracts/admin-coverage.md),
[quickstart.md](quickstart.md)

**Tests**: included. The spec's acceptance scenarios and [quickstart.md](quickstart.md)'s machine
checks are the verification; each story's tests sit beside the code they prove, in the files that
already test that code.

**Organization**: grouped by user story. US1 and US2 are both P1 and share the foundation (Phase 2);
US1 is the MVP.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1, US2, US3 — from [spec.md](spec.md)

Paths are repository-relative. Backend lives under `apis/edge-api/`, back-office under
`apps/back-office/src/`, staff types under `packages/shared-types/src/`.

---

## Phase 1: Setup

**Purpose**: nothing to scaffold — every file already exists (plan "Structure Decision"). One
read-before-write step so nothing is built on a stale assumption.

- [X] T001 Read the 076, 078 and 085 entries in `FEATURE-HISTORY.md` (search "076-", "078-", "085-") and the current `apis/edge-api/shared/src/delivery/coverage.guard.test.ts`; confirm the allowed readers of `delivery_zone_postcode` and of `coverage_for_postcode(` are still the ones research R2 relies on (admin coverage repository; `shared/src/delivery/coverage.ts`). If either list has changed, update research R2 before going on.

---

## Phase 2: Foundational (blocks every story)

**Purpose**: the stored fact, the one coverage answer that carries it, and the one calendar that
obeys it. Nothing customer-visible changes yet — every row is `true`.

- [X] T002 Create migration `db/migrations/20261023090000_coverage_today_offered.sql` (Goose; house style: `COMMENT ON` everything, no triggers). Up: (1) `ALTER TABLE public.delivery_zone_postcode ADD COLUMN today_offered boolean NOT NULL DEFAULT true` with a `COMMENT ON COLUMN` stating per-postcode (never per group), read only through `public.coverage_for_postcode`, and that switching it off never touches a held or confirmed place; (2) `DROP FUNCTION public.coverage_for_postcode(text, timestamptz)` then `CREATE FUNCTION public.coverage_for_postcode(p_postcode text, p_at timestamptz DEFAULT now()) RETURNS TABLE (kind text, reason text, distance_km numeric, group_id uuid, group_name text, today_offered boolean)` — body copied from `db/migrations/20261009011552_order_delivery_type.sql` §5, the listed branch selecting `zp.today_offered`, the courier/none branch returning `true`; wrap in `-- +goose StatementBegin/End`; restore its `COMMENT ON FUNCTION` with one added sentence about `today_offered`. Down: drop and re-create 079's exact definition and comment, then `ALTER TABLE … DROP COLUMN today_offered`. Before naming the file, check `ls db/migrations | tail -1` and use a timestamp after the last one.
- [X] T003 Add `todayOffered: boolean` to `Coverage` in `apis/edge-api/shared/src/delivery/coverage.ts`: select `today_offered` in `coverageForPostcode`, map it, and make the "database that predates it" fallback return `todayOffered: true`. Doc comment: meaningful only when `kind === "effy"`; `true` otherwise (research R5).
- [X] T004 Change `effyDays` in `apis/edge-api/shared/src/delivery/windows.ts` to `effyDays(now, lookahead, noWeekdays, noDates, todayOffered)` — all five required (remove the defaults). When `todayOffered` is false the result has no `isToday` day; the loop still yields `lookahead` later delivery days. Update the doc comment ("Today is always first…") to say: first unless today is not offered for this address (097), in which case it is absent — never listed as closed.
- [X] T005 [P] Update every `effyDays(` call in tests to the new signature — `apis/edge-api/shared/src/delivery/windows.test.ts`, `apis/edge-api/commerce/src/checkout/checkout.container.test.ts`, `apis/edge-api/fleet/src/slots/slots.container.test.ts` (pass `true` where the test is not about 097) — and add to `windows.test.ts`: (a) `todayOffered=false` → no `isToday` day, same later days as with `true` minus today; (b) on a non-delivery today with `false`, the result is identical to (a); (c) `lookahead` later days still returned.
- [X] T006 [P] Pass `true` at the two staff calendars, each with the comment `// 097 — a staff calendar, not an address: today is always shown.` — `apis/edge-api/fleet/src/dispatch/windows.ts` (line ~80) and `apis/edge-api/fleet/src/slots/service.ts` (line ~76).
- [X] T007 Run `pnpm --filter @effy/edge-shared test` and `pnpm --filter @effy/edge-fleet test`; both green, `coverage.guard.test.ts` included (no new reader).

**Checkpoint**: column, coverage answer and calendar in place; all callers compile; nothing behaves differently because every row is `true`.

---

## Phase 3: User Story 1 — Switch delivery today off for far postcodes (P1) 🎯 MVP

**Goal**: a manager filters the Coverage list (e.g. farther than 25 km), selects, switches Delivery
today off; customers at those addresses see no Same-day section, later days as before; ASAP lands on
a later day; switching back on restores today.

**Independent Test**: spec US1 "Independent Test" — switch 3220 off with a window open today;
checkout to 3220 shows no Same-day section and starts at the next delivery day; 3121 unchanged.

### Shared types (staff contract)

- [X] T008 [P] [US1] In `packages/shared-types/src/delivery-admin.ts`: add `todayOffered: boolean` to `CoveragePostcodeDTO`; `todayNotOffered: number` to `CoverageListDTO.counts`; `todayOffered?: boolean` to `AddCoveragePostcodesRequest` (doc: absent = true) and to `PatchCoveragePostcodesRequest` (doc: for every named postcode; may combine with `groupId`). Each with a `097 —` doc line.

### Checkout (customer side — no customer file changes)

- [X] T009 [US1] In `apis/edge-api/shared/src/delivery/quote.ts` `quote()`: pass `coverage.todayOffered` as `effyDays`'s fifth argument. Add a short comment above the call: today is absent for an address whose postcode does not offer it — so no Same-day section, no today surcharge, ASAP on a later day, and a stale today choice refused at the intent (research R3). No other change in this file.
- [X] T010 [US1] Add to `apis/edge-api/commerce/src/checkout/checkout.container.test.ts` (reuse its existing setup for a listed postcode, windows and a clock with a window open today): (a) with `UPDATE public.delivery_zone_postcode SET today_offered = false` the quote DTO's `effyWindows.days` has no `section: "same_day"` entry and its `standard` days and fees equal the `true` quote's; (b) an ASAP intent places the order on the first later day; (c) an intent naming today's window is refused `date_unavailable` and writes no order delivery/booking rows; (d) a second listed postcode left `true` in the same database still gets today's window.
- [X] T011 [P] [US1] Add a test to `packages/shared-types/src/effy-windows.test.ts` proving `effyWindowsView` returns `today: null` for a DTO with no `same_day` day — the property both customer apps rely on (web `EffyWindowOptions.tsx` `{today ? … : null}`, app `CheckoutScreen.kt` `view.today?.let`). Add the same case to `packages/shared-types/src/effy-windows.fixtures.json` so `EffyWindowsView.kt`'s pinned test covers it too; change no product code.

### Staff: list, filters, bulk change (admin service)

- [X] T012 [US1] In `apis/edge-api/admin/src/delivery/coverage.repository.ts`: `PostcodeRow.todayOffered` (select `zp.today_offered`); `ListFilters.today?: "offered" | "not_offered"` → `zp.today_offered = true|false`, and `ListFilters.minKm?: string` → `zp.distance_km >= $n::numeric`; `Totals.todayNotOffered` via `count(*) FILTER (WHERE NOT zp.today_offered)` in `totals()`; new `setTodayOffered(postcodes: string[], offered: boolean, actorSub: string): Promise<"not_listed" | number>` in one transaction — `SELECT postcode, today_offered … WHERE postcode = ANY($1) FOR UPDATE`; if fewer rows than postcodes return `"not_listed"` (write nothing); `UPDATE … SET today_offered = $2, updated_at = now() WHERE postcode = ANY($1) AND today_offered IS DISTINCT FROM $2`; when rows changed, one `audit(client, actorSub, "coverage.postcode.today", { before: {<postcode>: <old>} for changed only, after: offered })`; return the count changed.
- [X] T013 [US1] In `apis/edge-api/admin/src/delivery/coverage.service.ts`: `list()` passes `today`/`minKm` through after validating them (`today` ∈ offered|not_offered; `minKm` matches `^\d{1,4}(\.\d{1,2})?$`; else `CoverageError(400, "invalid_request", …)`) and maps `todayOffered` + `counts.todayNotOffered`; `patchPostcodes()` accepts `todayOffered` — boolean or 400 — counts as something to change (update the "nothing to change" check), applies it via `repo.setTodayOffered` (404 `not_listed` on `"not_listed"`) before the existing group move, then the existing `changed()` announce.
- [X] T014 [US1] In `apis/edge-api/admin/src/functions/delivery-coverage-list-v1-get.ts`: pass `today: qs.today` and `minKm: qs.minKm` into `list(...)` (and add them to `ListQuery` in the service).
- [X] T015 [US1] Add admin tests in the existing coverage container test (`apis/edge-api/admin/src/delivery/coverage.container.test.ts`): list shows `todayOffered` and `counts.todayNotOffered`; `today=not_offered` and `minKm=25` filter correctly and combine with `group`; bulk PATCH switches several off with ONE `coverage.postcode.today` audit row listing only changed postcodes; a PATCH naming one unlisted postcode → 404 and nothing changed, no audit; a repeated PATCH is a no-op with no audit; non-boolean `todayOffered` and bad `minKm`/`today` → 400.

### Staff: back-office

- [X] T016 [US1] In `apps/back-office/src/features/delivery/repo.ts`: `CoverageFilters.today?: "offered" | "not_offered"` and `minKm?: string`, sent as query params by `listCoverage`.
- [X] T017 [US1] In `apps/back-office/src/features/delivery/coverage/CoveragePanel.tsx` (table + toolbar; no cards): (a) a **Delivery today** column after "Distance from hub" showing "Offered" / "Not offered" (muted text for offered, a neutral `Badge` for not offered — existing tokens only); (b) a **Delivery today** facet beside the existing Group/Distance facets (All · Offered · Not offered) bound to `filters.today`; (c) a **Farther than** filter (a small numeric input in km, applied on blur/Enter) bound to `filters.minKm`, included in `anyFilter`; (d) in the bulk bar (managers only, existing `bo-bulkbar`), a **Delivery today** select ("Offer" / "Don't offer") that calls `usePatchCoveragePostcodes` with `{ postcodes: [...selected], todayOffered }` and clears the selection on success, showing `coverageError` on failure; (e) the summary line gains "· N not offered today" when `counts.todayNotOffered > 0`.
- [X] T018 [US1] Add to `apps/back-office/src/features/delivery/coverage/CoveragePanel.test.tsx`: the column renders both states; choosing "Not offered" and entering 25 in "Farther than" call `listCoverage` with `{ today: "not_offered", minKm: "25" }`; selecting two rows and choosing "Don't offer" calls `patchCoveragePostcodes({ postcodes: [..two..], todayOffered: false })`; customer-service (`canManage=false`) sees the column and facets but no bulk bar. Update the `list()` fixture rows with `todayOffered`.

**Checkpoint**: US1 is shippable — staff can switch far postcodes off in bulk; checkout honours it.

---

## Phase 4: User Story 2 — Every door agrees (P1)

**Goal**: the back-office paths that put an order in an Effy window obey the same calendar; a held
place and placed orders are untouched.

**Independent Test**: spec US2 "Independent Test" — with 3220 off, move-to-Effy and re-time list no
today window and refuse one; with 3121 both still offer today.

- [X] T019 [US2] In `apis/edge-api/shared/src/delivery/override.ts`: change `windowsNow(q, now)` to `windowsNow(q, f, now)` and `bindEffyWindow(tx, orderId, window, now)` to take the order's `MoveFacts` (`f`) as well; in both, `const todayOffered = f.postcode ? (await coverageForPostcode(q, f.postcode, now)).todayOffered : true;` and pass it as `effyDays`'s fifth argument. Update the three call sites (`previewMove` ~L441, `moveToEffy` ~L618, `changeEffyWindow` ~L746). In `guardBackToEffy`, reuse the coverage it already fetches if convenient — do not add a second coverage read in the same function. Comment: an Effy order whose postcode has since left the list keeps today's behaviour (research R5).
- [X] T020 [US2] Add override tests to `apis/edge-api/shared/src/delivery/override.container.test.ts` (and, if `changeEffyWindow` is tested through the route, `apis/edge-api/orders/src/delivery-move/delivery-move.container.test.ts`): with `today_offered = false` for the order's postcode and a window open today — `previewMove(…, "effy")` lists no window dated today; `moveToEffy` and `changeEffyWindow` with a today window throw `DeliveryMoveError("window_unavailable")` and change nothing; a later-day window succeeds; with `true` today's window is listed and accepted.
- [X] T021 [US2] Add to `apis/edge-api/commerce/src/checkout/checkout.container.test.ts`: (a) a customer who has already reached the payment step holding today's window, then `today_offered` switched off, then payment confirmed → the order is confirmed in today's window (FR-009); (b) an order already paid for today is unchanged after the switch-off (booking, packages, fee).
- [X] T022 [US2] Run `pnpm --filter @effy/edge-commerce test`, `pnpm --filter @effy/edge-orders test` and `pnpm --filter @effy/edge-shared test` — green, including `override.guard.test.ts` and `fee.guard.test.ts`.

**Checkpoint**: no path can sell, move or re-time an order into today for a postcode that does not offer it.

---

## Phase 5: User Story 3 — Staff can see and explain it (P2)

**Goal**: the checker says whether today is offered; Add places lets staff choose it; CSA reads, cannot change; other open screens update live.

**Independent Test**: spec US3 "Independent Test" — checker on 3220 vs 3121; CSA sees column and checker answer but no control.

- [X] T023 [P] [US3] In `packages/shared-types/src/delivery-admin.ts`: add `todayOffered: boolean | null` to `CoverageCheckDTO` (doc: null when the postcode is not listed).
- [X] T024 [US3] In `apis/edge-api/admin/src/delivery/coverage.service.ts` `checkOne()`: set `todayOffered: coverage.kind === "effy" ? coverage.todayOffered : null` from the `coverageForPostcode` result it already has. In `addPostcodes()`: read `body.todayOffered` (absent → true; non-boolean → 400) and pass it to `repo.addPostcodes`.
- [X] T025 [US3] In `apis/edge-api/admin/src/delivery/coverage.repository.ts` `addPostcodes(items, groupId, todayOffered, actorSub)`: insert `today_offered`, and add `todayOffered` to the `coverage.postcode.add` audit `after`. Update its one caller.
- [X] T026 [US3] In `apps/back-office/src/features/delivery/coverage/PostcodeChecker.tsx`: for an `effy` match append "Delivery today offered." or "Delivery today not offered." to the existing sentence (no new colour; the existing wording style).
- [X] T027 [US3] In `apps/back-office/src/features/delivery/coverage/AddPlacesDialog.tsx`: a checkbox **Offer delivery today** (default checked), shown with the group select when at least one postcode is ticked, sent as `todayOffered` in the add request; reset with the rest of the form.
- [X] T028 [US3] Tests: in `apis/edge-api/admin/src/delivery/coverage.container.test.ts` — add with `todayOffered: false` stores it and audits it; add without it stores `true`; check returns `todayOffered` for listed and `null` for unlisted. In `apps/back-office/src/features/delivery/coverage/CoveragePanel.test.tsx` — the checker line for both states; Add places sends `todayOffered: false` when unticked and omits/true by default (update the existing add expectations to include the field as sent).
- [X] T029 [US3] Confirm live update needs no new code: the PATCH and POST already `announce([{ scope: "ops", kind: "coverage" }])` after commit and `features/live/routes.ts` maps `coverage` to the coverage query root; run `apis/edge-api/shared/src/live/change-map.guard.test.ts` to prove no route was added without an announce.

**Checkpoint**: all three stories complete and independently verifiable.

---

## Phase 6: Polish & cross-cutting

- [X] T030 [P] Update `CLAUDE.md` "Coverage (076)" / "Windows (069, 078)" bullets with one ⚠ line: delivery today is offered per listed postcode (`delivery_zone_postcode.today_offered`, default true, never per group); where it is off the Effy calendar for that address does not contain today (`effyDays`'s fifth argument) — no Same-day section, ASAP on a later day, back-office move/re-time refuse today; read only through `coverage_for_postcode`.
- [X] T031 [P] Add the **097-same-day-by-postcode** entry at the top of `FEATURE-HISTORY.md` (what changed, the design decision and the two rejected alternatives from research R3, verification run, and the operator steps from quickstart.md including "switch nothing off until `commerce` and `orders` are deployed"), and add it to the "Features recorded" list in `CLAUDE.md` with status "built; NOT migrated, deployed or walked".
- [X] T032 Run the full machine checks in [quickstart.md](quickstart.md) — `pnpm --filter @effy/edge-shared test`, `@effy/edge-admin`, `@effy/edge-commerce`, `@effy/edge-orders`, `@effy/edge-fleet`, `@effy/back-office`, `pnpm typecheck`, plus `apis/edge-api/shared/src/lib/gateway-capacity.contract.test.ts` to show no route was added. Record results in the FEATURE-HISTORY entry; report any failure verbatim rather than marking done.
- [X] T033 Hand the operator steps to the user (do NOT run them): `make db-up ENV=dev`; then `make edge-deploy SERVICE=commerce ENV=dev`, `SERVICE=orders`, `SERVICE=admin`, `SERVICE=fleet`; back-office deploys on push to `dev`; then the walk in quickstart.md §3.

---

## Dependencies & Execution Order

- **Phase 1 → Phase 2**: T001 before anything.
- **Phase 2 blocks all stories**: T002 → T003 → T004 → (T005, T006 in parallel) → T007.
- **US1 (Phase 3)**: T008 any time after Phase 2. Checkout chain T009 → T010. Admin chain T012 → T013 → T014 → T015 (needs T008). Back-office chain T016 → T017 → T018 (needs T008). The three chains are independent of each other; T011 is independent of all.
- **US2 (Phase 4)**: needs Phase 2 only (not US1). T019 → T020; T021 needs the checkout test setup from T010 if done first, else independent; T022 last.
- **US3 (Phase 5)**: needs T008 (shared-types file) and T012/T013 (same admin files — do after US1's admin tasks to avoid edit collisions). T023 → T024 → T025 → T028; T026, T027 after T023.
- **Polish**: after the stories it documents.

### Story completion order

Phase 2 → US1 (MVP) → US2 → US3 → Polish. US2 may run alongside US1 (different files: `override.ts` vs `quote.ts`/admin/back-office).

## Parallel Execution Examples

**After Phase 2:**
```
T008 shared-types   |  T009→T010 checkout   |  T011 picker view test   |  T019→T020 override (US2)
```

**Inside US1, once T008 is done:**
```
T012→T013→T014→T015 (admin service)   |   T016→T017→T018 (back-office)
```

**Polish:**
```
T030 CLAUDE.md   |   T031 FEATURE-HISTORY.md
```

## Implementation Strategy

1. **MVP = Phase 2 + US1.** At that point staff can switch far postcodes off and checkout obeys. It
   is safe to deploy alone *only if* staff are told not to move or re-time orders into today for
   those postcodes by hand — so prefer shipping US2 with it (both P1, ~1 extra file).
2. **US2** closes the back-office doors. Ship US1 + US2 together as the release.
3. **US3** (checker line, Add places choice) can follow in the same release or the next.
4. Every phase ends green on its own tests; no phase changes a customer file.

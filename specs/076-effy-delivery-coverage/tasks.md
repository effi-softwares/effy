# Tasks: Effy Delivery Coverage

**Input**: Design documents from `specs/076-effy-delivery-coverage/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/routes.md](contracts/routes.md), [quickstart.md](quickstart.md)

**Tests**: included. The proofs P1–P16 in the quickstart are part of this feature's definition of done.
Each is broken once to see it fail.

**Organization**: by user story (spec.md). Paths are repo-relative. Abbreviations:
`EA` = `apis/edge-api`, `ST` = `packages/shared-types/src`, `BO` = `apps/back-office/src/features/delivery`,
`CW` = `apps/customer-web`, `CM` = `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/features`.

⚠ **Mode of work**: Claude writes the code, SQL and Terraform; the operator runs `make db-up`, every
`make edge-deploy` and `make apply` (quickstart → Operator steps).

⚠ **The live checkout keeps selling same-day/standard throughout.** Nothing here may change a fee or
who is served at release — P1 and P7 are written before the code they guard.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US7 from spec.md

---

## Phase 1: Setup

- [X] T001 Scaffold the migration with `make db-new name=effy_delivery_coverage` → `db/migrations/<ts>_effy_delivery_coverage.sql` (empty Up; Down is a dev-only reversal, forward-only otherwise).
- [X] T002 [P] In `ST/delivery.ts` add `CoverageKind`, `COVERAGE_LABEL`, `COVERAGE_REFUSAL_CODE`, `COVERAGE_REFUSAL_SENTENCE` exactly as in [contracts/routes.md](contracts/routes.md) "Shared words", with a comment that this file is the ONLY place the sentence and the two labels are written (FR-022); add `coverage: CoverageKind` to `DeliveryQuoteDTO` and to the serviceability DTO (wherever `serviced: boolean` is declared at line ~28), documenting that `serviced` stays for released clients and equals `coverage !== "none"`.
- [X] T003 [P] In `ST/live.ts` add `"coverage"` to `LIVE_KINDS` (ops channel only — say so in the comment); update `ST/live.test.ts` expectations.

---

## Phase 2: Foundational (blocks every story)

**Purpose**: the list, its distance, the one deciding function, and the bridges that keep the live checkout unchanged.

### Schema

- [X] T004 Write the safety-net tests FIRST in `EA/shared/src/delivery/coverage.container.test.ts`: **P1** — on a database migrated to just before 076 and seeded with two active zones, one disabled zone and postcodes in each, record `serviced` for every `locality` postcode; apply 076; assert the set of served postcodes is identical (the disabled zone's were not served before). **P7** — record the quoted standard and same-day fee for a postcode in each active zone before; assert identical after. Use the migration loader in `EA/shared/src/lib/load-migrations.ts` to stop before 076. Both red until T005–T011.
- [X] T005 In the migration: `public.haversine_km(numeric, numeric, numeric, numeric) RETURNS numeric IMMUTABLE` and `public.coverage_computed_distance_km(p_postcode text) RETURNS numeric(7,2) STABLE` per [data-model.md](data-model.md) (primary place = the `locality` row for the postcode with non-null coordinates, highest `address_count`, then `name`; hub from `delivery_settings`; NULL when none). COMMENT each: the formula lives here only.
- [X] T006 In the migration, in this order: (a) collect postcodes whose zone is `status = 'disabled'`, `RAISE NOTICE` them, insert one `admin.audit_log` row (`actor_sub = 'migration:076'`, `action = 'coverage.postcode.remove'`, detail = the list and "zone was disabled: not served before 076") and delete them; (b) on `delivery_zone_postcode`: drop the `zone_id` FK and re-add it `ON DELETE SET NULL`, `ALTER COLUMN zone_id DROP NOT NULL`, add `distance_km numeric(7,2)`, `distance_source text`, `distance_review boolean NOT NULL DEFAULT false`, `added_by text`, `updated_at timestamptz NOT NULL DEFAULT now()`; (c) backfill `computed` from `coverage_computed_distance_km`; else `manual` from the zone's `hub_distance_km` with `distance_review = true`; (d) **RAISE EXCEPTION naming the postcodes** if any row still has no distance — never guess; (e) `SET NOT NULL` on `distance_km`, `distance_source`, `added_by` (`'migration:076'`), add the two CHECKs (`0..5000`, `IN ('computed','manual')`); `RAISE NOTICE` the manual ones to review.
- [X] T007 In the migration: `delivery_zone.ring_id DROP NOT NULL`; `ALTER COLUMN sameday_eligible SET DEFAULT true`; `delivery_settings ADD COLUMN courier_offered boolean NOT NULL DEFAULT false`; create `public.courier_excluded_postcode` per data-model.md. Rewrite the COMMENTs on `delivery_zone` and `delivery_zone_postcode` (now "a coverage group" / "the list of postcodes Effy delivers to"; names historical until E9; `status` no longer decides coverage; which columns are frozen and which epic drops them) and add `'076 — frozen, removed by E3/E5/E9'` comments on `delivery_ring`, `shop_sameday_exception`, `delivery_zone.sameday_eligible`, `hub_distance_km`, `suggested_ring_id`, `ring_is_overridden`.
- [X] T008 In the migration: `public.coverage_ring_for_km(p_km numeric) RETURNS uuid STABLE` (active ring with the smallest `suggest_upper_km >= p_km`, else the open-ended one, else the furthest — the rule in `EA/admin/src/delivery/suggest.ts` `ringForDistance`, moved) and **`public.coverage_for_postcode(p_postcode text) RETURNS TABLE (kind text, reason text, distance_km numeric, group_id uuid, group_name text) STABLE`** implementing the five-row decision in data-model.md. COMMENT: the ONLY place coverage is decided (FR-020), in the style of `round_opens_at` / `points_usable`.
- [X] T009 In the migration: grants for the shopper role (`effy_shopper`, see `db/migrations/20261005032655_shopper_role.sql`) — `EXECUTE` on `coverage_for_postcode` and `coverage_ring_for_km`, `SELECT` on `courier_excluded_postcode`; confirm it already has `SELECT` on the two zone tables and `delivery_settings`, add if not; REVOKE write on `courier_excluded_postcode` if default privileges granted it. Write the Down block (dev only).

### Shared library

- [X] T010 Create `EA/shared/src/delivery/coverage.ts`: `Coverage` type, `coverageForPostcode(q, postcode)` (one query on `coverage_for_postcode`), `COURIER_ORDERING_AVAILABLE = false` with a comment that E5 flips it and what breaks if flipped early (research R7); export from `EA/shared/src/delivery/index.ts`.
- [X] T011 Rebuild `EA/shared/src/delivery/zone.ts` on it: `serviceableForPostcode` = `kind === 'effy'` (comment: courier is not purchasable until E5); `zoneForPostcode` returns `{ id: groupId | null, ringId, sameDayEligible }` from one query applying the three bridges of research R5 (`COALESCE(z.ring_id, coverage_ring_for_km(distance_km))`, `COALESCE(z.sameday_eligible, true)` via a LEFT JOIN on the group), each bridge commented with the epic that deletes it; widen `Zone.id` to `string | null` and make `sameDayForShops` return the default for a null zone. Fix the compile fallout in `EA/shared/src/delivery/quote.ts` (`zoneId` in the result becomes nullable) and its callers in `EA/commerce/src/checkout/`.
- [X] T012 Extend `coverage.container.test.ts`: **P2** (no listed row without a distance; a seeded postcode with no coordinates and no zone distance makes the migration raise), **P3** (all five reasons), **P5** (deleting a `delivery_zone` row leaves its postcodes, ungrouped), **P8** (a postcode inserted after the migration with `zone_id NULL`, and one in a group with `ring_id NULL`, both quote a fee and offer same-day when a slot is open), **P15** (inserting a `shop_sameday_exception` or updating any `shop` column changes `coverage_for_postcode` for no postcode). Run with `TESTCONTAINERS_RYUK_DISABLED=true CONTAINER_TESTS=1`; P1–P3, P5, P7, P8, P15 green.
- [X] T013 Break-and-restore, recording each for SIGNOFF: P1 (make the migration delete an active zone's postcode), P7 (make `zoneForPostcode` use `coverage_ring_for_km` for every postcode), P5 (leave the FK as CASCADE).

**Checkpoint**: the migration applies on a fresh database and on a pre-076 one; fees and served postcodes are unchanged; `pnpm --filter @effy/edge-shared test` and `@effy/edge-commerce test` pass.

---

## Phase 3: User Story 7 — The old arrangement leaves, nobody loses delivery (P1) 🎯 part of MVP

**Goal**: the controls for tiers, same-day zones and shop exceptions are gone from the backend; coverage at release is exactly what it was.

**Independent test**: P1, P7 green; the eleven routes no longer exist; `gateway-capacity` still passes.

- [X] T014 [US7] Delete from `EA/admin/src/functions/`: `delivery-rings-create-v1-post.ts`, `delivery-zones-create-v1-post.ts`, `delivery-zones-list-v1-get.ts`, `delivery-zones-patch-v1-patch.ts`, `delivery-zone-postcode-add-v1-post.ts`, `delivery-zone-postcode-remove-v1-delete.ts`, `delivery-zone-suggest-ring-v1-post.ts`, `delivery-exceptions-list-v1-get.ts`, `delivery-exception-put-v1-put.ts`, `delivery-exception-delete-v1-delete.ts`, `delivery-postcode-check-v1-get.ts`; remove their eleven function blocks from `EA/admin/serverless.yml`. Keep `delivery-rings-list-v1-get.ts` with a comment: read-only, for the fee-plan dialog, removed by E3.
- [X] T015 [US7] Remove the now-unreachable code from `EA/admin/src/delivery/{repository,service,types,handler-support}.ts` (zone create/patch, zone-postcode add/remove, ring create, suggest, exceptions, postcode check) and delete `EA/admin/src/delivery/suggest.ts` + `suggest.test.ts`; trim `service.test.ts` to what remains. `pnpm --filter @effy/edge-admin run typecheck` clean.
- [X] T016 [US7] In `ST/delivery-admin.ts` remove the zone, ring-create, suggest and exception DTOs that nothing imports any more (keep the ring list DTO and plan DTOs); `pnpm -r typecheck` and fix every importer — back-office files that break are deleted in T041, so stub nothing: do T041's deletions first if needed.
- [X] T017 [US7] ⟨read; none changed — every reader already LEFT JOINs the group, and the fleet and driver container suites pass⟩ Check the other readers of the two tables compile and still mean the same with a nullable group: `EA/fleet/src/{planner,dispatch}/sql.ts`, `EA/fleet/src/{readiness,duty,capabilities}/repository.ts`, `EA/fleet/src/drivers/sql.ts`, `EA/driver/src/work/sql.ts`, `EA/shared/src/lib/driver-coverage.ts`, `EA/admin/src/shops/service.ts`. They already LEFT JOIN the zone; change nothing unless a query INNER JOINs or assumes a non-null zone — list in SIGNOFF which files were read and what, if anything, changed. Run fleet and driver tests (with containers).

---

## Phase 4: User Story 2 — One answer for any address (P1) 🎯 MVP

**Goal**: address entry, the storefront check and checkout give the same answer in the same words, on web and mobile.

**Independent test**: P10, P11, P16; walk V5.

### Backend

- [X] T018 [P] [US2] `EA/storefront/src/functions/serviceability-v1-get.ts`: answer from `coverageForPostcode`; response `{ postcode, serviced, coverage }`; metric `ServiceabilityChecks` gains dimension `coverage`; cache `public, max-age=300` with a comment on why not a day (research R9). Update its test.
- [X] T019 [P] [US2] `EA/commerce/src/checkout/quote.ts`, `service.ts`, `respond.ts`: the quote carries `coverage`; `coverage === "none"` → `serviced: false` as today; `coverage === "courier"` → a distinct `CourierNotPurchasableError` mapped to the same customer refusal but logged as an invariant breach (it cannot occur while `COURIER_ORDERING_AVAILABLE` is false); the `NotServiceableError` response becomes `422`, `code: COVERAGE_REFUSAL_CODE`, `detail: COVERAGE_REFUSAL_SENTENCE` imported from `@effy/shared-types`. Update the checkout tests that assert the old wording.
- [X] T020 [P] [US2] `ST/address.ts` (and `customer-contract.ts` if it re-declares it): `AddressDTO` gains `coverage: CoverageKind`. In `EA/customer/src/addresses/model.ts` and the four handlers (`customer-addresses-v1-get|post|id-patch|id-delete.ts`): compute coverage when reading — one query using `LEFT JOIN LATERAL public.coverage_for_postcode(a.postal_code)` for lists, never stored (FR-021). Update the address tests.
- [X] T021 [US2] Regenerate the Kotlin contract and JSON schema (`packages/shared-types/contract/Dto.kt`, `schema.json`) with the package's existing generator script; run `make cm-contract-check` (or the equivalent `*-contract-check` target) so mobile sees `coverage` and the constants.
- [X] T022 [US2] **P16** in `EA/shared/src/delivery/coverage.container.test.ts` (or a commerce container test if the quote needs commerce code): for a table of postcodes — listed, unlisted, unknown — the storefront answer, the address answer and the quote answer agree.

### Guards

- [X] T023 [US2] Create `EA/shared/src/delivery/coverage.guard.test.ts`: **P10** — the strings `deliver to this address`, `don't deliver`, `don’t deliver`, `can't deliver`, `cannot deliver` appear in no `.ts`/`.tsx`/`.kt` file under `apis/edge-api/*/src`, `apps/customer-web`, `apps/customer-mobile/shared/src/commonMain` other than `packages/shared-types/src/delivery.ts` and generated contract files (allow-list `EmailDeliveryNotice.tsx`, which is about email); **P11** — no interface in `ST/delivery.ts`, `ST/address.ts`, `ST/checkout.ts`, `ST/storefront.ts`, `ST/customer-contract.ts`, `ST/customer-commerce-contract.ts` has a field matching `/group|distance|hub|reason/i` next to `coverage` (allow-list `sameDayUnavailableReason`); **P12** — `delivery_zone_postcode` appears in SQL only in the allowed files (`shared/src/delivery/zone.ts`, `admin/src/delivery/coverage.repository.ts`, the fleet/driver files listed in T017), so a new reader must be added deliberately.

### Customer web

- [X] T024 [P] [US2] `CW/app/checkout/CheckoutFlow.tsx` and `CW/lib/delivery-choice.ts`: replace both hard-coded refusals with `COVERAGE_REFUSAL_SENTENCE`; show `COVERAGE_LABEL[coverage]` beside the chosen address when not `none`. `CW/app/checkout/AddressPicker.tsx`: each address shows its label, or the refusal sentence and is not selectable when `none`. Tokens only; update tests.
- [X] T025 [P] [US2] `CW/app/(account)/addresses/_components/{AddressRow,AddressList,AddressFormModal}.tsx`: each saved address shows its label or the refusal sentence; after saving a new address the result is shown at once. Update tests.
- [X] T026 [P] [US2] ⟨n/a as found: the storefront has no delivery-location island today — the comment in `page.tsx` is vestigial and nothing calls serviceability from the website; recorded in SIGNOFF⟩ The storefront delivery-location island (`CW/app/(shop)/page.tsx` and the component it mounts) and `CW/lib/telemetry.ts` `delivery_location_set`: read `coverage`; telemetry prop becomes `{ coverage }` (three bounded values, no postcode).

### Customer mobile

- [X] T027 [P] [US2] `CM/addresses/{domain/AddressBook.kt,data/AddressMappers.kt,presentation/AddressBookScreen.kt,presentation/AddressBookViewModel.kt,presentation/AddressFormSheet.kt}`: carry `coverage`; show the label or the generated refusal sentence. Update `commonTest`.
- [X] T028 [P] [US2] `CM/checkout/{domain/Checkout.kt,data/CheckoutMappers.kt,presentation/CheckoutViewModel.kt,presentation/CheckoutScreen.kt}` and the home delivery-location use in `CM/catalog/presentation/HomeScreen.kt`: read `coverage`; replace every local refusal string with the generated constant. Run `./gradlew :shared:testAndroidHostTest` and `compileKotlinIosSimulatorArm64`.

---

## Phase 5: User Story 1 — Staff decide where Effy delivers (P1) 🎯 MVP

**Goal**: add by place name, remove, see the list.

**Independent test**: P13, P14; walks V1–V3, V6.

### Backend (`admin`, staff gateway)

- [X] T029 [US1] `ST/delivery-admin.ts`: the coverage DTOs of [contracts/routes.md](contracts/routes.md) — list response, place-search result, add request/response, patch request, error extras.
- [X] T030 [US1] Create `EA/admin/src/delivery/coverage.repository.ts`: `list(filters, cursor, limit=100)` (postcodes with aggregated place names and state, groups with `postcodeCount` and `driverCount`, ungrouped counts, courier block, counts — the driver counts from `driver_zone_capability` joined to active drivers, where an every-zone clearance counts for every group and for ungrouped); `searchPlaces(q, limit)` (grouped by postcode, with `listed` and `computedDistanceKm`); `addPostcodes(tx, …)` (`INSERT … ON CONFLICT (postcode) DO NOTHING RETURNING`, distance from `coverage_computed_distance_km` or the manual value); `removePostcode(tx, postcode)`. Every mutation writes `admin.audit_log` in the same transaction with the actions in data-model.md "Audit", before and after in `detail`.
- [X] T031 [US1] Create `EA/admin/src/delivery/coverage.service.ts`: validation and the refusals of the contract (`unknown_postcode`, `distance_required`, `distance_out_of_range`, `group_not_found`, `no_driver_covers` unless `confirmNoDrivers`), authorization through the existing `EA/admin/src/delivery/authz.ts` (read = any active staff; write = admin/manager), and `announce("coverage")` from `@effy/edge-shared/live` after commit.
- [X] T032 [P] [US1] Handlers in `EA/admin/src/functions/`: `delivery-coverage-list-v1-get.ts`, `delivery-coverage-places-v1-get.ts`, `delivery-coverage-postcodes-add-v1-post.ts`, `delivery-coverage-postcode-remove-v1-delete.ts`; add the four functions to `EA/admin/serverless.yml` with `/staff/authorizer/back-office_id`.
- [X] T033 [US1] `EA/admin/src/delivery/coverage.service.test.ts` (unit, fake repository) and `coverage.container.test.ts`: add by search result, duplicate add → `alreadyListed`, manual distance required, remove leaves a seeded order's rows untouched (SC-009), **P13** (csa reads, cannot write), **P14** (audit row with before/after for add and remove).
- [X] T034 [US1] Update `EA/shared/src/live/change-map.guard.test.ts` for the new write handlers → `coverage`, and `EA/admin/src/delivery/config.contract.test.ts` for the new function list; add `"coverage"` to `live_kinds` in `infra/envs/dev/live.tf`; run `pnpm --filter @effy/edge-shared test` (live contract, gateway capacity: staff ≈ 146 when all 13 are in).

### Back-office

- [X] T035 [US1] `BO/repo.ts`, `BO/queries.ts`, `BO/errorText.ts`, `BO/access.ts`: coverage calls, query keys, plain-language text for every new error code, `canEditCoverage` (admin/manager). `apps/back-office/src/features/live/routes.ts`: `coverage` → the coverage query keys (+ `routes.test.ts`).
- [X] T036 [US1] Create `BO/coverage/CoverageTable.tsx` + `CoverageFilters.tsx`: a table (postcode · places · group · distance · "worked out" / "entered by hand" · review flag), search, filters (group incl. "No group", source), paging, row action Remove with a confirm naming the places. A table with a toolbar — no cards (Principle V). Read-only for csa.
- [X] T037 [US1] Create `BO/coverage/AddPlacesDialog.tsx`: type a place or postcode → results told apart by state and postcode, each showing the places that postcode brings and its worked-out distance; already-listed results disabled and labelled; a result with no distance reveals a required km field; optional group; the no-driver confirmation when the API answers `no_driver_covers`.
- [X] T038 [US1] `BO/DeliveryScreen.tsx`: replace the Zones and Rings tabs with one **Coverage** tab mounting the table; keep Plans, Settings, Collection runs, Slots, Days.
- [X] T039 [P] [US1] Tests: `BO/coverage/CoverageTable.test.tsx`, `AddPlacesDialog.test.tsx` (duplicate, manual distance, csa read-only, no-driver confirmation).

---

## Phase 6: User Story 3 — "What about this postcode, and why?" (P1)

**Goal**: staff check any postcode or place and read the answer and its reason.

**Independent test**: walk V4; the reason text for each of the five reasons.

- [X] T040 [US3] `coverage.repository.ts` `check(q)` + `coverage.service.ts` + `EA/admin/src/functions/delivery-coverage-check-v1-get.ts` + serverless entry: a postcode returns one answer; a place name returns one per matching postcode; includes places, group name, distance, source, and the exclusion's reason when `courier_excluded`. Unit tests for all five reasons and an unknown postcode.
- [X] T041 [US3] Create `BO/coverage/PostcodeChecker.tsx` (in the Coverage tab's toolbar): input → answer in words a person can repeat ("On Effy's list — Inner Melbourne, 3.4 km (worked out)", "Not on Effy's list. Courier delivery is switched off.", "Not a known postcode."), the sentences in `BO/errorText.ts`. Delete `BO/components/{NewRingDialog,NewZoneDialog,AddPostcodeDialog,SameDayExceptionsDialog}.tsx` and every import of them. Test `PostcodeChecker.test.tsx`.

---

## Phase 7: User Story 4 — Where courier delivery is offered (P2)

**Goal**: the switch (locked for now) and the exclusions list.

**Independent test**: P9; walk V8.

- [X] T042 [US4] `coverage.repository.ts`: `setCourierOffered`, `addExclusion`, `removeExclusion` (audited); `coverage.service.ts`: `PUT courier` refuses `409 courier_ordering_unavailable` while `COURIER_ORDERING_AVAILABLE` is false, exclusions validate `unknown_postcode`, `reason_required`, `already_excluded`; the list response's `courier.canBeOffered` mirrors the constant.
- [X] T043 [P] [US4] Handlers `delivery-coverage-courier-v1-put.ts`, `delivery-coverage-courier-exclusion-add-v1-post.ts`, `delivery-coverage-courier-exclusion-remove-v1-delete.ts` + serverless entries.
- [X] T044 [US4] Tests: **P9** (unit: the switch refuses); container: with `courier_offered` forced true in SQL, an unlisted postcode is `courier`, an excluded one `none / courier_excluded`, a listed-and-excluded one `effy` (spec US4-4).
- [X] T045 [US4] Create `BO/coverage/CourierPanel.tsx`: the switch shown off and disabled with the sentence "Courier delivery can be switched on once customers can place courier orders." when `canBeOffered` is false; the exclusions list (postcode, places, reason) with add and remove. Test.

---

## Phase 8: User Story 5 — Groups (P2)

**Goal**: create, rename, remove groups; move postcodes between them.

**Independent test**: P4; walk V7.

- [X] T046 [US5] `coverage.repository.ts`: `createGroup` (code generated from the name as zones do today; `ring_id NULL`, `sameday_eligible true`), `renameGroup`, `removeGroup` (one transaction: postcodes' `zone_id` → NULL, zone `status = 'disabled'`; returns the count), `assignGroup(postcodes, groupId | null)`; all audited. `coverage.service.ts`: `group_name_taken`, `group_not_found`, `no_driver_covers` on remove / on assigning to a target with zero drivers, unless confirmed.
- [X] T047 [P] [US5] Handlers `delivery-coverage-group-create-v1-post.ts`, `delivery-coverage-group-patch-v1-patch.ts`, `delivery-coverage-group-remove-v1-delete.ts`, `delivery-coverage-postcodes-patch-v1-patch.ts` (group part) + serverless entries.
- [X] T048 [US5] Tests: **P4** (container: remove a group → its postcodes still listed, `effy`, ungrouped; the zone row still exists, disabled); a postcode is never in two groups; rename; unit tests for the confirmations.
- [X] T049 [US5] Create `BO/coverage/GroupsPanel.tsx` (name, postcodes, "N drivers can deliver here"; rename; remove with the consequence stated) and bulk "Move to group…" on selected rows in `CoverageTable.tsx`; the ungrouped line shows its own driver count with a warning token at zero (research R6). Tests.

---

## Phase 9: User Story 6 — Distances stay right (P2)

**Goal**: manual override, return to worked-out, and recalculation on a hub move.

**Independent test**: P6; walks V3, V9.

- [X] T050 [US6] `coverage.repository.ts` `setDistance(postcode, {source:'manual', km} | {source:'computed'})` (clears `distance_review`; `distance_not_computable` when it cannot be worked out); wire into `delivery-coverage-postcodes-patch-v1-patch.ts` (a distance change takes exactly one postcode).
- [X] T051 [US6] `EA/admin/src/delivery/repository.ts` + `service.ts` settings PUT: when the hub point changes, in the SAME transaction `UPDATE … SET distance_km = coverage_computed_distance_km(postcode) WHERE distance_source = 'computed'` and `SET distance_review = true WHERE distance_source = 'manual'`, returning `{ recomputed, unchanged, manualFlagged }`; one `coverage.hub_recompute` audit row; announce `coverage`. Add the `distances` block to the settings DTO in `ST/delivery-admin.ts`.
- [X] T052 [US6] **P6** container test: move the hub → computed rows change, manual rows do not and are flagged, counts returned; a computed row whose place has since lost coordinates is left unchanged and counted (never NULLed).
- [X] T053 [US6] Create `BO/coverage/DistanceDialog.tsx` (enter by hand / return to worked-out) and show the recompute result after saving Settings in the existing settings panel ("41 distances recalculated, 2 hand-entered ones flagged for review"); the table's review flag filters to them. Tests.

---

## Phase 10: Polish

- [X] T054 Break-and-restore the remaining proofs and record each in SIGNOFF: P3, P4, P6, P9, P10, P11, P12, P13, P14, P16 (P1, P5, P7 were done in T013). Any proof not broken is listed as "covered by passing tests only".
- [X] T055 [P] Rewrite `docs/delivery-console-guide.md` for the Coverage tab (add a place, groups, distances, the checker, courier exclusions, what the driver count means, what is frozen until later features).
- [X] T056 [P] `CLAUDE.md`: in the driver-logistics ⚠ note and the backend section, record that coverage is one postcode list decided by `public.coverage_for_postcode` only, that `delivery_zone*` are historical names for group / list until E9, and the three frozen bridges; add 076 to "Features recorded". Update `docs/prd/2026-10-delivery-model-v2-backlog.md` (E2 built; what E3, E5, E8, E9 must each remove — the bridges, `COURIER_ORDERING_AVAILABLE`, the group-keyed driver clearance, the table names).
- [X] T057 Full run: `pnpm -r typecheck`; every edge service's tests, with containers for shared, admin, commerce, customer, fleet, driver; `pnpm --filter back-office test`; `pnpm --filter customer-web test`; customer-mobile host tests + iOS compile; `make validate ENV=dev`; `scripts/check-no-refresh-timers.sh`; design-system guards; remove leftover test containers.
- [X] T058 Write `specs/076-effy-delivery-coverage/SIGNOFF.md` (what changed, counts, proofs broken, findings, deviations, the R6 limitation, not verified, operator steps in the quickstart's order) and the 076 entry at the top of `FEATURE-HISTORY.md`.

---

## Dependencies

```
T001 ─► T004 ─► T005 → T006 → T007 → T008 → T009        (one migration file: strictly in order)
T002 ─► T010, T018–T020, T024–T028
T009 ─► T010 ─► T011 ─► T012 ─► T013                     Phase 2 blocks everything
Phase 2 ─► US7 (T014–T017) ─► US1 backend (T029–T034)    T014–T016 clear the files US1 adds to
Phase 2 ─► US2 (T018–T028)                               independent of US7 and US1
US1 ─► US3 (T040–T041) ─► US4, US5, US6                  all add to coverage.repository/service and the Coverage tab
T021 ─► T027, T028                                       mobile needs the regenerated contract
T034 after T032, T040, T043, T047 for the final counts
```

Same-file sequences: the migration T005 → T009; `coverage.container.test.ts` T004 → T012 → T022 → T044
→ T048 → T052; `coverage.repository.ts` / `coverage.service.ts` T030/T031 → T040 → T042 → T046 → T050;
`EA/admin/serverless.yml` T014 → T032 → T040 → T043 → T047; `BO/coverage/CoverageTable.tsx` T036 → T049
→ T053; `ST/delivery-admin.ts` T016 → T029 → T051.

## Parallel examples

- Setup: T002 ∥ T003.
- US2 backend: T018 ∥ T019 ∥ T020 (three services), then T021, T022.
- US2 clients: T024 ∥ T025 ∥ T026 (web) ∥ T027 ∥ T028 (mobile, after T021).
- US2 as a whole can be built alongside US7 + US1 — different services and apps.
- Within US1: T032 (handlers) ∥ T039 (tests) once the service exists.

## Implementation strategy

**MVP = Phases 1–5** (Setup, Foundational, US7, US2, US1): the list exists, staff can edit it, every
customer surface gives the one answer, the old controls are gone, and nothing changed for anyone at
release. That is shippable and is what E3 needs.

**Then** US3 (the checker — small, and it closes the loop for customer-service), **US6** before US5 if
E3 is next (it prices by distance), then US5, US4, polish.

Stop points where everything works: after Phase 2 (invisible, safe to deploy alone), after Phase 5,
after each later story.

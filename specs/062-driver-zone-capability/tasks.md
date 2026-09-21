---
description: "Task list for 062 — Driver Zone Capability & Coverage"
---

# Tasks: Driver Zone Capability & Coverage

**Input**: Design documents from `/specs/062-driver-zone-capability/`

**Prerequisites**: [plan.md](plan.md) · [spec.md](spec.md) · [research.md](research.md) ·
[data-model.md](data-model.md) · [contracts/](contracts/) · [quickstart.md](quickstart.md)

**Tests**: **INCLUDED, and not optional.** The spec's own success criteria demand them — SC-003
*"proven by causing it"* and SC-009 *"proven by absence"* — and this feature's correctness lives almost
entirely in one index and two queries, none of which a mocked repository can observe.

**Organization**: grouped by user story. Phase 2 is the one shared blocker; after it, US1–US5 are
independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable — different files, no dependency on an incomplete task
- **[Story]**: US1…US5, on user-story phases only

---

## Phase 1: Setup

- [ ] T001 Scaffold the migration `db/migrations/<ts>_driver_zone_capability.sql` via `make db-new name=driver_zone_capability`, with a header recording that dropping `driver.delivery_zone_id` is DESTRUCTIVE and its values are deliberately NOT converted into clearances (data-model.md §7)
- [ ] T002 [P] Create the empty domain directories `apis/edge-api/fleet/src/capabilities/` and `apis/edge-api/fleet/src/coverage/`
- [ ] T003 [P] Create `db/seeds/062_capability_dev.sql` with a header stating the three clearance profiles it must produce and the one zone it must leave uncovered (FR-029, FR-030)

---

## Phase 2: Foundational (BLOCKING — every story depends on this)

- [ ] T004 Write `public.driver_zone_capability` in `db/migrations/<ts>_driver_zone_capability.sql` — all columns, CHECK constraints and `COMMENT ON` per data-model.md §1, including the comment explaining why `zone_id IS NULL` beats an `all_zones` boolean
- [ ] T005 ⚠ Write the `NULLS NOT DISTINCT` unique index in the same migration, with a comment recording that a plain UNIQUE does NOT deduplicate NULLs and that FR-005 and FR-011 both live in this one index (data-model.md §1)
- [ ] T006 Write both FK indexes `driver_zone_capability_driver_idx` and `driver_zone_capability_zone_idx` in `db/migrations/<ts>_driver_zone_capability.sql`
- [ ] T007 ⚠ Write `DROP INDEX public.driver_zone_idx` and `ALTER TABLE public.driver DROP COLUMN delivery_zone_id` in `db/migrations/<ts>_driver_zone_capability.sql`, with a comment stating the values are discarded rather than converted — a single zone does not say which function or method it applied to, so converting it would invent a clearance nobody granted
- [ ] T008 Write the `-- +goose Down` block in `db/migrations/<ts>_driver_zone_capability.sql` restoring the shape only, with a comment stating that dropped values are gone for good
- [ ] T009 [P] Add the capability and coverage DTOs to `packages/shared-types/src/driver.ts` per contracts/fleet-capability.contract.md §A/§B, in the back-office-only section, with a comment stating they are NOT part of the KMP driver contract aggregator
- [ ] T010 ⚠ **NARROW `DriverBlockedReason` in `packages/shared-types/src/driver.ts`**: remove `no_zone`, add `no_capabilities`. Before editing, audit every reader — `apis/edge-api/fleet/src/drivers/sql.ts`, `apis/edge-api/fleet/src/readiness/`, `apps/back-office/src/features/drivers/model.ts` (`BLOCKED_LABEL`), every fixture — and record the audit result in a comment. ⚠ **A narrowing is NOT the mirror of 061's widening**: it makes exhaustive `Record<>`s over-specified (which tsc reports) but stored data and fixtures carrying `no_zone` must be found by hand (research R5)
- [ ] T011 [P] Extend the SCHEMA fixture in `apis/edge-api/fleet/src/schema.container.test.ts` with `public.driver_zone_capability` and the dropped `driver.delivery_zone_id`, mirroring the real migration exactly

---

## Phase 3: User Story 1 — Record what a driver is cleared for (P1) 🎯 MVP

**Goal**: an operator can grant and revoke any combination of function, method and zone on a driver.

**Independent test**: clear one driver for a specific combination, confirm it is recorded, revoke it,
confirm it is gone — with no other story built.

### Tests for User Story 1

- [ ] T012 [P] [US1] Container test C1 in `apis/edge-api/fleet/src/schema.container.test.ts` — granting the same clearance twice is refused by the index and surfaces as a no-op (FR-005)
- [ ] T013 [P] [US1] Container test C4 in `apis/edge-api/fleet/src/schema.container.test.ts` — a zone-specific grant does **not** match a different zone (FR-001)
- [ ] T014 [P] [US1] Container test C5 in `apis/edge-api/fleet/src/schema.container.test.ts` — revoking one clearance leaves the driver's others intact (FR-004)
- [ ] T015 [P] [US1] Container test C6 in `apis/edge-api/fleet/src/schema.container.test.ts` — revoking a clearance the driver does not hold is a no-op (FR-006)
- [ ] T016 [P] [US1] Container test C7 in the same file — **deleting** a zone removes clearances naming it and leaves every-zone grants untouched (data-model.md §1)
- [ ] T017 [US1] ⚠ Container test C8 in the same file — **disabling** a zone does NOT delete clearances, and re-enabling restores cover without anybody re-granting (data-model.md §1, risk K6)

### Implementation for User Story 1

- [ ] T018 [US1] Write `apis/edge-api/fleet/src/capabilities/sql.ts` — the `IS_CLEARED_FOR` fragment (`zone_id = $n OR zone_id IS NULL`) with a comment recording that the `OR` clause is the whole of FR-011 and that omitting it compiles and passes every zone-specific test
- [ ] T019 [US1] Write `apis/edge-api/fleet/src/capabilities/repository.ts` — raw SQL list, grant (`INSERT … ON CONFLICT DO NOTHING`) and revoke (`DELETE`); rows mapped explicitly and not leaked past the data layer
- [ ] T020 [US1] Write `apis/edge-api/fleet/src/capabilities/service.ts` — validate function, method and zone; refuse an unknown or **disabled** zone by name; ⚠ **a duplicate grant and an absent revoke are NO-OPS, not errors** (FR-005/FR-006, contracts §A)
- [ ] T021 [P] [US1] Write the handler `apis/edge-api/fleet/src/functions/driver-capabilities-v1-get.ts`
- [ ] T022 [P] [US1] Write the handler `apis/edge-api/fleet/src/functions/driver-capability-grant-v1-post.ts`
- [ ] T023 [P] [US1] Write the handler `apis/edge-api/fleet/src/functions/driver-capability-revoke-v1-delete.ts`
- [ ] T024 [US1] Declare the three routes in `apis/edge-api/fleet/serverless.yml`, each carrying the back-office authorizer; read open to any active staff, mutate to admin/manager
- [ ] T025 [US1] Write `driver.capability_granted` and `driver.capability_revoked` audit calls through 056's existing `recordAudit` in `apis/edge-api/fleet/src/shared/audit.ts` — no second audit trail
- [ ] T026 [US1] Extend the driver profile read in `apis/edge-api/fleet/src/drivers/repository.ts` to carry `capabilities` (FR-007)
- [ ] T027 [P] [US1] Write `apps/back-office/src/features/drivers/capabilityRepo.ts` and `capabilityQueries.ts` on `@effy/api-client` and TanStack Query — server state in the query cache only
- [ ] T028 [P] [US1] Write `apps/back-office/src/features/drivers/capabilityModel.ts` — the function and method labels as exhaustive `Record<>` maps
- [ ] T029 [US1] Write `apps/back-office/src/features/drivers/components/CapabilityEditor.tsx` — grant and revoke, rendered on the driver detail screen; **no cards** (Principle V)
- [ ] T030 [US1] Mount the editor in `apps/back-office/src/features/drivers/DriverDetailScreen.tsx`, visible to any active staff and mutable only by admin/manager
- [ ] T031 [P] [US1] Write unit tests in `apis/edge-api/fleet/src/capabilities/service.test.ts` — the disabled-zone refusal names the zone; a duplicate grant returns success rather than a conflict
- [ ] T032 [P] [US1] Write console tests in `apps/back-office/src/features/drivers/components/CapabilityEditor.test.tsx` — a csa sees no mutating control (absent, not disabled)

**Checkpoint**: US1 is independently shippable. An operator can describe what any driver may do.

---

## Phase 4: User Story 2 — Clear a driver for every zone (P2)

**Goal**: "everywhere" is recordable as a fact, and stays true when a zone is created afterwards.

**Independent test**: clear a driver for every zone, create a new zone, confirm the driver covers it
with no further action.

### Tests for User Story 2

- [ ] T033 [US2] ⚠ Container test C3 in `apis/edge-api/fleet/src/schema.container.test.ts` — **a driver cleared for every zone matches a zone CREATED AFTERWARDS**. The single most important test in this slice: FR-011's absence is invisible, so it must be **caused**, not asserted (SC-003, risk K1)
- [ ] T034 [US2] ⚠ Container test C2 in `apis/edge-api/fleet/src/schema.container.test.ts` — **two identical "every zone" grants cannot both exist**, proving `NULLS NOT DISTINCT` actually holds (FR-005, risk K2)
- [ ] T035 [P] [US2] Container test in `apis/edge-api/fleet/src/schema.container.test.ts` — revoking an every-zone grant leaves zone-specific grants for other combinations intact (FR-013)

### Implementation for User Story 2

- [ ] T036 [US2] Accept `zoneId: null` as an explicit "every zone" grant in `apis/edge-api/fleet/src/capabilities/service.ts` — ⚠ a key **absent** and a key **present-with-null** must not be conflated, or "everywhere" becomes indistinguishable from "the operator forgot to choose" (contracts §A)
- [ ] T037 [US2] Return `zoneName: null` for an every-zone grant in `apis/edge-api/fleet/src/capabilities/repository.ts` — ⚠ **never a server-supplied "All zones" string**; the label is presentation and the console renders it from `zoneId === null`
- [ ] T038 [US2] Add the "every zone" option to `apps/back-office/src/features/drivers/components/CapabilityEditor.tsx`, rendered so it is visibly distinct from a list that happens to cover every zone today (FR-012)
- [ ] T039 [P] [US2] Write a console test in `apps/back-office/src/features/drivers/components/CapabilityEditor.test.tsx` asserting an every-zone grant renders as "every zone" and **not** as an enumeration

**Checkpoint**: US1 + US2 deliver the whole of the capability model.

---

## Phase 5: User Story 3 — Tell at a glance who is cleared for what (P3)

**Goal**: the driver register summarises each driver's breadth of clearance.

**Independent test**: give several drivers different clearances and confirm the register distinguishes
them.

- [ ] T040 [US3] Extend the driver list query in `apis/edge-api/fleet/src/drivers/repository.ts` to carry `capabilitySummary` — ⚠ **a summary, not the full set**; shipping every grant would put an unbounded array on every row of a paged list (contracts §C)
- [ ] T041 [P] [US3] Render the summary on the register in `apps/back-office/src/features/drivers/DriversListScreen.tsx`
- [ ] T042 [US3] Render a driver cleared for nothing as a **stated fact**, not blank space, in `apps/back-office/src/features/drivers/DriversListScreen.tsx` (FR-015)
- [ ] T043 [P] [US3] Write a console test in `apps/back-office/src/features/drivers/DriversListScreen.test.tsx` covering a fully-cleared driver, a partly-cleared one and one cleared for nothing

**Checkpoint**: the register is usable now that clearances exist.

---

## Phase 6: User Story 4 — See where the fleet has no cover (P4)

**Goal**: one view lists every zone that cannot be served, per kind of work, with the reason.

**Independent test**: create a zone nobody is cleared for, a zone whose only cleared driver is
unavailable, and a fully covered zone; confirm the view tells the three apart.

### Tests for User Story 4

- [ ] T044 [P] [US4] Container test C9 in `apis/edge-api/fleet/src/schema.container.test.ts` — a zone nobody is cleared for reports `no_driver_cleared` (FR-018)
- [ ] T045 [P] [US4] Container test C10 in `apis/edge-api/fleet/src/schema.container.test.ts` — a zone whose cleared drivers are all blocked reports `all_cleared_unavailable` (FR-018)
- [ ] T046 [US4] ⚠ Container test C11 in `apis/edge-api/fleet/src/schema.container.test.ts` — a covered (zone, function, method) emits **no row at all** (FR-019)
- [ ] T047 [US4] ⚠ Container test C12 in `apis/edge-api/fleet/src/schema.container.test.ts` — same-day gaps appear **only** for zones whose `sameday_eligible` is true. Without this, standard-only zones produce permanent unfixable rows in the one view whose purpose is to be actionable (research R3, risk K3)
- [ ] T048 [US4] ⚠ Container test C13 in `apis/edge-api/fleet/src/schema.container.test.ts` — coverage and readiness agree about every driver, across **every** blocking reason (FR-020, risk K4)
- [ ] T049 [P] [US4] Container test C14 in `apis/edge-api/fleet/src/schema.container.test.ts` — an offboarded driver's clearances do not count toward coverage (FR-021)

### Implementation for User Story 4

- [ ] T050 [US4] Write `apis/edge-api/fleet/src/coverage/repository.ts` — the single statement from data-model.md §5b, enumerating only the work each active zone can receive and left-joining drivers who are cleared **and** able to work
- [ ] T051 [US4] ⚠ Read the availability rule from `apis/edge-api/fleet/src/drivers/sql.ts`'s existing `BLOCKED_REASONS` fragment rather than re-deriving it — this is what makes FR-020 hold **by construction** rather than by discipline (research R4)
- [ ] T052 [US4] Write `apis/edge-api/fleet/src/coverage/service.ts` mapping rows to `CoverageGap`, including `clearedDriverCount` — ⚠ it is what makes the two reasons actionable: `0` means grant somebody a clearance, `>0` means the fix is in the readiness view
- [ ] T053 [P] [US4] Write the handler `apis/edge-api/fleet/src/functions/coverage-v1-get.ts`
- [ ] T054 [US4] Declare the route in `apis/edge-api/fleet/serverless.yml` with the back-office authorizer (bringing the service to 23 functions)
- [ ] T055 [US4] ⚠ Render the coverage view **inside 056's existing readiness screen** at `apps/back-office/src/features/drivers/components/ReadinessPanel.tsx` — NOT as a second screen. Two screens answering "can this driver work?" would eventually disagree, and an operator would have no way to tell which was right (FR-020)
- [ ] T056 [US4] Render gaps as a **list of problems**, never a matrix with a status column, in `apps/back-office/src/features/drivers/components/ReadinessPanel.tsx` — a screen that lists everything and colours the bad ones is a screen an operator has to scan
- [ ] T057 [P] [US4] Write console tests in `apps/back-office/src/features/drivers/components/ReadinessPanel.test.tsx` — the two reasons render distinctly, and a covered zone is absent entirely

**Checkpoint**: recorded clearances now produce the operational answer the dispatch slice will consult.

---

## Phase 7: User Story 5 — Retire the single-zone field (P5)

**Goal**: no interface accepts or displays a single driver zone, and no driver is blocked for lacking one.

**Independent test**: search the platform's own surfaces and confirm neither exists.

- [ ] T058 [US5] Remove `delivery_zone_id` from the row types, SELECTs and mappers in `apis/edge-api/fleet/src/drivers/repository.ts`
- [ ] T059 [US5] Replace the `no_zone` arm of `BLOCKED_REASONS` in `apis/edge-api/fleet/src/drivers/sql.ts` with `no_capabilities`, derived from the driver having no clearances at all (FR-025)
- [ ] T060 [US5] Remove `zoneId` / `zone` from the driver DTOs and the update request in `packages/shared-types/src/driver.ts`
- [ ] T061 [US5] Remove the zone picker from `apps/back-office/src/features/drivers/components/ProfileEditForm.tsx` and the zone rows from `apps/back-office/src/features/drivers/DriverDetailScreen.tsx`
- [ ] T062 [US5] Update `BLOCKED_LABEL` in `apps/back-office/src/features/drivers/model.ts` — drop `no_zone`, add `no_capabilities` with wording naming the remedy
- [ ] T063 [P] [US5] ⚠ Write an absence guard in `apis/edge-api/fleet/src/drivers/no-single-zone.guard.test.ts` asserting no source file in `apis/edge-api/fleet/src` or `apps/back-office/src/features/drivers` names `delivery_zone_id` or a single driver zone field, reading the source rather than the running schema (SC-009)
- [ ] T064 [P] [US5] Update the `BLOCKED_LABEL` exhaustiveness test in `apps/back-office/src/features/drivers/model.test.ts` for the narrowed enum

**Checkpoint**: one question, one answer.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T065 [P] Write `db/seeds/062_capability_dev.sql` — one driver cleared for everything everywhere, one cleared for a single function in a single zone, one cleared for nothing, and **at least one zone nobody can serve** (FR-029, FR-030)
- [ ] T066 [P] Verify `db/migrations/<ts>_driver_zone_capability.sql` and `db/seeds/062_capability_dev.sql` apply cleanly and idempotently against a throwaway PostgreSQL container before handing them to the operator — 061's seed was refused by a CHECK constraint and only running it found out
- [ ] T067 [P] Extend `apis/edge-api/fleet/src/shared/config.contract.test.ts` so the authorizer assertion covers the four new routes
- [ ] T068 [P] Run `make check-no-phantm` and the banned-address sweep over `db/seeds/062_capability_dev.sql` and `specs/062-driver-zone-capability/`
- [ ] T069 [P] Update the parity register `docs/audiences/driver-capabilities.md` with a §062 section
- [ ] T070 [P] Update `docs/logistics-engine-architecture.md` §5 to mark Slice B built, and `docs/research/logistics/decisions-01-running.md` where D2 and D3 are now implemented rather than decided
- [ ] T071 Execute negative proofs **NP1–NP5** from [quickstart.md](quickstart.md) §6 by breaking each rule and confirming the matching test fails
- [ ] T072 Execute negative proofs **NP6–NP10** from quickstart §6 — ⚠ **NP2 is the one that otherwise leaves a green suite and a broken feature**
- [ ] T073 [P] Run the full machine sweep from quickstart §1 — `pnpm -r typecheck` (expect 20/20), `pnpm -r test`, `tokens:check` **unchanged**, the retired-hue sweeps
- [ ] T074 [P] Confirm the **unchanged-suite proof** by running `pnpm -r test` and inspecting `git diff` for edited expectations
- [ ] T075 Run `CONTAINER_TESTS=1 pnpm --filter @effy/edge-fleet test` with Docker up and record C1–C14 — ⚠ **if Docker is down, say so in the sign-off rather than reporting a green suite**
- [ ] T076 Write `specs/062-driver-zone-capability/SIGNOFF.md` recording what is verified, what is unrun, and every open operator item

### Operator steps (NOT run by Claude — hand these over with exact commands)

- [ ] T077 **OPERATOR** Commit the migration, then `make db-up ENV=dev` (003 commit-guard) — ⚠ DESTRUCTIVE, drops `driver.delivery_zone_id`
- [ ] T078 **OPERATOR** Load the seeds: `psql "$(AWS_PROFILE=ef infra/scripts/db-dsn.sh dev)" -f db/seeds/062_capability_dev.sql`
- [ ] T079 **OPERATOR** `make edge-deploy SERVICE=fleet ENV=dev` — ⚠ **before** the console, or the editor and coverage view call routes that do not exist
- [ ] T080 **OPERATOR** Push to `dev` so Amplify deploys the back-office console
- [ ] T081 **OPERATOR** Walk **W1–W19** from [quickstart.md](quickstart.md) §5 — ⚠ **W6 is the most important** (create a zone, confirm an every-zone driver covers it). 039 shipped four live defects with a fully green suite

---

## Dependencies & Execution Order

### Phase dependencies

```
Phase 1 Setup
   ↓
Phase 2 Foundational  ← BLOCKING: the migration + DTOs + the enum-narrowing audit
   ↓
   ├── Phase 3  US1 record clearances      (P1) 🎯 MVP
   │      ↓
   │   Phase 4  US2 every zone             (P2) — extends US1's grant path
   │      ↓
   │   Phase 5  US3 register summary       (P3) — summarises what US1/US2 record
   │      ↓
   │   Phase 6  US4 coverage               (P4) — reports on them
   └── Phase 7  US5 retire the single zone (P5) — independent of US1–US4
          ↓
       Phase 8 Polish
```

### User story dependencies

- **US1** depends only on Phase 2.
- **US2** extends US1's grant path — the "every zone" value flows through the same service.
- **US3** needs something to summarise, so it follows US1 (and is more interesting after US2).
- **US4** reports on clearances, so it needs US1 and US2 to have anything to say.
- **US5** is **independent of all of them.** It touches the driver record and the blocked-reason
  vocabulary, not the capability tables, and can be done at any point after Phase 2 — including in
  parallel with US1 by a second person.

### Parallel opportunities

- **Phase 1**: T002, T003 together.
- **Phase 2**: T009, T011 together. ⚠ **T010's reader audit must finish before Phase 7 begins.**
- **Phase 3**: T012–T016 together; T021–T023 (three independent handler files); T027, T028 together;
  T031, T032 together. ⚠ **T017 is NOT parallel with T016** — both manipulate zone lifecycle and must
  be observed separately.
- **Phase 4**: ⚠ **T033 and T034 are NOT parallel with each other.** T033 creates a zone mid-test;
  T034 asserts a uniqueness violation. Interleaving them makes a failure ambiguous.
- **Phase 6**: T044, T045, T049 together; T046, T047, T048 separately — each asserts an *absence* or a
  *cross-view agreement*, and a shared fixture would let one mask another.
- **Across phases**: a second person can take **US5 entirely** (Phase 7) while the first builds
  US1 → US2 → US3 → US4.

### Within each user story

Tests → sql fragment → repository → service → handlers → routes → console → console tests.

---

## Implementation Strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (US1).** An operator can record what every driver may do. That is
the fact the dispatch slice is blocked on, and it ships without any other story.

**Then US2**, which is what makes a clearance stay true rather than rot the next time a zone is added.

**US5 is the natural parallel track** — it shares no file with US1–US4 and can run alongside.

**US4 last among the feature stories**, because it reports on what the earlier ones record.

⚠ **Do not start Phase 7 until T010 is done.** Narrowing `DriverBlockedReason` without auditing its
readers first means finding them by failing test rather than by looking — and unlike 061's widening,
stored data carrying the removed value will not announce itself.

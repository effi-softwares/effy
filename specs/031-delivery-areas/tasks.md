---

description: "Task list for 031 — Delivery Areas"
---

# Tasks: Delivery Areas — Locality-Driven Zones & Per-Area Service Levels

**Input**: Design documents from `/specs/031-delivery-areas/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md),
[contracts/delivery-areas.contract.md](./contracts/delivery-areas.contract.md),
[quickstart.md](./quickstart.md)

**Tests**: Included. This slice turns a two-state ambiguity into three states, changes money, and must
leave the shopper's experience byte-identical — none of which a compiler can check.

**Organization**: grouped by user story. US1 alone is a shippable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable — different files, no dependency on an incomplete task
- **[Story]**: US1 / US2 / US3 / US4, mapping to [spec.md](./spec.md)
- **⚠ OPERATOR**: the user runs it (DB, live AWS, or a human walk) — Claude does not

---

## Phase 1: Setup

- [x] T001 Create branch `031-delivery-areas` from `main` (current — the 030 merge brought 027/028/029 with it, so there is no divergence to carry this time)
- [x] T002 ✅ **RECORDED 2026-08-01, before any change.**
  - `REGIONAL` → **0** active inbound offerings; `MEL-METRO` → 3
  - `GET /v1/storefront/serviceability?postcode=3350` → **`{"postcode":"3350","serviced":true}`** — ⚠ **the defect confirmed end to end**: the storefront promises delivery to Ballarat that checkout cannot quote
  - Test constants confirmed against live data: **3350 → 20** localities · **3550 → 12** · **3000 → 1** (the FR-034a sole-candidate case) · **15,414** total
  Original task: **⚠ OPERATOR — RECORD THE DEFECT BEFORE CHANGING ANYTHING** Run [quickstart.md](./quickstart.md) §0 and record the output: `REGIONAL` must show **0 active inbound offerings** while `serviceability?postcode=3350` returns `serviced:true`. ⚠ This is the state the feature must find; without a before-reading there is no way to prove `/delivery-health` works rather than merely runs.
  ⚠ **Also capture the numbers the tests hard-code**: `SELECT postcode, count(*) FROM public.locality WHERE postcode IN ('3350','3550') GROUP BY postcode` (expect **20** and **12**) and `SELECT count(*) FROM public.locality` (expect **15,414**). T012 and T020 assert these; the plan's own rule is to write tests against the world, and this is the one place that applies

**Checkpoint**: the defect is documented, so the fix is provable.

---

## Phase 2: Foundational (blocks US1–US4)

**Purpose**: the third state, and the reads everything else is built on.

### The decision record

- [x] T003 Create migration `db/migrations/<timestamp>_delivery_area_decisions.sql` — `public.delivery_area_decision` exactly as specified in [data-model.md](./data-model.md), incl. the `UNIQUE (zone_id, postcode)`, the `ON DELETE CASCADE` to the zone, and the table comment. ⚠ **No FK to `delivery_zone_postcode`** — a decision may legitimately outlive an area's membership
- [x] T004 ⚠ Confirm `unconfigured` is **not** a value in the `decision` CHECK — it is the absence of a row, and encoding it creates two ways to say one thing ([data-model.md](./data-model.md))
- [x] T005 **⚠ OPERATOR** Commit the migration (003 commit-guard), then `make db-up ENV=dev`
- [x] T006 [P] Add `AreaDecision` / `AreaServiceLevel` / `Area` / `AreaHealth` to `apis/edge-api/admin/src/delivery/types.ts`
- [x] T007 [P] Add the matching wire DTOs to `packages/shared-types/src/delivery.ts`. ⚠ **`LocalityDTO` is REUSED unchanged from `storefront.ts`** — the operator sees the same shape the shopper does (Principle II). Do not declare a second locality type

### The reads

- [x] T008 Add locality search + postcode-coverage reads to `apis/edge-api/admin/src/delivery/repository.ts` — prefix on `lower(name)` (served by 030's `locality_name_prefix_idx`) and `WHERE postcode = $1`
- [x] T009 Add decision-record reads/writes to the same repository
- [x] T010 Add the three health queries from [data-model.md](./data-model.md) to the repository. ⚠ Query 2 (unconfigured) is SC-014's assertion — **it must return 3350 and 3550 against today's data**
- [x] T011 [P] Create `apis/edge-api/admin/src/delivery/localities.ts` — the service for locality search and coverage
- [x] T012 [P] Unit-test `localities.ts`: a name prefix returns places; a postcode returns everything sharing it; ⚠ **3350 returns 20 and 3550 returns 12** — asserted against the worked examples in the contract, not against whatever the code returns

**Checkpoint**: the third state exists and the data behind the disclosure is queryable.

⚠ **Caught during Phase 2, worth recording**: `pnpm -r typecheck` reported **7/12 packages** while
`vitest` was fully green — 029's canary firing exactly as intended. Two causes, both real:
a genuine strict-TS error in the new test (`mock.calls[0][1]` possibly undefined), and a **corrupt
generated artifact** at `apps/customer-web/.next/dev/types/validator.ts` (a truncated line from an
interrupted dev server) which fails the whole-workspace typecheck despite being gitignored and
untouched by this slice. ⚠ **Counting the reporting packages is what surfaced both**; the test run
alone said everything was fine.

---

## Phase 3: User Story 1 — Build a delivery area out of real places (Priority: P1) 🎯 MVP

**Goal**: an admin composes a zone from places that exist, and knows exactly what they just made
serviceable.

**Independent Test**: compose a zone without typing a postcode, and confirm 3001 can no longer enter
one silently.

### Service

- [x] T013 [US1] Add `GET /admin/v1/delivery-localities` — handler `apis/edge-api/admin/src/functions/delivery-localities-list-v1-get.ts` + `serverless.yml` entry, behind the existing back-office authorizer
- [x] T014 [US1] Add `GET /admin/v1/delivery-localities/coverage` — handler `.../functions/delivery-localities-coverage-v1-get.ts` + `serverless.yml` entry. ⚠ **`count` is a required response field** even though the client could take `places.length`: a client computing it can render "1 other place" when there are twenty ([contract §1](./contracts/delivery-areas.contract.md))
- [x] T015 [US1] Extend `addZonePostcodes` in `apis/edge-api/admin/src/delivery/service.ts` — a postcode matching no locality returns a **warning requiring explicit confirmation**, not a silent accept and not a hard block (FR-005). ⚠ The reference record can lag reality; a hard block would stall legitimate operations work
- [x] T016 [P] [US1] ⚠ **Also updated an existing test whose fixture used `3001` as an ordinary example postcode** — a small illustration of how it came to be in a delivery zone at all. Unit-test the warning path: ⚠ **3001 specifically** — unconfirmed is refused, confirmed is accepted, and the response says why. This is the defect that motivated the feature
- [x] T017 [P] [US1] Unit-test that an already-zoned postcode is still refused, naming the zone that has it (FR-008)

### Console

- [x] T018 [US1] Add locality + coverage reads to `apps/back-office/src/features/delivery/repo.ts` and query hooks to `queries.ts`
- [x] T019 [US1] Create `apps/back-office/src/features/delivery/components/PostcodeCoverageNotice.tsx` — ⚠ **its own component on purpose.** FR-006 is the requirement most likely to be quietly reduced to a tooltip, and a named module with its own tests makes that harder to do by accident
- [x] T020 [P] [US1] Test `PostcodeCoverageNotice` against the contract's worked table: 3350 → "19 other places", 3000 → sole place, and the **removal** wording. ⚠ Written against [contract §2](./contracts/delivery-areas.contract.md), not against the component
- [x] T021 [US1] Create `apps/back-office/src/features/delivery/components/AddAreasDialog.tsx` — locality search, each result showing name + state + postcode (FR-002), with `PostcodeCoverageNotice` **on screen at the moment of confirming** (FR-006)
- [x] T022 [US1] Wire `AddAreasDialog` as the primary path in `ZoneDetailScreen.tsx`; ⚠ **retain `AddPostcodesDialog` as the escape hatch** (FR-004) — demoted, not deleted
- [x] T023 [US1] Show the same disclosure on **removal** (FR-007). ⚠ The more dangerous direction: it silently stops serving customers who were being served
- [x] T024 [US1] Show a zone's areas **by name** in `ZoneDetailScreen.tsx`, not only by postcode (FR-023)

**Checkpoint**: US1 is shippable. A zone can only be built from real places, and the admin knows what
they chose.

---

## Phase 4: User Story 2 — Decide what each area gets, and what it costs (Priority: P2)

**Goal**: service levels and fees are set per area, and "not served" becomes a recorded decision.

**Independent Test**: set standard-only for one area and same-day for another; confirm a shopper in
each is offered exactly that.

### Service

- [ ] T025 [US2] Create `apis/edge-api/admin/src/delivery/areas.ts` — the per-area read joining zone, decision and offerings, answering FR-022 in **one** request
- [ ] T026 [US2] Implement the **projection** in `areas.ts`: one area edit writes `delivery_offering` rows for every origin zone, per the rule in [data-model.md](./data-model.md). ⚠ Disabling sets `status='disabled'` rather than deleting — a disabled row records that someone switched it off, which deletion destroys
- [ ] T027 [US2] Implement the not-served write (FR-011/FR-011a/FR-011b/FR-012) as **one transaction**: record the decision **and remove the postcode from the zone**, capturing `decided_by`, `decided_at` and the note. ⚠ **Recording alone changes nothing** — serviceability is decided by zone membership, so a decision written beside it would leave the storefront still answering "we deliver here" for an area explicitly marked unserved. That is the REGIONAL defect inverted, introduced by the feature meant to prevent it. The decision **survives** the withdrawal (there is no FK, by design), which is what lets the console still say who decided it and why
- [ ] T027a [P] [US2] Unit-test that not-served **withdraws membership and keeps the decision**, and that re-adding the area **surfaces the earlier decision and note** (FR-011c)
- [ ] T027b [US2] Add the FR-021 check: the platform must not offer a service level nothing can fulfil — an area with no zone membership is not serviceable, and the area editor must not present service levels for one
- [ ] T028 [US2] Add `GET`/`PUT /admin/v1/delivery-zones/{id}/areas/{postcode}` and `POST .../not-served` — three handlers in `apis/edge-api/admin/src/functions/` + `serverless.yml` entries
- [ ] T029 [US2] Extend the existing audit trail to cover area composition and service-level changes (FR-009/FR-016). ⚠ Extend what 021 already records; do not invent a second mechanism
- [ ] T030 [P] [US2] Unit-test the projection: one area edit produces the expected rows for every origin; a disable sets `status`, never deletes
- [ ] T031 [P] [US2] Unit-test the three states resolve unambiguously — `served` / `not_served` / no row — and that **no area can be in two of them** (SC-005)
- [ ] T031a [P] [US2] ⚠ Test **two areas in ONE zone with divergent decisions** (one `served`, one `not_served`, identical offerings). The health check is zone-granular while the decision record is area-granular, so this is the case the query cannot currently distinguish ([data-model.md](./data-model.md) §consequence 3). ⚠ If the test cannot be made to pass, the granularity gap is real and must be recorded rather than papered over
- [ ] T032 [P] [US2] Unit-test that `PUT` is a **replace**: a method omitted from the request is turned off, not left ambiguous ([contract §1](./contracts/delivery-areas.contract.md))

### Console

- [ ] T033 [US2] Create `apps/back-office/src/features/delivery/components/AreaServiceLevelForm.tsx` — standard / scheduled / same-day, each with enabled + fee + timing, plus the not-served action
- [ ] T034 [US2] Create `apps/back-office/src/features/delivery/AreaDetailScreen.tsx` — everything one area gets, on one screen (FR-022). ⚠ **No cards** — a sectioned detail page with rows (Principle V)
- [ ] T035 [US2] Register the area route in `apps/back-office/src/routes/delivery.tsx`
- [ ] T036 [US2] ⚠ **Disclose the second-order effect**: `delivery_offering` is keyed on **zone**, so configuring Ballarat also configures Bendigo. The editor must state which other areas the change affects — FR-006's problem one level up ([data-model.md](./data-model.md) §consequence 2)
- [ ] T037 [US2] ⚠ **Render "deliberately not served" and "unconfigured" differently**, with the decision's author and date on the first ([contract §3](./contracts/delivery-areas.contract.md)). Fusing them in the UI would undo the entire point of the migration
- [ ] T038 [US2] Reconcile existing per-origin rates: where an area's current rates differ by origin, show **both** and require the admin to choose (research [R3b](./research.md)). ⚠ Live data has Melbourne Metro standard at **$5.00** and **$8.00** — no automatic rule
- [ ] T039 [P] [US2] Component-test that the two states are visually distinguishable and that the reconciliation prompt appears only when rates actually differ

### ⚠ Closing the second management surface (F3)

- [ ] T039a [US2] ⚠ **Gate the per-origin grid editor.** `apps/back-office/src/features/delivery/RatesScreen.tsx` and the live routes `delivery-offering-create-v1-post` / `delivery-offering-update-v1-patch` still let an admin set a different fee per origin — **undoing FR-013 the day after sign-off**. The spec's own reasoning rejects "two management surfaces for one concept is how configuration drifts", and leaving both is exactly that. Make the grid **read-only** (retained for visibility and diagnosis), with the area editor as the only write path
- [ ] T039c [P] [US2] Assert the console's configurable method set **equals** `delivery_offering`'s `method` CHECK set exactly (FR-029). ⚠ This slice is the first interface to expose all three together and introduces `scheduled` to a console that has never configured it — the one place a fourth method could slip in unnoticed
- [ ] T039d [P] [US2] Test that a same-day area still has same-day **withdrawn after its cutoff** (FR-020). ⚠ Currently this rides entirely on core-api's suites; it deserves its own assertion now that a console can set the cutoff
- [ ] T039b [P] [US2] Add the invariant test: for any `(destination_zone_id, method)`, **every origin carries the same fee**. ⚠ This is what makes FR-013/SC-011 enforceable rather than merely intended, and it is the assertion the grid editor could silently violate

**Checkpoint**: an area's configuration is a decision someone made, not a row someone forgot — and
there is only one way to change it.

---

## Phase 5: User Story 3 — Same-day is an informed decision (Priority: P2)

**Goal**: nobody enables same-day for an area without seeing what can serve it.

**Independent Test**: enable same-day for an area with no shop in its zone and confirm the interface
shows the problem rather than accepting silently.

- [ ] T040 [US3] Add the shop-feasibility read to `apis/edge-api/admin/src/delivery/areas.ts` — shops whose postcode resolves to the area's zone. ⚠ Presented as **"shops in the same zone"**, stated as exactly that. No computed radius: the platform has no routing capability and postcode arithmetic would be **invented precision on a promise** (research [R6](./research.md))
- [ ] T041 [US3] Enforce the acknowledgement server-side: same-day enabled with no in-zone shop and no `noNearbyShopAcknowledged` → **`422`** ([contract §1](./contracts/delivery-areas.contract.md))
- [ ] T042 [P] [US3] Unit-test the `422`, and that the acknowledgement is **persisted with its author** so it remains visible afterwards (FR-019)
- [ ] T043 [US3] Show the shops and their locations in `AreaServiceLevelForm.tsx` when same-day is being enabled, with the acknowledgement control (FR-017/FR-018)
- [ ] T044 [US3] Display the stored acknowledgement and who made it on `AreaDetailScreen.tsx`

**Checkpoint**: the one path in this feature that can harm a customer is guarded on the server, not
only in the UI.

---

## Phase 6: User Story 4 — Spot a configuration that has quietly gone wrong (Priority: P3)

**Goal**: the three defect classes are visible without hunting.

**Independent Test**: introduce each defect deliberately and confirm each is surfaced.

- [x] T045 [US4] Create `apis/edge-api/admin/src/delivery/health.ts` over the three queries in [data-model.md](./data-model.md)
- [x] T046 [US4] Add `GET /admin/v1/delivery-health` — handler + `serverless.yml` entry
- [x] T047 [P] [US4] Unit-test each class independently: unknown place, unconfigured area, empty zone — and that a clean configuration returns **all three empty** (SC-009). ⚠ An indicator that is always lit tells an operator nothing
- [x] T048 [US4] Create `apps/back-office/src/features/delivery/DeliveryHealthPanel.tsx` and surface it within one screen of where an admin would look (SC-008). ⚠ **A list, not a grid of metric tiles** (Principle V)
- [x] T049 [US4] ⚠ **DEFERRED, deliberately — there is nothing to add a gauge to.** No cold-path service on this platform emits a metric: a grep across `apis/edge-api/*/src` finds no `PutMetricData` and no EMF, only log lines that reach CloudWatch. Building an emission path is its own work (namespace, dimensions, and the same question for every other cold-path service). `healthCounts()` in `health.ts` produces the exact shape a gauge would take — counts only, no postcode, no area name — so wiring one later is a caller change, not a rewrite. ⚠ **Carry-forward: the cold path has no metrics emission path at all**, a Principle VII gap wider than this slice

**Checkpoint**: the next 3001 surfaces in a day, not in weeks.

---

## Phase 7: ⚠ The FR-028 guard — proving the shopper is untouched

**This phase is the one that says the feature did not leak. Do not treat it as polish.**

- [ ] T050 Run `cd apis/core-api && go build ./... && go vet ./... && go test ./...`. ⚠ **They must pass with ZERO edits to core-api.** A core-api test that needed changing is the guard reporting a design breach, not a test needing an update — stop and redesign (research [R8](./research.md))
- [ ] T051 Add the SC-014 assertion to the **admin service's** test suite, over the same query that backs `/delivery-health` (`health.ts` query 2): no area may be serviceable to the storefront while unquotable at checkout.
  ⚠ **CORRECTED.** An earlier draft said "beside 030's SC-002 coverage check". That check lives at `apis/core-api/internal/features/storefront/locality_coverage_test.go` — **inside core-api**, which T053 requires to have an empty diff. The two tasks contradicted each other, and the one that would have failed is the one proving this feature's motivating defect is fixed.
  ⚠ The admin service is also the *right* home on the merits: this is a **configuration-health** assertion, and configuration health is what this service owns. It is the same query `/delivery-health` returns, so there is now **one** criterion of record rather than three.
- [ ] T052 ⚠ **Prove T051 by breaking it** — construct the `REGIONAL` state (postcodes in a zone, no active inbound offering) and confirm the assertion **fails and names the postcodes**. A check that has only ever passed has not been shown to work
- [ ] T053 [P] Confirm `git diff --stat apis/core-api apps/customer-web apps/customer-mobile` is **empty** (FR-028/FR-030/FR-031)

---

## Phase 8: Operator walks

⚠ **Do not mark any of these complete on reasoning.** 028 marked six verification tasks complete
without checking and three defects fell out of re-auditing them.

- [ ] T054 **⚠ OPERATOR** `make edge-deploy SERVICE=admin ENV=dev`, then confirm all **six** new routes respond — ⚠ including `/delivery-localities/coverage`, the FR-006 endpoint an earlier draft left out of the count — ⚠ a 404 reads in the UI as an empty screen, which looks like "no problems found"
- [ ] T055 **⚠ OPERATOR** Walk [quickstart.md](./quickstart.md) §3 — ⚠ **`/delivery-health` must list 3350 and 3550 as unconfigured, today.** If it returns empty it is not working, it is looking in the wrong place
- [ ] T056 **⚠ OPERATOR** Walk **W1** — compose a zone without typing a postcode (SC-001)
- [ ] T057 **⚠ OPERATOR** Walk **W2** with **5 admins** (SC-003). ⚠ **The walk that matters most.** After they add Alfredton, ask how many places they just made serviceable. **Pass = twenty.** If they say one, the disclosure is technically present and functionally absent. Repeat for removal
- [ ] T058 **⚠ OPERATOR** Walk **W3** — add 3001 through the escape hatch; must warn and require confirmation (SC-002)
- [ ] T059 **⚠ OPERATOR** Walk **W4** — configure an area, then state what it gets in under 30 s from one screen (SC-004), and confirm the Ballarat-also-configures-Bendigo disclosure appears
- [ ] T060 **⚠ OPERATOR** Walk **W5** with **5 admins** (SC-006) — tell "deliberately not served" from "unconfigured", and say who decided the first
- [ ] T061 **⚠ OPERATOR** Walk **W6** (SC-007) — the shops are shown and the acknowledgement is required. ⚠ **Also attempt it by `curl` without the flag — must be `422`.** A UI-only guard is not a guard
- [ ] T062 **⚠ OPERATOR** Walk **W7** — introduce all three defects, confirm each surfaces, fix them, confirm **zero** warnings (SC-008/SC-009)
- [ ] T063 **⚠ OPERATOR** Walk **W8** — serviceability identical before/after for an unchanged configuration; a quoted order keeps its fee; the same area costs the same from two different shops (SC-010/SC-011/SC-012)
- [ ] T064 **⚠ OPERATOR** Walk **W9** — configure `REGIONAL`, confirm `/delivery-health` returns empty, and **complete a real checkout to a Ballarat address** (SC-014). ⚠ This is the whole feature in one walk, and the thing that was broken when the slice started
- [ ] T065 **⚠ OPERATOR** Confirm every composition and service-level change is attributable to a named admin (SC-013)

---

## Phase 9: Polish & Cross-Cutting Concerns

- [ ] T066 [P] Verify no new design token was added — `make cm-tokens-check` unchanged (Principle V)
- [ ] T067 [P] Grep the diff for any postcode or area name reaching a metric label or analytics call (Principle VII)
- [ ] T068 [P] Confirm the console uses no card layouts for the area view or health panel (Principle V)
- [ ] T069 ⚠ **There is no back-office parity register.** `docs/audiences/` holds only `customer-capabilities.md` and `shop-capabilities.md`, and this is neither. Either create `docs/audiences/admin-capabilities.md` and record this capability, or drop the task deliberately — ⚠ do **not** append an admin feature to the shop register, which is what the hedged original would have caused
- [ ] T070 Update `CLAUDE.md` § Active feature with the outcome, the `REGIONAL` resolution, and any carry-forward
- [ ] T071 Run the full machine sweep in [quickstart.md](./quickstart.md) §5. ⚠ `pnpm -r typecheck` **and** `pnpm -r test` — vitest does not run `tsc`, and 029 shipped green tests over a failing typecheck; count the reporting packages
- [ ] T072 **⚠ OPERATOR** Sign-off per [quickstart.md](./quickstart.md) §6 — state which walks ran, **who the five admins were** for W2 and W5, whether `/delivery-health` found 3350/3550 **before** they were fixed, whether core-api's suites passed **unmodified**, and the final state of `REGIONAL`
- [ ] T073 **⚠ OPERATOR** Commit the slice

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup)** — ⚠ **T002 must run before anything changes.** Without a before-reading of the defect there is no way to prove T055 works rather than merely runs.
- **Phase 2 (Foundational)** — depends on Phase 1. **Blocks all four stories.** T005 is operator-run and blocks every service task.
- **Phase 3 (US1)** — depends on Phase 2. The MVP.
- **Phase 4 (US2)** — depends on Phase 2. Independent of US1 in principle; sequenced after it so areas mean something before they are configured.
- **Phase 5 (US3)** — depends on US2's area write existing.
- **Phase 6 (US4)** — depends on Phase 2 only. ⚠ Could run early, and there is an argument for it: the health endpoint would surface `REGIONAL` before anything else is built.
- **Phase 7 (the guard)** — after any story that touches the projection.
- **Phase 8 (walks)** — after the stories being signed off.
- **Phase 9 (polish)** — last.

### Story dependencies

- **US1 (P1)** — no dependency on another story. Ship it alone and zones can only contain real places.
- **US2 (P2)** — no hard dependency on US1; both write to the same zone.
- **US3 (P2)** — depends on US2's write path.
- **US4 (P3)** — independent of all three.

---

## Parallel Opportunities

- **Phase 2**: T006/T007 (types) together; T011/T012 alongside T008–T010.
- **Phase 3**: the service chain (T013–T017) and the console chain (T018–T024) are largely independent once the contract is fixed — the biggest parallel win.
- **Phase 4**: service (T025–T032) and console (T033–T039) likewise.
- **Phase 6**: entirely independent of US1–US3; ⚠ can be built first if you want the defect visible sooner.
- **Phase 9**: T066–T068 together.

---

## Implementation Strategy

### MVP — Phases 1–3 (T001–T024)

US1 alone stops the 3001 class of defect: a zone can only be built from places that exist, and the
admin is told what they actually selected.

### Recommended variation

⚠ **Consider building US4 (health) immediately after Phase 2.** It is small, independent, and it makes
`REGIONAL` visible in the console before any other work lands — which means the rest of the slice is
built against a defect you can see rather than one you remember.

### If time runs short

Cut **US4 before US3**. Same-day is the only path that can promise a customer something the platform
cannot do; a missing health panel is an inconvenience. ⚠ Do not cut the walks — three success criteria
are observer tests and no machine check substitutes for any of them.

---

## Notes

- ⚠ **`core-api` gets zero changes.** Its suites passing unmodified is the FR-028 guard, not a formality.
- ⚠ **The disclosure has two levels**: choosing a place selects a whole postcode (FR-006), and configuring an area configures its whole zone (T036). Both must be stated; the second is easy to miss because the first feels like it covered it.
- ⚠ **`/delivery-health` has a real acceptance test available on day one** — it must find 3350 and 3550. An endpoint that has only ever returned empty has not been proven to find anything.
- **Ballarat and Bendigo are broken today.** Unblocking them is a data change independent of this slice, and the operator may reasonably do it before this ships.
- **No new dependency, no new design token, no card layouts.**

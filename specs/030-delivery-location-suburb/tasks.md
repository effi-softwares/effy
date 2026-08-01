---

description: "Task list for 030 — Suburb-Aware Delivery Location"
---

# Tasks: Suburb-Aware Delivery Location

**Input**: Design documents from `/specs/030-delivery-location-suburb/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/locality.contract.md](./contracts/locality.contract.md),
[quickstart.md](./quickstart.md)

**Tests**: Included. This slice touches a frozen contract, a byte budget, and a three-way distinction
(unrecognised / unserved / could-not-check) that is invisible to a compiler — every one of those needs
a test that fails when it breaks.

**Organization**: grouped by user story. US1 alone is a shippable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable — different files, no dependency on an incomplete task
- **[Story]**: US1 / US2 / US3, mapping to [spec.md](./spec.md)
- **⚠ OPERATOR**: the user runs it (DB, live AWS, a device, or a licence judgement) — Claude does not

---

## Phase 1: Setup

**Purpose**: get onto a branch and get the reference data into the repo, legally.

- [x] T001 ✅ **DONE 2026-08-01** — branch `030-delivery-location-suburb` created from **`02512f2`** (the `029-promotional-banner-carousel` HEAD), by operator decision. ⚠ **NOT from `main`**, which is at 026 and 22 commits behind: 027 (cart sync), 028 (merchandised Home, where `DeliveryBar` lives) and 029 (`/promotions/[id]` + its bundle-gate entry) are all unmerged, so a `main` base would have measured bytes on a 5-route tree that becomes 6 routes on merge — green here, red on `main`. ⚠ **Consequence carried forward**: 027/028/029 must reach `main` before or with this slice, or the same divergence simply moves to merge time
- [x] T002 ⚠ **RUN 2026-08-01 — THE ASSUMED DATASET FAILED.** `matthewproctor/australianpostcodes` has **no licence at all** (GitHub API: `"license": null`; no `LICENSE` file; no terms in the README). No licence means all rights reserved, not "permissive" — it **cannot** be committed. Verified alternatives recorded in [research R1](./research.md). ⚠ **There is no drop-in replacement**, so T003 is now a decision, not a download — see T002a
- [x] T002a ✅ **DECIDED 2026-08-01 (operator): G-NAF.** ⚠ The operator accepted the licence position; the CC BY 4.0 attribution it requires is mandatory and lands in `db/reference/README.md` (T004). The alternatives as verified:
  - **G-NAF via data.gov.au** — data.gov.au's API tags it **CC BY 4.0**, but the package also ships an **End User Licence Agreement** PDF and an **"Open G-NAF Use Restriction"** fact sheet. ⚠ Those two must be read: a CC BY tag beside a EULA is exactly the ambiguity this task exists to catch. **1.7 GB**, from which ~17k distinct `(locality, state, postcode)` triples would be derived.
  - **ABS ASGS SAL** — cleanly **CC BY 4.0**, but supplies names + states only. Needs a second source for postcodes and a join.
  - Whatever is chosen, `db/reference/README.md` records the source URL, the licence, the retrieval date, and the **attribution** CC BY requires
- [x] T003 ✅ **DONE 2026-08-01** — G-NAF **MAY 2026** downloaded by the operator; `make derive-localities` streamed **16,905,824** addresses in ~44 s → `db/reference/au-localities.csv`, **15,414 triples**, 8 states, **299 leading-zero postcodes**. Two runs byte-identical (`34ec3bfa…`); the Go loader parses it end to end. ⚠ The 1.7 GB source is **NOT committed** — only the derived triples are
- [x] T004 [P] `db/reference/README.md` written — CC BY 4.0 attribution block (⚠ **required**, not optional), source, refresh procedure, and what the derivation guarantees. ⚠ Two fields are left blank for the operator to fill on first derivation: **retrieval date** and **row count**
- [x] T005 [P] Add a `load-localities` target to `Makefile` (`ENV=` like every other DB target; composes the DSN from the 002 contract)

- [x] T004a Write `db/reference/derive-localities.mjs` + `make derive-localities GNAF=…` — streams G-NAF's `ADDRESS_DETAIL` (tens of millions of rows, never buffered), joins to `LOCALITY` and the state authority codes, emits sorted distinct triples. ⚠ **Two real defects found only by running against the real download**, neither of which a synthetic fixture could surface: (1) the file pattern `_LOCALITY_psv.psv$` also matches `{ST}_STREET_LOCALITY_psv.psv` — it **would have loaded street names as suburbs**; (2) the STATE table is per-state in `Standard/`, not in `Authority Code/` as assumed. Also handled: `OT` (Other Territories) is a **ninth** pseudo-state the `locality.state` CHECK forbids, and non-residential locality classes (T/D/H) are excluded

**Checkpoint**: the data exists in the repo and is legal to ship.

---

## Phase 2: Foundational (blocks US1–US3)

**Purpose**: the table, the rows, the endpoint, the shared contract, and the two risk spikes.

**⚠ CRITICAL**: no user-story work starts until **T027** has answered — the web byte measurement is
the one that can still force a change of approach, and it has a defined fallback (FR-045). T026 is a
confirmation, not a gate (see its note).

### The table and the rows

- [x] T006 Create migration `db/migrations/<timestamp>_locality.sql` — `public.locality` + the triple UNIQUE + both indexes + the table comment, exactly as specified in [data-model.md](./data-model.md). ⚠ Schema only, no rows
- [x] T007 [P] Create `apis/core-api/internal/platform/localityload/` — pure CSV → rows parsing with no DB dependency, plus unit tests
- [x] T008 [P] Unit-test `localityload` rejection behaviour: a 3-digit postcode, a non-numeric postcode, an unknown state code, a blank name. ⚠ It **rejects and names the line**; it never pads or repairs (see [data-model.md](./data-model.md))
- [x] T009 Create `apis/core-api/cmd/load-localities/main.go` — reads the CSV, upserts on `locality_triple_uq`, reports counts, exits non-zero on any malformed row
- [ ] T010 **⚠ OPERATOR** Commit the migration (003 commit-guard), then `make db-up ENV=dev`, then `make load-localities ENV=dev`
- [ ] T011 **⚠ OPERATOR** Run the [quickstart.md](./quickstart.md) §1 verification queries: row count 16–18k, 8 distinct states, and ⚠ **`postcode LIKE '08%'` returns > 0** — a zero there means leading zeros were eaten and the whole Northern Territory is unreachable
- [ ] T012 **⚠ OPERATOR** Run the §1 `EXPLAIN ANALYZE` and confirm an **index scan** on `locality_name_prefix_idx`. ⚠ A `Seq Scan` means `text_pattern_ops` is missing — the feature will be correct and silently scan 18k rows per keystroke
- [x] T013 Add the SC-002 coverage test to the testcontainers suite (⚠ gated behind `-short`, which is this repo's actual convention — the plan said `FULL=1`, which does not exist here): every `delivery_zone_postcode.postcode` has at least one `locality` row, failing with the missing postcodes named. ⚠ Record in the test file that a `-short` run skips it, so nobody later assumes it has been running all along

### The endpoint (hot path)

- [x] T014 Add `SearchLocalities` to `apis/core-api/internal/features/storefront/repository.go` — raw SQL, two predicates (postcode equality / `lower(name) LIKE $1 || '%'`), `ORDER BY name, state, postcode`, `LIMIT 8`
- [x] T015 Create `apis/core-api/internal/features/storefront/localities.go` — the service: trim, classify digits-vs-letters, reject under 2 characters before touching the DB, return the domain `Locality` slice
- [x] T016 [P] Create `apis/core-api/internal/features/storefront/localities_test.go` — classification table (4 digits → postcode; "richmo" → prefix; "r" → `ErrInvalidQuery`; " 30 00 " → postcode), and ⚠ **ordering is never influenced by serviceability** (FR-011)
- [x] T017 Add `getLocalities` to `apis/core-api/internal/features/storefront/handler.go` — `200` list / `400 invalid_query` / `503`, plus `Cache-Control: public, max-age=86400`
- [x] T018 Register `GET /localities` in `apis/core-api/internal/features/storefront/register.go`, beside `/serviceability`
- [x] T019 [P] Add `storefront_locality_lookups_total{outcome}` to `apis/core-api/internal/platform/metrics/metrics.go`. ⚠ Outcome label only — the query string is never a label (FR-047)
- [x] T020 Handler tests: an unmatched query returns **`200` with `[]`**, not 404 and not an error. ⚠ This is the single most important assertion in the endpoint — "no such place" must be structurally distinguishable from "we don't deliver there"
- [x] T021 Confirm the **two existing** freeze assertions still pass **unmodified**: `assertKeys(t, "ServiceabilityDTO", …)` in `contract_test.go:75` and `TestServiceabilityResult_ExposesNothingBeyondTheAnswer` in `serviceability_test.go`. ⚠ Do **not** write a new test — both already exist, and research [R4](./research.md)'s claim is precisely that they need no change

### The shared contract (Principle II)

- [x] T022 Add `LocalityDTO` to `packages/shared-types/src/storefront.ts` — three required strings, documented per [contracts/locality.contract.md](./contracts/locality.contract.md) §1
- [x] T022a **⚠ REQUIRED FOR PRINCIPLE II** Import `LocalityDTO` in `packages/shared-types/src/customer-commerce-contract.ts` **and** reference it from the `CustomerCommerceContract` aggregator interface. ⚠ Declaring the type in `storefront.ts` alone is **not enough** — that file's own header states the aggregator "exists solely so the schema generator (run with `--expose all`) pulls EVERY referenced DTO into `definitions`". An unreferenced type is never generated, and T023 would then pass **trivially** while the Kotlin client carried a hand-written type
- [x] T023 Regenerate the Kotlin contract and run `make cm-contract-check`. ⚠ Assert the generated Kotlin file **actually gained `LocalityDTO`** — a diff, not merely a green check. A drift guard that passes because nothing was generated is worse than no guard: it reports safety it is not providing
- [x] T024 [P] Add the `LocalityDTO` literal to `apis/core-api/internal/features/storefront/wire_contract_test.go`. ⚠ **Copy the bytes from a real `curl` response**, not from the contract doc — 029's banner contract test pinned a shape no banner ever emitted and asserted the defect instead of catching it
- [x] T025 [P] Add the byte-identical literal to the Kotlin `commonTest` counterpart in `apps/customer-mobile/shared/src/commonTest/.../LocalityWireContractTest.kt`

### Risk checks — one gate, one confirmation

- [ ] T026 **NON-BLOCKING confirmation** — `ModalBottomSheet` is **already shipped in three customer-mobile screens** (`CheckoutScreen.kt`, `AddressBookScreen.kt`, `AddressFormSheet.kt`), and `AddressFormSheet` is a text-input form inside a sheet, so soft-keyboard behaviour is already exercised on a path 019/022/023 live-validated end-to-end. ⚠ The only genuinely novel part is a **scrolling result list compressing under the keyboard** — confirm that when the sheet is built (T035), not before. Do **not** gate Phase 3 on it
- [x] T027 ✅ **GATE PASSED — but only after a real reduction.** ⚠ The `next/dynamic` split ALONE made every route WORSE (+0.4–0.6 KB; `/cart` 173.8 → **174.3**, over budget) — the lazy-loader runtime costs more than the small form it deferred. Three further changes were needed: the mount re-check dynamically imported, the `loading:` fallback dropped, and **`DeliveryNotice` split into its own module** (it rode in the always-loaded chrome on all six routes and is used on one). Final: `/` 172.7 · `/browse` 169.9 · `/search` 173.8 · `/product/[id]` 172.2 · `/cart` 173.7 · `/promotions/[id]` 170.8 — **four routes at or below the pre-feature baseline**. Original task text: Split `DeliveryAffordance` into shell + a **stub** lazily-loaded panel, then run `pnpm --filter @effy/customer-web size` and record the per-route delta against T027a's baseline (research [R7](./research.md)). ⚠ The budget to beat on `/cart` is **0.2 KB**. Target is **byte-neutral or negative** on the always-loaded path — moving the existing panel body behind `next/dynamic` should *free* bytes, and if it does not, the split is not doing its job. If it cannot fit, FR-045 already fixes the response: **reduce the web presentation** — do not raise the limit, do not add a dependency
- [x] T027b **⚠ DESIGN CHANGE forced by T027a** Seed the web location by **passing a prop into the existing `DeliveryAffordance` client component** from a server island — **not** via a separate `DeliverySeedClient` module. ⚠ A new always-loaded client component cannot fit in 0.2 KB; a prop on a component that already ships costs approximately nothing. This supersedes research [R8](./research.md)'s original two-file design and changes T056–T058
- [x] T027a ✅ **DONE 2026-08-01** — re-measured on `02512f2`, all six routes green: `/` 172.2 · `/browse` 170.1 · `/search` **173.5** · `/product/[id]` 172.3 · `/cart` **173.8** · `/promotions/[id]` 171.0 (KB / 174 KB). ⚠ **The binding constraint is `/cart` at 0.2 KB and `/search` at 0.5 KB of headroom** — the stale "2.1–5.5 KB" figure was ~4–10× too generous. **Every always-loaded byte this feature adds to the storefront chrome must fit in 0.2 KB gzipped**, which is effectively zero. Artifacts restated; see T027b for the design consequence

**Checkpoint**: the endpoint answers, the contract is pinned in two languages, and both risky
approaches are known-good or already swapped for their fallback.

---

## Phase 3: User Story 1 — Find my place by name (Priority: P1) 🎯 MVP

**Goal**: a shopper who does not know their postcode can set a delivery location by typing a suburb
name and choosing from a list, on both surfaces.

**Independent Test**: on each surface, set a location and receive a delivery verdict **without typing
a single digit**. No account required.

### Shared client state

- [x] T028 [P] [US1] Add optional `locality` and `state` to the delivery context in `apps/customer-web/lib/delivery-store.ts`; changing the postcode clears both alongside `serviced`. ⚠ This **widens `seedFromAccount`** (`delivery-store.ts:155`) from `(postcode)` to carry the locality and state too — update its existing tests in the same change
- [x] T029 [US1] ⚠ Verify a `localStorage` value written **before** this feature still reads cleanly and renders as a bare postcode — a returning shopper must not silently lose their location on deploy day ([data-model.md](./data-model.md))
- [x] T030 [P] [US1] Add the same two optional fields to `DeliveryContext` in `apps/customer-mobile/shared/src/commonMain/.../features/delivery/DeliveryContextStore.kt`, with the same clear-on-postcode-change rule. ⚠ Same signature widening on `seedFromAccount` (`DeliveryContextStore.kt:75`); update `DeliveryContextStoreTest.kt` in the same change
- [x] T031 [P] [US1] Unit-test both stores: setting a locality then changing the postcode leaves no stale name behind

### Mobile — data and domain

- [x] T032 [P] [US1] Create `apps/customer-mobile/shared/src/commonMain/.../features/localities/domain/Locality.kt` — the entity, the `LocalityRepository` interface, and a `SearchLocalities` use case
- [x] T033 [US1] Create `apps/customer-mobile/shared/src/commonMain/.../features/localities/data/HttpLocalityRepository.kt` calling `v1/storefront/localities`, mapping the DTO explicitly and never letting it past the data layer
- [x] T034 [US1] Wire the repository and use case explicitly in `apps/customer-mobile/shared/src/commonMain/.../app/AppContainer.kt` (no DI framework)

### Mobile — the bottom sheet

- [x] T035 [US1] Create `apps/customer-mobile/shared/src/commonMain/.../features/delivery/DeliverySheet.kt` — a `ModalBottomSheet` (or the T026 fallback) carrying the input and the results list (FR-026, FR-027)
- [x] T036 [US1] Implement the single input that accepts either kind of entry: 4 digits check immediately (FR-007), letters search from the second character (FR-009)
- [x] T037 [US1] Render each result as a full-width row showing name, state and postcode together (FR-008), meeting the platform touch-target minimum (FR-032)
- [x] T038 [US1] Debounce input at 200 ms and ⚠ discard a response whose query the shopper has moved past — the slow "Rich" result must not repaint the list under a finger already typing "Richm" (research [R6](./research.md))
- [x] T039 [US1] Show the serviceability verdict **inside the sheet** (FR-028) and let the shopper try another place without reopening it (FR-029)
- [x] T040 [US1] Distinguish the three non-answers in the sheet: too-short input, empty result list, and a failed lookup. ⚠ **None of them may read as "we don't deliver there"** (FR-012, FR-013)
- [x] T041 [US1] Replace the `AlertDialog` in `apps/customer-mobile/shared/src/commonMain/.../features/delivery/DeliveryBar.kt` with the sheet; keep dismissal leaving the previous location untouched (FR-030), keep the clear action (FR-031), and ⚠ **keep the first-time invitation** — with nothing set the affordance must still say "Set your delivery location" and open in one tap (FR-038)
- [x] T042 [P] [US1] Unit tests for the debounce/stale-discard logic and the three-non-answers mapping, in `commonTest`

### Web — the panel

- [x] T043 [P] [US1] Create `apps/customer-web/lib/localities.ts` — the typed fetch, using `LocalityDTO` from `@effy/shared-types` rather than a local shape
- [x] T044 [US1] Finish the T027 split for real: `DeliveryAffordance.tsx` keeps only the button, the `<dialog>` shell and the store subscription; the body moves to `apps/customer-web/app/(shop)/_components/DeliveryPanel.tsx`, loaded via `next/dynamic` on first open (FR-043)
- [x] T045 [US1] Implement the input and a hand-rolled `role="listbox"` / `role="option"` list with `aria-activedescendant`, arrow keys and Enter — ⚠ no combobox library; the guest path is barred from `radix-ui` / `sonner` / `vaul` (FR-051, FR-045)
- [x] T046 [US1] Debounce at 200 ms and discard superseded responses, matching the mobile rule
- [x] T047 [US1] Show the verdict inside the panel (FR-050) and preserve the existing dismissal, focus-trap and background-inertness behaviour (FR-052)
- [x] T048 [US1] Map the three non-answers to three distinct messages, as on mobile (FR-012, FR-013)
- [x] T049 [P] [US1] Vitest coverage for the debounce/stale rule and the non-answer mapping in `apps/customer-web/lib/`
- [x] T050 [US1] Run `pnpm --filter @effy/customer-web depcruise` — ⚠ the guest-path quarantine must stay clean with the panel wired in
- [x] T051 [US1] Run `pnpm --filter @effy/customer-web size` with the real panel and record every route's number. ⚠ This is the gate; a breach is fixed by reducing the presentation (FR-044, FR-045)

**Checkpoint**: US1 is shippable. A shopper can find their place by name on either surface, and every
one of the three "we can't answer that" cases is visibly not a refusal.

---

## Phase 4: User Story 2 — Don't ask me what you already know (Priority: P2)

**Goal**: a signed-in shopper with a default address is never asked; their explicit choice still wins;
and nothing is ever written back to the account.

**Independent Test**: sign in with a default address on a clean device — the location and its verdict
are present on first view, with no interaction.

### Mobile

- [x] T052 [US2] Add a session observer in `apps/customer-mobile/shared/src/commonMain/.../app/AppContainer.kt`: on transition to `Authenticated`, list addresses (cold path), find `isDefault`, and call `seedFromAccount(...)` (research [R10](./research.md)). ⚠ Not from `HomeScreen` — that never runs if the shopper's first stop is another tab
- [x] T053 [US2] Seed the locality name and state from the address's `city` / `region` as well as the postcode; ⚠ `region` is nullable on existing addresses, so tolerate its absence and fall back to the postcode-derived display
- [x] T054 [US2] Implement the sign-out rule on the same observer: clear the context **only when `source == ACCOUNT`**; a location the shopper set survives (FR-023)
- [x] T055 [P] [US2] `commonTest` for the seeding guard (an existing location is never overwritten — FR-019), the sign-out discrimination in both directions, ⚠ that seeding **does not filter on serviceability** — an unserved default address is still seeded and shown as an ordinary refusal (FR-024) — and that a seeded location is changeable and clearable identically to one the shopper set (FR-020)

### Web

- [x] T056 [US2] Create `apps/customer-web/app/(shop)/_components/DeliverySeed.tsx` — a **server** component reading the session and default address and rendering `<DeliveryAffordance seed={…} />`. ⚠ It must **not** be called from `layout.tsx` directly; that file may not read cookies or headers (research [R8](./research.md))
- [x] T057 [US2] Accept the optional `seed` prop in `DeliveryAffordance` and apply it through the existing store guard. ⚠ **No new always-loaded client module** (T027b) — a separate `DeliverySeedClient` cannot fit in `/cart`'s 0.2 KB, a prop on a component that already ships can
- [x] T058 [US2] Swap `<DeliveryAffordance />` for `<Suspense><DeliverySeed /></Suspense>` in `apps/customer-web/app/(shop)/layout.tsx`, with the bare affordance as the fallback so the shell still prerenders. ⚠ Confirm a **guest** performs no account read (US2 scenario 8), and ⚠ confirm the public pages still build as `◐ PPR` — a dynamic read outside the boundary would turn every static shell into a per-request render
- [x] T059 [US2] Implement the same sign-out clearing rule in `apps/customer-web/lib/delivery-store.ts`, discriminating on `source`
- [x] T060 [P] [US2] Vitest for the web seeding guard and the sign-out rule, against **the same four cases as T055** — including the unserved-default case (FR-024) and the seeded-location-is-ordinary case (FR-020)
- [x] T061 [US2] ⚠ Confirm by inspection that no path in either surface writes to `/customer/v1/addresses` as part of setting, changing or clearing a location (FR-021, SC-006)
- [x] T062 [US2] Re-run `pnpm --filter @effy/customer-web size` — the seed client is **not** lazy-loadable and its bytes are always-loaded (contracts §3)

**Checkpoint**: 025's FR-013 account half is wired, three features after it was committed to.

---

## Phase 5: User Story 3 — See where I'm shopping (Priority: P3)

**Goal**: the set location reads as a place, on both surfaces, by one shared rule.

**Independent Test**: set a location by choosing a named place, then read the affordance without
opening anything — suburb, state and verdict are all legible.

- [x] T063 [P] [US3] Create `apps/customer-web/lib/delivery-display.ts` — a pure function implementing all four rows of the display rule ([contracts §2](./contracts/locality.contract.md))
- [x] T064 [P] [US3] Create `apps/customer-mobile/shared/src/commonMain/.../features/delivery/DeliveryDisplay.kt` — the same pure function
- [x] T065 [P] [US3] Unit-test both against **the four-row table in the contract**, not against whatever the implementation does. ⚠ 028 and 029 both shipped tests whose fixtures agreed with the code rather than the world
- [x] T066 [US3] Resolve the name for a bare-postcode entry via `?q=<postcode>`: name it when the postcode covers exactly one locality, show `STATE 1234` when it covers several (FR-034). ⚠ A failed name lookup must leave the **verdict** untouched
- [x] T067 [US3] Apply the rule in `apps/customer-mobile/shared/src/commonMain/.../features/delivery/DeliveryBar.kt`, keeping the three-state verdict visibly distinct (FR-035) and the polite live-region announcement (FR-037)
- [x] T068 [US3] Apply the rule to the web header button in `apps/customer-web/app/(shop)/_components/DeliveryAffordance.tsx`, including its `aria-label`
- [x] T069 [US3] Apply the rule to `DeliveryNotice` in the same file so the unserved notice names the place instead of repeating the postcode (FR-041)
- [x] T070 [US3] Make the screen-reader announcement use **the same words** as the visible display on both surfaces (FR-042)
- [x] T071 [US3] Implement predictable shortening for the web header (FR-040) — ⚠ the state may never be dropped in a way that makes two different places read identically
- [ ] T072 [US3] Verify no truncation of the verdict at the narrowest supported phone width and the largest supported system text size, light and dark (FR-036)

**Checkpoint**: all three stories are independently functional.

---

## Phase 6: Operator walks

⚠ **Do not mark any of these complete on reasoning.** 028 marked six verification tasks complete
without checking and three defects fell out of re-auditing them.

- [ ] T073 **⚠ OPERATOR** Walk [quickstart.md](./quickstart.md) §2 — the endpoint by `curl`, including `?q=springfield` returning several states, `?q=zzzzqqq` returning `200 []`, and `serviceability` still returning **exactly two keys**
- [ ] T074 **⚠ OPERATOR** Walk **W1** — find a place by name on each surface, under 20 seconds, no digits typed (SC-001)
- [ ] T075 **⚠ OPERATOR** Walk **W2** with 5 testers (SC-003). ⚠ **Stop `core-api`** for the third state — do not simulate it. The tester must read "something went wrong", never "they don't deliver to me"
- [ ] T076 **⚠ OPERATOR** Walk **W3** — 20 unrecognised or malformed inputs, **zero** read as a delivery refusal (SC-004)
- [ ] T077 **⚠ OPERATOR** Walk **W4** on both surfaces — seeding, the explicit-choice-wins case, both sign-out directions, and the address book unchanged afterwards (SC-005, SC-006). ⚠ Test the explicit-choice case **within one session** on mobile; record the restart behaviour honestly rather than marking FR-019 unqualified
- [ ] T077a **⚠ OPERATOR** Walk the **unserved-default** case (FR-024, US2 scenario 5): set a customer's default address to a postcode with no delivery zone, sign in, and confirm they are plainly told so. ⚠ The location must **not** be hidden and **no other address** may be substituted — silently swapping in a served address would answer a question the shopper never asked
- [ ] T077b **⚠ OPERATOR** Measure **SC-007** — time from keystroke to suggestions on a real phone over a typical mobile connection, 20 samples per surface, and record the p95. ⚠ T012's `EXPLAIN` proves the server's plan shape, which is **not** the same claim; if the p95 misses 1 s, say so rather than treating the index proof as a substitute
- [ ] T078 **⚠ OPERATOR** Walk **W5** with 5 testers — all four display rows, including a postcode covering several localities where **no suburb may be invented** (SC-008)
- [ ] T079 **⚠ OPERATOR** Walk **W6** — one-handed on mobile with the soft keyboard open, and pointer-free on web (SC-009, SC-018)
- [ ] T080 **⚠ OPERATOR** Walk **W7** — narrowest width, largest text, light and dark, tablet, and the narrow web header (SC-010)
- [ ] T081 **⚠ OPERATOR** Walk **W8** with a screen reader on both surfaces (SC-011, FR-042)
- [ ] T082 **⚠ OPERATOR** Walk **W9 on iOS AND Android** (SC-014). ⚠ 028 asked that Android not be skipped again; 029 skipped it again. Do not make it three
- [ ] T083 **⚠ OPERATOR** Confirm browsing is uninterrupted with an unanswered, unrecognised and unserved location (SC-012), and that no fee, window, zone name or fulfilment location appears anywhere (SC-013)

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T084 [P] Playwright spec `apps/customer-web/e2e/delivery.spec.ts` — 9 tests over the keyboard path and the answers that must stay apart. ⚠ **Also fixed 3 EXISTING e2e assertions** in `a11y.spec.ts` and `refinement.spec.ts` that addressed the field by its old label (`Postcode` → `Suburb or postcode`) and its old error text — they would have failed on the first live run
- [x] T085 [P] Verify reduced motion — the sheet's entrance routes through the existing motion spec; a shopper who asked for less movement gets none added
- [x] T086 [P] Confirm `tokens:check` is **unchanged** — this slice adds no design token, and the palette is closed (Principle V)
- [x] T087 [P] Grep the diff for any locality, state or postcode reaching a telemetry call (FR-047, SC-017)
- [x] T088 Update the parity register [docs/audiences/customer-capabilities.md](../../docs/audiences/customer-capabilities.md) §030 — ⚠ both customer columns move together; that was the point of the scope decision
- [x] T089 Update `CLAUDE.md` § Active feature with the outcome, the measured bundle numbers, and any carry-forward
- [x] T090 Run the full machine sweep in [quickstart.md](./quickstart.md) §4. ⚠ `pnpm -r typecheck` **and** `pnpm -r test` — vitest does not run `tsc`, and 029 shipped green tests over a failing typecheck; count the reporting packages
- [x] T090a [P] Fix the stale `cw-size` help text at `Makefile:310` — it says "MUST stay <= **176 KB**" while `bundle-budget.mjs` enforces `GUEST_LIMIT = 174 * KB`. Pre-existing, surfaced by this slice; the Makefile is the outlier
- [ ] T091 **⚠ OPERATOR** Sign-off per [quickstart.md](./quickstart.md) §5 — state which walks ran, on which platforms, the measured per-route bundle numbers, and ⚠ that **FR-019 holds within a session on mobile and cannot hold across a restart** (research [R12](./research.md))
- [ ] T092 **⚠ OPERATOR** Commit the slice

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup)** — starts immediately. ⚠ **T002 blocks T003**; there is no point committing a dataset that cannot be committed.
- **Phase 2 (Foundational)** — depends on Phase 1. **Blocks all three user stories.**
  - T010–T012 are operator-run and block T013 and every client task that needs real rows.
  - **T026 and T027 gate the approach** for mobile and web respectively. Building US1 before they answer is the expensive mistake this ordering exists to prevent.
- **Phase 3 (US1)** — depends on Phase 2. The MVP.
- **Phase 4 (US2)** — depends on Phase 2 only. ⚠ Independent of US1 in principle, but sequenced after it so a seeded location has a legible surface to appear on.
- **Phase 5 (US3)** — depends on Phase 2. Reads best after US1/US2 exist to display.
- **Phase 6 (Walks)** — depends on whichever stories are being signed off.
- **Phase 7 (Polish)** — last.

### Story dependencies

- **US1 (P1)** — no dependency on another story. Ship it alone and every shopper can answer the question.
- **US2 (P2)** — no dependency on US1. It seeds the same store US1 writes to.
- **US3 (P3)** — no hard dependency, but it is presentation over data the other two produce, so it delivers least on its own.

### Within each story

- Store fields → repository → use case → UI → tests → measurement.
- ⚠ On web the **measurement** (T051, T062) is not polish. It is the acceptance criterion for the approach.

---

## Parallel Opportunities

- **Phase 1**: T004 and T005 together.
- **Phase 2**: T007/T008 (loader) run alongside T014–T018 (endpoint); T019 and T024/T025 are independent files. ⚠ T026 and T027 are independent of each other and of everything else — run both early, in parallel.
- **Phase 3**: the mobile chain (T032–T042) and the web chain (T043–T051) are **entirely independent** and are the biggest parallel win in the slice. T028/T030 (the two stores) are also parallel.
- **Phase 4**: mobile (T052–T055) and web (T056–T060) likewise.
- **Phase 5**: T063/T064/T065 — two pure functions and their shared test table.
- **Phase 7**: T084–T087 are all independent.

---

## Implementation Strategy

### MVP — Phases 1–3 (T001–T051)

US1 alone is a complete answer to the problem that started this: a shopper who does not know their
postcode can use the store. Everything after it is refinement of an answer that already works.

### Full slice — Phases 1–7

Add US2 (stop asking returning customers, and finally wire 025's FR-013) and US3 (make the answer
legible), then the walks.

### If time runs short

Cut **US3 before US2**. A postcode-only display is worse but honest; continuing to ask a shopper for
an address they already gave us is the thing they will notice. ⚠ Do not cut the walks — five success
criteria are observer tests and no machine check substitutes for any of them.

---

## Notes

- ⚠ **`core-api` has no cloud deployment.** Everything here runs against `make core-run` locally. That is pre-existing (025's serviceability read lives under the same constraint), not introduced here.
- ⚠ **Mobile telemetry stays deferred** — the eleventh consecutive slice. Declared in [plan.md](./plan.md), not silently skipped.
- ⚠ **This feature makes an existing defect more visible**: with seeding wired, mobile's missing persistence means a shopper's deliberate choice is replaced by their account default on next launch. Out of scope by decision (research [R12](./research.md)); surface it again at T091.
- **No new dependency on any surface**, and no new design token. If either becomes tempting, re-read FR-045 and Principle V before adding one.

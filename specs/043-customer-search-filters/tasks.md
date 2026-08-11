---
description: "Task list for Customer Advanced Search Filters"
---

# Tasks: Customer Advanced Search Filters

**Input**: Design documents from `specs/043-customer-search-filters/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included — this platform's slices carry Go service/repository tests, Go↔Kotlin wire-contract
tests, and count-correctness tests; the plan and contracts explicitly require them.

**Organization**: Grouped by user story. The two backend reads are shared substrate for every story,
so they sit in Foundational; each client story is then independently testable against the live backend.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US4 (Setup/Foundational/Polish carry no story label)

## Path Conventions

- Backend (hot path): `apis/core-api/internal/features/storefront/`
- Contract: `packages/shared-types/src/storefront.ts`
- Web: `apps/customer-web/app/(shop)/`
- Mobile: `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/features/catalog/`
- Migration: `db/migrations/`

---

## Phase 1: Setup

**Purpose**: Scaffolding only — no new dependencies (all UI primitives already vendored).

- [ ] T001 [P] Create the web code-split folder `apps/customer-web/app/(shop)/_components/filters/` and an empty mobile file `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/features/catalog/presentation/FilterSheet.kt`; confirm `@effy/design-system/ui` exports `drawer`/`sheet`/`checkbox`/`collapsible` and that Compose `ModalBottomSheet` is already used in-app (no dependency additions).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared contract, the index migration, and the two hot-path reads that every user
story consumes.

**⚠️ CRITICAL**: No user-story work can begin until this phase is complete.

- [X] T002 [P] Extend the contract in `packages/shared-types/src/storefront.ts`: add `brands?: string[]` and change `attributes?` to `Record<string, string[]>` on `ProductSearchQuery`; add `FacetType` (`"single_select" | "multi_select" | "toggle"`), `FacetOptionDTO`, `FacetDTO`, `FacetSetDTO` per `contracts/storefront-facets.contract.md`; re-export from `packages/shared-types/src/customer-commerce-contract.ts`.
- [X] T003 Regenerate the Kotlin commerce contract from shared-types into `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/commerce/contract/` (multi-value params + `FacetSetDTO` family); run the contract-drift check (`cm-contract-check`).
- [X] T004 [P] Create migration `db/migrations/<ts>_search_facet_indexes.sql` (via `make db-new NAME=search_facet_indexes`) adding `product_active_brand_idx` (partial, `WHERE status='active'`) and `product_attribute_value_def_product_idx` per `data-model.md`; do NOT touch the trigram expression/index.
- [X] T005 Extend `apis/core-api/internal/features/storefront/search.go`: add `Brands []string` and change `Attributes` to `map[string][]string` on `SearchParams`; extend the shared `filters()` builder for `p.brand = ANY($brands)` and multi-value attribute `EXISTS` (`value_text = ANY(...) OR value_options && ...`) — OR within a facet, AND across, keeping ONE `filters()` shared by page + count.
- [X] T006 Extend `apis/core-api/internal/features/storefront/handler.go` (`getProducts` + `attributeFacets` to collect ALL repeated `brand` and `attr.<key>` values, not `vals[0]`) and `service.go` `SearchQuery` accordingly.
- [X] T007 [P] Add `apis/core-api/internal/features/storefront/facets.go`: build `FacetSet` (a `single_select` **category** facet + a `multi_select` **brand** facet + each active facetable attribute where `data_type IN ('single_select','multi_select','boolean')`) via a **bounded, concurrent** fan-out (029 two-wave goroutine pattern) over a shared decoded filter set, applying the own-selection-excluded rule to the multi_select facets (category reflects the fully-applied set).
- [X] T008 Add facet-count queries to `apis/core-api/internal/features/storefront/repository.go`: raw-SQL `GROUP BY` for category (product-count rollup, reusing the category path), brand (active+filtered), attribute values, and price bounds — reusing the shared `filters()` minus the target multi_select facet's own predicate.
- [X] T009 Add `Facets(ctx, query)` to `service.go`, a `getFacets` handler in `handler.go` (public, cacheable, `400 invalid_price`), and register `GET /v1/storefront/facets` in `register.go`.
- [X] T010 [P] Add `apis/core-api/internal/features/storefront/facets_test.go`: per-option counts equal an independent count; a facet's own selection does not shrink its sibling options; zero-count options and empty facets are omitted; fan-out is `-race` clean.
- [X] T011 [P] Extend `apis/core-api/internal/features/storefront/search_test.go`: OR-within (two brands → union) / AND-across (brand + attribute → intersection); `total` matches the page predicate.
- [X] T012 [P] Extend `apis/core-api/internal/features/storefront/wire_contract_test.go` and add the Kotlin sibling (`.../features/catalog/FacetWireContractTest.kt`) pinning a byte-identical `FacetSetDTO` literal and the repeated-param encoding.

**Checkpoint**: Both hot-path reads live, indexed, and tested. Client stories can begin.

---

## Phase 3: User Story 1 - Narrow results with an advanced filter panel (Priority: P1) 🎯 MVP

**Goal**: A shopper opens the filter panel (bottom sheet / drawer / side panel) and narrows results by
category + brand + price + offers + a product characteristic, on both surfaces.

**Independent Test**: On each surface, apply category + two brands + price + one characteristic; results
show only products matching all facets (union within the two-brand facet).

### Web (customer-web)

- [X] T013 [P] [US1] Create `apps/customer-web/app/(shop)/_components/filters/FacetSection.tsx` — a `single_select` control for the category facet, a checkbox list for each `multi_select` facet, a price range (that **prevents/corrects** min > max before applying, FR-004), and the offers toggle, driven by `FacetSetDTO`.
- [X] T014 [US1] Create `apps/customer-web/app/(shop)/_components/filters/FilterPanel.tsx` (composes `FacetSection`s) and `apps/customer-web/app/(shop)/_components/filters/FilterDrawer.tsx` (below-`lg`, on `@effy/design-system/ui` `drawer`); load them via `next/dynamic` so they stay out of the always-loaded guest chunk.
- [X] T015 [US1] Wire `apps/customer-web/app/(shop)/_components/SearchExperience.tsx`: fetch `/v1/storefront/facets`, render the persistent side panel at `lg+` and the drawer trigger below `lg` (with an **applied-filter count badge** on the trigger, FR-014 / US1 scenario 6), add `categoryKey`/`brands`/multi `attr.*` to `requestUrl`, and narrow the grid on apply (filter state read from the URL).

### Mobile (customer-mobile)

- [X] T016 [P] [US1] Extend `.../catalog/domain/Catalog.kt` and `.../catalog/domain/CatalogUseCases.kt`: `ProductQuery` gains `brands: List<String>` and multi-value `attributes`; add a `FacetSet` domain model and a `GetFacets` use case.
- [X] T017 [US1] Extend `.../catalog/data/HttpCatalogRepository.kt` and `.../catalog/data/CatalogMappers.kt`: issue the `/facets` request and the multi-value `/products` request (repeated params) and map DTO → domain.
- [X] T018 [US1] Build `.../catalog/presentation/FilterSheet.kt` (Compose `ModalBottomSheet` with facet sections — a single-select category control, checkbox lists for brand/attributes, a price range that **prevents/corrects** min > max, FR-004, and the offers toggle — plus Apply/Clear), extend `.../catalog/presentation/SearchViewModel.kt` with facet state + `applyFilters`, and add the filter icon (with an **applied-filter count badge**, FR-014 / US1 scenario 6) that opens it in `.../catalog/presentation/SearchScreen.kt`.

**Checkpoint**: Multi-facet filtering works and narrows the grid on both surfaces (counts may still be
static — that is US2).

---

## Phase 4: User Story 4 - Fast, responsive refinement (Priority: P1)

**Goal**: Filter changes update quickly, coalesce rapid changes into one refresh, and never let the
count/sort disagree with the list. (P1 — it constrains how US1 is built.)

**Independent Test**: Rapidly toggle several controls → exactly one result refresh for the settled
state; measured filter-change latency meets SC-002 at target scale.

- [X] T019 [US4] Web: in `SearchExperience.tsx`, coalesce filter changes into a single `/products` + `/facets` refresh (extend the existing 250 ms debounce), abort in-flight requests on change, and keep `loadMore` hitting only `/products`.
- [ ] T020 [US4] Mobile: in `SearchViewModel.kt`, coalesce rapid facet changes into one refresh on settle and recompute facets only on filter change (never on paginate).
- [ ] T021 [P] [US4] Backend: confirm the `facets.go` fan-out is `-race` clean and bounded; add Prometheus histograms `storefront_facets_query_seconds` and `storefront_search_query_seconds` (labels: `has_query`, `filter_count` bucket) in `service.go`/`handler.go`.
- [ ] T022 [US4] Performance validation (data-gated): `EXPLAIN (ANALYZE, BUFFERS)` the brand + attribute-value aggregates on a ≥50k-product set, confirm the new indexes are used (no seq scan on `product`) and `/facets` p95 < 1 s; **and** page a filtered set with keyset to ~page 20 confirming no slowdown vs page 1 and no skipped/repeated id at a boundary (SC-008); record results in `quickstart.md`.
- [ ] T023 [P] [US4] Both surfaces: render the result count and applied ordering from the server-returned `sort`/`total` so they always describe the shown list; extend a test on each surface.

**Checkpoint**: Filtering is responsive and consistent under rapid interaction and at scale.

---

## Phase 5: User Story 2 - Understand each choice before making it (Priority: P2)

**Goal**: Every option shows its result count, zero-result options are suppressed, counts recompute on
each filter change, and large facets use progressive disclosure.

**Independent Test**: Options display counts; a zero-result option is not offered; applying a filter
updates the remaining options' counts; a large facet reveals top options first with "Show more".

- [X] T024 [US2] Web: in `FacetSection.tsx`/`FilterPanel.tsx`, render per-option counts, hide zero-count options, recompute facets on every filter change, and add a "Show more" affordance for large facets (e.g. brand).
- [ ] T025 [US2] Mobile: in `FilterSheet.kt`, render counts, hide zero-count options, and add "Show more" for large facets.
- [X] T026 [P] [US2] Backend: add/extend a fixture test proving zero-count options and empty facets are omitted from `/facets` responses (UI-facing guarantee behind FR-009).

**Checkpoint**: No offered option can lead to an empty page; counts are live.

---

## Phase 6: User Story 3 - See, remove, and share active filters (Priority: P2)

**Goal**: Every applied filter is a removable chip with a single clear-all; web encodes the full set in
the URL (shareable, back/forward); mobile persists across a product round-trip; a filter-count badge
sits on the trigger.

**Independent Test**: Remove one chip → others intact; clear-all resets; a shared web URL reproduces
the set from page 1; mobile keeps filters after opening a product and returning.

- [X] T027 [US3] Web: in `SearchExperience.tsx`, render a removable chip per applied facet value (category, brands, attributes, price, offers) + "Clear all", and encode `categoryKey` + brands + multi `attr.*` in the URL (shareable, back/forward, opens at page 1). (The applied-count badge already ships in US1 T015.)
- [ ] T028 [US3] Mobile: add an applied-filter chip row + Clear all in `SearchScreen.kt`, and persist the applied set across a product-detail round-trip (`SearchViewModel`/back stack). (The filter-count badge already ships in US1 T018.)
- [ ] T029 [US3] Both surfaces: filter-aware empty state offering remove-last / clear-all (FR-022) and stale-option resolves to a valid (possibly empty-but-explained) state, never an error (FR-023).

**Checkpoint**: Applied filters are transparent, reversible, and (web) shareable.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T030 [P] Telemetry: emit `search_filter_applied` / `search_filter_removed` / `search_filters_cleared` / `search_facet_panel_opened` via the dynamic-import `capture()` convention (web); record the standing PostHog-init gap; mobile telemetry deferred.
- [X] T031 [P] Update the parity register `docs/audiences/customer-capabilities.md` §043 with the facet set + controls at web↔mobile parity (FR-021 / SC-004).
- [ ] T032 [P] Accessibility: keyboard operability + screen-reader announcements for the panel, counts, and chips (web); Compose semantics + 48 dp touch targets in `FilterSheet.kt`/`SearchScreen.kt` (mobile) (SC-009).
- [X] T033 Bundle gate: run `pnpm --filter @effy/customer-web size` and confirm `/search` ≤ 174 KB (filter UI code-split); reclaim/adjust if over — do NOT raise the budget.
- [ ] T034 [P] Full verification sweep: `pnpm -r typecheck`, web + edge tests, `go test ./... -race`, mobile `:shared:testAndroidHostTest` + `:shared:iosSimulatorArm64Test` + `:androidApp:assembleDebug`, `cm-guard`/`cm-tokens-check`/`cm-contract-check`, wire-contract.
- [ ] T035 Run the `quickstart.md` validation walk (operator/data-gated): commit the migration + `make db-up ENV=dev`, seed a catalogue with ≥2 brands and a facetable attribute, then the web + device walks.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (P1)**: none — immediate.
- **Foundational (P2)**: needs Setup; **blocks all user stories**. Within it: T002 → T003; T005 → T006; T007/T008 → T009; tests T010–T012 after their targets.
- **US1 (P3)**: after Foundational. MVP.
- **US4 (P4)**: builds on US1's client code (debounce lives in the same files) — start after US1's T015/T018 exist; T021/T022 (backend perf) can start right after Foundational.
- **US2 (P5)**: after US1 (renders into the same facet UI).
- **US3 (P6)**: after US1 (chips/state layer over the same components).
- **Polish (P7)**: after the desired stories.

### Within Each User Story

- Web and mobile tracks are independent and `[P]` across surfaces.
- Backend tasks precede the client tasks that call them (satisfied by Foundational).

### Parallel Opportunities

- Foundational: T002 and T004 in parallel; T007, T010, T011, T012 in parallel once T005/T006 land.
- US1: the web track (T013 → T014 → T015) and the mobile track (T016 → T017 → T018) run in parallel.
- Polish: T030, T031, T032, T034 in parallel.

---

## Parallel Example: User Story 1

```bash
# Web and mobile tracks in parallel after Foundational:
Task: "T013 [US1] FacetSection.tsx (web)"          # then T014 → T015
Task: "T016 [US1] domain FacetSet + GetFacets (mobile)"  # then T017 → T018
```

---

## Implementation Strategy

### MVP First (User Story 1 + the P1 responsiveness of US4)

1. Phase 1 Setup → Phase 2 Foundational (backend reads + contract + migration + tests).
2. Phase 3 US1 → **STOP and validate**: multi-facet filtering narrows the grid on both surfaces.
3. Phase 4 US4 responsiveness (debounce, count/sort consistency, perf validation) — still P1.
4. Deploy/demo the MVP.

### Incremental Delivery

US1+US4 (MVP) → US2 (counts & dynamic facets) → US3 (chips, sharing, persistence) → Polish. Each
increment adds value without breaking the last.

---

## Notes

- `[P]` = different files, no incomplete dependency.
- The infeasible "availability at my address" facet was removed during planning (delivery zones
  withdrawn) — no task exists for it (see spec FR-005 / research R2).
- The 174 KB `/search` bundle gate is a hard constraint: the web filter UI is code-split; T033 verifies.
- Multi-value contract (`brands`, `attributes: string[]`) is pinned by the Go↔Kotlin wire-contract test
  (T012) — the 027/028 lesson.
- Live/device steps (migration apply, seed, device walks, 50k-scale EXPLAIN) are operator/data-gated
  (T022, T035).
- ⚠ **Web deviation (T013/T014)**: given `/search` sits at 173.5/174 KB, the filter UI is one
  `next/dynamic` `FilterControls.tsx` (FacetSection + panel merged) rendered in both the desktop side
  panel and a lightweight inline mobile sheet — **native inputs, no vaul/radix drawer** — to keep it
  out of the first-load chunk. Verified: typecheck, 353 tests, `pnpm build`, size `/search` 173.5 KB.
- ⚠ **Mobile (T016–T018) is NOT compile-verified here** — no Gradle/iOS toolchain in this environment.
  Code written + `cm-guard` clean + Kotlin contract regenerated (T003, `count: Long`). Still required
  before sign-off: `./gradlew :shared:testAndroidHostTest`, `:shared:iosSimulatorArm64Test`,
  `:androidApp:assembleDebug`, `make cm-contract-check` (commit the regen), and the device walk.
- `FacetOptionDTO.count` was promoted to `WireInt` (Int/Long) for integer-clean wire parity (027).
- Category-facet counts exclude the category's own selection (uniform with the multi-selects), so a
  shopper sees sibling categories and can switch.

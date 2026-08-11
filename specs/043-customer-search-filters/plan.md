# Implementation Plan: Customer Advanced Search Filters

**Branch**: `043-customer-search-filters` | **Date**: 2026-08-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/043-customer-search-filters/spec.md`

## Summary

Turn the customer `/search` experience on **both** customer surfaces (customer-web, customer-mobile)
into a proper **faceted filtering** experience: category, brand, price, offers, and catalogue-driven
product characteristics — with **result counts per option**, **dynamic facets** (zero-result options
suppressed), removable chips + clear-all, and per-device presentation (mobile **bottom sheet**, web
**drawer** below `lg` / persistent **side panel** at `lg+`).

Technical approach: this is a **presentation + read-path** slice over data the catalogue already
serves. The hot path (`core-api` storefront) gains **one new read** — a **facets endpoint** that
returns the available facets, their options, and per-option counts for a given query + applied
filters — and the existing product search read is **extended** to accept **multi-value** brand and
attribute facets (OR-within-facet). No new tables; the counting is done in raw SQL with a **bounded,
concurrently-fanned set of aggregate queries** (029's two-wave pattern), plus **one index migration**
to keep counts inside the latency budget. The web filter UI is **code-split** so it does not enter the
always-loaded guest chunk (the `/search` route sits ~0.1 KB under the 174 KB budget). Mobile adds a
filter bottom sheet built on the `ModalBottomSheet` the app already uses elsewhere.

## Technical Context

**Language/Version**: Go 1.23 (hot path); TypeScript 5 / React 19 / Next.js 16 (customer-web); Kotlin
2.4.0 + Compose Multiplatform 1.11.1 (customer-mobile); PostgreSQL 16 (raw SQL, Goose).

**Primary Dependencies**: Gin + pgx/v5 (core-api); shadcn/ui primitives already vendored in
`@effy/design-system/ui` (`drawer`, `sheet`, `checkbox`, `collapsible`, `radio-group`,
`responsive-modal`); Compose Material 3 `ModalBottomSheet`; shared contract in `@effy/shared-types`.

**Storage**: PostgreSQL — existing tables `public.product`, `public.category`,
`public.attribute_definition`, `public.attribute_allowed_value`, `public.product_attribute_value`
(016 catalogue, EAV). No new tables; one forward-only **index** migration.

**Testing**: Go `go test` (storefront service/repository, container-backed); Vitest + Playwright
(customer-web); Kotlin `commonTest` Android + iOS (customer-mobile); Go↔Kotlin wire-contract test
(028 pattern); bundle-budget gate (`apps/customer-web/scripts/bundle-budget.mjs`).

**Target Platform**: Public web (SSR, guest-first) + iOS/Android (KMP) + Fargate Go service (dev).

**Project Type**: Multi-surface web + mobile + backend read path.

**Performance Goals**: filter change → updated results + counts **< 1 s p95 / < 2 s p99** at **≥ 50k
active products** (SC-002); deep paging with no degradation (SC-008, keyset already in place); a
**single** result refresh per settled interaction (SC-007, debounced).

**Constraints**: customer-web `/search` guest bundle **≤ 174 KB** (currently ~173.9 KB — the filter UI
MUST be code-split); Sydney RDS round-trip ~135 ms, so facet counting MUST be a **bounded** number of
queries run **concurrently**, never N serial round-trips (029 lesson); monochrome design, no new hue,
no card layouts; web↔mobile parity (FR-021).

**Scale/Scope**: ~5 facet types; brand + N dynamic attribute facets; two client surfaces + one backend
read + one index migration.

## Path decision (Principle III)

**Hot path (`core-api` storefront) only.** Facets and search are latency-sensitive **customer reads**,
which the 011 routing law (FR-028) and the existing `/v1/storefront/products` read already assign to
the hot path. No cold-path (Lambda) work, no new events, no auth change (the reads are public and
cacheable, exactly like today's search). This is the same path the capability already lives on;
extending it is the minimal, correct choice.

## Constitution Check

*GATE: must pass before Phase 0 and re-checked after Phase 1. Constitution v1.13.0.*

| Principle | Gate | Verdict |
|---|---|---|
| I — Spec-Driven | Gaps fixed at the earliest artifact | ✅ The infeasible "availability at my address" facet was **removed from the spec** during planning (delivery zones withdrawn), not silently dropped in code (spec FR-005 + Assumptions). |
| II — Monorepo & shared packages | Contracts + tokens shared, never copy-pasted | ✅ The facet + multi-value query contract lands in `@effy/shared-types` (single source; Kotlin generated from it); web UI reuses `@effy/design-system/ui` primitives; no new per-surface copies. |
| III — Dual-path | Path stated + justified | ✅ Hot path only (above). |
| IV — Auth (4-pool) | No cross-pool/token change | ✅ Public unauthenticated reads; no pool or token involvement. |
| V — Design | Monochrome, no new hue, no-card, native mobile, eBay/Uber-Eats reference | ✅ Filters are lists/sections (checkbox lists, range, chips), not cards; monochrome ramp only; mobile bottom sheet + 48 dp targets; facets modelled on eBay item-specifics + grocery dietary filters. |
| VI — Architecture spine | 3-layer slice, raw SQL, no ORM, keyset, unidirectional state | ✅ core-api handler→service→repository; raw SQL aggregate counts; keyset paging unchanged; mobile MVVM (ViewModel→UseCase→Repository); web keeps URL-as-state + fetch (existing `/search` pattern). |
| VII — Observability | Telemetry stated | ✅ Events declared below; web emission honours the standing PostHog-init gap (declared, not silently no-op'd). |
| Tech Standards (locked) | No ORM / migration-tool / stack swaps | ✅ Goose migration, raw SQL, no new frameworks; reuses vendored primitives. |
| Real-World Identifiers | No inferred identifiers | ✅ None in scope. |

**No violations requiring Complexity Tracking.** The one added surface (a `/facets` read) and the
N-bounded aggregate counting are reasoned in [research.md](research.md), not principle deviations.

### Telemetry (Principle VII)

Events (shared taxonomy): `search_filter_applied` (facet, value(s)), `search_filter_removed`,
`search_filters_cleared`, `search_facet_panel_opened` (surface: sheet/drawer/panel). Metrics
(core-api `/metrics`): a histogram `storefront_facets_query_seconds` and
`storefront_search_query_seconds` (labels: has_query, filter_count bucket — low cardinality). ⚠ Web
emission rides the **existing** dynamic-import `capture()` convention; PostHog is still not initialised
on customer-web (recurring platform gap), so web events are wired but inert until that is fixed — this
is **declared here**, not hidden. Mobile telemetry stays deferred consistent with prior mobile slices.

## Project Structure

### Documentation (this feature)

```text
specs/043-customer-search-filters/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions (counting strategy, multi-value contract, bundle, filterability)
├── data-model.md        # Phase 1 — facet model over existing catalogue tables + index migration
├── quickstart.md        # Phase 1 — runnable validation guide
├── contracts/
│   ├── storefront-facets.contract.md   # GET /v1/storefront/facets request/response
│   └── search-query.contract.md        # extended /v1/storefront/products params (multi-value)
└── checklists/requirements.md          # (from /speckit-specify)
```

### Source Code (repository root)

```text
apis/core-api/internal/features/storefront/
├── search.go            # EXTEND: brands[]; attributes map[string][]string (OR within facet)
├── facets.go            # NEW: FacetSet build — bounded concurrent aggregate counts
├── facets_test.go       # NEW
├── handler.go           # EXTEND getProducts parsing; NEW getFacets handler
├── service.go           # EXTEND Search; NEW Facets(query)
├── repository.go        # NEW facet-count queries (raw SQL, shared WHERE with search)
├── register.go          # NEW route GET /v1/storefront/facets
└── wire_contract_test.go# EXTEND: pin facet DTO + multi-value params (Go↔Kotlin)

db/migrations/
└── <ts>_search_facet_indexes.sql        # NEW: indexes for brand + attribute-value counting

packages/shared-types/src/
└── storefront.ts        # EXTEND: attributes → Record<string,string[]>, brands[]; NEW FacetSetDTO

apps/customer-web/app/(shop)/
├── _components/SearchExperience.tsx     # EXTEND: filter state (URL) + chips + counts
└── _components/filters/                 # NEW, code-split: FilterPanel, FacetSection, FilterDrawer, PriceRange
apps/customer-web/scripts/bundle-budget.mjs   # (gate — verify /search stays ≤ 174 KB)

apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/features/catalog/
├── domain/Catalog.kt · CatalogUseCases.kt     # EXTEND: FacetSet, GetFacets use case, ProductQuery multi-value
├── data/HttpCatalogRepository.kt · CatalogMappers.kt  # EXTEND: facets request + mapping
└── presentation/SearchViewModel.kt · SearchScreen.kt · FilterSheet.kt(NEW)  # bottom sheet + counts
```

**Structure Decision**: Extend the existing three-layer storefront slice on the hot path and the
existing `/search` client on each surface — no new service, module, or table. The only genuinely new
files are the facet-count layer (`facets.go` + queries), the web code-split `filters/` folder, the
mobile `FilterSheet.kt`, and one index migration.

## Key design decisions (detail in research.md)

1. **Facet counts = bounded, concurrent aggregate queries, computed on filter-change only.** One
   aggregate per facet ("all filters EXCEPT this facet's own selection" so OR-within-facet counts are
   correct), fanned out with goroutines and a shared decoded filter set (029 two-wave pattern). The
   **grid** query (`/products`) and the **facets** query (`/facets`) are separate calls: paging
   (`loadMore`) re-hits only `/products`, never recomputing counts. Rejected: one giant CTE (unreadable,
   worse plans), a search engine (Elasticsearch/ParadeDB — violates the locked PostgreSQL standard for
   a 50k-row catalogue).

2. **Multi-value contract change, pinned in the type.** `attributes: Record<string,string[]>` and a new
   `brands: string[]`; wire form is repeated params (`attr.diet=vegan&attr.diet=gf&brand=X&brand=Y`).
   The handler already enumerates `URL.Query()` — it changes from `vals[0]` to all values. A Go↔Kotlin
   wire-contract test pins it (027/028 lesson: fakes that speak one language at both ends miss this).

3. **Filterability is derived, no new schema for it.** `attribute_definition` rows with
   `data_type IN ('single_select','multi_select','boolean')` and `status='active'` are the facetable
   characteristics; `number` attributes are out of first slice (range UI per-attribute is heavier).
   Avoids a back-office `is_filterable` flag (scope creep into 016). Recorded as an assumption.

4. **Web bundle: the filter UI is code-split.** `FilterDrawer`/`FilterPanel` load via `next/dynamic`
   (opened on demand below `lg`; the `lg+` side panel is the only always-present piece and uses the
   lightest controls). The budget is **not** raised; the `size` gate must stay green (033/025 rule).

5. **One index migration** to keep counts fast: an index supporting brand grouping over active products
   and one supporting attribute-value grouping over a filtered product set. Exact indexes in
   data-model.md; validated by `EXPLAIN` in quickstart.

## Complexity Tracking

No constitution violations. No entries required.

# Sign-off: 043-customer-search-filters — Customer Advanced Search Filters

**Status: CONCLUDED (PARTIAL BY DESIGN) — 2026-08-11.** Backend + customer-web are **deployed to dev
and proven live** at `https://dev.effyshopping.com` (facets + multi-value search return `200` with
real counts). customer-mobile is **code-written but machine-unverified** — it has never been through
Gradle this slice. Concluding the slice closes the build; it does not make the unwalked mobile proofs
or the perf/device walks true. 23/35 tasks.

## What this slice did

Turned `/search` on both customer surfaces from a price-and-sale-only refinement into **faceted
filtering** over the catalogue data the platform already serves — no new catalogue capability, one
index migration, one new hot-path read.

- **Facets**: category (single-select), brand (multi-select), every active single/multi-select +
  boolean **product-characteristic attribute** (catalogue-driven — dev has dietary_labels, allergens,
  spice_level, storage), a price band, and an on-sale toggle. OR within a facet, AND across (FR-003).
- **Counts & dynamic facets**: each option carries its result count in the current set; zero-count
  options are dropped so **no offered option leads to an empty page** (FR-009); a facet's own selection
  is excluded from its own counts so sibling options stay visible (FR-008/FR-010); large facets collapse
  behind "Show more" (FR-011).
- **New hot-path read** `GET /v1/storefront/facets` — a **bounded, concurrent** fan-out (029's pattern,
  `-race` clean): category + brand + price + one aggregate per facetable attribute, over a shared
  `filters()` builder so the grid and the counts can never disagree. The grid pages independently via
  `/products`; paging never recomputes facets.
- **Multi-value search**: `/products` `attr.<key>` now keeps every repeated value and gains repeated
  `brand`; the shared contract changed (`attributes: Record<string,string[]>`, new `brands: string[]`,
  `FacetSetDTO` family), pinned by a Go↔Kotlin byte-identical wire-contract test.
- **Web UX**: persistent side panel at `lg+` (with its own independent scroll), an inline sheet below
  `lg`, removable chips per applied filter + "Clear all", an applied-count badge, and the full filter
  set encoded in the URL (shareable, back/forward, opens at page 1). The filter UI is **code-split**
  (`next/dynamic`) to keep `/search` under the 174 KB guest budget.
- **Mobile UX (written)**: domain `FacetSet`/`GetFacets`, repository `/facets` + multi-value `/products`,
  a Compose `FilterSheet` bottom sheet, `SearchViewModel` facet state + debounced facet refresh, and the
  filter chip + count badge on `SearchScreen`.
- **Excluded, with reason** (spec): rating/stars (no review data), seller/store (single-brand, hidden
  fulfilment), availability-at-address (delivery zones were withdrawn — the facet would filter nothing).

## Live status

- ✅ **Migration applied** — `20260811120000_search_facet_indexes` (partial brand index +
  attribute-value index). `make db-up ENV=dev` done.
- ✅ **core-api deployed** — image pushed, ECS rolled (task def `:4`). `/v1/storefront/facets` returns
  `200` with `{price, category, brand, allergens, dietary_labels, spice_level, storage}`.
- ✅ **customer-web deployed** — Amplify build from `dev`; filters live at `dev.effyshopping.com/search`.
- ✅ **CORS closed (040's open T048)** — `core_api_cors_origins` now allows `dev.effyshopping.com` (+
  www, + the reserved prod apex, + localhost). Verified: `access-control-allow-origin` header present,
  `vary: Origin`.

## ⚠ Two defects found AFTER deploy, both fixed and re-deployed

1. **`/facets` 503 — `GROUP BY` 42803.** The attribute-count query grouped by the SELECT **alias**
   (`GROUP BY value`) where the same expression also appears inside `coalesce(...)`; Postgres demands the
   expression. **It shipped because the facet tests faked the repository — the SQL never ran against a
   real Postgres**, the recurring 027/028/029/033 failure mode. Fixed to `GROUP BY <expr>`; **proven
   against the live dev DB** (old query errors 42803, fixed query returns real counts); and a new
   **container-backed test** `facets_repository_test.go` (testcontainers, `-short`-gated like
   `saveditems`) now exercises all three value shapes + brand/category/price/multi-value against real
   Postgres, so this class of bug fails a test next time.
2. **CORS 403 on the deployed origin** — the storefront's client-side fetches were blocked because
   `core_api_cors_origins` was localhost-only. Added the deployed origins to `dev.tfvars`; the apply
   rolled a new task def carrying them.

## Verified (machine)

- `go test ./internal/features/storefront/ -race` (incl. facets, multi-value search, wire-contract; the
  container test compiles and runs under `make core-test`/Docker) · `go vet` · `gofmt` clean.
- `pnpm --filter @effy/shared-types typecheck` · `pnpm --filter @effy/customer-web typecheck` ·
  **353 customer-web tests** · `pnpm build` · **bundle `/search` 173.9 KB / 174 KB**.
- Kotlin commerce contract regenerated (`FacetSetDTO` family; `count: Long`/WireInt).
- `make cm-guard` clean.
- Parity register updated — [docs/audiences/customer-capabilities.md](../../docs/audiences/customer-capabilities.md) §043.

## ⚠ Open — NOT done (12 tasks)

- **T020 / T025 / T028 / T029 (mobile) — the biggest gap: customer-mobile has NEVER been compiled this
  slice.** The Kotlin is written and `cm-guard`-clean but has not seen `:shared:testAndroidHostTest`,
  `:shared:iosSimulatorArm64Test`, `:androidApp:assembleDebug`, `make cm-contract-check`, or a device.
  A small compile fix is likely. US2 show-more, US3 chip row + round-trip persistence, and the shared
  empty/stale states are unbuilt on mobile.
- **T021 — Prometheus histograms deferred with rationale.** `/facets` and `/products` latency is already
  metered by the existing request-duration middleware histogram (labelled by route); a bespoke
  `storefront_facets_query_seconds` adds no new signal and would thread a dependency through three
  layers. Same reasoning as 035's deferred T126.
- **T022 — perf proof not run.** No `EXPLAIN (ANALYZE)` at ≥50k products (SC-002), no deep-page/keyset
  boundary check (SC-008). Dev has ~38 products, so the indexes are unexercised at scale.
- **T023 — count/sort-consistency test.** Web renders from the server-returned `sort`/`total` (correct
  behaviour), but the dedicated per-surface test is not written; carried with the e2e gap.
- **T030 — telemetry.** The four filter events are not emitted, and **PostHog has never been initialised
  on customer-web**, so `capture()` is a platform-wide no-op (SC not measurable). Mobile telemetry
  deferred, consistent with prior slices.
- **T032 — a11y pass not done.** Keyboard/screen-reader for panel/counts/chips (web) and Compose
  semantics + 48 dp targets (mobile) unverified (SC-009).
- **T034 — full sweep is partial.** Backend + web ran clean here; the mobile Gradle half did not run.
- **T035 — SC walk.** The quickstart validation walk (usability SC-006, device walks) is unrun.

## Recommended next step

Run the mobile toolchain (`./gradlew :shared:testAndroidHostTest :shared:iosSimulatorArm64Test
:androidApp:assembleDebug` + `make cm-contract-check`) and hand back any errors — that closes the
largest open risk and unblocks the mobile US2/US3 polish. Then T022 (perf at scale) and T032 (a11y).

Spec/artifacts: [specs/043-customer-search-filters/](.).

# Quickstart / Validation Guide: Customer Advanced Search Filters

Runnable checks that prove the feature end-to-end. Implementation code lives in `tasks.md` / the
sources; this guide is the validation walk. Assumes a seeded dev catalogue with ≥ 2 brands and at least
one `single_select`/`multi_select`/`boolean` attribute with values on products.

## Prerequisites

- `core-api` running locally (`make core-run`) against dev RDS, with the index migration applied.
- `apps/customer-web` dev server (`pnpm --filter @effy/customer-web dev`).
- `apps/customer-mobile` on an emulator/simulator (Android + iOS).
- The index migration committed, then `make db-up ENV=dev` (003 commit-guard).

## 1. Backend contract & counts

```bash
# Facets for a bare store
curl -s "$CORE/v1/storefront/facets" | jq '.facets[].key'
# Facets narrowed by one brand — sibling brands still have counts (OR-within rule)
curl -s "$CORE/v1/storefront/facets?brand=Acme" | jq '.facets[] | select(.key=="brand")'
# Multi-value products query — union of two brands
curl -s "$CORE/v1/storefront/products?brand=Acme&brand=Beta&limit=5" | jq '.total'
# Intersection — brand AND a dietary attribute
curl -s "$CORE/v1/storefront/products?brand=Acme&attr.diet=vegan&limit=5" | jq '.total'
```

Expected: facet options carry `count`s; ticking a brand does not zero the other brands' counts;
two-brand `total` ≥ each single-brand `total`; brand+diet `total` ≤ brand-only `total`. Zero-count
options are absent (FR-009). Invalid `minPrice=abc` → `400 invalid_price`.

## 2. Count correctness & performance (SC-002, SC-008)

- `go test ./internal/features/storefront/...` — facet count tests (per-option counts equal an
  independent count; own-selection-excluded rule).
- On a ≥ 50k-product set, `EXPLAIN (ANALYZE, BUFFERS)` the brand and attribute-value aggregate queries;
  confirm `product_active_brand_idx` and `product_attribute_value_def_product_idx` are used (no seq
  scan on `product`), and end-to-end `/facets` p95 < 1 s. Confirm `/products` paging to page 20 shows
  no slowdown vs page 1 and no repeated/skipped ids (keyset).
- Confirm the facet fan-out runs **concurrently** (`-race` clean) and issues a **bounded** query count.

## 3. Web `/search` (US1–US4)

- `lg+`: side panel shows Brand / Dietary / etc. with counts; select two brands + a dietary + price →
  grid narrows to the intersection; each selection appears as a removable chip; "Clear all" resets.
- Below `lg`: a filter button (with an applied-count badge) opens the **drawer** with the same facets
  and an Apply/Clear; results update on apply.
- Copy the URL with filters applied, reopen → identical result set from page 1 (FR-015). Browser back
  steps through filter states.
- Rapidly toggle several boxes → **one** result refresh for the settled state (FR-025/SC-007; watch the
  network panel).
- Empty state: over-narrow filters → explained empty state offering remove-last / clear-all (FR-022).
- Bundle gate: `pnpm --filter @effy/customer-web size` → `/search` **≤ 174 KB** (filter UI code-split).

## 4. Mobile `/search` (US1–US4, parity)

- Tap the filter icon in the results header → **bottom sheet** with all facets + counts, Apply/Clear.
- Apply a brand + dietary + price → grid narrows; chips reflect the applied set; Clear all resets.
- Filter-count badge on the filter icon reflects applied count (FR-014).
- Open a product and return → filters persist (FR-016).
- `48 dp` touch targets on all sheet controls; screen-reader announces the result-count change (FR-045
  pattern) and facet changes (SC-009).
- `./gradlew :shared:testAndroidHostTest` and `:shared:iosSimulatorArm64Test` green; `assembleDebug`.

## 5. Cross-language contract

- `go test` wire-contract + the Kotlin `...WireContractTest.kt` share a byte-identical `FacetSetDTO`
  literal and the multi-value param encoding — break one side to confirm the test fails (028 pattern).

## 6. Parity & telemetry

- `docs/audiences/customer-capabilities.md` §043 records the facet set + controls at parity across
  web and mobile (FR-021 / SC-004).
- Telemetry events fire on the shared `capture()` path (web) — note they are inert until PostHog is
  initialised on customer-web (declared gap). Mobile telemetry deferred.

## Definition of done (maps to Success Criteria)

- SC-001 five facet types combine on both surfaces · SC-002 p95 < 1 s at 50k · SC-003 every option
  counted, no zero-result option offered · SC-004 parity register · SC-005 chips + clear-all + shareable
  web URL · SC-006 usability (moderated, operator) · SC-007 single refresh on settle · SC-008 deep-page
  no slowdown · SC-009 a11y + touch targets.

# Phase 0 Research: Customer Advanced Search Filters

All decisions below resolve the Technical Context. No open NEEDS CLARIFICATION remain.

## R1 — Which filters (reference-platform survey)

**Decision**: category, brand, price range, on-sale/offers, and catalogue-driven product
characteristics (single/multi-select + boolean attributes). Exclude ratings (no data) and
seller/store (single-brand). Exclude availability-at-address (see R2).

**Rationale**: Surveying Amazon, eBay, Walmart, and the grocery/food references (Uber Eats,
foodpanda), the near-universal, Effy-applicable facets are price, brand, category, deals, and
"item-specifics"-style attributes (eBay's model, which the catalogue already implements as EAV
attribute definitions). Grocery apps lean heavily on dietary/characteristic filters, which our
`single_select`/`multi_select`/`boolean` attributes cover.

**Alternatives considered**: star-rating filter (no rating/review subsystem exists — excluded);
seller filter (contradicts hidden-fulfillment single-brand model — excluded); shipping-speed/Prime
(not modelled — deferred).

**Sources**: [Faceted filtering UX (LogRocket)](https://blog.logrocket.com/ux-design/faceted-filtering-better-ecommerce-experiences/),
[Faceted search best practices (fact-finder)](https://www.fact-finder.com/blog/faceted-search/),
[Faceted search guide (Prefixbox)](https://www.prefixbox.com/blog/faceted-filtering/).

## R2 — Availability-at-address facet is infeasible (spec reconciliation)

**Decision**: Do **not** build an availability/deliverable facet. Reconciled by amending the spec
(FR-005) rather than coding around it.

**Rationale**: `saveditems/repository.go` and `service.go` record that **delivery zones were withdrawn
from the platform** — "every address is implicitly deliverable", and purchasability is decided by
catalogue `status` alone. Search already returns only `status='active'` products, so an availability
facet would filter nothing. Building it would create a control that appears to do something and does
not — worse than omitting it. Constitution Principle I requires fixing this at the spec, which was
done during planning.

**Alternatives considered**: an "in stock only" toggle (redundant — the only shown status is active);
resurrecting zone logic (out of scope, no data model for it now).

## R3 — Facet-count computation strategy

**Decision**: A dedicated **`GET /v1/storefront/facets`** read that returns, for the current query +
applied filters, each facet with its options and per-option product counts. Counts are computed with a
**bounded set of raw-SQL aggregate queries** (one per facet group: brand, each active facetable
attribute, plus a small count for the offers toggle and category rollup), **fanned out concurrently**
(029's two-wave goroutine pattern) over a shared decoded filter set. The **product grid** stays on the
existing `/v1/storefront/products` read; **paging never recomputes facets**.

**Rationale**:
- Correctness of OR-within-facet counts requires the classic faceted rule: a facet's own option counts
  are computed with **all other filters applied but that facet's own selection excluded**. Separate
  per-facet aggregates make this natural; a single global GROUP BY cannot express it.
- 50k active products is comfortably inside PostgreSQL's reach for GROUP BY with the right indexes; a
  search engine (Elasticsearch/ParadeDB) would violate the locked PostgreSQL/no-new-infra standard for
  no measured need.
- Sydney RDS is ~135 ms/round-trip and 029 showed serial reads blow the budget; hence **concurrent**
  fan-out with a hard cap on the number of facets counted per request (brand + up to the active
  facetable attributes; if that set is large, cap and mark the rest behind "Show more" without counts).
- Separating grid from facets means the common interaction (scroll to load more) is a single cheap
  keyset page, and facets are recomputed only when the filter set actually changes.

**Alternatives considered**: one monster CTE with `FILTER (WHERE …)` aggregates (hard to read, brittle,
often worse plans — 083's readability/`filters()`-drift risk); `ts_stat`/materialized facet tables
(premature for this scale, adds a maintenance surface); computing counts inline on every `/products`
page (wasteful on every scroll).

**Sources**: [Faceted search in a single Postgres query (Korotkov)](https://akorotkov.github.io/blog/2016/06/17/faceted-search/),
[Faceting in Postgres (ParadeDB)](https://www.paradedb.com/blog/faceting),
[Fascinating faceting with Postgres (McNee)](https://jamesmcnee.co.uk/blog/posts/2024/may/05/fascinating-faceting-with-postgres/).

## R4 — Multi-value facets & the wire contract

**Decision**: Change `attributes` from `Record<string,string>` to `Record<string,string[]>` and add
`brands: string[]`. Wire form uses **repeated query params**: `brand=Acme&brand=Beta` and
`attr.diet=vegan&attr.diet=gluten_free`. OR within a facet (`= ANY(...)`), AND across facets. Pin the
shape with a Go↔Kotlin **wire-contract test**.

**Rationale**: FR-003 requires OR-within/AND-across. The existing handler already reads the full
`URL.Query()` multimap and merely takes `vals[0]`; taking all values is a minimal, backward-tolerant
change (a single value still works). Repeated params are the SEO-safe, cache-friendly encoding the
codebase already prefers (facets are query params, never path segments — storefront.ts note). 027/028
proved that fakes speaking Kotlin at both ends miss serialization drift, so the multi-value shape is
pinned with a byte-identical shared literal test.

**Alternatives considered**: comma-joined values (`brand=Acme,Beta` — ambiguous when values contain
commas); JSON body (search is a GET, must stay cacheable/bookmarkable).

## R5 — Which attributes are "filterable"

**Decision**: Derive filterability: `attribute_definition` rows with
`data_type IN ('single_select','multi_select','boolean')` and `status='active'` become characteristic
facets. `number`/text attributes are **not** faceted in the first slice. No new schema flag.

**Rationale**: Keeps the feature catalogue-driven (FR-002) with zero back-office work; select/boolean
attributes have a bounded option set (`attribute_allowed_value` / true|false) that maps directly to
checkbox facets with counts. Numeric range facets per attribute are heavier UX and rarer in grocery;
deferring them avoids scope creep into 016's back-office. If per-attribute control is later wanted, an
`is_filterable` column is an additive migration.

**Alternatives considered**: a back-office `is_filterable` flag now (expands 016 scope, needs UI);
faceting every attribute including free text (unbounded option lists, no useful counts).

## R6 — Presentation per device

**Decision**: Mobile → Compose `ModalBottomSheet` opened from a filter icon in the results header
(the app already uses `ModalBottomSheet` in `AddressFormSheet`/`CheckoutScreen`). Web below `lg` →
`@effy/design-system/ui` `drawer` (already vendored), same facet content; web `lg+` → keep the
persistent left side panel (already present), upgraded with the new facets. All three render one shared
facet model; parity is structural (FR-021).

**Rationale**: Reuses primitives already in the repo (no new deps), matches the user's requested
patterns, and keeps one facet model behind three presentations. Monochrome/list-based controls satisfy
Principle V (no cards). Dialog (instead of drawer) on small web was considered and rejected: a drawer
matches the mobile bottom sheet for cross-surface consistency and is the modern e-commerce norm.

## R7 — Web bundle budget

**Decision**: Code-split the filter UI. `FilterDrawer` and the heavier `FilterPanel` internals load
via `next/dynamic` on demand (open below `lg`); the always-present `lg+` side panel uses the lightest
controls (native inputs / already-loaded primitives). The 174 KB `size` gate is **not** raised; the
`bundle-budget.mjs` gate must stay green with `/search` ≤ 174 KB.

**Rationale**: `/search` is the one route that is fully client-side and already sits ~173.9 KB against
174 KB (025/033 records). Adding checkbox lists + drawer statically would breach it. Dynamic import
keeps the filter chrome out of the always-loaded guest chunk. Standing platform rule: measure, never
raise the budget (025 FR-007, 033).

**Alternatives considered**: raising the budget (prohibited by standing rule); moving `/search` to
server components (large rewrite of a working client-fetch page, out of scope for this slice).

## R8 — Empty states, stale options, price validation

**Decision**: Reuse the existing explained empty state (`ResultState` / `EffyEmptyState`) with
filter-aware copy and a "remove the last filter / clear all" affordance (FR-022). Stale options resolve
to a normal (possibly empty-but-explained) result set, never an error (FR-023) — facet options are
advisory; the authoritative filter is re-evaluated by `/products` on apply. Price min>max is corrected
client-side before the request (FR-004).

**Rationale**: These patterns already exist on both surfaces from 025/028; this slice extends copy and
wiring rather than inventing new states.

# Feature Specification: Customer Advanced Search Filters

**Feature Branch**: `043-customer-search-filters`

**Created**: 2026-08-11

**Status**: Draft

**Input**: User description: "In the customer mobile app and web app we need to have good search filters. Both apps have a /search page; the web app has a simple filter. We want an advanced filter section in both apps, supporting multiple types of filters. Research major e-commerce sites (eBay, Walmart, Amazon) to identify their filters, decide which to implement here, then implement in both web and mobile. Backend must be very optimized and fast; research search/filter best practices. On mobile, use a bottom sheet opened from a filter icon holding all filters; on web small screens use a drawer like mobile, and on large screens use a left column (as now) or dialogs — design the best professional, easy-to-use experience."

## Overview

Today a shopper can search the Effy catalogue and refine it only by **price range** and an **on-sale** toggle, with a **sort** control and a **result count**. That is a fraction of what a shopper on Amazon, eBay, Walmart, or a grocery app like Uber Eats expects. This feature turns the `/search` experience on both customer surfaces (web and mobile) into a proper **faceted filtering** experience: a shopper can narrow a large result set by several attributes at once — category, brand, price, offers, and product characteristics (e.g. dietary or size attributes the catalogue already captures) — and always understands how many results each choice will yield before committing to it.

The filter set is presented in a way that fits each device: a **bottom sheet** on mobile (opened from a filter icon), a **drawer** on small web screens, and a **persistent side panel** on large web screens.

### Reference-platform research (why these filters)

Surveying the major marketplaces (Amazon, eBay, Walmart) and the grocery/food references named in the constitution (Uber Eats, foodpanda), the filter facets that appear near-universally and are meaningful for Effy's single-brand grocery + e-commerce model are:

| Facet | Seen on | Applicable to Effy? | Decision |
|---|---|---|---|
| Category / department | All | Yes — the catalogue has a hierarchical taxonomy | **Include** |
| Price range | All | Yes | **Include** (upgrade the existing control) |
| Brand | Amazon, eBay, Walmart | Yes — brand is a first-class product field | **Include** |
| Deals / on sale | All | Yes — products carry a compare-at price | **Include** (keep existing toggle) |
| Product characteristics / "item specifics" (e.g. dietary, size, weight, flavour) | eBay item-specifics, Amazon dept. filters, grocery dietary tags | Yes — the catalogue captures configurable attributes per product type | **Include** (dynamic, catalogue-driven) |
| Availability / "deliverable to me" / in stock | Amazon, Walmart (in-store/pickup), Uber Eats (open now) | **No** — delivery zones were withdrawn from the platform; every address is implicitly deliverable, and search already shows only purchasable (`active`) products | **Exclude** (would be a no-op; see Assumptions) |
| Customer rating (stars) | Amazon, eBay, Walmart | **No rating/review data exists on the platform** | **Exclude** (out of scope; see Assumptions) |
| Seller / store | eBay, Amazon marketplace | No — Effy is single-brand; shops are hidden | **Exclude** (contradicts the product model) |
| Shipping speed / Prime | Amazon | Not modelled yet | **Exclude** (deferred) |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Narrow results with an advanced filter panel (Priority: P1)

A shopper searches or browses into a large result set and wants to cut it down. They open an advanced filter panel — a bottom sheet on mobile (from a filter icon in the results header), a drawer on a small web screen, or the side panel on a large web screen — choose several refinements at once (for example: a category, one or more brands, a price range, an on-sale toggle, and a product characteristic such as "gluten-free"), apply them, and see the results narrow to only products matching **all** chosen facets. Selecting more than one option **within** a facet (e.g. two brands) widens that facet to match **either** option.

**Why this priority**: This is the core of the feature and the MVP. Without a way to apply multiple filter types together, none of the rest matters. It is independently valuable: even with no counts or fancy chips, a shopper who can filter by brand + category + price + characteristic has a dramatically better experience than the price-and-sale-only refinement they have today.

**Independent Test**: On each surface, open the filter panel, apply a combination of category + brand + price + one characteristic, apply, and confirm the result set contains only products matching every chosen facet (and any option within a multi-select facet). Confirm the same combination is expressible on both web and mobile.

**Acceptance Scenarios**:

1. **Given** a shopper on the search results page with many results, **When** they open the filter panel and select a category and two brands and apply, **Then** the results show only products in that category whose brand is one of the two selected.
2. **Given** an open filter panel, **When** the shopper sets a minimum and maximum price and toggles "On sale", **Then** applying shows only on-sale products within that price band.
3. **Given** a product characteristic captured by the catalogue (e.g. "Dietary: Vegan"), **When** the shopper selects it and applies, **Then** only products carrying that characteristic remain.
4. **Given** the mobile results header, **When** the shopper taps the filter icon, **Then** a bottom sheet opens containing all available filters; **When** they tap "Apply", **Then** the sheet closes and results update.
5. **Given** a small web screen, **When** the shopper taps the filter control, **Then** a drawer opens with the same filters as the mobile bottom sheet; **Given** a large web screen, **Then** the filters are visible in a persistent side panel without opening anything.
6. **Given** any filter panel, **When** the shopper chooses filters, **Then** the number of filters currently applied is visible on the trigger control (e.g. a count badge on the filter icon/button).

---

### User Story 2 - Understand each choice before making it (facet counts & dynamic facets) (Priority: P2)

As a shopper considers a filter option, they see **how many products** that option would leave in the current result set, and options that would leave **zero** results are hidden or shown as unavailable. The set of facets and options offered adapts to the current query and already-applied filters, so a shopper is never led into an empty result set.

**Why this priority**: Result counts and dynamic facets are the single biggest UX differentiator of good faceted search (per the reference research) and prevent the "dead-end zero results" frustration. It builds on US1 but is separable — US1 can ship first with a static filter list, and counts layered on after.

**Independent Test**: With a known catalogue, open the panel and confirm each option displays a count that matches the number of results applying it would yield, that a zero-result option is not offered as a live choice, and that after applying one filter the remaining options' counts update to reflect the narrowed set.

**Acceptance Scenarios**:

1. **Given** an open filter panel, **When** it renders, **Then** each option shows the count of matching products in the current result set.
2. **Given** a facet option that would yield zero results given the current query and filters, **When** the panel renders, **Then** that option is hidden or clearly marked as unavailable and cannot lead to an empty page.
3. **Given** a shopper who applies one filter, **When** the panel re-renders, **Then** the counts on the remaining options update to reflect the now-narrower set.
4. **Given** a facet with many options (e.g. brand), **When** the panel renders, **Then** the most relevant options are shown first and the rest are behind a "Show more" affordance.

---

### User Story 3 - See, remove, and share active filters (Priority: P2)

Every applied filter is shown as an individually removable chip in the results area, alongside a single "Clear all" action. On the web, the active filter set is reflected in the page address so a refined search can be bookmarked, shared, and restored with the browser back/forward buttons. On mobile, the applied set survives navigating to a product and back.

**Why this priority**: Transparency and reversibility of applied filters is expected behaviour and low-risk; the web already has removable chips and address-based state for the two filters it supports, so this extends an existing pattern to the new facets.

**Independent Test**: Apply several filters, confirm each appears as a removable chip and removing one updates results without touching the others, confirm "Clear all" resets to the unfiltered set, confirm (web) the address encodes the filters and the back button restores the prior set, and confirm (mobile) the set persists across a product detail round-trip.

**Acceptance Scenarios**:

1. **Given** applied filters, **When** the results render, **Then** each filter appears as a chip that can be individually removed, and removing one leaves the others intact.
2. **Given** applied filters, **When** the shopper selects "Clear all", **Then** all filters are removed and the full unfiltered result set returns.
3. **Given** a refined search on the web, **When** the shopper copies the page address and reopens it, **Then** the same filters are applied and the same result set appears (opening at the first page).
4. **Given** a refined search, **When** the shopper opens a product and returns, **Then** their filters are still applied.

---

### User Story 4 - Fast, responsive refinement (Priority: P1)

Applying or changing a filter updates the results quickly and without a jarring reload, and the result count and applied ordering always describe the list actually shown. Rapid consecutive changes (e.g. dragging a price slider, ticking several boxes) do not fire a storm of redundant work.

**Why this priority**: The user explicitly requires a very optimized, fast response. A filter experience that lags on a large catalogue is worse than no advanced filters; responsiveness is a first-class acceptance concern, not polish. It is coupled to US1 (it constrains how US1 is built) so it is P1.

**Independent Test**: On a catalogue at target scale, measure the time from applying a filter to updated results, confirm it meets the success-criteria threshold, and confirm that quickly changing several controls before applying results in a single result refresh rather than one per keystroke/tick.

**Acceptance Scenarios**:

1. **Given** a catalogue at target scale, **When** a shopper applies a filter, **Then** updated results and counts appear within the success-criteria time budget.
2. **Given** a shopper rapidly adjusting several controls, **When** they settle, **Then** the results refresh once for the settled state, not once per intermediate change.
3. **Given** any applied filter set and ordering, **When** results render, **Then** the displayed result count and the "sorted by" label match the list shown.

---

### Edge Cases

- **No results after filtering**: the page shows a clear empty state that names the likely cause ("your filters may be too narrow") and offers to remove the last filter or clear all — never a blank grid.
- **A filter option becomes stale**: an option that was available when the panel opened but is exhausted or removed from the catalogue by the time it is applied must resolve to a valid (possibly empty-but-explained) state, never an error.
- **Conflicting price bounds**: a minimum greater than the maximum is prevented or corrected rather than returning a confusing empty set.
- **Very large facets**: a facet with hundreds of options (e.g. brand) must remain usable — the panel must not attempt to render every option at once.
- **Filters combined with a text query and a sort**: filters, the free-text query, and the chosen ordering all compose; changing the ordering must not drop the filters, and vice versa.
- **Deep-linked/shared filter that no longer matches anything**: opening a shared refined address whose result set is now empty shows the explained empty state, not an error.
- **Accessibility**: the filter panel, counts, and applied-filter changes are operable and announced for keyboard and screen-reader users on both surfaces; touch targets on mobile meet the platform minimum.

## Requirements *(mandatory)*

### Functional Requirements

**Filter set & semantics**

- **FR-001**: The search results experience MUST offer, on both the customer web and customer mobile surfaces, an advanced filter panel exposing the following facets: **category**, **brand**, **price range**, **on-sale/offers**, and **product characteristics** captured by the catalogue's configurable attributes.
- **FR-002**: The product-characteristic facets MUST be **driven by the catalogue's attribute data**, not a hard-coded list, so that adding or retiring a filterable attribute in the back office changes the available filters without a code change.
- **FR-003**: Selecting multiple options **within** a single multi-value facet (e.g. two brands) MUST match products satisfying **any** of those options (logical OR within a facet); combining options **across** different facets MUST match products satisfying **all** facets (logical AND across facets).
- **FR-004**: The price facet MUST let a shopper set a minimum, a maximum, or both, and MUST prevent or correct an invalid range (minimum greater than maximum).
- **FR-005**: Search results MUST continue to include only purchasable (active) products; the system MUST NOT offer a separate "availability at my address" facet, because delivery zones were withdrawn from the platform (every address is implicitly deliverable) and such a facet would be a no-op. (Reconciled during planning; see Assumptions.)
- **FR-006**: The system MUST NOT expose a filter for any facet the platform has no data for (in particular customer ratings/reviews) or that contradicts the single-brand hidden-fulfillment model (seller/store).
- **FR-007**: Filters MUST compose with the free-text query and with the chosen ordering; changing any one of the three MUST preserve the other two.

**Facet counts & dynamic facets**

- **FR-008**: For each filter option, the panel MUST display the number of products that option would yield within the current result set (given the active query and other applied filters).
- **FR-009**: An option that would yield zero results in the current context MUST be hidden or shown as unavailable, so that no offered option leads to an empty result set.
- **FR-010**: When a filter is applied or removed, the counts and available options for the other facets MUST update to reflect the new result set.
- **FR-011**: A facet with more options than can be comfortably shown MUST reveal its most relevant options first and place the remainder behind a progressive-disclosure ("Show more") affordance.

**Applied-filter transparency & state**

- **FR-012**: Each applied filter MUST be shown as an individually removable chip in the results area, and removing one MUST leave all other applied filters unchanged.
- **FR-013**: The system MUST provide a single action to clear all applied filters at once.
- **FR-014**: The control that opens the filter panel MUST indicate how many filters are currently applied.
- **FR-015**: On the web surface, the active filter set MUST be encoded in the page address so a refined search can be bookmarked, shared, and restored, and the browser back/forward navigation MUST move between filter states; a shared refined address MUST open at the first page of results.
- **FR-016**: On the mobile surface, the applied filter set MUST persist across navigating to a product detail and back within the same session.
- **FR-017**: The results header MUST always show a total result count and the ordering actually applied, and both MUST describe the list actually shown (never a count or ordering that disagrees with the results).

**Presentation per device**

- **FR-018**: On mobile, the filters MUST be presented in a **bottom sheet** opened from a filter icon/button in the results header, containing all available facets, with explicit "Apply" and "Clear all" actions.
- **FR-019**: On small web screens, the filters MUST be presented in a **drawer** consistent with the mobile bottom-sheet experience; on large web screens, the filters MUST be presented in a **persistent side panel** (the current left-column pattern) without requiring the shopper to open anything.
- **FR-020**: The filter presentation MUST follow the platform's monochrome design language and layout doctrine (no new brand colour; no card-style containers where a list/section is the better pattern) and MUST feel native on mobile (fat-finger touch targets, appropriate motion).
- **FR-021**: The advanced filter experience MUST be at **parity** between the customer web and customer mobile surfaces — the same facets, semantics, counts behaviour, and applied-filter controls on both, adapted to each device's presentation.

**Empty & error states**

- **FR-022**: When an applied filter set yields no results, the system MUST show an explained empty state that names the likely cause and offers to remove the last filter or clear all, rather than a blank result area.
- **FR-023**: A filter option that becomes stale between the panel opening and being applied MUST resolve to a valid state (an updated or explained-empty result set), never a user-facing error.

**Performance & responsiveness**

- **FR-024**: Applying or changing a filter MUST update the results and counts within the time budget defined in Success Criteria, at the target catalogue scale.
- **FR-025**: Rapid consecutive filter changes MUST be coalesced so that the system does the work for the settled state rather than for every intermediate change.
- **FR-026**: Result retrieval under filtering MUST remain stable and performant as the catalogue grows and as shoppers page through a long filtered result set (no degradation from paging deep into results).

### Key Entities *(include if feature involves data)*

- **Filterable facet**: a dimension a shopper can refine by — category, brand, price, offers, or a catalogue-configured product characteristic. Each facet has a type that determines its control (single choice, multiple choice, numeric range, or toggle) and, where applicable, a set of options.
- **Facet option**: a selectable value within a facet (a specific brand, a specific characteristic value, a category), carrying a **result count** for the current context and an availability state.
- **Applied filter set**: the collection of a shopper's current selections across facets, plus the free-text query and ordering, which together define the current result set and are reflected in chips and (on web) the page address.
- **Product characteristic (catalogue attribute)**: a back-office-defined, per-product-type attribute (single-select, multi-select, numeric, or boolean) whose values on products make it a filterable facet; the source of the dynamic characteristic filters.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A shopper can narrow a result set by at least **five distinct facet types simultaneously** (category, brand, price, offers, a product characteristic) on both web and mobile, and the returned set matches all applied facets.
- **SC-002**: For a filtered search at target catalogue scale (at least **50,000 active products**), updated results and facet counts appear within **1 second for 95%** of filter changes, and within **2 seconds for 99%**.
- **SC-003**: Every filter option shown displays a result count, and **no offered option leads to a zero-result page** (verified by attempting each live option in a representative catalogue).
- **SC-004**: The same facets, semantics, and applied-filter controls are available on both surfaces (parity verified against the shared capability register).
- **SC-005**: A shopper can identify and individually remove any applied filter, and clear all filters in one action, on both surfaces; on web, a shared refined address reproduces the identical result set.
- **SC-006**: In moderated usability testing, at least **90% of shoppers** successfully apply an intended multi-facet refinement (e.g. "gluten-free products from brand X under $10") without assistance on their first attempt.
- **SC-007**: Rapidly adjusting several controls before settling produces a **single** result refresh for the settled state (verified by observing the number of result retrievals triggered).
- **SC-008**: Paging through a long filtered result set (e.g. to the 20th page) shows no measurable slowdown versus the first page, and never skips or repeats a product at a page boundary.
- **SC-009**: The filter panel, its counts, and applied-filter changes are fully operable and announced for keyboard and screen-reader users, and all mobile filter controls meet the platform's minimum touch-target size.

## Assumptions

- **Ratings/reviews filter is out of scope**: the platform captures no customer rating or review data, so a star-rating facet (common on Amazon/eBay/Walmart) is deliberately excluded until such data exists.
- **Seller/store filter is out of scope**: Effy is single-brand with hidden fulfillment, so a seller/store facet is intentionally excluded as it contradicts the product model.
- **Filters operate over the existing catalogue data model**: category taxonomy, first-class brand, sale/compare-at pricing, and configurable per-product-type attributes already exist and are the source of the facets; no new catalogue authoring capability is introduced by this feature.
- **The advanced filters extend the existing `/search` experience** on both customer surfaces (which already supports free-text query, price range, on-sale toggle, sort, result count, and infinite-scroll paging) rather than replacing it.
- **No address/availability facet**: delivery zones were withdrawn from the platform, so product availability is decided by catalogue status alone and every address is implicitly deliverable. Search already returns only purchasable products, so an availability facet would filter nothing. It is deliberately excluded (see FR-005) and can be revisited if delivery zones ever return.
- **Target catalogue scale for performance targets is at least 50,000 active products**; if the near-term catalogue is far smaller, the targets remain the design ceiling.
- **Backend serves the customer read path via the platform's latency-sensitive (hot) read path**, consistent with how the existing search/browse read is served; the specific optimization technique (e.g. how facet counts are computed) is a planning/implementation concern, not fixed here.
- **Guests can use filters**: filtering does not require sign-in, consistent with the guest-first customer experience; every facet is usable without an account.
- **Analytics/telemetry for filter usage** may be specified but, consistent with recent customer-web slices, is not assumed to be wired unless the plan explicitly addresses the outstanding customer-web analytics initialization.

## Dependencies

- The existing customer search/browse read path and its `/search` pages on customer web and customer mobile.
- The existing product catalogue: category taxonomy, brand field, sale pricing, and the configurable attribute library and per-product attribute values.
- The shared customer capability parity register, which must record this capability across both surfaces.

# Contract: Home Page Section Composition (039)

The home page (`app/(shop)/page.tsx`) is a fixed top-to-bottom sequence. Each section is a server
component that **self-hides on empty data** and depends only on already-served storefront reads. This
contract pins the order, data source, and reuse decision per section so the section-by-section build and
review stay unambiguous.

| # | Section              | Component (new/reuse)         | Data source                                   | Hides when            | Client JS |
|---|----------------------|-------------------------------|-----------------------------------------------|-----------------------|-----------|
| 0 | H1 (sr-only) + Hero  | `Hero` (rewrite) + `ValueStrip` (new) | static + `public/hero/` asset          | never (placeholder)   | none      |
| 1 | Category strip       | `CategoryStrip` (new)         | `GET /v1/storefront/categories` (**cap: 12**) | no stocked categories | none      |
| 2 | On-sale rail         | `ProductRail` (reuse)         | `home.rails[key="on_sale"]`                   | no on-sale products   | none¹     |
| 3 | Offers panels (A)    | `OffersPanels` (new)          | `home.banners` where `placement === "inline"` | no advertised offers  | none      |
| 4 | Featured rail        | `ProductRail` (reuse)         | `home.rails[key="featured"]`                  | no featured products  | none¹     |
| 5 | Category rails       | `ProductRail` (reuse) ×N      | `home.rails[key^="category:"]`                | none present          | none¹     |
| 6 | Offers panels (B)    | `OffersPanels` (new)          | remaining offers not shown in (A)             | fewer than 1 left     | none      |
| 7 | App promo            | `AppPromo` + `StoreBadges` (new) | static (badges disabled, no URLs)          | never                 | none      |
| 8 | Another rail         | `ProductRail` (reuse)         | next unused rail (e.g. a second category)     | none left             | none¹     |
| 9 | Newsletter           | `NewsletterForm` (new)        | Server Action → newsletter API                | never                 | none²     |
|10 | Recently-viewed      | `RecentlyViewedRail` (reuse)  | device-local                                  | nothing viewed        | existing  |

¹ The rail itself is server-rendered; the per-tile **save control** is the existing client island already
counted in today's `/` bundle — the redesign adds no new client island to rails.
² Zero-JS by design (Server Action + plain `<form>`, research R3).

**Interleave rule**: the merchandised rails (2, 4, 5, 8) and offer blocks (3, 6) are interleaved so the page
reads as a long merchandised landing (FR-001), but the exact rail↔offer ordering degrades gracefully — any
missing section collapses and its neighbours close up. **No section renders an empty frame** (FR-004).

**Streaming/PPR**: sections **1–6 and 8** depend on request-time storefront reads and stream inside the
existing `<Suspense>` hole with the current skeleton; the hero (0), **app promo (7)** and newsletter (9)
depend on no request-time data and are in the **static shell** (present in raw HTML for crawlers, FR-040).
⚠ The first draft of this line said "sections 1–8", which contradicted the very next clause by putting the
app promo in both. Row 7 is static. The whole data-dependent block degrades to one
friendly "couldn't load the store" / "shelves being stocked" state (FR-016), never a wall of empties.

**Budget**: net added client JS across the whole redesign MUST be ~0 KB; `/` stays ≤ 174 KB (SC-007). Any
new interactivity uses Server Actions, never a new static client dependency.
⚠ **Measured headroom is 2.3 KB, not 3.5** — `/` baselines at **171.7 KB** (quickstart § Baseline, T001),
correcting plan.md § Summary.

**⚠ The banner placement vocabulary is `"carousel" | "inline"` — there is NO `"offers"` value.**
`BannerPlacement` is declared once in `packages/shared-types/src/banner.ts:50`. The first draft of this
contract named an `offers` placement that does not exist; the second placement 029 created for the
dedicated offers block is **`inline`**. Row 3/6 filter on `inline`, row "PromoCarousel" keeps `carousel`,
and 029 FR-027's exclusivity (never both) is what makes the split safe. Live seed: 4 carousel, 2 inline.

# Customer web — speed, caching and reliability backlog

Review date: 2026-10-12 · Branch reviewed: `cw-redesign` (after 084) · Scope: `apps/customer-web` and the
`storefront` service it reads from.

This is a task backlog from a read-only review. Nothing here has been changed yet.

## Summary

The app's structure is sound: a static shell, streamed islands, heavy SDKs kept off guest pages. Two
things account for most of the available speed:

1. **Images defeat every cache** — presigned URLs that change per request, original bytes, no CDN.
2. **Nothing public is cached between requests** — categories, home, product and listings are read
   live on every page view, by design (054 FR-015a).

Separately, **the guest bundle budget is failing**, which blocks the next Amplify deploy.

### What is already good (keep it)

- `cacheComponents` is on; every page streams its data inside `<Suspense>`; nothing reads cookies above a boundary.
- Amplify is confined to `(auth)`; PostHog, Stripe, Motion and the filter panel load on demand.
- One verified session read per request; signing keys cached for the life of the process.
- Fonts are self-hosted (no third-party request).
- Chrome islands degrade instead of taking the page down; a failed cart refresh never empties the cart.

### Priority key

| Priority | Meaning |
|---|---|
| P0 | Blocks a deploy |
| P1 | Large, shopper-visible speed gain |
| P2 | Worth doing; smaller or conditional gain |
| P3 | Hygiene / follow-up |

Tasks marked **spec** change an earlier feature's requirement or add infrastructure, so they go through
`/specify` → `/plan` → `/tasks` rather than being edited in directly.

---

## P0 — Bundle budget

### PERF-01 · Bring guest routes back under the 174 KB budget

- **Found:** `scripts/bundle-budget.mjs` run against the production build of 2026-10-12 20:38 fails on
  every guest route: `/` 182.3 KB, `/search` 184.7, `/cart` 184.8, `/product/[id]` 180.2, `/help` 181.3,
  `/legal/*` 176.7. Even the static legal pages are over, so the **shared chunk** grew — most likely
  chrome client components added in the redesign (All aisles menu, carousels, phone menu).
- **Caveat:** that build predates commit `b9b7d584` (21:02), which moved Motion to on-demand loading
  (~2.9 KB). The current number was not re-measured.
- **Why it matters:** `amplify.yml` runs `size` after `build`; a failure keeps the last good version live.
- **Done 2026-10-12** (Amplify job 137 failed on this gate; budget NOT raised). Fresh build, every
  guest route: `/` 171.6 KB, `/search` 173.2, `/cart` 171.2, `/product/[id]` 168.5, `/help` 169.9,
  `/offers` 165.5, `/delete-account` 165.9, `/legal/*` 164.0 — against 174.
- **What it was** (attributed with `next experimental-analyze -o`, not guessed):
  - [x] **`tailwind-merge`, 8.1 KB on every route.** `btnClass` merged a call site's override into the
        button's utilities, and client components import it. The button is now component-layer CSS
        (`.btn`, `.btn-primary`, … in `app/globals.css`), where a call site's utility wins by the
        cascade; `btnClass` only names the classes. `Skeleton`, `MediaFrame` and `EmptyState` take the
        same route (`.sf-*`); `badge`, `alert`, `misc`, `kit` and the chrome's client components join
        classes with `clsx`. ⚠ `cn` (`lib/utils`) is still fine in a module only the server renders —
        the cost is a CLIENT module importing one that imports it.
  - [x] **`next/dynamic`'s runtime, 1.3 KB on every route**, to lazy-load two things. Replaced by
        `lib/use-on-demand.ts` (telemetry island, search filters).
  - [x] **The mini-cart's contents** (with `next/image` and the cart's write actions) now load when the
        pointer or focus reaches the cart button, or on the first press — `MiniCartBody.tsx`.
  - [x] **`/cart`'s "On sale now" rail** loads its code with its products (it already waited on a fetch).
  - [x] `NewsletterForm` / `CopyCodeButton` no longer import through `kit` (field strings moved to
        `components/storefront/fields.ts`). Worth 0.9 KB, not the cause.
- **Not the cause:** Motion (already on demand), the All aisles menu, the carousels, the phone menu.
- **Open:** not walked in a browser — buttons, badges, skeletons and the cart drawer's first open want
  a look on dev. Headroom is 0.8 KB on `/search`; the next client-side addition there must be measured.
- **Done when:** every guest route passes the gate on a fresh build.

---

## P1 — Images

### PERF-02 · Serve catalogue images from a CDN with stable URLs — **spec**

- **Found:**
  - Every image URL is a presigned S3 GET signed fresh per request with a 15-minute life
    (`apis/edge-api/shared/src/lib/media.ts` `READ_URL_TTL`, `storefront/src/lib/cards.ts` `toCards`).
    The URL differs on every response, so the browser re-downloads the same picture on every page view.
  - Bytes come straight from the bucket in Sydney. `infra/envs/dev/media.tf` records that a public
    CloudFront CDN was "deferred to the customer-facing slice"; it was never built.
- **Fix:**
  - CloudFront distribution in front of the product-media bucket (origin access control; the bucket
    stays private). Catalogue and promotion artwork prefixes only — `courier-label/` and delivery proof
    must stay presigned-only.
  - Storefront DTOs carry a stable CDN URL built from the storage key instead of a signed one.
  - Long `Cache-Control: public, max-age=31536000, immutable` (keys are already collision-free per upload).
- **Tasks**
  - [x] Spec + plan (infra: CloudFront + certificate in `us-east-1`, DNS name under the env zone, SSM
        parameter for the media base URL; constitution check — CloudFront is managed, not compute).
  - [x] Terraform: distribution, OAC, bucket policy scoped to the public prefixes.
  - [x] Backend: a `publicImageUrl(storageKey)` helper in `@effy/edge-shared`; `storefront` (and
        `commerce` cart/order lines) use it instead of `presignRead` for catalogue images.
  - [x] Keep `presignRead` for operator surfaces and private objects; add a guard so a private prefix
        can never be given a public URL.
  - [x] `next.config.ts` `images.remotePatterns`: add the CDN host; drop the `**.amazonaws.com` wildcard
        once nothing uses it.
  - [ ] Mobile apps: confirm they render whatever URL the DTO carries (no client change expected).
- **Done when:** the same product shows the same image URL across two requests, and a repeat page view
  loads its images from the browser cache.
- **Built 2026-10-14** with PERF-03 as feature 086 (`specs/086-catalogue-image-delivery/`). NOT applied,
  migrated or deployed — the operator steps are in its quickstart. Built as above, with two changes: the
  CDN host is `media.<zone>`, and `next/image` was removed from customer-web entirely (a plain `<picture>`),
  which also dropped the `**.amazonaws.com` pattern and ~4.6 KB from every guest route.

### PERF-03 · Right-sized, modern-format images — **spec** (rides PERF-02)

- **Built 2026-10-14 in 086**: copies made at upload by a queue-fed worker (WebP only; the original is the
  fallback), 160/320/640/1280 plus the source's own width. Not deployed. The unchecked tasks below are
  superseded by 086's tasks.md.

- **Found:** every `<Image>` is `unoptimized` (ProductCard, ProductGallery, MiniCart, cart, checkout,
  receipt, `MediaFrame`), so a 72px thumbnail downloads the original upload — up to 10 MB is accepted
  (`MAX_IMAGE_FILE_SIZE`), JPEG/PNG/WebP only.
- **Fix (recommended):** generate fixed-width variants (e.g. 160 / 320 / 640 / 1280, WebP + AVIF) when
  an image is uploaded, store them beside the original, and emit `srcSet` from the known widths.
  Alternative: let the Next image optimizer fetch from the CDN (works once URLs are stable, but runs on
  the SSR compute and is billed per transformation).
- **Tasks**
  - [x] Decide: upload-time variants (S3 event → Lambda) vs. Next optimizer. Record in the plan.
  - [x] Backfill variants for existing media.
  - [x] Replace `unoptimized` with a loader (or `srcSet`) that picks a variant; keep `sizes` as written.
  - [x] Remove the `unoptimized` rationale comments in `next.config.ts` / `ProductCard.tsx` when true.
- **Done when:** a product card on a phone downloads an image of roughly its displayed size in AVIF/WebP.

### PERF-04 · Prioritise the largest image on each page

- **Found:**
  - `components/storefront/PromoBanner.tsx:187` — the hero artwork uses `loading="lazy"`; it is the
    home page's largest element.
  - `ProductCard.tsx` gives no priority to the first row on home, search or related rails.
- **Tasks**
  - [x] ~~`PromoBanner`: add a `priority` prop;~~ *(not applicable: the hero has no artwork, see below)* the first hero slide passes it (`loading="eager"`,
        `fetchPriority="high"`); other slides and `OffersPanels` stay lazy.
  - [x] `ProductCard`: accept `priority`; `ProductRail` / search grid pass it to the first row only.
  - [x] Verify the product gallery's first image (already `priority`) is the only eager one there.
- **Done when:** the hero image request starts before any below-the-fold image in a network trace.
- **Note:** small and independent — can ship before PERF-02.
- **Done 2026-10-14**, differently from the tasks above:
  - ⚠ **The hero has no artwork.** `PromoHero` never passes `imageUrl`; the band is drawn. The lazy
    `<img>` in `PromoBanner` is reached only by `OfferBannerCard`, which the home page does not give
    an image either. Nothing to prioritise there, so `PromoBanner` is unchanged.
  - `ProductCard` takes `priority` (`loading="eager"`, `fetchPriority="high"` — not `next/image`'s
    `priority`, which would also write four preloads into the head). The first `FIRST_ROW` (4) cards
    of the home page's first rail and of the search grid get it; related rails do not (the gallery
    is that page's largest element).
  - The gallery's first image is the only eager one there (checked, unchanged).
  - Not seen in a browser: dev's newest products have no pictures, so the attributes were not
    observed in rendered HTML.

---

## P1 — Caching public data

### PERF-05 · Cache the aisle list (categories) — **spec amendment (054 FR-015a)**

- **Found:** `/storefront/v1/categories` is read `uncached()` on **every page view** for the header
  (`lib/categories.ts:18`) — aisle row, All aisles menu, search chooser, phone menu. The query runs two
  correlated subqueries per category over its subtree (`storefront/src/catalog/repository.ts`). The list
  changes only when staff edit the taxonomy.
- **Constraint:** `lib/storefront-freshness.guard.test.ts` bans `cached()` under `app/(shop)`; the read
  lives in `lib/`, so it would not trip the guard, but the intent of FR-015a still applies — the payload
  includes `productCount`, which is stock-derived.
- **Fix:** cache names/tree/images for minutes under a `categories` tag; either drop the live count from
  the cached payload or accept a 60s-stale count (FR-015a already allows 60s for listings).
- **Tasks**
  - [x] Amend FR-015a to state what may be cached and for how long; update the guard's message and add
        an allow-list rather than deleting the guard.
  - [x] `getCategories`: ~~`cached({ tags: ["categories"], revalidate: 300 })`~~ `'use cache'` + `cacheTag`.
  - [x] Backend: ~~`Cache-Control: public, max-age=60, stale-while-revalidate=300`~~ the `listing` policy.
  - [x] Invalidate on taxonomy change: ~~a revalidate endpoint~~ accept the TTL.
- **Done when:** a warm page view makes no categories request to the backend.
- **Depends on:** PERF-02 for the category images (a cached payload must not carry a 15-minute URL).
- **Done 2026-10-14, with PERF-06/07** (see "How P1 caching was built" below). Not deployed or walked.
  - ⚠ **60 seconds, not 300**: `productCount` is stock-derived and decides which aisles home shows, so
    the list is FR-015a's listing tier. Because the cache is that short, a 15-minute presigned
    category picture is harmless — PERF-02 is not a deploy prerequisite here.

### PERF-06 · Cache the home payload and banners for up to 60 seconds — **spec amendment**

- **Found:** `/storefront/v1/home` is uncached (`app/(shop)/home-data.ts`) and costs ~8 queries per view.
  029 keeps promotions live because "this offer is still available" is a live claim.
- **Fix:** 60s revalidate with tags `home`, `promotions`; invalidate `promotions` when staff publish,
  pause or end one.
- **Tasks**
  - [x] Amend 029 / 054 wording to allow ≤60s on home rails and banners. (029's spec says nothing about
        caching — only its tasks and code comments did; FR-015a carries the rule.)
  - [x] `getHome`: tagged cache, 60s.
  - [x] Backend `Cache-Control` on `/storefront/v1/home` ~~and `/promotions/{id}`~~ — see below.
  - [x] ~~Tag invalidation from the admin promotion writes.~~ TTL only.
- **Depends on:** PERF-02.
- **Done 2026-10-14.** Not deployed or walked. The header's offers menu (`AisleRow`) and `/offers` read
  the same payload, so this also took a home read off every non-home page view.
  - ⚠ **`/promotions/[id]` stays live** (and sends no header): it is the page a shopper copies the code
    from, it is one indexed row, and nothing reads it per page view.

### PERF-07 · Split the product page into cached content and live availability — **spec amendment**

- **Found:** the product read is fully uncached; FR-015a requires availability to be immediate. Name,
  gallery, description, attributes and category path do not change with stock.
- **Fix:** cache the static part per product (tag `product:<id>`); read `available` + price live in a
  small streamed island (or a slim `/availability` read).
- **Tasks**
  - [x] Decide whether price is "static" or "live" (it moves money — recommend live). **Live.**
  - [x] Backend: ~~slim availability/price route, or split DTO~~ — neither: the existing
        `/storefront/v1/products?ids=<id>` card read carries price, was-price and availability, so no
        route was added (the shared gateway's 300-route ceiling).
  - [x] Page: cached `ProductContent` + live `<Suspense>` islands (price row, add-to-cart).
  - [x] ~~Invalidate `product:<id>` on shop/back-office product edits.~~ TTL only.
  - [x] With the product cached, give `generateMetadata` the real name and description (today every
        product is titled "Product · Effy").
- **Depends on:** PERF-02 — and guarded rather than assumed (below).
- **Done 2026-10-14.** Served locally against dev: the real name in `<title>`, prices and
  availability present, a repeat view 0.39s against 1.8s for the first. Not deployed or walked.
  - The kept content has `priceAmount`, `compareAtAmount`, `currency`, `available` and `badges`
    stripped before it is returned, so no render can reach a cached price.
  - ⚠ **Content still carrying a presigned picture link is kept as a listing (≤60s)**, not for
    minutes: dev's `storefront` predates 086 and its links expire in 15 minutes. Once 086 is deployed
    the `catalogue` lifetime applies by itself.
  - An unknown product is kept as a listing too, so a product staff have just approved does not 404
    for a quarter of an hour.
  - Fixed on the way: `/search` and `/promotions/[id]` were titled "Search · Effy · Effy" /
    "Offer · Effy · Effy" (the root layout already appends " · Effy").
  - A product that no longer exists still answers 200 with the not-found page (it is decided inside
    the streamed boundary) — unchanged by this work.

### How P1 caching was built (PERF-05..07)

- **Next's `"use cache"`**, not the fetch-level `cached()` option: `getCategories` (`lib/categories.ts`),
  `getHome` (`app/(shop)/home-data.ts`), the product page's content. Each is still wrapped in React's
  `cache()` for one lookup per render.
- **Two lifetimes, in one file** — `lib/cache-life.ts`: `listing` (stale 30 / revalidate 15 / expire 30
  → at most 60s, FR-015a's tier) and `catalogue` (300 / 300 / 900 → at most 20 minutes, words and
  pictures only). Objects, not named profiles in `next.config.ts`: a named profile is typed only after
  `next build`, so `tsc` refused it on a clean checkout.
- ⚠ **No tag is revalidated by any writer — a decision, not a gap.** `use cache` keeps its entries in
  each server instance's memory, so a revalidate call would clear one instance. The lifetimes are the
  contract; the tags (`categories`, `home`, `promotions`, `product:<id>`) are there for a shared cache
  handler if one is ever added.
- **FR-015a amended** (`specs/054-product-inventory/spec.md`): listings, the aisle list, home rails and
  offers ≤60s; a product's words and pictures ≤20 minutes; price, availability and anything read with
  an account never kept.
- **`lib/storefront-freshness.guard.test.ts` is now an allow-list**: each file allowed a `"use cache"`
  with the lifetimes it may name, the one file allowed `cached()` (the order rules), no session read in
  a cached file, `listing`'s stale + expire ≤ 60, `catalogue` expire ≤ 15 minutes, and the product
  page's live read. Proven by breaking the 60s sum.
- **Backend**: `categories` and `home` send the `listing` header (`storefront/src/lib/cache.ts`);
  `cache.contract.test.ts` records it. Nothing in the browser calls them — it is for mobile and any
  future CDN. `storefront` NOT deployed.
- Bundle: unchanged in kind (server-only); every guest route within 174 KB on a fresh build.

### PERF-08 · HTTP cache headers on public storefront routes

- **Found:** only `suggestions`, `localities` and `serviceability` send `Cache-Control`. Browser-direct
  reads (`/storefront/v1/products`, `/facets` from `SearchExperience` and `RecentlyViewedRail`) get none.
- **Tasks**
  - [x] `products` and `facets`: `public, max-age=30, stale-while-revalidate=60` (inside FR-015a's 60s).
  - [x] One shared helper in `storefront/src/lib` so the values live in one place.
  - [x] Contract test asserting each public route's header.
- **Done when:** repeating the same search within 30s issues no network request.
- **Done 2026-10-14; `storefront` NOT deployed.** `storefront/src/lib/cache.ts` holds every value
  (the three older ones moved in); `cache.contract.test.ts` lists every function with its policy or
  `null`, so a new route must state one.
  - ⚠ **`max-age=30, stale-while-revalidate=30`, not `=60` as written above**: the two add up to the
    oldest answer a browser shows, and 30 + 60 is 90 seconds — past FR-015a's 60. The test holds the sum.

---

## P1 — Search and aisle pages

### PERF-09 · Server-render the first page of results

- **Found:** `/search` is a client shell (`SearchExperience.tsx`): results arrive after the JavaScript
  loads, then a 250 ms debounce (applied on first load too), then a cross-origin fetch. Aisle pages
  (`/search?category=…`) are the main listing a shopper lands on, and crawlers receive no products.
- **Fix:** the page reads `searchParams` inside `<Suspense>`, fetches page one + facets on the server and
  passes them as initial state; the client takes over for refinement and infinite scroll.
- **Tasks**
  - [x] `search/page.tsx`: await `searchParams` inside the boundary; fetch first page and facets in parallel.
  - [x] `SearchExperience`: accept `initialResults` / `initialFacets`; skip the first fetch when they
        match the URL.
  - [x] Skeleton fallback shaped like the grid (today the fallback is empty).
  - [x] Check `robots.ts` — facet params are disallowed; decide whether `?category=` aisle pages should
        be indexable now that they have content.
- **Done when:** the raw HTML of an aisle URL contains product cards.
- **Done 2026-10-14** — a production build served locally against dev returned `/search` with 24
  product cards in the raw HTML. Not walked in a browser.
  - The query is built once for server and browser (`lib/search-query.ts`); the browser shows the
    server's page only when it answers the query the address asks.
  - ⚠ **Refinements now rewrite the address with `history.replaceState`, not the router** — the page
    reads its search params on the server, so a router navigation would read the listing there on
    every filter tick as well.
  - ⚠ **Bundle: `/search` is 173.8 KB of 174.** The phone filter sheet's markup moved into the
    on-demand filter chunk to get there. The next client-side byte on this route must come out of it.
  - **Open (operator's call): `robots.ts` unchanged.** Aisle pages now have content, but `/search?`
    stays disallowed and every search URL is canonical to `/search`. Indexing single-aisle URLs
    means an Allow for `/search?category=`, a Disallow for `/search?category=*&`, a per-aisle
    title and canonical, and sitemap entries — a change to 011's route contract.

### PERF-10 · Remove the debounce on first load; keep results across Back

- **Tasks**
  - [x] Debounce only refinements, not the mount fetch (covered by PERF-09 if done first).
  - [x] Keep loaded pages and scroll position when returning from a product page (module-level store
        keyed by the query string, or session storage) — today Back refetches from page one.
  - [x] `loadMore` failure currently sets `exhausted`, silently ending the list; show a retry instead.
- **Done 2026-10-14**, all three, in `SearchExperience.tsx`. Not walked in a browser.
  - Only a refinement waits 250 ms.
  - The last listing is kept for the life of the tab and shown again on return — ⚠ **only while its
    first page is under 60 seconds old** (FR-015a); older than that, Back reads page one again.
    Keeping it longer needs FR-015a amended.
  - A failed page says so and offers "Try again"; scrolling does not retry on its own.
  - Also fixed on the way: a page arriving for an earlier refinement is dropped, and an aborted read
    no longer clears "loading" under the one that replaced it.

---

## P2 — Backend read cost

### PERF-11 · Home: fewer round trips

- **Found:** the DB pool is `max: 1` per Lambda (`shared/src/lib/db.ts`), so the `Promise.all` in
  `home/service.ts` queues on one connection — ~8 round trips in series, not "two waves". 029 measured
  ~135 ms per round trip from a local backend.
- **Tasks**
  - [x] One query for all category rails (`LATERAL` per candidate, or a window function with
        `row_number() <= 12`).
  - [x] Fold featured + on-sale into the same statement or a single `UNION ALL` with a rail label.
  - [x] Correct the "two waves" comment.
- **Note:** matters less after PERF-06, but sets the cold-path floor.
- **Done 2026-10-14; `storefront` NOT deployed.** `HomeRepository.rails` is one statement: the
  candidates CTE, then Featured, On sale and a `LATERAL` per candidate under one `UNION ALL`, each row
  labelled with its rail. Home is now two statements (rails, banners) instead of eight.
  - Run against dev's data beside the old seven queries (read-only session): same rails, same
    Featured and On sale; **4.2–4.7 s → 0.3 s** measured from a laptop (so mostly round trips).
  - ⚠ **The category rails can differ from before — on ties only.** The old candidate query ordered by
    display order then product count with no tie-break, so among the many categories tied at the same
    count it picked arbitrarily. It now breaks ties by `c.key` and is the same on every load.

### PERF-12 · Product detail: one round trip

- **Found:** detail, media, attributes and category path are four serial queries.
- **Tasks**
  - [x] Combine with `json_agg` subselects, or one CTE statement.
- **Done 2026-10-14; `storefront` NOT deployed.** `CatalogRepository.productPage` returns the detail
  row with its gallery and attributes as `json_agg` columns and the aisle path as an array. Compared
  with the old four queries for **all 136 dev products: every response byte-identical**;
  **1,140 ms → 300 ms** per page from a laptop.

### PERF-13 · Categories query

- **Tasks**
  - [x] `EXPLAIN ANALYZE` on dev data; the per-category subtree count and image pick are correlated
        subqueries — replace with one recursive CTE + aggregate if it shows.
- **Done 2026-10-14; `storefront` NOT deployed.** It showed: each of 157 categories walked its subtree
  and seq-scanned `product` twice (157 loops each), so cost grew with categories × products —
  **59 ms on dev's 136 products**. Now one closure walk (`categoryClosure()`, beside
  `categorySubtreeById` in `lib/category-tree.ts` — still the one definition of "under a category")
  and one aggregate each for counts and pictures: **4.5 ms**, all 157 rows identical to before.

### PERF-14 · Suggestions index check

- **Found:** `suggest/repository.ts` uses `ILIKE '%q%'` on product name in three queries per keystroke
  batch. Not verified whether a trigram index covers it.
- **Tasks**
  - [x] Check migrations for a `gin_trgm_ops` index on `product.name`; add one if missing.
  - [x] `EXPLAIN` the three statements.
- **Done 2026-10-14; migration NOT applied.** There was none: the only product trigram index is the
  full search's, over one combined `lower(name || sku || brand || short_description)` expression, which
  Postgres uses only for that exact expression. All three name matches and the brand-prefix match read
  every product. `20261014150000_product_name_trgm.sql` adds `product_name_trgm_idx` and
  `product_brand_trgm_idx`.
  - Measured on 50,000 products: a selective name match **20 ms → 1.6 ms**; the brand prefix uses its
    index. A term matching a tenth of the catalogue, or a catalogue of a few thousand, still reads
    through — correctly, it is cheaper.
  - `storefront.container.test.ts` asserts each statement CAN use the indexes (50,000 rows, scans off —
    with scans on, ANALYZE's random sample made it flip between plans, 1 run in 4). Proven by
    removing the migration.

### PERF-15 · Cold starts on the shopper path

- **Found:** every server read is Amplify SSR compute → API Gateway → Lambda → RDS: two possible cold
  starts. Not measured in this review.
- **Tasks**
  - [x] Measure p50/p95 for `home`, `categories`, `product` from CloudWatch (cold vs warm).
  - [ ] Only if cold p95 is a problem after caching: consider provisioned concurrency on the two or
        three hottest functions (cost decision — operator's call).
- **Measured 2026-10-14** — dev, last 14 days, Lambda `REPORT` lines, the version BEFORE PERF-11..13
  (handler time; a cold start adds its init on top):

  | Function | Warm n | Warm p50 / p95 | Cold n (share) | Cold p50 / p95 | Init avg |
  |---|---|---|---|---|---|
  | `homeV1` | 697 | 56 / 305 ms | 142 (17%) | 1,496 / 1,773 ms | 419 ms |
  | `categoriesV1` | 820 | 133 / 334 ms | 143 (15%) | 836 / 1,045 ms | 412 ms |
  | `productV1` | 76 | 19 / 213 ms | 37 (33%) | 737 / 816 ms | 408 ms |

  - A cold home view costs ~1.9 s at the median, and most of it is not init: the cold handler opens the
    database connection (secret fetch + TLS) and then ran seven serial queries on it. PERF-11 removes
    six of those, so **re-measure after `storefront` is deployed** before deciding anything.
  - Dev's cold share is high because its traffic is low; it says little about production.
  - **No recommendation for provisioned concurrency yet.** With PERF-05/06 the storefront asks for
    home and the aisle list at most about once per 15–30 s per server instance, so these functions
    see few calls — more of them cold, but far fewer shopper views waiting on one.

---

## P2 — Front-end details

### PERF-16 · Make per-customer read sharing explicit

- **Found:** on a signed-in page the same reads are requested from several islands and rely on implicit
  fetch de-duplication: `/customer/v1/points` (`UserIsland`, `HomeShortcuts`, `ProductDeliveryNote`),
  `/customer/v1/addresses` (`DeliveryBar`, `ProductDeliveryNote`).
- **Tasks**
  - [ ] `lib/customer-reads.ts`: `getPoints`, `getAddresses`, `getSavedItems`, `getOrders` wrapped in
        React `cache()` (same reasoning as `getHome`).
  - [ ] Point the islands at them.

### PERF-17 · Preload the typeface, remove the swap shift

- **Found:** Geist (57 KB variable) loads through plain `@font-face` with `font-display: swap` and no
  preload — text paints in the fallback, then shifts. The root layout already records the fix.
- **Tasks**
  - [ ] `next/font/local` pointing at the design-system's existing `Geist-Variable.woff2` (not a second
        copy), with `adjustFontFallback`.
  - [ ] Confirm Geist Mono is not downloaded on pages that show no code field.
  - [ ] Check CLS before/after from the web-vitals events.

### PERF-18 · Recently viewed and other on-load client fetches

- **Tasks**
  - [ ] `RecentlyViewedRail`: defer the fetch until the rail is near the viewport.
  - [ ] List every request a guest's first page view makes (cart preview, saved ids, live, telemetry)
        and confirm none fires for an empty cart / a guest who cannot use it.

### PERF-19 · Remaining plain `<img>`

- **Tasks**
  - [ ] `app/(account)/orders/page.tsx:220` — add `loading="lazy"`, `decoding="async"` and dimensions
        (or use `MediaFrame`).

---

## P3 — Measurement and guards

### PERF-20 · A baseline, so the gains are numbers

- **Tasks**
  - [ ] Record LCP / INP / CLS / TTFB for `/`, an aisle page and a product page from the existing
        web-vitals events (PostHog) before PERF-02..09 land.
  - [ ] Lighthouse (mobile, throttled) on the same three URLs against dev; keep the reports in the
        feature's `specs/` folder.
  - [ ] Re-measure after each P1 item.

### PERF-21 · Guards for what this backlog introduces

- **Tasks**
  - [ ] A test that no storefront DTO image URL contains a signature query string (after PERF-02).
  - [x] The freshness guard rewritten as an allow-list of cached reads with their maximum age
        (after PERF-05..07).
  - [x] A test that each cached tag has at least one invalidating writer, or a documented TTL-only decision.
        (TTL-only, documented in `lib/cache-life.ts`; the guard holds the lifetimes.)

---

## Suggested order

1. **PERF-01** — unblocks deploys.
2. **PERF-04** — one-line image priority changes.
3. **PERF-20** — take the baseline.
4. **PERF-02 → PERF-03** — image CDN, then variants (one feature spec).
5. **PERF-05, 06, 08** — caching for categories, home, HTTP headers (one feature spec, amends 054 FR-015a).
6. **PERF-09, 10** — server-rendered search.
7. **PERF-07** — product page split.
8. **PERF-11..19** as capacity allows.

## Not verified in this review

- Bundle numbers after commit `b9b7d584` (no rebuild was run).
- Real latency and cold-start figures (no CloudWatch or browser trace was taken).
- Whether a trigram index already exists for suggestions.
- Whether implicit fetch de-duplication currently collapses the duplicate per-customer reads.

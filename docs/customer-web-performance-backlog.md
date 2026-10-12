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
- **Tasks**
  - [ ] Rebuild and re-run `pnpm --filter @effy/customer-web size` to get the current numbers.
  - [ ] Run `pnpm --filter @effy/customer-web analyze` and attribute the growth chunk by chunk.
  - [ ] Move menu / carousel / phone-menu behaviour that is not needed at first paint behind
        `next/dynamic` or an on-interaction import (the pattern `lib/slide-motion.ts` already uses).
  - [ ] Check `components/storefront/kit.tsx` vs `actions.tsx` imports on the chrome — a button imported
        through `kit` drags `next/image` in (the file's own warning).
  - [ ] Only if the floor itself moved (framework upgrade): ratchet the budget in a reviewed diff with
        the measurement, per the script's rules. Do not raise it to pass.
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
  - [ ] Spec + plan (infra: CloudFront + certificate in `us-east-1`, DNS name under the env zone, SSM
        parameter for the media base URL; constitution check — CloudFront is managed, not compute).
  - [ ] Terraform: distribution, OAC, bucket policy scoped to the public prefixes.
  - [ ] Backend: a `publicImageUrl(storageKey)` helper in `@effy/edge-shared`; `storefront` (and
        `commerce` cart/order lines) use it instead of `presignRead` for catalogue images.
  - [ ] Keep `presignRead` for operator surfaces and private objects; add a guard so a private prefix
        can never be given a public URL.
  - [ ] `next.config.ts` `images.remotePatterns`: add the CDN host; drop the `**.amazonaws.com` wildcard
        once nothing uses it.
  - [ ] Mobile apps: confirm they render whatever URL the DTO carries (no client change expected).
- **Done when:** the same product shows the same image URL across two requests, and a repeat page view
  loads its images from the browser cache.

### PERF-03 · Right-sized, modern-format images — **spec** (rides PERF-02)

- **Found:** every `<Image>` is `unoptimized` (ProductCard, ProductGallery, MiniCart, cart, checkout,
  receipt, `MediaFrame`), so a 72px thumbnail downloads the original upload — up to 10 MB is accepted
  (`MAX_IMAGE_FILE_SIZE`), JPEG/PNG/WebP only.
- **Fix (recommended):** generate fixed-width variants (e.g. 160 / 320 / 640 / 1280, WebP + AVIF) when
  an image is uploaded, store them beside the original, and emit `srcSet` from the known widths.
  Alternative: let the Next image optimizer fetch from the CDN (works once URLs are stable, but runs on
  the SSR compute and is billed per transformation).
- **Tasks**
  - [ ] Decide: upload-time variants (S3 event → Lambda) vs. Next optimizer. Record in the plan.
  - [ ] Backfill variants for existing media.
  - [ ] Replace `unoptimized` with a loader (or `srcSet`) that picks a variant; keep `sizes` as written.
  - [ ] Remove the `unoptimized` rationale comments in `next.config.ts` / `ProductCard.tsx` when true.
- **Done when:** a product card on a phone downloads an image of roughly its displayed size in AVIF/WebP.

### PERF-04 · Prioritise the largest image on each page

- **Found:**
  - `components/storefront/PromoBanner.tsx:187` — the hero artwork uses `loading="lazy"`; it is the
    home page's largest element.
  - `ProductCard.tsx` gives no priority to the first row on home, search or related rails.
- **Tasks**
  - [ ] `PromoBanner`: add a `priority` prop; the first hero slide passes it (`loading="eager"`,
        `fetchPriority="high"`); other slides and `OffersPanels` stay lazy.
  - [ ] `ProductCard`: accept `priority`; `ProductRail` / search grid pass it to the first row only.
  - [ ] Verify the product gallery's first image (already `priority`) is the only eager one there.
- **Done when:** the hero image request starts before any below-the-fold image in a network trace.
- **Note:** small and independent — can ship before PERF-02.

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
  - [ ] Amend FR-015a to state what may be cached and for how long; update the guard's message and add
        an allow-list rather than deleting the guard.
  - [ ] `getCategories`: `cached({ tags: ["categories"], revalidate: 300 })` (or `'use cache'` + `cacheTag`).
  - [ ] Backend: `Cache-Control: public, max-age=60, stale-while-revalidate=300` on the route.
  - [ ] Invalidate on taxonomy change: a revalidate endpoint the `catalog` service calls after commit,
        or accept the TTL (decide in the plan).
- **Done when:** a warm page view makes no categories request to the backend.
- **Depends on:** PERF-02 for the category images (a cached payload must not carry a 15-minute URL).

### PERF-06 · Cache the home payload and banners for up to 60 seconds — **spec amendment**

- **Found:** `/storefront/v1/home` is uncached (`app/(shop)/home-data.ts`) and costs ~8 queries per view.
  029 keeps promotions live because "this offer is still available" is a live claim.
- **Fix:** 60s revalidate with tags `home`, `promotions`; invalidate `promotions` when staff publish,
  pause or end one.
- **Tasks**
  - [ ] Amend 029 / 054 wording to allow ≤60s on home rails and banners.
  - [ ] `getHome`: tagged cache, 60s.
  - [ ] Backend `Cache-Control` on `/storefront/v1/home` and `/promotions/{id}`.
  - [ ] Tag invalidation from the admin promotion writes.
- **Depends on:** PERF-02.

### PERF-07 · Split the product page into cached content and live availability — **spec amendment**

- **Found:** the product read is fully uncached; FR-015a requires availability to be immediate. Name,
  gallery, description, attributes and category path do not change with stock.
- **Fix:** cache the static part per product (tag `product:<id>`); read `available` + price live in a
  small streamed island (or a slim `/availability` read).
- **Tasks**
  - [ ] Decide whether price is "static" or "live" (it moves money — recommend live).
  - [ ] Backend: slim availability/price route, or split DTO.
  - [ ] Page: cached `ProductContent` + live `<Suspense>` buy column.
  - [ ] Invalidate `product:<id>` on shop/back-office product edits.
  - [ ] With the product cached, give `generateMetadata` the real name and description (today every
        product is titled "Product · Effy").
- **Depends on:** PERF-02.

### PERF-08 · HTTP cache headers on public storefront routes

- **Found:** only `suggestions`, `localities` and `serviceability` send `Cache-Control`. Browser-direct
  reads (`/storefront/v1/products`, `/facets` from `SearchExperience` and `RecentlyViewedRail`) get none.
- **Tasks**
  - [ ] `products` and `facets`: `public, max-age=30, stale-while-revalidate=60` (inside FR-015a's 60s).
  - [ ] One shared helper in `storefront/src/lib` so the values live in one place.
  - [ ] Contract test asserting each public route's header.
- **Done when:** repeating the same search within 30s issues no network request.

---

## P1 — Search and aisle pages

### PERF-09 · Server-render the first page of results

- **Found:** `/search` is a client shell (`SearchExperience.tsx`): results arrive after the JavaScript
  loads, then a 250 ms debounce (applied on first load too), then a cross-origin fetch. Aisle pages
  (`/search?category=…`) are the main listing a shopper lands on, and crawlers receive no products.
- **Fix:** the page reads `searchParams` inside `<Suspense>`, fetches page one + facets on the server and
  passes them as initial state; the client takes over for refinement and infinite scroll.
- **Tasks**
  - [ ] `search/page.tsx`: await `searchParams` inside the boundary; fetch first page and facets in parallel.
  - [ ] `SearchExperience`: accept `initialResults` / `initialFacets`; skip the first fetch when they
        match the URL.
  - [ ] Skeleton fallback shaped like the grid (today the fallback is empty).
  - [ ] Check `robots.ts` — facet params are disallowed; decide whether `?category=` aisle pages should
        be indexable now that they have content.
- **Done when:** the raw HTML of an aisle URL contains product cards.

### PERF-10 · Remove the debounce on first load; keep results across Back

- **Tasks**
  - [ ] Debounce only refinements, not the mount fetch (covered by PERF-09 if done first).
  - [ ] Keep loaded pages and scroll position when returning from a product page (module-level store
        keyed by the query string, or session storage) — today Back refetches from page one.
  - [ ] `loadMore` failure currently sets `exhausted`, silently ending the list; show a retry instead.

---

## P2 — Backend read cost

### PERF-11 · Home: fewer round trips

- **Found:** the DB pool is `max: 1` per Lambda (`shared/src/lib/db.ts`), so the `Promise.all` in
  `home/service.ts` queues on one connection — ~8 round trips in series, not "two waves". 029 measured
  ~135 ms per round trip from a local backend.
- **Tasks**
  - [ ] One query for all category rails (`LATERAL` per candidate, or a window function with
        `row_number() <= 12`).
  - [ ] Fold featured + on-sale into the same statement or a single `UNION ALL` with a rail label.
  - [ ] Correct the "two waves" comment.
- **Note:** matters less after PERF-06, but sets the cold-path floor.

### PERF-12 · Product detail: one round trip

- **Found:** detail, media, attributes and category path are four serial queries.
- **Tasks**
  - [ ] Combine with `json_agg` subselects, or one CTE statement.

### PERF-13 · Categories query

- **Tasks**
  - [ ] `EXPLAIN ANALYZE` on dev data; the per-category subtree count and image pick are correlated
        subqueries — replace with one recursive CTE + aggregate if it shows.

### PERF-14 · Suggestions index check

- **Found:** `suggest/repository.ts` uses `ILIKE '%q%'` on product name in three queries per keystroke
  batch. Not verified whether a trigram index covers it.
- **Tasks**
  - [ ] Check migrations for a `gin_trgm_ops` index on `product.name`; add one if missing.
  - [ ] `EXPLAIN` the three statements.

### PERF-15 · Cold starts on the shopper path

- **Found:** every server read is Amplify SSR compute → API Gateway → Lambda → RDS: two possible cold
  starts. Not measured in this review.
- **Tasks**
  - [ ] Measure p50/p95 for `home`, `categories`, `product` from CloudWatch (cold vs warm).
  - [ ] Only if cold p95 is a problem after caching: consider provisioned concurrency on the two or
        three hottest functions (cost decision — operator's call).

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
  - [ ] The freshness guard rewritten as an allow-list of cached reads with their maximum age
        (after PERF-05..07).
  - [ ] A test that each cached tag has at least one invalidating writer, or a documented TTL-only decision.

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

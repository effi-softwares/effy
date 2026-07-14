# Contract — Storefront routes: render mode, index policy, budget

**Binding.** Every route in `apps/customer-web` appears in this table. A new route without a row here
is a defect — the row is what forces the author to answer "is this cacheable, is it indexable, does it
demand a session, and what may it cost?" before writing it.

## Legend

- **Render** — `shell` = prerendered static shell (`'use cache'`, in the PPR shell) · `stream` = a
  server-rendered Suspense island streamed at request time · `dynamic` = fully request-time.
- **Auth** — `guest` = never asks for a session · `gated` = DAL-verified.
- **Budget** — the First Load JS ceiling (research **D9**).

## Routes shipped by this slice

| Route | Render | Index | Auth | Amplify in graph? | Budget |
|---|---|---|---|---|---|
| `/` (home) | **shell** | ✅ index | guest | ❌ **never** | ≤ 120 KB |
| `/browse` (catalog placeholder) | **shell** | ✅ index | guest | ❌ **never** | ≤ 120 KB |
| header user island (all public pages) | **stream** | — | guest | ❌ **never** | +0 KB |
| `/sign-in` | dynamic | 🚫 `noindex` | guest | ✅ (lazy) | ≤ 300 KB |
| `/sign-up` | dynamic | 🚫 `noindex` | guest | ✅ (lazy) | ≤ 300 KB |
| `/callback` (OAuth return) | dynamic | 🚫 `noindex` | guest | ✅ | ≤ 300 KB |
| `/account` (profile) | dynamic | 🚫 `noindex` | **gated** | ✅ | ≤ 300 KB |
| `/account/*` (future account pages) | dynamic | 🚫 `noindex` | **gated** | ✅ | ≤ 300 KB |
| `/checkout` (deferred-demand placeholder) | dynamic | 🚫 `noindex` | **gated** | ✅ | ≤ 300 KB |
| `/sitemap.xml`, `/robots.txt` | shell | — | guest | ❌ | — |

**The `Amplify in graph?` column is machine-enforced**, not a convention: a dependency-cruiser rule
fails the build if any module reachable from a `❌` route transitively imports `aws-amplify` (FR-006,
SC-003).

## Rules that bind every future route

1. **A public route may not read `cookies()` or `headers()` outside a `<Suspense>` boundary.** Doing so
   defers the entire app to request time and destroys the static shell — for *every* page, not just
   that one (research **D4**).
2. **`<Suspense fallback={null}>` must never wrap `<body>`.** The Next docs name this as the way to
   accidentally opt the whole app out of the static shell.
3. **Personalization is a streamed server island**, never a whole-page dynamic downgrade, never
   `'use cache: private'` (experimental), never proxy HTML rewriting.
4. **`Set-Cookie` must never appear on a cacheable page response.** A CDN must not cache a response
   carrying one. Cookies are set **only** from Server Actions and Route Handlers — never during page
   render.
5. **Every indexable page carries**: a page-specific title + description, a **single canonical** URL, an
   OG/Twitter preview, and (once products exist) JSON-LD from the **same** Server Component that renders
   the visible values.
6. **No cloaking, ever** (FR-008). Content is never branched on User-Agent. Everyone — shopper, Googlebot,
   Slack's link preview — receives the same server-rendered HTML.
7. **`generateMetadata` must read from the same `'use cache'` function the page body uses.** In Next 16,
   uncached I/O in `generateMetadata` on an otherwise-prerenderable page is a **build error**.

## Crawl policy (`robots.ts`)

```
Allow:    /
Disallow: /account  /checkout  /sign-in  /sign-up  /callback  /api/
Sitemap:  ${NEXT_PUBLIC_SITE_URL}/sitemap.xml
```

Inherited by the catalog slice, and non-negotiable there: **facets are query parameters, never path
segments**, and each facet parameter is `Disallow`-ed in `robots.txt`. That is the *crawl-budget* fix —
`noindex` is not, because Google still fetches the page and only then drops it. Paginated pages canonical
to **themselves**, never to page 1.

# Research - 084 Customer Storefront Redesign

## D1 - Where the storefront palette lives

- **Decision**: `packages/design-system/src/storefront/tokens.css`, exported as
  `@effy/design-system/storefront.css`. Standalone: its own `:root` values and its own `@theme inline`
  mapping; **no `.dark` block**; it does not import the platform `tokens.css`. customer-web's
  `globals.css` imports it **instead of** the platform file.
- **Rationale**: the design system keeps owning every palette (so the mobile theme generator can read
  it later), while consoles and mobile are untouched byte for byte. One identity, one file.
- **Alternatives**: overriding platform tokens in `apps/customer-web/app/globals.css` (the 057
  scoped-layer shape - rejected); replacing `tokens.css` (operator said consoles/mobile stay).

## D2 - Token names

- **Decision**: the reference's names, verbatim: shadcn's set plus `--brand`, `--brand-foreground`,
  `--brand-muted`, `--primary-muted`, `--scrim`, `--shadow-xs/md/lg`. The reference's aliases
  (`--deal`, `--fresh`, `--reward`, `--info`) are **not** carried - four names for two values is a
  second vocabulary.
- **Consequence**: utilities the old storefront used that the new theme does not declare
  (`brand-soft`, `brand-ink`, `success`, `warning`, `accent2`, `destructive-soft`, …) emit **no CSS**
  under Tailwind v4. `check-token-usage.mjs` is extended to scan customer-web against the storefront
  `@theme`, which turns every leftover into a failing line - that is also the "old look" sweep (SC-002).

## D3 - Typeface

- **Decision**: self-host `Geist-Variable.woff2` and `GeistMono-Variable.woff2` (the reference ships
  them) via `next/font/local` in the root layout, `display: swap`, exposed as `--font-geist` /
  `--font-geist-mono` and named first in `--font-sans` / `--font-mono`. General Sans is dropped from
  the storefront.
- **Rationale**: no third-party request on a public page; `next/font` preloads and size-adjusts the
  fallback, so no layout shift. One variable file replaces three General Sans weights.
- **Licence**: Geist is SIL OFL 1.1 - redistributable; the licence text is committed beside the files.

## D4 - Primitives (revised during the build)

- **Decision**: class-based primitives in `apps/customer-web/components/ui` (Card, Badge, Alert,
  Separator, Skeleton, Avatar, Breadcrumb, Progress…) plus the existing `components/storefront/kit`
  reshaped to the reference (buttons 32/36/40/48, `rounded-md`, `shadow-xs`; inputs; headings).
  **Overlays stay as they are built today - native `<dialog>` and `<details>` driven by CSS** - restyled
  as the reference Dialog / Sheet / Dropdown, with one added rule (`.fx-sheet-bottom`) for the
  phone bottom sheet. **No `vaul`, `cmdk`, `input-otp` or Radix overlay is added.**
- **Why revised**: the storefront's guest pages run inside a measured 174 KB budget with almost no
  headroom, which is the reason 011–068 built every overlay without script. Scripted overlay
  libraries on the header would break that gate on every public page.
- **Consequence**: the reference's hero carousel buttons (previous / next / pause) are not built; the
  rotation stays CSS-only and pauses on hover and focus.

## D5 - The delivery bar's answer

- **Decision**: server-render it. Signed in → the default address's postcode through the existing
  `GET /storefront/v1/serviceability` (which reads `coverage_for_postcode`, the one definition);
  guest → "Where are we delivering?" opening the existing postcode/locality lookup, remembered in a
  cookie holding **the postcode only**.
- **Rationale**: no second coverage reader (076 guard); nothing stored against an address.
- **Wording**: `DELIVERY_TYPE_WORDS` for effy/courier; `COVERAGE_REFUSAL_SENTENCE` for none.

## D6 - Account: tabs → pages

- **Decision**: `/account` becomes Overview; sections become `/account/personal`, `/addresses`
  (kept - it already exists as a redirect target), `/account/payment`, `/account/points`,
  `/account/security`, `/account/privacy`, `/account/legal`; `/orders` and `/saved` join the same
  sidebar layout. `/account?tab=x` redirects (308) to its page, so every old link lands (FR-014).
- **Overview data**: composed server-side in parallel from reads that exist - `me`, orders (first
  page), points, saved, addresses, payment methods. No aggregate route: six cached-per-request reads
  on one page is cheaper than a new contract, and each tile fails alone.

## D7 - "Products in this offer": held

- **Finding**: `promo_code` has **no product or category scope** - a promotion is a whole-cart
  discount with an optional minimum (see `PromotionDTO`'s own note, 028). There is no set of
  qualifying products.
- **Decision**: build the Offers index (a list over the existing advertised-promotion predicate) and
  the restyled offer page; **do not** show a product rail under an offer, and no aisle filter chips
  on the index. Showing products there would say they are what the code discounts, which is false.
- **To build it later**: an offer needs a scope (aisles/products), back-office authoring and a
  pricing rule - a feature of its own.

## D7a - The Offers index needs no route (found during the build)

- **Finding**: `GET /storefront/v1/home` already returns every advertised promotion as `banners`
  (title, subtitle, terms, code, href), under the same visibility rule the single-offer read re-checks.
- **Decision**: `/offers` reads the home payload. `GET /storefront/v1/promotions` is **not added** -
  it would have returned what Home returns and spent a shared-gateway route.

## D8 - Search suggestions

- **Decision**: `GET /storefront/v1/suggestions?q=` → up to 5 phrases and 4 products. Phrases come from
  the catalogue itself - distinct product names, brands and aisle names matching the prefix by the
  trigram expression the search already ranks with - never from other shoppers' searches. Products are
  the existing card shape. Min 2 characters; cached 60 s at the edge; client debounces 200 ms and
  cancels stale requests.
- **Rationale**: no new table, no logging of queries, same index as search.
- **Failure**: the field works as a plain search box if the call is slow or fails.

## D9 - Order list pictures and stage

- **Decision**: extend `OrderSummaryDTO` with optional `thumbnails` (≤ 4 presigned URLs, live primary
  image, same rule as the receipt line) and `stage` (the one package-status word, summarised across the
  order's packages by the function the order page already uses). Optional → installed apps ignore them.
- **Rationale**: the list must not issue N detail calls; one lateral per order row.

## D10 - Help answers

- **Decision**: authored content in `apps/customer-web/app/(shop)/help/answers.ts`, grouped by topic,
  filtered on the page. `/feedback` redirects to `/help`. Answers that restate a promise use the pinned
  words, never a paraphrase. Operator reviews the prose before launch.

## D11 - Payment (corrected during the build)

- **Finding**: the payment step is NOT the Payment Element. It is 051's own design: split card
  fields (`CardNumberElement` in `_payment/CardFields`), a custom saved-card list, a method list and
  a wallet row. The earlier note here was wrong.
- **Decision for this pass**: restyle that step to the reference frame (heading, method cards with
  blue selection, the "Total due" card, black decline notice) and leave its mechanics alone.
- **Open**: the handoff spec wants the Payment Element with Card / Afterpay / Klarna tabs and saved
  cards from a Customer Session. That replaces working, tested money-path code and changes what the
  intent must allow - an operator decision, and its own task, not a restyle.

## D12 - Save for later

- **Decision**: wire the cart to the existing `set-aside` / `saved/{id}/restore` routes (already
  proxied under `app/api/cart/…`). Guests: the action asks them to sign in (the routes are per
  customer). No backend change.

## D13 - Guards

| Guard | Change |
| --- | --- |
| `check-tokens.mjs`, `check-component-shape.mjs` | unchanged - still the consoles' law |
| `check-storefront-tokens.mjs` (new) | key set; AA on each text/ground pair the reference states; no `.dark`; no hue outside blue/green; destructive is the foreground |
| `check-token-usage.mjs` | + customer-web scanned against the storefront `@theme` |
| `check-no-emerald.sh` / `check-no-jade.sh` | unchanged; the storefront green `#0d7a40` and tint `#ebf6ef` are not on either list - verified |
| `scripts/check-no-storefront-red.sh` (new) | fails `red-`/`rose-`/`destructive-soft` utilities and red hexes under `apps/customer-web` |
| `e2e/container.spec.ts` | new widths (1400 at 2xl; 16/24/32 gutters) |
| `scripts/bundle-budget.mjs` | budget unchanged unless a measured, recorded rise is unavoidable |

## D14 - Mobile later

- The storefront file keeps the shape `gen-compose-theme.mjs` parses (a plain `:root` block of hex
  values). Adopting it in customer-mobile is then a generator input change plus a dark-mode decision -
  out of scope here, not blocked by anything here.

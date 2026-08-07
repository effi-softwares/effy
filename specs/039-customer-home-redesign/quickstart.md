# Quickstart: Customer Home Redesign (039)

Per-section review guide. Build order matches the phases in [plan.md](plan.md); review each section before
the next.

## Baseline (pre-039) — measured 2026-08-07, tasks T001–T004

⚠ **Run the bundle gate from `apps/customer-web`, not the repo root.** `bundle-budget.mjs` resolves
`.next/...` relative to the working directory, so the `node apps/customer-web/scripts/bundle-budget.mjs`
form this file used to give **fails with "Prerendered HTML not found"** even after a successful build. Use
`pnpm --filter @effy/customer-web size`, or `cd apps/customer-web && node scripts/bundle-budget.mjs`.

**T001 — guest bundle, before any 039 change** (`pnpm --filter @effy/customer-web build`, then the gate):

| Route | Baseline | Budget | Headroom |
|---|---|---|---|
| **`/`** | **171.7 KB** | 174 KB | **2.3 KB** |
| `/browse` | 168.1 KB | 174 KB | 5.9 KB |
| `/search` | 172.0 KB | 174 KB | 2.0 KB |
| `/product/[id]` | 170.4 KB | 174 KB | 3.6 KB |
| `/cart` | 172.0 KB | 174 KB | 2.0 KB |
| `/promotions/[id]` | 169.1 KB | 174 KB | 4.9 KB |
| `/delete-account` | 159.5 KB | 174 KB | 14.5 KB |
| `/legal/privacy` | 147.3 KB | 174 KB | 26.7 KB |
| `/legal/terms` | 147.3 KB | 174 KB | 26.7 KB |

⚠ **This corrects the plan.** plan.md § Summary states `/` measures **170.5 KB** with "~3.5 KB headroom".
It is **171.7 KB with 2.3 KB** — a third less room than the constraint was written against. The redesign's
zero-client-JS discipline is therefore tighter than stated, not looser. `/search` and `/cart` are equally
close at 2.0 KB.

**T003 — colour guards, all green before any change**: `check-tokens` OK (31 vars × 2 appearances, radii
8/16, all pairs pass WCAG AA) · `check-no-emerald` OK · `check-no-jade` OK · `tokens:check` OK (8 Compose
files match, 84 mobile asset copies, banner template matches canvas).
⚠ The guard lives at `packages/design-system/scripts/check-tokens.mjs`, **not** `scripts/check-tokens.mjs`
as the Gates section below said.

**T004 — live storefront data** (`core-api` reachable on :8080, 019 seed):

- **Rails (6)**: `featured` (12) · `on_sale` (12) · `category:pantry` (10) · `category:cleaning` (7) ·
  `category:meals` (5) · `category:paper_goods` (3). All four contract rail slots have real data.
- **Banners (6)**: 4 × `placement="carousel"`, 2 × `placement="inline"`. Every one targets
  `{kind:"promotion"}`.
- **Categories (12)**: **9 stocked**, all 9 with an `imageUrl`; 3 unstocked.

### ⚠ Two findings from the live data, both correcting these artifacts

1. **There is no `"offers"` banner placement.** `BannerPlacement` is `"carousel" | "inline"`
   (`packages/shared-types/src/banner.ts:50`) — the spec, the section contract and US4's tasks all said
   "offers placement", a value that **does not exist**. The real second placement, created by 029 as the
   dedicated offers carousel, is **`inline`**. `OffersPanels` is fed by `placement === "inline"`;
   `PromoCarousel` keeps `carousel`. Corrected in the contract and in T042/T043 — **no backend change**, so
   FR-003 is untouched. Had this gone unnoticed, US4's filter would have matched nothing and the offers
   block would have silently rendered as absent, which is a *valid* state under FR-018 and therefore would
   not have looked like a bug.
2. **The three top-level categories report `productCount: 0`** — `food`, `grocery`, `household`. This is
   **028's recorded defect** (the count does not roll up from leaves), still open. `CategoryStrip` filters
   to `productCount > 0`, so it renders the **9 leaf categories** and correctly omits the three parents —
   a top-level shortcut would open an empty listing, since category filtering is exact-match everywhere.
   The 12-tile cap is therefore **not exercised by the current seed** (9 < 12), which is why T021 must test
   it with synthetic data rather than the seed.

## Prerequisites

- `pnpm install` at repo root; a seeded dev catalogue (019 seed) for the rails/categories/promotions to
  have data. For the newsletter walk: `make db-up ENV=dev` (after committing the migration) and the
  `edge-customer` service deployed, with 038's email path available.
- Run the storefront locally: `pnpm --filter @effy/customer-web dev` (needs `core-api` reachable for the
  storefront reads — see 019/025 quickstarts).

## US1 verification result (T019) — 2026-08-07

| Gate | Result |
|---|---|
| `pnpm --filter @effy/customer-web typecheck` | ✅ clean |
| `pnpm --filter @effy/customer-web test` | ✅ **271 passed** (33 files) — +36 new: 15 kit, 11 Hero, 10 ValueStrip |
| `pnpm --filter @effy/customer-web build` | ✅ compiled, 47/47 static pages |
| Bundle gate | ✅ all 9 routes within budget |
| `e2e/home.spec.ts` | ✅ **10 passed** (chromium + mobile), against a **production build** |
| `check-tokens` · `check-no-emerald` · `check-no-jade` | ✅ all green, unchanged |

**Bundle delta vs the T001 baseline — the constraint that governs this feature:**

| Route | Baseline | After US1 | Δ |
|---|---|---|---|
| `/` | 171.7 KB | **171.8 KB** | **+0.1 KB** |
| `/browse` · `/search` · `/product/[id]` · `/promotions/[id]` | — | — | +0.1 KB each |
| `/cart` · `/delete-account` · `/legal/*` | — | — | 0.0 KB |

US1 ships **zero client components**. The +0.1 KB is the shared chunk absorbing the three new kit
primitives, and it appears on every route that imports the kit — i.e. it is the kit growing, not the
hero. Well inside the contract's "~0 KB" requirement.

### ⚠ THE FIRST US1 BUILD WAS THE WRONG COMPOSITION — rejected at review, rebuilt

The hero was built as a **two-column grid**: copy in a left column, photograph in a separate rounded box
on the right. The operator's reference is a **single full-bleed banner** whose artwork spans the width,
with the headline, supporting line and both actions composed **on the picture's flat left half**.

⚠ **Research R2 already specified the correct composition** — "composes text over the image's flat open
area (left) with a scrim" — and the build followed its *rejected alternative* instead. R2's Decision and
its Alternatives described different layouts; that inconsistency is now fixed in R2 itself, because a
decision that contradicts itself gets implemented as whichever half the reader anchors on.

**Now built as**: full-bleed banner, `h-[26rem] / sm:30 / lg:34`, artwork `object-cover` with the crop
anchored left (`object-[18%_center]` → `lg:object-center`) so the flat zone stays under the type at every
width. Operator asset `banner-1.jpg` installed as `public/hero/hero-1.jpg`, **recompressed 847 KB → 318 KB
(q78, visually identical)** — it is the LCP element and the original was heavy.

### ⚠ Four defects found by SCREENSHOT, after every test was green (a fifth is below)

All four were invisible to the whole suite — every unit test and every e2e assertion was green while
each was live. Recorded because the lesson generalises, and it is not the usual one: these tests did not
"agree with the code" the way this repo's earlier post-mortems describe. They asserted true things.
**Layout, contrast and visual hierarchy are simply not properties a DOM assertion can see** — a
screenshot found all four, and three of them (1, 3, 4) were only visible in a specific appearance or at
a specific width. ⚠ Defect 2 is superseded by the composition rebuild above but is kept on the record,
because the *class* of bug — an unprefixed responsive utility applying at every breakpoint while a
`lg:` override makes the desktop case look correct — outlived the layout it appeared in.

1. **The value strip orphaned a divider.** It was a wrapping flex row where each claim rendered its own
   leading divider. Three claims of uneven width do not fit one line at every viewport, so the third
   wrapped and **took its divider with it** — a vertical rule dangling in empty space before a stranded
   claim. Fixed by making it a fixed three-column grid with dividers drawn as column borders, a
   structure that *cannot* enter that state. Pinned by a test asserting the structure (grid, not
   flex-wrap; exactly `n-1` bordered columns), since the pixels themselves are not assertable.
2. **⚠ The phone layout was backwards.** The hero image carried `order-first lg:order-none`, intended to
   lift the photograph above the copy at narrow widths. **`order-first` is unprefixed, so it applied at
   every size** — the desktop layout was only correct because `lg:` undid it. On a phone the headline sat
   below a 240 px placeholder and **"Shop now" landed at the very edge of the fold**, on the platform's
   only public landing page. The DOM order is already copy-then-image, so the fix was to delete the
   class. Pinned by a test that forbids any `order-*` on the media frame and asserts document order.

3. **⚠ The CTA hierarchy vanished in dark mode.** `primary` is near-black on light and near-white on dark
   — the monochrome accent inverts **by design** (Principle V). Over a photograph that does *not* invert,
   that made **both** pills pale in dark mode: two near-identical buttons with no visible primary. Fixed
   by pinning both to the ramp's ends over artwork (black pill / white pill) and keeping the ordinary
   inverting tokens for the no-artwork fallback. **This is the same defect class as 029's scrim, and the
   generalised rule is now written into the component: anything composed ON fixed artwork must itself be
   fixed** — scrim, type, and buttons are three instances of one rule.
4. **The light scrim bleached the artwork.** At `strength="strong"` the white veil washed the yellow to
   off-white. A dark veil over a photograph reads as depth; a white veil over a bright flat colour reads
   as *faded*. The light tone's values are now materially gentler than the dark tone's, with a comment
   saying why so they are not "harmonised" later.

**Reviewed at 1440×900 light, 1440×900 dark, and 390×844 + Pixel 7 phone.** All correct: banner with copy
over the flat zone, three-column strip beneath on desktop, stacked on phone, both CTAs above the fold.

### ⚠ Defect 5, reported by the operator: THE HERO IMAGE DID NOT APPEAR

After the rebuild the operator still saw the grey placeholder band. The asset was on disk and serving
correctly (`GET /hero/hero-1.jpg` → **200, 317,991 bytes**) — but the rendered page **did not reference it
at all** (`grep -c hero-1.jpg` → 0).

**Cause, and it was mine.** `lib/hero-asset.ts` resolved the asset into a module-scope `const`. On a
prerendered page that means build time, which is right for production. But **a long-running `next dev`
server evaluates the module exactly once too** — and it had started before the file existed. A cached
`null` outlived the fact it described, permanently, until restart.

⚠ **The first version of `public/hero/README.md` documented this as expected behaviour** ("requires a
rebuild before it appears"). Writing a defect down does not make it a design decision. Worse, the note
told the operator in advance not to trust the very symptom that indicated the bug.

**The general lesson**: a supported empty state that is indistinguishable from a defect is worse than no
fallback at all — the operator cannot tell "no artwork yet" from "the hero is broken", and neither can
anyone they report it to. Fixed by re-checking on every render in development while keeping the
build-time constant in production (a stat call on a dev server is free; on a request path it would not
be). Verified live on the operator's own dev server: HMR picked it up and the banner rendered.

### ⚠ Scrim removed by operator decision — FR-007 now met by its OTHER limb

The hero's light veil was removed on operator direction: it visibly faded the artwork, and the reference
has none. Defect 4 above was an attempt to tune it; the answer was that it should not be there at all.

**FR-007 is still satisfied, but by a different mechanism.** The requirement offers two — "a scrim **or**
controlled zone" — and the hero now relies on the second: the asset is authored with a flat pale-yellow
left half that carries the type, and black on it measures far above AA.

⚠ **What changed is where the guarantee lives.** It moved out of the component and into the asset. Swap
in artwork that is dark, busy, or light-on-the-right and the headline becomes unreadable **with nothing
failing** — no test, no guard, no build error, in either appearance. A test cannot look at a JPEG. So the
constraint is written into `public/hero/README.md` (≈2.2:1, left ~45% flat/pale/low-detail, subject
matter right) and a unit test asserts the *decision* — that no veil is present — so reintroducing one
has to be deliberate.

`Scrim`'s light-tone variant was **removed with the hero's use of it**, not left in place: an unused
variant of a legibility primitive is worse than no variant, because the next reader assumes it is a
tested path. The dark tone stays — US4's offer panels need it. `onLightScrim` stays too; the hero's fixed
black type still uses it.

### ⚠ The value panels take the reference's COLOURS — Principle V exception, FR-005a

Operator direction, 2026-08-07: the three value claims are now the reference's filled panels — icon,
title, supporting line — straddling the banner's bottom edge, in **`#F95F09` / `#374128` / `#6BB252`**
sampled from the reference itself.

**These are the only hues in any UI chrome on this platform.** Bounded exactly as 024 bounded the mobile
splash grounds, and every bound is a requirement in FR-005a: component-local values, **never design
tokens**, not named for a role, nothing else can import them. ⚠ **`tokens:check` passes unchanged** —
that is the mechanical proof the exception did not leak into the design system, and it is worth more
than the prose. Deleting one constant is the entire revert.

⚠ **THE REFERENCE'S OWN PANELS FAIL WCAG AA.** Measured against white text: orange **3.15:1** (large
text only), green **2.59:1** (fails outright); only the dark green passes, at 10.77:1. Copying it
faithfully would have shipped body copy nobody with low vision could read.

**Resolution: the fills are reproduced exactly and the FOREGROUND is adapted per panel** — near-black on
the two light fills (**6.67:1**, **8.12:1**), white on the dark one (**10.77:1**). Adapting the text is a
smaller deviation than repainting the colours that were actually specified, and it is the same reasoning
`onScrim`/`onLightScrim` already encode. The ratios are **computed in the unit test**, not asserted in a
comment, so changing a fill without rechecking its text colour fails the suite rather than a shopper.

### ⚠ Two further findings, neither introduced by 039

- **A Playwright strict-mode trap, not a rendering fault.** `getByRole("link", {name: /on sale/i})`
  matches **two** links — the hero's "See what's on sale" and the header nav's "On sale". Any future
  spec touching this page needs the full phrase. Fixed in `home.spec.ts` without adding a test id to
  production markup.
- **⚠ A prioritisation inversion on the LCP element.** Next emits **no `<link rel=preload>` for the hero**
  even with `priority`, because the image is `unoptimized` — while `PromoCarousel` preloads **three
  below-the-fold S3 banners**. So the largest above-the-fold image competes with three images nobody has
  scrolled to yet. The hero is at least not `loading="lazy"` (asserted). **Pre-existing `PromoCarousel`
  behaviour, not something this feature introduced** — recorded rather than fixed, since changing image
  prioritisation is a performance slice with its own measurements.

### ⚠ Residual duplication for the operator to decide (US1 review)

`StorefrontFooter.tsx` already carries a three-up value strip — "Browse without an account" / "One
basket, one delivery" / "Know before you shop" — and it is **locked by FR-002**, so this feature cannot
touch it. The hero's claims were rewritten to minimise the overlap (`One brand`, `Same day` are new),
but **`No account` still restates the footer's first panel**, and the top info strip says it a third
time. Kept deliberately: it is the guest-first promise and the hero is where a first-time visitor
actually reads it. **The likely resolution — dropping the footer's strip — is a change to a locked file
and the operator's call.**

### ⚠ Pre-existing e2e failures found — NOT caused by 039

Running the storefront's existing Playwright specs surfaced failures in **`ssr-seo.spec.ts`**,
**`guest.spec.ts`** and **`deferred-signin.spec.ts`**. They are **not regressions**: they assert copy
that has not existed in this application since the **025** UI refresh —

- `"Groceries, delivered."` (a heading), `"Why Effy"`, `"Start browsing"`

`git grep` at `HEAD` confirms all three strings appear **only inside the spec files** and in no
component, so these assertions could not have passed before 039 touched anything. The 025 refresh
renamed the hero copy and the specs were never updated with it.

**What that means, and it is worse than the failures themselves**: the storefront's e2e suite covers
the guest journey, SSR/SEO no-cloaking (FR-008) and deferred sign-in — and it has been red, or simply
unrun, for several slices. `pnpm test` runs **Vitest only**; Playwright is a separate command that CI
evidently does not gate on.

**Deliberately not fixed here.** Repointing those assertions is a copy decision on 025's surface, not
039's, and quietly editing another slice's tests to green is how a stale suite gets staler. It needs
its own task. **039's own e2e spec (`e2e/home.spec.ts`) passes 8/8.**

### US1 — Hero + value strip
1. Load `/`. **Expect**: headline, supporting line, primary + secondary CTA, value strip with honest copy.
2. With `apps/customer-web/public/hero/hero-1.jpg` present → the image renders, text legible over/beside it
   in **light and dark** (toggle appearance). Remove the file → a neutral placeholder, **no broken image**.
3. Narrow the viewport to phone width → single column, no crowding, no layout shift when art loads (SC-001).

### US2 — Category strip
1. **Expect** a horizontal row of category shortcuts for stocked categories; each opens
   `/search?category=…`; "view all categories" opens `/browse` (SC-002).
2. A category with no image → neutral initial tile, not a broken frame (FR-014).
3. Seed with zero stocked categories → the section is absent (FR-004).

### US3 — Merchandised rails
1. **Expect** on-sale, featured and category sections, each using the **unchanged product card**, each with
   a working "view all" (SC-003).
2. Force a catalogue error (stop `core-api`) → one friendly "couldn't load the store" state (FR-016).
3. Empty catalogue → "shelves being stocked" state.

### US4 — Offers panels
1. Advertise ≥3 offer promotions (back-office) → **expect** one large + two stacked panels, legible over
   artwork in both appearances, each tapping to the promotion detail (`/promotions/[id]`).
2. Advertise <3 → only the panels with data render; **no empty panel** (FR-018).
3. Advertise none → the whole block is absent. A promotion expired between load and tap → "offer has ended"
   (FR-019).

### US5 — App promo
1. **Expect** Play/App Store badges present but **non-interactive / "coming soon"**, honest copy, no URLs
   anywhere in the section source (FR-021/FR-022). Legible in both appearances.

### US6 — Newsletter (backend)
1. Commit the migration, `make db-up ENV=dev`, deploy `edge-customer`.
2. Submit a **valid new** email → success state; a confirmation email arrives; DB row `status='pending'`.
3. Follow the confirm link → `/newsletter/confirm` shows "You're subscribed"; row `status='confirmed'`.
4. Submit an **already-subscribed** email → the **same** success surface (no "already exists" leak, FR-032);
   no duplicate row; no immediate re-send (cooldown).
5. Submit an **invalid** email → inline validation, **no** network request (FR-030).
6. Stop the edge service → submit → friendly retryable error, input preserved (FR-033).
7. Confirm with a **tampered/expired token** → "this link has expired", no disclosure.

## US2–US5 verification result — 2026-08-07

All four remaining **visual** sections built and machine-verified in one pass. Operator reviews (T028,
T038, T048, T055) deferred at the operator's direction — "continue to next steps, we will later fix UI
issues" — so they remain **open, not skipped**.

| Gate | Result |
|---|---|
| `pnpm --filter @effy/customer-web typecheck` | ✅ clean |
| `pnpm --filter @effy/customer-web test` | ✅ **331 passed** (37 files) |
| `pnpm --filter @effy/customer-web build` | ✅ compiled |
| Bundle gate | ✅ `/` **171.8 KB / 174 KB** — still **+0.1 KB** across all five sections |
| `e2e/home.spec.ts` | ✅ **28 passed** (chromium + mobile), production build |
| `check-tokens` · `tokens:check` · `check-no-emerald` · `check-no-jade` | ✅ all green, **unchanged** |

⚠ **Five sections, +0.1 KB total.** Every one is a server component; the only client islands on the page
are the ones already there (`SaveControl` on tiles, `RecentlyViewedRail`). The contract's "~0 KB added"
requirement is met with room to spare on a route that had 2.3 KB of headroom.

### What each section became

- **US2 `CategoryStrip`** — circular tiles, cap **12**, `/search?category=…` per tile, "View all
  categories" → `/browse`. ⚠ **`CategoryMosaic` deleted**, not left unused: its only call site was this
  page. The mosaic sat at the page's *bottom*; a shortcut strip is navigation and belongs before the
  thing it navigates.
- **US3 `home-composition.ts`** — the section order extracted into a **pure function**, which is what
  made FR-001's fixed order, FR-004's self-hiding and FR-020's no-duplicates testable at all. Vitest
  cannot render async Server Components, so composing first and rendering second is the only way those
  19 assertions exist.
- **US4 `OffersPanels`** — large + two-stacked from `inline`-placement banners, degrading to 2, to 1, to
  absent, never to a placeholder. Terms rendered (029's carry-forward). Destination taken from
  `href`/`target`, never hand-built — 029 shipped a banner that sent every promotion to `/search`.
- **US5 `AppPromo` + `StoreBadges`** — spans, not disabled links or buttons: a disabled `<a>` is still
  announced as a link and promises a destination that does not exist. "Coming soon" lives in each
  badge's **accessible name**, not in dimming. A source-level test greps both modules for store URLs.

### ⚠ Four defects found while building these

1. **`isEmptyStore` replaced `rails.length === 0`.** A server returning four rails with no products is
   an empty store; the old check called it a full one and would have rendered four headings above four
   blank spaces.
2. **⚠ A test fixture invented three DTO fields and `as`-cast them into shape** — `slug`, `price`,
   `compareAtPrice`, none of which exist on `StorefrontProductCardDTO`. That is 033's recorded failure
   mode verbatim. The cast is gone and the fixture is annotated, so the compiler now checks it against
   the real contract.
3. **Both degraded states dead-ended** — "check back soon" / "try again in a moment" with nothing to
   press. Each now offers a way forward (FR-043).
4. **The skeleton could not match the content** — it was two generic bar-and-grid rows while the page
   now leads with a circular strip. Rebuilt from the same primitives the real sections use (028's
   recorded defect, same shape).

### ⚠ The e2e suite is load-sensitive locally — a local artifact, not a defect

Three tests intermittently failed (~1 in 4) with the default 4 workers against one local Next server plus
`core-api`. **All pass consistently at `--workers=2 --retries=1`, and `playwright.config.ts` already
sets `retries: 2` in CI** — so CI is already configured for it and no change was needed.

Two genuine test defects were found while chasing it, both mine:
- A `waitFor` on a **different locator** than the one the test then counted, so the count raced the
  stream — it looked exactly like a missing rail.
- `getByRole("link", {name: /on sale/i})` matched **two** links (hero CTA + header nav): a strict-mode
  violation, not a rendering fault.

## US6 verification result — 2026-08-07

The newsletter, built end to end. **All code done; only the three operator steps remain** (T082 migration,
T083 deploy, T084 the live walk — the last gated on 038 being deployed).

| Gate | Result |
|---|---|
| `pnpm -r typecheck` | ✅ clean, whole workspace |
| `pnpm -r test` | ✅ **all packages green** |
| `pnpm --filter @effy/customer-web test` | ✅ **351 passed** (39 files) |
| `pnpm --filter @effy/edge-customer test` | ✅ 134 passed (+35 newsletter: 30 service, 5 config-contract) |
| `pnpm --filter @effy/email-kit test` | ✅ 52 passed |
| `make email-check` | ✅ **8 templates**, tokens + structure + size + text + drift clean |
| `e2e/newsletter.spec.ts` | ✅ **16 passed** (chromium + mobile), production build |
| Bundle gate | ✅ `/` **172.7 KB / 174 KB** · `/newsletter/confirm` **168.2 KB** |
| `brand-check` · `check-tokens` · `tokens:check` · no-emerald · no-jade | ✅ all green |

⚠ **The newsletter cost +0.9 KB on `/`** (171.8 → 172.7), leaving **1.3 KB** of headroom. That is the
measured price of a client boundary, and it was paid deliberately — see below.

### ⚠ Five defects found while building US6

1. **⚠⚠ THE PLAIN-TEXT PART OF EVERY EMAIL WAS HTML-ESCAPED.** Both parts were compiled with escaping
   on, so Handlebars turned `=` into `&#x3D;` and a confirm link rendered as
   `…/confirm?token&#x3D;ABC`. In HTML that is harmless — clients decode entities in attribute values.
   **In text/plain nothing decodes it**, so the `token` parameter is simply absent.
   **It would have broken double opt-in for every plain-text reader** — including anyone whose client
   blocks HTML — with no error anywhere: send succeeds, mail arrives, link is visible, confirmation
   silently never happens. Fixed in `render.ts` (the shared path, so it protects every template), with
   the regression test in the shared render suite rather than in 039's.
   ⚠ It was invisible until a template first needed a tokenised URL.
2. **⚠ FR-033 WAS BROKEN AND EVERY UNIT TEST PASSED.** React **resets an uncontrolled form once its
   action completes**, so the field cleared on *every* outcome — including the failure whose entire
   point is that the address survives. The error message read "your address is still here" while it
   demonstrably was not. Caught by an e2e assertion on the failure branch; fixed by holding the value
   in state. Nothing in the source hinted at it, because the reset is React's behaviour, not ours.
3. **The email guard caught a missing fixture** before any test did — `make email-check` refuses a
   template it cannot preview or verify. Working exactly as designed.
4. **⚠ 024's brand guard flagged the hero photograph as an orphaned brand asset.** It watches all of
   `apps/customer-web/public/`, and a content directory now lives there. Fixed with a narrow
   `MANAGED_SUBDIR_EXEMPT` path exemption — **not** by stopping watching `public/`, which is exactly
   where a stale favicon would hide.
5. **A test asserted a property the code did not have**, and the honest fix was to correct the test:
   "never echoes the token back into the page" fails, because Next serialises `searchParams` into the
   RSC flight payload whether or not anything renders them.

### ⚠ Two decisions worth reading before changing them

- **The newsletter form is a CLIENT component, and the plan said it would not be.** Research R3
  preferred a param-driven result and named `useActionState` only as a fallback. It is unavoidable:
  **FR-033 requires the visitor's input to survive a failure**, and a redirect cannot carry it back
  without putting an email address in the URL — where it lands in server logs, `Referer` and history.
  A kilobyte of JavaScript is the better trade than converting a transient form value into PII written
  to three places. The measured cost is +0.9 KB.
- **The confirm token appears in the confirm page's RSC payload, and that is accepted.** A
  confirm-then-redirect was built to remove it and **reverted**: `redirect()` inside a streamed
  Suspense boundary returns 200, not a 3xx, so the token stayed anyway — *and* a client without
  JavaScript was left on "Confirming…" forever. The decisive point is that **the token is already
  spent** by the time that HTML exists (confirm runs before render, single-use, hash cleared). A Route
  Handler redirecting before any HTML is produced would remove it; recorded as an option, not built.

## Gates (run before sign-off)

```bash
pnpm -r typecheck
pnpm --filter @effy/customer-web build            # PPR build
pnpm --filter @effy/customer-web size             # / ≤ 174 KB  (SC-007) — ⚠ NOT `node apps/.../bundle-budget.mjs`
                                                  #   from the repo root; it resolves .next/ relative to cwd
pnpm --filter @effy/customer-web test             # unit
pnpm --filter @effy/customer-web exec playwright test   # e2e (home sections, newsletter)
pnpm --filter @effy/edge-customer test            # newsletter service + config-contract test
make email-check                                  # newsletter-confirmation template guards
node packages/design-system/scripts/check-tokens.mjs   # SC-004 — ⚠ lives in the package, not scripts/
./scripts/check-no-emerald.sh && ./scripts/check-no-jade.sh
```

**Sign-off (SC-005)** — render `/` across: full data · no promotions · no categories · empty catalogue ·
catalogue error — confirming no empty rows and a self-explaining state in every degraded case; and
light/dark × desktop/tablet/phone (SC-006).

## Operator-supplied, still open (T093)

**Assets**
- ✅ **Hero image supplied and installed** — `banner-1.jpg` → `public/hero/hero-1.jpg`, recompressed
  847 KB → 318 KB (q78, visually identical). ⚠ Any REPLACEMENT must keep a pale, flat, low-detail
  left-hand zone; there is no scrim, so legibility is a property of the asset. Constraints are written
  in `apps/customer-web/public/hero/README.md`.
- ⬜ **App artwork** for the app-promo section — renders the neutral placeholder until supplied.
- ⬜ Real **app-store URLs** — deferred to the slice that ships the apps. Until then the badges must
  stay non-linking; a source-level test fails on any store URL in those two modules.

**Blocking the newsletter walk**
- ⬜ **Commit the migration, then `make db-up ENV=dev`** (T082 — 003's commit guard blocks it otherwise).
- ⬜ **`make edge-deploy SERVICE=customer ENV=dev`** (T083).
- ⬜ **Confirm 038 is deployed** — the confirmation email rides its email-kit send path (T084).
- ⬜ **`/effy/dev/web/site_url` in SSM.** `NEWSLETTER_CONFIRM_BASE_URL` falls back to
  `http://localhost:3000/newsletter/confirm` if it is unset. ⚠ That fallback does not crash — it emails
  a confirm link nobody outside the developer's machine can follow, and the subscription is
  permanently unconfirmable with no error anywhere. The config-contract test proves the key is
  DECLARED; only the operator can prove it has a real value.

**Deferred UI reviews** (operator direction: "continue to next steps, we will later fix UI issues")
- ⬜ T020 hero · T028 categories · T038 rails · T048 offers · T055 app promo.

## Known-open, NOT introduced by 039

Recorded so they are not mistaken for this slice's work, and not silently fixed inside it:

- ⚠ **Three storefront e2e specs are stale since 025.** `ssr-seo.spec.ts`, `guest.spec.ts` and
  `deferred-signin.spec.ts` assert copy (`"Groceries, delivered."`, `"Why Effy"`, `"Start browsing"`)
  that `git grep` at HEAD finds **only inside the spec files**. They could not have passed before 039
  touched anything.
- ⚠ **Two `a11y.spec.ts` tests reference a delivery-location control that no longer exists** — removed
  with the delivery withdrawal. **Verified against a stashed, clean HEAD build**: the string appears
  **zero** times, so these fail without 039 too.
- ⚠ **`SaveControl` is 36×36 on web** — below the 44 px minimum, on every product tile. 033 raised the
  MOBILE control from 32 dp to 48 dp for exactly this reason and never raised the web one. Excluded by
  name from 039's touch-target guard so the guard stays useful; owned by the saved-items surface.
- ⚠ **`PromoCarousel` dot indicators are 8×8** (029). Tiny by design as indicators, but they are
  anchors, so they are also targets.
- ⚠ **The hero is not preloaded while three below-the-fold promo banners are.** Next emits no
  `<link rel=preload>` for an `unoptimized` image even with `priority`. A prioritisation inversion on
  the LCP element, owned by `PromoCarousel`.
- ⚠ **PostHog has never been initialised on `customer-web`** (CLAUDE.md §033), so `capture()` is a
  permanent no-op. 039 declared five events and ships **one**, server-side; the other four were dropped
  rather than shipped as measurement that measures nothing.

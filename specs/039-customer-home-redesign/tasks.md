---
description: "Task list for 039 — Customer Web Home: Merchandised Landing Redesign"
---

# Tasks: Customer Web Home — Merchandised Landing Redesign

**Input**: Design documents from `/specs/039-customer-home-redesign/`

**Prerequisites**: [plan.md](plan.md) (required), [spec.md](spec.md) (user stories), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: INCLUDED. The plan's Testing section names them explicitly (Vitest web unit + edge unit/container,
Playwright e2e, `make email-check` guards, the config-contract test) and 035/038 recorded what happens when a
config key or a wire shape ships untested. Test tasks are therefore first-class here, not optional.

**Organization**: Tasks are grouped by User Story. **Delivery is section by section, top to bottom** (spec
SC-010) — each User Story phase is one reviewable section, and the page stays coherent after each because
every section self-hides on empty data and later sections simply do not exist yet.

⚠ **Revised 2026-08-07 by the `/speckit-analyze` pass** (1 critical, 5 high, 17 lower findings — all
applied). Two changes are decisions, not corrections, and are recorded in the spec/plan rather than here:
FR-035's rate limiting narrowed to the per-address cooldown (the gateway throttle was **unbuildable** where
it was placed), and four of the five declared telemetry events **dropped** (each needed a client boundary on
a page with ~3.5 KB of headroom, and PostHog is not initialised on `customer-web` at all).
**T018, T026, T036 and T046 no longer exist** — the IDs are deliberately left as gaps rather than
renumbering 95 tasks and breaking every cross-reference. **T069a, T085a and T085b are new.**
Net: **94 tasks**.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story the task belongs to (US1…US6). Setup / Foundational / Polish carry no label.
- Every task names an exact file path.

## Path Conventions

Monorepo (Turborepo + pnpm), paths from repository root:

- **Web**: `apps/customer-web/` — `app/(shop)/` (route + sections), `components/storefront/kit.tsx` (shared
  vocabulary), `lib/`, `e2e/`, `scripts/bundle-budget.mjs`
- **Contracts**: `packages/shared-types/src/`
- **Email**: `packages/email-kit/src/`
- **Cold-path backend**: `apis/edge-api/customer/`
- **Data**: `db/migrations/`

⚠ **Locked by operator decision (FR-002) — DO NOT EDIT in this feature**: `app/(shop)/layout.tsx`
(header/nav/info-strip/footer), `app/(shop)/_components/ProductCard.tsx`,
`app/(shop)/_components/StorefrontFooter.tsx`, `app/(shop)/_components/PrimaryNav.tsx`,
`app/(shop)/_components/MobileNav.tsx`, `app/(shop)/_components/HeaderSearch.tsx`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the baselines every later task is measured against. No product code.

- [X] T001 Record the pre-redesign baseline: run `pnpm --filter @effy/customer-web build` then
      `node apps/customer-web/scripts/bundle-budget.mjs`, and write the measured per-route gzip KB for all
      nine guest routes into a new `## Baseline (pre-039)` section at the top of
      `specs/039-customer-home-redesign/quickstart.md` — the redesign's net client-JS delta (SC-007, contract
      "Budget: ~0 KB added") is meaningless without the number it started from.
- [X] T002 [P] Create `apps/customer-web/public/hero/` with a committed `.gitkeep` and a `README.md` stating
      the expected filename (`hero-1.jpg`), that the asset is **operator-supplied photographic content, not a
      design token** (research R2), and that its absence MUST render the neutral placeholder, never a broken
      frame (FR-011).
- [X] T003 [P] Verify the colour guards are green before any change so a later failure is attributable:
      run `node scripts/check-tokens.mjs`, `scripts/check-no-emerald.sh`, `scripts/check-no-jade.sh` and note
      the result in `specs/039-customer-home-redesign/quickstart.md` under the baseline section.
- [X] T004 [P] Confirm the storefront reads this feature depends on are reachable locally — `core-api` up
      (`make core-run`) and `GET /v1/storefront/home` + `GET /v1/storefront/categories` returning seeded data
      — and record the rail keys actually present (`on_sale`, `featured`, `category:*`) in
      `specs/039-customer-home-redesign/quickstart.md`, since the section contract's rows 2/4/5/8 are keyed
      on them.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared vocabulary more than one section needs. Deliberately small — this is a presentation
slice, so anything only one section uses belongs in that section's phase.

**⚠ CRITICAL**: No User Story section work begins until **T005–T010** are complete. (T010 is in the gate
because T013, T022, T031 and T045 all *extend* `e2e/home.spec.ts`, which only T010 creates.)

- [X] T005 Add a `MediaFrame` primitive to `apps/customer-web/components/storefront/kit.tsx` — a
      server-rendered image container that takes `src: string | null`, a fixed aspect ratio and an `alt`, and
      renders a **neutral on-brand placeholder** (ramp tokens only, optional initial/label) when `src` is
      null or the asset is absent. It reserves its box so no layout shift occurs when the asset arrives
      (SC-001). Reused by Hero (US1), CategoryStrip (US2) and OffersPanels (US4) — FR-011/FR-014/FR-018.
- [X] T006 Add a `Scrim` helper to `apps/customer-web/components/storefront/kit.tsx` — the
      neutral-gradient overlay + controlled text zone that guarantees text legibility over arbitrary
      photographic artwork in **both appearances**, using only ramp tokens (FR-007, research R2). Extract the
      technique already inlined in `app/(shop)/_components/PromoCarousel.tsx` and `CategoryTile.tsx` rather
      than writing a third variant (Principle II).
- [X] T007 Add a `SectionShell` wrapper to `apps/customer-web/components/storefront/kit.tsx` that
      standardises every new section's outer container (`mx-auto w-full max-w-7xl px-4 sm:px-6`), its vertical
      rhythm, its heading level (`h2`, so the page keeps exactly one `h1` — SC-009) and its optional "view
      all" action, and that **renders `null` when handed no children/data** so FR-004's self-hiding rule is
      structural rather than repeated per section.
- [X] T008 [P] Add unit tests for the three foundational primitives in
      `apps/customer-web/components/storefront/kit.test.tsx`: `MediaFrame` with `src=null` renders the
      placeholder and **no `<img>`**; `SectionShell` with empty children renders nothing; `Scrim` emits only
      ramp-token classes (asserted by a regex that rejects any `#`-hex or non-neutral colour utility).
- [X] T009 [P] Add the feature's **one** telemetry event to `apps/customer-web/lib/telemetry.ts` —
      `newsletter_submitted` with `outcome: "ok" | "invalid" | "error"` — as a typed event key. It fires
      **server-side from the Server Action** (T080), so it costs zero client bytes. Never an email, never
      PII (FR-042).
      ⚠ The four client-side events this plan originally declared (`home_section_viewed`,
      `home_hero_cta_clicked`, `home_category_shortcut_clicked`, `promo_panel_clicked`) are **dropped** —
      each needs a client boundary on a page with ~3.5 KB of headroom, and PostHog has never been
      initialised on `customer-web` at all (CLAUDE.md §033), so they would have cost real bytes to record
      nothing. See plan § Telemetry. **Do not add them back without initialising PostHog first** — that is
      033's carry-forward and its own slice.
- [X] T010 [P] Add a `home-sections` Playwright spec skeleton at `apps/customer-web/e2e/home.spec.ts` with
      one always-true structural assertion (the page has exactly one `h1`) so each section phase appends to a
      file that already runs in CI rather than creating one at the end.

**Checkpoint**: Shared primitives exist and are tested — section building can begin.

---

## Phase 3: User Story 1 - A welcoming, image-led hero (Priority: P1) 🎯 MVP

**Goal**: Replace the type-led hero with an image-led band — headline, supporting line, primary + secondary
action, hero image (or neutral placeholder), and an honest value strip beneath.

**Independent Test**: Load `/` as a guest. The hero renders with headline, supporting copy, both actions
(primary → browse, secondary → a real destination), the value strip and — where `public/hero/hero-1.jpg`
exists — the image; remove the file and a neutral placeholder fills the space with no broken-image frame.
Legible in light and dark, reflows to one column at phone width, no layout shift when the art loads.

### Tests for User Story 1

- [X] T011 [P] [US1] Unit test `apps/customer-web/app/(shop)/_components/Hero.test.tsx`: the hero renders a
      headline, a supporting line, **two** actions with real `href`s, and delegates its image to `MediaFrame`;
      with no hero asset configured it renders the placeholder and emits no `<img>` (FR-011).
- [X] T012 [P] [US1] Unit test `apps/customer-web/app/(shop)/_components/ValueStrip.test.tsx`: every claim
      rendered is drawn from a single exported `VALUE_CLAIMS` constant, and a guard assertion fails if any
      claim string contains a digit followed by `+` or the words `rated`/`reviews`/`guarantee` — the
      mechanical form of FR-010's "no invented numbers, ratings or guarantees" (spec US1 scenario 4).
- [X] T013 [P] [US1] Extend `apps/customer-web/e2e/home.spec.ts`: the hero is present in the **raw SSR HTML**
      (fetch the page without JS and assert the headline + both action hrefs are in the served markup) —
      FR-012/FR-040, following the pattern in `apps/customer-web/e2e/ssr-seo.spec.ts`.

### Implementation for User Story 1

- [X] T014 [US1] Rewrite `apps/customer-web/app/(shop)/_components/Hero.tsx` as an image-led two-column band:
      headline (`Display`), supporting line, primary `ActionLink` → `/browse`, secondary `ActionLink` →
      `/search?saleOnly=true`, and the image rendered through `MediaFrame` (T005) wrapped in `Scrim` (T006)
      where text overlaps art. Single column below `sm`. All chrome on ramp tokens only (FR-005/FR-007).
- [X] T015 [US1] Create `apps/customer-web/app/(shop)/_components/ValueStrip.tsx` — the honest
      selection/quality/delivery strip beneath the hero, exporting a `VALUE_CLAIMS` constant whose entries are
      all true of the platform as built (carry forward the existing `Hero.tsx` stat wording: one basket/one
      delivery, no account needed to browse, same day in serviced areas). No card containers (Principle V).
- [X] T016 [US1] Wire the hero + value strip into `apps/customer-web/app/(shop)/page.tsx` inside the **static
      shell** (outside the `<Suspense>` boundary) so they are prerendered and crawlable (FR-012/FR-040), and
      keep the existing `sr-only` `<h1>` as the page's single top-level heading.
- [X] T017 [US1] Resolve the hero asset from a known static location in
      `apps/customer-web/app/(shop)/_components/Hero.tsx` — read `public/hero/hero-1.jpg` existence at build/
      module scope (never a runtime `fetch`), falling back to the `MediaFrame` placeholder. No broken `<img>`
      is ever emitted (FR-011).
- [X] T019 [US1] Verify US1: `pnpm --filter @effy/customer-web test`, `pnpm --filter @effy/customer-web build`,
      `node apps/customer-web/scripts/bundle-budget.mjs` (`/` ≤ 174 KB), and confirm the delta against T001's
      baseline is ~0 KB.
- [ ] T020 [US1] **Operator review** (quickstart § US1): load `/` with and without the hero asset, in light
      and dark, at desktop and phone width; confirm no broken image, no layout shift, both actions land
      somewhere real (SC-001).

**Checkpoint**: The hero section is finished and reviewable. The rest of the page is unchanged and coherent.

---

## Phase 4: User Story 2 - Browse by category shortcuts (Priority: P1)

**Goal**: A horizontal row of category shortcuts (image/initial tile + name) below the hero, each opening
that category's listing, plus a "view all categories" affordance.

**Independent Test**: The row renders one shortcut per stocked category (up to the cap), each navigating to
`/search?category=<key>`; "view all categories" opens `/browse`; a category with no image shows a neutral
initial tile; with zero stocked categories the whole section is absent.

### Tests for User Story 2

- [X] T021 [P] [US2] Unit test `apps/customer-web/app/(shop)/_components/CategoryStrip.test.tsx`: renders one
      shortcut per stocked category with `href="/search?category=<encoded key>"`; **caps the row at 12**
      (plan § Numeric thresholds, contract row 1) — assert with 13 stocked categories that exactly 12 render;
      renders a neutral initial tile (no `<img>`) when `imageUrl` is null (FR-014); renders
      **nothing at all** when every category has `productCount === 0` (FR-004, spec US2 scenario 4).
- [X] T022 [P] [US2] Extend `apps/customer-web/e2e/home.spec.ts`: from `/`, clicking the first category
      shortcut lands on a category listing, and "view all categories" lands on `/browse` — SC-002's
      one-tap/one-more-tap claim, measured rather than asserted.

### Implementation for User Story 2

- [X] T023 [US2] Create `apps/customer-web/app/(shop)/_components/CategoryStrip.tsx` — a server component
      taking `StorefrontCategoryDTO[]`, filtering to `productCount > 0`, capping the row at **12** (a named
      exported constant, not a literal at the call site — T021 asserts it), and rendering each
      as a circular `MediaFrame` tile + name inside `SectionShell` with a "view all categories" action to
      `/browse` (research R6). Horizontally scrollable at narrow widths; every tap target **≥ 44 × 44 CSS px**
      (plan § Numeric thresholds, SC-009).
- [X] T024 [US2] Insert `CategoryStrip` as section 1 of the composition in
      `apps/customer-web/app/(shop)/page.tsx`, inside the streamed `<Suspense>` hole (it depends on the
      request-time categories read) per the section contract.
- [X] T025 [US2] Decide and record the fate of `apps/customer-web/app/(shop)/_components/CategoryMosaic.tsx`
      (research R7: retire or repurpose). If retired, delete the file **and** its import in `page.tsx` in the
      same change — no orphaned component, no dead export.
- [X] T027 [US2] Verify US2: `pnpm --filter @effy/customer-web test`, build, and the bundle gate; confirm the
      strip adds no client JS.
- [ ] T028 [US2] **Operator review** (quickstart § US2): confirm the row, the per-category navigation, the
      neutral tile for an image-less category, and the section's absence with zero stocked categories.

**Checkpoint**: Hero + category shortcuts are both finished and independently reviewable.

---

## Phase 5: User Story 3 - Discover products through merchandised sections (Priority: P1)

**Goal**: A stack of named product sections — on-sale, featured, and category rows — each a rail of the
**unchanged** product card with a working "view all", giving the page its long merchandised character.

**Independent Test**: With a seeded catalogue, at least three distinct titled sections render, each using the
current `ProductCard` unchanged, each with a "view all" to the matching listing; a section with no products
is omitted; the whole block degrades to one friendly retryable state on a catalogue error and to an "on its
way" state when the catalogue is empty.

### Tests for User Story 3

- [X] T029 [P] [US3] Unit test `apps/customer-web/app/(shop)/home-composition.test.tsx`: given a
      `StorefrontHomeDTO`, the composer emits sections in the **full** contract order — category strip →
      on-sale → offers A → featured → category rails → offers B → app promo → another rail → newsletter →
      recently-viewed (contract rows 1–10; row 0's hero and rows 7/9/10 are placed directly by `page.tsx`,
      so assert explicitly **which rows `composeSections` owns** and which the page places, or a partial
      assertion will pass while the page order drifts). It **omits** any section whose data is empty and
      never emits an empty frame (FR-004, contract § Interleave rule).
- [X] T030 [US3] Unit test in the same file: `railHref()` maps `on_sale` → `/search?saleOnly=true`,
      `category:<k>` → `/search?category=<k>` and everything else → `/search` (research R6) — pin it now that
      the rails are placed by key rather than iterated blindly.
- [X] T031 [P] [US3] Extend `apps/customer-web/e2e/home.spec.ts`: at least three distinct titled product
      sections are present with the seeded catalogue and each "view all" resolves to a listing page (SC-003).

### Implementation for User Story 3

- [X] T032 [US3] Extract the rail-placement logic in `apps/customer-web/app/(shop)/page.tsx` into a pure,
      testable `composeSections(home, categories)` helper in
      `apps/customer-web/app/(shop)/home-composition.ts` that returns the ordered section descriptors from the
      contract table — the page then renders descriptors instead of `rails.map()`, which is what makes the
      interleave rule and the self-hiding rule testable without rendering.
- [X] T033 [US3] Recompose `apps/customer-web/app/(shop)/page.tsx` to render the composed sections: on-sale
      rail, featured rail, category rails and a trailing "next unused rail", each via the **reused**
      `ProductRail` with `railHref` (contract rows 2/4/5/8). `ProductCard.tsx` is not touched (FR-002).
- [X] T034 [US3] Keep the existing `EmptyStore` / `StoreUnavailable` states as the **single** degraded state
      for the whole merchandised block in `apps/customer-web/app/(shop)/page.tsx`, and add a way forward to
      each — a retry/link affordance — so FR-016/FR-043 are met rather than only the message half.
- [X] T035 [US3] Update `HomeSkeleton` in `apps/customer-web/app/(shop)/page.tsx` so the streaming fallback
      matches the **new** section count and shape (028's defect: a skeleton built from different primitives
      than the content cannot match it) — build it from the same `SectionShell`/grid primitives the real
      sections use.
- [X] T037 [US3] Verify US3: `pnpm --filter @effy/customer-web test`, build, bundle gate, and the degraded
      paths by stopping `core-api` (error state) and pointing at an empty catalogue (empty state).
- [ ] T038 [US3] **Operator review** (quickstart § US3): three-plus sections with the unchanged product card,
      working "view all"s, and both degraded states self-explaining (SC-003, FR-016).

**Checkpoint**: The page is already a longer merchandised landing — the P1 MVP is complete and shippable.

---

## Phase 6: User Story 4 - Promotional offer panels (Priority: P2)

**Goal**: A promotions block in the reference's composition — one large panel beside two stacked panels —
driven by advertised **`inline`-placement** banners, each panel tapping through to the promotion's full detail;
a second block lower on the page using any remaining offers, never duplicating one shown above.

**Independent Test**: With ≥3 advertised offer promotions the block renders large + two stacked, each legible
over its artwork in both appearances, each opening `/promotions/[id]`; with fewer, only panels with data
render and never an empty frame; with none, the block is absent; a promotion that ended between load and tap
resolves to "this offer has ended".

### Tests for User Story 4

- [X] T039 [P] [US4] Unit test `apps/customer-web/app/(shop)/_components/OffersPanels.test.tsx`: 3+ offers →
      one large + two stacked; 2 offers → two panels and **no placeholder**; 1 offer → one panel; 0 offers →
      renders nothing (FR-018, spec US4 scenarios 3/4).
- [X] T040 [US4] Unit test in `apps/customer-web/app/(shop)/home-composition.test.tsx`: block B receives
      only offers **not** consumed by block A, and the same promotion `key` never appears twice on the page
      (FR-020).
- [X] T041 [P] [US4] Unit test in `apps/customer-web/app/(shop)/_components/OffersPanels.test.tsx` that each
      panel's `href` is derived from the banner's `href`/`target`
      (`{kind:"promotion", promotionId}` → `/promotions/<id>`) rather than a hand-built string — 029's
      post-sign-off defect was a banner tap that went to the unfiltered store because the target was ignored.

### Implementation for User Story 4

- [X] T042 [US4] Create `apps/customer-web/app/(shop)/_components/OffersPanels.tsx` — a server component
      taking `BannerDTO[]` already filtered to **`placement === "inline"`** (⚠ **not `"offers"`** — that
      value does not exist; `BannerPlacement` is `"carousel" | "inline"`, and `inline` is the dedicated
      offers placement 029 created. Live seed has 2), rendering the large + two-stacked
      composition with `MediaFrame` artwork under `Scrim` (FR-017), each panel showing title, subtitle and
      `terms` when present (029's carry-forward: a promotion with a minimum must not show without its terms —
      FR-037d), and collapsing to the panels it has data for.
- [X] T043 [US4] Filter banners by placement in `apps/customer-web/app/(shop)/home-composition.ts` —
      **`inline`** feeds `OffersPanels`, **`carousel`** continues to feed the reused `PromoCarousel`
      (029 FR-027: exclusive, never both) — and pass block A's consumed keys to block B. ⚠ Treat a **missing**
      `placement` as `"carousel"`, matching the column default the DTO documents, so a banner from a
      not-yet-redeployed server degrades to the safe case instead of vanishing.
- [X] T044 [US4] Place offers block A (after the on-sale rail) and offers block B (after the category rails)
      in `apps/customer-web/app/(shop)/page.tsx` per the contract's rows 3 and 6.
- [X] T045 [US4] Confirm the "offer has ended" path needs no new work: `/promotions/[id]` already re-applies
      Home's visibility predicate and 404s to an ended state (029). Add an assertion to
      `apps/customer-web/e2e/home.spec.ts` that a panel href resolves to that route, and record in
      `specs/039-customer-home-redesign/quickstart.md` that FR-019 is satisfied by the existing route rather
      than by new code.
- [X] T047 [US4] Verify US4: `pnpm --filter @effy/customer-web test`, build, bundle gate; confirm zero added
      client JS (the panels are plain server-rendered links).
- [ ] T048 [US4] **Operator review** (quickstart § US4): advertise ≥3 offer promotions in the back-office,
      confirm the composition, legibility over artwork in **both appearances**, and the tap-through; then
      advertise fewer and none, confirming graceful degradation and total absence (FR-018).

**Checkpoint**: Promotions render in the reference's composition and the page reads as a merchandised landing.

---

## Phase 7: User Story 5 - Awareness of the mobile apps (Priority: P3)

**Goal**: A "get the app" section with Google Play and App Store badges that are visibly present but
**non-interactive and clearly "coming soon"**, honest copy, and space for app artwork.

**Independent Test**: The section renders both badges, neither navigates anywhere, the copy claims nothing
false, and **no store URL exists anywhere in the section's source**.

### Tests for User Story 5

- [X] T049 [P] [US5] Unit test `apps/customer-web/app/(shop)/_components/StoreBadges.test.tsx`: both badges
      render; neither emits an `<a href>` or any `apps.apple.com` / `play.google.com` string; each carries an
      accessible "coming soon" label so the state is not conveyed by styling alone (FR-021, SC-009).
- [X] T050 [US5] Add a source-level guard assertion in the same test that greps the section's own module
      text for `http`-scheme store URLs and fails on any match — the constitution's real-world-identifier
      rule made mechanical (no invented outward-facing URL).

### Implementation for User Story 5

- [X] T051 [P] [US5] Create `apps/customer-web/app/(shop)/_components/StoreBadges.tsx` — inline SVG/monochrome
      Play and App Store marks rendered as **disabled, non-linking** elements with a visible "Coming soon"
      chip, entirely on ramp tokens (FR-005). No URLs (FR-021).
- [X] T052 [US5] Create `apps/customer-web/app/(shop)/_components/AppPromo.tsx` — the section: honest headline
      and copy that makes no claim of current availability (FR-022), the badges, and a `MediaFrame` space for
      app artwork that renders the neutral placeholder until an asset exists.
- [X] T053 [US5] Place `AppPromo` at contract row 7 in `apps/customer-web/app/(shop)/page.tsx`, in the
      **static shell** (it depends on no request-time data, FR-040).
- [X] T054 [US5] Verify US5: `pnpm --filter @effy/customer-web test`, build, bundle gate; confirm legibility
      in both appearances.
- [ ] T055 [US5] **Operator review** (quickstart § US5): badges present, non-interactive, honestly labelled;
      no URLs in the rendered source.

**Checkpoint**: All visual sections are delivered. Only the newsletter (new capability) remains.

---

## Phase 8: User Story 6 - Subscribe to Effy updates (newsletter) (Priority: P3)

**Goal**: A visitor submits an email, the platform records the interest, sends a double-opt-in confirmation
email through `@effy/email-kit`, and gives distinct, non-leaking feedback for success, invalid input and
failure — with zero added client JavaScript.

**Independent Test**: A valid new email → success state + confirmation email + `status='pending'` row;
following the link → `/newsletter/confirm` shows "You're subscribed" and the row flips to `confirmed`; an
already-subscribed email → the **same** success surface, no duplicate row, no immediate re-send; an invalid
email → inline validation with no request; a stopped backend → friendly retryable error with input preserved;
a tampered token → "this link has expired" with no disclosure.

**⚠ Dependency**: the confirmation email rides 038's email-kit send path, which is **code-complete but not
deployed** (research R5). US6 is sequenced last for exactly this reason; **T084**'s operator walk is blocked
on 038 being deployed, everything before it is not.

### Contract & data (do first — everything else depends on these)

- [ ] T056 [P] [US6] Create `packages/shared-types/src/newsletter.ts` with `NewsletterSubscribeRequest`,
      `NewsletterSubscribeResult` (**three** variants — `{status:"ok"} | {status:"invalid"} |
      {status:"error"}`; the `error` arm is what T078/T080 and FR-033's retryable state need, and there is
      deliberately **no `already` arm** — that is FR-032's enumeration oracle) and `NewsletterConfirmResult`
      (`{status:"confirmed"|"expired"}`) exactly as pinned in
      [contracts/newsletter-api.contract.md](contracts/newsletter-api.contract.md) — the SSOT both web and
      edge import (Principle II).
- [ ] T057 [US6] Export the new module from `packages/shared-types/src/index.ts` under a
      `// 039-customer-home-redesign` comment, matching the existing per-slice grouping.
- [ ] T058 [US6] Create the forward-only Goose migration
      `db/migrations/<timestamp>_newsletter_subscriber.sql` per [data-model.md](data-model.md): `CREATE
      EXTENSION IF NOT EXISTS citext`, then `public.newsletter_subscriber` (`id uuid PK
      gen_random_uuid()`, `email citext UNIQUE`, `status text CHECK IN ('pending','confirmed',
      'unsubscribed') DEFAULT 'pending'`, `confirm_token_hash text NULL`, `confirm_sent_at timestamptz NULL`,
      `confirmed_at timestamptz NULL`, `created_at`/`updated_at timestamptz DEFAULT now()`). `+goose Down`
      drops the table (dev-only single-step down, 003). **No FK to `public.customer`** (research R8).

### Email template

- [ ] T059 [P] [US6] Author `packages/email-kit/src/templates/newsletter-confirmation.mjml` — the double
      opt-in message: what they signed up for, one confirm button/link, an expiry sentence, no discount or
      incentive claim (FR-034). Monochrome by generation from `src/generated/theme.mjml`; **every text colour
      declares its own background** (038's forced-dark-mode rule); MJML comments stripped.
- [ ] T060 [P] [US6] Author the text part `packages/email-kit/src/text/newsletter-confirmation.txt.hbs` —
      038's guards fail a template with no text part.
- [ ] T061 [US6] Register `newsletter-confirmation` in `packages/email-kit/src/catalog.ts` with
      `category: "transactional"` (it is an opt-in confirm action, research R5 — a `lifecycle` entry would
      require an unsubscribe URL that does not yet exist), its variable shape (`confirmUrl: string`,
      `expiresIn: string`), audience `customer`, and an explicit `onSendFailure` policy with the reason stated
      in a comment.
- [ ] T062 [US6] Run `make email-gen` to compile the committed artifacts, then `make email-check` — drift,
      **both** size budgets, missing text part, banned techniques, nested `@`-rules, contrast in all three
      passes, mid-tone band, placeholder integrity, category/unsubscribe. Fix and re-run until green.
- [ ] T063 [P] [US6] Add a render test at `packages/email-kit/test/newsletter-confirmation.test.ts`,
      alongside the existing per-template tests (`test/order-confirmation.test.ts` — **not** `src/`, which
      holds none), asserting the confirmation renders with a plausible `confirmUrl`, that the URL appears in **both** the
      HTML and text parts, and that the body contains no discount/incentive wording (FR-034).

### Backend — cold path (`edge-customer`)

- [ ] T064 [P] [US6] Create `apis/edge-api/customer/src/newsletter/repo.ts` — raw SQL, no ORM: an idempotent
      `INSERT … ON CONFLICT (email) DO UPDATE` that **only** rotates `confirm_token_hash` and bumps
      `confirm_sent_at` when `status='pending'` AND `confirm_sent_at` is older than the cooldown (returning
      whether a send is due), plus a `confirm(tokenHash)` that flips a pending, in-TTL row to `confirmed`,
      sets `confirmed_at` and NULLs the hash. Both in one statement each — the check and the write cannot be
      separated (027's `FOR UPDATE` lesson).
- [ ] T065 [US6] Create `apis/edge-api/customer/src/newsletter/service.ts` — validate (syntactic + length
      bound) → normalise (trim + lowercase) → generate a random token, store **only its hash** (035's
      posture) → call the repo → send `newsletter-confirmation` via `@effy/email-kit/send` **only when the
      repo says a send is due**, following the shape of `apis/edge-api/customer/src/password/notify.ts`.
      Returns the **uniform** result for new/pending/confirmed alike (FR-032). TTL **24 h**, cooldown
      **1 h** (data-model § Timing constants), both read from env with those defaults — never a literal.
- [ ] T066 [US6] Create `apis/edge-api/customer/src/functions/customer-newsletter-v1-post.ts` and
      `apis/edge-api/customer/src/functions/customer-newsletter-v1-confirm-get.ts` — thin edge handlers over
      the service, returning `202 {status:"ok"}` / `400 {status:"invalid"}` / `429` per the API contract, and
      `200 {status:"confirmed"|"expired"}` for confirm. **No 429 route** — see T067. Structured logs on both
      paths (plan § Telemetry).
- [ ] T067 [US6] Add the two **public (no authorizer)** routes to `apis/edge-api/customer/serverless.yml`
      (`POST /customer/v1/newsletter`, `GET /customer/v1/newsletter/confirm`), alongside the existing
      `healthz`/`readyz` public precedent, declaring the new env keys (`NEWSLETTER_CONFIRM_BASE_URL`,
      `NEWSLETTER_TOKEN_TTL_HOURS=24`, `NEWSLETTER_RESEND_COOLDOWN_MINUTES=60`). Add a comment stating **why a
      marketing route sits in a profile service** (research R1) so the routing law is not read as broken.
      ⚠ **NO per-route throttling here.** The first draft of this task specified it; HTTP API throttling is a
      Terraform-owned *stage* `route_settings` property and this service attaches via an external
      `httpApi.id`, so no `serverless.yml` edit can set it. FR-035 was amended to the per-address cooldown,
      which T064 builds and T069a proves. Do not add a throttle here — it will silently do nothing.
- [ ] T068 [P] [US6] Unit tests `apis/edge-api/customer/src/newsletter/service.test.ts`: invalid email → no DB
      call, no email; new email → row + send; already-pending inside cooldown → **same result, no send, no
      token rotation**; already-confirmed → same result, no send; send failure → the subscription still
      recorded and the failure logged loudly.
- [ ] T069 [P] [US6] Container test `apis/edge-api/customer/src/newsletter/repo.container.test.ts` (the
      existing `closure/repo.container.test.ts` pattern): the unique constraint is case-insensitive
      (`A@b.com` and `a@b.com` are one row), the cooldown predicate actually suppresses a rotation, and
      `confirm` is single-use — a second call with the same token returns expired. Assert the TTL and
      cooldown against the pinned **24 h / 1 h** (data-model § Timing constants).
- [ ] T069a [US6] **FR-035's only test.** In `apis/edge-api/customer/src/newsletter/service.test.ts`, prove
      the abuse property directly: submitting the same address **N times in a row** creates exactly **one**
      row and sends exactly **one** email, and the second submission's *response is byte-identical* to the
      first. ⚠ This is the whole of FR-035's enforcement now that the gateway throttle is gone (spec
      amendment, research R4) — before this task the requirement had implementation but **no test at all**.
      Also assert what it does **not** cover: a loop over *distinct* addresses still sends one email each,
      which R4 records as accepted and is not a bug.
- [ ] T070 [US6] Add the **config-contract test** `apis/edge-api/customer/src/newsletter/config.contract.test.ts`
      that reads the **real** `apis/edge-api/customer/serverless.yml` and asserts it declares every env key the
      newsletter service reads — including `NEWSLETTER_CONFIRM_BASE_URL`, `NEWSLETTER_TOKEN_TTL_HOURS` and
      `NEWSLETTER_RESEND_COOLDOWN_MINUTES` — self-checked against email-kit's exported `MAIL_ENV_KEYS`; the fifth guard of
      035's defect (four env vars the service read and `serverless.yml` never declared, with 100 passing tests
      missing it because they set the vars themselves).
- [ ] T071 [P] [US6] Add a negative test asserting the subscribe response body and status are **identical**
      for a new, a pending and a confirmed address — FR-032's non-enumeration property, pinned so a future
      "helpful" 409 cannot be added without failing a test.

### Web — zero-JS form and confirm page

- [ ] T072 [US6] Create `apps/customer-web/app/(shop)/newsletter/actions.ts` — a Server Action that
      re-validates the email server-side, calls `POST /customer/v1/newsletter` through the existing edge
      client (`apps/customer-web/lib/api/edge.ts`), and returns the typed result. No client fetch, no client
      validation library (research R3).
- [ ] T073 [US6] Create `apps/customer-web/app/(shop)/_components/NewsletterForm.tsx` — a **server component**
      rendering a plain `<form>` with `type="email" required` (first-pass validation with no request, FR-030)
      bound to the Server Action, using `Field`/`input`/`btnClass` from `components/storefront/kit.tsx`.
      **Three** states render server-side — success, invalid, failure — with the submitted value
      **preserved** on failure (FR-033, amended). ⚠ There is **no "already subscribed" state**: an
      already-known address gets the **success** surface, byte-identical, because a distinct one is a
      subscriber-enumeration oracle (FR-032). Copy carries no discount claim (FR-034). **Zero client JS** —
      if a client boundary appears unavoidable, prefer a redirect/param-driven result (research R3).
- [ ] T074 [US6] Place `NewsletterForm` at contract row 9 in `apps/customer-web/app/(shop)/page.tsx`, in the
      static shell.
- [ ] T075 [US6] Create `apps/customer-web/app/(shop)/newsletter/confirm/page.tsx` — a public server component
      that reads `?token=`, calls the confirm endpoint server-side and renders "You're subscribed" or "This
      link has expired", each with a link back to the store (FR-043). Zero client JS.
- [ ] T076 [US6] Add `/newsletter/confirm` to `GUEST_PAGES` in `apps/customer-web/scripts/bundle-budget.mjs`
      **in the same change that creates the route**, with a comment matching the existing convention — the
      file itself records what happened the last time a guest-reachable route went unmeasured.
- [ ] T077 [P] [US6] Unit test `apps/customer-web/app/(shop)/_components/NewsletterForm.test.tsx`: renders a
      native `<form>` with `type="email" required`; no `"use client"` directive in the module; each of the
      **three** states renders distinct, plain-language copy; the failure state re-renders the submitted
      value; and **no branch renders "already subscribed" wording** (a grep assertion — FR-032).
- [ ] T078 [P] [US6] Unit test `apps/customer-web/app/(shop)/newsletter/actions.test.ts`: an invalid email is
      rejected **before** any edge call; a backend throw returns the retryable error result rather than
      propagating; the email never appears in a telemetry property (FR-042).
- [ ] T079 [P] [US6] Playwright spec `apps/customer-web/e2e/newsletter.spec.ts`: submitting an invalid address
      produces browser-native validation and **no network request**; submitting a valid address reaches the
      success surface; the confirm page renders both outcomes from a token query param.
- [ ] T080 [P] [US6] Emit `newsletter_submitted` with `outcome: "ok"|"invalid"|"error"` from the
      Server Action (server-side telemetry — no client bytes), asserting in T078 that **no email address** is
      ever a property (FR-042).

### Verification & deploy (US6)

- [ ] T081 [US6] Verify US6 code: `pnpm -r typecheck`, `pnpm --filter @effy/customer-web test`,
      `pnpm --filter @effy/edge-customer test`, `make email-check`,
      `pnpm --filter @effy/customer-web build` + `node apps/customer-web/scripts/bundle-budget.mjs` (`/` and
      `/newsletter/confirm` both within budget).
- [ ] T082 [US6] **Operator**: commit the migration (003 commit-guard), then `make db-up ENV=dev` and confirm
      `public.newsletter_subscriber` exists with the citext unique constraint.
- [ ] T083 [US6] **Operator**: `make edge-deploy SERVICE=customer ENV=dev`, then probe both public routes with
      `curl` — a valid address returns `202 {"status":"ok"}` and an invalid one `400 {"status":"invalid"}`.
- [ ] T084 [US6] **Operator walk** (quickstart § US6, steps 2–7): valid new email → success + confirmation
      email + `pending` row; follow the link → `confirmed`; already-subscribed → identical surface, no
      duplicate, no re-send; invalid → inline validation, no request; edge stopped → retryable error with
      input preserved; tampered/expired token → "this link has expired" (SC-008).

**Checkpoint**: All six sections delivered.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [ ] T085 [P] Accessibility pass across the whole page (SC-009): exactly one `h1`, correct `h2`/`h3` ordering
      through every new section, every interactive element **≥ 44 × 44 CSS px** (plan § Numeric thresholds),
      and no section conveying meaning by colour alone. Add the assertions to
      `apps/customer-web/e2e/a11y.spec.ts` rather than checking by eye.
- [ ] T085a [P] **FR-002's mechanical guard** — the operator lock is currently enforced by a comment, and a
      comment does not fail a build. Add a check to `apps/customer-web/package.json`'s test script (or
      `scripts/`) that fails if this feature's diff touches any of `app/(shop)/layout.tsx`,
      `_components/ProductCard.tsx`, `_components/StorefrontFooter.tsx`, `_components/PrimaryNav.tsx`,
      `_components/MobileNav.tsx` or `_components/HeaderSearch.tsx` — the same shape as the
      `check-no-emerald`/`check-no-jade` guards this repo already trusts. Prove it by deliberately touching
      one file and confirming a non-zero exit.
- [ ] T085b [P] **FR-003's check** — "no new catalogue/browsing capability" is the requirement that keeps a
      presentation slice from growing a backend, and nothing asserts it. Confirm and record in
      `specs/039-customer-home-redesign/quickstart.md`: **zero** new hot-path (`core-api`) routes, **zero**
      new or changed fields on any storefront DTO in `packages/shared-types/src/storefront.ts`, and **zero**
      changes under `apis/core-api/`. The one new backend surface is the newsletter, which FR-003 exempts.
- [ ] T086 [P] Run the colour guards and confirm **zero new tokens** (SC-004): `node scripts/check-tokens.mjs`
      (unchanged output), `scripts/check-no-emerald.sh`, `scripts/check-no-jade.sh`.
- [ ] T087 [P] Full-workspace verification: `pnpm -r typecheck` (count the reporting packages — 029's lesson:
      `pnpm -r test` was green while `typecheck` failed, caught only because the "Done" count fell),
      `pnpm -r test`, `turbo build`.
- [ ] T088 Final bundle accounting: run `node apps/customer-web/scripts/bundle-budget.mjs` and record the
      per-route delta against T001's baseline in `specs/039-customer-home-redesign/quickstart.md`. The
      redesign's net added client JS must be ~0 KB (contract § Budget); if any route moved more than ~0.5 KB,
      find the import that did it before signing off.
- [ ] T089 [P] Degraded-state matrix (SC-005): render `/` across full data · no promotions · no categories ·
      empty catalogue · catalogue error, confirming **no empty rows** and a self-explaining state with a way
      forward in every case. Record the five results in `specs/039-customer-home-redesign/quickstart.md`.
- [ ] T090 [P] Appearance and viewport matrix (SC-006): light and dark × desktop, tablet and phone widths for
      every new section, paying particular attention to text over photographic artwork (FR-007).
- [ ] T091 [P] Update the parity register
      `docs/audiences/customer-capabilities.md` with a `§039` entry — what the web home now carries, and
      explicitly that **customer-mobile's home is unchanged by this slice** so the register does not imply a
      parity that was never built (028's optimistic ✅ is the precedent).
- [ ] T092 [P] Update `CLAUDE.md`'s **Active feature** section for 039 — what was built, what is
      machine-verified, and what remains operator-gated, in the same shape as the existing entries.
- [ ] T093 Record the open operator-supplied items in
      `specs/039-customer-home-redesign/quickstart.md` § "Operator-supplied, still open": the final hero image
      asset, real app-store URLs (deferred to the slice where the apps ship), and confirmation that **038 is
      deployed** before the newsletter email can actually send.
      ⚠ Include the consequence of T017's build-time asset resolution: **dropping `hero-1.jpg` in requires a
      rebuild** before it appears. Resolving it at request time would cost bundle bytes on the tightest page
      on the platform, so this is the deliberate trade — but an operator who copies the file in and sees the
      placeholder will otherwise think it is broken.
- [ ] T094 Sign-off: walk the full SC-001…SC-010 table from [spec.md](spec.md), mark each proven / unproven,
      and write the result to `specs/039-customer-home-redesign/SIGNOFF.md`. State plainly which criteria are
      machine-verified and which rest on an operator walk — a criterion nobody has observed is not met.
- [ ] T095 Commit the feature (all six sections, the migration, the email template and the contract) once
      T094's sign-off records what is and is not proven.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately. T001 must precede T088 (there is no delta without
  a baseline).
- **Foundational (Phase 2)**: depends on Setup. **Blocks every User Story** — `MediaFrame`, `Scrim` and
  `SectionShell` are used by US1, US2, US4 and US5.
- **US1 → US2 → US3 → US4 → US5 → US6 (Phases 3–8)**: run **in this order**, not in parallel. This is not a
  technical constraint but the feature's delivery discipline (spec SC-010, plan § Phased delivery): the
  operator reviews each finished section before the next begins.
- **Polish (Phase 9)**: depends on every section the operator chose to build.

### User Story Dependencies

- **US1 (P1)** — the MVP section. Depends only on Foundational.
- **US2 (P1)** — depends on Foundational (`MediaFrame`) and on `page.tsx` existing in its US1 shape.
- **US3 (P1)** — depends on Foundational; introduces `home-composition.ts`, which **US4 extends**.
- **US4 (P2)** — depends on US3's `composeSections` helper (offer blocks are placed by it) and on `Scrim`.
- **US5 (P3)** — independent of US2/US3/US4; could be built any time after Foundational, but is sequenced
  here so the page grows top-to-bottom.
- **US6 (P3)** — fully independent of the visual sections (its own contract, migration, template and service).
  Its operator walk (T084) is gated on **038 being deployed** (research R5); its code is not.

### Within Each User Story

- Tests before implementation where the test pins a contract (composition order, non-enumeration, no-URL).
- Contract/types → data → backend service → edge handler → web call site (US6).
- Component → composition placement → telemetry → verification → operator review (US1–US5).

### Parallel Opportunities

- **Setup**: T002, T003, T004 in parallel (T001 first — it builds).
- **Foundational**: ⚠ **T005, T006 and T007 all edit `apps/customer-web/components/storefront/kit.tsx` and are
  strictly sequential** — none of them carries `[P]`. T008, T009 and T010 run in parallel once T007 lands.
- **Within each visual story**: the test tasks marked [P] are all different files and run together.
- **US6 is the widest fan-out**: T056 (contract), T059/T060 (email authoring) and T064 (repo) touch four
  different packages and can proceed simultaneously once T056's shapes are agreed.
- **Polish**: T085, T086, T089, T090, T091, T092 are independent.

---

## Parallel Example: User Story 6

```bash
# Contract, email and data layers — four packages, no shared files:
Task: "Create packages/shared-types/src/newsletter.ts (T056)"
Task: "Author packages/email-kit/src/templates/newsletter-confirmation.mjml (T059)"
Task: "Author packages/email-kit/src/text/newsletter-confirmation.txt.hbs (T060)"
Task: "Create apis/edge-api/customer/src/newsletter/repo.ts (T064)"

# Then the tests, all different files:
Task: "Service unit tests (T068)"
Task: "Repo container test (T069)"
Task: "Non-enumeration negative test (T071)"
Task: "NewsletterForm unit test (T077)"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → Phase 2 Foundational.
2. Phase 3 US1 — the hero.
3. **STOP and review with the operator** (T020). The page is coherent: a new hero above the existing rails.
4. Only then begin US2.

### Incremental Delivery (the operator's stated discipline)

Each phase ends in an operator review task (T020, T028, T038, T048, T055, T084). The page must be shippable
at each of those points, and every section self-hides on empty data so an unbuilt later section is invisible
rather than broken.

**A natural stopping point exists after US3**: hero + categories + merchandised rails is already "a longer,
richer merchandised landing" and satisfies all three P1 stories. US4/US5/US6 add promotional weight, brand
presence and a new capability respectively, and each can be deferred without leaving the page incoherent.

### Notes

- `[P]` = different files, no dependency on an incomplete task.
- ⚠ **Do not touch** `layout.tsx`, `ProductCard.tsx`, `StorefrontFooter.tsx` or the nav components — FR-002 is
  an operator lock, not a preference.
- ⚠ **Every new file must justify itself against reuse** (research R7): `ProductCard`, `ProductRail`,
  `PromoCarousel`, `CategoryTile` and `components/storefront/kit.tsx` are reused, not forked (Principle II).
- ⚠ **The budget is the binding constraint.** `/` sits ~3.5 KB under the 174 KB gate. Every section here is a
  server component; a client island added "just for this one interaction" is the failure mode to watch for,
  and skipping a telemetry event is cheaper than paying for one.

# Phase 0 Research: Storefront Home Composer

**Feature**: `specs/042-storefront-home-composer` · **Date**: 2026-08-09

Four parallel research streams preceded this plan: an evaluation of open-source page builders, a feature taxonomy drawn from commerce and CMS platforms, a survey of how thirteen major retailers actually build promotional tiles, and a full audit of this repository's existing promotional machinery. The retailer survey is committed at [`docs/research/ecommerce-promo-tiles.html`](../../docs/research/ecommerce-promo-tiles.html).

---

## R1 — Build the composer; adopt no page builder

**Decision**: Build. Do not adopt Puck, GrapesJS, Craft.js, Plasmic, Builder.io, Storyblok, Sanity, Contentstack or Netlify Create.

**Rationale**:

Puck was the strongest candidate and deserves the detail. It is MIT (`@puckeditor/core` v0.23.0, published 2026-08-07, ~458k downloads/month, four releases in six weeks), it composes *your own* React components from typed props rather than emitting markup, its `select`/`radio` fields take enum options so operators have nowhere to type a colour, and its RSC renderer measured **10.7 KB gzipped server-side with zero client JavaScript** — verified by grepping `"use client"` across all seven files in its dependency closure.

Two facts defeated it:

1. **Next 16 is undeclared.** Puck ships **no `next` peer dependency at all**. The only Next 16 statement found anywhere is a community answer in a GitHub discussion — not a maintainer, not tested. React 19 *is* declared.
2. **It removes about one item from a fourteen-item build list.** Persistence, draft/published, version history, scheduling, media library, server-side authorization, audit, server-side validation, the storefront renderer, a draft preview route, schema-evolution policy, editor integration, block data resolution and RSC-compatible blocks are all ours either way. Draft/published, version history, scheduling and media library are **explicitly absent** from the OSS core (they are Puck Cloud features), and its permissions API is **editor-UI only with no server-side enforcement**.

The clinching argument is that this storefront already *is* a block system: `HomeSection` is a discriminated union, `composeSections()` emits an ordered array of tagged blocks, `ProductRail` is already props-driven. And Puck's canvas needs blocks that render **in the browser**, whereas ours are Server Components — so a real draft route is both a truer preview and less work.

**Alternatives considered and why rejected**:

| Option | Rejected because |
|---|---|
| **Plasmic** | ~28 KB gz loader + 42–71 KB gz `react-web`, main entry opens with `"use client"`. Fatal against ~0.1 KB of headroom, regardless of its AGPL/MIT split or its (real) self-hosting path. |
| **Builder.io** | Hard runtime dependency on **`isolated-vm`, a native C++ Node addon** — disqualifying in Lambda. RSC SDK stale (0.25.8 after three years, 2,372 weekly downloads vs 76,844 for Gen1); its own README states RSC mode "does not support interactive Builder features… there are no workarounds". Measured **40 of 140 modules carry `"use client"`, ~15 KB gz** — not the advertised near-zero. |
| **Storyblok** | Technically the strongest vendor: its entire dist has exactly two `"use client"` modules and `StoryblokServerStory` renders with zero client JS; the only package surveyed with *declared, tested* Next 16 + React 19 support. Rejected because content lives in Storyblok's cloud — **a block could not hold a foreign key to `public.product`** — and it is a second admin site at ~$99/mo. |
| **Sanity** | Studio is MIT and embeddable in the existing Vite console, which Storyblok's is not. Same disqualifier: content outside our database. |
| **Netlify Create / Stackbit** | Effectively dead: project creation shut off 2024-06-11, the domain serves a 1.2 KB empty shell, and **the GitHub repo its own npm packages point at returns 404**. Unpatchable. |

⚠ **But the dead one supplied the architecture.** Netlify's **Content Source Interface** explicitly names *"Internal product database (e.g. PostgreSQL)"* as a source, and all its packages install as **dev-dependencies only** — production ships nothing. An independent commercial product concluded that the right shape for this problem is a typed content-source interface over the customer's own database with the editor as an authoring-time tool. That is what this plan builds. Steal the idea; do not adopt the orphan.

---

## R2 — Persist structured intent, never rendered markup

**Decision**: The layout is a JSON array of `{type, id, props}`. No HTML, no CSS, no inline styles are ever stored.

**Rationale**: Adobe Commerce persists XHTML with inline styles as its "master format", and the documented consequences are severe — its own PWA Studio must **re-parse stored HTML**, only the fifteen native content types are supported, and a custom content type with no React equivalent renders as *"that area of your page will simply be blank."* Salesforce and BigCommerce persist intent instead.

⚠ **For this platform the decision is forced by platform shape, not preference.** Effy has six surfaces, two of them Compose Multiplatform. HTML output is single-channel by construction, so storing markup would make `customer-mobile` parity **unbuildable** — not merely inconvenient. FR-041 exists to keep that door open.

**Alternatives considered**: storing rendered HTML (rejected above); storing a rich-text document per block (rejected — reintroduces presentation into content, and Sanity's own page-building guidance is explicit against it: *"we think it best to leave those kinds of concerns to your code"*).

---

## R3 — Two stored bodies, not a revision history

**Decision**: `home_layout` holds exactly two JSON bodies — `draft` and `published` — plus the metadata for who published and when. Revert copies `published` over `draft`. No history table.

**Rationale**: Schema evolution across historical revisions is the single hardest problem in block systems; Wagtail needed a dedicated migration framework for it and Gutenberg needed a `deprecated` sub-framework. The spec excludes version history, and that exclusion **collapses the problem**: when at most two bodies exist, a block schema change touches at most two rows, and both are reachable by a single forward migration.

This is the highest-leverage simplification in the plan and it should not be quietly undone. ⚠ **Adding history later re-opens the hardest problem in the feature**, and the decision then — replayable revisions or frozen artifacts — should be made deliberately (frozen is simpler and almost always right).

**Alternatives considered**: full version history with diff (rejected — Storyblok charges for Compare and Visual History, which is a signal about cost-to-build; "revert to last published" captures the great majority of the value); an append-only revision log (rejected — same evolution problem, deferred rather than avoided).

---

## R4 — Copy sits beside the artwork by default, not over it

**Decision**: Offer-tile copy sits on a **solid panel adjacent to the artwork**. Text over artwork is **not offered at all** in this feature — there is no `overlay` variant to author.
⚠ **Amended 2026-08-09 after `/speckit-analyze`.** This decision originally kept `overlay` as an opt-in variant whose contrast would be validated. The analysis showed the deferral was not free: it left `layout_contrast_fail` unreachable, made SC-009 vacuous ("every published overlay tile" = none), and shipped an enum value that could never be published. Removing the variant is the honest form of the same decision.

**Rationale**: The retailer survey ranked legibility techniques by prevalence and put **text outside the image first and scrim last**. Instacart publishes its panel split as **56%/44% desktop, 65%/35% mobile**. Placing copy outside the artwork removes the contrast problem *by construction* rather than managing it — and this feature's own history is the evidence: several scrim, ellipse and text-shadow approaches were built and discarded on this storefront before this research existed.

The survey did find the answer for platforms that *do* overlay: Walmart and Uber Eats independently carry an `isBackgroundDark` flag **derived from the artwork's own luminance**, driving text colour — deliberately not from the viewer's theme. That is the same conclusion 029's scrim fix reached here: *the artwork is the same picture in both appearances, so the thing making type legible over it cannot be the thing that inverts.* ⚠ It is recorded because it is the rule any future overlay must follow, not because this feature needs it.

⚠ **This decision also disposes of a hard implementation problem rather than deferring it.** Server-side contrast validation over a photograph needs a **pixel decoder**, and this platform deliberately has none — `image-dimensions.ts` is a dependency-free header reader written specifically to avoid `sharp`. Not offering overlay means the decoder is not needed at all, `layout_contrast_fail` does not exist, and SC-009 becomes a structural assertion (copy never overlaps artwork) instead of a measurement that could only ever be vacuous.

**Alternatives considered**: scrim over full artwork (rejected — ranked last, and repeatedly rejected by the operator in practice); baking text into artwork (rejected in the spec — breaks screen readers, search indexing, breakpoint cropping and post-hoc correction; the one surveyed platform that does it, Amazon, compensates by duplicating its headline into both `alt` and `aria-label`).

---

## R5 — Preview opens in a new tab with a signed token, not an embedded iframe

**Decision**: The composer opens the storefront's draft route in a **new tab**, authorised by a short-lived signed token in the URL which the storefront exchanges for a draft session.

**Rationale**: An iframe would give side-by-side editing, and the CMS platforms surveyed (Storyblok, Sanity Presentation, Contentstack) all iframe the deployed site. ⚠ **But they iframe a same-origin or vendor-brokered site.** Here the back office and the storefront are **different origins**, so an iframed draft session depends on a **third-party cookie** — which Safari blocks by default and Chrome restricts. The preview would work on the developer's machine and fail for the operator, which is the worst possible failure shape for a trust-building feature.

The property that actually matters — *the real page rendered by the real components*, so preview cannot drift from production — is fully preserved in a new tab.

Two security details are adopted verbatim from Next.js's own guidance: the draft-enable route is a **`GET`** (a CMS opens a tab) while disable is a **`POST`**; and the post-enable redirect target is fetched from the backend, **never taken from `searchParams`**, to avoid an open redirect. A third is a footgun worth naming: a `GET` exit handler must never be reachable from a `<Link>`, because Next prefetches it and the session clears before the operator clicks.

**Alternatives considered**: iframe (rejected above); a second "preview renderer" component tree (rejected outright — a preview that approximates the page is worse than none, because it teaches the operator to trust something wrong; four visual defects on the preceding home slice survived a fully green test suite precisely because nothing rendered the real thing).

---

## R6 — Extract merchandising out of `promo_code`; keep a nullable FK back

**Decision**: New `offer_tile` content inside the layout, with an optional `promoCodeId` reference. The six advertising columns, one index and one CHECK constraint are dropped from `promo_code`.

**Rationale**: The audit found the two concerns are **already separated inside one table, and the schema just doesn't say so** — `repository.ts` explicitly exempts the six advertising columns from the redeemed-code immutability lock, commenting that they are "PRESENTATION ONLY", and `service.ts` validates them in a separate function. They share a row and nothing else.

The welding also cost an entire sub-feature. Both `storefront.ts` and `service.go` state plainly that `promo_code` carries no product or category scoping, so a banner tap had **nowhere to go** — which is why `PromotionDTO`, `GET /v1/storefront/promotions/:id`, `PromotionScreen.kt`, `PromotionViewModel.kt` and `promotions/[id]/page.tsx` exist. That is roughly **800 lines built to work around the entity being the wrong shape**. An offer tile has a real destination, so it becomes redundant.

028's one genuine virtue — self-expiring creative, one schedule not two — is **preserved by the FK**: a tile with a `promoCodeId` ANDs the promotion's live-window predicate onto its own.

**Blast radius, verified**: one forward-only migration. Cart and checkout Go packages contain **zero** references to `banner`/`is_advertised`, so discount behaviour is untouched (SC-014 proves this by the existing suites passing unmodified).

**Alternatives considered**: keeping the facet and adding tile fields alongside it (rejected — compounds the coupling and leaves `banner_placement`, a column that already means opposite things on the two customer surfaces); deleting promo codes' advertising *without* a replacement (rejected — the four currently-advertised promotions would silently vanish; FR-046 requires their disposition be recorded).

---

## R7 — One schema definition, consumed three ways

**Decision**: The block catalogue and its field schemas live in `packages/shared-types`. The existing `contract:gen` pipeline is extended to emit a machine-readable schema, which the back-office form, the cold-path validator and the hot-path renderer all derive from. Agreement with Go is pinned by the platform's existing **byte-identical wire-contract test** pattern.

**Rationale**: The failure mode is silent and specific — if the editor form, the server validator and the renderer become three parallel definitions, a block **saves fine and renders as nothing**. Principle II already forbids hand-redefining a contract per surface.

⚠ **This platform does not use Zod** (validation is a hand-rolled 49-line `validate.ts` in `@effy/edge-shared`), so the research's "one Zod discriminated union" recommendation is adapted rather than copied. `packages/shared-types` **already generates** `contract/schema.json` alongside the Kotlin DTOs, so the machinery exists; this feature extends it rather than introducing a schema library.

**Alternatives considered**: introducing Zod (deferred — permitted as "a new library within these standards", but it would sit beside an existing validation approach rather than replacing it, and that is a platform-wide decision, not this feature's to make); a hand-written Go mirror of the TS union (rejected — a second definition, exactly what Principle II forbids).

---

## R8 — The published layout carries no time predicate, so it stays cacheable

**Decision**: The published layout carries **no time predicate**, and is therefore read through a **cached path tagged `home-layout`**, invalidated by the admin service when the operator publishes or reverts. The rails and products fetched alongside it stay `uncached()`.
⚠ **Amended 2026-08-09 after `/speckit-analyze`.** The original decision noted caching was *possible* and left the read uncached. That was wrong, and the analysis caught why: block order and existence now come from the layout, so an uncached layout read moves the **entire page body** behind request time. `AppPromo`, `NewsletterForm` and the page's `h1` prerender today precisely because they sit outside the Suspense boundary — and FR-037/SC-005 assert the page stays prerendered. Caching the layout is not an optimisation here; it is the requirement.

**Rationale**: Research flagged that a naive `now() BETWEEN …` on the render path **forfeits the static shell** under PPR. Because scheduling is excluded from scope, the published-layout read is a plain single-row lookup with no time dependence — which keeps the door open to caching it with tag-based invalidation on publish.

⚠ **Not adopted in this feature**: the home read is `uncached()` today and stays that way, because the rails and products it fetches alongside change constantly and are the actual reason for the cache policy. The layout adds one indexed single-row read to a query that already performs eight parallel reads. Making the home read cacheable is a worthwhile separate slice, and this decision deliberately does not foreclose it.

**Alternatives considered**: per-layout scheduling (out of scope, and the reason is now recorded); per-block scheduling (rejected — a per-block time predicate is the cacheability problem in a worse form).

---

## R9 — Reordering must be operable without a pointer

**Decision**: Drag-to-reorder via `@dnd-kit`, **plus** always-visible move-up/move-down buttons. Both, not either.

**Rationale**: dnd-kit documents where each collision algorithm fails: `closestCenter` **breaks on nested droppables**, and `pointerWithin` *"only works with pointer-based sensors"* — therefore incompatible with keyboard dragging, which is an accessibility failure rather than a limitation. Puck reported having to **patch its underlying DnD library** for iframes and CSS transforms. This is a solved problem not worth re-solving.

The buttons are not a fallback for the disabled alone: they are what actually gets used on a trackpad, and they are the recovery path when drag misbehaves.

⚠ **The dependency is admin-only** and never reaches the storefront bundle, so the 174 KB guest gate is untouched. If the operator will accept buttons only, the dependency disappears and FR-004 should be amended — the guard should not be bent to keep a nice-to-have.

**Alternatives considered**: hand-rolled drag (rejected above); buttons only (would violate FR-004 as written, but is the honest cheaper option if drag is not wanted); HTML5 native drag-and-drop (rejected — notoriously inconsistent across browsers and effectively unusable with a keyboard).

---

## R10 — Image loading priority is derived, never authored

**Decision**: The first image block on the page renders eager with `fetchpriority="high"`; every subsequent image is lazy. This is computed from position and is not an operator-editable field.

**Rationale**: web.dev is explicit — *"never lazy-load your LCP image"* — and a composer makes it trivially easy to produce a bad LCP by moving a block. ⚠ **This storefront currently has the inverse defect on record**: three below-the-fold banners are preloaded while the hero is not. Deriving the setting closes that class of defect **by construction** rather than by an operator remembering, and removes a checkbox nobody could answer correctly.

**Alternatives considered**: an operator "priority" toggle (rejected — it is a question about rendering, not about merchandising, and the correct answer is always "the first one"); preloading every artwork (rejected — it is the current defect).

---

## R11 — What is deliberately not built, and why

Recorded here so the exclusions are decisions rather than omissions, and so they are not re-litigated:

| Not built | Evidence |
|---|---|
| **Colour / typography / spacing controls** | `check-tokens` scans source and **cannot see a hex stored in the database** — the guard would silently exit. ATAG **B.2.2.1** is the independent argument: accessible options must be at least as prominent as inaccessible ones. Builder.io's own forum documents the dead end where `styleStrictMode` plus incomplete token coverage leaves a colour **uneditable by any means**. |
| **Nesting / rows / columns** | Shopify caps theme-block nesting at **8**, SFCC advises **≤5**, Contentstack caps modular blocks at **3**. Flat is a feature, not a limitation. |
| **A custom HTML/CSS/JS block** | Voids tokens, contrast, page weight, cross-surface parity and XSS safety simultaneously. Note that the two platforms shipping one (Adobe's `HTML Code`, BigCommerce's `code` setting) can make no promise about the resulting page. |
| **Approvals / review workflow** | ⚠ **Neither Adobe, Salesforce nor BigCommerce ships approvals.** With one operator, an approval step whose author and approver are the same person is a click that teaches you to ignore clicks. |
| **Audience targeting / personalisation** | ⚠ SFCC documents that the presence of a visibility rule *"leaves this first-level remote include uncached."* This storefront is a PPR static shell — targeting destroys it. Identical reasoning to 033 keeping `isSaved` off catalogue reads. |
| **Split testing** | Requires attribution the platform cannot produce: **PostHog has never been initialised on `customer-web`**, so `capture()` is a no-op there today. Fix telemetry before building anything that consumes it. |
| **Stega / invisible-character click-to-edit** | Sanity documents that stega strings *"can break non-display operations like string comparisons, URL construction, date parsing, and length checks"* — on a page made of ids, prices and URLs, the blast radius is the whole page. |
| **Auto-generated alt text** | ATAG **B.2.3.2** discourages it: generic strings defeat the checkers that would otherwise flag the omission. |

---

## Defects found during research that this feature fixes

Each is live on the storefront today and became a requirement rather than a bug report:

| Defect | Requirement |
|---|---|
| `banner_placement` means **opposite things** on web and mobile | FR-041 |
| `banner_position` is authored, stored, transmitted and **ignored by web** | FR-011, FR-042 |
| `createPromo` **never verifies artwork** — the check runs only in `updatePromo` | FR-030, FR-033 |
| Promotional artwork is `alt=""` on both surfaces — **no banner alt text field exists at all** | FR-026 |
| "Nothing is ever cropped" is **false on web**, which never imported the canvas and hardcodes `aspect-[2/1]` in three places (a test *pins* the violation) | FR-034, FR-035 |
| Every advertised promotion currently renders **twice** on the home page | FR-043 |
| The back office **cannot display artwork already attached** — it returns a raw storage key and the presigned read for it was never built | Composer artwork field |

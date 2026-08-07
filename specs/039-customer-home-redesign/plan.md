# Implementation Plan: Customer Web Home — Merchandised Landing Redesign

**Branch**: `039-customer-home-redesign` | **Date**: 2026-08-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/039-customer-home-redesign/spec.md`

## Summary

Rebuild the customer-web storefront home page (`app/(shop)/page.tsx`) into a longer, richer merchandised
landing page adapting the composition of an operator-supplied grocery reference, while staying strictly
on Effy's monochrome design language. **All visual sections reuse data the platform already serves** —
`GET /v1/storefront/home` (rails + advertised banners) and `GET /v1/storefront/categories` — and reuse
the existing product card, header and footer unchanged. The only new capability is a **newsletter
subscribe** section: a public (unauthenticated) cold-path endpoint on the existing `edge-customer`
service, one new `public.newsletter_subscriber` table (Goose migration), and one new `email-kit` template
for a double-opt-in confirmation email.

The dominant technical constraint is the **guest bundle budget**: `/` measures **170.5 KB against a
174 KB gate** (~3.5 KB headroom). The redesign is therefore built as **server components with essentially
zero added client JavaScript** — the newsletter form is a plain HTML `<form>` driven by a Server Action
(the zero-JS pattern 012 used for sign-out), not a client island.

Delivery is **section by section** (one User Story at a time, top to bottom) so the operator reviews each
finished section before the next.

## Technical Context

**Language/Version**: TypeScript 5.x / React 19.2 / Next.js 16.2.6 (App Router, `cacheComponents`/PPR).
Backend: Node 22 (edge-customer, Serverless v3, arm64). SQL via Goose migration.

**Primary Dependencies**: `@effy/shared-types`, `@effy/design-system` (tokens + `ui`), the storefront
kit (`components/storefront/kit.tsx`) and existing `_components` (ProductCard, ProductRail, PromoCarousel,
CategoryTile). Backend: `@effy/edge-shared`, `@effy/email-kit`, `pg` (existing), SES (existing wiring).

**Storage**: One new table `public.newsletter_subscriber` (PostgreSQL 16, raw SQL, Goose). No change to
any catalogue/storefront table. No new DynamoDB.

**Testing**: Vitest (web unit + edge unit/container), Playwright (web e2e), `make email-check` (email-kit
guards), `pnpm -r typecheck`, `bundle-budget.mjs` gate, `check-tokens`/`check-no-emerald`/`check-no-jade`.

**Target Platform**: Public web (SSR/PPR), served from Amplify Hosting; edge Lambda behind the shared HTTP
API in `ap-southeast-2`.

**Project Type**: Web application (Next.js frontend + cold-path Lambda + DB migration + one email template).

**Performance Goals**: No first-paint regression; static shell prerendered and crawlable; below-the-fold
imagery must not block paint. Guest `/` route stays ≤ 174 KB. Newsletter subscribe is low-frequency async.

**Constraints**: Strictly monochrome (no new colour token; guards must stay green). Zero/near-zero added
client JS on `/`. No PII in telemetry beyond the auth subject id. No new outward-facing identifier invented
(app-store URLs omitted; sender/reply-to come from the existing SSM contract). **This slice touches no
`infra/` and requires no `terraform apply`** — see FR-035 and § Telemetry for the two places that
constraint was tested and held.

**Numeric thresholds** (pinned here so the tests that assert them have something to bind to — the analyze
pass found all three named but unquantified):

- **Touch-target minimum, web: 44 × 44 CSS px.** The constitution mandates fat-finger targets without a
  number and the platform's only concrete figure is mobile's 48 dp. 44 px is the web equivalent (WCAG 2.2
  AA Target Size is 24 px; 44 is Apple's HIG figure and the stricter of the two in common use). Asserted by
  T085 (SC-009).
- **Category shortcut cap: 12 tiles.** Enough for a full grocery department set at desktop width, few enough
  that the row does not become a second navigation. Declared in the section contract, consumed by T021/T023
  (FR-013).
- **Newsletter confirm-token TTL: 24 hours. Resend cooldown: 1 hour.** See data-model.md; both drive
  FR-035's cooldown and T069's container assertions.

**Scale/Scope**: One redesigned page (`/`), one new public confirmation page (`/newsletter/confirm`), ~6
reviewable sections, one cold-path route pair (subscribe + confirm), one migration, one email template.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

- **I. Spec-Driven Development** ✅ — spec.md + this plan + tasks (next) precede code; sections map to
  User Stories and are verified against acceptance criteria.
- **II. Monorepo with Shared Contracts** ✅ — reuses `@effy/shared-types` storefront DTOs unchanged; the
  ONE new contract (`NewsletterSubscribeRequest`/`Result`) is added to `shared-types` as the SSOT and
  consumed by both web and edge. No hand-redefined shapes. The new email template lives in the shared
  `@effy/email-kit`, not hand-rolled in a handler (038 doctrine).
- **III. Dual-Path Backend Discipline** ✅ — the redesign adds **no** commerce traffic; it reads existing
  hot-path storefront endpoints. The one new write (newsletter subscribe/confirm) is **ops/marketing,
  low-frequency, async-email** → **cold path**, placed on the existing `edge-customer` service. This is
  the correct path and is justified in research R1. It is NOT customer commerce and does NOT belong on the
  hot path.
- **IV. Auth Isolation** ✅ — no auth change. The subscribe/confirm routes are **public** (no authorizer),
  the same posture as this service's `healthz`/`readyz`. A subscriber is explicitly NOT a Cognito account
  and touches no pool.
- **V. Native-Feel, Consistent Design** ⚠ **PASS WITH A RECORDED CARD EXCEPTION** — monochrome enforced;
  no new colour token (SC-004); photographic hero/promo artwork is content, not a token, with
  scrim-guaranteed text contrast (research R2). Reuses the storefront kit. Reference is compositional
  only. **Design-system usage:** all chrome resolves to design-system tokens.

  **The no-card exception, justified for THIS feature** (Principle V requires the justification be
  recorded in the plan, and pointing at another slice's exception is not recording one):

  - **`OffersPanels` — a card-shaped layout, deliberately.** Principle V's rule exists because cards are
    routinely used to *tile text that belongs in a list or a table*, where a list reads better and costs
    less. That is not what this block is. Each panel is **a photograph with a message composed over it**;
    the bounded, clipped, rounded container is not decoration around the content — it **is** the content's
    frame, the thing that gives the artwork an edge and the scrim something to sit inside. A list row
    cannot hold a full-bleed image with overlaid type. The **one-large-plus-two-stacked composition is
    also the operator's explicit request** (FR-017, adapting the reference), and the same pattern is
    already accepted on this platform for `PromoCarousel` and `CategoryTile` — this is the third instance
    of one established pattern, not a new one. **No better layout exists** for image-led promotional
    panels; a text list of promotions would discard the artwork the promotions were authored with.
  - **`ValueStrip` — three solid panels, and ⚠ the platform's only coloured chrome.** Rebuilt
    2026-08-07 on operator direction to match the reference: three filled panels with icons, straddling
    the banner's bottom edge. As a *card* question it is the same answer as `OffersPanels` — a bounded
    band of three co-equal claims, the reference's own composition, and the panel edge is what separates
    them; it does not tile a page into a dashboard of boxes.

    ⚠ **The colour is the real deviation, and it is a Principle V exception, not a card exception.**
    See **FR-005a**. The three fills (`#F95F09`, `#374128`, `#6BB252`) are taken from the reference and
    are the only hues in any chrome on this platform. They are bounded exactly as 024 bounded the mobile
    splash grounds: **component-local, never tokens**, not named for a role, unreachable by any other
    code because there is nothing to import. `tokens:check` passes **unchanged**, which is the
    mechanical proof they did not enter the design system. ⚠ Each panel's foreground is picked for
    **WCAG AA against its own fill** — the reference's own panels measure **3.15:1** (orange) and
    **2.59:1** (green) against white text and would have shipped unreadable body copy.
  - **`CategoryStrip` — NOT cards.** A circular image tile with a label beneath it, the mobile app's
    category row rendered for web. A tile is not a card: it has no container, no border, and holds one
    image and one word.
  - **`AppPromo` — NOT cards.** One sectioned band: copy, badges, artwork. No tiling.
- **VI. Layered Architecture & Explicit Wiring** ✅ — newsletter follows edge → service → repo (raw SQL),
  wired explicitly like the existing `closure`/`addresses` slices. Web keeps server-cache-as-source-of-truth;
  the only client state is the newsletter form's transient submit state, expressed through a Server Action.
- **VII. Observability & Telemetry** ✅ — telemetry declared in this plan (below): product events for
  section engagement and newsletter submit outcomes (no PII beyond subject id, and the subscriber's own
  email is never a telemetry label); backend structured logs + a `custom`/CloudWatch metric for
  subscribe failures; an alarm on confirmation-email send failure reusing the 037/038 mail-failure path.

**Real-World Identifiers** ✅ — no invented identifier. App-store badges render **disabled/"coming soon"**
with no URLs (FR-021). The confirmation email's sender/reply-to come from the existing `/effy/<env>/ses/*`
SSM contract; the confirm link's base URL comes from the existing site-URL config. The hero image is an
operator-supplied asset. No third mailbox is introduced.

**Gate result: PASS — no violations, no Complexity Tracking entries required.**

## Telemetry (Principle VII)

⚠ **CORRECTED 2026-08-07 (analyze pass).** This section previously declared five product events and two
CloudWatch metric filters. **Four of the five could not be built and none of the metric filters had an
owner** — Principle VII requires the plan to state what is built, not what would be nice.

- **Product events (PostHog, web): ONE.** `newsletter_submitted` (outcome: `ok` | `invalid` | `error`),
  fired **server-side from the Server Action**, so it costs zero client bytes. No email, no PII — the
  outcome is a three-value enum (FR-042).

  **The four dropped events** — `home_section_viewed`, `home_hero_cta_clicked`,
  `home_category_shortcut_clicked`, `promo_panel_clicked` — each need a click or intersection handler,
  i.e. **a client boundary**, on a page with **~3.5 KB of headroom against the 174 KB gate**. Paying
  bundle bytes for them would be questionable at the best of times; here it is indefensible, because
  ⚠ **PostHog has never been initialised on `customer-web` at all** (CLAUDE.md §033) — `capture()` is a
  no-op platform-wide, so the events would have cost real bytes to record nothing. Initialising PostHog
  on the storefront is 033's open carry-forward and belongs to **its own slice**, not to a presentation
  redesign. Section-engagement measurement (SC-012/SC-013's ancestor problem) stays unmeasured, and this
  plan says so rather than implying otherwise.

- **Backend logs (edge-customer): structured logs only.** Subscribe and confirm both log outcome and
  failure with the shared `logger`. **No new metric filter and no new alarm.** The confirmation-email
  send failure already surfaces through 037/038's existing mail-failure path, which is the whole reason
  that path exists; adding `newsletter_send_failed` beside it would be a second alarm for one condition.
  ⚠ A metric filter is a **Terraform resource**, and this slice deliberately touches no `infra/` — see
  the same reasoning under FR-035.

## Project Structure

### Documentation (this feature)

```text
specs/039-customer-home-redesign/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions & rationale
├── data-model.md        # Phase 1 — newsletter_subscriber
├── contracts/           # Phase 1 — newsletter API + UI/section contract
│   ├── newsletter-api.contract.md
│   └── home-sections.contract.md
├── quickstart.md        # Phase 1 — per-section review + newsletter walk
├── checklists/
│   └── requirements.md  # (from /speckit-specify)
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
apps/customer-web/
├── app/(shop)/
│   ├── page.tsx                         # REWRITTEN — the section composition
│   └── _components/
│       ├── Hero.tsx                     # REWRITTEN — image-led (US1)
│       ├── ValueStrip.tsx               # NEW — honest feature strip under hero (US1)
│       ├── CategoryStrip.tsx            # NEW — circular-tile category row (US2)
│       ├── ProductRail.tsx              # reused as-is (US3)
│       ├── ProductCard.tsx              # UNCHANGED (operator lock)
│       ├── OffersPanels.tsx             # NEW — large + two-stacked promo block (US4)
│       ├── PromoCarousel.tsx            # reused (carousel-placement banners)
│       ├── AppPromo.tsx                 # NEW — download-app, disabled badges (US5)
│       ├── StoreBadges.tsx             # NEW — non-linking Play/App Store marks (US5)
│       └── NewsletterForm.tsx           # NEW — zero-JS <form> + Server Action (US6)
│   ├── newsletter/
│   │   ├── actions.ts                   # NEW — Server Action → edge subscribe
│   │   └── confirm/page.tsx             # NEW — public confirm landing (US6), zero-JS
│   └── layout.tsx                       # UNCHANGED (header/footer lock)
├── public/hero/                         # NEW — operator hero art (hero-1.jpg)
└── scripts/bundle-budget.mjs            # EDIT — add /newsletter/confirm to route list

packages/shared-types/src/
└── newsletter.ts                        # NEW — subscribe request/result contract (SSOT)

packages/email-kit/src/
├── templates/newsletter-confirmation.mjml   # NEW — double opt-in email
└── catalog.ts                                # EDIT — register the template

apis/edge-api/customer/
├── serverless.yml                       # EDIT — 2 public routes (subscribe, confirm) + env
└── src/newsletter/
    ├── http.ts                          # NEW — edge handlers (POST subscribe, GET confirm)
    ├── service.ts                       # NEW — validate, token, idempotent upsert, send mail
    ├── repo.ts                          # NEW — raw SQL (upsert/confirm)
    └── *.test.ts                        # NEW — unit + container tests

db/migrations/
└── <ts>_newsletter_subscriber.sql       # NEW — forward-only; public.newsletter_subscriber
```

**Structure Decision**: Standard three-layer cold-path slice (`http → service → repo`, raw SQL) added to
the existing `edge-customer` service — chosen over a brand-new service because that service already carries
DB access, SES send scoped to this env's identity + configuration set, the full `MAIL_*` email-kit
environment, and a public-route precedent (`healthz`/`readyz`). A new service would duplicate all of that
for one low-traffic endpoint. Frontend work is confined to `app/(shop)` — the header/footer/product-card
locks are respected by not touching `layout.tsx` or `ProductCard.tsx`.

## Phased delivery (section by section)

Each phase is independently reviewable; the page stays coherent after each because every section
self-hides when it has no data and later sections simply don't exist yet.

1. **US1 Hero + value strip** (P1) — rewrite `Hero.tsx`, add `ValueStrip.tsx`, drop hero art into
   `public/hero/`. Placeholder block until the asset is present.
2. **US2 Category strip** (P1) — `CategoryStrip.tsx` from `/v1/storefront/categories`.
3. **US3 Merchandised rails** (P1) — recompose `page.tsx` to stack on-sale, featured and category rails
   (reusing `ProductRail`), with the existing empty/error/skeleton states.
4. **US4 Offers panels** (P2) — `OffersPanels.tsx`, the large+two-stacked block from advertised banners;
   a second block lower using remaining offers (no duplicates).
5. **US5 App promo** (P3) — `AppPromo.tsx` + `StoreBadges.tsx`, disabled/"coming soon".
6. **US6 Newsletter** (P3, backend) — migration → email template → edge routes → `shared-types` contract →
   `NewsletterForm.tsx` (Server Action) → `/newsletter/confirm` page → bundle-budget route add.

## Complexity Tracking

| Deviation | Why it is needed | Simpler alternative rejected because |
|---|---|---|
| **`OffersPanels` uses a card-shaped (bounded, clipped, rounded) container** — Principle V's default is no cards | Each panel is a photograph with a message composed over it; the container is the artwork's frame and the scrim's bounds, not decoration around text. The one-large-plus-two-stacked composition is the operator's explicit request (FR-017). | A list or table of promotions discards the artwork the promotions were authored with, and cannot hold full-bleed imagery with overlaid type. Full justification recorded under Constitution Check § V. |
| ⚠ **`ValueStrip` introduces THREE HUES into UI chrome** — Principle V (v1.11.0) permits a neutral ramp plus two semantic colours and states no third hue may be introduced | **Explicit operator direction, 2026-08-07**, to match the reference storefront's value panels. Bounded by FR-005a: component-local values, never design tokens, not named for a role, `tokens:check` unchanged, no other chrome may take colour from them. Precedent: 024's mobile splash grounds, taken on identical terms. | A monochrome rendering of the same composition was offered and declined. Adopting them as real brand tokens (`tokens.css` + three Compose themes + constitution v1.12.0) was rejected as far larger — it would reverse 026's monochrome decision for all six surfaces to style one band on one page. **⚠ This is the platform's only coloured chrome; deleting one constant is the entire revert.** |

Everything else is clean — `ValueStrip`, `CategoryStrip` and `AppPromo` are **not** cards (§ V records why
for each), and no other principle is deviated from.

# Research: Customer Home Redesign (039)

Phase 0 decisions. Each: **Decision · Rationale · Alternatives rejected.**

## R1 — Which backend path for the newsletter?

**Decision**: Cold path, on the **existing `edge-customer` service**, as two **public (no-authorizer)**
routes: `POST /customer/v1/newsletter` (subscribe) and `GET /customer/v1/newsletter/confirm` (double
opt-in). No new service.

**Rationale**: Newsletter subscribe is ops/marketing, low-frequency, and its work is async email — exactly
the cold path's remit (Principle III). `edge-customer` already carries everything the endpoint needs: DB
access (secret grant), `ses:SendEmail` scoped to this env's identity **and** configuration set, the full
`MAIL_*` env that `@effy/email-kit` reads, and a public-route precedent (`healthz`/`readyz` have no
authorizer). It is NOT commerce, so it does not trip the hot-path routing law; it is NOT a customer account
operation, but placing one public marketing route beside the account routes is far cheaper than standing up
a whole new deployable for a single low-traffic endpoint.

**Alternatives rejected**: (a) **New `edge-marketing` service** — duplicates DB/SES/email wiring and a
deploy for one route. (b) **Hot path (`core-api`)** — core-api is local-Docker-only with no cloud deploy,
so the endpoint could never actually work in production; and it is not latency-sensitive customer traffic.
(c) **Reuse a customer-authorized route** — subscribe must work for anonymous guests, so it cannot sit
behind the customer JWT authorizer.

## R2 — Monochrome vs. the operator's colourful hero/promo artwork

**Decision**: Treat hero and promotional artwork as **photographic content assets** (JPEG/PNG in
`public/` or presigned S3), not design tokens. All UI chrome (type, buttons, chips, borders, backgrounds,
the value strip, the newsletter form) resolves to **design-system tokens only**. Text over any artwork is
made legible by a **scrim or a controlled neutral text zone**, independent of the image — the same
technique `PromoCarousel` and `CategoryTile` already use. The hero composes text over the image's flat
open area (left) with a neutral-gradient scrim so it holds in both appearances.

**Rationale**: The constitution's monochrome rule governs the design *system* — tokens, accents, chrome —
not photographic content (product cards already show full-colour photos). The colour guards
(`check-tokens`, `check-no-emerald`, `check-no-jade`) scan CSS/source for hex values; a JPEG's pixels are
invisible to them, so the supplied art is mechanically compliant. The real risk is a bright band reading as
a "brand hue"; the scrim + neutral-zone rule keeps the *chrome* hueless and the *image* clearly content.

**Alternatives rejected**: (a) **Duotone/desaturate the art to the ramp** — loses the appetite-appeal that
is the whole point of an image-led grocery hero; hold in reserve if the operator dislikes the colour band.
(b) ~~**Full-bleed the yellow band across the hero**~~ — **SUPERSEDED BY OPERATOR DIRECTION, 2026-08-07.**

⚠ **AMENDED 2026-08-07, after the first US1 build was rejected at review.** Two things were wrong.

1. **Alternative (b) is now the chosen design.** It was rejected here as "reads as a brand colour and is
   jarring in dark mode", in favour of framing the image in a rounded container or confining it to the
   hero's right portion. The operator reviewed that build, said it did not match the reference, and
   supplied the artwork (`banner-1.jpg`, 1800×813, 2.21:1 — flat colour left, produce right, authored
   for exactly this). **The hero is now a full-bleed banner with the copy composed over the flat left
   zone.** The dark-mode concern was real and is answered by construction rather than by avoidance: the
   photograph does not invert, so everything composed on it is pinned to the ramp's ends — scrim, type
   **and both buttons**. It does not breach Principle V; the artwork is content (FR-007) and every piece
   of chrome still resolves to the monochrome ramp.

2. ⚠ **The first build did not follow this decision's own text.** The Decision paragraph above already
   said the hero "composes text over the image's flat open area (left) with a neutral-gradient scrim" —
   which is the correct composition. It was built as a two-column grid anyway, with the image in a
   separate rounded box. The rejected alternative and the chosen decision were describing different
   layouts and the implementation followed neither cleanly. **The lesson is not "read the research" but
   that a decision whose *Alternatives* contradict its *Decision* will be implemented as whichever half
   the reader anchors on** — the two halves are now consistent.

## R3 — Zero-JS newsletter form (the bundle budget)

**Decision**: The newsletter form is a **plain HTML `<form>` posting to a Next.js Server Action**
(`app/(shop)/newsletter/actions.ts`), rendered by a **server component**. No client component, no client
validation library; HTML `type="email" required` gives first-pass validation, the Server Action does
authoritative validation and calls the edge endpoint. Feedback is rendered server-side via `useActionState`
only if a client boundary is unavoidable — preferred is a redirect/param-driven result so the form stays
fully server-rendered.

**Rationale**: `/` sits at **170.5 KB against the 174 KB gate** — ~3.5 KB of headroom. A client-side form
component plus state would risk the gate. 012 proved the pattern: converting sign-out to a plain form +
route handler cost **zero** client JS and even *dropped* the guest bundle. The redesign's other sections
(hero, categories, rails, offers, app promo) are all server-rendered and add no client JS.

**Alternatives rejected**: (a) **Client-side fetch form** — adds client JS and a failure surface for no UX
gain over a Server Action. (b) **TanStack Form** — this app deliberately avoids it on guest routes (011
tiny-bundle design).

## R4 — Double opt-in and abuse resistance (FR-032/FR-035)

**Decision**: **Double opt-in.** Subscribe records a `pending` row keyed on the (citext, unique) email and
emails a **tokenised confirm link**; confirming flips it to `confirmed`. The subscribe response is a
**uniform 202** regardless of whether the email was new, already pending, or already confirmed (no
enumeration — FR-032). Abuse resistance is **one mechanism, in SQL**: an **idempotent upsert** that rotates
the token and re-sends **only** when `status='pending'` AND `confirm_sent_at` is older than the **1-hour
cooldown**. The confirm token is a random secret stored **hashed** (never plaintext), single-use, with a
**24-hour TTL**.

⚠ **CORRECTED 2026-08-07 (analyze pass), twice.**

1. This decision originally listed **API Gateway route throttling** as a second mechanism. **It is not
   buildable where the plan put it.** HTTP API throttling is a *stage* `route_settings` property; the stage
   (`aws_apigatewayv2_stage.default`, `infra/envs/dev/edge-gateway.tf:54`) is **Terraform-owned** and
   carries no `route_settings` block, and this service attaches with an external `httpApi.id` — so no
   `serverless.yml` edit can set it. Rather than grow a presentation slice into an infrastructure one, the
   throttle is **dropped** and FR-035 restated as the outcome the cooldown already delivers. A gateway
   throttle (or 035's WAF rule) remains available if this low-value target is ever actually abused.
2. The cap was described as enforced "against the row's **`updated_at`**". **That column is wrong** — it
   bumps on *every* write, including the no-op upsert a repeat submission performs, so the window would
   reset itself on each attempt and cap nothing. The cap is keyed on **`confirm_sent_at`**, which moves
   only when an email actually goes out. data-model.md always had this right; R4 did not.

**Rationale**: Double opt-in is the standard defence against using a signup form to subscribe a third party
and against list poisoning; it also means the only mail an unwilling address receives is a single, ignorable
opt-in. Uniform responses prevent the form from being an account-existence oracle. Hashing the token mirrors
035's "store almost nothing / store only a hash" posture.

**Alternatives rejected**: (a) **Single opt-in** — lets the form email anyone and inflates the list with
typos. (b) **WAF rate rule** (035's mechanism) — heavier to stand up per-route, and it is infrastructure
this slice deliberately does not touch; upgradeable later if abused. (c) **API Gateway route throttling** —
see the correction above: unbuildable without a Terraform change. (d) **DynamoDB counter** (035) —
unnecessary; the subscriber row's own `confirm_sent_at` carries the cap.

⚠ **What this leaves open, stated plainly**: the cooldown caps **email per address**, which is the
amplification vector FR-035 names. It does **not** cap *requests* per source — a script can still POST
thousands of distinct addresses and have each receive exactly one opt-in email. That is the same
per-source/per-identity split 035 hit (FR-012 vs FR-013: two mechanisms, not one), and closing it needs
WAF or a gateway throttle. Accepted for a low-value marketing endpoint; recorded so it is a decision rather
than an oversight.

## R5 — The confirmation email goes through email-kit (not hand-rolled)

**Decision**: Add **one new `email-kit` template `newsletter-confirmation`** (MJML → compiled artifact →
drift/size/contrast guards, like the other seven). The edge service renders and sends it via the existing
email-kit + SES wiring. It is a **transactional/opt-in** message (a confirm action), so it needs no
marketing unsubscribe footer yet; it carries the confirm link and expires-in copy.

**Rationale**: 038 deleted every hand-rolled mailer and made the typed catalogue the only way to send —
a hand-assembled string here would reintroduce exactly what 038 removed, and would miss the monochrome/
dark-mode/size guards. The template inherits the monochrome tokens automatically (038 SC-020).

**Dependency/risk**: 039's newsletter email depends on **038 being deployed** (the `CustomMessage`
interceptor + email-kit send path). 038 is code-complete but not deployed. This is recorded as a
dependency; the newsletter section (US6) is sequenced last so the visual redesign does not wait on it.

**Alternatives rejected**: Hand-rolled `string[]` mailer (regresses 038); reusing an existing template
(none fits a subscribe confirmation).

## R6 — "View all categories" and rail "view all" targets

**Decision**: Category shortcuts link to `/search?category=<key>` (the existing facet-as-query-param
convention); "view all categories" links to the **existing `/browse` page**. Rail "view all" reuses the
existing `railHref` logic (`on_sale` → `/search?saleOnly=true`, `category:*` → `/search?category=…`,
featured → `/search`).

**Rationale**: These routes and conventions already exist (011/025 FR-017, SEO-safe query facets); the
redesign is composition, not new navigation. `/browse` already renders the full category set with
`CategoryTile`.

**Alternatives rejected**: A new all-categories route (redundant with `/browse`).

## R7 — Reuse vs. new components

**Decision**: **Reuse** `ProductCard` (locked), `ProductRail`, `PromoCarousel` (for carousel-placement
banners), `CategoryTile`, and the whole `components/storefront/kit.tsx` vocabulary. **New** components only
where the reference introduces a genuinely new composition: `ValueStrip`, `CategoryStrip` (circular tiles,
distinct from the existing `CategoryChips`/`CategoryMosaic`), `OffersPanels` (large+two-stacked),
`AppPromo` + `StoreBadges`, `NewsletterForm`. The current `CategoryMosaic` may be retired or repurposed
into `CategoryStrip`.

**Rationale**: Principle II — do not fork shared vocabulary. New files are only for new compositions the
kit does not already express.

**Alternatives rejected**: Rebuilding cards/rails to match the reference (violates the operator's
product-card lock and Principle II).

## R8 — Newsletter subscriber is not a customer

**Decision**: `public.newsletter_subscriber` is a standalone table keyed on email; it has **no FK to
`public.customer`** and no `cognito_sub`. A subscriber may never become a customer, and a customer is not
auto-subscribed.

**Rationale**: Spec Key Entities — conflating the two would leak account existence (a subscribe could
reveal a customer) and couple marketing consent to account state. Keeping them separate keeps FR-032's
non-enumeration property structurally true.

**Alternatives rejected**: A `newsletter_opt_in` column on `customer` (excludes non-customers, the majority
of a newsletter list, and entangles consent with the account).

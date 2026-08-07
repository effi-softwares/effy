# Feature Specification: Customer Web Home — Merchandised Landing Redesign

**Feature Branch**: `039-customer-home-redesign`

**Created**: 2026-08-07

**Status**: Draft

**Input**: User description: "Redesign the customer-web home page into a richer, longer merchandised landing page, adapting the composition of a reference grocery template while keeping Effy's monochrome design language and reusing existing storefront data; keep the header, product card and footer unchanged; deliver section by section."

## Context & Framing

The customer storefront home page (the platform's flagship public surface, first built in 025 and
extended by 028/029) is today a short page: a type-led hero, a promo carousel, a few product rails and
a category mosaic. The operator wants a **richer, longer merchandised landing page** in the register of
a modern grocery storefront — more like the reference the operator supplied — while staying **strictly
on Effy's monochrome design language** (no brand hue; constitution v1.11.0, Principle V).

This is a **presentation slice**. It reuses the storefront data the platform already serves and adds
**no new catalogue capability**. The single exception is the newsletter section (User Story 6), which
is a genuinely new, small, self-contained capability with its own data and email.

**Explicitly out of scope / unchanged** (operator decisions): the header / top navigation / information
strip, the **product card** design, and the **footer**. These are not redesigned by this feature.

**Delivery discipline**: sections are built and delivered **one at a time**, top to bottom, so the
operator can review each finished section before the next begins. Each User Story below corresponds to
one reviewable section.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A welcoming, image-led hero (Priority: P1)

A first-time visitor lands on the home page and immediately understands what Effy is — a single-brand
grocery and everyday-essentials delivery service — from a prominent hero band: a headline, a short
supporting line, a primary "shop now" action and a secondary action, sitting beside a hero image, with
a small honest value strip (selection / quality / delivery) directly beneath.

**Why this priority**: The hero is the first thing every visitor sees and sets the tone for the whole
redesign. It is the highest-visibility section and the operator's lead request.

**Independent Test**: Load the home page as a guest; confirm the hero renders with headline, supporting
copy, both actions (primary navigates to browse, secondary to a sensible destination), the value strip,
and — where the hero image asset is present — the image; where it is absent, a neutral on-brand
placeholder in its place with no broken-image frame. Confirm it is legible in both light and dark
appearance and on a narrow (phone) viewport.

**Acceptance Scenarios**:

1. **Given** a guest with no account, **When** they open the home page, **Then** the hero is present in
   the initially served page (not dependent on catalogue data loading) with a headline, supporting line,
   a primary action and a secondary action.
2. **Given** the hero image asset exists, **When** the hero renders, **Then** the image is shown and the
   headline/actions remain fully legible over or beside it (a controlled zone or scrim guarantees
   contrast) in both light and dark appearance.
3. **Given** the hero image asset is missing, **When** the hero renders, **Then** a neutral placeholder
   fills the image area and no broken image is shown; the rest of the hero is unaffected.
4. **Given** the value strip, **When** it renders, **Then** every claim it makes is true of the platform
   as built (no invented numbers, ratings or guarantees).
5. **Given** a phone-width viewport, **When** the hero renders, **Then** it reflows to a single column
   with the actions and copy remaining usable and the image not crowding the text.

---

### User Story 2 - Browse by category shortcuts (Priority: P1)

A shopper wants to jump straight to a department. Below the hero, a row of category shortcuts (a
recognisable image/initial tile plus the category name, in the spirit of the mobile app's category row
and the reference's circular tiles) lets them tap into a category listing, with a "view all categories"
affordance for the full set.

**Why this priority**: Category navigation is the primary way a grocery shopper narrows a large
catalogue; it is core to the page's usefulness and depends only on data already served.

**Independent Test**: Load the home page; confirm a horizontal row of category shortcuts appears for
categories that have stocked products, each navigating to that category's listing; confirm a "view all
categories" control is present; confirm empty/absent categories degrade gracefully (the row hides itself
rather than showing zero tiles), and that a category with no representative image shows a neutral
tile rather than a broken frame.

**Acceptance Scenarios**:

1. **Given** categories that contain stocked products, **When** the section renders, **Then** a shortcut
   is shown for each (up to a sensible cap) and tapping one opens that category's product listing.
2. **Given** more categories than the row shows, **When** the shopper uses "view all categories",
   **Then** they reach the full browse/category experience.
3. **Given** a category with no representative image, **When** its shortcut renders, **Then** a neutral
   on-brand tile (e.g. its initial) is shown instead of a broken image.
4. **Given** no stocked categories at all, **When** the page renders, **Then** the category section is
   omitted entirely rather than shown empty.

---

### User Story 3 - Discover products through merchandised sections (Priority: P1)

A shopper scrolls a sequence of named product sections — on-sale items, featured items, and
category-specific rows — each a horizontal or grid row of the existing product cards with a "view all"
into the corresponding listing. Multiple such sections appear down the page (interleaved with the
promotional and app sections below), giving the page its "long merchandised landing" character.

**Why this priority**: Surfacing products is the page's commercial purpose; it reuses existing data and
the unchanged product card, so it is both high value and low risk.

**Independent Test**: Load the home page with a seeded catalogue; confirm an on-sale section, a featured
section and up to several category sections render, each using the existing product-card design
unchanged, each with a working "view all" to the matching listing; confirm sections with no products
hide themselves; confirm the whole merchandised block degrades to a friendly message when the catalogue
cannot be loaded, and to an "on its way" message when the catalogue is empty.

**Acceptance Scenarios**:

1. **Given** on-sale products exist, **When** the page renders, **Then** an "on sale" section shows them
   using the current product card unchanged, with a "view all" to the on-sale listing.
2. **Given** featured and category rows have products, **When** the page renders, **Then** each renders
   as its own titled section with a "view all" to the matching listing.
3. **Given** a section has no products, **When** the page renders, **Then** that section is omitted (no
   empty row).
4. **Given** the catalogue read fails, **When** the page renders, **Then** the merchandised area shows a
   friendly, self-explaining "couldn't load the store" state with a way to retry.
5. **Given** the catalogue is empty, **When** the page renders, **Then** the merchandised area shows a
   friendly "shelves are being stocked" state.

---

### User Story 4 - Promotional offer panels (Priority: P2)

A shopper sees a visually strong promotions block adapting the reference's composition — one large
feature panel beside two smaller stacked panels — each panel showing an advertised promotion's artwork
and message, and tapping a panel opens that promotion in full (its code, terms and how long is left).
A second, similar offers block appears lower on the page.

**Why this priority**: Promotions drive conversion and the operator specifically called out the
reference's panel composition, but it depends on promotions being advertised (which may be none), so it
ranks below the always-present browse sections.

**Independent Test**: With one or more advertised promotions, confirm the block renders in the
large-plus-two-stacked composition, each panel legible over its artwork (a scrim guarantees contrast),
each panel tapping through to the promotion's full detail; with fewer promotions, confirm the
composition degrades sensibly (e.g. only the panels that have promotions render, never an empty frame);
with none advertised, confirm the block is omitted entirely.

**Acceptance Scenarios**:

1. **Given** three or more advertised offer promotions, **When** the block renders, **Then** it shows
   one large panel and two stacked panels, each with artwork and message and each tapping through to
   that promotion's full detail.
2. **Given** a promotional panel, **When** it renders over artwork, **Then** its text is legible in both
   appearances because a scrim/controlled zone guarantees contrast regardless of the artwork.
3. **Given** fewer than three advertised offer promotions, **When** the block renders, **Then** it shows
   only the panels it has data for and never renders an empty or placeholder panel.
4. **Given** no advertised offer promotions, **When** the page renders, **Then** the promotions block is
   omitted entirely.
5. **Given** a promotion that expired or was exhausted between page load and the tap, **When** the
   shopper taps its panel, **Then** they reach a clear "this offer has ended" state, never void terms.

---

### User Story 5 - Awareness of the mobile apps (Priority: P3)

A shopper sees a section inviting them to get the Effy mobile app, with Google Play and App Store badges
and space for app artwork. Because the apps are not yet published, the badges are shown but **disabled /
marked "coming soon"** and link nowhere; the copy is honest about availability.

**Why this priority**: It is brand-building rather than functional, and the apps are not live, so it is
low priority and deliberately non-linking.

**Independent Test**: Confirm the section renders with both store badges visibly present but
non-interactive (no navigation, clearly "coming soon"), honest copy, and space for app art; confirm no
invented store URLs exist anywhere in the section.

**Acceptance Scenarios**:

1. **Given** the apps are unpublished, **When** the section renders, **Then** both store badges are
   shown but do not link anywhere and are clearly presented as "coming soon".
2. **Given** the section copy, **When** it renders, **Then** it makes no false claim about the apps being
   downloadable today.
3. **Given** the section, **When** rendered in both appearances, **Then** it stays on the monochrome
   ramp and is legible.

---

### User Story 6 - Subscribe to Effy updates (newsletter) (Priority: P3)

A visitor who wants to hear from Effy enters their email address in a newsletter section and submits it.
The system records the interest, sends a confirmation/opt-in email, and gives clear feedback for
success, invalid input and failure. An address already on the list gets the **same** success feedback as
a new one, deliberately. The copy is honest — it does **not** promise a discount unless a real promotion
backs it.

**Why this priority**: It is the only section requiring new backend work (endpoint, storage, email) and
is independent of the rest of the page, so it is sequenced last and can ship after the visual sections.

**Independent Test**: Submit a valid new email and confirm a success state and that a confirmation email
is sent; submit an already-subscribed email and confirm the response is **indistinguishable** from the
first (and that no second record or email results); submit an invalid email and confirm inline validation
without a request; simulate a backend failure and confirm a friendly, retryable error; confirm no discount
or other unbacked claim appears.

**Acceptance Scenarios**:

1. **Given** a valid, not-yet-subscribed email, **When** the visitor submits, **Then** the system
   records the subscription intent, sends a confirmation email, and shows a success state.
2. **Given** an email already subscribed, **When** the visitor submits, **Then** the system shows the
   **same** surface a new subscription shows — byte-for-byte indistinguishable — disclosing neither that
   the address is already on the list nor that it has an Effy account, and creating no duplicate record
   and sending no second email within the cooldown.
3. **Given** an invalid email, **When** the visitor submits, **Then** the form shows inline validation
   and makes no backend request.
4. **Given** the subscribe backend is unavailable, **When** the visitor submits, **Then** the form shows
   a friendly, retryable error and does not lose what they typed.
5. **Given** the section copy, **When** it renders, **Then** it contains no discount or incentive claim
   that is not backed by a real, live promotion.

---

### Edge Cases

- **Hero art absent or slow**: the page never shows a broken image; a neutral placeholder holds the
  space and no layout shift occurs when the asset arrives.
- **Monochrome vs. supplied colourful artwork**: the hero and promotional artwork are photographic
  content, not design tokens. Text over any artwork is guaranteed legible by a scrim/controlled zone;
  the UI chrome (type, buttons, chips, borders, backgrounds) stays entirely on the neutral ramp — no new
  colour enters the design system.
- **Partial data**: any section whose data is empty (no categories, no on-sale items, no advertised
  promotions) hides itself; the page remains coherent with any subset present.
- **Catalogue unavailable**: the merchandised region degrades to a single friendly, retryable state
  rather than a wall of empty sections.
- **Very long page / performance**: below-the-fold imagery must not block first paint; the page's static
  shell is present for crawlers and the first paint regardless of how much streams in later.
- **Newsletter abuse**: repeated or automated submissions of the newsletter form must not create
  duplicate subscriptions or become an email-amplification vector; submitting an email must not reveal
  whether that email already has an Effy account.
- **Accessibility**: one and only one page-level heading; sections use ordered headings; every
  interactive element meets the platform's touch-target minimum; meaning never rests on colour alone.

## Requirements *(mandatory)*

### Functional Requirements

**Composition & scope**

- **FR-001**: The home page MUST present, in this top-to-bottom order: hero (+ value strip), category
  shortcuts, and a sequence of merchandised product sections interleaved with promotional-offer blocks,
  an app-awareness section, and a newsletter section — a longer, richer landing than the current page.
- **FR-002**: The feature MUST NOT change the header/top navigation/information strip, the product-card
  design, or the footer.
- **FR-003**: The feature MUST NOT add any new catalogue/browsing capability; all product, category and
  promotion content MUST come from data the platform already serves. (The newsletter is the sole new
  capability — FR-030+.)
- **FR-004**: Every section MUST hide itself when it has no data to show, and the page MUST remain
  coherent with any subset of sections present.

**Design & brand**

- **FR-005**: All UI chrome MUST use only the existing monochrome neutral ramp and the two existing
  semantic colours; the feature MUST introduce no new colour **token** and MUST pass the platform's
  colour guards. **The hero's three value panels are the single, recorded exception** — see FR-005a.
- **FR-005a** *(added 2026-08-07, operator direction)*: The hero's three value panels MAY use the
  reference storefront's three fills. The exception is bounded, and every bound is a requirement:
  - The values MUST be **component-local** and MUST NOT become design tokens — `tokens.css` unchanged,
    no Compose theme regenerated, `tokens:check` passing unchanged, the other five surfaces unmoved.
  - They MUST NOT be named for a role (no "brand orange"), so they cannot be adopted elsewhere by
    a later feature reading them as a palette.
  - Each panel's text colour MUST be chosen for **WCAG AA (≥ 4.5:1)** against its own fill. ⚠ The
    reference's own panels do not meet this — measured against white text, its orange is **3.15:1** and
    its green **2.59:1** — so the fills are reproduced exactly and the *foreground* is adapted per panel.
  - No other chrome on the page may take colour from them.

  ⚠ **This narrows FR-005, it does not repeal it.** Everything else on the page — type, buttons, rules,
  backgrounds, the newsletter form, the offer panels — stays entirely on the monochrome ramp, and
  SC-004 is amended in step to exempt these three fills and nothing else. Precedent: 024 took
  operator-requested brand colours for the mobile splash grounds on exactly these terms (asset-local,
  no token, no theme change).
- **FR-006**: The page MUST be correct and legible in both light and dark appearance, and MUST respect
  the platform's existing appearance switching.
- **FR-007**: Photographic content (hero image, promotional artwork) MAY be full-colour, but any text
  placed over it MUST remain legible by means of a scrim or controlled zone, independent of the artwork.
- **FR-008**: The feature MUST reuse the shared storefront visual vocabulary and product components
  rather than forking them.

**Hero (US1)**

- **FR-010**: The hero MUST show a headline, a short supporting line, a primary action (shop/browse) and
  a secondary action, plus a value strip whose claims are all true of the platform as built.
- **FR-011**: The hero MUST consume a hero image from a known static location and MUST render a neutral
  placeholder — never a broken image — when the asset is absent.
- **FR-012**: The hero MUST be part of the immediately served page (not gated on catalogue data).

**Categories (US2)**

- **FR-013**: The category section MUST show a shortcut per stocked category (up to a sensible cap), each
  navigating to that category's listing, plus a "view all categories" affordance.
- **FR-014**: A category with no representative image MUST render a neutral tile, never a broken frame.

**Merchandised products (US3)**

- **FR-015**: The page MUST render an on-sale section, a featured section and category sections, each
  using the unchanged product card and each with a "view all" to the matching listing.
- **FR-016**: The merchandised region MUST degrade to a single friendly, retryable state when the
  catalogue cannot be loaded, and to an "on its way" state when the catalogue is empty.

**Promotions (US4)**

- **FR-017**: The promotions block MUST adapt the reference composition (one large panel beside two
  stacked panels), driven by advertised offer promotions, with each panel legible over its artwork and
  tapping through to that promotion's full detail.
- **FR-018**: The promotions block MUST NOT show placeholder or empty panels — it renders only panels it
  has data for. (Its omission when no offer promotions are advertised follows from FR-004, which is not
  restated here.)
- **FR-019**: A tapped promotion that has since expired/exhausted MUST resolve to a clear "offer has
  ended" state, never void terms.
- **FR-020**: A second offers block MAY appear lower on the page under the same rules, using any
  remaining advertised offer promotions; it MUST NOT duplicate a promotion already shown above.

**App awareness (US5)**

- **FR-021**: The app section MUST show Google Play and App Store badges that are present but
  non-interactive and clearly "coming soon"; it MUST contain no store URLs.
- **FR-022**: The app section copy MUST make no false claim about current availability.

**Newsletter (US6)**

- **FR-030**: The newsletter section MUST let a visitor submit an email address to subscribe to Effy
  updates, with client-side validation before any request.
- **FR-031**: On a valid new submission, the system MUST record the subscription and send a
  confirmation/opt-in email through the platform's existing email delivery system.
- **FR-032**: The system MUST treat a repeat submission of an already-known email idempotently (no
  duplicate record, no error to the visitor) and MUST NOT reveal whether the submitted address has an
  Effy account.
- **FR-033**: The newsletter form MUST show distinct, friendly states for **success, invalid input, and
  backend failure**, and MUST preserve the visitor's input on failure.

  ⚠ **AMENDED 2026-08-07.** This requirement previously named a fourth, *already-subscribed* state.
  **It contradicted FR-032.** A visibly distinct "you're already on the list" response is a
  subscriber-enumeration oracle: anyone can probe an address and learn whether it is on the list, which
  is exactly the disclosure FR-032 forbids and exactly what double opt-in (Assumptions) exists to
  prevent being used against a third party. The uniform response wins because it is the security
  property; the already-subscribed case is therefore **indistinguishable from success by design**, not
  by omission. Three states, not four.
- **FR-034**: Newsletter copy MUST NOT advertise a discount or incentive unless a real, live promotion
  backs it.
- **FR-035**: The subscribe path MUST NOT become a duplicate-subscription or email-amplification
  vector: a repeated submission of the same address MUST NOT create a second record, and MUST NOT send
  a second confirmation email within a cooldown window.

  ⚠ **AMENDED 2026-08-07.** This requirement previously said "rate limiting and/or equivalent", which
  the plan read as per-route API Gateway throttling. **That is not buildable where it was placed**: HTTP
  API throttling is a *stage* `route_settings` property, the stage (`aws_apigatewayv2_stage.default`) is
  Terraform-owned in `infra/envs/dev/edge-gateway.tf`, and the service attaches with an external
  `httpApi.id` — so no `serverless.yml` change can set it. Rather than grow a presentation slice into an
  infrastructure one, the requirement is restated as the **outcome** it actually cares about, which the
  per-address cooldown in the subscriber record delivers in one SQL statement. A gateway throttle
  remains available if this low-value target is ever actually abused (research R4).

**Cross-cutting**

- **FR-040**: The page's structure, headings and hero MUST be readable by a visitor or a search engine
  that runs no scripts, without waiting on request-time data; content that does depend on request-time
  data MUST NOT delay them.
- **FR-041**: The redesign MUST NOT increase what a guest downloads to view a public page beyond the
  platform's existing limit.
- **FR-042**: Any analytics the feature emits MUST carry no personal information beyond the auth subject
  id, consistent with platform telemetry rules.
- **FR-043**: Every empty and error state on the page MUST explain itself in plain language and offer at
  least one way forward.

### Key Entities *(include if feature involves data)*

- **Newsletter subscriber**: represents a person's interest in receiving Effy updates. Key attributes
  (implementation-agnostic): the email address, a confirmation/opt-in status (pending vs confirmed),
  and the time of subscription. It is deliberately **separate** from a customer account — a subscriber
  need not be, and may never become, a registered customer, and the two MUST NOT be conflated.
- **Existing storefront content** (reused, not defined here): categories, product cards, merchandising
  rails and advertised promotional banners — all already served by the platform.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A guest can see and understand the hero (what Effy is and how to start shopping) within
  the first screen on both desktop and phone, with no broken image and no layout shift when the hero art
  loads.
- **SC-002**: From the home page, a shopper can reach a category listing in one tap from the category
  shortcuts, and the full category set in one more.
- **SC-003**: The home page presents at least three distinct merchandised product sections when the
  catalogue is seeded, each using the unchanged product card.
- **SC-004**: 100% of the page's UI chrome resolves to the monochrome ramp / existing semantic colours —
  the platform's colour guards pass with zero new tokens. **The sole exception is the hero's three value
  panel fills (FR-005a)**, which are component-local values, not tokens; `tokens:check` therefore passes
  **unchanged**, which is the mechanical proof the exception did not leak into the design system.
- **SC-005**: The page renders correctly with any subset of sections' data present or absent — verified
  across at least: full data, no promotions, no categories, empty catalogue, catalogue error — with no
  empty rows and a self-explaining state in every degraded case.
- **SC-006**: The page is legible and correct in both light and dark appearance across desktop, tablet
  and phone widths.
- **SC-007**: The public guest page stays within the enforced page-weight budget after the redesign.
- **SC-008**: A visitor can subscribe to the newsletter with a valid email and receive a confirmation
  email; an invalid email is caught before any request; an already-subscribed email produces a response
  **indistinguishable** from a new one; and a submitted email never reveals whether an Effy account or a
  newsletter subscription exists for it.
- **SC-009**: Every interactive element on the page meets the platform's touch-target minimum (44 × 44 CSS
  px on web — see plan § Numeric thresholds), the page
  has exactly one top-level heading with a correct heading order, and no section conveys meaning by
  colour alone.
- **SC-010**: Each section is delivered and reviewable independently, in order, without the unbuilt
  sections breaking the page.

## Assumptions

- **Reference is compositional only**: the supplied "organic grocery" reference and hero art inform
  *layout and composition*, not palette. Effy stays monochrome; the reference's green/orange/yellow
  branding is not adopted. The supplied hero image is treated as a **photographic content asset** placed
  in the app's static files — it is not a design token and does not affect the colour guards; text over
  it is protected by a scrim/controlled zone, and it must read acceptably in both appearances.
- **Hero art is operator-supplied**: the operator provides the hero image; until it is placed, the hero
  renders a neutral placeholder. One hero image is assumed (no rotating hero carousel) unless the
  operator later asks for more.
- **Product sections reuse existing rails**: the merchandised sections map onto the storefront's existing
  Featured, On-sale and category rails; no "best selling" or other new ranking is introduced (that would
  need new backend data and is out of scope).
- **Promotions reuse advertised banners**: the promotional panels are driven by the platform's existing
  advertised-promotion data (the "offers" placement); with none advertised, the blocks are absent.
- **App badges are non-functional**: the apps are unpublished; badges are decorative/"coming soon" with
  no URLs, to be wired in a later slice when the apps ship.
- **Newsletter is a new, minimal capability**: it needs a public subscribe path, storage for
  subscribers, and a confirmation email via the existing platform email system; it is intentionally the
  last section delivered and is independent of the visual sections. Double opt-in (confirmation email) is
  assumed as the default to prevent using the form to subscribe others.
- **No reviews/ratings, no blog/articles, no testimonials**: the reference's article grid, testimonial
  carousel and star ratings have no data source on this platform and are **not** part of this redesign
  (the reference's "latest articles" and "people are also looking for" blocks are dropped).
- **Delivery is section-by-section**: each User Story is a separately reviewable increment; the page must
  stay coherent at every step even before later sections exist.

## Dependencies

- The existing storefront read capabilities (home rails + advertised banners, and the category list) and
  the existing product card, header and footer — all reused unchanged.
- The platform's monochrome design-system tokens and shared storefront vocabulary.
- The platform's email delivery + templating system (037/038) for the newsletter confirmation email.
- The operator to supply the final hero image asset (and later, real app-store URLs when the apps ship).

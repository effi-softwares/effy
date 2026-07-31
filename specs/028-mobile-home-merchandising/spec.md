# Feature Specification: Customer Mobile Home — Sectioned Merchandising & Search Entry

**Feature Branch**: `028-mobile-home-merchandising`

**Created**: 2026-07-31

**Status**: Draft

**Input**: User description: "i would like to re design home page of android and ios apps. currently home page has normal list of products. i hope to do following UI changes in home page.
- when seach bar tap it should open the keyboard and let's user to search and search click we go to search page to show the results.
- home content area we need to have multiple sections. like featured products, best sellers etc.. in between them we need to have premotional banners, category sections with svgs or icons
- we can have list of some product i above mention with horizontal scrolling.
- we can have carousels
- we need to have small gap between each section

you need to do reaseach on internet to find good proffesional and modern figma or mobbin designs. you can follow popular e-commerce like ebay, wish, uber eats"

---

## Context: what this changes and why it is a reversal

The customer mobile Home tab today is a **single undifferentiated two-column product grid** ("Discover"): a
title, a search affordance, a row of filter chips, and then every product the home read returns, flattened
and de-duplicated into one list. Merchandising happens only through the chips.

That composition was a **deliberate decision of feature 026** (FR-025a: the mobile screens were replaced,
not restyled, to match a chosen source design — which put a browsable grid above the fold and removed the
hero, the carousel and the rails that feature 025 had built).

**This feature reverses that decision for the Home tab specifically, on operator direction.** The reversal is
recorded here rather than made silently, because 026's rationale (a shopper reaches product tiles without
scrolling past three screens of chrome) is a real cost that a sectioned home must be designed to pay back —
see SC-002 and SC-006, which exist to hold this feature to that bar.

Nothing outside the Home tab's presentation changes. Search, product detail, cart, checkout and the
navigation shell are untouched.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Search starts where the shopper is looking (Priority: P1)

A shopper opens the app wanting one specific thing — "oat milk". The search entry sits at the top of Home.
They tap it once: they arrive on the Search screen with the field already focused and the keyboard already
up, type, and submit. Results appear for what they typed.

**Why this priority**: Search is the highest-intent path in any store, and it is the one journey that is
useless if it takes an extra tap or an extra screen to reach the keyboard. It is also completely independent
of every merchandising section below it — shipping only this story already improves the app.

**Independent Test**: Fully testable by launching the app, tapping the Home search entry, and confirming the
shopper lands on Search with the keyboard raised and can run a query without a second tap — with no
merchandising section built at all.

**Acceptance Scenarios**:

1. **Given** the shopper is on Home, **When** they tap the search entry, **Then** the Search screen is shown
   with its query field focused, the on-screen keyboard raised, and a text caret ready to accept input — with
   no additional tap required.
2. **Given** the shopper has typed a query on the Search screen, **When** they submit it (keyboard
   search/return action), **Then** results for that query are shown and the keyboard is dismissed so the
   results are not obscured.
3. **Given** the shopper arrived at Search but typed nothing, **When** they navigate back, **Then** they are
   returned to Home with its scroll position and content unchanged.
4. **Given** the shopper submits an empty or whitespace-only query, **When** they press submit, **Then** no
   search is run and the field keeps focus.

---

### User Story 2 - Home is a sequence of named sections, not one list (Priority: P2)

A shopper who does not know what they want scrolls Home. Instead of one long grid, they move through a small
number of clearly named sections — Featured, On sale, and a few of the store's own groupings — each showing a
handful of products side by side, each scrollable sideways to see more, each separated from the next by a
consistent, small gap so the boundaries are obvious without heavy dividers.

**Why this priority**: This is the substance of the request and the reason the grid is being replaced. It is
independently testable and independently valuable — sections alone, with no banners and no category icons,
already turn an undifferentiated list into a browsable store.

**Independent Test**: Fully testable by loading Home against a store with several product groupings and
confirming each grouping renders as its own titled, horizontally scrollable section with consistent spacing —
with no banner and no category row present.

**Acceptance Scenarios**:

1. **Given** the store returns several merchandising groupings, **When** Home loads, **Then** each grouping is
   shown as its own section with a visible title, in a stable, deterministic order.
2. **Given** a section holds more products than fit on screen, **When** the shopper drags it sideways, **Then**
   the section scrolls horizontally and the vertical page position does not move.
3. **Given** a section holds more products than fit on screen, **When** it is at rest, **Then** a partial next
   product is visible at the trailing edge, signalling that more content exists sideways.
4. **Given** a section has a title, **When** the shopper taps the section's "see all" affordance, **Then** they
   are taken to a screen listing that section's full contents.
5. **Given** any two adjacent sections, **When** Home is rendered, **Then** the vertical gap between them is
   the same everywhere on the screen and is drawn from the platform spacing scale.
6. **Given** a section would render with no products, **When** Home loads, **Then** that section is omitted
   entirely rather than shown empty.

---

### User Story 3 - Category shortcuts with icons (Priority: P3)

Near the top of Home, above the deeper merchandising, the shopper sees a row of category shortcuts, each an
icon with a short label. Tapping one takes them to that category's products. Scanning the row tells them what
kind of store this is before they read a single product name.

**Why this priority**: Research on mobile storefronts is explicit that the homepage's first job is to set
correct expectations about catalogue breadth, and that category representation — not carousels — is what
shoppers actually attend to. It is independently testable and shippable on top of, or without, US2.

**Independent Test**: Fully testable by loading Home and confirming a scannable icon-and-label category row is
present, that each entry navigates to that category's products, and that a category with no matching icon
still renders legibly.

**Acceptance Scenarios**:

1. **Given** the store has top-level categories, **When** Home loads, **Then** a horizontally scrollable row of
   category shortcuts is shown, each with an icon and a short text label.
2. **Given** the shopper taps a category shortcut, **When** navigation completes, **Then** they see products
   restricted to that category, and the scope of what they are looking at is stated on screen.
3. **Given** a category has no icon assigned to it, **When** the row renders, **Then** a neutral fallback glyph
   is shown and the label still identifies the category — never a blank tile or a broken image.
4. **Given** the store has no categories at all, **When** Home loads, **Then** the category row is omitted and
   the rest of Home renders normally.

---

### User Story 4 - Promotional banners between sections (Priority: P4)

Between merchandising sections the shopper meets a promotional banner — a wide, tappable panel carrying a short
message and, where more than one is live, swipeable to the next. Tapping it takes them to what it advertises.

**Why this priority**: Banners are the lowest-attention element on a mobile storefront (research is consistent
that shoppers scroll past carousels and that most never see every slide), so they earn their place only after
the sections and the category row exist. They are also the element most likely to be wrong if the content
behind them is not settled.

**Independent Test**: Fully testable by loading Home with one, several, and zero promotional items and
confirming the banner renders, swipes, navigates and disappears correspondingly.

**Acceptance Scenarios**:

1. **Given** at least one promotional item is live, **When** Home loads, **Then** a banner is shown between
   merchandising sections, carrying readable text.
2. **Given** more than one promotional item is live, **When** the shopper swipes the banner sideways, **Then**
   the next one is shown and a position indicator reflects which one they are on.
3. **Given** the banner is displayed, **When** the shopper does nothing, **Then** it does not advance on its
   own.
4. **Given** the shopper taps a banner, **When** navigation completes, **Then** they are taken to what it
   advertises, and that destination is also reachable elsewhere in the app without using the banner.
5. **Given** no promotional item is live, **When** Home loads, **Then** no banner and no empty placeholder is
   shown, and the surrounding sections close up.

---

### User Story 5 - An operator can put a live promotion on Home (Priority: P5)

An operator running a promotion in the back-office marks it as publicly advertisable and gives it a
shopper-facing line of copy. It appears as a banner on Home. When the promotion ends, is used up, or is
withdrawn, it stops being advertised — without an app release and without anyone remembering to take it down.

**Why this priority**: It is what makes US4 more than decoration. A banner nobody can change is a banner that
will be wrong within a month. It is sequenced after the shopper-facing stories because the layout is testable
against a placeholder promotion before this exists.

**Independent Test**: Fully testable from the back-office alone — mark a promotion advertisable, confirm it
appears on Home; end it, confirm it disappears on the next load — without touching the mobile app.

**Acceptance Scenarios**:

1. **Given** an active promotion that has been marked publicly advertisable with shopper-facing copy,
   **When** Home is loaded, **Then** that promotion is shown as a banner using that copy.
2. **Given** an active promotion that has **not** been marked advertisable, **When** Home is loaded, **Then**
   it is not shown anywhere on Home.
3. **Given** an advertised promotion expires, is exhausted or is withdrawn, **When** Home is next loaded or
   refreshed, **Then** it is no longer advertised.
4. **Given** an advertised promotion carries a condition such as a minimum spend, **When** the banner is
   shown, **Then** the shopper learns of that condition from the banner or from where it leads — never first
   at payment.

---

### Edge Cases

- **Empty store** — the store returns no groupings, no categories and no promotions: Home MUST show a single
  honest empty state, not a stack of empty section headings.
- **A section with one product** — it MUST render as a section, not collapse into something that looks broken,
  and MUST NOT show a "more sideways" affordance it cannot honour.
- **Slow or failed images** — a missing product or banner image MUST NOT blank the section it sits in.
- **Load failure** — a failed Home load MUST offer a retry; a failed *refresh* MUST leave the content already
  on screen in place ("we couldn't check" must never read as "there is nothing here").
- **Refresh** — pulling down MUST refresh Home's content without blanking the screen and without losing the
  shopper's place.
- **Screen reader traversal** — a horizontally scrolling section MUST be traversable and its boundaries
  announced, so a non-sighted shopper is not trapped in an unbounded sideways list.
- **Reduced motion** — with the OS reduced-motion setting on, banner transitions and section entrance
  animations MUST be suppressed or reduced.
- **Large screens / tablets and landscape** — sections MUST adapt to the wider window rather than stretching a
  phone layout, and MUST NOT show a single product occupying half the screen width.
- **Very long product or category names** — MUST truncate predictably without changing a section's row height
  or misaligning neighbouring products.
- **Guest vs. signed-in** — Home is public; every section MUST render for a signed-out shopper, and no section
  may require an account to be visible.
- **Offline** — Home MUST state that it could not load rather than showing a permanently empty store.
- **Duplicate products across sections** — the same product legitimately appearing in two sections MUST NOT be
  treated as an error, but MUST NOT appear twice *within* one section.

## Requirements *(mandatory)*

### Functional Requirements

#### Scope and governance

- **FR-001**: The redesign MUST apply to the **customer mobile app on both Android and iOS**, which MUST remain
  visually and behaviourally identical to each other except where the host platform's own conventions require
  a difference.
- **FR-002**: The change MUST be confined to the **Home tab's presentation**. The Search screen, product
  detail, cart, checkout, orders, account and the navigation shell MUST NOT change behaviour.
- **FR-003**: This specification **supersedes feature 026's FR-025a for the Home tab only**. Every other screen
  026 composed MUST be left as it is.
- **FR-004**: Home MUST continue to obey the platform design language: the monochrome palette with no brand
  hue, the platform typeface, and the platform spacing and radius scales. **No section, banner or category icon
  may introduce a colour to carry meaning**, and none may rely on colour alone to distinguish itself.
- **FR-005**: Where a section or banner is composed as a card-like container, the deviation from the platform's
  "no card layouts" doctrine MUST be justified and recorded during planning; where a sectioned list or a plain
  panel serves as well, that MUST be preferred.
- **FR-006**: Home MUST retain the capabilities the platform already owes every screen: safe-area insets,
  content-shaped loading placeholders, pull-to-refresh, press feedback, minimum touch-target sizes, dark mode,
  and reduced-motion handling.

#### Search entry (US1)

- **FR-007**: Home MUST present a search entry, visible without scrolling, positioned above the merchandising
  content.
- **FR-008**: Tapping the search entry MUST, in a **single tap**, take the shopper to the Search screen with
  its query field **already focused** and the on-screen keyboard **already raised**. No second tap may be
  required to begin typing.
- **FR-009**: Home's search entry MUST NOT itself accept text. Typing, refinement, sorting and result paging
  MUST all happen on the Search screen, so the app has exactly **one** search field.
- **FR-010**: Submitting a non-empty query MUST run that search and show its results, and MUST dismiss the
  keyboard so the results are not obscured.
- **FR-011**: Submitting an empty or whitespace-only query MUST NOT run a search and MUST keep the field
  focused.
- **FR-012**: Returning from Search to Home MUST restore Home's scroll position and content without a reload.
- **FR-012a**: Arriving at Search from Home MUST NOT clear a query the shopper ran previously in the same
  session unless they cleared it themselves — but the field MUST be focused and selectable so a new query
  replaces it in one action.

#### Sectioned content (US2)

- **FR-013**: Home's content area MUST be composed of **named sections presented in a stable, deterministic
  order**, not a single flat product list.
- **FR-014**: Each product section MUST show its products **side by side in a horizontally scrollable row**.
- **FR-015**: A horizontally scrollable section MUST show a **partial next item at its trailing edge** whenever
  more items exist beyond the viewport, and MUST NOT do so when they do not.
- **FR-016**: Horizontal scrolling within a section MUST NOT move the page vertically, and vertical scrolling of
  the page MUST NOT move a section sideways.
- **FR-017**: No single section may occupy more than **half the vertical viewport** at rest, so a shopper
  scrolling the page is never forced to drag through horizontally scrolling content.
- **FR-018**: Each section MUST carry a **"see all" affordance** leading to that section's full contents.
- **FR-019**: The vertical gap between adjacent sections MUST be a **single consistent value taken from the
  platform spacing scale**, applied identically between every pair of sections.
- **FR-020**: A section with no items MUST be omitted entirely. A section MUST NOT render a heading above
  nothing.
- **FR-021**: A product MUST NOT appear twice within the same section.
- **FR-022**: Products MUST be presented with the same product tile the rest of the app uses — the same
  imagery treatment, name, price, sale indication and availability rules.
- **FR-023**: An unavailable product MUST NOT be shown in a merchandising section.

#### Category shortcuts (US3)

- **FR-024** *(amended 2026-07-31, after live verification)*: Home MUST present a **horizontally scrollable
  row of category shortcuts**, each with an icon and a short label, placed above the deeper merchandising
  sections. The row MUST carry **the categories that actually hold products** — not a fixed level of the
  taxonomy.
  - ⚠ **Why this changed.** It originally said "top-level categories". Against the real catalogue that
    rendered **nothing at all**: every product's primary category is a leaf, and a category's product count
    does not roll up to its ancestors, so all three top-level categories report zero. Worse, category
    filtering everywhere is an exact primary-category match, so a top-level shortcut — even if shown —
    would open a results screen with **zero products**. A shortcut that leads nowhere is worse than no
    shortcut.
  - A **rollup** (a category's products including all descendants') would make top-level shortcuts
    possible and is the better long-term answer. It is a server capability this feature does not add;
    recorded as the follow-up.
- **FR-025**: The icons MUST be **vector artwork that renders crisply at any density and adapts to light and
  dark appearance**, and MUST be legible at the size they are shown.
- **FR-026**: Every category shown MUST have either an assigned icon or a **neutral fallback glyph**; a blank
  tile or a broken-image frame MUST never be shown.
- **FR-027**: Tapping a category shortcut MUST show products restricted to that category, and the screen it
  lands on MUST **state the scope the shopper is now looking at**.
- **FR-028**: The category row MUST represent enough of the store's breadth that a shopper can tell what kind of
  store this is from it alone (see SC-004).
- **FR-029**: The category row MUST be omitted when the store has no categories.

#### Promotional banners (US4)

- **FR-030**: Home MUST be able to show one or more **promotional banners placed between merchandising
  sections**, not only at the top of the screen.
- **FR-031**: Where more than one banner is live, they MUST be **swipeable** and MUST show a **position
  indicator**.
- **FR-032**: Banners MUST **NOT auto-advance**.
- **FR-033**: Banner text MUST be **real text, not text baked into an image**, so it stays legible at every text
  size and is available to a screen reader.
- **FR-034**: Anything a banner links to MUST be **reachable elsewhere in the app without the banner**. No
  destination may exist only behind a banner.
- **FR-035**: When no promotion is live, **no banner and no placeholder** MUST be shown, and the surrounding
  sections MUST close up without leaving a gap.
- **FR-036**: A banner MUST advertise something **true at the moment it is shown**. (The lifecycle that
  enforces this — expiry, exhaustion, withdrawal, un-marking — is specified once in FR-037c.)
- **FR-037**: Banners MUST be **derived from the promotions the back-office already manages**. No separate
  merchandising content store is introduced.
- **FR-037a**: A promotion MUST be advertised on Home **only when an operator has explicitly marked it as
  publicly advertisable**. Marking a promotion advertisable MUST be a deliberate act, because promotions
  exist that are legitimately private (a single customer's goodwill credit, a partner code) and a promotion
  becoming public by default would give every shopper a discount intended for one.
- **FR-037b**: An advertisable promotion MUST carry the **shopper-facing wording and optional artwork** shown
  on the banner. The promotion's internal code MUST NOT be used as the banner's headline — an operator's
  identifier is not a sentence a shopper can read.
- **FR-037c**: A promotion that has **expired, been exhausted, been withdrawn, or been un-marked as
  advertisable** MUST stop appearing on Home without an app release, and MUST be gone the next time Home's
  content is loaded or refreshed.
- **FR-037d**: A banner MUST NOT state a benefit the shopper would not actually receive. Where a promotion
  carries conditions (a minimum spend, an eligible category, a first-order-only rule), the banner MUST either
  state the condition or lead somewhere that does, before the shopper reaches payment.

#### Section composition

- **FR-038**: A section MUST NOT be labelled with a claim the store **cannot substantiate from data it
  actually holds**. In particular, a section MUST NOT be titled "best sellers", "most popular" or equivalent
  unless it is genuinely ordered by what shoppers bought.
- **FR-039**: A **sales-ranked best sellers section is deferred out of this feature** (see Out of Scope). The
  sections in this slice are those the store can substantiate today — its featured, on-sale and category
  groupings.
- **FR-040**: The set of sections MUST be **extensible** — adding a grouping later, including a sales-ranked
  best sellers section when purchase data supports one, MUST NOT require Home's layout to be rebuilt.

#### Resilience and accessibility

- **FR-041**: While Home is loading for the first time, it MUST show a **placeholder shaped like the sections
  that are coming**, not a bare spinner.
- **FR-042**: A failed first load MUST show a retry the shopper can act on. A failed refresh MUST leave the
  content already on screen untouched.
- **FR-043**: Every interactive element on Home MUST meet the platform minimum touch-target size and carry an
  accessible label describing what it does.
- **FR-044**: Each horizontally scrollable section MUST be announced to assistive technology as a bounded,
  named group, so a shopper using one can move past it.
- **FR-045**: When the OS reduced-motion setting is on, banner transitions and section entrance animations MUST
  be suppressed or reduced.
- **FR-046**: Home MUST adapt to large screens and landscape rather than stretching the phone layout.
- **FR-047**: Every section MUST render for a **signed-out shopper**; no section may require an account to be
  visible.

### Key Entities

- **Section** — a named, ordered grouping of products shown as one horizontally scrollable row on Home
  (e.g. Featured, On sale, a category grouping). Has a title, a stable identity, an ordered list of products,
  and a destination for "see all". ⚠ The storefront read, the plan and the codebase all call this a **rail**;
  the two words name the same thing, and a reader looking for "section" in the code will not find it.
- **Category shortcut** — a top-level way into the catalogue: a short label, an icon (or a fallback glyph), and
  the category it opens.
- **Promotional banner** — the shopper-facing face of an existing back-office promotion: a short message,
  optional artwork, a destination, and a position within the section sequence. It exists only while its
  promotion is active **and** marked publicly advertisable; it is not separately authored content and it has
  no lifetime of its own.
- **Advertisable promotion** — an existing back-office promotion that an operator has explicitly marked for
  public display, together with the shopper-facing wording shown in its place. Unmarked promotions are
  private and never appear on Home.
- **Product tile** — the platform's existing product presentation (image, name, price, sale indication,
  availability). Unchanged by this feature; reused as-is.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From opening the app, a shopper can raise the keyboard and begin typing a search in **one tap**,
  and reach results for what they typed in **one further action**.
- **SC-002**: On a standard phone, the shopper can see **at least one real product** on Home **without
  scrolling** — the sectioned layout must not push merchandise below the fold.
- **SC-003**: Home presents **at least three distinct named sections** when the store has enough content to
  fill them, and **zero empty sections** in every state.
- **SC-004** *(amended 2026-07-31 alongside FR-024)*: The category row surfaces **at least 30–40% of the
  categories the store can actually sell from**, spanning genuinely different kinds of product, so a
  first-time shopper can correctly describe what the store sells after looking only at Home. The row
  scrolls, so carrying **all** of them exceeds this floor rather than failing it — what the floor guards
  against is representing too narrow a slice of the catalogue.
  - ⚠ Measured against **sellable** categories, not top-level ones. See FR-024: top-level categories hold
    no products directly and cannot be filtered on, so a metric counting them would have scored 0% for a
    row that in fact shows nine working shortcuts spanning food, grocery and household.
- **SC-005**: No section occupies more than **50% of the vertical viewport** at rest.
- **SC-006**: Reaching the last section on Home takes **no more than four vertical swipes** on a standard phone,
  so the added structure does not turn browsing into a long scroll.
- **SC-007**: The vertical gap between every adjacent pair of sections is **identical**, verified on both
  platforms.
- **SC-008**: Home's first meaningful content appears within **2 seconds** on a typical connection, and a
  section's images finish loading within **1 second** of that section becoming visible.
- **SC-009**: **Five out of five** first-time testers, given the task "find and open one specific product you
  have in mind", complete it without opening a menu or asking for help.
- **SC-010**: Every element on Home is reachable and correctly announced by the platform screen reader, and a
  tester using one can move past every horizontally scrolling section without becoming stuck.
- **SC-011**: Home renders correctly in **light and dark appearance**, at the **largest supported system text
  size**, and on a **tablet in landscape**, with no clipped text, overlapping content, or horizontally
  scrolling page body.
- **SC-012**: With the store emptied of products, categories and promotions, Home shows **exactly one** empty
  state and **no** section headings, banners or placeholders.
- **SC-013**: Both platform builds behave identically against the same store content — a side-by-side
  comparison of Android and iOS shows the same sections, in the same order, with the same contents.
- **SC-014**: An operator can take a promotion from "running but not advertised" to "visible on Home" — and
  back off Home again — **without an app release**, and the change is reflected on a shopper's device the next
  time Home is loaded or refreshed.
- **SC-015**: A promotion that is **not** marked publicly advertisable appears **nowhere** on Home, verified
  against a store holding both advertised and private promotions at the same time.
- **SC-016**: No section on Home is labelled with a claim the store cannot substantiate — verified by
  inspection of every section title against the data that composes it.

## Design References (research)

Recorded here because the request asked for it, and because these are the sources the acceptance thresholds
above were drawn from — not as implementation guidance.

**Reference platforms** (per the platform's own design doctrine — "Uber Eats + eBay, food-first"):

- **Uber Eats** — the pattern this feature is closest to: a persistent search entry at the top, a horizontally
  scrollable row of **category icons** immediately beneath it, then a vertical sequence of **named sections**
  ("New on…", "Under 25 minutes"), each a horizontally swipeable row of tiles. Merchandising is carried by the
  section names, not by a hero.
- **eBay** — search placed prominently at the top, with category and deals entries directly below it, then
  featured events and offers. Confirms the ordering: **search → categories → merchandising**, with promotional
  content *after* the shopper has been oriented, not before.

**Evidence behind the numeric thresholds**:

- **SC-004 (30–40% of top-level categories)** — Baymard's mobile-homepage research finds 42% of mobile
  homepages set the wrong expectation about what a store sells, and recommends surfacing 30–40% of top-level
  categories, chosen for contrast rather than similarity. 70% of mobile shoppers scroll the homepage
  specifically to get an overview (vs. 25% on desktop), which is why the category row is P3 and the banner is
  P4.
- **FR-017 / SC-005 (≤50% of the viewport)** — Baymard finds that horizontally scrollable content taller than
  ~50% of the vertical viewport hijacks the page scroll: almost every shopper who wants to scroll down must
  touch it, causing unintended sideways movement.
- **FR-032 (no auto-advance) and FR-031 (swipe + indicator)** — Baymard's carousel requirements: mobile has no
  hover, so a shopper cannot pause an auto-rotating carousel and may be navigated somewhere they did not
  intend; carousels must support swipe gestures and show position.
- **FR-033 (real text, not baked into images)** — same source: image-baked text is illegible at small sizes and
  invisible to assistive technology.
- **FR-034 (no banner-only destinations)** — same source: most shoppers never see every slide, so nothing may
  be reachable only from a banner.
- **General carousel scepticism** — carousel use among top e-commerce sites has fallen from 52% to 28% as their
  usability costs became clear, and testing consistently shows shoppers attend to category navigation and
  search rather than carousels. This is the direct justification for the priority order in this spec: search
  (P1) and sections (P2) before category shortcuts (P3), and banners last (P4).

Sources: [Baymard — 42% of Mobile Homepages Risk Setting Wrong Expectations](https://baymard.com/blog/mobile-homepage-usability),
[Baymard — 10 UX Requirements for Homepage Carousels](https://baymard.com/blog/homepage-carousel),
[Mobbin — Uber Eats Android homepage](https://mobbin.com/explore/screens/254b23db-8d1b-4b0b-a8f5-b939953b20c9),
[Mobbin — Home screen design patterns](https://mobbin.com/explore/mobile/screens/home),
[DesignRush — eBay app design](https://www.designrush.com/best-designs/apps/ebay),
[DesignRush — Uber Eats app design](https://www.designrush.com/best-designs/apps/ubereats).

## Assumptions

- **Audience and surfaces**: "android and ios apps" means the **customer** mobile app, which is the only mobile
  app with a shopping Home. The shop mobile app and the driver mobile app are **out of scope**.
- **Web parity is deliberately deferred**: the platform keeps the customer web and customer mobile surfaces at
  parity, and the web storefront already has a merchandised, sectioned home. This feature brings mobile toward
  web, so it **closes** a parity gap rather than opening one; any residual difference is recorded in the
  customer parity register rather than fixed here.
- **Sections come from the store's existing merchandising groupings** — Featured, On sale, and the store's
  category groupings. No new grouping concept is invented in this spec, and no new ranking is computed.
- **This is a two-surface slice, not a mobile-only one.** The banner decision (US5) adds a small capability to
  the back-office promotions console — marking a promotion advertisable and giving it shopper-facing wording.
  That is the smallest addition that lets a banner be both changeable and true.
- **Category icons are platform-authored artwork**, mapped to categories by their stable key, with a neutral
  fallback glyph for any category that has no icon — so an operator creating a new category can never produce a
  blank tile.
- **"See all" leads to the existing search/results screen with the section's scope applied**, rather than to a
  new screen type.
- **Section membership is decided by the store, not by the app.** The app renders what it is given, in the
  order it is given, so merchandising can change without an app release.
- **Existing behaviour is preserved**, not re-specified: pull-to-refresh, loading placeholders, press feedback,
  the delivery-area prompt already on Home, and the header actions (saved items, cart, notifications) all
  remain.
- **No change to pricing, availability, cart or checkout rules.** This feature only changes what Home shows and
  how it is arranged.
- **A "product tile" is the existing shared component**; this feature does not redesign it.

## Dependencies

- The store's existing home read (merchandising groupings + promotional banner payload) and category list.
- The existing Search screen, which must accept focus on arrival and, for "see all" and category shortcuts, an
  incoming scope.
- The platform design system (monochrome palette, spacing scale, typography) and the shared mobile product tile.
- Category icon artwork, which must be produced as part of this feature (US3).
- **The back-office promotions capability**, which US5 extends with an advertisable flag and shopper-facing
  wording. Banners cannot ship without it, which is why US4 must be demonstrable against a placeholder
  promotion so the two stories can be built in either order.

## Out of Scope

- **A sales-ranked "best sellers" section.** Deferred deliberately: the store exposes no purchase-popularity
  ranking, and a section carrying that name without that data would be a claim the store cannot back
  (FR-038). FR-040 keeps the door open — adding it later is a new section, not a rebuild.
- The customer web storefront — **with one unavoidable exception**. Web reads the same banner payload, which
  today always carries a placeholder and will now be **empty whenever no promotion is advertised**. Web must
  handle the empty list; nothing else about web changes, and web does not adopt the new banner fields in this
  slice. Recorded in
  [contracts/storefront-home.contract.md](./contracts/storefront-home.contract.md) § Backward compatibility.
- The shop mobile app and the driver mobile app.
- Personalised or per-shopper recommendations ("for you", recently viewed, reorder prompts).
- A general content-management system for merchandising. Banners come from promotions that already exist
  (FR-037); nothing else on Home is separately authored.
- Search suggestions, autocomplete and recent-search history. The search entry hands off to the existing
  Search screen; making that screen smarter is its own slice.
- Redesigning the Search screen itself, the product page, cart or checkout.
- Changing which products are sellable, how they are priced, or how they are fulfilled.

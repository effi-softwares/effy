# Research: Customer Mobile Home — Sectioned Merchandising & Search Entry

**Feature**: 028-mobile-home-merchandising | **Phase**: 0 | **Date**: 2026-07-31

This file records the decisions taken before any code is written, with the alternatives that were
rejected and why. Every `NEEDS CLARIFICATION` in the plan's Technical Context is resolved here.

---

## R1 — How the Home search entry reaches Search with the keyboard already up

**Decision**: Add a **one-shot focus request** to `CustomerNavState` (`requestSearchFocus()` /
`consumeSearchFocus()`), set when Home's search entry is tapped and consumed by `SearchScreen` on
composition. Home's entry calls `selectTab(Search)` as it does today, and the flag rides alongside.

**Rationale**: `CustomerNavKey.Search` is a **tab root**, and tab roots are `data object`s used as
map keys in `CustomerNavState.stacks` (`stacks.getValue(activeTab)`, `require(tab in stacks)`). The
tab's identity IS the key. Anything carried inside the key changes that identity.

**Alternatives rejected**:

- **Make `Search` a `data class Search(val focus: Boolean = false)`.** This is the obvious move and
  it is a trap. `Search(focus = true) != Search(focus = false)`, so `stacks.getValue(activeTab)`
  throws `NoSuchElementException` the moment the flag is set, and `require(tab in stacks)` fails.
  Fixing it means re-keying the stack map on a separate tab identity — churn in the one file 026's
  own header documents as having already produced a permanent wrong-tab bug (`resetTo(Home)` inside
  the Account tab). Not worth it for a transient focus signal.
- **Push a `Results(autoFocus = true)` route onto the Home tab instead of switching tabs.** Search
  would then exist in two places in the back stack, and the Search tab would still be there,
  unfocused, one tap away — two entries to the same screen with different histories.
- **Have `SearchScreen` always autofocus.** Then switching to the Search tab from the bottom bar
  also throws the keyboard up over the results a shopper came back to read. Focus must be requested
  by the caller that meant it.

**Consequence**: the focus request is deliberately **transient** — it is not saved across process
death, because a restored app should show Search's results, not reopen the keyboard over them.

---

## R2 — How "see all" and a category shortcut carry scope into results

**Decision**: A new **pushed** nav key, `CustomerNavKey.Results(title, categoryKey, saleOnly)`,
rendering the existing `SearchScreen` with an entry refinement applied. It is pushed onto the
**current** tab, so Back returns to Home.

**Rationale**: `SearchViewModel` already supports exactly this — `applyCategory(key)` and
`applySaleOnly(saleOnly)` exist, and `applySaleOnly`'s own doc comment says it exists *because*
"the Home screen's 'See all' on the on-sale rail arrives already knowing what it wants". 025 built
this seam, 026 removed the only caller, and the spec's FR-018/FR-027 bring the caller back. The
backend honours `categoryKey` today. Nothing new is needed below the presentation layer.

Pushing rather than switching tabs is what makes Back mean "the shopper came from Home". Switching
to the Search tab would strand them: Back from a scoped result set would exit to the Search tab's
root, which is not where they were.

**Consequence**: `Results` must be registered in **three** places — the polymorphic
`customerNavSavedState` module, `ALL_CUSTOMER_ROUTES`, and the `entryProvider`. The file's header
warns that an unregistered route fails **on iOS only** and passes every Android test;
`CustomerNavKeySerializationTest` is the guard, and it must be extended in the same commit.

**Alternatives rejected**: reusing `Search` with a pre-seeded ViewModel (the tab's ViewModel is
shared, so a scoped entry would poison the shopper's own search state); a bespoke `CategoryResults`
screen (a second results implementation, which **FR-009** forbids — exactly one search field in the app).

---

## R3 — Section container and the nested-scroll problem

**Decision**: `LazyColumn` of section blocks; each product section is a `LazyRow`. Banners are a
`HorizontalPager` when more than one is live, a plain row when one is.

**Rationale**: This is the standard Compose composition for the pattern and it satisfies FR-016
without extra work — Compose's nested-scroll resolves an ambiguous drag to the axis the inner
scrollable owns, so a horizontal drag inside a `LazyRow` does not move the `LazyColumn`.

**⚠ The trap this avoids**: the current screen is a `LazyVerticalGrid` with a full-span chip row.
Extending that — a grid whose spans emulate sections — would put a `LazyRow` inside a `LazyVerticalGrid`
item, which Compose permits but which measures the row against an infinite-width constraint and
throws at runtime on some paths. A `LazyColumn` has no such interaction.

**Consequence**: `DiscoverGrid` and its client-side chip filtering are **deleted**, not adapted. The
chips exist only because 026 had no rails to name; sections restore what they substituted for.

---

## R4 — Rail tile width, the peek affordance, and the ≤50%-viewport rule

**Decision**: Rail tiles get a width derived from the window width — roughly **42% on compact**, so
two tiles plus a visible sliver of the third sit in view. Tile height is capped so a section
(header + row) stays under half the viewport (FR-017/SC-005). On expanded windows the fraction drops
so more tiles fit rather than each tile growing.

**Rationale**: The peek (FR-015) is the affordance that tells a shopper the row scrolls; a row whose
last visible tile ends flush at the screen edge reads as a complete set. Deriving the width from the
window rather than pinning a dp value is what makes the same code correct on a phone and a tablet —
`mobile-kit`'s `WindowSize` already provides the class.

**The ≤50% rule is load-bearing, not decorative.** Baymard's finding is that horizontally scrollable
content taller than about half the viewport hijacks the page scroll: almost every shopper who wants
to scroll *down* must put a finger on it, and some fraction of those drags register sideways. The
existing `EffyProductCard` is designed for a 2-column grid; at rail width it must be measured against
this ceiling rather than assumed to fit.

**Alternatives rejected**: fixed dp tile width (breaks across densities and on tablets); reusing the
grid tile unchanged (its aspect ratio is set by a 2-column grid, not by a rail).

---

## R5 — Where category icons come from

**Decision**: A **platform-authored icon set** in the existing mobile-assets SSOT
(`packages/design-system/mobile-assets/drawable/`), mapped to categories **in the app** by category
key, with a **neutral fallback glyph** for any key with no icon.

**Rationale**: This reuses a mechanism that already exists and is already drift-guarded three ways
(`check-mobile-assets.mjs` reports STALE / MISSING / ORPHANED and names the surface). Adding icons
is authoring files in one place and running `mobile-assets:sync`.

**The honest cost, recorded rather than discovered later**: an operator who creates a new category
gets the **fallback glyph** until an app release ships an icon for it. That is acceptable because the
fallback is a designed state, not a broken one (FR-026), and because categories are created rarely.

**Alternatives rejected**:

- **An `icon_key` column on `public.category`, chosen by the operator from a fixed vocabulary.**
  Strictly better for operators, and it is the right answer eventually — but it needs a migration, an
  admin route, a back-office control, and a hot-path read change, all to solve a problem that does not
  exist yet at Effy's category count. Recorded as the natural follow-up.
- **The derived category photo the store already returns** (`StorefrontCategoryDTO.imageUrl`, a
  representative product image). Rejected on the request: the ask was explicitly for icons/SVGs, and a
  photograph of one product misrepresents a category the way an icon does not.

---

## R6 — Where promotional banners come from

**Decision**: Extend `public.promo_code` with an **advertising facet** — `is_advertised`,
`banner_title`, `banner_subtitle`, `banner_image_key`, `banner_position`. The **cold path**
(`edge-api/admin`) writes it; the **hot path** (`core-api/storefront`) reads it when composing Home.
Advertised promotions replace the current hard-coded "welcome" banner.

**Rationale**: This is the operator's chosen option, and it lands on the split the platform already
uses for `promo_code`: written by the back-office, read by the hot path. No new table, no new
service, no second content store.

**Three rules are made structural rather than left to service code**, following the idiom the 027
migration already established with `promo_code_kind_value_chk`:

1. **A CHECK constraint makes an advertised promotion without banner copy unrepresentable** —
   `is_advertised = false OR banner_title IS NOT NULL`. FR-037b says the internal code must not be the
   headline; a constraint enforces that better than a code review does.
2. **Advertising is opt-in and defaults to false** (FR-037a). A promotion that becomes public by
   default hands every shopper a discount that was issued to one — the private-goodwill-credit case is
   real and the default is the only thing standing between it and the storefront.
3. **Exhaustion is COUNTED from `promo_redemption`, never stored** — the same rule 027 set for
   `redemptionCount`, for the same reason: a counter and the rows can disagree and then nobody knows
   which is true. An exhausted promotion must stop being advertised (FR-037c), so the count is part of
   the visibility predicate.

**Latency**: this adds **one query** to the Home read, which currently issues up to seven (newest,
on-sale, rail candidates, plus up to four category reads). The exhaustion check is a correlated
subquery over `promo_redemption`, which is indexed by `promo_code_id`, and the outer set is bounded by
the number of *advertised* promotions — realistically single digits. ⚠ 027's hard-won lesson applies:
the first working cart write timed out at ~14 round trips to Sydney RDS inside a 4-second budget. The
Home read's budget is **3 seconds** (`readTimeout` in `storefront/service.go`). One extra query is
within it; this is recorded so a later slice does not add a second, and a third, without measuring.

**Alternatives rejected**: a separate `promo_banner` table (a second lifecycle to keep in step with
the promotion's own — the thing that makes banners go stale); app-fixed banners (needs an app release
per change, across two stores).

---

## R7 — What a banner says, and what it links to

**Decision**: The server composes the banner's **terms sentence** (e.g. "On orders over $30") from
`minimum_subtotal_amount` and ships it as a field. The banner's destination is drawn from a **closed
vocabulary** of targets that both clients map; an unrecognised target renders the banner
**non-tappable** rather than dead-tapping.

**Rationale (terms)**: FR-037d requires the shopper to learn of a condition before payment. Composing
the sentence server-side means the web and mobile surfaces cannot phrase the same promotion two ways,
and the phrasing lives beside the number it describes. The existing `banners()` function already
composes copy server-side, so this is the established pattern rather than a new one.

**Rationale (closed target vocabulary)**: `BannerDTO.href` is a **web path** (`/search` today). Mobile
cannot route on arbitrary web paths — there is no URL router in the app, and inventing one to serve a
banner would be the tail wagging the dog. A closed set the server promises and the client exhaustively
maps means an unknown value is a **compile-time-visible** gap in a `when`, and at runtime the banner
degrades to non-tappable copy. A dead tap is worse than no tap.

**Consequence**: `BannerDTO` gains **optional** fields only, so `customer-web`'s existing consumer
keeps typechecking untouched. Web adopting the new fields is its own slice (Out of Scope).

---

## R8 — Sections are server-ordered; the app renders what it is given

**Decision**: Home renders `home.rails` in the order the server returns them, interleaving banners at
**server-declared positions**. The app contains no list of section names.

**Rationale**: FR-040 requires that adding a grouping later — including the deferred sales-ranked best
sellers — not be an app rebuild. The composition already lives in `storefront.Service.Home`, which
appends Featured, then On sale, then up to four category rails. Merchandising decisions belong there.

**Consequence**: `banner_position` is what lets an operator put a banner *between* sections (FR-030)
rather than only at the top. The client clamps an out-of-range position to the end rather than
dropping the banner — a mis-typed position must not make a live promotion invisible.

---

## R9 — Designing a promotional banner with no colour

**Decision**: The banner is a full-bleed-width panel on the design system's `EffySurface.tint`, with
the promotion's headline at display scale, the terms sentence beneath at body scale, and the code set
in a bordered inline chip. Optional artwork sits behind a scrim that guarantees text contrast.

**Rationale, stated plainly because it is the hardest constraint in this feature**: constitution
v1.11.0 leaves a banner **no colour to shout with**. The palette is a ten-step neutral ramp; the only
two hues are error `#e01010` and success `#0C9409`, and both are forbidden as accents. A promotional
banner conventionally works by being the loudest thing on the page, and that instrument is gone.

What remains is **scale, weight, and negative space** — which is why the banner is wide and short with
generous internal padding rather than tall and busy. The risk is real and it is a *design* risk, not a
technical one: a monochrome banner that fails to draw the eye is a banner nobody taps. It is called out
here, and SC-009's tester walk is where it gets checked.

**⚠ Not negotiable**: no brand hue may be introduced for banners. `scripts/check-no-emerald.sh` and
`check-no-jade.sh` sweep retired values, and `tokens:check` fails on a drifted Compose theme. The
correct move if the banner reads too quietly is more contrast **within the ramp** (the accent inverts
between appearances), not a new colour.

---

## R10 — The "no card layouts" doctrine (Principle V) for this screen

**Decision**: Three elements are card-shaped, and each is justified individually below. The section
structure itself is **not** a card — sections are headed lists separated by whitespace, with no
container, border or elevation.

| Element | Card-like? | Justification |
|---|---|---|
| **Product tile** (`EffyProductCard`) | Yes, pre-existing | Not introduced here. It is the platform's product presentation everywhere (grid, search, related). Re-litigating it in this slice would fork the product tile — the outcome the doctrine exists to prevent. |
| **Promotional banner** | Yes | A promotion is a **discrete, tappable, self-contained offer with its own boundary**. It is not content being tiled into a layout; it is one object that must be distinguishable from the merchandising around it, and with no colour available (R9) a bounded panel is the only remaining separator. The doctrine's own escape clause — "unless a card is demonstrably the right pattern and no better layout exists" — is met. |
| **Category shortcut** | Borderline | Rendered as an **icon above a label**, with **no container, border or fill** — the Uber Eats form. It is a labelled glyph in a row, not a tile. This is the doctrine being followed, not excepted. |

**Explicitly rejected**: bordered or elevated section containers; a "featured product" hero card; any
metric or summary card at the top of Home (the doctrine forbids this outright and nothing here needs
one).

---

## R11 — Reading SC-004's "30–40% of top-level categories"

**Decision**: The category row carries **every top-level category that has products**, in the store's
own order, and scrolls. SC-004's 30–40% is enforced as a **floor**, not a window.

**Rationale**: Baymard's figure is a minimum for setting correct expectations, derived from sites that
must choose because their homepage has finite space. A horizontally scrolling row does not have to
choose. What the research actually warns against is representing too *narrow* a slice of the
catalogue — so the number that matters is the floor, and a row showing all of them clears it.

**The part that still needs care**: the categories visible **before any scroll** must span genuinely
different kinds of product, because that is the impression a shopper forms. Server order governs, and
if the store's own order groups similar categories first, that is a merchandising fix in the store,
not a client workaround.

### ⚠ AMENDED 2026-07-31, after the first live run — "top-level" was wrong

R11 assumed the row would carry *top-level* categories. Against the real catalogue it carried **none**:

- Every product's `primary_category_id` is a **leaf** (pantry, cleaning, meals…).
- `productCount` counts exact primary-category membership and **does not roll up**, so `food`,
  `grocery` and `household` all report `0` and were filtered out.
- And it is not merely a display problem: `CategoryCards`, `SearchCards` and the category rails all
  filter on `p.primary_category_id = (SELECT id FROM category WHERE key = $1)` — exact match, no
  descendants. A top-level shortcut would open a results screen with **zero products** in it.

The row now carries **categories that hold products**. Live, that is nine — Pantry · Chilled · Frozen ·
Beverages · Bakery · Snacks · Meals · Cleaning · Paper Goods — every one tappable and every one with
real artwork rather than the fallback. FR-024 and SC-004 were amended to match (Principle I: fix the
earliest affected artifact, not the code alone).

**⚠ The lesson, and it is 027's lesson again.** Every unit test passed, because the fixtures gave
top-level categories a product count the real ones do not have — the fake agreed with the code instead
of with the world. `composeHomeWithRealisticTaxonomy` now pins the actual taxonomy shape and fails
against the old filter.

**The follow-up**: a recursive-CTE rollup so a category's count and filter include its descendants.
That is what would make top-level shortcuts work, and it is a server capability, not a client fix.

---

## R12 — Contract and codegen path

**Decision**: `packages/shared-types/src/storefront.ts` is edited first (`BannerDTO` gains optional
fields; a `HomeSection`-ordering field is added if needed), then `make cm-contract-gen` regenerates
the committed Kotlin, and `make cm-contract-check` proves no drift.

**⚠ The strongest carry-forward from 027 applies directly here.** That slice lost days to a defect
where Kotlin serialised a quantity as `Double`, the wire carried `1.0`, and Go's `encoding/json`
refused `1.0` into an `int` — while **every unit test passed**, because the fakes spoke Kotlin at both
ends and never crossed the wire. The fix was made **at the contract** (a `WireInt` alias carrying
`@asType integer`) so the generated Kotlin could not regress.

This feature adds new wire fields in the same shape: an `int` (`banner_position`) and nullable strings.
The integer goes through the same `WireInt` treatment, and the quickstart's live walk is what actually
proves the Go handler accepts what Kotlin sends. **No unit test in either language can prove this**;
only a real request can.

---

## R13 — Telemetry (Principle VII)

**Decision**: The product events this feature would emit are **named and specified** here, and their
**emission is deferred** to the platform's mobile-telemetry slice, consistent with 013/014/015.

Events (taxonomy, for when the mobile PostHog path lands):

| Event | Properties | Why it matters |
|---|---|---|
| `home_viewed` | `sectionCount`, `bannerCount`, `categoryCount` | Whether the sectioned home actually renders with content in the field. |
| `home_search_opened` | — | SC-001's funnel entry. |
| `home_section_seen` | `sectionKey`, `position` | Which sections are ever reached — the direct measure of whether SC-006's four-swipe budget holds in reality. |
| `home_section_see_all` | `sectionKey` | Whether "see all" earns its place. |
| `home_rail_scrolled` | `sectionKey`, `maxIndex` | Whether the peek affordance (FR-015) works. |
| `home_category_tapped` | `categoryKey`, `position`, `hadIcon` | Both category-row value and how often the fallback glyph is being seen. |
| `home_banner_tapped` | `promoKey`, `position` | The only honest measure of whether a monochrome banner draws the eye (R9's open risk). |

**Backend**: the Home read is an existing instrumented hot-path endpoint; this feature adds no new
route, so it introduces **no new metric or alert**. The one thing worth watching is Home read latency
against the 3-second timeout after the banner query lands (R6) — an existing dashboard concern, not a
new one.

**This is a recorded deviation from Principle VII**, carried in the plan's Complexity Tracking rather
than quietly omitted: the principle requires a plan that adds a user-facing flow to *state* its
telemetry, which this does; it cannot be *emitted* until the mobile telemetry path exists.

---

## R14 — Scope shape, stated up front

**Decision**: This is **not a mobile-only slice**, and the plan says so before tasks are generated.

| Story | Surfaces touched |
|---|---|
| US1 — search entry | customer-mobile only |
| US2 — sections | customer-mobile only |
| US3 — category icons | customer-mobile + `packages/design-system/mobile-assets` |
| US4 — banners (shopper side) | customer-mobile + `packages/shared-types` + `core-api/storefront` |
| US5 — banners (operator side) | migration + `edge-api/admin` + `apps/back-office` |

US1–US3 are genuinely independent and could ship alone. **US4 cannot be demonstrated without US5's
migration**, because there is nothing to advertise until a promotion can be marked advertisable —
though US4's rendering can be built and tested against a fixture. If the slice needs to be cut, the
clean line is **after US3**.

---

## Resolved unknowns

| Unknown | Resolution |
|---|---|
| How Home hands off to Search with focus | R1 — one-shot focus request on `CustomerNavState` |
| How scope reaches results | R2 — new pushed `Results` nav key over the existing `SearchScreen` |
| Section container mechanics | R3 — `LazyColumn` of `LazyRow`s; the grid is deleted |
| Rail tile sizing / peek / viewport ceiling | R4 — window-derived width, height capped at 50% viewport |
| Category icon source | R5 — mobile-assets SSOT, app-side key map, fallback glyph |
| Banner content source | R6 — advertising facet on `promo_code`; cold path writes, hot path reads |
| Banner copy and destination | R7 — server-composed terms; closed target vocabulary |
| Section ordering / extensibility | R8 — server-ordered; client renders what it is given |
| Monochrome banner design | R9 — scale/weight/space; no new colour, ever |
| No-card doctrine | R10 — three elements assessed; banner justified, shortcut conforms |
| SC-004 interpretation | R11 — 30–40% enforced as a floor; the row scrolls and carries all |
| Contract/codegen | R12 — shared-types first, regen, drift-check; `WireInt` for the integer |
| Telemetry | R13 — taxonomy specified, emission deferred (recorded deviation) |
| Slice size | R14 — five stories across five surfaces; clean cut line after US3 |

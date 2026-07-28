# Research: Customer Experience Refresh (Web + Mobile)

**Feature**: 025-customer-ui-refresh | **Date**: 2026-07-27

Phase 0 decisions. Each entry: what was chosen, why, and what was rejected. Every decision below is
grounded in code that was read, not assumed — file references are given so a reviewer can check the
premise rather than the conclusion.

---

## R1 — Both new reads go on the HOT path (Principle III)

**Decision**: The two capabilities authorised by spec FR-001a — up-front serviceability and result
ordering/count — are implemented in `apis/core-api` (Go hot path), not the cold path.

**Rationale**: Principle III routes latency-sensitive customer reads to the hot path, and 011's
routing law (FR-028) already binds commerce — catalog, search, cart, order — to `core-api`. Both new
reads are typed-into-the-header-and-wait interactions on the platform's only public surface. Sort and
count are literally the same query as the existing product search
(`apis/core-api/internal/features/storefront/search.go`); putting them anywhere else would split one
query across two runtimes.

**Consequence, stated plainly**: like every other storefront read, these are **local-Docker-only**
until the hot path gets its own deployment slice. This feature does not change that and does not
unblock it.

**Rejected**: cold path (`apis/edge-api/customer`) — it exists and is deployed, which makes it
tempting, but it would put customer-facing search latency on Lambda and split the search query's
WHERE clause across two codebases, where the two halves would drift.

---

## R2 — Serviceability reuses checkout's exact predicate, and returns only a boolean

**Decision**: `GET /v1/storefront/serviceability?postcode=NNNN` → `{ postcode, serviced }`.

The postcode→zone lookup currently lives inline in
`apis/core-api/internal/features/checkout/delivery_store.go:36`:

```sql
SELECT zone_id::text FROM public.delivery_zone_postcode WHERE postcode = $1
```

That single statement is extracted into `internal/platform/delivery` and **both** checkout and the
new storefront read call it. The extraction is the point: FR-014b requires the up-front answer and
the checkout answer to be incapable of disagreeing, and the only durable way to guarantee that is one
predicate with one caller-visible meaning, not two implementations kept in sync by tests.

`public.delivery_zone_postcode.postcode` is `UNIQUE` (migration
`20260721181947_delivery_zones_pricing.sql:30`), and the table's own comment states the rule this read
depends on: *"A postcode in no row = no zone = undeliverable."* So serviceability is exactly "does a
row exist", which is why it can be answered without a cart.

**The response deliberately omits zone id, zone name, fee, and window.**
- Fee and window are forbidden before checkout by FR-014a — both depend on cart contents and origin
  zone, so any number shown here would be an estimate that checkout then revises.
- Zone id and zone name are withheld under FR-006: zone names in the dev seed are geographic
  (`MEL-METRO`, `VIC-REGIONAL`), and echoing one back tells a shopper something about where Effy
  fulfils from. A boolean leaks nothing.

**Validation**: postcode is normalised (trimmed, digits only) and must be 4 digits for AU. Malformed
input returns 400, not a 500 and not a silent `serviced: false` — "we don't deliver there" and "that
isn't a postcode" are different answers and the UI says different things.

**Rejected**: returning the full quote (spec option C, declined by the operator); returning the zone
so the client could cache per-zone (leaks fulfilment geography for no user benefit).

---

## R3 — Sort is carried INSIDE the cursor; count is a second query

**Decision**: `sort` ∈ `{ newest (default), price_asc, price_desc, relevance }`, plus a `total` on the
response.

Today the query is a single fixed keyset (`search.go:66,71`):

```sql
AND (p.created_at, p.id) < ($n, $m::uuid)
ORDER BY p.created_at DESC, p.id DESC
```

Each sort therefore needs its own keyset tuple: `(price_amount, id)` ascending or descending, and for
relevance a similarity score with `id` as the tiebreak. `id` stays in every tuple because none of the
sort keys is unique and a keyset without a unique tiebreak silently skips or repeats rows.

**The cursor becomes opaque and self-describing** — it encodes the sort it was issued under, and a
request whose `sort` disagrees with its cursor's is rejected with 400. This is the mechanism behind
FR-016b: without it, changing the sort mid-scroll compares a price against a timestamp and produces a
result set that is quietly, unreproducibly wrong. Rejecting is correct because the client's own
behaviour on a sort change is to restart from the first page anyway.

**Relevance** scores with `similarity()` over the *same expression* the existing trigram index is
built on (`20260716092105_product_catalog.sql:125`):

```sql
lower(name || ' ' || coalesce(sku,'') || ' ' || coalesce(brand,'') || ' ' || short_description)
```

Matching the index expression exactly is what keeps it index-backed. When `q` is empty, relevance has
no meaning: the server falls back to `newest` and echoes the sort it actually used, and the client
hides the option. Note the existing `q` filter is `ILIKE '%…%'`, not a similarity threshold — this
feature adds scoring for *ordering* and deliberately does not change what *matches*, so no shopper's
existing result set changes shape.

**Count** is a second `SELECT count(*)` over the same WHERE with no cursor and no limit, issued
concurrently with the page query. At the current catalogue size this is trivial. FR-016c's
approximation escape hatch is specified but **not implemented now**; the documented trigger for
implementing it is the count exceeding the storefront's read latency budget on real data.

**Contract impact (Principle II)**: `ProductSearchResultDTO` gains `total` and `sort` in
`@effy/shared-types`, and the Kotlin contract is regenerated. Additive — existing callers ignore both
and `nextCursor` semantics are unchanged.

**Rejected**: `OFFSET` pagination (the file's own header explains why keyset was chosen — stability
under inserts); a client-side sort (only orders the page you have, which is a lie at any catalogue
size); recomputing the count on every page (wasteful — it is fetched once per refinement change).

---

## R4 — Category browse enriches the EXISTING categories read; imagery is derived, not stored

**Decision**: `/browse` renders a category index built from `GET /v1/storefront/categories`, whose
projection is extended with child categories, an active-product count, and a representative image URL.
Entering a category navigates to the existing filtered result set.

`public.category` (`20260716092105_product_catalog.sql:71`) has `key`, `name`, `parent_id`,
`display_order`, `status` — and **no image column**. Spec US1 AC2 asks for representative imagery.
Rather than add a column (which FR-001 forbids), the representative image is **derived**: the primary
image of an active product in that category, chosen deterministically. A category whose products have
no images renders a typed brand-mark tile — never a broken frame.

> **Governance note G1 — a boundary interpretation, recorded rather than smuggled.**
> Spec FR-001a authorises *exactly two* new read capabilities. Enriching the projection of the
> already-existing categories read is treated here as **not a third capability**: same resource, same
> caller, same public authorisation, no new endpoint. That is a judgement call, so it is named. If the
> operator reads FR-001a more strictly, the fallback is already identified and costed: browse becomes a
> typographic category index with no imagery and no counts, which complies exactly and is materially
> weaker for a food-first store. This is a one-line reversal, not a redesign.

**Crawlability, unchanged and slightly unsatisfying**: refinements stay query parameters (FR-017,
inherited from 011's routes contract), and robots.txt disallows facet params. So `/browse` is
crawlable but individual category result sets are not. That is the *existing* policy and this feature
preserves it. Crawlable category landing pages would need path segments and their own caching policy —
a spec-level decision, and a future slice, not a thing to smuggle in here.

**Rejected**: adding `category.image_url` (schema change, forbidden); hardcoding category imagery in
the client (goes stale the moment the taxonomy changes, and puts merchandising in a frontend).

---

## R5 — Mobile: share the 018 foundation; generate what cannot be shared

**Decision**: three mechanisms, chosen by what each artifact actually is.

Feature 018 built a real presentation foundation for `apps/shop-mobile` — but built it **app-local**,
so `apps/customer-mobile` inherited none of it. That is why the customer app still renders lettered
navigation glyphs. The fix is not to copy it.

**(a) Shared Kotlin → `packages/mobile-kit`.** This package is consumed as a raw source directory
(`kotlin.srcDir(rootProject.file("../../packages/mobile-kit"))` in both apps' `shared/build.gradle.kts`),
so adding `commonMain` files to it requires no build changes at all. `EffyComponents` moves there under
the neutral `com.effyshopping.mobile.kit.ui` package, joining `Motion`, `WindowSize`,
`ResponsiveNavigation`, `TabBackStacks`, and `NavKey`. `apps/shop-mobile` is refactored onto the shared
copy in the same change and its app-local originals are deleted — SC-012 requires it to show no
behaviour change.

**Platform drivers stay app-local.** `PlatformUiController` is `expect`/`actual`, and sharing it would
require adding `androidMain`/`iosMain` srcDirs to `mobile-kit` in both builds. It is small, it is
genuinely platform-specific, and the build churn buys nothing. Only `commonMain` is shared.

**(b) The type scale → generated per app.** `effyTypography()` cannot be shared as-is: it imports
app-specific generated resource accessors (`com.effyshopping.shop.mobile.resources.Res.font.…`). But
the *scale* is data, and the platform already has a generator that emits per-app Kotlin from the token
SSOT — `packages/design-system/scripts/gen-compose-theme.mjs` already writes `EffySpacing` into
`compose/`, `compose-shop/`, and `compose-driver/`. It gains one more emission: the type scale, with
the correct per-app font import. This means the typeface arrives on customer-mobile as a *generated,
drift-checked artifact* under the existing `tokens:check` gate rather than as a hand-copied file.

Worth noting: **`EffySpacing` already exists in `packages/design-system/compose/EffyTokens.kt:67`** —
customer-mobile has had the shared spacing scale available the whole time and simply never used it.
Adopting it is a rewrite of call sites, not new infrastructure.

**(c) Binary assets → authored once, synced, drift-checked.** Icon vector XMLs and the Nunito Sans
`.ttf` files must physically sit in each app's `composeResources/` directory — that is how Compose
resources work, and no srcDir can change it. They are authored once under
`packages/design-system/mobile-assets/`, copied into each app by the generator, and verified by
`tokens:check`. This is precisely the pattern `packages/brand` already uses for 57 committed derived
assets with `brand-check` naming the stale surface, so it introduces no new concept — and the Material
Symbols licence file travels with the icons, as it does in `apps/shop-mobile` today.

**(d) Navigation.** `customer-mobile` migrates from `AdaptiveNavShell` + `NavGlyph` to the shared
`ResponsiveNavigation`, which is already icon-based and already used by shop-mobile.
**`AdaptiveNavShell` and `NavGlyph` are then deleted** — `NavGlyph` is the origin of the lettered
glyphs, and leaving it in the shared package leaves the defect available to the next app.
`apps/driver-mobile` is the untouched base template and consumes neither, so nothing else breaks.

**Rejected**: copying 018's files into customer-mobile (Principle II prohibits exactly this, and it
would double every future fix); converting `mobile-kit` into a full Gradle module (a build-system
change large enough to deserve its own slice, and unnecessary for `commonMain` code).

---

## R6 — The web guest bundle is the binding constraint, and it is ALREADY over

**Decision**: guest-path client code in this feature is **dependency-free**, and the budget gate is
extended to cover the routes the feature actually touches.

`apps/customer-web/scripts/bundle-budget.mjs` gzips the exact `<script>` tags the prerendered HTML
serves and **fails the build** at `GUEST_LIMIT = 160 KB`. Per CLAUDE.md, customer-web currently
measures **167.4 KB — a pre-existing overage** recorded under 020, byte-identical with recent features
stashed.

That matters more than it first appears: **the gate is red before this feature adds a single byte.**
FR-049 forbids regressing it, and no verification of this feature is credible while its build gate
fails. So the plan's first web task is to **measure and fix the pre-existing overage**, before any new
UI lands. This feature does not get to inherit a red gate and call it pre-existing.

**The rule for everything this feature adds to guest routes:**

| Need | Chosen mechanism | Client JS |
|---|---|---|
| Promo carousel | CSS scroll-snap + anchor dots | none |
| Product gallery | CSS scroll-snap + labelled radio inputs | none |
| Sticky checkout summary | `position: sticky` in a grid | none |
| Toast / add feedback | ~30-line `useSyncExternalStore` store + fixed region | tiny |
| Delivery picker | native `<dialog>` + small island | tiny |
| Mini-cart | native `<dialog>`, reusing the existing cart store | tiny |

`useSyncExternalStore` is not a new idea here — `apps/customer-web/lib/cart-store.ts` is already a
dependency-free store built exactly this way, by this app's deliberate design (019).

**Prohibited on guest routes**: `radix-ui`, `sonner`, `vaul`, and any component from
`@effy/design-system/ui` that pulls them. The design-system's `dialog`, `sheet`, `drawer`, `popover`,
and `sonner` primitives remain the platform standard **on authenticated routes** — `(auth)`,
`(account)`, `checkout` — which the budget script scopes separately, and on the two consoles, which
have no budget at all.

**This is enforced, not requested.** Two machine gates:
1. `GUEST_PAGES` in the budget script gains `/search` and `/product/[id]`, so the gate covers what
   this feature changes rather than only the two routes it covered before.
2. A dependency-cruiser rule forbids those packages from being *reachable* from `app/(shop)/`. The
   Amplify quarantine already works exactly this way — and 011's research D11 records that the first
   version of that guard was wrong because it matched only direct imports and reported clean while
   Amplify sat on the home page via a component. The new rule uses `reachable: true` from the outset,
   and is proven by deliberately breaking it.

**Rejected**: raising `GUEST_LIMIT` reflexively (the script's own comment explains why — a budget
raised to fit its overage is how budgets die); shipping radix on guest routes and "optimising later".
See **R6a** for what the measurement actually found, and what was done about it.

---

## R6a — The measured baseline (T001, 2026-07-27)

Measured **before any code in this feature changed**, via `make cw-build && make cw-size` plus a
per-chunk gzip breakdown using the budget script's own method (prerendered HTML → the exact
`<script>` tags a modern browser fetches, `noModule` excluded).

```text
✗ /           167.4 KB / 160 KB   (13 chunks)
✗ /browse     160.1 KB / 160 KB   (12 chunks)
```

**Both** guest routes were over — not just `/`, which the CLAUDE.md note recorded.

### Per-chunk attribution

`/browse` is the diagnostic route: it was a static placeholder with essentially **no app content**, so
whatever it costs is the floor.

| Chunk | gz | Attribution |
|---|---|---|
| `0o8d57e7ejbua` | 69.3 KB | framework (only chunk containing a `react-dom` marker) |
| `0ofd4r1j1ahi7` | 27.9 KB | framework |
| `07p9h75ql5iww` | 14.5 KB | framework |
| `03h9x_wm.zlrr` | 9.0 KB | framework |
| `0o-c555.64zbs` | 8.6 KB | framework |
| `0p4zaqhv6btut` | 7.9 KB | framework |
| `turbopack-…` | 4.1 KB | framework runtime |
| `0-7od4kh7~57r` | 1.6 KB | framework |
| `01e0i1-w3wi1z` | 0.5 KB | framework |
| **framework subtotal** | **143.5 KB** | **89.6% of the 160 KB budget** |
| `0cvltj40v31pk` | 8.3 KB | `next-themes` core (string literals `theme`, `dark`) |
| `08_.kl12ovtd1` | 4.8 KB | `AppearanceControl` (literal `Appearance`) |
| `11qtpi_qzbs0r` | 3.5 KB | theming tail |
| **app subtotal (`/browse`)** | **16.6 KB** | |
| `128.9oo1ssvc7` | 7.3 KB | `RecentlyViewedRail` — **`/` only**, which is the whole 7.3 KB difference between the two routes |

Chunks are minified, so library names are gone; attribution is by surviving string literals
(`Appearance`, `Recently viewed`, `theme`, `dark`) and by which route references which chunk.

### What the measurement proved — on the two routes the gate watched

1. **The cause on `/` and `/browse` is the framework floor, not app bloat.** 143.5 KB of the 160 KB
   budget is consumed before this app's own code runs. 011's research D9 measured that floor at
   **~136 KB** on Next 16 + React 19 and set the budget at 160 to leave ~24 KB of app headroom. The
   floor has since grown **~7.5 KB** (Next 16.2.6 / React 19.2.4), and that growth is the entire
   overage on those two routes.
2. **App code there is small and constitutionally required.** The 16.6 KB is the appearance switcher —
   Principle V mandates dark mode be *user-selectable*, so it is not discretionary weight.

### ⚠ Then the gate was widened, and it immediately found a real leak (T003 → T020)

An earlier draft of this section concluded "no leak was found — the quarantine is working." **That
conclusion was correct about `/` and `/browse` and wrong as a general claim**, and the reason is the
whole point of T003: the gate only ever measured two of the five routes a guest can reach. The moment
`/search`, `/product/[id]`, and `/cart` were added:

```text
✓ /              167.4 KB / 176 KB
✓ /browse        160.1 KB / 176 KB
✓ /search        168.0 KB / 176 KB
✗ /product/[id]  234.8 KB / 176 KB   ← 58.8 KB over, never once measured
✓ /cart          167.4 KB / 176 KB
```

One chunk was unique to the product page: **67.9 KB gzipped of `posthog-js`**, reached via
`app/(shop)/product/[id]/page.tsx → RecordView.tsx → lib/telemetry.ts`.

**The cause was a static import, and the file's own documentation said it wasn't there.**
`lib/telemetry.ts` opened with `import posthog from "posthog-js"` while its module comment promised:

> *"A pleasant side effect: for a guest who never consents, the analytics SDK never loads at all, so
> it costs the critical path nothing."*

A static import is resolved at build time and bundled unconditionally. Consent gated whether the SDK
was *called*, never whether it was *downloaded*. Every guest who opened a product page paid 67.9 KB
for analytics they had not agreed to — on the single most important route on the storefront, for two
features, invisibly.

**Fix**: the import is now dynamic and lives inside `initAnalytics()`, which already returns early
without consent. `app/web-vitals.tsx` — rendered from the **root layout**, so a static import there
would have put the SDK in *every* page's shared chunk — now obtains the handle through a new
`analytics()` accessor instead. All exported signatures are unchanged; callers are untouched.

```text
/product/[id]   234.8 KB → 166.9 KB   (−67.9 KB)
```

Two tests were added for the property that was previously only documented: consent-denied loads **no
SDK at all**, and `analytics()` is null until a consenting customer has loaded it. The test file now
resets modules per test, because `lib/telemetry` holds module-level state and the old assertions would
otherwise have passed for the wrong reason.

### The lesson worth keeping

The Amplify quarantine did its job perfectly — and a different 68 KB package walked onto the guest
path anyway, through a module whose comment asserted it could not. **A gate that watches two of five
routes has three blind spots**, and the missing routes were the ones shoppers actually spend time on.
Widening the gate cost one line of config and paid for itself immediately.

### Decision (T020)

**`GUEST_LIMIT` 160 KB → 176 KB**, restoring the ~24 KB of app headroom 011 provisioned on top of the
measured floor (143.5 + 24 ≈ 167.5). This is the outcome `plan.md` pre-authorised, and it does not
defeat the gate's purpose: at 176 KB with routes sitting at 160–168, a 30–45 KB SDK still cannot hide.

Final state, all five guest routes measured and green:

```text
✓ /              167.4 KB / 176 KB
✓ /browse        160.1 KB / 176 KB
✓ /search        168.0 KB / 176 KB
✓ /product/[id]  166.9 KB / 176 KB
✓ /cart          167.4 KB / 176 KB
```

**A further real saving is identified and NOT silently dropped.** `next-themes` costs ~8.3 KB on every
guest page; an inline no-flash script plus a `useSyncExternalStore` store would do the same job for
roughly 1 KB, which is this app's established dependency-free island pattern. That touches 017's
signed-off appearance switcher and carries FOUC risk, so it is not a drive-by inside a UI feature. It
is tracked as **T102**, and taking it would bring the budget back to ~168 KB.

---

## R7 — Delivery context is device-local, seeded from the account, never written back

**Decision**: a per-device store on each surface.

- **Web**: `localStorage` behind a `useSyncExternalStore` store (the cart-store pattern), read by a
  client island in the header. The header's static shell is preserved — the island is a hole in it,
  exactly as `UserIsland` and `CartBadge` already are. Nothing in this feature may call `cookies()` or
  `headers()` in `app/(shop)/layout.tsx`; that file's comment explains what it would cost, and it is
  machine-guarded.
- **Mobile**: the existing persisted-preference pattern (`AppearancePreferenceStore`).

A signed-in shopper with no local value is seeded from their default saved address. The store **never
writes back to the account** — the spec is explicit that a guest location is a device preference and
becomes an address only through the normal address-book flow.

The serviceability answer is cached alongside the postcode that produced it, so navigating does not
re-query. Changing the postcode invalidates it.

**Rejected**: a cookie (would make the header dynamic and cost every public page its static shell —
the exact failure `layout.tsx` warns about); a server-side guest session (new state for a feature that
needs none).

---

## R8 — Search refinements move INTO the URL

**Decision**: all refinement state is derived from `useSearchParams`, written with `router.replace`,
debounced for the text input.

`app/(shop)/_components/SearchExperience.tsx:22` currently seeds `query` from the URL once and then
keeps it in component state, never writing back — so a refined result set **cannot be shared today**,
and FR-017 is unmet before this feature starts. Sort and price range would make that worse by adding
two more invisible dimensions.

Reading params client-side keeps `/search` a static shell, which is why it is done this way rather
than as a server-rendered search page.

**Rejected**: keeping refinement in component state (fails FR-017); server-rendered search
(dynamic-renders a page that is currently free to serve).

---

## R9 — Related products reuse the search endpoint

**Decision**: the product page issues one server-side search filtered by the product's primary
category, `limit` 12, self excluded client-side of the query, rendered as a rail — inside its own
Suspense boundary so it can never delay the buy box.

No new capability, no recommendation engine, no new relationship (spec assumption). When the category
yields nothing else, the section is omitted entirely rather than rendered empty (FR-026).

---

## R10 — Sticky affordances are CSS, not JavaScript

**Decision**: the mobile sticky buy bar is a `Scaffold` bottom bar owned by the product screen; the
web checkout summary is `position: sticky` in a two-column grid above the `lg` breakpoint. Neither
needs a scroll listener, which is what usually makes these janky and expensive.

---

## R11 — No-card doctrine: what is permitted here, and why (Principle V)

Principle V requires the plan to record any justified card usage. Three, and only three:

1. **Product tile** — already the recorded exception (019): a scannable product grid is the
   industry-standard pattern and no better layout exists. **Unchanged by this feature**, other than
   becoming fluid (FR-020).
2. **Category tile** (new, in browse) — image plus label, tappable, in a grid. Justified as the *same*
   pattern applied to the same kind of thing: a navigable catalogue entity presented for visual
   scanning. Both reference platforms use it, and the alternative for a food-first store — a
   twenty-item text list — is measurably worse at the one job browse has. Recorded as an **extension of
   the existing exception, not a new class of card**.
3. **Promo slide** — a full-bleed merchandising surface. It is not a container tiling content and is
   not a card in the sense the doctrine prohibits; it is named here so the review does not have to
   re-litigate it.

Everything else stays rows, lists, tables, and sectioned pages: product specifics, cart lines, order
lines, delivery options, addresses, account rows, and every empty and error state. **No metric or
summary cards anywhere**, and none at the top of any page.

---

## R12 — Telemetry (Principle VII requires this to be declared)

**Web (PostHog — already a dependency of `apps/customer-web`)**, new typed events:
`delivery_location_set`, `browse_category_opened`, `search_refined`, `search_sorted`,
`product_gallery_viewed`, `related_product_opened`.

**No location PII.** `delivery_location_set` carries `serviced: true|false` and **not the postcode**. A
postcode is a location identifier for an individual shopper, and Principle VII allows no PII in
telemetry beyond the auth subject id. This is worth stating because the postcode is the obvious,
tempting property to attach.

**Hot path metrics**: the two new reads get the standard handler metrics, plus one counter for
serviceability outcomes labelled `serviced` only — a two-value label, deliberately, because
`postcode` as a label is an unbounded-cardinality mistake that would degrade the metrics backend.

**Mobile telemetry remains deferred**, consistent with 013/014/015. This is a standing platform
exception with an owning slice (`mobile-telemetry`), recorded here rather than silently skipped —
which means the mobile half of the events above does not ship in this feature.

---

## R13 — How this gets verified

- **Go**: cursor round-trip per sort; a cursor from one sort rejected under another; count agrees with
  the number of rows a full paged walk returns; **serviceability parity — the storefront read and
  checkout's destination resolution return the same answer for the same postcode**, which is SC-002a
  made executable.
- **Web**: Vitest for the stores and components; Playwright for the guest journeys, URL-state sharing,
  keyboard traversal, and the no-placeholder rule; `depcruise` for the new quarantine; the budget gate.
- **Mobile**: `commonTest` for view models and stores on both Android and iOS targets; `mobile-guard`.
- **Cross-cutting gates**: `tokens:check`, `brand-check`, `check-no-jade`, contract drift.
- **SC-005 is a structured review, not an automated check** — 5 viewports × 2 appearances × 2
  surfaces, walked against a written matrix in `quickstart.md`. Claiming otherwise would be dishonest:
  no gate in this repo can tell whether a layout looks right.

---

## R14 — Sequencing

Phase 0 (foundation) lands before any story: the bundle overage fix, the shared-contract change, the
mobile foundation extraction, and the serviceability/sort backend. Every user story depends on some
part of it, and doing it per-story would mean doing it three times.

Then the five stories in spec priority order, each independently shippable. Story 1 alone materially
improves the storefront and is the one to cut to if scope must shrink.

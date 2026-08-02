# Research: 033 — Customer Saved Items

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Date**: 2026-08-02

Phase 0 output. Every decision below resolves a `NEEDS CLARIFICATION` from the plan's Technical
Context, or records a finding that changes what gets built. Findings that contradict an existing
comment or spec in the repo are marked **⚠ CORRECTION** — they are stated here rather than patched
silently, per Principle I.

---

## R1 — Path: the hot path, without exception

**Decision**: everything server-side in this slice lands in `apis/core-api` (Go). Nothing goes to the
cold path.

**Rationale**: 011's FR-028 routing law is explicit — commerce (product · catalog · search · cart ·
order · payment) is hot path; customer profile/account is cold path. Saved items is a customer
commerce read/write on the shopper's critical path, invoked from every product tile. The predecessor
was already on the hot path (`apis/core-api/internal/features/favorites/`) and the cold path has
**zero** favourites code today, so this is continuity, not a move.

**Consequence, stated plainly**: `core-api` has **no cloud deploy** — it is local-Docker-only by
platform decision, and its go-live is its own slice. So this feature is verifiable locally and
**cannot ship to dev** until the hot path deploys. That is a pre-existing platform condition, not
something this slice introduces, and it applies equally to the predecessor it replaces.

**Alternatives rejected**: cold path (violates FR-028 and would put a per-tile read behind Lambda
cold starts); splitting the write to cold and the read to hot (two auth models and two deploy
cadences for one capability).

---

## R2 — ⚠ CORRECTION: the storefront's serviceability answer is NOT the same predicate as checkout's

**Finding**. `apis/core-api/internal/features/storefront/repository.go:322-327` carries this comment:

> ⚠ It delegates to `delivery.ZoneForPostcode` rather than issuing its own SELECT. **That is the
> entire mechanism behind FR-014b**: checkout's `DestinationZone` calls the same function, so the
> answer a shopper gets in the storefront header and the answer they get at payment come from one
> implementation and **cannot drift apart**. Do not inline the SQL back into this file.

**The comment is wrong, and the drift is live.** The shared function covers only the
**destination-zone** term. Checkout requires **three more**, none of which `Serviceable()` consults:

| Term | Where checkout enforces it |
|---|---|
| destination postcode is in some zone | `delivery.ZoneForPostcode` — *shared* ✅ |
| the shop's own postcode is in some zone (`leg.OriginOK`) | `checkout/quote.go:215` |
| an **active** `delivery_offering` exists on that origin→destination leg | `checkout/quote.go:215` (`len(leg.Offerings) == 0`) |
| an **active** `delivery_pricing_rule` exists for the method | `checkout/quote.go:254-263`, `:277-279` |

This is 031's REGIONAL defect, still unfixed on the storefront: zone `REGIONAL` holds **3350
(Ballarat)** and **3550 (Bendigo)** with zero active inbound offerings, so
`GET /v1/storefront/serviceability?postcode=3350` answers `{"serviced":true}` while checkout can quote
nothing. 031 surfaced it in an admin health endpoint and deliberately left the storefront predicate
alone (its FR-028 guard required an empty `core-api` diff).

**Decision** (operator, 2026-08-02): build the **full four-term predicate** as a new file in
`apis/core-api/internal/platform/delivery/` — beside `zone.go`, for the reason `zone.go:12-29`
already gives — use it for saved items, **and repoint `storefront.Repository.Serviceable` at it**, so
FR-014b's promise becomes true rather than merely asserted.

**Consequence, accepted knowingly**: postcodes that currently answer `serviced: true` on the strength
of zone membership alone will begin answering `serviced: false` until an offering and a pricing rule
are configured for their leg. On today's dev data that is **3350 and 3550**. This is a behaviour
change for shoppers, and it is the correct direction: the storefront stops inviting people it cannot
serve. `ServiceabilityDTO` is **not** touched — 030 froze its two fields and both reflection tests
stand; only the boolean's *truthfulness* changes, not the shape.

**Alternatives rejected**:
- *Use `Serviceable()` for saved items.* Ships FR-035/FR-037 knowingly violated and reproduces the
  exact defect the spec was written to prevent, on a new surface.
- *New predicate for saved items only, leave the storefront alone.* A shopper in 3350 would read "We
  deliver to Ballarat" in the header and "Not delivered to your area" on every item of the same
  screen. Two answers to one question is what FR-014b exists to forbid.

**Not joined, deliberately**:
- `shop_sameday_declaration` — a shop with no same-day approval still delivers standard.
- `delivery_area_decision` — a `not_served` decision is written in the **same transaction** that
  removes the postcode from its zone (`20260801184250_delivery_area_decisions.sql:48`), so zone
  membership already reflects it. Joining it would double-count.
- `shop.status` — **⚠ nothing in the hot path reads it today**; a `suspended` shop's products are
  still sold by cart and checkout. Adding it here would make saved items stricter than checkout — a
  *new* disagreement in place of the one being fixed. **Recorded as a carry-forward, not fixed here.**

---

## R3 — The five-way verdict is one SQL statement

**Decision**: purchasability for N saved products against one destination postcode is answered by a
**single** statement, and `product.status` supplies the lifecycle distinctions with no inventory
table.

**Rationale**. The spec's five outcomes map onto data that already exists:

| Spec outcome (FR-035) | Source |
|---|---|
| `no_longer_sold` | `product.status = 'archived'` — terminal, per `cart/service.go:42-48` |
| `not_yet_determined` | destination postcode is absent from the request |
| `temporarily_unavailable` | `product.status IN ('draft','unavailable')` |
| `not_delivered_to_your_area` | the R2 predicate fails for this product's shop |
| `purchasable` | `status='active'` **and** the R2 predicate holds |

**There is no inventory or stock table anywhere on the platform** — verified by grep across every
migration and Go file. `product.status` is the only stock-like signal, and its vocabulary was
designed for exactly this distinction: *"Only `active` is purchasable; `archived` is terminal and its
line is swept away; `draft` and `unavailable` are flagged but kept, because a shopper may reasonably
wait a temporary state out."*

Index support is complete: `delivery_zone_postcode.postcode` UNIQUE, `delivery_offering_lookup_idx
(origin_zone_id, destination_zone_id)`, `product` PK, `product_media_product_idx`.

**Ordering is decided in SQL, not in Go**: `archived` is checked **before** the destination test, so a
withdrawn product reads `no_longer_sold` even for a shopper with no location — the more informative
of the two true statements.

**Performance**. A Sydney RDS round trip measures **~135 ms** from local `core-api`
(`storefront/service.go:198-222`). SC-006 allows 2 s for a full-cap list. One statement plus presign
work fits; **a per-item query does not** — 200 items × 135 ms is 27 s. 029's 8-serial-query `/home`
503 (at exactly 3.007 s) is the standing precedent, and its fix — `errgroup`, two waves, ordering held
outside the goroutines — is the pattern if the list read ever needs a second query.

---

## R4 — Membership: one bulk read, painted client-side. Never an embedded boolean.

**Decision**: the "is this saved" answer is delivered by **one** endpoint returning the shopper's
whole set of saved product ids, held in a client store that every save control subscribes to. No
`isSaved` field is added to any catalogue, search, or product-detail DTO.

**Rationale**. Three options, and only one survives `cacheComponents: true`:

| Option | Cacheability | Requests | Verdict |
|---|---|---|---|
| `isSaved` per product on catalogue reads | **destroyed** — every catalogue response becomes per-shopper | 0 extra | ✗ |
| `GET /v1/saved/{id}` per tile | fine | **N per screen** | ✗ (FR-020) |
| **whole-set membership read + client store** | preserved | **1** | ✓ |

`ARCHITECTURE.md:338-345` is binding here: the page body prerenders into a static shell and
personalisation streams in, and `cookies()`/`headers()` must never be called above a Suspense
boundary. An `isSaved` boolean on a product DTO would make the product read itself shopper-specific,
which is the failure that section exists to prevent.

**⚠ The streaming-server-fragment pattern cannot carry this alone**, and this is the one place where
saved items differs structurally from the cart badge or `DeliverySeed`. A save control is
**interactive**, and for a guest its truth lives in `localStorage`, which no server render can see.
So the client store is required *regardless* of sign-in state — which is what makes one design serve
both audiences: the store is seeded from `localStorage` for a guest and from the membership read for
a signed-in shopper, and every control reads only the store.

**A cap is what makes the whole-set read cheap** (R11): 200 ids ≈ 7.4 KB uncompressed, far less
gzipped, fetched once per page and invalidated on toggle.

**FR-022 asymmetry**: before the store resolves, controls render **unsaved**. Falsely showing
*unsaved* costs one redundant, idempotent save; falsely showing *saved* invites the destructive
second tap this whole feature exists to eliminate.

---

## R5 — Web bundle: reclaim on `/search` before spending

**Finding** (measured, not quoted — `node scripts/bundle-budget.mjs` on the current build):

| Route | Now | Limit | Headroom |
|---|---:|---:|---:|
| `/` | 172.7 KB | 174 | 1.3 |
| `/browse` | 169.9 KB | 174 | 4.1 |
| **`/search`** | **173.9 KB** | 174 | **0.1** |
| `/product/[id]` | 172.3 KB | 174 | 1.7 |
| `/cart` | 173.7 KB | 174 | 0.3 |
| `/promotions/[id]` | 170.8 KB | 174 | 3.2 |

**Decision** (operator, 2026-08-02): keep FR-007 in full on web, and **reclaim bytes on `/search`
first** by deferring part of `SearchExperience` behind an interaction gate, then spend the reclaimed
budget on the save control. Do not raise `GUEST_LIMIT`.

**Rationale**: the standing rule is 030's contract §FR-045 and the gate's own failure message — *"If
the split still breaches the budget, **reduce the web presentation** — do not raise the limit and do
not add a dependency."* The framework floor is already **143.5 KB** of the 174 (82%), so the budget
is not padded; raising it converts a real constraint into a ratchet.

Only `/search` is genuinely blocked. `/cart` is tight (0.3 KB) but **renders no product tiles**, so it
should be unaffected — this must be verified, not assumed, since the saved store module could be
pulled in by a shared import. `/` at 1.3 KB is the second risk and may need its own reclaim.

**⚠ `next/dynamic` is not a free escape.** 030 measured the split **alone** making every route
*worse* (+0.4–0.6 KB; `/cart` 173.8 → 174.3, over budget) because the lazy-loader runtime costs more
than a small deferred payload. Getting under required four separate changes, including **dropping the
`loading:` fallback** and splitting `DeliveryNotice` into its own module. Budget for iteration:
measure after every step, and treat the first attempt as a hypothesis.

**⚠ `ProductCard` is one big `<Link>`** (`app/(shop)/_components/ProductCard.tsx:72-141`). A
`<button>` nested inside an `<a>` is invalid HTML and produces hydration warnings, so the card must be
restructured (stretched-link overlay, or the control as a sibling outside the anchor) before a control
can be added.

**⚠ `ProductCard` has no `"use client"` directive** and is *dual-mode*: client-bundled on `/` (via
`RecentlyViewedRail`) and `/search` (via `SearchExperience`), but **server-rendered** on
`/product/[id]` (via `RelatedProducts`). Putting a hook directly in `ProductCard` makes it a client
component **everywhere**, including inside `RelatedProducts`. The control must therefore be its own
small client component that the card renders as a slot — not a hook inside the card.

**Cheapest precedent**: 030 T027b rejected a `DeliverySeedClient` module because *"a new
client-component boundary costs more than the ~0.1 KB of headroom the storefront chrome has left. **A
prop on a component that already ships costs approximately nothing.**"*

---

## R6 — Guest storage, web: a versioned local store on the `cart-store` pattern

**Decision**: `apps/customer-web/lib/saved-store.ts` — key `effy:saved:v1`, a versioned envelope,
`useSyncExternalStore`, zero dependencies. Modelled structurally on `lib/cart-store.ts`, sized closer
to `lib/delivery-store.ts`.

**Rationale**: this storefront ships a deliberately tiny guest bundle — no TanStack, no Zustand on the
public path — and `cart-store.ts` (402 lines) already proves the shape at a harder problem. The
properties to copy verbatim:

- **Reference-stable reads** — a frozen `EMPTY` returned by identity, or `useSyncExternalStore` sees a
  changed snapshot every render and React trips an infinite loop (`cart-store.ts:169-173`).
- **Every failure yields empty, never a throw** — *"losing a cart is bad, but a render crash is worse,
  and a half-parsed cart is worst because the shopper would trust it"* (`:200-204`).
- **Cross-tab agreement** via a `storage` event listener that clears the raw cache (`:284-299`).
- **Version mismatch discards, never migrates.**

**⚠ No legacy migration.** The predecessor stored nothing client-side — a guest was bounced to
sign-in — so there is no prior key to read. `effy:saved:v1` starts clean. (Contrast `cart-store.ts:32-37`,
where dropping the legacy read *"would have made the deploy itself the cart-loss bug this slice exists
to fix"*.)

**⚠ Not a cookie.** `lib/delivery-store.ts:14-17`: *"A cookie would be readable during server
rendering, which sounds convenient and would cost every public page its static shell."*

**No offline queue on web**, matching `cart-actions.ts:43-46`: a browser tab is shorter-lived than an
app, and a queue in `localStorage` would cost bundle bytes for a case the next page load repairs.

---

## R7 — Guest storage, mobile: it works today, and 030's stated reason was stale

**⚠ CORRECTION.** `apps/customer-mobile/.../features/delivery/DeliveryContextStore.kt:15-27` claims:

> This app has **no key-value persistence at all** … `multiplatform-settings` is a shop-mobile
> dependency that customer-mobile does not have.

That was true in 025. It has been false since **026**, which shipped
`core/storage/DevicePreferences.kt` — an `expect fun devicePreferences()` over `SharedPreferences`
(Android) and `NSUserDefaults` (iOS), plus an `InMemoryDevicePreferences` test fake. 027 then built
`CartLocalStore` on top of it. The claim is repeated in three places
(`DeliveryContextStore.kt:15-27`, `specs/030-.../research.md` R12, `AppContainer.kt:135-142`).

**The real cause of 030's carry-forward is a two-line omission**, not a missing capability. The store
was built with the seam already in place —
`DeliveryContextStore(initialPostcode: String?, persist: (String?) -> Unit = {})` — and
`AppContainer.kt:142` calls the **no-arg** constructor, so `persist` is `{}`. A test for the callback
already exists (`DeliveryContextStoreTest.kt:134`).

**Decision**: guest saved items on mobile **do** survive app restart (FR-025), via a
`SavedLocalStore` built structurally on `CartLocalStore` (109 lines) — versioned envelope, defensive
decode, discard-on-mismatch, `runCatching` writes, `SCHEMA_VERSION` that discards rather than
migrates. The guest **cart already survives restart** today (persistence is not sign-in-gated;
`CartStore.persistSoon()` is called unconditionally), so this is a proven path.

**⚠ A doctrine amendment is required in the same commit.**
`DevicePreferences.kt:36` states: *"The cart mirror (`CART_MIRROR`) and its pending-change queue
(`CART_QUEUE`) are the **only entries admitted** under this amendment."* A guest saved list needs a new
`PreferenceKeys` entry, so that comment must be widened. The 027 admission criteria are all satisfied
and should be shown to be: the list is reconciled against the platform on read and discarded when the
platform disagrees; it is **never** an input to an authorization or pricing decision; and it holds no
more than the shopper could already see on screen.

**Out of scope but noted**: fixing `DeliveryContextStore`'s persistence is ~3 lines with a test
already written. It is **not** part of this feature and is recorded as a carry-forward, along with the
three stale comments.

---

## R8 — The guest→account join

**Decision**: `POST /v1/saved/merge` taking the device-held product ids; the platform performs a set
union under the account cap and answers with the resulting list plus a count of what was added. The
device list is cleared **only after** the platform acknowledges.

**Rationale**: this is strictly easier than 027's cart merge — a set with no quantities, so union is
trivially idempotent and needs no revision counter or maximum-quantity rule. The ordering rule is
inherited verbatim from `cart-actions.ts:201-209`: *"The local lines are never cleared first…
clearing first and merging second is how 019's Option B lost carts."*

Mobile's `MergeCartOnSignIn` (`CartUseCases.kt:217-234`), wired through
`SessionManager(onAuthenticated = …, onSignedOut = …)` at `AppContainer.kt:256`, is the exact hook to
mirror. Web's two call sites are `sign-in/SignInForm.tsx:62` and `callback/CallbackHandler.tsx:54`
(the OAuth return) — **both** are required, or federated sign-in silently drops the guest list.

**FR-032 disclosure**: the response carries the added count so the arrival surface can say how many
items joined. On web this is the existing zero-dependency toast (`lib/toast-store.ts`); on mobile a
snackbar. Not a modal — a join only ever adds and is individually reversible.

**FR-047/FR-048 at the cap**: the union is truncated **newest-first** and the response names what did
not fit. Nothing already saved is ever evicted.

---

## R9 — Price at save, and what is *not* stored

**Decision**: store exactly two extra facts per saved item — the price at the moment of saving, and
its currency. Nothing else about the product is copied.

**Rationale**: FR-043 needs a baseline to compare against, and the live price cannot supply one.
Everything else (name, image, current price) is read live per FR-045, so a rename or re-image shows
the product's true current identity. Every reference platform does a live join for
watchlists and reserves snapshots for orders, where the historical fact is legally load-bearing.

**Type**: `numeric(12,2)` matching `product.price_amount`, crossing the wire as `::text` and converted
to cents via the `money` package. **Never a float** — `storefront/repository.go:20-29`.

**⚠ FR-044 asymmetry**: a price *rise* gets no indicator. The current price is always shown, so
nothing is hidden; the actionable signal for a watchlist is the drop.

---

## R10 — A new table, not an altered one

**Decision**: one forward migration creating `public.customer_saved_item` and **dropping**
`public.customer_favorite`.

**Rationale**: the operator chose a full clean slate. The predecessor's rows carry no save-time price,
so migrating them would fabricate a baseline that was never observed — FR-005 states this consequence
explicitly. A new table name also makes the replacement greppable and prevents a half-migrated schema
from being mistaken for the new model.

**⚠ `public.cart_saved_item` is a different table and is NOT touched** (FR-003, SC-015). It is the
cart's set-aside (027), keyed and priced differently, well tested, and 027's research **explicitly
rejected** reusing `customer_favorite` for it. The mobile cart even carries the comment: *"A bookmark,
deliberately NOT a heart: the heart is Favourites, a different capability."* The two names are
adjacent enough to be dangerous — the migration comment must say so.

**Down section**: drops the new table. Per `db/README.md`, this is honestly lossy and the header says
so; the platform is forward-only and `db-down` is a dev iteration convenience.

---

## R11 — Caps: 200 account, 50 guest

**Decision**: 200 saved items per account, 50 per device-held guest list. Enforced server-side inside
the writing transaction, refused via `httpx.ValidationFailedAs` so the client can distinguish
"cap reached" from every other refusal.

**Rationale**: eBay caps its watchlist at 400 and Target its lists at 250; commercetools caps a
shopping list at 100 line items. 200 is generous for grocery, keeps the R4 whole-set membership read
cheap, and bounds abuse. The guest cap is smaller because a device-held list has no account behind it.

**⚠ Enforced in the transaction, not in the service.** 027's `promo_redemption` precedent
(`FOR UPDATE`, the check and the write in one transaction) applies: a concurrent save can land between
a service-layer count and the insert.

**Never evict.** FR-047 is absolute. Silent eviction of something a shopper deliberately saved is
unforgivable, and it is exactly the kind of "helpful" behaviour that destroys trust in a list.

---

## R12 — ⚠ The heart on an order line is blocked at the contract, on both surfaces

**Finding**: FR-008 (save from a line in order history) **cannot be built as the contract stands.**

- Mobile: `ReceiptItem` (`features/checkout/domain/Checkout.kt:24-29`) carries
  `productName · quantity · unitPriceAmount · lineSubtotalAmount` — **no `productId`.** You cannot
  save a product you cannot identify.
- `OrderSummary` (`Checkout.kt:76-83`) carries no line items at all, so the Orders *list* screen was
  never a candidate; the order **detail** screen (`ReceiptScreen`, reused for both receipt and order
  detail) is where FR-008 lands.

**Decision**: add `productId` to the order-item DTO. This is **not a mobile-only change** — it is a Go
projection change, a `packages/shared-types` change, a regenerated contract, both mappers, and a wire
contract test. Budget it explicitly rather than discovering it mid-implementation.

**Consequence**: FR-008 is sequenced **last** among the placement requirements, because it is the only
one with a cross-language contract dependency. If it slips, it slips visibly as a named task rather
than as a silent omission.

---

## R13 — Undo restores position; re-saving does not

**Decision**: removal is a soft two-step at the presentation layer only. The undo affordance holds the
removed item's original `saved_at` and, on undo, re-creates the row **with that timestamp**. A
deliberate re-save after a completed removal writes `now()` and lands at the top.

**Rationale**: FR-018 requires this distinction, and it is only expressible if `saved_at` is
writable rather than always `DEFAULT now()`. Undo means "that removal did not happen"; promoting the
item to the top would make undo lossy in a different direction.

**⚠ M3 constraint**: `m3.material.io` is explicit that a snackbar must not be the only route to an
action, which is why FR-017 also requires removal to be reversible by simply saving the product again.
The undo is a convenience, never the sole mechanism.

---

## R14 — ⚠ Telemetry: PostHog has never been initialised on customer-web

**Finding**. The taxonomy exists (`lib/telemetry.ts:104-161`, a typed `StorefrontEvent` union), the
dependency is installed, the consent gate is implemented and unit-tested, the dynamic import that
keeps 68 KB off the guest path is in place, and ~15 components call `capture(...)`.

**But a repo-wide grep for `initAnalytics|setConsent|identifyCustomer|resetIdentity` finds zero
non-test call sites, and there is no consent banner anywhere.** So `started` is always `false`,
`capture()` is always a no-op, and **no event has ever reached PostHog from customer-web.** The
predecessor's `product_favorited` event (`lib/telemetry.ts:121`) is doubly dead: declared, documented
as shipped in `docs/telemetry/commerce-events.md:19`, and fired by nothing.

**This is a platform-wide gap, not one this feature created** — but it lands on FR-060 and on
SC-012/SC-013, which require save rate and save-to-cart to be *"reportable from day one."*

**Decision**: the plan carries a **minimal consent affordance** as its own phase (US6), marked as the
one phase that can be cut. If it is cut, FR-060 is met **structurally only** (the events are declared
and emitted into a no-op sink) and **SC-012 and SC-013 are unmeasurable** — which must then be
recorded in the sign-off rather than claimed.

**Byte cost is real**: a consent affordance sits on the guest path and competes with R5 for the same
`/search` headroom. Sequencing US6 last means the reclaim work in R5 is already measured before this
spends against it.

**⚠ Mobile telemetry is a separate matter and stays deferred** — it would be the **twelfth**
consecutive slice. The taxonomy doc's convention is to say so explicitly rather than claim parity;
`docs/audiences/customer-capabilities.md` §027 already words it: *"this is not parity, and is not
claimed as parity."*

---

## R15 — Mobile: one card component covers every tile surface

**Decision**: the save control becomes an optional `BoxScope` slot on `EffyProductCard`'s existing
image `Box` (`core/presentation/StorefrontKit.kt:937-957`), defaulting to `null`.

**Rationale**: that `Box` already hosts the "Unavailable" scrim, so the overlay pattern is proven
in place. `EffyProductCard` is reached by `EffyRailTile` (home rails) and directly by `SearchScreen`
— and there is **no separate Browse or Category screen**; `CustomerNavKey.Results` renders
`SearchScreen` with an entry refinement. So one change covers Home rails, Search, Browse, Category,
"See all", and the saved list itself. The alternative — wrapping at each call site — is how
`EffyRailTile`'s own comment says two screens start disagreeing about what a sale looks like.

**Two traps to verify**: the card's `.clickable` sits on the outer `Column` with `indication = null`,
so the control needs its own `clickable` and must be confirmed not to also trigger navigation; and the
0.97 press scale applies to the whole `Column`, so the control scales with the tile.

**⚠ `Text("♥` and `Text("♡` are a build failure** — `scripts/mobile-guard.sh:106` (025 SC-006). The
control must use `Res.drawable.ic_favorite_outlined` / `ic_favorite_selected`, **both of which already
ship** in the `packages/design-system/mobile-assets/` SSOT and are already synced. No new asset is
needed, so `tokens:check` stays unchanged.

**⚠ A new nav route costs four edits** or it breaks on iOS only, after process death: the declaration,
the `customerNavSavedState` polymorphic module, `ALL_CUSTOMER_ROUTES`, and the hard-coded count `23`
in `ScreenInventoryTest.kt:58`. Kotlin/Native has no reflection-based saved state, so a missing
registration passes every Android test and throws on restore on iOS.

**⚠ `mobile-guard.sh` requires every declared destination to be reachable** from outside `core/nav/`
— `entry<CustomerNavKey.X>` declarations are explicitly excluded, because *"entries are the
destination, not the way in."* That guard exists because the Nav3 migration once made the cart
unreachable while the whole suite stayed green.

---

## R16 — ⚠ The existing mobile projection discards fields it already receives

**Finding**: `FavoriteCard` (`features/favorites/domain/Favorites.kt:9-16`) drops `brand`,
`compareAtAmount`, `badges` and `savedAt`, and `FavoritesScreen.kt:193-203` then passes
`brand = null, compareAtAmount = null, badges = emptyList()` into `ProductCard`. The comment at
`FavoritesScreen.kt:179-182` blames the projection for carrying fewer fields — **that is wrong**; the
Go handler computes all four and the generated `FavoriteDTO` carries all four. The mobile mapper
discards them.

**Consequence for this slice**: the rebuilt saved list gets sale badges and strike-through pricing for
free, because the data was always there. Recorded so the rewrite does not reproduce the same mapper.

---

## R17 — Contract generation: the aggregator is what makes a type exist

**Decision**: every new DTO is added to the `import type` block, the `export type` re-export, **and a
field on the `CustomerCommerceContract` interface** in
`packages/shared-types/src/customer-commerce-contract.ts` — unless it is reachable transitively from a
type already there.

**Rationale** — 030's near-miss, recorded in the file itself at `:148-151`: the generator walks the
aggregator with `--expose all`, so a DTO declared in a domain file and exported from `src/index.ts` is
still invisible to it. Then `commerce-contract:check` (regen + `git diff --exit-code`) produces the
**same** bytes as the committed file — both missing the type — so **the drift check passes
trivially** while the Kotlin client carries a hand-written type.

**⚠ Live examples of this exact gap right now**: `ProductSearchQuery` (`src/storefront.ts:202`) is
exported and generates to Kotlin **zero times**.

**⚠ Use `WireInt` for every count.** `packages/shared-types/src/cart.ts:28-47`: a plain TS `number`
becomes JSON Schema `"number"` → Kotlin `Double` → `kotlinx.serialization` emits `"count":1.0` →
Go's `encoding/json` **cannot** unmarshal `1.0` into an `int` → 422. This is 027's R13, which cost
days and was invisible to every unit test because the fakes spoke Kotlin at both ends. `@asType
integer` fixes it at the contract. Import `WireInt`, never redeclare it.

**⚠ `cm-contract-check` is NOT in CI** — it is Makefile/operator-only, so contract drift must be run
by hand as part of the verification sweep.

---

## R18 — Design: Principle V compliance for the saved list

**Decision**: the saved list is a **list with detail rows on web** and a **product grid on mobile**.

**Rationale and justification, as Principle V requires when a card-shaped thing is used**: the
constitution's prohibition targets *card-style containers used to lay out content* — bordered/elevated
boxes tiling a page, and metric/summary cards at the top of a page. `EffyProductCard` is neither: it
is a product tile with no border and no shadow, and it is the platform's single established product
presentation, already used on Home, Search, Browse and Category. Introducing a second product
presentation for the saved list is precisely the drift `EffyRailTile`'s comment warns about. Web keeps
a list, matching how the predecessor and the address book already present account content.

**⚠ SC-009 is a genuine design risk, not a formality.** The brand is monochrome with no hue, so a
filled heart has **no colour cue at all** distinguishing it from an empty one — fill, shape and the
announced state carry the entire burden. This is the same class of risk 029's R9 raised about hueless
banners, which was never answered because the operator half was never walked. SC-009 requires
observation with real people, including a screen-reader user and the largest supported text size.

**⚠ Accessibility (FR-058)**: MDN and Deque are explicit — use a real `<button>` with `aria-pressed`,
and **do not change the accessible name when the state flips**. The predecessor's web control swaps
`aria-label` *and* sets `aria-pressed`, which double-announces. Mobile's product-detail control puts
the state in a visible text label ("Saved"/"Save"), which is correct and should be preserved where
there is room for text; the tile overlay has no room, so it carries the state in its
`contentDescription`/toggle semantics instead.

---

## R19 — Testing: what each layer can actually prove

**Decision**, per layer:

- **Go unit** — hand-rolled fakes over a `Reader` seam, no mock framework (`storefront/service_test.go:9-10`).
  Proves the five-way classification, cap refusal, and merge idempotency.
- **Go container-backed** — testcontainers `postgres:16-alpine`, gated behind `if testing.Short() { t.Skip }`.
  `storefront/locality_coverage_test.go` is the template: stand up Postgres, hand-write a minimal
  schema for just the tables the rule spans, assert the SQL, **including a case that must be able to
  fail**. This is the only way to prove the R3 verdict SQL — *"with raw SQL and no ORM, mocks cannot
  catch SQL syntax, constraint, or scan errors."*
- **Wire contract** — a byte-identical JSON literal duplicated by hand in Go and Kotlin, the 028
  pattern (`wire_contract_test.go` ↔ `BannerWireContractTest.kt`). Non-negotiable if any count crosses
  the wire (R17).
- **Web unit (vitest)** — the pure store core, the merge logic, the verdict→copy mapping.
  **⚠ Vitest cannot test async Server Components** (`vitest.config.ts:14-36`) — anything rendered goes
  to Playwright.
- **Web e2e (Playwright)** — runs against a **production build**, never `next dev`. Guest save
  persistence, the join on sign-in, and the cap refusal.
- **Mobile `commonTest`** — pure JVM host tests, `InMemoryDevicePreferences` as the storage fake,
  `kotlinx-coroutines-test` for the sync coordinator.

**⚠ The predecessor has zero tests of any kind**, on any surface, despite 019's tasks claiming
"+ tests" for them. SC-014 exists to close that, and the count is the evidence.

---

## Open questions carried into implementation

1. **Does the R5 reclaim actually free enough on `/search`?** 030 proved a deferral can *cost* bytes.
   If the first attempt does not clear 174 KB, the fallback is to reduce presentation further — not to
   raise the limit.
2. **Does `/` need its own reclaim?** It sits at 1.3 KB headroom and hosts both `RecentlyViewedRail`
   and the home rails, so it takes the control twice over.
3. **Is US6 (the consent affordance) in or out?** Cutting it makes SC-012/SC-013 unmeasurable and that
   must be recorded, not glossed.

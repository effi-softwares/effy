# Data Model: Customer Mobile Home — Sectioned Merchandising & Search Entry

**Feature**: 028-mobile-home-merchandising | **Phase**: 1 | **Date**: 2026-07-31

Most of this feature's entities already exist. This file records **what changes**, and states plainly
what does not — because "nothing changes here" is the more useful half of a data model when a feature
is mostly presentation.

---

## 1. Database — `public.promo_code` gains an advertising facet

One forward-only Goose migration. **No new table.** Five columns, one CHECK, one partial index.

| Column | Type | Null | Default | Purpose |
|---|---|---|---|---|
| `is_advertised` | `boolean` | NOT NULL | `false` | Whether this promotion may be shown on the storefront Home. **Opt-in, always.** |
| `banner_title` | `text` | NULL | — | The shopper-facing headline. Required whenever `is_advertised` (see the CHECK). |
| `banner_subtitle` | `text` | NULL | — | Optional supporting line. The *terms* sentence is composed by the server, not stored here. |
| `banner_image_key` | `text` | NULL | — | S3 storage key for optional artwork. Presigned on read, exactly like product media. Never a URL — a stored URL expires. |
| `banner_position` | `int` | NOT NULL | `0` | Where the banner sits in the Home section sequence. Lower first; ties broken by `created_at`. |

### Constraints

```sql
CONSTRAINT promo_code_banner_copy_chk CHECK (
    is_advertised = false OR banner_title IS NOT NULL
)
```

**Why a constraint and not a service check.** FR-037b says the promotion's internal code must not be
the banner headline — an operator identifier is not a sentence a shopper can read. A service check can
be bypassed by a second writer, a backfill, or a future route; a CHECK cannot. This follows the idiom
`promo_code_kind_value_chk` already set in the 027 migration: **make the ill-formed state
unrepresentable rather than merely rejected.**

```sql
CREATE INDEX promo_code_advertised_idx
    ON public.promo_code (banner_position, created_at)
    WHERE is_advertised;
```

**Partial**, because the hot path only ever reads advertised rows and they are a small minority. The
index covers the ordering as well as the filter, so the Home read's banner query needs no sort.

### What is deliberately NOT stored

- **No redemption counter.** Exhaustion is COUNTED from `promo_redemption` at read time, never stored.
  This is 027's rule, kept for 027's reason: a counter and the rows can disagree, and then nobody knows
  which is true. It is also what makes FR-037c enforceable — an exhausted promotion stops being
  advertised because the count says so, not because someone remembered to flip a flag.
- **No separate banner lifetime.** A banner is live exactly while its promotion is. Giving a banner its
  own window would create two schedules to keep in step, which is the mechanism by which banners go
  stale everywhere else.
- **No `banner_href`.** The destination is derived from the promotion, not authored (see §3).

### Visibility predicate (the single definition of "advertised right now")

A promotion is advertised on Home when **all** of these hold:

```
is_advertised
AND status = 'active'
AND (starts_at IS NULL OR starts_at <= now())
AND (ends_at   IS NULL OR ends_at   >  now())
AND (max_redemptions IS NULL
     OR (SELECT count(*) FROM public.promo_redemption r
         WHERE r.promo_code_id = promo_code.id) < max_redemptions)
```

Four of the five terms already exist as promotion semantics; only the first is new. This predicate is
the whole of FR-036 and FR-037c, and it lives in **one** SQL statement so it cannot drift between the
banner read and anything else.

---

## 2. Wire contract — `BannerDTO` (additive, optional only)

`packages/shared-types/src/storefront.ts`. Existing fields are unchanged; every new field is optional,
so `customer-web`'s current consumer keeps typechecking with no edit.

| Field | Type | New? | Notes |
|---|---|---|---|
| `key` | `string` | — | Now the promotion id rather than the literal `"welcome"`. |
| `title` | `string` | — | From `banner_title`. |
| `subtitle` | `string \| null` | — | From `banner_subtitle`. |
| `imageUrl` | `string \| null` | — | Presigned from `banner_image_key`. |
| `href` | `string \| null` | — | Retained for web. Mobile ignores it in favour of `target`. |
| `code` | `string \| null` | **new** | The code a shopper types in the cart. Shown so the banner is actionable. |
| `terms` | `string \| null` | **new** | **Server-composed** condition sentence, e.g. `"On orders over $30"`. Null when the promotion has no minimum. |
| `target` | `BannerTarget \| null` | **new** | A **closed vocabulary** (§3). |
| `position` | `WireInt` | **new** | From `banner_position`. ⚠ Must carry `@asType integer` — see below. |

### ⚠ `position` must be a `WireInt`

027's most expensive defect: Kotlin serialised a quantity as `Double`, the wire carried `1.0`, and
Go's `encoding/json` refused `1.0` into an `int`. **Every unit test passed throughout**, because the
fakes spoke Kotlin at both ends and never crossed the wire. The fix was made at the contract — a
`WireInt` alias carrying `@asType integer` in `packages/shared-types/src/cart.ts` — so the generated
Kotlin cannot regress. `position` is the same shape of field and takes the same treatment.

---

## 3. `BannerTarget` — a closed vocabulary

```ts
export type BannerTarget =
  | { kind: "search" }                          // the store, unfiltered
  | { kind: "sale" }                            // on-sale results
  | { kind: "category"; categoryKey: string }   // one category's results
  | { kind: "product";  productId: string };    // one product
```

**Why closed.** `href` is a **web path**. Mobile has no URL router, and inventing one to serve a banner
would be the tail wagging the dog. A closed set the server promises and the client maps exhaustively
means a new target shows up as a gap in a `when`, and at runtime an unrecognised value renders the
banner **non-tappable** rather than dead-tapping. A tap that does nothing is worse than no tap.

**Every target is reachable elsewhere in the app** — which is FR-034, and the reason no bespoke
"promotion landing page" exists: a destination that only a banner can reach is unreachable for the
majority of shoppers who never see the banner.

---

## 4. Mobile domain models (`features/catalog/domain/Catalog.kt`)

### `Banner` — extended

```kotlin
data class Banner(
    val key: String,
    val title: String,
    val subtitle: String?,
    val imageUrl: String?,
    val href: String?,
    val code: String?,        // new
    val terms: String?,       // new
    val target: BannerTarget?,// new — sealed interface, exhaustively mapped
    val position: Int,        // new
)
```

`BannerTarget` is a **sealed interface** in the domain layer, mapped from the wire DTO in
`CatalogMappers.kt`. An unknown wire `kind` maps to `null`, which the UI renders as non-tappable —
the wire shape never leaks past `data` (Principle VI).

### `Rail`, `ProductCard`, `Category` — unchanged

Stated explicitly because it is the point: `Rail(key, title, products)` is already exactly what a
section needs, `ProductCard` is already what a rail tile renders, and `Category(key, name, parentKey,
productCount, imageUrl)` already carries everything the shortcut row needs except the icon — which is
client-side artwork, not data (R5).

### `HomeContent` — unchanged shape

```kotlin
data class HomeContent(val banners: List<Banner>, val rails: List<Rail>)
```

Section ordering stays **server-side** (R8): the client renders `rails` in the order given and
interleaves `banners` by `position`. The client holds no list of section names, which is what makes
FR-040 true — a new grouping appears without an app release.

---

## 5. Presentation-layer types (new, mobile only)

These are **not persisted and not on the wire**. They exist so `HomeScreen` renders one flat list
rather than branching mid-layout.

```kotlin
/** One entry in Home's vertical sequence, after rails and banners are interleaved. */
sealed interface HomeBlock {
    data class Categories(val items: List<CategoryShortcut>) : HomeBlock
    data class Section(val rail: Rail) : HomeBlock
    data class Promo(val banners: List<Banner>) : HomeBlock   // >1 → pager
}

data class CategoryShortcut(val key: String, val label: String, val icon: DrawableResource)
```

**Why a sealed list rather than three fields.** The interleaving rule (banner at position *n* sits
between sections) is easier to get right, and far easier to unit-test, as a pure
`fun composeHome(home: HomeContent, categories: List<Category>): List<HomeBlock>` than as branching
inside a `LazyColumn`. The out-of-range clamp (R8), the empty-section skip (FR-020) and the
omit-when-empty rules (FR-029, FR-035) all live in that one pure function — testable without a device,
which is exactly the kind of logic that should never be trapped in a composable.

---

## 6. State transitions

Only one, and it belongs to the operator:

```
        ┌──────────────── operator marks advertisable (+ banner copy) ─────────────┐
        │                                                                          ▼
  not advertised                                                            advertised
        ▲                                                                          │
        └── operator un-marks · promotion expires · exhausted · disabled ───────────┘
```

Every leftward transition happens **without an operator acting**, except the first. That is the point
of FR-037c: the common case for a stale banner is nobody remembering to take it down, so the system
takes it down itself.

---

## 7. What this feature does NOT touch

Recorded so a reviewer can stop looking:

- `public.category` — **no `icon_key` column.** Icons are client artwork (R5). The column is the
  natural follow-up, not this slice.
- `public.product`, `public.order`, `public.order_item` — untouched. No sales ranking is computed;
  best sellers is deferred (spec Out of Scope).
- `cart`, `checkout`, `promo_redemption` write paths — untouched. Advertising a promotion changes
  nothing about how it is applied or redeemed.
- Auth, sessions, Cognito — untouched. Home is public.
- `customer-web` — reads the same `BannerDTO` and keeps working, because every new field is optional.

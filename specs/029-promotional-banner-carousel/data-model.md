# Data Model: Promotional Banner Templates & Home Carousel

**Feature**: 029-promotional-banner-carousel | **Phase**: 1 | **Date**: 2026-07-31

---

## 1. The canonical banner canvas — the feature's one constant

Not a database row. A **platform constant**, defined once in `packages/design-system` and consumed by
the console, the generated template, and the Compose theme (research R4).

| Property | Value | Why |
|---|---|---|
| Width | **1200 px** | 370 dp render width at 3× is 1110 physical px — headroom, never soft |
| Height | **600 px** | |
| Aspect ratio | **2 : 1** | The mobile-storefront norm, and the shortest plausible ratio: ~21% of viewport vs. 4:3's ~32% |
| Max file size | **150 KB** after normalisation | Mobile banner guidance; the existing 10 MB ceiling governs the raw upload |
| Text zone | Lower-left, inset **6%** from left and bottom, **58%** of width, **50%** of height | Where the platform draws live copy (FR-031b) — the region an operator must leave quiet |
| Max render width | **600 dp** | FR-015's "sensible maximum". Beyond it the banner is centred rather than grown, so a tablet does not get a 900 dp-tall promotional slab. A number, so T058's tablet check can pass or fail. |

**Where it lives**: `packages/design-system/src/banner-canvas.json` — JSON because the `.mjs` generators
must read it *and* TypeScript must import it, and neither can consume the other's native module format
(research R4). Emitted into the **existing** `EffyLayoutTokens.kt`, which the drift checker already
guards.

### ⚠ Why there is no "trim-safe" zone

FR-003 asks for "the region guaranteed visible at every width". Because the render box and the artwork
are **both** locked to 2:1 (research R2), the scale is uniform and **nothing is ever trimmed** — so a
trim-safe zone would be the entire canvas and would tell an operator nothing.

The safe area that genuinely matters is the **text zone** above: not "what might get cut off" but
"what the platform is going to draw over". That is the thing an operator needs to design around, and
FR-003 is satisfied by defining it.

---

## 2. Database — `public.promo_code` gains a placement

One forward-only Goose migration. **One column.** No new table.

| Column | Type | Null | Default | Purpose |
|---|---|---|---|---|
| `banner_placement` | `text` | NOT NULL | `'carousel'` | Where an advertised promotion appears. |

```sql
ALTER TABLE public.promo_code
    ADD COLUMN banner_placement text NOT NULL DEFAULT 'carousel'
        CHECK (banner_placement IN ('carousel', 'inline'));
```

**A text CHECK enum**, matching the house style set by 007/009/019/027 — no native PG enums, no
triggers.

**⚠ The default is a safety choice, not a coin toss** (FR-027a). An operator who marks a promotion
advertisable without thinking about placement gets it in the offers section, which is where a shopper
looks for offers. Defaulting to `inline` would scatter unconsidered promotions through the
merchandising, where they interrupt rather than answer.

`banner_position` (028) keeps its meaning and narrows it: **order within a placement**. For `carousel`
it is the swipe order; for `inline` it is still the section index.

### Unchanged, and worth restating

- **No redemption counter.** Exhaustion is still counted from `promo_redemption` at read time (027's
  rule, kept by 028). A banner disappearing when its promotion is used up remains automatic.
- **No separate banner lifetime.** A banner is live exactly while its promotion is.
- **`banner_image_key` still stores a KEY, never a URL** — a stored URL expires.

---

## 3. Wire contract

### `BannerDTO` (`storefront.ts`) — one added field

| Field | Type | New? | Notes |
|---|---|---|---|
| `key` · `title` · `subtitle` · `imageUrl` · `href` · `code` · `terms` · `target` · `position` | — | — | Unchanged from 028 |
| `placement` | `"carousel" \| "inline"` | **new** | Optional on the wire; absent means `carousel`, matching the column default so an un-migrated reader degrades to the safe case. |

### `PromoCodeDTO` (`promotion.ts`) — operator side

Gains `bannerPlacement`, plus the same field on the create and update requests. Presentation metadata,
so — like 028's advertising facet — it is **editable on a redeemed code** and MUST NOT be routed
through the FR-068 value-immutability transaction.

---

## 4. Artwork conformance — who guarantees what

| Layer | Does | Guarantees |
|---|---|---|
| **Console** | **Scale-only** normalisation of already-2:1 artwork to exactly 1200 × 600; non-2:1 input is refused with the template offered | The common path is correct, and no crop happens without the operator asking |
| **Presigned PUT** | Uploads bytes directly to S3 | *Nothing* — Lambda never sees them |
| **Admin service, on save** | Ranged GET of the first 64 KB + header parse; refuses non-conformant dimensions | **FR-004** — stored artwork conforms |

**⚠ Why the middle row is the whole problem.** Artwork goes straight to S3 through a signed URL, so a
client-side check is a convention a determined caller simply skips. FR-004 says stored artwork *must*
conform, and a "must" that holds only when the client cooperates is not one.

**⚠ Why a header parse and not an image library.** A ranged GET plus a small parser answers "what shape
is this?" without pulling `sharp` or any native binary into a Lambda — the same trade 024 made with its
stdlib ICO writer.

⚠ **WebP is not like the other two.** PNG and JPEG carry dimensions in their first few dozen bytes;
WebP is RIFF with three sub-formats (`VP8 `, `VP8L`, `VP8X`) encoding them three different ways. All
three are parsed, because `media.ts` already advertises WebP and refusing it only for banners is the
sort of inconsistency an operator discovers by being rejected.

⚠ **A valid image beyond the range.** A JPEG with a large EXIF block can push its SOF marker past
64 KB. The verifier **re-requests a larger prefix once (up to 1 MB)** before refusing, and then reports
that the file could not be read — never that its dimensions are wrong, which would blame an operator
for a legitimate image.

**The service refuses; it does not resize.** Silently changing an operator's artwork is exactly the
silent crop FR-008 forbids.

---

## 5. Mobile domain and presentation types

### `Banner` — one added field

```kotlin
data class Banner(
    // … 028 fields unchanged …
    val placement: BannerPlacement = BannerPlacement.CAROUSEL,
)

/** ⚠ An unknown wire value maps to CAROUSEL, not to a failure — a promotion must never vanish
 *  because a future placement was added server-side first (tolerant reader). */
enum class BannerPlacement { CAROUSEL, INLINE }
```

### `HomeBlock` — one added case

```kotlin
sealed interface HomeBlock {
    data class Categories(val items: List<CategoryShortcut>) : HomeBlock
    data class Section(val rail: Rail) : HomeBlock
    /** Inline banners at a point in the sequence (028). */
    data class Promo(val banners: List<Banner>) : HomeBlock
    /** The dedicated offers carousel (029) — one block, fixed position, bounded. */
    data class Offers(val banners: List<Banner>) : HomeBlock
}
```

`composeHome` splits banners by placement: `carousel` collect into a single `Offers` block placed
after the category row and before the first section; `inline` keep 028's position-interleaving into
`Promo`. **Both rules stay in the pure function**, so both stay unit-testable without a device.

**Bound**: `Offers` carries at most **6** banners, earliest order winning, and the drop is **logged**
(research R9) — a silent cap reads to an operator as "my promotion did not save".

---

## 6. State transitions

Unchanged from 028 — advertising is still the only transition, and every leftward move still happens
without an operator acting (expiry, exhaustion, disabling). 029 adds **where**, not **whether**:

```
  not advertised ──(operator marks advertisable)──► advertised
                                                      │
                                          placement ∈ { carousel, inline }
                                          (exclusive — never both, FR-027)
```

---

## 7. What this feature does NOT touch

- `public.category`, `public.product`, `public.order*` — untouched.
- Cart, checkout, `promo_redemption` — untouched. How a promotion is *applied* is unchanged.
- Auth, sessions, Cognito — untouched. Home is public.
- **`customer-web`** — reads `BannerDTO` with `placement` optional, so it keeps typechecking and keeps
  its current presentation. Its adoption remains its own slice.
- The banner **target vocabulary** — unchanged from 028's closed set.

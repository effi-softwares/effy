# Contract: Block Catalogue

**Feature**: `042-storefront-home-composer` · **Date**: 2026-08-09

The closed set of block types, their fields, and their presets. Defined **once** in `packages/shared-types` and consumed by three places — the composer's form, the cold-path validator, and the hot-path renderer. A block that saves fine and renders as nothing is the failure this single definition exists to prevent.

---

## Field kinds

Only these exist. ⚠ **There is no colour kind, no size kind, no spacing kind, and no rich text.** That is not a gap — it is what makes `check-tokens` a complete guarantee rather than one with a database-shaped hole (FR-007).

⚠ **This list is asserted by a test**, because FR-007 is a *negative* requirement: it holds only while the vocabulary stays exactly these eight. A ninth kind added later would silently defeat the design-system guard, and nothing else would notice.

⚠ **Every `maxLength` below is enforced server-side** by `layout_field_too_long`. A limit that lives only in the composer's input is not a limit — FR-032.

| Kind | Notes |
|---|---|
| `text` | Single line. Carries a `maxLength`; the composer shows the count. |
| `longText` | A short paragraph. Plain text only — no markup, no toolbar. |
| `enum` | A fixed set of `{value, label}`. **Every choice in the catalogue is an enum**, never a free string. |
| `boolean` | |
| `reference` | An id plus its kind (`rail` \| `category` \| `product` \| `promotion`). Resolved at render, validated at publish. |
| `destination` | The existing closed `BannerTarget` vocabulary, **narrowed to `search \| sale \| category \| product`**. Never a free URL. ⚠ The `promotion` kind is **removed**: this feature deletes the promotion-detail page, so keeping the kind would let an operator author a tile pointing at a dead route — precisely the defect 029 fixed and this feature claims to remove. |
| `artwork` | A storage key + a required `altText` + an explicit `decorative` flag, bound to a named canvas. |
| `list` | A bounded array of a sub-shape (used only by `offers.tiles` and `value_strip.items`). |

---

## The catalogue — reconciled against the real page (T008a, 2026-08-09)

⚠ **The inventory changed this list.** The plan assumed seven types drawn from `HomeSection`; the page does not match that assumption. What is actually rendered:

| Renders today | Where | Server/client | Disposition |
|---|---|---|---|
| `JsonLd` | page JSX | server | **Not a block** — structured data, no operator content |
| `<h1 class="sr-only">` | page JSX | server | **Not a block** — the page's single heading, must survive (FR-040) |
| `Hero` | page JSX, **commented out** | server | → `hero` ⚠ see the two-hero problem below |
| `PromoHero` | page JSX, inside Suspense | server | → folded into `hero` / `offers`; see below |
| `CategoryStrip` | `HomeSection.categories` | server | → `category_strip` |
| `ProductRail` | `HomeSection.rail` | server | → `product_rail` |
| `OffersPanels` | `HomeSection.offers` | server | → `offers` |
| `AppPromo` | page JSX | server | → `app_promo` |
| `NewsletterForm` | page JSX | **client** | → `newsletter` (see client-island note) |
| `RecentlyViewedRail` | page JSX | **client** | → `recently_viewed` — ⚠ was missing from the plan entirely |
| `ValueStrip` | **nowhere** | server | ⚠ imported by `Hero.tsx` and never rendered |
| `<hr>` between rails | `HomeContent` | server | **Not a block** — rendering rhythm, not content |

### Three corrections the inventory forced

⚠ **1. `HomeSection` has THREE kinds, not seven.** `hero`, `value_strip`, `app_promo` and `newsletter` were never sections — they are page-level JSX outside the composed sequence. The block system therefore *absorbs* page-level JSX as well as replacing `composeSections()`, which is more work than "make the array data", and the plan understated it.

⚠ **2. `RecentlyViewedRail` is on the page and was absent from the catalogue** — and it is a **client island** reading `localStorage`. It cannot be a server-rendered block like the others. Two honest options: model it as a block whose *position* is authorable while its content stays client-resolved, or declare it explicitly outside the layout and leave it as page JSX. **Decision: model it as `recently_viewed` with position-only authoring** — otherwise an operator can reorder the page and this one section inexplicably will not move.

⚠ **3. `ValueStrip` renders nowhere.** It is an unused import in `Hero.tsx`; the component and its recorded Principle V colour exception (039 FR-005a) are live code reachable from nothing. It is **not** nested inside the hero — the earlier note to that effect was stale, so **T008b's "split it out of Hero" is unnecessary**. The real question is whether it returns at all. **Decision: include `value_strip` in the catalogue** so the operator can bring it back deliberately; if they never do, it is one unused block type rather than one orphaned component.

### ⚠ The two-hero problem, which no artifact had named

`Hero` (static, six local artworks, hardcoded copy) is **commented out**, and `PromoHero` (promotions-driven, streamed) is live. They were built to be compared and the comparison was never concluded. A `hero` block type cannot be specified until one wins:

- **If `Hero` wins** — `hero` carries copy + artwork + CTAs, and `PromoHero` is deleted. The offers bento becomes the only promotions surface.
- **If `PromoHero` wins** — the `hero` block is promotions-driven and its content is *not* operator-authored copy at all, which changes its field schema entirely.

**This is an operator decision and it blocks the `hero` block's schema.** It is recorded as **T008c** rather than guessed. Everything else in the catalogue can proceed without it.

---

## Field schemas

Field names below are the contract's intent, not their final serialisation.

### `hero`

| Field | Kind | Required | Notes |
|---|---|---|---|
| `eyebrow` | `text` | no | Small line above the headline |
| `headline` | `text` | **yes** | ≤ 60 chars |
| `supporting` | `longText` | no | ≤ 160 chars |
| `cta` | `destination` + `text` label | no | |
| `secondaryCta` | `destination` + `text` label | no | |
| `artwork` | `artwork` (canvas `hero`) | **yes** | |
| `variant` | `enum` — `panel` | **yes** | One value. See legibility below. |

⚠ Replaces the hardcoded copy in `Hero.tsx`. That component keeps its rendering; its *content* moves into props.

### `category_strip`

| Field | Kind | Required |
|---|---|---|
| `title` | `text` | **yes** |
| `viewAllLabel` | `text` | no |

Resolves stocked categories at render. ⚠ Only categories with `productCount > 0` appear — a shortcut to an empty category opens a listing with nothing in it, which is worse than the shortcut being absent.

### `product_rail`

| Field | Kind | Required | Notes |
|---|---|---|---|
| `railKey` | `reference` (rail) | **yes** | e.g. `on_sale`, `featured`, `category:pantry` |
| `title` | `text` | no | Overrides the rail's server-supplied title |

**Self-hiding**: a rail whose source returns zero products renders nothing (FR/SC-013) — never a heading above blank space.

### `offers` — the bento

| Field | Kind | Required | Notes |
|---|---|---|---|
| `title` | `text` | no | |
| `tiles` | `list` of **offer tile**, 1–6 | **yes** | |

**Composition degrades, it does not pad** (FR-029): five tiles give the full bento; fewer give a coherent smaller arrangement; zero tiles renders **nothing at all**. There is deliberately no placeholder tile — an empty frame in a promotional block reads as a broken advert, and a shopper cannot tell it from one that failed to load.

#### Offer tile

| Field | Kind | Required | Notes |
|---|---|---|---|
| `size` | `enum` — `large` \| `wide` \| `small` \| `tall` | **yes** | Authored, **not** inferred from position (FR-025) |
| `variant` | `enum` — `panel` | **yes** | One value |
| `eyebrow` | `text` | no | ≤ 40 |
| `headline` | `text` | **yes** | ≤ 60 |
| `supporting` | `longText` | no | ≤ 120 |
| `cta` | `destination` + `text` label + `enum` style (`button` \| `link`) | **yes** | |
| `artwork` | `artwork` (canvas per `size`) | **yes** | |
| `promoCodeId` | `reference` (promotion) | no | ANDs the promotion's live window onto the tile's |

---

### `value_strip`

| Field | Kind | Required |
|---|---|---|
| `items` | `list` of `{headline: text, supporting: longText}`, 1–3 | **yes** |

⚠ **Its panel colours are NOT authorable.** They are a recorded Principle V exception (039 FR-005a) held as component-local constants that deliberately never became design tokens — `tokens:check` passing unchanged is the mechanical proof they did not enter the design system. Exposing them as fields would undo that.

### `app_promo`

| Field | Kind | Required |
|---|---|---|
| `headline` | `text` | **yes** |
| `supporting` | `longText` | no |

### `newsletter`

| Field | Kind | Required |
|---|---|---|
| `headline` | `text` | **yes** |
| `supporting` | `longText` | no |

---

## Legibility: copy never sits on the artwork

⚠ **There is no overlay variant.** Copy sits on a solid, token-coloured panel beside or below the artwork, so its contrast is a property of the design system and not of an operator's photograph.

| | Result |
|---|---|
| Contrast risk | **none** — copy is never over a photograph |
| Publish validation needed | **none** — nothing to measure |
| Industry prevalence | copy-outside-image is **ranked first** across the retailers surveyed; scrim is **ranked last** |

Two reasons, and the second is the load-bearing one:

1. This storefront's own history — several scrim, ellipse and text-shadow approaches were built and discarded before the research existed.
2. ⚠ Validating text over a photograph requires **decoding its pixels**, and this platform deliberately has no decoder (`image-dimensions.ts` is a dependency-free header reader written to avoid `sharp`). Placing copy beside the artwork does not defer that problem — it removes it.

**If overlay is ever wanted**, it needs a decoder *and* the rule that the legibility treatment derives from **the artwork's own luminance, never the viewer's appearance preference** — what Walmart and Uber Eats both encode as an `isBackgroundDark` flag, and the same conclusion 029's scrim fix reached here: *the artwork is the same picture in both appearances, so the thing making type legible over it cannot be the thing that inverts.*

---

## Presets

Every type ships **at least one preset** — a block pre-filled with representative content (FR-003). Never a blank shell.

This is the highest-leverage feature in the taxonomy for a single operator, and the most commonly skipped: a preset turns a layout decision into one click, whereas blank blocks turn every publish into a design session. Shopify's `presets` do exactly this, and Salesforce calls prepopulated regions "a best practice".

---

## Rendering rules that are not fields

Derived by the renderer, deliberately **not** authorable:

| Rule | Why not a field |
|---|---|
| **Image loading priority** — first image eager + `fetchpriority="high"`, all others lazy | It is a question about rendering, not merchandising, and the answer is always "the first one". ⚠ This storefront currently has the inverse defect: three below-the-fold banners preloaded while the hero is not. Deriving it closes that by construction. |
| **Heading levels** — page keeps exactly one `h1`; every block heads at `h2` | FR-040/SC-010. An operator cannot produce an invalid document outline. |
| **Section spacing and rhythm** | Design-system decision; one definition, not per-block. |
| **Empty-state behaviour** | A block with nothing to show renders nothing. Not a toggle. |

---

## Evolution

The catalogue is **closed**: adding a type is a code change plus a contract change, reviewed together.

Because only **two** layout bodies exist (draft and published) and no history, a field change touches at most two rows and is reachable by one forward migration. ⚠ That property is why version history was excluded, and adding history later re-opens the hardest problem in block systems — see research R3 before doing so.

**Unknown or outdated shapes are tolerated on read and omitted, never fatal** (FR-042), and every omission is counted so a page quietly losing a section is visible in metrics rather than invisible.

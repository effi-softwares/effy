# Phase 1 Data Model: Storefront Home Composer

**Feature**: `specs/042-storefront-home-composer` · **Date**: 2026-08-09

---

## 1. `public.home_layout` — the new table

A **schema-enforced singleton**, following the pattern `public.order_policy` already established on this platform: one row, guaranteed by the primary key rather than by convention.

```sql
CREATE TABLE public.home_layout (
    singleton      boolean PRIMARY KEY DEFAULT true CHECK (singleton),

    -- The two bodies. See §4 for why there are exactly two.
    draft          jsonb   NOT NULL DEFAULT '[]'::jsonb,
    published      jsonb   NOT NULL DEFAULT '[]'::jsonb,

    -- Optimistic concurrency (FR-017). Bumped on every write to either body.
    revision       bigint  NOT NULL DEFAULT 0,

    published_at   timestamptz NULL,
    published_by   text        NULL,   -- admin.staff cognito sub
    updated_at     timestamptz NOT NULL DEFAULT now(),
    updated_by     text        NULL
);
```

**Why a singleton and not a row per page**: the spec bounds scope to the storefront home. A `page_key` column would be speculative generality for a page that does not exist. Adding one later is a forward migration with a default, not a redesign.

⚠ **`published` defaults to `'[]'`, not to the current hardcoded sequence.** An empty published layout renders the coherent minimal page FR/SC-013 requires. The initial content is **seeded by the migration** as an explicit representation of today's page, so the storefront does not change appearance on deploy — see §6.

**No index beyond the primary key.** The table has one row; the read is a primary-key lookup.

---

## 2. The layout body

Both `draft` and `published` hold the same shape: a **flat, ordered array** of blocks.

```jsonc
[
  { "id": "b_01J…", "type": "hero",           "hidden": false, "props": { … } },
  { "id": "b_02K…", "type": "category_strip", "hidden": false, "props": { … } },
  { "id": "b_03M…", "type": "offers",         "hidden": true,  "props": { … } }
]
```

| Field | Rule |
|---|---|
| `id` | Stable, unique within the layout. Generated at insert, **never reused**, never derived from position — it is what lets a reorder be a reorder rather than a delete-plus-create, and what keeps React keys and audit references stable. |
| `type` | A member of the closed catalogue (§3). Unknown types are **omitted at render, never fatal** (FR-042). |
| `hidden` | `true` keeps the block and its content but renders nothing (FR-005). Distinct from removal. |
| `props` | Shape defined by `type`. Validated on write against the schema; **tolerated on read** — a prop the renderer does not recognise is ignored, and a missing required prop omits the block rather than crashing the page. |

**Ordering is array order.** There is no `position` integer. ⚠ This is deliberate: `banner_position` exists today, is authored, stored, transmitted — and **ignored by the web surface**, which slices by array index after filtering. A single ordering mechanism cannot disagree with itself.

**Bounds**: at most **20** blocks per layout (FR-009), and at most **6** tiles per offers block. Both enforced server-side.

---

## 3. Block catalogue

Seven types, derived from what the storefront already renders. Full field schemas in [`contracts/block-catalogue.contract.md`](./contracts/block-catalogue.contract.md); summarised here.

| `type` | Renders today as | Key props | References |
|---|---|---|---|
| `hero` | `Hero.tsx` (hardcoded) | `eyebrow?`, `headline`, `supporting?`, `cta{label,destination}`, `artworkKey`, `altText`, `variant` | — |
| `category_strip` | `CategoryStrip.tsx` | `title`, `viewAllLabel?` | resolves stocked categories at render |
| `product_rail` | `ProductRail.tsx` | `railKey`, `title?` (override) | `railKey` → hot-path rail |
| `offers` | `OffersPanels.tsx` → **new bento** | `title?`, `tiles[]` (≤6) | each tile may reference a promotion |
| `value_strip` | `ValueStrip.tsx` | `items[]` of `{headline, supporting}` | — |
| `app_promo` | `AppPromo.tsx` | `headline`, `supporting?` | — |
| `newsletter` | `NewsletterForm.tsx` | `headline`, `supporting?` | — |

⚠ **This list is confirmed during tasks against what the page actually renders**, not taken as final here. The spec says "roughly seven" for exactly this reason. `value_strip` in particular carries a recorded Principle V colour exception (039 FR-005a) whose constants are component-local and **must not** become authorable fields.

### The offer tile

⚠ **Normative definition lives in [`contracts/block-catalogue.contract.md`](./contracts/block-catalogue.contract.md) — not here.** The shape below is illustrative only; where the two differ, the contract wins. Three copies of one shape is the Principle II failure this feature exists to remove, and an earlier draft of these artifacts had exactly that.

The field list derives from the retailer survey — Walmart and Uber Eats converged on nearly the same shape independently, in different verticals:

```jsonc
{
  "id": "t_01J…",
  "size": "large" | "wide" | "small" | "tall",
  "variant": "panel",
  "eyebrow": "Easier back-to-school routines",      // optional
  "headline": "Save time with Rx delivery",         // required
  "supporting": "…",                                // optional
  "cta": { "label": "Learn more", "destination": { … } },
  "artworkKey": "tiles/<id>/<uuid>.webp",
  "altText": "…",                                   // required unless decorative:true
  "decorative": false,
  "promoCodeId": "uuid | null"                      // optional; ANDs the promotion's window
}
```

**`variant` has exactly one value, and that is the legibility decision** (research R4, amended). `panel` places copy on a solid adjacent panel — no text over photography, so no contrast risk at all. ⚠ The field exists as an enum rather than being omitted so a future `overlay` is an additive change; it is **not** shipped, because a value that can never be published is worse than no value.

**`destination`** reuses the existing closed `BannerTarget` vocabulary rather than a free URL, **narrowed to `search | sale | category | product`**. ⚠ Four of its five kinds are **dead on the wire today** — the server emits only `promotion`, the one kind this feature removes along with the page it pointed at. Keeping it would let an operator author a tile aimed at a deleted route, which is the defect 029 fixed. This feature makes the other four real.

---

## 4. State: draft, published, revert

There are **two bodies and no history**. Research R3 records why: it collapses schema evolution across revisions — the hardest problem in block systems — to at most two rows.

```
                    ┌──────────────── revert ─────────────────┐
                    ▼                                          │
  edit ──▶ [ draft ] ──── publish (validate) ────▶ [ published ]
              ▲   │                                      │
              └───┘                                      ▼
         (draft is the only editable body)      served to shoppers
```

| Transition | Effect |
|---|---|
| **edit** | Writes `draft` only. `published` untouched — shoppers never see an in-progress edit (FR-012). |
| **publish** | Validates `draft` (§5). On success, copies `draft` → `published`, sets `published_at`/`published_by`, writes an audit row **in the same transaction**. On refusal, **nothing is written** (FR-036). |
| **revert** | Copies `published` → `draft`. One action, no history required (FR-014). |

**Concurrency (FR-017)**: every write carries the `revision` the client last read; the update is `WHERE revision = $n` and bumps it. A stale write affects zero rows and returns a distinguishable conflict, so a second operator's publish cannot silently discard the first's work.

**Audit (FR-015)**: publish and revert write `admin.audit_log` inside the same transaction as the layout change — the existing platform pattern, not a new mechanism.

---

## 5. Validation, and where each rule lives

FR-032 is the governing rule: **every refusal must hold outside the editor form.** Client-side checks are advisory duplicates for fast feedback.

| Rule | Enforced by | Refusal code |
|---|---|---|
| Unknown block type / malformed body | cold-path validator, schema-driven | `layout_block_unknown` |
| Missing required prop | cold-path validator | `layout_field_required` |
| Enumerated field out of range | cold-path validator + DB CHECK where cheap | `layout_field_invalid` |
| Block count > 20, tiles > 6 | cold-path validator | `layout_too_many_blocks` |
| Artwork wrong shape / oversize | **existing** `readObjectPrefix` + `image-dimensions.ts`, per-canvas | `layout_artwork_wrong_size` |
| Artwork missing where required | cold-path validator | `layout_artwork_required` |
| Alt text absent and `decorative !== true` | cold-path validator | `layout_alt_text_required` |
| Reference (rail / category / promotion) missing or inactive | cold-path validator, querying the live tables | `layout_reference_missing` |
| Heading order invalid across the assembled page | cold-path validator, computed from the block sequence | `layout_heading_order` |
| A copy field longer than its stated limit | cold-path validator | `layout_field_too_long` |

⚠ **There is deliberately no contrast rule here, and that is the decision rather than an omission.** Validating text over a photograph needs a **pixel decoder**, and this platform intentionally has none — `image-dimensions.ts` is a dependency-free *header* reader written to avoid `sharp`. Because copy never sits over artwork (R4), the rule is not deferred, it is **not needed**. Reintroducing overlay means reintroducing the decoder question with it.

⚠ **The seeded published layout must satisfy this validator too.** It is written by SQL and therefore bypasses the service — so a task asserts the seed passes `validate.ts` rather than assuming it does.

---

## 6. Artwork canvases

The single locked canvas becomes a **keyed set**. One definition per tile shape; nothing else states these numbers.

```jsonc
// packages/shared-types/src/artwork-canvases.json
{
  "hero":        { "width": 2400, "height": 1200, "aspectRatio": 2,    "maxBytes": … },
  "tile-large":  { "width": 1200, "height": 1200, "aspectRatio": 1,    "maxBytes": … },
  "tile-wide":   { "width": 1600, "height":  900, "aspectRatio": 1.78, "maxBytes": … },
  "tile-tall":   { "width":  900, "height": 1600, "aspectRatio": 0.56, "maxBytes": … },
  "tile-small":  { "width": 1000, "height": 1000, "aspectRatio": 1,    "maxBytes": … }
}
```

⚠ **Dimensions are PROVISIONAL until the bento is built.** They are confirmed against the rendered grid at each breakpoint, and artwork uploaded against provisional values would be refused or mis-shaped once they change — so the confirmation is an owned task, sequenced before any artwork is attached, not a note. What is *decided* here is the structure: a keyed set, one source of truth, with the existing generate-and-check guards (`check-banner-canvas.mjs`, `check-banner-template.mjs`, the Compose theme generator) extended from one canvas to N.

**The rule the current implementation breaks**: every accepted artwork shape must equal the shape it renders in (FR-035). ⚠ customer-web **never imported the canvas at all** — it hardcodes `aspect-[2/1]` in three places and a test *pins* the violation. Adopting the canvas set on the web surface is part of this feature, not a follow-up.

---

## 7. Removals — one forward-only migration

⚠ **A SECOND, SEPARATE MIGRATION** — `<ts>_drop_promo_advertising.sql`. It must not be folded into the migration that creates `home_layout`: that one is committed and applied in Phase 2, and Goose is **forward-only** with a commit-guard, so editing it afterwards is not a thing that can happen. This migration lands in Phase 7, after the advertised promotions have been carried forward.

```sql
DROP INDEX IF EXISTS public.promo_code_advertised_idx;
ALTER TABLE public.promo_code DROP CONSTRAINT IF EXISTS promo_code_banner_copy_chk;
ALTER TABLE public.promo_code
    DROP COLUMN is_advertised,
    DROP COLUMN banner_title,
    DROP COLUMN banner_subtitle,
    DROP COLUMN banner_image_key,
    DROP COLUMN banner_position,
    DROP COLUMN banner_placement;
```

**Verified safe**: the cart and checkout Go packages contain **zero** references to `banner` or `is_advertised`. Discount, cart and checkout behaviour is untouched, and SC-014 proves it by those suites passing unmodified.

⚠ **Two ordering landmines** for the tasks phase:

1. **The four currently-advertised promotions must be carried forward before the columns are dropped**, or their creative is lost (FR-046 requires the disposition be recorded either way — migrated or deliberately not).
2. **`Hero` is currently commented out of `page.tsx`.** Deleting `PromoHero` without seeding the layout's hero block would leave the storefront with **no hero at all**. The seed in §1 and the removals here must land in the same change.

**Also removed** (research R6): the promotion-detail sub-feature — `GET /v1/storefront/promotions/:id`, `PromotionDTO`, `promotions/[id]/page.tsx`, `CopyCodeButton`, `PromotionScreen.kt`, `PromotionViewModel.kt` and their tests, ~800 lines across three surfaces. FR-045 requires any address a shopper holds to still resolve without error.

⚠ **Mobile wire compatibility**: `StorefrontHomeDTO.banners` must remain **present and empty** for at least one release rather than disappearing, so a `customer-mobile` build in the field degrades to "no banners" instead of failing to parse.

---

## 8. Entity summary

| Entity | Lives in | Notes |
|---|---|---|
| **Home layout** | `public.home_layout` (singleton) | Two bodies, a revision counter, publish metadata |
| **Block** | An element of a layout body | `id`, `type`, `hidden`, `props` |
| **Block type** | `packages/shared-types` | Closed catalogue; fields, requiredness, enums, presets |
| **Offer tile** | `props.tiles[]` of an `offers` block | Not a table — it has no identity outside its block |
| **Artwork canvas** | `artwork-canvases.json` | Keyed set; one definition, N shapes |
| **Reference** | Inside `props` | By id only — `railKey`, `categoryId`, `promoCodeId`, `productId` |
| **Audit row** | `admin.audit_log` (existing) | Written in the publishing transaction |

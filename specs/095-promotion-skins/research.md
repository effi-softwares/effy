# Research: Promotion Skins (095)

"Today" = the code after 094, read on 2026-10-21.

## What exists today

- **Groups** (`promotion_group`, `promotion_group_member`) say *where* a promotion is shown; nothing says *how*.
- **Shopper wire**: `ShopperPromotionDTO` (headline, supportingLine, label, code, terms, endsIn, target) returned by
  `GET /storefront/v1/promotion-groups` (public, cached 60 s) and `GET /commerce/v1/promotion-groups` (personal).
- **Looks are decided by the client**, per page:
  - website Home hero: `PromoHero` (blue panel slides + side cards);
  - Home between sections: `OffersPanels` / `OfferBannerCard`;
  - Offers page: `CodeOffer` (blue panel with code chip and Copy) when the promotion has a code, `OfferCard` (orange
    header card with "View offer") when it does not;
  - app: `HomeBlocks.kt` (`HomeBlock.Promo` / `Offers`) using the fixed `promoGround` / `promoBlue` colours.
- **Pictures**: no promotion picture exists since 094 removed the 028 banner-image presign route. The media bucket,
  the public CDN (`PUBLIC_MEDIA_PREFIXES` already includes `promotions`), the `media` rendition worker (reads
  `promotions/*`, writes WebP copies) and `renditionUrl` / `imageWidths` all already handle a `promotions/` key.
- **Presigned upload**: `presignUpload(prefix, id, contentType, size)` in `@effy/edge-shared` (028 T048a) — the shop
  product media route is its model.

## R1 — A skin is DATA: one layout id + a typed settings document

**Decision**: `promotion_skin(id, name, layout, settings jsonb, version)`. `layout` is one of a closed list
(`panel`, `header_card`, `full_picture`, `picture_beside`, `tile`, `strip`). `settings` is a document whose shape is
declared ONCE in `@effy/shared-types/promotion-skins.ts` (`SkinSettings`, a discriminated union by layout) with a
pure validator `validateSkin(layout, settings) → issues[]` used by back-office (as you type) and by the admin service
(authoritative, before writing). Unknown keys are refused; every value is a closed enum, a bounded number or a
`#rrggbb` colour.

**Rationale**: "full customisation" (clarified) without a free canvas; one shape both clients can draw identically
(SC-004). jsonb with one validator beats ~60 columns that change every time a layout gains a setting.

**Alternatives**: a column per setting (rejected: schema churn per layout); a free-form element tree (rejected in the
spec: no readable or identical rendering across phone, desktop and app).

## R2 — Readability is one pure function, enforced on the server

**Decision**: `skinContrast(layout, settings) → { pair, ratio, required, ok }[]` in shared-types: WCAG relative
luminance; 4.5:1 normal text, 3:1 large text (headline sizes `xl`/`2xl` are large). Pairs: label/headline/supporting
on background; button text on button fill (or on background for outline/link); chip text on chip fill or background.
**Text over a picture** (FR-010): the background used for the check is the tint blended over pure black AND over pure
white (`tint × alpha + base × (1 − alpha)`); both must pass. The admin service refuses a save with any failing pair
(422 `skin_unreadable`, `fields[]` naming the pair). Optional dark colours are checked as a second set.

**Rationale**: zero-exemption AA (constitution V) holds for content too; checking against both extremes guarantees the
result whatever picture is used, with no image analysis.

## R3 — Placement: member skin → group default (with / without code) → client default

**Decision**:
- `promotion_group` gains `size` (`large` | `medium` | `small` | `strip`), `default_skin_id` (NOT NULL) and
  `default_code_skin_id` (NULL = same as default). The second default reproduces today's Offers page, which draws a
  promotion with a code differently from one without (FR-025, "no shopper sees a change"). This refines FR-015; the
  spec is amended to say "a default skin, optionally a different one for promotions with a code".
- `promotion_group_member` gains `skin_id` (NULL = group default) and `image_id` (NULL = best fit, FR-016).
- Each layout declares the sizes it fits (`LAYOUT_FITS` in shared-types); the admin service refuses a skin whose
  layout does not fit the group's size (422 `skin_does_not_fit`), and a group size change that would strand members
  sets those members back to the default (they are listed in the response) — the edge case "space changed".
- Resolution happens in the group read's SQL (one query): `COALESCE(m.skin_id, CASE WHEN code THEN g.default_code_skin_id END, g.default_skin_id)`.

## R4 — The shopper wire carries the resolved skin, additively

**Decision**: `ShopperPromotionDTO` gains optional `skin?: ShopperSkinDTO`:
`{ id, version, layout, settings, picture?: { url, imageWidths?, alt, focusX, focusY, width, height } }`. Every 094
field is unchanged, so installed apps (they decode with `ignoreUnknownKeys = true`, `core/http/EffyHttpClient.kt`) keep drawing as today (FR-023). A client that does not know
`skin.layout` draws its built-in look. `home.banners` (094 compatibility) is untouched.

**Picture choice** (FR-016): member's `image_id` if it still exists; else the promotion's picture whose aspect ratio is
closest to the layout's preferred ratio (`LAYOUT_RATIO`), ties to lowest position; else none (the skin falls back to
its colour background and decorations).

## R5 — One web renderer, shared by the website and back-office's preview

**Decision**: a new package folder `packages/web-kit/src/promo-skin/` exporting `<PromoSkin promotion skin size />`
(React 19, no data fetching). Styling is inline from settings plus one stylesheet `promo-skin.css` for layout
geometry; it uses no Tailwind utilities, so it renders the same in back-office (console identity) and customer-web
(storefront identity). Back-office's skin editor and group preview render this exact component — what staff see is
what shoppers see.

**Rationale**: a second renderer in back-office would drift (the "two sources for one fact" defect class).

## R6 — The app renderer is pinned to shared fixtures

**Decision**: `PromoSkin.kt` in the customer app's kit (`core/presentation/`) draws the six layouts. Parity with the
web is held by `packages/shared-types/src/promotion-skins.fixtures.json` — for each layout, settings in and the derived
values out (text sizes in px/dp, paddings, radius, line limits, chosen button words, contrast results) — run by a
vitest in shared-types and a Kotlin host test, the pattern of `effy-windows.fixtures.json`.

Skin colours are drawn as given; `mobile-guard.sh`'s "no colour literal in a screen" still holds because colours come
from data, not source. Dark appearance: the skin's own dark colours when set, otherwise the light ones (spec US4-3).

## R7 — Pictures on promotions

**Decision**: `promotion_image(id, promotion_id, storage_key, width, height, alt, focus_x, focus_y, position)`.
Upload: `POST /admin/v1/promotions/{id}/images/uploads` → presigned PUT under `promotions/<promotionId>/<uuid>.<ext>`
(the shared `presignUpload`, ≤ 10 MB, jpeg/png/webp); `POST /admin/v1/promotions/{id}/images` records it after the
upload (the service HEADs the object, reads its pixel size from the first bytes, refuses < 640 px on the short side for
large layouts at use time — size is checked when a member chooses it, since a picture's use is not known at upload).
Max 10 per promotion, counted under the promotion row lock. The `media` worker already makes WebP copies for
`promotions/*`. Removal deletes the row (members' `image_id` → NULL via FK `ON DELETE SET NULL`); the object is left
(the bucket's lifecycle is unchanged; same as products).

## R8 — Starting skins reproduce today exactly

> **Revised at implementation (2026-10-21).** Today's looks choose colour and icons **by position** (hero green;
> side cards blue then purple; offers orange, rose, red in turn; menu slides orange, rose, red, purple), not by
> promotion — one skin per group cannot reproduce that. So the migration seeds a built-in **Classic** skin
> (layout `classic`, no settings, cannot be edited or removed) meaning *"draw this place exactly as before
> 095"*; every group defaults to it and the clients keep their existing drawing for it. The five designed skins
> below are seeded as **starting points staff can pick or duplicate**, not as group defaults. `classic` fits every
> size. `mega-nav` is seeded with today's `home-hero` then `home-between` members (the aisles menu reads
> `home.banners`, which is built from those two), so the menu is unchanged and staff now control it.

Original decision (kept for the starter skins):

**Decision**: the migration seeds:

| Skin | Layout | Used as default by |
|---|---|---|
| Hero — Effy blue | panel (large) | `home-hero` |
| Side — Effy blue | panel (medium) | `home-side` |
| Panel — Effy blue (code) | panel | `offers`, `home-between`, `cart` — *with a code* |
| Header card — Effy orange | header_card | `offers`, `home-between`, `cart` — *without a code* |
| Tile — Effy blue | tile | `mega-nav` (new, size small) |

Values (colours, label words, sizes, decorations) are read from today's components and tokens at implementation time
and written into the migration; each starting skin is checked by `skinContrast`. A visual comparison of Home, Offers
and the cart before/after is the SC-002 check.

## R9 — Changing a skin used in many places; concurrent edits

**Decision**: `version int` on the skin; an update carries `expectedVersion` → 409 `skin_changed` (FR-014). The editor
shows usage (`GET /admin/v1/promotion-skins/{id}` returns `usage: { groups[], placements, defaultOf[] }`) and asks
for confirmation naming the count (FR-012). Removal: FKs `ON DELETE RESTRICT` from member and group; the service
checks first and answers 409 `skin_in_use` with the usage (FR-013).

## R10 — History

**Decision**: `admin.audit_log` with `target_type = 'promotion_skin'` for skins; picture add/remove/edit and a
member's skin/picture choice write `target_type = 'promotion'` / `'promotion_group'` entries as 094 does (FR-026).

## R11 — Freshness and live updates

**Decision**: no new mechanism. Group reads are already ≤ 60 s fresh (FR-020); every skin/picture/member write
announces the existing ops kind `promotions` for back-office (071). Skins are not a new live kind (no alarm change).

## R12 — The aisles menu slot (`mega-nav`)

**Decision**: the migration creates `mega-nav` (size `small`, default "Tile — Effy blue"). customer-web's `AisleMenu`
reads it through the existing public group read (it is rendered for everyone, so personal promotions are not shown
there — the public read's rule) and shows the first member in a slot beside the aisle columns; empty → no slot.
`PROMOTION_GROUP_KEYS.megaNav` is added. The app does not read it.

## R13 — Constitution: skins are content, not chrome

**Finding**: Principle V says no fourth hue, and that colours come only from the design-system tokens. A skin is
staff-made marketing artwork with any colour (clarified), including a button inside it.

**Decision**: amend the constitution (v3.5.0 → **v3.6.0**, MINOR) with a bounded exception beside the Google-mark one:
*"Promotion skins (095) are content. Their colours are data chosen by staff, held to WCAG AA by `skinContrast` on the
server, and apply only inside the skin's own frame. They never style navigation, forms, the cart, checkout or any
control outside a promotion, and grant no licence to use their colours elsewhere."* Flat fills only still applies (a
tint is a flat fill); no gradients, no shadows.

## R14 — Gateways and routes

Staff gateway (admin), +10: skins list/create/read/update/delete/duplicate (6); promotion images upload-url / create /
update / delete (4). Group update and member put are extended (no new route). Shared gateway: 0.

## R15 — Analytics

`promotion_banner_tapped` (094) gains `skinId` and `layout` (FR-027). Back-office: `promotion_skin_saved`,
`promotion_image_added`. No PII.

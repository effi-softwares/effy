# Research: Information Banners (108)

## R1 - One table, a fifth kind, a shape CHECK

- **Decision**: `kind = 'banner'` in `public.promotion`. `trigger`, `value_type` and `applies_to` become nullable.
  The CHECK `promotion_banner_shape_ck` says:
  - **A banner** has NULL `trigger`, `value_type` and `applies_to`. It has no `percent_off`, `amount_off`,
    `max_discount_amount` or bxgy quantities. Its `audience` is `everyone`, `min_subtotal_amount` 0, no
    `min_quantity`, no `max_uses`, `max_uses_per_customer` or `budget_amount`, and `combinable` false.
  - **An offer** has all three columns NOT NULL.

  The existing CHECKs that compare those columns keep working: a CHECK passes on NULL. `promotion_applies_to_chk`
  is rewritten to ignore banners.
- **Rationale**: groups (`promotion_group_member.promotion_id`), pictures (`promotion_image`), skins, the state
  function, the activity log and both clients already work on `promotion`. NULL offer columns make any code that
  forgets the new kind fail loudly in types and in the CHECK, instead of quietly treating a banner as an automatic
  free-delivery offer.
- **Alternatives**:
  - A separate `information_banner` table: every group, picture and skin query would need a union, and members
    reference `promotion(id)`.
  - Sentinel values (`trigger='automatic'`, `value_type='free'`): a banner would match the engine's automatic query.
- **Rows in child tables**: codes, chosen customers, targets and uses for a banner are refused by the one admin
  writer. The engine never selects a banner (R3), so nothing can create a use. No trigger: the platform forbids
  aborting triggers.

## R2 - A banner stores where a tap goes

- **Decision**: three columns:
  - `link_kind` text, CHECK in `search`, `sale`, `category` or `product`;
  - `link_category_id` uuid, FK to `category` with ON DELETE SET NULL;
  - `link_product_id` uuid, FK to `product` with ON DELETE SET NULL.

  CHECK `promotion_link_ck`:
  - a banner has a `link_kind`;
  - `category` has a category id when written;
  - `product` has a product id when written;
  - an offer has no link.

  At read, the shopper target is built from the link. A category is sent by its key; that key must be active. A
  product must be active and approved. If either is gone, the target is `null`, so the tile can't be tapped and
  the back-office preview shows a warning.
- **Rationale**: an offer's target comes from its discount targets (`targetOf`). A banner has none.
- **Alternatives**: reuse `promotion_target`. The engine reads it as what a discount covers, and mixing meanings
  there is a trap.
- **Contract change**: `ShopperPromotionDTO.target` becomes `BannerTarget | null`. It is `null` only for a banner
  whose target has gone. Offers always carry one, as before.

## R3 - The engine never sees a banner

- **Decision**: `loadPromotions(..., automaticOnly)` adds `p.kind <> 'banner'`. Its `trigger = 'automatic'`
  condition already excludes NULL. `toCandidate` throws on a banner. `product-offer.ts` already filters
  `kind IN ('item','bxgy')`. `findCode` can't match a banner, because banners have no codes. The guard test asserts
  that `candidatesFor` and `toCandidate` never yield `kind === 'banner'`, and a container test runs a checkout with
  banners present (SC-002).

## R4 - Live values

- **Decision**: words hold tokens `{free_delivery_amount}` and `{order_minimum}`. One module,
  `@effy/edge-shared/promotions/live-values.ts`, owns:
  - the key list, from `LIVE_VALUE_KEYS` in shared-types;
  - parsing (`tokensIn`);
  - loading (`loadLiveValues`), through `loadActivePlan(db, 'effy')` for `freeOverCents` and the cart policy reader
    for the minimum;
  - filling, which returns the filled words, or the keys that had nothing to show.

  `candidates.ts` loads the values only when a banner in the read carries a token. `shopperPromotion` fills them.
  `hiddenBecause` gains the reason `live_value_missing`. Money is said like the terms composer says it: `$150`,
  `$20`, `$7.50`.
- **Rationale**: one place, filled at read, so a plan switch changes every banner at once (FR-010, SC-003). An empty
  value hides the banner (FR-011): a blank in a headline would be worse than no banner.
- **Validation**: the admin service refuses tokens in an offer's words (FR-013) and unknown token names (422 naming
  the field). Length limits count the words as typed.
- **Alternatives**:
  - Rich-text chips: client complexity for two values.
  - Computing the value at save: that is a typed copy, which is the defect FR-010 forbids.

## R5 - Words

- **Decision**: in `@effy/shared-types/promotions.ts`:
  - `PromotionKind` gains `"banner"`, and `OFFER_KINDS` lists the four offer kinds;
  - `PROMOTION_KIND_WORDS` includes `banner: "Information banner"`;
  - `LIVE_VALUE_KEYS` and `LIVE_VALUE_WORDS`: "Free-delivery amount" and "Order minimum";
  - `BannerLinkKind`, `BANNER_LINK_WORDS`.

  `terms.ts`: `termsOf(banner) = null`, `givesOf(banner) = "No offer"`, and `offerLabelOf` is never called for one.
  The headline is required for every banner, not only one in a group.

## R6 - Admin service

- **Decision**:
  - `parseWrite` branches on kind. For a banner it accepts name, words, link, schedule and groups, and refuses
    every offer field: `not_for_banner`, named per field.
  - `kind` stays fixed after create (`FROZEN` already lists it, and it is checked even when unused: FR-006).
  - Codes, chosen customers and performance answer 409 `not_an_offer` for a banner.
  - A new route `GET /admin/v1/promotions/live-values` answers
    `[{ key, name, reads: "$150" | null, why: string | null }]` (staff gateway +1).
  - The list filter `kind` accepts `banner`.
  - The detail DTO gains `link` (kind, category {id, name}, product {id, name}, `broken`).
  - The group preview's hidden reasons gain `live_value_missing`.

## R7 - Back-office

- **Decision**:
  - **Editor**: `BannerEditorScreen` at `/promotions/banners/new`. The edit route renders it when the promotion
    is a banner. Panels:
    - **Basics**: the internal name.
    - **What shoppers read**: headline, supporting line, label, each with an "Insert live value" menu that shows
      what each value reads now. Typing "free delivery" with a `$` amount shows a hint.
    - **Where a tap leads**: Search, Sale, an aisle (category picker) or a product (product search).
    - **When**: as for offers.
    - **Where it's shown**: groups.

    Pictures are added on the detail page, as for offers.
  - **List**: a **New information banner** action beside Create promotion. The kind filter gains "Information
    banner". "Gives" shows "No offer".
  - **Detail page**: hides Performance, Codes and Chosen customers for a banner. It shows "Where a tap leads",
    with a warning when the target is gone.
  - **Tours**:
    - a new tour `banner-editor` ("Creating or editing an information banner");
    - the Promotions tour gets a step for the new action, with its version raised to 2;
    - both are added word for word to spec 107's inventory, which grows from 51 to 52 tours.

## R8 - Customer clients

- **customer-web**: `toGroupBanner` sets `href: null` for a banner, so a tap uses `target`, and no
  `/promotions/{id}` link. `storefront` `promotion(id)` answers 404 for a banner.
- **customer app**: regenerate the commerce contract with `pnpm --filter @effy/shared-types commerce-contract:gen`.
  `PromotionKind.Banner` appears and `target` becomes optional. The mapper treats a null target as non-tappable.
  The offer page is never opened for a banner.
- **Both**: code, terms and endsIn are already null-safe. `endsIn` is null for a banner (FR-016: no countdown).

## R9 - Dev seed

- **Decision**: `db/seeds/108_banners_dev.sql`:
  - four banners with fixed ids `55555555-0000-0000-0000-00000000000{1..4}`, published, with no dates;
  - placed in `home-hero` (range, delivery promise) and `home-side` (free delivery with `{free_delivery_amount}`,
    local shops);
  - each on a designed skin that fits the group size (the Panel and Tile Effy-blue skins from 095);
  - with targets: Search, Sale, the Home & Kitchen aisle and the Fruit & Vegetables aisle (by category key).

  Re-runnable: it deletes its own four ids first. `make seed-banners ENV=dev` refuses another ENV. If the catalogue
  seed hasn't run, an aisle target falls back to Search, with a NOTICE.

## R10 - Analytics

- **Decision**: no new events. The existing promotion tile events carry the promotion id. A banner is
  distinguishable by id in reports. Adding a `kind` property is out of scope, because the event taxonomy is shared
  and versioned.

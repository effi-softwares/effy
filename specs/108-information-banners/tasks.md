# Tasks: Information Banners (108)

**Input**: specs/108-information-banners/ (spec, plan, research, data-model, contracts, quickstart)

**Tests**: included where the spec's guarantees are mechanical: SC-002 never money, FR-010/011 live values, FR-008
shape, and 107's tours word for word.

## Phase 1: Setup

- [X] T001 Write migration `db/migrations/20261106090000_information_banners.sql`:
  - add kind `banner`;
  - drop NOT NULL on `trigger`, `value_type` and `applies_to`;
  - add `link_kind`, `link_category_id` (FK category, ON DELETE SET NULL) and `link_product_id` (FK product, ON DELETE
    SET NULL);
  - add `promotion_banner_shape_ck` and `promotion_link_ck`;
  - rewrite `promotion_applies_to_chk` (R1, R2, data-model).
- [X] T002 [P] Add to `packages/shared-types/src/promotions.ts`:
  - `"banner"` in `PromotionKind`, plus `OFFER_KINDS`, `PROMOTION_KIND_WORDS`, `BannerLinkKind`,
    `BANNER_LINK_WORDS`, `LIVE_VALUE_KEYS`, `LIVE_VALUE_WORDS` and `LiveValueDTO`;
  - nullable `trigger`, `valueType` and `appliesTo` on the admin DTOs;
  - `link` on the admin detail and write DTOs;
  - `target: BannerTarget | null` on `ShopperPromotionDTO`;
  - `live_value_missing` in the preview `why`.

## Phase 2: Foundational (blocks every story)

- [X] T003 Create `apis/edge-api/shared/src/promotions/live-values.ts`: the token pattern, `tokensIn`,
  `unknownTokens`, `loadLiveValues(db)` (active Effy plan via `loadActivePlan`, plus the order minimum) and
  `fillWords(words, values)`. Export it from `apis/edge-api/shared/src/promotions/index.ts`.
- [X] T004 Update `apis/edge-api/shared/src/promotions/terms.ts` for the banner kind: no terms, "No offer", and
  `offerLabelOf` guarded.
- [X] T005 Update `apis/edge-api/shared/src/promotions/candidates.ts`:
  - select the link columns, and each link's category key/active and product active;
  - make `PromotionRecord` carry `kind`, `link` and `liveTokens`;
  - `automaticOnly` excludes banners, and `toCandidate` throws on a banner;
  - `targetOf` uses the link;
  - `shopperPromotion`/`placedPromotion` fill live values;
  - `hiddenBecause` returns `live_value_missing`;
  - `groupPromotions` loads live values only when needed.
- [X] T006 [P] Add to `apis/edge-api/shared/src/promotions/promotions.guard.test.ts`: no banner reaches the engine,
  and live-value tokens are only parsed in `live-values.ts`.
- [X] T007 [P] Add unit tests `apis/edge-api/shared/src/promotions/live-values.test.ts` (parse, fill, missing,
  money format) and banner cases to `terms.test.ts`.

## Phase 3: User Story 1: Staff publish a banner that is not an offer (P1) 🎯 MVP

**Goal**: a banner created in back-office shows on the website and app Home and never touches money.

**Independent test**: quickstart walk 1, 2 and 5.

- [X] T008 [US1] Update `apis/edge-api/admin/src/promotions/promotion-service.ts` `parseWrite`:
  - a banner branch: words, link, schedule and groups, with offer fields refused per field and the headline
    required;
  - `kind` fixed on PATCH (409 `kind_fixed`);
  - tokens refused in an offer's words, and unknown tokens refused;
  - `toDetailDTO` and the list map banners (`gives` "No offer").
- [X] T009 [US1] Update `apis/edge-api/admin/src/promotions/promotion-repository.ts`: write and read the link
  columns, add `link` to the detail extras (names, broken), and let the list's kind filter accept `banner`.
- [X] T010 [P] [US1] Update `apis/edge-api/admin/src/promotions/list.ts`: add `banner` to the kind filter.
- [X] T011 [P] [US1] Update `apis/edge-api/admin/src/promotions/promotion-extras.ts`: codes, customers and
  performance answer 409 `not_an_offer` for a banner.
- [X] T012 [P] [US1] Update `apis/edge-api/storefront/src/promotions/service.ts`: `promotion(id)` answers null (404)
  for a banner.
- [X] T013 [P] [US1] Update `apps/customer-web/app/(shop)/promotion-groups.ts`: for a banner, `href` is null and there
  is no offer-page link. Check the components that use `href` / `target`.
- [X] T014 [US1] Regenerate the commerce contract (`pnpm --filter @effy/shared-types commerce-contract:gen`), then
  update `apps/customer-mobile/.../catalog/data/CatalogMappers.kt` for an optional target.
- [X] T015 [US1] Add back-office model and draft: `apps/back-office/src/features/promotions/model.ts`,
  `bannerDraft.ts` (draft ↔ body), and the `KIND_LABEL` / `KINDS_OFFERED` updates in `promotionDraft.ts`.
- [X] T016 [US1] Add `apps/back-office/src/features/promotions/components/LinkPicker.tsx`: Search, Sale, Aisle (leaf
  or any category, from the taxonomy) and Product (search).
- [X] T017 [US1] Add `apps/back-office/src/features/promotions/BannerEditorScreen.tsx`: Basics, What shoppers read,
  Where a tap leads, When, Where it's shown, a preview, save/publish, `useTourPage("banner-editor")` and the
  `data-tour` keys.
- [X] T018 [US1] Update `apps/back-office/src/routes/promotions.tsx`: add `/promotions/banners/new`, and make the edit
  route render `BannerEditorScreen` for a banner.
- [X] T019 [US1] Update `apps/back-office/src/features/promotions/PromotionsListScreen.tsx`: the New information
  banner action and "Information banner" in the kind filter.
- [X] T020 [US1] Update `apps/back-office/src/features/promotions/PromotionDetailScreen.tsx` and
  `components/PromotionSummary.tsx`: for a banner, hide Performance, Codes and Chosen customers, and show Where a
  tap leads (with a broken warning).
- [X] T021 [US1] Add a container test in `apis/edge-api/shared/src/promotions/banners.container.test.ts`: a checkout
  with banners present prices the same as without them (SC-002), the shape CHECK refuses a banner with a discount
  (FR-008), and a group read shows a banner with no code or terms.

## Phase 4: User Story 2: Live values (P2)

**Goal**: `{free_delivery_amount}` and `{order_minimum}` filled from settings, and a banner hidden when a value is
empty.

**Independent test**: quickstart walk 3 and 4.

- [X] T022 [US2] Add `apis/edge-api/admin/src/functions/promotions-live-values-v1-get.ts` plus its route in
  `apis/edge-api/admin/serverless.promotions.yml` (`GET /admin/v1/promotions/live-values`), answered through
  `loadLiveValues`.
- [X] T023 [US2] Update `apis/edge-api/admin/src/promotion-groups/repository.ts`: load live values for the preview and
  the detail members, and show the hidden `live_value_missing` reason.
- [X] T024 [P] [US2] Add `apps/back-office/src/features/promotions/components/LiveValueWords.tsx`: an "Insert live
  value" menu with what each reads now, and the typed-amount hint. Use it in `BannerEditorScreen.tsx`.
- [X] T025 [P] [US2] Update the back-office group preview words for `live_value_missing`
  (`apps/back-office/src/features/promotions` group screens).

## Phase 5: User Story 3: Banners and offers share groups (P2)

**Goal**: ordering, skins, states and code-skin defaults behave as for offers.

**Independent test**: quickstart walk 5 plus the acceptance scenarios of US3.

- [X] T026 [US3] Confirm `resolveSkin` never picks the code skin for a banner (`dto.code === null`) in
  `apis/edge-api/shared/src/promotions/skins.ts`. Confirmed: `placedPromotion` passes `code !== null`, and a banner's code
  is always null, so this is the no-code path `group-skin.test.ts` already covers. No code change.
- [X] T027 [US3] Update the tours:
  - `apps/back-office/src/features/tours/tours.ts`: a new `banner-editor` tour, and a Promotions tour step for the new
    action (version 2);
  - `specs/107-backoffice-guided-tours/spec.md`: the same words in its inventory;
  - `apps/back-office/src/features/tours/tours.test.ts`: the inventory count becomes 52.

## Phase 6: User Story 4: Dev seed (P3)

- [X] T028 [US4] Add `db/seeds/108_banners_dev.sql`: four banners with fixed ids, published, placed in home-hero and
  home-side on designed skins, targets by category key (falling back to Search), re-runnable, printing a summary.
- [X] T029 [US4] Add a `seed-banners` target to `Makefile` (dev only).

## Phase 7: Polish

- [X] T030 Run the type checks and tests for shared-types, edge-shared, edge-admin, storefront, commerce, back-office
  and customer-web. Check the gateway capacity contract test. Apply the migration and both seeds on a local Postgres.
- [X] T031 Add a FEATURE-HISTORY.md entry and a CLAUDE.md features line for 108, with the operator steps (deploy order
  from plan.md).

## Dependencies

- T001 and T002 come before everything.
- T003–T005 come before US1–US3.
- Within US1, the backend (T008–T012) comes before the back-office (T015–T020).
- US2 depends on T003 and T017. US3 depends on US1. US4 depends on T001 and T005 (and on the seed's groups/skins from
  the baseline).

## Parallel opportunities

- T002 can run beside T001.
- T006 and T007 can run beside T005.
- T010, T011, T012 and T013 can run side by side after T009.
- T024 and T025 can run side by side.

## Implementation strategy

MVP is Phases 1–3 (a banner created and shown, never money). Then live values (US2), groups/tours (US3) and the seed
(US4).

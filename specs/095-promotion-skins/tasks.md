# Tasks: Promotion Skins — Designed by Staff, Chosen per Placement (095)

**Input**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md),
[contracts/api.md](contracts/api.md), [contracts/skin-settings.md](contracts/skin-settings.md), [quickstart.md](quickstart.md)

**Tests**: included — the plan relies on shared fixtures for web/app parity and on server-side readability checks;
both are only real if tested.

**Conventions**: edge-api handlers live in `apis/edge-api/admin/src/functions/<name>-v1-<method>.ts` and are listed in
`apis/edge-api/admin/serverless.yml`; services follow handler → service → repository; back-office features follow
`features/<name>/{repo,queries}.ts` + screens, routed from `apps/back-office/src/routes/promotions.tsx`.

## Phase 1: Setup

- [X] T001 Amend the constitution to v3.6.0 with the "promotion skins are content" exception (research R13) beside the Google-mark exception in Principle V, add a Sync Impact Report entry, bump version/date in `.specify/memory/constitution.md`
- [X] T002 [P] Add `promotion-skin/` folder, `promo-skin.css` export and package `exports` entry to `packages/web-kit/package.json` and `packages/web-kit/src/index.ts`

## Phase 2: Foundational (blocks every story)

- [X] T003 Declare `SkinLayout`, `GroupSize`, `SkinSettings` (contracts/skin-settings.md), `LAYOUT_FITS`, `LAYOUT_RATIO`, `LAYOUT_SHOWS_PICTURE` in `packages/shared-types/src/promotion-skins.ts` and export from `packages/shared-types/src/index.ts`
- [X] T004 Implement pure `validateSkin(settings)` (shape, unknown keys, bounds, `#rrggbb`, layout-forced values for tile/strip) in `packages/shared-types/src/promotion-skins.ts`
- [X] T005 Implement pure `skinContrast(settings)` (WCAG luminance; 4.5/3.0; pairs per research R2; tint blended over black and white; dark set) in `packages/shared-types/src/promotion-skins.ts`
- [X] T006 Implement `skinGeometry(layout, size)`, `buttonWords(settings, promotion)` and `pickPicture(layout, images, chosenId)` in `packages/shared-types/src/promotion-skins.ts`
- [X] T007 Write `packages/shared-types/src/promotion-skins.fixtures.json` (each layout × fitting size; with/without code; long/short headline; expected geometry, button words, contrast) and `packages/shared-types/src/promotion-skins.test.ts` running validator, contrast and geometry against it
- [X] T008 Extend DTOs in `packages/shared-types/src/promotions.ts`: `ShopperPromotionDTO.skin?`, `AdminSkinDTO`, `AdminSkinListItemDTO`, `AdminPromotionImageDTO`, `AdminPromotionDTO.images`, group `size`/`defaultSkin`/`defaultCodeSkin`, member `skinId`/`imageId`/`resolved`, `AdminPutGroupMembersRequest.members?`, `PROMOTION_GROUP_KEYS.megaNav`
- [X] T009 Write migration `db/migrations/20261022090000_promotion_skins.sql`: `promotion_skin`, `promotion_image` (data-model.md), group `size`/`default_skin_id`/`default_code_skin_id`, member `skin_id`/`image_id`, effy_shopper SELECT-only grants, comments
- [X] T010 Seed the built-in Classic skin (default of every group) and the starter skins; seed `mega-nav` members from home-hero then home-between (research R8 revised). Read today's looks from `apps/customer-web/app/(shop)/_components/PromoHero.tsx`, `OffersPanels.tsx`, `apps/customer-web/app/(shop)/offers/page.tsx` (CodeOffer/OfferCard) and `apps/customer-mobile/.../features/catalog/presentation/HomeBlocks.kt`; write the five seed skins (research R8) with exact colours/sizes/words into the T009 migration, set group sizes and defaults, create `mega-nav` (size small, "Tile — Effy blue"), then `SET NOT NULL` on `default_skin_id`
- [X] T011 Container test `apis/edge-api/shared/src/promotions/skins-migration.container.test.ts`: seeds exist, every seed passes `validateSkin` and `skinContrast`, every group default fits its size, FK RESTRICT on skin delete, `image_id` nulled when its picture is deleted
- [X] T012 Resolve skin and picture in `groupPromotions` (`apis/edge-api/shared/src/promotions/candidates.ts`): join member skin → code default → group default; lateral load of the promotion's images; build `skin` on `shopperPromotion` via `pickPicture` and `publicImageUrl` + `imageWidthsField` (`apis/edge-api/shared/src/lib/media-public.ts`)
- [X] T013 [P] Unit tests for resolution order and picture fallback in `apis/edge-api/shared/src/promotions/group-skin.test.ts`; extend `apis/edge-api/storefront` and `apis/edge-api/commerce` group-read tests to assert `skin` is present and every 094 field unchanged
- [X] T014 Extend `apis/edge-api/shared/src/promotions/promotions.guard.test.ts`: `promotion_skin` / `promotion_image` written only under `admin/src/(promotions|promotion-groups|promotion-skins)/`; no shop source names either table
- [X] T015 Build the web renderer `packages/web-kit/src/promo-skin/PromoSkin.tsx` + `layouts/{Panel,HeaderCard,FullPicture,PictureBeside,Tile,Strip}.tsx` + `promo-skin.css`: inline styles from settings, box reserved by `skinGeometry` ratio, `<img srcset>` via `renditionUrl` with focus `object-position`, background colour under the picture, Copy code / action slot, decorations `aria-hidden`, reading order headline → supporting → picture alt → action
- [X] T016 [P] Decoration icon sets (food, produce, bakery, seasonal-winter, seasonal-summer, celebration) as inline SVG components in `packages/web-kit/src/promo-skin/decorations/`
- [X] T017 [P] Renderer tests `packages/web-kit/src/promo-skin/PromoSkin.test.tsx` against `promotion-skins.fixtures.json` (geometry, button words, picture/no picture, a11y order) plus a guard that the folder uses no Tailwind colour utilities
- [X] T018 Kotlin wire types `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/features/catalog/data/PromoSkinWire.kt` (+ mapping in `CatalogMappers.kt`) for `skin`
- [X] T019 App renderer `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/core/presentation/PromoSkin.kt` (six layouts, dark colours when set, decorations as vectors, clipboard copy, semantics order) and host test `PromoSkinFixturesTest.kt` reading the shared fixtures

**Checkpoint**: backend returns `skin`; both renderers exist and agree on fixtures.

## Phase 3: User Story 4 — Customers see the designed promotions (P1) 🎯 MVP

**Goal**: website and app draw every group from `skin`. **Independent test**: change a placement's skin in the DB; within a minute both clients show it.

- [X] T020 [US4] Replace drawing in `apps/customer-web/app/(shop)/_components/PromoHero.tsx` (slides and side) with `<PromoSkin>`; keep carousel behaviour; fall back to today's drawing when `skin` is absent
- [X] T021 [P] [US4] Replace `OfferBannerCard`/`OfferCard` drawing in `apps/customer-web/app/(shop)/_components/OffersPanels.tsx` and `CodeOffer` in `apps/customer-web/app/(shop)/offers/page.tsx` with `<PromoSkin>`; keep copy-code behaviour
- [X] T022 [P] [US4] Draw the cart group with `<PromoSkin>` where customer-web shows it (`apps/customer-web/app/(shop)/cart/`) — *no client draws the `cart` group today (094 left it unread); nothing to replace. It wears a skin as soon as a place reads it.*
- [X] T023 [US4] Replace promo drawing in `HomeBlocks.kt` (`HomeBlock.Promo` / `Offers`) and the app's offers/cart promo surfaces with `PromoSkin`; draw today's look when `skin` is null or its layout unknown
- [X] T024 [P] [US4] Add `skinId` and `layout` to `promotion_banner_tapped` *(the event did not exist; added to customer-web's taxonomy with `groupKey`, `skinId`, `layout`, `action`. The app has no promotion analytics yet — not added.)* in the web and mobile analytics taxonomies (`packages/shared-types` analytics events; app `Analytics` events)
- [X] T025 [US4] Update customer-web tests (`PromoHero.test.tsx`, `home-composition.test.ts`, offers) and the freshness guard if it names the components

## Phase 4: User Story 5 — Today's looks as skins, safe change (P2, ships with US4)

**Goal**: release changes nothing; usage visible before change. **Independent test**: before/after screenshots identical.

- [ ] T026 [US5] *(operator — needs the deployed site and app)* Compare Home, Offers, cart on web and app at phone and desktop widths against pre-change screenshots; adjust seed values in the T009 migration until identical; record the comparison in `specs/095-promotion-skins/SIGNOFF.md`

## Phase 5: User Story 1 — Pictures on a promotion (P1)

**Goal**: staff attach pictures. **Independent test**: upload a picture; a picture skin shows it on both clients.

- [X] T027 [US1] Image repository + service in `apis/edge-api/admin/src/promotions/images.ts` (presign via shared `presignUpload` with prefix `promotions/<id>`; record after HEAD + pixel size; ≤ 10 under promotion row lock; alt 1–150; focus 0–1; delete with in-use check; audit entries)
- [X] T028 [US1] Handlers `promotions-images-uploads-v1-post.ts`, `promotions-images-create-v1-post.ts`, `promotions-images-update-v1-patch.ts`, `promotions-images-delete-v1-delete.ts` in `apis/edge-api/admin/src/functions/`, routes + S3 PutObject/HeadObject on `promotions/*` in `apis/edge-api/admin/serverless.yml`
- [X] T029 [US1] Return `images` (with `usedIn`) on promotion detail in `apis/edge-api/admin/src/promotions/promotion-repository.ts`
- [X] T030 [P] [US1] Tests `apis/edge-api/admin/src/promotions/images.test.ts` (type/size refusals, count limit, alt required, in-use delete needs confirm)
- [X] T031 [US1] Back-office Pictures section `apps/back-office/src/features/promotions/components/PicturesSection.tsx` on the promotion editor/detail: upload (presign → PUT → record), description, focus-point picker on the picture, reorder, remove with "used in" confirm; repo/query functions in `features/promotions/repo.ts` + `queries.ts`
- [X] T032 [P] [US1] Back-office test `PicturesSection.test.tsx` (refusal sentences, alt required, in-use confirm)

## Phase 6: User Story 2 — Build a skin (P1)

**Goal**: staff create and edit skins with live preview and readability. **Independent test**: create, save, reopen — every setting kept.

- [X] T033 [US2] Skin repository `apis/edge-api/admin/src/promotion-skins/repository.ts` (list with usage count, get with usage, insert, versioned update, duplicate, delete)
- [X] T034 [US2] Skin service `apis/edge-api/admin/src/promotion-skins/service.ts` (`validateSkin` + `skinContrast` → 422 `invalid_skin`/`skin_unreadable` with fields; `name_taken`; `skin_changed`; layout change refused with `skin_does_not_fit` when it strands a placement; `skin_in_use` on delete; audit; announce `promotions`; EMF counter on unreadable refusals)
- [X] T035 [US2] Six handlers `promotion-skins-{list-v1-get,create-v1-post,detail-v1-get,update-v1-put,duplicate-v1-post,delete-v1-delete}.ts` in `apis/edge-api/admin/src/functions/` and routes in `apis/edge-api/admin/serverless.yml`; check staff gateway capacity test passes
- [X] T036 [P] [US2] Tests `apis/edge-api/admin/src/promotion-skins/service.test.ts` and `promotion-skins.container.test.ts` (unreadable refused, version conflict, delete in use, duplicate)
- [X] T037 [US2] Back-office `apps/back-office/src/features/promotion-skins/{repo,queries}.ts` and `SkinsListScreen.tsx` (table: thumbnail via `<PromoSkin>`, name, layout, used in, updated) with route in `apps/back-office/src/routes/promotions.tsx` and nav entry
- [X] T038 [US2] Skin editor `apps/back-office/src/features/promotion-skins/SkinEditorScreen.tsx`: layout picker, sectioned settings (background, label, headline, supporting, button, chip, decorations, picture, shape, dark colours) showing only the layout's settings; colour = native picker + hex field; inline pass/fail per text pair from `skinContrast`; save refused with named failing pairs; version conflict message
- [X] T039 [US2] Live preview pane `apps/back-office/src/features/promotion-skins/SkinPreview.tsx`: `<PromoSkin>` at phone/desktop widths, light/dark (when dark set), promotion chooser (real promotions + sample with/without code, long headline), truncation warning
- [X] T040 [P] [US2] Back-office tests `SkinEditorScreen.test.tsx` (unreadable blocks save, settings round-trip, duplicate, CSA read-only)

## Phase 7: User Story 3 — Choose a skin per placement (P1)

**Goal**: per group default(s) and per member skin/picture. **Independent test**: promotion A wears skin 1 in home-hero and skin 2 in mega-nav on both clients.

- [X] T041 [US3] Extend `apis/edge-api/admin/src/promotion-groups/{repository,service}.ts`: group `size`/`defaultSkinId`/`defaultCodeSkinId` with fit check and `reset[]` on size change; members PUT accepts `members[]` with `skinId`/`imageId` (fit check, picture belongs to promotion); member DTO `resolved`; preview returns `skin`; audit
- [X] T042 [P] [US3] Tests for fit refusals, size-change reset, image ownership in `apis/edge-api/admin/src/promotion-groups/service.test.ts`
- [X] T043 [US3] Back-office group editor `apps/back-office/src/features/promotion-groups/PromotionGroupScreen.tsx`: size and default skin(s) pickers (only fitting skins, says which layouts fit), per-member skin + picture choosers with small `<PromoSkin>` previews, whole-group preview at phone/desktop widths
- [X] T044 [P] [US3] Back-office test `PromotionGroupScreen.test.tsx` (non-fitting skin not offered; member choice saved)

## Phase 8: User Story 5 — Safe change (P2)

- [X] T045 [US5] Skin editor shows usage (groups, placement count, defaults) and confirms saving a used skin naming the count; delete disabled with reasons while in use (`SkinEditorScreen.tsx`, `SkinsListScreen.tsx`)

## Phase 9: User Story 6 — The aisles menu shows promotions (P2)

**Independent test**: a promotion in `mega-nav` shows in the website's aisles menu; empty group → no slot.

- [X] T046 [US6] Read `mega-nav` through the public group read in `apps/customer-web/components/chrome/AisleMenu.tsx` (and its data source), render the first member with `<PromoSkin size="small">` in a slot; no slot when empty or on read failure
- [X] T047 [P] [US6] Test the slot present/absent in `apps/customer-web/components/chrome/AisleMenu.test.tsx`

## Phase 10: User Story 7 — Older app versions (P2)

- [X] T048 [US7] Add a wire test that a 094-shaped decoder (strict field set minus unknown keys) reads a 095 group response unchanged, in `apps/customer-mobile/shared/src/commonTest/.../PromotionGroupsCompatTest.kt`; confirm `EffyHttpClient` `ignoreUnknownKeys` and unknown-layout fallback in `PromoSkin.kt`

## Phase 11: Polish

- [X] T049 [P] Update `docs/api/path-assignment.md` with the ten admin routes
- [X] T050 [P] Record 095 in `FEATURE-HISTORY.md` (deploy order, migration, walk) and the feature list in `CLAUDE.md`; note the constitution v3.6.0 exception in CLAUDE.md's Design system section
- [X] T051 Run `pnpm --filter @effy/shared-types test`, `@effy/web-kit test`, edge-api `shared`/`admin`/`storefront`/`commerce` tsc + vitest, `make bo-test`, `make cw-test`, customer-web build + size, `./gradlew :shared:allTests`, design-system guards, `scripts/mobile-guard.sh`; fix failures

## Dependencies

- Setup → Foundational (T003–T019) → everything.
- US4 (T020–T025) + US5 parity (T026) are the MVP: shoppers see skins with no visible change.
- US1 (pictures) and US2 (builder) are independent of each other after Foundational.
- US3 needs US2's skins list for pickers (T037) and US1 for picture choice (T031) — picture choice degrades to "best fit" without US1.
- US5 safe-change (T045) needs US2. US6 needs Foundational + US4's renderer use. US7 needs T018/T019.

## Parallel examples

- Foundational: T016, T017 alongside T015's layouts; T013 after T012; T018/T019 alongside T015.
- US1: T030 and T032 alongside T031.
- US2: T036 while T037–T039 are built; T040 last.
- US4: T021, T022, T024 alongside T020.

## Implementation strategy

1. **MVP** — Phases 1–4: shoppers see skin-drawn promotions identical to today; deploy migrate → admin → storefront/commerce → customer-web/app.
2. **Pictures** (US1) and **Builder** (US2) — the operator's two asks; deploy admin + back-office.
3. **Placement** (US3) + safe change (US5) + aisles menu (US6); compatibility check (US7); polish.

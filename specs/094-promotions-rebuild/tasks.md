# Tasks: Promotions Rebuilt — a Full Promotion System, Grouped for Display

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/api.md](contracts/api.md), [quickstart.md](quickstart.md)

Abbreviations:
- `ESH` = `apis/edge-api/shared/src`
- `ADM` = `apis/edge-api/admin/src`
- `COM` = `apis/edge-api/commerce/src`
- `SF` = `apis/edge-api/storefront/src`
- `ORD` = `apis/edge-api/orders/src`
- `SHP` = `apis/edge-api/shop/src`
- `NTF` = `apis/edge-api/notifications/src`
- `ST` = `packages/shared-types/src`
- `BO` = `apps/back-office/src`
- `CW` = `apps/customer-web`
- `CM` = `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile`

**Tests are included.** This feature moves money: SC-003 and SC-004 are proven by tests, and "money lives once" is held by a guard (R2).

**Stages** (plan.md): Phases 1–5 are **Stage A** (cart promotions, lifecycle, groups). Phases 6–12 are **Stage B**. Phase 13 is **Stage C**.

## Phase 1: Setup

- [X] T001 Write `db/migrations/20261020090000_promotions_rebuild.sql` per data-model.md:
  - **Tables**: `promotion`, `promotion_code`, `promotion_target`, `promotion_customer`, `promotion_use`, `promotion_group`, `promotion_group_member` and `order_promotion`.
  - **Columns**: `order_item.discount_amount`, `"order".delivery_discount_amount` and `cart.promotion_code_id`.
  - **Rules** on those tables: every CHECK; the partial unique index for single-use codes; the frozen-after-use trigger; the immutable group-key trigger; the headline-required-for-membership trigger.
  - **Function**: `public.promotion_state(promotion, timestamptz)`.
  - **Copy**:
    - `promo_code` → `promotion` (`kind=cart`, `trigger=code`, shared `promotion_code`, `legacy_promo_code_id`, `published_at=created_at`, `paused = status='disabled'`);
    - `promo_redemption` → `promotion_use` `confirmed`;
    - `cart.promo_code_id` → `cart.promotion_code_id`.
  - **Groups**: seed `home-hero`, `home-side`, `home-between`, `offers` and `cart`. Place advertised codes (`carousel` → `home-hero` and `offers`, `inline` → `home-between`, in `banner_position` order) with `banner_title` / `banner_subtitle` as headline / supporting line.
  - COMMENTs on every table and column.
  - A Down section.
- [X] T002 Container test `ESH/promotions/migration.container.test.ts`. Seed old-model codes, redemptions, carts and advertised banners; run the migration; assert the copies. Assert `promotion_state` for every state, the frozen-after-use trigger and the immutable group key.

## Phase 2: Foundational (blocks every story)

- [X] T003 [P] Rewrite `ST/promotion.ts` per contracts/api.md:
  - kinds, trigger, state, audience;
  - `ShopperPromotionDTO`, `PromotionGroupDTO`;
  - the admin DTOs (`AdminPromotionDTO`, `AdminPromotionListItemDTO`, `AdminPromotionWriteDTO`), the group DTOs, and the performance, codes and customers DTOs.

  Keep `BannerDTO` / `BannerPlacement` in `ST/storefront.ts`, marked `@deprecated — compatibility (094)`. Export everything from `ST/index.ts`.
- [X] T004 [P] Cart, checkout and order DTOs:
  - `ST/cart.ts`: `CartPromotionLineDTO`, `CartNotAppliedDTO`, `CartDTO.promotions`, `promotionsNotApplied`, line `discountAmount`; the refusal reasons extended.
  - `ST/checkout.ts`: intent `expectedDiscount`, response `deliveryDiscount`, problem `promotions_changed`.
  - The customer order DTO: `promotions[]` and line `discountAmount`.
  - `ST/catalog.ts` / `ST/storefront.ts`: product `offer`.
  - `ST/live.ts`: the `promotions` kind.

  Regenerate `pnpm --filter @effy/shared-types contract:gen` and `commerce-contract:gen`.
- [X] T005 [P] Write the engine, `ESH/promotions/engine.ts`:
  - `pricePromotions(basket, candidates, ctx)` — reductions in R3 order (item → bxgy → cart → delivery);
  - per-line floor rounding; largest-remainder allocation of cart discounts; caps; nothing below zero;
  - the R4 combining choice and its tie-break;
  - `notApplied` with reasons.

  Pure, no I/O.
- [X] T006 [P] Engine fixtures in `ESH/promotions/engine.fixtures.json`, plus `ESH/promotions/engine.test.ts`. One fixture per spec acceptance scenario (US1, US3, US4, US5, US6, US8), plus every edge case in spec.md: rounding, allocation, below-zero, tie-break, time rule, delivery type.
- [X] T007 [P] Write `ESH/promotions/terms.ts`, the one composer: `termsOf(promotion)`, `endsInOf(promotion, now)`, `offerLabelOf(promotion)` and the refusal / not-applied sentences, all in Melbourne time. Unit tests in `ESH/promotions/terms.test.ts`.
- [X] T008 Write `ESH/promotions/candidates.ts`, the only reader of the promotion tables:
  - `candidatesFor(db, { customerId?, cartLines, enteredCodeId?, now })` returns Active promotions that could apply, with their targets resolved: products, categories including descendants, and brands.
  - It also returns usage counts: total, per-customer and budget used, counting `held` (unexpired) and `confirmed` uses.
  - `groupPromotions(db, keys, { customerId?, now })` serves the group reads.
- [X] T009 Write `ESH/promotions/uses.ts`, the only writer of `promotion_use`:
  - `holdUses(tx, { orderId, customerId, applied, expiresAt })`. It locks each promotion `FOR UPDATE` and re-checks caps and budget. It throws `PromotionsChangedError` when a promotion no longer fits. It releases the cart's earlier held uses.
  - `confirmUses(tx, orderId)` and `releaseUses(tx, orderId, why)`.
  - EMF metrics per R17.
- [X] T010 [P] Add `ESH/promotions/product-offer.ts`: `PRODUCT_OFFER_SQL(productAlias)`, the Active, everyone-audience item / bxgy offer for a product (R11).
- [X] T011 [P] Write `ESH/promotions/promotions.guard.test.ts`. It fails when:
  - any file outside `ESH/promotions/` reads or writes `promotion`, `promotion_use`, `promotion_code`, `promotion_target` or `promotion_customer`, apart from the `admin` repository's writes and `order_promotion` readers;
  - any file computes a discount from a promotion outside `engine.ts`;
  - anything under `SHP` selects from `order_promotion` or `promotion*`.
- [X] T012 Container test `ESH/promotions/uses.container.test.ts`:
  - concurrent intents against `max_uses = 1`, against a budget, and against one single-use code: exactly one hold wins;
  - expiry frees a use; confirm and release transitions.

## Phase 3: US1 — Run a cart offer, with or without a code (P1) 🎯 MVP

**Independent test**: US1 scenarios 1–4 on web and app. A pre-change code applies identically; its old order's receipt is unchanged.

- [X] T013 [US1] Cart read in `COM/cart/service.ts` and `COM/cart/repository.ts`:
  - replace `discountOf` with `candidatesFor` + `pricePromotions`;
  - fill `promotions`, `promotionsNotApplied`, line `discountAmount` and the kept `discount` (the entered code's line);
  - read and write `cart.promotion_code_id`.
- [X] T014 [US1] Apply and clear a code in `COM/cart/service.ts`. Matching ignores case and spaces. Each refusal reason has its sentence from `terms.ts`. A personal promotion for a signed-out shopper answers `promo_sign_in`.
- [X] T015 [US1] Delete `COM/promo/promo.ts` and its tests; move any remaining callers to the engine.
- [X] T016 [US1] Payment intent in `COM/checkout/service.ts` and `COM/checkout/store.ts`:
  - price with the engine;
  - compare `expectedDiscount` when sent (409 `promotions_changed` with the cart);
  - in the intent transaction: write `order_item.discount_amount`, `order.discount_amount`, `order.delivery_discount_amount` and `order_promotion` snapshots, and call `holdUses`.
- [X] T017 [US1] Write `COM/checkout/promotions.container.test.ts`: the cart total equals the intent charge for every engine fixture (SC-003); a 409 when a promotion ends between cart and intent; old clients that send no `expectedDiscount` are not checked.
- [X] T018 [US1] Finalizer in `ESH/payments/finalize.ts`: step 10 calls `confirmUses` instead of inserting `promo_redemption`. Payment failure and hold expiry call `releaseUses`, from the same places window holds are released.
- [X] T019 [US1] Refunds in `ESH/payments/refunds/repository.ts` and `ESH/payments/refunds/service.ts`:
  - `priceLines` uses the line's paid share (R8);
  - `cancel` calls `releaseUses(…, "cancelled")` while the order is unfulfilled.

  Extend `ESH/payments/refunds/refunds.container.test.ts`: a discounted line is refunded at what was paid; a fully refunded line returns exactly its paid amount.
- [X] T020 [P] [US1] Readers:
  - `ORD/orders/repository.ts` + `service.ts`: back-office order money lists `order_promotion` lines, falling back to `promo_code` for old orders.
  - `NTF/receipts/repository.ts` + `sender.ts`: the receipt lists each promotion and the delivery discount.
  - `COM/orders/service.ts`: the customer order DTO carries `promotions[]` and line `discountAmount`.
- [X] T021 [P] [US1] Shops: `SHP/orders/repository.ts` and `SHP/orders/types.ts` send `promoCode: null` for orders that have `order_promotion` rows, marked `@deprecated — compatibility (094)`. Stop rendering the code in `apps/shop-web/src/features/orders/*` and `apps/shop-mobile` order money.
- [X] T022 [US1] Customer-web cart and checkout:
  - `CW/app/(shop)/cart/page.tsx` and `CW/app/(shop)/cart/PromoField.tsx`: one line per applied promotion; per-line savings; not-applied sentences.
  - `CW/app/checkout/CheckoutFlow.tsx`: sends `expectedDiscount`; handles 409 `promotions_changed` by showing the new total before payment.
  - `CW/components/receipt/ReceiptDocument.tsx` and the order page under `CW/app/(account)/orders/`: promotion lines.
- [X] T023 [US1] Customer app:
  - `CM/features/cart/{data,domain,presentation}/*`: promotion lines and refusal sentences.
  - `CM/features/checkout/{data,domain}/*` and `CM/features/checkout/presentation/CheckoutViewModel.kt`: `expectedDiscount` and the `promotions_changed` re-show.
  - `CM/features/checkout/presentation/ReceiptScreen.kt` and `OrdersScreen.kt`: promotion lines.

  Host tests under `CM/../commonTest`.

## Phase 4: US10 — Lifecycle and history (P1)

**Independent test**: walk draft → scheduled → active → paused → resumed → ended → archived. A value change after one use is refused, and each step is in the history.

- [X] T024 [US10] Rewrite the admin repository in `ADM/promotions/repository.ts`:
  - list with `promotion_state`, the filters (`q`, `state`, `kind`, `trigger`, `groupId`) and per-state counts;
  - create, read, update with `expectedUpdatedAt`;
  - lifecycle actions;
  - delete when unused;
  - audit rows in the same transaction.
- [X] T025 [US10] Rewrite `ADM/promotions/service.ts` and `ADM/promotions/types.ts`:
  - validation per the data-model CHECKs, with named errors;
  - the frozen-field refusal (409 `promotion_used`);
  - the shared-code uniqueness check (409 `code_taken`);
  - publish, pause, resume, end and archive rules;
  - the ops `promotions` announce after commit.
- [X] T026 [US10] Admin handlers in `ADM/functions/`:
  - `promotions-list-v1-get.ts`, `promotions-create-v1-post.ts`, `promotions-get-v1-get.ts`, `promotions-update-v1-patch.ts`;
  - `promotions-actions-v1-post.ts`, `promotions-delete-v1-delete.ts`, `promotions-audit-v1-get.ts`.

  Register them in `apis/edge-api/admin/serverless.yml`. Remove the `status` and `banner-image/presign` routes and their handlers. Mappers go in `ADM/promotions/handler-support.ts`.
- [X] T027 [US10] Admin tests: `ADM/promotions/service.test.ts` and `ADM/promotions/repository.test.ts`, rewritten, plus `ADM/promotions/promotions.container.test.ts` (immutability, state counts, audit).
- [X] T028 [P] [US10] Back-office data layer: `BO/features/promotions/{model.ts,repo.ts,queries.ts,access.ts,errorText.ts}` rewritten for the new DTOs. The `promotions` live kind is mapped in `BO/features/live/routes.ts`.
- [X] T029 [US10] `BO/features/promotions/PromotionsListScreen.tsx`:
  - view tabs per state with counts;
  - search; facets for kind, trigger and group;
  - columns: Name / code, What it gives, Who, Active dates, Used, Status.
- [X] T030 [US10] Editor page `BO/features/promotions/PromotionEditorScreen.tsx`, used for both create and edit, at routes `/promotions/new` and `/promotions/$promoId/edit` in `BO/routes/promotions.tsx` and `BO/router.tsx`. Sections: Basics, What it gives (cart only in stage A), Who and when, Limits, Combining, Shopper words, Groups. A live Summary uses the `terms.ts` wording mirrored in shared-types. Frozen fields are disabled once used, with the reason. Delete `BO/features/promotions/CreatePromoScreen.tsx` and `components/PromoCodeDialog.tsx`.
- [X] T031 [US10] `BO/features/promotions/PromotionDetailScreen.tsx`:
  - header with state and lifecycle actions, each with a confirm dialog;
  - tabs: Overview (detail rows), Groups, History.

  Delete `components/AdvertisingSection.tsx`, `components/BannerCanvas.tsx` and their tests.
- [X] T032 [US10] Back-office tests: rewrite `BO/features/promotions/*.test.tsx` for the list, editor (create, frozen fields) and detail (lifecycle confirmations).

## Phase 5: US2 — Show promotions where staff put them (P1)

**Independent test**: US2 scenarios 1–5. Pause a promotion and it leaves both clients within a minute.

- [X] T033 [US2] Admin groups:
  - repository and service in `ADM/promotion-groups/{repository.ts,service.ts,types.ts}`: CRUD, members put (positions), preview (shown and hidden with why);
  - handlers `ADM/functions/promotion-groups-{list,create,update,delete,members,preview}-v1-*.ts`, registered in `apis/edge-api/admin/serverless.yml`;
  - tests `ADM/promotion-groups/*.test.ts`.
- [X] T034 [US2] Back-office groups:
  - `BO/features/promotion-groups/{repo.ts,queries.ts,model.ts}`;
  - `PromotionGroupsScreen.tsx`: a table of groups with key, name and count; create and rename dialogs;
  - `PromotionGroupScreen.tsx`: an ordered member list with add and remove, reordering by move up / down and drag, and a preview panel that says why each hidden one is hidden.

  Routes `/promotions/groups` and `/promotions/groups/$groupId`. Nav entry under Promotions in `BO/components/shell/nav.ts`.
- [X] T035 [US2] Storefront group read:
  - `SF/promotions/{repository.ts,service.ts}` use `groupPromotions` (everyone audience);
  - handler `SF/functions/promotion-groups-v1-get.ts` (`?keys=`), with the listing cache tier in `SF/lib/cache.ts` and its contract test;
  - `GET /storefront/v1/promotions/{id}` reads the new tables;
  - `SF/home/service.ts` builds the deprecated `banners` from `home-hero` and `home-between`.

  Register in `apis/edge-api/storefront/serverless.yml`. Tests: `SF/promotions/service.test.ts`.
- [X] T036 [US2] Commerce personal group read: handler `COM/functions/promotion-groups-v1-get.ts` (customer auth, personal audience, per-customer caps), registered in `apis/edge-api/commerce/serverless.yml`, tested.
- [X] T037 [US2] Customer-web reads groups:
  - `CW/app/(shop)/home-data.ts` and `home-composition.ts`: fetch `home-hero`, `home-side`, `home-between` in one call (public, or personal when signed in);
  - `CW/app/(shop)/_components/PromoHero.tsx` takes hero slides from `home-hero` and side cards from `home-side`;
  - `OffersPanels.tsx` and `CW/app/(shop)/offers/page.tsx` read `offers`; `CW/app/(shop)/promotions/[id]/page.tsx` reads the new DTO;
  - the cart shows `cart` suggestions.

  Update `home-composition.test.ts` and `PromoHero.test.tsx`.
- [X] T038 [US2] Customer app reads groups:
  - `CM/features/catalog/data/HttpCatalogRepository.kt` + `CatalogMappers.kt`: a group fetch, public or personal;
  - `CM/features/catalog/domain/Catalog.kt` + `CatalogUseCases.kt`: `PromotionGroup`;
  - `CM/features/catalog/presentation/{HomeBlocks.kt,HomeScreen.kt}`: Promo and Offers blocks from groups;
  - `PromotionScreen.kt` / `PromotionViewModel.kt` on the new DTO;
  - cart suggestions in `CM/features/cart/presentation/CartScreen.kt`.

  Host tests.

**Checkpoint — Stage A complete**: deployable per plan.md's deploy order. Walk quickstart steps 1–4, 10 and 11.

## Phase 6: US5 — Delivery offers (P2)

- [X] T039 [US5] Editor: the "What it gives" section adds Delivery (free, percent or amount) and the delivery types, in `BO/features/promotions/PromotionEditorScreen.tsx`. The service validation in `ADM/promotions/service.ts`.
- [X] T040 [US5] The delivery reduction in the intent and on the cart's quote line: `COM/checkout/service.ts`, plus the cart's delivery-dependent `promotions[].deliveryAmount`. Web (`CW/app/checkout/CheckoutFlow.tsx`) and app (`CM/features/checkout/presentation/CheckoutScreen.kt`) show the fee as reduced or free, with the promotion named.

## Phase 7: US3 — Offers on products, categories or brands (P2)

- [X] T041 [US3] Editor: Item kind with targets — a product search picker, a category tree picker and brand entry — in `BO/features/promotions/components/TargetPicker.tsx`, wired into the editor. Validation in `ADM/promotions/service.ts`; targets are written by `ADM/promotions/repository.ts`.
- [X] T042 [US3] Product offers on reads: `SF/catalog/*` listing and product reads join `PRODUCT_OFFER_SQL` and fill `offer`. Contract test.
- [X] T043 [P] [US3] Offer labels: on web in `CW/app/(shop)/_components/ProductCard.tsx` and `CW/app/(shop)/product/[id]/page.tsx`; on the app in `CM/core/presentation/ProductTile.kt` and the product screen.

## Phase 8: US4 — Buy X get Y (P2)

- [X] T044 [US4] Editor: the bxgy kind (buy, get, free or percent, max per order) with targets, in `BO/features/promotions/PromotionEditorScreen.tsx`; validation in `ADM/promotions/service.ts`. Offer labels come from `offerLabelOf` (already in T007).

## Phase 9: US6 — Who qualifies, when, and how often (P2)

- [X] T045 [US6] Editor: audience (everyone, first order, new customers, chosen), days and hours, min quantity, the three limits and budget, in `BO/features/promotions/PromotionEditorScreen.tsx`.
- [X] T046 [US6] Chosen customers:
  - `ADM/promotions/customers.ts` with handlers `promotions-customers-{list,add,remove}-v1-*.ts`: add by ids or emails, with unknown emails returned;
  - `BO/features/promotions/components/ChosenCustomers.tsx`: search, paste or upload emails, a list.
- [X] T047 [US6] The audience rules (R14) in `ESH/promotions/candidates.ts`, with container tests for first order, new customers and chosen customers. The signed-out answer is `promo_sign_in`.

## Phase 10: US8 — How promotions combine (P2)

- [X] T048 [US8] Editor: the "Combines with other promotions" switch and an explanation, in `BO/features/promotions/PromotionEditorScreen.tsx`. Not-applied sentences shown in the web cart (`CW/app/(shop)/cart/page.tsx`) and the app cart (`CM/features/cart/presentation/CartScreen.kt`).

## Phase 11: US7 — Many single-use codes (P3)

- [X] T049 [US7] Write `ADM/promotions/codes.ts`: batch generation (R15 alphabet, prefix, uniqueness against all codes, ≤ 10,000), list with state, and CSV export. Handlers `promotions-codes-{generate,list,export}-v1-*.ts`. Tests.
- [X] T050 [US7] Back-office: a Codes tab on `BO/features/promotions/PromotionDetailScreen.tsx` with a generate dialog, the list with states and a Download CSV action. In the editor, the code trigger offers either "One code shoppers share" or "Single-use codes".

## Phase 12: US9 — See how a promotion is doing (P3)

- [X] T051 [US9] Performance:
  - `ADM/promotions/performance.ts` + `promotions-performance-v1-get.ts`: uses, customers, discount, orders, sales and budget left, for lifetime, last 7 and last 30 days, from confirmed uses and `order_promotion`;
  - a Performance section on the detail screen's Overview, as detail rows, not tiles.

## Phase 13: Polish, docs and Stage C

- [X] T052 [P] Analytics events (R17) added to the typed taxonomy in `ST/analytics*.ts`; emitted from back-office and both clients.
- [X] T053 [P] Guards and suites green:
  - `pnpm -r test`, `make bo-test cw-test`, the KMP host tests;
  - `scripts/check-no-refresh-timers.sh` and `gateway-capacity.contract.test.ts` (route counts recorded);
  - `ESH/live/change-map.guard.test.ts`, updated for the new admin writes.
- [X] T054 Docs: a FEATURE-HISTORY.md entry for 094 (stages, deploy order, operator steps); the CLAUDE.md "Current status" and feature list; and a note on the promotion model replacing 027's in CLAUDE.md.
- [X] T055 Stage C migration, authored at `specs/094-promotions-rebuild/stage-c/remove_promo_code.sql` and kept out of `db/migrations` until its readers are gone. It refuses while any `cart.promo_code_id` is set or any code still reads the old tables (asserted by `promotions.guard.test.ts`). It drops `promo_redemption`, `cart.promo_code_id`, `"order".promo_code_id` (keeping `"order".promo_code` text for old receipts) and `promo_code`. Run only after a release with no readers.

## Dependencies

- Phase 1 → Phase 2 → US1 → (US10 ∥ US2's admin and storefront halves). US2's client tasks need US1's client cart work merged first, to avoid conflicts in the same files.
- Stage B phases each depend on Stage A only. US6 and US8 both touch the editor, so run them in sequence. US3 and US4 share the target picker: US3 comes first.
- T055 is last, one release after Stage A's deploy.

## Parallel opportunities

- Phase 2: T003, T004, T005, T006, T007, T010 and T011 are in different files.
- US1: T020 and T021 (readers) run beside T022 and T023 (clients) once T016 has landed.
- US2: the storefront (T035) and commerce (T036) reads, and the back-office groups (T034), are independent.
- Stage B: US5 and US3 can proceed together. US7 and US9 are independent of the editor work.

## Implementation strategy

**MVP = Stage A (Phases 1–5).** It does everything today's model does, on the new model, with groups. Deploy and walk it before Stage B. Each later phase adds one capability to the editor and the engine's tested paths, and is deployable on its own.

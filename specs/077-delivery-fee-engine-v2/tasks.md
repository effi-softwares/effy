# Tasks: Delivery Fee Engine v2

**Input**: Design documents from `specs/077-delivery-fee-engine-v2/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/routes.md](contracts/routes.md), [quickstart.md](quickstart.md)

**Tests**: included. The proofs P1–P26 in the quickstart are part of this feature's definition of done.
Each is broken once to see it fail.

**Organization**: by user story (spec.md). Paths are repo-relative. Abbreviations:
`EA` = `apis/edge-api`, `ST` = `packages/shared-types/src`, `BO` = `apps/back-office/src/features`,
`CW` = `apps/customer-web`, `CM` = `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/features`,
`M1` = `db/migrations/<ts>_delivery_fee_engine_v2.sql`, `M2` = `db/migrations/<ts>_drop_delivery_rings.sql`.

⚠ **Mode of work**: Claude writes the code, SQL and Terraform; the operator runs every `make db-up*`,
`make edge-deploy` and `make apply` (quickstart → Operator steps).

⚠ **M1 is additive.** The services running when it is applied still read `delivery_ring_price`; nothing
in M1 may drop, rename or tighten anything they read. The tier tables go in M2, after the deploy.

⚠ **The same-day amount is never guessed.** M1 reads `EFFY_TODAY_PREMIUM` and raises without it.
Tests set it explicitly.

⚠ **Open with the operator, not decided here**: whether the shop console should also stop showing the
customer's order **total** (research F1). These tasks remove the delivery row only.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US8 from spec.md

---

## Phase 1: Setup

- [X] T001 Scaffold M1 with `make db-new name=delivery_fee_engine_v2` (M2 is scaffolded by T034, when it is written — an empty migration file in the tree helps nobody). Down is a dev-only single-step reversal.
- [X] T002 Add `db-up-one` to `Makefile` beside `db-up` (same DSN composition, same confirmation prompt and commit guard, `goose up-by-one`); add it to `.PHONY` and its `##` help line: "OPERATOR: apply ONE pending migration". Process env must pass through to goose unchanged (M1 reads `EFFY_TODAY_PREMIUM`).
- [X] T003 [P] In `ST/delivery.ts` add `DeliveryFeeLineKind`, `DELIVERY_FEE_LINE_LABEL`, `DeliveryFeeLineDTO`, `DeliveryFeeDTO`, `DeliveryOfferDTO` exactly as in [contracts/routes.md](contracts/routes.md) "Shared words", with a comment that this file is the ONLY place the four labels are written. Extend `DeliveryQuoteDTO` (`standardFee?`, `freeDeliveryRemainingAmount?`), `DeliverySlotOptionDTO` (`surchargeAmount?`, `fee?`) and `ServiceabilityDTO` (`offer?`) — all optional, with "absent only from a server older than 077". Rewrite the two comments that say a slot has no fee and the fee belongs to the method (069), and the header line "same-day is always priced ≥ standard". Add `DELIVERY_FEE_WORDS` (spendMore, freeReached, smallOrder, feeChanged) from contracts beside the labels. Mark `DeliveryOptionDTO.feeAmount` as compatibility-only (research R4).
- [X] T004 [P] In `ST/checkout.ts` add `shownDeliveryAmount?: string` to the intent request, `deliveryFee?: DeliveryFeeDTO` to the intent response, and `DELIVERY_FEE_CHANGED_CODE = "delivery_fee_changed"` with `DeliveryFeeChangedDTO { code; quote: DeliveryQuoteDTO }`.
- [X] T005 [P] In `ST/delivery-admin.ts` ADD, under new names so nothing that compiles today breaks, `FeePlanV2DTO`, `FeePlanInput`, `PlanGapCode` (the seven codes of contracts "Plan gap codes"), `PlanGapDTO`, `PlanActivationRequest { confirmZeroFloor }`, `FeeSimulationRequest`, `FeeSimulationDTO`. ⚠ Do NOT delete the 047 `FeePlanDTO`, `RingDTO`, `RingPriceDTO` or `PlanActivationRefusalDTO` here — `admin` and back-office use them until T057/T059, which remove them and rename `FeePlanV2DTO` → `FeePlanDTO`. `pnpm -r typecheck` must stay green after every phase.
- [X] T006 [P] In `ST/order.ts` add `deliveryFee?: DeliveryFeeDTO` to the customer order and receipt DTOs; in `ST/order-admin.ts` add `deliveryFeeBreakdown?: DeliveryFeeBreakdownDTO` (the stored shape in [data-model.md](data-model.md): `v`, `kind`, `plan`, `inputs`, `parts`, `lines`) with a comment that `plan`, `inputs` and `parts` never appear on a customer or shop contract.
- [X] T007 [P] In `ST/live.ts` add `"pricing"` to `LIVE_KINDS` (ops channel only — say so in the comment); update `ST/live.test.ts`.
- [X] T008 Regenerate the Kotlin and JSON contracts under `packages/shared-types/contract/` (`schema.json`, `Dto.kt`, `commerce-schema.json`, `CommerceDto.kt`) with the package's existing generate script; run `pnpm --filter @effy/shared-types test`.

---

## Phase 2: Foundational (blocks every story)

**Purpose**: the one formula, the tables it reads, and the release carry-over.

### The engine (pure — written and proven before anything reads it)

- [X] T009 Write the table tests FIRST in `EA/shared/src/delivery/engine.test.ts` (replacing the factor-based cases): **P1** — a plan with base 3.00, distance bands ≤10 km +0 / ≤20 km +2.00 / beyond +5.00, weight bands ≤5 kg +0 / ≤15 kg +1.50 / top +4.00, step 0.50, floor 4.00, cap 15.00; rows for km 0, 10, 10.01, 20, 20.01, 900; grams 1, 5000, 5001, 15000, 15001, 80000; a raw amount needing rounding up; a result under the floor; a result over the cap. **P2** — over a generated grid of monotonic plans, heavier ≥ lighter and farther ≥ nearer. **P4** — basket exactly at `freeOver` → 0 with a today premium and a slot premium present; one cent under → not free. **P5** — small-order fee added after a capped fee; basket exactly at `smallUnder` → no fee. **P6** — `feeLines` sums to `totalCents` for every row above, omits zero lines, and at the cap shows a window surcharge smaller than the premium (or none). **P18** — courier: flat + weight band, rounded, clamped; distance ignored; no free delivery unless its own amount is set.
- [X] T010 Rewrite `EA/shared/src/delivery/engine.ts` per research R3/R6/R7: types `DistanceBand { upperKm: number | null; addCents }`, `WeightBand` (kept), `EffyPlanValues`, `CourierPlanValues`, `FeeBreakdown`; functions `distanceAddCents(km, bands)` (smallest `upperKm ≥ km`, else the open band; throws `UnpricedDistanceError` when there is none), `weightAddCents` (kept), `basketValueCents(itemSubtotalCents, discountCents)`, `effyFee({ km, grams, basketCents, premiumCents, plan })`, `courierFee({ grams, basketCents, plan })`, `feeLines(breakdown, withoutPremium)` returning `{ kind, cents }[]`. Integer cents throughout; round UP on the step; clamp; then the free rule; then the small-order fee. Delete `fee()`, `FeeInputs` and every `factorMilli`. Header comment: this file is the ONLY place fee parts are added (guard P22).
- [X] T011 Break-and-restore P1 (round down instead of up), P4 (apply the free rule before adding the premium line), P6 (leave the surcharge line at the nominal premium when capped); record each for SIGNOFF.

### Schema — M1

- [X] T012 In M1: columns on `public.delivery_fee_plan` and the five constraints per [data-model.md](data-model.md); `same_day_factor` / `standard_factor` `SET DEFAULT 1`; drop `delivery_fee_plan_one_active_uq` and create it as `UNIQUE (kind) WHERE is_active`; rewrite the table COMMENT (the v2 formula; state is derived; the factor columns are unread and dropped at the cutover).
- [X] T013 In M1: create `public.delivery_distance_band` and `public.delivery_slot_premium` per data-model.md with their unique indexes and COMMENTs; grant `SELECT` on both to `effy_shopper` (pattern in `db/migrations/20261005032655_shopper_role.sql`); confirm that role already reads `delivery_fee_plan` and `delivery_weight_band`.
- [X] T014 In M1: `public.delivery_plan_gaps(p_plan uuid) RETURNS TABLE(code text, blocking boolean, detail jsonb) STABLE` returning one row per gap of research R12 (`distance_bands_missing`, `distance_open_band_missing`, `weight_bands_missing`, `distance_not_monotonic` and `weight_not_monotonic` with the two offending bounds — the distance three for Effy plans only — and the non-blocking `floor_is_zero` and `premium_on_disabled_slot`); and `public.delivery_plan_is_complete(p_plan uuid) RETURNS boolean`. ⚠ Value errors (off-step amounts, small-order not below free, a courier plan with distance bands) are NOT gaps — they are CHECKs here and 422 field errors in the service (research R12).
- [X] T015 In M1: `public.delivery_plan_activate(p_plan uuid, p_actor text, p_confirm_zero_floor boolean)` per research R11 — `pg_advisory_xact_lock` on a constant per kind; raise `plan_not_found`, `plan_already_active`, `plan_retired` (activated before, not active now — it is copied, never re-activated), `plan_incomplete` (detail = the blocking gaps as JSON) or `zero_floor_unconfirmed`; then deactivate the current plan of that kind and activate the new one as TWO statements, deactivate first (a single swapping UPDATE can trip the partial unique index on row order), stamping `activated_by/at`; returns the plan row and the retired plan's id. Use distinct SQLSTATEs or `MESSAGE`/`DETAIL` the repository can read without parsing prose.
- [X] T016 **Withdrawn during implementation** — the platform's trigger guard (`shop/src/db/triggers.guard.test.ts`, 058 R6) allows triggers only to mark analytics buckets and never to raise inside another writer's transaction; immutability is held by `pricing.repository.ts` under the row lock and proven by P9. Originally: In M1: a trigger function `public.delivery_plan_immutable()` — on `delivery_fee_plan`, refuse `DELETE` and any `UPDATE` that changes a pricing column once `activated_at IS NOT NULL` (allow `is_active`, `activated_by`, `activated_at`); on `delivery_distance_band` and `delivery_weight_band`, refuse `INSERT`/`UPDATE`/`DELETE` when the parent plan has `activated_at`; on `delivery_slot_premium` refuse `INSERT`/`UPDATE` only — a `DELETE` must stay possible so that deleting a window cascades its premium (data-model.md). ⚠ Created AFTER the carry-over of T017 runs, so the carry-over can write bands onto the active plan.
- [X] T017 In M1, the carry-over (data-model "Migration 1 — data steps"): FIRST `RAISE EXCEPTION` if the active plan's `standard_factor <> 1`, naming the value (research R10); then for every plan insert one distance band per `delivery_ring_price` row joined to an ACTIVE `delivery_ring` (`upper_km = suggest_upper_km`, NULL for the open-ended ring; `add_amount = price_amount`), `RAISE NOTICE` the count skipped for disabled rings; then, inside `-- +goose ENVSUB ON` / `OFF` around that one statement only, read `EFFY_TODAY_PREMIUM` into the ACTIVE plan's `today_premium_amount` — `RAISE EXCEPTION` if it is empty, still the literal placeholder, not a non-negative 2-dp amount, or not a multiple of the plan's `rounding_step`; then `RAISE EXCEPTION` listing `delivery_plan_gaps` if the active plan is not complete; then one `admin.audit_log` row (`actor_sub = 'migration:077'`, `action = 'pricing.migrate_077'`). A database with NO active plan (a fresh one) skips the premium step without raising.
- [X] T018 In M1: `ALTER TABLE public."order" ADD COLUMN delivery_fee_breakdown jsonb` with a COMMENT (what it holds; never recomputed; NULL before 077) and rewrite the COMMENT on `"order".delivery_fee_amount` (the delivery TOTAL, small-order fee included) and on `"order".delivery_quote`; `order_package_delivery.delivery_fee_amount DROP NOT NULL` (`shop_fulfillment`'s is already nullable); rewrite both per-package fee COMMENTs ("unwritten since 077; dropped at the cutover"). Write the Down.

### Shared library

- [X] T019 Rewrite `EA/shared/src/delivery/plan.ts`: `PlanKind`, `Plan` (id, name, kind, the engine's `EffyPlanValues`/`CourierPlanValues`, `todayPremiumCents`, `slotPremiumCents: ReadonlyMap<slotId, cents>`); `loadActivePlan(q, kind = "effy")` and `loadPlan(q, id)` — the plan row, distance bands, weight bands, premiums; keep `NoActivePlanError`. Remove ring prices, both factors, `factorMilli` and `parseMilli`. Keep `METHOD_SAME_DAY` / `METHOD_STANDARD` (the same-day bridge still needs them until E5).
- [X] T020 Write the release-safety tests FIRST in a new `EA/shared/src/delivery/fee.container.test.ts`: **P15** — on a database migrated to just before M1 and seeded with three rings (one open-ended), an active plan pricing all three and a draft pricing two, apply M1 with `EFFY_TODAY_PREMIUM=3.00`: every plan's bands equal its ring prices, the active plan is complete and has the premium; applying it with the variable unset raises and leaves the schema untouched; so does a `standard_factor` of 1.2. ⚠ The container harness slices SQL on `-- +goose Up` and never runs goose, so it does not substitute variables: teach the harness helper to replace `${EFFY_TODAY_PREMIUM}` from an option for the ordinary runs, AND run P15 itself through the real `goose` binary against the container (`goose up-by-one`, skipped with a clear message when goose is not installed) — that is the only proof the `ENVSUB` toggling leaves the `$$` bodies intact. **P16** — for a table of postcodes whose `distance_km` lies inside their zone's ring, the standard fee from the pre-M1 code path (the 047 arithmetic re-stated in the test, factor 1) equals `effyFee` after. **P17** — a same-day quote = the standard fee + the today premium. **P10** — a postcode inserted at 900 km quotes a fee with no plan change. **P3** — one package of 6 kg vs five packages totalling 6 kg → the same fee.
- [X] T021 Rewrite the pricing half of `EA/shared/src/delivery/quote.ts` (research R4/R5): take `basketCents` as a new argument; read `distanceKm` from `coverageForPostcode` (no second query on the list); total the packages' grams; compute `standardFee = effyFee(premium 0)` and, for each open slot, `effyFee(premium = todayPremium + slotPremium)` — each returned with its breakdown and `feeLines`. `QuoteResult` (serviced) gains `standardFee`, `slotFees: Map<slotId, PricedFee>`, `freeDeliveryRemainingCents | null`, loses `ringId` and `standardTotalCents`. `PackageQuote.options` keeps the METHODS a package can have (same-day bridge) but no fee. Rename `ServedZoneUnpricedError` → `ListedPostcodeUnpricedError(planId, postcode)`, thrown when the distance is null or the engine throws `UnpricedDistanceError`. Remove `feeInputs`, `feeFor`'s fee, `standardFeeCents`.
- [X] T022 In `EA/shared/src/delivery/zone.ts` remove `ringId` and the `coverage_ring_for_km` COALESCE from `zoneForPostcode` (the fee-tier bridge ends here); grep `apis`, `apps` and `packages` for `hub_distance_km`, `ring_is_overridden`, `suggested_ring_id` and `coverage_ring_for_km` and remove every remaining read (M2 drops them); keep the same-day bridge and say in the comment that E5 removes it. Update `quote.test.ts`, `reads.container.test.ts` and `coverage.container.test.ts` for the new shapes.
- [X] T023 Break-and-restore P15 (carry bands from disabled rings too), P16 (make every postcode take the open band), P3 (price per package again); record each.

**Checkpoint**: M1 applies on a fresh database and on a pre-077 one; `pnpm --filter @effy/edge-shared test` passes with `CONTAINER_TESTS=1`.

---

## Phase 3: User Story 1 — A fee that follows distance and weight, once per order (P1) 🎯 MVP

**Goal**: the live checkout charges one fee per order from the new engine.
**Independent test**: price identical baskets at a near and a far postcode, a light and a heavy basket at one postcode, and the same goods from one shop and from three; each fee matches the plan by hand.

- [X] T024 [US1] In `EA/commerce/src/checkout/delivery-choice.ts`: `resolveDeliveryChoice` keeps deciding each package's METHOD, day and window as now, and additionally returns ONE `fee: PricedFee` for the order — the chosen slot's fee when any package goes same-day, else `standardFee`. `PackageDelivery` loses `feeCents`.
- [X] T025 [US1] In `EA/commerce/src/checkout/quote.ts`: `DeliveryQuoter` gains the basket value; `quoteForCheckout` computes it with `basketValueCents` from the cart lines and the cart's applied promo (the same `deps.promos` the intent uses — inject it); `toQuoteDTO` emits `standardFee`, each slot's `surchargeAmount` and `fee`, `freeDeliveryRemainingAmount`, and the compatibility `packages[].options[].feeAmount` exactly as research R4 states it (standard: the fee on `pkg-1`, zero elsewhere; same_day: on the first package that offers it, the DEAREST open slot's fee less what standard-only packages contribute; zero elsewhere); `capturedQuote` stores the order-level fees and per-slot fees with their breakdowns, shop-keyed methods as before.
- [X] T026 [US1] In `EA/commerce/src/checkout/service.ts`: pass `basketValueCents(itemSubtotalCents, discount.cents)` to the quoter; take `deliveryFeeCents` from the resolved order fee's `totalCents` (delete the per-package reduce); pass the breakdown to the store; catch `ListedPostcodeUnpricedError` where `ServedZoneUnpricedError` was (same metric, same 503); add `emitMetric(ns(), "FreeDeliveryOrders")` when `freeApplied`, and a bounded `premium: "none" | "today" | "slot" | "both"` dimension on `DeliveryQuotes`; return `deliveryFee` (lines + total) on both intent responses.
- [X] T027 [US1] In `EA/commerce/src/checkout/store.ts`: `OrderAmounts` gains `deliveryFeeBreakdown`; the order INSERT and UPDATE write `delivery_fee_breakdown = $n::jsonb` (shape of data-model.md, `v: 1`); the `order_package_delivery` insert writes `delivery_fee_amount = NULL`.
- [X] T028 [US1] In `EA/shared/src/payments/finalize.ts` step 2b stop copying `delivery_fee_amount` onto `shop_fulfillment` (keep `delivery_method`); update the comment.
- [X] T029 [US1] Update `EA/commerce/src/checkout/checkout.container.test.ts`, `checkout.guard.test.ts` and `wire.contract.test.ts` for the new quote and intent shapes; add **P26** — a pre-077 client's sum (the chosen method's option per package, standard where same-day is not offered) is never LESS than the order's charge: three packages all standard; all same-day; mixed with `pkg-1` standard-only; and a chosen slot that is not the dearest.
- [X] T030 [P] [US1] `CW/lib/delivery-choice.ts`: read the order-level fee (`standardFee`, or the chosen slot's `fee`) instead of summing package options; fall back to the old sum only when `standardFee` is absent. Update `CW/lib/*.test.ts` and the `CheckoutFlow.*.test.tsx` fixtures.
- [X] T031 [P] [US1] `CM/checkout/domain/Checkout.kt` and `CM/checkout/data/CheckoutMappers.kt`: model `DeliveryFee(lines, total)` on the quote and on each slot; the checkout total reads it; update `CheckoutMappersTest.kt`.

**Checkpoint**: an order placed in a test database carries one fee, a breakdown, and NULL per-package fees.

---

## Phase 4: User Story 8 — Release day changes no fee by accident (P1) 🎯 part of MVP

**Goal**: the carried-over plan is live with no staff action, and every moved fee was seen beforehand.
**Independent test**: the pre-flight lists exactly the postcodes whose tier differs from their distance; every other postcode's standard fee is unchanged; same-day costs the premium more.

- [X] T032 [US8] Write `specs/077-delivery-fee-engine-v2/preflight.sql` — read-only, runnable BEFORE M1: first the active plan's `standard_factor` with a line saying anything but 1 stops the release; then, for every listed postcode, the tier it is priced on today (`COALESCE(z.ring_id, public.coverage_ring_for_km(zp.distance_km))`) against the tier its own distance falls in; output only the rows that differ, with postcode, group, distance, both tier names and the active plan's 1 kg standard fee before and after. A header comment says what zero rows means.
- [X] T033 [US8] Add a container test in `fee.container.test.ts` that runs `preflight.sql` on the P16 fixture plus one postcode deliberately placed in the wrong tier, and asserts it returns exactly that postcode and that P16's "unchanged" set is the complement.
⚠ M2 — the migration that drops the tier tables — is T034/T035, written in the last phase: test harnesses apply every migration file, so it cannot exist while any package still reads a tier.

---

## Phase 5: User Story 2 — Basket value changes the fee (P1)

**Goal**: free delivery over an amount, a small-order fee under another, and the "spend more" hint.
**Independent test**: baskets just under, at and over each amount give the right fee, lines and hint.

- [X] T036 [US2] Add to `EA/commerce/src/checkout/checkout.container.test.ts`: with `free_over = 80.00`, `small_under = 20.00`, `small_fee = 3.00` — baskets of 19.99, 20.00, 79.99, 80.00; a 85.00 basket with a 10.00 promo (value 75.00 → not free); an 80.00 basket paid half with points (still free); each asserting the order's `delivery_fee_amount`, the stored lines and `freeDeliveryRemainingAmount` on the quote.
- [X] T037 [US2] `EA/storefront/src/functions/serviceability-v1-get.ts`: when coverage is `effy`, add `offer` from the active Effy plan (`loadActivePlan`); absent on `courier`/`none`; a missing active plan omits `offer` and never fails the route. Keep the existing cache header. Test in the storefront package.
- [X] T038 [P] [US2] `CW/components/delivery/FreeDeliveryHint.tsx` (new): from `offer` and the cart subtotal after promo, render `DELIVERY_FEE_WORDS.spendMore` / `.freeReached` (never a second wording), or nothing when no amount is set or no delivery postcode Effy serves has been chosen; and a small-order notice with the fee when the basket is under the line. Tokens only; no card. Use it in the cart (the file under `CW/app/(shop)/` that renders the totals beside "Delivery calculated at checkout") and in checkout (driven there by `freeDeliveryRemainingAmount`). Component test.
- [X] T039 [P] [US2] `CM/cart` (the cart summary composable and its ViewModel) and `CM/checkout/presentation/CheckoutScreen.kt`: the same hint and small-order notice from the same fields; ViewModel test in `commonTest`.

---

## Phase 6: User Story 5 — The customer sees what they pay, and pays what they saw (P1)

**Goal**: named lines before payment, the same lines afterwards, and no charge the customer was not shown.
**Independent test**: a basket that triggers every line, taken through web and mobile; cart, checkout, charge, order page, receipt and email agree — and still agree after another plan is activated.

- [X] T040 [US5] `EA/commerce/src/checkout/service.ts` + the intent handler: when `shownDeliveryAmount` is present and differs from the computed delivery total, write nothing, `emitMetric(ns(), "DeliveryFeeChanged")` and return 409 `delivery_fee_changed` with a fresh quote (the 069 delivery-choice refusal path is the pattern). Validate the field as a 2-dp amount in the handler. **P13** in `checkout.container.test.ts`: a stale amount leaves the order row, the points hold and the slot hold exactly as they were.
- [X] T041 [US5] `EA/commerce/src/orders/repository.ts` + `service.ts`: select `delivery_fee_breakdown->'lines'` and return `deliveryFee { lines, totalAmount }` on the customer order and receipt view; absent when the column is NULL. ⚠ Select the `lines` key only — never the whole column. Test.
- [X] T042 [US5] `EA/notifications/src/receipts/repository.ts` + `sender.ts`: read the lines; pass `deliveryLines: { label, amount }[]` (labels from `DELIVERY_FEE_LINE_LABEL`, the free-delivery line as a negative amount) and keep `hasDeliveryFee`/`deliveryFee` for orders without a breakdown. A $0.00 delivery total with a free-delivery line IS printed (it is a claim the customer was sold); a missing fee is still omitted.
- [X] T043 [US5] `packages/email-kit`: `src/catalog.ts` (the new variable), `src/components/rows.mjml` and `src/text/order-confirmation.txt.hbs` (one row per line, falling back to the single row), both fixtures including the hostile one, `test/order-confirmation.test.ts`; rebuild `dist/` and `templates.generated.ts` with the package's build script.
- [X] T044 [P] [US5] `CW/components/delivery/DeliveryFeeLines.tsx` (new): renders a `DeliveryFeeDTO` as rows using `DELIVERY_FEE_LINE_LABEL`, the free-delivery row in `--success` on its `-soft` tint, no zero rows. Use it in `CW/app/checkout/CheckoutFlow.tsx` (order summary) and `PaymentStep.tsx`, and in `CW/components/receipt/ReceiptDocument.tsx` (falling back to the single `deliveryFeeAmount` row). Tests incl. `ReceiptDocument.test.tsx`.
- [X] T045 [US5] `CW/app/checkout/CheckoutFlow.tsx` + the intent call: send `shownDeliveryAmount`; on 409 `delivery_fee_changed` replace the quote with the one returned, show `DELIVERY_FEE_WORDS.feeChanged` above the summary and require the customer to press pay again. Test in a new `CheckoutFlow.fee.test.tsx`.
- [X] T046 [P] [US5] `CM/checkout/presentation/CheckoutScreen.kt`, `CheckoutViewModel.kt`, `ReceiptScreen.kt`: the same lines composable, `shownDeliveryAmount` on the intent, the same refusal handling and sentence. ViewModel tests.
- [X] T082 [US5] `CM/checkout/presentation/DeliveryFeeWords.kt` (new): the four line labels and the four sentences of `DELIVERY_FEE_WORDS`, mirrored from `ST/delivery.ts`; a `commonTest` reads the TypeScript file and fails if any differs (copy `CoverageWords.kt` and its test). T039 and T046 use it — no label or sentence literal anywhere else in the app.
- [X] T047 [US5] **P25**: one quote fixture and one order fixture in `packages/shared-types/contract/fixtures/` rendered by a `CW` test and a `CM` `commonTest`, each asserting the same ordered list of `label: amount` strings.
- [X] T048 [US5] **P14** in `checkout.container.test.ts`: place an order, activate a different plan, correct the postcode's distance, remove the postcode from the list — the order's `delivery_fee_amount`, `delivery_fee_breakdown`, customer order view and receipt variables are byte-identical each time.
- [X] T049 [P] [US5] `EA/orders/src/orders/repository.ts` + `service.ts`: return `deliveryFeeBreakdown` (the whole stored object) on the staff order detail. `BO/orders/components/FeeBreakdown.tsx` (new) + `OrderDetailScreen.tsx`: a "How this fee was built" section — a detail list of the steps (plan name, distance and band, weight and band, surcharge, rounding, minimum/maximum applied, free delivery, small-order fee, total); hidden for orders without a breakdown. Test.
- [X] T050 [P] [US5] Shop (research F1/R14): remove `deliveryFee` from `EA/shop/src/orders/repository.ts` (query and mapper) and `types.ts`, from `ST/shop-order-console.ts`, and the "Shipping" `TotalRow` plus fixture from `apps/shop-web/src/features/fulfillment/`. Update the shop tests. Regenerate contracts if the shop DTO is in a generated schema.
- [X] T051 [US5] PostHog: add `delivery_fee_viewed { free: boolean; small_order: boolean; surcharge: boolean }` to the shared event taxonomy (where `checkout_*` events are declared for web and for mobile) and fire it once per quote shown at the delivery step on both surfaces. No amounts.

---

## Phase 7: User Story 3 — A plan cannot go live unless it prices everything (P1)

**Goal**: staff build plans, save drafts, and activate only complete ones, with the gap named.
**Independent test**: each kind of gap refuses activation with its sentence; a fixed plan activates and the old one retires; exactly one plan is active throughout.

- [X] T052 [US3] Create `EA/admin/src/delivery/pricing.repository.ts`: `listPlans(kind)`, `readPlan(id)` (plan + bands + premiums joined to `delivery_slot` for label and status + `delivery_plan_gaps`), `createPlan(input, sub)` and `replaceDraft(id, input, sub)` (one transaction: plan row, delete-and-insert bands and premiums, audit row with before/after), `activatePlan(id, sub, confirmZeroFloor)` (calls `delivery_plan_activate`, maps its errors, writes the audit row naming the retired plan in the same transaction). Raw SQL; rows mapped to domain types in a new section of `types.ts`.
- [X] T053 [US3] Create `EA/admin/src/delivery/pricing.service.ts`: value validation returning `fields[]` (name required and unique; amounts are non-negative 2-dp; step > 0; floor ≤ cap, both multiples of the step; band uppers positive and distinct; at most one open distance band; amounts that must sit on the step do; small-order under is below free-over; a courier plan carries no distance bands, premiums or small-order fee — every rule the table CHECKs hold is refused here first as a named field, so a CHECK violation never reaches a client as a 500); `replaceDraft` refuses `plan_not_draft`; role rules via the existing `authz.ts` (`admin`/`manager` write, `csa` reads). Gaps are RETURNED on the saved draft, never a refusal to save.
- [X] T054 [US3] Handlers in `EA/admin/src/functions/`: rewrite `delivery-plans-list-v1-get.ts` (`?kind=`), `delivery-plans-create-v1-post.ts`, `delivery-plan-activate-v1-post.ts` (body `confirmZeroFloor`; 409s per contracts); add `delivery-plan-update-v1-put.ts`. After each committed write call `announce("pricing")` from `@effy/edge-shared/live`. Extend `handler-support.ts` with the DTO mappers.
- [X] T055 [US3] `EA/admin/serverless.yml`: add `deliveryPlanUpdateV1` (`PUT /admin/v1/delivery/plans/{planId}`) on the staff gateway with the back-office authorizer, copying the neighbouring plan functions' shape. Run `gateway-capacity.contract.test.ts` and the admin `config.contract.test.ts`.
- [X] T056 [US3] Tests in new `EA/admin/src/delivery/pricing.service.test.ts` and `pricing.container.test.ts`: **P7** — a draft built to have each of the seven gap codes returns it, activation refuses each of the five blocking ones with the gaps in the body, and each value error (off-step amount, small-order ≥ free, courier plan with a distance band) is a 422 naming its field; **P8** — two concurrent `activatePlan` calls on different drafts leave exactly one active plan and at no observed moment zero (poll in a third connection); **P9** — direct SQL `UPDATE` and `DELETE` on an activated plan and on its bands are refused by the trigger, a retired plan cannot be activated (`plan_retired`), and no route deactivates or deletes the only active plan; `zero_floor_unconfirmed` then success with confirmation; **P23** — csa lists, cannot create/update/activate; **P24** — each write leaves one audit row with before and after.
- [X] T057 [US3] Remove the 047 plan and ring code from `EA/admin/src/delivery/repository.ts`, `service.ts`, `types.ts`, `service.test.ts` (plans, ring prices, `planPricedRingIds`, `listRings`); delete `EA/admin/src/functions/delivery-rings-list-v1-get.ts` and its `serverless.yml` function and the comment above the coverage block that explains why it stayed.
- [X] T058 [P] [US3] `infra/envs/dev/live.tf`: add `"pricing"` to `live_kinds`. `EA/…/change-map.guard.test.ts`: register the three plan routes that write (create, update, activate) as announcing `pricing`.
- [X] T059 [US3] Back-office data layer — `BO/delivery/repo.ts`, `queries.ts`, `access.ts`, `errorText.ts`: plan list/create/update/activate calls and query keys `["delivery","plans",kind]`; remove ring calls and, with T057, the 047 plan and ring types from `ST/delivery-admin.ts` (rename `FeePlanV2DTO` → `FeePlanDTO`; regenerate contracts); `BO/delivery/pricing/gapText.ts` (new) mapping each `PlanGapCode` + `detail` to the sentence in contracts "Plan gap codes"; `BO/live/routes.ts`: `pricing` → those keys. Tests for `gapText` (every code has a sentence — a `Record<PlanGapCode, …>` so a new code fails to compile).
- [X] T060 [US3] `BO/delivery/pricing/PlansTable.tsx` (new): a table of plans for the selected kind (Effy | Courier, a segmented control) — name, state pill (active → brand, draft → muted, retired → muted), activated by/when, a gaps count; row actions Open, Copy to new draft, Activate. Wire it into `BO/delivery/DeliveryScreen.tsx` as the Pricing section, replacing the old plans block; delete `BO/delivery/components/NewPlanDialog.tsx`.
- [X] T061 [US3] `BO/delivery/pricing/PlanEditor.tsx` + `BandsTable.tsx` (new): a sectioned page (no cards) — Amounts (base, step, minimum, maximum) · Distance bands (rows "up to N km", last row "and beyond", add/remove) · Weight bands (rows "up to N kg", last row labelled "and above") · Basket rules (free delivery over; small-order under + fee) · saved with TanStack Form; read-only for active/retired plans and for csa, with "Copy to new draft"; `GapList.tsx` under the header listing the saved draft's gaps in sentences.
- [X] T062 [US3] `BO/delivery/pricing/ActivateDialog.tsx` (new): names the plan it will retire; when `floor_is_zero` is among the gaps shows a checkbox that must be ticked (sends `confirmZeroFloor`); on 409 `plan_incomplete` renders the returned gaps as sentences. Component tests for T060–T062: a gap refusal shows its sentence; csa sees no write control; an active plan's fields are disabled.
- [X] T063 [US3] Break-and-restore P7 (drop the monotonic check), P8 (remove the advisory lock AND the unique index in a scratch database), P9 (drop the trigger); record each.

---

## Phase 8: User Story 4 — Staff try a plan before it goes live (P1)

**Goal**: any plan, any inputs, the fee and every step — and nothing saved.
**Independent test**: the same inputs against a draft and the active plan give two explained fees; the active one equals a real basket's.

- [X] T064 [US4] `pricing.service.ts` `simulate(request)`: resolve coverage with `coverageForPostcode`; `effy` → `loadPlan(planId)` or the active Effy plan, `effyFee` with the postcode's distance and `premium = (windowIsToday ? today : 0) + slot premium`; `courier` → the active or given courier plan, `courierFee`; `none` → no fee and a note; a `planId` of the other kind → 422 `plan_kind_mismatch`; unknown postcode → 422. Build `steps[]` from the breakdown (label, detail naming the band bounds, amount) and `fee` from `feeLines`. ⚠ Calls the engine — adds nothing itself. Because courier delivery cannot be switched on yet, also accept `forceKind: "courier"` so staff can test a courier table against any postcode (add it to `FeeSimulationRequest` and contracts).
- [X] T065 [US4] `EA/admin/src/functions/delivery-plans-simulate-v1-post.ts` (new) + `serverless.yml` function `deliveryPlansSimulateV1` (`POST /admin/v1/delivery/plans/simulate`, staff gateway); readable by csa. Announces nothing (it changes nothing) — register it as read-only in `change-map.guard.test.ts`.
- [X] T066 [US4] Tests: **P11** — for a table of inputs, `simulate` against the active plan equals the fee `commerce`'s intent stores for a basket with the same postcode, grams, value and slot (drive both in one container test in `pricing.container.test.ts`); **P12** — row counts of every table are identical before and after a simulation; an unlisted postcode returns the note.
- [X] T067 [US4] `BO/delivery/pricing/FeeSimulator.tsx` (new), a panel in the Pricing section: plan select (default: active), postcode, weight (kg), basket value, window select (None / each active slot) + "today" toggle; result = the customer lines and total, then the steps as a detail list. No write control; available to csa. Component test.

---

## Phase 9: User Story 6 — Some windows cost more (P2)

**Goal**: the today premium and per-window surcharges are set on the plan and shown before a window is chosen.
**Independent test**: a surcharge on one window in an activated plan changes the fee only when that window is chosen.

- [X] T068 [US6] `PlanEditor.tsx`: a Surcharges section (Effy plans only) — "Delivery today" amount, and a table of windows (every `delivery_slot`, active or not, with its times) each with an optional amount; a surcharge on a disabled window is marked "window is switched off"; both validated as multiples of the step. Repository/service already persist them (T052/T053) — add the missing cases to their tests.
- [X] T069 [P] [US6] `CW/app/checkout/DeliveryOptions.tsx`: each window shows "+$N" from `surchargeAmount` when it is above zero, before selection; selecting it swaps the summary to that slot's `fee`. Update `DeliveryOptions.test.tsx` and `CheckoutFlow.slots.test.tsx`.
- [X] T070 [P] [US6] `CM/checkout/presentation/CheckoutScreen.kt` + ViewModel: the same per-window "+$N" and fee swap; test.
- [X] T071 [US6] Container test in `fee.container.test.ts`: a slot premium plus the today premium apply once for an order with two same-day packages; disabling the slot's row leaves the plan loadable and the premium unused; deleting a slot cascades its premium; `delivery_slot` rows are untouched by activating a plan with different premiums.

---

## Phase 10: User Story 7 — Courier delivery has its own price (P2)

**Goal**: a courier table that can be built, activated and simulated, and charged to nobody yet.
**Independent test**: activate a courier table; simulate light and heavy baskets with and without its free amount; Effy's free amount has no effect.

- [X] T072 [US7] `PlanEditor.tsx` for `kind = "courier"`: "Flat amount per order" (the base), weight bands, optional "Free courier delivery over" (empty by default, with a line saying Effy's free-delivery amount does not apply to courier orders), step, minimum, maximum; no distance, basket-fee or surcharge sections. `PlansTable.tsx` shows "No courier table is active" when there is none.
- [X] T073 [US7] `EA/admin/src/delivery/coverage.service.ts`: switching courier delivery ON additionally refuses with `courier_plan_missing` when no courier plan is active (checked after the existing `COURIER_ORDERING_AVAILABLE` refusal). Add the sentence to `BO/delivery/errorText.ts`. **P19** in `coverage.container.test.ts` — with the constant stubbed true and no courier plan, the switch is refused; with one active, it is accepted.
- [X] T074 [US7] Tests: activating a courier plan leaves the active Effy plan active (one per kind); saving a courier plan with a distance band is a 422 naming the field; simulate with `forceKind: "courier"` returns flat + weight and is never free without its own amount.

---

## Phase 11: Polish & cross-cutting

- [X] T075 Guards in new `EA/shared/src/delivery/fee.guard.test.ts`: **P20** — no interface in `ST/delivery.ts`, `ST/checkout.ts`, `ST/order.ts` (customer) has a field matching distance / km / band / grams / plan, and none in `ST/shop-*.ts` matches delivery fee/amount; **P21** — no source file under `apis`, `apps`, `packages` (tests and this guard excepted) mentions `delivery_ring`, `ring_id`, `ringPrice`, `coverage_ring_for_km`, `hub_distance_km`, `ring_is_overridden`, `same_day_factor`, `standard_factor` or `factorMilli`; **P22** — `effyFee`/`courierFee` are the only functions that add fee parts: no file outside `engine.ts` reads `baseCents`/`distanceCents`/`weightCents` to compute a sum, and only `engine.ts` imports the band helpers. Break each once.
- [X] T034 Write M2: first `RAISE EXCEPTION` if `delivery_fee_plan.kind` does not exist or the active Effy plan is not `delivery_plan_is_complete` (M1 not applied, or pricing broken) — ⚠ not "any plan without bands": courier plans and half-built drafts legitimately have none; then drop `public.delivery_ring_price`, `public.coverage_ring_for_km`, the columns `delivery_zone.ring_id`, `suggested_ring_id`, `ring_is_overridden`, `hub_distance_km` (and `delivery_zone_ring_idx`), then `public.delivery_ring`. Rewrite the `delivery_zone` COMMENT. Down recreates empty structures only (lossy; say so).
- [X] T035 Add to `fee.container.test.ts`: M2 applies after M1 and the full quote path still prices; M2 alone on a pre-M1 database raises.
- [X] T076 [P] Sweep comments and docs that still describe the old rule: `EA/shared/src/delivery/index.ts`, `CW/lib/cart-totals.ts` header ("per-package"), `ST/delivery.ts` header, the `shop_fulfillment` readers' comments. No behaviour change.
- [X] T077 [P] `docs/delivery-console-guide.md`: replace the fee-plan and tiers chapters with Pricing (plans, bands, basket rules, surcharges, activation and its messages, the simulator, the courier table); `docs/api/path-assignment.md` if a row changed.
- [X] T078 Run every machine check in [quickstart.md](quickstart.md) top to bottom, including `make validate ENV=dev` and `scripts/check-no-refresh-timers.sh`, `pnpm --filter @effy/design-system test` (token usage on the new screens), and the gateway capacity test; remove test containers.
- [X] T079 Write `specs/077-delivery-fee-engine-v2/SIGNOFF.md` (machine results, each break-and-restore, the operator steps and walks V1–V17 still open) and the 077 entry at the top of `FEATURE-HISTORY.md` with the deploy order and the two-migration rule.
- [X] T080 Update `CLAUDE.md` (driver-logistics block: the fee-tier bridge is gone, "the fee does not vary by slot" no longer holds, one fee per order; the features list) and `docs/prd/2026-10-delivery-model-v2-backlog.md` (E3 built; tick E3-T01…T30 against what was done; note for E5 the compatibility option fees to remove and for E9 the columns left to drop).
- [X] T081 Hand over to the operator: the same-day amount to choose, `preflight.sql`, then the ordered commands from quickstart — with the note that `make db-up` must NOT be used for the first step.

---

## Dependencies & Execution Order

- T082 (the mobile words file) comes before T039 and T046.
- **Phase 1 → Phase 2 → everything.** Within Phase 2: T009 → T010 → T011; T012–T018 in order (one file); T019 after T010 and T013; T020 before T021–T022.
- **US1 (Phase 3)** needs Phase 2. **US8 (Phase 4)**: T032–T033 need only Phase 2. M2 (T034–T035) sits in Polish, after T057 and T075's P21, and is applied last by the operator.
- **US2** needs US1. **US5** needs US1 (T040–T048) — T049 and T050 need only Phase 2.
- **US3** needs Phase 2 only; **US4** needs US3's repository (T052) and, for P11, US1.
- **US6** needs US3 (editor) and US5 (lines). **US7** needs US3 and US4.
- **Polish**: T075's P21 can only pass after T057 and T022; T034–T035 come after it.

```
Phase 1 ─► Phase 2 ─┬─► US1 ─┬─► US8
                    │        ├─► US2
                    │        └─► US5 ─┐
                    └─► US3 ─► US4 ───┼─► US6
                              └───────┴─► US7 ─► Polish
```

## Parallel opportunities

- Phase 1: T003–T007 (five files).
- After US1's backend (T024–T029): T030 (web) ∥ T031 (mobile).
- US5: T044 (web lines) ∥ T046 (mobile) ∥ T049 (staff order panel) ∥ T050 (shop removal).
- US3 backend (T052–T058) ∥ US1/US5 client work — different services and apps.
- US6: T069 ∥ T070. Polish: T076 ∥ T077.

## Implementation strategy

**First working slice = Phases 1–4 (US1 + US8)**: the checkout prices one fee per order from the
carried-over plan, with same-day dearer by the operator's amount. ⚠ It is a build milestone, **not a
release**: there is no intermediate deploy. Do **not** hand one over between US1 and US3: the back-office plan dialog would
be posting a shape the tables no longer take. The operator steps come once, at T081.

Then US2 and US5 (what the customer sees), US3 and US4 (what staff control), US6 and US7 (surcharges on
windows, courier), and the guards last — P21 is the proof that the tier bridge is really gone, and it
gates M2.

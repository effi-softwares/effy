# Tasks: Checkout and Orders — Delivered by Effy vs Courier Delivery

**Input**: Design documents from `specs/079-effy-vs-courier-checkout/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/routes.md](contracts/routes.md), [quickstart.md](quickstart.md)

**Tests**: included. Proofs P1–P23 in the quickstart are part of this feature's definition of done.
Those marked "broken once" there are broken once to see them fail.

**Organization**: by user story (spec.md). Paths are repo-relative. Abbreviations:
`EA` = `apis/edge-api`, `ST` = `packages/shared-types/src`, `BO` = `apps/back-office/src/features`,
`CW` = `apps/customer-web`, `SW` = `apps/shop-web/src/features`,
`CM` = `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile`,
`SM` = `apps/shop-mobile/shared/src/commonMain/kotlin/com/effyshopping/shop/mobile`
(`CMT` / `SMT` = the matching `commonTest` trees), `M1` = `db/migrations/<ts>_order_delivery_type.sql`.

⚠ **Mode of work**: Claude writes the code and SQL; the operator runs `make db-up` and every
`make edge-deploy` (quickstart → Operator steps). No Terraform in this feature.

⚠ **The switch stays off.** Nothing here writes `delivery_settings.delivery_model_v2_from` outside
tests. 078's `windows.guard.test.ts` must stay green **unedited**.

⚠ **Legacy path untouched.** Do not edit the switch-off branch of `EA/shared/src/delivery/quote.ts`,
`resolveDeliveryChoice`, `compatibilityFees`, `sameDayForShops` or `zoneForPostcode` (research R10).
`EA/commerce/src/wire.contract.test.ts` must pass unchanged.

⚠ **M1 is additive.** Nullable columns, a new table, new functions; `coverage_for_postcode` keeps
answering a one-argument call.

⚠ **Known red before this feature** (078 SIGNOFF): `EA/shop/src/attention/repository.container.test.ts`
and `EA/shop/src/orders/repository.container.test.ts` ("pages with a total order…"). See T004.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US9 from spec.md

---

## Phase 1: Setup

- [X] T001 Scaffold M1 with `make db-new name=order_delivery_type`; Down is a dev-only reversal (see T010).
- [X] T002 [P] Create `ST/delivery-type.ts` exactly as [contracts/routes.md](contracts/routes.md) §1: `DeliveryType`, `DeliveryTypeReason`, `DELIVERY_TYPE_WORDS` (reusing `COVERAGE_LABEL` and `DELIVERY_WINDOW_WORDS` values, not retyping them), `OrderDeliveryDTO`, and a `deliverySummary` stub that throws; export from `ST/index.ts`.
- [X] T003 [P] Record the baseline: run the container suites of `shared`, `commerce`, `storefront`, `orders`, `shop`, `admin`, `notifications` and `pnpm -r typecheck` on the untouched tree; note pass counts and any red test in a scratch note for SIGNOFF.
- [X] T004 Investigate the two red `shop` container tests named above on the untouched tree: find the cause; if it is a test/fixture defect, fix it in its own change and note it for SIGNOFF; if it is a product defect outside this feature, record what it is and stop there. Shop work (Phase 8) starts from a known state either way.

---

## Phase 2: Foundational (blocks every story)

**Purpose**: the schema, the one coverage answer, the one "who takes this package" answer, and the
shared shapes every service compiles against.

### Shared contracts

- [X] T005 [P] In `ST/delivery.ts`: add `courier?: { estimate: string; fee: DeliveryFeeDTO; reason: "out_of_coverage" | "no_window" }` to `DeliveryQuoteDTO` with the comment from contracts §2; add `"delivery_type_changed"` to `DeliveryChoiceRefusalCode`; rewrite the two comments that say courier "cannot be purchased until the courier checkout exists" to say when the server returns it (research R1).
- [X] T006 [P] In `ST/checkout.ts`: add `deliveryType?: "effy" | "courier"` to the intent request (contracts §3) and `deliveryType` to the intent response.
- [X] T007 [P] In `ST/order.ts`: add `delivery?: OrderDeliveryDTO` to `OrderDTO` and the order list item; extend the `arrivalEstimates` comment — empty for a courier order (contracts §4).
- [X] T008 [P] In `ST/shop-order-console.ts` and `ST/shop-order.ts`: add `deliveredBy: "effy_driver" | "courier"` wherever `deliveryMethod` appears, mark `deliveryMethod` `@deprecated 079`; add `DELIVERED_BY_WORDS`. In `ST/order-admin.ts`: the list filter, `deliveryType`, `deliveryTypeReason`, `courierEstimate`, `deliveryTypeHistory`, per-package `deliveredBy` (contracts §6). In `ST/delivery-admin.ts`: `CourierReachDTO` fields and the two new `CoverageReason` values (contracts §7).
- [X] T009 Regenerate contracts (`make cm-contract-gen`, `make sm-contract-gen`); run `pnpm --filter @effy/shared-types test` and `pnpm -r typecheck`; fix compile errors by adding the new fields with truthful placeholder values only where a later task in this file fills them (list each in the task's commit note).

### Schema — M1

- [X] T010 Write M1 Up per [data-model.md](data-model.md): the three `"order"` columns with their CHECKs and the partial index; `order_delivery_type_change` with its CHECKs, the partial unique index and `(order_id, created_at)` index; `delivery_settings.courier_estimate_text` (trimmed length 3–60, no line break) and `courier_when_no_windows`; `REVOKE UPDATE, DELETE ON public.order_delivery_type_change` from `effy_shopper` and every service role that 074's migration names; COMMENTs on every new object and rewritten COMMENTs on `order_package_delivery.method` and `shop_fulfillment.delivery_method`. Down drops them (refusing if any order has a `delivery_type`).
- [X] T011 In M1: create `public.courier_reaches_postcode(text, timestamptz)` and `public.package_delivered_by(text, text, uuid)`; `DROP FUNCTION public.coverage_for_postcode(text)` and recreate it as `(p_postcode text, p_at timestamptz DEFAULT now())` calling `courier_reaches_postcode` for an unlisted postcode — the listed branch byte-for-byte as 076's; re-apply 076's COMMENT (extended) and grants. Down restores 076's body.
- [X] T012 Tests **P1, P2** in `EA/shared/src/delivery/coverage.container.test.ts`: every `courier_reaches_postcode` reason (unknown, off, excluded, pending with the switch NULL and with it in the future, not ready ×2, offered); listed postcode is `effy` under every courier setting; the one-argument call. Add **P11** (the `package_delivered_by` truth table, six rows) in a new `EA/shared/src/delivery/delivery-type.container.test.ts`.
- [X] T013 In `EA/shared/src/delivery/coverage.ts`: `coverageForPostcode(q, postcode, now = new Date())` passing `now`; add the two reasons to `CoverageReason`; **delete `COURIER_ORDERING_AVAILABLE`** and its comment block. In `zone.ts`: `serviceableForPostcode` is true for `effy` or `courier`. Update the three former readers to compile: `EA/storefront/src/functions/serviceability-v1-get.ts` (the answer is the function's; drop the mapping), `EA/admin/src/delivery/coverage.service.ts` (remove the constant's refusal; the rest is T058), `EA/admin/src/delivery/pricing.container.test.ts` (remove the mock of the constant).
- [X] T014 Break-and-restore P1 (drop the `delivery_model_v2_at` condition from `courier_reaches_postcode`); note for SIGNOFF.

### Who takes a package — one function, proven neutral

- [X] T015 Replace every "standard and no window" decision with `public.package_delivered_by(o.delivery_type, <method>, opd.slot_id) = 'courier'` (joining `"order" o` where it is not already): `EA/orders/src/orders/repository.ts` (three sites), `EA/orders/src/handoff/repository.ts` (select it; refuse `not_carrier` when it is `effy`, keeping `not_standard`'s code for same-day), `EA/orders/src/orders/promise.ts` (take `deliveredBy`; a courier package with no promised day has no verdict and no handover-due), `EA/orders/src/orders/assignments.ts`, `EA/orders/src/orders/service.ts`. Run the `orders` container suite: it must pass with **no test edited** (every existing order has a NULL type). Add **P12**.
- [X] T016 Create `EA/shared/src/delivery/delivery-type.ts`: `recordDeliveryType(tx, { orderId, to, reason, actor, note })` — reads the order's current type `FOR UPDATE`, inserts the history row (`from` = current or NULL on the first entry, `ON CONFLICT DO NOTHING` on the first-entry index), and on a later change updates the three order columns; header says it is the one writer. Export from `delivery/index.ts`.
- [X] T017 Guard **P13** in `EA/shared/src/delivery/delivery-type.guard.test.ts` (pattern: `windows.guard.test.ts`): `order_delivery_type_change` is named only in `delivery-type.ts` and read-only repositories listed by name; no non-test source contains `COURIER_ORDERING_AVAILABLE`; no file under `orders/src` or `shop/src` contains `slot_id IS NULL` or `slot_id IS NOT NULL`. Break once (a second INSERT) and restore. Add **P14** to `delivery-type.container.test.ts` (UPDATE/DELETE as a service role fail).

---

## Phase 3: User Story 8 — Nothing changes until the switch (P1)

**Goal**: with the switch NULL, checkout, its fees, its orders and the out-of-area refusal are today's.
**Independent test**: arm courier fully with the switch NULL; quote, serviceability and address book all refuse an out-of-area address; the wire contract test is unchanged.

- [X] T018 [US8] **P3** in `EA/commerce/src/checkout/checkout.container.test.ts`: switch NULL + `courier_offered` + active courier table + estimate → out-of-area quote is `serviced:false`; in-area quote equals 078's P9 snapshot; an intent carrying `deliveryType:"courier"` to an in-area address is refused `delivery_type_changed` (after T024) and to an out-of-area address `address_not_covered`. Add the storefront half in `EA/storefront/src/functions/*serviceability*.container.test.ts` (or the nearest existing storefront container test).
- [X] T019 [US8] Break-and-restore P3 (make `coverage_for_postcode` ignore the switch); confirm `wire.contract.test.ts` and `windows.guard.test.ts` are green and unedited.

---

## Phase 4: User Story 2 — Courier delivery outside Effy's area (P1) 🎯 MVP with US1 + US3

**Goal**: an out-of-area address a courier reaches can be quoted, paid for and recorded as a courier order.
**Independent test**: quickstart V5.

- [X] T020 [US2] Write **P4, P5, P6** first in `EA/commerce/src/checkout/checkout.container.test.ts` (switch on, courier armed, a two-shop basket): the quote's `courier` block and empty pickers; fee = `courierFee`, unaffected by the Effy plan's free-delivery amount; the written order, package rows and absence of a booking; both mismatch directions and the absent field → 409, nothing written.
- [X] T021 [US2] In `EA/shared/src/delivery/quote.ts` (v2 and coverage code only): add the courier variant to `QuoteResult` (research R4); `priceCourierOrder(plan, grams, basketCents)` calling `courierFee` and mapping `UnpricedWeightError`; read the estimate with the slot settings loader (`loadSlotSettings` gains `courierEstimateText`, `courierWhenNoWindows`); on `coverage.kind === "courier"` return the courier quote, throwing `CourierNotPurchasableError` only if the plan or estimate is missing (now a true invariant — rewrite its comment). Pass `now` to `coverageForPostcode`.
- [X] T022 [US2] In `EA/commerce/src/checkout/quote.ts`: `toQuoteDTO` for the courier variant (contracts §2 — arrays empty, `effyWindows` absent, `freeDeliveryRemainingAmount` from the courier table); `capturedQuote` for it. Narrow every existing use of `ServicedQuote` to the Effy variant by `coverage`.
- [X] T023 [US2] In `EA/commerce/src/checkout/delivery-choice.ts`: `resolveCourier(q)` → packages `{method: METHOD_STANDARD, promisedDay: "", slotId: null, windowStart: null, windowEnd: null}`, `hold: null`, the courier fee.
- [X] T024 [US2] In `EA/commerce/src/checkout/service.ts`: accept `deliveryType`; immediately after the quote and **before anything is written**, compare with the quote's type and throw `DeliveryChoiceError("delivery_type_changed")` on a mismatch or on a courier quote without the field; branch to `resolveCourier`; pass `{ type, reason, courierEstimate }` to the store; return `deliveryType`. Metrics: `DeliveryQuotes` outcome `courier`, `DeliveryTypeChanged`. Wire the field through `EA/commerce/src/functions/` intent handler and `respond.ts` (409 with a fresh quote).
- [X] T025 [US2] In `EA/commerce/src/checkout/store.ts`: `captureDelivery` takes the delivery type and writes `delivery_type`, `delivery_type_reason`, `courier_estimate` in the same `UPDATE "order"` as the quote (Effy: `effy` / `in_coverage` / NULL).
- [X] T026 [US2] In `EA/shared/src/payments/finalize.ts`: after the paid guard, `recordDeliveryType` for the first entry (actor `checkout`) when the order has a type; emit `OrdersPlaced {deliveryType}` where the service emits its placed metric. **P8** in the finalize container test (replayed twice → one row; a pending order has none; a legacy-path order has none). Check the points-only placement path reaches the same code.
- [X] T027 [US2] Break-and-restore P4 (price with the Effy plan), P5 (take a hold), P6 (trust the client's type), P8 (drop the conflict target).
- [X] T028 [P] [US2] Web: create `CW/app/checkout/CourierDelivery.tsx` (heading, the two `DELIVERY_TYPE_WORDS` lines with the estimate, the fee lines — text only, no card); render it from `CW/app/checkout/CheckoutFlow.tsx` when `quote.courier` is present; send `deliveryType`; handle `delivery_type_changed` like `delivery_fee_changed` (re-render from the fresh quote, say the delivery option changed). Update `CW/lib/delivery-choice.ts`. Tests in `CW/app/checkout/CourierDelivery.test.tsx` and `CheckoutFlow.*.test.tsx` (**P21**, courier half).
- [X] T029 [P] [US2] Mobile: `CM/features/checkout/domain/Checkout.kt` + `data/CheckoutMappers.kt` (courier block, `deliveryType`, the new refusal); `presentation/CheckoutViewModel.kt` + `CheckoutScreen.kt` (courier section, 48 dp targets unchanged); new `presentation/DeliveryTypeWords.kt`. Tests in `CMT/features/checkout/` (**P22**, courier half) from the same quote JSON as T028.

---

## Phase 5: User Story 1 — Delivered by Effy is a recorded fact (P1)

**Goal**: an in-area order is recorded `effy` / `in_coverage` and the checkout says "Delivered by Effy".
**Independent test**: quickstart V4.

- [X] T030 [US1] Extend the v2 Effy tests in `EA/commerce/src/checkout/checkout.container.test.ts`: intent with a window (today, later day) writes `delivery_type = 'effy'`, reason `in_coverage`, estimate NULL; payment writes one history entry; `deliveryType: "effy"` and absent are both accepted.
- [X] T031 [P] [US1] Web: heading "Delivered by Effy" above 078's sections in `CW/app/checkout/EffyWindowOptions.tsx`; send `deliveryType: "effy"` from `CheckoutFlow.tsx`. Test in `EffyWindowOptions.test.tsx`.
- [X] T032 [P] [US1] Mobile: the same heading in `CM/features/checkout/presentation/CheckoutScreen.kt`; send `deliveryType`. Test in `CMT/features/checkout/`.

---

## Phase 6: User Story 3 — Nobody reaches the address (P1)

**Goal**: one refusal sentence, no payment by any route.
**Independent test**: quickstart V7.

- [X] T033 [US3] Tests in `EA/commerce/src/checkout/checkout.container.test.ts` (switch on): excluded postcode, courier switched off, no active courier table, estimate NULL → quote `serviced:false`, intent `address_not_covered`, nothing written. Confirm `coverage.guard.test.ts` still holds the one sentence.
- [X] T034 [P] [US3] Web and mobile: confirm the existing refusal rendering shows no delivery heading, fee or pay button for `coverage: "none"` under the v2 shapes; add one test each (`CW/app/checkout/CheckoutFlow.address.test.tsx`, `CMT/features/checkout/`).

---

## Phase 7: User Story 4 — Changing the address re-decides everything (P1)

**Goal**: type, fee, total and window follow the selected address; nothing carries over.
**Independent test**: quickstart V6.

- [X] T035 [US4] **P7** in `EA/commerce/src/checkout/checkout.container.test.ts`: intent for address A (Effy, window) then for address B (courier) on the same pending order → booking row gone, package rows replaced, type and fee flipped; and B → A leaves no courier estimate. Break once (skip the booking delete) and restore.
- [X] T036 [P] [US4] Web: in `CW/app/checkout/CheckoutFlow.tsx` reset the chosen window, the shown delivery amount and any points amount derived from the total whenever the selected address id **or its postcode** changes, then re-quote; returning to an Effy address shows nothing selected. Tests in `CheckoutFlow.address.test.tsx` (**P21**; break once by keeping the window).
- [X] T037 [P] [US4] Mobile: the same in `CM/features/checkout/presentation/CheckoutViewModel.kt`; tests in `CMT/features/checkout/` (**P22**).
- [X] T038 [US4] Telemetry: `checkout_delivery_type_shown {type, reason}` in the shared taxonomy, `CW/lib/telemetry.ts` (emitted once per distinct answer per checkout) and declared in `CM/core/observability/AnalyticsEvent.kt`.

---

## Phase 8: User Story 6 — Shops see who takes the package (P2)

**Goal**: "Effy driver" / "Courier" on every shop surface; the old words gone; still no window or money.
**Independent test**: quickstart V2.

- [X] T039 [US6] In `EA/shop/src/orders/{repository,types}.ts`, `EA/shop/src/today/{repository,types}.ts`, `EA/shop/src/pick-lists/repository.ts`: select `public.package_delivered_by(o.delivery_type, sf.delivery_method, opd.slot_id)` (LEFT JOIN `order_package_delivery opd` on order + shop where missing) and map to `deliveredBy` (`effy` → `effy_driver`); add the `deliveredBy` list filter beside `method`. ⚠ Select the function's result only — never `slot_id`, a window or a day.
- [X] T040 [US6] **P17** in the `shop` container tests: all six package kinds of P11 through list, detail, today and pick lists; extend `EA/shop/src/delivery-isolation.contract.test.ts` so `deliveredBy` is allowed and a window, day, estimate or delivery amount still fails.
- [X] T041 [P] [US6] shop-web: print `DELIVERED_BY_WORDS[deliveredBy]` (neutral badge) in `SW/fulfillment/components/ItemsAndFulfilment.tsx`, `SW/fulfillment/OrderDetailScreen.tsx`, `SW/fulfillment/orderConsole.ts`, `SW/fulfillment/pickList.ts`, `SW/today/model.ts`, `SW/today/printPickLists.ts`; switch the list filter and any grouping to `deliveredBy`. Update their tests.
- [X] T042 [P] [US6] shop-mobile: `SM/features/orders/domain/OrderModels.kt` and its mappers and screens use `deliveredBy`; words twin pinned to `ST/delivery-type.fixtures.json`. Tests in `SMT/features/orders/`.
- [X] T043 [US6] Guard **P18**: `scripts/check-shop-delivery-words.sh` fails on `same-day`, `same day`, `Same-day`, `Standard delivery` or a `"standard"` label in non-test UI source under `apps/shop-web/src` and `apps/shop-mobile/shared/src/commonMain`; wire it where `check-no-refresh-timers.sh` is wired. Break once and restore.

---

## Phase 9: User Story 5 — The customer reads the same thing everywhere (P2)

**Goal**: one summary of an order's delivery on list, detail, progress, receipt, email, notifications.
**Independent test**: quickstart V4, V5, V8 (estimate kept).

- [X] T044 [US5] Implement `deliverySummary` in `ST/delivery-type.ts` (contracts §1 table) on `distinctArrivals` + `formatArrival`; write `ST/delivery-type.fixtures.json` (courier, same-day, later-day, legacy split, legacy unconfirmed) and `ST/delivery-type.test.ts` (**P16**, TS half; also asserts the word constants equal the fixture's).
- [X] T045 [US5] In `EA/commerce/src/orders/{repository,service}.ts`: `delivery` on list and detail (absent when the order's type is NULL); `arrivalEstimates: []` for a courier order. **P9** (commerce half): change `courier_estimate_text` after the order → the order still returns the sold text.
- [X] T046 [US5] In `EA/notifications/src/receipts/{repository,sender}.ts`: read the order's type and kept estimate; build the delivery section from `deliverySummary` (delete `methodLabel`). Update `sender.test.ts` and the `packages/email-kit/src/fixtures` receipt fixtures; **P9** (email half).
- [X] T047 [US5] **P15**: rows in `EA/shared/src/status/status.test.ts` — a courier package (collected, checked in, handed over) reads With driver → At hub → With carrier and never Out for delivery; an Effy later-day package never reads With carrier. Add a test in `EA/notifications/src/worker/copy.test.ts` (or `drain.test.ts`) that a courier order's journey raises no "Out for delivery" notification. No production change expected — if one is needed, stop and record why.
- [X] T048 [P] [US5] Web: `CW/components/receipt/ArrivalPanel.tsx`, the order list and order detail pages, the checkout complete page and `CW/app/checkout/_components/status-palette.ts` print `deliverySummary`; tests beside each.
- [X] T049 [P] [US5] Mobile: Kotlin twin of `deliverySummary` in `CM/features/checkout/presentation/DeliveryTypeWords.kt`; used by `ReceiptScreen.kt` and the orders list/detail screens; fixture test in `CMT/` against `ST/delivery-type.fixtures.json` (**P16**, Kotlin half; break once by editing one sentence). Decide `TrackOrderScreen.kt`: if still unreferenced, delete it.

---

## Phase 10: User Story 7 — Back-office sees, filters and audits (P2)

**Goal**: a Delivery column and filter; type, reason, estimate and history on the order; courier settings.
**Independent test**: quickstart V3, V8.

- [X] T050 [US7] In `EA/orders/src/orders/{repository,service}.ts` and the list handler under `EA/orders/src/functions/`: `deliveryType=effy|courier|legacy` filter (422 on anything else), `deliveryType` on rows; detail adds reason, estimate, per-package `deliveredBy` and `deliveryTypeHistory` (read-only query on the history table, staff names resolved as other audit lists do). **P19** in the `orders` container tests.
- [X] T051 [US7] In `EA/admin/src/delivery/coverage.{service,repository}.ts`: `GET` returns `estimateText`, `whenNoWindows`, `blockedBy`, `pending`, `canBeOffered`; `PUT …/courier` accepts any of `offered`, `estimateText`, `whenNoWindows` with the refusals of contracts §7, audited, announcing as today. In `EA/admin/src/delivery/pricing.service.ts`: refuse deactivating (or replacing with none) the active courier table while `courier_offered` (`409 courier_plan_in_use`). The staff checker shows the two new reasons. **P20** in `EA/admin/src/delivery/coverage.container.test.ts`.
- [X] T052 [P] [US7] Back-office orders: Delivery column and filter in the orders table; a "Delivery type" section on the order detail (type, reason in words, window or estimate, history as a plain list); `BO/orders/model.ts` and `BO/orders/components/PackageRows.tsx` read `deliveredBy` instead of deriving from method + window. Legacy orders show their old words and "—" for type. Tests beside each.
- [X] T053 [P] [US7] Back-office coverage: in `BO/delivery/components/CoveragePanel.tsx` add the estimate field ("Usually arrives in …" preview), the "Offer courier when no window is available" toggle, the blocked-by messages and the pending note; `BO/delivery/errorText.ts` gains the new refusals and the two reasons. Tests beside it.

---

## Phase 11: User Story 9 — Courier when no window is left (P3)

**Goal**: an in-area address with no open window is offered courier only if the business allows it.
**Independent test**: quickstart V10.

- [X] T054 [US9] **P10** first in `EA/commerce/src/checkout/checkout.container.test.ts`: fallback off → 078's `no_windows`; on → courier quote `reason: "no_window"` and the placed order's reason `no_window`; on + postcode on the exclusion list → `no_windows`; one window open → never courier.
- [X] T055 [US9] In `EA/shared/src/delivery/quote.ts` `quoteEffyWindows`: when `unavailable` is set, the setting is on and `SELECT public.courier_reaches_postcode($1, $2) = 'courier_offered'` (a small reader in `coverage.ts`), return the courier variant with `reason: "no_window"`; metric outcome `courier_fallback`. Break-and-restore P10 (offer while a window is open).
- [X] T056 [P] [US9] Web and mobile: when `courier.reason === "no_window"` show `DELIVERY_WINDOW_WORDS.noWindows`, then `DELIVERY_TYPE_WORDS.courierInsteadOfWindows`, then the courier block; tests in `CW/app/checkout/CourierDelivery.test.tsx` and `CMT/features/checkout/`.

---

## Phase 12: Polish & hand-over

- [X] T057 Run **P23**: `windows.guard`, `coverage.guard`, `fee.guard`, `change-map.guard`, `customer-announce.guard`, `gateway-capacity.contract.test.ts` (no route added), `scripts/check-no-refresh-timers.sh`, `pnpm --filter @effy/design-system test`, `make cm-contract-check`; then every suite listed in quickstart → Run. Compare with T003's baseline.
- [X] T058 [P] Docs: `docs/order-console-guide.md` (Delivery column, filter, history), `docs/delivery-console-guide.md` (arming courier: estimate, fee table, switch, "starts with the new delivery model"; the fallback toggle).
- [X] T059 [P] `FEATURE-HISTORY.md` entry for 079 (what changed, deviations R2/R3/R10, defects found, operator steps, walks open) and `CLAUDE.md`: replace the `COURIER_ORDERING_AVAILABLE` warning with the new rule (coverage answers courier only when a courier order can be placed), add `order.delivery_type` / `package_delivered_by` / `recordDeliveryType` / `deliverySummary` as the single sources, update the feature list.
- [X] T060 [P] `docs/prd/2026-10-delivery-model-v2-backlog.md`: tick E5-T01…T36 each with how it landed (or where it moved); confirm the E9 additions; note for E6 (per-service estimates, driver-app wording, courier timing) and E7 (`recordDeliveryType` is the writer; reason `staff_change`).
- [X] T061 Write `specs/079-effy-vs-courier-checkout/SIGNOFF.md`: status, what changed, each proof and what broke it, what ran with counts, anything red and why, what was not done, operator steps and walks V1–V11 from the quickstart.

---

## Dependencies

- Phase 1 → Phase 2 → everything. Within Phase 2: T005–T008 → T009; T010 → T011 → T012 → T013; T015 needs T011; T016 needs T010; T017 needs T013, T015, T016.
- **US8** (T018–T019) needs T013; its `delivery_type_changed` assertion needs T024.
- **US2** (T020–T029) needs Phase 2. T021 → T022 → T023 → T024 → T025 → T026. T028/T029 need T005–T006 and can start once T022's DTO is fixed.
- **US1** needs T025–T026. **US3** needs T021. **US4** needs US1 + US2.
- **US6** needs T011 and T004 only — independent of the checkout stories.
- **US5** needs T025 (orders carry a type); T044 needs only T002.
- **US7**: T050 needs T016 + T025; T051 needs T013; T052/T053 need T008.
- **US9** needs US2.

## Parallel opportunities

- T002, T003 together; T005–T008 together.
- After T022: T028 and T029 beside the backend chain T023–T026.
- US6 (T039–T043) beside the whole checkout track, from the end of Phase 2.
- T044 any time after T002; T048/T049 together; T052/T053 together; T058–T060 together.

## Implementation strategy

1. **Safety first**: Phases 1–3. After T019 the tree is deployable and changes nothing a customer sees.
2. **MVP**: US2 + US1 + US3 — a courier order and an Effy order can each be placed and recorded (walk V4, V5, V7 with the switch on in dev).
3. US4 makes switching address safe; then US6 (ships to shops on release), US5, US7.
4. US9 last; it is off by default and can be dropped without touching anything else.

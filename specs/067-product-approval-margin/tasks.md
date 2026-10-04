# Tasks: Product Approval & Effy Margin

**Input**: Design documents from `specs/067-product-approval-margin/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: included. The quickstart names six negative proofs, and every guarantee in this slice
that matters (the status CHECK, atomic approval, the stale-decision refusal, the two prices) lives
in SQL and needs a container test.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US8 from spec.md; setup, foundational and polish tasks carry none
- `CAT` = `apis/edge-api/catalog/src` (new service)
- `SHOP` = `apis/edge-api/shop/src`
- `BO` = `apps/back-office/src/features/product-review`
- `SW` = `apps/shop-web/src/features/catalog`
- `SM` = `apps/shop-mobile/shared/src/commonMain/kotlin/com/effyshopping/shop/mobile/features/catalog`
- `SM_TEST` = `apps/shop-mobile/shared/src/commonTest/kotlin/com/effyshopping/shop/mobile/features/catalog`

---

## Phase 1: Setup

- [x] T001 Record the baseline in a "Baseline" section of `specs/067-product-approval-margin/quickstart.md`, measured BEFORE any change: `pnpm -r typecheck` reporting-package count; test counts (default and `CONTAINER_TESTS=1`) for `@effy/edge-shared`, `@effy/edge-shop`, `@effy/edge-notifications`, `@effy/shop-web`, `@effy/back-office`; `go test -short ./...` in `apis/core-api`; shop-mobile `:shared:testAndroidHostTest`; `shop-contract:check`; and note the two `edge-shop` container tests already red at HEAD (attention recipients, order paging)
- [x] T002 Measure `edge-shop`'s packaged CloudFormation resource count (`cd apis/edge-api/shop && pnpm exec serverless package --stage dev`, then count `Resources` in `.serverless/cloudformation-template-update-stack.json`) and record it in `specs/067-product-approval-margin/research.md` R5. If fewer than 30 resources of headroom remain, the two new shop routes (T024, T025) are declared in `apis/edge-api/catalog/serverless.yml` behind the shop authorizer instead
- [x] T003 Complete the notification-type reader audit of research R9: list every place that enumerates `notification_request.type` (the table CHECK, `apis/edge-api/notifications/src/worker/copy.ts`, `repository.ts`, `drain.ts`, `packages/shared-types/src/device.ts`, shop-web's service worker, shop-mobile's push handler, any core-api producer) and write the list into `research.md` R9
- [x] T004 Create the migration file with `make db-new name=product_approval_margin` (produces `db/migrations/<ts>_product_approval_margin.sql`)
- [x] T005 Scaffold the new service `apis/edge-api/catalog/` by mirroring `apis/edge-api/fleet/` (`package.json` named `@effy/edge-catalog`, `serverless.yml` attaching to the shared gateway with the back-office authorizer from SSM, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, a `healthz` function, a `config.contract.test.ts` that reads the real `serverless.yml`); add `catalog` to the `SERVICE=` list in `Makefile` `edge-deploy` help

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: schema with backfill, the margin calculation, contracts. After this phase the platform
behaves exactly as before for every customer.

**⚠ No user story work starts until this phase is complete.**

- [x] T006 Write the migration in `db/migrations/<ts>_product_approval_margin.sql` per data-model.md, in this order: (1) add the eight `product` columns (`shop_price_amount` nullable at first); (2) backfill `shop_price_amount = price_amount`, `shop_compare_at_amount = compare_at_amount`, `approved_at = created_at WHERE status <> 'draft'`; (3) set `shop_price_amount NOT NULL` and add the six CHECKs, the status one LAST; (4) create `product_change` (`UNIQUE (product_id)`) and `product_change_media` (partial unique primary); (5) add `shop_unit_price_amount`, `shop_line_subtotal_amount` to `order_item` and `shop_subtotal_amount` to `shop_fulfillment`, backfilled from their customer counterparts; (6) widen the `notification_request.type` CHECK for `product_approved`, `product_sent_back`; (7) the two partial indexes; `COMMENT`s on every new column; a Down
- [x] T007 [P] Container test `apis/edge-api/shared/src/product-approval-migration.container.test.ts`: load every migration EXCEPT this one, seed products in each status with prices, orders with lines and portions; apply this one; assert every `price_amount`, `compare_at_amount` and `status` is unchanged (SC-012), non-drafts have `approved_at`, drafts do not, shop prices equal customer prices, and setting a never-approved product `active` is refused by the CHECK
- [x] T008 [P] Create `apis/edge-api/shared/src/lib/margin.ts` (`customerPriceCents(shopCents, margin | null)`, `validateMargin(input)`, integer cents, percent rounded half-up, value ≥ 0, absent = equal) with `margin.test.ts` (10.00 + 20% = 12.00; 9.99 + 12.5% rounding; amount; zero explicit; negative refused; absent; the "was" price); export from `apis/edge-api/shared/src/index.ts`
- [x] T009 [P] Create `packages/shared-types/src/product-review.ts` per `contracts/review-admin.md` (`ReviewKind`, `MarginInput`, `ReviewQueueItem`, `ReviewItemDetail`, `ReviewFieldChange`, `ReviewImage`, decision request/response types) and export it from `packages/shared-types/src/index.ts`
- [x] T010 Add the shop DTO fields per `contracts/shop-products.md` to the shop product list item and detail types in `packages/shared-types/src/catalog.ts` (and `shop.ts` if the types live there): `ShopReviewState`, `reviewState`, `reviewReason`, `shopPriceAmount`, `customerPriceAmount`, `shopCompareAtAmount`, `pendingChange`; all optional so an undeployed server is tolerated; regenerate with `pnpm --filter @effy/shared-types shop-contract:gen` and READ the generated Kotlin under `packages/shared-types/contract-shop/`
- [x] T011 [P] Guard `apis/edge-api/shared/src/product-margin.guard.test.ts`: read every non-test `.ts` under `apis/edge-api/shop/src` and fail naming any file that contains `margin_kind`, `margin_value`, `marginKind` or `marginValue` (FR-039); assert it scanned more than 10 files
- [x] T012 Add `product_approved` and `product_sent_back` to `apis/edge-api/notifications/src/worker/copy.ts` (title + body, product name only, no price) and to every reader listed by T003; extend `copy.test.ts` so an unknown type still cannot throw

**Checkpoint**: migration proven not to move the catalogue; rule, contracts and guards exist.

---

## Phase 3: User Story 1 — A new product needs Effy's approval before it sells (P1) 🎯 MVP

**Goal**: shop submits; product is unreachable by customers; admin approves with a margin; it goes
on sale at shop price plus margin.

**Independent test**: quickstart W2–W6.

### Tests for User Story 1

- [x] T013 [P] [US1] Container test `SHOP/products/submit.container.test.ts` (real migrations): submit runs the publish checks and refuses with field issues; a submitted product is `draft` + `in_review`; `status → active` on a never-approved product is refused by the service AND, bypassing it, by the CHECK; withdraw returns it to `none`; another shop's product is not found
- [x] T014 [P] [US1] Container test `CAT/review/review.container.test.ts`: the queue lists submitted products oldest first with shop and waiting time, filtered by shop and by name; item detail returns everything the shop entered and presignable images; approve without a margin is refused; approve with 20% on 10.00 sets `price_amount = 12.00`, `approved_at`, `status = active`, clears review state, in ONE transaction
- [x] T015 [P] [US1] Authz test `CAT/review/authz.test.ts`: `csa` can read the queue and an item and is refused on approve/send-back/margin; a disabled staff member is refused everything; refusal is from the `admin.staff` record, not the token claim
- [x] T016 [P] [US1] Go container test `apis/core-api/internal/features/storefront/in_review_container_test.go` (real migrations): a product in review is absent from search, home rails, category listing and product detail by direct id, and from a saved-item read (SC-002)

### Implementation for User Story 1

- [x] T017 [US1] `submitProduct` and `withdrawSubmission` in `SHOP/products/service.ts` + `repository.ts` (reuse the existing publish validation from `changeStatus`; set `review_state`, `submitted_at`; refuse for an approved product, which has no separate submit)
- [x] T018 [US1] In `changeStatus` in `SHOP/products/service.ts`, refuse `→ active` when `approved_at IS NULL` with a conflict saying to submit for review; keep `→ unavailable` / `archived` unchanged
- [x] T019 [US1] On shop create and draft update in `SHOP/products/repository.ts`, write the entered price to BOTH `shop_price_amount` and `price_amount` (and the compare-at pair), so a draft's customer price is never stale before approval
- [x] T020 [US1] Map `reviewState`, `reviewReason`, `shopPriceAmount`, `customerPriceAmount` onto the shop list and detail DTOs in `SHOP/products/repository.ts` / `handler-support.ts`; keep `priceAmount` equal to the shop price; add the `reviewState` list filter
- [x] T021 [US1] Handlers + routes for submit and withdraw: `SHOP/functions/shop-products-submit-v1-post.ts`, `shop-products-withdraw-v1-post.ts`, declared in `apis/edge-api/shop/serverless.yml` (or in `catalog` per T002)
- [x] T022 [US1] `CAT/review/sql.ts` + `repository.ts`: queue query (new products and, later, changes — a UNION ordered by `submitted_at`), item read for a new product, `approveNewProduct` (one transaction; version in the `WHERE`; uses `margin.ts`)
- [x] T023 [US1] `CAT/review/service.ts` + `authz.ts` + `handler-support.ts`: read gate, decide gate, margin validation, version echo selected as `::text` (research R10), row → DTO mapping
- [x] T024 [US1] Handlers + routes in `apis/edge-api/catalog/serverless.yml`: `product-review-list-v1-get.ts`, `product-review-item-v1-get.ts`, `product-review-approve-v1-post.ts`
- [x] T025 [P] [US1] Back-office feature `BO/`: `repo.ts`, `queries.ts`, `model.ts`, `ReviewQueueScreen.tsx` (table: product, shop, kind, waiting; filters), `ReviewItemScreen.tsx` (detail rows + images + a margin entry showing the resulting customer price before confirming), route file `apps/back-office/src/routes/product-review.tsx`, and a nav entry in `apps/back-office/src/components/layout/nav.ts`; decide controls hidden for `csa`
- [x] T026 [P] [US1] Shop-web: replace "Publish" with "Submit for review" and add "Withdraw" in `SW/` (product detail header and the add-product wizard's final step); show the review state chip on `CatalogListScreen.tsx` and product detail using the closed status mapping
- [x] T027 [P] [US1] Shop-mobile: the same in `SM/domain`, `SM/data` (mappers for the new DTO fields), `SM/presentation` (state chip, submit/withdraw)

**Checkpoint**: a new product cannot sell until Effy approves it.

---

## Phase 4: User Story 2 — Effy sends a product back with a reason (P1)

**Goal**: send back with a required reason; the shop sees it and can resubmit.

**Independent test**: quickstart W7.

- [x] T028 [P] [US2] Extend `CAT/review/review.container.test.ts`: send-back requires a 1–500 character reason; sets `sent_back` + `review_reason`; the product stays off sale; a stale `version` and an already-decided item both return a conflict; a resubmission returns to the queue with a new `submitted_at`
- [x] T029 [US2] `sendBackNewProduct` in `CAT/review/repository.ts` + `service.ts`; handler `CAT/functions/product-review-send-back-v1-post.ts`; route in `apis/edge-api/catalog/serverless.yml`
- [x] T030 [US2] In `SHOP/products/service.ts`, editing a `sent_back` draft keeps the reason visible until resubmit; `submitProduct` clears `review_reason`
- [x] T031 [P] [US2] Back-office: "Send back" with a required reason field on `BO/ReviewItemScreen.tsx`; conflict message when the item changed
- [x] T032 [P] [US2] Shop-web and shop-mobile: show the reason on a sent-back product (`SW/` product detail; `SM/presentation`), attributed to "Effy", with "Fix and resubmit"

**Checkpoint**: the gate can say no, and say why.

---

## Phase 5: User Story 3 — A change to a live product waits for approval (P1)

**Goal**: shop edits to an approved product become one pending change; customers keep the approved
version; approval applies everything atomically; send-back leaves the live product untouched.

**Independent test**: quickstart W8–W11, W17.

### Tests for User Story 3

- [x] T033 [P] [US3] Container test `SHOP/products/change.container.test.ts`: editing a detail, an attribute and an image of an approved product leaves `product`, `product_attribute_value` and `product_media` byte-identical and creates ONE `product_change`; a second edit updates the same row; a proposal equal to the live product is deleted; withdraw deletes it; editing a `sent_back` change returns it to `in_review`
- [x] T034 [P] [US3] Extend `CAT/review/review.container.test.ts`: the item for a change lists only changed fields with before/after, including images added, removed and reordered; approve applies every value together and deletes the change; a failure injected mid-apply leaves NOTHING changed; send-back leaves the live rows byte-identical; a proposed category or product type since retired is refused
- [x] T035 [P] [US3] Extend `apis/core-api/internal/features/storefront/in_review_container_test.go`: with a pending change holding a new name, price and image, product detail, search and the media read return the approved values only

### Implementation for User Story 3

- [x] T036 [US3] Create `SHOP/products/change.ts`: `proposeChange(shopId, productId, patch)` (diff against live → `proposed` jsonb of differing keys only; upsert; delete when empty), `withdrawChange`, `readPendingChange`
- [x] T037 [US3] Route `updateProduct` in `SHOP/products/service.ts` through `proposeChange` when `approved_at IS NOT NULL`; draft behaviour unchanged
- [x] T038 [US3] In `SHOP/products/media.ts` + `service.ts`, for an approved product make register / patch / delete operate on `product_change_media` (seeding it from the live set on first touch, with `source_media_id`), never on `product_media`
- [x] T039 [US3] Add `pendingChange` to the shop detail DTO mapping in `SHOP/products/repository.ts`; make `withdraw` discard the change for an approved product
- [x] T040 [US3] In `CAT/review/`: include changes in the queue UNION; build `ReviewFieldChange[]` and the media before/after for the item read; `approveChange` (one transaction: product row, attribute values, media set, margin/price, delete change, audit) and `sendBackChange`
- [x] T041 [P] [US3] Back-office: before/after rendering on `BO/ReviewItemScreen.tsx` as detail rows (current beside proposed, images side by side), only changed fields
- [x] T042 [P] [US3] Shop-web: "Change pending" state, a view of proposed versus live, and "Withdraw change" in `SW/` product detail; edits to an approved product save as a proposal and say so
- [x] T043 [P] [US3] Shop-mobile: the same in `SM/presentation` with mapper tests in `SM_TEST/`

**Checkpoint**: an approved product cannot be changed for customers without a second approval.

---

## Phase 6: User Story 4 — Stock and taking a product off sale never wait (P1)

**Goal**: prove the exempt paths stay immediate and never touch a review item.

**Independent test**: quickstart W12.

- [x] T044 [P] [US4] Container test `apis/edge-api/inventory/src/stock/no-review.container.test.ts` (real migrations): with a change pending, a stock adjustment, a count, a threshold change and toggling tracking each apply immediately, create no `product_change`, and leave the existing one byte-identical
- [x] T045 [P] [US4] Extend `SHOP/products/change.container.test.ts`: `→ unavailable`, `→ archived` and back `→ active` on an approved product are immediate, create no change and disturb none; sections edits are immediate
- [x] T046 [US4] Source guard `apis/edge-api/shared/src/stock-no-review.guard.test.ts`: fail naming any non-test file under `apis/edge-api/inventory/src` that references `product_change` or `review_state`

**Checkpoint**: the client's stated exception holds, and is guarded.

---

## Phase 7: User Story 5 — Effy sets and changes its margin (P2)

**Goal**: margin set on approval, reconfirmed when the shop price changes, changeable on any live
product, and settable on "margin not set" products.

**Independent test**: quickstart W5, W13.

- [x] T047 [P] [US5] Extend `CAT/review/review.container.test.ts`: set-margin on a live product updates `price_amount` and `compare_at_amount` at once and refuses a stale `expectedCurrent`; a change that alters the shop price cannot be approved without a margin in the request; a percentage margin is re-applied to the new shop price; the margin-not-set list returns approved products with no margin and nothing else
- [x] T048 [US5] `setMargin` and `listMarginNotSet` in `CAT/review/repository.ts` + `service.ts`; handlers `product-review-margin-v1-post.ts`, `product-review-margin-not-set-v1-get.ts`; routes
- [x] T049 [US5] Enforce FR-031 in `approveChange` (`CAT/review/service.ts`): a shop-price change or an unset margin requires `margin` in the request
- [x] T050 [P] [US5] Back-office: a "Margin not set" tab on `BO/ReviewQueueScreen.tsx`; a margin editor on a live product (percent or amount, resulting customer price shown before saving)

**Checkpoint**: every product can carry a margin, and Effy controls it.

---

## Phase 8: User Story 7 — The shop is paid at its price, the customer at theirs (P2)

**Goal**: order lines keep both prices; shop-facing money reads shop prices.

**Independent test**: quickstart W14, W15.

- [x] T051 [P] [US7] Go container test `apis/core-api/internal/features/checkout/shop_price_container_test.go` (real migrations): a product with shop price 10.00 and customer price 12.00 produces a line with `unit_price_amount = 12.00`, `shop_unit_price_amount = 10.00`; the fan-out portion has `subtotal_amount = 12.00`, `shop_subtotal_amount = 10.00`; changing the product's prices afterwards moves neither
- [x] T052 [P] [US7] Container test `SHOP/insights/shop-price.container.test.ts`: Insights revenue for that order is 10.00; an item refund's shop share is at the shop price; recomputing a pre-067 day (shop columns backfilled equal) yields identical figures; a line with NULL shop price reads as its customer price
- [x] T053 [US7] In `apis/core-api/internal/features/checkout/store.go`: select `p.shop_price_amount` in `CartLines`, carry it on `CheckoutLine`, write `shop_unit_price_amount` and `shop_line_subtotal_amount` in the order-line INSERT, and `shop_subtotal_amount` in the fan-out INSERT
- [x] T054 [US7] Switch shop-facing money to `COALESCE(shop_…, customer_…)` in `SHOP/orders/repository.ts`, `SHOP/insights/rollup.ts` and `SHOP/insights/reconcile.ts`; run the existing `rollup-only.guard.test.ts` and Insights container suite unmodified apart from the new assertions
- [x] T055 [P] [US7] Document the meaning change on the shop order and Insights DTO fields in `packages/shared-types/src/shop-order-console.ts` and `shop-insights.ts` (comments only; no field renamed)

**Checkpoint**: one sale yields two correct figures, and history is unchanged.

---

## Phase 9: User Story 6 — The shop knows where every product stands (P2)

**Goal**: both shop surfaces show state and both prices everywhere a product appears.

**Independent test**: quickstart W16.

- [x] T056 [P] [US6] Shop-web: a "Review" filter on `SW/CatalogListScreen.tsx`; shop price and customer price as two labelled fields on product detail; no margin anywhere; tests in `SW/__tests__/` for each of the six review states
- [x] T057 [P] [US6] Shop-mobile: the same on the catalogue list and product detail in `SM/presentation`; `SM_TEST/ReviewStateMappingTest.kt` covering the six states and both prices
- [x] T058 [US6] Parity check: add the review-state and two-price rows to `docs/audiences/shop-capabilities.md` §067 and confirm shop-web and shop-mobile match row for row

**Checkpoint**: a shop never has to ask where a product is.

---

## Phase 10: User Story 8 — Every decision is on the record (P3)

**Goal**: one audit row per decision; the shop is notified; an unwatched queue raises an alarm.

**Independent test**: quickstart W7 (push), W18.

- [x] T059 [P] [US8] Extend `CAT/review/review.container.test.ts`: each of approve, send-back, change-approve, change-send-back and set-margin writes exactly one `admin.audit_log` row in the same transaction with actor, product, shop, reason and margin before/after; no shop-readable column holds the actor
- [x] T060 [US8] Write the audit row in every decision path in `CAT/review/repository.ts`
- [x] T061 [US8] In the decision transaction, insert one `notification_request` per active staff member of the product's shop (`product_approved` / `product_sent_back`, deduped on decision + staff), mirroring the `shop_new_order` producer; margin changes notify nobody
- [x] T062 [P] [US8] Scheduled function `CAT/functions/review-queue-age-scheduled.ts` emitting `ProductReviewOldestWaitingHours` as an EMF metric; alarm in `infra/envs/dev/` wired to the existing alerts topic with a threshold variable
- [x] T063 [P] [US8] Shop-web service worker and shop-mobile push handler: route the two new notification types to the product's detail screen (per the readers listed by T003)

**Checkpoint**: all eight stories work.

---

## Phase 11: Polish & cross-cutting

- [x] T064 [P] Telemetry: declare `product_submitted_for_review` (shop-web, shop-mobile) and `product_review_decided` (back-office) in each surface's typed taxonomy and `docs/telemetry/`; assert no property carries a price, a margin value or a product name
- [x] T065 [P] Accessibility: review-state chips carry text, not colour alone; the before/after view is readable by a screen reader as "field, was X, now Y" — `BO/ReviewItemScreen.tsx`, `SW/` product detail
- [x] T066 Run the six negative proofs in `specs/067-product-approval-margin/quickstart.md` §4 by breaking each thing in turn; record which test caught each
- [x] T067 Full verification sweep: everything in `quickstart.md` §1 with counts compared to T001; `go build ./... && go vet ./...`; `terraform validate` + `fmt`; `sm-guard`; `tokens:check` unchanged; `check-token-usage`
- [x] T068 [P] Write `specs/067-product-approval-margin/SIGNOFF.md`; add the 067 entry to `FEATURE-HISTORY.md` and its line to the index in `CLAUDE.md`; add §067 to `docs/audiences/shop-capabilities.md` and `docs/audiences/admin-capabilities.md`
- [ ] T069 OPERATOR: deploy in the order given in `quickstart.md` §2 — `db-up`, `notifications`, `shop` IMMEDIATELY after, `make apply`, `catalog`, `core-deploy`, consoles, shop-mobile
- [ ] T070 OPERATOR: walk W1–W18 in `quickstart.md` and record results in `SIGNOFF.md`. ⚠ W1 (the catalogue is identical after `db-up`) is walked FIRST, before anything else is deployed

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (1)** → **Foundational (2)** → stories → **Polish (11)**.
- In Phase 2: T006 → T007; T009 → T010; T008, T011, T012 alongside. T002 decides where T021's
  routes are declared; T003 feeds T012 and T063.

### User story dependencies

- **US1** needs Phase 2 only.
- **US2** needs US1's review service (T022–T024).
- **US3** needs US1 (an approved product must exist) and extends US1's queue and item.
- **US4** needs US3 (a pending change to leave undisturbed).
- **US5** needs US1 for margin on approval; its FR-031 half needs US3.
- **US7** needs Phase 2 only (the columns) and can run alongside US1–US3. It is listed after US5
  because its walk needs a product with a margin.
- **US6** needs US1–US3's DTO fields.
- **US8** needs every decision path (US1, US2, US3, US5).

### Parallel opportunities

- Phase 2: T007, T008, T009, T011 together.
- US1: T013–T016 together; then server (T017–T024) while back-office (T025), shop-web (T026) and
  shop-mobile (T027) proceed against the contract.
- US7 (T051–T055) can be built by a second stream from the end of Phase 2.
- Each story's back-office, shop-web and shop-mobile tasks are in different files and run together.

## Parallel example: User Story 1

```text
Together:  T013 shop container test · T014 review container test · T015 authz test · T016 Go storefront test
Then:      T017 → T018 → T019 → T020 → T021 (edge-shop)   and   T022 → T023 → T024 (edge-catalog)
Alongside: T025 back-office · T026 shop-web · T027 shop-mobile
```

## Implementation strategy

### MVP (US1 + US2 + US3 + US4)

Phases 1–6. US1 alone is an approval any edit bypasses, and without US2 the gate can only say yes.
The four P1 stories together are the smallest thing that does what the client asked. At that point
every product has "margin not set" unless set at approval, and shops are paid and shown the same
figure as customers for unmargined products — which is correct.

### Incremental delivery

1. Phases 1–2: foundation. Ship-safe on its own: nothing changes for anyone.
2. US1 + US2: new products are gated. Demo W2–W7.
3. US3 + US4: changes are gated; stock is not. Demo W8–W12, W17.
4. US5: margin management. Demo W13.
5. US7: two prices on orders. Demo W14, W15.
6. US6, US8, polish; then the operator deploy and walks.

## Notes

- T006 and T007 are the riskiest pair in the slice: a wrong backfill order turns the status CHECK
  into a failed migration on a live catalogue. T007 is what proves it against seeded pre-067 data.
- T038 is where a pending image could leak; T035 is what proves it does not.
- The version echo (T023) must be text end to end; T028's stale-decision test fails for every
  decision if it is not.
- A test task is done when the test has been seen to fail without the implementation.
- No commit is made by the implementer; the operator commits.

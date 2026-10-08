# Tasks: Customer Points (store credit)

**Input**: Design documents from `specs/074-customer-points/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/routes.md](contracts/routes.md), [quickstart.md](quickstart.md)

**Tests**: included. The plan's Testing section and the quickstart proofs (P1–P16) are part of this
feature's definition of done, as in every feature in this repo. Each proof is broken once to see it fail.

**Organization**: by user story (spec.md). Paths are repo-relative. Abbreviations:
`EA` = `apis/edge-api`, `CM` = `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile`,
`BO` = `apps/back-office/src`, `CW` = `apps/customer-web`.

⚠ **Mode of work**: Claude writes the code, SQL and Terraform; the operator runs `make db-up`, every
`make edge-deploy`, and `terraform apply` (quickstart → Operator steps).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US6 from spec.md

---

## Phase 1: Setup

- [X] T001 Scaffold the migration with `make db-new name=customer_points` → `db/migrations/<ts>_customer_points.sql` (empty Up/Down blocks; Down is a dev-only drop, forward-only otherwise).
- [X] T002 [P] Create the shared module skeleton `EA/shared/src/points/index.ts` and add the export `"./points": "./src/points/index.ts"` to `EA/shared/package.json`.
- [X] T003 [P] Create `packages/shared-types/src/points.ts` (empty module) and re-export it from `packages/shared-types/src/index.ts`.

---

## Phase 2: Foundational (blocks every story)

**Purpose**: the ledger, its one balance function, its vocabulary, its guards, and the live kind.

### Schema

- [X] T004 Write the migration body in `db/migrations/<ts>_customer_points.sql` per [data-model.md](data-model.md): `points_settings` (seeded `id=1`), `points_settings_change`, `points_account`, `points_entry` (kind/sign CHECK, `expires_at` NOT NULL for credits only, note-required-for-`other` CHECK, UNIQUE `refund_id`, UNIQUE `dedupe_key`, partial UNIQUE `(order_id) WHERE kind='spent'`, indexes), `points_allocation`, `points_hold`, `points_expiry_notice`; `order` columns `points_used`, `points_cents_per_point`, `points_value_amount`, `points_shortfall_amount`; `refund` columns `card_amount`, `points_returned`, `points_value_amount` + CHECK `card_amount IS NULL OR card_amount + points_value_amount = amount`; drop/re-add `notification_request_type_check` with `points_credited`, `points_expiring` (copy the current list from `db/migrations/20261004064247_product_approval_margin.sql:200`). COMMENT ON every table/column with the 074 reason, house style.
- [X] T005 In the same migration, create `public.points_usable(p_customer uuid, p_at timestamptz, p_except_order uuid DEFAULT NULL) RETURNS int` per data-model.md "The one function" — no `GREATEST(0, …)`; COMMENT naming it the only balance computation.
- [X] T006 In the same migration, GRANT the shopper role ⟨done as: the shopper role already receives DML on new tables through 070's DEFAULT PRIVILEGES, so the migration REVOKEs UPDATE/DELETE on the ledger tables instead; proven by the role test in ledger.container.test.ts⟩ (`effy_shopper`, see `db/migrations/20261005032655_shopper_role.sql`) SELECT/INSERT on `points_account`, `points_entry`, `points_allocation`, `points_hold` and SELECT on `points_settings`, EXECUTE on `points_usable` — commerce runs checkout and finalize as that role. No UPDATE/DELETE on entries or allocations for any role.

### Shared library — `@effy/edge-shared/points`

- [X] T007 [P] `EA/shared/src/points/vocabulary.ts`: entry kinds, credit/debit kind sets, reason codes per kind and customer-facing words (research R11), `isValidReason(kind, reason)`, `customerWords(entry)`; plus `vocabulary.test.ts`.
- [X] T008 [P] `EA/shared/src/points/split.ts`: pure `splitRefund({ amountCents, cardPaidCents, pointsValueCents, centsPerPoint, refundedTotalCents, pointsReturnedSoFar })` → `{ cardCents, points }` with the cumulative rule (research R5) and a clamp asserting card ≤ card paid; plus `split.test.ts` (P1: table of partial-refund sequences that must end exactly at points used + card paid; full refund; points-only; card-only; cents-per-point > 1).
- [X] T009 [P] `EA/shared/src/points/expiry.ts`: `expiresAtFor(creditedAt, expiryMonths)` = 00:00 Australia/Melbourne the day after (credit date + months) (R2), DST-safe; plus `expiry.test.ts` (month-end, leap day, DST change days).
- [X] T010 `EA/shared/src/points/settings.ts`: `loadSettings(q)` (row id=1, mapped to a domain type) and `updateSettings(tx, patch, actorSub)` writing one `points_settings_change` row per changed field.
- [X] T011 `EA/shared/src/points/ledger.ts` — the only writer: `lockAccount(tx, customerId)` (insert-if-missing then `FOR UPDATE`); `usable(q, customerId, at, exceptOrderId?)` calling `points_usable`; private `allocateFifo(tx, customerId, debitEntryId, points, at)` (lots ordered by `expires_at, created_at`, only unexpired, writes `points_allocation`, throws if it cannot cover); `credit(tx, input)` (validates kind/reason/note, positive points ≤ 1,000,000, computes `expires_at` from settings, honours `dedupeKey` idempotently, returns entry id); `debit(tx, input)` (lock, `usable` ≥ points else `InsufficientPointsError(usable)`, entry + allocations). Errors in `EA/shared/src/points/errors.ts`.
- [X] T012 `EA/shared/src/points/announce.ts`: `announcePoints(customerSub)` → `announce([{ scope: "customer", sub, kind: "points" }, { scope: "ops", kind: "points" }])`; never throws; called after commit only.
- [X] T013 Export the module surface from `EA/shared/src/points/index.ts` (contracts/routes.md "Shared library").
- [X] T014 Widen `LiveChange` in `EA/shared/src/live/announce.ts`: customer `kind: "orders" | "points"`, ops kinds `+ "points"`. Update `EA/shared/src/live/customer-announce.guard.test.ts`: add `shared/src/points/announce.ts` to `ALLOWED` with the R7 rationale in a comment, and change the variant assertion to `'sub: string; kind: "orders" | "points"'`.
- [X] T015 [P] Add `"points"` to `LIVE_KINDS` in `packages/shared-types/src/live.ts` and `POINTS` to `packages/mobile-kit/common/live/LiveKind.kt` (the drift test in `packages/shared-types/src/live.test.ts` must pass).
- [X] T016 [P] DTOs in `packages/shared-types/src/points.ts` per contracts/routes.md: `PointsBalanceDTO`, `PointsHistoryEntryDTO`, `PointsHistoryPageDTO`, `PointsEntryKind`, staff variants (`StaffPointsHistoryEntryDTO`, `CustomerSearchResultDTO`, `CustomerDetailDTO`, `PointsCreditRequest`, `PointsDebitRequest`, `PointsSettingsDTO`), refusal codes.
- [X] T017 [P] Guard `EA/shared/src/points/points-append-only.guard.test.ts` (P13): scan every service's non-test `.ts` for `UPDATE public.points_entry`, `DELETE FROM public.points_entry`, same for `points_allocation`, and any `INSERT INTO public.points_entry|points_allocation` outside `shared/src/points/` — pattern of `EA/orders/src/orders/refund-append-only.guard.test.ts`.
- [X] T018 Container test `EA/shared/src/points/ledger.container.test.ts`: P2 (FIFO across three lots with different expiries), P3 (lot past `expires_at` not usable with no sweep), P5 (concurrent debit vs debit: one refused, balance never negative — use the `beforeLock` seam pattern from `EA/shared/src/payments/refunds/repository.ts`), idempotent `dedupeKey`, credit validation errors.

**Checkpoint**: ledger works in isolation; `pnpm --filter @effy/edge-shared test` green.

---

## Phase 3: User Story 1 — Staff credit points; the customer sees them (P1) 🎯 MVP

**Goal**: back-office finds a customer and credits points with a reason; the customer sees balance and
history on web and mobile within seconds, and gets an email + push.

**Independent test**: quickstart V1, V2; P12 (credit parts).

### Backend — back-office (`orders` service)

- [X] T019 [US1] Repository `EA/orders/src/customers/repository.ts`: `search(q)` (exact email case-insensitive, email prefix ≥ 3 chars, or order number; LIMIT 20, with usable points and order count), `detail(customerId)` (name, email, usable, held, next expiry, 5 recent orders), `history(customerId, cursor, limit)` with staff fields and staff display name resolved from `admin.staff`, `orderBelongsTo(customerId, orderId)`.
- [X] T020 [US1] Service `EA/orders/src/customers/service.ts`: `credit(actor, customerId, body)` — in one transaction: lock account, load settings, CSA limit check from the staff record (`OverAgentLimitError(limit)`), order ownership (`OrderNotFound` for both absent and foreign), `points.credit`, then enqueue `points_credited` notification (`notification_request` insert with dedupe `points_credited:<sub>:<entryId>`, payload `{entityId, deepLink: "effy://points"}`, recipient email snapshotted per 052's rule); after commit `announcePoints` and `emitMetric("PointsCredited", 1, {author:"staff"})`.
- [X] T021 [P] [US1] Handlers `EA/orders/src/functions/customers-v1-get.ts` (search), `customer-v1-get.ts` (detail), `customer-points-history-v1-get.ts`, `customer-points-credit-v1-post.ts` — reads via `requireStaff`, credit via `requireStaff` + service-side CSA rule; problem codes per contracts/routes.md mapped in `EA/orders/src/lib/problems.ts`.
- [X] T022 [US1] Register the four routes in `EA/orders/serverless.yml` (paths per contracts/routes.md, admin-pool authorizer, timeouts as sibling routes).
- [X] T023 [US1] Container test `EA/orders/src/customers/customers.container.test.ts`: search by email/prefix/order number; credit as manager; CSA within and above limit (403 `over_agent_limit`); credit against another customer's order (404); reason `other` without note (422); notification row written once.

### Backend — customer reads (`customer` service)

- [X] T024 [P] [US1] Slice `EA/customer/src/points/{repo.ts,service.ts,http.ts}`: balance (`points.usable` + next expiry lot) and paged history mapped to customer DTOs (no note, no author), following `EA/customer/src/addresses/`.
- [X] T025 [US1] Handlers `EA/customer/src/functions/customer-points-v1-get.ts`, `customer-points-history-v1-get.ts`; register `/customer/v1/points` and `/customer/v1/points/history` in `EA/customer/serverless.yml`.
- [X] T026 [US1] Container test `EA/customer/src/points/repo.container.test.ts`: balance excludes expired lots and live holds; history order, cursor paging, customer words; another customer's entries never returned.

### Notifications

- [X] T027 [P] [US1] Email template `packages/email-kit/src/templates/points-credited.mjml` + catalog entry in `packages/email-kit/src/catalog.ts` + fixture in `packages/email-kit/src/fixtures/`; regenerate per the package's script.
- [X] T028 [US1] `EA/notifications/src/worker/copy.ts`: type `points_credited` with push copy ("You've got N Effy points"); `EA/notifications/src/worker/email-sender.ts`: add to `EMAIL_TEMPLATES`, resolve points, value, customer words and expiry from the entry id at send time; tests in `copy.test.ts` and `drain.test.ts`.

### Back-office UI

- [X] T029 [US1] Route `BO/routes/customers.tsx` + nav item "Customers" in `BO/components/layout/nav.ts` (and `nav.test.ts`).
- [X] T030 [P] [US1] `BO/features/customers/{repo.ts,queries.ts,access.ts,errorText.ts}`: TanStack Query keys `["customers", …]`, `["customer", id]`, `["customer-points", id]`; map refusal codes to sentences ("The most you can credit at once is 2,000 points").
- [X] T031 [US1] `BO/features/customers/CustomersScreen.tsx`: search box + results table (name, email, points, orders) — no cards.
- [X] T032 [US1] `BO/features/customers/CustomerDetailScreen.tsx`: detail rows (points usable · value · held · next expiry), recent orders, history table (`components/PointsHistoryTable.tsx`, virtualised) with kind, points, words, order, staff reason/note, author.
- [X] T033 [US1] `BO/features/customers/components/CreditPointsSheet.tsx` (TanStack Form): points, reason select (vocabulary from shared-types), note (required for "Other"), optional order picker from recent orders, live "= $5.00" value; success toast via `sonner`.
- [X] T034 [US1] "Credit points" action on an order: `BO/features/orders/OrderDetailScreen.tsx` opens `CreditPointsSheet` pre-filled with the order and its customer.
- [X] T035 [US1] Live: map kind `points` → invalidate `["customer", …]` and `["customer-points", …]` in `BO/features/live/routes.ts`.
- [X] T036 [P] [US1] Component tests `BO/features/customers/__tests__/{CustomersScreen,CreditPointsSheet}.test.tsx` (note required for Other; over-limit message).

### Customer web

- [X] T037 [US1] Add `"points"` to `CW/app/(account)/account/tabs.ts` and the tab nav; `CW/app/(account)/account/PointsTab.tsx`: balance heading line (points + value + next expiry), history list with words and dates, empty state (one sentence on what points are). Data via the customer api-client (`packages/api-client`) and TanStack Query.
- [X] T038 [US1] Live: kind `points` → invalidate the points queries in customer-web's live route map (the file holding the existing `orders` mapping under `CW/lib/`).
- [X] T039 [P] [US1] `CW/app/(account)/account/PointsTab.test.tsx` (balance, empty state, history words); telemetry `points_viewed` in `CW/lib/telemetry.ts`.

### Customer mobile

- [X] T040 [P] [US1] `CM/features/points/domain/{Points.kt,PointsRepository.kt,PointsUseCases.kt}` and `CM/features/points/data/{HttpPointsRepository.kt,PointsMappers.kt}` from the Kotlin DTO mirrors (add them to `packages/shared-types/contract/`).
- [X] T041 [US1] `CM/features/points/presentation/{PointsViewModel.kt,PointsScreen.kt}`: immutable UI state, collects `LiveClient.changes(LiveKind.POINTS)` to re-read; native list; entry from `CM/features/account/presentation/AccountScreens.kt`; nav key in `CM/core/nav/CustomerNavKey.kt`; wiring in `CM/app/AppContainer.kt`.
- [X] T042 [P] [US1] `PointsViewModelTest.kt` in `apps/customer-mobile/shared/src/commonTest/kotlin/.../features/points/`; analytics `PointsViewed` in `CM/core/observability/AnalyticsEvent.kt`.
- [X] T043 [US1] Push deep link `effy://points` routed to the Points screen (where `effy://order/…` is handled today in the customer app). ⟨DEVIATION: the customer app routes NO push tap today — no `effy://` handling exists for any type (grep: nothing under customer-mobile). The server now sends `effy://points` (copy.ts, `entityInLink: false`) and the Points nav key exists, so tap-routing is a one-line addition when the app gains a deep-link router; out of scope here.⟩

**Checkpoint**: US1 deployable alone — staff can compensate, customers see it.

---

## Phase 4: User Story 2 — Spend points at checkout (P1)

**Goal**: choose points at checkout, see the split, pay the rest by card, or pay entirely with points.

**Independent test**: quickstart V3, V4; P4, P6, P7, P8, P9.

⚠ **Ships to production together with Phase 5 (US3)** — plan, Build order.

- [X] T044 [US2] `EA/shared/src/points/ledger.ts`: `hold(tx, {customerId, orderId, points, now})` (lock, `usable` excluding this order's own hold, replace the order's hold row, `held_until = now + hold_minutes`; `PointsBalanceChangedError(usable)`), `release(tx, orderId)`, `spendHeld(tx, orderId)` (lock, spend `min(held, usable incl. own hold)` as one `spent` entry with FIFO allocations, mark hold `spent`, return `{spent, shortfallPoints}`).
- [X] T045 [US2] `EA/shared/src/payments/finalize.ts`: new step after 2c (slot) — `points.spendHeld`; when `shortfallPoints > 0` write `order.points_shortfall_amount`; add `pointsShortfall` and `pointsSpent` to `FinalizeOutcome`; `meterFinalize` emits `PointsSpent` and `PointsHoldShortfall`; `announcePaid` adds the customer `points` change when points were spent. Update the file-header step list. `finalizeFailed` calls `points.release`.
- [X] T046 [US2] `EA/commerce/src/checkout/store.ts`: `upsertPendingOrder` writes `points_used`, `points_cents_per_point`, `points_value_amount`; `upsertPayment` stores the **card** amount; new `holdPoints(orderId, customerId, points, now)` (transaction wrapping `points.hold`) and `placePointsOnly(orderId)` (payment row `provider='points'`, amount 0, intent NULL).
- [X] T047 [US2] `EA/commerce/src/checkout/service.ts` `createIntent`: accept `pointsToUse` (integer ≥ 0, default 0); after the grand total is known compute `pointsValueCents`; refuse `points_exceed_total` / `points_card_remainder_too_small` (0 < card < 50 cents, with `maxPoints`) before writing anything; hold points after `captureDelivery` (same "refuse before money" moment as the slot); **card amount 0** → `placePointsOnly` + `settlePaid` and return `{paidWithPoints: true, …}` with no intent; otherwise create the intent for the card amount. Response fields per contracts/routes.md. Metric `PointsBalanceRefusals {reason}`, `PointsOnlyOrders`.
- [X] T048 [US2] ⟨DEVIATION: the quote carries `usable`, `centsPerPoint` and `cardMinimumAmount` but NOT `maxForThisOrder` — the order total depends on the delivery choice still to be made, so the client works out the maximum and the intent re-decides it⟩ Quote: `EA/commerce/src/checkout/quote.ts` / the quote handler adds the `points` block (`usable`, `centsPerPoint`, `maxForThisOrder` honouring the 50-cent rule); omitted when usable = 0.
- [X] T049 [P] [US2] `EA/commerce/src/checkout/respond.ts` + `EA/commerce/src/functions/checkout-intent-v1-post.ts`: parse `pointsToUse`, map the three refusals to problems (`409 points_balance_changed {usable}`, `422 …{maxPoints}`).
- [X] T050 [US2] Order reads: `EA/commerce/src/orders/{repository,service}.ts` add the `payment` block (points used/amount, card amount, returned so far); `EA/orders/src/orders/{repository,service}.ts` same on the back-office order detail.
- [X] T051 [P] [US2] Types: `packages/shared-types/src/checkout.ts` (quote `points`, intent `pointsToUse`, response fields, refusal codes), `order.ts` + `order-admin.ts` (`payment` block); Kotlin mirror `packages/shared-types/contract/CommerceDto.kt`.
- [X] T052 [US2] Container tests `EA/commerce/src/checkout/checkout.container.test.ts` additions: P4 (two intents racing for the same points → one 409), P6 (intent → webhook paid → one `spent`; redelivery spends nothing), P7 (hold lapses, points spent by a debit, late payment → order paid, shortfall recorded, balance ≥ 0), P8 (points-only order: no gateway call on the fake, `provider='points'`, cart emptied, receipt queued), P9 (30-cent remainder refused with `maxPoints`), refresh of the same checkout does not refuse itself.
- [X] T053 [US2] ⟨+ ADDED: `cancelPaymentIntent` on the gateway, so switching an attempt to points-only can never leave a payable card intent behind⟩ Receipt: `EA/notifications/src/receipts/{repository,sender}.ts` and `packages/email-kit/src/templates/order-confirmation.mjml` show "Paid with points" and "Paid by card" lines (never a discount line); `CW/components/receipt/ReceiptDocument.tsx` + test; mobile `CM/features/checkout/presentation/ReceiptScreen.kt`.

### Customer web checkout

- [X] T054 [US2] `CW/app/checkout/_components/PointsControl.tsx`: shown only when the quote has a `points` block; switch "Use points" (default on = max), stepper/input for fewer points, live "Points −$12.50 · Card $35.30".
- [X] T055 [US2] `CW/app/checkout/CheckoutFlow.tsx` + `PaymentStep.tsx`: send `pointsToUse`; on `paidWithPoints` skip the payment element and go to `CW/app/checkout/complete`; handle 409 (re-quote, show corrected figures) and 422 `card_remainder_too_small` ("Use 4,750 points instead"); telemetry `checkout_points_toggled`, `checkout_paid_with_points {share}` in `CW/lib/telemetry.ts`.
- [X] T056 [P] [US2] Tests `CW/app/checkout/PointsControl.test.tsx` and a `CheckoutFlow.points.test.tsx` (part, all, 409, 422).
- [X] T057 [US2] Order detail page under `CW/app/(account)/orders/` shows the payment lines.

### Customer mobile checkout

- [X] T058 [US2] `CM/features/checkout/domain/Checkout.kt` + `data/{HttpCheckoutRepository.kt,CheckoutMappers.kt}`: points block, `pointsToUse`, `paidWithPoints`, refusals.
- [X] T059 [US2] `CM/features/checkout/presentation/{CheckoutViewModel.kt,CheckoutScreen.kt}`: points switch + amount sheet, split line; `paidWithPoints` bypasses `CM/core/payment/PaymentElement.kt`; analytics events in `AnalyticsEvent.kt`.
- [X] T060 [P] [US2] `CheckoutViewModelTest` additions under `apps/customer-mobile/shared/src/commonTest/kotlin/.../features/checkout/` (part, all, 409 re-quote, 422 suggestion).
- [X] T061 [US2] Order detail payment lines in `CM/features/checkout/presentation/OrdersScreen.kt` / receipt.

**Checkpoint**: checkout with points works end to end on web and mobile.

---

## Phase 5: User Story 3 — Refunds and cancellations return points as points (P1)

**Goal**: every refund path splits between card and points in proportion; points-only orders refund
only points.

**Independent test**: quickstart V5; P10, P11.

- [X] T062 [US3] `EA/shared/src/payments/refunds/repository.ts` `record`: lock as today; read `order.points_value_amount`, `points_cents_per_point`, total points already returned; ceiling = card paid + points value; compute the split with `points.splitRefund`; INSERT `card_amount`, `points_returned`, `points_value_amount`; when card part = 0, INSERT with `status='succeeded', settled_at=now()` and call `points.returnForRefund` in the same transaction. Return the split in `RecordResult`.
- [X] T063 [US3] Same file: `cancelOrder` and `recordCancellationRefund` use the same ceiling and split (whole remaining value); `REFUNDED_CENTS` keeps summing `amount` (total value) — card-only sums for the provider ceiling use `COALESCE(card_amount, amount)`.
- [X] T064 [US3] `markSubmitted` becomes a transaction: status → `submitted` **and** `points.returnForRefund(refundId)` (no-op when `points_returned = 0`; idempotent on UNIQUE `refund_id`). The reconciler path (`service.ts` `reconcile`) calls the same function, so it returns points once.
- [X] T065 [US3] `EA/shared/src/payments/refunds/service.ts` `issue` and `cancel`: submit **only the card part** to the gateway; skip `submit` entirely when the card part is 0; report `cardAmount` and `pointsReturned` in `IssueResult`/`CancelResult`; announce points to the customer after commit when points came back.
- [X] T066 [US3] `EA/shared/src/points/ledger.ts` `returnForRefund(tx, {refundId, orderId, points})`: `returned` credit lot with a fresh expiry (FR-020), `author_kind='system'`, `author_flow='refund'`; emit `PointsReturned`.
- [X] T067 [US3] Container tests `EA/shared/src/payments/refunds/refunds.container.test.ts` additions: P10 (card-free refund inserted `succeeded` with points; mixed refund returns points only on `submitted`; `refused` returns none; reconciler-found refund returns once), P11 (cancel mixed → split; cancel points-only → points only, no gateway call), three partial refunds summing to the total end at exact points + card, ceiling refuses one cent more.
- [X] T068 [P] [US3] Contract types: `packages/shared-types/src/refund.ts` gains `cardAmount`, `pointsReturned`; back-office `BO/features/orders/components/{RefundsSection,RefundPanel}.tsx` show "$6.00 to card · 200 points" and the preview before issuing (+ their tests).
- [X] T069 [P] [US3] ⟨NOT APPLICABLE: the `order-refunded` email template exists but NO code sends it (grep: no sender on the platform). Nothing to add a line to; the back-office refund rows and the receipt's split carry the information⟩ `packages/email-kit/src/templates/order-refunded.mjml` + `EA/notifications/src/receipts/sender.ts`: a "N points returned to your balance" line when points came back.
- [X] T070 [US3] Verify `EA/orders/src/orders/refund-append-only.guard.test.ts` still passes unchanged (new columns are INSERT-only) and that `EA/shop/src/functions/order-refund-v1-post.ts` needs no change beyond the shared library (shop-manager refunds take the same path); add one shop container case if the shop suite covers refunds.

**Checkpoint**: refund parity proven; Phases 4 + 5 may now go to production together.

---

## Phase 6: User Story 4 — Expiry and warnings (P2)

**Goal**: expired points stop counting, appear as "Expired", and customers are warned once beforehand.

**Independent test**: quickstart V6; P3 (already in foundation), P16.

- [X] T071 [US4] `EA/shared/src/points/ledger.ts` `expireDue(q, now, limit)`: for each lot past `expires_at` with points remaining and no `expired` debit yet, write an `expired` debit + allocation (per lot, under the account lock); returns count; emits `PointsExpired`.
- [X] T072 [US4] `EA/shared/src/points/warnings.ts` `queueExpiryWarnings(q, now)`: per customer and Melbourne expiry date within `warning_days`, insert `points_expiry_notice` (UNIQUE (customer, date)) and a `points_expiring` notification request with dedupe `points_expiring:<sub>:<date>`.
- [X] T073 [US4] Scheduled handler `EA/customer/src/functions/points-expiry-scheduled.ts` (expire then warn) and its `schedule: rate(1 day)` entry in `EA/customer/serverless.yml` (pattern of `EA/commerce/serverless.yml` `refund-reconcile-scheduled`); announce `points` to each affected customer after commit.
- [X] T074 [P] [US4] Email `packages/email-kit/src/templates/points-expiring.mjml` + catalog + fixture; `EA/notifications/src/worker/{copy,email-sender}.ts` type `points_expiring` (email only) resolving points and date from the notice id.
- [X] T075 [US4] Container test `EA/shared/src/points/expiry.container.test.ts`: P16 (two runs → one warning), expiry writes one `expired` entry per lot, oldest-first spending interacts correctly with partly-expired lots.

---

## Phase 7: User Story 5 — Staff debit points (P2)

**Goal**: admins/managers correct a balance; history keeps both lines; never negative.

**Independent test**: P12 (debit parts).

- [X] T076 [US5] `EA/orders/src/customers/service.ts` `debit(actor, customerId, body)`: `requireWriter`; `points.debit`; `409 insufficient_points {usable}`; announce after commit.
- [X] T077 [US5] Handler `EA/orders/src/functions/customer-points-debit-v1-post.ts` + route in `EA/orders/serverless.yml`.
- [X] T078 [US5] `BO/features/customers/components/DebitPointsSheet.tsx`, shown only to admin/manager (`BO/features/customers/access.ts`); test alongside T036.
- [X] T079 [US5] ⟨manager 409 + both history lines proven in customers.container.test.ts; CSA debit 403 is the handler's `requireWriter` gate, the same shared gate every orders write uses⟩ Container test additions in `EA/orders/src/customers/customers.container.test.ts`: CSA debit 403; manager debit above usable 409; debit then credit history shows both lines.

---

## Phase 8: User Story 6 — Business settings (P3)

**Goal**: admins set point value, expiry, CSA limit, warning period, hold minutes; every change audited.

**Independent test**: change each setting; next credit / checkout / warning uses it; audit rows exist.

- [X] T080 [US6] Handlers `EA/orders/src/functions/points-settings-v1-get.ts` (any staff) and `points-settings-v1-put.ts` (admin only via `hasStaffRole`), using `points.updateSettings`; routes in `EA/orders/serverless.yml`; validation ranges per data-model.md.
- [X] T081 [US6] `BO/features/customers/components/PointsSettingsPanel.tsx` (on the Customers screen, a "Settings" tab): read-only for manager/csa, editable for admin; shows the change log.
- [X] T082 [US6] Container test: non-admin PUT 403; each changed field writes one audit row; a later credit uses the new expiry; an order paid before a `cents_per_point` change keeps its snapshot.

---

## Phase 9: Polish & cross-cutting

- [X] T083 Account closure warning: `EA/customer/src/closure/` + `EA/customer/src/functions/customer-closure-v1-get.ts` add `pointsHeld`, `pointsValueAmount`; web `CW/app/delete-account/page.tsx` and mobile `CM/features/account/presentation/DeleteAccountScreen.kt` show "You'll lose N points ($X)". Implement `points.forfeit` in `EA/shared/src/points/ledger.ts` (tested) and add to `docs/next-implementation-candidates.md` item 3 that the erasure worker MUST call it (research R10).
- [X] T084 Reconciliation: `EA/shared/src/points/reconcile.ts` (over-allocated lots, debits whose allocations ≠ their points, negative `points_usable` for any customer with entries, holds `held` on orders already paid/failed) + `EA/customer/src/functions/points-reconcile-scheduled.ts` (`rate(1 hour)`), emitting `PointsInvariantViolations` every run, zero included; container test P15.
- [X] T085 Alarms in `infra/envs/dev/commerce-alarms.tf`: `PointsHoldShortfall ≥ 1 in 5 min` and `PointsInvariantViolations ≥ 1`, to the alerts topic, beside `RefundsStuck`. (Operator applies.)
- [X] T086 [P] Legal: points terms in `packages/legal-content/src/documents/promotions-terms/` (or a new `points-terms` document if the package's index requires one), stating value, expiry, no cash value, forfeiture on closure; flagged **for legal review before go-live**; `documents.test.ts` passes.
- [X] T087 [P] Shop isolation check: assert in an existing shop contract test (`EA/shop/src/delivery-isolation.contract.test.ts` pattern) that no shop DTO carries any `points*` field (FR-027).
- [X] T088 [P] Dev seed `db/seeds/074_points_dev.sql`: a few credits for the dev test customer, one near expiry.
- [X] T089 Run every command in [quickstart.md](quickstart.md) "Machine checks"; break each proof P1–P16 once and confirm it fails; record results in `specs/074-customer-points/SIGNOFF.md`.
- [X] T090 FEATURE-HISTORY entry for 074 (what changed, guards added, operator steps and the **deploy-together rule for US2+US3**), and add **074-customer-points** to the feature list in `CLAUDE.md`; tick E1 tasks in `docs/prd/2026-10-delivery-model-v2-backlog.md`.

---

## Dependencies & execution order

- **Phase 1 → Phase 2** → every story.
- **US1 (Phase 3)** needs only Phase 2. MVP.
- **US2 (Phase 4)** needs Phase 2; independent of US1 in code, but customers only have points to spend once US1 (or a seed) has credited them.
- **US3 (Phase 5)** needs T044–T047 (points recorded on orders). **US2 and US3 deploy to production together.**
- **US4 (Phase 6)**, **US5 (Phase 7)**, **US6 (Phase 8)** need Phase 2 only; US5/US6 reuse US1's back-office screen (T029–T033).
- **Polish** after the stories it touches; T089–T090 last.

### Within each story

Shared-library function → service → handler/route → container test → UI → UI tests. Contract types
(T016, T051, T068) before the clients that consume them.

### Parallel opportunities

- Phase 2: T007, T008, T009 together; T015, T016, T017 together once T004 is written.
- US1: backend (T019–T028) and clients (T029–T043) in parallel once T016 lands; web (T037–T039) and mobile (T040–T043) in parallel.
- US2: web (T054–T057) and mobile (T058–T061) in parallel after T047–T051.
- US4, US5, US6 can run in parallel with each other after Phase 2.

### Parallel example — User Story 1

```text
T024 customer points slice     | T030 back-office customers repo/queries
T027 points-credited template  | T040 mobile points domain + data
T036 back-office component tests | T039 web PointsTab test
```

## Implementation strategy

1. **MVP = Phases 1–3 (US1)**: staff can credit, customers see balance and history and are told. Deployable
   alone; immediately useful for goodwill.
2. **Then US2 + US3 as one release**: spend at checkout and refund parity — never one without the other.
3. **Then US4 (expiry), US5 (debit), US6 (settings)** in any order.
4. **Polish last**: closure warning, reconciliation + alarms, legal terms, sign-off.

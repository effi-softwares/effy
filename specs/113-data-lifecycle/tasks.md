# Tasks: Data Lifecycle (113)

**Input**: `specs/113-data-lifecycle/`: spec, plan, research R1–R12, data-model, `contracts/housekeeping-api.md`,
`contracts/jobs.md`, quickstart.

**Tests**: included where the spec's guarantees are mechanical:
- nothing personal left after erasure (SC-002, the full-database scan);
- erasure whole and repeatable (FR-017);
- restore before the date only (FR-009);
- no charge without an order (SC-005, FR-006a);
- holds freed (FR-003);
- "placed" defined once (FR-004);
- runs recorded (FR-022, FR-023).

Container tests run on the local Postgres recipe (memory: container-tests-local-postgres; `scratchpad/run-ct.sh <pkg dir>
[filters]`). The migration is checked with real goose up / down-to / up.

**Rules carried from the plan**:
- money only in `@effy/edge-shared/payments`; order status only through `finalize.ts`; runs only through `recordRun`;
- no personal data in logs, metrics or `housekeeping_run`;
- the deletion screen's words stay true (`RETAINED`);
- no compatibility fields: remove `order_awaiting_payment` and `resolvableByShopper` everywhere;
- no timers (live kind `housekeeping`); tours, skeletons and shadcn in back-office; no dialogs in the customer app;
- never edit a committed migration; `OPERATING_TZ` only;
- no real-world identifiers.

## Phase 1: Setup

- [X] T001 Write `db/migrations/20261112090000_data_lifecycle.sql` per data-model.md, with a full Down:
  - **order**: `order_status_check` re-created with `abandoned`; partial index `order_unpaid_idx`.
  - **refund**: `refund_kind_check` gains `unplaced` and `refund_reason_check` gains `order_abandoned`; add
    `refund_unplaced_ck`.
  - **customer**:
    - `customer_closure_state_check` with `erased`;
    - `email` DROP NOT NULL;
    - new `erased_at` and `matches_erased_barred_on`;
    - `customer_erased_ck` and `customer_erased_at_ck`.
  - **customer_closure_request**: `erased_at`, its CHECK, and `closure_due_idx`.
  - **new tables**: `erased_barred_fingerprint` (unique `(kind, digest)`), `housekeeping_run` (CHECKs and
    `(job, started_at DESC)` index), `housekeeping_settings` (seeded `id = 1`) and `housekeeping_settings_change`.
  - **grants**:
    - REVOKE ALL on `erased_barred_fingerprint` from `effy_shopper`;
    - REVOKE UPDATE, DELETE on `housekeeping_run` from `effy_shopper`, keeping INSERT for commerce;
    - REVOKE INSERT, UPDATE, DELETE on both settings tables from `effy_shopper`.
  - Copy each re-created CHECK's current list from the baseline.
- [X] T002 Run the migration with goose up / down-to 20261111090000 / up on the local Postgres (scratchpad pg cluster).
  Record the result for FEATURE-HISTORY.
- [X] T003 [P] Create `packages/shared-types/src/housekeeping.ts`:
  - `HOUSEKEEPING_JOBS` (`unpaid_orders`, `account_erasure`, `phone_registrations`), each with title, schedule words
    and minutes, staleness bound (60, 120 and 1,560 minutes), count keys, and count words ("Closed {n} unpaid orders",
    …);
  - `HousekeepingRunDTO`, `HousekeepingJobDTO` (`attention: null | "failed" | "partial" | "late"`), `HousekeepingDTO`,
    `HousekeepingSettingsUpdate` and `ABANDON_LIMITS` `{min: 60, max: 10080, default: 1440}`;
  - `abandonWords(min)` ("24 hours", "90 minutes", "7 days").
  - Export from `index.ts`.
- [X] T004 [P] Write `packages/shared-types/src/housekeeping.test.ts`: the job keys equal the migration's `job` CHECK and
  `ABANDON_LIMITS` equals the settings CHECK (read the migration file, as `messages.test.ts` does), plus `abandonWords`
  cases.
- [X] T005 [P] Edit `packages/shared-types/src/customer.ts`:
  - add `ERASED_CUSTOMER_WORD = "Deleted customer"`;
  - `ClosureBlockerDTO.kind` becomes `"order_in_transit"` only; remove `resolvableByShopper`;
  - add the refusal slugs `payment-in-progress` and `closure-final`, with their words per contracts/housekeeping-api.md;
  - fix the comment "No `"closed"`: erasure removes the row" to describe the tombstone;
  - the staff customer DTO gains `closingEraseAfter: string | null` and `matchesErasedBarredOn: string | null`.
- [X] T006 [P] Add the ops kind `housekeeping` to `packages/shared-types/src/live.ts`, and log `bo-housekeeping` to
  `activity-log.ts`. In `refund.ts`, `RefundKind` gains `unplaced`, plus the reason `order_abandoned` and their words
  ("Payment after the order closed"). Update their tests.
- [X] T007 Regenerate the Kotlin contracts with `pnpm --filter @effy/shared-types contract:gen` and `commerce-contract:gen`.
  Check that `contract/Dto.kt` loses `resolvableByShopper` and the awaiting-payment blocker kind, and that any refund kind
  enum gains `unplaced`.

## Phase 2: Foundational (blocks every story)

- [X] T008 Create `apis/edge-api/shared/src/lib/housekeeping.ts`:
  - `recordRun(job, fn)`:
    - times `fn`, which returns `{counts, problems}`;
    - inserts one `housekeeping_run` (`ok` / `partial`);
    - on a throw, inserts `failed` with `err.constructor.name` and rethrows;
    - emits `HousekeepingRan` (dimension `job`);
    - after the insert, announces ops `housekeeping` via `@effy/edge-shared/live`.
  - `readAbandonAfterMinutes(q)`.
  - Export from the package index.
- [X] T009 [P] Create `apis/edge-api/shared/src/lib/housekeeping.guard.test.ts`: `INSERT INTO public.housekeeping_run`
  appears only in `lib/housekeeping.ts`, with no `UPDATE public.housekeeping_run` anywhere, and the job strings used by
  callers are in `HOUSEKEEPING_JOBS`.
- [X] T010 [P] Create `apis/edge-api/shared/src/lib/housekeeping.container.test.ts`: an ok run, a partial run, and a
  thrown run (row `failed` plus rethrow), with no message text stored.
- [X] T011 Create `apis/edge-api/shared/src/lib/placed-order.ts` with
  `PLACED_ORDER_SQL = (alias = "o") => \`${alias}.placed_at IS NOT NULL\``, exported. Switch these readers to it:
  - `shared/src/promotions/candidates.ts:247`;
  - `orders/src/customers/repository.ts:30` and `:85`;
  - `orders/src/orders/repository.ts:87` (`baseWhere`), `:632`, `:636` and `:655`;
  - `shared/src/points/reconcile.ts:33` (stranded = held on an order that is not `pending_payment`; keep the meaning, and
    allow-list it).
- [X] T012 [P] Create `apis/edge-api/shared/src/lib/placed-order.guard.test.ts`. It scans every service's `src` (not
  tests) for `status <> 'pending_payment'` and `NOT IN ('pending_payment'`. Allowed: `payments/finalize.ts`,
  `payments/abandon.ts` and `points/reconcile.ts`.
- [X] T013 Add `finalizeAbandoned(tx, orderId)` to `apis/edge-api/shared/src/payments/finalize.ts`. It returns
  `{applied, customerSub, pointsReleased}`:
  - guard `UPDATE "order" SET status='abandoned', updated_at=now() WHERE id=$1 AND status='pending_payment'`;
  - payment `canceled`;
  - `releasePoints`;
  - `releaseUses(tx, orderId, 'expired')`, widening the `why` type in `apis/edge-api/shared/src/promotions/uses.ts:133`
    to include `"expired"` (the CHECK already allows it);
  - `delivery_slot_booking` `held` → `released`.
- [X] T014 Create `apis/edge-api/shared/src/payments/abandon.ts` with
  `abandonOrder(deps: {gateway, transact, settlePaid}, orderId)`. It returns
  `"abandoned" | "paid" | "in_progress" | "unreachable" | "gone"` per research R2:
  - read the order and its intent;
  - no intent → finalize at once;
  - `cancelPaymentIntent`: `canceled` → `finalizeAbandoned`; `succeeded` → `settlePaid`;
    `requires_action` / `requires_payment` → `in_progress`; a throw → `unreachable`;
  - `gone` when the order is no longer `pending_payment`.
  - Export it from `payments/index.ts`.
- [X] T015 [P] Create `apis/edge-api/shared/src/payments/abandon.container.test.ts` with a fake gateway, covering:
  - each result;
  - points released, code reusable, slot released;
  - the cart untouched;
  - a second call returns `gone`;
  - a no-intent order.
- [X] T016 Extend the payments writer guard (`apis/edge-api/shared/src/payments/*.guard.test.ts`, or a new
  `order-status.guard.test.ts`) so `status='abandoned'` / `'abandoned'` writes appear only in `finalize.ts`. T012 covers
  readers; this covers writers.

**Checkpoint**: runs can be recorded, "placed" is defined once, and an order can be abandoned safely.

## Phase 3: User Story 1 - A deleted account is erased on the promised date (P1) 🎯 MVP

**Goal**: every due closure is erased whole within 24 hours of its date, leaving only what the law needs, unattributed.

**Independent test**: close a test account, back-date it, run erasure, then:
- the person can't sign in;
- the email registers fresh;
- orders show "Deleted customer";
- the full scan finds nothing.

- [X] T017 [US1] Add `deleteCustomer(providerCustomerId)` to `apis/edge-api/shared/src/payments/gateway.ts`:
  `customers.del`, with `resource_missing` counted as done. Add it to the gateway interface and every fake.
- [X] T018 [P] [US1] Create `apis/edge-api/customer/src/erasure/fingerprint.ts`:
  - `normaliseEmail`, `normalisePhone` (digits only);
  - `digest(kind, value, key)`, HMAC-SHA256 (`node:crypto`);
  - `loadKey()` from `ERASURE_FINGERPRINT_KEY_ARN` through the secrets extension (as the DB secret is read);
  - unit test `fingerprint.test.ts`.
- [X] T019 [US1] Create `apis/edge-api/customer/src/erasure/repository.ts`:
  - `claimDue(tx, limit)`: `FOR UPDATE SKIP LOCKED`, oldest `erase_after` first, closing customers only;
  - `eraseCustomer(tx, customerId, now, fingerprints | null)`, in the order of research R7 and the data-model table:
    1. `forfeit`;
    2. the deletes, including `order_business_identity`, `receipt_dispatch`, `email_delivery_event` and
       `email_delivery_status`;
    3. **no order is deleted**: scrub every order that is finished or was never paid (addresses to suburb and postcode;
       note, handover, `refund_request.message`, `delivery_proof.note` and `courier_consignment.label_key`);
    4. replace the address keys in `admin.audit_log.detail`;
    5. the tombstone;
    6. the fingerprints if barred;
    7. `customer_closure_request.erased_at`.
    It returns `{pointsForfeited, labelKeys}`.
  - `scrubFinishedOrders(tx)`: the same scrub for erased customers' orders that have since finished. It returns
    `{orders, labelKeys}`.
  - Take every table name from data-model.md. Delete children before parents.
- [X] T020 [US1] Create `apis/edge-api/customer/src/erasure/job.ts`, `runErasure(deps)` inside
  `recordRun("account_erasure", …)`. For up to 25 claimed requests:
  1. provider `deleteCustomer` when `stripe_customer_id` is set;
  2. Cognito `AdminDeleteUser` (`UserNotFoundException` = done);
  3. `eraseCustomer` in its own transaction.
  A failure in any step counts `retried`, adds a problem (step name and class) and leaves the account `closing`.
  - Then run `scrubFinishedOrders` (`ordersScrubbedLater`).
  - After each commit, delete the returned label files from the media bucket. A failed delete is a problem, not a throw.
  - Stop with 20 s left. Emit `AccountsErased` and `AccountErasureRetried`.
  - The order of steps and the accepted Cognito-before-DB window are in research R7.
- [X] T021 [US1] Add `adminDeleteUser(sub)` to `apis/edge-api/customer/src/password/cognito.ts`, or a new
  `erasure/cognito.ts` (customer pool id from `CUSTOMER_USER_POOL_ID`).
- [X] T022 [US1] Create `apis/edge-api/customer/src/erasure/handler.ts` and
  `apis/edge-api/customer/src/functions/account-erasure-scheduled.ts`, wired by hand (no DI).
- [X] T023 [US1] Edit `apis/edge-api/customer/serverless.yml`:
  - function `accountErasure`: `rate(1 hour)`, timeout 300;
  - env `STRIPE_SECRET_KEY_ARN` and `ERASURE_FINGERPRINT_KEY_ARN` (SSM `/effy/${sls:stage}/customer/erasure_fingerprint_key_arn`);
  - IAM: `cognito-idp:AdminDeleteUser` on the customer pool ARN, plus `secretsmanager:GetSecretValue` on both secret ARNs.
- [X] T024 [US1] Edit `apis/edge-api/customer/src/closure/repo.ts` `restoreAccount`: add `AND erase_after > now()`. In
  `service.ts`, a request that is live but past its date throws `ClosureFinalError`. The handler maps it to 409
  `closure-final` with the date.
- [X] T025 [US1] Edit `apis/edge-api/customer/src/closure/service.ts` `RETAINED`: replace the security entry with the
  wording in research R8. Keep `deletion-copy.test.ts` passing.
- [X] T026 [US1] Edit `apis/edge-api/customer/src/customer/repo.ts` (the customer-row insert) and the phone save:
  1. compute the email digest (and, on save, the phone digest);
  2. on a match in `erased_barred_fingerprint`, set `matches_erased_barred_on`;
  3. if the key can't be loaded, log and carry on (registration is never refused).
- [X] T027 [US1] Make `closure_state = 'erased'` refused like `closing` in `apis/edge-api/shared/src/lib/customer-identity.ts`.
- [X] T028 [US1] Sweep every reader of a customer's name or email (research R7 list).
  - Grep `c.email`, `customer.email`, `given_name` and `family_name` across `apis/edge-api/*/src`.
  - Make each row type's email `string | null`, and fall back to `ERASED_CUSTOMER_WORD` when the customer is erased.
  - `orders/src/customers/repository.ts`: leave erased customers out of the list, search and exports. Detail returns
    `closingEraseAfter` (from the live closure request) and `matchesErasedBarredOn`.
  - `orders/src/orders/repository.ts`: an erased customer gives `name = ERASED_CUSTOMER_WORD` and no id. The order detail
    by id still loads any status.
  - Also: `admin/src/deliverability/{activity,repository}.ts`, `admin/src/promotions/{list,promotion-extras}.ts`,
    `shared/src/delivery/{consignment,override}.ts`, `shared/src/lib/order-completion.ts` and
    `shared/src/points/warnings.ts`.
  - `tsc` across all services must pass with the nullable types.
- [X] T029 [P] [US1] Write `apis/edge-api/customer/src/erasure/erasure.container.test.ts`, covering:
  - **seed**, through real writers or their SQL, a customer with marked name, email, phone and street in: address, cart,
    saved item, list, feedback (plus a staff reply), marketing consent, notification choice, points (earned and expiry
    notice), a promotion target, a paid order with a note and a refund request, a tax invoice snapshot, an unpaid order, a
    device token, a notification, a newsletter row and an email delivery status;
  - also seed: a `receipt_dispatch`, an `email_delivery_event`, an `order_business_identity`, a deliverability
    `admin.audit_log` entry with the address, an unpaid order with a held `promotion_use` and points, an abandoned order with
    an `unplaced` refund, a courier consignment with a label key, a delivery proof with a note, and a paid order still on
    its way;
  - **erase**, then scan every `text`, `citext`, `varchar` and `jsonb` column of every table in `public` and `admin` (from
    `information_schema.columns`) for the marks. Only `tax_document.snapshot` may match, plus the address of the order
    still on its way;
  - that order: finish it, run `scrubFinishedOrders`, scan again. Now only `tax_document.snapshot` matches;
  - no order row was deleted, and the label keys were returned for deletion;
  - the forfeit recorded and the balance 0;
  - the paid order kept, with suburb and postcode;
  - the tombstone CHECKs;
  - re-registration with the email creates a new row;
  - a restored closure is never erased;
  - a cancelled-then-new closure uses the new date;
  - a failed Cognito step leaves `closing`, then the next run finishes;
  - a barred account leaves two fingerprints, an open one none;
  - a new registration matching a fingerprint sets `matches_erased_barred_on`;
  - running twice erases nothing twice.
- [X] T030 [P] [US1] Update `apis/edge-api/customer/src/closure/service.test.ts` and the closure container test:
  restore past the date gives `closure-final`, and restore before it works.
- [X] T031 [P] [US1] Update `apis/edge-api/notifications/src/purge/repository.ts` comments and its test, so the purge's
  erased-customer step also matches `erased_at` and still deletes after `erase_after` (the backstop).
- [X] T032 [US1] Infra: create `infra/envs/dev/housekeeping.tf`:
  - `random_password` and `aws_secretsmanager_secret` `effy/${var.env}/erasure-fingerprint-key`, with its version;
  - SSM parameter `/effy/${var.env}/customer/erasure_fingerprint_key_arn`;
  - add `account-erasure` (`effy-edge-customer-${var.env}-accountErasure`) to `background_function_alarms` in
    `background-functions.tf`, with its `stops` sentence.
  Run `terraform fmt` and validate locally (no apply).
- [X] T033 [US1] Back-office "Deleted customer" fallbacks: `apps/back-office/src/features/orders/OrderDetailScreen.tsx`
  (and the list's customer column) shows the name with no link when the id is null. Add a test case in
  `OrderDetailScreen.test.tsx`.
- [X] T034 [US1] Restore refused on both clients:
  - customer-web: the restore action in `apps/customer-web/app/(account)/account/privacy/actions.ts` and its screen show
    the `closure-final` words;
  - customer app: the restore use case in `features/account` maps 409 `closure-final` to the same words, in its existing
    sheet;
  - add a host test in `AccountCentreTest.kt`.

**Checkpoint**: erasure works on its own. The closure flow is unchanged except restore after the date.

## Phase 4: User Story 2 - An unpaid order is closed by itself (P1)

**Goal**: orders awaiting payment end after the abandon time with nothing held and no charge possible, and a decline no
longer loses a later payment.

**Independent test**: an unpaid checkout with points and a code, back-dated, then one run: the order is gone from the
customer's list, the points and code are usable, and the cart is kept.

- [X] T035 [US2] Create `apis/edge-api/commerce/src/housekeeping/job.ts`, `runUnpaidOrders(deps)` inside
  `recordRun("unpaid_orders", …)`:
  - read the abandon time;
  - select up to 50 due orders per contracts/jobs.md;
  - `abandonOrder` each and count by result;
  - count `lateRefunds` as `refund` rows of kind `unplaced` created since the previous run's start;
  - stop with 15 s left;
  - after each commit, announce customer `orders` and `points` and ops `orders`.
  - Emit `UnpaidOrdersClosed` and `UnpaidOrdersStillPaying`.
- [X] T036 [US2] Create `apis/edge-api/commerce/src/housekeeping/handler.ts` and
  `apis/edge-api/commerce/src/functions/unpaid-orders-scheduled.ts`. In `apis/edge-api/commerce/serverless.yml`, add
  function `unpaidOrders`, `rate(15 minutes)`, timeout 120.
- [X] T037 [US2] Edit `apis/edge-api/commerce/src/webhook/handler.ts`:
  - `failed` now only `UPDATE payment SET status='failed'` (the order stays `pending_payment`; FR-006a);
  - `succeeded` where `finalizeSucceeded` returns `NOT_APPLIED` and the order is `abandoned` or `failed` →
    `refundUnplaced(tx, orderId, intentId)`, submitted after the commit.
- [X] T038 [US2] Add `refundUnplaced(tx, orderId, intentId)` and its post-commit submit to
  `apis/edge-api/shared/src/payments/refunds/` (repository and service):
  - full card amount, kind `unplaced`, reason `order_abandoned`, actor `system`, key `unplaced:<intentId>`;
  - idempotent on the key;
  - emits `UnplacedPaymentRefunded`.
  - Check that `refundReconcile` resolves it like any refund.
- [X] T039 [US2] Edit `apis/edge-api/commerce/src/checkout/service.ts` `mayReusePendingOrder`: a `failed` payment row on a
  `pending_payment` order with a live intent is reused (the retry path). Only `canceled` reaches `finalizeFailed`.
- [X] T040 [US2] Edit `apis/edge-api/commerce/src/orders/repository.ts` list (line 168): `AND (o.placed_at IS NOT NULL OR
  o.status = 'pending_payment')`. Check that the detail read refuses `abandoned` / `failed` orders the same way (404).
- [X] T041 [P] [US2] Write `apis/edge-api/commerce/src/housekeeping/job.container.test.ts`, covering:
  - due versus not due;
  - a second intent call refreshes `updated_at` (FR-006);
  - 60 due → 50 closed this run, the rest next run;
  - the abandon time read from settings;
  - every result counted;
  - the run row's counts.
- [X] T042 [P] [US2] Update the commerce webhook tests (`checkout.container.test.ts` or a new
  `webhook.container.test.ts`), covering:
  - a decline leaves the order unpaid with its holds;
  - decline then success → paid, with points spent and the code confirmed;
  - success on an abandoned order → one `unplaced` refund, and a second delivery adds none.
- [X] T043 [US2] Infra: add `unpaid-orders` (`effy-edge-commerce-${var.env}-unpaidOrders`) to
  `infra/envs/dev/background-functions.tf`. In `housekeeping.tf`, add a metric alarm on
  `UnplacedPaymentRefunded >= 1` in the commerce namespace, to the alerts topic.
- [X] T044 [P] [US2] Clients after FR-006a:
  - customer-web `apps/customer-web/app/checkout/complete/state.ts` and `page.tsx`: a declined payment now leaves the
    order `pending_payment` (with payment `failed`). The complete page must say "declined, try again" and offer the
    payment step, never wait for an order status that won't come;
  - the customer app's checkout result handling: the same;
  - the order list and detail on both no longer meet `failed` / `abandoned` orders; remove wording kept only for them;
  - update their tests.

**Checkpoint**: unpaid orders end by themselves, and the decline defect is fixed.

## Phase 5: User Story 3 - An unpaid order no longer blocks deleting the account (P2)

**Goal**: deletion closes the customer's unpaid orders on the spot. Only a paid order on its way blocks.

**Independent test**: leave an unpaid checkout, then delete the account. It goes through and the order is `abandoned`.

- [X] T045 [US3] Edit `apis/edge-api/customer/src/closure/repo.ts` `findBlockingOrders`: drop the `pending_payment` arm.
  Add `findUnpaidOrders(customerId)`.
- [X] T046 [US3] Edit `apis/edge-api/customer/src/closure/service.ts`:
  - `toBlockerDTO` emits `order_in_transit` only;
  - `requestClosure`, after the code check, runs `abandonOrder` (with no `settlePaid`) on each unpaid order:
    - `in_progress`, `unreachable` or `paid` → `PaymentInProgressError(orderNumber)`, and nothing is closed (the webhook
      places a paid one through commerce; research R5);
  - then `closeAccount`.
  - The handler maps the error to 409 `payment-in-progress` with `errors: [{field: "orderNumber", message}]`. Wire the
    gateway explicitly (shared `payments`).
  - Add `STRIPE_SECRET_KEY_ARN` and its secret read to the closure functions in `apis/edge-api/customer/serverless.yml`.
- [X] T047 [P] [US3] Update `apis/edge-api/customer/src/closure/service.test.ts` and `repo.container.test.ts`, covering:
  - an unpaid order isn't a blocker;
  - the request abandons it;
  - `in_progress` refuses with the number;
  - a paid order in transit still blocks;
  - device tokens are gone after closure (FR-008).
- [X] T048 [P] [US3] customer-web `apps/customer-web/app/(account)/account/privacy/DeleteAccountFlow.tsx`: remove the
  awaiting-payment blocker branch and `resolvableByShopper`, and show the `payment-in-progress` words on the confirm step.
  Update its test.
- [X] T049 [P] [US3] Customer app: in `features/account/domain/AccountClosure.kt` and `data/HttpClosureRepository.kt`,
  remove the awaiting-payment kind and field, and map 409 `payment-in-progress` to the words in the existing sheet. Update
  `AccountCentreTest.kt`.

**Checkpoint**: the store-rule "unnecessarily difficult" refusal is gone.

## Phase 6: User Story 5 - Staff can see the clean-ups working (P2)

**Goal**: one page shows each job's last run, result, counts, next run and attention, plus the abandon time and the
activity. Failures alarm.

**Independent test**: after the runs, the page matches `housekeeping_run`; a failed run shows "needs attention".

- [X] T050 [US5] Create `apis/edge-api/orders/src/housekeeping/repository.ts`:
  - the latest run per job (`DISTINCT ON (job)`);
  - `getSettings`;
  - `updateSettings(tx, value, version, by)`, which writes `housekeeping_settings_change`.
- [X] T051 [US5] Create `apis/edge-api/orders/src/housekeeping/service.ts`:
  - `getHousekeeping(now, roles)`, with attention (`failed`, `partial` or `late` by each job's bound) and next run
    computed from `HOUSEKEEPING_JOBS`;
  - `updateHousekeepingSettings(sub, update, isAdmin)`, with errors `HousekeepingForbidden`, `InvalidSettings` and
    `SettingsChanged`;
  - announce ops `housekeeping` after the commit.
- [X] T052 [US5] Create `apis/edge-api/orders/src/housekeeping/activity.ts`, the activity source: runs as "Closed 14 unpaid
  orders" or "Erased 2 accounts · 1,200 points forfeited", typed by outcome; setting changes with who made them; and each
  `unplaced` refund as "Refunded {amount} paid after order {number} was closed", linking to the order by id. The words
  come from `HOUSEKEEPING_JOBS`.
- [X] T053 [US5] Create `apis/edge-api/orders/src/functions/housekeeping-v1-get.ts`, `housekeeping-v1-put.ts` and
  `housekeeping-activity-v1-get.ts`, following `notification-settings-*`. Add the three routes to
  `apis/edge-api/orders/serverless.yml` with the staff authorizer. Admin is checked by `hasStaffRole`.
- [X] T054 [P] [US5] Write `apis/edge-api/orders/src/housekeeping/service.test.ts` (attention: failed, late, fresh; next
  run) and `routes.container.test.ts` (roles: CSA reads, a manager PUT gets 403; range 400; stale version 409; the
  activity source pages).
- [X] T055 [US5] Update the shared guards and contracts:
  - `activity.guard` (the new route);
  - the change map (SILENT for reads; the PUT announces);
  - `live.contract` (`housekeeping` watched by back-office);
  - `gateway-capacity` (staff 234);
  - `docs/api/path-assignment.md` (three routes, `orders`).
- [X] T056 [US5] Back-office: create `apps/back-office/src/features/settings/housekeeping/`:
  - `repo.ts`, `queries.ts` (`HOUSEKEEPING_ROOT`) and `words.ts` (from `HOUSEKEEPING_JOBS`);
  - `HousekeepingScreen.tsx`:
    - the Settings layout with `PageHeader` "Clean-ups";
    - a `StaticTable` (`data-tour="housekeeping.jobs"`): job, last run, result `StatusWord`, what it did, next run;
    - the abandon time as a settings row (`data-tour="housekeeping.abandon"`), editable by admins only via the
      design-system `Select` / input, with the version sent;
    - the activity via `useActivityAction` and `ActivityLogDrawer` (log `bo-housekeeping`);
    - its own skeleton;
    - `useTourPage("housekeeping", …)`.
  - Add the route `/settings/housekeeping` in `apps/back-office/src/routes/settings.tsx` and `router.tsx`.
  - Add the settings index entry "Clean-ups" in the Business group (`SettingsIndexScreen.tsx`), visible to every role.
  - Add `features/live/routes.ts`: `housekeeping` → `HOUSEKEEPING_ROOT`.
- [X] T057 [US5] Tour HK: add it to `apps/back-office/src/features/tours/tours.ts` with the spec's words exactly, add
  `HK: "housekeeping"` in `codes.ts`, and add the inventory row in `specs/107-backoffice-guided-tours/spec.md`. Raise the
  `tours.test` count to 57.
- [X] T058 [P] [US5] Write `HousekeepingScreen.test.tsx`: three rows from a fixture, a failed run and a partial run marked, the manager sees
  the abandon time read-only, the admin saves, and the skeleton shape. Update `SettingsIndexScreen.test.tsx` (the new
  entry).
- [X] T059 [US5] Back-office customer page `apps/back-office/src/features/customers/CustomerDetailScreen.tsx`: a
  `Callout` "Being deleted: erased on {date}. Signing in before then restores the account." when `closingEraseAfter` is
  set, and "Matches an account that was barred and deleted on {date}." when `matchesErasedBarredOn` is set. No
  restore or erase action. Add a test.
- [X] T060 [US5] Infra (`infra/envs/dev/housekeeping.tf`), all to the alerts topic, with a comment that the staleness
  alarms fire while the database is stopped:
  - staleness on a missing `HousekeepingRan`, the same bounds as the page: `unpaid_orders` 1 hour, `account_erasure` 2
    hours, `phone_registrations` 26 hours, with `treat_missing_data = "breaching"`;
  - `AccountErasureRetried >= 1` in three consecutive 1-hour periods.

**Checkpoint**: staff and the operator can see and trust the clean-ups.

## Phase 7: User Story 4 - Phones that have gone quiet stop being registered (P3)

**Goal**: registrations unconfirmed for 270 days are removed, and every surface confirms on open.

**Independent test**: a 271-day-old registration is gone after the purge, and a fresh one stays.

- [X] T061 [US4] Edit `apis/edge-api/notifications/src/purge/repository.ts` and `handler.ts`:
  - `pruneRegistrations(now)` in batches of 1,000 for at most 30 s, wrapped in `recordRun("phone_registrations", …)`;
  - `purgeRuns(now)`, which deletes `housekeeping_run` older than 400 days;
  - emit `PhoneRegistrationsRemoved`.
- [X] T062 [P] [US4] Update `apis/edge-api/notifications/src/purge/repository.container.test.ts`: 271 days removed, 269
  kept, the run row written, runs older than 400 days removed.
- [X] T063 [P] [US4] shop-web `apps/shop-web/src/features/notifications/useNotifications.ts`: once per session, when
  permission is `granted` and a token is known, call `registerDevice` (refreshes `last_seen_at`). Update the hook test.
- [X] T064 [P] [US4] Customer app and driver app: confirm each re-registers its token on every start (find the push
  bootstrap under `core/push/`). Add a host test in each that the start path calls the device repository.

**Checkpoint**: no registration lives past 270 days without a sign of life.

## Phase 8: Polish & cross-cutting

- [X] T065 Run every service's `tsc` and vitest; edge-shared unit and guard tests; container suites for shared, commerce,
  customer, notifications and orders (run-ct). Record anything failing before this work (consignment P6, orders S4,
  package-status 073, admin 077) as unrelated.
- [X] T066 [P] back-office vitest (tours 57, skeletons, list screens, settings) and build; shop-web vitest and build;
  customer-web vitest, build and depcruise; design-system token guards; `scripts/check-no-refresh-timers.sh`.
- [X] T067 [P] Customer app host tests and the Android and iOS compiles; driver app host tests; `scripts/mobile-guard.sh`
  and `scripts/driver-guard.sh`.
- [X] T068 Walk SC-003: read each line of `RETAINED` and the deletion screen's "what is deleted" text against R7 and the
  data-model table, and note the result in FEATURE-HISTORY.
- [X] T069 [P] Docs:
  - `docs/next-implementation-candidates.md`: items 2 and 3 done (113);
  - `docs/notifications-backlog.md`: A9 "(113, done)";
  - 034 spec: FR-042 amendment 3, and FR-041/SC-011 now met;
  - `docs/store-submission/submission-checklist.md`: erasure row;
  - `docs/telemetry/platform-events.md`: the new metrics.
- [X] T070 Records:
  - `FEATURE-HISTORY.md`: the 113 entry, with the decline defect, the deploy order from quickstart.md, and what was
    verified;
  - the `CLAUDE.md` 113 line, and "Still ahead" no longer naming the abandoned-order sweep;
  - memory: a new `data-lifecycle-113.md` plus its `MEMORY.md` line.

## Dependencies

- Phase 1 → Phase 2 → stories.
- **US1** (erasure) needs T008 (`recordRun`) and T017. Unpaid orders are plainly deleted at erasure, so US1 doesn't need
  `abandonOrder`.
- **US2** needs T008, T011, T013–T016.
- **US3** needs T014 (`abandonOrder`). It is independent of US1/US2's jobs.
- **US5** needs T003 and T008. It reads whatever runs exist, so it can be built before the jobs run.
- **US4** needs T008.
- Infra tasks (T032, T043, T060) can be written at any time and are applied by the operator first (quickstart).

## Parallel opportunities

- Setup: T003, T005 and T006 together, then T004 and T007.
- Foundational: T009, T010, T012 and T015 alongside their implementation tasks.
- US1: T018 alongside T017; T029, T030 and T031 once T019–T020 exist.
- US2: T041, T042 and T044 after T035–T040.
- US3: T047, T048 and T049 together after T045–T046.
- US5: backend T050–T055 and back-office T056–T059 in parallel once the contract is fixed.
- US4: T062, T063 and T064 together.
- Different stories after Phase 2: US1 (customer service), US2 (commerce), US5 (orders plus back-office) and US4
  (notifications plus clients) touch different services.

## Implementation strategy

1. **MVP = Phase 1 + Phase 2 + US1.** The broken promise and the store blocker are closed first.
2. Then US2 (with the decline fix, which is money) and US3 (it reuses `abandonOrder`).
3. Then US5, so the operator can watch the jobs before relying on them.
4. US4 last.
5. Each phase ends with its checkpoint's test green. Deploy follows quickstart.md order. Nothing is deployed by Claude.

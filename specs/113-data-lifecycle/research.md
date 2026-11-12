# Research: Data Lifecycle (113)

Each decision was read from the code on 2026-11-11 (branch after 112). File references are where the fact lives today.

## R1 - Where each clean-up runs

**Decision**: three route-less scheduled functions in the services that already own each fact. There is no new service.

| Job key | Service / function | Schedule | DB role | Why there |
|---|---|---|---|---|
| `unpaid_orders` | `commerce` `unpaidOrders` | `rate(15 minutes)` | shopper (as `refundReconcile`) | Owns checkout and the payment provider key; `finalizeFailed` already runs there |
| `account_erasure` | `customer` `accountErasure` | `rate(1 hour)` | master (the service's) | Owns closure (`customer/src/closure`) and already holds customer-pool admin IAM |
| `phone_registrations` | `notifications` `purge` (one more step) | `rate(1 day)` (unchanged) | master | The daily purge already removes erased customers' notifications (109) |

**Rationale**:
- Fifteen minutes makes the shortest abandon time (1 hour) mean about an hour. Erasure is hourly, so "within 24 hours of the
  date" holds with 23 hours to spare, and each run's batch stays small.
- `customer_marketing_consent` is append-only for `effy_shopper` (111: UPDATE/DELETE revoked). Erasure must delete it, so it
  can't run as the shopper role. The `customer` service already connects as master.

**Alternatives**:
- One new `lifecycle` service: rejected. It would need checkout's provider key, closure's Cognito IAM and a third copy of the
  order rules, and spread one fact over two owners.
- A separate phone-registration function: rejected. A one-statement delete doesn't need its own alarm and deploy. It still
  records its own run (R9).

## R2 - "Abandoned" is a new order status with one writer

**Decision**:
- `order.status` gains `abandoned` (CHECK widened).
- `finalizeAbandoned(tx, orderId)` is added in `@effy/edge-shared/payments` `finalize.ts`, beside `finalizeFailed`, in one
  transaction. It does the following:
  - guard `UPDATE … SET status='abandoned' WHERE status='pending_payment'`;
  - payment `canceled`;
  - `releasePoints`;
  - `releaseUses(tx, orderId, 'expired')`. Its `why` type in `promotions/uses.ts` widens to include `expired`, which the
    CHECK already allows;
  - slot booking `released` where still `held`.
- `abandonOrder(gateway, orderId)` is the one entry point, in a new `payments/abandon.ts`. It runs before the transaction:
  1. If the order has an intent, call `gateway.cancelPaymentIntent`. It already returns the status after the attempt, so
     "too late, it was paid" isn't an error.
  2. `canceled` leads to `finalizeAbandoned`.
  3. `succeeded` settles the order as paid (the existing settle path) and returns `paid`.
  4. `requires_action`, `requires_payment` (processing) or a throw returns `in_progress` / `unreachable`. Nothing changes.
  5. An order with no payment row (intent creation never finished) skips the provider.
- The commerce clean-up and the customer closure (R5) both call `abandonOrder`. A guard holds `status='abandoned'` to
  `finalize.ts`.

**"Last touched"**: `order.updated_at`. `upsertPendingOrder` and `setOrderDeliveryInstructions` set it on every intent call
(`commerce/src/checkout/store.ts`), so "returning to checkout restarts the abandon time" (FR-006) is already true. A test
pins it.

**Alternatives**:
- Reuse `failed` with a reason column: rejected. `failed` already means "the payment was cancelled". The spec keeps abandoned
  apart, and five readers already list statuses by name (R4).
- Deleting abandoned orders: rejected. Their numbers may have been shown to the customer, and the late-payment refund (R3)
  needs the row. They are deleted at erasure (R7).

## R3 - A declined card no longer ends the order (FR-006a), and a late payment is refunded (FR-005)

**Found**: the webhook maps `payment_intent.payment_failed` to `finalizeFailed` at once (`commerce/src/webhook/handler.ts`
line 61). customer-web keeps the same client secret on a decline and lets the shopper try again
(`app/checkout/_payment/confirm.ts`). If the retry succeeds, `finalizeSucceeded`'s guard matches nothing (the order is
`failed`), so **the customer is charged and no order is placed**.

**Decision**:
- `payment_failed` records `payment.status='failed'` (the last attempt was declined) and leaves the order
  `pending_payment`. The points and promotion uses stay held, so the retry pays with what was shown. The clean-up ends it if
  nothing follows.
- `finalizeFailed` is then reached only from `mayReusePendingOrder` when the provider says the intent was cancelled.
- If `payment_intent.succeeded` arrives for an order that is `abandoned` or `failed`, `refundUnplaced(tx, orderId)` is
  called (new, in `payments/refunds`):
  - it inserts one `refund` with the new kind `unplaced`, reason `order_abandoned`, actor `system`, the full card amount and
    key `unplaced:<intent id>`;
  - it is submitted after the commit; `refundReconcile` resolves an uncertain one, as for every refund;
  - it emits the metric `UnplacedPaymentRefunded` (alarmed, R10);
  - the clean-ups activity shows it with the order number.
- With R2's cancel-first rule this should never happen. It is the safety net SC-005 requires.

**Alternatives**:
- Re-open a `failed` order when a success arrives: rejected. Its holds were released, so placing it could sell points or a
  code twice.
- Ignore it (today): rejected. It is the defect.

## R4 - One definition of "an order that was placed"

**Decision**:
- Add `PLACED_ORDER_SQL(alias)`, which is `<alias>.placed_at IS NOT NULL`, in `@effy/edge-shared` `lib/placed-order.ts`.
  `placed_at` is set only by `finalizeSucceeded` and is never cleared (a cancelled paid order keeps it).
- The readers that list statuses instead switch to it:
  - `shared/src/promotions/candidates.ts:247` ("has ordered");
  - `orders/src/customers/repository.ts:30, :85` (order counts, recent orders);
  - `orders/src/orders/repository.ts:87` (`baseWhere`; today this shows failed orders in back-office's list) and `:632/:636/:655`;
  - `shared/src/points/reconcile.ts:33` ("stranded" holds: any order not awaiting payment).
- 112's audience (`o.status = 'paid'`) is already right and stays.
- The customer's own list (`commerce/src/orders/repository.ts:168`) becomes "placed, or still awaiting payment"
  (FR-004).
- New `placed-order.guard.test.ts` fails `status <> 'pending_payment'`, or `NOT IN ('pending_payment'`, outside
  `finalize.ts`, `abandon.ts` and the reconcile.

**Rationale**: a sixth status would otherwise count as an order in every reader that lists only the statuses to leave out.

## R5 - Closing an account abandons its unpaid orders (FR-007, amends 034 FR-042)

**Decision**:
- `findBlockingOrders` drops the `pending_payment` arm, so only paid orders still on their way block.
- `ClosureBlockerDTO.kind` loses `order_awaiting_payment`, and `resolvableByShopper` goes. The no-compatibility rule
  applies: both clients' handling of that kind is removed.
- `requestClosure`, after the code is verified and before `closeAccount`, calls `abandonOrder` for each of the customer's
  `pending_payment` orders:
  - any `in_progress` or `unreachable` result gives 409 `payment_in_progress` with the order number, and nothing is
    closed;
  - a `paid` result (the payment went through just now) is also refused with `payment-in-progress`. The customer service
    never settles a payment itself: the webhook places the order through commerce's own post-payment steps, and the next
    attempt sees a paid order that is either finished or on its way (one implementation, Principle III). So the customer
    service calls `abandonOrder` without `settlePaid`.
- The `customer` service gains the provider key: `STRIPE_SECRET_KEY_ARN` and its secret read, on the closure functions and
  the erasure function only.
- **FR-008** is already built: `closeAccount` deletes the customer's `device_token` rows (`customer/src/closure/repo.ts:114`).
  A test pins it.

## R6 - Restore is refused once the date has passed (FR-009)

**Found**: `restoreAccount` cancels any live request with no date check (`closure/repo.ts:124`). A customer signing in
between the date and the next erasure run would be restored after being told it couldn't be undone, and would race the
erasure.

**Decision**:
- The update gains `AND erase_after > now()`.
- Past the date, the route answers 409 `closure_final`.
- Both clients say: "This account was deleted on {date} and can't be restored. You can create a new account with the same
  email."

## R7 - Erasure: a kept, empty customer row

**Decision**:
- The `customer` row stays as a tombstone, because `order`, `points_entry`, `promotion_use` and `refund_request` hold
  `customer_id NOT NULL`. Making them nullable would touch every money reader.
- `closure_state` gains `erased`, plus a new `erased_at`.
- `email`, `given_name`, `family_name`, `phone` and `stripe_customer_id` become NULL. `email` turns nullable with
  `customer_erased_ck`: `(closure_state = 'erased') = (email IS NULL)`. The unique key ignores NULLs, so the address is free
  for a new account.
- `cognito_sub` is kept. It is a random id that, once the Cognito user is deleted, belongs to nobody (the spec's analytics
  assumption), and 109's purge still matches on it.

**One account at a time** (FR-017), in this order, each step safe to repeat:
1. Claim the account with `SELECT … FOR UPDATE SKIP LOCKED` on the closure request: `cancelled_at IS NULL`,
   `erased_at IS NULL`, `erase_after <= now()`, and the customer `closing`. Up to 25 a run, oldest date first.
2. Provider: `gateway.deleteCustomer(stripe_customer_id)` (new). "No such customer" counts as done.
3. Cognito: `AdminDeleteUser` on the customer pool (new IAM). `UserNotFoundException` counts as done. Google-linked
   identities go with the user (034 FR-047 stays a no-op).
4. One transaction, `eraseCustomer(tx, customerId)` in a new `customer/src/erasure/repository.ts`:
   - `forfeit(tx, customerId, now)` (074 FR-024) first, while the history still has its owner;
   - delete: `customer_address`, `cart` (plus lines), `customer_saved_item`, `customer_list` (plus entries),
     `feedback_submission` (plus notes and replies), `customer_marketing_consent`, `customer_notification_choice`,
     `points_expiry_notice`, `promotion_customer`, `device_token` and `notification` (plus deliveries) by the sub (109's purge
     stays as the backstop), `newsletter_subscriber`, `email_delivery_status` and `email_delivery_event` by the address,
     `order_business_identity` and `receipt_dispatch` for every one of their orders;
   - **no order is deleted.** `promotion_use`, `order_promotion`, `points_entry`, `refund`, `round_stop` and
     `delivery_override` reference `order` with `ON DELETE RESTRICT`. A code used at an unpaid checkout, or an `unplaced`
     refund, would make the delete fail every run, and a refund is a money record. Never-paid orders are stripped like paid
     ones (FR-010a);
   - scrub every order of theirs **whose fulfilment is finished** (every package delivered, unfulfillable or withdrawn, or
     never paid):
     - `delivery_address` and `billing_address` keep only `city`, `region`, `postalCode` and `country`;
     - `delivery_note` and `delivery_handover` become NULL;
     - `refund_request.message` becomes the fixed sentence "Removed when the customer deleted their account.";
     - `delivery_proof.note` becomes NULL. The photo or signature is kept as the delivery record (FR-013);
     - `courier_consignment.label_key` becomes NULL. Its file is deleted from the media bucket after the commit (it carries
       the name and street);
   - an order **still on its way** keeps its address. Each erasure run also runs `scrubFinishedOrders`: erased customers'
     orders that have since finished get the same scrub, counted `ordersScrubbedLater`;
   - `admin.audit_log` rows whose `detail` holds the address (deliverability repairs store it on purpose,
     `admin/src/deliverability/repository.ts:209`) have those keys replaced with `ERASED_CUSTOMER_WORD`;
   - `tax_document` is not touched (FR-014);
   - the tombstone (above), the fingerprint (R8) if barred, `customer_closure_request.erased_at = now()`, and one
     `housekeeping_run` counter (R9).
- A failure in step 2, 3 or 4 leaves the account `closing`, so the next run picks it up again (the claim is per run). The
  problem goes in the run's record and the run's outcome is `partial`.
- **Known window (accepted)**: if step 3 succeeds and step 4 fails, the email is free in Cognito but still on the `closing`
  row. A new registration with that email fails on `customer_email_key` until the next run, an hour at most. That beats
  the reverse order, where a committed tombstone with a live Cognito user would need a second marker to finish.

**Every reader of a customer's name or email** treats `email` as nullable and falls back to `ERASED_CUSTOMER_WORD`. The
readers found in planning:
- `orders/src/customers/repository.ts` and `orders/src/orders/repository.ts`;
- `admin/src/deliverability/{activity,repository}.ts`;
- `admin/src/promotions/{list,promotion-extras}.ts`;
- `shared/src/delivery/{consignment,override}.ts`;
- `shared/src/lib/order-completion.ts`;
- `shared/src/notifications/messages/audience.ts`, which already leaves out non-open customers;
- `shared/src/points/warnings.ts`;
- `documents/tax-invoice.ts`, which reads the issued snapshot only and doesn't change.

The scan test catches stored data; the sweep task catches readers, and their row types become `email: string | null`.

**Staff views**:
- `ERASED_CUSTOMER_WORD = "Deleted customer"` goes in `@effy/shared-types` `customer.ts`. Every staff reader that prints a
  customer name falls back to it when `closure_state = 'erased'`.
- The back-office customer list and search leave erased rows out.
- An order's customer link is not shown for an erased customer.

**Proof (SC-002)**:
- `erasure.container.test.ts` seeds one customer through the real writers: address, cart, list, feedback, consent, points,
  a paid order with a note and a refund request, a tax invoice, a device, a notification and a newsletter row. Each carries
  a marked name, email, phone and street.
- It then erases the customer and scans **every** `text`, `citext`, `varchar` and `jsonb` column in `public` and `admin`
  for those marks.
- Only `tax_document.snapshot` may match. A table added later with a customer column fails this test until it is handled.

**Alternatives**:
- Delete the row and null the foreign keys: rejected (see above).
- A separate archive table: rejected. It would be a second copy of retained data to keep honest.

## R8 - The security fingerprint (FR-016)

**Found**: nothing in the code bars a customer. `customer.status = 'barred'` exists and is honoured, but it is set only by
hand in the database, and there is no reason column.

**Decision**:
- New table `erased_barred_fingerprint`: `kind` (`email` | `phone`), `digest bytea`, `erased_at`.
- The digest is HMAC-SHA256 of the normalised value: lower-case email, or phone digits only.
- The key is a new Secrets Manager secret `effy/<env>/erasure-fingerprint-key`, made by Terraform with a random value and
  read by ARN through the extension.
- It is written only for barred accounts, in the erasure transaction.
- At registration, the one customer-row writer (`customer/src/customer/repo.ts:25`) computes the email digest. On a match,
  it sets the new `customer.matches_erased_barred_on date`. The phone is checked when the profile's phone is first saved.
  The back-office customer page shows "Matches an account that was barred and deleted on {date}".

**Rationale**: a plain hash of an email can be reversed by guessing addresses. A keyed one can't without the key, which no
reader has.

**The disclosure line** (`RETAINED` in `customer/src/closure/service.ts`, one list for both clients) becomes:
- category: "Security records";
- reason: "If your account was barred for misuse, we keep a scrambled copy of its email and phone so we can recognise it if
  it's used again. Nothing else is kept."

`deletion-copy.test.ts` keeps the verb "DELETE".

## R9 - What staff see: one run table, one page

**Decision**:
- New table `housekeeping_run`, append-only (UPDATE/DELETE revoked from every role but the owner):
  `id`, `job`, `started_at`, `finished_at`, `outcome` (`ok` | `partial` | `failed`), `counts jsonb`, `problem text`.
- The only writer is `recordRun(job, fn)` in `@effy/edge-shared` `lib/housekeeping.ts`:
  - it times `fn`, which returns its counts and problems;
  - it inserts one row;
  - on a throw it inserts `failed` with the error's class name (no message, so no personal data) and rethrows, so the
    Lambda error alarm still fires.
- `counts` keys are declared per job in `@effy/shared-types` `housekeeping.ts` (`HOUSEKEEPING_JOBS`), with their words:

  | Job | Counts |
  |---|---|
  | `unpaid_orders` | `closed`, `stillPaying`, `paidLate`, `unreachable`, `lateRefunds` |
  | `account_erasure` | `erased`, `retried`, `pointsForfeited`, `ordersScrubbedLater` |
  | `phone_registrations` | `removed` |

- The purge deletes runs older than 400 days (FR-023 needs at least 90).
- Settings: new singleton `housekeeping_settings`:
  - `abandon_after_min`: default 1440, CHECK 60–10080;
  - `updated_by`, `updated_at`;
  - each change logged in `housekeeping_settings_change`, the same shape as 111's `notification_settings_change`.
- Routes: three in the `orders` service, on the staff gateway, beside 111's notification settings:
  - `GET /orders/v1/housekeeping`;
  - `PUT /orders/v1/housekeeping/settings` (admin only);
  - `GET /orders/v1/housekeeping/activity` (104 drawer source: runs plus setting changes).
- **Staff gateway 231 → 234 of 300 (78%).** Past 75%, as 112 recorded. R2 of 112 still holds (third gateway before about
  255). Nothing merged.
- "Needs attention": the last run is `failed` or `partial`, or there has been no run within the job's bound: unpaid
  orders 1 hour, erasure 2 hours, phone registrations 26 hours. It is computed at read time, and the alarms (R10) use the
  same bounds.
- Screen: back-office `/settings/housekeeping` "Clean-ups" in the Business group, visible to every role:
  - a `StaticTable` of three rows (job, last run, result, what it did, next run);
  - the abandon time as a settings row, editable by admins;
  - the activity drawer;
  - tour HK;
  - a skeleton in its own shape.
- Live: ops kind `housekeeping`, announced after each run and each setting change. The page re-reads on it, with no timer.

## R10 - Alarms (FR-024)

**Decision**:
- `background-functions.tf` gains `unpaid-orders` (commerce `unpaidOrders`) and `account-erasure` (customer
  `accountErasure`). The purge already has one.
- Staleness alarms: each job emits `HousekeepingRan` (dimension `job`). A missing datapoint reads as breaching: unpaid
  orders after 1 hour, erasure after 2 hours, phone registrations after 26 hours. These are the page's bounds.
- An alarm on `AccountErasureRetried >= 1` in three consecutive hourly periods: one account failing every run, which
  `partial` alone would hide.
- An alarm on `UnplacedPaymentRefunded >= 1` (money moved because of a race).
- All go to the alerts topic. `background-alarms.guard` requires the first two.

## R11 - Phone registrations (FR-020, FR-021)

**Decision**:
- **Prune**: the purge deletes `device_token WHERE last_seen_at < now() - interval '270 days'` in batches of 1,000, and
  records the `phone_registrations` run.
- **Confirm on open**: the register upsert already refreshes `last_seen_at` (`shared/src/lib/devices.ts`).
  - The customer and driver apps re-register on every start (backlog A9); a host test pins each.
  - shop-web registers only when notifications are switched on (`useNotifications.ts:78`). It gains a re-register on start
    when permission is granted and a token is known, once per session, inside the existing hook.

## R12 - Telemetry

Metrics emitted by each job:
- `UnpaidOrdersClosed`, `UnpaidOrdersStillPaying`;
- `AccountsErased`, `AccountErasureRetried`;
- `PhoneRegistrationsRemoved`;
- `HousekeepingRan` (per job).

Logs carry order ids and customer ids only, never names or addresses. There are no new client analytics events. The page
view is covered by the existing route tracking.

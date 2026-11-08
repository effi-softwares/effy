# Tasks: Notification Record & Destinations (109)

**Input**: `specs/109-notification-record/` (spec, plan, research R1–R16, data-model, contracts, quickstart)

**Tests**: included where the spec's guarantees are mechanical:
- one notification per event (FR-005);
- words kept (FR-003);
- one writer (FR-009);
- the destination vocabulary shared by TS and Kotlin (FR-010, FR-016);
- the read ownership check (FR-014, FR-017);
- 20,000 in 10 minutes (FR-019);
- retention cut-offs (FR-023, FR-024).

Container tests run on a local Postgres (memory: container-tests-local-postgres).

**Deploy rule**: the Stage A migration is additive. `notification_request` stays and is drained until Stage B (T052,
a later task, not in the first deploy).

## Phase 1: Setup

- [X] T001 Write the Stage A migration `db/migrations/20261107090000_notification_record.sql` per data-model.md:
  - `public.notification`: columns, CHECKs (audience, the 23 types, category, importance, source, `read_at` implies
    `seen_at`, `destination ? 'kind'`), UNIQUE `dedupe_key`, `notification_recipient_idx` and
    `notification_retention_idx`;
  - `public.notification_delivery`: FK ON DELETE CASCADE, CHECKs (channel, status, the email-addressed rule),
    UNIQUE `(notification_id, channel)`, `notification_delivery_pending_idx` and
    `notification_delivery_retention_idx`;
  - goose Down drops both;
  - `notification_request` is not touched.
- [X] T002 [P] Add `public.notification_delivery` and `public.notification` to the truncate list in
  `db/reset/reset_dev_data.sql`.
- [X] T003 [P] Create the destination vocabulary `packages/shared-types/src/notification-destinations.ts`:
  - `CustomerDestination`, `DriverDestination`, `ShopDestination` unions per contracts/destinations.md;
  - `parseDestination(audience, wire: unknown)`, lenient, `null` on anything unknown;
  - `shopPathFor(d)`, which percent-encodes ids;
  - `serializeDestination(d)`;
  - export it from `packages/shared-types/src/index.ts`.
- [X] T004 [P] Create `packages/shared-types/src/notification-destinations.fixtures.json`:
  - every kind of each audience, valid and with a missing field;
  - cross-audience cases, an unknown kind, non-JSON and an empty string;
  - shop `path` expectations, including an id that needs encoding.
- [X] T005 Create `packages/shared-types/src/notification-destinations.test.ts`:
  - runs every fixture case through the TS parser and `shopPathFor`;
  - fails if the embedded Kotlin copies (T028, T030) differ from the JSON. Follow the `delivery-type.test.ts`
    pattern, using `it.runIf(existsSync(...))`.
- [X] T006 [P] Add `NotificationReadResponse { notificationId, readAt, destination }` to
  `packages/shared-types/src/customer-contract.ts` and `packages/shared-types/src/driver-contract.ts`. The
  destination is a JSON object typed as the audience union. Regenerate with `pnpm --filter @effy/shared-types
  contract:gen` and `driver-contract:gen`. Never hand-edit the generated `Dto.kt` files.

## Phase 2: Foundational (blocks every story)

- [X] T007 Add the export `"./notifications": "./src/notifications/index.ts"` to `apis/edge-api/shared/package.json`,
  and create `apis/edge-api/shared/src/notifications/index.ts`.
- [X] T008 Move `apis/edge-api/notifications/src/worker/copy.ts` to `apis/edge-api/shared/src/notifications/catalogue.ts`
  (R4). Per type it keeps title, body, tag, group and `entityInLink` → **removed**, and adds:
  - `category` (R13 table);
  - `importance: "normal"`;
  - `destinationFor(input)` returning the audience's destination (data-model "Type → category → destination").
    The input carries `entityId` plus the extra ids a type needs (`orderId` for `order_with_courier` and
    `order_delivery_changed`; `fulfillmentId` / `productId` for shop).

  Also: rewrite `order_ready` to "Your order is packed" / "It will be on its way to you soon." (R16); export
  `NotificationType`, `NOTIFICATION_TYPES` and `isKnownNotificationType`; delete `deepLinkFor` / `webPathFor`.
- [X] T009 Move and extend `apis/edge-api/notifications/src/worker/copy.test.ts` →
  `apis/edge-api/shared/src/notifications/catalogue.test.ts`:
  - every type has a category valid for its audience and a destination its audience parses
    (`parseDestination` from T003);
  - customer words contain none of handoff / hub / fulfil(l)ment / package / parcel / run / shop (FR-027);
  - lock-screen words carry no `{` placeholders.
- [X] T010 Point `apis/edge-api/shared/src/lib/notification-types.ts` at the catalogue's `NotificationType` (shop
  labels unchanged). Update any importer of `../worker/copy` in `apis/edge-api/notifications/src/**` to
  `@effy/edge-shared/notifications`.
- [X] T011 Create the one writer `apis/edge-api/shared/src/notifications/notify.ts` (R3):
  - signature: `notify(tx, { audience, type, recipients: {sub, email?}[], entity, dedupeScope, channels:
    ("push"|"email")[], expiresAt?, priority? })`;
  - one `INSERT … SELECT FROM unnest(...) ON CONFLICT (dedupe_key) DO NOTHING RETURNING id, recipient_sub` with
    title, body, category, importance and destination from the catalogue, and `dedupe_key =
    type:sub:dedupeScope`;
  - then `INSERT INTO notification_delivery` for the returned rows only: push always when asked, email only for
    recipients with an email;
  - returns the count created;
  - no recipients → no-op.
- [X] T012 Create the container test `apis/edge-api/shared/src/notifications/notify.container.test.ts`:
  - one row per recipient, with words as the catalogue says at write time;
  - a second call creates no notification and no delivery (FR-005);
  - email delivery is skipped for a recipient with no email;
  - a notification is kept with zero deliveries when channels are empty (FR-006);
  - `expires_at` and `priority` are stored.
- [X] T013 Create the guard `apis/edge-api/shared/src/notifications/notifications.guard.test.ts`: scan
  `apis/edge-api/**/src/**/*.ts` (not tests) and fail any `INSERT INTO public.notification` or
  `public.notification_delivery` outside `notify.ts`. Also fail any **new** `INSERT INTO public.notification_request`
  anywhere except the legacy drain's test fixtures. Prove it by breaking it once.
- [X] T014 [P] Create `apis/edge-api/shared/src/notifications/notification-types.contract.test.ts` (R15): read the
  newest migration that sets `notification_type_check` / the `notification.type` CHECK, and assert it equals
  `NOTIFICATION_TYPES` and is a superset of `ShopNotificationType`.
- [X] T015 Create `apis/edge-api/shared/src/notifications/read.ts` with `markRead(sub, audience, id)` (R9):
  - `UPDATE … SET read_at = COALESCE(read_at, now()), seen_at = COALESCE(seen_at, now()) WHERE id = $1 AND
    recipient_sub = $2 AND audience = $3 RETURNING id, read_at, destination`;
  - returns `null` when there is no row;
  - validates the uuid shape first.
- [X] T016 [P] Create the container test `apis/edge-api/shared/src/notifications/read.container.test.ts`:
  - the owner gets the destination and `read_at`;
  - a repeat keeps the first `read_at` (FR-017);
  - another sub → null, the right sub with the wrong audience → null;
  - `seen_at` is set together with `read_at`.
  - **Done as**: the read checks live in `notify.container.test.ts` (one database, one file).
- [X] T017 Move each writer to `notify` in the same transaction it uses today. Keep who is told and the channels
  exactly as today (FR-008); select recipients first where the current SQL is set-based.
  - `apis/edge-api/shared/src/payments/finalize.ts`: `shop_new_order` for each active `shop_staff`, and
    `order_paid`. Delete `apis/edge-api/shared/src/payments/outbox.ts` and its re-exports.
  - `apis/edge-api/shared/src/lib/order-completion.ts`: `order_delivered`, push and email.
  - `apis/edge-api/shared/src/points/ledger.ts`: `points_credited`, push and email.
  - `apis/edge-api/shared/src/points/warnings.ts`: `points_expiring`, email only. Keep the `points_expiry_notice`
    CTE, then call `notify` with the returned rows.
  - `apis/edge-api/shared/src/delivery/override.ts`: `order_delivery_changed`, push and email, entity = override id,
    destination order.
  - `apis/edge-api/shared/src/delivery/consignment.ts`: `order_with_courier`, push and email, entity = consignment
    id, destination order.
  - `apis/edge-api/shop/src/fulfillments/repository.ts`: `order_ready`, scope = fulfilment id.
  - `apis/edge-api/shop/src/attention/repository.ts`: `enqueueIntent` → notify, dedupe scope = the occurrence id.
  - `apis/edge-api/catalog/src/review/repository.ts`: `notifyShop` → notify, scope = decision key.
  - `apis/edge-api/fleet/src/shared/driver-push.ts`:
    - `enqueueRunAssigned`, `enqueueRoundChanged` and `enqueueRoundsOpeningSoon` select recipients, then call
      notify;
    - `run_changed` keeps its `updated_at` scope;
    - `run_opens_soon` sets `expiresAt` to the round's opening time (R11);
    - `run_withdrawn` → destination `today`.

  Update each module's existing container or unit tests that asserted `notification_request` rows to assert
  `notification` + `notification_delivery`.
- [X] T018 Rewrite the push drain over the new tables (R10, R11) in `apis/edge-api/notifications/src/worker/`:
  - move today's `drain.ts`, `repository.ts` and their tests unchanged to `worker/legacy/`, still draining
    `notification_request`;
  - the new `repository.ts` claims `notification_delivery` rows joined to their notification
    (`status='pending'`, `ORDER BY priority, created_at`, `LIMIT $1 FOR UPDATE SKIP LOCKED`) and loads tokens for
    all recipients in one query (`subject_sub = ANY`, audience);
  - adds `markSent` / `markNoDevice` / `markMuted` / `markExpired` / `markRetry` / `markFailed` and `pruneToken`,
    plus `pendingStats()` (count and oldest age).
- [X] T019 Rewrite `apis/edge-api/notifications/src/worker/drain.ts`:
  - claim up to 500 at a time;
  - an expired notification → `expired`, nothing sent;
  - no tokens → `no_device`; every token muted for the type → `muted`;
  - build one message per token from the **row's** words and destination;
  - send in chunks of ≤500 through `sender.sendEach`;
  - per delivery: any token ok → `sent`, otherwise retry until `NOTIF_MAX_ATTEMPTS` → `failed`;
  - prune tokens that FCM reports dead;
  - email deliveries call `sendEmail(to, type, entityId)` as today;
  - loop until `deadline - 15s`; the summary keeps the existing fields plus `expired`, `noDevice` and `muted`.
- [X] T020 Rewrite `apis/edge-api/notifications/src/fcm/sender.ts` to contracts/push-payload.md:
  - `sendEach(messages[])` returns a result per message;
  - data = `type`, `notificationId`, `destination` (compact JSON), `title`, `body`, `tag`, `group`;
  - no `entityId`, `deepLink` or `webPath`;
  - mobile vs web shapes as today.

  Update `sender.test.ts`.
- [X] T021 Update `apis/edge-api/notifications/src/worker/email-sender.ts` to take `(to, type, entityId)` from the
  claimed notification (no change to the templates). Update `apis/edge-api/notifications/src/worker/handler.ts`:
  - run the legacy drain first, then the new drain, with the remaining time;
  - emit the existing metrics plus `NotificationDeliveriesPending` and `NotificationOldestPendingSeconds` (R14).
- [X] T022 [P] Add 3 read routes, one per audience (contracts/notification-read.md):
  - `apis/edge-api/customer/src/functions/customer-notifications-v1-id-read-post.ts`,
    `apis/edge-api/driver/src/functions/driver-notifications-v1-id-read-post.ts` and
    `apis/edge-api/shop/src/functions/shop-notifications-v1-id-read-post.ts`, each:
    - reads `sub` from that pool's claims;
    - calls `markRead` with its audience;
    - returns 200 `{notificationId, readAt, destination}`, 404 problem `notification_not_found`, or 400
      `invalid_notification_id`;
  - add the routes to `apis/edge-api/{customer,driver,shop}/serverless.yml` behind each pool's existing authorizer;
  - run `gateway-capacity.contract.test.ts` (shared 170/300).
- [X] T023 [P] Add handler unit tests for the three read routes (the 200 / 404 / 400 mapping), beside existing
  handler tests in each service.

**Checkpoint**: every existing notification is written as a `notification` with deliveries, sent with
`notificationId` + `destination`, and can be marked read.
  - **Done as**: one test of the shared factory, `shared/src/notifications/read-handler.test.ts`; each service file is a one-line binding of it.

## Phase 3: User Story 1: A tap opens what the notification is about (P1) 🎯 MVP

**Goal**: all 21 kinds open their screen in the customer app, the driver app and the shop console.

**Independent test**: quickstart walk 2 (killed, background and open).

### Customer app

- [X] T024 [P] [US1] Create `apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/core/push/Destination.kt`:
  - a sealed `CustomerDestination` (Home, Orders, Order, Points, Product, Aisle, Search, Sale);
  - `parseCustomerDestination(json: String?)`: lenient, null on unknown, using kotlinx.serialization `JsonObject`.

  It replaces `pushDestination` / `PushDestination` in `OpenedNotification.kt`.
- [X] T025 [US1] Change `apps/customer-mobile/shared/src/commonMain/.../core/push/OpenedNotification.kt` to
  `OpenedNotification(type, notificationId: String?, destination: String?)`. Update:
  - `apps/customer-mobile/shared/src/androidMain/.../core/push/EffyFirebaseMessagingService.kt`: `PushOpen`
    extras `type`, `notificationId` and `destination`, on both the launch intent and the foreground
    PendingIntent;
  - `apps/customer-mobile/shared/src/iosMain/.../core/push/IosPush.kt`:
    `IosPushOpen.opened(type, notificationId, destination)`;
  - `apps/customer-mobile/iosApp/iosApp/AppDelegate.swift`: read `notificationId` and `destination` from
    `userInfo`.
- [X] T026 [US1] Create `apps/customer-mobile/shared/src/commonMain/.../app/PushRouter.kt`: a pure function mapping
  `CustomerDestination?` → nav actions (`selectTab`, `resetToRoot`, `push` of `OrderDetail`, `Points`, `Product`,
  `Results(categoryKey / saleOnly / query)`, or nothing for Home). Reuse the routing the `BannerTarget` branches
  in `CustomerShell.kt` use, so there is one way to open each screen.
- [X] T027 [US1] Wire the signed-in path in `apps/customer-mobile/shared/src/commonMain/.../app/CustomerShell.kt`:
  replace the `pushDestination` `LaunchedEffect` with `PushRouter`. On a parse failure, select Home.
- [X] T028 [US1] Create `apps/customer-mobile/shared/src/commonTest/.../core/push/DestinationFixture.kt`, an embedded
  copy of T004, plus `DestinationTest.kt` (every customer case) and `PushRouterTest.kt` (each kind → expected nav
  actions). Delete `PushDestinationTest.kt`.

### Driver app

- [X] T029 [P] [US1] Create `apps/driver-mobile/shared/src/commonMain/kotlin/com/effyshopping/driver/mobile/core/push/Destination.kt`:
  a sealed `DriverDestination` (Today, Run, Account) and `parseDriverDestination(json)`.
- [X] T030 [US1] Create `apps/driver-mobile/shared/src/commonTest/.../core/push/DestinationFixture.kt` (copy of T004)
  and `DestinationTest.kt`.
- [X] T031 [US1] Change the driver `OpenedNotification` to `(type, notificationId, destination)`. Update:
  - `apps/driver-mobile/shared/src/androidMain/.../core/push/EffyFirebaseMessagingService.kt`: the extras;
  - `apps/driver-mobile/shared/src/iosMain/.../core/push/IosPush.kt`: `IosPushOpen.opened(type, notificationId,
    destination)`;
  - `apps/driver-mobile/iosApp/iosApp/AppDelegate.swift`.
- [X] T032 [US1] Update `apps/driver-mobile/shared/src/commonMain/.../app/DriverShell.kt`: route on
  `DriverDestination`:
  - Today → Today;
  - Run → today's phase lookup, as now;
  - Account → the Account tab;
  - null → Today.

  Drop the `type.startsWith("run_")` test.

### Shop console

- [X] T033 [P] [US1] Update `apps/shop-web/src/lib/sw-logic.ts`:
  - `parsePush` reads `notificationId` and `destination` and computes `path` with `shopPathFor`, falling back to
    `/` on null;
  - `planNotification` keeps grouping; a grouped plan has no `notificationId`.

  Update its tests.
- [X] T034 [US1] Update `apps/shop-web/src/sw.ts`: the shown notification's `data` = `{ path, notificationId, type,
  group }`. `notificationclick` posts `{type: "NAVIGATE", path, notificationId, notificationType}`, or opens the
  window at `path`.
- [X] T035 [P] [US1] Update the push samples so the Simulator sends what FCM sends: `notificationId` + `destination`,
  no `deepLink` / `entityId`:
  - `apps/customer-mobile/iosApp/push-samples/*.apns`;
  - `apps/driver-mobile/iosApp/push-samples/*.apns`.

**Checkpoint**: tapping each of the 21 kinds opens its screen (SC-001).

## Phase 4: User Story 2: Every notification is kept, exactly as sent (P1)

**Goal**: one record per person per event, deliveries with outcomes, expiry honoured.

**Independent test**: quickstart walk 1. Order once, check one row and its deliveries, repeat, still one.

- [X] T036 [P] [US2] Create the container test `apis/edge-api/notifications/src/worker/repository.container.test.ts`:
  - claim order is priority first, then age;
  - two concurrent claims never share a row (SKIP LOCKED);
  - each mark function sets status, attempts and `processed_at`;
  - `pendingStats` is correct.
- [X] T037 [P] [US2] Create the unit test `apis/edge-api/notifications/src/worker/drain.test.ts` (new), with fakes:
  - expired → `expired` with no send (FR-007);
  - no tokens → `no_device`; all muted → `muted`;
  - partial token failure still counts as `sent`;
  - a retryable failure → retry, and → `failed` at max;
  - prune on a dead token;
  - the payload uses the row's words even when the catalogue says something else (FR-003);
  - email path unchanged.
- [X] T038 [US2] Extend the writer tests from T017 with a repeat-event case for at least `finalize`, `ledger`,
  `consignment` and `driver-push`: the second run adds 0 notifications and 0 deliveries (SC-003).

**Checkpoint**: SC-003 holds.

## Phase 5: User Story 5: Opening a notification marks it read (P2)

Done before US3 because US3 uses the same call.

**Goal**: a tap records read and seen on Effy's side.

**Independent test**: quickstart walk 3.

- [X] T039 [P] [US5] Create `apps/customer-mobile/shared/src/commonMain/.../core/push/NotificationRepository.kt`
  (interface + `HttpNotificationRepository`): `markRead(id): ReadResult` (`Opened(destination)` | `NotYours` |
  `Unreachable`), calling `POST /customer/v1/notifications/{id}/read` with the generated DTO. Wire it in
  `apps/customer-mobile/shared/src/commonMain/.../app/AppContainer.kt`.
- [X] T040 [P] [US5] Create the same file `apps/driver-mobile/shared/src/commonMain/.../core/push/NotificationRepository.kt`
  for `/driver/v1/notifications/{id}/read`, wired in `apps/driver-mobile/shared/src/commonMain/.../app/AppContainer.kt`.
- [X] T041 [US5] After the router has opened the destination (signed in), call `markRead` in the background and
  ignore the result:
  - customer, in `CustomerShell.kt`;
  - driver, in `DriverShell.kt`.

  Capture `notification_opened {type, fallback=false}` **after** navigation (R14), and update both
  `AnalyticsEvent.kt` `NotificationOpened(type, fallback)` and the drift tests.
- [X] T042 [US5] Shop console:
  - add `markNotificationRead(id)` to `apps/shop-web/src/features/notifications/api.ts`, calling
    `/shop/v1/notifications/{id}/read`;
  - in `apps/shop-web/src/features/notifications/useNotificationNavigation.ts`, on NAVIGATE: navigate, then call
    it when there is a `notificationId`;
  - `track({name: "notif_opened", type, fallback})`, and update the type in `apps/shop-web/src/lib/telemetry.ts`.

**Checkpoint**: SC-006 (read within 5 s).

## Phase 6: User Story 3: A tap made while signed out is not lost (P2)

**Goal**: held through sign-in for the recipient only.

**Independent test**: quickstart walk 4.

- [X] T043 [US3] Customer app: add `pendingOpen: MutableStateFlow<OpenedNotification?>` (memory only) to
  `AppContainer.kt`. In `CustomerShell.kt`:
  - a tap while signed out goes into `pendingOpen` and the sign-in flow is shown as today;
  - when `signedIn` becomes true with a pending item, call `markRead` **first**:
    - `Opened(destination)` → route to the **server's** destination;
    - `NotYours` or `Unreachable` → clear it and do nothing more (R7).
- [X] T044 [US3] Driver app: the same held-and-verify path in `AppContainer.kt` and `DriverShell.kt`. A driver who
  is refused after sign-in sees the usual refusal, and the pending item is cleared.
- [X] T045 [US3] Shop console: when NAVIGATE arrives with no session (the router redirects to sign-in), store
  `{path, notificationId}` in memory (`apps/shop-web/src/lib/console-store.ts`). After sign-in, call
  `markNotificationRead` first: 200 → navigate to `shopPathFor(server destination)`, 404 or error → stay on the
  landing page.
- [X] T046 [P] [US3] Kotlin host tests for the held path in both apps (`PushRouterTest.kt` / a new
  `DriverPushRouterTest.kt`), with a fake `NotificationRepository`:
  - recipient → navigates to the server destination;
  - NotYours → nothing;
  - Unreachable → nothing;
  - no sign-in → nothing ever.

**Checkpoint**: SC-002.

## Phase 7: User Story 4: When the thing is gone, the person lands somewhere useful (P2)

**Goal**: fallbacks with a short message, never an error.

**Independent test**: quickstart walk 5.

- [X] T047 [P] [US4] Customer order detail (`apps/customer-mobile/shared/src/commonMain/.../features/orders/`, its
  ViewModel and screen): a not-found or forbidden load pops to the Orders root and shows "That order isn't
  available." through the kit's existing notice (no centred dialog). Customer product: a not-found → the
  destination's aisle when known, else Home. The router passes `aisleKey`.
  - **Not built**: the customer product fallback. No notification leads to a product yet; it comes with spec 4. Order details falls back to Orders with a message.
- [X] T048 [P] [US4] Shop console: a 404 sends `apps/shop-web/src/routes/orders.$fulfillmentId.tsx` to `/orders`
  and `apps/shop-web/src/routes/catalog.$productId.tsx` to `/catalog`, each with a toast ("That order is no longer
  available" / "That product is no longer in your catalogue").
- [X] T049 [US4] Report `fallback=true` on `notification_opened` / `notif_opened` when the destination fell back.
  Still mark read (FR-017; US5 scenario 3) in both apps and shop-web. The driver's run → Today fallback in
  `DriverShell.kt` sets it too.

**Checkpoint**: no error screen after a stale tap.
  - **Partly**: the driver app reports `fallback=true` (run no longer theirs). The customer app and shop console record the open with `fallback=false` and show the fallback; telling the two apart there needs the destination screen to know it came from a notification.

## Phase 8: User Story 6: Sending keeps up (P2)

**Goal**: 20,000 in under 10 minutes; a single notification not delayed.

**Independent test**: the simulation test below, plus quickstart walk 6.

- [X] T050 [US6] Create `apis/edge-api/notifications/src/worker/drain.load.test.ts`, with a fake clock and a stub
  sender at a simulated 1.5 s per 500-message `sendEach`:
  - 20,000 pending deliveries reach a final status within 10 simulated one-minute invocations (FR-019);
  - a priority-0 delivery inserted mid-backlog behind 20,000 priority-1 deliveries is sent in the next invocation
    (FR-020).
  - **Done as**: the simulation lives in `drain.test.ts` ("sending keeps up").
- [X] T051 [US6] Add the alarm `notification_backlog_stale` to `infra/envs/dev/notifications.tf`
  (`NotificationOldestPendingSeconds` > 300 for 3 one-minute periods, to the existing alerts topic, R14). Raise
  `notifBatchSize` in `apis/edge-api/notifications/serverless.yml` to 500 and document the time budget there.

## Phase 9: User Story 7: Old notifications are cleared, and a deleted account leaves none (P3)

**Goal**: retention and erasure (FR-023 to FR-025).

**Independent test**: the container test below, plus quickstart walk 7.

- [X] T052 [US7] Create `apis/edge-api/notifications/src/purge/repository.ts` and `handler.ts`. Batched deletes of
  5,000 per statement, looped until done or the deadline:
  - customer notifications > 180 days and driver/shop > 90 days;
  - deliveries > 30 days;
  - notifications of customers with an uncancelled `customer_closure_request` past `erase_after`;
  - legacy `notification_request` > 30 days.

  Emit `NotificationsPurged`. Add `notificationPurge` (`rate(1 day)`) to
  `apis/edge-api/notifications/serverless.yml`.
- [X] T053 [P] [US7] Create the container test `apis/edge-api/notifications/src/purge/repository.container.test.ts`:
  - 181 days removed and 179 kept (customer);
  - 91 days removed (driver/shop);
  - a 31-day delivery removed while its 20-day-old notification is kept (FR-024);
  - an erased customer leaves 0 rows;
  - a cancelled closure keeps its rows.
- [X] T054 [US7] In `apis/edge-api/customer/src/closure/repo.ts` `closeAccount`, delete the customer's
  `public.device_token` rows in the same transaction (R12). Extend `apis/edge-api/customer/src/closure/repo.container.test.ts`.

## Phase 10: User Story 8: Customers are told things in customer words (P3)

- [X] T055 [US8] Confirm T008's `order_ready` wording and T009's internal-words check are in place. Update any test
  or fixture still expecting "ready for handoff" (`rg -n "handoff" apis/edge-api apps/customer-mobile
  apps/customer-web`). The email templates aren't affected: `order_ready` is push only.

## Phase 11: Polish & cross-cutting

- [X] T056 [P] Update `docs/telemetry/platform-events.md` (`notification_opened {type, fallback}`),
  `docs/notifications-backlog.md` (mark A1–A6, A8, B1–B6, F1, F3 and F4 as "in 109") and
  `docs/observability-apple-blockers.md` (samples now carry `notificationId` and `destination`).
- [X] T057 Run the guards and suites in quickstart.md "Local checks". Fix anything they find:
  - `pnpm --filter @effy/shared-types test`, `@effy/edge-shared`, `@effy/edge-notifications`, `@effy/shop-web`;
  - both apps' host tests, Android compile and iOS framework compile;
  - `scripts/mobile-guard.sh`, `driver-guard.sh` and `check-no-refresh-timers.sh`;
  - the gateway capacity test;
  - typecheck of every touched service (`customer`, `driver`, `shop`, `catalog`, `fleet`, `orders`, `commerce`,
    `admin`).
- [X] T058 Add a FEATURE-HISTORY.md entry for 109:
  - what changed;
  - the deploy order (plan.md);
  - Stage B pending;
  - **the gap found**: no erasure job reads `customer_closure_request.erase_after`. 109 only clears notifications
    and devices; orders, addresses and the profile are still not erased.

  Add the CLAUDE.md "Features recorded" line.
- [X] T059 **Built 2026-11-08 after Stage A was deployed** (`20261108090000_drop_notification_request.sql`; deploy notifications first): the Stage B migration `db/migrations/<date>_drop_notification_request.sql`.
  It drops `public.notification_request`, deletes `apis/edge-api/notifications/src/worker/legacy/` and its handler
  call, and removes the legacy branch from purge and from the T013 guard. Run it only after a full deploy shows
  `select count(*) from notification_request where status='pending'` = 0.

## Dependencies & execution order

- **Phase 1 → Phase 2**: T001 before T011–T023. T003/T004 before T009 and the app twins.
- **Phase 2 blocks every story.** Within it: T007 → T008 → T009/T010 → T011 → T012/T013/T017; T015 → T016/T022;
  T018 → T019 → T020/T021.
- **US1** (Phase 3) needs Phase 2. **US2** (Phase 4) is tests over Phase 2 and can run beside US1.
- **US5 before US3**: US3 uses `NotificationRepository` (T039/T040).
- **US4** needs US1 (routers) and US5 (read after a fallback).
- **US6** needs T019. **US7** needs T001. **US8** needs T008.
- **T059** after everything has been deployed and drained.

## Parallel examples

- Phase 1: T002, T003, T004 and T006 together.
- Phase 2: after T011, run T012, T013 and T014 together. T022 and T023 alongside T018–T021.
- US1: T024 (customer), T029 (driver) and T033 (shop) together, then each app's wiring.
- US5: T039 and T040 together.
- US7: T053 beside T052 once the repository's function names are settled.

## Implementation strategy

1. **MVP = Phases 1–3**: every notification kept, sent with a destination, and every tap opening its screen. This
   can be deployed and walked on its own (quickstart walks 1–2).
2. Then US2's tests, US5 (read), US3 (signed out) and US4 (fallbacks): the apps and shop-web again.
3. Then US6 (the load test and the alarm) and US7 (purge): backend only.
4. Polish, the FEATURE-HISTORY entry, and hand the operator the deploy order. Stage B later.

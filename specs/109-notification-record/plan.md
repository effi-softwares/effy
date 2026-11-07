# Implementation Plan: Notification Record & Destinations

**Branch**: `109-notification-record` | **Date**: 2026-11-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/109-notification-record/spec.md`

## Summary

Every notification becomes a row in a new `public.notification` table: the person's lasting item, with the words as
sent, a category, a destination and seen/read/archived/expiry state. Push and email become rows in
`public.notification_delivery` (R1).

All ten call sites in nine modules that write notifications move to **one writer**,
`@effy/edge-shared/notifications` `notify()`. The words and destinations are decided there from a catalogue that
moves out of the worker, and a guard fails any other writer (R3, R4).

One closed **destination vocabulary** per audience lives in `@effy/shared-types`, with Kotlin twins pinned to
fixtures (R5). Pushes carry `notificationId` + `destination` instead of derived link strings (R6). The customer app,
the driver app and the shop console each route a tap through one router:
- signed in, it opens the destination straight away;
- signed out, it holds the tap in memory and checks ownership through the new read route after sign-in;
- a screen whose subject is gone falls back (R7, R8).

A tap records the notification read through `POST /{audience}/v1/notifications/{id}/read` (R9). The drain is
rewritten for volume: batch claims, `sendEach`, a time budget and a priority, so 20,000 clear in minutes and a single
notification never waits behind them (R10). Expiry is honoured (R11). A daily purge keeps the tables bounded and
erases closed customers; closing an account removes its devices (R12).

The old table stays until a Stage B migration (expand/contract, R2). The customer "ready for handoff" wording is
replaced (R16).

## Technical Context

**Language/Version**: TypeScript 5.9 (Node 22 Lambdas, React 19 shop-web), Kotlin 2.4 (customer and driver apps,
Android + iOS), Swift (the two `AppDelegate` files), PostgreSQL 16 SQL.

**Primary Dependencies**: existing only:
- `firebase-admin` (`sendEach`, already a dependency of `notifications`);
- `@effy/edge-shared`, which gains the `./notifications` export;
- `@effy/shared-types`;
- the quicktype contract generators;
- Compose navigation in both apps (`navState` / `tabs`).

**No new package.**

**Storage**: two new tables plus a CHECK-pinned type list (Stage A migration `20261107090000_notification_record.sql`).
`notification_request` is kept until Stage B. See [data-model.md](data-model.md).

**Testing**:
- vitest: unit tests, plus container tests on a local Postgres (repo recipe);
- guards: the one-writer guard and the type-list contract test;
- fixtures shared between TS and Kotlin;
- Kotlin host tests for both routers and the destination parsers;
- shop-web vitest for the service worker logic and navigation;
- the quickstart walk.

**Target Platform**:
- shared gateway: `customer`, `driver` and `shop` (one route each), plus `commerce`, `orders`, `fleet` and
  `catalog` through the shared library;
- the `notifications` scheduled workers;
- the customer and driver apps (Android, plus the iOS Simulator);
- shop-web (PWA + service worker).

**Project Type**: a monorepo of serverless services, a web app, two KMP apps and shared packages.

**Performance Goals**:
- 20,000 push deliveries to a final status within 10 minutes;
- a single new notification within 2 minutes during a backlog;
- read recorded within 5 s of a tap.

**Constraints**:
- no new always-on compute and no queue service (constitution III);
- no timers (`check-no-refresh-timers.sh`);
- one writer per table;
- no PII in payloads or telemetry;
- the shared gateway stays under 300 routes (167 + 3);
- never edit a committed migration;
- no compatibility fields, because there are no installed builds.

**Scale/Scope**:
- 2 migrations (Stage B is deferred);
- about 12 backend modules touched and 4 new (notify, catalogue, read, purge);
- 3 new route handlers;
- the drain rewritten;
- 1 Terraform alarm;
- shared-types: 1 module plus fixtures;
- customer app about 8 files, driver app about 6, shop-web about 5, 2 Swift files.

## Constitution Check

| Principle | Check |
|---|---|
| I Spec-driven | spec.md → this plan → tasks.md. ✓ |
| II Shared contracts | Destination vocabulary in `@effy/shared-types`, Kotlin twins pinned to one fixtures file. Read-route DTOs added to the customer and driver contracts and regenerated. The catalogue (words, categories) is one module in `@effy/edge-shared`. ✓ |
| III One serverless backend | Read routes go in the existing `customer`, `driver` and `shop` services on the shared gateway (167 → 170 of 300). The purge is a scheduled function in the existing `notifications` stack. Volume comes from batching inside the existing 1-minute Lambda: no SQS, no containers, no new backend. ✓ |
| IV Auth isolation | Each read route sits behind its own pool's authorizer. `markRead` matches `sub` **and** audience, so a token from another pool or person gets 404. A held tap is verified server-side; no account id is carried in the push. ✓ |
| V Native feel / design | No new screens. Fallback messages use each app's existing notice pattern: `EffySheet` / snackbar on customer, `DriverAlert` on driver, toast on shop-web. The customer app keeps no centred dialogs. ✓ |
| VI Layered architecture | Handler → shared service (`read.ts`) → SQL. One writer (`notify.ts`). App routers sit in the shell and use repositories (`NotificationRepository`), with no logic in screens beyond the fallback each screen owns. ✓ |
| VII Observability | `notification_opened {type, fallback}` captured after the screen shows. The metrics `NotificationDeliveriesPending`, `NotificationOldestPendingSeconds` and `NotificationsPurged`, and the alarm `notification_backlog_stale` (R14). No PII. Push still goes only through the notifications path. ✓ |
| Real-world identifiers | No address, account or endpoint introduced. Alarm actions reuse the existing alerts topic. ✓ |

No violations, so Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/109-notification-record/
├── spec.md
├── plan.md              # this file
├── research.md          # R1–R16
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── destinations.md
│   ├── push-payload.md
│   └── notification-read.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
db/migrations/20261107090000_notification_record.sql        # Stage A: notification, notification_delivery (R1, R2)
db/migrations/<later>_drop_notification_request.sql          # Stage B: deferred task, not in the first deploy
db/reset/reset_dev_data.sql                                  # truncate the two new tables

packages/shared-types/src/
  ├── notification-destinations.ts            # NEW: unions, parsers, shopPathFor (R5)
  ├── notification-destinations.fixtures.json # NEW
  ├── notification-destinations.test.ts       # NEW: fixtures + Kotlin copies identical
  ├── customer-contract.ts / driver-contract.ts   # + NotificationReadResponse
  └── index.ts
packages/shared-types/contract/…, contract-driver/…   # regenerated

apis/edge-api/shared/
  ├── package.json                            # + "./notifications"
  └── src/notifications/                      # NEW module
      ├── index.ts
      ├── catalogue.ts                        # moved from notifications/worker/copy.ts + category + destinationFor (R4, R13, R16)
      ├── catalogue.test.ts                   # moved copy.test.ts + internal-words check
      ├── notify.ts                           # the one writer (R3)
      ├── notify.container.test.ts
      ├── read.ts                             # markRead (R9)
      ├── read.container.test.ts
      ├── notifications.guard.test.ts         # no other INSERT INTO notification / notification_delivery
      └── notification-types.contract.test.ts # DB CHECK = catalogue = ShopNotificationType (R15)
  src/payments/{finalize.ts, outbox.ts}       # outbox.ts removed; finalize calls notify
  src/lib/order-completion.ts, src/points/{ledger,warnings}.ts,
  src/delivery/{override,consignment}.ts      # → notify
  src/lib/notification-types.ts               # shop labels keep; types re-exported from catalogue

apis/edge-api/shop/src/{fulfillments,attention}/repository.ts      # → notify
apis/edge-api/catalog/src/review/repository.ts                     # notifyShop → notify
apis/edge-api/fleet/src/shared/driver-push.ts                      # → notify (+ expiresAt for run_opens_soon)

apis/edge-api/customer/src/functions/customer-notifications-v1-id-read-post.ts   # NEW
apis/edge-api/driver/src/functions/driver-notifications-v1-id-read-post.ts       # NEW
apis/edge-api/shop/src/functions/shop-notifications-v1-id-read-post.ts           # NEW
apis/edge-api/{customer,driver,shop}/serverless.yml                              # + route each
apis/edge-api/customer/src/closure/repo.ts                                       # closeAccount deletes device tokens (R12)

apis/edge-api/notifications/
  ├── serverless.yml                          # + notificationPurge (rate 1 day)
  └── src/
      ├── worker/{drain,repository,handler}.ts    # rewritten: batch claim, priority, expiry, time budget (R10, R11)
      ├── worker/legacy/                       # today's drain of notification_request, moved unchanged until Stage B
      ├── worker/copy.ts                       # removed (moved to shared catalogue)
      ├── fcm/sender.ts                        # sendEach, payload per contracts/push-payload.md
      ├── worker/email-sender.ts               # reads entity_id + type from the notification
      └── purge/{handler,repository}.ts        # NEW (R12)

infra/envs/dev/notifications.tf               # + notification_backlog_stale alarm (R14)

apps/customer-mobile/
  ├── shared/src/commonMain/.../core/push/Destination.kt          # NEW twin (replaces pushDestination in OpenedNotification.kt)
  ├── shared/src/commonMain/.../core/push/NotificationRepository.kt # NEW: markRead
  ├── shared/src/commonMain/.../core/push/OpenedNotification.kt     # {type, notificationId, destination}
  ├── shared/src/commonMain/.../app/{AppContainer,CustomerShell}.kt # router: signed-in open / held + verify
  ├── shared/src/commonMain/.../features/orders/…                   # order-detail 404 → Orders + notice (R8)
  ├── shared/src/androidMain/.../core/push/EffyFirebaseMessagingService.kt   # PushOpen extras
  ├── shared/src/iosMain/.../core/push/IosPush.kt                   # IosPushOpen.opened(type, notificationId, destination)
  ├── shared/src/commonTest/.../core/push/{DestinationTest,DestinationFixture,PushRouterTest}.kt
  ├── iosApp/iosApp/AppDelegate.swift
  └── iosApp/push-samples/*.apns
apps/driver-mobile/                           # the same set: Destination.kt, NotificationRepository.kt, DriverShell router,
                                              # PushOpen, IosPushOpen, AppDelegate.swift, push-samples, tests
apps/shop-web/src/
  ├── sw.ts, lib/sw-logic.ts                  # destination → path, notificationId through to the page
  ├── features/notifications/{useNotificationNavigation.ts, api.ts}   # markRead after navigation / after sign-in
  ├── routes/orders.$fulfillmentId.tsx, routes/catalog.$productId.tsx # 404 → list + toast (R8)
  └── lib/telemetry.ts                        # notif_opened {type, fallback}

docs/telemetry/platform-events.md             # notification_opened {type, fallback}
docs/notifications-backlog.md                 # mark spec 1 items as in spec 109
```

**Structure Decision**: no new service, app or package. The record and its one writer go in a new
`@effy/edge-shared/notifications` sub-module. The vocabulary goes in `@effy/shared-types`. Each audience's read
route goes in its own existing service.

## Phase 0 / Phase 1

See [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/) and
[quickstart.md](quickstart.md). Post-design constitution re-check: unchanged, all ✓.

## Deploy order (for the operator)

1. `make db-up ENV=dev`: Stage A migration (additive; old code keeps working).
2. `make edge-deploy ENV=dev SERVICE=notifications`: drains both tables.
3. `make edge-deploy-all ENV=dev`: every writer service and the three read routes.
4. `make apply ENV=dev`: the backlog alarm.
5. shop-web via its pipeline; both apps from Android Studio / Xcode.
6. **Later**, when the legacy table has no pending rows: the Stage B migration, then
   `make edge-deploy ENV=dev SERVICE=notifications` without the legacy drain.

## Complexity Tracking

None.

# Quickstart: validating 109 (Notification Record & Destinations)

## Local checks (Claude runs these)

```sh
# Shared vocabulary + its Kotlin twins
pnpm --filter @effy/shared-types test                     # notification-destinations fixtures, twin copies

# Backend
pnpm --filter @effy/edge-shared test                      # notify, markRead, catalogue, guards, type-list contract
pnpm --filter @effy/edge-notifications test               # drain (batching, priority, expiry, 20k simulation), purge
# Container tests (local Postgres recipe, memory: container-tests-local-postgres):
#   notify (dedupe, deliveries only for new rows), markRead (owner / other sub / other audience),
#   claim order + SKIP LOCKED, purge cut-offs, erased-customer purge, closeAccount removes device tokens.

# Apps
(cd apps/customer-mobile && ./gradlew :shared:testAndroidHostTest :androidApp:compileDebugKotlin :shared:compileKotlinIosSimulatorArm64)
(cd apps/driver-mobile   && ./gradlew :shared:testAndroidHostTest :androidApp:compileDebugKotlin :shared:compileKotlinIosSimulatorArm64)
pnpm --filter @effy/shop-web test && pnpm --filter @effy/shop-web build

# Guards that must stay green
bash scripts/mobile-guard.sh && bash scripts/driver-guard.sh && bash scripts/check-no-refresh-timers.sh
(cd apis/edge-api/shared && npx vitest run src/lib/gateway-capacity.contract.test.ts)   # shared gateway 170/300
```

## Deploy (the operator runs these)

```sh
make db-up ENV=dev                                   # Stage A: 20261107090000_notification_record.sql
make edge-deploy ENV=dev SERVICE=notifications       # drains both tables from now on
make edge-deploy-all ENV=dev                         # every writer service + the three read routes
make apply ENV=dev                                   # the backlog alarm (notifications.tf)
# shop-web: push to dev (Amplify). Apps: install from Android Studio / Xcode.
```
Stage B (drop `notification_request`) comes **later**, after `select count(*) from notification_request where
status='pending'` returns 0 following a full deploy.

## Walk (dev, Android emulator with a Google Play image + shop console)

All queries: `psql "$(AWS_PROFILE=ef bash infra/scripts/db-dsn.sh dev)"`.

1. **Kept, once** (US2):
   - Place an order in the customer app.
   - `select type, title, body, destination, read_at from notification order by created_at desc limit 5;` shows one
     `order_paid` row for the customer and one `shop_new_order` per active staff member.
   - `select n.type, d.channel, d.status from notification_delivery d join notification n on n.id = d.notification_id
     order by d.created_at desc limit 10;` shows each delivery's outcome (`sent` or `no_device`).
2. **Taps open the thing** (US1). For each, test with the app killed, in the background, and open:
   - **Customer**: confirmed → that order; packed (the shop marks it ready) → that order and the new words; points
     (back-office credit) → Points; with the courier (a courier order handed over) → **that order**.
   - **Driver**: assign a run in back-office → "Run assigned" → that run. Unassign it → "Run removed" → Today.
   - **Shop console**: new order → `/orders/{id}`; mark a product out of stock → that product.
3. **Read** (US5): after each tap, that row's `read_at` and `seen_at` are set within 5 s. A second tap keeps the
   first `read_at`.
4. **Signed out** (US3):
   - Sign out of the customer app, have another order notification sent, tap it, and sign in as the same customer:
     the order opens.
   - Repeat, signing in as a different customer: their Home opens, and nothing about the first order appears.
5. **Gone** (US4):
   - Assign a run, then move it to another driver before tapping "Run assigned": Today opens.
   - In the shop console, click a notification for a product deleted meanwhile: the catalogue opens with a message.
6. **Throughput** (US6): the unit simulation in the notifications tests is the acceptance for 20,000 in 10 minutes.
   In dev, check that a normal notification still arrives within about a minute, and that the
   `NotificationOldestPendingSeconds` metric appears in CloudWatch.
7. **Purge** (US7): the container tests are the acceptance. In dev, after a day,
   `select min(created_at) from notification_delivery;` is no older than 30 days.
8. **iOS Simulator**: run each app from Xcode. `push-samples/send.sh` (updated with `notificationId` and
   `destination`) opens the same screens. Until the Apple account exists, the read call returns 404 for a sample id,
   which is expected.

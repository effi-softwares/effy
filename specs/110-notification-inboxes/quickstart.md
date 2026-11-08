# Quickstart: Notification Inboxes (110)

How to prove the feature works. Rules are in [data-model.md](data-model.md); routes are in
[contracts/inbox-api.md](contracts/inbox-api.md); live updates and badges are in
[contracts/live-and-badge.md](contracts/live-and-badge.md).

## Automated checks (Claude runs these)

```sh
pnpm --filter @effy/shared-types test                  # inbox fixtures, live kinds, customer-web paths
pnpm --filter @effy/edge-shared test                    # factory, guards (one writer, inbox writer, customer announce)
pnpm --filter @effy/edge-shared exec tsc --noEmit
# container tests on the local Postgres (repo recipe, scratchpad/run-ct.sh):
#   shared:   notifications/inbox, notifications/notify (pinned, afterCommit), lib/db afterCommit
#   driver:   work/load (out for delivery once per order), devices (catch-up notice)
#   customer: points expiry warnings (push + email)
#   notifications: drain claim (badge count)
for s in customer driver shop notifications; do pnpm --filter "@effy/edge-$s" test; done
pnpm --filter shop-web test && pnpm --filter shop-web build    # tours, list-screens, skeletons, live routes
pnpm --filter customer-web test && pnpm --filter customer-web build
# apps: host tests + Android/iOS compile
(cd apps/customer-mobile && ./gradlew :shared:allTests :androidApp:assembleDebug)
(cd apps/driver-mobile && ./gradlew :shared:allTests :androidApp:assembleDebug)
scripts/check-no-refresh-timers.sh && scripts/mobile-guard.sh && scripts/driver-guard.sh
```

## Operator deploy (dev)

The user runs these:

```sh
make db-up ENV=dev                                   # 20261109090000_notification_inbox.sql (additive)
make edge-deploy ENV=dev SERVICE=notifications       # badge count in pushes
make edge-deploy ENV=dev SERVICE=customer            # inbox routes, points push
make edge-deploy ENV=dev SERVICE=driver              # inbox routes, out for delivery, catch-up
make edge-deploy ENV=dev SERVICE=shop                # inbox routes
make edge-deploy-all ENV=dev                         # every notify() caller now announces `inbox`
# then shop-web and customer-web through their pipelines; both apps from Android Studio / Xcode
make gateway-usage ENV=dev                           # expect about 185 / 300 on the shared gateway
```

## Walk (by hand, in dev)

1. **Customer, app** (US1, US5):
   - Turn push off for Effy on the phone and place an order.
   - Take it through packed. The bell shows 2.
   - Open the inbox: the bell clears, and both items are under Today with dots.
   - Tap "Your order is packed": the order opens, and on Back the dot is gone.
   - Swipe "Order confirmed" away, then tap **Undo**: it comes back unread.
   - **Mark all read**: every dot is gone.
2. **Customer, website** (US6): sign in as the same customer. The bell shows 0, the page lists the same items as read,
   and archiving one here removes it from the app within seconds.
3. **Out for delivery** (US4):
   - Load the van for a round carrying that order.
   - One "Out for delivery" arrives by push and in the inbox. Load again, or load the order's second parcel: no
     second one.
   - A courier order never gets it.
4. **Shop** (US2):
   - Cause a new order and a low-stock warning with the console closed. Open it: the bell shows 2.
   - Open the panel and click "New order": the queue opens.
   - Open **See all**: the tour starts. Filter to Stock: only the warning; reload and the filter stays.
   - A second operator's bell is unaffected by the first one's reads.
5. **Driver** (US3):
   - Sign the driver out of every phone and assign a run.
   - Check the database: `select d.status from notification n join notification_delivery d on d.notification_id = n.id where n.type = 'run_assigned' order by n.created_at desc limit 1;` returns `no_device`.
   - Sign in: the inbox shows "Run assigned" and, pinned on top, "You have 1 run today". Tapping it opens Today.
   - Sign out and in again: no second notice.
6. **Live** (FR-018): with any inbox open, cause a notification for that person. It appears within 5 s; no reload.
7. **Badge** (US7, Android): with the app closed, cause two notifications. The launcher shows a dot or "2". Open the
   inbox: it clears.
8. **Points** (US8): run the points expiry function with a lot inside the warning period. You get a push, an inbox
   item under Points and the email, once.
9. **Isolation** (FR-027): call `PATCH /shop/v1/notifications/{customer's id}` with a shop token: 404.

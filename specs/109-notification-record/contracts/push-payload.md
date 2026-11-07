# Contract: Push payload (109)

Built by `apis/edge-api/notifications/src/fcm/sender.ts` from a `notification` row. Every value is a string (an FCM
rule).

## `data` (all platforms)

| Key | Value |
|---|---|
| `type` | The notification type, e.g. `order_ready` |
| `notificationId` | `notification.id` |
| `destination` | `notification.destination` as compact JSON ([destinations.md](destinations.md)) |
| `title` | `notification.title` (the words as sent) |
| `body` | `notification.body` |
| `tag` | From the catalogue. The same tag replaces an earlier banner rather than stacking. |
| `group` | From the catalogue (shop console grouping) |

**Removed**: `entityId`, `deepLink`, `webPath`. There are no installed builds outside the team, so no compatibility
fields are kept.

## Android and iOS

- `notification: { title, body }` from the row.
- `android: { priority: "high" }`.
- `apns: { headers: { "apns-priority": "10" }, payload: { aps: { sound: "default" } } }`.

Unchanged from today. Channels per category (backlog D6) and interruption levels (D7) are spec 3.

## Web (shop console)

- `data` only, with no `notification` block. The service worker shows the notification.
- `webpush.headers: { TTL: "600", Urgency: "high" }`.

The service worker:
- keeps `notificationId` and `destination` in the shown notification's `data`;
- on click, computes the path with `shopPathFor`;
- posts `{ type: "NAVIGATE", path, notificationId, notificationType }`.

A grouped notification ("3 new orders to pick") posts no `notificationId` (research R7).

## Tap → app (both mobile apps)

- **Android**: the data keys arrive as launch-intent extras. `PushOpen.consume(intent)` reads `type`,
  `notificationId` and `destination`. A notification shown while the app is open puts the same keys on its
  PendingIntent.
- **iOS**: `AppDelegate.didReceive` reads `userInfo["type"]`, `["notificationId"]` and `["destination"]` and calls
  `IosPushOpen.shared.opened(type:notificationId:destination:)`.

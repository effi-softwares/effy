# Contract: live `inbox` kind and the app-icon badge (110)

## Live update

- The new kind is `"inbox"` in `LIVE_KINDS` (`@effy/shared-types/live.ts`) and `LiveKind.INBOX("inbox")`
  (`packages/mobile-kit/.../LiveKind.kt`). `live.test.ts` keeps the two equal.
- The update is the usual single word, `{"k":"inbox"}`, with no id, count or text.

| Audience | Channel | Who re-reads |
|---|---|---|
| customer | `/customer/{sub}/{epoch}` | that customer's app and website |
| driver | `/driver/{driverId}/{epoch}` | that driver's app |
| shop | `/shop/{shopId}/{epoch}` | every operator of that shop, each reading their **own** count and list |

**Sent**:
- after a `notify()` that created at least one notification commits, once per recipient channel (several recipients
  at one shop give one announce);
- after `seen`, `read-all`, archive and undo, and the 109 `read` route, to the caller's own channel.

`announce` never throws (071).

**Client mapping**:

| Surface | On `inbox` |
|---|---|
| shop-web | `LIVE_ROUTES.inbox = [["shop","inbox"]]` |
| customer app, driver app | the badge store re-reads the count; an open inbox reloads its first page |
| customer-web | the bell island re-reads the count; the notifications page calls `router.refresh()` |

All of them also re-read when they come back to the front (existing caught-up behaviour). There are no timers.

## Push payload additions (customer and driver)

Additions to [109's push payload](../../109-notification-record/contracts/push-payload.md):

| Platform | Field | Value |
|---|---|---|
| APNs | `aps.badge` | the recipient's unseen count when the push is sent, including this one |
| Android | `notification.notification_count` | the same number |

The count is computed in the drain's claim, one lateral count per recipient on `notification_unseen_idx`. Shop web
push carries no badge, because the console sets its own (below).

## Clearing the badge

| Surface | When | How |
|---|---|---|
| customer / driver iOS | inbox opened (after `seen` succeeds) | `setBadgeCount(0)` through the platform push driver |
| customer / driver Android | inbox opened | cancel the app's shown notifications (the launcher dot goes with them) |
| shop-web (installed) | count changes | `navigator.setAppBadge(n)` / `clearAppBadge()` where supported; nothing otherwise |

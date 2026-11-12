# Contract: badge corrections and urgency (116 C6, D7)

## Every app push (changed)

- `android.notification.tag = notificationId`. The in-app notification (`onMessageReceived` while open) posts with the same tag.
- `apns.payload.aps["interruption-level"] = interruptionLevelFor(importance, category)`:

  | Importance / category | Level |
  |---|---|
  | important (wins over category) | `time-sensitive` (only when `APPLE_TEAM_ID` matches `^[A-Z0-9]{10}$`; else `active`) |
  | offers, news | `passive` |
  | anything else | `active` |

  `critical` is never sent.
- Web pushes are unchanged.

## A badge correction (new)

- **iOS** (platform `ios`): FCM message with no `notification` block; `apns.headers = { "apns-push-type": "alert",
  "apns-priority": "5", "apns-collapse-id": "badge" }`; `apns.payload.aps = { badge: <count> }`. No alert and no sound.
- **Android** (platform `android`): data only, `android.priority = "normal"`, `android.collapseKey = "badge"`:

  ```json
  { "type": "badge", "count": "3", "keep": "uuid,uuid,uuid" }
  ```

  The app cancels every shown Effy notification whose tag is not in `keep` (all of them when `count` is `"0"`), and shows
  nothing.
- **Web**: never sent (the console's badge is live, 110).

## The drain step (each minute)

1. Queue expiries (`QUEUE_EXPIRED_BADGES_SQL`): the people with an unseen item whose `expires_at` is in
   `(notification_badge_sweep.swept_to, now()]` (customer and driver audiences), upserted with `LEAST(requested_at)`; the same
   statement moves `swept_to` to `now()`. A skipped run is caught up by the next.
2. Claim: `DELETE … WHERE requested_at <= now() - interval '15 seconds' … SKIP LOCKED LIMIT 500 RETURNING`.
3. For each person: count and the latest 50 unseen ids; their app tokens (`device_token`, the audience, platform ios/android).
   Send. An invalid token is removed (050).
4. Metrics: `BadgeCorrections{audience, outcome: sent|no_devices|failed}`, `BadgeCorrectionsQueued`.

## Who queues a correction

| Change | Caller |
|---|---|
| inbox opened (seen), mark all read, archive / undo | `inbox-handlers.ts` (after the change commits) |
| one item read (a tap) | `read-handler.ts` |
| withdrawn (112), expired | the drain's expiry sweep (step 1) |
| a new notification whose push went out at once | nobody: its push carries the badge (110) |
| a new notification whose push did not go out at once (skipped, capped, held to 08:00, no push asked) | `notify()`, for those recipients |

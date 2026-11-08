# Contract: Sending rules (111)

This is what `notify()` (the one writer, `@effy/edge-shared/notifications`) and the delivery drain (`notifications`
service) guarantee. Callers do not change: no `notify()` call site gains a parameter.

## Per recipient, at write time

| Category policy | Recipient state | Notification row | Each requested channel's delivery |
|---|---|---|---|
| required | any | written | `pending` |
| not required, not marketing | the choice for the channel is off | written | `skipped` |
| not required, not marketing | on (or no row: the default) | written | `pending` |
| marketing | no current yes | **not written** | none |
| marketing | yes; push choice off | written | push `skipped` |
| marketing | yes; push on; over a limit | written | push `capped` |
| marketing | yes; push on; within limits; Effy clock in [21:00, 08:00) | written | push `pending`, `not_before` = next 08:00 |
| marketing | yes; push on; within limits; daytime | written | push `pending` |

- **Limits**: count the recipient's push deliveries on marketing notifications with status in
  (pending, sent, no_device, muted):
  - since 00:00 today on Effy's clock, against `promo_push_per_day`;
  - in the last 168 hours, against `promo_push_per_week`.
- **Lock**: a marketing `notify()` first takes `pg_advisory_xact_lock(hashtext('notification:promo-limits'))`.
- **Words**: a marketing notification whose title + body lacks "Effy" (case-insensitive) throws before anything is
  written.
- **Return value**: unchanged (the count of notifications created). A marketing call that drops everyone returns 0.

## At release (the drain's claim)

- The claim only takes `pending` rows with `not_before IS NULL OR not_before <= now()`.
- For a claimed delivery on a marketing notification, the claim also computes `allowed` with the same fragment. If it
  is false, the outcome is `skipped`, with no send and no attempt counted.
- The existing expiry handling turns a held delivery whose notification has expired into `expired`.
- `pendingStats` (the age alarm) ignores rows with `not_before > now()`.

## FCM message

`android.notification.channel_id` = the category's `androidChannel` (customer and driver). The shop console's web push
is unchanged. APNs is unchanged: interruption levels are deferred.

## Guards

- `preferences.guard.test.ts`:
  - only `preferences.ts` writes `customer_notification_choice` / `customer_marketing_consent`;
  - only the purge deletes from them;
  - nothing reads `customer_marketing_consent` directly except the view, the activity source and the purge.
- `notifications.guard.test.ts` (109): still one writer of notification and delivery rows.
- `notification-categories.test.ts`:
  - every catalogue type maps to a declared category of its audience;
  - the declared lists match FR-001;
  - the Kotlin fixture copies are identical;
  - the migration's CHECK lists agree with the declaration.

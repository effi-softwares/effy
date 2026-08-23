# Contract: FCM Message Payload (HTTP v1, via firebase-admin)

The worker builds one FCM message per recipient token (or a multicast) from a `notification_request`.
Uses the **HTTP v1** message shape through `firebase-admin` `messaging().sendEach()`.

## Shape

```jsonc
{
  "token": "<device_token.fcm_token>",
  "notification": { "title": "…", "body": "…" },      // OS-rendered; short, non-PII
  "data": {                                            // for deep-link + in-app handling
    "type": "order_paid|order_ready|order_out_for_delivery|order_delivered|shop_new_order|run_assigned",
    "deepLink": "effy://…",                            // routes on tap (FR-017)
    "entityId": "<orderId | fulfillmentId | runId>"
  },
  "android": { "priority": "high", "notification": { "channelId": "<per-type channel>" } },
  "apns":    { "payload": { "aps": { "sound": "default" } }, "headers": { "apns-priority": "10" } }
}
```

## Rules

- **No PII** in `title`, `body`, or `data` (FR-021) — copy is generic ("Your order is on the way"), the
  specifics come from the in-app screen the deep link opens.
- **Deep link** target per `type` maps to an in-app route (customer: order detail; shop: pick queue;
  driver: assigned run). The mobile app resolves `deepLink`/`entityId` on notification tap and open.
- **Android channels** created per notification category on the device (Android 8+ requirement).
- **iOS** delivery is APNs-via-FCM; the app forwards its APNs token to FCM (research R2).
- **Copy source**: notification title/body strings are non-secret config/localised resources, not
  hardcoded per call site.

## Error mapping (drives the worker, FR-018)

| firebase-admin error | Worker action |
|---|---|
| `messaging/registration-token-not-registered` | delete the `device_token` row |
| `messaging/invalid-argument` (bad token) | delete the row; log class |
| 429 / `messaging/quota-exceeded` / 5xx | leave `pending`, backoff, retry (respect `retry-after`) |
| success | count toward `sent` |

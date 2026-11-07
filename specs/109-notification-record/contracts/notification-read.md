# Contract: Mark a notification read (109)

One route per audience, each in that audience's own service on the **shared** gateway, behind that pool's existing
JWT authorizer.

| Route | Service |
|---|---|
| `POST /customer/v1/notifications/{id}/read` | `customer` |
| `POST /driver/v1/notifications/{id}/read` | `driver` |
| `POST /shop/v1/notifications/{id}/read` | `shop` |

All three call `markRead(sub, audience, id)` in `@effy/edge-shared/notifications`.

## Request

- Path `id`: a uuid. A malformed value → 400 problem `invalid_notification_id`.
- No body.

## Responses

**200**: the notification belongs to the caller (same `sub`, same audience). It is now read and seen. The first read
time is kept if it was already read.
```json
{
  "notificationId": "5b0c…",
  "readAt": "2026-11-07T09:12:03.120Z",
  "destination": { "kind": "order", "orderId": "7b1c…" }
}
```

**404** problem `notification_not_found`: there is no such notification for this caller. This covers every case
where it belongs to someone else or to another audience. It is never a 403, which would confirm that the id exists.

**401**: no valid token for this pool (the authorizer, as today).

## Rules

- Idempotent. Repeating it returns 200 with the same `readAt`.
- A read is not an announcement on the live channel in this feature. Spec 2 adds the `inbox` kind together with the
  unread count.
- Kotlin DTO: `NotificationReadResponse` is added to `customer-contract.ts` and `driver-contract.ts`. The generated
  `Dto.kt` files are regenerated (`contract:gen`, `driver-contract:gen`), never edited by hand.

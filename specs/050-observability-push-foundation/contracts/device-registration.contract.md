# Contract: Device-Token Registration (per audience, cold path)

One shape, three mountings — each behind its own pool's JWT authorizer on the shared HTTP API
(edge-customer `/customer/v1`, edge-shop `/shop/v1`, edge-driver `/driver/v1`). All write
`public.device_token`. DTOs live in `@effy/shared-types` (Principle II) and are generated to Kotlin.

## `POST /{audience}/v1/devices`  — register / refresh (authenticated)

Request:
```json
{ "fcmToken": "string", "platform": "android|ios", "appVersion": "string?" }
```
- `subject_sub` comes from the **verified JWT**, never the body (FR-012, isolation).
- Upsert on `fcmToken` (rotation-safe; re-points a device to the current signed-in subject).

Responses:
- `204 No Content` — registered/updated.
- `400` — bad platform / missing token.
- `401` — no/invalid token for this pool (structurally rejected across pools, Principle IV).

## `DELETE /{audience}/v1/devices/{fcmToken}` — unregister (authenticated)

- Deletes the row **only if** it belongs to the caller's `sub` (FR-020). `204` on success or absent
  (idempotent). Called on sign-out and on notifications-disabled.

## Rules

- Low-frequency CRUD → cold path (Principle III; research R5).
- No PII in request, response, or logs beyond `sub` (FR-021/022).
- Missing FCM config does **not** affect this endpoint — registration succeeds; only *sending* no-ops.

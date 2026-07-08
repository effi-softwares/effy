# Back-office API endpoints (edge-api)

Cold-path routes serving the internal back-office console (`apps/back-office`). All are behind the
per-pool **back-office** JWT authorizer (constitution Principle IV); failures use the shared
[error envelope](./error-envelope.md); versions follow the [versioning policy](./versioning-policy.md).

| Method + path | Since | Auth | Purpose |
|---|---|---|---|
| `GET /admin/v1/ping` | 004 | back-office pool; any role (group-less → 403) | Identity echo — proves the auth loop. |
| `GET /admin/v1/admin-ping` | 005 | back-office pool; **admin** only | Administrator-only proving read. Non-admin → 403 `forbidden`. Role-claim gate (US3); upgraded to the platform DB record (status + role) in US4. |
| `GET /admin/v1/me` | 005 (US4) | back-office pool; any role incl. group-less | Records (JIT upsert) + returns the platform staff record. |

Response shapes: see `specs/005-back-office-web/contracts/` (admin-ping, back-office-me).

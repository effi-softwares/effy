# Contract: edge-api (cold path) — bootstrap surface

**Base URL (this slice)**: the deployed HTTP API's execute-api URL, `dev` stage
(printed by `make edge-deploy`; stable until a custom domain slice). HTTPS only.
**Auth model**: gateway-level **JWT authorizers, one per Cognito pool** (issuer +
audience = that pool's app client), selected per route; handlers own authorization
(groups) from the authorizer claims (research C3/C7/D3).
**Errors**: [error-envelope.contract.md](./error-envelope.contract.md).
**Versioning**: [versioning-policy.md](./versioning-policy.md).

## Endpoints

### `GET /healthz` — liveness+readiness · public · unversioned
One function performs both checks (API Gateway has no probe split): process implicit +
DB `SELECT 1` under a 2s statement deadline.
- `200 {"status":"ready","checks":{"database":"ok"}}`
- `503 {"status":"unavailable","checks":{"database":"unreachable"}}`
Cold start may make the first call slower — documented tolerance, not an error (spec
edge case).

### `GET /v1/platform/status` — proving read · public
Same domain read as core-api's, through edge-api's own repository (its layer-traversal
proof). Response shape identical to core-api v1.

### `GET /v2/platform/status` — coexistence demo · public
Response shape identical to core-api v2 (`contract_version: 2`, nested `database`).
Both versions served side by side from one service module (spec SC-010).

### `GET /v1/back-office/ping` — protected · back-office pool
Gateway JWT authorizer (back-office pool) authenticates; the handler parses
`cognito:groups` defensively (stringified in the authorizer context) and echoes it.
- Valid back-office access token →
  `200 {"audience":"back-office","subject":"<sub>","groups":["admin"],"message":"pong"}`
- Missing/expired/tampered token, or valid token from any other pool → gateway-level
  `401` (`{"message":"Unauthorized"}` — API Gateway's own body; recorded contract note:
  authorizer rejections happen **before** the Lambda, so they carry the gateway shape,
  not problem+json. In-handler failures carry problem+json.)
- Authenticated back-office user with zero groups → `403 forbidden` problem+json
  (absent claim = deny; proves the RBAC guard).

### Any `/v3/...` (or unknown route) → gateway 404 → `404 no-route` problem+json from
the default/catch-all? **No** — HTTP API returns its own `{"message":"Not Found"}` for
unmatched routes. Recorded contract note: unknown-route 404s at the gateway carry the
gateway shape; problem+json applies to everything a handler answers. (A catch-all
default route is deliberately NOT added — it would bill a Lambda invoke for junk
traffic on the cost path.)

## Cross-cutting guarantees

- Every handler: sets `context.callbackWaitsForEmptyEventLoop = false` (shared preamble),
  logs exactly one pino record with `awsRequestId` + gateway `requestId`, echoes
  `x-request-id`, maps all failures through the shared problem+json builders.
- Per-function least-privilege IAM (only the extension's secretsmanager:GetSecretValue
  on the one secret ARN for DB-touching functions; nothing else).
- CloudWatch alarms shipped with the stack: Lambda `Errors>0`, `Throttles>0`,
  `Duration p95`, HTTP API `5xx` rate.
- CORS: `provider.httpApi.cors` restricted to the platform's approved dev web origins
  (per-stage params), not `*`.

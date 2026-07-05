# Contract: core-api (hot path) — bootstrap surface

**Base URL (this slice)**: `http://localhost:8080` (Docker-local; Fargate deferred).
**Auth model**: per-pool Cognito **access tokens** (`Authorization: Bearer <token>`);
per-route-group pool scoping; cross-pool structurally rejected (research D2).
**Errors**: [error-envelope.contract.md](./error-envelope.contract.md).
**Versioning**: [versioning-policy.md](./versioning-policy.md).

## Endpoints

### `GET /healthz` — liveness · public · unversioned
`200 {"status":"ok"}` — process up; checks nothing external.

### `GET /readyz` — readiness · public · unversioned
DB `Ping` under a 2s deadline.
- `200 {"status":"ready","checks":{"database":"ok"}}`
- `503 {"status":"unavailable","checks":{"database":"unreachable"}}` — plain status
  body (probes read codes); no host/credential detail.

### `GET /metrics` — Prometheus exposition · unversioned
`text/plain; version=0.0.4`. Instruments (custom registry):
`http_requests_total{method,route,status}`,
`http_request_duration_seconds_bucket{method,route,status}` (+ Go/process collectors,
DB pool stats). `route` label = Gin route **template** (`/v1/platform/status`), sentinel
`unmatched` otherwise. Excluded from auth/request-logging.

### `GET /v1/platform/status` — proving read · public
Full three-layer traversal to the dev database (migration ledger + `now()` +
`current_database()`).

```
200 application/json
{"environment":"dev","database_name":"effy","database_time":"2026-07-05T12:00:00Z",
 "migration_version":20260705095817,"migrations_applied":1}
```
- `500 internal` (problem+json) if the ledger is absent (003 db-up not yet applied) —
  cause named in the log only. `503 unavailable` if the DB is unreachable.

### `GET /v2/platform/status` — coexistence demo · public
Same domain read, **deliberately reshaped** payload (breaking-shape example):

```
200 application/json
{"contract_version":2,"environment":"dev",
 "database":{"name":"effy","time":"2026-07-05T12:00:00Z",
             "migration":{"version":20260705095817,"applied":1}}}
```
Served concurrently with v1 by the same service/repository (spec SC-010).

### `GET /v1/customer/ping` — protected · customer pool
Proves identity enforcement (spec US3).
- Valid customer access token → `200 {"audience":"customer","subject":"<sub>","message":"pong"}`
- Missing/expired/tampered token **or valid token from any other pool** →
  `401 unauthenticated` (byte-identical `type`/`title`; no oracle).

### Any `/v3/...` (or unknown path) → `404 no-route` problem+json.

## Cross-cutting guarantees

- Every response carries `X-Request-ID` (inbound honored, else generated); exactly one
  structured log record per handled request; no secrets/PII beyond `sub` in logs.
- CORS: only origins in `CORS_ALLOWED_ORIGINS` (per-env config) receive permissive
  headers; others are refused by the browser preflight contract.
- Middleware order (binding, per ARCHITECTURE.md): request-ID → logging → recovery →
  CORS → per-pool auth (on scoped groups).
- Timeouts: `ReadHeaderTimeout` 5s / `ReadTimeout` 10s / `WriteTimeout` 30s; graceful
  shutdown drains ≤ 15s then closes the pool.

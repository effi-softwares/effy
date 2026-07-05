# Data Model — 004-backend-bootstrap

No new database schema ships in this slice (spec FR-004: the proving slice reads
platform-owned data only). The "data model" of a bootstrap is therefore its **wire
shapes, identity model, and configuration contract** — the structures every future
feature builds on. Sources: [research.md](./research.md) decisions A6, D1–D4, E2–E3.

## 1. Error envelope — RFC 9457 Problem Details (both services)

The single failure shape (spec FR-009). Full contract:
[contracts/error-envelope.contract.md](./contracts/error-envelope.contract.md).

| Member | Type | Rule |
|---|---|---|
| `type` | URI string | From the platform vocabulary `https://effyshopping.com/problems/<slug>`; `about:blank` never used |
| `title` | string | Short, human-readable, stable per `type` |
| `status` | int | Mirrors the HTTP status code |
| `detail` | string | Human-readable specifics; **never** internals/stack traces/SQL |
| `instance` | string | The request path |
| `request_id` | string (ext) | The request correlation id — joins the error to the log record |
| `errors` | array (ext, optional) | Field-level validation errors: `[{field, message}]` |

Mapping rules (identical in both services): domain error → 4xx problem;
unexpected/panic → 500 `internal` problem with generic detail (real cause only in the
log, matched by `request_id`); malformed JSON/params → 400 `validation-failed`;
missing/invalid credential → 401 `unauthenticated`; wrong audience/group → 401/403 per
contract; unknown route or version → 404 `no-route`; retired version → 410
`version-retired` (policy-bound, none exist yet).

## 2. Identity context (both services)

The verified caller attached to a protected request (spec Key Entity "Identity
Context"; research D1/D2/D3).

| Field | Source claim | Notes |
|---|---|---|
| `audience` | — (route scoping) | Which pool verified this request: `customer` \| `driver` \| `shop` \| `back-office`; set by the middleware/authorizer wiring, not by any claim |
| `subject` | `sub` | The only identity value permitted in logs/telemetry |
| `username` | `username` | Cognito username |
| `client_id` | `client_id` | Must ∈ the pool's allowed app clients (checked in core-api code; by the authorizer's audience list in edge-api) |
| `token_use` | `token_use` | Must equal `"access"` |
| `groups` | `cognito:groups` | `[]string`; **absent claim = empty set = deny** on group-gated routes; exact-case compare (`admin`/`manager`/`csa`) |
| `scope` | `scope` | Carried, unused this slice |

core-api: typed `CognitoAccessClaims` struct (`jwt.RegisteredClaims` + the above),
injected into `context.Context` behind an unexported key with typed accessors.
edge-api: built by `lib/claims.ts` from `event.requestContext.authorizer.jwt.claims` —
**`cognito:groups` arrives stringified** (`"[admin manager]"` HTTP API form; defensive
parse: strip brackets, split space/comma, trim, drop empties).

## 3. Health report (spec Key Entity "Health Report")

- **Liveness** (`GET /healthz`): `200 {"status":"ok"}` — process only.
- **Readiness** (core-api `GET /readyz`; folded into edge-api's `/healthz` — Lambda has
  no probe split): DB `Ping` under a 2s deadline.
  - Ready: `200 {"status":"ready","checks":{"database":"ok"}}`
  - Not ready: `503 {"status":"unavailable","checks":{"database":"unreachable"}}` — a
    plain status body (not a problem document; probes read status codes), no credential
    or host detail beyond the check name.

## 4. Proving read — platform status (spec Key Entity "Proving Slice"; research E2/E3)

**Domain model** (version-neutral, both services):

| Field | Type | Source |
|---|---|---|
| `environment` | string | config (`dev`) |
| `databaseName` | string | `current_database()` |
| `databaseTime` | timestamp | `now()` |
| `migrationVersion` | int64 | `MAX(version_id)` from `goose_db_version` (the 003 Migration Ledger) |
| `migrationsApplied` | int | `COUNT(*)` where `is_applied` |

**v1 DTO** (`GET /v1/platform/status`) — flat:

```json
{"environment":"dev","database_name":"effy","database_time":"2026-07-05T12:00:00Z",
 "migration_version":20260705095817,"migrations_applied":1}
```

**v2 DTO** (`GET /v2/platform/status`) — deliberately reshaped (breaking-shape
coexistence demo, spec US4/SC-010): the flat migration fields nest under `database`,
and `contract_version: 2` is added:

```json
{"contract_version":2,"environment":"dev",
 "database":{"name":"effy","time":"2026-07-05T12:00:00Z",
             "migration":{"version":20260705095817,"applied":1}}}
```

Both DTOs map from the same domain model in version-specific handlers; services and
repositories stay version-neutral (research A3). Ledger absent (003 db-up not yet run)
⇒ 500 `internal` problem + a log naming the missing ledger; `/readyz` unaffected.

**Ping DTOs** (identity echo, protected):
- core-api `GET /v1/customer/ping` → `200 {"audience":"customer","subject":"<sub>","message":"pong"}`
- edge-api `GET /v1/back-office/ping` → `200 {"audience":"back-office","subject":"<sub>","groups":["admin"],"message":"pong"}`

## 5. Configuration contract (spec FR-007; full detail: [contracts/config.contract.md](./contracts/config.contract.md))

**core-api `Config`** (env/v11 nested struct; `.env` dev-only, gitignored):

| Env var | Required | Meaning |
|---|---|---|
| `EFFY_ENV` | ✔ | environment name (`dev`) |
| `PORT` | default `8080` | listen port |
| `DB_DSN` | ✔ | libpq keyword DSN — injected at invocation by `make core-run` via `infra/scripts/db-dsn.sh`; never on disk |
| `AWS_REGION` | ✔ | issuer construction |
| `AUTH_CUSTOMER_POOL_ID` / `AUTH_CUSTOMER_CLIENT_ID` | ✔ (pool served) | per-pool verifier config; missing ⇒ fail-closed startup error |
| `AUTH_DRIVER_*`, `AUTH_SHOP_*`, `AUTH_BACK_OFFICE_*` | reserved | wired the same way as routes for those audiences arrive |
| `CORS_ALLOWED_ORIGINS` | ✔ | comma-separated approved web origins (per-env config, not code) |
| `LOG_LEVEL` | default `info` | zap level |

**edge-api** (`serverless.yml` → Lambda env; stage-parameterized):

| Env var | Source | Time |
|---|---|---|
| `EFFY_ENV` | `${sls:stage}` | deploy |
| `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER` | `${ssm:/effy/<stage>/db/{endpoint,port,name,master_username}}` | deploy (non-secret) |
| `DB_SECRET_ARN` | `${ssm:/effy/<stage>/db/master_secret_arn}` | deploy (pointer only — the value is fetched at **runtime** via the Parameters/Secrets extension, memoized, rotation-retried) |
| authorizer issuer/audience | `${ssm:/effy/<stage>/auth/<audience>/{user_pool_id,app_client_id}}` | deploy (non-secret; rendered into the four JWT authorizers) |
| `LOG_LEVEL` | stage param | deploy |

**Invariant** (both): a missing required value fails fast at startup/deploy naming the
variable; no secret value ever appears in the repo, a template, an env listing in logs,
or command output.

## 6. Versioning policy artifacts (spec Key Entity "Interface Version & Versioning Policy")

Modeled as documents, not data: the policy text
([contracts/versioning-policy.md](./contracts/versioning-policy.md), shipped to
`docs/api/versioning-policy.md`) defines version identifiers (`v1`, `v2`, …), the
breaking/additive change lists (research A2), coexistence mechanics (A3), deprecation
signaling headers (A4), and the reserved min-app-version pattern (A5). State
transitions for a version: `active → deprecated (Deprecation/Sunset headers) → retired
(410)` — one-way, operator-decided, fleet-measured.

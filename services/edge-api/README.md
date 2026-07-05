# edge-api — Effy's cold path

Latency-tolerant, cost-optimized traffic: ops, back-office, operator consoles, and
customer actions that don't need low latency (profile changes). TypeScript on
**Lambda arm64 (nodejs22.x)** behind **API Gateway HTTP API**, raw SQL via `pg`,
pino logs, **no middleware framework** — deliberately. Born in
`specs/004-backend-bootstrap/`.

Whether a new endpoint belongs here: [docs/api/path-assignment.md](../../docs/api/path-assignment.md)
— the mandate is binding: *anything that does not need low latency lives here.*

## Structure (the binding shape — ARCHITECTURE.md)

```
serverless.yml            routes, per-pool JWT authorizers, env from SSM, IAM, alarms
src/functions/            ONE handler file per route (× version). A handler owns its
                          own claims check, parsing, and error mapping — no middy,
                          no shared mutable pipeline.
src/service.ts            domain logic + shaping; version-neutral
src/repository.ts         raw parameterized SQL + explicit row → domain mappers
src/validate.ts           manual field validation → typed field errors (no schema lib)
src/types.ts              domain types + DomainError
src/lib/                  in-service cross-cutting (see graduation rule below):
  http.ts                 preamble() + response/problem builders (the error contract)
  logger.ts               module-singleton pino (sync stdout only — never transports)
  claims.ts               typed authorizer-claims access + defensive groups parser
  db.ts                   module-singleton pg.Pool (max 1) + rotation retry
  secrets.ts              runtime secret fetch via the Parameters/Secrets extension
  rds-ca.ts               GENERATED — embedded public RDS CA bundle
```

**Graduation rule** (research C9): `src/lib/` serves exactly one service today. The
moment a second cold-path service exists, these modules extract to pnpm workspace
packages (`packages/…`) per ARCHITECTURE.md's shared-packages shape — copy-pasting
them into a second service is prohibited (constitution Principle II).

## Add an endpoint (the walkthrough)

1. **Place it** ([path-assignment](../../docs/api/path-assignment.md)); the owning
   feature's plan.md records the decision.
2. **Handler file**: `src/functions/<name>-v1-<method>.ts` — dashes only, NEVER extra
   dots (the Lambda runtime splits the handler string at the basename's first dot,
   so `health.get.handler` resolves to module `health` and crashes at init).
   First line of the handler:
   `const scope = preamble(event, context)` — it pins
   `callbackWaitsForEmptyEventLoop = false` (the cached-DB-socket hang guard; without
   it every invocation runs to timeout) and builds the per-request child logger.
3. **Auth**: pick the pool's authorizer by name in the route's `httpApi.authorizer`
   (`customerJwt` / `driverJwt` / `shopJwt` / `backOfficeJwt`) — one pool per route,
   never a multi-pool authorizer. In the handler, authorize with
   `hasAnyGroup(event, [...])` — absent claim = deny; the authorizer context
   stringifies `cognito:groups`, so always go through `lib/claims.ts`.
4. **Body/params**: `parseJsonBody` + the `validate.ts` field helpers → on errors,
   `problem(400, ProblemType.ValidationFailed, …, scope, errors)`.
5. **Service/repository**: version-neutral logic in `service.ts`; SQL only in
   `repository.ts` via `lib/db.query` (parameterized, always).
6. **Route**: add the `httpApi` event under a `/v1/...` path
   ([versioning policy](../../docs/api/versioning-policy.md)); a breaking change later
   means a NEW handler file on `/v2/...` sharing the same service.
7. **Alarms**: add the function's Errors/Throttles/Duration-p95 alarm trio in
   `resources:` (copy an existing block).
8. **Tests** (vitest): claims/validate/service units + a handler test with
   `vi.mock("../lib/db")`; repository tests run against a local Postgres, gated.

## Conventions that are contracts

- **Errors**: RFC 9457 problem+json via `lib/http.ts`, vocabulary in lockstep with
  core-api and [docs/api/error-envelope.md](../../docs/api/error-envelope.md). Two
  recorded gateway-shape exceptions (contract doc): authorizer rejections (401) and
  unmatched routes (404) answer with API Gateway's own body, before any Lambda runs —
  by design (no paid invoke for junk traffic).
- **Logging**: the singleton pino logger + `scope.log` children only; sync stdout
  (transports lose lines when the sandbox freezes); no tokens/PII beyond `sub`.
- **Config**: non-secrets resolve at deploy time from SSM
  (`/effy/<stage>/db|auth/*`); the DB password NEVER enters the template — runtime
  fetch via the extension with memo + `28P01` rotation retry
  ([config contract](../../../specs/004-backend-bootstrap/contracts/config.contract.md)).
- **DB**: pool `max: 1` per container — the shared t4g.micro has ~85 connections
  total; revisit RDS Proxy only at sustained concurrency >30–40 (research C4).
- **IAM**: service-scoped least privilege today (one secret, read-only). When the
  function set diversifies, adopt `serverless-iam-roles-per-function` for true
  per-function roles — recorded refinement.

## Framework pin (read before touching versions)

`serverless` is pinned **exactly 3.40.0** — the final v3 release; v4 is
subscription-licensed. Consequences: the schema is frozen (the `nodejs22.x` runtime
emits one benign warning per deploy — ignore it; never set
`configValidationMode: error`), `serverless-offline` must stay on **13.x**. When the
freeze genuinely bites, the escape hatch is the MIT `osls` fork (drop-in) — a
recorded decision, not an ad-hoc upgrade (research C1/C2).

## Local development & deploy

```bash
make edge-install        # pnpm install (workspace)
make edge-test           # tsc --noEmit + vitest
make edge-offline        # serverless-offline (resolves SSM → needs the ef profile;
                         # no gateway authorizer locally — auth paths are unit-tested)
make edge-deploy ENV=dev # 🧑‍💻 OPERATOR ONLY: live AWS deploy (Lambda + API Gateway)
```

Before the FIRST deploy: confirm the current Parameters/Secrets extension layer
version for ap-southeast-1/arm64 in `serverless.yml` `params.default.secretsExtensionArn`.
Verification runbook: [specs/004-backend-bootstrap/quickstart.md](../../specs/004-backend-bootstrap/quickstart.md).

## Surface (this slice)

| Route | Auth | Purpose |
|---|---|---|
| `GET /healthz` | public | liveness + readiness (DB probe; cold start tolerated) |
| `GET /v1/platform/status` | public | proving read (flat v1 shape) |
| `GET /v2/platform/status` | public | version-coexistence demo (reshaped) |
| `GET /v1/back-office/ping` | back-office pool + groups | identity + RBAC proof |

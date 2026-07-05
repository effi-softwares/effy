# Implementation Plan: Backend Service Foundations (Dual-Path Bootstrap)

**Branch**: `004-backend-bootstrap` | **Date**: 2026-07-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-backend-bootstrap/spec.md`, binding
[operator-directives.md](./operator-directives.md), [research.md](./research.md) (Phase 0),
constitution v1.3.0, [ARCHITECTURE.md](../../ARCHITECTURE.md).

## Summary

Bootstrap both backend services as production-shaped, industry-standard codebases:

- **`services/core-api`** — the hot path. Go 1.25 + Gin single binary, feature-sliced
  Clean Architecture (`cmd/` + `internal/features/` + `internal/platform/`), pgx/v5 raw
  SQL against the 002 dev database, per-pool Cognito JWT middleware (keyfunc/v3 +
  golang-jwt/v5, one verifier per pool), zap structured logs with request correlation,
  hand-rolled Prometheus RED middleware at `/metrics`, `/healthz` + `/readyz`, URI-path
  versioned routes (`/v1`, `/v2` coexistence demo). Runs **locally in Docker only**
  (distroless multi-stage image + compose/air dev loop); Fargate explicitly deferred.
- **`services/edge-api`** — the cold path. Serverless Framework **3.40.0** (exact pin) +
  TypeScript on **`nodejs22.x`/arm64** Lambdas behind **API Gateway HTTP API**, four
  per-pool JWT authorizers, one-handler-file-per-route + `service.ts`/`repository.ts`
  (raw SQL via `pg`, module-singleton `max:1` pool), pino child-logger per request,
  config from the SSM contract at deploy time + DB secret fetched at runtime via the
  Parameters/Secrets extension, CloudWatch alarms day-1. **Deploys to dev now**
  (operator-run).
- **Shared discipline**: RFC 9457 problem+json error contract with one `type`
  vocabulary; URI-path major versioning on every non-health route with the written
  deprecation/sunset policy (RFC 9745/8594, retired→410); proving slice reads the
  migration ledger (zero new schema); conventions docs + the hot/cold path-assignment
  rule.

All technology choices trace to Phase 0 research (four internet research passes per
operator directives #9/#10); pins are recorded in research.md Parts B/C tables.

## Technical Context

**Language/Version**:
- core-api: Go **1.25.x** (latest patch; constitution-locked minor — research B10 notes
  1.26 as a future PATCH amendment, not taken here).
- edge-api: TypeScript **5.9.x** (typecheck-only; esbuild transpiles) on **`nodejs22.x`**
  — a flagged deviation from the locked "Node 20", which AWS deprecated Apr 30 2026; see
  Complexity Tracking.

**Primary Dependencies** (full pin tables: research.md B-pins / C-pins):
- core-api: gin v1.12.0 · gin-contrib/cors v1.7.7 · pgx/v5 v5.10.0 · zap v1.28.0 ·
  caarlos0/env v11.4.1 · godotenv v1.5.1 (dev-only) · keyfunc/v3 v3.8.0 ·
  golang-jwt/v5 v5.3.1 · client_golang v1.23.2 · google/uuid v1.6.0 · AWS SDK Go v2
  (cognitoidentityprovider — wired, unused this slice) · testify + testcontainers-go
  v0.43.0 (tests) · air v1.65.2 (dev tool).
- edge-api: serverless 3.40.0 (exact) · serverless-esbuild 1.57.2 · serverless-offline
  13.10.1 (exact — last v3-compatible) · esbuild 0.28.1 · pg 8.22.0 · pino 10.3.1 ·
  @types/aws-lambda 8.10.162 · aws-jwt-verify 5.2.1 (dev/test only) · vitest 3.x.

**Storage**: PostgreSQL 16 (`effy-dev-db`, 002) — both services, raw SQL, no ORM/query
builder. Connection budget on t4g.micro (max_connections ≈ 85): core-api pgxpool
MaxConns 10 / MinConns 2 / lifetime jitter; edge-api `pg.Pool` max 1 per container
(≈ concurrent containers total). No RDS Proxy (cost-irrational at this traffic;
threshold documented in research C4). DSN/credentials: composed at invocation from the
002 SSM contract + Secrets Manager; **never on disk, never in a template, never logged**.

**Testing**:
- core-api: `go test` — table-driven; testify asserts; `httptest` against the real Gin
  engine (auth rejection, problem shape, request-id); testcontainers-go (PostgreSQL 16)
  for repositories, gated behind `-short`.
- edge-api: Vitest — service/validate unit tests; handler tests with typed fake events
  (claims parsing incl. the stringified `cognito:groups` forms); repository tests
  against local Postgres (compose service), gated.

**Target Platform**: core-api — linux (arm64-ready) Docker container, local only this
slice. edge-api — AWS Lambda arm64 behind API Gateway HTTP API, `dev` stage,
ap-southeast-1.

**Project Type**: two backend services in the monorepo (first entries under
`services/`); edge-api activates the pnpm workspace + minimal Turborepo tasks.

**Performance Goals**: local proving read p95 < 100 ms (spec SC-007); core-api built for
high-concurrency reads (pool tuning, per-query deadlines, RED metrics to prove it
later); edge-api explicitly trades latency (cold starts documented tolerance) for cost.

**Constraints**: raw SQL only (no ORM/query builder — pgx CollectRows generics / `pg`
parameterized text); no DI framework (main-func wiring / module singletons); no
middleware framework on Lambda (shared preamble helper instead — which also owns
`callbackWaitsForEmptyEventLoop = false`); secrets fetched at invocation only; metric
labels low-cardinality (route template, never raw path); no PII in logs/metrics beyond
the auth subject id.

**Scale/Scope**: bootstrap slice — per service: liveness/readiness, versioned proving
pair (v1 + deliberate v2 coexistence demo), one pool-protected ping, error contract,
conventions docs; plus Makefile target families, pnpm/turbo activation, versioning
policy + path-assignment rule docs. No product endpoints (catalog/profile arrive in
their own slices); no event backbone; no Fargate.

## Constitution Check

*GATE: evaluated pre-Phase-0 and re-checked post-design — PASS with one recorded
deviation (Complexity Tracking).*

| Principle | Verdict | Evidence |
|---|---|---|
| **I. Spec-driven** | PASS | spec.md (tech-free) → this plan (cites constitution + research) → tasks next. The two premise corrections found in research (serverless "3.4" → 3.40.0; Node 20 deprecated) are handled here, not silently patched in code. |
| **II. Monorepo & shared contracts** | PASS | Both services in the monorepo under `services/`; edge-api is the first pnpm workspace member. Cross-backend shared contracts are documents-as-contracts this slice (error envelope `type` vocabulary, event envelope later) since Go↔TS share no package; each service implements the contract with conformance tests. In-service `src/lib/` carries a written graduation rule to workspace packages at the second cold-path service (research C9) — single consumer today, so nothing is copy-pasted. |
| **III. Dual-path discipline** | PASS | This feature *creates* both paths. Path justification: proving/health surface exists on both by design; `customer/ping` sits on the hot path (customer-audience latency class), `back-office/ping` on the cold path (ops audience). The slice ships the written **path-assignment rule** (FR-014) making every future endpoint's placement a documented decision. |
| **IV. Auth isolation** | PASS | Four pools validated independently: core-api — one keyfunc + one pinned-issuer parser **per pool**, selected by route group, access-token checklist (`token_use`, `client_id`), fail-closed startup (research D2); edge-api — one HTTP API JWT authorizer **per pool** per route, never multi-pool authorizers (D3). Cross-pool tokens fail structurally (wrong key set / wrong issuer) before any claim check. No auth proxy anywhere. |
| **V. Design system** | N/A (no UI surface) | No client code in this slice; brand/design tokens untouched. |
| **VI. Layered architecture & explicit wiring** | PASS | core-api: `cmd/` wiring by hand top-down; `internal/features/<feature>/{handler,service,repository}` + `internal/platform/` exactly per ARCHITECTURE.md; SQL as named constants in repositories; DTOs mapped explicitly, never past the data layer. edge-api: per-route handler files owning auth-claims/parse/error mapping (no middy), `service.ts`/`repository.ts`/`validate.ts`/`types.ts`, cached module singletons. Versioning lives only at the handler/DTO edge (research A3). |
| **VII. Observability & telemetry** | PASS — declaration below | |

**Telemetry declaration (Principle VII)**:
- *core-api*: zap JSON logs — exactly one record per handled request with `request_id`
  (uuid; honors inbound `X-Request-ID`), route, status, duration, auth subject only;
  `/metrics` Prometheus RED — `http_requests_total{method,route,status}` +
  `http_request_duration_seconds{...}` labeled by route **template** (low-cardinality),
  DB pool stats gauge. Dashboards/alerts arrive with the Prometheus/Grafana infra slice;
  the endpoint contract exists now.
- *edge-api*: pino JSON logs — one record per invocation with `awsRequestId` +
  gateway `requestId` (echoed as `x-request-id`); CloudWatch alarms authored in
  serverless.yml: Lambda Errors > 0, Throttles > 0, Duration p95 vs SLO, HTTP API 5xx
  rate; ingested into Grafana later via the CloudWatch datasource.
- *Product analytics*: none — no user-facing flow in this slice.
- *No PII* beyond the authenticated subject id in any log line or metric label.

## Project Structure

### Documentation (this feature)

```text
specs/004-backend-bootstrap/
├── spec.md              # WHAT/WHY (done)
├── operator-directives.md  # binding tech mandate (done)
├── plan.md              # this file
├── research.md          # Phase 0 (done) — decisions A*/B*/C*/D*/E* cited throughout
├── data-model.md        # Phase 1 — wire shapes, config contract, identity context
├── quickstart.md        # Phase 1 — operator/developer validation runbook
├── contracts/           # Phase 1 — API + error + versioning + config contracts
│   ├── error-envelope.contract.md
│   ├── versioning-policy.md
│   ├── core-api.contract.md
│   ├── edge-api.contract.md
│   └── config.contract.md
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
services/core-api/                    # Go module: github.com/effyshopping/effy/services/core-api
├── cmd/core-api/
│   └── main.go                       # config → logger → pool → verifiers → features → server; run() for testability
├── internal/
│   ├── platform/                     # shared infrastructure, NOT domain logic
│   │   ├── config/config.go          # env/v11 nested Config; godotenv dev-only; fail-fast
│   │   ├── logger/logger.go          # zap build + FromContext/WithContext (request-scoped)
│   │   ├── db/db.go                  # pgxpool build (MaxConns 10, jitter…), DBTX interface
│   │   ├── auth/
│   │   │   ├── verifier.go           # per-pool keyfunc+parser, typed CognitoAccessClaims
│   │   │   ├── middleware.go         # Auth(pool) gin.HandlerFunc; identity → context
│   │   │   └── groups.go             # RequireGroups(...) guard (401 vs 403)
│   │   ├── httpx/
│   │   │   ├── problem.go            # RFC 9457 writers + type vocabulary constants
│   │   │   ├── requestid.go          # X-Request-ID middleware (uuid)
│   │   │   └── logging.go            # one-record-per-request middleware
│   │   ├── metrics/metrics.go        # custom registry + RED middleware + /metrics handler
│   │   └── health/
│   │       ├── handler.go            # /healthz, /readyz (pool.Ping, 2s timeout)
│   │       └── health.go
│   └── features/
│       └── platformstatus/           # the proving feature slice (reference implementation)
│           ├── handler.go            # v1 handler + deliberately reshaped v2 handler + DTOs
│           ├── service.go            # business shaping; no HTTP, no SQL
│           ├── repository.go         # raw SQL constants; ledger + now()/current_database
│           └── register.go           # Register(v1, v2 *gin.RouterGroup, …)
│       └── customerping/
│           ├── handler.go            # /v1/customer/ping — identity echo
│           └── register.go
├── Dockerfile                        # multi-stage: golang:1.25 builder → distroless static nonroot; TARGETARCH-aware
├── docker-compose.yml                # dev loop: air live-reload service (+ postgres16 for repo tests)
├── .air.toml
├── .dockerignore
├── .env.example                      # names only, no values
├── go.mod / go.sum
└── README.md                         # structure guide + add-an-endpoint walkthrough + conventions

services/edge-api/                    # pnpm workspace member
├── serverless.yml                    # httpApi + 4 named per-pool JWT authorizers, arm64, nodejs22.x,
│                                     # esbuild(esm, node22), individually, ${ssm:...} non-secrets,
│                                     # per-function least-privilege IAM, CloudWatch alarms (resources:)
├── src/
│   ├── functions/                    # one handler file per route; each owns claims-check/parse/error-map
│   │   ├── health.get.ts             # GET /healthz (public; DB reachability included)
│   │   ├── platform-status.v1.get.ts # GET /v1/platform/status (public)
│   │   ├── platform-status.v2.get.ts # GET /v2/platform/status (coexistence demo)
│   │   └── back-office-ping.v1.get.ts# GET /v1/back-office/ping (back-office authorizer + groups)
│   ├── service.ts                    # domain logic (platform status shaping)
│   ├── repository.ts                 # raw SQL via pg; explicit row → domain mappers
│   ├── validate.ts                   # manual field validation → typed field errors
│   ├── types.ts                      # domain types + DomainError
│   └── lib/                          # in-service cross-cutting (graduation rule → packages/ at 2nd service)
│       ├── db.ts                     # module-singleton pg.Pool (max 1, RDS CA TLS), secret fetch+memo
│       ├── secrets.ts                # Parameters/Secrets extension client (+ rotation retry)
│       ├── logger.ts                 # pino singleton + child-per-request
│       ├── http.ts                   # preamble (callbackWaitsForEmptyEventLoop=false, child logger,
│       │                             #   x-request-id echo), response builders, problem+json writers
│       └── claims.ts                 # typed claims access + defensive cognito:groups parser + hasAnyGroup
├── certs/rds-global-bundle.pem       # RDS CA (public cert, bundled)
├── package.json / tsconfig.json / vitest.config.ts
└── README.md                         # structure guide + add-an-endpoint walkthrough + conventions

# Repo root deltas
Makefile                              # + core-run / core-test / core-lint / core-build,
│                                     #   edge-install / edge-offline / edge-test / edge-deploy (OPERATOR)
pnpm-workspace.yaml                   # packages: ["services/edge-api"]
turbo.json                            # minimal lint/typecheck/test tasks
docs/api/                             # cross-backend contracts (single source of truth):
├── versioning-policy.md              #   FR-016 policy (from contracts/versioning-policy.md)
├── error-envelope.md                 #   RFC 9457 shape + type vocabulary (FR-009)
└── path-assignment.md                #   FR-014 hot/cold decision rule
```

**Structure Decision**: Both services under `services/` (research E1) — core-api an
independent Go module, edge-api the first pnpm workspace member. Cross-backend contracts
live once at `docs/api/` (Principle II single-source-of-truth in document form — Go and
TS cannot share a package); each service README carries its own structure guide and
add-an-endpoint walkthrough (spec FR-013).

## Version coexistence design (spec US4 — the one non-obvious mechanic)

- Router shape (core-api): `v1 := r.Group("/v1")`, `v2 := r.Group("/v2")`; unchanged
  endpoints register the same handler in both; `platformstatus` registers distinct v1/v2
  handlers over one service/repository. edge-api: two event paths → two handler files →
  one service module.
- The v2 proving payload **deliberately reshapes** the v1 payload (a breaking-shape
  example, e.g. flat `migration_version` → nested `database.migration` object) so the
  coexistence demo proves behavioral divergence, not just routing (SC-010).
- `/v3/...` falls through to the router's NoRoute/gateway 404 → problem+json
  `.../problems/no-route`. Retired versions (none yet) are policy-bound to `410 Gone` +
  `Deprecation`/`Sunset` headers per docs/api/versioning-policy.md.
- Health and `/metrics` are unversioned by design (research B7).

## Complexity Tracking

> Constitution deviations requiring justification (Quality Gates: recorded here, not
> silently taken).

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| **Lambda runtime `nodejs22.x` vs locked "Node 20"** (Technology Standards) | AWS deprecated `nodejs20.x` on 2026-04-30: no security patches, function **creation blocked 2027-02-01**. Bootstrapping a new service onto it guarantees a forced migration within months of birth and ships unpatched runtime today. `nodejs22.x` is the current supported LTS (deprecation 2027-04-30); serverless 3.40.0 deploys it with one benign schema warning (verified — research C2). | Keeping Node 20 ("simpler" = no deviation) rejected: violates the constitution's own security/quality intent and the spec's industry-ready mandate. **Action for operator**: ratify a constitution PATCH amending "Node 20" → "Node 22 (current Lambda-supported LTS)" before or alongside implementation sign-off. |
| **Serverless Framework v3 pinned to a frozen final release (3.40.0)** | Not a deviation — v3 IS the locked standard; recorded here because the lock now carries an EOL risk profile: no patches, schema warnings for post-2024 AWS features. Mitigation documented: `osls` fork is a drop-in escape hatch (research C1); revisit at the first real friction. | Upgrading to v4 rejected: paid subscription + license-key/telemetry coupling — a worse trade than the documented fork path, and a locked-tech swap needing amendment. |

## Phase 1 artifacts

Generated alongside this plan: [data-model.md](./data-model.md) ·
[contracts/](./contracts/) (error-envelope, versioning-policy, core-api, edge-api,
config) · [quickstart.md](./quickstart.md). Agent context (CLAUDE.md managed block)
updated to point here. `/speckit-tasks` derives the ordered task list from these.

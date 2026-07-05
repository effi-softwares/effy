# Tasks: Backend Service Foundations (Dual-Path Bootstrap)

**Input**: Design documents from `/specs/004-backend-bootstrap/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md)
(decision ids A*/B*/C*/D*/E* cited per task), [data-model.md](./data-model.md),
[contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: included — the plan's Testing section (research B9/C9) is part of the design,
and the spec's success criteria demand demonstrable verification. Tests ship with each
story (pragmatic, not strict TDD).

**Conventions**: 🧑‍💻 = **operator-run** (mode of work: deploys and anything
cloud-mutating; Claude authors everything). All paths repo-relative. Platform
prerequisites for live checks (002 allowlist, 003 first `db-up`, test users/tokens) are
quickstart Prerequisites — operator steps already pending from earlier slices, not tasks
here.

## Phase 1: Setup

**Purpose**: Monorepo scaffolding for both services

- [X] T001 Scaffold `services/core-api` Go module: `go.mod` (module `github.com/effyshopping/effy/services/core-api`, `go 1.25`, deps pinned per research B-pins), directory tree per plan (`cmd/core-api/`, `internal/platform/{config,logger,db,auth,httpx,metrics,health}/`, `internal/features/`), `.gitignore` (`.env`, `tmp/`), `.dockerignore`, `.env.example` (names + placeholders only, per contracts/config.contract.md)
- [X] T002 [P] Scaffold `services/edge-api`: `package.json` (deps pinned exactly per research C-pins: serverless 3.40.0, serverless-esbuild 1.57.2, serverless-offline 13.10.1, esbuild 0.28.1, pg 8.22.0, pino 10.3.1, typescript 5.9.x, @types/aws-lambda 8.10.162, aws-jwt-verify 5.2.1 + vitest as devDeps), `tsconfig.json` (strict, ES2023, bundler resolution, typecheck-only), `vitest.config.ts`, `src/{functions,lib}/` tree per plan, `certs/rds-global-bundle.pem` (vendored public RDS CA), `.gitignore`
- [X] T003 [P] Activate the JS workspace: `pnpm-workspace.yaml` → `packages: ["services/edge-api"]`; `turbo.json` → minimal `lint`/`typecheck`/`test` tasks (research C9; keep the "reserved" comments for future packages)
- [X] T004 [P] Add Makefile target families per plan + contracts/config.contract.md, following 001/003 conventions (AWS_PROFILE=ef wrapper, `##` help, OPERATOR markers): `core-run` (composes `DB_DSN` via `infra/scripts/db-dsn.sh dev` + fetches `/effy/dev/auth/customer/{user_pool_id,app_client_id}` from SSM **at invocation**, injects as process env into `docker compose up` — never written to a file), `core-test`, `core-lint`, `core-build`, `edge-install`, `edge-offline`, `edge-test`, `edge-deploy` (🧑‍💻-marked, wraps `sls deploy --stage $(ENV)`) in `Makefile`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Each service's platform layer — every user story builds on these

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T005 [P] core-api config: `services/core-api/internal/platform/config/config.go` — nested `Config` (Server/DB/Auth/Log via `envPrefix`; `required,notEmpty` tags; `time.Duration` fields; `envDefault`), dev-only `godotenv.Load()`, fail-fast `Load()` error naming the missing variable (research B6; env table in data-model.md §5)
- [X] T006 [P] core-api logger: `services/core-api/internal/platform/logger/logger.go` — zap production JSON config (sampling prod-on/dev-off), `WithContext(ctx, *zap.Logger)` + `FromContext(ctx)` typed accessors (research B5)
- [X] T007 [P] core-api httpx: `services/core-api/internal/platform/httpx/problem.go` (RFC 9457 writers + the full type-vocabulary constants from contracts/error-envelope.contract.md), `requestid.go` (honor inbound `X-Request-ID` else google/uuid; set response header; stash in context), `logging.go` (exactly one structured record per handled request: request_id, method, route template, status, duration; no secrets)
- [X] T008 [P] core-api db: `services/core-api/internal/platform/db/db.go` — `pgxpool.ParseConfig(dsn)` + overrides (MaxConns 10, MinConns 2, MaxConnLifetime 45min + jitter, MaxConnIdleTime 15min, HealthCheckPeriod 1min), `DBTX` interface (Query/QueryRow/Exec) satisfied by pool and tx (research B3)
- [X] T009 core-api entrypoint: `services/core-api/cmd/core-api/main.go` — `run()` wiring by hand top-down (config → logger → pool → router → features), explicit `http.Server` (ReadHeaderTimeout 5s / ReadTimeout 10s / WriteTimeout 30s / IdleTimeout 120s), `signal.NotifyContext` graceful shutdown (drain ≤15s → close pool → `logger.Sync()`), `gin.New()` with middleware order request-ID → logging → recovery → CORS (gin-contrib/cors, origins from `CORS_ALLOWED_ORIGINS`), `/v1` route group created, `NoRoute` → 404 `no-route` problem+json (research B1/B2; depends on T005–T008)
- [X] T010 [P] edge-api logging + http helpers: `services/edge-api/src/lib/logger.ts` (module-singleton pino, `LOG_LEVEL` env, base `function` field, sync stdout only) and `services/edge-api/src/lib/http.ts` (handler preamble: `context.callbackWaitsForEmptyEventLoop = false`, per-request `logger.child({awsRequestId, requestId})`, `x-request-id` response echo; JSON response builders + RFC 9457 problem builders sharing the T007 vocabulary) (research C5, contract error-envelope)
- [X] T011 [P] edge-api secrets + db: `services/edge-api/src/lib/secrets.ts` (Parameters/Secrets extension client on `localhost:2773`, module memo, one retry on rotation/auth failure) and `services/edge-api/src/lib/db.ts` (module-singleton `pg.Pool` `{max:1, min:0, idleTimeoutMillis:120000, connectionTimeoutMillis:10000, ssl:{ca: certs/rds-global-bundle.pem, rejectUnauthorized:true}}`, password from secrets memo, `28P01` → drop memo+pool, refetch once) (research C4/C6)
- [X] T012 [P] edge-api serverless foundation: `services/edge-api/serverless.yml` — service/provider (`runtime: nodejs22.x`, `architecture: arm64`, region ap-southeast-1, stage `params`), `custom.esbuild` (esm + createRequire banner, target node22, bundle AWS SDK), `package.individually: true`, plugins `serverless-esbuild` **before** `serverless-offline`, Parameters/Secrets extension layer (arm64 ARN), non-secret env from `${ssm:/effy/${sls:stage}/db/...}` + `DB_SECRET_ARN` pointer, per-function least-privilege IAM baseline (only `secretsmanager:GetSecretValue` on the one ARN for DB functions), `httpApi.cors` restricted to stage-param origins (research C1/C2/C6; contracts/config.contract.md)
- [X] T013 [P] Ship the shared error contract doc: create `docs/api/error-envelope.md` from `specs/004-backend-bootstrap/contracts/error-envelope.contract.md` (the cross-backend single source of truth — plan Principle II note)

**Checkpoint**: Foundation ready — user story phases can begin

---

## Phase 3: User Story 1 — core-api runs locally, end to end (Priority: P1) 🎯 MVP

**Goal**: `make core-run` from a fresh clone → health + readiness + a proving read
traversing handler→service→repository→dev DB, one correlated log per request, metrics
exposed — the reference implementation of the platform architecture.

**Independent Test**: quickstart.md §US1 table (healthz/readyz/status/metrics/log/
latency/fail-fast checks) + structure review against the plan tree.

- [X] T014 [P] [US1] Health endpoints: `services/core-api/internal/platform/health/handler.go` — `GET /healthz` (200 process-only) + `GET /readyz` (`pool.Ping` 2s deadline; 200/503 bodies per data-model.md §3), registered outside `/v1`, excluded from auth and request-log noise (research B7)
- [X] T015 [P] [US1] Metrics: `services/core-api/internal/platform/metrics/metrics.go` — custom `prometheus.Registry`, RED middleware (`http_requests_total` + `http_request_duration_seconds` labeled method/route-template/status, `unmatched` sentinel, DefBuckets), pgxpool stats collector, `GET /metrics` via promhttp (research B4)
- [X] T016 [US1] Proving repository: `services/core-api/internal/features/platformstatus/repository.go` — named SQL constants (ledger `MAX(version_id)`/`COUNT(*) WHERE is_applied` from `goose_db_version`, `now()`, `current_database()`), pgx `CollectOneRow`/`RowToStructByName` scanning, explicit row→domain mapping (research E2; data-model.md §4)
- [X] T017 [US1] Proving service + domain model: `services/core-api/internal/features/platformstatus/service.go` — version-neutral `PlatformStatus` domain model, context deadlines, no HTTP/SQL (research A3)
- [X] T018 [US1] Proving handler v1 + registration: `services/core-api/internal/features/platformstatus/handler.go` (v1 flat DTO + mapper per data-model.md §4) and `register.go` (`Register(v1 *gin.RouterGroup, …)`); wire the feature in `cmd/core-api/main.go`
- [X] T019 [P] [US1] Docker artifacts: `services/core-api/Dockerfile` (multi-stage: `golang:1.25-bookworm` builder with BuildKit cache mounts + `TARGETARCH` → `gcr.io/distroless/static-debian12:nonroot`), `services/core-api/docker-compose.yml` (air dev service with bind-mounted source + `postgres:16` service for repo tests), `services/core-api/.air.toml` (research B8)
- [ ] T020 [US1] Wire and verify `make core-run` end to end (DSN + pool ids injected at invocation; container starts; fail-fast check: emptying a required var exits non-zero naming it — spec FR-007)
- [X] T021 [P] [US1] Tests: `services/core-api/internal/features/platformstatus/service_test.go` (fake repo, table-driven), `handler_test.go` (httptest against the real engine: 200 shape, problem+json on repo error, request-id echo), `repository_test.go` (testcontainers-go postgres:16, seeded goose table, gated `-short`), plus `internal/platform/httpx/problem_test.go` (envelope conformance per contract §Conformance) (research B9)

**Checkpoint**: US1 fully functional — MVP demonstrable locally

---

## Phase 4: User Story 2 — edge-api live in dev (Priority: P2)

**Goal**: The cold path deployed by the operator to dev, reachable over HTTPS, health +
proving read answering from the internet, logs in CloudWatch, alarms shipped,
one-command repeatable redeploy.

**Independent Test**: quickstart.md §US2 table.

- [X] T022 [P] [US2] Domain + data layer: `services/edge-api/src/types.ts` (domain types + `DomainError`) and `services/edge-api/src/repository.ts` (raw parameterized SQL: same ledger/now/current_database read; explicit row→domain mappers) (research E2)
- [X] T023 [US2] Service + validation scaffold: `services/edge-api/src/service.ts` (version-neutral status shaping) and `services/edge-api/src/validate.ts` (manual field validation → typed field errors; exercised by future write routes, conformance-tested now) (depends on T022)
- [X] T024 [US2] Handlers + routes: `services/edge-api/src/functions/health.get.ts` (`GET /healthz` — DB `SELECT 1` under 2s, 200/503 per contracts/edge-api.contract.md) and `services/edge-api/src/functions/platform-status.v1.get.ts` (`GET /v1/platform/status`, v1 DTO); add both `httpApi` events to `serverless.yml`
- [X] T025 [P] [US2] Alarms: CloudWatch alarms in `services/edge-api/serverless.yml` `resources:` — per-function Errors>0, Throttles>0, Duration p95 vs SLO; HTTP API 5xx rate >1%/5min (research C8; plan telemetry declaration)
- [X] T026 [P] [US2] Tests: `services/edge-api/src/service.test.ts` + `src/lib/http.test.ts` (problem conformance, preamble behavior) with fake events; `src/repository.test.ts` against the compose postgres (gated); `sls offline` smoke documented in the service README stub
- [ ] T027 [US2] 🧑‍💻 OPERATOR: `make edge-deploy ENV=dev`, then run quickstart §US2 verification (public health + proving read, CloudWatch log shape, alarms exist, trivial-change redeploy repeatability)

**Checkpoint**: Both services alive — US1 local, US2 in dev

---

## Phase 5: User Story 3 — per-audience identity enforcement (Priority: P3)

**Goal**: Both services verify Cognito access tokens per pool; cross-pool tokens are
structurally rejected; RBAC guard reads verified groups; health stays public.

**Independent Test**: quickstart.md §US3 token matrix.

- [X] T028 [P] [US3] core-api verifier: `services/core-api/internal/platform/auth/verifier.go` — per-pool `keyfunc.NewDefaultCtx` (single JWKS URL) + `jwt.Parser` (`WithValidMethods(["RS256"])`, `WithIssuer(pinned)`, `WithExpirationRequired()`), typed `CognitoAccessClaims` (RegisteredClaims + token_use/client_id/username/scope/`cognito:groups`), post-parse checks `token_use=="access"` && `client_id` allowed — never merged key sets (research D1/D2)
- [X] T029 [US3] core-api middleware + guard: `services/core-api/internal/platform/auth/middleware.go` (`Auth(pool)` factory: Bearer extract, verify, identity→context; every failure = byte-identical 401 `unauthenticated` problem — no oracle) and `groups.go` (`RequireGroups(...)`: absent claim = deny, 403 `forbidden`, exact-case) (research D4; depends on T028)
- [X] T030 [US3] core-api protected ping: `services/core-api/internal/features/customerping/{handler.go,register.go}` — `GET /v1/customer/ping` under `Auth(customer)`, identity echo DTO per data-model.md §4; `config.go` gains required `AUTH_CUSTOMER_POOL_ID`/`AUTH_CUSTOMER_CLIENT_ID` (fail-closed startup); wire in `cmd/core-api/main.go`
- [X] T031 [P] [US3] edge-api authorizers: four named per-pool JWT authorizers in `services/edge-api/serverless.yml` `provider.httpApi.authorizers` (issuerUrl derived from `${ssm:.../auth/<audience>/user_pool_id}`, audience = `${ssm:.../app_client_id}`; audiences customer/driver/shop/back-office) — never multi-pool (research C3/D3)
- [X] T032 [P] [US3] edge-api claims lib: `services/edge-api/src/lib/claims.ts` — typed access to `event.requestContext.authorizer.jwt.claims`, defensive `cognito:groups` parser (both `"[a b]"` and `"a,b"` stringified forms, single-group, absent→empty), `hasAnyGroup(event, groups)` deny-on-absent (research D3/D4)
- [X] T033 [US3] edge-api protected ping: `services/edge-api/src/functions/back-office-ping.v1.get.ts` — `GET /v1/back-office/ping` behind the back-office authorizer; 403 `forbidden` problem when group-less; 200 echoes parsed groups (contracts/edge-api.contract.md) (depends on T031, T032)
- [X] T034 [P] [US3] Tests: core-api `internal/platform/auth/middleware_test.go` (httptest + local test JWKS server: valid, expired, tampered, wrong-issuer, wrong-client_id, ID-token `token_use` — all 401 with **byte-identical** type/title; groups guard 403); edge-api `src/lib/claims.test.ts` (both stringified forms + absent-claim deny)
- [ ] T035 [US3] 🧑‍💻 OPERATOR: redeploy edge (`make edge-deploy ENV=dev`), obtain customer + back-office access tokens (quickstart Prereq 3), run the full quickstart §US3 matrix on both services

**Checkpoint**: Constitution Principle IV demonstrably enforced end to end

---

## Phase 6: User Story 4 — versioned interfaces, side by side (Priority: P4)

**Goal**: Every non-health route versioned; v1 + v2 of the proving capability serving
simultaneously with divergent shapes; never-existed versions fail clean; the written
policy ships.

**Independent Test**: quickstart.md §US4 table (SC-009/SC-010).

- [X] T036 [P] [US4] core-api v2: create `/v2` route group in `cmd/core-api/main.go`; v2 handler + deliberately reshaped DTO (`contract_version:2`, nested `database`) in `services/core-api/internal/features/platformstatus/handler.go`; extend `register.go` to `Register(v1, v2 *gin.RouterGroup, …)` — same service/repository untouched (research A3; data-model.md §4)
- [X] T037 [P] [US4] edge-api v2: `services/edge-api/src/functions/platform-status.v2.get.ts` + `/v2/platform/status` event path in `serverless.yml`, reusing `service.ts` unchanged
- [X] T038 [P] [US4] Ship the policy: create `docs/api/versioning-policy.md` from `specs/004-backend-bootstrap/contracts/versioning-policy.md` (FR-016)
- [ ] T039 [US4] Version tests + live check: core-api handler tests assert v1 flat vs v2 nested served by the same engine + `/v3/platform/status` → 404 `no-route` problem; edge-api service test asserts both DTO mappings; then 🧑‍💻 OPERATOR redeploy edge and run quickstart §US4 (concurrent v1+v2 curls on both services, `/v3` arms)

**Checkpoint**: Mixed-fleet serving proven (spec SC-009/SC-010)

---

## Phase 7: User Story 5 — conventions a newcomer can follow (Priority: P5)

**Goal**: Each service self-propagates: structure guide, add-an-endpoint walkthrough,
error/versioning conventions, deploy runbook, and the path-assignment rule.

**Independent Test**: quickstart.md §US5 (newcomer exercise + endpoint classification).

- [X] T040 [P] [US5] `services/core-api/README.md` — structure guide (why each `internal/` package exists, dependency direction), step-by-step add-an-endpoint walkthrough (feature package → register → wire in main → test tiers), conventions (problem vocabulary, request-id/logging, versioning rules, metrics labels, local dev loop incl. air + `-short` gating) (spec FR-013)
- [X] T041 [P] [US5] `services/edge-api/README.md` — structure guide (functions/service/repository/validate/types/lib), add-an-endpoint walkthrough (handler file → serverless event → authorizer choice → tests), the `src/lib/` **graduation rule** (research C9), deploy runbook (`make edge-deploy`, stage params, alarm review), serverless-3.40.0 freeze + `osls` escape-hatch note (research C1)
- [X] T042 [P] [US5] `docs/api/path-assignment.md` — the FR-014 decision rule (latency criticality × traffic volume × cost tolerance; the operator's mandate semantics: "anything that does not need low latency MUST go to edge-api"), with worked examples (product search → core; profile update → edge; back-office refund queue → edge) and the plan.md pointer requirement for future slices (constitution Principle III)
- [ ] T043 [US5] Newcomer validation per quickstart §US5: follow each README to add a practice endpoint in the correct layers (then revert), classify three hypothetical endpoints via the rule — record outcomes in the PR/sign-off note (spec SC-008)

**Checkpoint**: All five user stories independently verified

---

## Phase 8: Polish & Cross-Cutting

- [X] T044 [P] Lint/format full pass: `make core-lint` (gofmt + go vet + `go test -short ./...`) green; `pnpm turbo lint typecheck test` green; `make lint` (repo Terraform lint from 001) still green
- [X] T045 [P] Secret-hygiene sweep per quickstart §sweep: `git grep` patterns over `services/` + Makefile, `docker compose config` DSN check, deployed CloudFormation template grep → zero secret material (spec SC-006)
- [ ] T046 🧑‍💻 OPERATOR: ratify the **Node 22 constitution PATCH** (amend `.specify/memory/constitution.md` Technology Standards "Node 20" → "Node 22 (current Lambda-supported LTS)" + Sync Impact Report note, version bump 1.3.0 → 1.3.1) — may happen any time, MUST precede sign-off (plan Complexity Tracking)
- [ ] T047 Full quickstart pass: SC-001…SC-010 verified and recorded (fresh-clone timing for SC-001, latency sample for SC-007); update CLAUDE.md Active-feature status to implemented + open operator items
- [ ] T048 Commit the slice with its artifacts: `services/`, `docs/api/`, Makefile/workspace deltas alongside `specs/004-backend-bootstrap/` (constitution Quality Gates: no merge without spec/plan/tasks committed)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** → nothing
- **Foundational (Phase 2)** → Setup; T009 depends on T005–T008; T010–T012 independent of the core track — **the two service tracks run fully in parallel**
- **US1 (Phase 3)** → Foundational core track (T005–T009); no other story
- **US2 (Phase 4)** → Foundational edge track (T010–T012); independent of US1
- **US3 (Phase 5)** → US1 (core routes exist) + US2 (edge deployed); core sub-track (T028–T030) needs only US1, edge sub-track (T031–T033) only US2
- **US4 (Phase 6)** → US1 (core v1 exists) + US2 (edge v1 exists); independent of US3
- **US5 (Phase 7)** → documents what US1–US4 built; T042 can start anytime after Phase 2
- **Polish (Phase 8)** → all stories; T046 (constitution PATCH) may run at any point before sign-off

### Operator gates (🧑‍💻)

T027, T035, T039 (redeploy part), T046 — everything else is Claude-authored and
developer-side runnable. Live-cloud checks additionally require the pending 002/003
operator steps (quickstart Prerequisites).

### Parallel Opportunities

- Phase 1: T002, T003, T004 after/alongside T001
- Phase 2: core track (T005–T008 all [P]) ∥ edge track (T010–T012 all [P]) ∥ T013
- US1: T014, T015, T019, T021 parallel to each other around the T016→T017→T018 chain
- **US1 ∥ US2 entirely** (different services, different tracks)
- US3: T028 ∥ T031 ∥ T032; T034 parallel to T030/T033
- US4: T036 ∥ T037 ∥ T038

## Parallel Example: after Phase 2 completes

```text
Developer/agent A (core track): T014, T015 → T016 → T017 → T018 → T019/T020/T021
Developer/agent B (edge track): T022 → T023 → T024, with T025/T026 in parallel → T027 🧑‍💻
```

## Implementation Strategy

**MVP first (US1 only)**: Phases 1–3 deliver a locally running, metric-emitting,
DB-round-tripping core-api — the platform's architecture reference — with zero cloud
footprint. Stop, validate via quickstart §US1, then proceed.

**Incremental delivery**: US2 puts the cold path live in dev (first operator deploy);
US3 turns on identity (redeploy); US4 proves versioning (redeploy); US5 locks the
conventions; Polish sweeps hygiene + governance (Node 22 PATCH) and signs off
SC-001…SC-010.

**Total**: 48 tasks — Setup 4 · Foundational 9 · US1 8 · US2 6 · US3 8 · US4 4 · US5 4
· Polish 5.

---

## Implementation notes (2026-07-05 session)

- **RDS CA delivery changed** (T002/T011): instead of a vendored `certs/*.pem` (packaging
  risk with individually-bundled functions + the root `*.pem` gitignore rule), the
  regional public CA bundle is embedded as a generated TS module
  `services/edge-api/src/lib/rds-ca.ts` — esbuild ships it inside every bundle with zero
  packaging patterns. Regeneration command in the file header.
- **Root `package.json` added** (beyond T003): pnpm 10 + Turborepo need a workspace root
  (`packageManager` field, `turbo` devDep, build-script allowlist for esbuild/turbo in
  `pnpm-workspace.yaml`).
- **Pins**: all research-verified pins held; `aws-sdk-go-v2/config` (transitive, not
  research-pinned) resolved to v1.32.27; vitest resolved to 3.2.6; turbo 2.10.3.
- **Verified this session**: `go build` + `go vet` + `gofmt` clean; `go test -short ./...`
  green; container-backed repository tests green against real PostgreSQL 16
  (testcontainers); `tsc --noEmit` clean; vitest 31/31 green; `turbo lint typecheck test`
  green; repo `make lint` (Terraform) still green; secret-hygiene sweep clean.
- **Open items are the operator sitting**: T020 (live `make core-run` — blocked on the
  002 allowlist apply), T027 (first `edge-deploy`; confirm the Parameters/Secrets
  extension layer version first), T035 (token matrix), T039 live half (v1/v2/v3 curls on
  the deployed edge), T043 (newcomer exercise), T046 (Node 22 constitution PATCH),
  T047 (full quickstart SC-001…SC-010 sign-off), T048 (commit the slice).

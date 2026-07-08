# Phase 0 Research — Backend Service Foundations (004-backend-bootstrap)

**Date**: 2026-07-05 · **Inputs**: [spec.md](./spec.md), binding
[operator-directives.md](./operator-directives.md) (directives #9/#10 mandate genuine
internet research), constitution v1.3.0, [ARCHITECTURE.md](../../ARCHITECTURE.md).
**Method**: four independent internet research passes (Go service architecture ·
Serverless/TypeScript architecture · industry API versioning · Cognito JWT validation),
consolidated below as Decision / Rationale / Alternatives. Source URLs retained so any
decision can be re-audited.

Findings that contradict nothing and confirm the locked stack are recorded as
confirmations, not re-litigated.

---

## Part A — Cross-service decisions (bind BOTH core-api and edge-api)

### A1. API versioning scheme: URI-path major version, `/v1/...` on every route from day one

**Decision**: Every externally consumed route on both services lives under a URI-path
major-version prefix (`/v1/...`) from the first commit. Health (`/healthz`, `/readyz`)
and `/metrics` are deliberately unversioned (they describe the process, not the API
contract).

**Rationale**: Dominant industry pattern for first-party / mobile-BFF product APIs:
Google AIP-185 mandates major version in the URI; Microsoft's REST guidelines allow URL
versioning; Uber (`/v1.2/products`), Twilio (URI date), Shopify (URI date) all version in
the path. Path versioning is visible in every log line and curl, trivially routable (Gin
route groups; API Gateway routes), and has no forgot-the-header failure mode — decisive
for KMP mobile clients with baked-in URLs.

**Alternatives rejected**:
- *Header/date-pinned versioning* (Stripe `Stripe-Version`, GitHub
  `X-GitHub-Api-Version`) — built for huge third-party ecosystems; needs per-version
  transform infrastructure and account pinning that buys nothing when we own all six
  clients.
- *Media-type versioning* (Zalando rules 113–115) — REST-pure, near-zero adoption
  outside Zalando; even Zalando frames it as a last resort inside "avoid versioning".

**Sources**: google.aip.dev/185 · docs.stripe.com/api/versioning ·
docs.github.com/en/rest/about-the-rest-api/api-versions ·
shopify.dev/docs/api/usage/versioning · opensource.zalando.com/restful-api-guidelines ·
developer.uber.com/docs/riders/references/api · spring.io/blog/2025/09/16/api-versioning-in-spring

### A2. Version granularity: whole-surface major version; additive evolution inside it

**Decision**: One major version governs each backend's whole surface. "Every endpoint
versioned" = every route lives under the prefix. Endpoints evolve **additively inside
v1** (new optional fields, new endpoints, new enum values). A breaking change to a route
introduces that route under `/v2/` while the `/v1/` route keeps serving — untouched
routes are not force-migrated.

**Breaking vs additive (written policy, adopted from GitHub's + Google AIP-180's lists)**:
- *Breaking*: removing/renaming an operation, parameter, or response field; adding a new
  **required** parameter; changing a field's type; removing enum values; adding new
  validation; tightening auth; changing error codes/shape, pagination, sort, or
  nullability that clients relied on; semantic changes even when the wire shape is
  unchanged. Rename = remove + add = breaking.
- *Additive (allowed in place)*: new operations; new **optional** parameters; new
  response fields; new enum values; new optional headers.
- *Client-side contract*: all six first-party clients are **tolerant readers** (Zalando
  rule 108): ignore unknown response fields and unknown enum values (map to a safe
  fallback), never depend on field order.

**Alternatives rejected**: per-endpoint version numbers (`/users/v3`) — combinatorial
contract/test matrix, discouraged by every major guide.

**Sources**: docs.github.com/en/rest/about-the-rest-api/api-versions · google.aip.dev/180 ·
opensource.zalando.com/restful-api-guidelines (106–109)

### A3. Coexistence mechanics: version-neutral core, thin per-version edge

**Decision**: Services and repositories are **version-neutral**; only handlers and wire
DTOs are version-specific, and only where shapes differ.
- *core-api*: Gin router groups `v1 := r.Group("/v1")`, `v2 := r.Group("/v2")` in one
  binary; an unchanged endpoint registers the **same handler func** in both groups; a
  changed endpoint gets a v2 handler + v2 DTOs delegating to the same service.
- *edge-api*: path-prefixed routes per version in `serverless.yml` (`/v1/x`, `/v2/x`);
  unchanged endpoints point both routes at the same Lambda handler; changed endpoints get
  a v2 handler file reusing the shared service module.
- **API Gateway stages are for environments, never versions** (AWS Prescriptive
  Guidance + unanimous practitioner guidance); Lambda versions/aliases are not a
  versioning mechanism either (IAM/config doesn't version with them).

**Sources**: gin-gonic.com/en/docs/routing/grouping-routes ·
docs.aws.amazon.com/prescriptive-guidance/latest/patterns/implement-path-based-api-versioning-by-using-custom-domains.html ·
theburningmonk.com/2025/05/how-to-version-apis-with-api-gateway-and-lambda

### A4. Deprecation & retirement policy (written, shipped with the conventions docs)

**Decision**:
- Deprecating a version ⇒ every response from it carries **`Deprecation`** (RFC 9745,
  Mar 2025) + **`Sunset`** (RFC 8594) + `Link: <migration-note>; rel="deprecation"`.
- Window: **minimum 6 months** from deprecation announcement to sunset, **extended until
  the active-device share on the old version drops below an agreed threshold**
  (fleet-measured variant of the industry norm — Shopify ≥12mo, GitHub ≥24mo, Google
  ≥12mo — appropriate because all clients are first-party and measurable).
- **Retired version → `410 Gone`** with a Problem Details body naming the successor
  (GitHub precedent). **Never-existed version (`/v3`) → `404`** with the standard
  not-found problem. (Bootstrap slice proves the 404 arm; no version is deprecated yet.)

**Sources**: rfc-editor.org/info/rfc9745 · rfc-editor.org/rfc/rfc8594 ·
docs.github.com/en/rest/about-the-rest-api/api-versions ·
zuplo.com/learning-center/http-deprecation-header

### A5. Min-app-version enforcement (the mobile-fleet complement — mechanism reserved, not built here)

**Decision**: Record the pattern now, build it when the mobile apps consume real APIs: a
version-neutral bootstrap/config read returning `min_supported_version` (hard block →
update screen) and `recommended_version` (soft prompt), checked at app launch and cached;
clients send `X-App-Version`; backends may answer **`426 Upgrade Required`** below the
hard floor. This is the only lever that ever lets a retired version actually turn off.
Out of scope for 004 beyond the policy text (no product clients exist yet); the policy
doc names it so slices that ship real mobile flows implement it.

**Sources**: nextcloud/spreed#9660 (426 enforcement) · MDN 426 ·
appmaster.io/blog/api-versioning-mobile-apps

### A6. Error contract: RFC 9457 Problem Details, `application/problem+json`, both services

**Decision**: Every failure response from both services is an RFC 9457 **Problem
Details** object — media type `application/problem+json`, members `type`, `title`,
`status`, `detail`, `instance` + extension members where useful (e.g. `request_id`,
field errors). A stable `type` URI vocabulary under one namespace (e.g.
`https://effyshopping.com/problems/<slug>`) is the shared contract; the envelope is
version-neutral so a v1-only client parses errors from any era. Internals/stack traces
never appear in any member.

**Rationale**: RFC 9457 obsoletes RFC 7807 (same wire shape) and is the 2026 greenfield
consensus: default in ASP.NET Core and Spring 6+, recommended by Zalando, Redocly,
Swagger. Bespoke envelopes at Stripe/GitHub are legacy inertia, not counter-guidance.

**Alternatives rejected**: custom `{error: {code, message}}` envelope — no benefit
greenfield, loses tooling/interop; per-service shapes — violates spec FR-009 (one
contract).

**Sources**: rfc-editor.org/rfc/rfc9457 · redocly.com/blog/problem-details-9457 ·
swagger.io/blog/problem-details-rfc9457-doing-api-errors-well

---

## Part B — core-api (Go hot path)

### B1. Project layout: `cmd/` + `internal/{features,platform}` — confirmed mainstream

**Decision**: `cmd/core-api/main.go` (+ a `run()` func for testability) with everything
else under `internal/`: `internal/features/<feature>/{handler,service,repository}` and
`internal/platform/{auth,config,db,logger,httpx,health,metrics}`. Each feature owns its
route registration (`Register(rg *gin.RouterGroup, …)`); a thin router composition in
`cmd/` (wired by hand, top-down: config → logger → pool → verifiers → features).

**Rationale**: Matches official Go team guidance (go.dev/doc/modules/layout: commands in
`cmd/`, server logic in `internal/`, servers "usually won't have exportable packages")
and the 2024–2026 package-by-feature consensus; identical to ARCHITECTURE.md's binding
shape.

**Alternatives rejected**: `golang-standards/project-layout` (`pkg/`, `api/`, …) — a
"fake standard", over-structured for a single binary (the official layout doc exists
partly in response); layer-first packages (`internal/handlers`, `internal/services`) —
scatters features, invites import cycles; flat package — too small for a multi-feature
API.

**Sources**: go.dev/doc/modules/layout · github.com/golang-standards/project-layout ·
alexedwards.net/blog/11-tips-for-structuring-your-go-projects

### B2. HTTP server: explicit `http.Server`, full timeouts, graceful shutdown

**Decision**: Never `router.Run()`. `http.Server{Handler: router}` with
`ReadHeaderTimeout` 5s (Slowloris), `ReadTimeout` 10s, `WriteTimeout` 30s, `IdleTimeout`
120s. Shutdown: `signal.NotifyContext(SIGINT, SIGTERM)` → `srv.Shutdown(ctx)` with a
10–15s deadline (under the future ECS 30s grace) → close pgx pool → `logger.Sync()`.

**Sources**: github.com/gin-gonic/examples graceful-shutdown ·
victoriametrics.com/blog/go-graceful-shutdown

### B3. pgx/v5: pool config, context timeouts, generic collect scanning, BeginTxFunc

**Decision**:
- `pgxpool.ParseConfig(dsn)` + overrides: `MaxConns` **10** (dev DB is t4g.micro,
  max_connections ≈ 85 — stay well under while edge-api shares the instance), `MinConns`
  2, `MaxConnLifetime` 30–60min **+ `MaxConnLifetimeJitter`**, `MaxConnIdleTime` 15min,
  `HealthCheckPeriod` 1min.
- Every query runs under a context deadline (per-query `context.WithTimeout`, 3–5s for
  hot reads); never `context.Background()` in handlers.
- Scanning: `pgx.CollectRows(rows, pgx.RowToStructByName[T])` /
  `pgx.CollectOneRow`/`CollectExactlyOneRow` — the idiomatic no-ORM pattern (replaced
  sqlx/scany); manual `Scan` fine for 1–3 columns.
- Transactions: `pgx.BeginTxFunc` (commit on nil error, rollback on error/panic); repos
  accept a small `DBTX` interface satisfied by `*pgxpool.Pool` and `pgx.Tx` so the
  service layer owns transaction boundaries.

**Sources**: pkg.go.dev/github.com/jackc/pgx/v5/pgxpool · github.com/jackc/pgx/discussions/1989 ·
donchev.is/post/working-with-postgresql-in-go-using-pgx

### B4. Metrics: hand-rolled ~30-line Gin middleware over official client_golang

**Decision**: Custom middleware on a custom `prometheus.Registry` + `promhttp` handler at
`/metrics` (same port for the Docker-local slice; revisit a separate internal port at
Fargate time). Two RED instruments: `http_requests_total{method,route,status}`
(CounterVec) and `http_request_duration_seconds{method,route,status}` (HistogramVec,
`prometheus.DefBuckets`). **Cardinality rule**: label with the route template
(`c.FullPath()`, e.g. `/v1/platform/status`), sentinel `unmatched` when no route —
never the raw path (constitution VII: low-cardinality labels).

**Alternatives rejected**: `zsais/go-gin-prometheus` and the third-party Gin middlewares
— stagnant/graveyard, global-registry footguns; `slok/go-http-metrics` — fine but an
extra dependency for two instruments; OpenTelemetry SDK — heavier than the locked
Prometheus-direct stack.

**Sources**: prometheus.io/docs/guides/go-application · pkg.go.dev/github.com/prometheus/client_golang/prometheus/promhttp ·
github.com/zsais/go-gin-prometheus

### B5. Logging: typed `zap.Logger`, base logger injected, request-scoped via context

**Decision**: Typed `zap.Logger` only (no SugaredLogger on the hot path).
`zap.NewProductionConfig()` baseline (JSON, ISO8601, stacktraces at Error+); sampling on
in prod-like runs, off in dev. Request-ID middleware (google/uuid; honor inbound
`X-Request-ID`, else generate) derives `reqLogger := base.With(zap.String("request_id",
id))` stored in the request context behind an unexported key with a typed
`logger.FromContext(ctx)` accessor. The **dependency** (base logger) is explicit manual
DI; only the **request-scoped enrichment** travels via context. One structured record
per handled request (spec FR-005), emitted by the logging middleware.

**Sources**: pkg.go.dev/go.uber.org/zap · betterstack.com/community/guides/logging/go/zap ·
dave.cheney.net/tag/logging

### B6. Config: `env.ParseAs[Config]()` + dev-only godotenv, fail-fast

**Decision**: One nested `Config` struct in `internal/platform/config` (Server, DB, Auth,
Log sub-structs via `envPrefix`); required values tagged `required,notEmpty` (`required`
alone passes empty strings); `time.Duration` fields parsed natively; defaults via
`envDefault`. `godotenv.Load()` (ignore not-found) runs **only** as local-dev
convenience; `.env` is gitignored, never in the image. `config.Load()` error ⇒ log the
**name** of the missing variable and exit non-zero before anything starts (spec FR-007).
Never log the parsed config wholesale.

**Sources**: github.com/caarlos0/env · thedevelopercafe.com/articles/loading-environment-variables-properly-in-go-with-env-and-godotenv

### B7. Health: unversioned `/healthz` (liveness) + `/readyz` (readiness = DB ping)

**Decision**: `/healthz` → 200, checks nothing outside the process. `/readyz` →
`pool.Ping` with ~2s timeout; 200 ready / 503 not-ready with informational JSON body.
Convention is the Google/Kubernetes `z`-suffix pair; DB checks belong in readiness only
(a DB outage must stop routing, not restart-loop the container). Outside `/v1`, outside
auth, outside request-log noise (debug level), excluded from metrics-cardinality
concerns.

**Sources**: kubernetes.io/docs/reference/using-api/health-checks ·
web-alert.io/blog/health-check-endpoint-design-livez-readyz-guide

### B8. Docker: distroless multi-stage prod image + compose-with-air dev loop

**Decision**:
- **Prod-shape image** (built/verified locally now, deployed later):
  `FROM --platform=$BUILDPLATFORM golang:1.25-bookworm` builder with BuildKit cache
  mounts, `CGO_ENABLED=0 GOARCH=$TARGETARCH`, `-ldflags="-s -w"` →
  `gcr.io/distroless/static-debian12:nonroot` runtime (CA certs + tzdata + nonroot
  included; ~15MB; near-zero CVE surface). Same file builds ARM64 (Fargate future) and
  the dev machine's native arch.
- **Dev loop**: `docker compose` service running the dev stage with **air**
  (air-verse/air) live-reload, bind-mounted source; DSN injected as process env by the
  Makefile at invocation (002/003 discipline — never written to a file). Plain
  `go run ./cmd/core-api` stays available for host-side iteration.
- `.dockerignore`: `.git`, `.env*`, `tmp/`, specs/docs, IDE dirs.

**Alternatives rejected**: alpine runtime (shell = attack surface, musl subtleties) —
debug-variant only; scratch (hand-maintained certs/tzdata/passwd); CompileDaemon/fresh —
dead projects.

**Sources**: medium.com/google-cloud/alpine-distroless-or-scratch-caac35250e0b ·
github.com/air-verse/air · dev.to/young_gao/docker-multi-stage-builds-for-go

### B9. Testing: table-driven; testify asserts; httptest handlers; testcontainers repos

**Decision**: (1) service tests — stdlib `testing` + testify, hand-rolled fake
repositories against the small repo interfaces (no gomock); (2) handler tests —
`httptest.NewRecorder` against the real Gin engine with faked services (asserts status,
problem+json body, auth rejection, request-id header); (3) repository tests —
**testcontainers-go** postgres module on PostgreSQL 16, gated behind `-short`/build tag.
With raw SQL and no ORM, real-database repo tests are the highest-value tier (mocks
can't catch SQL/constraint/scan errors).

**Alternatives rejected**: sqlmock (asserts SQL strings, targets database/sql, brittle
with pgx v5); shared long-lived dev DB for tests (state bleed, CI-hostile).

**Sources**: golang.testcontainers.org/modules/postgres · github.com/stretchr/testify ·
speedscale.com/blog/testing-golang-with-httptest

### B10. Go toolchain version note (constitution lock)

**Decision**: Constitution locks **Go 1.25** (Technology Standards). Current stable is
1.26.x (Feb 2026), but 1.25 remains supported under the two-release policy and every
locked dependency (pgx v5.10, air) requires only ≥1.25. **Pin the latest 1.25.x patch**;
flag a cheap Go 1.26 bump as a future constitution PATCH amendment — not taken
unilaterally here (Principle: locked standards change only by amendment).

**Sources**: go.dev/doc/devel/release · go.dev/blog/go1.26

### B-pins. core-api dependency pins (verified against pkg.go.dev / releases, July 2026)

| Dependency | Pin |
|---|---|
| Go toolchain | 1.25.x (latest patch; constitution-locked minor) |
| gin-gonic/gin | v1.12.0 |
| gin-contrib/cors | v1.7.7 |
| jackc/pgx/v5 | v5.10.0 |
| go.uber.org/zap | v1.28.0 |
| caarlos0/env/v11 | v11.4.1 |
| MicahParks/keyfunc/v3 | v3.8.0 |
| golang-jwt/jwt/v5 | v5.3.1 |
| prometheus/client_golang | v1.23.2 |
| google/uuid | v1.6.0 |
| joho/godotenv | v1.5.1 (dev-only convenience; dormant-but-stable accepted) |
| testcontainers-go | v0.43.0 (test-only) |
| air-verse/air | v1.65.2 (dev tool, not a module dep) |

---

## Part D — Auth: per-pool Cognito JWT validation (both services)

### D1. Validate ACCESS tokens; per-pool checklist

**Decision**: Resource servers validate the **access token** (AWS guidance; ID tokens
stay client-side). Per-pool validation checklist, applied identically everywhere:
1. RS256 signature against **that pool's** JWKS
   (`https://cognito-idp.{region}.amazonaws.com/{userPoolId}/.well-known/jwks.json`;
   cache by `kid`, refresh on unknown `kid` — Cognito rotates keys and signs access and
   ID tokens with different keys in the same JWKS).
2. `iss` == `https://cognito-idp.{region}.amazonaws.com/{userPoolId}` (pinned, exact).
3. `token_use == "access"`.
4. **`client_id` ∈ that pool's allowed app clients** — the confirmed Cognito gotcha:
   plain access tokens carry **no `aud`**; "audience" validation for access tokens means
   checking the `client_id` claim in code. Generic `WithAudience`-style options do
   nothing useful.
5. `exp` (and in Go, `WithExpirationRequired` so a missing `exp` is fatal).

`cognito:groups` is a real JSON array **in the access token** — RBAC reads it from the
verified token. `sub` format is not strictly validated (AWS: don't). EMAIL_OTP
(passwordless, `USER_AUTH` flow) changes **nothing** about token shape or validation;
lifetimes are per app client (access default 1h, range 5min–24h).

**Sources**: docs.aws.amazon.com/cognito/…/amazon-cognito-user-pools-using-tokens-verifying-a-jwt.html ·
…/amazon-cognito-user-pools-using-the-access-token.html

### D2. core-api: one keyfunc + one pinned parser PER POOL, selected by route group

**Decision**: At startup, per pool served: `keyfunc.NewDefaultCtx(ctx, []string{poolJWKSURL})`
(v3.8.0; defaults are production-appropriate — hourly refresh, unknown-`kid` refresh
rate-limited to 5min) + a `jwt.Parser` with `WithValidMethods(["RS256"])`,
`WithIssuer(poolIssuer)`, `WithExpirationRequired()`; parse into a typed claims struct
(`jwt.RegisteredClaims` + `token_use`, `client_id`, `username`, `scope`,
`cognito:groups []string`), then check `token_use`/`client_id` in code. A middleware
factory `Auth(pool)` closes over one pool's verifier and hangs on that pool's route
group. Verified identity (audience, subject, groups) is injected into the request
context behind a typed key.

**Isolation is structural, not just claim-checked**: never merge JWKS URLs into one
keyfunc — a cross-pool token then fails **key lookup** (wrong key set) before `iss` or
`client_id` are even consulted; defense in depth. **Fail-closed**: missing pool config ⇒
the process refuses to start (config `required`), and any route group without a
configured verifier rejects-all rather than mounting open (ARCHITECTURE.md rule).

**Alternatives rejected**: one merged multi-URL keyfunc + `iss` check only — isolation
would rest on a single string compare; gin community JWT middlewares — unmaintained,
generic, can't encode the Cognito access-token checklist.

**Sources**: pkg.go.dev/github.com/MicahParks/keyfunc/v3 · pkg.go.dev/github.com/golang-jwt/jwt/v5 ·
angelospanag.me/blog/verifying-a-json-web-token-from-cognito-in-go-and-gin

### D3. edge-api: gateway JWT authorizer per pool + defensive claims read

**Decision**: One **JWT authorizer per pool** at the gateway (one `issuerUrl` each,
`audience` = that pool's app client id — API Gateway matches access-token `client_id`
against the audience list when `aud` is absent), attached per route. **Never** one
authorizer listing multiple pools (the REST-API `providerARNs` multi-pool pattern is an
isolation footgun — any listed pool's token authorizes the method). Handlers read
claims from the authorizer context; **`cognito:groups` arrives stringified** there
(HTTP API: `"[admin manager]"`-style; REST: comma-joined) — parse defensively (strip
brackets, split on space/comma) via one shared helper; absent claim = deny; group names
compared exact-case (`admin`/`manager`/`csa` are safe names). If a route ever needs the
true array or finer checks, re-verify in-function with **aws-jwt-verify 5.2.1**
(module-scope per-pool verifier, JWKS cached across warm invocations,
`verifier.hydrate()` at init) — one single-pool verifier per scoped function, never a
shared four-pool verifier.

**Sources**: docs.aws.amazon.com/apigateway/…/http-api-jwt-authorizer.html ·
…/apigateway-integrate-with-cognito.html · github.com/awslabs/aws-jwt-verify ·
repost.aws/questions/QUFJRBaEJRSmmqarNrvCWoQA/aws-cognito-group

### D4. RBAC guard + Cognito SDK note

**Decision**: One shared guard per backend (`RequireGroups(…)` middleware factory in Go;
a `hasAnyGroup(event, groups)` helper in TS) reading groups from the **verified**
identity only: missing claim = empty set = deny (never crash — a group-less user has NO
`cognito:groups` claim, not an empty array); 401 = unauthenticated vs 403 =
authenticated-but-forbidden. Group hierarchy (admin ⊃ manager ⊃ csa) is app logic
encoded once in the helper, not per handler. The AWS SDK Cognito client
(`github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider`, v1.63.0) is **wired but
unused** in this slice — JWT validation needs zero SDK calls (JWKS is public HTTPS);
the client exists for later admin-provisioning slices (`AdminCreateUser`,
`AdminAddUserToGroup`, …).

**Sources**: github.com/aws-samples/amazon-cognito-example-for-external-idp ·
arpadt.com/articles/cognito-groups · pkg.go.dev/github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider

---

## Part C — edge-api (serverless TypeScript cold path)

### C1. Serverless Framework: pin `serverless@3.40.0` exactly; `osls` is the escape hatch

**Decision**: Pin **3.40.0** (2024-12-17) — the true last v3 release (operator wrote
"3.4"; 3.38/3.39 are older; 3.40.0's one change fixes the v3 CLI crashing on newer
dev-machine Node). v3 is frozen/EOL: schema gaps warn (never set
`configValidationMode: error`), issues close "not planned". Documented escape hatch when
the frozen schema bites: the MIT community fork **`osls`** (oss-serverless), a drop-in
replacement — the planned migration path, not the day-1 choice (operator locked v3).

**Alternatives rejected**: Serverless v4 — subscription-licensed for >$2M-revenue orgs,
requires a vendor account/license key and phones home; SST/CDK/SAM — swaps a locked
technology.

**Sources**: serverless.com/blog/serverless-framework-v4-a-new-model ·
github.com/serverless/serverless/releases/tag/v3.40.0 · github.com/oss-serverless/osls

### C2. Runtime: `nodejs22.x` on arm64 — constitution deviation, flagged

**Decision**: Target **`nodejs22.x`**, `provider.architecture: arm64`. **Premise
correction (verified against AWS's runtime table 2026-07-05)**: `nodejs20.x` was
**deprecated Apr 30, 2026** — no security patches, create blocked Feb 1 2027, update
blocked Mar 3 2027. Bootstrapping a NEW service on it in July 2026 is indefensible.
Serverless 3.40.0's schema predates node22 → one **benign warning** at deploy
(validation mode stays `warn`; deploy verified to proceed) vs clean validation on a dead
runtime. The constitution locks "Node 20" — this deviation is recorded in plan.md
**Complexity Tracking** with a recommended constitution PATCH amendment (operator
ratifies).

**esbuild/bundling**: `serverless-esbuild@1.57.2` + `esbuild@0.28.1`,
`package.individually: true` (per-function tree-shaken bundles, matches
one-handler-per-route), `format: 'esm'` with the standard `createRequire` banner (~50%
smaller bundles, faster cold starts, top-level await for init-phase work; `pg`/`pino`
work under it), `target: 'node22'`; **bundle** the AWS SDK v3 clients used (AWS
guidance: version control + faster than the runtime's copy). Local dev:
`serverless-offline@13.10.1` — the **last** version with peer `serverless ^3.x` (14.x
requires v4); plugin order: esbuild before offline.

**Sources**: docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html ·
github.com/serverless/serverless/issues/12963 · github.com/floydspace/serverless-esbuild ·
npm serverless-offline peerDependencies

### C3. Gateway: **HTTP API (v2)** with four per-pool JWT authorizers — not REST API

**Decision**: `httpApi` events on API Gateway **HTTP API**; named JWT authorizers in
`provider.httpApi.authorizers` — one per Cognito pool (issuerUrl = pool issuer, audience
= that pool's app client id), selected per route by name. **Reading of the operator
directive recorded** (#4/#8): "REST api calls" means REST-*style* APIs, which HTTP API
serves fully; the API Gateway product named "REST API" (v1) is not implied and is the
wrong tool here.

**Rationale**: ~71% cheaper ($1.00/M vs $3.50/M — literally the cold path's stated
cost-over-speed goal), lower per-request overhead, and **structurally isolation-correct**
for four pools (one issuer per authorizer; access tokens accepted natively via the
`client_id`-vs-audience rule). REST API's Cognito authorizer treats tokens as ID tokens
unless OAuth scopes are configured (access-token gotcha) and allows multi-pool
`providerARNs` (isolation footgun). Features lost (usage plans, gateway-side validation,
VTL, WAF, caching) are all deliberately unused (validation is in-code per ARCHITECTURE.md).

**Sources**: docs.aws.amazon.com/apigateway/latest/developerguide/http-api-vs-rest.html ·
serverless.com/framework/docs/providers/aws/events/http-api ·
docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html

### C4. Postgres from Lambda: `pg@8.22.0`, module-singleton Pool `max: 1`, no RDS Proxy

**Decision**: `pg` (node-postgres), one module-level `pg.Pool` per container:
`{max: 1, min: 0, idleTimeoutMillis: 120000, connectionTimeoutMillis: 10000, ssl: {ca:
<bundled regional RDS CA PEM>, rejectUnauthorized: true}}`. **Every handler sets
`context.callbackWaitsForEmptyEventLoop = false`** (the field's most-reported failure
mode: cached socket timers hang the invocation) — with no middleware, this lives in the
shared handler preamble helper. Pool-not-Client even at max 1 (transparently replaces
idle-killed connections). Connection budget on the shared t4g.micro (max_connections
≈ 85): core-api pool ≤ 10 + edge-api ≈ concurrent containers (single digits at ops
traffic) — comfortable; revisit RDS Proxy (≈$11/mo — comparable to the whole DB) only
at sustained concurrency >30–40.

**Alternatives rejected**: postgres.js — faster but its tagged-template interface is a
mini query DSL (tension with "raw SQL, no query builder") and Lambda idle-connection
behavior is less documented; `serverless-postgres` wrapper — solves a scale problem this
path doesn't have; RDS Proxy now — cost-irrational.

**Sources**: jeremydaly.com/reuse-database-connections-aws-lambda ·
github.com/brianc/node-postgres/issues/3016 · issues/2558 (RDS CA) ·
blog.stefanwaldhauser.me/posts/lambda_db_connection_leak

### C5. Logging: pino, hand-rolled per-request child logger (no pino-lambda, no transports)

**Decision**: `pino@10.3.1`, module-singleton
(`pino({level: process.env.LOG_LEVEL ?? 'info', base: {function:
process.env.AWS_LAMBDA_FUNCTION_NAME}})`), plain sync JSON to stdout → CloudWatch. Per
request, the shared preamble helper builds
`log.child({awsRequestId: context.awsRequestId, requestId:
event.requestContext.requestId})` and the gateway request id is echoed back as an
`x-request-id` response header (joins client, gateway, and function logs). **Never**
worker-thread transports or pino-pretty in the artifact (frozen-sandbox log loss; pino
docs require sync on Lambda). Hand-rolled child-logger chosen over `pino-lambda` — ~15
lines, zero magic, literal fit with the no-middleware law (pino-lambda 4.4.1 recorded as
the accepted alternative).

**Sources**: github.com/pinojs/pino/blob/main/docs/asynchronous.md ·
github.com/pinojs/pino/issues/2087 · github.com/FormidableLabs/pino-lambda

### C6. Config: deploy-time `${ssm:...}` for non-secrets; runtime extension fetch for the DB secret

**Decision**: Non-secret 002-contract values (`/effy/<stage>/db/{endpoint,port,name,
master_username}`, auth pool ids/client ids from `/effy/<stage>/auth/*`) resolve **at
deploy time** via `${ssm:...}` into Lambda env vars. The **DB password never** goes
through the template: only `/effy/<stage>/db/master_secret_arn` is passed as env; the
function fetches the secret **at runtime** through the **AWS Parameters and Secrets
Lambda Extension** (official layer, arm64 variant; `localhost:2773`; TTL cache, ~12ms
warm) memoized in the module singleton next to the Pool. Rotation handling: on auth
failure (`28P01`) drop memo + pool, refetch once, reconnect. Deploy-time secret
embedding rejected: plaintext in CloudFormation template + console env vars, silently
broken by rotation (002's secret discipline: the password exists only in Secrets
Manager).

**Sources**: docs.aws.amazon.com/secretsmanager/latest/userguide/retrieving-secrets_lambda.html ·
aws.amazon.com/blogs/compute/using-the-aws-parameter-and-secrets-lambda-extension-to-cache-parameters-and-secrets ·
sktan.com/blog/post/8 (benchmarks)

### C7. Auth boundary: authenticate at the gateway, authorize in the handler

**Decision**: The four JWT authorizers are the **authentication** boundary (signature,
issuer, expiry, client_id — free, before any Lambda bills); handlers own
**authorization**: read `event.requestContext.authorizer.jwt.claims` (typed
`APIGatewayProxyEventV2WithJWTAuthorizer`), parse `cognito:groups` through the one shared
defensive parser (HTTP API stringifies it as `"[admin manager]"`), enforce groups via
`hasAnyGroup(...)` (absent claim = deny). `aws-jwt-verify@5.2.1` is a dev/test
dependency only day-1 (serverless-offline has no real authorizer; unit tests for the
claims path), reserved for any future non-gateway entry point.

**Sources**: docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html ·
dev.to/slsbytheodo/migrating-from-api-gateway-v2-to-v1-to-get-rest-api-features-nfp ·
github.com/awslabs/aws-jwt-verify

### C8. Metrics/alarms: CloudWatch built-ins day-1; Powertools Metrics only when custom metrics appear

**Decision**: No Powertools at bootstrap. Alarms via `resources:` in serverless.yml:
Lambda `Errors` (>0), `Throttles` (>0), `Duration` p95 vs SLO, HTTP API `5xx` rate
(>1% / 5min) + `IntegrationLatency`; surfaced in Grafana later via the CloudWatch
datasource (ARCHITECTURE.md). When a real business metric appears, adopt **only**
`@aws-lambda-powertools/metrics` in **manual mode** (`addMetric` +
`publishStoredMetrics()` in `finally`) — EMF is stdout JSON, zero conflict with pino,
no middleware. Powertools Logger/Tracer rejected (duplicates pino; X-Ray not in the
locked observability stack).

**Sources**: docs.aws.amazon.com/powertools/typescript/latest/features/metrics ·
docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Best_Practice_Recommended_Alarms_AWS_Services.html

### C9. Monorepo wiring: pnpm workspace turns on; in-service `src/lib/` with a graduation rule

**Decision**: `pnpm-workspace.yaml` gains its first member (`services/edge-api`);
Turborepo gains minimal `lint`/`typecheck`/`test` tasks. Cross-cutting helpers (db
client, logger, http/problem+json builders, claims parsing) live **inside the service**
at `src/lib/` for now, with a written **graduation rule** in the service README: the
moment a second cold-path service exists, these extract to workspace packages (the
ARCHITECTURE.md shared-packages shape). Single consumer today ⇒ extraction now would be
speculative structure; Principle II's prohibition is on *copy-paste*, which one consumer
cannot violate. TypeScript pinned **5.9.x** (6.0 is weeks old; tsc is typecheck-only —
esbuild transpiles). Tests: **Vitest** (the 2026 TS default; esbuild-native, ESM-clean).

### C-pins. edge-api dependency pins (npm registry, verified 2026-07-05)

| Package | Pin | Note |
|---|---|---|
| serverless | **3.40.0** (exact) | last v3; frozen — `osls` is the escape hatch |
| serverless-esbuild | 1.57.2 | |
| serverless-offline | **13.10.1** (exact) | last v3-compatible; 14.x needs v4 |
| esbuild | 0.28.1 | within plugin peer range |
| pg (+ @types/pg) | 8.22.0 | |
| pino | 10.3.1 | sync stdout only |
| typescript | 5.9.x | typecheck-only |
| @types/aws-lambda | 8.10.162 | has `APIGatewayProxyEventV2WithJWTAuthorizer` |
| aws-jwt-verify | 5.2.1 | dev/test only day-1 |
| vitest | latest 3.x at implementation | |
| @aws-lambda-powertools/metrics | 2.33.1 | deferred until a custom metric exists |
| nodejs runtime | **nodejs22.x** | constitution deviation — see plan Complexity Tracking |

---

## Part E — Slice-specific design decisions (from spec + all research)

### E1. Repo placement: `services/core-api` (own Go module) + `services/edge-api` (pnpm member)

Both backends live under `services/` — symmetric with ARCHITECTURE.md's cold-path
`services/<service>` shape; `apps/` stays client surfaces. core-api is an independent Go
module (CLAUDE.md: "Go lives alongside with its own module"); edge-api is the first pnpm
workspace member.

### E2. Proving slice: read the migration ledger — zero new schema

The proving read (`platform/status`) queries **platform-owned** data only: the goose
migration ledger (`goose_db_version` — the 003 spec's "Migration Ledger" entity) for
latest version + applied count, plus `now()` / `current_database()`. Full three-layer
traversal, real multi-row scanning, **no new migration needed** (spec FR-004).
Documented prerequisite: 003's first `db-up` has been applied (already the operator's
pending runbook). If the ledger is absent, `/readyz` still passes (DB reachable);
`platform/status` returns the uniform problem+json 500 with a log naming the cause —
recorded behavior, not an accident.

### E3. API surface of the slice (per service)

| | core-api (hot) | edge-api (cold) |
|---|---|---|
| Liveness | `GET /healthz` (unversioned, public) | `GET /healthz` (unversioned, public) |
| Readiness | `GET /readyz` (DB ping, public) | (folded into `/healthz` — one function does both checks; gateway has no probe semantics) |
| Metrics | `GET /metrics` (Prometheus, unversioned) | CloudWatch built-ins + alarms |
| Proving v1 | `GET /v1/platform/status` (public) | `GET /v1/platform/status` (public) |
| Proving v2 | `GET /v2/platform/status` (coexistence demo — deliberately reshaped payload) | `GET /v2/platform/status` (same demo) |
| Protected ping | `GET /v1/customer/ping` (customer pool) | `GET /v1/back-office/ping` (back-office pool; returns parsed groups) |
| Unsupported version | `/v3/...` → 404 problem+json (`no-route` type) | same |

The v2 proving endpoint exists **purely** to prove side-by-side version serving (spec
US4/SC-010): its payload deliberately reshapes a field (a breaking-shape example), both
versions served concurrently by the same service/repository. Cross-pool matrix proved in
quickstart: customer token → core ping 200 / edge ping 403-401; back-office token →
edge ping 200 / core ping 401.

### E4. Operator boundary (mode of work)

Claude authors everything (Go, TS, serverless.yml, Dockerfiles, Makefile, docs). The
**operator runs**: `make edge-deploy` (wraps `sls deploy --stage dev` under
AWS_PROFILE=ef) and anything cloud-mutating. Local `docker compose` / `go run` /
`sls offline` / tests are developer-side. Makefile grows `core-*` and `edge-*` target
families following the 001/003 conventions (AWS_PROFILE wrapper, `##` help, OPERATOR
markers, DSN composed at invocation via `infra/scripts/db-dsn.sh` — never on disk).

---

## Decision register (quick index)

| # | Decision | Where |
|---|---|---|
| A1 | URI-path `/v1` versioning, health/metrics unversioned | both services |
| A2 | Whole-surface major version; additive-in-place policy (GitHub/AIP-180 lists) | policy doc |
| A3 | Version-neutral core, per-version handlers/DTOs; never gateway stages | both |
| A4 | RFC 9745 `Deprecation` + RFC 8594 `Sunset` + Link; ≥6mo fleet-measured window; retired→410, never-existed→404 | policy doc |
| A5 | Min-app-version pattern reserved (bootstrap read + `X-App-Version` + 426) | policy doc, future slice |
| A6 | RFC 9457 problem+json everywhere; one `type` vocabulary | both |
| B1–B10 | Go layout, http.Server+shutdown, pgxpool+CollectRows, hand-rolled RED middleware, zap patterns, env/v11+godotenv, healthz/readyz, Gin version groups, distroless+air Docker, testify/httptest/testcontainers, Go 1.25 pin note | core-api |
| C1–C9 | serverless 3.40.0 pin, nodejs22.x (flagged deviation), HTTP API + 4 JWT authorizers, pg max:1 pool, pino child-logger, SSM deploy-time + secret runtime fetch, gateway-auth/handler-authz split, CloudWatch alarms day-1, pnpm workspace + lib graduation rule | edge-api |
| D1–D4 | Access-token validation checklist, per-pool keyfunc+parser, per-pool JWT authorizers + defensive groups parse, RequireGroups/hasAnyGroup guards | auth |
| E1–E4 | services/ placement, ledger-reading proving slice, exact API surface, operator boundary | slice |

**All spec-phase unknowns resolved; no NEEDS CLARIFICATION remains.** The single
constitution tension (Node 20 → nodejs22.x) is carried into plan.md Complexity Tracking
for operator ratification.

---

## Part F — Cold-path decomposition: many services behind one shared gateway (2026-07-08 revision)

One internet research pass (Serverless Framework v3 docs + AWS + GitHub issues), consolidated
below. Cited in **plan amendment A3**. Confirms the design against the frozen SLS **3.40.0**.

**F1 — Attaching multiple SLS v3 services to ONE external HTTP API (`provider.httpApi.id`).**
Decision: **use it.** Confirmed: `provider.httpApi.id: <api-id>` attaches a service's routes to an
externally-created HTTP API; **no** API/stage/CORS/authorizers are created in that service. Each
service still defines its own `functions` + `httpApi` route events (in its own CFN stack). Route
keys (`METHOD /path`) must be **unique across the whole API** → disjoint `/<service>/` prefixes.
*Alternatives*: a "base" SLS service owns the API (F3-b), per-service APIs + base-path mapping
(F3-c) — both rejected below.

**F2 — Referencing an EXTERNAL JWT authorizer by id — CONFIRMED.** A route can reference an
authorizer created elsewhere via `authorizer: { type: jwt, id: <authorizer-id> }` — the docs show
`httpApi.id` (external API) and `authorizer.id` **together**, exactly this platform's case
(serverless#7598 → PR #7789). The id may be a `Ref`/`Fn::ImportValue` **or a plain string**, so it
resolves from SSM at deploy time: `id: ${ssm:/effy/${sls:stage}/edge/authorizer/back-office_id}`.
No `provider.httpApi.authorizers` block (not allowed on an external API). **Caveat**: smoke-test a
**bare SSM string** id on 3.40.0's frozen schema on one route before the full cutover; fallback is
`Fn::Sub`/a resolved variable. Capability is confirmed; only that ergonomic detail warrants a trial.

**F3 — Ownership: (a) Terraform owns the API + 4 authorizers.** Decision: **option (a).** It puts
the gateway + authorizers in the same layer that already owns Cognito/VPC/RDS and writes
`/effy/<env>/edge/*`; there is exactly one API and one set of 4 authorizers (no per-API
duplication), and services read ids from SSM (loose coupling) exactly as they already read
`security_group_id`/`subnet_ids`. *Rejected*: **(b)** a base SLS stack owning the API — fractures
infra ownership + CFN `Fn::ImportValue` locks (can't change an exported value while a consumer
imports it); **(c)** per-service APIs + custom-domain base-path mappings — forces the 4 authorizers
to be **duplicated on every service's API** and adds a base-path-mapping layer to maintain.

**F4 — Path/version scheme: `/<service>/v1/...`** (service first, then version). Ownership boundary
= routing boundary → route-key uniqueness by construction; independent per-service version cadence
(the point of side-by-side coexistence for un-updatable fleets); clean per-service catch-alls
(`ANY /admin/{proxy+}` stays inside its subtree). Greedy `{proxy+}` must be the last segment and
scoped under a service prefix. `/healthz` becomes `/<service>/healthz` (or one platform-owned
health) so two services don't both claim `GET /healthz`.

**F5 — Deploy independence + gotchas.** Holds because each service's routes/integrations/perms
live in **its own** CFN stack — a deploy/`remove` only touches that service's routes on the shared
API. Breakers to avoid: overlapping route keys / root-level greedy paths (→ disjoint prefixes);
authorizer/API **shape** changes (a coordinated Terraform change, not a per-service deploy — but
the SSM id is stable, so services don't redeploy unless the id changes); **ordering** — Terraform
(API + authorizers + SSM) must exist before any service deploys (`${ssm:…}` resolves at deploy). In
option (a) services read SSM strings (not CFN imports), so there is no export-lock.

**F-sources**: serverless.com/framework/docs/providers/aws/events/http-api ·
github.com/serverless/serverless issues #7598, #11573, #4711 · forum.serverless.com t/11531.

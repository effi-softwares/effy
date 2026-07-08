# core-api — Effy's hot path

Latency-critical, high-concurrency customer traffic (catalog reads, search, checkout
reads when they land). Go 1.25 + Gin + pgx/v5, raw SQL, no ORM, no DI framework.
**This slice runs locally in Docker only; Fargate arrives with a later slice.**
Born in `specs/004-backend-bootstrap/` (spec → plan → research → tasks).

Whether a new endpoint belongs here at all: [docs/api/path-assignment.md](../../docs/api/path-assignment.md).

## Structure (the binding shape — ARCHITECTURE.md, constitution Principle VI)

```
cmd/core-api/main.go     ALL wiring, by hand, top-down: config → logger → pool →
                         AWS clients → verifiers → features → server. If you can't
                         grep the dependency graph here, it doesn't exist.
internal/platform/       shared infrastructure — NEVER domain logic:
  config/                env/v11 struct; fail-fast; godotenv is dev-only
  logger/                zap build + FromContext/WithContext (request-scoped)
  db/                    the one pgxpool + the DBTX seam repositories depend on
  auth/                  per-pool Cognito verifiers, Auth middleware, RequireGroups
  httpx/                 problem+json writers (the error contract), request-id,
                         request logging, panic recovery
  metrics/               custom Prometheus registry, RED middleware, /metrics
  health/                /healthz + /readyz
internal/features/       one package per domain feature — each owns its slice:
  <feature>/
    handler.go           HTTP only: parse → call service → map domain → wire DTO.
                         Version-specific DTOs/handlers live here and ONLY here.
    service.go           business rules + deadlines; no HTTP, no SQL; version-neutral
    repository.go        raw SQL as named constants + explicit row → domain mapping;
                         wire shapes never escape this file
    register.go          Register(...) mounts the feature's routes on version groups
```

Dependency direction: handler → service → repository. `platform/` is consumed by all
three; nothing imports a feature except `main.go`.

## Add an endpoint (the walkthrough)

1. **Place it**: confirm it belongs on the hot path
   ([path-assignment](../../docs/api/path-assignment.md)) — the owning feature's
   plan.md records the decision.
2. **Create the feature package** `internal/features/<feature>/` with the four files
   above (copy `platformstatus/` as the reference — it exists to be copied).
3. **Repository**: SQL as named `const` strings; scan with
   `pgx.CollectRows/CollectOneRow` + `RowToStructByName`; accept `db.DBTX`, not the
   pool, so services can own transactions (`pgx.BeginTxFunc`).
4. **Service**: take the repository as a small interface you define; add the context
   deadline; return domain models.
5. **Handler**: define wire DTOs here; map explicitly; failures go through
   `httpx.WriteProblem`/helpers ONLY (the [error contract](../../docs/api/error-envelope.md)).
6. **Register**: `Register(v1 …)` — every product route lives under a version group
   ([versioning policy](../../docs/api/versioning-policy.md)). Protected routes take
   their pool's middleware: `v1.Group("/customer", auth.Middleware(customerVerifier))`,
   plus `auth.RequireGroups(...)` where RBAC applies. Public routes are explicitly
   public — say so in a comment.
7. **Wire it** in `main.go` `registerFeatures()` — one greppable line.
8. **Tests** (all three tiers, table-driven):
   - service: hand-rolled fake repo (no gomock),
   - handler: `httptest` against the real engine — status, problem shape, auth matrix,
   - repository: testcontainers PostgreSQL 16, gated behind `-short`.

## Conventions that are contracts

- **Errors**: RFC 9457 problem+json, always, via `httpx` — the vocabulary mirrors
  [docs/api/error-envelope.md](../../docs/api/error-envelope.md). Auth failures are
  byte-identical 401s (no oracle). Internals never reach a body.
- **Versioning**: `/v1` prefix on every product route; breaking change → the route
  appears under `/v2` while v1 keeps serving; unchanged endpoints register the same
  handler in both groups. Health + `/metrics` stay unversioned.
- **Logging**: exactly one JSON record per handled request, carrying `request_id`;
  never log tokens, bodies, DSNs, or PII beyond the auth subject id. Use
  `logger.FromContext(ctx)` inside handlers/services.
- **Metrics**: the RED middleware labels by route *template* — never add a label that
  can carry user data or unbounded values (constitution Principle VII).
- **Config**: everything from env at startup; new required values get
  `required,notEmpty` tags; secrets enter as process env composed at invocation
  (`make core-run`) and are never written to disk
  ([config contract](../../../specs/004-backend-bootstrap/contracts/config.contract.md)).
- **Auth**: one verifier per pool, built in `main.go`, fail-closed at startup. Adding
  an audience = new `config.Auth` field (required tags) + verifier + scoped group.
  Never merge pools into one verifier. The AWS Cognito SDK client is wired in
  `main.go` for future admin-provisioning slices; JWT validation never calls it.

## Local development

```bash
make core-run            # repo root: composes DB_DSN + pool ids from the platform
                         # contract at invocation → docker compose up (air live-reload)
make core-test           # unit + handler tests (-short)
make core-test FULL=1    # + container-backed repository tests (needs Docker)
make core-lint           # gofmt + go vet
make core-build          # the production distroless image
go run ./cmd/core-api    # host-side, if you export the env yourself
```

Prerequisites: Docker; the `ef` AWS profile; your IP on the dev DB allowlist (002);
003's first `db-up` applied (the proving read consumes the migration ledger).
Verification runbook: [specs/004-backend-bootstrap/quickstart.md](../../specs/004-backend-bootstrap/quickstart.md).

## Surface (this slice)

| Route | Auth | Purpose |
|---|---|---|
| `GET /healthz` / `GET /readyz` | public | liveness / readiness (DB ping) |
| `GET /metrics` | public (dev) | Prometheus RED + pool stats |
| `GET /v1/platform/status` | public | proving read (flat v1 shape) |
| `GET /v2/platform/status` | public | version-coexistence demo (reshaped) |
| `GET /v1/customer/ping` | customer pool | identity-enforcement proof |

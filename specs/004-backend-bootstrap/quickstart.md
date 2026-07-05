# Quickstart — validating 004-backend-bootstrap end to end

Runnable proof that the implementation meets the spec's acceptance criteria. Commands
assume repo root, the `ef` AWS profile, and 🧑‍💻 marks **operator-run** steps (mode of
work). Contracts referenced, not duplicated: [contracts/](./contracts/) ·
[data-model.md](./data-model.md).

## Prerequisites (once)

1. **Platform state**: 001 applied (four pools); 002 applied **and your IP on the
   allowlist** (`db_allowed_cidrs` — the still-pending 002 operator step); 003's first
   `db-up` applied (the proving read consumes the migration ledger). `make db-status
   ENV=dev` succeeding proves all three at once.
2. **Tools**: Docker Desktop (compose v2), Go 1.25.x, pnpm ≥ 9 + Node 22 locally,
   AWS CLI with the `ef` profile. (air optional — compose runs it inside the container.)
3. A test user in the **customer** pool and one in the **back-office** pool (with a
   group, e.g. `admin`) — 001's quickstart documents user creation + EMAIL_OTP sign-in;
   capture each pool's **access token** (not the ID token):
   `aws cognito-idp initiate-auth --auth-flow USER_AUTH ... PREFERRED_CHALLENGE=EMAIL_OTP`
   → answer the emailed code → `AuthenticationResult.AccessToken`. Export as
   `CUSTOMER_TOKEN` / `ADMIN_TOKEN`.

## US1 — core-api runs locally, end to end (spec P1)

```bash
make core-run                # composes DB_DSN via infra/scripts/db-dsn.sh at invocation,
                             # fetches customer pool ids from SSM, then docker compose up
```

| Check | Command | Expected |
|---|---|---|
| Liveness | `curl -s localhost:8080/healthz` | `200 {"status":"ok"}` |
| Readiness incl. DB | `curl -s localhost:8080/readyz` | `200 … "database":"ok"` |
| Proving read (3 layers → DB) | `curl -s localhost:8080/v1/platform/status` | `200`, real `migration_version` matching `make db-status ENV=dev` |
| One log per request | container logs | one JSON line per curl, `request_id` present, no secrets |
| Metrics | `curl -s localhost:8080/metrics \| grep http_request` | RED series labeled with route templates |
| Latency (SC-007) | repeat the proving curl with `-w '%{time_total}'` | < 0.1s typical |
| Fail-fast config | `docker compose run -e AUTH_CUSTOMER_POOL_ID= core-api` | exits non-zero naming the variable |

Structure review: `services/core-api` matches the plan tree (features/platform split,
SQL constants in repositories, wiring only in `cmd/`).

## US2 — edge-api deployed to dev (spec P2) 🧑‍💻

```bash
make edge-install            # pnpm install (workspace)
make edge-test               # vitest green first
make edge-deploy ENV=dev     # 🧑‍💻 wraps: sls deploy --stage dev (AWS_PROFILE=ef); prints the base URL
```

| Check | Command | Expected |
|---|---|---|
| Health from the internet | `curl -s $EDGE_URL/healthz` | `200 … "database":"ok"` (first call may be cold-slow — accepted) |
| Proving read | `curl -s $EDGE_URL/v1/platform/status` | same shape as core-api v1, real ledger data |
| Logs in CloudWatch | function log group | one pino JSON line per invocation, `awsRequestId` + `requestId` |
| Alarms exist | CloudWatch console/CLI | Errors / Throttles / Duration p95 / 5xx alarms from the stack |
| Repeatability | re-run `make edge-deploy ENV=dev` after a trivial change | clean update, no console work |

## US3 — identity matrix (spec P3)

| Call | Token | Expected |
|---|---|---|
| `core /v1/customer/ping` | `CUSTOMER_TOKEN` | `200` `{"audience":"customer","subject":…}` |
| `core /v1/customer/ping` | `ADMIN_TOKEN` (back-office) | **`401`** problem+json `unauthenticated` |
| `core /v1/customer/ping` | none / garbage / expired | `401` — **byte-identical** `type`/`title` to the row above (no oracle) |
| `edge /v1/back-office/ping` | `ADMIN_TOKEN` | `200` incl. parsed `groups` array |
| `edge /v1/back-office/ping` | `CUSTOMER_TOKEN` | `401` (gateway authorizer — before any Lambda runs) |
| `edge /v1/back-office/ping` | back-office user with no groups | `403` problem+json `forbidden` |
| Health, both services | none | `200` (explicitly public) |

## US4 — versioning (spec P4)

| Check | Command | Expected |
|---|---|---|
| Every route versioned (SC-009) | inspect route registration / serverless.yml | only `/healthz`,`/readyz`,`/metrics` outside `/vN` |
| Side-by-side versions (SC-010) | `curl …/v1/platform/status & curl …/v2/platform/status` (both services, concurrently) | v1 flat shape; v2 `contract_version:2` nested shape — simultaneously |
| Never-existed version | `curl -i …/v3/platform/status` | core: `404` problem+json `no-route`; edge: gateway 404 (recorded contract note) |
| Policy walkthrough | read `docs/api/versioning-policy.md` with a hypothetical breaking change | unambiguous outcome per rule 8 |

## US5 — conventions (spec P5)

1. A newcomer, using only `services/*/README.md`, adds a practice endpoint in the
   correct layer files on the first attempt (spec SC-008) — do this once per service as
   a review exercise, then revert.
2. Classify three hypothetical endpoints (e.g. product search / profile update / refund
   review queue) with `docs/api/path-assignment.md` → exactly one home each.
3. Confirm every failure response seen above matches
   [error-envelope.contract.md](./contracts/error-envelope.contract.md) (SC-005).

## Secret hygiene sweep (SC-006)

```bash
git grep -iE 'password|secret[^_a-z]|BEGIN (RSA|EC)' -- services/ Makefile   # names/pointers only
docker compose config | grep -i dsn                                          # env passthrough, no values in files
aws cloudformation get-template --stack-name effy-edge-api-dev | grep -ic password  # 0
```

Logs (both services) contain no DSN, token, or email — spot-check the log lines
captured during US1–US3.

## Done when

Spec success criteria SC-001…SC-010 all demonstrably hold; the operator has ratified
the **Node 22 constitution PATCH** (plan Complexity Tracking); implementation artifacts
committed with spec/plan/tasks per Quality Gates.

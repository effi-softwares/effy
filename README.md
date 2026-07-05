# Effy — Operations & Testing Runbook

Every command you need to provision, migrate, run, deploy, and **verify** the platform.
All commands run from the **repo root** with the **`ef` AWS profile** configured
(targets wrap it automatically). 🧑‍💻 = mutates live AWS — always operator-run,
always with interactive confirmation.

What the platform *is*: [CLAUDE.md](CLAUDE.md) · how code is organized:
[ARCHITECTURE.md](ARCHITECTURE.md) · per-service guides:
[services/core-api](services/core-api/README.md) ·
[services/edge-api](services/edge-api/README.md) · API contracts:
[docs/api/](docs/api/).

**Tools**: Terraform, AWS CLI, goose (`brew install goose`), Docker Desktop,
Go 1.25+, Node 22 + pnpm.

---

## 1. Terraform (infrastructure)

```bash
make help                    # list every target
make bootstrap-init          # one-time: init the local-state bootstrap root
make bootstrap-apply         # 🧑‍💻 one-time: create the S3 state bucket + lock

make init ENV=dev            # init an env root (S3 backend)
make plan ENV=dev            # preview — never mutates
make apply ENV=dev           # 🧑‍💻 apply (preflight-checks the AWS account first)
make output ENV=dev          # show the env's outputs (pool ids, DB endpoint, edge SG…)
make destroy ENV=dev         # 🧑‍💻 tear down an env

make fmt                     # terraform fmt across infra/
make validate ENV=dev        # validate one root (no backend needed)
make lint                    # fmt-check + validate all roots + tflint + trivy/checkov
```

Common reasons to re-apply dev:
- **Your IP changed** → edit `db_allowed_cidrs` in `infra/envs/dev/dev.tfvars`, then
  `make apply ENV=dev` (the DB allowlists only you).
- Anything under `infra/envs/dev/*.tf` changed (e.g. `edge-network.tf` — the edge-api
  VPC plumbing: Lambda SG, DB SG-to-SG ingress, Secrets Manager endpoint).

## 2. Database migrations (goose, forward-only)

DSN is composed at invocation from SSM + Secrets Manager — never on disk, never echoed.

```bash
make db-new name=snake_case_title   # scaffold a timestamped SQL migration in db/migrations/
make db-status ENV=dev              # applied vs pending (also proves allowlist + contract)
make db-up ENV=dev                  # 🧑‍💻 apply pending (blocked if migrations uncommitted; FORCE=1 for private iteration)
make db-down ENV=dev                # 🧑‍💻 step back ONE — dev-only convenience; shipped mistakes = new forward migration
```

Authoring rules: [db/README.md](db/README.md).

## 3. core-api (Go hot path — local Docker)

```bash
make core-run                # compose DSN + customer pool ids at invocation → docker compose up (air live-reload)
make core-test               # unit + handler tests (-short)
make core-test FULL=1        # + repository tests against real Postgres (testcontainers; needs Docker)
make core-lint               # gofmt + go vet
make core-build              # production distroless image (effy/core-api:local)
```

Verify (second terminal — all should answer instantly):

```bash
curl -s localhost:8080/healthz                 # {"status":"ok"}
curl -s localhost:8080/readyz                  # {"status":"ready","checks":{"database":"ok"}}
curl -s localhost:8080/v1/platform/status      # flat v1: environment, database_*, migration_version
curl -s localhost:8080/v2/platform/status      # reshaped v2: contract_version:2, nested database{}
curl -si localhost:8080/v3/platform/status     # 404 application/problem+json, type …/no-route
curl -s localhost:8080/metrics | grep http_request_duration   # RED metrics by route template
curl -so /dev/null -w '%{time_total}\n' localhost:8080/v1/platform/status   # < 0.1s (SC-007)
```

Every request = one JSON log line in the compose output with a `request_id` matching
the `X-Request-ID` response header.

## 4. edge-api (serverless cold path — deployed to dev)

```bash
make edge-install            # pnpm install (workspace)
make edge-test               # tsc --noEmit + vitest
make edge-offline            # local serverless-offline (resolves SSM → needs ef profile)
make edge-deploy ENV=dev     # 🧑‍💻 deploy to Lambda + API Gateway
                             # NOTE: exactly ONE "Invalid configuration" warning about
                             # nodejs22.x is expected (frozen serverless v3 schema)
```

Get the live base URL any time:

```bash
cd services/edge-api && AWS_PROFILE=ef pnpm exec serverless info --stage dev
export EDGE_URL=https://9r8i2n1txk.execute-api.ap-southeast-1.amazonaws.com   # current dev URL
```

Verify (first call after idle may be cold-slow — that's the accepted cold-path trade):

```bash
curl -s $EDGE_URL/healthz                  # {"status":"ready","checks":{"database":"ok"}}
curl -s $EDGE_URL/v1/platform/status       # same flat v1 shape as core-api
curl -s $EDGE_URL/v2/platform/status       # contract_version: 2
curl -si $EDGE_URL/v3/platform/status      # 404 (gateway body — unmatched routes never invoke a Lambda)
curl -si $EDGE_URL/v1/back-office/ping     # 401 {"message":"Unauthorized"} without a token (gateway authorizer)
```

Logs & alarms:

```bash
AWS_PROFILE=ef aws logs tail /aws/lambda/effy-edge-api-dev-health --since 15m --region ap-southeast-1
AWS_PROFILE=ef aws cloudwatch describe-alarms --alarm-name-prefix effy-edge-api-dev --region ap-southeast-1 \
  --query 'MetricAlarms[].{name:AlarmName,state:StateValue}' --output table
```

## 5. Auth tokens & the identity matrix

Pool ids come from the SSM contract; users are admin-provisioned (except customer
self-signup later):

```bash
CPOOL=$(AWS_PROFILE=ef aws ssm get-parameter --name /effy/dev/auth/customer/user_pool_id    --region ap-southeast-1 --query Parameter.Value --output text)
BPOOL=$(AWS_PROFILE=ef aws ssm get-parameter --name /effy/dev/auth/back-office/user_pool_id --region ap-southeast-1 --query Parameter.Value --output text)
CCLIENT=$(AWS_PROFILE=ef aws ssm get-parameter --name /effy/dev/auth/customer/app_client_id    --region ap-southeast-1 --query Parameter.Value --output text)
BCLIENT=$(AWS_PROFILE=ef aws ssm get-parameter --name /effy/dev/auth/back-office/app_client_id --region ap-southeast-1 --query Parameter.Value --output text)

# One-time test users (email must be real — the OTP is emailed):
AWS_PROFILE=ef aws cognito-idp admin-create-user --user-pool-id $CPOOL --username you+cust@example.com \
  --user-attributes Name=email,Value=you+cust@example.com Name=email_verified,Value=true --region ap-southeast-1
AWS_PROFILE=ef aws cognito-idp admin-create-user --user-pool-id $BPOOL --username you+admin@example.com \
  --user-attributes Name=email,Value=you+admin@example.com Name=email_verified,Value=true --region ap-southeast-1
AWS_PROFILE=ef aws cognito-idp admin-add-user-to-group --user-pool-id $BPOOL --username you+admin@example.com \
  --group-name admin --region ap-southeast-1
```

Passwordless EMAIL_OTP sign-in (per pool — repeat with `$BCLIENT` for back-office):

```bash
AWS_PROFILE=ef aws cognito-idp initiate-auth --client-id $CCLIENT --auth-flow USER_AUTH \
  --auth-parameters USERNAME=you+cust@example.com,PREFERRED_CHALLENGE=EMAIL_OTP --region ap-southeast-1
# => note the Session value; check your email for the code, then:
AWS_PROFILE=ef aws cognito-idp respond-to-auth-challenge --client-id $CCLIENT \
  --challenge-name EMAIL_OTP --session '<session>' \
  --challenge-responses USERNAME=you+cust@example.com,EMAIL_OTP_CODE=<code> --region ap-southeast-1
# => AuthenticationResult.AccessToken  (use the ACCESS token, not the ID token)

export CUSTOMER_TOKEN=<customer AccessToken>
export ADMIN_TOKEN=<back-office AccessToken>
```

The matrix — cross-pool tokens MUST die (constitution Principle IV):

| Command | Expect |
|---|---|
| `curl -s -H "Authorization: Bearer $CUSTOMER_TOKEN" localhost:8080/v1/customer/ping` | `200` `{"audience":"customer","subject":…,"message":"pong"}` |
| same with `$ADMIN_TOKEN` | `401` problem+json `unauthenticated` |
| same with `Bearer garbage` | `401` — body identical to the row above (no oracle) |
| `curl -s -H "Authorization: Bearer $ADMIN_TOKEN" $EDGE_URL/v1/back-office/ping` | `200` incl. `"groups":["admin"]` |
| same with `$CUSTOMER_TOKEN` | `401` (rejected at the gateway, before any Lambda) |
| back-office user with **no** groups | `403` problem+json `forbidden` |
| both health endpoints, no token | `200/503` — health is deliberately public |

Access tokens expire after 1h — re-run the OTP flow for fresh ones.

## 6. Versioning spot-checks

```bash
# v1 and v2 serve simultaneously with different shapes (mixed mobile fleet guarantee):
curl -s localhost:8080/v1/platform/status & curl -s localhost:8080/v2/platform/status &
curl -s $EDGE_URL/v1/platform/status     & curl -s $EDGE_URL/v2/platform/status     & wait
```

Policy (what's breaking vs additive, deprecation/sunset, 410 for retired versions):
[docs/api/versioning-policy.md](docs/api/versioning-policy.md). Which backend a new
endpoint belongs to: [docs/api/path-assignment.md](docs/api/path-assignment.md).

## 7. Secret-hygiene sweep

```bash
git grep -iE 'password|secret[^_a-z]' -- services/ Makefile        # names/pointers only, never values
find services -name ".env*"                                        # only .env.example
AWS_PROFILE=ef aws cloudformation get-template --stack-name effy-edge-api-dev \
  --region ap-southeast-1 | grep -ci password                      # 0 — the secret never enters the template
```

## 8. Where everything is specified

| Slice | Docs |
|---|---|
| 001 four Cognito pools + state backbone | `specs/001-infra-foundation/` |
| 002 dev database (cost floor, `/effy/dev/db/*` contract) | `specs/002-dev-database/` |
| 003 goose migration workflow | `specs/003-db-migrations/` + `db/README.md` |
| 004 backend bootstrap (core-api + edge-api, versioning, auth) | `specs/004-backend-bootstrap/` (full verification runbook: `quickstart.md`) |

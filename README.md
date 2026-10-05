# Effy — Operations & Testing Runbook

Every command you need to provision, migrate, run, deploy, and **verify** the platform.
All commands run from the **repo root** with the **`ef` AWS profile** configured
(targets wrap it automatically). 🧑‍💻 = mutates live AWS — always operator-run,
always with interactive confirmation.

What the platform *is*: [CLAUDE.md](CLAUDE.md) · how code is organized:
[ARCHITECTURE.md](ARCHITECTURE.md) · per-service guides:
each service under [apis/edge-api/](apis/edge-api/) (operator tools:
[apis/edge-api/ops](apis/edge-api/ops/README.md)) · API contracts:
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

### Stopping the dev DB when you're not working (cost control)

The DB instance is the one big always-on dev cost (the bulk of the ≈US$22/mo).
Everything else is pay-per-use ≈ $0 idle, except the Secrets Manager interface
endpoint (~US$9/mo), deliberately left always-on for now.

```bash
make dev-status              # is the DB billing right now?
make dev-stop                # 🧑‍💻 stop the DB instance (compute stops billing)
make dev-start               # 🧑‍💻 start it again; waits until usable (usually 3-8 min)
```

Notes:
- **AWS auto-restarts a stopped RDS instance after 7 days** — if you're away longer,
  check `dev-status` and re-run `dev-stop`. DB storage (~US$2.5/mo) bills even while stopped.
- While stopped, `db-*` targets and the deployed backend's DB-backed
  endpoints fail by design; health endpoints and everything non-DB keep working.

## 2. Database migrations (goose, forward-only)

DSN is composed at invocation from SSM + Secrets Manager — never on disk, never echoed.

```bash
make db-new name=snake_case_title   # scaffold a timestamped SQL migration in db/migrations/
make db-status ENV=dev              # applied vs pending (also proves allowlist + contract)
make db-up ENV=dev                  # 🧑‍💻 apply pending (blocked if migrations uncommitted; FORCE=1 for private iteration)
make db-down ENV=dev                # 🧑‍💻 step back ONE — dev-only convenience; shipped mistakes = new forward migration
```

Authoring rules: [db/README.md](db/README.md).

## 3. The backend — `apis/edge-api` (serverless, deployed to dev)

```bash
make edge-install                          # pnpm install (workspace)
make edge-test                             # tsc --noEmit + vitest, every service
CONTAINER_TESTS=1 make edge-test           # + the real-PostgreSQL suites (needs Docker)
make edge-offline SERVICE=commerce         # ONE service locally (resolves SSM → needs ef profile)
make edge-deploy SERVICE=commerce ENV=dev  # 🧑‍💻 deploy ONE service to Lambda + the shared gateway
                                           # NOTE: exactly ONE "Invalid configuration" warning about
                                           # nodejs22.x is expected (frozen serverless v3 schema)
```

One service per audience and domain — `storefront`, `commerce`, `customer`, `shop`, `inventory`,
`driver`, `admin`, `catalog`, `fleet`, `orders`, plus the `notifications` and `auth` workers. Which
service a route belongs to: [docs/api/path-assignment.md](docs/api/path-assignment.md). Paths are
`/<service>/v<major>/…`.

Get the live base URL any time:

```bash
cd apis/edge-api/commerce && AWS_PROFILE=ef pnpm exec serverless info --stage dev
# The gateway host is a contract value — read it, never hardcode it (A3).
# Since 010 this yields the platform-owned address (https://api.dev.effyshopping.com), not the
# provider-generated execute-api hostname — the key is unchanged, only its value improved.
export EDGE_URL=$(AWS_PROFILE=ef aws ssm get-parameter --name /effy/dev/edge/api_endpoint \
  --region ap-southeast-2 --query Parameter.Value --output text)

# The raw execute-api URL is still live and published as the break-glass fallback (010 FR-011):
export EDGE_RAW_URL=$(AWS_PROFILE=ef aws ssm get-parameter --name /effy/dev/edge/api_default_endpoint \
  --region ap-southeast-2 --query Parameter.Value --output text)
```

Verify (the first call after idle is slower — a cold start):

```bash
curl -s $EDGE_URL/storefront/healthz           # {"status":"ok"} — every service has /<service>/healthz and /readyz
curl -s $EDGE_URL/commerce/readyz              # {"status":"ready","checks":{"database":"ok"}}
curl -s $EDGE_URL/shop/v1/status               # flat v1: environment, database_*, migration_version
curl -s $EDGE_URL/shop/v2/status               # contract_version: 2
curl -s "$EDGE_URL/storefront/v1/products?q=milk" | head -c 300
curl -si $EDGE_URL/commerce/v1/cart            # 401 {"message":"Unauthorized"} without a token (gateway authorizer)
```

Logs & alarms:

```bash
AWS_PROFILE=ef aws logs tail /aws/lambda/effy-edge-commerce-dev-readyz --since 15m --region ap-southeast-2
AWS_PROFILE=ef aws cloudwatch describe-alarms --alarm-name-prefix effy-dev --region ap-southeast-2 \
  --query 'MetricAlarms[].{name:AlarmName,state:StateValue}' --output table
```

## 4. Auth tokens & the identity matrix

Pool ids come from the SSM contract; users are admin-provisioned (except customer
self-signup later):

```bash
CPOOL=$(AWS_PROFILE=ef aws ssm get-parameter --name /effy/dev/auth/customer/user_pool_id    --region ap-southeast-2 --query Parameter.Value --output text)
BPOOL=$(AWS_PROFILE=ef aws ssm get-parameter --name /effy/dev/auth/back-office/user_pool_id --region ap-southeast-2 --query Parameter.Value --output text)
CCLIENT=$(AWS_PROFILE=ef aws ssm get-parameter --name /effy/dev/auth/customer/app_client_id    --region ap-southeast-2 --query Parameter.Value --output text)
BCLIENT=$(AWS_PROFILE=ef aws ssm get-parameter --name /effy/dev/auth/back-office/app_client_id --region ap-southeast-2 --query Parameter.Value --output text)

# One-time test users (email must be real — the OTP is emailed):
AWS_PROFILE=ef aws cognito-idp admin-create-user --user-pool-id $CPOOL --username you+cust@example.com \
  --user-attributes Name=email,Value=you+cust@example.com Name=email_verified,Value=true --region ap-southeast-2
AWS_PROFILE=ef aws cognito-idp admin-create-user --user-pool-id $BPOOL --username you+admin@example.com \
  --user-attributes Name=email,Value=you+admin@example.com Name=email_verified,Value=true --region ap-southeast-2
AWS_PROFILE=ef aws cognito-idp admin-add-user-to-group --user-pool-id $BPOOL --username you+admin@example.com \
  --group-name admin --region ap-southeast-2
```

Passwordless EMAIL_OTP sign-in (per pool — repeat with `$BCLIENT` for back-office):

```bash
AWS_PROFILE=ef aws cognito-idp initiate-auth --client-id $CCLIENT --auth-flow USER_AUTH \
  --auth-parameters USERNAME=you+cust@example.com,PREFERRED_CHALLENGE=EMAIL_OTP --region ap-southeast-2
# => note the Session value; check your email for the code, then:
AWS_PROFILE=ef aws cognito-idp respond-to-auth-challenge --client-id $CCLIENT \
  --challenge-name EMAIL_OTP --session '<session>' \
  --challenge-responses USERNAME=you+cust@example.com,EMAIL_OTP_CODE=<code> --region ap-southeast-2
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

## 5. Versioning spot-checks

```bash
# v1 and v2 serve simultaneously with different shapes (mixed mobile fleet guarantee):
curl -s localhost:8080/v1/platform/status & curl -s localhost:8080/v2/platform/status &
curl -s $EDGE_URL/v1/platform/status     & curl -s $EDGE_URL/v2/platform/status     & wait
```

Policy (what's breaking vs additive, deprecation/sunset, 410 for retired versions):
[docs/api/versioning-policy.md](docs/api/versioning-policy.md). Which backend a new
endpoint belongs to: [docs/api/path-assignment.md](docs/api/path-assignment.md).

## 6. Secret-hygiene sweep

```bash
git grep -iE 'password|secret[^_a-z]' -- services/ Makefile        # names/pointers only, never values
find services -name ".env*"                                        # only .env.example
AWS_PROFILE=ef aws cloudformation get-template --stack-name effy-edge-api-dev \
  --region ap-southeast-2 | grep -ci password                      # 0 — the secret never enters the template
```

## 7. Where everything is specified

| Slice | Docs |
|---|---|
| 001 four Cognito pools + state backbone | `specs/001-infra-foundation/` |
| 002 dev database (cost floor, `/effy/dev/db/*` contract) | `specs/002-dev-database/` |
| 003 goose migration workflow | `specs/003-db-migrations/` + `db/README.md` |
| 004 backend bootstrap (versioning, auth; written for two backends) | `specs/004-backend-bootstrap/` (full verification runbook: `quickstart.md`) |
| 070 one backend (the Go service retired) | `specs/070-retire-core-api/` (status and operator steps: `SIGNOFF.md`) |
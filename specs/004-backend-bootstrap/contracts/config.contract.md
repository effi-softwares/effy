# Contract: Configuration (what each service consumes from the platform)

**Upstream contracts consumed** (established by 001/002), plus — **amended at first
deploy** (plan amendment A1) — two keys this slice WRITES for edge-api's
default-VPC placement, plus — **amendment A3 (cold-path decomposition)** — the shared-gateway keys:

| New key (written by 004's `infra/envs/dev/edge-network.tf`) | Type | Consumed by |
|---|---|---|
| `/effy/<env>/edge/security_group_id` | String | each service `serverless.yml` `provider.vpc` |
| `/effy/<env>/edge/subnet_ids` | StringList | each service `serverless.yml` `provider.vpc` |

| New key (A3 — written by `infra/envs/dev/edge-gateway.tf`) | Type | Consumed by |
|---|---|---|
| `/effy/<env>/edge/http_api_id` | String | each service `provider.httpApi.id` (attach to shared API) |
| `/effy/<env>/edge/api_endpoint` | String | 005 console `VITE_API_BASE_URL`; smoke tests |
| `/effy/<env>/edge/authorizer/{customer,driver,shop,back-office}_id` | String | routes' `authorizer.id` (external JWT authorizer per pool) |

See [shared-gateway.contract.md](./shared-gateway.contract.md). Renaming any `/effy/<env>/edge/*`
key is a breaking change to this contract. The pre-A3 per-service `provider.httpApi.{authorizers,cors}`
are **removed** — CORS + the 4 authorizers now live in Terraform (the API's owner).

| Key | Written by | Consumed by |
|---|---|---|
| `/effy/<env>/region` | 001 | (reference) |
| `/effy/<env>/db/endpoint` · `/port` · `/name` · `/master_username` | 002 | both services |
| `/effy/<env>/db/master_secret_arn` | 002 | both (pointer only — value stays in Secrets Manager) |
| `/effy/<env>/auth/<audience>/user_pool_id` · `/app_client_id` | 001 | both (audiences: `customer`, `driver`, `shop`, `back-office` — hyphenated path form) |

Issuer URL is **derived**, never stored: `https://cognito-idp.<region>.amazonaws.com/<user_pool_id>`.

## core-api (runtime env; local Docker this slice)

- `make core-run` composes `DB_DSN` at invocation via `infra/scripts/db-dsn.sh dev`
  (libpq keyword form, `sslmode=require`) and injects it as **process env into the
  compose run** — the 003 discipline verbatim: never written to a file, never echoed.
- Pool/client ids are fetched by the same make target from
  `/effy/dev/auth/customer/{user_pool_id,app_client_id}` into
  `AUTH_CUSTOMER_POOL_ID`/`AUTH_CUSTOMER_CLIENT_ID` env vars (non-secret; still not
  committed — `.env.example` documents names only).
- Full variable table: [data-model.md §5](../data-model.md). Missing required var ⇒
  startup error naming the variable (fail-fast; a pool with routes but no config ⇒
  refuse to start).

## edge-api (deploy-time resolution + runtime secret fetch)

- `serverless.yml` resolves **non-secrets** at deploy: `${ssm:/effy/${sls:stage}/db/endpoint}`
  etc. → Lambda env; `${ssm:/effy/${sls:stage}/auth/<audience>/user_pool_id}` → the four
  JWT authorizers' `issuerUrl`/`audience`.
- The **DB password never enters the template**: only `DB_SECRET_ARN` is env; functions
  fetch the secret at runtime through the AWS Parameters and Secrets Lambda Extension
  (arm64 layer, `localhost:2773`, TTL cache), memoized beside the `pg.Pool`; on
  `28P01`/auth failure → drop memo + pool, refetch once, reconnect (rotation-safe).
- Deploying therefore requires the SSM contract to be readable under the operator's
  `ef` profile — the same precondition as every `make db-*` target.

## Secret-hygiene invariants (both services — spec FR-007/SC-006)

1. No secret value in: the repository, any Dockerfile/compose file, any CloudFormation
   template, any env listing in logs, any command output, any error body.
2. `.env` files: local-dev convenience only, gitignored, documented by `.env.example`
   with names and placeholders only.
3. The only secret material at rest anywhere is inside Secrets Manager (002's design).

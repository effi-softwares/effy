# Contract — Shared edge API Gateway (Terraform-owned; A3)

**Feature**: 004 (amendment A3 — cold-path decomposition) · **Owner**: Terraform
(`infra/envs/dev/edge-gateway.tf`) · **Consumers**: every `apis/edge-api/<service>/serverless.yml`.

The cost-optimized path is many independently deployable services behind **one** HTTP API. The
API + the four per-pool JWT authorizers are created **once** in Terraform (the layer that owns
Cognito/VPC/RDS) and referenced by id from each service (research F3, option a).

## What Terraform creates + exports to SSM

| SSM key (written by `edge-gateway.tf`) | Type | What | Consumed by |
|---|---|---|---|
| `/effy/<env>/edge/http_api_id` | String | the shared `aws_apigatewayv2_api` (HTTP) id | each service `provider.httpApi.id` |
| `/effy/<env>/edge/api_endpoint` | String | the API invoke URL (host) | 005 console `VITE_API_BASE_URL`; smoke tests |
| `/effy/<env>/edge/authorizer/customer_id` | String | JWT authorizer (customer pool) | routes: `authorizer.id` |
| `/effy/<env>/edge/authorizer/driver_id` | String | JWT authorizer (driver pool) | routes: `authorizer.id` |
| `/effy/<env>/edge/authorizer/shop_id` | String | JWT authorizer (shop pool) | routes: `authorizer.id` |
| `/effy/<env>/edge/authorizer/back-office_id` | String | JWT authorizer (back-office/admin pool) | routes: `authorizer.id` |

- Each `aws_apigatewayv2_authorizer` is `type = JWT`, `identity_sources =
  ["$request.header.Authorization"]`, `jwt_configuration { issuer =
  "https://cognito-idp.<region>.amazonaws.com/<pool_id>", audience = [<app_client_id>] }` — one per
  pool, reading the existing 001 pool ids. **Exactly one authorizer per pool** (Principle IV) — a
  cross-pool token is structurally rejected before any handler runs.
- The API's **CORS** (approved dev origins incl. `http://localhost:5173` and `http://localhost:3000`)
  and the **API-level 5xx CloudWatch alarm** live here too (they cannot live in a service that
  attaches to an external API — research F1).
- `$default` auto-deploy stage; owned by Terraform. Services never create/manage the stage.

## What each service `serverless.yml` does (attach-only)

```yaml
provider:
  httpApi:
    id: ${ssm:/effy/${sls:stage}/edge/http_api_id}   # external → no API/stage/CORS/authorizers here
functions:
  someRoute:
    events:
      - httpApi:
          method: GET
          path: /admin/v1/me                          # /<service>/v1/... (research F4)
          authorizer:
            type: jwt
            id: ${ssm:/effy/${sls:stage}/edge/authorizer/back-office_id}
```
- **Drops** (vs the pre-A3 single service): `provider.httpApi.authorizers`, `provider.httpApi.cors`,
  the `!Ref HttpApi` 5xx alarm. **Keeps**: runtime/arch, `provider.vpc`, IAM, DB env, secret fetch,
  per-function alarms.
- Route keys must be unique across the whole API → disjoint `/<service>/` prefixes guarantee it.

## Invariants
- **Ordering**: `terraform apply` (API + authorizers + SSM) MUST precede any service deploy
  (`${ssm:…}` resolves at deploy time). Then services deploy independently, any order.
- **Deploy independence**: a service deploy/`remove` only touches its own routes on the shared API
  (its own CFN stack). Authorizer/API **shape** changes are a coordinated Terraform change, not a
  per-service deploy (the SSM id stays stable → no service redeploy unless the id changes).
- **Smoke-test (research F2)**: verify a bare SSM-string `authorizer.id` deploys on SLS 3.40.0 on
  one route before the full cutover; fallback `Fn::Sub`/resolved var.

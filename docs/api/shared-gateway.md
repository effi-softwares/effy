# Contract — The gateways (Terraform-owned)

**Features**: 004 (A3 — one HTTP API, services attach by id) · **075** (a second one, for back-office)
**Owner**: Terraform (`infra/envs/<env>/edge-gateway.tf`, `staff-gateway.tf`)
**Consumers**: every `apis/edge-api/<service>/serverless*.yml`.

There is **one backend** and **two HTTP gateways** in front of it (constitution v3.2.0, Principle III):

| | Shared gateway | Staff gateway |
|---|---|---|
| Used by | customer, shop, driver, public | back-office only |
| Address | `https://<api_subdomain>.<env zone>` — `edge-api.dev.effyshopping.com` | `https://<staff_api_subdomain>.<env zone>` — `staff-api.dev.effyshopping.com` |
| Authorizers | customer, shop, driver | **back-office only** |
| Allowed browser origins | shop console, storefront, their localhost ports | back-office console, `http://localhost:5173` |
| Stacks | `storefront` `commerce` `customer` `shop` `inventory` `driver` `notifications` | `admin` `fleet` `orders` `catalog` `inventory-staff` |
| SSM prefix | `/effy/<env>/edge/` | `/effy/<env>/staff/` |
| 5xx alarm | `effy-<env>-edge-api-5xx` | `effy-<env>-staff-api-5xx` |

Which gateway and which service a new route belongs to: [path-assignment.md](./path-assignment.md).

> **Why two.** An HTTP API holds at most **300 routes** and **300 integrations**. The route limit can
> be raised by a quota request; the integration limit cannot, and this platform creates one
> integration per function. On 2026-10-08 the shared gateway held 300 of each and a deployment was
> refused. Back-office was 142 of them. A **third** gateway needs a constitution amendment.

## What Terraform creates and publishes

| Parameter | What | Read by |
|---|---|---|
| `/effy/<env>/edge/http_api_id` | the shared HTTP API's id | `provider.httpApi.id` of every shared-gateway stack; the usage check |
| `/effy/<env>/edge/api_endpoint` | the shared gateway's address | shop console, storefront, mobile apps; `make edge-health` |
| `/effy/<env>/edge/api_default_endpoint` | its raw provider URL (break-glass, 010) | operator |
| `/effy/<env>/edge/authorizer/{customer,shop,driver}_id` | one JWT authorizer per pool | routes: `authorizer.id` |
| `/effy/<env>/staff/http_api_id` | the staff HTTP API's id | `provider.httpApi.id` of every staff-gateway stack; the usage check |
| `/effy/<env>/staff/api_endpoint` | the staff gateway's address | back-office `VITE_API_BASE_URL`; `make edge-health` |
| `/effy/<env>/staff/api_default_endpoint` | its raw provider URL | operator |
| `/effy/<env>/staff/authorizer/back-office_id` | the staff gateway's one JWT authorizer | every authenticated back-office route |

⚠ `/effy/<env>/edge/authorizer/back-office_id` **no longer exists** once an environment's move is
complete. A stack that still reads it fails at deploy — loudly, which is the point.

On both gateways:

- Each authorizer is `JWT`, identity source `$request.header.Authorization`, issuer
  `https://cognito-idp.<region>.amazonaws.com/<pool_id>`, audience = that pool's app clients.
- **CORS** and the **5xx alarm** live in Terraform — a service that attaches to an external API cannot
  configure them. A new console origin is a Terraform change.
- `$default` auto-deploy stage, so paths carry no stage segment. Services never manage the stage.
- A regional TLS 1.2 custom domain on the environment's wildcard certificate, one empty-path mapping.
  The raw endpoint stays enabled.

## What a stack does (attach only)

```yaml
provider:
  httpApi:
    id: ${ssm:/effy/${sls:stage}/staff/http_api_id}      # or /edge/http_api_id
functions:
  someRoute:
    events:
      - httpApi:
          method: GET
          path: /admin/v1/me                              # /<service>/v<major>/…
          authorizer:
            type: jwt
            id: ${ssm:/effy/${sls:stage}/staff/authorizer/back-office_id}
```

- No API, stage, CORS or authorizer is declared in a service.
- Route keys are unique per gateway; disjoint `/<service>/` prefixes guarantee it.
- **A service whose routes belong on both gateways is two stacks from one directory** —
  `inventory/serverless.yml` (shop routes, shared) and `inventory/serverless.staff.yml`
  (`/inventory/v1/admin/…`, staff). Same `src/`, nothing copied. Deployed as
  `SERVICE=inventory` and `SERVICE=inventory-staff`.
- The route inventory is the stack files themselves; `make gateway-usage ENV=<env> BY=1` lists what is
  deployed per service prefix.

## Refusals

| Caller | At the staff gateway | At the shared gateway |
|---|---|---|
| no token, on an authenticated route | 401 | 401 |
| customer / shop / driver token | **401** — no authorizer there accepts it | served on its own audience's routes, 401 on the others |
| back-office token | accepted; the staff record then decides (403 if not permitted) | **401** on every route |

Verified against the live gateways by `make shop-verify-isolation` (it cannot be unit-tested), and held
in the tree by `gateway-placement.contract.test.ts`.

## How full each gateway is

| | What | When it speaks |
|---|---|---|
| `gateway-capacity.contract.test.ts` | counts what the tree is **about to** deploy, per gateway | fails `pnpm test` past 300 |
| `make gateway-usage ENV=<env>` | counts what **is** deployed | on demand; exits non-zero at ≥ 90% |
| `gatewayUsage` (admin, hourly) | emits `GatewayUsagePercent` in `Effy/Platform`, by `gateway` and `limit` | alarms at 75% and 90%; its own failed-run alarm |

## Invariants

- **Ordering**: `terraform apply` (both gateways, authorizers, parameters) precedes any service deploy
  — `${ssm:…}` resolves at deploy time. Then stacks deploy independently, in any order.
- **Deploy independence**: a deploy or `remove` touches only that stack's routes on its gateway.
- **Moving a stack between gateways** is a redeploy with the other gateway's two parameters: its routes
  are created there and removed here in one deployment. To do it without an outage, see 075's
  forwarding routes (`specs/075-staff-gateway/quickstart.md`).

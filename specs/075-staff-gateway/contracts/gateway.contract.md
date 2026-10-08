# Contract: the staff gateway

**Feature**: 075-staff-gateway. The app↔infrastructure contract for the second gateway, in the same
form as `docs/api/shared-gateway.md` (which this feature updates to describe both).

## Parameters (written by Terraform, read by services at deploy time)

| Parameter | Value | Read by |
|---|---|---|
| `/effy/<env>/staff/http_api_id` | the staff HTTP API's id | `provider.httpApi.id` of `admin`, `fleet`, `orders`, `catalog`, `inventory-staff` |
| `/effy/<env>/staff/api_endpoint` | `https://<staff_api_subdomain>.<zone>` | the back-office website's `VITE_API_BASE_URL`; `make edge-health`; `make gateway-usage` |
| `/effy/<env>/staff/api_default_endpoint` | the raw provider URL (break-glass) | operator |
| `/effy/<env>/staff/authorizer/back-office_id` | the staff gateway's back-office JWT authorizer | every authenticated back-office route |

Unchanged: `/effy/<env>/edge/http_api_id`, `/effy/<env>/edge/api_endpoint`,
`/effy/<env>/edge/authorizer/{customer,shop,driver}_id`.

**Removed at the end of the move:** `/effy/<env>/edge/authorizer/back-office_id`. A service that still
reads it fails at deploy — loudly, which is the point.

## A back-office service's attachment

```yaml
provider:
  httpApi:
    id: ${ssm:/effy/${sls:stage}/staff/http_api_id}
functions:
  example:
    events:
      - httpApi:
          method: GET
          path: /admin/v1/example              # paths are unchanged by the move
          authorizer:
            type: jwt
            id: ${ssm:/effy/${sls:stage}/staff/authorizer/back-office_id}
```

## The staff gateway itself

- **Stage**: `$default`, auto-deploy — paths carry no stage segment, as on the shared gateway.
- **Authorizer**: exactly one — JWT, issuer = the back-office Cognito pool, audience = its app client.
- **CORS**: allowed origins = the deployed back-office console origin and `http://localhost:5173`;
  methods, headers and exposed headers identical to the shared gateway's.
- **Public routes**: only each service's `/<service>/healthz` and `/<service>/readyz`.
- **Custom domain**: regional, TLS 1.2, the environment's wildcard certificate, one empty-path mapping.
- **Raw endpoint**: stays enabled (as 010 requires of the shared one).

## Refusals (unchanged in form)

| Caller | At the staff gateway | At the shared gateway |
|---|---|---|
| no token, on an authenticated route | 401 | 401 |
| customer / shop / driver token | **401** — no authorizer accepts it | as today |
| back-office token | accepted; then the staff record decides (403 if not permitted) | **401** on every route after the move |

## The cutover variable

`var.staff_gateway_cutover` (string, validated — any other value is refused). The staff gateway itself
exists at every value.

| Value | Shared gateway's back-office authorizer + CORS origin | Forwarding routes | Back-office website's API address |
|---|---|---|---|
| `"prepare"` | kept | none | shared |
| `"forward"` | kept | present | shared |
| `"website"` | kept | present | **staff** |
| `"complete"` (default) | **removed** | none | **staff** |

A new environment never sets it. Dev sets it in `dev.tfvars` for the length of the move.

## Forwarding routes (temporary, dev migration only)

Created on the **shared** gateway while `var.staff_gateway_cutover` is `"forward"` or `"website"`:

| Route | Forwards to |
|---|---|
| `ANY /admin/{proxy+}` | `https://<staff host>/admin/{proxy}` |
| `ANY /fleet/{proxy+}` | `https://<staff host>/fleet/{proxy}` |
| `ANY /orders/{proxy+}` | `https://<staff host>/orders/{proxy}` |
| `ANY /catalog/{proxy+}` | `https://<staff host>/catalog/{proxy}` |
| `ANY /inventory/v1/admin/{proxy+}` | `https://<staff host>/inventory/v1/admin/{proxy}` |

No authorizer on these routes: the request, with its `Authorization` header, is authorized by the
staff gateway. They exist only between steps 3 and 6 of the move.

## Usage metric

`GatewayUsagePercent` in namespace `Effy/Platform`, dimensions `gateway` (`shared` | `staff`) and
`limit` (`routes` | `integrations`), emitted hourly. Alarms: ≥ 75 and ≥ 90, to the alerts topic.

## `make gateway-usage ENV=<env>`

```
gateway   routes        integrations
shared    158 / 300     158 / 300    53%
staff     142 / 300     142 / 300    47%
```
Exits non-zero if any figure is at or above 90%.

# Contract — Cross-pool isolation (both directions)

**Feature**: 007 (FR-009, SC-004) · **Enforced by**: the shared HTTP API's per-pool JWT authorizers
(`infra/envs/dev/edge-gateway.tf`) · **Verified by**: the operator, not a unit test.

This slice is the first time the platform has **two authenticated surfaces on two different pools**,
and therefore the first time constitution Principle IV can be *demonstrated* rather than assumed.

## The mechanism (structural, not code)

`edge-gateway.tf` creates one `aws_apigatewayv2_authorizer` per pool via `for_each` over four pools.
Each is pinned to exactly one issuer and one client id:

```hcl
jwt_configuration {
  issuer   = "https://cognito-idp.<region>.amazonaws.com/<that pool's id>"
  audience = [<that pool's app client id>]
}
```

Every route names its authorizer **by id from SSM**:

| Route | Authorizer | SSM parameter |
|---|---|---|
| `/shop/v1/*` (authenticated) | shop | `/effy/<env>/edge/authorizer/shop_id` |
| `/admin/v1/*` | back-office | `/effy/<env>/edge/authorizer/back-office_id` |

A token minted by the back-office pool fails `iss` **and** `aud` validation at the shop authorizer.
The request is rejected with `401` **before any handler code runs** — there is no handler-level
check to forget, and no auth proxy to misconfigure. The same holds in reverse.

## The contract

1. A **shop** token presented to any `/admin/v1/*` route → `401`. Never `403`, never `200`.
2. A **back-office** token presented to any authenticated `/shop/v1/*` route → `401`.
3. Neither service ever forwards, brokers, exchanges, or introspects the other pool's token.
4. Neither console ever presents its credential to a service of another audience. `shop-web`'s
   `VITE_API_BASE_URL` + `/shop/v1/...` paths make this structural on the client too.
5. The `401` body reveals nothing about the other audience's existence.

## Why this is not unit-tested

The enforcement lives in API Gateway configuration, not in application code. A vitest suite could
only assert against a fake event it constructed itself — it would prove that the test's own fixture
is shaped as expected, and nothing about the deployed gate. **Asserting it in vitest would be
theater.**

SC-004 is therefore an **operator-run `curl` check with two real tokens**, scripted in
[quickstart.md](../quickstart.md) §5. That is the honest verification, and it runs against the same
gateway that serves production traffic patterns.

## What a regression would look like

| Symptom | Likely cause |
|---|---|
| `403` instead of `401` on a cross-pool call | the route lost its authorizer and is falling through to a handler-level role check |
| `200` on a cross-pool call | a route was attached with the **wrong** authorizer id (e.g. `back-office_id` on a `/shop/` route) — the one mistake this design still permits |
| `401` on a *same*-pool call | wrong `VITE_COGNITO_CLIENT_ID`, or the console sent an ID token where the audience expects the access token's `client_id` |

The middle row is the reason `serverless.yml`'s authorizer references are reviewed as part of any
route change: the id is an opaque SSM string, and swapping two of them type-checks fine.

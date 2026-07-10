# `@effy/edge-shop` — cold-path shop service (004 A3)

An independently deployable Serverless service that **attaches to the Terraform-owned shared HTTP
API** (`provider.httpApi.id` from SSM — see [docs/api/shared-gateway.md](../../../docs/api/shared-gateway.md)).
Routes live under `/shop/`; cross-cutting code comes from `@effy/edge-shared`.

## Layout (layered, per ARCHITECTURE.md)
```
src/
├── functions/   # one handler file per route (owns auth-claims check, parse, error-map)
├── service.ts   # domain logic (no HTTP, no SQL)          [where a domain exists]
├── repository.ts# raw SQL via @effy/edge-shared query      [where a domain exists]
└── types.ts     # domain types
```

## Add an endpoint
1. Add `src/functions/<name>-v<n>-get.ts` importing helpers from `@effy/edge-shared`.
2. Add the route to `serverless.yml` under `/shop/v<n>/...`; pick the pool via
   `authorizer.id: ${ssm:/effy/${sls:stage}/edge/authorizer/<pool>_id}`.
3. Add its per-function alarms. `pnpm --filter @effy/edge-shop test`.

## Deploy (operator)
`make edge-deploy SERVICE=shop ENV=dev` — attaches to the shared gateway; touches only this
service's routes (deploy independence). The gateway (Terraform) must exist first.

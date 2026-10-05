# `core-api` — the retired Go backend (reference archive)

**Retired by feature 070 on 2026-10-05.** This document is what remains of it: how it was built,
with what, and where each part went. It exists so the design can be consulted — or the code
recovered — without the source sitting in the tree looking live.

> ⚠ **This is history, not guidance.** The platform has one backend: the serverless TypeScript
> services under `apis/edge-api/`. Every new endpoint goes there
> ([docs/api/path-assignment.md](../api/path-assignment.md)); the constitution (v3, Principle III)
> does not permit a plan to add always-on compute. Nothing here is a pattern to copy into new work.

## Getting the code back

The source was deleted from the working tree, not from history.

| What | Last commit that contains it | How to read it |
|---|---|---|
| The Go service, `apis/core-api/` | `4ea9307a` | `git show 4ea9307a:apis/core-api/README.md` · `git checkout 4ea9307a -- apis/core-api` to restore the whole tree |
| Its Terraform (`infra/envs/dev/core-api.tf`, `infra/modules/ecs-fargate-web-service/`) | `51fee42f` | `git show 51fee42f:infra/envs/dev/core-api.tf` |
| Its Make targets (`core-run`, `core-test`, `core-image-push`, `core-deploy`, …) | `51fee42f` | `git show 51fee42f:Makefile` |
| The feature that deployed it | — | [specs/040-core-api-deploy](../../specs/040-core-api-deploy/) |
| The feature that retired it, and the full route-by-route inventory | — | [specs/070-retire-core-api](../../specs/070-retire-core-api/) — `migration-inventory.md`, `contracts/api-migration.md` |

## What it was

The "hot path": an always-on HTTP service that carried all **shopper** traffic — catalogue, search,
cart, saved items, checkout, payment, a shopper's orders, refunds and cancellation — while the
serverless "cold path" carried staff, shop and driver traffic. 52 routes at retirement.

It was retired for three reasons, in the operator's order of weight: it cost money every hour
(about $30–45/month in dev for a load balancer, one task and public IPv4) on a platform with no
customers yet; every business rule had to exist in two languages; and the latency argument for
having it rested on a measurement taken from a laptop, never in-region.

## Technology

| Concern | Choice | Version |
|---|---|---|
| Language | Go | 1.25 |
| HTTP | Gin (`gin-gonic/gin`), `gin-contrib/cors` | 1.12 / 1.7 |
| Database | PostgreSQL 16 through `jackc/pgx/v5` (`pgxpool`) — raw SQL, no ORM | 5.10 |
| Auth | Cognito JWTs verified in-process: `golang-jwt/jwt/v5` + `MicahParks/keyfunc/v3` (JWKS cache) | 5.3 / 3.8 |
| Payments | `stripe/stripe-go/v82` (API version `2025-08-27.basil`) | 82.5 |
| AWS | `aws-sdk-go-v2` — S3 (presigned image reads), Cognito identity provider (admin bootstrap) | 1.42 |
| Config | `caarlos0/env/v11` struct tags; `joho/godotenv` for local only | 11.4 |
| Logging | `go.uber.org/zap`, one JSON line per request | 1.28 |
| Metrics | `prometheus/client_golang`, custom registry, `/metrics` | 1.23 |
| Concurrency | `golang.org/x/sync` (errgroup for fan-out reads) | 0.20 |
| IDs | `google/uuid` (incl. UUIDv5 for derived change ids) | 1.6 |
| Tests | `stretchr/testify`; `testcontainers-go` + its Postgres module for real-database suites | 1.11 / 0.43 |
| Local dev | Docker Compose + `air` live reload | air 1.65 |
| Image | multi-stage: `golang:1.25-bookworm` → `gcr.io/distroless/static-debian12:nonroot`, `CGO_ENABLED=0`, `-trimpath -ldflags="-s -w"`, linux/arm64 | — |

No DI framework, no ORM, no code generation, no mocking library (fakes were written by hand).

## Folder structure

```
apis/core-api/
├── cmd/
│   ├── core-api/main.go          ALL wiring, by hand, top-down:
│   │                             config → logger → pool → AWS clients → verifiers → features → server
│   ├── create-first-admin/       operator tool   → now apis/edge-api/ops
│   ├── delete-admin/             operator tool   → now apis/edge-api/ops
│   └── load-localities/          operator tool   → now apis/edge-api/ops
├── internal/
│   ├── platform/                 shared infrastructure — never domain logic
│   │   ├── config/               env struct, fail-fast; DSN assembly
│   │   ├── logger/               zap build + request-scoped FromContext / WithContext
│   │   ├── db/                   the one pgxpool + the DBTX seam repositories depend on
│   │   ├── auth/                 per-pool Cognito verifiers, middleware, group check,
│   │   │                         StaffGate (back-office record), ShopGate (order-scoped)
│   │   ├── customeridentity/     resolve the platform's customer record; refuse barred / closing
│   │   ├── httpx/                problem+json writers, request id, request log, panic recovery
│   │   ├── metrics/              Prometheus registry, RED middleware, /metrics
│   │   ├── health/               /healthz, /readyz
│   │   ├── media/                presigned S3 GET urls
│   │   ├── money/                decimal string ⇄ integer cents
│   │   ├── pricing/              the currency constant
│   │   ├── availability/         the "is it purchasable" predicate + its source guard
│   │   ├── cartpolicy/           minimum spend and cart ceilings
│   │   ├── delivery/             fee engine, quote, zones, slots, standard days, cutoff, localities
│   │   ├── deliveryinstructions/ mirror of the shared-types rule
│   │   └── events/               outbox append (written, never delivered)
│   ├── features/                 one package per domain feature
│   │   ├── storefront/           home, categories, search (cursor paging), facets, product and
│   │   │                         promotion detail, serviceability, localities
│   │   ├── cart/                 cart, guest preview, policy, reorder, promo evaluation
│   │   ├── saveditems/           saved items and named lists
│   │   ├── checkout/             quote, intent, confirm, kept cards, the Stripe gateway and webhook,
│   │   │                         the payment-finalisation transaction (store.go)
│   │   ├── orders/               customer order history and receipt; the progress-stage rollup
│   │   ├── refunds/              issue, cancel, refund requests, provider events, stock return
│   │   ├── shoplive/             server-sent events for the shop console (LISTEN/NOTIFY hub)
│   │   ├── notifications/        notification-intent producer
│   │   ├── platformstatus/       the proving read (v1 + v2 shapes) — the feature to copy
│   │   └── customerping/         identity-enforcement proof
│   └── adminbootstrap/           first-admin create / delete (Cognito + admin.staff)
├── Dockerfile  docker-compose.yml  .air.toml  .env.example
└── go.mod  go.sum
```

About 18,400 lines of Go and 16,000 lines of tests (562 test functions).

## Architecture

**Three-layer slice per feature**, the same rule the whole platform follows:

```
handler.go      HTTP only: parse → call service → map domain → wire DTO. Version-specific shapes live here.
service.go      business rules and deadlines; no HTTP, no SQL
repository.go   raw SQL as named constants; explicit row → domain mapping; wire shapes never escape
register.go     Register(...) mounts the feature's routes on the /v1 (and /v2) groups
```

Dependency direction handler → service → repository. `platform/` is consumed by all three; nothing
imports a feature except `main.go`, where every dependency is constructed by hand in one function
(`registerFeatures`) so the graph is greppable.

- **Request pipeline**: `gin.New()` with request id → request log → panic recovery → RED metrics →
  CORS (explicit origin allow-list), then per-group auth middleware.
- **Auth**: one JWT verifier per Cognito pool (customer, back-office, shop), built at startup and
  fail-closed. It verified an **access** token (`token_use == "access"`, `client_id` in the pool's
  app clients) — unlike the gateway's authorizers, which check an ID token's audience. After the
  token, the platform's own record decided access: `customeridentity` for shoppers, `StaffGate`
  for back-office, `ShopGate` for a shop manager. "Could not check" was 503; "checked, no" was 403.
- **Database**: one `pgxpool` — max 10 connections, min 2, 45-minute lifetime with jitter, 15-minute
  idle, health check every minute — sized against a shared instance that accepts about 85.
  Repositories took a `DBTX` interface so a service could own a transaction.
- **Errors**: RFC 9457 `application/problem+json` everywhere, the same vocabulary as
  [docs/api/error-envelope.md](../api/error-envelope.md).
- **Versioning**: every product route under `/v1`; a breaking change appeared under `/v2` while
  `/v1` kept serving. Health and `/metrics` unversioned.
- **Payments**: a `PaymentGateway` port with a Stripe adapter; the amount computed only on the
  server; a deterministic idempotency key per order, amount and provider customer; payment
  finalisation as one transaction whose first statement is the `pending_payment → paid` guard.
- **Concurrency rules worth remembering**: row locks for slot capacity, the stock floor in one
  statement, the refund ceiling under a lock on the payment row, a per-customer advisory lock for
  saved-item writes. All of these were carried over; the real-database tests that prove them are in
  `apis/edge-api/commerce` and `apis/edge-api/shared/src/payments`.
- **Live updates**: one dedicated `LISTEN shop_ops` connection per task, an in-memory hub per shop,
  server-sent events to each open console, re-authorised every 15 minutes. This is the one
  capability that was **not** carried over — it needs a standing server.

## Configuration (names only)

`EFFY_ENV`, `PORT`, `DB_DSN` (or `DB_HOST`/`PORT`/`NAME`/`USER`/`PASSWORD`), `AWS_REGION`,
`AWS_MEDIA_BUCKET`, `AUTH_CUSTOMER_POOL_ID` / `_CLIENT_ID`, `AUTH_BACK_OFFICE_*`, `AUTH_SHOP_*`,
`CORS_ALLOWED_ORIGINS`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`,
`LOG_LEVEL`. Secrets were composed into the process environment at invocation from SSM and Secrets
Manager — never written to a file in the repository.

## How it ran

- **Locally**: `make core-run` → Docker Compose, `air` rebuilding on change, port 8080.
- **In dev (feature 040)**: one Fargate task (0.25 vCPU / 512 MiB, arm64, no autoscaling) in the
  default VPC's public subnets with a public IP and no NAT, behind an internet-facing load balancer
  at `core-api.dev.effyshopping.com`, using the environment's wildcard certificate. Image in a
  private registry; logs kept seven days. Deploy was `make core-image-push` then `make core-deploy`.

## Where each part went

| Was | Now |
|---|---|
| `features/storefront` | `apis/edge-api/storefront` |
| `features/cart`, `saveditems`, `checkout`, `orders` | `apis/edge-api/commerce` |
| `features/refunds` (rules), payment finalisation, the Stripe gateway | `apis/edge-api/shared/src/payments` — called by `commerce`, `orders`, `shop` |
| `features/refunds` back-office routes | `apis/edge-api/orders` |
| `features/refunds` shop route, `auth.ShopGate` | `apis/edge-api/shop` |
| `platform/delivery`, `cartpolicy` | `apis/edge-api/shared/src/delivery`, `…/cart-policy` |
| `platform/money`, `availability`, `customeridentity`, `metrics`, `events` | `apis/edge-api/shared/src/lib` and `…/payments/outbox.ts` |
| `platform/auth` verifiers | the gateway's JWT authorizer per pool |
| `platform/metrics` (Prometheus) | CloudWatch embedded-format metrics + alarms in `infra/envs/dev/commerce-alarms.tf` |
| `cmd/create-first-admin`, `delete-admin`, `load-localities`, `adminbootstrap` | `apis/edge-api/ops` |
| `features/platformstatus` | already served by `apis/edge-api/shop` (`/shop/v1/status`, `/v2/status`) |
| `features/shoplive` | retired — the console re-reads every 30 seconds |
| `features/customerping` | retired |

Behaviour that deliberately changed in the move is listed in
[specs/070-retire-core-api/contracts/api-migration.md §3](../../specs/070-retire-core-api/contracts/api-migration.md).

## If a standing service is ever wanted again

That is a constitutional change, not a plan decision. The questions this one never answered well:
measure latency **in-region** before assuming it is needed; price it against the always-on floor;
and decide up front how a rule is kept from existing twice — the answer here was hand-mirrored code
kept honest by tests that read the other language's source, and it cost a defect per mirror.

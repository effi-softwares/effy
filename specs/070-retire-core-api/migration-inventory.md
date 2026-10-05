# Migration Inventory: everything `core-api` is, does and touches

**Feature**: [070-retire-core-api](spec.md) · **Indexed**: 2026-10-04 · **Source**: read of the repository
only — nothing here is checked against live cloud state. Confirm section 7 with `terraform state list`
before acting.

This is the technical index behind the specification. Each row must end the feature **relocated**,
**retired with a reason**, or **destroyed**. Paths are relative to the repo root; `F/` =
`apis/core-api/internal/features/`, `P/` = `apis/core-api/internal/platform/`,
`E/` = `apis/edge-api/shared/src/lib/`.

## 1. Size

| | Routes | Non-test Go LOC | Go test funcs |
|---|---|---|---|
| storefront | 8 | 2,478 | 57 |
| saveditems (incl. lists) | 14 | 1,903 | 95 |
| cart | 12 | 2,479 | 68 |
| checkout (incl. webhook) | 6 | 3,372 | 122 (38 container) |
| orders | 2 | 1,085 | 26 |
| refunds | 6 | 1,997 | 76 (56 container) |
| shoplive | 1 (stream) | 505 | 14 |
| platformstatus | 2 | 224 | 7 |
| customerping | 1 | 49 | 0 |
| notifications | 0 (library) | 45 | 0 |
| **Features total** | **52** | **14,137** | **465** |
| platform packages (16) + cmd (4) | 3 (`/healthz`, `/readyz`, `/metrics`) | ~4,250 | not counted |

Whole module: 169 Go files, 18,395 non-test lines. It is the **only** `go.mod` in the repo.

## 2. Routes

### 2.1 Public (no sign-in)

| Route | Notes that are easy to lose |
|---|---|
| GET `/v1/storefront/home` | Two concurrent waves, up to 8 reads. Rails `featured`, `on_sale`, `category:<key>`, 12 each, empty rails omitted. Banners from advertised promos. No cache header. |
| GET `/v1/storefront/categories` | Product count uses the purchasable rule; derived image uses status only. |
| GET `/v1/storefront/facets` | 1 + (3+N) concurrent reads; each facet counted with its own selection cleared; fixed order category, brand, attributes by name; zero-count options dropped. 400 `invalid_price`. |
| GET `/v1/storefront/products` | `ids=` form (caller order, missing dropped) or search form. Sorts `newest`/`price_asc`/`price_desc`/`relevance`; relevance without `q` falls back and reports the sort applied. Keyset cursor `2|sort|key|id`; malformed cursor restarts, wrong-sort cursor is 400. Limit default 24; out-of-range becomes 24, not clamped. Relevance uses trigram similarity whose expression must match the index in `db/migrations/20260716092105_product_catalog.sql:125` character for character. |
| GET `/v1/storefront/products/:id` | Four reads incl. recursive category path. **Malformed id → 503 today (repair).** |
| GET `/v1/storefront/promotions/:id` | Deliberately uncached. Relative validity wording ("Ends tomorrow"). |
| GET `/v1/storefront/serviceability` | Postcode `^[0-9]{4}$`. `Cache-Control: public, max-age=86400`. **No caller found.** |
| GET `/v1/storefront/localities` | <2 chars → empty; max 8. Same cache header. **No caller found.** |
| POST `/v1/cart/preview` | Prices a signed-out cart; writes nothing. |
| GET `/v1/cart/policy` | Minimum spend and ceilings (defaults 99 per line, 100 distinct). |
| GET `/v1/platform/status`, `/v2/platform/status` | Two wire shapes. 3 s budget; timeout → 503. **No caller found.** |
| POST `/v1/stripe/webhook` | Signature only. See §4. |

### 2.2 Customer (access token + customer record check on every request)

| Area | Routes |
|---|---|
| Saved | GET `/v1/saved/ids`, GET `/v1/saved`, PUT/DELETE `/v1/saved/:productId`, POST `/v1/saved/merge`, POST `/v1/saved/add-to-cart` |
| Lists | GET/POST `/v1/lists`, PATCH/DELETE `/v1/lists/:listId`, GET `/v1/lists/:listId/items`, PUT/DELETE `/v1/lists/:listId/entries/:productId`, POST `/v1/lists/:listId/add-to-cart` |
| Cart | GET/DELETE `/v1/cart`, POST `/v1/cart/merge`, POST `/v1/cart/items`, PATCH/DELETE `/v1/cart/items/:productId`, POST `/v1/cart/reorder`, POST `/v1/cart/items/:productId/set-aside`, POST `/v1/cart/saved/:productId/restore`, DELETE `/v1/cart/saved/:productId` |
| Cart promo | **POST/DELETE `/v1/cart/promo` — called by web and mobile, never registered** (`F/cart/register.go`). Service methods `ApplyPromo`/`RemovePromo` exist (`F/cart/service.go:641,682`). |
| Checkout | POST `/v1/checkout/quote`, `/intent`, `/confirm`; GET `/v1/payment-methods`; DELETE `/v1/payment-methods/:id` |
| Orders | GET `/v1/orders` (no pagination), GET `/v1/orders/:id` (8 sequential reads) |
| Refunds | POST `/v1/orders/:id/cancel`, POST `/v1/orders/:id/refund-requests` |
| Diagnostic | GET `/v1/customer/ping` — retire with the `account/hot-path` page |

Key invariants: saved-item writers take a per-customer transaction lock (`F/saveditems/repository.go:232`);
caps 200 saved / 20 lists / 40-char names, "Saved" reserved; bulk add-to-cart derives each change id as
UUIDv5 in namespace `9c0a2f31-6e58-4a0e-9b3f-3f6a1c7f2d54` over `changeId:productId` — **the namespace
must not change**; cart mutations log `(cart_id, change_id)` then mutate then bump revision in one
transaction; GET cart deletes archived lines (a read that writes).

### 2.3 Back-office (back-office token + staff record gate, roles admin/manager)

POST `/v1/admin/orders/:orderId/refunds` · POST `/v1/admin/orders/:orderId/cancel` (**no caller found**) ·
POST `/v1/admin/refund-requests/:requestId/decline`

### 2.4 Shop (shop token + shop record gate)

POST `/v1/shop/orders/:orderId/refunds` — active `shop_manager`, active shop, shop has a portion of the
order, lines scoped to that shop (`P/auth/shopgate.go:55-73`, **no TS twin**).
GET `/v1/shop/live` — see §5.

Gate failure is 503 (could not check) vs 403 (not allowed), everywhere.

## 3. The payment path in detail

**Intent** (`F/checkout/service.go:302-558`) is ~12 separate statements/transactions plus provider
calls, *not* one transaction: cart lines (stock-capped) → address → minimum → discount → quote and
delivery choice → pending-order reuse check (a provider read that may itself finalise) → upsert
pending order under row lock → capture delivery (lock slot, re-judge, insert hold) → billing and
instructions → ensure provider customer → customer session and payment intent concurrently → upsert
payment. Idempotency key `sha256("pi:{order}:{amountCents}:{providerCustomer}")`.

**Finalisation** (`F/checkout/store.go:706-961`) is **one transaction**, guarded by
`UPDATE order SET status='paid' WHERE status='pending_payment'` (zero rows → return). In order:
shop fulfilments → confirm slot booking under lock (over-capacity path) → pre-flag oversold lines →
stock deduction (`FOR UPDATE … ORDER BY p.id`, floor at 0, movement rows) → shop new-order notification
requests → `order.placed` to `event_outbox` → customer paid notification → receipt dispatch → payment
succeeded → promo redemption → clear cart. Reached from the webhook, `/confirm` and `/intent`.

**Refund** (`F/refunds/service.go:247`): price lines (outside the lock) → record under
`FOR UPDATE OF payment` with ceiling check and idempotency key → provider submit (≤2 attempts) → mark
submitted or refused → best-effort restock and close open request. Ambiguous failure leaves
`submitting` and returns `stalled:true`; **nothing reconciles it**.

**Provider SDK surface used**: payment intents, customers, customer sessions, payment methods
(list, detach), refunds, webhook event construction. Secrets: `/effy/<env>/stripe/secret_key` and
`/webhook_secret` in Secrets Manager (operator-created, not Terraform-managed). **No edge-api service
has the SDK or the secrets wired.**

## 4. Defects found (repair, do not port)

| # | Defect | Evidence |
|---|---|---|
| a | Promo apply/remove routes do not exist; both clients call them | `F/cart/register.go:27-42`; `apps/customer-web/app/api/cart/promo/route.ts:6,11`; `HttpCartRepository.kt:123,128` |
| b | Webhook marks an event seen before processing and returns 400 on any error, so a retry after a transient fault is deduplicated away; refund events have no recovery | `F/checkout/store.go:629`, `handler.go:312-316` |
| c | `event_outbox` is written and never drained; core-api has no SNS client | `P/events/outbox.go:28-44`; no reference in edge-api |
| d | No reconciler for `submitting` refunds, no sweep of abandoned `pending_payment` orders, `cart_change_log` never pruned | — |
| e | `/products` does not validate price bounds; `/products/:id` malformed id → 503 | `F/storefront/handler.go` |
| f | `stop-db.sh` calls the ECS service first under `set -e`; after teardown it aborts before stopping RDS | `stop-db.sh:4-11` |
| g | `orders` converts money through floats, unlike `P/money` | `F/orders` `cents()` |
| h | Inert alert rule references a metric that is not registered (`checkout_delivery_fee_cap_hits_total`) | `infra/observability/alerts/032-delivery-pricing.yml:38` |

## 5. The one thing that cannot move as-is: shop live stream

`GET /v1/shop/live` is Server-Sent Events held open up to 15 minutes: an in-process hub (500 ms poke
throttle per shop, max 5 streams per subject, 20 s heartbeat), fed by one persistent `LISTEN shop_ops`
connection (`F/shoplive/listener.go`), notified by triggers in
`db/migrations/20260914165403_shop_insights.sql:149-285`. The HTTP gateway caps an integration at 30 s
(`cmd/core-api/main.go:317-322`). Consumer: `apps/shop-web/src/features/today/useShopLive.ts:43` via
`packages/web-kit/src/runtime/live.ts`; the console already refetches every 30 s as fallback. 058's
target: new order visible ≤ 10 s p95.

Nothing else depends on a long-lived process: no tickers, cron or workers. JWKS refresh, the
connection pool and in-process counters are the only other process-lifetime state.

## 6. Platform packages → TypeScript status

| Go package | TS twin today | Status |
|---|---|---|
| `logger`, `health`, `httpx` (problem envelope), `media` (presign), `db` | `E/logger.ts`, `health.ts`, `http.ts`, `media.ts`, `db.ts` | Ported. Type URIs kept in step by hand, no test. Env name differs: `AWS_MEDIA_BUCKET` vs `S3_MEDIA_BUCKET`. |
| `auth` verifier | Gateway JWT authorizers per pool | Ported differently — see §9 |
| `auth` StaffGate | `E/back-office-authz.ts` | Ported |
| `auth` ShopGate (order-scoped) | — | **Go only** |
| `customeridentity` | Per-handler in `apis/edge-api/customer/src` | Partial — no shared helper |
| `deliveryinstructions` | `packages/shared-types/src/delivery-instructions.ts` (canonical) | Ported |
| `delivery` same-day cutoff | `E/collection-deadline.ts` | Partial (inverse question, fixture-pinned) |
| `delivery` fee engine, quote, zones, slots, standard days, localities | — | **Go only** |
| `cartpolicy` (read/enforce) | — | **Go only** (admin writes the row) |
| `availability` (purchasable rule + guard test) | — | **Go only** |
| `money` | `E/margin.ts` helpers only | Partial |
| `pricing` (currency constant) | — | Trivial |
| `events` (outbox append) | — | **Go only**, undrained |
| `metrics` (Prometheus registry) | Per-service hand-rolled CloudWatch EMF | **Go only**; no shared EMF helper |
| `config` | Per-service `serverless.yml` env | Different shape |

Wire DTOs already exist in `packages/shared-types/src` (`storefront`, `cart`, `checkout`, `delivery`,
`order`, `saved-item`, `refund`, `payment`) and are the **source of truth** — Go mirrors them; Kotlin is
generated from them.

**Metrics to re-emit**: `http_requests_total`, `http_request_duration_seconds`,
`delivery_serviceability_checks_total`, `delivery_quotes_total`, `delivery_quote_failures_total`,
`effy_delivery_slot_bookings_total`, `effy_delivery_standard_date_refused_total`,
`effy_stock_deducted_total`, `effy_stock_blocked_total`, `effy_refunds_issued_total`,
`effy_refund_outcomes_total`, `effy_refund_submit_failures_total`, `effy_shop_refund_denied_total`,
`effy_orders_cancelled_total`. (`effy_shop_live_*` and `db_pool_connections_*` retire with their
mechanisms.)

**Operator tools** (`apis/core-api/cmd/`, run by `go run` from `Makefile:276-298`):
`create-first-admin`, `delete-admin` (+ `internal/adminbootstrap`), `load-localities`
(+ `P/delivery/localityload.go`). All three must survive.

## 7. Cloud resources

### Destroy (all in `infra/envs/dev`; module `infra/modules/ecs-fargate-web-service`, used once)

`module.core_api.`: `aws_ecs_cluster.this`, `aws_ecs_task_definition.this`, `aws_ecs_service.this`,
`aws_lb.this`, `aws_lb_target_group.this`, `aws_lb_listener.https`, `aws_lb_listener.http_redirect`,
`aws_security_group.alb`, `aws_security_group.task`, `aws_ecr_repository.this` (**no `force_delete` —
empty it first**), `aws_ecr_lifecycle_policy.this`, `aws_iam_role.execution`,
`aws_iam_role_policy_attachment.execution_managed`, `aws_iam_role_policy.execution_secrets[0]`,
`aws_iam_role.task`, `aws_iam_role_policy.task_s3[0]`, `aws_cloudwatch_log_group.this`
(7 days of logs lost), `aws_route53_record.a`, `aws_route53_record.aaaa`.
Plus `aws_ssm_parameter.core_api_base_url` and two outputs (`infra/envs/dev/core-api.tf`). The two
Stripe secret data sources in that file are **kept** — they move to `commerce.tf` (tasks T017).

### Keep (shared)

Wildcard certificate and zone (`module.dns`); RDS and its master secret; the two Stripe secrets;
product media bucket; four Cognito pools and clients; alerts SNS topic and the three insights alarms;
PostHog parameters; WAF (attached to Cognito pools only).

### Cost

| | Monthly | Source |
|---|---|---|
| Load balancer | ~$20 | `specs/040-core-api-deploy/research.md:267` |
| One Fargate task | ~$9 | `:268` |
| Registry, logs, data | ~$1–2 | `:268` |
| **Documented total removed** | **~$30** | `:266` |
| Public IPv4 (ALB per AZ + task) | ~$11–15 | *estimate, not in the docs* |
| **Remaining always-on** | RDS ~$22 | `infra/envs/dev/db.tf:1-2` |

Added Lambda/API Gateway request cost from migrated traffic is not estimated. Prometheus and Grafana
**were never built** (`infra/observability/README.md:3-12`); no ECS/ALB cost remains after teardown.

## 8. Consumers

| Surface | What it calls | Base URL key |
|---|---|---|
| customer-web | ~50 call sites: server components, `app/api/*` proxies (`lib/api/proxy.ts`), and **3 browser-direct** storefront calls (`SearchExperience.tsx:172,178`, `RecentlyViewedRail.tsx:24`) | `NEXT_PUBLIC_CORE_API_BASE_URL` (build-time) |
| customer-mobile | All commerce: catalog, cart, checkout, cancel, refund request, saved, payment methods | `CORE_API_BASE_URL` (BuildKonfig constant) |
| shop-web | Shop refund; live stream | `VITE_CORE_API_BASE_URL` (required; app fails fast if unset) |
| back-office | Issue refund; decline request | `VITE_CORE_API_BASE_URL` (required) |
| driver-mobile, shop-mobile | Nothing | — |
| Payment provider | `POST /v1/stripe/webhook` — URL registered at the provider, outside the repo | — |

Set in: `infra/envs/dev/amplify-customer-web.tf:46,52`, `amplify-consoles.tf:24,84,119`,
`.github/workflows/web.yml:83,116`, each app's `.env.example`, `apps/customer-mobile/secrets.properties`.

## 9. Why repointing is not a config change

1. **Paths.** core-api serves `/v1/…`; edge services serve `/<service>/v1/…`.
2. **Customer credential.** core-api verifies the *access* token itself (`P/auth/verifier.go:104-120`).
   Edge customer routes are sent the *ID* token plus `X-Effy-Access-Token`
   (`apps/customer-web/lib/api/edge.ts:27-32`, mobile `EffyHttpClient.kt:69-77`).
3. **Browser origins.** Gateway CORS (`infra/envs/dev/edge-gateway.tf:39-48`) lists localhost and the
   two console subdomains — not the storefront, which the 3 browser-direct calls need.
4. **No optional-auth routes** on the gateway; public and signed-in variants are separate routes
   (core-api's own split already fits this).
5. **Raw body.** No edge handler reads a raw/base64 body today; webhook signature verification needs
   the exact bytes.
6. **Installed mobile builds** have the hostname compiled in; there is no remote indirection.

## 10. Target constraints (edge-api today)

- One function per route, `src/functions/<resource>-v1-<verb>.ts`; handler → service → repository;
  `preamble()` instead of middleware; nodejs22, arm64, 256 MB, 10 s timeout; no VPC.
- **CloudFormation 500-resource limit**: ~5 resources per route; `admin` is at 434/500. ~52 routes
  ≈ 260 resources → new service(s) required; `customer` (24 functions) cannot absorb them all.
  Preferred shape is one audience per service.
- **DB**: pool `max: 1` per container; a transaction holds it (`E/db.ts:28,66-68`). Budget ~85
  connections on `db.t4g.micro`, no RDS Proxy. No reserved or provisioned concurrency anywhere.
- **Latency**: ~135 ms per RDS round trip was recorded; 8 serial queries once 503'd the home page and
  14 round trips timed out cart writes (`FEATURE-HISTORY.md:1549,1691`). With one connection per
  container, core-api's concurrent fan-outs (home 8, facets 4+N) become serial unless combined.
- **Throttling** is a gateway-stage property owned by Terraform; none is set. No WAF on the gateway.
- 10 s function timeout vs the client's 12 s checkout timeout.
- No SNS/SQS publisher exists in edge-api; scheduled drains (`rate(1 minute)`) are the existing pattern.
- Tests: vitest; `*.container.test.ts` (testcontainers, real Goose migrations); `*.guard.test.ts`;
  config-contract tests that read `serverless.yml`.

## 11. Checks that depend on the Go source

**Fail when Go is deleted:**
`apis/edge-api/orders/src/orders/service.test.ts:28,103` (reads `stage.go`, `refunds/repository.go`);
`apis/edge-api/orders/src/orders/refund-append-only.guard.test.ts:29,121-125`;
`apis/edge-api/admin/src/shops/hidden-fulfilment.guard.test.ts:27-36,90` (file-count assertion).

**Lose coverage silently:** `apis/edge-api/inventory/src/stock/append-only.guard.test.ts:28`;
`scripts/check-no-telemetry-pii.sh:19`.

**Go-side guards that vanish with the code:** `P/config/contract_test.go`,
`P/db/schema_drift_test.go`, `P/availability/guard_test.go`, `F/checkout/customer_dto_guard_test.go`,
`F/checkout/delivery_instructions_guard_test.go`, `F/saveditems/wire_contract_test.go`,
`F/storefront/contract_test.go` and `wire_contract_test.go`, `P/delivery/deadline_contract_test.go`.

**Remain as the only pin on a rewrite:** customer-mobile `DeliveryWireContractTest`,
`PaymentWireContractTest`, `SavedWireContractTest`, `BannerWireContractTest`;
`E/collection-deadline.contract.test.ts`; `packages/shared-types` fixtures.

## 12. Files outside `apis/core-api` that change

- **Infra**: delete `infra/envs/dev/core-api.tf` and `infra/modules/ecs-fargate-web-service/`;
  `variables.tf:224-274` (eight variables); `dev.tfvars:149-163`; `amplify-customer-web.tf:46,52`;
  `amplify-consoles.tf:19-24,84,110-119`; `edge-gateway.tf` CORS; comments in `edge-domain.tf:81`,
  `insights.tf:9-10`; `infra/envs/README.md:41-59,145`; `infra/observability/README.md` and four
  alert files.
- **Build/scripts**: `Makefile:28-35,183-196,202-298,476-495`; `start-db.sh`; `stop-db.sh`;
  `scripts/stripe-listen.sh`; `scripts/check-no-telemetry-pii.sh`; `scripts/mobile-guard.sh:54`;
  `.github/workflows/web.yml:83,116`.
- **Clients**: customer-web (~28 files incl. `lib/config.ts`, `lib/api/core.ts`, `lib/api/proxy.ts`,
  `app/api/*`, `account/hot-path`, `e2e/home.spec.ts:155`); shop-web (`env.ts`, `api.ts`,
  `useShopLive.ts`, `fulfillment/repo.ts`, `RefundSheet.tsx`); back-office (`env.ts`, `api.ts`,
  `orders/refundRepo.ts`); customer-mobile (`build.gradle.kts:38`, `AppConfig.kt`, `AppContainer.kt`,
  `EffyHttpClient.kt`, repositories, `BearerToken.Core`, `AuthHeadersTest.kt`).
- **Edge**: `customer/serverless.yml:6-9` and `customer/package.json` (routing law);
  `admin/serverless.yml:326`; ~28 files with comments naming core-api.
- **Docs**: `.specify/memory/constitution.md` (Principle III at 423-435; 625; 635-637; Principles VI
  and VII wording; quality gate) — MAJOR, v2.0.0 → 3.0.0; `ARCHITECTURE.md:19,30,41-43,148-211,222,
  253,260-262,429,438-443,472,490`; `platform-brief.md:37,49-50,71,73,80`;
  `docs/api/path-assignment.md`, `error-envelope.md`, `versioning-policy.md`; `CLAUDE.md`;
  `README.md`; `ORDER-FLOW-GAPS.md`; `docs/audiences/*`, `docs/insights-architecture.md`,
  `docs/logistics-engine-architecture.md`.
- **Not edited**: applied migrations in `db/migrations` (eight mention core-api in comments),
  past specs, `FEATURE-HISTORY.md` history.

## 13. Local hygiene

`apis/core-api/.env` (untracked, gitignored) contains a Stripe **test** secret key and webhook secret
in plaintext. `apis/core-api/tmp/core-api` is a 50 MB untracked build output. Both go with the
directory; rotate the test keys if the file was ever shared.

## 14. Latency targets previously pinned to the hot path

| Target | Set by |
|---|---|
| Search < 1 s for 95% | 019 SC-004 |
| Filter/facets 1 s p95, 2 s p99 at ≥ 50,000 products | 043 SC-002 |
| 200-item saved list < 2 s | 033 SC-006 |
| Intent inside the 12 s client timeout | 051 plan |
| New order on shop Today ≤ 10 s p95 | 058 |
| Proving read < 100 ms p95 (local) | 004 SC-007 — lapses with the diagnostic |

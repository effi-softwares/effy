# Implementation Plan: Retire the Hot Path — One Serverless Backend

**Branch**: `070-retire-core-api` | **Date**: 2026-10-05 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/070-retire-core-api/spec.md`

## Summary

Everything `core-api` does is rebuilt in TypeScript on `edge-api`, all four consuming apps switch
in one cut-over, and the container service, load balancer and registry are destroyed. Verification
follows the switch and defects are fixed forward (Clarifications, 2026-10-04).

Four findings from the code shape the plan:

1. **The latency objection rested on a laptop measurement.** The "135 ms per database round trip"
   that kept shopper traffic off serverless was measured from a local core-api to Sydney
   (`FEATURE-HISTORY.md:1548`). In-region functions do not pay it, so reads are ported
   statement-for-statement and measured before anything is optimised (research R1).
2. **Shoppers need their own database role.** Every edge function connects as the master user with
   uncapped concurrency against ~85 connections. A dedicated role with a connection limit is what
   keeps a shopper burst from locking out staff (R4).
3. **Money logic must exist once but be called from three services.** Staff refunds belong with
   their audiences (`orders`, `shop`); checkout belongs in `commerce`. One shared module holds the
   payment provider, payment finalisation, refund and cancel (R3).
4. **The webhook fix needs no schema.** Recording "event seen" inside the transaction that handles
   it is enough; the existing table already supports it (R6).

Of core-api's 52 feature routes, 48 are relocated, 2 are replaced by routes the `shop` service
already serves (platform status), and 2 are retired (the reachability ping and the live stream);
2 promo routes are new. Its three process endpoints (`/metrics`, `/healthz`,
`/readyz`) go with it ([contracts/api-migration.md](contracts/api-migration.md)).

## Technical Context

**Language/Version**: TypeScript on Node 22 (`apis/edge-api/*`, `packages/*`), TypeScript/React 19
(`apps/customer-web` on Next 16, `apps/shop-web`, `apps/back-office`), Kotlin 2.4 / Compose
Multiplatform (`apps/customer-mobile`), HCL (`infra/`). **Go is removed from the repository.**

**Primary Dependencies**: one new — the payment provider's Node SDK (`stripe`), imported only
through `@effy/edge-shared/payments`. One new dev dependency for the operator tools' runner
(`tsx`). Existing: `pg`, `pino`, AWS SDK v3 (S3 presign, Cognito), Serverless Framework 3.40,
`serverless-esbuild`.

**Storage**: PostgreSQL 16, raw SQL, two Goose migrations (applied forward-only; each carries a
Down section by repo convention), **no new table or column**
([data-model.md](data-model.md)): a connection-limited role for shopper services; removal of the
stream's notification.

**Testing**: Vitest — unit, `*.container.test.ts` against the real migrations, `*.guard.test.ts`,
config-contract tests reading `serverless.yml`. Kotlin `commonTest` wire-contract tests (kept
unchanged). `shared-types` contract drift guards. The Go test suite is deleted; what replaces it is
fixed in research R13.

**Target Platform**: Lambda (arm64) behind the existing shared HTTP gateway; customer-web,
shop-web, back-office on Amplify; customer-mobile on Android and iOS.

**Project Type**: monorepo — after this feature, one backend, three web apps, three mobile apps.

**Performance Goals**: search and filter 95% < 1 s, 99% < 2 s; 200-item saved list < 2 s; start
payment 95% < 6 s including the first request after idle; first page after idle < 4 s (SC-004..007).

**Constraints**: payment recorded exactly once (FR-016); no window oversold (FR-017); refunds never
exceed the amount paid (FR-019); integer-cent arithmetic (FR-013); wire shapes and refusal codes
unchanged (FR-007); shopper traffic cannot exhaust database connections (FR-030); gateway ceiling
30 s; one connection per container; CloudFormation 500 resources per service; operator runs every
deploy, apply and migration.

**Scale/Scope**: ~14,000 lines of Go behaviour re-implemented; 2 new services (~52 functions),
4 routes added to 2 existing services; 1 shared money module and ~6 shared helpers; 2 migrations;
4 client apps re-pointed; 1 Terraform module and ~20 resources removed; 1 constitution amendment
and ~12 documents corrected.

### Unknowns

All resolved in [research.md](research.md): latency (R1), service layout (R2), money module (R3),
connection isolation (R4), paths and credentials (R5), webhook (R6), stuck refunds (R7), time
limits (R8), exactness (R9), metrics and alarms (R10), shop console (R11), operator tools (R12),
proof (R13), governance (R14), sequence (R15).

## Constitution Check

Evaluated against **v2.0.0** as it stands, and against the **v3.0.0** amendment this feature makes
first (R14).

| Principle | v2.0.0 | After amendment | Note |
|---|---|---|---|
| I. Spec-driven | PASS | PASS | Spec carries no tech; the technical index is a separate file. Research corrected one premise the spec inherited (R1) and settled one "may need" (R6). |
| II. Shared contracts | PASS | PASS | Wire types stay in `packages/shared-types`, unchanged; Kotlin stays generated. The Go mirrors — the second copy — are deleted. New shared helpers have one home each. |
| III. Dual-path discipline | **FAIL** | PASS | The feature places all shopper traffic on the cold path and removes the hot path. Resolved by amending the principle **before any code moves** (FR-001). |
| IV. Auth isolation | PASS | PASS | No new pool or authorizer. Each route attaches to the existing authorizer for its audience; staff refund routes sit in the services that already hold those audiences. |
| V. Design | PASS | PASS | No new screen or token. Two removals: the customer "hot-path" diagnostic page and the shop console's live indicator. |
| VI. Layered architecture | PASS | PASS | Function → service → repository in every new slice; raw SQL; rows mapped explicitly; no DI framework. "Both backends publish" is reworded to one. |
| VII. Observability | **FAIL** (pre-existing) | PASS | The principle requires Prometheus and Grafana; neither was ever built. The amendment restates it as what exists — structured logs, CloudWatch metrics and alarms — and this plan makes four inert alert rules live. |
| Locked technology | **FAIL** | PASS | "Hot path: Go 1.25; Gin; pgx" is removed by the amendment. |
| Real-world identifiers | PASS | PASS | No new address. Alarms use the existing alerts topic, whose endpoint the operator already supplied. |

**Gate result**: three failures against v2.0.0, all removed by the amendment that is this plan's
first task. No code task may start before it. Re-checked after design: unchanged. Deviations that
remain *within* v3.0.0 are in Complexity Tracking.

### Telemetry declared (Principle VII)

| Signal | Namespace / place | Dimensions | Replaces |
|---|---|---|---|
| `ServiceabilityChecks` | `Effy/Storefront` | `serviced` | `delivery_serviceability_checks_total` |
| `DeliveryQuotes`, `DeliveryQuoteFailures` | `Effy/Commerce` | `outcome` | `delivery_quotes_total`, `…_failures_total` |
| `SlotBookings` | `Effy/Commerce` | `outcome` (`held`, `confirmed`, `refused_full`, `refused_cutoff`, `refused_uncollectable`, `over_capacity`) | `effy_delivery_slot_bookings_total` |
| `StandardDateRefused` | `Effy/Commerce` | — | `effy_delivery_standard_date_refused_total` |
| `StockDeducted`, `StockBlocked` | `Effy/Commerce` | `outcome` / `stage` | `effy_stock_deducted_total`, `effy_stock_blocked_total` |
| `RefundsIssued`, `RefundOutcomes`, `RefundSubmitFailures` | `Effy/Commerce` | `kind` / `outcome` / `failure` | the three `effy_refund_*` counters |
| `OrdersCancelled`, `ShopRefundDenied` | `Effy/Commerce` | `actor` / `reason` | `effy_orders_cancelled_total`, `effy_shop_refund_denied_total` |
| `WebhookEvents` | `Effy/Commerce` | `type`, `outcome` (`handled`, `duplicate`, `ignored`, `failed`) | new (FR-023) |
| `RefundsReconciled`, `RefundsStuck` | `Effy/Commerce` | `outcome` | new (FR-024) |
| `ShopperConnectionsRefused` | both | — | new (FR-030) |
| Requests, errors, duration per operation | built-in per-function metrics | function | `http_requests_total`, `http_request_duration_seconds` |

| Alarm (on the existing alerts topic) | Fires when (sum over the period) | Replaces |
|---|---|---|
| Quote failures | `DeliveryQuoteFailures` ≥ 5 in 15 min | `alerts/032-delivery-pricing.yml` |
| Stock blocked at checkout | `StockBlocked{stage=checkout}` ≥ 5 in 15 min | `alerts/054-product-inventory.yml` |
| Refund submit failures | `RefundSubmitFailures` ≥ 1 in 5 min | `alerts/055-refunds-cancellation.yml` |
| Refund failed at the provider | `RefundOutcomes{outcome=failed}` ≥ 1 in 5 min | same |
| Slot over capacity | `SlotBookings{outcome=over_capacity}` ≥ 1 in 5 min | `alerts/069-delivery-slots.yml` |
| Refund stuck | `RefundsStuck` ≥ 1 in 5 min (a refund unresolved for 15 min) | new |
| Webhook failing | `WebhookEvents{outcome=failed}` ≥ 3 in 15 min | new |

Seven alarms. Thresholds are starting values for a pre-launch environment; missing data is treated
as not breaching. The webhook threshold is above one so that a brief shopper-connection refusal,
which the provider's retry recovers, does not page.

No product-analytics event changes. No metric carries a shopper identifier, a list name or
instruction text (FR-034).

## Project Structure

### Documentation (this feature)

```text
specs/070-retire-core-api/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── migration-inventory.md      # the index of what exists today
├── contracts/
│   └── api-migration.md
└── checklists/requirements.md
```

### Source Code (repository root)

```text
apis/
├── core-api/                         # DELETED (last, after the verification walk)
└── edge-api/
    ├── shared/src/
    │   ├── lib/
    │   │   ├── money.ts              # NEW  integer cents; parse/format without floats
    │   │   ├── availability.ts       # NEW  the one "purchasable" predicate + guard test
    │   │   ├── customer-identity.ts  # NEW  sub → customer; barred/closing; 401/403
    │   │   ├── metrics.ts            # NEW  one EMF helper
    │   │   ├── db.ts                 # EDIT map "too many connections" to a typed error
    │   │   ├── http.ts               # EDIT unavailable() gains Retry-After
    │   │   └── order-completion.ts, collection-deadline.ts   # EDIT drop "mirrors Go" duty
    │   ├── delivery/                 # NEW  fee engine, quote, zones, slots, standard days, localities
    │   ├── cart-policy/              # NEW  read + enforce
    │   └── payments/                 # NEW  own export path: provider gateway, finalise, refund, cancel
    ├── storefront/                   # NEW SERVICE (public)
    │   ├── serverless.yml
    │   └── src/{functions,catalog,search,facets,home,promotions,serviceability,status}/
    ├── commerce/                     # NEW SERVICE (customer + 3 public routes + 1 schedule)
    │   ├── serverless.yml
    │   └── src/{functions,cart,promo,saved,lists,checkout,orders,refunds,webhook,reconcile,lib}/
    ├── orders/src/functions/         # EDIT +3 back-office refund / cancel / decline
    ├── shop/src/functions/           # EDIT +1 shop-manager refund; triggers test updated
    ├── ops/                          # NEW (not deployed): create-first-admin, delete-admin, load-localities
    └── customer/serverless.yml       # EDIT remove the routing-law comment

apps/
├── customer-web/                     # lib/api/core.ts removed; proxies and 3 browser calls → edge;
│                                     #   account/hot-path page removed; core base-URL key removed
├── customer-mobile/                  # coreClient + BearerToken.Core + CORE_API_BASE_URL removed;
│                                     #   repositories use edgeClient with new paths
├── shop-web/                         # useShopLive removed; refund repo → edge; core key removed
└── back-office/                      # refund repo → edge; core key removed

packages/
├── web-kit/src/runtime/live.ts       # DELETED (+ its export and test)
└── shared-types/                     # comments only; types and generated Kotlin unchanged

db/migrations/
├── <ts>_shopper_role.sql             # A
└── <ts>_drop_shop_ops_poke.sql       # B

infra/
├── envs/dev/
│   ├── core-api.tf                   # DELETED
│   ├── commerce.tf                   # NEW  SSM for shopper credentials + payment secret addresses
│   ├── commerce-alarms.tf            # NEW
│   ├── edge-gateway.tf               # EDIT storefront origins
│   ├── amplify-*.tf, variables.tf, dev.tfvars   # EDIT core-api variables and env vars removed
├── modules/ecs-fargate-web-service/  # DELETED
└── observability/alerts/*.yml        # DELETED (replaced by alarms); README corrected

Makefile                              # core-* targets removed; tool targets re-pointed;
                                      #   edge-deploy service list + db-shopper-role added
start-db.sh, stop-db.sh               # container-service calls removed
scripts/stripe-listen.sh              # forwards to the offline commerce webhook
.specify/memory/constitution.md       # 3.0.0
ARCHITECTURE.md, platform-brief.md, CLAUDE.md, README.md, docs/api/*, docs/audiences/*
```

**Structure Decision**: two new edge services split by audience (`storefront` public, `commerce`
customer), following 004's decomposition and the one-audience-per-service preference. Rules shared
between services live in `@effy/edge-shared`; the money module has its own export path so the
provider SDK is bundled only into functions that move money.

## Build Order

Single cut-over, so these are build phases, not release stages. Each ends with its tests green.

| Phase | Content | Depends on |
|---|---|---|
| 0. Governance | Constitution 3.0.0; architecture, brief, path-assignment, CLAUDE.md corrected | — |
| 1. Foundations | Shared helpers; `storefront` and `commerce` scaffolds with health routes and a packaging dry run; migration A; `commerce.tf`; origins | 0 |
| 2. Browse | Storefront reads, search, facets, serviceability, localities, status (US1) | 1 |
| 3. Saved and cart | Saved, lists, cart, promo; cart policy; availability (US2) | 1 |
| 4. Checkout | Delivery engine, quote, intent, confirm, payment methods, finalisation, webhook, order reads (US3) | 3 |
| 5. Refunds | Refund and cancel in the money module; customer, back-office and shop routes; reconciler (US4) | 4 |
| 6. Remainders | Operator tools (US6); stream removal and migration B (US5) | 1 |
| 7. Proof | Real-database suites; guards re-pointed; mirrors collapsed; metrics and alarms | 2–5 |
| 8. Clients | customer-web, customer-mobile, shop-web, back-office re-pointed — in `tasks.md` this is interleaved into each story; nothing is released to the deployed apps before cut-over | 2–5 |
| 9. Cut-over | Operator: stages 1–4 of [quickstart.md](quickstart.md) | 7, 8 |
| 10. Close | Verification walk, fix forward; delete Go and the module; history and sign-off | 9 |

Phases 2, 3 and 6 are independent of each other once 1 is done.

## Complexity Tracking

| Deviation | Why needed | Simpler alternative rejected because |
|---|---|---|
| Constitution amended to 3.0.0 by this feature (III, VII, locked technology) | The feature *is* the reversal of Principle III; VII states infrastructure that was never built | Recording an "exception" to III for every shopper route would leave the constitution describing a platform that does not exist |
| `commerce` mixes one authorizer with three unauthenticated routes (cart preview, cart policy, webhook) | They share the cart and payment code with the authenticated routes | A separate public service would split one slice across two deployments; per-route authorizer omission already exists (046) |
| Payment secrets readable by three services (`commerce`, `orders`, `shop`) instead of one process | Staff refund routes sit with their audiences and off the shopper connection limit | Routing staff refunds through `commerce` would let a shopper burst block refunds and mix three audiences in one service |
| A second database role, with an operator step to set its password | The only connection cap that holds regardless of function count | Reserved concurrency is per function and draws on an account quota of unknown size; gateway throttling cannot distinguish shoppers from staff |
| The webhook and the refund reconciler run in `commerce`, under the shopper connection limit | They share finalisation and refund code with checkout | A shopper burst can delay them, but the provider retries the webhook and the reconciler runs again in five minutes; a separate service on the staff role would split the payment slice across two deployments |
| Two deferred defects are ported knowingly (undelivered order-placed record; unswept abandoned orders) | Clarifications: get to one backend first | Fixing them here widens a migration whose risk is already concentrated in the payment path |

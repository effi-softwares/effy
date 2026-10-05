# 070 — Sign-off record

Status (2026-10-05, evening): **THE NEW BACKEND IS DEPLOYED AND THE CLIENTS ARE RELEASED. THE
TEARDOWN IS WRITTEN AND NOT APPLIED. NOT WALKED BY A PERSON.** 93 of 102 tasks done.

*(Earlier today:)* 87 of 102 tasks done. Every one of the 15 that remain is either an operator step, or
work that must not exist in the working tree until the operator has switched traffic.

`core-api` is untouched and still serving. Nothing in the working tree destroys anything.

## What exists now

| Story | State |
|---|---|
| US1 Browse | `storefront` service, 8 public routes; web + mobile re-pointed |
| US2 Cart, saved, lists, promo | `commerce` service; promo apply/remove now exist (they never did) |
| US3 Checkout, payment, webhook, orders | quote, intent, confirm, kept cards, order history and receipt; the webhook records an event only in the transaction that handles it |
| US4 Refunds and cancellation | one implementation in `@effy/edge-shared/payments`, reached from `commerce` (customer), `orders` (back-office) and `shop` (shop manager); refund reconciler every 5 minutes |
| US5 Live updates withdrawn | stream client, `web-kit` reader and the database notification removed; Today refreshes every 30 s |
| US6 Operator tools | `apis/edge-api/ops`: create-first-admin, delete-admin, load-localities; same `make` targets |
| US7 (before the switch) | guards re-pointed, dropped-column guard, seven alarms in Terraform, clients' second host removed, stale wording swept |

Every consumer is re-pointed: customer-web, customer-mobile, shop-web, back-office. None of them
references the old backend's address any more.

## Test evidence (all run 2026-10-05, real PostgreSQL where it says so)

| Suite | Result |
|---|---|
| edge `shared` (real DB on) | **398 passed** |
| edge `commerce` (real DB on) | **285 passed** |
| edge `storefront` (real DB on) | **180 passed** |
| edge `orders` (real DB on) | **77 passed** |
| edge `ops` (real DB on) | **22 passed** |
| edge `admin` 198 · `customer` 217 · `fleet` 236 · `driver` 137 · `inventory` 62 · `catalog` 43 (real DB on) | all passed |
| edge `shop` (real DB on) | 472 passed, **2 failed — both pre-existing** (below) |
| edge `notifications` 63 · `auth` 151 | passed |
| customer-web | 593 passed · typecheck clean · dependency rules clean |
| shop-web | 448 passed (was 456: the live-stream tests were deleted with the stream) |
| back-office | 278 passed |
| web-kit | 61 passed |
| customer-mobile host tests | pass (760 across variants) · `mobile-guard` clean |
| `terraform validate` (dev root, with the alarms) | valid; `fmt` clean |
| both new migrations | apply, roll back and re-apply cleanly in a throwaway local database |

Proven against the real migrations, not fakes:

- **A payment is recorded once.** Four deliveries racing on separate connections apply once; a
  repeated intent resolves to the same order and the same payment intent.
- **The webhook cannot lose an event.** Handling that fails after doing its work leaves **no** record
  of the event, the order unpaid and stock untouched; the retry is processed. Six concurrent
  deliveries of one event: one applies, five are duplicates.
- **Slots.** Twenty shoppers at once into a three-place window: three held, seventeen refused before
  the provider is called. A late payer into a full window is honoured and flagged.
- **Stock.** Two shoppers paying at once for the last unit: the count stops at zero and the second
  order's pick line is flagged short.
- **Refunds.** Two staff at the same instant cannot exceed what was paid; a refund still on its way
  to the provider already holds the ceiling; a bank rejection becomes `failed` and nothing reopens
  it; a refund made by hand at the provider is recorded as external.
- **Cancellation.** Customer and staff cancelling together refund once; a customer's window closes
  when any shop starts; nobody may cancel once goods have left.
- **The reconciler.** A refund left uncertain is recorded when the provider has it, sent under its
  stored key when it does not, never twice — and never sent if the order has since been refunded
  another way.
- **What the mobile app decodes is what the services send.** The backend tests read the fixtures
  out of the mobile app's own contract tests (saved items, lists, kept cards, billing details,
  delivery quote, banner) and compare them with the real mappers, byte for byte.

## Defects found while building, and fixed

Each is in [contracts/api-migration.md §3](contracts/api-migration.md); none was in the plan.

| # | Defect (present in the old backend) | Now |
|---|---|---|
| 6d | An empty cart reached the payment provider as a zero amount and came back a 500 | refused with a reason, nothing written |
| 6e | Two shoppers paying at once for the last unit: neither order was flagged short | the second is flagged when its pick line is created |
| 8a | A stalled refund, if ever retried after the order was refunded another way, would exceed what was paid | closed as refused by the platform |
| 8c | **Two refunds issued at the same instant could each pass the ceiling** — a recorded-but-unacknowledged refund was not counted; only the payment provider refusing the second prevented an over-refund | counted while in flight (60 s); found by a test that failed one run in four |
| 6f | The quote's `expiresAt` was the one time in that document written in UTC | Melbourne offset, like the rest |

## Found, not caused by 070, not fixed

- `apis/edge-api/shop/src/attention/repository.container.test.ts` — "resolves recipients and their
  manager flag from the PLATFORM RECORD" fails (`column "id" does not exist`).
- `apis/edge-api/shop/src/orders/repository.container.test.ts` — "pages with a total order and a
  stable total" returns the wrong page.
  Both fail identically with 070's migrations removed.
- `scripts/check-no-telemetry-pii.sh` exits 1 on `apis/edge-api/notifications/src/worker/drain.ts`
  (the word `email` as a channel name, from 053). It failed the same way before this feature.

## Done after the first handover (2026-10-05, nothing deployed yet)

Checked read-only before starting: the work is committed (`722458bd`), `storefront` and `commerce`
answer 404 on the gateway, no `effy-dev-commerce-*` alarm exists, and `core-api` answers 200. **The
switch has not happened, so the teardown is still unwritten.**

- **`scripts/check-no-phantm.sh` passes again.** Seven lines in the specs of 042, 045 and 050 named
  the prohibited address in the course of saying it is prohibited; they now refer to the rule
  (CLAUDE.md § Prohibited values) instead.
- **Inventory accounting** written (below). Rows marked *Pending* or *To destroy* wait on the teardown.
- **Document sweep, the part that does not wait on the teardown**: `README.md` (backend sections
  rewritten for one backend; the `core-api` section carries a retirement notice until its targets
  are deleted), `ORDER-FLOW-GAPS.md`, `docs/logistics-engine-architecture.md`,
  `docs/audiences/shop-capabilities.md`, `docs/api/path-assignment.md`, `apps/customer-web/README.md`,
  and the comments in `packages/shared-types`, `packages/api-client` and the three mobile apps.
- **Two dated records are annotated rather than rewritten**, because rewriting them would falsify
  what was known when they were written: `docs/insights-architecture.md` (its live-stream half is
  superseded) and the per-feature notes in `docs/audiences/customer-capabilities.md` (its capability
  tables are corrected). The sweep's allow-list in [quickstart.md](quickstart.md) names them, with
  `docs/research/` and `docs/prd/`.
- **Three generated mobile contract files regenerated** (`CommerceDto.kt`, `ShopDto.kt`,
  `DriverDto.kt` and their schemas) — comment text only, because the type comments they are
  generated from changed. ⚠ `make cm-contract-check` / `sm-contract-check` compare against the
  **committed** files, so they report drift until these are committed.

## Deviations from the plan, recorded

| What | Why |
|---|---|
| Platform status not ported | `shop` already serves `/shop/v1/status` and `/v2/status` with the same statement |
| Storefront origins are a gateway-only list; no production origin in dev | the storefront never uploads; the old list let a prod page call dev |
| `created_at_key` in the card projection | the driver returns millisecond timestamps; a "newest" cursor built from that skips products |
| Money metrics all go to `Effy/Commerce`, whichever service emitted them | an alarm per service would watch one of three; `MONEY_METRIC_NAMESPACE` |
| `WebhookFailures` added beside `WebhookEvents{outcome=failed}` | an alarm cannot sum series it must discover |
| The measurement harness lives in `apis/edge-api/ops/src/verify/` (front door: `scripts/verify-070/README.md`) | it needs the database client and runner that package already has |
| Wire-contract fixtures are read from the mobile tests rather than copied | one copy cannot drift from itself |
| Both consoles' second host removed now, not at teardown | nothing reads it any more; the Terraform that still sets the variable is removed with the teardown |

## OPERATOR — what happens next, in order

All with `AWS_PROFILE=ef`. Each `make` target prompts before it changes anything. **Commit first**:
`make db-up` refuses uncommitted migrations, and Amplify builds what is pushed.

### Stage 2 — deploy alongside (core-api keeps serving; nothing here is destructive)

```
make plan ENV=dev        # expect ONLY: 7 new aws_cloudwatch_metric_alarm (6 in "commerce[…]" + commerce_refund_submit_failures)
make apply ENV=dev

make edge-deploy SERVICE=storefront ENV=dev
make edge-deploy SERVICE=commerce   ENV=dev
make edge-deploy SERVICE=orders     ENV=dev
make edge-deploy SERVICE=shop       ENV=dev
```

⚠ **If the plan shows any change under `module.core_api`, or any destroy, stop.** The working tree
contains no teardown change; a destroy means something is wrong.

Prove an alarm reaches you, once (it resets itself):

```
aws cloudwatch set-alarm-state --profile ef --region ap-southeast-2 \
  --alarm-name effy-dev-commerce-webhook-failing --state-value ALARM --state-reason "070 delivery proof"
```

Smoke (no sign-in needed):

```
B=https://edge-api.dev.effyshopping.com
curl -s -o /dev/null -w '%{http_code}\n' $B/storefront/healthz            # 200
curl -s -o /dev/null -w '%{http_code}\n' $B/commerce/readyz               # 200
curl -s "$B/storefront/v1/products?q=milk" | head -c 300
curl -s "https://core-api.dev.effyshopping.com/v1/storefront/products?q=milk" | head -c 300   # same ids, same order, same total
curl -s -X POST $B/commerce/v1/cart/preview -H 'content-type: application/json' -d '{"lines":[]}' | head -c 200
curl -s -o /dev/null -w '%{http_code}\n' -X POST $B/commerce/v1/stripe/webhook -d '{}'        # 400 — no signature
curl -s -o /dev/null -w '%{http_code}\n' $B/commerce/v1/cart                                  # 401 — no credential
```

Then measure the two early targets: search warm (SC-004: 95% < 1 s) and a first request after the
service has sat idle (SC-007: < 4 s). **If either is missed, stop and tell me** — nothing
irreversible has happened.

### Stage 3 — switch

1. At the payment provider (test mode): **add** a webhook endpoint
   `https://edge-api.dev.effyshopping.com/commerce/v1/stripe/webhook` for
   `payment_intent.succeeded`, `payment_intent.payment_failed`, `refund.created`, `refund.updated`,
   `refund.failed`. Put **its** signing secret into Secrets Manager `/effy/dev/stripe/webhook_secret`.
   Leave the old endpoint enabled for now.
2. Push the branch Amplify deploys (customer-web, shop-web, back-office) and rebuild customer-mobile.
   ⚠ customer-mobile's `secrets.properties` no longer needs `CORE_API_BASE_URL`.
3. One paid test order on the web. Expect: order paid, receipt queued, stock reduced, cart empty, the
   order on the shop console within 30 s, and the provider's dashboard showing the **new** endpoint
   answering 200.
4. Disable the old webhook endpoint at the provider.
5. `make db-up ENV=dev` → applies `20261005075916_drop_shop_ops_poke.sql`. ⚠ After step 2, not
   before: an old console still open would stop being told to refresh and fall back to a 2-minute
   re-read. Harmless, but avoidable.

**Tell me when this stage is done.** Only then do I write the teardown.

### Stage 4 — teardown: WRITTEN 2026-10-05, NOT APPLIED

Checked read-only before writing it: `storefront`, `commerce`, `orders` and `shop` answer on the
gateway (health 200, search returns products, the webhook refuses an unsigned body with 400), the
seven alarms exist and are `OK`, and all three hosted apps were last built from commit `51fee42f`.

⚠ **ONE THING I COULD NOT CONFIRM, AND IT MATTERS BEFORE YOU APPLY.** The `Effy/Commerce` metric
namespace held only `RefundsStuck` (the reconciler's heartbeat) — no `WebhookEvents`, no
`DeliveryQuotes`, no `StockDeducted`. That means **no checkout and no provider notification had
passed through the new services yet**. Before applying: place one paid test order on the web, and
confirm in the provider's dashboard that the **new** endpoint
(`…/commerce/v1/stripe/webhook`) answered 200. If the webhook still points only at the old backend,
destroying it means paid orders are confirmed only by the shopper's return to the site, and a refund
a bank rejects later is never seen.

What the change contains (one change, because the pieces reference each other):

- deleted `infra/envs/dev/core-api.tf` and `infra/modules/ecs-fargate-web-service/`
- removed the eight `core_api_*` variables and `core_api_cors_origins` from `dev.tfvars`
- removed `NEXT_PUBLIC_CORE_API_BASE_URL` (storefront) and `VITE_CORE_API_BASE_URL` (both consoles)
- `start-db.sh` / `stop-db.sh` now only start and stop the database
- `Makefile`: `core-run`, `core-test`, `core-lint`, `core-build`, `core-ecr-login`,
  `core-image-push`, `core-deploy`, `cm-ngrok-core` removed
- `infra/envs/README.md` and the root `README.md` no longer describe a second backend

`terraform validate` passes and `fmt` is clean. **I have not run `plan` or `apply`.**

```
# 1. The registry refuses deletion while it holds images. Empty it:
aws ecr batch-delete-image --profile ef --region ap-southeast-2 --repository-name effy-dev-core-api \
  --image-ids "$(aws ecr list-images --profile ef --region ap-southeast-2 \
      --repository-name effy-dev-core-api --query 'imageIds[*]' --output json)"

# 2. Commit this change, then:
make plan ENV=dev
```

**The plan must show exactly this, and nothing else:**

| | Resources |
|---|---|
| **20 to destroy** | under `module.core_api`: `aws_ecs_service.this`, `aws_ecs_task_definition.this`, `aws_ecs_cluster.this`, `aws_lb.this`, `aws_lb_target_group.this`, `aws_lb_listener.https`, `aws_lb_listener.http_redirect`, `aws_security_group.alb`, `aws_security_group.task`, `aws_ecr_repository.this`, `aws_ecr_lifecycle_policy.this`, `aws_iam_role.execution`, `aws_iam_role_policy_attachment.execution_managed`, `aws_iam_role_policy.execution_secrets[0]`, `aws_iam_role.task`, `aws_iam_role_policy.task_s3[0]`, `aws_cloudwatch_log_group.this`, `aws_route53_record.a`, `aws_route53_record.aaaa` — plus `aws_ssm_parameter.core_api_base_url` |
| **changed in place** | the three Amplify apps (one environment variable removed from each) |
| **0 to add** | |

⚠ **Stop if the plan destroys anything else** — in particular the database, a Cognito pool, the
certificate or zone (`module.dns`), the media bucket, either payment secret, the alerts topic, or
anything in `commerce.tf` / `commerce-alarms.tf`.

```
make apply ENV=dev
make db-up ENV=dev          # migration B (drop_shop_ops_poke), if not already applied
```

Then check:

```
dig +short core-api.dev.effyshopping.com                 # nothing
aws ecs list-clusters --profile ef --region ap-southeast-2 --query 'clusterArns'        # no effy-dev-core-api
aws elbv2 describe-load-balancers --profile ef --region ap-southeast-2 --query 'LoadBalancers[].LoadBalancerName'   # no effy-dev-core-api
./stop-db.sh && ./start-db.sh                            # each runs to the end
```

The Amplify apps rebuild on their next push; the removed variable was already unused by the code
they run. The task log group is destroyed with the service — seven days of the old backend's logs
go with it.

### Stage 5 — the walk and the measurements

The fifteen journeys in [quickstart.md](quickstart.md), and the harness in
[`scripts/verify-070/README.md`](../../scripts/verify-070/README.md). Bugs are fixed forward.

## Inventory accounting (T099 — every row of [migration-inventory.md](migration-inventory.md))

**Relocated** = has a new home, tested. **Repaired** = relocated and a defect fixed. **Retired** =
deliberately not carried. **Deferred** = carried over unchanged, on record. **To destroy** = exists
until the teardown is applied; this column is finished after Stage 4.

### §2 Routes (52)

| Was | State | Now |
|---|---|---|
| 8 storefront reads (`home`, `categories`, `facets`, `products`, `products/:id`, `promotions/:id`, `serviceability`, `localities`) | Relocated; `products` and `products/:id` **repaired** (malformed input) | `storefront` — `/storefront/v1/…` |
| `cart/preview`, `cart/policy` (public) | Relocated | `commerce` |
| Saved (6), lists (8), cart (9) | Relocated | `commerce` |
| `cart/promo` POST, DELETE | **Repaired** — never existed | `commerce` |
| `checkout/quote`, `/intent`, `/confirm`; `payment-methods` GET, DELETE | Relocated; intent **repaired** (empty cart) | `commerce` |
| `orders` list, detail | Relocated (money no longer through floats — defect g) | `commerce` |
| `orders/:id/cancel`, `orders/:id/refund-requests` | Relocated | `commerce` |
| `stripe/webhook` | **Repaired** (defect b) | `commerce` |
| `admin/orders/:id/refunds`, `/cancel`, `admin/refund-requests/:id/decline` | Relocated | `orders` — `/orders/v1/…` |
| `shop/orders/:id/refunds` | Relocated; the order-scoped gate now has its TypeScript form | `shop` |
| `platform/status` v1, v2 | Retired — already served by `/shop/v1/status`, `/shop/v2/status` | — |
| `customer/ping` | Retired with the `account/hot-path` page | — |
| `shop/live` | Retired — live updates withdrawn | — |
| `/metrics`, `/healthz`, `/readyz` | Retired — each service has its own probes; metrics are CloudWatch | — |

### §4 Defects

| # | State |
|---|---|
| a promo routes | Repaired |
| b webhook loses events | Repaired |
| c `event_outbox` never drained | **Deferred** (clarification 4) — still written, still not delivered |
| d no refund reconciler | Repaired · no sweep of abandoned unpaid orders — **Deferred** · `cart_change_log` never pruned — **Deferred**, unchanged |
| e catalogue validation | Repaired |
| f `stop-db.sh` aborts after teardown | **Pending** — fixed with the teardown (T092) |
| g money through floats in order reads | Repaired |
| h alert rule on an unregistered metric | Retired with the four alert files |

### §6 Platform packages, metrics, tools

| Go | State | Now |
|---|---|---|
| `logger`, `health`, `httpx`, `media`, `db` | Already ported; extended | `shared/src/lib` |
| `auth` verifier | Relocated | gateway JWT authorizer per pool |
| `auth` StaffGate | Already ported | `shared/src/lib/back-office-authz.ts` |
| `auth` ShopGate (order-scoped) | Relocated | `shop/src/staff` (`shopMayRefundOrder`) |
| `customeridentity` | Relocated, now one helper | `shared/src/lib/customer-identity.ts` |
| `delivery` (engine, quote, zones, slots, standard days, localities, cutoff) | Relocated | `shared/src/delivery` |
| `cartpolicy` | Relocated | `shared/src/cart-policy` |
| `availability` + its guard | Relocated | `shared/src/lib/availability.ts`, `storefront/src/availability.guard.test.ts` |
| `money`, `pricing` | Relocated | `shared/src/lib/money.ts` |
| `events` (outbox append) | Relocated, still undrained | `shared/src/payments/outbox.ts` |
| `metrics` | Relocated as one EMF helper | `shared/src/lib/metrics.ts` |
| `config` | Relocated | each `serverless.yml` + its `config.contract.test.ts` |
| 14 metrics | Relocated (names in plan.md "Telemetry declared"); `http_*` are the built-in per-function metrics | `Effy/Storefront`, `Effy/Commerce` |
| `effy_shop_live_*`, `db_pool_connections_*` | Retired with their mechanisms | — |
| `create-first-admin`, `delete-admin`, `load-localities` | Relocated | `apis/edge-api/ops` |

### §11 Checks that depended on the Go source

| Check | State |
|---|---|
| `orders/service.test.ts` (read `stage.go`, `refunds/repository.go`) | Rewritten — asserts the shared function is used, not a copy |
| `refund-append-only.guard.test.ts` | Re-pointed; adds "exactly one writer" |
| `hidden-fulfilment.guard.test.ts` | Re-pointed to `storefront`, `commerce` and the shared money/delivery code |
| inventory `append-only.guard.test.ts`, `check-no-telemetry-pii.sh` | Re-pointed |
| `config/contract_test.go` | Each service's `config.contract.test.ts` |
| `db/schema_drift_test.go` | `shared/src/lib/schema-drift.guard.test.ts`, now over every service |
| `availability/guard_test.go` | `storefront/src/availability.guard.test.ts` |
| `checkout/customer_dto_guard`, `delivery_instructions_guard` | `commerce/src/checkout/checkout.guard.test.ts` |
| `saveditems`, `storefront`, `checkout` wire-contract tests | `commerce/src/wire.contract.test.ts`, `storefront/src/wire.contract.test.ts` — read the mobile fixtures |
| `delivery/deadline_contract_test.go` | `collection-deadline.contract.test.ts`, now calling the real checkout cutoff |

### §12 Files outside `apis/core-api`

| Group | State |
|---|---|
| Clients (customer-web, shop-web, back-office, customer-mobile) | Done |
| Edge (routing-law comments, `admin/serverless.yml`, stale mentions) | Done |
| Build/scripts: `stripe-listen.sh`, `check-no-telemetry-pii.sh`, `mobile-guard.sh`, `web.yml`, the three operator Make targets | Done |
| Build/scripts: `core-*` and `cm-ngrok-core` Make targets, `start-db.sh`, `stop-db.sh` | **Pending** — with the teardown (T092, T093) |
| Infra: alarms, observability README, four alert files, gateway CORS, `commerce.tf` | Done |
| Infra: `core-api.tf`, the Fargate module, eight variables, `dev.tfvars`, both Amplify files' leftover variable, `infra/envs/README.md` | **Pending** — the teardown (T091) |
| Docs: constitution, `ARCHITECTURE.md`, `platform-brief.md`, `docs/api/*`, `CLAUDE.md` | Done |
| Docs: `README.md`, `ORDER-FLOW-GAPS.md`, `docs/audiences/*`, `docs/insights-architecture.md`, `docs/logistics-engine-architecture.md` | Done 2026-10-05 (see below) |

### §7 Cloud resources · §13 local hygiene

| Item | State |
|---|---|
| 19 resources under `module.core_api`, `aws_ssm_parameter.core_api_base_url`, two outputs | **To destroy** — Stage 4 |
| Certificate and zone, RDS, both payment secrets, media bucket, Cognito pools, alerts topic | Keep — untouched |
| `apis/core-api/` (incl. `.env` and the 50 MB `tmp/` build output) | **To delete** — T100, after the walk |

## Still open

| Task | Whose | What |
|---|---|---|
| T033, T088, T089 | operator | Stage 2 above |
| T090 | operator | Stage 3 above |
| T091–T093 | Claude, **after T090** | author the teardown |
| T094 | operator | apply the teardown |
| T095, T097, T098 | operator + Claude | walk, measure, re-measure the baseline |
| T099 | Claude | account for every row of the inventory (needs the teardown applied to mark "destroyed") |
| T100 | Claude, after the walk | delete `apis/core-api/` |
| T101, T102 | Claude | final document sweep; finish the history entry with the bill before and after |

⚠ `apis/core-api/.env` (untracked) holds a payment-provider **test** secret key and webhook secret in
plain text. I have not copied them anywhere. If that file was ever shared, rotate both.

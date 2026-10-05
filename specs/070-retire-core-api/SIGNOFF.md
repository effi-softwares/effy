# 070 — Sign-off record

Status (2026-10-05): **CODE-COMPLETE UP TO THE CUT-OVER. NOT DEPLOYED, NOT COMMITTED, NOT WALKED BY
A PERSON.** 87 of 102 tasks done. Every one of the 15 that remain is either an operator step, or
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
- `scripts/check-no-phantm.sh` exits 1: seven lines in the specs of **042, 045 and 050** name the
  prohibited address in the course of saying it is prohibited. No 070 file contains it. Those specs
  were not edited here; say the word and I will reword the seven lines.
- `scripts/check-no-telemetry-pii.sh` exits 1 on `apis/edge-api/notifications/src/worker/drain.ts`
  (the word `email` as a channel name, from 053). It failed the same way before this feature.

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

### Stage 4 — teardown (I author it after Stage 3; you apply it)

I will write T091–T093: delete `core-api.tf` and the Fargate module, the `core_api_*` variables,
the consoles' and storefront's leftover environment variable, the Make targets, and fix
`start-db.sh` / `stop-db.sh`. You then empty the image registry, `make plan` (checked against
[migration-inventory.md §7](migration-inventory.md)), `make apply`.

### Stage 5 — the walk and the measurements

The fifteen journeys in [quickstart.md](quickstart.md), and the harness in
[`scripts/verify-070/README.md`](../../scripts/verify-070/README.md). Bugs are fixed forward.

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

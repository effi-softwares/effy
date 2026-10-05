# `verify-071` — the measurement harness for feature 071 (live updates)

Scripts the **operator** runs against **dev**, after the channel is deployed (quickstart Stage 1 and
Stage 4). They open real connections to the live channel and, for the latency check, pay real
**test-mode** orders. Each prints a PASS/FAIL table and exits non-zero on a FAIL.

The code lives beside the operator tools — `apis/edge-api/ops/src/verify/`.

⚠ **Claude wrote these and has not run them**: they act on live systems.
⚠ **Every input is an environment variable you supply at run time.** Nothing is defaulted from the
machine, nothing is written to disk, and no token or key belongs in a file in this repository.
⚠ **Tokens here are ACCESS tokens** — what the apps send. Copy one from a signed-in session
(browser dev tools → the `Authorization` header of any API request, without `Bearer `).

```bash
RUN="pnpm --filter @effy/edge-ops exec tsx src/verify"
export EDGE_API_BASE_URL=https://edge-api.dev.effyshopping.com
```

| Script | Criterion | Needs |
|---|---|---|
| `$RUN/live-authz.ts` | **SC-005** — 60-odd attempts to hear another shop's, customer's, driver's or audience's updates, by wildcard, by stale epoch, and to publish. Every one must be refused; own channel must be granted. | Any of `SHOP_ACCESS_TOKEN`, `CUSTOMER_ACCESS_TOKEN`, `DRIVER_ACCESS_TOKEN`, `BACK_OFFICE_ACCESS_TOKEN` — all four for the full count. Before the other audiences' routes exist (the early proof), `SHOP_ACCESS_TOKEN` alone. |
| `$RUN/live-latency.ts` | **SC-001, SC-002** — time from a payment to the update reaching the shop's open channel, over `ORDERS` (default 20) test orders. | `SHOP_ACCESS_TOKEN` of an operator at the shop that fulfils `PRODUCT_ID`; a test shopper's `CUSTOMER_ID_TOKEN` (+ `CUSTOMER_ACCESS_TOKEN`), their `ADDRESS_ID` in a served zone, a `PRODUCT_ID` that will not run out, `STRIPE_TEST_SECRET_KEY` (`sk_test_…` — a live key is refused). |

## What the early proof must also settle (research ⚠ PROVE)

| Item | How |
|---|---|
| The channel's authorizer accepts the apps' own access token | `live-authz.ts`: "own channel is granted" |
| A client cannot publish | `live-authz.ts`: the two publish rows per audience |
| An open subscription is not re-checked — and the epoch closes it | Quickstart walk row 11: suspend an operator whose console is open; "Live updates off" appears within 15 minutes with no reload. Note the minutes. |
| The Terraform provider has the Event API resources | Settled: `terraform validate` passes on `infra/envs/dev/live.tf` (provider 6.53). |
| Both mobile WebSocket engines send the two subprotocols | Settled when shop-mobile first connects on Android and on iOS (US3). |

## What is proved elsewhere

- **SC-003** (an idle hour makes no requests), **SC-004** (catch-up on reconnect), **SC-012**
  (≤ 3 reads per burst) and **FR-016** (typing is not disturbed) are properties of the client and
  are proved under a fake clock in `packages/web-kit/src/live/*.test.ts(x)`. Confirm SC-003 once
  by eye: leave Today open ten minutes with the network panel showing.
- **SC-008** (a change succeeds when its update cannot be sent) is `announce.test.ts` in
  `apis/edge-api/shared/src/live/` — `announce` resolves when every attempt throws. To see it live:
  remove the publish permission from one service, redeploy, pay an order, restore.
- **SC-010** (no data refresh timer remains) is `scripts/check-no-refresh-timers.sh` once US6 lands.

Record every figure in `specs/071-live-updates/SIGNOFF.md`. If SC-001 or SC-002 is missed, stop:
that is a decision for the operator, not a threshold to adjust.

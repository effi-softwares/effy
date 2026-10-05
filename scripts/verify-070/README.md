# `verify-070` — the measurement harness for feature 070

Four scripts the **operator** runs against **dev, in the payment provider's TEST mode**, after the
cut-over (quickstart Stage 5). They make real requests, create and pay real test-mode charges, and
then ask the **database** what happened. Each prints a PASS/FAIL table and exits non-zero on a FAIL.

The code lives beside the operator tools — `apis/edge-api/ops/src/verify/` — because that package
already has the database client and the runner; this directory is the front door.

⚠ **Claude wrote these and has not run them**: they act on live systems.
⚠ **Every input is an environment variable you supply at run time.** Nothing is defaulted from the
machine, nothing is written to disk, and no token or key belongs in a file in this repository.

```bash
RUN="pnpm --filter @effy/edge-ops exec tsx src/verify"
export EDGE_API_BASE_URL=https://edge-api.dev.effyshopping.com
export DB_DSN="$(AWS_PROFILE=ef bash infra/scripts/db-dsn.sh dev)"   # the assertions read the database
```

| Script | Criterion | Also needs |
|---|---|---|
| `$RUN/checkouts.ts` | SC-008 (and reports SC-006) — 200 checkouts with repeated, interrupted and simultaneous attempts | `CUSTOMER_ID_TOKEN` (+ `CUSTOMER_ACCESS_TOKEN`) of a **test shopper**, their `ADDRESS_ID` in a served zone, a `PRODUCT_ID` that will not run out, `STRIPE_TEST_SECRET_KEY` (`sk_test_…` — a live key is refused). `CHECKOUTS=20` for a short first run |
| `$RUN/webhooks.ts` | SC-009 — 100 signed deliveries, each event twice at once, plus forged and oversized ones | `STRIPE_WEBHOOK_SECRET` (the deployed endpoint's signing secret). Run `checkouts.ts` first: it replays notifications for orders already paid |
| `$RUN/refund-race.ts` | SC-010 — simultaneous refunds on one order; then waits for the reconciler | `BACK_OFFICE_ID_TOKEN` (an admin or manager), `ORDER_ID` of a **paid test order with nothing refunded** |
| `$RUN/overload.ts` | SC-013 — staff requests while the shopper role is at its connection limit | `SHOPPER_DB_DSN` (the **`effy_shopper`** role — the script refuses any other), `BACK_OFFICE_ID_TOKEN`, `SHOP_ID_TOKEN` |

## What they cannot show, and where that is shown instead

- **A failure inside the service mid-notification** (handling dies halfway, the provider retries).
  It cannot be forced from outside. It is forced, against a real database, in
  `apis/edge-api/commerce/src/checkout/checkout.container.test.ts`.
- **A refund the provider never answers.** Likewise forced in
  `apis/edge-api/shared/src/payments/refunds/refunds.container.test.ts`. `refund-race.ts` reports
  any that occur naturally and waits to see them resolved.
- **SC-004 / SC-005 / SC-007** (search, saved list, first page after idle) are timings of single
  requests — take them with `curl -w '%{time_total}\n'`, as the quickstart's table sets out.

Record every figure in `specs/070-retire-core-api/SIGNOFF.md`. If SC-004, SC-006 or SC-007 is
missed, stop: that is a decision for the operator, not a threshold to adjust.

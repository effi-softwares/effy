# Quickstart: Customer Points (074)

Contracts: [contracts/routes.md](contracts/routes.md) · Data: [data-model.md](data-model.md).

## Machine checks

```sh
pnpm -r typecheck
pnpm --filter @effy/edge-shared test
CONTAINER_TESTS=1 pnpm --filter @effy/edge-shared test     # ledger, finalize, refunds on real migrations
CONTAINER_TESTS=1 pnpm --filter @effy/edge-commerce test
CONTAINER_TESTS=1 pnpm --filter @effy/edge-customer test
CONTAINER_TESTS=1 pnpm --filter @effy/edge-orders test
pnpm --filter @effy/edge-notifications test
pnpm --filter @effy/email-kit test
pnpm --filter @effy/shared-types test                       # LIVE_KINDS == Kotlin LiveKind
pnpm --filter back-office test && pnpm --filter customer-web test
(cd apps/customer-mobile && ./gradlew :shared:testAndroidHostTest)
scripts/check-no-refresh-timers.sh
pnpm --filter @effy/design-system test                      # token usage on the new screens
```

Proofs, each broken once to see it fail:

| # | Proves | Spec |
|---|---|---|
| P1 | `splitRefund` table: any sequence of partial refunds ends at exactly points used + card paid; card never above card paid | FR-019, SC-005 |
| P2 | FIFO: a debit consumes the soonest-expiring lot first; allocations sum to the debit | FR-016 |
| P3 | Expired lot stops counting the instant `expires_at` passes, with no sweep run | FR-022, R2 |
| P4 | Two concurrent intents for the same points: one holds, the other gets `409 points_balance_changed` | Story 2 #5 |
| P5 | Concurrent debit + intent: balance never negative | FR-004, SC-002 |
| P6 | Intent → paid: hold becomes one `spent` entry; redelivered webhook spends nothing more | R3 |
| P7 | Late payer after hold lapsed and points spent elsewhere: order paid, `points_shortfall_amount` set, metric emitted, balance ≥ 0 | R3 |
| P8 | Points-only order: no provider call, payment `provider='points'`, order `paid`, cart emptied, receipt queued | FR-014 |
| P9 | Card remainder of 30¢ refused with `maxPoints` | R4 |
| P10 | Card-free refund inserted `succeeded` with its points returned in the same transaction; card refund returns points only on `submitted`; `refused` returns none; reconciler path returns once | R5 |
| P11 | Cancellation of a mixed order returns everything split; of a points-only order returns only points | Story 3 |
| P12 | CSA over limit → 403; CSA debit → 403; manager debit above usable → 409; credit on another customer's order → 404 | FR-007/008/010 |
| P13 | Guard: no UPDATE/DELETE on `points_entry` / `points_allocation` anywhere | FR-003 |
| P14 | Guard: only `shared/src/points/announce.ts` (+ the three 071 builders) construct a customer update | R7 |
| P15 | Reconciliation emits `PointsInvariantViolations 0` on a clean ledger and 1 after a forged over-allocation | SC-001 |
| P16 | Expiry warning sent once per customer per expiry date, however many runs | SC-007 |

## Operator steps

```sh
make db-up ENV=dev                                   # <ts>_customer_points.sql
make edge-deploy SERVICE=commerce ENV=dev            # first: holds + points-only placement + new finalize step
make edge-deploy SERVICE=orders ENV=dev              # refunds split + back-office routes
make edge-deploy SERVICE=shop ENV=dev                # shop-manager refunds use the same split
make edge-deploy SERVICE=customer ENV=dev            # balance, history, sweeps
make edge-deploy SERVICE=notifications ENV=dev       # points emails + push
# alarms: terraform plan/apply in infra/envs/dev (PointsHoldShortfall, PointsInvariantViolations)
# back-office and customer-web through their pipelines; build customer-mobile
```

⚠ **Deploy order matters.** Every service that runs `finalizeSucceeded` or the refund service must be
on the new shared library before anyone can hold points — `commerce` (checkout, webhook, refund
reconciler), `orders` (staff refunds and cancellation) and `shop` (shop-manager refunds). Until the customer-facing clients ship,
no one can choose points, so the window is safe if the backends go first.

## Walks (dev)

| # | Do | Expect |
|---|---|---|
| V1 | Back-office → Customers → find a test customer → Credit 500, "Late delivery", against an order | Balance 500 ($5.00) on web and mobile without refresh; email + push received; audit line names you |
| V2 | As a CSA, credit 2,500 | Refused: "The most you can credit at once is 2,000 points" |
| V3 | Customer checks out a $47.80 basket with 1,250 points | "Points −$12.50 · Card $35.30"; card charged $35.30; receipt shows both payment lines |
| V4 | Customer with 6,000 points checks out $42.00 | No card step; order placed; balance 1,800 |
| V5 | Staff refund one $8.00 line on the V3 order | Refund shows "$6.00 to card · 200 points"; customer history "Returned from order …" with a new expiry |
| V6 | Set expiry to 1 month and warning to 30 days (dev), credit, run the sweep | Warning email once; after expiry the balance drops and history says "Expired" |
| V7 | Customer opens "Close account" holding points | Told how many points will be lost |

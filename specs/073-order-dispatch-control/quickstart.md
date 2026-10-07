# Quickstart: Simple Order Status & Driver Assignment in Orders (073)

## Machine checks

```sh
pnpm -r typecheck
pnpm --filter @effy/edge-shared test
CONTAINER_TESTS=1 pnpm --filter @effy/edge-fleet test
CONTAINER_TESTS=1 pnpm --filter @effy/edge-orders test
CONTAINER_TESTS=1 pnpm --filter @effy/edge-shop test
pnpm --filter back-office test && pnpm --filter shop-web test
(cd apps/driver-mobile && ./gradlew :shared:testAndroidHostTest)
scripts/check-no-refresh-timers.sh
```

Proofs, each broken once:

| # | Proves |
|---|---|
| S1 | `packageStatus` — every status and every precedence pair (unit) |
| S2 | Collect → `with_driver` (not `at_hub`) on orders and shop reads |
| S3 | Hub check-in → `at_hub`; shop console announced |
| S4 | Same-day drop started → `out_for_delivery`; proof → `delivered`; failure → `problem` |
| S5 | Standard handoff → `with_carrier`; arrival → `delivered` |
| S6 | Shop reads never carry a driver name |
| S7 | Guard: no app maps shop statuses to words except through `STATUS_WORD` |
| M1 | Planner writes a one-line `assigned_note` on every assignment |
| M2 | Assign an unassigned package; move an assigned one; unassign — rounds and announcements correct |
| M3 | Each "cannot" condition refused; a "concern" needs confirm, then succeeds and records the person |
| M4 | Collected package → 409 `collected`; stale token → 409 `changed`; CSA → 403 |
| M5 | Lock routes gone; planner ignores `locked_by_sub` |

## Operator steps

```sh
make db-up ENV=dev
make edge-deploy SERVICE=fleet ENV=dev
make edge-deploy SERVICE=orders ENV=dev
make edge-deploy SERVICE=shop ENV=dev
make edge-deploy SERVICE=driver ENV=dev
# back-office and shop-web via their pipelines; build the driver app
```

## Walks

| # | Do | Expect |
|---|---|---|
| V1 | One same-day and one standard order, Ready → Delivered, with shop console, back-office and driver app open | Same word on all three at each step, no refresh; collected says **With driver**, not At hub |
| V2 | Open Orders | Status and Driver columns filled; "Needs a driver" filter works |
| V3 | Open an order | Collect / Deliver lines with driver, opens, due, and how assigned |
| V4 | Assign to… on an unassigned package | Drivers grouped Fine / Concern / Can't; pick one → "Assigned to Ben"; appears in their app |
| V5 | Assign to… a different driver on an assigned package | Moves; both apps update |
| V6 | Unassign | "Unassigned — auto-assign will pick it up within 5 minutes" |
| V7 | Try on a collected package | No actions offered; "In Ada's van" |
| V8 | Old `/dispatch` link; CSA login | Lands on Orders → Assignments; CSA sees no actions |

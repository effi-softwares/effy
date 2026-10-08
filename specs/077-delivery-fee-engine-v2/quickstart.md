# Quickstart: Delivery Fee Engine v2 (077)

Contracts: [contracts/routes.md](contracts/routes.md) · Data: [data-model.md](data-model.md) ·
Why: [research.md](research.md).

## Machine checks

```sh
pnpm -r typecheck
pnpm --filter @effy/shared-types test
TESTCONTAINERS_RYUK_DISABLED=true CONTAINER_TESTS=1 pnpm --filter @effy/edge-shared test
TESTCONTAINERS_RYUK_DISABLED=true CONTAINER_TESTS=1 pnpm --filter @effy/edge-admin test
TESTCONTAINERS_RYUK_DISABLED=true CONTAINER_TESTS=1 pnpm --filter @effy/edge-commerce test
for s in storefront orders shop notifications; do pnpm --filter @effy/edge-$s test; done
pnpm --filter @effy/email-kit test
pnpm --filter back-office test && pnpm --filter customer-web test && pnpm --filter shop-web test
(cd apps/customer-mobile && ./gradlew :shared:testAndroidHostTest)
make validate ENV=dev
docker ps -aq --filter label=org.testcontainers=true | xargs -r docker rm -f
```

Proofs — each broken once to see it fail:

| # | Proves | Spec |
|---|---|---|
| P1 | Engine table: every distance-band edge, weight-band edge, both basket edges, floor, cap, rounding — to the cent | FR-002–006, SC-001 |
| P2 | Heavier never cheaper, farther never cheaper, over a generated grid of plans | FR-007 |
| P3 | One supplier or five, same goods → the same fee | FR-001, SC-010 |
| P4 | Free amount reached → $0 including a surcharged window; one cent under → not free | FR-003 |
| P5 | Small-order fee is added after the cap and shown as its own line | FR-004 |
| P6 | `feeLines` sums to the total for every row of P1 | FR-028 |
| P7 | `delivery_plan_gaps` returns each code for its case; activation refuses each blocking one | FR-017, FR-018, SC-005 |
| P8 | Two activations at once → exactly one active plan, and never zero | FR-019, SC-006 |
| P9 | An active or retired plan and its bands cannot be changed (service, under the row lock) and nothing deletes a plan; a retired plan cannot be re-activated | FR-016 |
| P10 | A postcode added to the list at 900 km is priced with no plan change | US3-4, FR-009 |
| P11 | Simulate(active plan, inputs) = the intent's fee for the same inputs, over a table | FR-026, SC-009 |
| P12 | Simulating writes no row anywhere | FR-027 |
| P13 | Intent with a stale `shownDeliveryAmount` → 409 `delivery_fee_changed`, no order row changed | FR-031, SC-003 |
| P14 | Activate a different plan → a placed order's amount, breakdown, receipt and email lines are unchanged | FR-036, SC-004 |
| P15 | Migration 1, run by the real `goose` binary: every plan has bands equal to its ring prices; the active plan is complete; it raises with `EFFY_TODAY_PREMIUM` unset, and with a standard multiplier other than 1 | FR-039 |
| P16 | For every postcode whose distance sits in its former tier, the standard fee before = after | SC-011 |
| P17 | A same-day order costs the standard fee plus the today premium | US8-4 |
| P18 | Courier fee: flat + weight band, rounded, clamped; Effy's free amount has no effect | FR-011, FR-012 |
| P19 | The courier switch refuses with no active courier plan | FR-013 |
| P20 | Guard: no customer DTO has a distance, band, weight or plan field; no shop DTO has a delivery amount | FR-032, FR-038, SC-012 |
| P21 | Guard: no source reads `delivery_ring`, `ring_id`, `ringPrice`, `coverage_ring_for_km`, `hub_distance_km`, `ring_is_overridden`, `same_day_factor`, `standard_factor` or `factorMilli` | FR-040 |
| P22 | Guard: fee parts are added only in `engine.ts` | research R3 |
| P23 | A csa can list and simulate and cannot create, update or activate | FR-022 |
| P24 | Every plan write leaves an audit row with before and after | FR-023 |
| P25 | Web and mobile render identical lines from one quote fixture | FR-033, SC-013 |
| P26 | A client that sums `packages[].options[].feeAmount` is never shown less than it is charged — all-standard, all-same-day, mixed, and a non-dearest slot | research R4 |

## Operator steps (dev) — in this order

**0. Decide the same-day amount.** One number: how much dearer a delivery today is than one on a
later day (for example `3.00`). It must be a multiple of the active plan's rounding step.

**1. See which postcodes change price** — read-only. Run `specs/077-delivery-fee-engine-v2/preflight.sql`
against dev with `psql` (the DSN comes from `infra/scripts/db-dsn.sh dev`, as `make db-status` does).
It first prints the active plan's standard multiplier — anything but 1 stops the release (research R10).
Each row after that is a postcode whose tier does not match its own distance, with the 1 kg fee before and after.
No rows: nobody's standard fee moves. Rows: that is the model working as designed (research F2) —
decide it is acceptable before going on.

**2–6.**

```sh
make db-status ENV=dev                            # two pending: …_delivery_fee_engine_v2, …_drop_delivery_rings
EFFY_TODAY_PREMIUM=<amount> make db-up-one ENV=dev  # migration 1 ONLY — additive; checkout keeps selling.
                                                  #   Raises, changing nothing, if the premium is unset
                                                  #   or the active plan would come out incomplete.
make edge-deploy SERVICE=commerce ENV=dev         # ┐ pricing moves to the new engine here
make edge-deploy SERVICE=storefront ENV=dev       # │
make edge-deploy SERVICE=notifications ENV=dev    # │ readers
make edge-deploy SERVICE=orders ENV=dev           # │
make edge-deploy SERVICE=shop ENV=dev             # ┘
make edge-deploy SERVICE=admin ENV=dev            # staff gateway: rings route goes, update + simulate arrive
make plan ENV=dev && make apply ENV=dev           # live.tf: kind `pricing`
make db-up ENV=dev                                # migration 2: drops the tier tables
make gateway-usage ENV=dev                        # staff 146, shared 158
# push to dev: back-office, shop-web, customer-web. Build customer-mobile.
```

⚠ `make db-up-one` is a new target added by this feature (`goose up-by-one`): `make db-up` would apply
both migrations at once and drop the tier tables while the old code still reads them.
⚠ Deploy `admin` and build back-office close together: the old plan dialog posts a shape the new
`admin` refuses.

## Walks

| # | Do | Expect |
|---|---|---|
| V1 | Back-office → Delivery → Pricing | The carried-over plan is active; bands match the old tier prices; today premium is the amount given; no tier or multiplier anywhere |
| V2 | Copy the active plan, delete its last distance band, Activate | Refused: "Add a last distance band with no upper limit…" |
| V3 | Fix it, set free delivery over $80 and small-order $3 under $20, Activate — time it from Copy | Active; the old plan shows Retired; under 3 minutes (SC-007) |
| V4 | Simulator: near postcode, 1 kg, $50, no window; then a far postcode | Two fees; each step listed; the far one is from the far band |
| V5 | Simulator: an unlisted postcode | "Effy does not deliver to …" |
| V6 | Customer web: $15 basket to checkout | Delivery line + Small-order fee line; total = the two |
| V7 | $70 basket in the cart | "Spend $10.00 more for free delivery" |
| V8 | $95 basket, pick a window today | "Free delivery"; delivery total $0.00 |
| V9 | $50 basket: compare a day with a window today | The window shows its surcharge before it is chosen; the line appears when chosen |
| V10 | With checkout open at the payment step, activate a different plan in back-office, then pay | The new amount is shown before payment can proceed |
| V11 | Place the order; open the order page, the receipt, the email | The same lines, the same amounts |
| V12 | Activate another plan; reopen V11's order | Unchanged |
| V13 | Back-office → that order — time it from the orders list | "How this fee was built" lists every step; under 30 seconds (SC-008) |
| V14 | Shop console → that order | No delivery or shipping amount |
| V15 | Repeat V6–V11 on the mobile app | Identical lines and amounts |
| V16 | A basket from two shops vs the same goods from one | The same delivery fee |
| V17 | Create and activate a courier table; simulate an unlisted postcode with courier coverage in a test database | Flat + weight; never free unless its own free amount is set |

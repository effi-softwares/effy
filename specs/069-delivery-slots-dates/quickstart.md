# Quickstart: validating 069

Contract: [contracts/delivery-slots-dates.md](contracts/delivery-slots-dates.md) · Data:
[data-model.md](data-model.md) · Decisions: [research.md](research.md)

## Prerequisites

- Docker running, for the container tests.
- 063, 064 and 066 live on dev; a driver who can be assigned a same-day round.
- A dev customer with an address in a same-day-eligible zone and one in a zone that is not.
- A basket supplied by two shops, one of which has a same-day exception for the first zone.
- At least one active collection run later than now.

## Baseline (T001/T002, measured 2026-10-04 before any change)

| Check | Before | After |
|---|---|---|
| `pnpm -r typecheck` reporting packages | 21 | 21 |
| `@effy/shared-types` | 34 | 57 |
| `@effy/edge-fleet` (with containers) | 196 | 236 |
| `@effy/edge-orders` (with containers) | 56 + ⚠ 1 failing | 78 (the flaky one passed) |
| `@effy/edge-driver` (with containers) | 132 | 137 |
| `@effy/edge-notifications` | 45 | 63 |
| `@effy/customer-web` | 536 | 593 |
| `@effy/back-office` | 245 | 278 |
| `go test -short ./...` non-ok packages | 0 | 0 |
| customer-mobile `:shared:testAndroidHostTest` | 352 | 380 (+ iOS main and test compile) |
| driver-mobile `:shared:testAndroidHostTest` | 54 | 62 (+ iOS main and test compile) |
| `contract:check`, `commerce-contract:check`, `driver-contract:check` | green | regenerate byte-stable; ⚠ read red until the regenerated files are committed |
| `effy-edge-fleet` packaged CloudFormation resources | 171 (33 functions) | must stay under 500 |
| `effy-edge-orders` packaged CloudFormation resources | 38 (7 functions) | must stay under 500 |

⚠ **One test was already red before this slice**: `edge-orders`
`arrival/repository.container.test.ts › survives two operators recording the same arrival at the
same instant` fails with `orders: not_collected`. It is not caused by 069 and is not fixed here.

The resource counts were read from each service's last package on disk
(`.serverless/cloudformation-template-update-stack.json`), not by re-packaging, which reads live
SSM parameters. Fleet has room for the seven new routes (~35 resources), so the delivery-days
routes stay in `edge-api/fleet` as planned (research R9).

## 1. Machine checks

```sh
pnpm -r typecheck
pnpm --filter @effy/shared-types test
pnpm --filter @effy/shared-types contract:check commerce-contract:check driver-contract:check
CONTAINER_TESTS=1 pnpm --filter @effy/edge-fleet test
CONTAINER_TESTS=1 pnpm --filter @effy/edge-orders test
CONTAINER_TESTS=1 pnpm --filter @effy/edge-driver test
pnpm --filter @effy/edge-notifications test
(cd apis/core-api && go test ./internal/platform/delivery/... ./internal/features/checkout/... ./internal/features/orders/... ./internal/features/refunds/...)
make core-test FULL=1
pnpm --filter @effy/customer-web test && pnpm --filter @effy/customer-web build && pnpm --filter @effy/customer-web size
pnpm --filter @effy/back-office test
pnpm --filter @effy/design-system test
```

Mobile: `:shared:testAndroidHostTest` and an iOS simulator test compile for customer-mobile and
driver-mobile.

Also measured after: `@effy/edge-shop` 465 with three new guard tests (⚠ two container tests were
already red before this slice — attention recipients and order paging, both recorded by 065 — and a
third, an insights "today" test, fails only in the minutes after Melbourne midnight);
`@effy/edge-customer` 217; `@effy/edge-shared` 150; `@effy/design-system` guards green; customer-web
production build and bundle gate **within budget on all 16 gated routes** (⚠ no per-route sizes were
recorded before the change, so "byte-identical" is not claimed); Go `vet`/`gofmt` clean; checkout,
refunds and orders green with containers. ⚠ Two Go packages are red with containers and were before
this slice: `platform/delivery` (its transcribed schema lacks `sameday_eligible`) and
`features/shoplive`.

### Proofs by breaking (each must turn a named test red, then be restored)

**All eight were run on 2026-10-04, and each turned its named test red before being restored.**
⚠ Two needed a second attempt: NP8's first break made an import unused, so the BUILD failed rather
than the test; NP7's first break landed inside a comment, which the guard correctly ignores. Neither
was a guard that failed to catch its proof.

| # | Break | Expected to fail |
|---|---|---|
| NP1 | remove `FOR UPDATE` from the slot lock | the 20-concurrent-intents capacity test (SC-002) |
| NP2 | count lapsed holds as live | "an abandoned hold frees its place" |
| NP3 | restore `promised_ready_at = opd.promised_to` at finalize | the shop ready-by test (R2) |
| NP4 | let a closed slot fall back to standard | "a closed slot is refused, never substituted" (FR-010) |
| NP5 | let a non-delivery weekday count toward the look-ahead | `AvailableDays` table test (FR-016) |
| NP6 | set a delivery round's deadline back to end of day | the planner window test (R10) |
| NP7 | select `window_start` in a shop read | the shop no-leak guard |
| NP8 | change the Go window format | the Go↔Kotlin wire test |

## 2. Operator steps (the user runs these; Claude does not)

Order matters. ⚠ Same-day stops being offered when `core-api` deploys unless a slot exists.

```sh
make db-up ENV=dev                         # additive; safe before any deploy
make edge-deploy SERVICE=fleet ENV=dev
#   → back-office › Delivery › Time slots: create the slots (walk W1)
make core-image-push && make core-deploy ENV=dev
make edge-deploy SERVICE=orders ENV=dev
make edge-deploy SERVICE=driver ENV=dev
make edge-deploy SERVICE=notifications ENV=dev
#   then push customer-web and back-office; release the two apps
```

## 3. Walks

| # | Walk | Proves |
|---|---|---|
| W1 | Back-office: create slots 17:00–19:00 (cutoff 15:00, capacity 2) and 19:00–21:00 (cutoff 17:00, capacity 2). Try end before start, cutoff after start, capacity 0. | US5, FR-036/037 |
| W2 | Customer web, eligible address, before 15:00: same-day shows both slots with one fee; pick 19:00–21:00, pay. Confirmation, order page and emailed receipt all read "Today, 7 pm – 9 pm". | US1, SC-005/006 |
| W3 | Same order on customer mobile: the same window. | SC-011 |
| W4 | Two more same-day orders into 17:00–19:00 from other accounts. A fourth customer is not offered it. Back-office shows 2 of 2. | US2, SC-003 |
| W5 | Hold a checkout on a slot at the payment step; fill the slot from another account after the hold lapses; return and pay: the client re-runs intent, the customer is told and re-chooses, no charge. | FR-009, SC-004 |
| W6 | After the last slot's cutoff: same-day is absent and the note says today's times are closed, not "not available in your area". Non-eligible address: the other wording. | FR-004 |
| W7 | Standard: seven days listed, earliest preselected, each with the fee; pick day 3; confirmation shows that single day. | US3, SC-007 |
| W8 | Back-office › Delivery days: exclude Sunday and one date; the customer list skips both and still shows seven. Add a date an order already carries: the count is shown and the order is unchanged. | US6, SC-008/009 |
| W9 | Two-shop basket, one shop excepted from same-day: checkout asks for one slot and one day; the receipt shows two deliveries. | SC-010 |
| W10 | Driver: the W2 drop shows its window; a round with both slots lists the earlier first; a drop past its start reads "due", past its end "late", and can still be completed. | US4 |
| W11 | Disable a slot with bookings and change another's times: placed orders are unchanged everywhere. | SC-009 |
| W12 | Cancel a booked order before cutoff: the place is offered again. | FR-012 |
| W13 | Back-office › Orders › Handover: today's due list; a package past its due day is marked at risk; the handoff dialog shows the chosen day. | US7, SC-012 |
| W14 | A shop console order for a standard delivery five days out: ready-by is unchanged from today's behaviour, and no window or day is shown. | R2, contract §5 |
| W15 | An order placed before the migration: "We'll confirm your delivery date", no window on the driver drop, not at risk. | FR-049 |

## 4. Known limits to record at sign-off

- An old mobile build choosing same-day gets a generic checkout error (`slot_required`).
- `sameday_hub_turnaround_min` (60) and `carrier_lead_days` (1) are assumptions until timed.
- SC-014 and SC-015 need a month of live deliveries.

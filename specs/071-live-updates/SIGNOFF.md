# Sign-off: 071 Live Updates Without Polling

**Status (2026-10-05)**: built for all six apps — **51 of 53 tasks**. The first slice (a paid order
on the shop console) is **deployed and proved in dev**. Everything after it is **built and tested
locally, not deployed**. The two open tasks are the operator's: the second round of deploys (T050)
and the walk (T051). ⚠ **Not signed off** until that walk is recorded below.

## Proved in dev (the early proof — T019, T020)

| Check | Result |
|---|---|
| Channel, parameters, both alarms deployed | ✅ alarms OK |
| The authorizer accepts the apps' own access token (⚠ PROVE, R3) | ✅ connect and subscribe `allowed`, shop audience, no errors (authorizer log) |
| A paid order is announced | ✅ three updates published (shop, customer, operations), zero failures (`Effy/Live`, `checkoutConfirmV1` log) |
| The order appears on shop Today without a refresh | ✅ seen by the operator |
| Terraform provider has the Event API resources (⚠ PROVE, R11) | ✅ `terraform validate`, applied |

⚠ **Not measured**: SC-001's percentiles and SC-002's 20-of-20 (`live-latency.ts` has not been
run); SC-005 (`live-authz.ts` has not been run); the fifteen-minute cut-off on a real suspended
account (⚠ PROVE, R5 — SC-009); both mobile engines' subprotocols on a device (⚠ PROVE, R10).

## Built since, verified locally, NOT deployed

| What | Proof |
|---|---|
| Every backend service announces per [contracts/change-map.md](contracts/change-map.md) | 14 services typecheck; all unit suites pass; real-database suites pass for `shared` 558, `commerce` 285, `orders` 77, `driver` 137, `fleet` 236, `inventory` 62, `catalog` 43 |
| `shop` real-database suite | 472 pass; the **same 2 failures recorded before 070** (attention recipients; order console paging) — not caused by this, not fixed by it |
| A customer hears only when their page changes; a split order looks like any other (FR-024, SC-011) | `order-moves.test.ts` — across a whole order's journey, a 2-shop and a 3-shop order produce exactly the 3 customer updates a 1-shop order does |
| Only three shared functions can build a customer's update | `customer-announce.guard.test.ts` |
| Every state-changing route announces, or is exempt with a reason | `change-map.guard.test.ts` — 60 routes held; proved by removing one announcement (9 routes failed) |
| Names agree across TypeScript, YAML and Terraform | `live.contract.test.ts` |
| A failed announcement never fails the change (FR-006, SC-008) | `announce.test.ts`; and the refund suite ran green with the channel unreachable |
| Channel routes for customer, driver, back-office | `route.test.ts`; services typecheck and pass |
| shop-web: timers removed, stock and attention mapped | 450 tests; builds |
| back-office: live-wired, both timers removed | 280 tests |
| customer-web: order list and order page follow the order | 600 tests; **production build**, import quarantine and bundle budget pass |
| Mobile client (`packages/mobile-kit/common/live`) | 13 tests on Android host; compiles for iOS in all three apps |
| shop-mobile (15 s loop removed), driver-mobile, customer-mobile | 128 / 62 / 379 host tests, 0 failures |
| No data refresh timer in the six apps (SC-010) | `scripts/check-no-refresh-timers.sh` — passes; fails on a planted web timer and a planted mobile loop; in CI |
| SC-003 idle hour, SC-004 catch-up, SC-012 ≤ 3 reads per burst, FR-015, FR-016, FR-023 | client tests under a fake clock, web and mobile |

## Operator — what is left (T050, T051)

`AWS_PROFILE=ef` throughout; the database must be running. No Terraform change since the proof.

1. **Deploy every announcing service** (any order; each is independent):
   `make edge-deploy SERVICE=<name> ENV=dev` for
   `commerce`, `shop`, `inventory`, `driver`, `fleet`, `orders`, `catalog`, `customer`, `admin`.
   ⚠ `commerce` and `shop` **again** — they changed after the proof.
   ⚠ `live` does **not** need redeploying.
2. **Commit and push** → Amplify releases shop-web, back-office and customer-web.
   ⚠ Do this **after** step 1: these builds have no refresh timers, so a console released before
   its backend announces would only update on focus and on refresh.
3. **Rebuild the three mobile apps** and install on a device each.
4. **Run** `scripts/verify-071/README.md`: `live-authz.ts` with all four tokens, then
   `live-latency.ts`.
5. **Walk** [quickstart.md](quickstart.md) Stage 4 (13 rows) and fill the table.

| Check | Target | Result |
|---|---|---|
| `live-authz.ts` — attempts to hear what is not yours (SC-005) | 0 granted | |
| `live-latency.ts` — payment → update p95 / p99 (SC-001, SC-002) | < 5 s / < 15 s; 20 of 20 | |
| Mobile connects and updates on Android and on iOS (⚠ PROVE, R10) | both | |
| Suspend an operator with the console open (⚠ PROVE, R5; SC-009) | "Live updates off" ≤ 15 min | |
| Two-shop order, customer page (SC-011) | same updates as a one-shop order | |
| Today open and idle 10 min, network panel (SC-003) | no data requests | |
| Walk rows 1–13 | all | |
| First week of the AppSync bill line, scaled (SC-006) | < 1 USD / month | |

**If a ⚠ PROVE item fails**: stop and say which. The likeliest is the mobile engines' subprotocols
— the fix is in one file (`KtorLiveTransport.kt`) and changes nothing else.

## Known limits, by decision

- **Cost at fifty shops is ≈ 4.8 USD, not 3.6** (research R12): the planned server-side throttle on
  pick progress could not be built honestly on a function that is frozen when it returns. Inside
  the 5 USD bound with little room; the 4 USD budget alert fires first.
- **An open driver stop or drop does not re-read** on an update — it is the driver's own work in
  progress. Today and the open round do.
- **Customer apps say nothing when the channel is off** — only when a connection that was live is
  lost. A page that does not update by itself is what every page did before this.
- **`admin` is exempt from the change-map guard as a whole**, with a test that it still writes no
  order, round, slot or review decision.

# Quickstart: validating Today & Insights (058)

How to prove the feature works end to end. Contracts: [contracts/](contracts/). Data: [data-model.md](data-model.md).
Decisions: [research.md](research.md). ⚠ Claude runs §1 only; every step touching live AWS or the dev
database is the operator's (CLAUDE.md "Mode of work").

## 0. Prerequisites

- Docker running (container tests apply the real migrations).
- AWS profile `ef` for any operator step.
- A dev shop with at least one `shop_manager` and one `shop_staff` login, tracked products (one at 0 on
  hand, one below threshold) and the Stripe CLI forwarder (`scripts/stripe-listen.sh`) for live orders.

## 1. Machine verification (Claude)

```bash
pnpm -r typecheck
pnpm -r test                                         # count the reporting packages (029: vitest ≠ tsc)
CONTAINER_TESTS=1 pnpm --filter @effy/edge-shop test # rollups, triggers, today/insights vs real migrations
pnpm --filter @effy/edge-orders test                 # UNMODIFIED — proves the proposal-rule promotion
make core-test FULL=1                                # shoplive hub/handler + listener container test
pnpm --filter @effy/design-system tokens:check       # UNCHANGED — no token added
node scripts/check-shop-theme.mjs && scripts/check-no-emerald.sh && scripts/check-no-jade.sh
```

Expected, and each proven by **breaking the thing** once:

| Proof | Break it by | Expect |
|---|---|---|
| One value behind the backlog (FR-006) | rendering the glance cell from a second query | shop-web test fails |
| Insights never reads raw orders (FR-026) | adding `FROM public.order_item` to the insights repository | guard fails naming the file |
| Refused quick actions stay gone (FR-011) | adding `<X />Message a customer` | guard fails naming the file |
| Trigger allow-list (R6) | adding an `UPDATE` to a trigger function | guard fails naming the function |
| Dirty mark is atomic | rolling back a refund insert | no `insights_dirty` row, no poke |
| Recompute is idempotent | running the rollup twice / out of order / after a refund fails | identical rows |
| DST | seeding orders across the April and October changeovers in Melbourne | 25 / 23 hour buckets |
| Half-hour zone | setting a test shop to `Australia/Adelaide` | buckets start at :30 UTC; nightly rebuild on change |
| Timers cleaned up (FR-029) | unmounting Today | no interval, no open stream (test spies) |
| Stream carries no data | inspecting every emitted frame | `data: {}` only |

## 2. Operator deploy (in order)

1. Commit, then `make db-up ENV=dev`. Within a few minutes, check `SELECT count(*) FROM
   public.insights_dirty` falls to 0 and `public.insights_state` has a row per shop with sales.
2. `make edge-deploy SERVICE=shop ENV=dev`, then `make edge-deploy SERVICE=orders ENV=dev`.
3. `make core-image-push && make core-deploy ENV=dev`.
4. `make apply ENV=dev` (three alarms). Abort if anything other than the alarms would change.
5. Push shop-web to `dev` (Amplify builds it).

## 3. Walks (operator, on `shop.dev.effyshopping.com`)

| # | Walk | Pass when |
|---|---|---|
| W1 | Open the console | Lands on Today; subtitle "{weekday} {d} {month} · Melbourne"; breadcrumb header, no repeated title |
| W2 | Needs attention | Awaiting-pick title, units, badge, glance cell and nav badge all agree; `Pick`/`Restock`/`Review` open the right screens; the manager sees a refund item, staff does not |
| W3 | **Live order** (SC-002) | With Today open, a Stripe test checkout for this shop's product appears within 10 s with `New`; the marker goes after 60 s; "Just now" → "1 min ago" with no reload; clicking opens that exact order |
| W4 | Drop the connection | Offline for 2 min while two orders are paid; back online → both appear once, in order |
| W5 | Fallback | With `core-api` stopped (or before step 3), Today still updates within 30 s and looks identical |
| W6 | Picking changes the figures | A teammate starts picking one order → every backlog figure drops together |
| W7 | Insights ranges | Today / 7 days / 30 days each change every figure, both charts and the Top products subtitle; deltas say what they compare with; "updated …" shows |
| W8 | Late refund | Refund an order placed 5 days ago → within 5 min, today's Refunds and the 7d/30d figures reflect it; the order's own past day is unchanged (R4) |
| W9 | Drill-throughs | Refunds, Can't supply, Low stock SKUs, Cancelled, Ready for pickup each open the filtered list |
| W10 | Quick actions | Six rows only; Print pick lists prints N and toasts; Open the attention queue lands on at-risk oldest-first; no New order / Discount code / Message a customer anywhere |
| W11 | Team activity | Actions by two staff appear with names, newest first; platform actions say "Effy" |
| W12 | Appearance + width | Light / Dark / Follow-System; 1280, 1100 and 768 px; no amber anywhere, no green text |
| W13 | Cost check | After a day, CloudWatch: edge-shop invocations roughly track order activity, not open tabs |

⚠ **Look at every screen.** 039 shipped four live defects with a fully green suite; layout, contrast
and hierarchy are not properties a DOM assertion can see.

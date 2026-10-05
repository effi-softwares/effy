# Quickstart: bring-up and verification

Claude authors everything; **every step marked OPERATOR is run by the operator**. All AWS commands
use `AWS_PROFILE=ef`. Exact commands are written into `tasks.md` as each step is built; this file
fixes the order and what "worked" looks like.

## Before any of this

- The constitution is at 3.1.0 (research R15).
- The database is running (`./start-db.sh`) — the authorizer reads staff and driver records.

## Stage 1 — early proof (one slice, research R14)

1. **OPERATOR** — `make edge-deploy SERVICE=live ENV=dev` (the authorizer; it must exist before the
   API that names it).
2. **OPERATOR** — `make plan ENV=dev`, confirm an **additive** plan (one Event API, four
   namespaces, one function permission, three parameters, two alarms, one budget, and one changed
   statement on the alerts topic's policy admitting the budgets service), then
   `make apply ENV=dev`.
3. **OPERATOR** — `make edge-deploy SERVICE=commerce ENV=dev`, then `shop`.
4. **OPERATOR** — release shop-web from this branch.
5. Check, with notifications **denied** in the browser:
   - open Today, pay a test order from another session → the order appears within 5 s (SC-002)
   - leave Today open and idle for ten minutes with the network panel open → no request to the
     gateway for its data; one subscribe frame at the epoch boundary (SC-003)
   - the four ⚠ PROVE items in research are each recorded as confirmed or the research is corrected

**Stop here if SC-001 or SC-002 is missed.** Nothing else has been built on it yet.

## Stage 2 — every service announces

6. **OPERATOR** — deploy, in any order (each is independent): `commerce`, `shop`, `inventory`,
   `driver`, `fleet`, `orders`, `catalog`, `customer`, `admin`. ⚠ `commerce` and `shop` again: they
   changed after the early proof (refunds, cancellation, stock, picks, the review queue). Each is independent; an app that is not yet listening ignores nothing it
   needs.
7. Smoke, no app needed — subscribe with a command-line WebSocket client using a real token:
   - own channel → `subscribe_success`
   - another shop's channel, another audience's namespace, a wildcard, an old epoch →
     `subscribe_error` each time
   - a publish frame → refused

## Stage 3 — the apps

8. **OPERATOR** — release shop-web, back-office and customer-web (Amplify), then rebuild the three
   mobile apps.

## Stage 4 — verification walk

| # | Check | Surfaces | Spec |
|---|---|---|---|
| 1 | Pay an order elsewhere → appears without touching the screen, notifications denied | shop-web, shop-mobile | US1, SC-002 |
| 2 | Cancel and refund that order → the queue reflects it | shop-web, shop-mobile | US3 |
| 3 | A colleague records picks on a second device → progress moves on the first | shop-web, shop-mobile | US3 |
| 4 | Sell the last unit → the product shows out of stock; attention list updates | shop-web, shop-mobile | US3 |
| 5 | Network off for a minute, order paid meanwhile, network on → shown within 5 s, untouched | all six | US2, SC-004 |
| 6 | Background the app five minutes, change something, return → shown at once | three mobile apps | US2 |
| 7 | Order page open while the shop packs, hands over, driver delivers → page follows | customer-web, customer-mobile | US4 |
| 8 | Same, on an order split across two shops → count and timing of updates match a one-shop order | customer-web | SC-011 |
| 9 | Assign, reassign, withdraw work → both drivers' lists change | driver-mobile | US5 |
| 10 | Orders console, dispatch, drivers, slot load, review queue each follow a change made elsewhere | back-office | US6 |
| 11 | Suspend a staff member whose console is open → "Live updates off" within 15 min; their next read is refused | shop-web | SC-009 |
| 12 | Typing in a form while updates arrive → nothing typed is lost, the page does not jump | shop-web, back-office | FR-016 |
| 13 | Live channel unreachable (block the host) → screen says so, shows its age, refresh works | shop-web, shop-mobile | FR-015 |

**Measured** (scripted, `apis/edge-api/ops/src/verify/`):

| Check | Target |
|---|---|
| 200 changes, time from commit to the update arriving on a subscribed socket | 95% < 5 s, 99% < 15 s (SC-001) |
| 50 subscribe attempts across scopes and audiences | 0 succeed (SC-005) |
| 100 changes with publishing forced to fail | 100 succeed (SC-008) |
| 20 bursts of ten changes in ten seconds, reads counted on an open screen | ≤ 3 per burst (SC-012) |
| `grep` for data refresh timers across the six apps | none (SC-010) |
| One week of the AppSync line on the bill, scaled to a month | < 1 USD (SC-006) |

## Stage 5 — close

9. Update the documents that still describe polling: the shop console sections of `CLAUDE.md` and
   `ARCHITECTURE.md`, 070's withdrawn ten-second note, the `FEATURE-HISTORY.md` entry, `SIGNOFF.md`.
10. **OPERATOR** — the budget alert: confirm the alerts topic's subscriber received the budget's
    confirmation.

## Turning it off

Remove `live.tf`'s API from the plan and apply (OPERATOR). With the parameters gone, `announce`
does nothing, every app shows "Live updates off" and reads on open, on return and on request. No
screen stops working (spec Assumptions), and no service needs redeploying first.

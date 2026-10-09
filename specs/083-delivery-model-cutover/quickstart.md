# Quickstart & Proofs: 083

## Stage 1 — machine proofs (each named one broken once)

| # | Proves | Where |
|---|---|---|
| P1 | `goLiveReadiness`: each required item fails alone and names itself; courier off vs half-armed; advisories never block; a plan that cannot price the farthest postcode is not ready | shared container |
| P2 | Setter: refused `not_ready`; admin only; `changed` on a stale `expected`; past instant = now; audit row per act | admin container |
| P3 | Cancel before the moment; turn back off after it needs a reason; orders placed while on keep their type | admin + commerce container |
| P4 | Sweep: a scheduled moment whose readiness breaks is cleared within the window and audited `blocked`; a ready one is left alone; a passed one is never reverted | admin container |
| P5 | The switch column has ONE writer; readiness has one definition | guard |
| P6 | Across the moment: quote before → old choices, after → windows; an unpaid old order paid after is re-captured as a typed order; a stale client is refused 409, nothing charged | commerce container |
| P7 | An old same-day order and an old standard order placed before the switch run to completion after it, unchanged (status, handoff, arrival, messages) | orders + fleet + driver container |
| P8 | Old-kind open count: paid+undelivered counts; delivered, cancelled, fully refunded do not; `open=true` filter lists the same orders | shared + orders container |
| P9 | Go-live page: checklist rows, schedule/cancel/turn-back, count and link; CSA and manager cannot set | back-office component |

## Stage 2 — machine proofs

| # | Proves | Where |
|---|---|---|
| P10 | Migration 2 refuses with an old order open, or the switch off | goose container |
| P11 | After it: the model is on whatever the column says; turn back → `removed`; a checkout with 069 fields is sold a window or refused, never the old way | shared + commerce container |
| P12 | An old order still reads: who delivered (`package_delivered_by`), its delivery line on the customer DTO, its history | commerce + orders container |
| P13 | Driver and shop compatibility fields still present and correct | driver + shop container |
| P14 | `scripts/check-no-legacy-delivery.sh`; existing word scripts; `driver_zone_capability` one row per clearance | script + container |
| P15 | Customer web + mobile checkout draw only windows / courier | component + host tests |

## Walks in dev

**Stage 1** — V1 checklist with one item broken → refused; V2 schedule 5 minutes ahead, place an order
before and after; V3 cancel a scheduled moment; V4 take an old same-day and an old standard order to
delivery after the switch; V5 old-order count reaches zero; V6 turn back off with a reason, then on again.
**Stage 2** (after V5) — V7 apply; V8 checkout web + app; V9 open an old order as customer and staff;
V10 a driver and a supplier on the previous app build complete their work.

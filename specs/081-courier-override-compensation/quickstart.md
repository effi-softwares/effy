# Quickstart & Proofs: 081

## Machine proofs (container tests unless noted) — each to be broken once

| # | Proves | Where |
|---|---|---|
| P1 | `overrideAmounts`: difference clamps at 0; points round up; refund capped at refundable | shared unit |
| P2 | Move to courier: type, history, window `released` (load drops by 1), packages `standard` with no window, delivery work removed, collection kept (hub) / removed (supplier), service + estimate set, override row — one transaction | shared container |
| P3 | A failure mid-move (e.g. points credit throws) leaves nothing changed | shared container |
| P4 | Each compensation kind gives exactly the previewed amount by the named means; points entry `auto_credit/courier_override_compensation`, quiet; refund kind `delivery` recorded in the tx | shared + orders container |
| P5 | Courier dearer than paid → difference 0; customer charged nothing; `grand_total` unchanged | shared container |
| P6 | Refused: handed over, delivered, out for delivery, no delivery type, unpaid, courier not ready | orders container |
| P7 | `expectedAmount` stale → 409 `compensation_changed`; repeated POST → `already_courier`, one credit/refund | orders container |
| P8 | CSA → 403 on POST; sees `deliveryMoves` on GET | orders container |
| P9 | Move back: window taken under `judgeWindow`; full window refused; booked consignment cancelled; handed-over refused; not on Effy's list refused; no money moves | shared + orders container |
| P10 | Notification rows: push + email, once per move | shared container |
| P11 | Customer DTO: `moved` with compensation, no reason/fee | commerce container |
| P12 | Guards: the override row has no UPDATE path; mode still has one writer; `recordDeliveryType` still the one writer; refund `delivery` kind not in `OPERATOR_REASONS` | guard tests |
| P13 | `compensationLine` TS ↔ Kotlin fixture parity | shared-types + customer-mobile host test |
| P14 | Fleet unassign still works after `removeAssignment` moved | fleet container (existing suite) |

```
pnpm --filter @effy/edge-shared test -- override driver-work
pnpm --filter @effy/edge-orders test -- delivery-move
pnpm --filter @effy/edge-fleet test
pnpm --filter @effy/edge-commerce test -- orders
pnpm --filter @effy/back-office test -- orders
pnpm -r typecheck
```

## Walks in dev (model switch on briefly, then back to NULL)

Prerequisites: a courier service set as default, an active courier fee table, an Effy order paid in a
window, a driver on duty.

- **V1** Send by courier with the default: window has room again; driver's delivery round drops it;
  customer gets push + email with the estimate and points; points page shows the credit; order page says
  "Now arriving by courier" + the points line; history row on back-office.
- **V2** Each other choice once (free as points, free to card, refund difference, none with note) —
  amounts match the preview; the refund appears in the order's refunds.
- **V3** Courier priced above the Effy fee → difference $0.00; nothing charged.
- **V4** Out for delivery → refused with the reason; after handover → refused.
- **V5** Deliver by Effy… on a moved order: only open windows listed; customer told the window; no money.
- **V6** Signed in as a CSA: history visible, no actions.
- **V7** Shop screen reads "Courier" (then "Effy driver") without refresh, no reason/fee.

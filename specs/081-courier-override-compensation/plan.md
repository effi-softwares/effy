# Implementation Plan: Back-Office Courier Override & Compensation

**Branch**: `dev` (feature directory `081-courier-override-compensation`) | **Date**: 2026-10-09 | **Spec**: [spec.md](spec.md)

## Summary

Back-office (admin/manager) can move a paid "Delivered by Effy" order to "Courier delivery" in an
emergency, and back again before the courier has it. The move to courier, in **one transaction**:
releases the window, rewrites the packages as courier routing, drops delivery work (and collection
work when the courier collects from the supplier), gives the default courier service and its timeframe,
records the change through 079's one writer, and gives the compensation staff chose — points through
074, a refund through 055. The customer is told by push and email; every screen updates live. Seventh
slice of the delivery model v2 programme (epic E7).

Decisions ([research.md](research.md)):

1. **Only orders with a recorded delivery type can be moved** (R1) — dormant until the cutover, like
   079/080. The spec was corrected.
2. **One shared function, called by `orders`** (R2): `@effy/edge-shared/delivery/override.ts`. Planner
   lock → order → packages → points account.
3. **A parcel out for delivery blocks the move** (R3) — fleet never touches a delivery round under way.
   The spec was corrected.
4. **Driver work removal is 073's, moved into the shared library** (R4); collection work stays when the
   order goes via the hub.
5. **Compensation = points (in the transaction) or a refund recorded in the transaction and submitted
   after commit** (R8), with a new refund kind `delivery` / reason `courier_override` and a key per move.
6. **Preview then confirm with expected amounts** (R9): a stale amount is refused, never re-priced.
7. **No new service.** +2 staff routes on `orders`; one field each on two existing DTOs; one notification
   type; one alarm.

## Technical Context

**Language/Version**: SQL (PostgreSQL 16, Goose); TypeScript / Node 22 Lambdas; React 19 (back-office,
customer-web); Kotlin 2.4 / CMP (customer app); Terraform (one alarm).
**Primary Dependencies**: none added.
**Storage**: one additive migration — 1 table, 2 CHECKs widened ([data-model.md](data-model.md)).
**Testing**: Vitest units + container tests (shared, orders, fleet, commerce), guards, back-office
component tests, Kotlin host test for the wording fixture ([quickstart.md](quickstart.md) P1–P14).
**Target Platform**: `orders` (staff gateway); `commerce` (shared, existing route); `fleet` (import
change only); `notifications` worker; back-office, customer-web, customer-mobile. Shop and driver apps
change nothing — they already re-read on `announceOrder` / `announceDispatch`.
**Performance Goals**: a move is one short transaction; the planner's pass lock is held for its length
(milliseconds), as 073's manual actions already do.
**Constraints**: customer never sees the reason, the courier fee or Effy's cost; shops never see
compensation; never charge the customer more; no polling; no cards; nothing given twice.
**Scale/Scope**: staff gateway 153 → 155 of 300; shared unchanged.

## Constitution Check

| Principle | Verdict | Notes |
|---|---|---|
| I. Spec-driven | ✅ | Spec carries no technology; two corrections made from planning, recorded. |
| II. Shared contracts | ✅ | DTOs in `@effy/shared-types` (`order-admin.ts`, `order.ts`); `compensationLine` in `delivery-type.ts` + fixture; Kotlin contract regenerated. |
| III. One backend; gateways | ✅ | No new service; `orders` on the staff gateway. |
| III. Money and points live once | ✅ | Points only through `points.credit`; refunds only through `@effy/edge-shared/payments` (`recordIn` / `submitRecorded` are the existing service split, not a re-implementation). |
| III. One implementation | ✅ | Delivery type: `recordDeliveryType`. Mode: `consignment.ts`. Driver work: `removeAssignment` moved, not copied. Window rule: `judgeWindow`. Fee: `courierFee`. |
| IV. Auth isolation | ✅ | Write = admin/manager from the staff record; CSA read-only; uniform 403. |
| V. Design | ✅ | Dialogs and detail rows; delivery history as a list on the order page — no cards. |
| VI. Layering | ✅ | Pure `overrideAmounts`; SQL in the shared module / repositories; thin handlers. |
| VII. Observability | ✅ | `DeliveryOverrides {to}`, `DeliveryCompensation {kind}`; daily alarm. |
| Live updates | ✅ | `announceOrder`, `announceDispatch`, `announceSlots` after commit; change-map guard covers the new route. |
| Operator runs live changes | ✅ | Migration, deploys and `make apply` handed over. |

Post-design re-check: no violation.

## Project Structure

```text
db/migrations/<ts>_courier_override.sql                          NEW
packages/shared-types/src/{order-admin,order,delivery-type}.ts
packages/shared-types/src/delivery-type.fixtures.json            # compensation lines
packages/shared-types/contract*/                                  # regenerated
packages/email-kit/src/{catalog.ts,templates/order-delivery-changed.mjml,text/…,fixtures/…}

apis/edge-api/shared/src/
├── delivery/override.ts (+ .test.ts, .container.test.ts, .guard.test.ts)  NEW  # moveToCourier / moveToEffy / previewMove / overrideAmounts
├── delivery/driver-work.ts                                     NEW  # removeAssignment + PASS_LOCK (moved from fleet)
├── delivery/consignment.ts                                     # setCourierRouting
├── points/ledger.ts                                            # CreditInput.quiet
├── payments/refunds/{repository,service,state}.ts              # recordIn, submitRecorded, kind delivery
├── live/…                                                      # announceDispatch moved beside announceOrder
└── lib/notification-types.ts                                   # order_delivery_changed
apis/edge-api/orders/src/delivery-move/{service,repository}.ts + 2 functions; orders/{repository,service}.ts (deliveryMoves)
apis/edge-api/orders/serverless.yml                             # 2 routes
apis/edge-api/fleet/src/assignments/service.ts                  # imports removeAssignment
apis/edge-api/commerce/src/orders/{repository,service}.ts       # delivery.moved
apis/edge-api/notifications/src/worker/{copy,email-sender}.ts   # order_delivery_changed
infra/envs/dev/<orders alarms>.tf                               # DeliveryOverrides daily alarm

apps/back-office/src/features/orders/{OrderDetailScreen.tsx, components/{SendByCourierDialog,DeliverByEffyDialog,DeliveryHistory}.tsx, repo.ts, queries.ts, errorText.ts}
apps/customer-web (order page line), apps/customer-mobile (order/receipt line + CompensationWords.kt)
docs/order-console-guide.md, docs/runbooks/courier-override.md (NEW)
```

## Build order

1. Migration + shared types + fixture + regenerate contracts. 2. `overrideAmounts` (P1).
3. Move `removeAssignment` to shared; fleet green (P14). 4. `setCourierRouting`, `credit.quiet`,
`recordIn`/`submitRecorded`. 5. `override.ts` move to courier (P2–P5, P10), then move back (P9).
6. `orders` routes + detail DTO (P6–P8). 7. Commerce DTO (P11). 8. Notification + email.
9. Back-office dialogs + history. 10. Customer web + mobile line (P13). 11. Metrics + alarm. 12. Guards
(P12), docs, runbook, FEATURE-HISTORY.

## Risks

| Risk | Limit |
|---|---|
| Compensation given twice (double click, retry) | Order already `courier` → 409; points dedupe key and refund idempotency key per override id |
| Points given but the move rolled back | Credit is in the same transaction |
| Refund lost between commit and submission | Recorded in the transaction as `submitting`; 055's reconciler resolves it |
| A parcel taken from a driver mid-delivery | Refused while a delivery round is under way |
| Planner re-assigns a parcel mid-move | Planner pass lock held for the transaction |
| Customer learns the courier fee or Effy's cost | DTO carries kind + amount only; contract test P11 |
| A second writer of the mode or the type | Existing guards stay green; P12 |
| Moves become routine | Daily alarm above 5 |

## Complexity Tracking

| Trade-off | Why | Rejected |
|---|---|---|
| A `delivery_override` table beside `order_delivery_type_change` | The type history is 079's one-writer table, shared with checkout; compensation and windows are E7's facts | Widening the history table: checkout rows would carry a dozen NULL money columns |
| A new refund kind `delivery` | Its own idempotency key per move; staff read what it was | `goodwill`: same-amount moves would collapse into one refund |
| `refund.recordIn(tx)` | 055's record-then-submit, inside the move's transaction | Refund after commit with no record: a crash loses the compensation |

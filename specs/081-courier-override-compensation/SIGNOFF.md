# Sign-off notes: 081 — Back-Office Courier Override & Compensation

**Status (2026-10-09)**: **built and checked by machine. NOT migrated, NOT deployed, NOT walked.**
Everything below ran on local containers and test runners; nothing touched AWS. 35/35 tasks ticked, with
the gaps listed under "Not done". Rides 078's model switch: only orders sold under the new delivery model
have a delivery type, so nothing in dev can be moved until the switch is on.

## What changed

- **Send by courier…** (back-office → order → Delivery type; admin/manager): a dialog with the server's
  figures — what the customer paid for delivery, what courier delivery costs this basket today, the
  difference (never below zero), the courier service and how the parcels reach it, and the timeframe the
  customer will be told — and five choices: **points for the difference** (preselected), free delivery as
  points, free delivery back to the card, the difference back to the card (last resort), or nothing (with
  a note). A staff reason is required and never shown to the customer.
- **One transaction** (`@effy/edge-shared/delivery` `override.ts`): the planner's pass lock → the order
  → the window place released → packages rewritten as courier routing (standard, no window) → off
  delivery rounds not under way (and off collection rounds when the courier collects from the supplier)
  → the default courier service and mode (`consignment.ts` `setCourierRouting`) → the type through
  079's one writer (`changeDeliveryType`, new, returns the history row) → `delivery_override` → the
  compensation (points `credit(…, quiet)`; a refund **recorded** in the transaction, `kind delivery`,
  sent after commit by `submitRecorded`) → push + email to the customer.
- **Deliver by Effy…**: back to Effy before anything is with the courier, to an address on Effy's list,
  into a window open with room (`judgeWindow` under the slot lock); booked courier pickups cancelled; no
  money moves; earlier compensation stays.
- **History** on the order for every role (who, when, why, window, figures, what the customer got, the
  refund's state). Customer-service agents read; only admins and managers move (403 otherwise).
- **Customers**: the order page (web) and receipt (app) add *"We've changed this order to courier
  delivery."* and *"We've added 250 points ($2.50) to your account to make up for it."* — one wording
  (`movedLines` / `compensationLine`, Kotlin twins on the shared fixture). Email `order-delivery-changed`
  + push `order_delivery_changed`. Never the reason, the fee or the difference.
- **Shared library moves** (one implementation each): fleet's `removeAssignment` + pass lock →
  `delivery/driver-work.ts`; `announceDispatch` / `announceSlots` → `@effy/edge-shared/live`; refunds'
  `record` body → `recordRefundIn(tx, …)`.
- **Observability**: EMF `DeliveryOverrides {to}`, `DeliveryCompensation {kind}` (`Effy/Orders`); alarm
  `<prefix>-delivery-overrides-daily` when more than `var.delivery_override_daily_alarm` (5) moves to
  courier in a day.

## Proofs

| # | Proves | Broken once? |
|---|---|---|
| P1 | amounts: difference clamps at 0, points round up, card refund capped | ✅ clamp removed → failed; restored |
| P2 | move to courier: every part, hub and supplier | — |
| P3 | a failure at the last step leaves nothing changed | ✅ credit outside the transaction → a points entry leaked, failed; restored |
| P4 | each compensation by its own means | — |
| P5 | dearer courier → $0, nothing charged | — |
| P6 | refusals: out for delivery, handed over, delivered, unpaid, no type, no courier | — |
| P7 | stale amount / stale order refused; a repeat gives nothing twice | ✅ expected-amount check removed → failed; restored |
| P8 | CSA reads, cannot move | — |
| P9 | move back: window taken, booking cancelled, full window / out of area / handed over refused | — |
| P10 | one message, push + email; the points credit sends none | — |
| P11 | customer DTO: to, when, what they got — no reason, fee or difference | ✅ reason leaked → failed; restored |
| P12 | guards: one writer of `delivery_override`, never rewritten; `removeAssignment` defined once; `courier_override` not an operator reason | ✅ a second INSERT site → failed; restored |
| P13 | TS ↔ Kotlin wording on the shared fixture | — (both suites green) |
| P14 | fleet after the move of `removeAssignment` | — (293/293) |

## What ran (with `CONTAINER_TESTS=1`)

edge-api: shared 885, orders 122, fleet 293, commerce 328, notifications 71, driver 177, customer 221,
storefront 180, admin 251, shop 484/485 (the known `recipientsForShop` failure, open since 079).
shared-types 104; email-kit 100 + email-check (16 templates); back-office 361; customer-web 664; shop-web
453; design-system guards; customer-mobile host tests (53 suites). `pnpm -r typecheck` clean; `terraform
fmt` + `validate` clean; scripts no-emerald, no-jade, no-refresh-timers, shop delivery words.

## Deviations from the spec / tasks (mine — for the operator to confirm)

1. **Orders placed before the new delivery model cannot be moved** (spec corrected during planning): the
   one writer never invents a delivery type for them.
2. **A parcel out for delivery blocks the move** (spec corrected): fleet never touches a delivery round
   under way. Collection work stays when the order goes via the hub.
3. **Consignments are not created at the move** (backlog E7-T02 said so): they are created at booking
   (080). The move sets the service and mode only.
4. **One `POST …/delivery-move` for both directions, compensation in the same call**, and one `GET`
   preview (backlog E7-T05/06/07 listed up to three routes).
5. **The points credit is quiet** (`CreditInput.quiet`): the move's own message names the points, so the
   customer gets one message, not two.
6. **"Nothing" requires a note** — enforced in the route and by a CHECK.
7. `recordDeliveryType`'s change branch is now `changeDeliveryType` (returns the history row id);
   `recordDeliveryType` calls it and keeps its boolean contract.

## Not done

- No walk. The dialogs were proved by component tests, not in a browser.
- iOS builds not compiled here (Android host tests only). The receipt change is plain `Text`.
- The customer order LIST does not show the moved line (detail and receipt only).

## Operator steps (dev)

```
make db-up ENV=dev                                # one additive migration; Down refuses once a move or a delivery refund exists
make edge-deploy SERVICE=notifications ENV=dev   # FIRST: it must know order_delivery_changed before anything sends one
make edge-deploy SERVICE=orders ENV=dev          # +2 staff routes (staff gateway 153 → 155)
make edge-deploy SERVICE=fleet ENV=dev           # imports removeAssignment / announceDispatch from shared
make edge-deploy SERVICE=commerce ENV=dev        # the customer order's `delivery.moved`
make apply ENV=dev                                # the daily moves alarm
```

Optional (they bundle the shared module; their behaviour is unchanged): `admin`, `storefront`, `shop`,
`driver`. Then the web builds (back-office, customer-web on push) and the customer mobile build.

⚠ **Migrate first.** ⚠ **Leave the model switch NULL** except while walking.

## Walks still to do

V1–V7 in [quickstart.md](quickstart.md), in dev with the model switch on for the walk, then back to NULL.
Prerequisites: an active courier fee table, a default courier service, an Effy order paid in a window,
a driver on duty.

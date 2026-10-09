# Quickstart & Validation: Delivered by Effy vs Courier Delivery (079)

Proofs are automated and each marked one is **broken once on purpose** before it is trusted. Walks are
by hand in dev. Operator steps are at the end — Claude runs none of them. Shapes:
[contracts/routes.md](contracts/routes.md); tables and functions: [data-model.md](data-model.md).

## Proofs

| # | What | Where | Broken once by |
|---|---|---|---|
| P1 | `courier_reaches_postcode`: each reason — unknown, off, excluded, pending (switch off), not ready (no table / no estimate), offered | `shared/src/delivery/coverage.container.test.ts` | dropping the model-switch condition |
| P2 | `coverage_for_postcode`: listed → effy whatever the courier settings; the one-argument call still works | same | — |
| P3 | Switch **off** + courier fully armed → serviceability, address book and quote all say `none`; quote byte-equal to before (`wire.contract.test.ts` unchanged) | `commerce` container + `storefront` container | answering courier without the switch |
| P4 | Switch on, out-of-area → quote `coverage: courier`, `courier.fee` = `courierFee` of the whole basket, no windows; Effy's free-delivery amount has no effect | `commerce/src/checkout/checkout.container.test.ts` | pricing with the Effy plan |
| P5 | Courier intent → order `delivery_type = courier`, reason, estimate stored; packages `standard`, no window; **no** `delivery_slot_booking` row; charged = shown | same | taking a hold |
| P6 | Intent type ≠ server's answer (both directions, and field absent on courier) → `409 delivery_type_changed`, nothing written | same | accepting the client's type |
| P7 | Address A (Effy, window held) → intent for address B (courier) on the same pending order → booking gone, package rows replaced, type flipped | same | not deleting the booking |
| P8 | Payment → first history entry exactly once (webhook replayed twice); a pending order has none | `shared/src/payments/finalize` container | removing the conflict target |
| P9 | Estimate text changed after the order → order page, receipt and email keep the sold text | `commerce/src/orders` + `notifications/src/receipts` | reading the setting instead of the order |
| P10 | No-window fallback: off → 078's refusal; on → courier quote `reason: no_window`; on + postcode excluded → refusal; any window open → never courier | `commerce` container | offering it while a window is open |
| P11 | `package_delivered_by` truth table: new effy / new courier / legacy same-day / legacy standard / legacy windowed standard / pre-047 null | `shared` container | — |
| P12 | Handover list, "needs handover", handoff refusal and on-time read `package_delivered_by`: an Effy later-day package is refused for a carrier; a courier package is listed | `orders` container tests | — |
| P13 | Guard: no application SQL decides who delivers from `slot_id IS NULL` or `method`; only `recordDeliveryType` writes the history table or sets `delivery_type` after placement; `COURIER_ORDERING_AVAILABLE` is gone | `shared/src/delivery/delivery-type.guard.test.ts` | adding a second writer |
| P14 | History rows cannot be updated or deleted by a service role | `shared` container | — |
| P15 | `packageStatus` for a courier package: never `out_for_delivery`; `with_carrier` after handover; Effy later-day package never `with_carrier` | `shared/src/status/status.test.ts` | — |
| P16 | `deliverySummary` fixtures — courier, same-day, later-day, legacy split — web and Kotlin twin agree | `packages/shared-types/src/delivery-type.test.ts`, customer-mobile `commonTest` | editing one Kotlin sentence |
| P17 | Shop DTOs carry `deliveredBy` for all six package kinds of P11; no window, day, estimate or money (`delivery-isolation.contract.test.ts`) | `shop` container | — |
| P18 | Guard: shop-web and shop-mobile UI source never prints "same-day" / "standard" | `scripts/check-shop-delivery-words.sh` | restoring one label |
| P19 | Back-office: `deliveryType` filter (effy / courier / legacy); detail shows reason, estimate, history | `orders` container + `apps/back-office` tests | — |
| P20 | Admin: estimate validation; cannot switch on without table + estimate; cannot clear the estimate or deactivate the table while on; `pending` while the switch is off | `admin/src/delivery/coverage.container.test.ts` | — |
| P21 | Web checkout: courier quote renders heading, two lines, fee, no picker; address change clears the window and total; `delivery_type_changed` re-renders | `apps/customer-web/app/checkout/*.test.tsx` | keeping the chosen window across addresses |
| P22 | Mobile checkout: the same, from the same quote fixtures | customer-mobile `commonTest` | — |
| P23 | Existing guards green: `windows.guard`, `coverage.guard`, `fee.guard`, `change-map.guard`, gateway capacity (no route added), `check-no-refresh-timers.sh`, design-system guards | repo | — |

Run: `pnpm -r typecheck`; `pnpm --filter @effy/shared-types test`; the container suites of `shared`,
`commerce`, `storefront`, `orders`, `shop`, `admin`, `notifications`; `pnpm --filter @effy/customer-web
test`; `pnpm --filter @effy/shop-web test`; `pnpm --filter @effy/back-office test`; `./gradlew
:shared:testAndroidHostTest` in `apps/customer-mobile` and `apps/shop-mobile`; `make cm-contract-check`.

## Operator steps (dev)

```
make db-up ENV=dev                       # one additive migration; safe before the deploys
make edge-deploy SERVICE=notifications ENV=dev
make edge-deploy SERVICE=commerce ENV=dev
make edge-deploy SERVICE=storefront ENV=dev
make edge-deploy SERVICE=orders ENV=dev
make edge-deploy SERVICE=shop ENV=dev
make edge-deploy SERVICE=admin ENV=dev
```

Then the web builds (customer-web, shop-web, back-office — CI on push to `dev`) and the customer and
shop mobile builds. No Terraform change.

**The model switch stays NULL** (E9 turns it on). Courier may be armed at any time — Back-office →
Delivery → Coverage: set the estimate, keep a courier fee table active, switch courier on. It reads
"Starts with the new delivery model" until the switch.

To walk V4–V10 in dev only:

```sql
UPDATE public.delivery_settings SET delivery_model_v2_from = now() WHERE id = 1;
-- walk; cancel any later-day Effy order placed (no driver round until E8); then:
UPDATE public.delivery_settings SET delivery_model_v2_from = NULL WHERE id = 1;
```

## Walks (dev)

- **V1** Switch off: web and mobile checkout exactly as before; an out-of-area address is refused.
- **V2** Shop web and shop app: every package reads "Effy driver" or "Courier"; no "same-day"/"standard".
- **V3** Back-office: set the courier estimate; try to switch courier on with no fee table (refused);
  activate a table, switch on → "Starts with the new delivery model". Orders list has a Delivery
  column; old orders show their old words.
- **V4** (switch on) In-area address: heading "Delivered by Effy", 078's picker; pay → order page,
  receipt, email agree.
- **V5** Out-of-area address: "Courier delivery", the estimate, the courier fee, no picker; pay →
  order page, list, receipt and email all say Courier delivery with the estimate.
- **V6** At checkout pick a window, switch to the out-of-area address, back again: nothing is
  pre-selected; totals follow the address each time.
- **V7** An address on the courier exclusion list: the one refusal sentence; Pay unavailable.
- **V8** Back-office: filter Courier; open the V5 order → type, reason "address outside Effy's area",
  estimate, one history entry. Change the estimate text → the V5 order still shows the old one.
- **V9** Shop prepares the V5 package → driver collects → hub check-in → handover: status reads
  Preparing → Ready → With driver → At hub → With carrier; never "Out for delivery".
- **V10** Switch every window off, fallback off → no-windows sentence; fallback on → courier offer
  with reason "no Effy window available" on the placed order.
- **V11** V4–V7 in the customer mobile app.

# Quickstart & Validation: Courier Fulfilment (080)

Marked proofs are broken once on purpose. Walks are by hand in dev. Operator steps at the end.

## Proofs

| # | What | Where | Broken once by |
|---|---|---|---|
| P1 | `nextCourierPickup`: before/after cutoff, non-pickup weekdays, DST days | `shared/src/delivery/courier-pickup.test.ts` | ignoring the cutoff |
| P2 | Supplier-mode packages never gathered for collection; hub-mode are | `fleet` planner container | removing the exclusion |
| P3 | Hub handover creates/completes the consignment and the handoff together; status With carrier | `orders` container | writing only one |
| P4 | Supplier handover: shop marks its own; never another shop's; status skips At hub | `shop` container | — |
| P5 | Delivered event writes the arrival; order completes | `orders` container | — |
| P6 | Problem → Problem status + `courier_problem` awaiting; resolved clears | `shared` status + `orders` container | ignoring `resolved` |
| P7 | Mode change refused after a handoff or pick-up; to supplier refused while a driver is assigned (unassign first) | `orders` container | allowing after pick-up |
| P8 | Hub list due-out = next pickup; late after cutoff | `orders` container | — |
| P9 | Checkout tells the default service's estimate; order keeps it and the service id | `commerce` container | reading the setting |
| P10 | Courier off unless an active default service (`courier_delivery_state`) | `shared` coverage container | — |
| P11 | Customer tracking: one link / email / none, never a count | `commerce` orders + shared-types fixture | showing a link with two consignments |
| P12 | Shop DTOs: no fee, estimate, tracking link, other package | `delivery-isolation.contract.test.ts` | — |
| P13 | Guard: one writer of consignment events; collection exclusion in one fragment | `shared` guard | a second writer |
| P14 | Driver check-in returns `courierCount`; app says "Courier", never "Standard" | `driver` container + driver-mobile test | — |
| P15 | Gateway capacity, change-map, refresh timers, shop words, token guards | repo | — |

## Operator steps (dev)

```
make db-up ENV=dev
make edge-deploy SERVICE=notifications ENV=dev   # FIRST: it must know order_with_courier before orders sends one
make edge-deploy SERVICE=admin ENV=dev
make edge-deploy SERVICE=orders ENV=dev
make edge-deploy SERVICE=shop ENV=dev
make edge-deploy SERVICE=fleet ENV=dev
make edge-deploy SERVICE=driver ENV=dev
make edge-deploy SERVICE=commerce ENV=dev
make apply ENV=dev                                # the CourierParcelsLate alarm
```
Then web builds and the three
mobile builds. Add at least one courier service in back-office before switching courier on.

## Walks (dev, model switch on by hand, then back to NULL)
- **V1** Add two services; make one default; retire the other.
- **V2** Courier order, via the hub: collect, check in (driver sees "Courier"), Courier tab shows due-out,
  record handover with a link → customer sees the link and gets the email.
- **V3** Two-supplier courier order, pickup from supplier: no driver work; each shop sees its pickup and
  label; both hand over; customer sees "tracking sent by email".
- **V4** Switch an order to via the hub before pickup; try after a handover (refused).
- **V5** Record "lost" → Problem, needs attention; resolve.
- **V6** Leave a hub parcel past cutoff → late; alarm fires after two hours.

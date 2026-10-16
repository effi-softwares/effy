# Contract: fleet — staff record a return, and see failed parcels (088)

Service `apis/edge-api/fleet`, **staff** gateway. Back-office authorizer; **mutate** (admin / manager), like resolving an exception — it asserts the goods are physically on a hub shelf.

## POST /fleet/v1/dispatch/rounds/{roundId}/return

Request: `{ "changeId": "uuid" }` → 200 `{ "returned": n, "roundComplete": boolean }`.

- The same writer as the driver route (`recordParcelReturn`), with `recorded_by = 'staff'` and the
  staff member's sub; audited `dispatch.parcels_returned` (FR-012/013).
- 404 for an unknown round. Announces `DISPATCH`, `ops/orders`, the shops, and the driver's `work`.

## Changed reads (additive)

- `DeliveryExceptionDTO.packageLocation`: `"with_driver" | "at_hub"` — now TRUE for delivery parcels
  (research R2). Adds `roundId: string` (for the return action) and `returnedAt: string | null`.
- `DispatchDayDTO` adds `failedParcels: { withDrivers: number; returnedAwaitingDecision: number }`
  (FR-009).
- `CustodyPackageDTO` rows now include delivery parcels in transit or to return; adds
  `toReturn: boolean`.

## Refusals that change wording (shared delivery tools)

`DeliveryMoveError("with_driver_after_failure")` — "A parcel of this order is still with the driver
after a failed delivery. Record its return first." (`moveToCourier`, `moveToEffy`,
`changeEffyWindow`), and dispatch `reassign` / `unassign` on a round with parcels to return:
409 `parcels_to_return`, "Parcels from a failed delivery are still with this driver. Record their
return first."

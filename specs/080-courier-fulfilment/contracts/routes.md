# Contracts: Courier Fulfilment (080)

Staff gateway +7 routes (146 → 153 of 300); shared gateway +1 (158 → 159). Types live in
`@effy/shared-types` and are regenerated into the Kotlin contracts (customer, shop, driver).

## Admin — courier services (`delivery-admin.ts`, staff)

```ts
interface CourierServiceDTO {
  id: string; courierName: string; serviceName: string;
  estimateText: string;        // "2–4 business days"
  maxBusinessDays: number;
  pickupWeekdays: number[];    // ISO 1–7
  pickupCutoff: string;        // "14:00"
  collectsFromSupplier: boolean;
  status: "active" | "retired";
  isDefault: boolean;
}
```
`GET /admin/v1/delivery/courier-services` → `{ items, collectionDefault: "hub" | "supplier" }`
`POST …/courier-services` (create) · `PUT …/courier-services/{id}` (edit, retire, make default).
`collectionDefault` is set through `PUT /admin/v1/delivery/coverage/courier` (existing, gains the field).
Refusals: `422 invalid_service` (field errors), `409 default_service_required`, `409 service_in_use`
(none — retiring keeps history). `CourierBlocker` gains `"no_service"`; `"no_estimate"` is no longer
returned. Mutate = admin/manager; audited; announces `delivery`.

## Orders — consignments (`order-admin.ts`, staff)

```ts
interface ConsignmentDTO {
  id: string; service: { id: string; label: string };   // "Courier · Service"
  collection: "hub" | "supplier";
  reference: string | null; trackingUrl: string | null; labelUrl: string | null;
  pickup: { date: string; from: string | null; to: string | null } | null;
  state: ConsignmentState;
  events: { kind: ConsignmentEventKind; actor: { kind: "staff" | "shop"; sub: string }; note: string | null; at: string }[];
}
// AdminOrderPackageDTO gains: consignment: ConsignmentDTO | null; dueOut: string | null; late: boolean
// AdminOrderDetailDTO gains:  courierCollection: "hub" | "supplier" | null; courierCollectionHistory[]
```
- `PUT /orders/v1/fulfillments/{id}/consignment` — book or edit `{serviceId, reference?, trackingUrl?,
  labelKey?, pickup?}`. 409 `not_courier`, `consignment_handed_over` (service/collection locked).
- `POST …/consignment/events` — `{kind, note?}`: `handed_over` (writes the handoff), `in_transit`,
  `delivered` (writes the arrival), problems, `resolved`, `cancelled`. 409 `invalid_step`.
- `POST …/consignment/label` — presigned PUT for a PDF/PNG ≤ 5 MB → `{labelKey, uploadUrl}`.
- `PUT /orders/v1/orders/{id}/courier-collection` — `{mode, note}`. 409 `collection_locked`.
- `GET /orders/v1/handovers?view=hub_due|hub_late|supplier|with_courier|problems` — the Courier tab.
  Rows: order, package, service, dueOut / pickup, state, late.
- `OrderAwaiting` gains `"courier_problem"`.

## Shop (`shop-order-console.ts`, `shop-order.ts`, shared)

```ts
courierPickup?: {
  state: "arranging" | "booked" | "handed_over" | "cancelled";
  pickupDate: string | null; pickupFrom: string | null; pickupTo: string | null;
  courierName: string | null; serviceName: string | null; reference: string | null;
  labelUrl: string | null;     // short-lived presigned read
}
```
Present only on packages of supplier-mode courier orders. `POST /shop/v1/fulfillments/{id}/courier-handover`
— manager or staff; 409 `not_booked` (no consignment yet), `already_handed_over` (idempotent replay
returns 200). ⚠ No fee, estimate, tracking link or other package.

## Customer (`order.ts`, `delivery-type.ts`)

```ts
OrderDeliveryDTO.tracking?: { kind: "link"; url: string; courierName: string } | { kind: "email" };
```
`DELIVERY_TYPE_WORDS` gains `trackParcel: "Track your parcel"`, `trackingByEmail: "Tracking for each
parcel is sent to you by email."`, `withCourier: "Your order is with the courier."`.
Notification type `order_with_courier` (email template `order-with-courier`, push copy).

## Driver (`driver.ts`)
`HubCheckinResponse.courierCount` (new); `standardCount` kept, deprecated.

## Live
Consignment and mode changes announce `orders` to ops, the package's shop and the customer
(`announceOrder` / `announceMoves`); courier services announce `delivery` (ops).

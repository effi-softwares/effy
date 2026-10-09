# Research: Courier Fulfilment (080)

**Feature**: 080 · **Date**: 2026-10-09 · Epic **E6** of `docs/prd/2026-10-delivery-model-v2-backlog.md`

## Findings from the code (F)

**F1 — "Handed over" and "arrived" already have one record each.** `carrier_handoff` (053, UNIQUE per
package, reference/carrier nullable by design) and `package_arrival` (053, `source` already reserves
`carrier_signal`). `packageStatus` reads both (`PACKAGE_STATUS_FACTS`): handed over → With carrier,
arrived → Delivered. Recording an arrival requires a handover (`no_handoff`).

**F2 — A parcel reaches collection work through one query.** `GATHER_COLLECTION`
(`fleet/src/planner/sql.ts`) takes every `ready_for_pickup` package not already assigned. Nothing
excludes a package; pickup-from-supplier needs one exclusion here and nowhere else.

**F3 — 079 made courier orders due "the day placed".** `orders/src/orders/promise.ts` and the handover
list (`orders/src/orders/repository.ts`) use the placed date when there is no promised day. E6 replaces
that with the courier service's next pickup.

**F4 — The driver app says "Standard — external carrier".** `HubCheckinResponse` has `sameDayCount` /
`standardCount`; `CollectionScreens.kt` titles the second "Standard — external carrier".

**F5 — The estimate is one platform text** (`delivery_settings.courier_estimate_text`, 079), and
`public.courier_delivery_state` is "not ready" without it.

**F6 — Private files already have a home.** Proof media is written under `proof/` in the media bucket
with presigned reads (064). Labels can use a `courier-label/` prefix the same way; no new bucket.

**F7 — Back-office's work queues are `OrderAwaiting`** (`handover` | `arrival` | `refund_decision`)
derived on read from missing facts, plus the Handover tab.

**F8 — Unassigning a package from a driver is 073's** (fleet "Unassign"), the one path that withdraws an
open `round_package` assignment.

## Decisions (R)

### R1 — Courier services are a list in back-office; one is the default
- **Decision**: `public.courier_service` (courier name, service name, estimate text, pickup weekdays,
  pickup cutoff, collects-from-supplier, active/retired, `is_default` with a partial unique index).
  Admin routes on the staff gateway. Checkout tells the customer the **default** service's estimate and
  records `order.courier_service_id` beside the estimate text it already keeps (079).
- **079's estimate setting is retired**: `courier_delivery_state` becomes "not ready" without an active
  default service; the Coverage tab's estimate field is replaced by a link to Courier services.
  `delivery_settings.courier_estimate_text` stays, unread, dropped at E9.
- ⚠ **No service is created by the migration.** A courier's name is a real-world identifier; it is
  entered by the operator (CLAUDE.md, prohibited values). If dev has courier switched on, it reads "not
  ready" until a service is added — with the model switch off, nobody notices.

### R2 — The mode is on the order, from a platform default
- **Decision**: `delivery_settings.courier_collection_default` (`hub` | `supplier`, default `hub`);
  `order.courier_collection` set at the intent for a courier order (NULL otherwise); changes recorded in
  `order_courier_collection_change` (who, when, why). One orders route changes it.
- **When it may change**: while no package of the order has a `carrier_handoff` and none is
  `picked_up` on a collection round. Switching to `supplier` while a package is **assigned** but not
  picked up withdraws the assignment through 073's unassign path (F8), in the same transaction.

### R3 — A consignment holds the booking and the journey; handover and arrival stay where they are
- **Decision**: `public.courier_consignment` — one live row per package (cancelled rows kept):
  service, how it reached the courier, reference, tracking link, label key, pickup date and window,
  state. `public.courier_consignment_event` — append-only steps (booked, handed over, in transit,
  delivered, failed, lost, damaged, returned, resolved, cancelled) with actor and note.
- **One source of truth for each fact**: *handed over* is still `carrier_handoff`; *delivered* is still
  `package_arrival`. The one writer `recordConsignment…` (shared) writes the handoff / arrival through
  the existing functions and the consignment event in the same transaction, so `packageStatus`, the
  arrival guard and completion are unchanged. A handover recorded the old way (hub list) creates the
  consignment if staff had not booked one.
- **Problem**: `PACKAGE_STATUS_FACTS` gains the latest unresolved problem event; `packageStatus` returns
  "Problem" with its reason when it is newer than any arrival. Customers see "Problem" only as the nine
  words already allow; reason text is staff-only (FR-023).
- **Alternative rejected**: moving `carrier_handoff` into the consignment (two writers of "handed over"
  during the move; every reader changes).

### R4 — Pickup from supplier never reaches a driver
- **Decision**: `GATHER_COLLECTION` gains `AND NOT (o.delivery_type = 'courier' AND o.courier_collection =
  'supplier')`. The hub handover list excludes them too. A guard holds the two to one SQL fragment.

### R5 — "Due out" is the service's next pickup
- **Decision**: a pure `nextCourierPickup(from, weekdays, cutoff)` in `shared/src/delivery` (Melbourne
  wall clock, noon-UTC day arithmetic like `windows.ts`). For a hub parcel: from its check-in time (or
  now, if not yet checked in), using the booked service, else the order's checkout service. Late = past
  that day's cutoff with no handover. Replaces 079's "due the day placed" in `promise.ts` and the list.
- Overdue with courier: handed over, no delivered/problem event, and older than the service's
  **maximum** business days — parsed from a separate integer `max_business_days` on the service (the
  estimate text is for customers and is not parsed).

### R6 — Suppliers see their own pickup and nothing else
- **Decision**: shop order DTOs (list, detail, Today, the app's queue) gain `courierPickup`:
  `{state: arranging | booked | handed_over | cancelled, pickupDate, pickupFrom, pickupTo, courierName,
  serviceName, reference, labelUrl}` for packages of supplier-mode orders. One shop route marks it handed
  over. `labelUrl` is a short-lived presigned read. ⚠ No fee, no estimate, no tracking link, nothing of
  another package (`delivery-isolation.contract.test.ts`, extended).

### R7 — Back-office runs bookings from the order and from one Courier tab
- **Decision**: on the order page, each courier package has a Consignment block (book / edit / upload
  label / record progress / cancel). The Handover tab becomes **Courier**: hub due today / late,
  supplier pickups booked / late, with courier overdue, problems — one route (`GET /orders/v1/handovers`
  with a `view`). `OrderAwaiting` gains `courier_problem`, ranked first after refunds.

### R8 — What the customer is told
- **Decision**: `OrderDeliveryDTO` gains `tracking?: {kind: "link", url, courierName} | {kind: "email"}`:
  one live consignment with a link → link; more than one → email; otherwise absent. New notification
  type `order_with_courier` (email + push) per consignment handover, carrying that parcel's link when
  known. New email template `order-with-courier`.

### R9 — The driver app says "Courier"
- **Decision**: `HubCheckinResponse` gains `courierCount` (packages `package_delivered_by = 'courier'`);
  `standardCount` stays for installed builds. The screen's second block reads "Courier — handed to a
  courier at the hub". Later-day Effy parcels at the hub are E8's.

### R10 — Alerting
- **Decision**: a scheduled function in `orders` (every 30 min, EventBridge — not a route) emits
  `CourierParcelsLate {where: hub | supplier | with_courier}`; a Terraform alarm on
  `where = supplier` and `hub` ≥ 1 for 2 hours → alerts topic.

### R11 — Routes and gateways
- Staff gateway (+7): admin `GET/POST /admin/v1/delivery/courier-services`, `PUT …/{id}`; orders
  `PUT /orders/v1/fulfillments/{id}/consignment`, `POST …/consignment/events`,
  `POST …/consignment/label`, `PUT /orders/v1/orders/{id}/courier-collection`. 146 → 153 of 300.
- Shared gateway (+1): shop `POST /shop/v1/fulfillments/{id}/courier-handover`. 158 → 159 of 300.

### R12 — Couriers for Melbourne/Sydney with business-address pickup (D14)

⚠ **From general knowledge, not verified against current offerings, prices or contracts.** Booking is
manual in this feature, so nothing here is integrated; the operator chooses and enters services.

| Courier | Pickup from many business addresses | Same/next day metro | Booking/label API (for E10) | Notes |
|---|---|---|---|---|
| Australia Post / StarTrack | Yes (scheduled or daily pickup with a business account) | Express next day; same-day in some metros | Yes (business shipping APIs) | Broadest reach incl. regional |
| Sendle | Yes (door pickup per parcel) | Mostly 1–5 business days | Yes | No account contract; small-business pricing |
| CouriersPlease | Yes | Next day metro | Yes | Metro strength |
| Aramex (Fastway) | Yes | Next day metro | Yes | Franchise network |
| Uber Direct / DoorDash Drive | On-demand pickup | Same hour/day metro only | Yes | Does not fit out-of-area by definition |
| Zoom2u | On-demand / scheduled | Same day metro | Yes | Metro only |

- **Fit**: courier orders are by definition **outside** Effy's area, so on-demand metro services
  (Uber Direct, DoorDash Drive, Zoom2u) do not fit. A national network (AusPost/StarTrack, Sendle,
  CouriersPlease, Aramex) does. **Chilled/frozen goods** need a service that accepts them — most do not;
  076's exclusions list and the operator's choice of service carry that.
- **For E10**: every candidate national network offers a booking + label + tracking API, so "manual now,
  API later" changes data entry, not the model.

### R13 — Not done here
Automatic booking, webhooks, live quotes (E10). Staff moving an order between Effy and courier (E7).
Returns beyond recording "returned to sender".

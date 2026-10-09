# Implementation Plan: Courier Fulfilment — Via the Hub or Pickup from the Supplier

**Branch**: `dev` (feature directory `080-courier-fulfilment`) | **Date**: 2026-10-09 | **Spec**: [spec.md](spec.md)

## Summary

A courier order's parcels reach the courier **via the hub** (as today) or by **pickup from the
supplier**, from a platform default with a per-order change. Each handover becomes a **consignment**
(service, reference, tracking link, label, progress). The business keeps a list of **courier services**,
each with its own customer timeframe and pickup schedule; checkout tells the default's. Suppliers see and
hand over their own pickups; the hub list is due by the service's next pickup; drivers see "Courier";
customers get one tracking link or "sent by email"; problems reach back-office. Sixth slice of the
delivery model v2 programme (epic E6). Manual booking only.

Seven decisions ([research.md](research.md)):

1. **Courier services are a back-office list with one default** (R1); 079's single estimate text is
   retired from the console. No service is seeded — courier names are the operator's to enter.
2. **The mode lives on the order** (`hub` | `supplier`), from a platform default (R2).
3. **The consignment holds the booking and the journey; "handed over" and "delivered" stay in 053's
   records** (R3). One shared writer does both in one transaction, so status, arrival and completion
   are unchanged.
4. **Pickup from supplier is one exclusion in the collection gather** (R4).
5. **Due out = the service's next pickup**, from a pure calendar function (R5).
6. **Customers**: one link when one consignment, "by email" when several (R8).
7. **No new service.** +7 staff routes, +1 shared route; one scheduled function and one alarm.

⚠ **Before the operator can use it**: add at least one courier service. If courier delivery is already
switched on in dev, it reads "not ready" until then — invisible while the model switch is off.

## Technical Context

**Language/Version**: SQL (PostgreSQL 16, Goose); TypeScript / Node 22 Lambdas; React 19 (back-office,
shop-web, customer-web); Kotlin 2.4 / CMP (customer, shop and driver apps); Terraform (one alarm).
**Primary Dependencies**: none added. Labels use the existing media bucket under `courier-label/` with
presigned URLs (064's pattern).
**Storage**: one additive migration — 4 tables, 4 columns, 1 function ([data-model.md](data-model.md)).
**Testing**: Vitest units (calendar), container tests (orders, shop, fleet, commerce, shared, driver),
guards, component tests, Kotlin host tests ([quickstart.md](quickstart.md) P1–P15).
**Target Platform**: `admin`, `orders`, `fleet` (staff gateway); `shop`, `driver`, `commerce` (shared);
`notifications` worker; all six apps.
**Performance Goals**: no new reads on the customer quote beyond one default-service row; the gather
gains one predicate on columns already joined.
**Constraints**: shops never see fee, estimate, tracking or another package; customers never learn the
number of suppliers beyond Q8's accepted "per parcel by email"; no polling; no cards; identifiers asked
for, never seeded.
**Scale/Scope**: staff gateway 146 → 153, shared 158 → 159 of 300.

## Constitution Check

| Principle | Verdict | Notes |
|---|---|---|
| I. Spec-driven | ✅ | Spec carries no technology. |
| II. Shared contracts | ✅ | DTOs and words in `@effy/shared-types`; three Kotlin contracts regenerated; new words added to `delivery-type.ts` and its fixture. |
| III. One backend; gateways | ✅ | No new service. Staff: `admin` (services), `orders` (consignments, mode, Courier tab). Shared: `shop` (supplier handover), `driver` (check-in counts), `commerce` (estimate). A scheduled function is not compute we hold open. |
| III. One implementation | ✅ | One writer of consignment events; handoff and arrival keep their one writer each; one collection-mode fragment; one pickup calendar. |
| IV. Auth isolation | ✅ | Shop route scoped to the operator's own shop's package; staff mutate = admin/manager. |
| V. Design | ✅ | Tables, lists and detail rows; the order page gains a Consignment block as rows, not a card. |
| VI. Layering | ✅ | Pure calendar; SQL in repositories. |
| VII. Observability | ✅ | `CourierParcelsLate {where}` + alarm; `ConsignmentEvents {kind}`; PostHog `courier_tracking_opened`. |
| Real-world identifiers | ✅ | Courier names/services entered by the operator; nothing seeded or inferred. |
| Live updates | ✅ | Every new mutating route announces (change-map guard). |
| Operator runs live changes | ✅ | Migration, deploys, `make apply` handed over. |

Post-design re-check: no violation.

## Project Structure

```text
db/migrations/<ts>_courier_fulfilment.sql                 NEW
packages/shared-types/src/{delivery-admin,order-admin,order,delivery-type,shop-order-console,shop-order,driver}.ts
packages/shared-types/src/delivery-type.fixtures.json      # tracking cases
packages/shared-types/contract*/                           # regenerated
packages/email-kit/src/{catalog.ts,templates/order-with-courier.mjml,text/…,fixtures/…}

apis/edge-api/shared/src/
├── delivery/courier-pickup.ts (+ .test.ts)   NEW  # nextCourierPickup
├── delivery/consignment.ts (+ guard, container) NEW  # the one writer: book, event, handoff/arrival
├── delivery/coverage.ts, quote.ts            # default service's estimate; not-ready without one
├── status/{sql,status}.ts                    # courier problem
└── lib/notification-types.ts                 # order_with_courier
apis/edge-api/admin/src/delivery/courier-services.{service,repository}.ts + 3 functions
apis/edge-api/orders/src/consignments/* + 4 functions; orders/{repository,service,promise}.ts; handoff/*; a scheduled sweep
apis/edge-api/fleet/src/planner/sql.ts        # the exclusion
apis/edge-api/shop/src/{orders,today,pick-lists,fulfillments}/* + 1 function (courier-handover)
apis/edge-api/driver/src/work/complete.ts     # courierCount
apis/edge-api/commerce/src/{checkout,orders}/* # service id on the order; tracking on the DTO
apis/edge-api/notifications/src/{worker,receipts}/* # order_with_courier email + push
infra/envs/dev/orders-alarms.tf (or the existing alarms file)

apps/back-office/src/features/{delivery (Courier services panel), orders (Consignment block, Courier tab)}
apps/shop-web/src/features/{fulfillment,today}  # Courier pickup row + Handed over
apps/shop-mobile/.../features/orders            # same
apps/driver-mobile/.../collection/CollectionScreens.kt  # "Courier"
apps/customer-web (order page tracking), apps/customer-mobile (receipt tracking)
docs/delivery-console-guide.md, docs/order-console-guide.md, docs/runbooks/courier-handover.md (NEW)
```

## Build order
1. Migration + shared types + regenerate contracts. 2. `nextCourierPickup` (P1). 3. Courier services
(admin) and the coverage/quote change (P9, P10). 4. Consignment writer + status (P3, P5, P6, P13).
5. Orders: consignment routes, mode route, Courier tab, due-out (P7, P8). 6. Planner exclusion (P2).
7. Shop routes and DTOs (P4, P12). 8. Driver count (P14). 9. Customer tracking + notification + email
(P11). 10. Sweep + alarm. 11. Clients. 12. Docs and runbook.

## Risks

| Risk | Limit |
|---|---|
| A supplier-mode parcel still sent to a driver | One fragment, guard, P2 |
| Two writers of "handed over" | Consignment writer calls 053's functions; guard |
| A shop sees another supplier or the fee | Isolation contract test P12 |
| Customer learns supplier count | Only Q8's accepted "per parcel by email"; no count anywhere |
| Courier switched on with no service | `courier_delivery_state` not ready; admin refusal |
| Late parcels unnoticed | Courier tab views + alarm |
| Labels hold customer addresses | Private prefix, presigned reads, shop sees only its own |

## Complexity Tracking

| Trade-off | Why | Rejected |
|---|---|---|
| Consignment beside `carrier_handoff` rather than replacing it | Status, arrival and completion stay untouched | Migrating the handoff into the consignment: every reader changes and two writers exist mid-move |
| A cached `state` column on the consignment | Lists read it cheaply | Deriving from events on every list read |

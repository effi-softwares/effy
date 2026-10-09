# Runbook — courier handover (080)

How a courier order's parcels get to the courier, and what to do when they don't. Manual booking: you
book with the courier outside Effy and record it here. Automatic booking is a later feature.

## Before the first courier order

1. Delivery → **Pricing**: a courier fee table, active.
2. Delivery → Coverage → **Courier services**: add the service you use (courier, service, what customers
   are told, late after N business days, pickup days and cut-off, collects from suppliers) and make it
   the **default**. Nothing is pre-filled.
3. Choose **How courier parcels reach the courier** (via the hub, or pickup from the supplier).
4. **Offer courier delivery**. (Until the new delivery model is switched on, nobody is offered it.)

## Every day — via the hub

1. Orders → **Courier** → *Due at the hub*: what must go out at the next pickup, soonest first.
2. When the courier collects: open each order → **Record handover** (or Book first to add the label,
   reference and tracking link). The customer is emailed per parcel.
3. *Late at the hub* is anything that missed its pickup. An alarm fires after two hours.

## Every day — pickup from the supplier

1. For each new courier order, open it and **Book** each parcel: service, pickup day and window, label,
   reference and tracking link. The supplier sees the pickup only once it is booked.
2. The supplier marks **Handed over to courier**; the parcel moves to *With the courier* and the
   customer is emailed.
3. *Supplier pickups* marked **Late**: the window has gone with no handover. Call the supplier or the
   courier. If the courier cannot come, open the order → Delivery type → **Switch to via the hub**
   (refused while a driver is assigned to collect — Unassign first). This cancels the booking; Effy's
   drivers then collect it as usual.

## With the courier

- Record **In transit** / **Delivered** as you learn them. Delivered finishes the parcel (and the order,
  when it is the last) exactly like an arrival.
- *With the courier* marked **Late**: longer than the service's usual maximum. Chase the courier.

## Problems

Lost, damaged, returned to sender, or delivery failed: record it on the consignment with a note. The
order shows **Courier problem** in the list and the parcel reads **Problem** everywhere staff look. Make
it right with the customer (refund from the order page if needed), then press **Resolved** — or
**Delivered** if it turns up.

## Alarms

| Alarm | Means | Do |
|---|---|---|
| `courier-parcels-late-hub` | A parcel at the hub missed its pickup, for 2 h | Courier → Late at the hub |
| `courier-parcels-late-supplier` | A booked supplier pickup's window passed with no handover, for 2 h | Courier → Supplier pickups |
| `background-courier-late-sweep-errors` | The sweep that counts late parcels is failing | Logs: `/aws/lambda/effy-edge-orders-<env>-courierLateSweep` |

The late alarms also fire when the sweep stops reporting (missing data is treated as late).

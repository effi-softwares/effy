# The first delivery model — same-day slot / standard day (047–069), removed by 083

**Status: REMOVED.** This is a record of what the platform did before the delivery model changed
(decided 2026-10-07, built as specs 074–083). Nothing here describes current behaviour. For that, read
"Delivery model" in [CLAUDE.md](../../CLAUDE.md).

It exists for one practical reason: **orders sold this way are still in the database**, and someone
reading one — a customer's receipt, a refund query, an audit — needs to know what it says.

## What it was

A customer chose a **method per order**, applied per package:

- **Same-day** — offered where the delivery zone (and the fulfilling shop) allowed it and a time slot was
  still open. The customer picked a slot today. Effy's own drivers collected from the shop, checked in at
  the hub, and delivered in that slot.
- **Standard** — always offered at a served address. The customer picked a **day**. Effy's drivers
  collected to the hub; hub staff then handed the package to an external **carrier** on *the promised day
  minus the carrier's lead time*, and the carrier delivered it.

So one order could arrive in two parts, by two parties, on two days — and the checkout said "N of your M
deliveries can arrive today", which told the customer how many suppliers they had.

Pricing began (047) as a fee per package: a zone's distance tier ("ring") × weight band × a method
multiplier. 077 replaced it with one fee per order, before this model was removed.

## Why it was replaced

- The split made "who delivers this" depend on the method, the zone, the shop and the slot at once.
- A standard day was a promise Effy made on a carrier's behalf with no carrier contract behind the lead time.
- Customers outside Effy's area had no way to order at all.

The replacement asks one question first — **who delivers**: Effy (a window today or on one of the next
delivery days) or a courier (an estimate, never a date).

## How to read an order sold this way

Such an order has **no delivery type**: `"order".delivery_type IS NULL`. It was never backfilled and must
not be — it keeps exactly what it was sold.

| What you want to know | Where it is |
|---|---|
| Who delivered each package | `public.package_delivered_by(o.delivery_type, method, slot_id)`: `same_day`, or sold a window, → **Effy**; otherwise → **a carrier**. Every screen and query goes through it. |
| What the customer was promised | `order_package_delivery`: `method`, `promised_to` (the day), and for same-day `slot_id` / `window_start` / `window_end`. An order from before 069 has no day and no window. |
| When a carrier's package left the hub | `carrier_handoff` (who recorded it, the carrier's reference) |
| When it arrived | `package_arrival` |
| What delivery cost | `"order".delivery_fee_amount`; from 077, `delivery_fee_breakdown` says how it was built. Orders before 077 have no breakdown. |
| Whether it arrived on time | Inside its window if it had one; on or before its promised day otherwise; nothing to judge for an order before 069. |

What the customer reads on such an order is unchanged: its window, or "arriving" its day. It carries no
"Delivered by Effy" / "Courier delivery" label — nothing about an old order is guessed.

**An old order cannot be moved between Effy and courier** (081's tool refuses it: `no_delivery_type`), and
no old order is open: the migration that removed the model refused to run while one was.

## What was removed (083 stage 2)

| Thing | Was |
|---|---|
| `delivery_zone.sameday_eligible`, table `shop_sameday_exception` | which zones and shops did same-day (047; frozen by 076) |
| `delivery_fee_plan.same_day_factor`, `standard_factor` | the method multipliers (047; unread since 077) |
| `delivery_settings.standard_lookahead_days` | how many days the standard-day picker offered (069) |
| `delivery_settings.carrier_lead_days` | hub handover → delivered, in days; set the earliest day and the handover due date (069) |
| `delivery_settings.courier_estimate_text` | 079's one platform-wide courier estimate (a courier service carries it since 080) |
| `order_package_delivery.delivery_fee_amount`, `shop_fulfillment.delivery_fee_amount` | the per-package fee (047; a compatibility split since 077) |
| `driver_zone_capability.method` | whether a driver was cleared for same-day or standard (062; unread since 082) |
| `driver_round.locked_by_sub`, `locked_at` | the round lock (063; unused since 073) |
| Checkout: the method choice, the slot picker, the standard-day picker; the intent's `deliveryMethod` / `sameDaySlotId` / `standardDate`; the quote's `packages`, `sameDaySlots`, `standardDays`, `standardFee` | the 047/069 checkout |
| "Hand over on the day minus the lead time" | replaced by "due out by the courier service's next pickup" (080) |

Earlier removals on the same road: delivery rings and per-ring prices (077), the zone/ring admin screens (076).

## What was kept, and is not legacy

- `shop_fulfillment.delivery_method` / `order_package_delivery.method` (`same_day` | `standard`). For an
  Effy order they are the customer's words — a window today / a window on a later day. For an old order
  they are how `package_delivered_by` answers.
- The customer words **"Same-day delivery"** and **"Standard delivery"**. "Standard" changed its meaning:
  it was a day a carrier delivered; it is a window on a later day that Effy delivers.
- The tables `delivery_zone` (now an optional group of postcodes) and `delivery_zone_postcode` (now the
  list of where Effy delivers) keep their names.
- On the driver and shop wire, the values `same_day_delivery`, `sameDayCount`, `standardCount` and
  `deliveryMethod` are kept so installed apps keep working.

## Where the history is

- Specs: `specs/047-delivery-shipping-engine/`, `specs/069-delivery-slots-dates/` (superseded), and the
  programme that replaced them, `specs/074-…` to `specs/083-delivery-model-cutover/`.
- The backlog and decisions: [docs/prd/2026-10-delivery-model-v2-backlog.md](../prd/2026-10-delivery-model-v2-backlog.md).
- Build records: [FEATURE-HISTORY.md](../../FEATURE-HISTORY.md), entries 047, 069, 076–083.
- The code: `git log` before the commit that applied 083 stage 2.

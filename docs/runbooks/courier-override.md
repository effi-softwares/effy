# Runbook — moving an order to courier (081)

An emergency move of a paid "Delivered by Effy" order to courier delivery, and back. The console side is
in [order-console-guide.md](../order-console-guide.md#moving-an-order-between-effy-and-courier-081).

## When to use it

Only when Effy cannot deliver an order it promised: the van is off the road, no driver can take the
round. Not as a cheaper way to deliver, and not because a customer asked (a customer choosing courier is
a later feature). Every move breaks a promise and is audited; more than 5 moves to courier in a day
alarms (`<prefix>-delivery-overrides-daily`).

## Before it works

- The **new delivery model** must be on — orders placed before it have no delivery type and cannot be
  moved.
- Delivery → **Pricing**: an active **courier fee table** (the move compares it with what the customer
  paid).
- Delivery → Coverage → **Courier services**: a **default** service (the customer is told its timeframe).

## Choosing how to make it right

| Choice | When | What the customer gets |
|---|---|---|
| Points for the difference (default) | Usually | Points worth paid − courier fee |
| Free delivery, as points | A bad week, a repeat failure | Points worth the whole delivery charge |
| Free delivery, back to the card | The customer asked for money back | The whole delivery charge refunded |
| Refund the difference | Last resort | The difference refunded |
| Nothing (say why) | The difference is $0 and no gesture is warranted | Nothing — they are still told |

Points are credited at once. A card refund is recorded with the move and sent straight after.

## A parcel is out for delivery

Refused: a parcel already in a van is not taken off the driver mid-round. Wait until the driver records
it delivered or not delivered, then move the order.

## The refund did not go

- **"not answered yet"**: the refund reconciler retries it within minutes; nothing to do.
- **"refused"**: the move stands. Issue a goodwill refund from **Refunds** on the order for the amount
  shown in the move's history line.

## Moving it back

**Deliver by Effy…** before any parcel is with the courier, to an address on Effy's list, into a window
open with room. A booked courier pickup is cancelled. Nothing is charged or refunded; compensation already
given stays.

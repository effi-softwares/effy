# Fulfilment analytics taxonomy (020)

The shared, typed event names for the shop's order-fulfilment workflow (Principle VII). **shop-web**
emits these today (`apps/shop-web/src/lib/telemetry.ts`, via PostHog). **shop-mobile** adopts the
**same names** when its telemetry lands (deferred to the `mobile-telemetry` slice, per 013/014/015/016)
— this doc is the single source so the two surfaces never diverge on event names.

**No PII, and a tighter rule than usual here.** These events describe an operator handling a real
customer's order, so props carry **ids and low-cardinality enums only** — never a customer name,
address, phone, product name, order total, or any payment field. The operator is associated by the
auth **subject id** alone. Note that `orderNumber` is deliberately **absent**: it is a
customer-facing reference and would tie analytics to an identifiable purchase.

## The workflow

| Event | Props | Emitted when |
|---|---|---|
| `shop_order_queue_viewed` | `{ state }` | The Orders queue opens (`state`: `active` \| `completed`) |
| `shop_order_opened` | `{ fulfillmentId, status }` | A portion's pick screen opens |
| `shop_order_state_changed` | `{ fulfillmentId, from, to }` | A transition is applied |
| `shop_order_reversed` | `{ fulfillmentId }` | `ready_for_pickup → picking` — the one permitted reversal |
| `shop_order_item_gathered` | `{ fulfillmentId }` | A line's gathered quantity is recorded |
| `shop_order_item_unavailable` | `{ fulfillmentId }` | A line is flagged unavailable |
| `shop_order_item_restored` | `{ fulfillmentId }` | An unavailable flag is lifted (the item turned up) |

`fulfillmentId` is the **portion** id (`public.shop_fulfillment.id`), not a shop id and not an order
id. It is safe here because it identifies a unit of work, not a party.

## What is deliberately NOT emitted

- **No shop identifier.** The operator's shop is derivable from their subject; putting it in props
  would make every dashboard a per-shop leaderboard by accident, and shops are hidden fulfilment
  nodes.
- **No shortfall quantities or product names.** A shortfall is an unresolved financial obligation to
  a specific customer (see the parity register's 020 footnotes); it belongs in the operational
  record, not in product analytics.
- **No timing-to-promise metric.** Deferred until 021 gives promises real differentiation — a
  "late order" statistic computed against today's uniform placeholder promise would be meaningless
  and would look authoritative.

## Operational metrics (distinct from the above)

Product analytics answers *what operators do*; operational health is separate (Principle VII). The
cold-path functions ship CloudWatch alarms in `apis/edge-api/shop/serverless.yml`:

- `Errors > 0` over 5 minutes on every fulfilment function.
- `Duration` p95 > 5s over 3 periods on the queue read specifically — **a blind shop is an
  unfulfilled order**, and a queue that is merely slow still misses SC-001's 30-second budget.

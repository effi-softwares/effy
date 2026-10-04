# Contract: The Two Prices on an Order

No route changes. This records which money each audience reads.

| Reader | Source | Money |
|---|---|---|
| Customer order, receipt page, receipt email | `order_item.unit_price_amount`, `line_subtotal_amount` | customer |
| Stripe PaymentIntent amount | order totals | customer |
| Refund amounts, refund proposals | `unit_price_amount` | customer |
| Back-office order detail | as today | customer |
| **Shop order console** (`/shop/v1/orders…`) | `COALESCE(shop_unit_price_amount, unit_price_amount)` | **shop** |
| **Shop Insights** (rollup, reconcile) | `COALESCE(shop_line_subtotal_amount, line_subtotal_amount)` | **shop** |
| Shop portion subtotal on the shop side | `COALESCE(shop_subtotal_amount, subtotal_amount)` | **shop** |
| Customer's per-portion subtotal | `shop_fulfillment.subtotal_amount` | customer |

Shop DTO field names do not change; their documented meaning becomes "at the shop's price".

## Written by

`apis/core-api/internal/features/checkout/store.go`:
- the cart line read selects `p.shop_price_amount`;
- the order line INSERT writes `shop_unit_price_amount` and `shop_line_subtotal_amount`;
- the fan-out INSERT writes `shop_subtotal_amount = SUM(shop_line_subtotal_amount)`.

Nothing else writes them, and nothing updates them.

## Invariants (tests)

- For a product with shop price 10.00 and margin 2.00, one unit: customer line 12.00, shop line
  10.00, PaymentIntent 12.00 plus delivery.
- Changing the margin or shop price afterwards changes neither stored value.
- For an order placed before 067, shop and customer figures are equal.
- A recomputed pre-067 Insights day equals its stored figures.

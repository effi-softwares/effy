# Contract: payment start (`POST /commerce/v1/checkout/intent`) - changes in 114

The route, gateway (shared), authorizer (customer pool) and every existing field are unchanged. **No new routes.**

## Request: one new field

```jsonc
{
  // ...existing fields (addressId, deliveryType, deliveryWindow, pointsToUse, shownDeliveryAmount, expectedDiscount, …)
  "shownLines": [
    { "variantId": "8a3c…", "quantity": 2 },
    { "variantId": "f01e…", "quantity": 1 }
  ]
}
```

- **Required.** These are the payable lines the checkout displayed: the cart read's quantities, already capped where
  stock is short.
- Validation (422 `validation_failed`) fails when:
  - it is not an array;
  - an entry has a `variantId` that is not a UUID;
  - an entry has a `quantity` that is not a whole number ≥ 1;
  - a `variantId` appears twice.
- Compared as a **set** with the server's payable lines (order ignored). Uncounted sizes are compared too: a line that
  went off sale is a difference as well.

## New refusal: 409 `stock_changed`

```json
{ "type": "about:blank", "status": 409, "code": "stock_changed", "title": "Your cart changed" }
```

Returned when either check fails:
1. **Before anything else is written** (the only write is releasing the order's existing stock holds): `shownLines` differs from the server's payable lines. Those are capped by left to
   sell, with the shopper's own holds not counted.
2. **Under the size locks** (`holdStock`, taken last, just before the provider call): another checkout took the units
   between the read and the lock.

What it guarantees:
- No payment intent is created or changed.
- The order's stock holds are deleted.
- Case 1: points, promotion uses and the window are not taken in this call. Case 2: they were taken earlier in this
  call and are released or run out exactly as for any later refusal today. An earlier attempt's holds of those run
  out as they do today.
- Any error after the stock hold (provider unreachable, payment already in progress) releases the order's stock holds
  before the error is returned, so a payment start that did not start holds no stock.

What the client does: go back to review, show `STOCK_CHANGED_MESSAGE`, re-read the cart and quote. The cart flags each
changed line with 054's existing words. The shopper presses Pay again.

Precedence: checked **before** `promotions_changed` and `delivery_fee_changed`, because the lines decide both totals.

## Success: unchanged shape

On success, every counted line is held for `stock_hold_min` minutes. Nothing new is returned to the shopper (no
countdown; spec assumption).

## Words

| Constant | Value | Where |
|---|---|---|
| `STOCK_CHANGED_CODE` | `stock_changed` | `@effy/shared-types` `checkout.ts` |
| `STOCK_CHANGED_MESSAGE` | Some items in your cart changed while you were paying. Check your order, then pay again. | `checkout.ts`; Kotlin twin pinned to `checkout-words.fixtures.json` |

## Metrics (commerce namespace)

`StockHolds{outcome: held | refused_shown | refused_locked}`; `StockHoldsEnded{reason: replaced, lapsed}`.

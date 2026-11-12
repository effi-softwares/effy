# Contract: operator stock views and the hold time - changes in 114

**No new routes on either gateway.** The staff gateway stays at 234/300 and the shared gateway is unchanged.

## Operator stock reads gain the held number

`ProductStockDTO` (`@effy/shared-types` `inventory.ts`), returned by every route that returns it today. These are the
shop's stock list and product stock (`inventory`, shared gateway) and back-office's admin stock (`inventory-staff`,
staff gateway):

```jsonc
{
  "productId": "…", "variantId": "…", "tracked": true,
  "onHand": 5,          // the shelf count, as entered: holds never change it (FR-015)
  "held": 2,            // NEW - units in other shoppers' live checkout holds; null when untracked
  "leftToSell": 3,      // NEW - max(0, onHand - held); null when untracked
  "threshold": null, "effectiveThreshold": 4,
  "outOfStock": false,  // still onHand === 0 (FR-018)
  "low": false          // still judged on onHand (FR-018)
}
```

`ProductStockDTO` is built only by `stockState()`, so the shop product page (`shop` service) and Availability get
the numbers the same way. back-office's product page (`BackofficeProductDTO`, `catalog` service) gains
`stockHeld: WireInt | null` beside `stockOnHand`. Shop › Stock in back-office is a low-stock list on the shelf count
(`LowStockRowDTO`) and is unchanged.

- **Nothing names the shopper or the order** (FR-017).
- The sorts are unchanged: no sorting by held.

## Live

When holds change, the server announces the kind only:
- `{ scope: "shop", shopId, kind: "stock" }` to each affected shop;
- `{ scope: "ops", kind: "stock" }` to back-office.

shop-web maps `stock` to its existing keys plus the product page key. back-office maps `stock` to its product and shop-stock keys (new mapping).

## Clean-ups settings (`orders` service, staff gateway): one more field

`GET /orders/v1/housekeeping` gains:

```jsonc
{ "abandonAfterMinutes": 1440, "stockHoldMinutes": 15, "version": "…", "mayEdit": true, "jobs": [ … ] }
```

`PUT /orders/v1/housekeeping/settings` body: **at least one** of the two fields, plus `version`:

```jsonc
{ "stockHoldMinutes": 20, "version": "2026-11-12T03:00:00.000Z" }
```

| Case | Answer |
|---|---|
| neither field, an unknown field, or `stockHoldMinutes` not a whole number 5–60 | 422 with the range |
| not an admin | 403 (as for the abandon time) |
| `version` stale | 409 `settings_changed` (as today) |
| ok | 200 with the new DTO. One `housekeeping_settings_change` row per field that changed. Announce `ops` `housekeeping` |

**Activity (`GET /orders/v1/housekeeping/activity`)**: a change reads
"Changed how long checkout holds stock from 15 to 20 minutes", with who made it and when.

# Contract: Notification destinations (109)

Source: `packages/shared-types/src/notification-destinations.ts`, pinned by `notification-destinations.fixtures.json`.
Kotlin twins: `apps/customer-mobile/.../core/push/Destination.kt` and `apps/driver-mobile/.../core/push/Destination.kt`.
The same JSON is stored in `notification.destination`, sent in the push as a compact string (`data.destination`),
and returned by the read route.

## Wire shape

A JSON object with a `kind`, plus the field that kind names. Field names are camelCase. Unknown extra fields are
ignored.

### Customer

| kind | fields | Opens |
|---|---|---|
| `home` | - | Home tab, at its root |
| `orders` | - | Orders tab, at its root |
| `order` | `orderId` | Orders tab → that order |
| `points` | - | Account tab → Points |
| `product` | `productId`, optional `aisleKey` | That product (fallback: the aisle, else Home) |
| `aisle` | `aisleKey`, optional `title` | That aisle's results (108's `category` target) |
| `search` | optional `query` | Search results |
| `sale` | - | On-sale results |

### Driver

| kind | fields | Opens |
|---|---|---|
| `today` | - | Today tab, at its root |
| `run` | `runId` | That run (collection or delivery, from Today), else Today |
| `account` | - | Account tab |

### Shop

| kind | fields | Console path (`shopPathFor`) |
|---|---|---|
| `queue` | optional `fulfillmentId` | `/orders` or `/orders/{fulfillmentId}` |
| `product` | `productId` | `/catalog/{productId}` |
| `catalog` | - | `/catalog` |

## Parsing rules (both languages)

- Input is a JSON string, or an already-parsed object. If it isn't an object with a known `kind` **for this
  audience**, the result is `null`.
- A required field that is missing, empty or not a string → `null`.
- An id is used as given. It is never interpolated into anything except the app's own navigation, or a path segment
  that has been percent-encoded.
- `null` → the app opens its home screen (FR-016).

## Fixture file shape

```json
{
  "cases": [
    { "audience": "customer", "wire": "{\"kind\":\"order\",\"orderId\":\"o1\"}", "expect": { "kind": "order", "orderId": "o1" } },
    { "audience": "customer", "wire": "{\"kind\":\"run\",\"runId\":\"r1\"}", "expect": null },
    { "audience": "shop", "wire": "{\"kind\":\"queue\",\"fulfillmentId\":\"f/1\"}", "expect": { "kind": "queue", "fulfillmentId": "f/1" }, "path": "/orders/f%2F1" }
  ]
}
```
Every kind appears at least once valid and once with a missing field. The file includes cross-audience cases, an
unknown kind, non-JSON and an empty string.

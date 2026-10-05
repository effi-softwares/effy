# Contract: route migration and behaviour changes

Request and response bodies are **unchanged** — they remain the types in `packages/shared-types`
(`storefront`, `cart`, `checkout`, `delivery`, `order`, `saved-item`, `refund`, `payment`) and the
Kotlin generated from them. Error bodies remain RFC 9457 problem documents with the same `type`
URIs and the same `code` / reason values. This file states only what moves and what deliberately
changes.

Base address: the existing edge gateway (`edge-api.<env>.effyshopping.com`).

## 1. Route map

### storefront — public, no credential

| Was (core-api) | Becomes |
|---|---|
| GET `/v1/storefront/home` | GET `/storefront/v1/home` |
| GET `/v1/storefront/categories` | GET `/storefront/v1/categories` |
| GET `/v1/storefront/facets` | GET `/storefront/v1/facets` |
| GET `/v1/storefront/products` | GET `/storefront/v1/products` |
| GET `/v1/storefront/products/:id` | GET `/storefront/v1/products/{id}` |
| GET `/v1/storefront/promotions/:id` | GET `/storefront/v1/promotions/{id}` |
| GET `/v1/storefront/serviceability` | GET `/storefront/v1/serviceability` |
| GET `/v1/storefront/localities` | GET `/storefront/v1/localities` |

### commerce — customer credential unless marked

| Was | Becomes |
|---|---|
| POST `/v1/cart/preview` *(public)* | POST `/commerce/v1/cart/preview` *(public)* |
| GET `/v1/cart/policy` *(public)* | GET `/commerce/v1/cart/policy` *(public)* |
| GET, DELETE `/v1/cart` | GET, DELETE `/commerce/v1/cart` |
| POST `/v1/cart/merge` | POST `/commerce/v1/cart/merge` |
| POST `/v1/cart/items` | POST `/commerce/v1/cart/items` |
| PATCH, DELETE `/v1/cart/items/:productId` | PATCH, DELETE `/commerce/v1/cart/items/{productId}` |
| POST `/v1/cart/items/:productId/set-aside` | POST `/commerce/v1/cart/items/{productId}/set-aside` |
| POST `/v1/cart/saved/:productId/restore` | POST `/commerce/v1/cart/saved/{productId}/restore` |
| DELETE `/v1/cart/saved/:productId` | DELETE `/commerce/v1/cart/saved/{productId}` |
| POST `/v1/cart/reorder` | POST `/commerce/v1/cart/reorder` |
| POST, DELETE `/v1/cart/promo` **(never existed)** | POST, DELETE `/commerce/v1/cart/promo` **(new)** |
| GET `/v1/saved/ids`, GET `/v1/saved` | GET `/commerce/v1/saved/ids`, GET `/commerce/v1/saved` |
| PUT, DELETE `/v1/saved/:productId` | PUT, DELETE `/commerce/v1/saved/{productId}` |
| POST `/v1/saved/merge`, `/v1/saved/add-to-cart` | POST `/commerce/v1/saved/merge`, `/commerce/v1/saved/add-to-cart` |
| GET, POST `/v1/lists` | GET, POST `/commerce/v1/lists` |
| PATCH, DELETE `/v1/lists/:listId` | PATCH, DELETE `/commerce/v1/lists/{listId}` |
| GET `/v1/lists/:listId/items` | GET `/commerce/v1/lists/{listId}/items` |
| PUT, DELETE `/v1/lists/:listId/entries/:productId` | PUT, DELETE `/commerce/v1/lists/{listId}/entries/{productId}` |
| POST `/v1/lists/:listId/add-to-cart` | POST `/commerce/v1/lists/{listId}/add-to-cart` |
| POST `/v1/checkout/quote`, `/intent`, `/confirm` | POST `/commerce/v1/checkout/quote`, `/intent`, `/confirm` |
| GET `/v1/payment-methods` | GET `/commerce/v1/payment-methods` |
| DELETE `/v1/payment-methods/:id` | DELETE `/commerce/v1/payment-methods/{id}` |
| GET `/v1/orders`, `/v1/orders/:id` | GET `/commerce/v1/orders`, `/commerce/v1/orders/{id}` |
| POST `/v1/orders/:id/cancel` | POST `/commerce/v1/orders/{id}/cancel` |
| POST `/v1/orders/:id/refund-requests` | POST `/commerce/v1/orders/{id}/refund-requests` |
| POST `/v1/stripe/webhook` *(provider signature)* | POST `/commerce/v1/stripe/webhook` *(provider signature)* |

### orders — back-office credential, staff record with authority to move money

| Was | Becomes |
|---|---|
| POST `/v1/admin/orders/:orderId/refunds` | POST `/orders/v1/orders/{orderId}/refunds` |
| POST `/v1/admin/orders/:orderId/cancel` | POST `/orders/v1/orders/{orderId}/cancel` |
| POST `/v1/admin/refund-requests/:requestId/decline` | POST `/orders/v1/refund-requests/{requestId}/decline` |

### shop — shop credential, active shop manager, order-scoped

| Was | Becomes |
|---|---|
| POST `/v1/shop/orders/:orderId/refunds` | POST `/shop/v1/orders/{orderId}/refunds` |

### Replaced by a route that already exists

| Was | Already served by | Why no new route |
|---|---|---|
| GET `/v1/platform/status` | GET `/shop/v1/status` (public) | Same statement, same v1 wire shape; core-api's copy had no caller. A third implementation of one proving read would be the duplication this feature removes |
| GET `/v2/platform/status` | GET `/shop/v2/status` (public) | Same, v2 shape |

### Retired, not relocated

| Route | Reason |
|---|---|
| GET `/v1/customer/ping` | Existed only to prove core-api reachability; its page is deleted |
| GET `/v1/shop/live` | Live updates dropped (Clarifications); console uses its existing refresh |
| GET `/metrics`, `/healthz`, `/readyz` | Process endpoints; each edge service has its own health route |

## 2. Credential

Customer routes accept what edge customer routes accept today, presented the same way by the
clients' existing edge client. The handler takes the shopper's identity from the verified token's
subject and then checks the shopper's platform record on **every** request:

| Record | Answer |
|---|---|
| none | 401, indistinguishable from any other sign-in failure |
| barred, or closing | 403, one uniform body |

Staff routes keep the distinction: **503** when the staff or shop record could not be checked,
**403** when it was checked and does not permit the action.

## 3. Deliberate behaviour changes

| # | Operation | Was | Becomes |
|---|---|---|---|
| 1 | Apply / remove promo | 404 (no route) | 200 with the re-priced cart; invalid, expired or exhausted code refused with its reason |
| 2 | Webhook, transient failure | 400; the provider's retry was then discarded as a duplicate | 5xx; nothing recorded; the retry is processed |
| 3 | Webhook, invalid signature | 400 | 400 (unchanged) |
| 4 | Webhook, unknown event type | acknowledged | acknowledged (unchanged) |
| 5 | Product detail, malformed id | 503 | 404 |
| 6 | Product listing, malformed price bound | 503 | 400 `invalid_price` (as facets already answer) |
| 6a | Product hydration by `ids=`, an id that is not a uuid | 503 (the whole rail failed) | that id is dropped; the rest are returned |
| 7 | Any shopper route when the shopper connection limit is reached | n/a | 503 `unavailable`, with `Retry-After` |
| 8 | Refund left uncertain | stayed `submitting` indefinitely | resolved automatically within 15 minutes; the immediate response still says `stalled: true` |

## 4. Carried over unchanged, including known gaps

- The order-placed record is written in the payment transaction and **not delivered** (deferred).
- Abandoned unpaid orders are **not swept** (deferred); their window holds lapse on their own.
- Reading the cart removes lines for archived products.
- `GET /commerce/v1/orders` is unpaginated.
- Listing limit: default 24; a value outside 1–50 becomes 24.
- Bulk add-to-cart derives each line's change id from the request's change id and the product id,
  in the same fixed namespace as before, so a retry issued across the cut-over does not double-add.
- Cache headers: serviceability and localities `public, max-age=86400`; promotion detail none;
  everything else none.
- Refusal reasons remain the last segment of the problem `type`, with underscores as hyphens.
- A request for another shopper's order, list or card is answered 404.

# Contract: core-api Customer Commerce API (`/v1/*`)

Hot-path (`apis/core-api`) HTTP contract for the customer commerce flow. All paths are versioned `/v1`.
Errors are RFC 9457 `application/problem+json` (the platform `httpx` helper). Amounts are decimal strings
+ `currency`. Auth column: **public** (no token), **customer** (customer-pool JWT via the existing
`PoolVerifier`; refuses `customer.status='barred'`), **stripe-sig** (no pool auth; Stripe signature verified).

DTO shapes are defined in [shared-dtos.md](shared-dtos.md) / `@effy/shared-types`.

## Storefront — public reads (no auth, cacheable)

| Method | Path | Auth | Purpose | Response |
|---|---|---|---|---|
| GET | `/v1/storefront/home` | public | Merchandised Home: banners + rails (Featured, On-sale, category rails). | `StorefrontHomeDTO` |
| GET | `/v1/storefront/products` | public | Search/browse. Query: `q, categoryKey, minPrice, maxPrice, saleOnly, attr.<key>, cursor, limit`. Keyset pagination (infinite scroll). Only `status='active'`. `ids=<csv>` variant hydrates recently-viewed. | `ProductSearchResultDTO` |
| GET | `/v1/storefront/products/{id}` | public | Product detail (gallery, attributes, category path). 404 if not active. | `StorefrontProductDetailDTO` |
| GET | `/v1/storefront/categories` | public | Category tree for chips/filters. | `CategoryDTO[]` |

Product responses embed **presigned GET** image URLs (15-min TTL) minted by core-api from
`product_media.storage_key`. Facets are query params (web `robots` Disallows them); no facet is a path segment.

## Cart — customer

| Method | Path | Auth | Purpose | Response |
|---|---|---|---|---|
| GET | `/v1/cart` | customer | The server cart, re-priced against `product`, with availability/price-change notices. | `CartDTO` |
| POST | `/v1/cart/items` | customer | Add/increment a line (`AddToCartRequest`). Clamps to max qty. | `CartDTO` |
| PATCH | `/v1/cart/items/{productId}` | customer | Set a line quantity (`UpdateCartLineRequest`); 0 removes. | `CartDTO` |
| DELETE | `/v1/cart/items/{productId}` | customer | Remove a line. | `CartDTO` |
| POST | `/v1/cart/merge` | customer | Merge a device-local guest cart on sign-in (`MergeCartRequest`); sums qty per product. | `CartDTO` |

## Addresses — customer

| Method | Path | Auth | Purpose | Response |
|---|---|---|---|---|
| GET | `/v1/addresses` | customer | List the customer's delivery addresses. | `AddressDTO[]` |
| POST | `/v1/addresses` | customer | Create (`CreateAddressRequest`); first address becomes default. | `AddressDTO` |
| PATCH | `/v1/addresses/{id}` | customer | Update / set default (`UpdateAddressRequest`). | `AddressDTO` |
| DELETE | `/v1/addresses/{id}` | customer | Remove. | `204` |

## Checkout & payment

| Method | Path | Auth | Purpose | Response |
|---|---|---|---|---|
| POST | `/v1/checkout/intent` | customer | Create/locate the `pending_payment` order from the cart + `addressId`, compute the authoritative total, create the Stripe PaymentIntent (automatic capture, deterministic idempotency key), persist `payment`. | `CreateCheckoutIntentResponse` (orderId, orderNumber, **clientSecret**, publishableKey, grandTotalAmount) |
| POST | `/v1/checkout/confirm` | customer | Fallback finalizer: re-fetch the PaymentIntent from Stripe and run the idempotent paid-transition (covers a delayed/missed webhook). | `OrderDTO` |
| POST | `/v1/stripe/webhook` | stripe-sig | **Authoritative finalizer.** Raw body, signature-verified. On `payment_intent.succeeded` → paid-transition + fan-out + outbox; on `…payment_failed` → `failed`. Dedup on `event.ID`. | `200` (always, after dedup) |

**Security boundary**: `/v1/checkout/intent` returns only the `client_secret` (+ publishable key). The Stripe
**secret** key and **webhook secret** never leave core-api. The webhook route is mounted with a **raw-body**
reader **outside** JSON-binding middleware (preserves the HMAC).

**Idempotency**: PaymentIntent created with `sha256("pi:"+orderId+":"+attemptVersion)`; one active
`pending_payment` order per cart; `stripe_event` PK dedup; paid transition `UPDATE … WHERE status='pending_payment'`.

## Orders — customer

| Method | Path | Auth | Purpose | Response |
|---|---|---|---|---|
| GET | `/v1/orders` | customer | The customer's orders, most-recent-first. | `OrderSummaryDTO[]` |
| GET | `/v1/orders/{id}` | customer | Full receipt/detail (items, address snapshot, amounts, payment status, per-shop fulfillment status — **no shop identity**). Scoped to the owner. | `OrderDTO` / `ReceiptDTO` |

## Favorites — customer

| Method | Path | Auth | Purpose | Response |
|---|---|---|---|---|
| GET | `/v1/favorites` | customer | Saved products, most-recent-first. | `FavoriteDTO[]` |
| PUT | `/v1/favorites/{productId}` | customer | Save (idempotent). | `204` |
| DELETE | `/v1/favorites/{productId}` | customer | Un-save. | `204` |

## Placement transaction (server, on `paid`)

In one DB transaction, guarded by `UPDATE public.order SET status='paid', placed_at=now() WHERE id=$1 AND
status='pending_payment'` (0 rows → already finalized, no-op):
1. Snapshot each cart line into `order_item` (name, unit_price, `shop_id` from `product`).
2. Insert one `shop_fulfillment` per distinct `order_item.shop_id` (`UNIQUE(order_id,shop_id)`).
3. Insert the `order.placed` row into `event_outbox` (envelope + per-shop breakdown payload).
4. Update `payment.status='succeeded'`.
5. Empty the customer's `cart`.

## Observability

Each feature increments low-cardinality business counters on `/metrics`
(`storefront_product_reads_total`, `cart_writes_total{op}`, `orders_placed_total`,
`payments_total{outcome}`), labelled by route/status class only. Structured logs never carry card data,
`client_secret`, tokens, DSNs, or PII beyond the auth subject id.

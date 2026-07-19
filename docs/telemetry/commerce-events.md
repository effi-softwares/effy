# Commerce analytics taxonomy (019)

The shared, typed event names for the customer commerce funnel (Principle VII). **Web** emits these today
(`apps/customer-web/lib/telemetry.ts` — the `StorefrontEvent` union, consent-gated, via PostHog).
**customer-mobile** adopts the **same names** when its telemetry lands (deferred to the mobile-telemetry
slice, per 013/014) — this doc is the single source so the two surfaces never diverge on event names.

**No PII.** Props carry product/order **ids** and low-cardinality enums only — never an email, name, or
address. The customer is associated by the auth **subject id** alone (`identifyCustomer(sub)`).

## The funnel

| Event | Props | Emitted when |
|---|---|---|
| `storefront_viewed` | — | Home / storefront opened |
| `search_performed` | — | A search query is run |
| `product_viewed` | `{ productId }` | A product detail page opens |
| `product_added_to_cart` | `{ productId, quantity }` | Add-to-cart |
| `product_favorited` | `{ productId }` | Save-to-favourites |
| `cart_viewed` | — | Cart opened |
| `checkout_started` | — | Checkout begun |
| `order_placed` | `{ orderId }` | Receipt shown (order placed) |

Auth-funnel events (`sign_up_*`, `sign_in_*`, `deferred_sign_in_*`, `account_linked`) are defined in the
same union and predate this slice.

> Adding an event means adding it to the `StorefrontEvent` union **first** (typed), never inlining a
> string at the call site.

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

## Address book (022)

All five carry **no props** — an address is PII, so nothing about it (not a field, not a label, not a
count) enters a payload. The subject id alone associates the event (`identifyCustomer(sub)`).

| Event | Props | Emitted when |
|---|---|---|
| `address_added` | — | A new address is saved |
| `address_edited` | — | An existing address is updated |
| `address_deleted` | — | An address is deleted |
| `address_default_set` | — | An address is promoted to default |
| `address_delete_default_blocked` | — | A delete of the default was refused (reassign prompt shown) |

> Adding an event means adding it to the `StorefrontEvent` union **first** (typed), never inlining a
> string at the call site.

## Checkout shipping & billing (023)

All three carry **no props** — an address is PII (SC-009), so nothing about it (not an id, not a label,
not a count) enters a payload. The subject id alone associates the event. The empty-object props type on
the union makes the compiler refuse any attempt to attach an address property.

| Event | Props | Emitted when |
|---|---|---|
| `checkout_address_changed` | — | The shipping address is switched to another saved address at checkout |
| `checkout_address_added` | — | A new address is added inline at checkout (shipping or billing) |
| `checkout_billing_diverged` | — | Billing is set to an address different from shipping (toggle OFF) |

> The shop/fulfilment boundary is a telemetry constraint too: the billing address never appears in any
> shop-side log, metric, or event (FR-018 / SC-007).

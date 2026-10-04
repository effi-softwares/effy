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
| `checkout_delivery_instructions_set` | `{ handover, hasNote, fromSavedDefault }` | An order is placed with (or without) delivery instructions (066). `handover`: `leave_at_door` \| `meet_at_door` \| `none`. ⚠ NEVER the note, its length or the address — the note is customer-authored and may hold a gate code; the event's type admits one closed enum and two booleans. ⚠ Declared on customer-web and customer-mobile; emits nothing until PostHog is initialised on web and mobile telemetry is wired. |
| `checkout_delivery_slot_selected` | `{ slotsOffered, position, hoursAhead }` | A same-day order is accepted with a chosen slot (069). All three are whole numbers; `position` is 1-based among the slots shown. ⚠ NEVER the slot's clock time, the address or an order id — a window joined to a session says when a household is home. ⚠ Emitted by customer-web's call site (no-op until PostHog is initialised); declared, not emitted, on customer-mobile. |
| `checkout_delivery_date_selected` | `{ daysAhead, wasDefault }` | A standard order is accepted with a chosen day (069). `daysAhead` is the day's index in the list offered (0 = earliest); `wasDefault` is true when the shopper kept the preselected day. Same emission state as above. |
| `checkout_delivery_choice_refused` | `{ reason }` | The server refused the checkout because the slot or day could not be honoured (069). `reason`: `slot_unavailable` \| `date_unavailable` \| `slot_required`. Nothing was charged. Same emission state as above. |

> The shop/fulfilment boundary is a telemetry constraint too: the billing address never appears in any
> shop-side log, metric, or event (FR-018 / SC-007).

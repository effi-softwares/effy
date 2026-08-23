# Contract: Telemetry Taxonomy (six surfaces, one set of names)

The event **names + prop shapes** are the single cross-surface contract (Principle II; research R8). No
call site may emit an un-typed name (FR-007). Association is by `sub` only; **no PII** (FR-008/022).

## Single sources of truth

- **Web**: the `StorefrontEvent` union (`apps/customer-web/lib/telemetry.ts`) + the console
  `TelemetryEvent` shape (`@effy/web-kit`). Already typed; this slice **initialises** them.
- **Docs SSOT**: `docs/telemetry/commerce-events.md`, `fulfillment-events.md` (extended here with a
  `driver-events.md` and the shared screen-view + push events).
- **Mobile**: each app's `sealed class AnalyticsEvent` mirrors the documented names; a `commonTest`
  **drift check** asserts the app's emitted names ⊆ the documented set (fails and names the offender).

## Every surface stamps `surface`

Super-property `surface` ∈ `customer-web` · `shop-web` · `back-office` · `customer-mobile` ·
`shop-mobile` · `driver-mobile`. Web↔mobile events for one audience share names so a funnel spans both.

## Coverage required (FR-010)

| Group | Examples (names already defined unless marked NEW) | Surfaces |
|---|---|---|
| Screen / page view | `screen_viewed { name }` **NEW** (mobile); web pageview auto | all six |
| Customer commerce funnel | `storefront_viewed`, `product_viewed`, `product_added_to_cart`, `cart_viewed`, `checkout_started`, `order_placed`, `search_performed` | customer-web + customer-mobile |
| Auth funnel | `auth_flow_started`, `auth_code_*`, `sign_in_completed`, … | customer surfaces |
| Shop fulfilment | `shop_order_queue_viewed`, `shop_order_opened`, `shop_order_state_changed`, … | shop-web + shop-mobile |
| Driver workflow **NEW** | `driver_duty_toggled { on }`, `collection_run_opened`, `shop_stop_collected`, `hub_checked_in`, `delivery_run_opened`, `drop_completed { proof }` | driver-mobile |
| Push **NEW** | `push_permission_prompted`, `push_permission_granted`, `push_permission_denied`, `notification_opened { type }` | three mobile apps |

## Hard rules (from the existing web taxonomy — carried to mobile)

- **Props are ids + bounded enums only.** Never an email, name, phone, address, postcode, order total,
  payment field, OTP/token, search query text, or feedback message. (These prohibitions are enforced by
  closed prop types on web today; mobile mirrors them.)
- **A new event is added to the typed taxonomy FIRST**, never inlined as a string.
- **Consent-gated** (customer) / **on-by-default** (internal), all **PII-free**, all **no-op until the
  provider key + `telemetry.enabled` are present**.

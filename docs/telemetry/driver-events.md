# Driver analytics taxonomy (050)

The shared, typed event names for the driver app's hub-and-spoke workflow (Principle VII).
**driver-mobile** emits these; there is no driver web surface. This doc is the single source so a
later surface (or a change to the workflow) cannot silently diverge on names — the app's
`sealed class AnalyticsEvent` mirrors it and a `commonTest` drift check asserts the app's names ⊆ this
set (research R8).

**No PII, and a tight rule.** These events describe an employee moving a real customer's order through
the network, so props carry **ids and low-cardinality enums only** — never a customer name, address,
phone, order total, or any payment/proof-image field. The driver is associated by the auth **subject
id** alone. `orderNumber` is deliberately **absent** (a customer-facing reference).

## The workflow

| Event | Props | Emitted when |
|---|---|---|
| `driver_duty_toggled` | `{ on }` | The driver goes on/off duty |
| `collection_run_opened` | `{ runId }` | A collection run is opened |
| `shop_stop_collected` | `{ runId }` | All assigned packages at a shop stop are collected |
| `hub_checked_in` | `{ runId }` | Collected packages are checked in at the hub (same-day/standard split shown) |
| `delivery_run_opened` | `{ runId }` | A same-day delivery run is opened |
| `drop_completed` | `{ proof }` | A drop is completed (`proof`: `delivery_code` \| `contactless`) |

> Adding an event means adding it to the app's `AnalyticsEvent` sealed class **and** this table
> **first** (typed), never inlining a string at the call site. Cross-surface events
> (`screen_viewed`, the push events) live in [platform-events.md](platform-events.md).

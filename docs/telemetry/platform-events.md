# Platform-wide analytics taxonomy (050)

Cross-surface events that every client emits with the **same names** (Principle VII; research R8), so
navigation and push behaviour can be analysed uniformly across all six surfaces. Web defines these in
its typed unions (`apps/customer-web/lib/telemetry.ts`, `@effy/web-kit`); each mobile app mirrors them
in its `AnalyticsEvent` sealed class; the per-app drift check keeps them aligned.

**No PII** beyond the auth subject id. Every event is **consent-gated** (customer) / **on-by-default**
(internal), and a **no-op** until the PostHog key + `telemetry/enabled` are present.

## Screen / page views

| Event | Props | Emitted when |
|---|---|---|
| `screen_viewed` | `{ name }` | A screen/route is shown (mobile). Web pageviews are auto-captured by the SDK; `name` is a **stable route key**, never free text or a URL with query/PII. |

## Push notifications (mobile)

| Event | Props | Emitted when |
|---|---|---|
| `push_permission_prompted` | — | The OS notification-permission prompt is shown |
| `push_permission_granted` | — | Permission granted |
| `push_permission_denied` | — | Permission denied |
| `notification_opened` | `{ type }` | A push is tapped (`type` = the notification-request type, e.g. `order_ready`; **no** order/customer data) |

Audience-specific funnels live in [commerce-events.md](commerce-events.md) (customer),
[fulfillment-events.md](fulfillment-events.md) (shop) and [driver-events.md](driver-events.md) (driver).

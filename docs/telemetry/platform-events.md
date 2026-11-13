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
| `push_permission_prompted` | - | The OS notification-permission prompt is shown |
| `push_permission_granted` | - | Permission granted |
| `push_permission_denied` | - | Permission denied |
| `notification_opened` | `{ type, fallback }` | A push is tapped, captured **after** the screen it leads to has shown (109). `type` = the notification type, e.g. `order_ready`; `fallback` = `"true"` when the thing it was about was gone and a nearer screen opened instead. **No** order/customer data. Shop console: `notif_opened` with the same fields |
| `inbox_opened` | `{ surface }` | The notification inbox opened (110). `surface` = `app` / `web`. Shop console: `notif_inbox_opened` with `surface` = `panel` / `page` |
| `inbox_item_opened` | `{ type, category, fallback }` | An item in the inbox was tapped, after its screen shows. `fallback` = `"true"` when it opened its detail view instead (no destination this build knows). Shop console: `notif_inbox_item_opened`. A back-office message (112) carries `type` = `customer_message` / `driver_message` / `shop_message` here and in `notification_opened`, so messages opened are counted with no event of their own (112 FR-034) |
| `inbox_item_archived` | `{ type, category }` | An item was archived (swipe or the archive action). Shop console: `notif_inbox_archived` |
| `inbox_archive_undone` | `{ type, category }` | Undo after archiving. Shop console: `notif_inbox_undo` |
| `inbox_marked_all_read` | - | Mark all read. Shop console: `notif_inbox_all_read` |
| `notification_setting_changed` | `{ category, channel, enabled, surface }` | A customer changed a notification choice (111). `channel` = `push` / `email` / `consent` (the Offers or News main switch); `enabled` = `true` / `false`; `surface` = `app` / `web` |
| `offers_ask_shown` | `{ surface }` | The one-time offers ask appeared on an order confirmation (111) |
| `offers_ask_answered` | `{ answer, surface }` | The customer answered it: `answer` = `yes` / `no` (closing it counts as `no`) |
| `offers_stopped_from_inbox` | `{ category, surface }` | "Stop offers like this" / "Stop news like this" on an inbox item (111); `category` = `offers` / `news` |
| `marketing_email_toggled` | `{ category, on, surface }` | Email for offers or news turned on (after the email wording's yes) or off (115); `on` = `"true"` / `"false"` |
| `email_unsubscribed` | - | The website's unsubscribe page stopped offers and news by email (115). No token, no address |
| `email_unsubscribe_undone` | - | Undo on that page (115) |
| `app_link_opened` | `{ kind, surface }` | An Effy link opened the customer app (116), after its screen shows. `kind` = the page (`home`, `orders`, `order`, `points`, `product`, `aisle`, `search`, `sale`, `unknown`); no id, no message, no campaign |
| `team_member_added` | `{ role }` | Back-office: an Administrator added a person to the team (119). `role` = `admin` / `manager` / `csa`. No name, no email |
| `team_member_changed` | `{ action, role? }` | Back-office: a team change (119). `action` = `role` / `disable` / `enable` / `remove` / `sign_out` / `invite` / `repair` / `rename`; `role` = the person's role after it, when they have one |

113 (data lifecycle) adds no client event. Its clean-ups report as backend metrics in the `Effy/Housekeeping` namespace
(`HousekeepingRan`, `HousekeepingFailed`, `HousekeepingPartial` per job; `UnpaidOrdersClosed`, `UnpaidOrdersStillPaying`,
`AccountsErased`, `AccountErasureRetried`, `PhoneRegistrationsRemoved`) and `UnplacedPaymentRefunded` in `Effy/Commerce`;
the alarms are in `infra/envs/dev/housekeeping.tf`.

Audience-specific funnels live in [commerce-events.md](commerce-events.md) (customer),
[fulfillment-events.md](fulfillment-events.md) (shop) and [driver-events.md](driver-events.md) (driver).

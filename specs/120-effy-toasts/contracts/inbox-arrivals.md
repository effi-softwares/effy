# Contract: notifications arriving (phase 2)

No backend change. Each app reads what it already reads.

| | shop-web | customer-web (signed in) |
|---|---|---|
| Trigger | `useUnseenCount()` re-read (live kind `inbox`, tab return) | `NotificationBell`'s count re-read (same triggers) |
| Read | `GET /shop/v1/notifications?limit=5` through `inbox-api.ts` | `GET /api/notifications?limit=5` (existing proxy) |
| Hook | `features/notifications/useInboxArrivals.ts` | `components/notifications/useInboxArrivals.ts` (the look itself, `arrivals.ts`, is `import()`ed - the bell is on every page) |
| Open | `openInboxItem(item)` extracted from `InboxList.tsx` | `openInboxItem(item)` extracted from `InboxView.tsx` |
| Excluded types | `shop_new_order` | none |
| Inbox page | `/notifications` | `/account/notifications` |
| Sound | the Toaster's policy (Sound setting) | never |

The rule (what is new) is one function for both: `inboxArrivals` / `inboxArrivalTitle` in `@effy/shared-types`. Looks
run one after another, each from the mark the last one left.

Words (new, information kind):
- one item: its `title`, button **"Open"**;
- several: **"{n} new notifications"**, button **"Open"** (to the inbox page).

Telemetry (each app's typed taxonomy, `lib/telemetry.ts`): `notif_arrival_shown { count, type? }` and
`notif_arrival_opened { type? }` - type only, never a title or id (no PII, low cardinality).

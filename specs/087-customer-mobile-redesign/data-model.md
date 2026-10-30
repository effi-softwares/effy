# Data Model: Customer Mobile Redesign (087)

No database, migration or backend contract changes. Everything below is **client-side** (the customer
app's domain and presentation models). Wire shapes already exist on the commerce and storefront services.

## RecentSearch (new, device-only)

| Field | Type | Rule |
|---|---|---|
| `text` | String | trimmed, 1–100 chars; compared case-insensitively for de-duplication |
| `at` | Instant (epoch ms) | when it was last submitted |

- Collection: `RecentSearches` - ordered newest first, **max 10**; adding an existing text moves it to the
  top; adding an 11th drops the oldest.
- Stored in `DevicePreferences` under one key (`recent_searches`, JSON array). Never sent to a server or
  to analytics.
- Lifecycle: written on submit (IME search action, or opening a result from a typed query); removed one
  by one or all at once by the shopper; **cleared on sign-out** (and on account deletion).
- Repository: `RecentSearchRepository` (`features/catalog/data/`), use-cases `RecordSearch`,
  `ObserveRecentSearches`, `RemoveRecentSearch`, `ClearRecentSearches`.

## OrderSummary (extended)

Existing: `id, orderNumber, status, itemCount, grandTotalAmount, currency, delivery?`.

Added (mapped from fields the commerce orders list already returns - `packages/shared-types/src/order.ts`):

| Field | Source | Use |
|---|---|---|
| `placedAt` | `placedAt` | meta line ("Placed 12 Oct") |
| `stage` | `stage` (`OrderStage`) | stage pill; unknown value → neutral "We'll keep you posted" |
| `arrivals` | `arrivalEstimates` → existing `distinctArrivals` | arrival line through the pinned wording twins |
| `deliveredAt` | `deliveredAt` | "Delivered 13 Oct" once delivered |
| `thumbnails` | `thumbnails` + `thumbnailWidths` (086) | up to 4 pictures, `+N` for `itemCount − 4`; null entries show the grey well |
| `fullyRefunded` / `refundedTotal` | same | "Refunded" pill instead of the stage |

Validation: absent fields are tolerated (an order from before 084 may lack `stage` or thumbnails) - the
row degrades to today's information, never to an empty or invented value.

## Category (existing, now used)

`key, name, parentKey?, productCount, imageUrl?` - `parentKey` builds the sub-aisle row:
`children(of: key) = categories.filter { it.parentKey == key && it.productCount > 0 }`, ordered as served.

## CartBadge (derived, presentation)

`count = sum(lines.quantity where available)`; shown as `"99+"` above 99; hidden at 0. Derived from
`CartSnapshot` - never stored.

## Tab (navigation, changed)

`CustomerTab = Home | Search | Cart | Orders | Account` (was four). Each tab owns one back stack (existing
`NavBackStack` per tab). `CustomerNavKey.Cart` becomes the Cart tab's root key. State transitions:

- select tab ≠ current → show that tab's stack top (cross-fade).
- select tab = current with stack size > 1 → pop to root (new).
- deep link → select its tab, reset to root, push target.

## Removed

- `AppearanceMode` and the `appearance_mode` preference (light only).
- `NotificationFixtures` (the page shows the empty state; the list is deferred).
- Cart package grouping in presentation (`packageKey` stays in the domain for the server; it is never
  shown).

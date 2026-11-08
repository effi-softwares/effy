# Contract: Inbox routes (110)

The same five routes for each audience, on the shared gateway, each behind its own pool's authorizer:
`{aud}` = `customer` | `driver` | `shop`. They are built by one factory, so all three behave the same. The 109 route
`POST /{aud}/v1/notifications/{id}/read` is unchanged and remains the "tap an item" action.

Every query is keyed on the caller's `sub` **and** the route's audience. Another person's or another audience's item
is `404 notification_not_found`, never 403.

## `GET /{aud}/v1/notifications`

Query:

| Param | Values | Default |
|---|---|---|
| `filter` | `all` \| `unread` | `all` |
| `category` | customer: `orders points offers news important support` · shop: `orders stock products announcements important` · driver: refused | none |
| `cursor` | opaque string from `nextCursor` | none (first page) |
| `limit` | 1–50 | 30 |

Anything else gives `400 invalid_inbox_query`.

`200`:

```jsonc
{
  "pinned": [ /* InboxItem, first page only; [] on later pages */ ],
  "items": [ /* InboxItem, newest first, never a pinned one */ ],
  "nextCursor": "MjAyNi0xMS0wOFQwOToxMjo…",   // null at the end
  "categories": ["orders", "points"],          // first page only: categories with listed items; null on later pages
  "unseenCount": 3                             // so opening the inbox needs no second call
}
```

`InboxItem`:

```jsonc
{
  "id": "uuid",
  "type": "order_out_for_delivery",
  "category": "orders",
  "importance": "normal",              // | "important"
  "title": "Out for delivery",
  "body": "Your order is on the way.",
  "destination": { "kind": "order", "orderId": "…" },   // 109 vocabulary; clients parse leniently
  "createdAt": "2026-11-08T09:12:44.120Z",
  "readAt": null,                      // ISO or null
  "pinnedUntil": null,                 // ISO or null
  "endsLabel": null                    // "Ends Sun" for offers/news/announcements/important with an end; else null
}
```

## `GET /{aud}/v1/notifications/unseen-count`

`200 { "unseenCount": 3 }`

## `POST /{aud}/v1/notifications/seen`

Body `{ "before": "<ISO createdAt of the newest item the client shows>" }`. The server uses `least(before, now())`.

`200 { "unseenCount": 0 }`, the count after the change. Announces `inbox` to the person's channel.

## `POST /{aud}/v1/notifications/read-all`

Body `{ "before": "<ISO>" }`, with the same cut-off rule. Marks read (and seen) every listed item created up to then.

`200 { "updated": 12, "unseenCount": 0 }`. Announces `inbox`.

## `PATCH /{aud}/v1/notifications/{id}`

Body `{ "archived": true }` archives the item, and `{ "archived": false }` undoes it. Repeating either is harmless.

- `200 { "id": "…", "archived": true }`
- `404 notification_not_found`
- `400 invalid_notification_id` / `invalid_inbox_change`

Announces `inbox`.

## Types

- `InboxPageDTO`, `InboxItemDTO`, `InboxCountDTO`, `InboxReadAllDTO`, `InboxArchiveRequest` and `InboxArchiveDTO` live
  in `@effy/shared-types` `notification-inbox.ts`.
- They are added to `customer-contract.ts` and `driver-contract.ts`, and the Kotlin contracts are regenerated.
- Shop-web uses the TypeScript types directly.

## Errors

The problem-JSON shape is the services' existing one: `type` ends in the code.

## Tests

- **Container**: each rule in [data-model.md](../data-model.md), per audience, including another person's id, another
  audience's token, paging 1,000 items with nothing lost or repeated, and the cut-off.
- **Unit**: the factory's validation.
- **Capacity**: the gateway capacity contract.

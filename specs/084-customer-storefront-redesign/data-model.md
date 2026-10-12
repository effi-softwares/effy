# Data model — 084

**No table, column or migration.** Everything below is a read shape over existing data.

## Wire shapes (in `@effy/shared-types`)

### `PromotionListDTO` — new (`GET /storefront/v1/promotions`)

| Field | Type | Note |
| --- | --- | --- |
| `promotions` | `PromotionDTO[]` | every promotion the advertised predicate admits, in banner order |

`PromotionDTO` is unchanged (id, title, subtitle, imageUrl, code, terms, validity).

### `SuggestionsDTO` — new (`GET /storefront/v1/suggestions?q=`)

| Field | Type | Note |
| --- | --- | --- |
| `phrases` | `{ text: string; categorySlug?: string; categoryName?: string }[]` | ≤ 5; from product names, brands, aisles |
| `products` | `StorefrontProductCardDTO[]` | ≤ 4; the existing card shape |

Validation: `q` trimmed, 2–64 characters; shorter → empty lists, 200.

### `OrderSummaryDTO` — extended (`GET /commerce/v1/orders`)

| Field | Type | Note |
| --- | --- | --- |
| `thumbnails?` | `(string \| null)[]` | ≤ 4 primary-image URLs of the first lines, presigned; null where a line has no picture |
| `stage?` | `PackageStatus` | the one status word for the order as a whole; absent on a server not yet redeployed |

Both optional: installed mobile apps and an older server keep working.

## View models (customer-web only, never on the wire)

- **Delivery bar**: `{ label, postcode, deliveredBy: "effy" | "courier" | "none" } | null`.
- **Account overview**: `{ me, activeOrder?, points?, saved: { count, priceDrops, backInStock }, defaultAddress?, defaultCard?, recentOrders[] }` — each part independently absent.
- **Home shortcuts**: derived from the same reads; a shortcut with nothing true is not rendered.
- **Help answer**: `{ id, topic, question, answer }` — authored in the app.

## State

- Cart line ⇄ saved for later: existing `set-aside` / `restore`; no new state.
- Empty cart → undo: the emptied lines are held in the client for the life of the toast and re-added
  through the existing add route; nothing new is stored server-side.

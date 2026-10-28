# Contract — console list endpoints

Applies to every kind-A list route (spec "The lists"). No new routes: existing routes gain these parameters
and return this envelope. Types live once in `@effy/shared-types` `list.ts`; the backend helper is
`@effy/edge-shared` `lib/list-query.ts`.

## Request (query string)

| Param | Type | Rule |
|---|---|---|
| `q` | string | trimmed; ≤ 100 chars (longer → 400 `validation`); empty = absent; `%` `_` `\` escaped before `ILIKE` |
| `sort` | string | a key from the endpoint's whitelist (table below); unknown → the endpoint's default sort (not an error — FR-005) |
| `dir` | `asc` \| `desc` | default per sort key; anything else → default |
| `page` | int ≥ 1 | **offset mode**; past the last page → the last page is returned and `page` says which |
| `cursor` | opaque string | **keyset mode**; malformed → first page (never 500) |
| `pageSize` | `25` \| `50` \| `100` | default 25 (FR-025); other values → 25 |
| `views` | `only` | returns `{ views }` instead of a page (R11) |
| filters | per endpoint | flat params, each validated against its enum/uuid/date; unknown values dropped and echoed in `ignored` |

## Response

```ts
export interface ListPage<T> {
  items: T[];
  pageSize: number;
  /** Exact count of matching records; with `totalCapped`, a floor ("10,000+"). */
  total: number;
  totalCapped: boolean;
  /** Offset mode: the page returned (may be lower than asked, past the end). */
  page: number | null;
  /** Keyset mode: the next page's cursor, null on the last page. */
  nextCursor: string | null;
  /** Filter params that were dropped as unknown, so the client can say so (spec edge case). */
  ignored: string[];
}
export interface ListViews<V extends string> { views: Record<V, number> }
```

`PagedDTO<T>` (shop.ts) is replaced by `ListPage<T>`; the existing page+total endpoints map field-for-field
plus `totalCapped: false, nextCursor: null, ignored: []`.

## Server rules (held by `list-query.guard.test.ts`)

1. Sort expressions come only from the endpoint's whitelist map; a template-literal `ORDER BY ${…}` fed by
   anything else fails the guard.
2. Every list `ORDER BY` ends with the table's primary key in the same direction (total order, FR-003).
3. `LIMIT` is `pageSize + 1` (keyset — the extra row decides `nextCursor`) or `pageSize` with
   `count(*) OVER()` (offset). Offset > 10 000 → 400 `too_deep` with the sentence "Narrow the search to see
   further."
4. Keyset count: `SELECT count(*) FROM (SELECT 1 … LIMIT 10001) t`; ≥ 10 001 → `total 10000, totalCapped true`.
5. Access scoping (shop id from the token for shop routes; role scope for staff) is applied in the `WHERE`
   before any client filter, exactly as today (FR-020).

## Endpoints

Mode O = offset, K = keyset. Default sort first. Gateway: S = staff, Sh = shared.

| List | Route (existing) | GW | Mode | Sorts (default first) | Filters | Search |
|---|---|---|---|---|---|---|
| Orders | `GET /orders/v1/orders` (+ `/orders/v1/summary/views`) | S | K | `placed`↓, `total` | view (`awaiting`, `needsDriver`), `deliveryType`, `promise`, **`status`, `shopId`, `placedFrom`, `placedTo`** | number, email, package code |
| Products | `GET /catalog/v1/products` | S | O | as 102 | as 102 | as 102 |
| Review queue | `GET /catalog/v1/review` | S | O | `waiting`↓, `shop` | `kind`, `shopId` | product, shop |
| Missing details | `GET /catalog/v1/products/missing-details` | S | O | `shop`, `missing`↓ | `shopId`, `categoryId` | product |
| Margin not set | `GET /catalog/v1/review/margin-not-set` | S | O | `since`↓ | `shopId` | product |
| Imports | `GET /catalog/v1/imports` | S | O | `created`↓ | `shopId`, `state` | file |
| Promotions | `GET /admin/v1/promotions` | S | O | `start`↓, `end`, `used` | view, `kind`, `applies`, `groupId` | name, code |
| Promotion codes | `GET /admin/v1/promotions/{id}/codes` | S | O | `code` | `state` | code |
| Promotion customers | `GET /admin/v1/promotions/{id}/customers` | S | O | `used`↓ | — | email |
| Shops | `GET /admin/v1/shops` | S | O | `code`, `name` | `status` | code, name |
| Shop low stock | `GET /inventory/v1/admin/shops/{shopId}/low-stock` (drops `LIMIT 500`) | S | O | `urgency` (out first, then on hand ↑) | `state` (low/out) | product, SKU |
| Shop history | `GET /admin/v1/shops/{id}/audit` | S | K | `at`↓ | — | — |
| Drivers | `GET /fleet/v1/drivers` | S | O | `name` | view, `zoneId` | name, email |
| Vehicles | `GET /fleet/v1/vehicles` | S | O | `plate` | view, `refrigeration`, `owner` | plate |
| Customers | `GET /orders/v1/customers` | S | O | `joined`↓, `lastOrder`, `orders` | `hasOrdered`, `joinedFrom`, `joinedTo` | name, email, phone |
| Customer points | `GET /orders/v1/customers/{customerId}/points/history` | S | K | `at`↓ | `kind` | — |
| Feedback | `GET /admin/v1/feedback` | S | O | `received`↓, `rating` | view (status), `category`, `rating` | as today |
| Deliverability | `GET /admin/v1/deliverability` | S | O | `lastEvent`↓ | view | address |
| Coverage postcodes | `GET /admin/v1/delivery/coverage` | S | O | `postcode`, `distance` | `groupId`, `today` | postcode, place |
| Courier parcels | `GET /orders/v1/handovers` | S | O | `due`↑ | view (stage), `serviceId` | order number, consignment ref |
| Exceptions | `GET /fleet/v1/exceptions` | S | O | `when`↓ | `kind`, `resolved` | order number, package code |
| Shop orders | `GET /shop/v1/orders` | Sh | O | as today | as today | as today |
| Shop catalogue | `GET /shop/v1/products` | Sh | O | as today | as today | as today |
| Availability | `GET /shop/v1/availability` | Sh | O | `stock`↑, `name` | view | name, your code |
| Variant stock history | `GET /inventory/v1/variants/{variantId}/stock?movements=page` (today: last 50 embedded in the same response) | Sh | K | `at`↓ | `reason` | — |

Exact route paths are confirmed against each `serverless*.yml` in the task that converts the list; where the
table names a path that differs, the existing path wins (no route is renamed or added).

## Bounded sets (kind B, capped — R10)

Promotion groups, skins, courier services, fee plans, shop team, the attribute library: unchanged routes; each returns ≤ 501 rows;
create beyond 500 → 409 `limit_reached`, `message`: "This list is full (500). Remove one before adding another."

# Wire contracts - 084

All on the **shared** gateway. Public reads; no authorizer. Errors use the platform problem shape.

## `GET /storefront/v1/promotions` - new

- **200** `PromotionListDTO`. Empty list when nothing is advertised.
- Same visibility predicate as Home's banners and `GET /promotions/{id}` (one definition).
- Uncached, like the single read - an expired promotion must not linger.

## `GET /storefront/v1/suggestions?q={text}` - new

- **200** `SuggestionsDTO`. `q` under 2 characters → `{ phrases: [], products: [] }`.
- **400** when `q` exceeds 64 characters.
- `Cache-Control: public, max-age=60`.
- Only approved, visible products - the search's own predicate. No shop, no stock count.

## `GET /commerce/v1/orders` - extended

- Each row gains optional `thumbnails` and `stage` (see data-model.md). Nothing removed or renamed.
- ⚠ Customer contract rules hold: no shop, no supplier count, no package list.

## Unchanged, newly used by the web

| Route | Used for |
| --- | --- |
| `POST /commerce/v1/cart/items/{productId}/set-aside`, `POST /commerce/v1/cart/saved/{productId}/restore`, `DELETE /commerce/v1/cart/saved/{productId}` | Save for later in the cart |
| `GET /storefront/v1/serviceability` | the header delivery bar |
| `GET /storefront/v1/facets` | Shop by brand |
| `GET /customer/v1/points`, `/me`, `/addresses`; `GET /commerce/v1/saved`, `/payment-methods`, `/orders` | Account Overview, home shortcuts |

## Guards that must stay green

`gateway-capacity.contract.test.ts` (+2 routes on shared), `coverage.guard.test.ts` (no new reader of
the postcode list), `change-map.guard.test.ts` (no new mutating route - none added),
`customer-commerce-contract` tests.

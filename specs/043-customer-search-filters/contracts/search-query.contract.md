# Contract: GET /v1/storefront/products (extended for multi-value facets)

Extends the existing search/browse read. **Backward-compatible**: existing single-value callers keep
working; the change is that brand and attribute facets now accept **repeated** params (OR within).

## Changed / new params

| Param | Before | Now |
|---|---|---|
| `attr.<key>` | single value taken (`vals[0]`) | **all** repeated values taken → OR within the facet |
| `brand` | — (not a filter) | **new**, repeatable → `product.brand = ANY($brands)` |

Unchanged: `q`, `categoryKey`, `minPrice`, `maxPrice`, `saleOnly`, `sort`, `cursor`, `limit`, and the
`ids=` hydration variant. Response shape (`ProductSearchResultDTO`) is **unchanged** — `items`,
`nextCursor`, `total`, `sort`.

## Shared-types change (`@effy/shared-types` storefront.ts — single source, Kotlin generated from it)

```ts
export interface ProductSearchQuery {
  q?: string;
  categoryKey?: string;
  minPrice?: string;
  maxPrice?: string;
  saleOnly?: boolean;
  brands?: string[];                       // NEW — OR within
  attributes?: Record<string, string[]>;   // CHANGED from Record<string,string> — OR within, AND across keys
  sort?: ProductSort;
  cursor?: string;
  limit?: number;
}
```

## Semantics (FR-003)

- Repeated `brand` → `product.brand = ANY($brands)`.
- Repeated `attr.<key>` → the attribute `EXISTS` predicate matches when the product's value is any of
  the supplied values (`value_text = ANY($vals) OR value_options && $vals`).
- Different facet keys AND together (existing behaviour).
- `total` counts the same predicate set as the page (the single shared `filters()` builder — extended,
  not duplicated).

## Guards

- `cursor_sort_mismatch` (400) unchanged; a cursor is still never carried across a sort/filter change.
- Invalid `sort` → `400 invalid_sort` (unchanged).
- Invalid price → `400 invalid_price`.

## Contract tests

- Extend `wire_contract_test.go` + the Kotlin `...WireContractTest.kt` to pin the multi-value param
  encoding (repeated params) and the unchanged response DTO. Prove OR-within/AND-across with a seeded
  set (two brands selected returns the union; a brand + a diet returns the intersection).

# Data model — 103 Console Data Tables

No new tables. No new columns. One migration adds **indexes only** (R9). Everything else is a shape that
travels between the client and the server, or lives in the browser.

## Shapes (shared-types `list.ts`)

| Entity | Fields | Rules |
|---|---|---|
| `ListQuery` | `q?`, `sort?`, `dir?`, `page?` \| `cursor?`, `pageSize?`, filters | contracts/list-contract.md "Request" |
| `ListPage<T>` | `items`, `pageSize`, `total`, `totalCapped`, `page`, `nextCursor`, `ignored` | exactly one of `page` / `nextCursor` meaningful per endpoint mode |
| `ListViews<V>` | `views: Record<V, number>` | counts for the current non-view filters |
| Keyset cursor | base64url of JSON `[sortValue, id]` | opaque to the client; decoded only by `list-query.ts`; malformed → first page |

## Client-only state

| Entity | Where | Lifetime |
|---|---|---|
| List view (`q`, filters, `sort`, `dir`, `page`, `pageSize`) | URL search params | the address |
| Keyset back-stack (cursors for pages 2..n) | router history state | the tab's history entry |
| Search draft (pre-debounce text) | component state | until written to the URL |
| Hidden columns | `localStorage` `effy.table.<app>.<listId>.v1` = `{ hidden: string[] }` | the device |
| Row selection (shop orders) | component state keyed by row id | until filters change |

## State transitions (a list view)

```
any change to q | filter | sort | dir | pageSize  →  page = 1, cursor stack cleared, selection cleared (filters only)
Next (offset)   →  page + 1          Next (keyset) → push nextCursor
Back (offset)   →  page − 1          Back (keyset) → pop
live announcement for the list's kind → refetch current page + counts; view unchanged
```

## Index migration `db/migrations/<ts>_console_list_indexes.sql`

Forward-only, `CREATE INDEX CONCURRENTLY IF NOT EXISTS` (each in its own statement, outside a transaction —
Goose `-- +goose NO TRANSACTION`). Candidate set from R9; each confirmed by `EXPLAIN` before shipping:

- `public."order" (created_at DESC, id DESC)`; `public."order" USING gin (order_number gin_trgm_ops)`
- `public.customer USING gin ((email::text) gin_trgm_ops)`
- `public.shop USING gin (name gin_trgm_ops)`, `(code gin_trgm_ops)`
- `public.vehicle USING gin (registration_plate gin_trgm_ops)`
- `public.delivery_zone_postcode (postcode text_pattern_ops)`
- `public.promotion USING gin (name gin_trgm_ops)`
- `public.product_variant USING gin (sku gin_trgm_ops)`
- ledger keyset orders: `(shop_id, at DESC, id DESC)` on the shop audit table; `(product_id, at DESC, id DESC)`
  on stock movements; `(customer_id, created_at DESC, id DESC)` on the points ledger — only where the existing
  index does not already lead with those columns.

Table and column names are verified against the baseline in the migration task; the list above names intent.

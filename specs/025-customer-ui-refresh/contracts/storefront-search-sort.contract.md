# Contract: Storefront Search — Sort and Total

**Feature**: 025-customer-ui-refresh | **Path**: hot path (`apis/core-api`) | **Auth**: none (public)

The second of the two new read capabilities authorised by spec FR-001a. This **extends the existing**
`GET /v1/storefront/products`; it does not add an endpoint.

## Endpoint

```http
GET /v1/storefront/products?q=&categoryKey=&minPrice=&maxPrice=&saleOnly=&sort=&cursor=&limit=
```

### New parameters

| Param | Type | Default | Notes |
|---|---|---|---|
| `sort` | `newest` \| `price_asc` \| `price_desc` \| `relevance` | `newest` | `relevance` without `q` falls back to `newest` and the response says so. |

### Response — two new fields

```json
{
  "items": [ /* StorefrontProductCardDTO[] — unchanged */ ],
  "nextCursor": "eyJ2IjoxLCJzIjoibmV3ZXN0Iiw...",
  "total": 1240,
  "sort": "newest"
}
```

Both additive. `items` and `nextCursor` keep their existing shape and meaning, so every current
caller keeps working untouched.

**`sort` is echoed, not assumed.** The one case that makes this necessary: `relevance` requested
without `q`. The server falls back to `newest` and reports what it actually did — a client that
assumed its request was honoured would render a sort control that lies about the list beneath it.

## Ordering and pagination

Keyset pagination is retained (the existing `search.go` header explains why: stability under inserts,
unlike `OFFSET`). Each sort needs its own keyset tuple, always with `id` as the tiebreak — no sort key
is unique, and a keyset without a unique tiebreak silently skips and repeats rows.

| `sort` | ORDER BY | Cursor predicate |
|---|---|---|
| `newest` | `created_at DESC, id DESC` | `(created_at, id) < (k, i)` |
| `price_asc` | `price_amount ASC, id ASC` | `(price_amount, id) > (k, i)` |
| `price_desc` | `price_amount DESC, id DESC` | `(price_amount, id) < (k, i)` |
| `relevance` | `similarity(<indexed expr>, q) DESC, id DESC` | `(similarity, id) < (k, i)` |

`newest` is byte-for-byte today's behaviour. No existing result set changes shape.

**Relevance scores against the indexed expression exactly** — the trigram index at
`20260716092105_product_catalog.sql:125` is built on
`lower(name || ' ' || coalesce(sku,'') || ' ' || coalesce(brand,'') || ' ' || short_description)`, and
the ORDER BY uses that same expression so it stays index-backed.

**Matching is unchanged.** `q` still filters with `ILIKE '%…%'`. This feature adds scoring for
*ordering only* — no shopper's existing result set gains or loses members.

## The cursor is opaque and sort-tagged

```text
base64url({ v: 1, s: <sort>, k: <sort key>, i: <uuid> })
```

Clients MUST treat it as opaque and MUST NOT construct one.

**A cursor issued under one sort, presented under another, is rejected with 400.** Not silently
re-sorted. Not honoured.

```json
{ "error": "cursor_sort_mismatch" }
```

This is the mechanism behind FR-016b. Comparing a price against a timestamp yields a result set that
is wrong in a way nobody notices — products dropped and repeated, no error anywhere. Rejecting is
safe because the client's own behaviour on a sort change is to restart at the first page.

## Total

`total` counts every product matching the refinements, ignoring `cursor` and `limit`. It is computed
by a second `SELECT count(*)` over the same WHERE, issued **concurrently** with the page query.

- It reflects **every** active refinement (FR-016a).
- It is fetched per refinement change, not per page.
- FR-016c's approximation escape hatch is **specified but not implemented**. The documented trigger
  for implementing it is the count exceeding the storefront read latency budget on real data — at the
  current catalogue size it is trivial, and building for a scale problem that does not exist yet would
  be speculative complexity.

## Required tests

1. **Cursor round-trip** for each sort — encode, decode, and page to exhaustion.
2. **Cursor/sort mismatch** returns 400.
3. **Count agrees with a full walk**: `total` equals the number of distinct products returned by
   paging the same refinements to exhaustion — each exactly once (SC-003a).
4. **`newest` is unchanged**: existing search tests pass untouched.
5. **`relevance` without `q`** returns `sort: "newest"` and orders accordingly.

## Telemetry

Client emits `search_sorted` (the sort key) and `search_refined` (**facet keys only, never values** —
a query string is shopper-entered free text and can contain anything).

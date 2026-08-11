# Contract: GET /v1/storefront/facets

Hot path (`core-api` storefront). **Public**, unauthenticated, cacheable (short TTL, like the other
storefront reads). Returns the available facets, their options, and per-option counts for a given
query + applied filters. Called by the client **when the filter set changes**, not on every page.

## Request

Query params (all optional; the same shape as `/v1/storefront/products`, minus paging/sort):

| Param | Repeatable | Meaning |
|---|---|---|
| `q` | no | free-text query (trigram) |
| `categoryKey` | no | category filter |
| `minPrice` / `maxPrice` | no | price band |
| `saleOnly` | no | `true` ⇒ on-sale only |
| `brand` | **yes** | selected brand(s) — OR within, e.g. `brand=Acme&brand=Beta` |
| `attr.<key>` | **yes** | selected attribute value(s) — OR within, e.g. `attr.diet=vegan&attr.diet=gluten_free` |

Semantics: OR within a repeated facet, AND across facets (matches `/products`). A facet's **own**
selection is excluded when computing that facet's option counts (so ticking one brand still shows the
other brands' counts).

## Response `200` — `FacetSetDTO`

```jsonc
{
  "priceBounds": { "min": "1.50", "max": "89.00" },   // nullable when the set is empty
  "facets": [
    {
      "key": "category",
      "label": "Category",
      "type": "single_select",           // pick one; reuses the existing categoryKey filter param
      "options": [
        { "value": "fruit-veg", "label": "Fruit & Veg", "count": 120 },
        { "value": "bakery", "label": "Bakery", "count": 64 }
      ]
    },
    {
      "key": "brand",
      "label": "Brand",
      "type": "multi_select",
      "options": [
        { "value": "Acme", "label": "Acme", "count": 42 },
        { "value": "Beta", "label": "Beta", "count": 17 }
      ]
    },
    {
      "key": "diet",                 // an attribute_definition.key
      "label": "Dietary",
      "type": "multi_select",
      "options": [
        { "value": "vegan", "label": "Vegan", "count": 88 },
        { "value": "gluten_free", "label": "Gluten free", "count": 31 }
      ]
    },
    {
      "key": "organic",             // a boolean attribute
      "label": "Organic",
      "type": "multi_select",
      "options": [ { "value": "true", "label": "Yes", "count": 54 } ]
    }
  ]
}
```

Rules:
- Money is a **string** (platform convention). Counts are integers.
- Options with `count = 0` are **omitted** (FR-009); a facet with no non-zero option is omitted.
- `type` is a closed vocabulary: `"single_select" | "multi_select" | "toggle"`. A client meeting an
  unknown `type` renders nothing for it (forward-compatible, mirrors the banner-target rule).
- **Own-selection exclusion**: a `multi_select` facet's option counts are computed with that facet's
  own selection EXCLUDED (so ticking one brand still shows the others' counts). A `single_select` facet
  (category) reflects the fully-applied set — there is no "OR within" to preserve.
- The `offers` toggle is not returned as a facet option list; it is a fixed control on the client. (The
  count of on-sale products MAY be included as a facet `{ "key":"offers","type":"toggle" }` in a later
  slice; first slice keeps it a plain toggle.)

## Errors

- Invalid `minPrice`/`maxPrice` (non-numeric) → `400 {"error":"invalid_price"}`.
- Backend failure → `503` (matches `httpx.Unavailable`).

## Contract tests

- Go↔Kotlin **wire-contract** test pins a byte-identical `FacetSetDTO` JSON literal (028 pattern).
- Count-correctness test: seeded catalogue, assert per-option counts equal an independent count, and
  that a facet's own selection does not shrink its sibling options' counts.

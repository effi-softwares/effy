# Data Model: Customer Experience Refresh

**Feature**: 025-customer-ui-refresh | **Date**: 2026-07-27

## The headline: no schema change

**This feature adds no table, no column, no index, and no migration.** Spec FR-001 forbids it and
nothing here needs it. Every model below is either a *read projection* over existing tables or
*client-side state* that lives on the shopper's device.

Existing tables read (all unchanged):

| Table | Read for | Migration that owns it |
|---|---|---|
| `public.category` | browse hierarchy, counts | `20260716092105_product_catalog.sql` |
| `public.product` | search, sort, count, related | `20260716092105_product_catalog.sql` |
| `public.product_media` | representative category imagery, galleries | `20260716092105_product_catalog.sql` |
| `public.delivery_zone_postcode` | serviceability | `20260721181947_delivery_zones_pricing.sql` |

The trigram index this feature's relevance sort depends on already exists
(`20260716092105_product_catalog.sql:125`) and is not modified — the sort is written to match its
expression exactly so it stays index-backed (research R3).

---

## 1. Shared contract changes (`@effy/shared-types`)

Three additive changes. All are backward compatible: existing callers that ignore the new fields
continue to work, and no field changes type or meaning. Per Principle II this is one atomic edit, with
`packages/shared-types/contract/CommerceDto.kt` regenerated in the same change.

### 1.1 `ProductSearchResultDTO` — gains `total` and `sort`

```ts
export type ProductSort = "newest" | "price_asc" | "price_desc" | "relevance";

export interface ProductSearchResultDTO {
  items: StorefrontProductCardDTO[];
  nextCursor: string | null;
  /** Total products matching the refinements, ignoring pagination. */
  total: number;
  /** The ordering actually applied. May differ from the request when `relevance`
   *  was asked for without a query — the server falls back and says so. */
  sort: ProductSort;
}
```

`sort` is echoed rather than assumed because of one real case: `relevance` has no meaning without a
text query, and the server falls back to `newest`. A client that assumed its own request had been
honoured would render a sort control that lies about the list beneath it.

### 1.2 `ProductSearchQuery` — gains `sort`

```ts
export interface ProductSearchQuery {
  q?: string;
  categoryKey?: string;
  minPrice?: string;
  maxPrice?: string;
  saleOnly?: boolean;
  attributes?: Record<string, string>;
  sort?: ProductSort;   // default: "newest"
  cursor?: string;
  limit?: number;
}
```

### 1.3 `StorefrontCategoryDTO` — gains `productCount` and `imageUrl`

```ts
export interface StorefrontCategoryDTO {
  key: string;
  name: string;
  parentKey: string | null;
  /** Active products in this category. Drives "N items" and the empty-category case. */
  productCount: number;
  /** Derived from a product in the category — categories store no imagery. Null → brand tile. */
  imageUrl: string | null;
}
```

> This is the **G1 boundary interpretation** recorded in `plan.md`: enriching an existing read's
> projection, not adding a capability. Note that `parentKey` **already exists**, so the browse
> hierarchy itself needs no contract change — only imagery and counts are new, which is what makes the
> strict-reading fallback a genuinely small reversal.

### 1.4 New: `ServiceabilityDTO`

```ts
export interface ServiceabilityDTO {
  /** The normalised postcode the answer applies to. */
  postcode: string;
  serviced: boolean;
}
```

Deliberately no zone id, zone name, fee, or window — FR-014a and FR-006 (research R2).

### 1.5 Nothing changes in `BannerDTO`

Worth stating because it looks like it should: `BannerDTO` **already carries `imageUrl`**
(`packages/shared-types/src/storefront.ts:71`). The current carousel simply ignores it. FR-019's
imagery requirement is therefore a presentation fix, not a contract change.

---

## 2. Hot-path read models (`apis/core-api`)

These are internal Go types, mapped explicitly to DTOs at the handler boundary — wire shapes never
leak past the data layer (Principle VI).

### 2.1 `delivery.ZoneLookup` — the extracted predicate

The single postcode→zone resolution, moved out of
`internal/features/checkout/delivery_store.go` into `internal/platform/delivery` so checkout and the
storefront cannot answer differently (FR-014b).

```go
// ZoneForPostcode returns the zone a postcode belongs to.
// ok=false means no zone covers it, which means undeliverable — the same meaning
// checkout's DestinationZone has always given it.
func ZoneForPostcode(ctx context.Context, q Queryer, postcode string) (zoneID string, ok bool, err error)
```

Callers after this change: `checkout.DestinationZone` (existing behaviour preserved) and
`storefront.Serviceability` (new). **Two callers, one predicate** — that is the whole point, and the
parity test in R13 asserts it.

### 2.2 `storefront.SearchParams` — gains sort and cursor identity

```go
type SearchParams struct {
    Q, CategoryKey, MinPrice, MaxPrice string
    SaleOnly   bool
    Attributes map[string]string
    Sort       ProductSort   // NEW
    Cursor     *Cursor       // NEW — replaces HasCursor/CursorTime/CursorID
    Limit      int
}
```

### 2.3 `storefront.Cursor` — opaque and sort-tagged

```go
type Cursor struct {
    Sort  ProductSort  // the ordering this cursor was issued under
    Key   any          // time.Time | decimal string | float32 similarity
    ID    string       // uuid tiebreak — mandatory, since no sort key is unique
}
```

**Encoding**: base64url over a compact, versioned payload. The client treats it as opaque and never
constructs one.

**The rule that makes FR-016b true**: a request whose `sort` differs from its cursor's `Sort` is
rejected with 400. Not silently re-sorted, not honoured. Comparing a price against a timestamp
produces a result set that is wrong in a way nobody would notice — dropping and repeating products
without error. Rejecting is safe because the client's own behaviour on a sort change is to restart at
the first page.

**Keyset tuple per sort** (`id` always the tiebreak):

| `sort` | ORDER BY | Cursor predicate |
|---|---|---|
| `newest` (default) | `created_at DESC, id DESC` | `(created_at, id) < (k, i)` |
| `price_asc` | `price_amount ASC, id ASC` | `(price_amount, id) > (k, i)` |
| `price_desc` | `price_amount DESC, id DESC` | `(price_amount, id) < (k, i)` |
| `relevance` | `similarity(…) DESC, id DESC` | `(similarity(…), id) < (k, i)` |

`newest` is byte-for-byte the current behaviour, so no existing result set changes shape.

### 2.4 `storefront.CategoryNode` — the enriched projection

```go
type CategoryNode struct {
    Key, Name string
    ParentKey *string
    ProductCount int
    ImageURL  *string   // derived; nil → the client renders a brand tile
}
```

`ImageURL` is chosen **deterministically** (lowest `display_order`, then oldest product, then lowest
id) so the same category does not shuffle its face between requests — an unstable derived image reads
as a bug even though nothing is wrong.

---

## 3. Client state

### 3.1 Delivery context (both surfaces)

The only genuinely new user-facing concept, and it never touches the database.

```ts
type DeliveryContext = {
  postcode: string;          // normalised, 4 digits (AU)
  serviced: boolean;         // cached answer for THIS postcode
  checkedAt: number;         // epoch ms — for staleness, not for display
  source: "guest" | "account";
}
```

| | Web | Mobile |
|---|---|---|
| Storage | `localStorage` behind `useSyncExternalStore` | persisted preference store (the `AppearancePreferenceStore` pattern) |
| Read by | a client island in the storefront header | the Home app bar |
| Seeded from | the signed-in shopper's default address, when present and no local value exists | same |

**Rules**
- `serviced` is only ever the cached answer *for the stored postcode*. Changing the postcode
  invalidates it — there is no window in which the UI shows a stale yes for a new location.
- **Never written back to the account.** A guest location becomes an address only through the normal
  address-book flow (spec assumption). `source` records provenance for display, not for authority.
- Absence is a normal state, not an error: no context means "we haven't asked yet", which the UI
  invites the shopper to fix and which never blocks adding to cart (FR-023).

### 3.2 Toast / transient feedback (both surfaces)

```ts
type Toast = {
  id: string;
  message: string;
  action?: { label: string; run: () => void };  // at most ONE (FR-034)
  tone: "success" | "error";
}
```

Web: a ~30-line `useSyncExternalStore` store plus a fixed live region — dependency-free per R6, and
announced to assistive technology per FR-045. Mobile: Material 3 `SnackbarHostState`, already
available.

The single-action limit is a requirement, not a style choice: a transient message with two competing
actions is a decision the shopper has no time to make.

### 3.3 Refinement set (web, URL-resident)

Not an object — deliberately. Refinement state **is** the URL query string
(`q`, `categoryKey`, `minPrice`, `maxPrice`, `saleOnly`, `sort`, attribute facets), read through
`useSearchParams` and written with `router.replace`.

This is what makes FR-017 (shareable) and FR-018 (restored on back) true by construction rather than
by bookkeeping. It is also a fix to an existing defect: today `SearchExperience` seeds from the URL
once and then keeps refinements in component state, so a refined result set cannot be shared at all
(research R8).

`cursor` is **not** URL state — pagination position is ephemeral and a shared link should open at the
first page of the refined set, not mid-scroll.

---

## 4. State transitions

The only stateful flow this feature introduces:

```text
                  ┌──────────────┐
   no context ───▶│  entering    │──── invalid input ──▶ 400 → inline error, context unchanged
                  └──────┬───────┘
                         │ normalised postcode
                         ▼
                  ┌──────────────┐
                  │  checking    │──── read fails ─────▶ unknown: keep the postcode,
                  └──────┬───────┘                      say so, never claim "not serviced"
            ┌────────────┴────────────┐
            ▼                         ▼
     serviced: true             serviced: false
   delivery framing on        plain refusal + change prompt
   (browsing unaffected)      (browsing STILL unaffected — FR-014)
```

The failure branch matters: a serviceability read that errors must **not** collapse to
`serviced: false`. "We couldn't check" and "we don't deliver there" are different statements, and
showing the second when the first is true tells a prospective customer to leave.

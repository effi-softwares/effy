# Contract: 033 — Customer Saved Items

**Feature**: [spec.md](../spec.md) · **Plan**: [../plan.md](../plan.md) · **Data model**: [../data-model.md](../data-model.md)

Phase 1 output. Two contracts live here: the **HTTP surface** on the hot path, and the **shared DTO
surface** in `packages/shared-types` that both clients are typed from (Principle II).

Base: `apis/core-api`, mounted under `/v1`. All routes below sit behind
`auth.Middleware(customerVerifier)` → `customeridentity.Middleware(identity)`, in that order —
`customeridentity` depends on the verified subject and returns `401` without a platform record, `403`
for a barred customer.

**⚠ The customer is always read from the resolved identity** (`customeridentity.FromContext`), never
from the request. A client-supplied customer id would be an authorization bypass.

---

## 1. HTTP surface

| Method | Path | Auth | Success | Purpose |
|---|---|---|---|---|
| `GET` | `/v1/saved/ids` | customer | `200` | membership set — the whole shopper's product ids |
| `GET` | `/v1/saved?postcode=` | customer | `200` | the ordered list with verdicts and price movement |
| `PUT` | `/v1/saved/{productId}` | customer | `204` | save (idempotent) |
| `DELETE` | `/v1/saved/{productId}` | customer | `204` | un-save (idempotent) |
| `POST` | `/v1/saved/merge` | customer | `200` | join a device-held list into the account |
| `POST` | `/v1/saved/add-to-cart` | customer | `200` | add every purchasable saved item to the cart |

Replaces `GET|PUT|DELETE /v1/favorites…` entirely. Those routes are **removed**, not aliased — FR-001
requires the previous capability unreachable.

### `GET /v1/saved/ids`

The R4 membership read. One request per screen, regardless of how many products it shows (FR-020).

```
200 { "productIds": ["9f2c…", "1a7b…"], "count": 2 }
```

- `count` is a **`WireInt`** (R17). A plain TS `number` generates a Kotlin `Double`, and a `Double`
  crossing back to Go as `2.0` is 027's R13 defect. Import `WireInt`, never redeclare it.
- Bounded by the cap (200), so the response is small enough to fetch on every page and cache in the
  client store until a toggle invalidates it.
- **No `Cache-Control`** — this is per-shopper and must never be cached by a shared cache.
- A guest never calls this. The client store is seeded from local storage instead, and a `401` is a
  normal state meaning "you are a guest", not a failure (`cart-actions.ts:14-19`).

### `GET /v1/saved?postcode=3121`

```
200 [
  {
    "productId": "9f2c…",
    "name": "Free Range Eggs 12pk",
    "brand": "Effy",
    "imageUrl": "https://…",          // presigned, nullable
    "priceAmount": "6.50",
    "currency": "AUD",
    "compareAtAmount": "8.00",        // nullable
    "badges": ["on_sale"],
    "savedAt": "2026-07-20T04:11:00Z",
    "savedPriceAmount": "8.00",
    "priceDropped": true,
    "verdict": "purchasable",
    "categoryKey": "dairy-eggs"       // for FR-056 grouping
  }
]
```

- `postcode` is **optional**. Absent ⇒ every item reports `not_yet_determined` (FR-038). This is the
  guest-with-no-location case and it is first-class, not an error.
- `postcode` is normalised through `delivery.NormalizePostcode`. Malformed ⇒ `400 invalid_postcode`,
  matching `/v1/storefront/serviceability`'s existing bare `{"error":…}` shape rather than a problem
  document — the sibling endpoint sets the local convention.
- Ordered `saved_at DESC` (FR-015). Grouping and alternate ordering are **client-side** — the set is
  capped at 200 and already in memory, so a server round trip per sort would be latency for nothing.
- `verdict` is one of the five values in [data-model.md](../data-model.md#derived-never-stored-the-purchasability-verdict).
- **⚠ `priceDropped` is only ever `true` or absent-meaning-false.** There is no `priceRose` (FR-044).
- Money crosses as **`numeric(12,2)::text`**, never a float (`storefront/repository.go:20-29`).
- A failed image presign blanks `imageUrl`; it must never fail the read
  (`storefront/service.go:293-295`).

### `PUT /v1/saved/{productId}`

```
204   saved (or already saved — idempotent, FR-009)
400   malformed product id
404   no such product
422   cap reached — distinguishable reason (FR-047)
```

Optional body, used **only** by undo (FR-018):

```json
{ "restoreSavedAt": "2026-07-20T04:11:00Z" }
```

Absent ⇒ `now()`, so a deliberate re-save lands at the top. Present ⇒ the row returns to the position
it held. A client can only ever forge a position within its own list, so this needs no further guard.

The `422` uses `httpx.ValidationFailedAs` with a named reason, because "you have too many saved items"
and "that product does not exist" require different things of the shopper — the same reasoning that
gave 027's promo evaluation eight distinguishable refusals.

### `DELETE /v1/saved/{productId}`

```
204   removed (or was not there — idempotent, FR-010)
400   malformed product id
```

**⚠ Never `404`.** Deleting an absent membership is a no-op, not an error — `restfulapi.net` and the
platform's own predecessor both get this right, and returning `404` would make a retried delete look
like a failure.

⚠ Note the asymmetry with `PUT`, which *does* `404`: saving requires the product to exist (you cannot
watch nothing), un-saving does not (the end state is identical either way).

### `POST /v1/saved/merge`

```json
{ "items": [ { "productId": "9f2c…", "savedPriceAmount": "8.00",
               "savedCurrency": "AUD", "savedAt": "2026-07-20T04:11:00Z" } ] }
```

```
200 { "added": 3, "skipped": [ { "productId": "…", "reason": "cap_reached" } ],
      "productIds": ["…"] }
```

- **Union, idempotent** (FR-028/FR-029). Running it twice produces the same set. Existing rows keep
  their **original** `saved_at` and `saved_price_amount` — the account's record of when the shopper
  first cared, and at what price, outranks a device's later copy.
- `added` is a **`WireInt`**.
- Truncates **newest-first** at the cap and names what did not fit (FR-047/FR-048). Nothing already
  saved is ever evicted.
- Returns the resulting `productIds` so the client seeds its store from the response rather than
  issuing a second read.
- **⚠ The client clears its device list only after this returns `200`** — `cart-actions.ts:201-209`:
  *"clearing first and merging second is how 019's Option B lost carts."*
- An unresolvable `productId` (archived away, deleted) is skipped with `reason: "not_found"`, not a
  `400`. A merge must never fail wholesale because one product went away.

### `POST `/v1/saved/add-to-cart`

```json
{ "postcode": "3121" }
```

```
200 { "added": [ "9f2c…" ],
      "skipped": [ { "productId": "1a7b…", "reason": "not_delivered_to_your_area" } ] }
```

- **The server decides purchasability**, not the client (FR-052). A client that filtered by its own
  copy of the verdict would be re-implementing the R2 predicate, and the two would drift.
- `skipped[].reason` reuses the verdict vocabulary, so the shopper is told exactly why each item was
  left behind. **Silent omission is the failure mode this endpoint exists to prevent.**
- The cart's own limits and rules still apply; an item refused by the cart is reported with the cart's
  reason (FR-052).
- Every item unpurchasable ⇒ `200` with an empty `added` and a full `skipped`. The client renders the
  refusal (FR-052 scenario 4); this is not a `422`, because nothing was wrong with the request.
- A barred customer is refused by the cart's existing gate (FR-053).

---

## 2. Shared DTO surface — `packages/shared-types`

**File**: `packages/shared-types/src/saved-item.ts` (replaces `src/favorite.ts`, which is deleted
along with its `src/index.ts:12` re-export).

```ts
export type SavedVerdict =
  | "purchasable"
  | "temporarily_unavailable"
  | "not_delivered_to_your_area"
  | "no_longer_sold"
  | "not_yet_determined"

// ⚠ Deliberately does NOT extend StorefrontProductCardDTO: that carries `available: boolean`,
// the catalogue-status flag `verdict` replaces. Two fields answering one question is how a client
// ends up rendering the wrong one.
export interface SavedItemDTO {
  id: string; name: string; brand: string | null; imageUrl: string | null
  priceAmount: string; currency: string; compareAtAmount: string | null
  badges: ProductBadge[]
  savedAt: string
  savedPriceAmount: string
  priceDropped?: boolean
  verdict: SavedVerdict
  categoryKey?: string
}

export interface SavedMembershipDTO { productIds: string[]; count: WireInt }
export interface SavedMergeRequest  { items: SavedMergeItem[] }
export interface SavedMergeItem     { productId: string; savedPriceAmount: string
                                      savedCurrency: string; savedAt: string }
export interface SavedMergeResultDTO { added: WireInt; skipped: SavedSkip[]; productIds: string[] }
export interface SavedSkip          { productId: string; reason: string }
export interface SavedAddToCartRequest  { postcode?: string }
export interface SavedAddToCartResultDTO { added: string[]; skipped: SavedSkip[] }
```

### ⚠ Registering them, or they do not exist in Kotlin

Each type above must be added to **all three** places in
`packages/shared-types/src/customer-commerce-contract.ts`:

1. the `import type { … }` block,
2. the `export type { … }` re-export block,
3. **a field on the `CustomerCommerceContract` interface** — unless reachable transitively from a type
   already there.

Step 3 is the one that gets missed. That file already carries the scar at `:148-151`:

> ⚠ Referencing `LocalityDTO` here is what makes it EXIST in Kotlin. Declaring it in `storefront.ts`
> alone is not enough — the generator walks this aggregator, so an unreferenced type is silently never
> generated and the drift check then passes trivially (030 T022a).

**Why it is silent**: `commerce-contract:check` is *regen + `git diff --exit-code`*. A type missing
from the aggregator is missing from **both** the regenerated and the committed file, so the diff is
empty and the check **passes**. Mobile simply has no such class, and nothing anywhere says so.
`ProductSearchQuery` (`src/storefront.ts:202`) is in exactly this state right now.

**Verification** (T-level, not optional): after `make cm-contract-gen`, grep
`packages/shared-types/contract/CommerceDto.kt` for **every** type name above. A type that generated
zero times is a contract that does not exist.

### ⚠ `WireInt`, not `number`

`count` and `added` are counts and MUST use `WireInt` (`packages/shared-types/src/cart.ts:28-47`),
imported and never redeclared. A plain `number` becomes JSON Schema `"number"` → Kotlin `Double` →
`kotlinx.serialization` emits `1.0` → Go's `encoding/json` **cannot** unmarshal `1.0` into an `int` →
`422`. That is 027's R13; it cost days and every unit test passed throughout, because the fakes spoke
Kotlin at both ends.

### Order item — the FR-008 dependency

`packages/shared-types/src/order.ts` — the order-item DTO gains `productId: string`. This is a
projection change, not a schema change (`public.order_item` already stores it). It requires the Go
projection, the regenerated contract, both surfaces' mappers, and a wire-contract test (R12).

---

## 3. Cross-language wire contract test

Any count crossing the wire makes this **mandatory**, per 028's pattern:

- Go: `apis/core-api/internal/features/saveditems/wire_contract_test.go`
- Kotlin: `apps/customer-mobile/shared/src/commonTest/…/features/saved/SavedWireContractTest.kt`

One **byte-identical JSON literal**, duplicated **by hand** in both files. Neither side generates it;
neither imports it. That is the point — a shared fixture would move with the bug.

It must prove three things, and 028 proved them by deliberately breaking each:
1. Kotlin decodes Go's exact bytes.
2. Kotlin **emits an integer**, not `2.0` (`int`→`float64` fails at compile time; this catches the
   serializer).
3. A silent `json:"…"` rename compiles fine on both sides and is caught only by the byte comparison.

⚠ 029's lesson applies to the fixture itself: its `banner_test.go` **asserted the defect**, demanding
`Kind == "search"` and pinning `{"kind":"sale"}` — *a shape no banner ever emitted*. A fixture that
agrees with the code rather than the world proves nothing. The literal here must be copied from an
actual response body, not written from the struct.

---

## 4. What this contract does NOT include

| Not here | Why |
|---|---|
| `isSaved` on any catalogue / search / product DTO | Would make every catalogue response per-shopper and destroy the static shell (R4). Membership comes from `/v1/saved/ids`. |
| A per-product `GET /v1/saved/{id}` | N requests per screen; FR-020 forbids it. |
| Any cold-path route | Commerce is hot path (FR-028, R1). |
| Notifications of any kind | FR-063 — reserved sibling, and no notifications worker exists. |
| A "Buy It Again" projection | FR-064 — reserved sibling. |
| Named or multiple lists | FR-066 — exactly one list per shopper. |
| Any change to `/v1/cart/saved/*` | FR-003 — a different capability. SC-015 requires proving it unchanged. |
| Any change to `ServiceabilityDTO`'s **shape** | 030 froze its two fields; both reflection tests stand. Only the boolean's truthfulness changes (R2). |

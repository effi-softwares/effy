# Contract: Customer Lists

**Spec**: [../spec.md](../spec.md) · **Plan**: [../plan.md](../plan.md) · **Data**: [../data-model.md](../data-model.md)

Extends [033's contract](../../033-customer-saved-items/contracts/saved-items.contract.md). Two
parts: the HTTP surface on the hot path and the shared DTOs.

Base: `apis/core-api`, under `/v1`, behind `auth.Middleware(customerVerifier)` →
`customeridentity.Middleware(identity)`. The customer is always read from the resolved identity.

`{listId}` is a uuid, or the literal **`default`** for the shopper's "Saved" list. A uuid that is
not one of the caller's lists answers `404 list_not_found`, whether or not it exists for someone
else.

## 1. HTTP surface

### New: `/v1/lists`

| Method | Path | Success | Purpose |
|---|---|---|---|
| `GET` | `/v1/lists?productId=` | `200` | all lists with counts; with `productId`, each says whether it holds that product |
| `POST` | `/v1/lists` | `201` | create a list, optionally placing a product in it |
| `PATCH` | `/v1/lists/{listId}` | `200` | rename |
| `DELETE` | `/v1/lists/{listId}` | `204` | delete (idempotent) |
| `GET` | `/v1/lists/{listId}/items` | `200` | the list's products, newest first |
| `PUT` | `/v1/lists/{listId}/entries/{productId}` | `204` | add (idempotent) |
| `DELETE` | `/v1/lists/{listId}/entries/{productId}` | `204` | remove from this list only (idempotent) |
| `POST` | `/v1/lists/{listId}/add-to-cart` | `200` | add every purchasable product in this list to the cart |

#### `GET /v1/lists`

```
200 [
  { "id": "default", "isDefault": true,  "name": null,           "count": 12, "onlyHereCount": 9 },
  { "id": "5d1e…",   "isDefault": false, "name": "Weekly Items", "count": 5,  "onlyHereCount": 2,
    "containsProduct": true }
]
```

- Default first, then by creation, oldest first.
- The default entry is always present, with `count: 0` when the shopper has saved nothing. This
  read never writes.
- `name` is `null` for the default list; each client supplies "Saved".
- `containsProduct` is present only when `productId` was given. A malformed `productId` → `400`.
- `count` and `onlyHereCount` are `WireInt`.
- No `Cache-Control`.

#### `POST /v1/lists`

```json
{ "name": "Weekly Items", "productId": "9f2c…" }
```

```
201 { "id": "5d1e…", "isDefault": false, "name": "Weekly Items", "count": 1, "onlyHereCount": 0 }
409 name_taken               the shopper already uses this name (any letter case), or it is "Saved"
400 invalid_name             empty after normalising, or longer than 40 characters
400 list_limit               the shopper already has 20 lists of their own
404                          productId given and no such product
400 saved_items_cap_reached  productId given, not yet saved, and the shopper is at 200 saved products
```

- `name` is normalised by the server; the response carries the stored form.
- `productId` is optional. When present, the list and its first entry are created in one
  transaction: any refusal creates nothing.
- **Not idempotent by key.** A retried create whose first attempt succeeded answers `name_taken`;
  the client re-reads the lists.

#### `PATCH /v1/lists/{listId}`

```json
{ "name": "Weekly Shop" }
```

```
200 { …the list… }
409 name_taken · 400 invalid_name · 400 default_list · 404 list_not_found
```

Renaming to the list's current name in a different letter case succeeds.

#### `DELETE /v1/lists/{listId}`

```
204   deleted, or was already gone
400   default_list
```

Products that were only in this list stop being saved. Products in other lists are untouched.

#### `GET /v1/lists/{listId}/items`

`200` with `SavedItemDTO[]`, the shape `GET /v1/saved` returns today.

- `savedAt` is when the product was added **to this list** (its position here).
- `savedPriceAmount` and `priceDropped` are the product's one remembered price, identical in every
  list that holds it.
- `verdict` is one of `purchasable`, `temporarily_unavailable`, `no_longer_sold`.
- `default` for a shopper with no default row yet → `200 []`.

#### `PUT /v1/lists/{listId}/entries/{productId}`

Optional body, used only by undo: `{ "restoreAddedAt": "2026-10-01T04:11:00Z" }`.

```
204   in the list (or already was)
404   list_not_found · (no reason: no such product)
400   saved_items_cap_reached
```

A list deleted on another device answers `list_not_found`. The product is **not** placed anywhere
else.

#### `DELETE /v1/lists/{listId}/entries/{productId}`

`204` always, for a well-formed request against one of the caller's lists. Removes this entry only.
If it was the product's last entry, the product stops being saved.

Unlike the heart's un-save below, this is never refused: the shopper named the list.

#### `POST /v1/lists/{listId}/add-to-cart`

```json
{ "changeId": "c7a1…" }
```

`200` with `SavedAddToCartResultDTO`, unchanged in shape. Only this list's products are considered.
Per-item change ids are derived as today (`itemChangeID`), so a retry with the same `changeId` does
not double the cart.

### Changed: `/v1/saved`

Every route stays and now means the default list.

| Route | Change |
|---|---|
| `GET /v1/saved/ids` | response gains `namedProductIds` (additive) |
| `GET /v1/saved` | the default list's items; same as `GET /v1/lists/default/items` |
| `PUT /v1/saved/{productId}` | saves the product and places it in the default list; otherwise unchanged |
| `DELETE /v1/saved/{productId}` | **new refusal**: `409 in_named_lists` when the product is in any named list; nothing is removed. Otherwise unchanged, and still never `404` |
| `POST /v1/saved/merge` | each merged product also gains a default-list entry; response unchanged |
| `POST /v1/saved/add-to-cart` | the default list only; same as `POST /v1/lists/default/add-to-cart` |

```
GET /v1/saved/ids
200 { "productIds": ["9f2c…", "1a7b…"], "count": 2, "namedProductIds": ["9f2c…"] }
```

`productIds` is every saved product in any list. `namedProductIds` is the subset held in at least
one named list. A client that ignores the new field still shows every heart correctly.

### customer-web proxy routes

`app/api/lists/**` mirrors the above one-to-one through `proxyToCore`, as `app/api/saved/**` does.
A `401` from any of them means "guest".

## 2. Shared DTOs — `packages/shared-types/src/saved-item.ts`

```ts
/** Named lists per shopper, excluding the default. Mirrors saveditems.ListLimit. */
export const LIST_LIMIT = 20
/** Code points, after normalising. Mirrors saveditems.ListNameMax. */
export const LIST_NAME_MAX = 40
/** The default list's id on the wire. */
export const DEFAULT_LIST_ID = "default"

export interface SavedListDTO {
  id: string
  isDefault: boolean
  name: string | null
  count: WireInt
  onlyHereCount: WireInt
  containsProduct?: boolean
}

export interface SavedListCreateRequest { name: string; productId?: string }
export interface SavedListRenameRequest { name: string }
export interface SavedListEntryRequest  { restoreAddedAt?: string }

export interface SavedMembershipDTO {
  productIds: string[]
  count: WireInt
  namedProductIds?: string[]   // optional: an old backend omits it
}
```

`SavedItemDTO`, `SavedAddToCartResultDTO` and the merge types are unchanged.

**Registering**: each new type goes in all three places in `customer-commerce-contract.ts` (import,
re-export, a field on `CustomerCommerceContract`), then `make cm-contract-gen`, then grep
`contract/CommerceDto.kt` for every type name. A type missing from the aggregator generates
nothing and the drift check still passes (033's contract, §2).

Counts are `WireInt`, imported and never redeclared.

### Refusal reasons

A closed set (`SavedListRefusal`). Clients switch on these and nothing else.

**How a reason travels**: every refusal is an RFC 9457 problem document, and the reason is the last
segment of its `type` with `_` written as `-` (`https://effyshopping.com/problems/name-taken`). That
is the hot path's existing convention (`httpx.ValidationFailedAs`), which is why validation
refusals are `400`, not `422`.

| Reason | Status | Shopper is told |
|---|---|---|
| `name_taken` | 409 | you already have a list with that name |
| `invalid_name` | 400 | a list name needs 1 to 40 characters |
| `list_limit` | 400 | you have reached the maximum number of lists |
| `default_list` | 400 | (never reachable from the UI; the controls are not offered) |
| `list_not_found` | 404 | that list no longer exists |
| `in_named_lists` | 409 | (opens the chooser) |
| `saved_items_cap_reached` | 400 | unchanged from 033 |

**Reading it on each client**:
- **customer-web**: `@effy/api-client`'s `DomainError` gains `type`; `lib/api/proxy.ts` forwards it
  as `reason` beside the existing `error` (additive: every other caller sees the body it always
  saw). `lib/list-actions.ts` switches on `reason`.
- **customer-mobile**: `HttpSavedRepository.ensureListSuccess` reads the `type` and throws
  `ListRefusedException(ListRefusal)`. ⚠ It cannot use `toAppException`: that maps by status alone,
  two list refusals share `400`, and it maps every `409` on the platform to "wrong password mode".

## 3. Cross-language wire contract test

Extend the existing pair with one more byte-identical literal each, copied from a real response
body:

- Go: `apis/core-api/internal/features/saveditems/wire_contract_test.go`
- Kotlin: `apps/customer-mobile/shared/src/commonTest/…/features/saved/SavedWireContractTest.kt`

It must prove: Kotlin decodes Go's `SavedListDTO` and the extended membership; `count` and
`onlyHereCount` are emitted as integers; a membership body **without** `namedProductIds` still
decodes (the old-backend case); and the two constants agree with Go's.

## 4. What this contract does not include

| Not here | Why |
|---|---|
| Per-product list ids on the membership read | grows with lists × products on every public page (research R5) |
| A list name in any path or query | names must not reach logs (FR-040) |
| Reordering lists or entries | out of scope |
| Quantities on an entry | quantity belongs to the cart |
| Any cold-path route | saved items is hot-path commerce |
| Any change to `/v1/cart/saved/*` | a different capability (033 FR-003) |

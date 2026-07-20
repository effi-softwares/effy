# Contract: Shop Fulfillment API (020)

**Path**: `edge-api` · **Service**: `shop` · **Base**: `<api_endpoint>/shop/v1`
**Authorizer**: the shop-pool JWT authorizer, by id from `/effy/<env>/edge/authorizer/shop_id`
**Errors**: RFC 9457 `application/problem+json` via `@effy/edge-shared` (`ProblemType`)

Every route below is **authenticated** and **shop-scoped**. The shop identifier is resolved server-side
from the caller's `shop_staff` record via `gate()` → `{sub, shopId}` and is **never accepted as input**
— there is no path, query, or body parameter anywhere in this contract that names a shop (FR-019,
SC-007, research R11).

Authorization is **role-agnostic**: both `shop_manager` and `shop_staff` are admitted (FR-019a). The
manager gate is deliberately *not* reused.

---

## Uniform failure modes

| Status | Type | When |
|---|---|---|
| 401 | `unauthenticated` | No verified `sub` on the request. |
| 403 | `forbidden` | Not an active member of an active shop, **or** the portion does not exist, **or** it belongs to another shop. **Uniform body — never discloses which term failed** (FR-020, SC-008). |
| 409 | `conflict` | The requested transition is not legal from the current state. |
| 400 | `validation-failed` | Malformed body or quantities exceeding the amount ordered. |
| 503 | `unavailable` | A dependency failed. **Fail closed** — an authorization check that throws is never a grant. |

> **A portion is NEVER 404. Missing and another-shop's both return the uniform 403.**
>
> This is a deliberate departure from the sibling `products` slice (which maps not-found → 404), and it
> matters: every repository read here is already shop-scoped, so "no such portion" and "not yours" are
> indistinguishable *by construction* before the error is even raised. Emitting different codes would
> hand an attacker an oracle for enumerating other shops' orders by id. One code, one body, no signal
> (SC-007).

---

## `GET /shop/v1/fulfillments`

The queue (US1). Returns the caller's shop's portions, ordered by delivery promise (soonest first),
tie-broken by arrival — which today **is** strict FIFO (FR-001b, SC-020).

**Query**: `?state=active|completed` (default `active`). `active` = `pending|received|picking`;
`completed` = `ready_for_pickup|collected` (US4, FR-016).

**200**
```jsonc
{
  "items": [
    {
      "id": "uuid",                       // shop_fulfillment.id
      "orderNumber": "EFY-10023",
      "placedAt": "2026-07-20T02:14:05Z",
      "status": "received",               // the five-state machine
      "stateChangedAt": "2026-07-20T02:15:11Z",
      "itemCount": 4,                     // ordered items for THIS shop only
      "gatheredCount": 2,                 // progress, 0 until picking begins
      "unavailableCount": 0,
      "promise": {                        // read-only; owned by 021 (FR-009a)
        "serviceLevel": "standard",
        "readyBy": "2026-07-20T03:14:05Z"
      },
      "atRisk": false                     // computed vs readyBy (FR-001a)
    }
  ]
}
```

**Guarantees**: contains **only** portions whose `shop_id` matches the caller's resolved shop (SC-002).
No customer payment field appears anywhere (FR-008). No other shop's item counts or subtotals are
included — `itemCount` is this portion's alone.

---

## `GET /shop/v1/fulfillments/{id}`

The pick screen (US2). **Side effect**: if the portion is `pending`, this transitions it to `received`
— opening it *is* the acknowledgement (FR-011a). The transition is guarded, so concurrent opens produce
one transition.

**200**
```jsonc
{
  "id": "uuid",
  "orderNumber": "EFY-10023",
  "placedAt": "2026-07-20T02:14:05Z",
  "status": "picking",
  "stateChangedAt": "2026-07-20T02:15:11Z",
  "promise": { "serviceLevel": "standard", "readyBy": "2026-07-20T03:14:05Z" },
  "delivery": {                            // enough to prepare and label (FR-009)
    "recipientName": "…",
    "line1": "…", "line2": null,
    "city": "…", "region": "VIC", "postalCode": "3000", "country": "AU"
  },
  "items": [
    {
      "orderItemId": "uuid",
      "name": "SunRice Long Grain White Rice 1kg",
      "sku": "S2-007",
      "imageUrl": "https://…",             // presigned, may be null
      "orderedQuantity": 2,
      "gatheredQuantity": 1,
      "unavailableQuantity": 0
    }
  ]
}
```

**Guarantees (FR-007, FR-008, SC-007)** — the response contains, for an order spanning multiple shops:
- **only** this shop's `order_item` rows;
- **no** other shop's identity, item count, or subtotal;
- **no** payment intent id, card data, amount paid, or payment status;
- **no** order-level total (a total would leak the existence of other shops' lines).

---

## `POST /shop/v1/fulfillments/{id}/status`

Advance or reverse the portion (US3).

**Request**: `{ "to": "picking" | "ready_for_pickup" }`

**Legal transitions** (FR-011, FR-011d) — anything else is **409**:

| From | To | Note |
|---|---|---|
| `received` | `picking` | Creates one `fulfillment_item` row per line, in the same transaction. |
| `picking` | `ready_for_pickup` | Completes regardless of shortfalls (FR-010c, SC-012). |
| `ready_for_pickup` | `picking` | **The one permitted reversal** — only while not `collected`. Audited identically (FR-011e). |
| `collected` | *anything* | Always **409** — collected is immutable (FR-011f). |

**200**: the updated portion (same shape as the detail read).

**Concurrency (FR-014, SC-005)**: implemented as `UPDATE … WHERE id=$1 AND shop_id=$2 AND status=$from`.
Zero rows affected **and** the row already in the requested state → **200 with the current portion**
(a benign no-op — the other operator won). Zero rows affected and the row in some *other* state → **409**.
Never a double-apply, never a contradictory state.

---

## `PATCH /shop/v1/fulfillments/{id}/items/{orderItemId}`

Record picking progress and shortfall (US2, FR-010a…FR-010f).

**Request** (either or both):
```jsonc
{ "gatheredQuantity": 2, "unavailableQuantity": 0 }
```

**Rules**
- `gathered + unavailable ≤ ordered` — else **400** with a field error (DB CHECK is the backstop).
- Both values are absolute, not deltas — idempotent under retry, which matters on a flaky shop tablet.
- Lowering `unavailableQuantity` is how an item is **un-flagged** when it turns up (FR-010d).
- Legal only while the portion is `picking`; **409** otherwise (and always on `collected`).
- **No money changes.** `subtotal_amount` is never written by this endpoint (FR-010b, SC-011).

**200**: the updated portion detail.

---

## `POST /shop/v1/fulfillments/{id}/pickup` ⚠ DEV-ONLY SCAFFOLD

The stand-in for a driver collecting the order (US3a, FR-030…FR-034). **Temporary. Scheduled for
deletion when the driver slice ships.**

**Request**: `{ "driverRef": "test-driver-1" }`

**Behaviour**
- Legal **only** from `ready_for_pickup` → `collected`; **409** otherwise (FR-032). It can never skip,
  reverse, or shortcut an earlier state.
- The `driverRef` is stored **marked as a placeholder**, so stub-collected portions are permanently
  distinguishable from a genuine dispatch (FR-033, SC-014).

**Deployment guard (FR-031, SC-013) — the security-critical part.** This endpoint accepts a
caller-supplied driver identity, so if it were ever reachable in a deployed environment it would be an
**order-state forgery primitive**. It is therefore:

1. **Absent, not merely refusing**, in any non-development environment — the function is excluded from
   `serverless.yml` unless the deploy stage is a local/dev one, so there is **no route to call**.
2. **Not switchable at runtime** — no header, query parameter, body field, or environment variable
   consulted at request time can enable it.
3. Verified by **attempting to enable it** against a deployed configuration (SC-013), not by reading
   the code.

---

## Customer-side (hot path — `core-api`, additive only)

**No new endpoint.** `GET /v1/orders/{id}` already returns the anonymous per-shop summary. Two additive
changes (US5):

```jsonc
{
  "fulfillments": [
    {
      "status": "ready_for_pickup",        // now carries the real state (FR-017)
      "itemCount": 4,
      "subtotalAmount": "45.00",
      "unavailableItems": [                // ONLY when status is terminal (FR-018b)
        { "name": "Barilla Spaghetti No.5 500g", "quantity": 1 }
      ]
    }
  ]
}
```

**Guarantees**
- **No shop identity, name, code, or id** — the projection does not select it (FR-018, SC-009).
- `unavailableItems` is **absent while the portion is still being picked**, so a flag later undone never
  reaches the customer (FR-018b, SC-017).
- No refund, credit, or adjustment is implied or promised (FR-010b, FR-018a).
- Naming the customer's own item discloses nothing about fulfilment structure (FR-018c).

---

## Contract source of truth (Principle II)

All DTOs above are defined **once** in `packages/shared-types/src/shop-order.ts`, exported through the
`ShopContract` aggregator in `src/shop-contract.ts`, and generated to Kotlin at
`contract-shop/ShopDto.kt` by `pnpm --filter @effy/shared-types shop-contract:gen`, diff-guarded by
`shop-contract:check`. Neither shop surface hand-defines a fulfilment type (FR-021).

Customer-side additions go in `src/order.ts` (already customer-scoped and anonymised) and reach mobile
through the separate customer commerce generator.

# Contract: Customer-facing delivery API (hot path)

`apis/core-api` — public reads + the checkout quote. DTOs in `@effy/shared-types/src/delivery.ts`,
generated to Kotlin, pinned by a Go↔Kotlin wire-contract test (R14). Money is **GST-inclusive integer
cents** typed as `WireInt` (the 027 R13 fix — Kotlin must not serialise `1.0` into a Go `int`).
**No response here ever carries a distance, a ring name, or a shop identity** (FR-018/033; SC-007).

## 1. `GET /v1/storefront/serviceability?postcode=3121` — public, cacheable

The single serviceability decision, answered before a cart exists (FR-003), by the **same predicate** as
the quote (FR-004).

```jsonc
// 200
{ "postcode": "3121", "serviced": true }
```

- `400` `{"error":"invalid_postcode"}` on malformed input (not exactly 4 digits) — **never** `serviced:false`.
- The frozen two-field shape (025): no zone id, name, fee, or window may be added.
- `Cache-Control: public, max-age=86400` — discloses nothing about the caller or where Effy fulfils.

## 2. `GET /v1/storefront/localities?q=<text>` — public, cacheable

The typeahead (030): `q` ≥ 2 chars, digits → postcode match, letters → name-prefix match.

```jsonc
// 200
{ "items": [ { "name": "Richmond", "state": "VIC", "postcode": "3121" } ] }   // ≤ 8, alphabetical
```

- ⚠ Ordering is **never** by serviceability (FR-011 equivalent — the list must not hint the verdict).
- Discloses no coverage; a place appearing here says nothing about whether Effy delivers to it.

## 3. Delivery quote — inside the existing checkout/cart flow (customer authorizer)

Given the destination postcode + the cart (already split per shop), the quote returns, **per package**,
the available methods and their GST-inclusive fees, plus the derived window. It is captured server-side
(R11); the client never sends a fee.

```jsonc
// DeliveryQuoteDTO (shape)
{
  "postcode": "3121",
  "serviced": true,                       // false ⇒ the single "not delivered yet" outcome; packages omitted
  "sameDayAvailableUntil": "2026-08-21T13:00:00+10:00",  // derived cutoff; null when no same-day today
  "packages": [
    {
      "shopRef": "pkg-1",                 // opaque per-package handle — NOT a shop id (FR-033)
      "options": [
        { "method": "standard", "feeCents": 600,  "promisedFrom": "2026-08-22", "promisedTo": "2026-08-28" },
        { "method": "same_day", "feeCents": 1100, "promisedFrom": "2026-08-21", "promisedTo": "2026-08-21" }
      ]
    }
  ],
  "expiresAt": "2026-08-21T12:20:00+10:00"
}
```

**Rules the contract guarantees**:

- `serviced:false` ⇒ **no** `packages`, one reason — the postcode is in no served zone (FR-002). Standard
  and same-day alike are simply absent.
- When `serviced:true`, **every package always has a `standard` option** (FR-029) — a served zone cannot
  fail to price.
- `same_day` appears on a package **only** when its fulfilling shop does same-day in that zone
  (`zone.sameday_eligible ± exception`) **and** now ≤ `sameDayAvailableUntil` (R5/R6). In a multi-shop
  basket it may appear on some packages and not others (FR-044/SC-011).
- Every `feeCents` is the engine's output — GST-inclusive, snapped up, within [floor, cap], a multiple of
  the step (SC-005/006). The shopper sees the exact total before paying; it is charged unchanged (FR-034,
  no drip).
- `shopRef` is opaque; nothing in the response identifies the shop or discloses a distance.

## Wire-contract test (Go ↔ Kotlin)

`ServiceabilityDTO`, `LocalityDTO`, `DeliveryQuoteDTO` (with `WireInt` cents) are pinned by one
byte-identical JSON literal shared between `wire_contract_test.go` and `DeliveryWireContractTest.kt`
(the 028 mechanism). A tag rename or a number-type drift must fail the test, not a shopper's checkout.

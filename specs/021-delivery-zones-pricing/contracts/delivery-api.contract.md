# Contract: Delivery Zones & Pricing API (021)

Two audiences, two paths (R1). All DTOs single-sourced in `packages/shared-types/src/` (Principle II);
the customer commerce additions regenerate `contract/CommerceDto.kt`.

---

## A. Customer — hot path (`core-api`, `/v1/checkout/*`), customer pool

Extends 019's checkout. The customer never sees a shop id, location, or carrier (FR-019/FR-020).

### `POST /v1/checkout/quote`

The per-package delivery quote (US1). Computes packages for the cart + address and **captures** them
server-side with a validity window (R7).

**Request**: `{ "addressId": "uuid" }` — the customer id comes from the token, never the body.

**200**
```jsonc
{
  "packages": [
    {
      "packageKey": "pkg_a1b2",              // OPAQUE — groups this shop's items; never a shop id/name
      "items": [ { "productId": "…", "name": "…", "quantity": 2, "imageUrl": "…" } ],
      "serviceable": true,
      "methods": [                            // empty when serviceable=false
        { "method": "same_day",  "serviceLevel": "Same-day",    "feeAmount": "7.00", "window": "Today by 6pm", "scheduleDates": null },
        { "method": "standard",  "serviceLevel": "Standard",    "feeAmount": "5.00", "window": "in 2–3 days",  "scheduleDates": null },
        { "method": "scheduled", "serviceLevel": "Pick a date", "feeAmount": "6.00", "window": null,           "scheduleDates": ["2026-07-24","2026-07-25"] }
      ]
    },
    {
      "packageKey": "pkg_c3d4",
      "items": [ { "productId": "…", "name": "…", "quantity": 1, "imageUrl": null } ],
      "serviceable": false,                   // FR-004 — this package can't reach the address
      "methods": []
    }
  ],
  "quoteId": "uuid",
  "expiresAt": "2026-07-21T05:10:00Z"         // R7 — honored until then
}
```

**Guarantees**: no `shopId`, no shop name, no shop location, no carrier anywhere (SC-006/SC-007).
`serviceable:false` names only the items (FR-004). Same-day is absent past its cutoff (edge case).

**Errors**: `400` no address / empty cart; `403` barred/not-owner; a fully-unserviceable order returns
`200` with every package `serviceable:false` (the client blocks — US2 scenario 2).

### `POST /v1/checkout/intent` (extended)

Creates the PaymentIntent from the customer's per-package selections (US1/US3). Extends 019's body.

**Request**
```jsonc
{
  "addressId": "uuid",
  "quoteId": "uuid",
  "selections": [ { "packageKey": "pkg_a1b2", "method": "scheduled", "scheduledDate": "2026-07-24" } ],
  "excludedPackageKeys": [ "pkg_c3d4" ]        // R8 — explicit confirm of auto-set-aside items
}
```

**Behaviour**
- The server **re-resolves** every package from the address + offerings. Selections are honored from the
  captured quote if `now() < expiresAt`; on expiry, or if a package became unavailable / same-day lapsed,
  → **409** with a re-quote signal (FR-011a). The fee is always the server's captured/recomputed value —
  the request carries **no fee** (FR-007, SC-004).
- `excludedPackageKeys` MUST exactly match the set the server finds undeliverable; a mismatch (excluding a
  deliverable package, or omitting an undeliverable one) → **409** (R8, SC-011a) — the customer cannot
  drop items unconfirmed, nor be charged for an undeliverable one.
- Writes `order_package_delivery` (delete+reinsert), sets `order.delivery_fee_amount = Σ`, sets
  `delivery_quote_expires_at`, creates the PaymentIntent for the summed grand total.

**200**: 019's `CreateCheckoutIntentResponse` (clientSecret, orderId, grandTotalAmount, …) **plus** a
per-package `deliveryBreakdown` for the summary.

### `GET /v1/orders/{id}` (extended, US3/US5 receipt)

019's order/receipt gains, per anonymous fulfilment portion, the delivery `serviceLevel`, `feeAmount`, and
`window`, plus any `unavailableItems` (020). Still **no shop identity** (SC-006). The order-level
`deliveryFeeAmount` is the sum.

---

## B. Shop — the 020 surface, unchanged API, richer data (R11)

**No new shop endpoint.** 020's `GET /shop/v1/fulfillments` and `/{id}` now carry a **real**
`promise` (service level + `readyBy`) sourced from `shop_fulfillment.promised_ready_at` /
`delivery_service_level` instead of the uniform derivation. The shop response MUST NOT include
`delivery_fee_amount` (FR-021a — the payment amount stays walled off). 020's queue ordering consumes the
real `promised_ready_at` with no code change beyond the one-file seam swap (R11).

---

## C. Back-office — cold path (`edge-api/admin`, `/admin/v1/*`), back-office pool

Mirrors 009's `shops/` slice exactly (R9). Read gate = any active staff (incl. `csa`); mutate gate =
`admin`/`manager`. Every mutation writes `admin.audit_log` in-transaction. Uniform problem+json
(`400`/`403`/`404`/`409`/`503`).

| Method & path | Gate | Purpose |
|---|---|---|
| `GET /admin/v1/delivery-zones` | read | List zones (paged) |
| `POST /admin/v1/delivery-zones` | mutate | Create a zone → audit `delivery_zone.create` |
| `PATCH /admin/v1/delivery-zones/{id}` | mutate | Rename / enable / disable → `delivery_zone.update` |
| `GET /admin/v1/delivery-zones/{id}/postcodes` | read | The zone's postcodes |
| `POST /admin/v1/delivery-zones/{id}/postcodes` | mutate | Add postcode(s); `23505`→409 (postcode already zoned) |
| `DELETE /admin/v1/delivery-zones/{id}/postcodes/{postcode}` | mutate | Remove a postcode |
| `GET /admin/v1/delivery-offerings` | read | The rate grid (filter by origin/dest zone) |
| `POST /admin/v1/delivery-offerings` | mutate | Define a (origin→dest, method) rate → `delivery_offering.create` |
| `PATCH /admin/v1/delivery-offerings/{id}` | mutate | Change price / window / cutoff / status → `delivery_offering.update` |
| `PATCH /admin/v1/shops/{id}/location` | mutate | Set a shop's postcode → `shop.location_set` |
| `GET /admin/v1/delivery-zones/{id}/audit` | read | The zone's change history (reuses `admin.audit_log`) |

**Guarantees**: management changes affect only new quotes (FR-016 — historical `order_package_delivery`
and `shop_fulfillment` snapshots are never rewritten). A zone-pair with no offering, a shop with no
postcode, or a postcode in no zone = undeliverable, surfaced to the customer path as US2 (not an error).

---

## Contract source of truth (Principle II)

- **Customer commerce** additions → `packages/shared-types/src/{cart,checkout,order}.ts`, regenerated to
  Kotlin via `pnpm --filter @effy/shared-types commerce-contract:check` → `contract/CommerceDto.kt`.
  The cart DTO gains `packageKey` per line; checkout gains the quote + extended intent DTOs.
- **Management** → a new `packages/shared-types/src/delivery.ts` (`DeliveryZoneDTO`, `DeliveryOfferingDTO`,
  `ShopLocationDTO`, request DTOs), reusing `PagedDTO<T>` + `AuditEntryDTO`. Back-office only — no Kotlin.
- No `@effy/api-client` change (its `get/post/patch/delete` already cover the management calls).

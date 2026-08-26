# Contract: the order receipt

**Feature**: 052 · **Owner**: hot path (`apis/core-api`) for the read, cold path
(`apis/edge-api/customer`) for the resend · **Types**: `packages/shared-types/src/order.ts`

Two rules govern everything below, and both are enforced by what the types do **not** declare:

1. ⚠ **No fulfilment structure crosses this boundary** (FR-009). There is no shop id, shop name,
   shop count, distance or delivery ring, and none may be added. `OrderFulfillmentDTO` remains
   anonymous, exactly as 020 left it.
2. ⚠ **No card data beyond `last4`** (051 `payment.ts`). Three fields describe how an order was
   paid, and none of them is a card number, an expiry or a name.

---

## 1. `GET /v1/orders/{id}` — extended, not replaced

Hot path, customer pool, existing route. It already returns `OrderDTO`; this slice **adds fields**.
No field is removed and no field changes meaning, so every existing consumer keeps working.

### Additions to `OrderItemDTO`

```ts
export interface OrderItemDTO {
  productId: string;
  productName: string;
  unitPriceAmount: string;   // already declared — the clients simply never rendered it
  quantity: number;
  lineSubtotalAmount: string;
  /**
   * NEW. A short-lived presigned URL for the product's primary image, or null.
   * DECORATION ONLY — never a carrier of meaning. A line renders complete without it.
   */
  imageUrl?: string | null;
}
```

### Additions to `OrderDTO`

```ts
/** NEW. How the order was paid, in a form safe to display. Absent when not captured. */
export interface PaymentMethodSummaryDTO {
  /** Effy's own family, never the provider's string: "card" | "wallet" | "pay_over_time" | "other". */
  type: PaymentMethodFamily;
  /** Network or wallet for the label ("visa", "apple_pay"). Null when the family carries no brand. */
  brand: string | null;
  /** The ONLY part of a card number permitted here. Null for non-card families. */
  last4: string | null;
}

/**
 * NEW. The customer-facing progress vocabulary (FR-008).
 *
 * ⚠ SERVER-DERIVED, ALWAYS. Clients render this; no client computes it from `fulfillments`.
 * Two clients deriving one answer independently is 029's banner target and 033's `available`
 * flag — the failure is silent because both surfaces still render something.
 *
 * ⚠ It is a ROLLUP, NOT A MAX: a two-shop order with one portion delivered and one still being
 * picked is "packing". The customer has not received their order.
 */
export type OrderStage = "confirmed" | "packing" | "on_the_way" | "delivered";

/**
 * NEW. When each package is expected to ARRIVE, as the customer was shown at checkout.
 *
 * ⚠ NAMED `ArrivalEstimateDTO`, NOT `DeliveryPromiseDTO` — that name is TAKEN, by `shop-order.ts`,
 * for a different fact aimed at a different audience: the shop's `readyBy` at the fulfilment node.
 * Research R4 records that the ready-by must never reach the customer. Reusing the name would have
 * conflated two opposite meanings; the collision was caught by `tsc` on the barrel re-export.
 *
 * ⚠ DATES, NOT TIMES. `promised_from`/`promised_to` are `date` columns; the platform has no
 * delivery time window and cannot derive one. A client MUST NOT render a time here.
 */
export interface ArrivalEstimateDTO {
  /** "same_day" | "scheduled" | "standard" — the method the customer chose. */
  method: "same_day" | "scheduled" | "standard";
  promisedFrom: string | null;  // ISO date (yyyy-mm-dd)
  promisedTo: string | null;    // ISO date (yyyy-mm-dd)
}

export interface OrderDTO {
  // ... every existing field, unchanged ...

  stage: OrderStage;                             // NEW
  paymentMethod?: PaymentMethodSummaryDTO | null; // NEW — null on pre-052 orders
  /**
   * NEW. One entry per package. More than one entry means the order arrives in more than one
   * delivery — which is a fact about the CUSTOMER'S experience, not about fulfilment structure.
   * ⚠ Carries no shop reference of any kind.
   */
  arrivalEstimates: ArrivalEstimateDTO[];        // NEW
}
```

### Refusals

| Condition | Response |
|---|---|
| order not found, or not this customer's | `404` — **uniform**, never distinguishing the two (FR-029) |
| no valid customer token | `401` |
| barred customer | `403` — the existing platform-wide gate, unchanged |

---

## 2. `POST /customer/v1/orders/{id}/receipt` — new

Cold path, customer authorizer. Enqueues a resend (FR-027). It **does not send** — it writes one
`receipt_dispatch` row and returns; the worker sends.

**Request body**: none. ⚠ **There is deliberately no `email` field.** The receipt goes to the address
on the account, resolved server-side. An address in the request body is an open relay for a
personalised document.

**`202 Accepted`**

```json
{ "status": "queued" }
```

**Refusals** — every one of them enqueues nothing:

| Condition | Status | Body `reason` | Note |
|---|---|---|---|
| rate limit reached | `429` | `"too_many_requests"` | FR-028. Stated plainly to the shopper. |
| order not paid | `409` | `"not_paid"` | FR-029 |
| not this customer's order, or no such order | `404` | `"not_found"` | ⚠ **Uniform** — the two are indistinguishable (FR-029, SC-008) |
| no email on the account | `409` | `"no_recipient"` | Cannot occur today (email is `NOT NULL`), declared so the client has no undefined branch |

⚠ **The rate limit is decided by the INSERT, not before it** (research R6): the row is written by an
`INSERT … SELECT … WHERE (count of recent requests) < limit`, and zero rows affected is the refusal.
A check-then-write lets two concurrent taps both pass.

---

## 3. The email

**Template**: `order-confirmation` in `@effy/email-kit` — the id is **kept** (research R8: it has
never been sent, so no delivery record references it).

**Catalogue entry** — `category: "transactional"`, `sentBy: "platform"`,
`onSendFailure: "swallow"`. All three unchanged and all three load-bearing:

- ⚠ `transactional` is what makes an unsubscribe link on this message a **compile error** — the
  catalogue's `Category` union gives the transactional arm no field to put one in (FR-024). A
  customer must not be able to opt out of their own proof of purchase.
- ⚠ `swallow` because the order is **already paid** and the write cannot be unwound. A throw would
  tell the caller the payment failed when it did not (FR-023) — `account-password-changed`'s
  reasoning, not `newsletter-confirmation`'s.

**Variables** (widened from 038's set; every money value, quantity and date arrives **pre-formatted
as a string**, per the catalogue's FR-048):

```
orderNumber, placedAt, stage, deliveryEstimate, deliveryMethod,
items: [{ name, unitPrice, quantity, lineTotal }],
subtotal, discountLabel, discountAmount, hasDiscount,
deliveryFee, total, paymentMethod, hasPaymentMethod,
deliveryAddress, billingAddress, billingSameAsDelivery,
sellerName, supportEmail, orderUrl
```

**Subject**: `Your Effy order {orderNumber} is confirmed`
**Preheader**: the arrival estimate — ⚠ never repeats the subject and never restates the amount
(FR-025).

**Budget**: Gmail's ~102 KB, proven under a 25-item render by the existing `make email-check` guard
(SC-006). The Cognito ~20,000-character budget does **not** apply — this is platform-sent.

---

## 4. Mobile

Both new DTO fields reach `apps/customer-mobile` through the existing generated-contract path
(`commerce/contract/CommerceDto.kt`), not a hand-written Kotlin type — Principle II.

⚠ **`stage` and `method` are closed unions, and an unrecognised value WILL throw on mobile.** This
was checked, not assumed: quicktype emits `enum class OrderStage`, and `effyJson` in
`EffyHttpClient.kt` sets `ignoreUnknownKeys = true` — which covers unknown **keys**, not unknown
**enum values** — while `coerceInputValues` is not set. So a fifth stage added by a future slice would
fail the whole receipt read on every app build older than it.

⚠ **This slice does NOT fix that, deliberately.** The exposure is identical for `BannerPlacement`,
`BannerTarget.Kind` and `OrderStatus`, all of which already ship this way; the only real fixes are a
GLOBAL `coerceInputValues = true` (which changes deserialization for every DTO in the app) or typing
the field as a bare `string` (which throws away the web's exhaustiveness checking). Either is a
platform-wide decision with its own evidence, not a side effect of a receipt redesign.

**Recorded as a carry-forward.** The rule for THIS slice is narrower and is met: a new stage must not
be added without a coordinated mobile release, and the four values above are frozen.

⚠ **Integers on this contract generate as `Double`, and the mapper narrows them.** Checked rather
than assumed: `OrderItemDTO.quantity` is a plain `number` in TypeScript, `packages/shared-types/
contract/CommerceDto.kt` emits `val quantity: Double`, and `CheckoutMappers.kt` calls `.toInt()` with
a comment saying so. That is fine for a RESPONSE — Go writes `2`, kotlinx reads it as a JSON number —
and it is NOT the 027 R13 defect, which was a Kotlin→Go **request** carrying `1.0` into a Go `int`.

So the rule for anything added here: a new integer field must be narrowed in the mapper the same way,
or rendered through a formatter — never interpolated straight into UI text, which is how a receipt
ends up reading "× 2.0".

⚠ **The generated file lives at `packages/shared-types/contract/CommerceDto.kt`**, not under
`apps/customer-mobile/` — it is srcDir'd into the app. Regenerate with `make cm-contract-gen`; verify
with `make cm-contract-check`.

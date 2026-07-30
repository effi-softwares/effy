# Contract: Cart API (hot path, `core-api`)

**Feature**: 027-customer-cart-sync · **Base**: `core-api` `/v1` · **Path law**: 011 FR-028 — commerce
is hot path. Errors are RFC 9457 problems via `httpx` (unchanged).

Money is a **decimal string** with a sibling `currency` (019 R9). Quantities are integers. `revision` is
a JSON number (monotonic, per cart).

---

## 1. Authentication

| Group | Middleware | Notes |
|---|---|---|
| Customer cart | `auth.Middleware(customer pool)` → `customeridentity.Middleware` | Unchanged from 019. Customer id comes from the resolved record in context, **never** from the client. A barred customer is refused by the existing middleware (FR-040). |
| Public | none | `POST /v1/cart/preview` and `GET /v1/cart/policy` only. Both are read-only with respect to cart state. |

## 2. Endpoints

### Authenticated (customer)

| Method | Path | Body | Idempotent | Purpose |
|---|---|---|---|---|
| `GET` | `/v1/cart` | — | yes | The cart, re-priced (FR-021). |
| `POST` | `/v1/cart/items` | `AddToCartRequest` | **no — requires `changeId`** | Add or **increment** a line (FR-014). |
| `PATCH` | `/v1/cart/items/{productId}` | `UpdateCartLineRequest` | yes | Set an **absolute** quantity; `0` removes (R1, R4). |
| `DELETE` | `/v1/cart/items/{productId}` | — | yes | Remove a line. |
| `DELETE` | `/v1/cart` | — | yes | Clear payable lines; **saved items untouched** (FR-032, FR-030). |
| `POST` | `/v1/cart/merge` | `MergeCartRequest` | yes | Sign-in adoption: **union with maximum quantity** (FR-011, FR-012). |
| `POST` | `/v1/cart/reorder` | `ReorderRequest` | yes | Add a past order's items; union-with-max (FR-034, R8). |
| `POST` | `/v1/cart/items/{productId}/set-aside` | — | yes | Move a line → saved (FR-028). |
| `POST` | `/v1/cart/saved/{productId}/restore` | — | yes | Move saved → line, at current price (FR-029). |
| `DELETE` | `/v1/cart/saved/{productId}` | — | yes | Delete a saved item outright. |
| `POST` | `/v1/cart/promo` | `ApplyPromoRequest` | yes | Apply a code (FR-041). Signed-in only by design (R10). |
| `DELETE` | `/v1/cart/promo` | — | yes | Remove the applied code. |

### Public

| Method | Path | Body | Purpose |
|---|---|---|---|
| `POST` | `/v1/cart/preview` | `CartPreviewRequest` | Re-price a **guest's** device cart. Writes nothing. Exists so FR-004/FR-021/FR-022 hold for guests too (R10). |
| `GET` | `/v1/cart/policy` | — | The minimum and the two ceilings, so a guest cart can gate honestly (FR-054, FR-037/038). |

### Removed

| Method | Path | Why |
|---|---|---|
| `PUT` | `/v1/cart` | The 019 R8 "Option B" whole-cart replace. **Deleted, not deprecated** — its removal is what makes FR-010 structural: no client holds an operation able to delete a line it has never seen (research R0/R1). Its only caller was the checkout snapshot, which this slice also deletes. |

**Every** endpoint above (including the removed one's replacements) returns the **complete cart**
(`CartDTO`) on success — FR-007. The client never has to guess a result or issue a follow-up read.
`POST /v1/cart/reorder` returns `ReorderResultDTO`, which *contains* the cart plus the skipped report.

## 3. Request shapes

```ts
interface AddToCartRequest   { productId: string; quantity: number; changeId: string }
interface UpdateCartLineRequest { quantity: number; changeId?: string }   // absolute; 0 removes
interface MergeCartRequest   { lines: CartLineInput[]; changeId?: string }
interface ReorderRequest     { orderId: string; changeId?: string }
interface ApplyPromoRequest  { code: string }
interface CartPreviewRequest { lines: CartLineInput[] }
interface CartLineInput      { productId: string; quantity: number }
```

`changeId` is a client-generated UUIDv4, unique per shopper *action* (not per attempt): every retry of
the same action carries the same id. Optional where the operation is already idempotent, and the clients
send it anyway so the queue has no special cases (R2).

## 4. Response shapes

```ts
interface CartDTO {
  revision: number
  lines: CartLineDTO[]
  savedLines: CartLineDTO[]          // same shape; never counted in any total
  itemSubtotalAmount: string         // payable, available lines only
  discountAmount: string             // "0.00" when no code applies
  deliveryFeeAmount: string          // "0.00" at cart stage — priced at the delivery step (FR-063)
  grandTotalAmount: string           // itemSubtotal - discount
  currency: string
  notices: CartNoticeDTO[]
  discount: CartDiscountDTO | null
  checkout: CartCheckoutStateDTO
  limits: CartLimitsDTO
}

interface CartLineDTO {             // extends 019's shape
  id: string
  productId: string
  name: string
  imageUrl: string | null
  unitPriceAmount: string           // authoritative, now
  quantity: number
  lineSubtotalAmount: string
  available: boolean
  priceChangedFrom: string | null    // ⚠ populated for the FIRST time (FR-023)
  packageKey: string                 // opaque; never a shop (021 FR-005a)
}

interface CartDiscountDTO {
  code: string
  kind: "percentage" | "fixed"
  amount: string                     // the computed reduction, capped at the payable subtotal
  label: string                      // e.g. "20% off" — no shop, ever
}

interface CartCheckoutStateDTO {
  allowed: boolean
  blockedReason: CartBlockedReason | null
  minimumSubtotalAmount: string | null   // null when no minimum is in force
  remainingAmount: string | null         // how much more is needed (FR-054)
}

type CartBlockedReason = "empty" | "no_payable_items" | "below_minimum"

interface CartLimitsDTO { maxLineQuantity: number; maxDistinctItems: number }

interface CartNoticeDTO { productId: string | null; kind: CartNoticeKind; detail: string | null }

type CartNoticeKind =
  | "unavailable"            // in the cart, not payable (FR-022)
  | "price_changed"          // priceChangedFrom is set on the line (FR-023)
  | "removed"                // gone from the catalogue; the line was deleted (FR-025)
  | "quantity_clamped"       // hit maxLineQuantity (FR-037)
  | "cart_full"              // add refused, maxDistinctItems reached (FR-038)
  | "promo_no_longer_applies" // productId is null; detail carries the reason (FR-047)

interface ReorderResultDTO { cart: CartDTO; skipped: ReorderSkippedDTO[] }
interface ReorderSkippedDTO { productId: string; name: string | null; reason: ReorderSkipReason }
type ReorderSkipReason = "unavailable" | "removed" | "cart_full" | "clamped"

interface CartPolicyDTO {
  minimumSubtotalAmount: string
  currency: string
  maxLineQuantity: number
  maxDistinctItems: number
}
```

**`productId: string | null` on a notice** is a widening of 019's shape: a promo notice belongs to the
cart, not a line. Existing consumers read `kind` and `productId` together, so a null is inert for them.

## 5. Promotional-code refusals

`POST /v1/cart/promo` refuses with **422** and an RFC 9457 problem whose `code` is one of the following.
The distinction is required by FR-043 and each value is exercised by SC-012:

| `code` | Meaning |
|---|---|
| `promo_unknown` | No such code. |
| `promo_not_started` | `starts_at` is in the future. |
| `promo_expired` | `ends_at` has passed. |
| `promo_disabled` | `status = 'disabled'`. |
| `promo_exhausted` | `max_redemptions` reached across all shoppers. |
| `promo_already_used` | `max_per_customer` reached by this shopper. |
| `promo_below_minimum` | Cart's payable subtotal is under the code's minimum. The problem carries `minimumSubtotalAmount` and `remainingAmount`. |
| `promo_not_applicable` | Nothing payable to discount. |

Refusals **never** name a shop, a shop count, or a location (FR-062) — including
`promo_below_minimum`, whose amounts are cart-level and therefore safe.

## 6. Guardrails and other error mapping

| Condition | Status | Shape |
|---|---|---|
| Product missing / not a uuid | 404 | existing `httpx.NotFound` |
| Product not `active` on add | 422 | existing validation problem |
| Quantity above `maxLineQuantity` | **200** | clamped, with a `quantity_clamped` notice (FR-037) — a clamp is not a failure |
| Adding beyond `maxDistinctItems` | 422 | `cart_full`; the existing cart is unchanged (FR-038) |
| Reorder of another customer's order | 404 | never 403 — existence is not disclosed |
| Duplicate `changeId` | 200 | current cart, mutation skipped (FR-018) |
| Barred customer | 403 | existing `customeridentity` middleware |

## 7. Checkout's contract changes

`POST /v1/checkout/intent` (existing) gains two behaviours, both server-side:

1. It **refuses below the minimum** — `422 order_below_minimum` with `minimumSubtotalAmount` and
   `remainingAmount` — so a client that ignores the cart's `checkout.allowed` cannot bypass it (FR-056).
2. Its amount becomes `payableSubtotal + delivery − discount`, with the discount **recomputed from the
   cart's applied code at intent time**, never taken from the request (FR-027, FR-042).

`FinalizeSucceeded` (the signature-verified webhook transaction) additionally inserts the
`promo_redemption` row. It is reached only when the status-guarded `pending_payment → paid` update
affected a row, and `promo_redemption.order_id` is `UNIQUE` — so the redemption is counted exactly once
per paid order even under duplicated webhooks (FR-048).

Receipt and order-history DTOs gain `discountAmount` and `promoCode` (FR-049).

## 8. Contract source of truth and generation

`packages/shared-types/src/cart.ts` is the SSOT. Kotlin DTOs are generated into
`packages/shared-types/contract/CommerceDto.kt` by `scripts/gen-kotlin-commerce-contract.mjs`, guarded by
`pnpm commerce-contract:check`.

**Shapes above are written to be generator-friendly** — every object is a *named* interface, every union
is a union of string literals, and there are no inline nested object types. If the generator cannot
express `CartCheckoutStateDTO`'s nullable-string members or the widened `productId: string | null`, the
generator is extended in this slice (it is our code) rather than the contract being bent around it; the
drift guard must be green either way.

`ReplaceCartRequest` is **removed** from `cart.ts` along with the `PUT` route, and `MergeCartRequest`
returns with **different semantics from 019's original**: union-with-**maximum** (idempotent), not the
additive sum that caused the 2026-07-23 triple-quantity bug. That distinction is written into the type's
doc-comment, because the name alone will mislead anyone who remembers the old one.

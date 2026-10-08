# Contracts: Delivery Fee Engine v2

**Feature**: 077. DTOs live in `@effy/shared-types` (`delivery.ts`, `delivery-admin.ts`, `checkout.ts`,
`order.ts`) and are mirrored into the Kotlin contract where a mobile app reads them. Money is a 2-dp
decimal string. Errors are RFC 9457 problems with the `code` named.

## Shared words — `packages/shared-types/src/delivery.ts`

```ts
export type DeliveryFeeLineKind = "delivery" | "window_surcharge" | "small_order" | "free_delivery";

/** ⚠ THE ONLY PLACE THESE WORDS ARE WRITTEN — web, mobile, receipt and email render them. */
export const DELIVERY_FEE_LINE_LABEL = {
  delivery: "Delivery",
  window_surcharge: "Window surcharge",
  small_order: "Small-order fee",
  free_delivery: "Free delivery",
} as const;

export interface DeliveryFeeLineDTO { kind: DeliveryFeeLineKind; amount: string }   // free_delivery is negative

/** What a customer is charged for delivery, and why, in lines that sum to `totalAmount`. */
export interface DeliveryFeeDTO { lines: DeliveryFeeLineDTO[]; totalAmount: string }

/** The business's public basket offer. Absent values mean the rule is not set. */
/** The other sentences every customer surface shares. `{amount}` is replaced by the client. */
export const DELIVERY_FEE_WORDS = {
  spendMore: "Spend {amount} more for free delivery",
  freeReached: "You've got free delivery",
  smallOrder: "Orders under {amount} have a small-order fee",
  feeChanged: "The delivery fee has changed. Please check the new total.",
} as const;

export interface DeliveryOfferDTO {
  freeDeliveryOverAmount: string | null;
  smallOrderUnderAmount: string | null;
  smallOrderFeeAmount: string | null;
}
```

⚠ No customer DTO carries a distance, a band, a weight, a plan id or name (FR-032). ⚠ No shop DTO
carries a delivery amount (FR-038).

---

## Customer-facing (shared gateway) — existing routes

### `GET /storefront/v1/serviceability?postcode=3121` — public

```json
{ "postcode": "3121", "serviced": true, "coverage": "effy",
  "offer": { "freeDeliveryOverAmount": "80.00", "smallOrderUnderAmount": "20.00", "smallOrderFeeAmount": "3.00" } }
```
`offer` is present only when `coverage` is `effy`. Cache unchanged (`public, max-age=300`).

### `GET /commerce/v1/checkout/quote?addressId=…` — `DeliveryQuoteDTO`, additions

```json
{
  "standardFee": { "lines": [ { "kind": "delivery", "amount": "6.00" } ], "totalAmount": "6.00" },
  "sameDaySlots": [
    { "slotId": "…", "date": "2026-10-09", "startAt": "…", "endAt": "…", "cutoffAt": "…",
      "surchargeAmount": "2.00",
      "fee": { "lines": [ { "kind": "delivery", "amount": "6.00" },
                          { "kind": "window_surcharge", "amount": "2.00" } ], "totalAmount": "8.00" } }
  ],
  "freeDeliveryRemainingAmount": "26.00",
  "packages": [ { "shopRef": "pkg-1", "options": [ { "method": "standard", "feeAmount": "6.00" }, { "method": "same_day", "feeAmount": "8.00" } ] },
                { "shopRef": "pkg-2", "options": [ { "method": "standard", "feeAmount": "0.00" }, { "method": "same_day", "feeAmount": "0.00" } ] } ]
}
```
- `standardFee` — the fee when no window is chosen. `sameDaySlots[].fee` — the fee with that window.
- `surchargeAmount` is what a customer compares windows by (FR-030); `"0.00"` when there is none.
- `freeDeliveryRemainingAmount` — null when no free amount is set or it is already reached.
- ⚠ `packages[].options[].feeAmount` is **compatibility only** (research R4): a client that sums the
  chosen method per package gets the order fee — for same-day, the DEAREST open slot's, so it is never
  charged more than it showed. New clients do not read it. Removed by E5.

### `POST /commerce/v1/checkout/intent` — request gains one optional field

```json
{ "…": "…", "shownDeliveryAmount": "8.00" }
```
Response gains `deliveryFee: DeliveryFeeDTO`.

| Refusal | Status · `code` | Body |
|---|---|---|
| The delivery total differs from `shownDeliveryAmount` | 409 `delivery_fee_changed` | `{ code, quote }` — a fresh quote; nothing was written |
| A listed postcode could not be priced | 503 `delivery_unavailable` (existing) | metric `DeliveryQuoteFailures` |

### Customer order, receipt

`OrderDTO` / receipt view gain `deliveryFee?: DeliveryFeeDTO` (absent on orders placed before 077, which
keep `deliveryFeeAmount` alone). The order-confirmation email renders the same lines.

---

## Shop (shared gateway)

`ShopOrderDTO.money.deliveryFee` — **removed** (research F1, R14).

---

## Staff (staff gateway) — service `admin`

All behind the back-office authorizer; `admin` and `manager` write, `csa` reads and simulates.

### `GET /admin/v1/delivery/plans?kind=effy|courier` — existing, new shape

```ts
interface FeePlanDTO {
  id: string; kind: "effy" | "courier"; name: string;
  state: "draft" | "active" | "retired";
  baseAmount: string;
  distanceBands: { upperKm: string | null; addAmount: string }[];   // effy only; null = and beyond
  weightBands: { upperGrams: number; addAmount: string }[];          // heaviest = and above
  freeOverAmount: string | null;
  smallOrderUnderAmount: string | null; smallOrderFeeAmount: string | null;   // effy only
  todayPremiumAmount: string;                                                  // effy only
  slotPremiums: { slotId: string; label: string; slotActive: boolean; addAmount: string }[];   // effy only
  roundingStepAmount: string; floorAmount: string; capAmount: string;
  gaps: PlanGapDTO[];
  createdBy: string; createdAt: string; activatedBy: string | null; activatedAt: string | null;
}
interface PlanGapDTO { code: PlanGapCode; blocking: boolean; detail: Record<string, string | number | null> }
```

### `POST /admin/v1/delivery/plans` — existing, new body (`FeePlanInput`: the fields above without state, gaps, audit)

201 `FeePlanDTO` (a draft). 422 `invalid_plan` with `fields[]` for value errors — a bad amount, an
amount off the rounding step, small-order not below free, a courier plan given distance bands or
surcharges. Missing or non-monotonic bands come back as `gaps` on the saved draft, not as a refusal —
a half-built draft can be saved.

### `PUT /admin/v1/delivery/plans/{planId}` — **new**

Replaces a draft whole. 409 `plan_not_draft` for an active or retired plan.

### `POST /admin/v1/delivery/plans/{planId}/activate` — existing

Body `{ "confirmZeroFloor": false }`.

| Refusal | Status · `code` | Body |
|---|---|---|
| Blocking gaps | 409 `plan_incomplete` | `{ gaps: PlanGapDTO[] }` |
| Floor is $0, not confirmed | 409 `zero_floor_unconfirmed` | |
| Already active | 409 `plan_already_active` | |
| Retired | 409 `plan_retired` | copy it to a new draft |

### `POST /admin/v1/delivery/plans/simulate` — **new**, read-only

```ts
interface FeeSimulationRequest {
  planId: string | null;        // null = the active plan of the kind the postcode resolves to
  postcode: string; grams: number; basketAmount: string;
  slotId: string | null; windowIsToday: boolean;
  forceKind?: "courier";      // price as a courier order whatever the postcode's coverage — courier delivery cannot be switched on yet
}
interface FeeSimulationDTO {
  coverage: "effy" | "courier" | "none";
  plan: { id: string; name: string; kind: "effy" | "courier"; state: string } | null;
  fee: DeliveryFeeDTO | null;                    // what the customer would see
  steps: { label: string; detail: string; amount: string }[];   // base, distance band, weight band, premium, rounding, floor/cap, free, small-order
  note: string | null;                           // e.g. "Effy does not deliver to 3999; a courier does."
}
```
422 `unknown_postcode`, `plan_kind_mismatch`. `coverage: "none"` returns no fee and a note. Writes nothing (FR-027).

### `GET /admin/v1/delivery/rings` — **removed**

### `PUT /admin/v1/delivery/coverage/courier` (076) — one more refusal

409 `courier_plan_missing` when switching on with no active courier plan.

### Staff order detail (service `orders`) — existing route

`deliveryFeeBreakdown` — the stored breakdown, whole: plan, inputs, parts, lines (FR-037).

---

## Live

Kind `pricing` (ops channel): announced after a plan is created, updated or activated. Back-office maps
it to `["delivery","plans"]`.

## Plan gap codes

| `code` | Sentence staff read |
|---|---|
| `distance_open_band_missing` | "Add a last distance band with no upper limit, so every distance has a price." |
| `distance_bands_missing` | "Add at least one distance band." |
| `weight_bands_missing` | "Add at least one weight band." |
| `distance_not_monotonic` | "The {b} km band costs less than the {a} km band. A farther delivery cannot cost less." |
| `weight_not_monotonic` | "The {b} kg band costs less than the {a} kg band. A heavier basket cannot cost less." |
| `floor_is_zero` *(not blocking)* | "The minimum fee is $0. Confirm that delivery may be free without the free-delivery amount." |
| `premium_on_disabled_slot` *(not blocking)* | "A surcharge is set on a window that is switched off. It will not apply." |

Value errors are not gaps: they are 422 field errors when the plan is saved (see `POST …/plans`).

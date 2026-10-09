# Contracts: 081 routes and wire changes

All staff routes attach to the **staff gateway**, service `orders`. Read = any active staff
(`requireReader`); write = admin/manager from the `admin.staff` record (`requireWriter`).

## `GET /orders/v1/orders/{orderId}/delivery-move?to=courier|effy` — preview (read)

```jsonc
{
  "to": "courier",
  "allowed": true,                     // false → "refusal" says why; actions disabled with that line
  "refusal": null,                     // { "code": "out_for_delivery", "message": "…" }
  "updatedAt": "2026-10-09T03:12:44.120Z",
  "paidDeliveryAmount": "9.00",
  "courierFeeAmount": "6.50",          // to=courier only
  "differenceAmount": "2.50",          // never below zero
  "refundableAmount": "41.20",         // 055's remaining ceiling, card part
  "centsPerPoint": 1,
  "choices": [                         // to=courier only; first is the default
    { "kind": "points_difference",    "amount": "2.50", "points": 250, "default": true },
    { "kind": "free_delivery_points", "amount": "9.00", "points": 900 },
    { "kind": "free_delivery_refund", "amount": "9.00", "cardAmount": "9.00", "pointsReturned": 0 },
    { "kind": "refund_difference",    "amount": "2.50", "cardAmount": "2.50", "pointsReturned": 0, "lastResort": true },
    { "kind": "none",                 "amount": "0.00", "noteRequired": true }
  ],
  "courier": { "courierName": "…", "serviceName": "…", "estimate": "2–4 business days", "collection": "hub" },
  "windows": null                      // to=effy: [{ "slotId", "date", "label", "start", "end" }] — open, with room
}
```

## `POST /orders/v1/orders/{orderId}/delivery-move` — move (write)

```jsonc
// to courier
{ "to": "courier", "reason": "Van off the road", "compensation": "points_difference",
  "compensationNote": null, "expectedUpdatedAt": "…", "expectedAmount": "2.50" }
// back to Effy
{ "to": "effy", "reason": "Van back", "window": { "slotId": "…", "date": "2026-10-10" },
  "expectedUpdatedAt": "…" }
```

**200** → `{ "override": AdminDeliveryMoveDTO, "refund"?: { "status": "submitted" | "submitting" | "refused", "stalled"?: true } }`

**Refusals** (problem+json, nothing written):

| Status | Code | When |
|---|---|---|
| 400 | `validation_failed` | missing reason (≤ 500), unknown `to`/`compensation`, `none` without a note, `effy` without a window |
| 403 | — | not admin/manager (uniform, non-disclosing) |
| 404 | `not_found` | |
| 409 | `not_paid`, `no_delivery_type`, `already_courier`, `already_effy`, `handed_over`, `delivered`, `out_for_delivery`, `courier_not_ready`, `not_in_area`, `window_unavailable` | guards (research R3) |
| 409 | `changed` | `expectedUpdatedAt` stale — refetch |
| 409 | `compensation_changed` | recomputed amount ≠ `expectedAmount` — the body carries the new preview |

## `GET /orders/v1/orders/{orderId}` — order detail (existing)

`AdminOrderDTO` gains:

```ts
deliveryMoves: AdminDeliveryMoveDTO[]   // oldest first; [] when none
interface AdminDeliveryMoveDTO {
  id: string; at: string; to: "effy" | "courier"; reason: string;
  actor: { sub: string; name: string };
  window: { date: string; start: string; end: string } | null;    // released (to courier) / taken (to Effy)
  courier: { courierName: string; serviceName: string; collection: "hub" | "supplier" } | null;
  paidDeliveryAmount: string; courierFeeAmount: string | null; differenceAmount: string | null;
  compensation: "points_difference" | "free_delivery_points" | "free_delivery_refund" | "refund_difference" | "none";
  amount: string; points: number | null; refundStatus: string | null; compensationNote: string | null;
}
```

## Customer order DTO (commerce, shared gateway — existing route)

`delivery` gains, only after a staff move, the **latest** one:

```ts
moved?: { to: "effy" | "courier"; at: string; compensation: { kind: "points" | "refund"; amount: string; points?: number } | null }
```
Never the reason, the courier fee, the difference or Effy's cost (SC-008). Kotlin contract regenerated.

## Notification

`order_delivery_changed` (customer; push + email; entity = `delivery_override.id`; deep link
`effy://order`); email template `order-delivery-changed`. Copy and the compensation sentence come from
`compensationLine` in `packages/shared-types/src/delivery-type.ts` (fixtures pinned).

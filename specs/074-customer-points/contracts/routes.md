# Contracts: Customer Points (store credit)

**Feature**: 074-customer-points. Every DTO below is added to `@effy/shared-types` (new file
`packages/shared-types/src/points.ts`, plus fields on `checkout.ts`, `order.ts`, `order-admin.ts`,
`refund.ts`) and mirrored in the Kotlin contract (`packages/shared-types/contract/CommerceDto.kt`,
`CustomerDto` equivalent) — Principle II. Money is a decimal string (`"12.50"`) as everywhere else;
points are integers.

Errors are RFC 9457 problems (`@effy/edge-shared` `problem()`), with the `code` named below.

---

## Customer — service `customer` (customer pool)

### `GET /customer/v1/points?cursor=…&limit=20`

The balance **and** a page of history, in one answer (`CustomerPointsDTO`).

```json
{
  "points": 1250,
  "valueAmount": "12.50",
  "centsPerPoint": 1,
  "nextExpiry": { "points": 500, "date": "2027-10-08" },   // null when nothing is due
  "history": {
    "entries": [
      {
        "id": "…",
        "kind": "staff_credit",            // staff_credit | auto_credit | returned | staff_debit | spent | expired | forfeited
        "points": 500,                     // signed
        "valueAmount": "5.00",
        "words": "Sorry your order was late",   // customer-facing, from the reason vocabulary (R11)
        "orderNumber": "EFY-7K2M9Q",       // null when not tied to an order
        "expiresOn": "2027-10-08",         // credits only
        "at": "2026-10-08T10:42:00+11:00"
      }
    ],
    "nextCursor": "…"                     // absent on the last page
  }
}
```

⚠ No `note`, no author identity — internal to back-office.

> **As built (2026-10-08):** planned as two routes (`/points` and `/points/history`). They were merged
> when the first dev deploy failed: the shared gateway was at **299 of 300 routes and 299 of 300
> integrations**, so a second route could not be created. `cursor` pages the history; the balance is
> always the current one.

### `GET /customer/v1/closure` (existing) — adds

```json
{ "pointsHeld": 1250, "pointsValueAmount": "12.50" }
```

---

## Checkout — service `commerce` (customer pool)

### `POST /commerce/v1/checkout/quote` (existing) — response adds

```json
{
  "points": {
    "usable": 1250,
    "centsPerPoint": 1,
    "cardMinimumAmount": "0.50"   // the card part must be 0 or at least this
  }
}
```
Omitted entirely when `usable` is 0 (clients then hide the control).

> **As built:** there is no `maxForThisOrder`. The order total depends on the delivery choice still to
> be made, so the client works out the most it can offer (web), or sends the balance and retries once
> with the `maxPoints` a refusal returns (mobile). The intent call re-decides it either way.

### `POST /commerce/v1/checkout/intent` (existing) — request adds

```json
{ "pointsToUse": 1250 }          // integer >= 0; absent = 0
```

Response adds:

```json
{
  "pointsUsed": 1250,
  "pointsAmount": "12.50",
  "cardAmount": "35.30",
  "paidWithPoints": false          // true → order is already paid; no clientSecret is returned
}
```

When `paidWithPoints` is `true`, `clientSecret`, `customerSessionSecret` and `payOverTimeAvailable`
are omitted and the order is `paid`.

New refusals (nothing is written when refused):

| HTTP | `code` | Body extra | When |
|---|---|---|---|
| 409 | `points_balance_changed` | `usable` | more points asked than are usable now |
| 422 | `points_exceed_total` | `maxPoints` | more points than the order total |
| 422 | `points_card_remainder_too_small` | `maxPoints` | card remainder between 0 and the provider minimum |
| 409 | `payment_in_progress` | — | switching to points-only while an earlier card payment for this order is already paid or authenticating |

### Order reads (existing `GET /commerce/v1/orders/{id}`, list) — add

```json
{
  "payment": {
    "pointsUsed": 1250, "pointsAmount": "12.50", "cardAmount": "35.30",
    "pointsReturned": 200, "cardReturned": "6.00"
  }
}
```

---

## Back-office — service `orders` (admin pool)

Gates per `orders/src/lib/guard.ts`: **read** = any active staff (incl. csa); **write** as stated.

### `GET /orders/v1/customers?q=…`

`q` = an email (exact, case-insensitive), an email prefix (≥ 3 characters), or an order number.
Returns at most 20:

```json
{ "customers": [ { "id": "…", "name": "Ada L.", "email": "ada@…", "points": 1250, "orderCount": 7 } ] }
```

### `GET /orders/v1/customers/{customerId}`

```json
{
  "id": "…", "name": "…", "email": "…",
  "points": { "usable": 1250, "valueAmount": "12.50", "held": 0, "nextExpiry": { "points": 500, "date": "2027-10-08" } },
  "recentOrders": [ { "id": "…", "orderNumber": "EFY-…", "placedAt": "…", "total": "47.80" } ]
}
```

### `GET /orders/v1/customers/{customerId}/points/history?cursor=…`

As the customer history, plus staff-only fields per entry: `reason`, `note`, `authorKind`,
`authorName` (staff display name or flow name), `refundId`.

### `POST /orders/v1/customers/{customerId}/points/credit` — staff (csa within limit)

```json
{ "points": 500, "reason": "late_delivery", "note": "", "orderId": "…" }
```
→ `201 { "entryId": "…", "usable": 1750 }`

| HTTP | `code` | When |
|---|---|---|
| 422 | `points_invalid` | points not a positive integer, or > 1,000,000 |
| 422 | `reason_invalid` / `note_required` | unknown reason; `other` without a note |
| 403 | `over_agent_limit` (+ `limit`) | csa above `csa_credit_limit_points` |
| 404 | `order_not_found` | the order is not this customer's (same answer as no such order) |

### `POST /orders/v1/customers/{customerId}/points/debit` — admin, manager

```json
{ "points": 500, "reason": "credited_in_error", "note": "" }
```
→ `201 { "entryId": "…", "usable": 750 }` · `409 insufficient_points` (+ `usable`).

### `GET /orders/v1/points/settings` — any staff · `PUT /orders/v1/points/settings` — admin

```json
{ "centsPerPoint": 1, "expiryMonths": 12, "csaCreditLimitPoints": 2000, "warningDays": 30, "holdMinutes": 30 }
```
PUT takes any subset; each changed field writes one `points_settings_change` row.

### Order detail (existing `GET /orders/v1/orders/{orderId}`) — adds the same `payment` block as the
customer read, and each refund row gains `cardAmount`, `pointsReturned`.

---

## Shared library — `@effy/edge-shared/points`

The only writers of the points tables. Signatures (TypeScript, abridged):

```ts
usable(q, customerId, at, exceptOrderId?): Promise<number>
credit(tx, { customerId, points, kind: "staff_credit" | "auto_credit", reason, note?, orderId?,
             author: StaffAuthor | SystemAuthor, dedupeKey? }): Promise<EntryId>
debit(tx, { customerId, points, reason, note?, author: StaffAuthor }): Promise<EntryId>
hold(tx, { customerId, orderId, points, now }): Promise<{ heldUntil: Date }>
release(tx, orderId): Promise<void>
spendHeld(tx, orderId): Promise<{ spent: number; shortfallPoints: number }>   // inside finalizeSucceeded
returnForRefund(tx, { refundId, orderId, points }): Promise<void>            // idempotent per refund
expireDue(q, now, limit): Promise<number>                                   // the sweep
forfeit(tx, customerId, author): Promise<number>                            // R10
splitRefund({ amountCents, cardPaidCents, pointsValueCents, centsPerPoint, refundedBeforeCents,
              cardRefundedBeforeCents, pointsReturnedBefore }): { cardCents; points; pointsValueCents }   // pure, R5
              // throws RefundNotSplittableError when no exact split exists (only with centsPerPoint > 1)
announcePoints(customerSub): Promise<void>                                  // after commit, never throws
```

Every function that writes takes the caller's transaction and locks `points_account` first.

---

## Live

`LIVE_KINDS` gains `"points"`. Customer channel: published on every change to that customer's
points. Ops channel: published so an open back-office customer view re-reads.

# Contract — Refunds & Cancellation (055)

⚠ **Two hosts, and that is the shape of the feature.** Issuing money lives in `core-api` because the
payment secret lives there and nowhere else (019 SC-012). Reading an order in the console stays on
`edge-api/orders` where 053 built it. See [research.md](../research.md) R1 for why the alternatives —
brokering the operator's token, or duplicating the Stripe secret into a Lambda — were rejected.

Errors use each path's existing problem shape. Money crosses as a **2-dp decimal string**, computed in
integer cents (research R10).

---

## Hot path — `core-api`, BACK-OFFICE pool

⚠ **New**: `core-api` gains a second `PoolVerifier` for the back-office pool alongside the customer one.
Per-pool validation with a pinned issuer — the shape Principle IV sanctions. A customer token is
structurally rejected here, and a back-office token is structurally rejected on `/v1/orders/*`.

| Method | Path | Purpose | FR |
|---|---|---|---|
| `POST` | `/v1/admin/orders/{orderId}/refunds` | Issue a refund — item-derived or goodwill | FR-001–003, FR-005 |
| `POST` | `/v1/admin/orders/{orderId}/cancel` | Cancel on the customer's behalf, at any pre-delivery stage | FR-018 |
| `POST` | `/v1/admin/orders/{orderId}/proposals/dismiss` | Dismiss a proposed refund without issuing it | FR-004b |
| `POST` | `/v1/admin/refund-requests/{requestId}/decline` | Close a customer request without refunding | FR-005r2 |

**Authorization**: **write = `admin`/`manager`**, decided from the `admin.staff` record, never the
`cognito:groups` claim (FR-019). ⚠ Reading is *not* here — reads are cold-path, and `csa` can do them
(FR-020). Refusals are uniform and do not vary with the order named (FR-021).

**Issue body**

```jsonc
// item-derived — the amount is COMPUTED from these lines and is not accepted from the client
{ "kind": "item",
  "lines": [ { "orderItemId": "…", "quantity": 2 } ],
  "reason": "item_not_supplied",
  "note": "optional" }

// goodwill — a free amount, and the note is REQUIRED
{ "kind": "goodwill", "amount": "5.00", "reason": "goodwill", "note": "late delivery" }
```

⚠ **An item-derived request carries no `amount`, and one would be rejected rather than ignored.** If the
client could send an amount beside a line selection the two could disagree, and the record would then
claim a refund covered items it did not (FR-003, A7a).

⚠ **Nothing here accepts a destination.** The refund goes to the payment method on the order (FR-006).
An endpoint that took one would be a way to redirect other people's money.

**Refusals**: over the remaining ceiling → the remaining amount is stated (FR-002); a line already
refunded in full → refused (FR-003a); goodwill with no note → refused (FR-003c).

---

## Hot path — `core-api`, CUSTOMER pool

| Method | Path | Purpose | FR |
|---|---|---|---|
| `POST` | `/v1/orders/{orderId}/cancel` | Cancel my own order, while no shop has begun preparing | FR-012–017 |
| `POST` | `/v1/orders/{orderId}/refund-requests` | Ask for a refund on named items | FR-005r |
| `GET` | `/v1/orders/{orderId}` | *(existing)* — now also carries refunds and cancellability | FR-025–028 |

⚠ **"Not yours" and "no such order" are byte-identical refusals** (FR-016) — anything else makes the
route an oracle for which order ids exist.

⚠ **The customer never sends an amount, on any route.** They name items and say what went wrong; what
that is worth is the platform's arithmetic and a staff member's decision.

---

## Hot path — provider webhooks (no authorizer)

The existing signature-verified endpoint gains three event types: `refund.updated`, `refund.failed`,
`charge.refunded`. The sanctioned webhook exception in ARCHITECTURE.md; the mechanism already exists and
this adds cases to it.

⚠ **Processed idempotently against the existing `stripe_event` dedup table** (FR-010) — a redelivered
event changes recorded state at most once. ⚠ **An event for a refund the platform does not recognise is
RECORDED, not discarded**: a refund issued from the provider's own dashboard is a real thing that
happens, and silently dropping it would leave the order claiming money it still holds.

---

## Cold path — `edge-api/orders`, BACK-OFFICE authorizer

| Method | Path | Purpose | FR |
|---|---|---|---|
| `GET` | `/orders/v1/orders/{orderId}` | *(existing)* — now also returns refunds, requests and proposals | FR-020 |
| `GET` | `/orders/v1/orders` | *(existing)* — gains an "awaiting a refund decision" filter | FR-004c |

**Read = any active staff including `csa`** (FR-020) — they are the ones being asked about it.
⚠ Adding these to `edge-api/admin` is impossible: it is at 434/500 CloudFormation resources with
`versionFunctions: false` already spent. `edge-api/orders` has room and already owns the order console.

---

## Cold path — `edge-api/shop`, SHOP authorizer

| Method | Path | Purpose | FR |
|---|---|---|---|
| `POST` | `/shop/v1/fulfillments/{id}/unfulfillable` | Mark this portion unable to be fulfilled, with a reason | FR-031 |

⚠ **Moves no money** (FR-031). Refused once the portion has been collected — the goods have left the
shop and it is no longer their call.

---

## DTOs — `packages/shared-types/src/refund.ts`

```ts
export type RefundKind = "item" | "goodwill"
export type RefundReason =
  | "item_not_supplied" | "item_unusable" | "order_cancelled" | "goodwill"

/** ⚠ FIVE states, because each is a different answer to "did the money go?" (FR-005f). */
export type RefundStatus =
  | "submitting"   // we have not got an answer from the provider yet
  | "submitted"    // the provider has it; the bank does not yet
  | "succeeded"
  | "failed"       // the bank rejected it — possibly weeks later
  | "refused"      // the provider would not accept the request at all

export interface RefundDTO {
  id: string
  kind: RefundKind
  amount: string
  reason: RefundReason
  status: RefundStatus
  /** Present only on `failed` — the provider's reason, for staff. Never shown to a customer. */
  failureReason: string | null
  createdAt: string
  settledAt: string | null
}

/** What a CUSTOMER sees. ⚠ Deliberately smaller than RefundDTO. */
export interface CustomerRefundDTO {
  amount: string
  /** ⚠ Three values, not five. A customer cannot act on the difference between `submitting` and
   *  `submitted`, and `refused` vs `failed` is our problem, not theirs. */
  state: "on_its_way" | "completed" | "there_was_a_problem"
  refundedAt: string | null
}
```

⚠ **`RefundReason` is Effy's vocabulary, not the provider's** (research R5). The provider offers three
values describing a payments concern; the business needs to tell "never supplied" from "arrived
unusable" from "cancelled" from "goodwill". Both are recorded; ours is the one anything reads.

⚠ **No `failureReason` reaches a customer.** "Your bank rejected the refund" is staff information —
surfacing it invites a shopper to argue with a message they cannot act on.

---

## Changes to existing responses

- **`OrderDTO`** (customer, both surfaces) gains `refunds: CustomerRefundDTO[]`, `refundedTotal`,
  `amountPaidAfterRefunds`, and `cancellable: boolean`. ⚠ `cancellable` is **server-derived** — the
  client must never compute it from a stage, which is the `summarizeFulfillment` mistake 052 deleted.
- **The back-office order DTO** gains `refunds`, `refundRequest`, `proposedRefunds`, `refundableAmount`.
- ⚠ **The receipt is unchanged** (FR-024). What was charged is a historical record; refunds are shown
  alongside it, never folded into it.

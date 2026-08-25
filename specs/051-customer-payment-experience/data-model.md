# Data Model: Customer Payment Experience (051)

**Date**: 2026-08-25 · **Spec**: [spec.md](./spec.md) · **Research**: [research.md](./research.md)

The feature adds **one column and nothing else** to the platform's own schema. Card data lives with the
payment provider; Effy holds references. Everything else here already exists and is listed only where
this feature reads or constrains it.

---

## 1. New: `public.customer.stripe_customer_id`

One forward-only Goose migration.

```
ALTER TABLE public.customer
  ADD COLUMN stripe_customer_id text UNIQUE;
```

| Property | Value | Why |
|---|---|---|
| Type | `text` | Provider ids are opaque strings; never parse one. |
| Nullable | **Yes** | A customer has no provider record until their first payment. Backfilling one for every existing customer would create provider objects for people who may never pay. |
| Unique | **Yes** | Two Effy customers sharing one provider customer would let one shopper see another's kept cards — FR-026. The constraint is the enforcement, not the service code. |
| Index | Implied by `UNIQUE` | Lookups are by `customer.id`, which is already the primary key. |

**Lifecycle**: created lazily and idempotently on the first payment attempt (get-or-create inside the
intent transaction). Once set, never changed. `ON DELETE` of the customer row removes the reference;
the provider-side record and its cards are deleted by an explicit call, because a cascade cannot reach
another system — see § 5.

**⚠ It is a reference, not a credential.** It identifies a provider record; it grants nothing on its own
and is not a secret.

**⚠ AMENDED 2026-08-25 — it DOES reach the mobile client, and it has to.** This section originally said
"no response carries it", written before the mobile SDKs were read. Both require the id *alongside* the
session secret: Android `CustomerConfiguration.createWithCustomerSession(id, clientSecret)`, iOS
`CustomerConfiguration(id:customerSessionClientSecret:)`. Without it a customer session cannot be
attached and mobile saved cards are unbuildable.

Why this is acceptable rather than a hole:

- **The session secret is the credential; the id is not.** The id alone reaches no API — every Stripe
  call that reads a customer needs a secret key, which never leaves `core-api` (SC-012).
- **It is scoped to its own owner.** The session is minted server-side for the authenticated subject, so
  a client only ever receives the id of the customer it already is.
- **It is Stripe's own documented mobile integration**, not a workaround.

**The rule that survives**: it goes to a client ONLY where the SDK requires it — i.e. only in the mobile
intent response, and only beside a session secret. It is NOT in the web response (spike S2 removed the
need), never logged, never in telemetry, and never accepted as *input* on any route.

---

## 2. Not stored: kept cards

There is **no `payment_method` table, and there must not be one.**

A kept card is read from the provider at the moment it is needed, via the customer session the payment
step is already given. Mirroring network, last four digits and expiry into Postgres would create a copy
that silently rots: a card removed at the provider, expired, or replaced by the issuer's auto-updater
would keep being offered from Effy's stale row, and FR-023 would be unmeetable. The provider is the
system of record for cards; Effy stores the pointer to their owner and nothing more.

**Consequence**: the payment-methods screen (US6) is a live read. It has no offline state and must
render a failure honestly rather than an empty list — an empty list means "you have no cards", and
saying that when the truth is "we could not ask" is the FR-036 failure mode.

**Shape as it reaches a surface** (never persisted):

| Field | Notes |
|---|---|
| `id` | Provider payment-method reference. Opaque. |
| `brand` | Network, for the mark and the label. |
| `last4` | Four digits. The only part of a card number that may ever leave the provider. |
| `expMonth` / `expYear` | For display and for the unusable check. |
| `isDefault` | Which one the payment step pre-selects (FR-022). |
| `usable` + `unusableReason` | FR-023. A card is unusable when expired; the reason is stated, never inferred by the client from the expiry. |

⚠ **Never**: full number, security code, cardholder name, fingerprint, or any provider object beyond the
fields above (FR-025, SC-012).

---

## 3. Unchanged: `public.payment`

Already correct for this feature and **must not be extended**.

```
payment(id, order_id UNIQUE, provider, stripe_payment_intent_id UNIQUE,
        amount, currency, status, created_at, updated_at)
```

`status ∈ {requires_payment, requires_action, succeeded, failed, canceled}` already expresses every
outcome FR-040 needs, including "not yet known" (`requires_payment` / `requires_action`). The unique
`order_id` is one of the three guarantees behind FR-038.

**Do not add** a `payment_method_type` column to satisfy "which method paid". It is derivable from the
provider's intent and duplicating it creates a second truth about a settled payment — the same class of
mistake 027 rejected for `redemptionCount`.

---

## 4. Unchanged: the double-charge guarantees

Three mechanisms already carry FR-038 / SC-006. This feature must leave all three intact (R10).

1. **Deterministic idempotency key** over order id and amount — a retried create returns the same intent
   rather than a second one.
2. **`payment.order_id UNIQUE`** — one payment row per order, structurally.
3. **`public.stripe_event`** — a redelivered provider event id is a no-op insert, so the paid transition
   cannot double-apply.

A fourth is behavioural and belongs to this feature: **FR-041**, the pay control refusing a second
submission. It is a courtesy on top of the three above, never a substitute for them.

---

## 5. Deletion and barring

FR-027 requires that deleting or barring an account removes the shopper's kept cards. A database cascade
cannot do this — the cards are in another system.

| Step | Where | Failure behaviour |
|---|---|---|
| Delete provider cards, then the provider customer | Hot path, in the account-deletion path | Must be retryable. A failure here MUST NOT be swallowed: a deleted Effy account whose cards survive at the provider is a data-retention breach, not a cosmetic bug. |
| Clear / cascade `customer.stripe_customer_id` | Existing `ON DELETE CASCADE` on the customer row | Follows the row. |

**Ordering matters**: the provider record must be deleted *before* the local reference, or the reference
needed to find it is gone and the cards are orphaned with no way to reach them.

**Barring** is a status, not a deletion. A barred customer is already refused at the identity gate, so
their cards become unreachable without being destroyed; only account *deletion* destroys them.

---

## 6. Entity relationships

```
customer (1) ──── (0..1) provider customer record        [by customer.stripe_customer_id]
                              │
                              └── (0..n) kept card       [provider-held; never in Postgres]

customer (1) ──── (0..n) order (1) ──── (0..1) payment (1) ──── (1) provider payment intent
                              │
                              └── billing address snapshot   [source of the details Effy supplies at
                                                              confirmation — FR-016]
```

---

## 7. Validation rules carried from requirements

| Rule | From | Enforced by |
|---|---|---|
| One provider customer per Effy customer | FR-026 | `UNIQUE` on the column |
| A card is kept only on explicit consent | FR-020 | The provider's save flag, set from what the shopper ticked — Effy never sets `setup_future_usage` itself (R5) |
| Kept cards are visible only to their owner | FR-026 | The customer session is minted server-side for the authenticated subject; the client never names a customer |
| An unusable card is not selectable | FR-023 | Server-computed `usable` + reason; the client does not decide from the expiry |
| The amount charged equals the amount shown | FR-005, FR-006 | Server-computed total; no client-supplied figure is ever read |
| No card data at rest | FR-025, SC-012 | No column exists to hold it, and the DTO in § 2 is the whole permitted shape |

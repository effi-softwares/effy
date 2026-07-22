# Data Model: Checkout Shipping & Billing Addresses (023)

**Date**: 2026-07-22 · **Feeds**: [plan.md](./plan.md) · **Decisions**: [research.md](./research.md)

**One forward-only migration**: `public."order"` gains a single **nullable** `billing_address jsonb`
column. Nothing else in the schema changes; `public.customer_address` is reused unchanged (022).

---

## Changed entity — `public."order"` (019)

Existing columns are unchanged. The order already holds the **shipping** snapshot as `delivery_address`
(R2 — not renamed). One column is added:

| Column | Change | Notes |
|---|---|---|
| `delivery_address` jsonb NOT NULL | **unchanged** | The **shipping** snapshot (formalised). Immutable at placement (019). |
| `billing_address` jsonb **NULL** | **NEW** | The **billing** snapshot. **`NULL` = "same as shipping"** (R1). A value = a divergent, immutable billing snapshot. |

Migration (forward-only, Goose):

```sql
ALTER TABLE public."order" ADD COLUMN billing_address jsonb;
COMMENT ON COLUMN public."order".billing_address IS
  'Immutable billing snapshot at placement. NULL means "same as the shipping (delivery_address)". A value is a divergent billing address; a later address edit/delete never changes it. NEVER exposed to the shop (023 FR-018).';
```

No backfill: existing orders keep `billing_address = NULL`, which correctly reads as "billing same as
shipping" — the true historical state (billing did not exist as a distinct concept). No index (billing is
read only with its order row, never queried on).

---

## Invariants

### Added by 023

- **Billing defaults to shipping (FR-009).** At placement, `billing_address` is written **only** when the
  customer diverged (toggle OFF + a chosen billing address that differs from shipping); otherwise `NULL`.
- **Billing is immutable (FR-014/FR-015).** Like `delivery_address`, the billing snapshot is a
  point-in-time jsonb copy with **no FK** to `customer_address`. Editing/deleting the saved address never
  touches it.
- **Receipt resolution (FR-016).** Billing shown = `COALESCE(billing_address, delivery_address)`; the
  "same as shipping" label is exactly `billing_address IS NULL`.

### Already true (reused, no change)

- **Shipping snapshot + immutability (019).** `delivery_address` is snapshotted from the chosen
  `customer_address` at intent/placement and never mutated.
- **Ownership scoping (019/022).** Every checkout/order query is customer-scoped from the authenticated
  subject.

---

## The shop boundary (FR-018) — enforced by structure

`billing_address` is a **separate column**. The shop fulfilment repository
(`apis/edge-api/shop/src/fulfillments/repository.ts`) selects **only** `o.delivery_address` from the order
and maps it to `delivery`. Because billing is never in a shop `SELECT` list and never in a shop DTO, it is
**structurally unreachable** by any shop/operator surface — no runtime redaction needed (R3). A guard test
asserts no shop-side SQL or DTO names `billing`.

---

## Snapshot shape (unchanged)

Both `delivery_address` and `billing_address` use the **same** jsonb address shape already snapshotted by
019 (recipient, line1, line2, city, region, postalCode, country — the fields `OrderAddressDTO` exposes).
Billing reuses the shape verbatim; there is no billing-specific field.

---

## Contracts touched

- **DTOs** (`packages/shared-types/src/`):
  - `order.ts` — `OrderDTO` gains `billingAddress?: OrderAddressDTO | null` (null → "same as shipping").
    `OrderAddressDTO` is reused as-is for both.
  - `checkout.ts` — `CreateCheckoutIntentRequest` gains `billingAddressId?: string | null` (absent/null →
    billing same as shipping).
  - Regenerated to Kotlin (`contract/CommerceDto.kt`) via `commerce-contract:gen`.
- **No new problem type**; existing checkout/order error envelopes cover an invalid billing id (validation
  400, same as the shipping address id).

See [contracts/checkout-addresses.contract.md](./contracts/checkout-addresses.contract.md).

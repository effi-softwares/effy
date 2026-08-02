# Phase 1 Data Model: Customer Account Centre

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Research**: [research.md](research.md)

One forward-only Goose migration. Two changes to `public.customer`, one new table, no drops.

---

## Design rule that governs the whole model

**Closure is not a third value of `public.customer.status`.**

`status` is `'active' | 'barred'` and it is a **platform sanction**. `apis/edge-api/customer/src/customer/repo.ts:17-39`
carries a standing warning that `status` must never enter the JIT upsert's `ON CONFLICT DO UPDATE`
clause, because that would let a barred customer un-bar themselves simply by signing in. Its entire
safety property is that **the customer cannot influence it**.

Closure is the opposite: it is **the shopper's own decision**. Collapsing the two would

- put a shopper-driven value on a column whose safety depends on being shopper-proof,
- make FR-049 (barred **and** requesting closure) literally unrepresentable, and
- lose the requested-at moment that the grace window, the FR-040 disclosure and the erasure job all
  depend on.

So closure gets its own column for the fast path and its own table for the facts.

**And it is deliberately NOT a `deleted_at` on `public.customer`.** That pattern was rejected in this
codebase before — `20260802052141_customer_saved_items.sql:66` records the reason: *"a `deleted_at`
column would put a predicate on every read that someone will eventually forget."* Closure is checked at
**one** place, the same gate that already checks `barred`, not scattered across every query.

---

## `public.customer` — two added columns

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `phone` | `text` | ✅ | `NULL` | **New (FR-060).** Self-asserted, **never verified** by this feature |
| `closure_state` | `text` | ❌ | `'open'` | **New.** `CHECK (closure_state IN ('open','closing'))` |

### `phone`

- **Nullable and unverified.** FR-060a bars any verified indicator and bars its use in any identity or
  recovery path. There is deliberately **no** `phone_verified` column: adding one would invite exactly
  the tick FR-060a forbids, and a column whose only honest value is `false` is a trap for the next
  feature.
- **Distinct from `public.customer_address.phone`** (FR-060b). The address phone is what a driver calls;
  this is a convenience default. Nothing in this feature copies one into the other.
- **Cleared with `""`, stored as `NULL`.** The mobile client serialises with `explicitNulls = false`, so
  a null is dropped from the payload entirely and a clear would silently no-op. `customer-me-v1-patch.ts:111-119`
  already maps `""` → `NULL` for the name parts; `phone` follows the identical path or it will not be
  clearable.
- **Validation is deliberately loose.** Stored as entered, trimmed. Effy serves one market today but a
  strict format check is a support burden that buys nothing while the value is unverified and
  non-authoritative.

### `closure_state`

Only two values, because only two are real:

- `'open'` — the normal state.
- `'closing'` — closure requested; the grace window is running.

There is **no** `'closed'` value, and that absence is deliberate. The moment erasure completes, the row
is **gone** — a terminal `'closed'` state would be a row that must then be excluded from every read
forever, which is the `deleted_at` trap under a different name.

**⚠ `closure_state` MUST NOT enter the JIT upsert's `ON CONFLICT DO UPDATE` clause**, for exactly the
reason `status` must not: sign-in would silently reset it, and the restore-on-login behaviour must be a
deliberate, auditable write — never a side effect of authenticating.

---

## `public.customer_closure_request` — new table

One row per closure request. Retained after the request resolves, because "did this person ask to be
deleted, when, and what proved it?" is a question the platform must be able to answer after the fact.

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `uuid` PK | ❌ | |
| `customer_id` | `uuid` FK → `public.customer(id)` | ❌ | `ON DELETE CASCADE` |
| `requested_at` | `timestamptz` | ❌ | The grace window is measured from here |
| `erase_after` | `timestamptz` | ❌ | **Stored, not computed.** See below |
| `verification_method` | `text` | ❌ | What proved control — `CHECK (... IN ('email_code'))` today |
| `cancelled_at` | `timestamptz` | ✅ | Set when the shopper signs back in during the window |
| `cancelled_reason` | `text` | ✅ | `'signed_in'` today |
| `created_at` / `updated_at` | `timestamptz` | ❌ | |

**Partial unique index**: `UNIQUE (customer_id) WHERE cancelled_at IS NULL` — a customer may have at
most one live closure request, so a double submission cannot create two windows with two different
erase dates. Making that unrepresentable in the schema is cheaper than defending it in the service.

### Why `erase_after` is stored rather than derived

`requested_at + 30 days` is trivially computable, so storing it looks redundant. It is not:

- **The shopper is TOLD this date** (FR-040), and SC-010 requires every claim in that disclosure to be
  true of the built system. If the window length is ever changed, a derived date would **retroactively
  move the deadline for people who were already told a different one**.
- The erasure job (a later slice) needs a single indexable column to select on. Deriving it puts a
  function on the left of every comparison.

The stored value is the promise made. That is exactly the kind of fact that should not be recomputed.

---

## Blocking-order predicate (FR-042) — read-only, no new storage

The blocker reads `public."order"` directly (research R2, recorded as a Principle III exception). **No
column is added to any order table, and no order data is copied into the account domain.**

An order blocks closure when **either**:

| Condition | Why it blocks | How it clears |
|---|---|---|
| `status = 'pending_payment'` | Checkout started, money not taken | The shopper completes or abandons it — **in-app, by them** |
| `status = 'paid'` **AND** not every `shop_fulfillment` terminal **AND** `created_at > now() - interval '7 days'` | Goods plausibly in transit | Fulfilment completing, **or** 7 days — whichever comes first |

**⚠ The bound is load-bearing, and its SIZE is load-bearing too.** Research R1 established that a
fulfilment's terminal state is unreachable in production, so without a bound every shopper who ever paid
would be permanently undeletable. But the bound first chosen was **30 days, matched to the grace period
— and that was a second dead end.** Effy is a **weekly-re-buy grocery platform**: a shopper buying every
week is always within 30 days of an order, so the platform's most engaged customers could still never
delete. The two windows answer different questions and **must not share a number**:

| Window | Question it answers | Length |
|---|---|---|
| Grace period | "How long may they change their mind?" | 30 days |
| Order block | "How long might goods still be in transit?" | **7 days** |

The fulfilment term is included **even though it cannot yet be satisfied in production**, so that the
block becomes correct automatically when the delivery lifecycle lands, rather than needing to be found
and rewritten then.

`failed` and `canceled` orders never block. **Balances and refunds are not modelled and MUST NOT be
named** (FR-042a).

The predicate returns, per blocking order, the facts FR-042 requires: which order, a route to it, and
when it clears. A boolean cannot carry that, which is why it is shaped as a list rather than a flag.

---

## State transitions

```text
                    ┌──────────────────────────────────────────┐
                    │                                          │
                    ▼                                          │
              closure_state = 'open'                           │
                    │                                          │
                    │  request closure                         │  sign in during window
                    │  (blockers clear + fresh code verified)   │  → cancelled_at set
                    ▼                                          │
              closure_state = 'closing'  ────────────────────────┘
              + customer_closure_request row
              + all sessions revoked
                    │
                    │  erase_after passes
                    ▼
              ⚠ ROW DELETED — by the erasure slice, NOT by this feature
```

**The final transition is out of scope** (FR-041). Until it is built, a `'closing'` customer stays
`'closing'` forever, which is why store submission is blocked (SC-011).

---

## Enforcement points

Closure is checked in **one** place, alongside the existing barred gate — `customer/service.ts:33`,
where `if (row.status !== "active") throw new CustomerBarredError()` already lives.

### ⚠ The restore path runs through the same function, and the ORDER decides whether it works

`customer/service.ts` already carries a comment noting that the record is **upserted first and the ban
checked only after** — that ordering is load-bearing and this feature adds a second thing that depends
on it. The refusal and the restore both pass through `getOrCreateCustomer`, so a naive "throw when
`closing`" would refuse the very request that is supposed to restore.

**Decision**: restore is **not** inferred from an ordinary authenticated read. The sequence is:

1. Upsert the record (unchanged).
2. **If `closure_state = 'closing'` and this is an explicit restore call**, cancel the request and set
   `closure_state = 'open'`, then continue as normal.
3. Otherwise, if `closure_state = 'closing'`, refuse.

Making restore an **explicit call** rather than a side effect of any authenticated read is what FR-041a
requires, and it is what keeps FR-041's "refused everywhere" true for every *other* request. A shopper
whose token is stolen during the grace window must not silently un-delete their account merely because
the thief opened the app.

| Path | Behaviour when `closure_state = 'closing'` |
|---|---|
| `GET /customer/v1/me`, `PATCH /customer/v1/me` | Refused |
| Addresses, password, all account reads | Refused |
| `DELETE /customer/v1/sessions` | **Allowed** — mirrors `customer-sessions-v1-delete.ts:24`, which already lets a barred customer sign out |
| The restore path | **Allowed** — it is the only way out of the window |
| Hot path (cart, checkout, orders) | ⚠ **Must also refuse.** `customeridentity` enforces the barred gate on the hot path; closure must land in the same predicate or a closed customer could still place an order |

**⚠ That last row is the easiest thing in this feature to get wrong.** The refusal is implemented on the
cold path where the account screens live, and the hot path has its own, separate gate in
`platform/customeridentity`. A closure enforced only on the cold path would leave a "deleted" shopper
able to shop.

### Barred **and** closing (FR-049)

A barred customer **may** request closure. Barring protects the platform *from* the customer; it is not
a mechanism for holding their data against their wishes, and refusing would let a platform sanction
silently override a data right. The uniform 403 therefore gains a deliberate carve-out on the closure
path only — the same shape as the existing sign-out carve-out.

---

## Shared contract changes (`packages/shared-types/src/customer.ts`)

`CustomerDTO` gains `phone: string | null` and `closureState`. `UpdateCustomerDTO` gains `phone`
alongside the two name parts.

**⚠ `UpdateCustomerDTO` is deliberately narrow** and documented as such at `customer.ts:69-76` — `email`,
`status` and `hasPassword` are absent because they are not customer-writable. `phone` is being added to
a type whose whole point is that it lists what a customer may change, so the addition is correct — but
`closureState` must **not** be added to it. It is written by the closure endpoint, never by a profile
patch.

New DTOs for the closure flow are defined in
[contracts/account-center.contract.md](contracts/account-center.contract.md).

**⚠ Each new type must be referenced from the aggregator the Kotlin generator walks**, or it generates
zero times and the drift check passes trivially — the trap feature 033 recorded as R17.

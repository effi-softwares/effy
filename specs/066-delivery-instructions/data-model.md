# Data Model: Customer Delivery Instructions

One additive, forward-only migration `<ts>_delivery_instructions.sql`. No new table, no index, no
backfill.

## `public."order"` — two columns

| Column | Type | Null | Constraint |
|---|---|---|---|
| `delivery_handover` | `text` | yes | `IN ('leave_at_door', 'meet_at_door')` |
| `delivery_note` | `text` | yes | `char_length(delivery_note) <= 250 AND btrim(delivery_note) <> ''` |

- **Written by**: checkout, at payment intent, on the pending order (research R2). Rewritten by each
  intent until the order is paid. **No writer exists after payment.**
- **NULL means**: the customer gave none — including every order placed before 066. Readers show
  nothing; there is no default text.
- **Deliberately not inside `delivery_address`** (research R1).

## `public.customer_address` — two columns

| Column | Type | Null | Constraint |
|---|---|---|---|
| `default_delivery_handover` | `text` | yes | same set |
| `default_delivery_note` | `text` | yes | same length and non-blank rule |

- **Written by**: the address book (cold path), on create and update. Update reads the presence of
  each key, so a value can be cleared.
- **Read by**: the address list, to prefill checkout. **Never read by checkout on the server.**

## Value object: delivery instructions

`{ handover: HandoverPreference | null, note: string | null }` — either, both or neither.

**Normalisation** (one rule, three implementations pinned together — research R3):

1. Strip control characters except line breaks; collapse whitespace runs; trim.
2. Empty → `null`.
3. More than 250 Unicode code points → refused, never truncated.
4. Handover outside the closed set → refused.

A value with both parts `null` is "no instructions" and is stored as NULL/NULL.

## Lifecycle

```text
address default ──(prefill, client only)──▶ checkout draft ──(intent)──▶ pending order
                                                  │                         │ rewritten by each intent
                                                  └─(explicit "save")──▶ address default
                                                                            ▼
                                                                       paid order  (immutable)
```

## Who may read the order's instructions

| Reader | Path | Allowed |
|---|---|---|
| The customer who placed it | hot path receipt read | yes |
| The driver assigned to the drop | cold path drop read, driver-scoped | yes |
| Back-office staff who can view the order | cold path order detail | yes |
| Shop staff | any | **no** — guard test |
| Emails | notifications | **no** — guard test |
| Analytics, logs | any | **no** |

## Invariants

1. A paid order's instructions never change.
2. Editing or deleting an address changes no order.
3. NULL is rendered as nothing, never as a default sentence.
4. The note is never longer than 250 characters in the database, whatever the client did.
5. Neither column is selected by any shop-pool or email code path.

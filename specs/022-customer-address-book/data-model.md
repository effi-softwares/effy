# Data Model: Customer Address Book (022)

**Date**: 2026-07-22 · **Feeds**: [plan.md](./plan.md) · **Decisions**: [research.md](./research.md)

**No migration. No schema change.** The address model exists (019); this slice manages it and adds one
server-side *behaviour* (the delete-default guard), not a column.

---

## Existing entity (unchanged) — `public.customer_address`

From 019 (`db/migrations/20260719120000_customer_commerce.sql`). Reproduced for reference; **not
modified**:

| Column | Notes |
|---|---|
| `id` uuid PK | |
| `customer_id` uuid FK → customer, `ON DELETE CASCADE` | ownership |
| `label` text (nullable) | the address label — **the chips (Home/Work/Other) write here** (R5); free text underneath |
| `recipient_name` text NOT NULL | |
| `phone` text (nullable) | optional delivery contact |
| `line1` text NOT NULL, `line2` text | |
| `city` text NOT NULL, `region` text, `postal_code` text NOT NULL | |
| `country` char(2) NOT NULL DEFAULT 'AU' | |
| `is_default` boolean NOT NULL DEFAULT false | **exactly one true per customer — already server-enforced (below)** |
| `created_at`, `updated_at` timestamptz | |

Partial unique index on `(customer_id) WHERE is_default` (019) already guarantees at most one default per
customer at the database level.

---

## Invariants (what is already true vs. what 022 adds)

### Already server-enforced (019 — verified in code, no change)

- **Exactly one default on add/set-default.** `Repository.Create` and `Repository.Update` use a CTE that,
  when `makeDefault` (or when it is the customer's first address), sets `is_default=false` on all the
  customer's other addresses in the same statement, then writes the new/updated row as default. The
  partial unique index backs it. → FR-010, FR-012, FR-014, SC-003 hold today.
- **Ownership scoping.** Every query is `WHERE customer_id = $resolved` from the authenticated subject,
  never client input. → FR-020, SC-005.

### Added by 022 — the delete-default guard (R3)

The one new rule, **server-side**, in the cold-path `edge-api/customer` addresses `repo.remove` (022
moved address management to the cold path per the routing law):

> A `DELETE` of the customer's **default** address is refused **while they have other addresses**
> (→ 409 conflict). Deleting the default when it is the **only** address is allowed.

Mechanism (one guarded statement, no read-modify-write race):

```sql
DELETE FROM public.customer_address
 WHERE id = $1 AND customer_id = $2
   AND NOT (
     is_default
     AND (SELECT count(*) FROM public.customer_address WHERE customer_id = $2) > 1
   );
```

Interpreting the result (implemented as a single CTE returning `existed`/`deleted` counts):
- **existed=1, deleted=1** → deleted (allowed case).
- **existed=1, deleted=0** → the default-with-others block → **409** (`DefaultDeleteBlockedError`).
- **existed=0** → not-found → **404** (`AddressNotFoundError`).

The same race-free CTE is used identically in core-api and edge — the guard moved verbatim when
address management moved to the cold path.

→ FR-016a, SC-010. And FR-016 (deleting an address never touches a past order's snapshot) holds because
an order's `delivery_address` is its own immutable jsonb copy — the FK is only to `customer` (cascade),
and orders carry no FK to `customer_address`.

---

## The label chips → free-text mapping (R5, presentation only)

No data change. The add/edit form offers **Home / Work / Other** chips:
- Home / Work → store the literal string `"Home"` / `"Work"` in `label`.
- Other → reveal a free-text field; store whatever the customer types.
- No chip selected → `label` stays null (optional).

On **read**, a stored label of exactly `Home`/`Work` re-selects that chip; anything else selects **Other**
with the value in the text field. Purely UI; the wire and column are the existing free-text `label`.

---

## Contracts touched

- **DTOs**: none added — `AddressDTO`, `CreateAddressRequest`, `UpdateAddressRequest` (all with
  `label`/`phone`/`makeDefault`) already exist in `shared-types/src/address.ts` and generate to Kotlin.
- **Error**: the delete endpoint gains a **409** for the blocked-default case (distinct from 404). Clients
  already have a conflict-mapping path (020/021); the address book maps it to the "set another default
  first" prompt.

See [contracts/address-book-api.contract.md](./contracts/address-book-api.contract.md).

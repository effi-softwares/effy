# Data Model: Customer Lists

**Spec**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Research**: [research.md](research.md)

One forward migration, created by `make db-new name=customer_lists`. House style as 033: `text`
CHECKs, no triggers, an index on every foreign key, `COMMENT ON` everything.

## Migration summary

| Direction | Statement |
|---|---|
| Up | `ALTER TABLE public.customer_saved_item` — **no column change**; `COMMENT ON` rewritten to its new meaning |
| Up | `CREATE TABLE public.customer_list` |
| Up | `CREATE TABLE public.customer_list_entry` |
| Up | backfill: one default list per customer with saved items; one default entry per saved item |
| Down | drop both new tables. Named lists are lost; every saved product and its price survive |

The backfill is two idempotent `INSERT … SELECT … ON CONFLICT DO NOTHING` statements. The second
one is also the repair for the deploy window (research R10).

## `public.customer_saved_item` (unchanged columns, new meaning)

Was: the shopper's one saved list. Is: **the set of products the shopper has saved, in any list**.

| Column | Meaning now |
|---|---|
| `(customer_id, product_id)` PK | what the heart reports and what the 200 cap counts |
| `saved_price_amount`, `saved_currency` | the price at first save; shared by every list (FR-031) |
| `saved_at` | when the product was first saved. **No longer a list position** |

`customer_saved_item_customer_idx (customer_id, saved_at DESC)` stops serving an ordered read and
is kept: dropping an index is a separate decision and the membership read still sorts by it.

## `public.customer_list`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | |
| `customer_id` | `uuid NOT NULL` | → `public.customer(id) ON DELETE CASCADE` |
| `is_default` | `boolean NOT NULL DEFAULT false` | |
| `name` | `text` | `NULL` for the default list; the shopper's text otherwise |
| `created_at`, `updated_at` | `timestamptz NOT NULL DEFAULT now()` | `created_at` orders the lists (default first, then oldest first) |

**Constraints and indexes**

| Name | Definition | Carries |
|---|---|---|
| `customer_list_name_ck` | `(is_default AND name IS NULL) OR (NOT is_default AND char_length(name) BETWEEN 1 AND 40 AND name = btrim(name))` | FR-002 length as a backstop; "the default has no name" |
| `customer_list_default_uq` | `UNIQUE (customer_id) WHERE is_default` | exactly one default (FR-003); makes `ensureDefaultSQL` idempotent |
| `customer_list_name_uq` | `UNIQUE (customer_id, lower(name)) WHERE NOT is_default` | FR-002 uniqueness — **the only mechanism** (research R3) |
| `customer_list_owner_uq` | `UNIQUE (id, customer_id)` | target of the entry's composite foreign key |

`customer_list_name_uq` leads with `customer_id`, so it also serves the "all my lists" read and
the foreign key.

**Not stored**: a count (derived per read; at most 21 lists × 200 products), a manual sort order
(out of scope), soft delete.

## `public.customer_list_entry`

| Column | Type | Notes |
|---|---|---|
| `list_id` | `uuid NOT NULL` | |
| `product_id` | `uuid NOT NULL` | |
| `customer_id` | `uuid NOT NULL` | denormalised on purpose; see the two foreign keys |
| `added_at` | `timestamptz NOT NULL DEFAULT now()` | position in this list; **writable**, for undo (FR-024), as 033's `saved_at` was |

**Primary key**: `(list_id, product_id)` — a product is in a list at most once (FR-011), and
adding is `ON CONFLICT DO NOTHING` (FR-016).

**Foreign keys**

| Columns | References | On delete | What it makes unrepresentable |
|---|---|---|---|
| `(list_id, customer_id)` | `customer_list (id, customer_id)` | CASCADE | an entry in someone else's list (FR-008, SC-010) |
| `(customer_id, product_id)` | `customer_saved_item (customer_id, product_id)` | CASCADE | an entry for a product that is not saved |

Deleting a list removes its entries. Deleting a saved-product row (the heart's un-save, a
hard-deleted product, an old core-api build) removes every entry for it.

**Indexes**: `customer_list_entry_list_idx (list_id, added_at DESC)` — the ordered list read;
`customer_list_entry_saved_idx (customer_id, product_id)` — the second foreign key, the chooser's
"which lists hold this product", and `namedProductIds`.

## The invariant

> A row exists in `customer_saved_item` **if and only if** the product is in at least one of that
> customer's lists.

| Direction | Enforced by |
|---|---|
| entry ⇒ saved product | the composite foreign key |
| saved product ⇒ entry | one statement, run in the same transaction as any entry or list removal: |

```sql
-- sweepOrphansSQL
DELETE FROM public.customer_saved_item s
WHERE s.customer_id = $1
  AND NOT EXISTS (SELECT 1 FROM public.customer_list_entry e
                  WHERE e.customer_id = s.customer_id AND e.product_id = s.product_id)
```

Every writer takes `lockCustomerSQL` first, so writes for one customer are serial and no reader
of a committed state sees an orphan. A container test asserts zero orphans after every write path.

## Write paths

All inside one transaction, under the per-customer advisory lock.

| Operation | Statements |
|---|---|
| Save (heart) | ensure default → cap check unless already saved → insert saved row (`ON CONFLICT DO NOTHING`) → insert default entry |
| Un-save (heart) | if any named-list entry exists → refuse `in_named_lists`; else delete saved row (entries cascade) |
| Add to list | list exists for this customer, else `list_not_found` → cap check unless already saved → insert saved row → insert entry |
| Remove from list | delete entry → sweep |
| Create list | count named lists < 20, else `list_limit` → insert (unique violation → `name_taken`) → optional add-to-list |
| Rename | update name (unique violation → `name_taken`; default → `default_list`) |
| Delete list | delete list (entries cascade; default → `default_list`) → sweep |
| Merge | ensure default → existing per-item loop → default entry per item |

## Derived, never stored

| Value | Derivation |
|---|---|
| `count` per list | `count(*)` of its entries |
| `onlyHereCount` per list | entries whose product has no entry in another list (FR-006) |
| `containsProduct` | `EXISTS` entry for (list, product) |
| `namedProductIds` | distinct `product_id` of entries in non-default lists |
| verdict, `priceDropped` | unchanged from 033/054, in the one `listSQL` |

## Device-held state

| Surface | Change |
|---|---|
| customer-web `effy:saved:v1` | envelope gains optional `namedIds: string[]`. **Version stays 1** (research R5) |
| customer-mobile `SavedStore` | gains an in-memory `named` set beside `saved`; nothing new on disk. The guest list is unchanged |

A guest has no named lists, so nothing about lists is persisted for a guest on either surface.

## Validation rules

| Rule | Where | Refusal |
|---|---|---|
| name 1–40 code points after normalising | service; CHECK as backstop | `422 invalid_name` |
| name is not "Saved" (any case) | service | `409 name_taken` |
| name unique per customer, ignoring case | unique index | `409 name_taken` |
| ≤ 20 named lists | in the transaction | `422 list_limit` |
| ≤ 200 saved products | in the transaction (unchanged) | `422 cap_reached` |
| default list cannot be renamed or deleted | service | `422 default_list` |
| list belongs to the caller | every statement is keyed by `customer_id` from the resolved identity | `404 list_not_found` |
| heart un-save of a product in a named list | in the transaction | `409 in_named_lists` |

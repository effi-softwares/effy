# Data Model: Shop Naming Unification

**Feature**: 008-shop-naming-unification | **Plan**: [plan.md](plan.md) | **Research**: [research.md](research.md) R1

**No entity, field, relationship, constraint, or state transition changes.** Every column keeps its type,
nullability, default, and comment semantics. This document is a **rename map** and a migration strategy,
nothing more. The authoritative description of what these tables *mean* lives in
`specs/007-shop-web/data-model.md` (which this feature reconciles) and in the migration's own comments.

---

## Identifier rename map

### Tables (schema `public`, unchanged)

| Before | After |
|---|---|
| `public.store` | `public.shop` |
| `public.store_staff` | `public.shop_staff` |
| `public.store_role` | `public.shop_role` |
| `public.store_staff_role` | `public.shop_staff_role` |

### Columns

| Before | After | Note |
|---|---|---|
| `store_staff.store_id` | `shop_staff.shop_id` | FK → `public.shop(id)`, `ON DELETE RESTRICT` — unchanged |

Every other column (`id`, `code`, `name`, `is_active`, `cognito_sub`, `email`, `status`, `created_at`,
`updated_at`, `last_seen_at`, `key`, `description`, `staff_id`, `role_key`, `granted_at`) is already
audience-neutral and is **not touched**.

### Indexes

| Before | After |
|---|---|
| `store_staff_store_id_idx` | `shop_staff_shop_id_idx` |
| `store_staff_role_role_key_idx` | `shop_staff_role_role_key_idx` |

### Seeded role keys — the values, not just the identifiers

`shop_role` is a seeded lookup table, so its **rows** carry the retired word. This is the one place where
a rename changes *data* rather than *schema*, and it is the row that must stay byte-identical to the
Cognito group name (SC-007).

| Before | After |
|---|---|
| `store_role.key = 'store_manager'` | `shop_role.key = 'shop_manager'` |
| `store_role.key = 'store_staff'` | `shop_role.key = 'shop_staff'` |

The `CHECK (key IN (…))` constraint on the primary key is rewritten to admit exactly the two new values.

> **Note on the `shop_staff` collision.** The table `public.shop_staff` and the role key `'shop_staff'`
> share a spelling. This is not new — `store_staff` collided with `'store_staff'` identically — and it is
> harmless: one is a relation name, the other a text value in a `key` column. The migration's existing
> comment explaining *why* the role names are prefixed ("keeps `manager` unambiguously the back-office
> role in logs and JWT dumps") still holds, and is preserved verbatim with the noun swapped.

### Comments

All `COMMENT ON TABLE` / `COMMENT ON COLUMN` bodies are rewritten so their prose matches the new names.
Two carry substantive design rationale that must survive intact, with only the noun changed:

- `shop_staff.email` — *"NULLABLE by design: the shop pool uses email-as-username, so an access token may
  carry no email claim."*
- `shop_staff.shop_id` — *"NULLABLE by design: the JIT upsert meets an operator before their shop is
  known. NULL = unassigned, an expected state that grants nothing privileged. Platform-owned — never
  written from token data."*

---

## Migration strategy

### Strategy A — in place (the default)

**Precondition, blocking**: `make db-status ENV=dev` reports `20260710050004` as **Pending**.

1. `git mv db/migrations/20260710050004_store_staff_rbac.sql db/migrations/20260710050004_shop_staff_rbac.sql`
2. Rewrite the file's body against the map above — DDL, seeds, comments, and the `-- +goose Down` block.
3. The version integer `20260710050004` is **unchanged**. Goose identifies migrations by that integer, not
   by the filename suffix, so nothing about its applied/pending bookkeeping shifts.

The migration remains one `Up` (create four tables, two indexes, seed two rows) and one dev-only `Down`
(drop in FK-safe order). Its shape does not change; only the names inside it do.

**Why this is legitimate**: no database anywhere has executed this file. Editing it is indistinguishable,
from every environment's point of view, from having authored it correctly the first time. See
[research.md](research.md) R1 for the full argument and the constitution's position.

### Strategy B — forward rename migration (the mandatory fallback)

**Trigger**: the precondition fails — `20260710050004` reports as applied in any environment.

Then the file is left exactly as committed, and a **new** migration is authored. Its content is fully
determined by the map above, so it is written out here rather than improvised at cutover:

```
-- +goose Up
ALTER TABLE public.store            RENAME TO shop;
ALTER TABLE public.store_staff      RENAME TO shop_staff;
ALTER TABLE public.store_role       RENAME TO shop_role;
ALTER TABLE public.store_staff_role RENAME TO shop_staff_role;

ALTER TABLE public.shop_staff RENAME COLUMN store_id TO shop_id;

ALTER INDEX public.store_staff_store_id_idx      RENAME TO shop_staff_shop_id_idx;
ALTER INDEX public.store_staff_role_role_key_idx RENAME TO shop_staff_role_role_key_idx;

-- The CHECK constraint admits only the old literals, so it must be replaced BEFORE
-- the seeded rows are updated, or the UPDATE violates it.
ALTER TABLE public.shop_role DROP CONSTRAINT store_role_key_check;
ALTER TABLE public.shop_role ADD  CONSTRAINT shop_role_key_check
    CHECK (key IN ('shop_manager', 'shop_staff'));

-- role_key is an FK to shop_role(key); update the parent first, and let the FK cascade
-- carry the children only if it was declared ON UPDATE CASCADE. It was NOT — so both
-- sides are updated explicitly, parent first, inside the migration's transaction.
UPDATE public.shop_role       SET key      = 'shop_manager' WHERE key      = 'store_manager';
UPDATE public.shop_role       SET key      = 'shop_staff'   WHERE key      = 'store_staff';
UPDATE public.shop_staff_role SET role_key = 'shop_manager' WHERE role_key = 'store_manager';
UPDATE public.shop_staff_role SET role_key = 'shop_staff'   WHERE role_key = 'store_staff';

-- Comments are re-applied (RENAME preserves them, but their prose names the old noun).
-- …COMMENT ON TABLE/COLUMN statements per the map above…
```

**The trap in Strategy B**, recorded so it is not rediscovered under pressure: `shop_staff_role.role_key`
is a foreign key to `shop_role(key)` declared **without** `ON UPDATE CASCADE`. Updating the parent key
before the children exist as valid references will fail the constraint. The ordering above — drop the
CHECK, update the parent, update the children, all inside Goose's single transaction — is the only order
that holds. A `SET CONSTRAINTS ALL DEFERRED` alternative does not apply, because the FK is not declared
`DEFERRABLE`.

Strategy B also requires the operator to have already renamed the Cognito groups (research R4), because
between the `UPDATE` and the service redeploy, a token asserting `store_manager` would find no matching
`shop_role` row and the gate would fail closed — correctly, but confusingly.

---

## What is deliberately unchanged

- **`admin` schema** — `admin.staff`, `admin.role`, `admin.staff_role`, `admin.staff.name`. The
  back-office audience is untouched.
- **`goose_db_version`** — the version integer `20260710050004` is preserved. `apis/core-api`'s
  platform-status repository queries this table and is unaffected.
- **The three preceding migrations** — `20260705095817`, `20260708140000`, `20260708150000`. None
  references the shop audience.
- **Row semantics** — the gate is still the conjunction of three terms, each owned by a different place:
  `role` (origin: the `cognito:groups` claim), `status` (platform-owned), and `shop` scope
  (platform-owned). Renaming `store_id` to `shop_id` does not move that ownership.
- **`public.shop` ships empty and stays empty.** 007's FR-019 holds: no shop-creation path exists in any
  slice yet. This feature adds none. The first row appears when the back-office shop-management slice
  ships.

## Consequences for the repository layer

`apis/edge-api/shop/src/staff/repository.ts` embeds the table names as raw SQL string literals (Principle
VI: raw SQL, no ORM). Three statements reference `public.store_staff` and `public.store_staff_role`
directly. Because the names live in strings rather than in types, **the TypeScript compiler cannot catch a
miss here** — this is the one surface in the whole feature where `pnpm typecheck` provides no safety net.

Coverage comes from the 39 tests in that package (which assert the emitted SQL) and, finally, from
`make shop-verify-gate` running the real join against the real database. Both are listed as blocking in
the [cutover contract](contracts/cutover.contract.md).

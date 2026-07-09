# Contract — Back-Office Staff & RBAC Schema (`admin` schema, NEW)

**Feature**: 005 (FR-019/021/022) · **Area**: `db/migrations` (003 workflow) + `apis/edge-api/admin`
`staff` domain · **Status**: to build this slice.

The platform's own system of record for back-office staff + roles — the first real tables beyond
the 003 baseline shell, in the constitutionally-designated `admin` schema ("back-office accounts +
audit"). Normalized RBAC. Forward-only (003 discipline). See
[data-model.md §6](../data-model.md) for the full DDL.

## Tables

| Table | Purpose | Key columns |
|---|---|---|
| `admin.staff` | one row per staff member | `id uuid pk`, `cognito_sub text unique` (JIT join key), `email text`, `status ∈ {active,disabled}` (platform-owned), `created_at`/`updated_at`/`last_seen_at` |
| `admin.role` | role lookup (seeded) | `key ∈ {admin,manager,csa} pk`, `description` |
| `admin.staff_role` | role assignments (m:n) | `staff_id → staff(id) cascade`, `role_key → role(key)`, `granted_at`, `pk(staff_id,role_key)` |

- The migration **seeds** the three `admin.role` rows idempotently (`ON CONFLICT DO NOTHING`).
- `email` is **account data** — persisted, but **never logged or telemetried** (Principle VII).

## Repository operations (`apis/edge-api/admin/src/staff/`, raw SQL, no ORM)

- **`upsertOnContact(sub, email, tokenGroups)`** — the JIT provisioning call (from `/me`):
  ```sql
  INSERT INTO admin.staff (cognito_sub, email)
  VALUES ($1, $2)
  ON CONFLICT (cognito_sub)
    DO UPDATE SET email = EXCLUDED.email, last_seen_at = now(), updated_at = now()
  RETURNING id, cognito_sub, email, status, last_seen_at;
  ```
  then reconcile `admin.staff_role` to `tokenGroups` (delete rows not in the set, insert missing)
  in the **same transaction**. Idempotent under concurrent first contact (unique `cognito_sub` +
  `ON CONFLICT`).
- **`getRecord(sub)`** → `StaffRecord | null` (join `staff` + `staff_role`).
- **`authorizeAdmin(sub)`** → boolean: `status='active'` AND EXISTS `staff_role role_key='admin'`.
  A single SQL read; a `disabled` or non-admin or absent record → false → the caller `forbidden`s.

## Domain type + mapping (`staff/types.ts`)

```
StaffRecord = { subject: string; email: string; roles: BackOfficeRole[]; status: 'active'|'disabled' }
```
Rows are mapped explicitly to `StaffRecord`; DB row shapes never leak past the repository
(Principle VI). Unknown `role_key` values (shouldn't occur behind the FK) are filtered defensively.

## Migration & tests

- Created via `make db-new NAME=back_office_staff_rbac` (003), authored SQL-only, **forward-only**
  (dev-only single-step down permitted per 003). This is the **first real `db-up`** — an open 003
  operator item this slice closes.
- `staff/repository.test.ts` (testcontainers/local PG, gated like 004): upsert creates once;
  second call updates + no duplicate; role reconcile adds/removes; `authorizeAdmin` true for
  active-admin, false for disabled-admin / manager / csa / absent.

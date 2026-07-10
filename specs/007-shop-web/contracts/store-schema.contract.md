# Contract — Store staff/RBAC schema (`public`, NEW)

**Feature**: 007 (FR-019–FR-022) · **Owner**: `db/migrations/` (Goose, forward-only) ·
**Status**: to build this slice.

The platform's **first customer-operational (`public`) tables**. Everything to date lives in
`admin`. Full column/constraint detail is in [data-model.md](../data-model.md); this file is the
binding contract between the migration, the `store` service's repository, and the operator's
provisioning commands.

## Data area

`public` — the customer-operational schema. **Not** `admin`, whose designated purpose is
back-office accounts + audit (`db/migrations/20260705095817_baseline_admin_schema.sql`). A store is
an operational entity every future slice (inventory, picking, orders) joins against; store staff
follow their store.

## Objects created

| Object | Purpose |
|---|---|
| `public.store` | minimal fulfillment-node identity: `id`, `code` UNIQUE, `name`, `is_active` |
| `public.store_staff` | platform's own operator record: `cognito_sub` UNIQUE, `email` NULL, `name` NULL, `status`, `store_id` NULL FK, timestamps, `last_seen_at` |
| `public.store_role` | `key` PK ∈ (`store_manager`, `store_staff`) + `description`; **seeded with both rows** |
| `public.store_staff_role` | m:n; PK `(staff_id, role_key)`; `staff_id` FK ON DELETE CASCADE |

`store_staff.store_id` → `public.store(id)` **ON DELETE RESTRICT** (never orphan staff by deleting a
store; deactivate instead).

## Ownership rules (binding on the service)

| Field | Written by | Never written by |
|---|---|---|
| `roles` (`store_staff_role`) | reconcile from the `cognito:groups` claim on every `/store/v1/me` | the console |
| `status` | back-office store-staff management (later slice) | **any token data** |
| `store_id` | back-office store-staff management (later slice) | **any token data** |
| `email` | back-office management (authoritative); `/me` refreshes it **only** when the token carries a real email, and **never** overwrites a non-null value with null | — |
| `last_seen_at` | `/me`, every authenticated contact | — |

The identity provider is the **origin of role assignment**; the platform record is **authoritative
for the access decision** (FR-006a). The two never silently diverge, because the decision reads only
the record.

## Idempotency (SC-011)

The `/store/v1/me` reconcile runs inside one `withTransaction`:

1. `INSERT INTO public.store_staff (cognito_sub, email, last_seen_at) VALUES ($1,$2,now())
   ON CONFLICT (cognito_sub) DO UPDATE SET email = COALESCE(EXCLUDED.email, store_staff.email),
   last_seen_at = now(), updated_at = now() RETURNING id`
   — note the `COALESCE`: a null token email never clobbers a stored one.
2. `DELETE FROM public.store_staff_role WHERE staff_id = $1 AND role_key <> ALL($2::text[])`
3. `INSERT INTO public.store_staff_role (staff_id, role_key) VALUES ($1,$2) ON CONFLICT DO NOTHING`

Unknown group names are filtered **before** steps 2–3, so an unrelated Cognito group can never
become a platform role. `UNIQUE (cognito_sub)` + `ON CONFLICT` makes concurrent first contact
produce exactly one row.

## The authorization predicate (the only place the gate is decided)

```sql
SELECT EXISTS (
  SELECT 1
    FROM public.store_staff ss
    JOIN public.store_staff_role ssr ON ssr.staff_id = ss.id
    JOIN public.store st             ON st.id = ss.store_id
   WHERE ss.cognito_sub = $1
     AND ss.status      = 'active'
     AND st.is_active
     AND ssr.role_key   = 'store_manager'
) AS ok
```

Lives in `apis/edge-api/store/src/staff/repository.ts` as a named SQL constant. Raw SQL, no ORM, no
query builder (Principle VI).

## Migration workflow (003)

- Created with `make db-new name=store_staff_rbac`; **SQL only**, timestamped, `-- +goose Up` /
  `-- +goose Down` sections.
- `Down` drops the four tables in FK-safe order. Forward-only in practice: `db-down` is refused
  unless `ENV=dev` (`Makefile`).
- **`make db-up` is guarded on committed migrations** (`Makefile:119-125` greps
  `git status --porcelain db/migrations`). The migration must be **committed before the operator can
  apply it**.
- Reads/writes only platform-owned objects. No `admin`-schema object is touched.

## Who writes what — and what this slice deliberately cannot write

| Object / column | Written by | Available in 007? |
|---|---|---|
| `public.store` rows | back-office **store management** | ❌ — no interface, no command, no seed file (FR-019) |
| `store_staff` row (create) | the JIT upsert on first authenticated contact | ✅ automatic |
| `store_staff_role` | reconcile from `cognito:groups`, every `/store/v1/me` | ✅ automatic |
| `store_staff.store_id` | back-office **store-staff management** | ❌ — there is no store to assign |
| `store_staff.status` | back-office **store-staff management** | ❌ |
| `store_staff.email` | back-office management (authoritative); `/me` refreshes it opportunistically | partial — set only when the token carries a real address |

**This slice ships no write path for the platform-owned columns.** That is intentional: they are
management concerns, and management belongs in the back-office console (the next slice). Shipping a
seed command here would have created tooling that dies the day that slice lands, and would allow a
store row to exist that the product never created.

### What that means for the gate

The authorization predicate **inner-joins** `public.store`. With no store in existence, no operator
can hold an assignment, so:

- ✅ **provable now** — `store_staff` refused, role-less refused, and an **unassigned
  `store_manager` refused despite a sufficient role** (the store-scope term, doing real work).
- ⏳ **proven in the store-management slice** — a manager at an **active** store is *served*; the
  same manager is refused once the store is **deactivated**; a **disabled** operator is refused.
  Each needs data only that slice can create.

The role and store-scope terms are therefore demonstrated live here; the `status` and
`is_active` terms are implemented and unit-tested here, and demonstrated live there.

### Identity provisioning (unchanged, and out of the database)

Creating a shop-pool account and granting it `store_manager` / `store_staff` happens in Cognito, via
its own administrative commands — see [quickstart.md](../quickstart.md) §3. No self-signup exists.

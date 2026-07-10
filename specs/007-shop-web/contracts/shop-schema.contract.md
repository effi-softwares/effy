# Contract — Shop staff/RBAC schema (`public`, NEW)

**Feature**: 007 (FR-019–FR-022) · **Owner**: `db/migrations/` (Goose, forward-only) ·
**Status**: to build this slice.

The platform's **first customer-operational (`public`) tables**. Everything to date lives in
`admin`. Full column/constraint detail is in [data-model.md](../data-model.md); this file is the
binding contract between the migration, the `shop` service's repository, and the operator's
provisioning commands.

## Data area

`public` — the customer-operational schema. **Not** `admin`, whose designated purpose is
back-office accounts + audit (`db/migrations/20260705095817_baseline_admin_schema.sql`). A shop is
an operational entity every future slice (inventory, picking, orders) joins against; shop staff
follow their shop.

## Objects created

| Object | Purpose |
|---|---|
| `public.shop` | minimal fulfillment-node identity: `id`, `code` UNIQUE, `name`, `is_active` |
| `public.shop_staff` | platform's own operator record: `cognito_sub` UNIQUE, `email` NULL, `name` NULL, `status`, `shop_id` NULL FK, timestamps, `last_seen_at` |
| `public.shop_role` | `key` PK ∈ (`shop_manager`, `shop_staff`) + `description`; **seeded with both rows** |
| `public.shop_staff_role` | m:n; PK `(staff_id, role_key)`; `staff_id` FK ON DELETE CASCADE |

`shop_staff.shop_id` → `public.shop(id)` **ON DELETE RESTRICT** (never orphan staff by deleting a
shop; deactivate instead).

## Ownership rules (binding on the service)

| Field | Written by | Never written by |
|---|---|---|
| `roles` (`shop_staff_role`) | reconcile from the `cognito:groups` claim on every `/shop/v1/me` | the console |
| `status` | back-office shop-staff management (later slice) | **any token data** |
| `shop_id` | back-office shop-staff management (later slice) | **any token data** |
| `email` | back-office management (authoritative); `/me` refreshes it **only** when the token carries a real email, and **never** overwrites a non-null value with null | — |
| `last_seen_at` | `/me`, every authenticated contact | — |

The identity provider is the **origin of role assignment**; the platform record is **authoritative
for the access decision** (FR-006a). The two never silently diverge, because the decision reads only
the record.

## Idempotency (SC-011)

The `/shop/v1/me` reconcile runs inside one `withTransaction`:

1. `INSERT INTO public.shop_staff (cognito_sub, email, last_seen_at) VALUES ($1,$2,now())
   ON CONFLICT (cognito_sub) DO UPDATE SET email = COALESCE(EXCLUDED.email, shop_staff.email),
   last_seen_at = now(), updated_at = now() RETURNING id`
   — note the `COALESCE`: a null token email never clobbers a stored one.
2. `DELETE FROM public.shop_staff_role WHERE staff_id = $1 AND role_key <> ALL($2::text[])`
3. `INSERT INTO public.shop_staff_role (staff_id, role_key) VALUES ($1,$2) ON CONFLICT DO NOTHING`

Unknown group names are filtered **before** steps 2–3, so an unrelated Cognito group can never
become a platform role. `UNIQUE (cognito_sub)` + `ON CONFLICT` makes concurrent first contact
produce exactly one row.

## The authorization predicate (the only place the gate is decided)

```sql
SELECT EXISTS (
  SELECT 1
    FROM public.shop_staff ss
    JOIN public.shop_staff_role ssr ON ssr.staff_id = ss.id
    JOIN public.shop st             ON st.id = ss.shop_id
   WHERE ss.cognito_sub = $1
     AND ss.status      = 'active'
     AND st.is_active
     AND ssr.role_key   = 'shop_manager'
) AS ok
```

Lives in `apis/edge-api/shop/src/staff/repository.ts` as a named SQL constant. Raw SQL, no ORM, no
query builder (Principle VI).

## Migration workflow (003)

- Created with `make db-new name=shop_staff_rbac`; **SQL only**, timestamped, `-- +goose Up` /
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
| `public.shop` rows | back-office **shop management** | ❌ — no interface, no command, no seed file (FR-019) |
| `shop_staff` row (create) | the JIT upsert on first authenticated contact | ✅ automatic |
| `shop_staff_role` | reconcile from `cognito:groups`, every `/shop/v1/me` | ✅ automatic |
| `shop_staff.shop_id` | back-office **shop-staff management** | ❌ — there is no shop to assign |
| `shop_staff.status` | back-office **shop-staff management** | ❌ |
| `shop_staff.email` | back-office management (authoritative); `/me` refreshes it opportunistically | partial — set only when the token carries a real address |

**This slice ships no write path for the platform-owned columns.** That is intentional: they are
management concerns, and management belongs in the back-office console (the next slice). Shipping a
seed command here would have created tooling that dies the day that slice lands, and would allow a
shop row to exist that the product never created.

### What that means for the gate

The authorization predicate **inner-joins** `public.shop`. With no shop in existence, no operator
can hold an assignment, so:

- ✅ **provable now** — `shop_staff` refused, role-less refused, and an **unassigned
  `shop_manager` refused despite a sufficient role** (the shop-scope term, doing real work).
- ⏳ **proven in the shop-management slice** — a manager at an **active** shop is *served*; the
  same manager is refused once the shop is **deactivated**; a **disabled** operator is refused.
  Each needs data only that slice can create.

The role and shop-scope terms are therefore demonstrated live here; the `status` and
`is_active` terms are implemented and unit-tested here, and demonstrated live there.

### Identity provisioning (unchanged, and out of the database)

Creating a shop-pool account and granting it `shop_manager` / `shop_staff` happens in Cognito, via
its own administrative commands — see [quickstart.md](../quickstart.md) §3. No self-signup exists.

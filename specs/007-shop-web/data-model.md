# Phase 1 — Data Model: Shop Web Foundation (Bootstrap)

**Feature**: 007-shop-web · **Date**: 2026-07-09 · **Source**: [spec.md](./spec.md) Key Entities,
[research.md](./research.md) R3/R6

Four new tables in the **`public`** (customer-operational) schema — the platform's first records
there. Introduced through the 003 forward-only Goose workflow. Mirrors the shape of
`admin.staff` / `admin.role` / `admin.staff_role` (005), extended with the store scope.

---

## Entity map

```
                       ┌──────────────────┐
                       │  public.store    │   the fulfillment node (minimal — FR-019)
                       │  id, code, name  │
                       │  is_active       │
                       └────────┬─────────┘
                                │ 0..1   (an operator belongs to at most one store)
                                │
   Cognito shop pool            ▼
   (origin of roles) ──► ┌──────────────────────┐
     cognito:groups      │ public.store_staff   │   the platform's own record — authoritative
                         │ cognito_sub UNIQUE   │   for the ACCESS DECISION
                         │ email, name          │
                         │ status ∈ active|     │
                         │          disabled    │   ← platform-owned
                         │ store_id NULL FK     │   ← platform-owned
                         └──────────┬───────────┘
                                    │ m:n
                         ┌──────────▼───────────┐        ┌────────────────────┐
                         │ public.store_staff_  │───────►│ public.store_role  │
                         │        role          │        │ key ∈ store_manager│
                         │ (staff_id, role_key) │        │      | store_staff │
                         └──────────────────────┘        └────────────────────┘
```

**The authorization decision is the conjunction of three terms**, and each lives in a different
place: `role` (reconciled from the identity provider), `status` (platform-owned), `store scope`
(platform-owned). No single term suffices — FR-021, SC-005a.

---

## `public.store`

The minimal identity of a hidden internal fulfillment node. **FR-025 bounds this hard**: no
address, hours, capacity, delivery zones, or inventory. Customers never see it.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | stable identity |
| `code` | `text` | NOT NULL, **UNIQUE** | operator-facing short code, e.g. `CMB-01` |
| `name` | `text` | NOT NULL | human label |
| `is_active` | `boolean` | NOT NULL, default `true` | an inactive store grants nothing (SC-005a) |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |

**Lifecycle**: created by the platform's **back-office store-management capability** (the next
slice). This slice ships **no way to create a store** — no interface, no command, no seed file
(FR-019) — so no store row can exist that the product did not create. Until then the table is
legitimately empty, and every operator is unassigned.

**Validation**: `code` is unique across stores; deactivation is `is_active = false`, never a delete
(staff reference it — see `ON DELETE RESTRICT` below).

---

## `public.store_staff`

The platform's own record of a store operator, keyed on the verified identity subject. Created on
**first authenticated contact** (JIT upsert from `/store/v1/me`), refreshed idempotently thereafter.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `cognito_sub` | `text` | NOT NULL, **UNIQUE** | the join key; the identity provider's stable subject |
| `email` | `text` | **NULL allowed** | operator-authoritative at provisioning; refreshed from the token only when it carries a real email claim, and **never overwritten with NULL** (research R6) |
| `name` | `text` | NULL allowed | display name, operator-set |
| `status` | `text` | NOT NULL, default `'active'`, CHECK ∈ `('active','disabled')` | **platform-owned** — a disabled operator is refused with a valid token (SC-012) |
| `store_id` | `uuid` | NULL, FK → `public.store(id)` **ON DELETE RESTRICT** | **platform-owned**; NULL = unassigned, an expected state |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |
| `last_seen_at` | `timestamptz` | NULL | refreshed on every authenticated contact |

**Why `store_id` is nullable**: the JIT upsert meets an operator on first contact and cannot know
their store. The record is created unassigned, and the operator assigns it
(from the back-office console, next slice). The spec requires exactly this — "authenticated but
assigned to no store" is an expected state, not an error, and it is the *only* state that exists
until store management ships.

**Why `ON DELETE RESTRICT`**: deleting a store that still has staff would silently orphan them into
an unassigned (and therefore unauthorized) state. Deactivate instead.

**Cardinality**: at most one store per operator (FR-020). A join table for multi-store operators can
arrive additively when one exists.

### State transitions

```
  (absent) ──first authenticated request──► active, roles from claim, store_id = NULL
                                               │
      operator assigns store  ────────────────►│ active, store_id = <store>   ← can be authorized
                                               │
      operator disables       ────────────────►│ disabled                     ← refused (SC-012)
                                               │
      roles removed in IdP    ────────────────►│ roles = {}                   ← record persists (audit)
```

The record is **never deleted** on role removal — it persists for audit and grants nothing.

---

## `public.store_role`

| Column | Type | Constraints |
|---|---|---|
| `key` | `text` | PK, CHECK ∈ `('store_manager','store_staff')` |
| `description` | `text` | NOT NULL |

Seeded by the migration with exactly two rows:

| key | description |
|---|---|
| `store_manager` | Manages a store: full operator access plus store-level administration. |
| `store_staff` | Baseline store operator: day-to-day fulfillment work. |

**Privilege ordering**: `store_manager` > `store_staff`. The role names are prefixed even though
pool isolation makes collision impossible, so that `manager` in a log line is unambiguously the
back-office role (research R2).

---

## `public.store_staff_role`

| Column | Type | Constraints |
|---|---|---|
| `staff_id` | `uuid` | NOT NULL, FK → `public.store_staff(id)` **ON DELETE CASCADE** |
| `role_key` | `text` | NOT NULL, FK → `public.store_role(key)` |
| `granted_at` | `timestamptz` | NOT NULL, default `now()` |
| — | | PRIMARY KEY `(staff_id, role_key)` |

**Reconciliation** (every `/store/v1/me` call, inside one transaction — FR-006a):

1. Upsert `store_staff` on `cognito_sub` (`ON CONFLICT DO UPDATE`) — sets `last_seen_at`,
   `updated_at`, and `email` when the token supplies one.
2. Delete role rows not in the token's claim: `DELETE ... WHERE staff_id = $1 AND role_key <> ALL($2)`.
3. Insert the claim's roles: `INSERT ... ON CONFLICT DO NOTHING`.

Unknown group names in the claim are **filtered out** before step 2/3 (same as
`admin/src/staff/repository.ts`), so an unrelated Cognito group can never become a platform role.

**Idempotency** (SC-011): the whole reconcile runs in `withTransaction`; the `UNIQUE (cognito_sub)`
constraint plus `ON CONFLICT` makes concurrent first contact produce exactly one row.

---

## The authorization query (one predicate, three terms)

Used by `/store/v1/manager-ping`. The `JOIN public.store` is load-bearing: an unassigned operator
(`store_id IS NULL`) and an operator at an inactive store both drop out of the join and are refused,
with no extra branch in the service.

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

| Denial cause | Term that fails |
|---|---|
| operator disabled by the platform | `ss.status = 'active'` |
| operator has no store assignment | `JOIN public.store` (NULL `store_id`) |
| operator's store is inactive | `st.is_active` |
| operator is `store_staff`, not a manager | `ssr.role_key = 'store_manager'` |
| roles removed in the identity provider | no `store_staff_role` row survives reconcile |

---

## Indexes

| Index | Rationale |
|---|---|
| `store_staff (cognito_sub)` | implicit via UNIQUE — the hot lookup on every authenticated request |
| `store (code)` | implicit via UNIQUE — the operator's provisioning handle |
| `store_staff (store_id)` | FK lookup; supports "who works at this store" for later slices |
| `store_staff_role (role_key)` | FK lookup |

Primary keys cover the remaining access paths at this scale. No premature indexing.

---

## Client-side domain models (`@effy/shared-types` → `src/store.ts`)

Wire DTOs and their narrowed domain forms. Mapped explicitly at the repository boundary and never
leaked past the data layer (Principle VI).

```ts
export type StoreRole = "store_manager" | "store_staff";
export const STORE_ROLES: readonly StoreRole[];
export function toStoreRoles(input: readonly string[] | undefined): StoreRole[]; // narrows, drops unknown

export type StoreStaffStatus = "active" | "disabled";

export interface StoreSummaryDTO { id: string; code: string; name: string; isActive: boolean }
export interface StoreStaffRecordDTO {
  subject: string; email: string | null; roles: string[];
  status: StoreStaffStatus; store: StoreSummaryDTO | null; lastSeenAt: string;
}
export interface StoreManagerPingDTO { audience: "store"; scope: "store_manager"; subject: string; message: string }

// domain (roles narrowed, store non-optional-but-nullable)
export interface StoreStaffRecord { subject: string; email: string | null; roles: StoreRole[];
                                    status: StoreStaffStatus; store: StoreSummary | null }
export interface ManagerPingResult { subject: string }
```

`toStoreRoles` is the tolerant reader required by `docs/api/versioning-policy.md` rule 4: an unknown
role value maps to nothing rather than throwing.

---

## Traceability

| Spec requirement | Where it lands |
|---|---|
| FR-019 (minimal store record; no creation path ships here) | `public.store` — schema only; rows come from back-office store management |
| FR-020 (own record: identity, email, roles, store, status; ≤1 store; idempotent) | `public.store_staff` + reconcile transaction |
| FR-021 (role AND status AND store scope) | the authorization query above |
| FR-022 (forward-only workflow, customer-operational area) | one Goose migration in `db/migrations/` |
| FR-006a (roles reconciled from IdP; status + store platform-owned) | reconcile steps 2–3; `status`/`store_id` never written from a token |
| SC-011 (no duplicates, incl. concurrent first contact) | `UNIQUE (cognito_sub)` + `ON CONFLICT` in one transaction |
| SC-012 (disabled refused despite valid token) | `ss.status = 'active'` term |
| SC-005a (unassigned / inactive store refused) | `JOIN public.store` + `st.is_active` |

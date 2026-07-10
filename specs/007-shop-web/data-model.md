# Phase 1 — Data Model: Shop Web Foundation (Bootstrap)

**Feature**: 007-shop-web · **Date**: 2026-07-09 · **Source**: [spec.md](./spec.md) Key Entities,
[research.md](./research.md) R3/R6

Four new tables in the **`public`** (customer-operational) schema — the platform's first records
there. Introduced through the 003 forward-only Goose workflow. Mirrors the shape of
`admin.staff` / `admin.role` / `admin.staff_role` (005), extended with the shop scope.

---

## Entity map

```
                       ┌──────────────────┐
                       │  public.shop    │   the fulfillment node (minimal — FR-019)
                       │  id, code, name  │
                       │  is_active       │
                       └────────┬─────────┘
                                │ 0..1   (an operator belongs to at most one shop)
                                │
   Cognito shop pool            ▼
   (origin of roles) ──► ┌──────────────────────┐
     cognito:groups      │ public.shop_staff   │   the platform's own record — authoritative
                         │ cognito_sub UNIQUE   │   for the ACCESS DECISION
                         │ email, name          │
                         │ status ∈ active|     │
                         │          disabled    │   ← platform-owned
                         │ shop_id NULL FK     │   ← platform-owned
                         └──────────┬───────────┘
                                    │ m:n
                         ┌──────────▼───────────┐        ┌────────────────────┐
                         │ public.shop_staff_  │───────►│ public.shop_role  │
                         │        role          │        │ key ∈ shop_manager│
                         │ (staff_id, role_key) │        │      | shop_staff │
                         └──────────────────────┘        └────────────────────┘
```

**The authorization decision is the conjunction of three terms**, and each lives in a different
place: `role` (reconciled from the identity provider), `status` (platform-owned), `shop scope`
(platform-owned). No single term suffices — FR-021, SC-005a.

---

## `public.shop`

The minimal identity of a hidden internal fulfillment node. **FR-025 bounds this hard**: no
address, hours, capacity, delivery zones, or inventory. Customers never see it.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | stable identity |
| `code` | `text` | NOT NULL, **UNIQUE** | operator-facing short code, e.g. `CMB-01` |
| `name` | `text` | NOT NULL | human label |
| `is_active` | `boolean` | NOT NULL, default `true` | an inactive shop grants nothing (SC-005a) |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |

**Lifecycle**: created by the platform's **back-office shop-management capability** (the next
slice). This slice ships **no way to create a shop** — no interface, no command, no seed file
(FR-019) — so no shop row can exist that the product did not create. Until then the table is
legitimately empty, and every operator is unassigned.

**Validation**: `code` is unique across shops; deactivation is `is_active = false`, never a delete
(staff reference it — see `ON DELETE RESTRICT` below).

---

## `public.shop_staff`

The platform's own record of a shop operator, keyed on the verified identity subject. Created on
**first authenticated contact** (JIT upsert from `/shop/v1/me`), refreshed idempotently thereafter.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `cognito_sub` | `text` | NOT NULL, **UNIQUE** | the join key; the identity provider's stable subject |
| `email` | `text` | **NULL allowed** | operator-authoritative at provisioning; refreshed from the token only when it carries a real email claim, and **never overwritten with NULL** (research R6) |
| `name` | `text` | NULL allowed | display name, operator-set |
| `status` | `text` | NOT NULL, default `'active'`, CHECK ∈ `('active','disabled')` | **platform-owned** — a disabled operator is refused with a valid token (SC-012) |
| `shop_id` | `uuid` | NULL, FK → `public.shop(id)` **ON DELETE RESTRICT** | **platform-owned**; NULL = unassigned, an expected state |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |
| `last_seen_at` | `timestamptz` | NULL | refreshed on every authenticated contact |

**Why `shop_id` is nullable**: the JIT upsert meets an operator on first contact and cannot know
their shop. The record is created unassigned, and the operator assigns it
(from the back-office console, next slice). The spec requires exactly this — "authenticated but
assigned to no shop" is an expected state, not an error, and it is the *only* state that exists
until shop management ships.

**Why `ON DELETE RESTRICT`**: deleting a shop that still has staff would silently orphan them into
an unassigned (and therefore unauthorized) state. Deactivate instead.

**Cardinality**: at most one shop per operator (FR-020). A join table for multi-shop operators can
arrive additively when one exists.

### State transitions

```
  (absent) ──first authenticated request──► active, roles from claim, shop_id = NULL
                                               │
      operator assigns shop  ────────────────►│ active, shop_id = <shop>   ← can be authorized
                                               │
      operator disables       ────────────────►│ disabled                     ← refused (SC-012)
                                               │
      roles removed in IdP    ────────────────►│ roles = {}                   ← record persists (audit)
```

The record is **never deleted** on role removal — it persists for audit and grants nothing.

---

## `public.shop_role`

| Column | Type | Constraints |
|---|---|---|
| `key` | `text` | PK, CHECK ∈ `('shop_manager','shop_staff')` |
| `description` | `text` | NOT NULL |

Seeded by the migration with exactly two rows:

| key | description |
|---|---|
| `shop_manager` | Manages a shop: full operator access plus shop-level administration. |
| `shop_staff` | Baseline shop operator: day-to-day fulfillment work. |

**Privilege ordering**: `shop_manager` > `shop_staff`. The role names are prefixed even though
pool isolation makes collision impossible, so that `manager` in a log line is unambiguously the
back-office role (research R2).

---

## `public.shop_staff_role`

| Column | Type | Constraints |
|---|---|---|
| `staff_id` | `uuid` | NOT NULL, FK → `public.shop_staff(id)` **ON DELETE CASCADE** |
| `role_key` | `text` | NOT NULL, FK → `public.shop_role(key)` |
| `granted_at` | `timestamptz` | NOT NULL, default `now()` |
| — | | PRIMARY KEY `(staff_id, role_key)` |

**Reconciliation** (every `/shop/v1/me` call, inside one transaction — FR-006a):

1. Upsert `shop_staff` on `cognito_sub` (`ON CONFLICT DO UPDATE`) — sets `last_seen_at`,
   `updated_at`, and `email` when the token supplies one.
2. Delete role rows not in the token's claim: `DELETE ... WHERE staff_id = $1 AND role_key <> ALL($2)`.
3. Insert the claim's roles: `INSERT ... ON CONFLICT DO NOTHING`.

Unknown group names in the claim are **filtered out** before step 2/3 (same as
`admin/src/staff/repository.ts`), so an unrelated Cognito group can never become a platform role.

**Idempotency** (SC-011): the whole reconcile runs in `withTransaction`; the `UNIQUE (cognito_sub)`
constraint plus `ON CONFLICT` makes concurrent first contact produce exactly one row.

---

## The authorization query (one predicate, three terms)

Used by `/shop/v1/manager-ping`. The `JOIN public.shop` is load-bearing: an unassigned operator
(`shop_id IS NULL`) and an operator at an inactive shop both drop out of the join and are refused,
with no extra branch in the service.

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

| Denial cause | Term that fails |
|---|---|
| operator disabled by the platform | `ss.status = 'active'` |
| operator has no shop assignment | `JOIN public.shop` (NULL `shop_id`) |
| operator's shop is inactive | `st.is_active` |
| operator is `shop_staff`, not a manager | `ssr.role_key = 'shop_manager'` |
| roles removed in the identity provider | no `shop_staff_role` row survives reconcile |

---

## Indexes

| Index | Rationale |
|---|---|
| `shop_staff (cognito_sub)` | implicit via UNIQUE — the hot lookup on every authenticated request |
| `shop (code)` | implicit via UNIQUE — the operator's provisioning handle |
| `shop_staff (shop_id)` | FK lookup; supports "who works at this shop" for later slices |
| `shop_staff_role (role_key)` | FK lookup |

Primary keys cover the remaining access paths at this scale. No premature indexing.

---

## Client-side domain models (`@effy/shared-types` → `src/shop.ts`)

Wire DTOs and their narrowed domain forms. Mapped explicitly at the repository boundary and never
leaked past the data layer (Principle VI).

```ts
export type ShopRole = "shop_manager" | "shop_staff";
export const SHOP_ROLES: readonly ShopRole[];
export function toShopRoles(input: readonly string[] | undefined): ShopRole[]; // narrows, drops unknown

export type ShopStaffStatus = "active" | "disabled";

export interface ShopSummaryDTO { id: string; code: string; name: string; isActive: boolean }
export interface ShopStaffRecordDTO {
  subject: string; email: string | null; roles: string[];
  status: ShopStaffStatus; shop: ShopSummaryDTO | null; lastSeenAt: string;
}
export interface ShopManagerPingDTO { audience: "shop"; scope: "shop_manager"; subject: string; message: string }

// domain (roles narrowed, shop non-optional-but-nullable)
export interface ShopStaffRecord { subject: string; email: string | null; roles: ShopRole[];
                                    status: ShopStaffStatus; shop: ShopSummary | null }
export interface ManagerPingResult { subject: string }
```

`toShopRoles` is the tolerant reader required by `docs/api/versioning-policy.md` rule 4: an unknown
role value maps to nothing rather than throwing.

---

## Traceability

| Spec requirement | Where it lands |
|---|---|
| FR-019 (minimal shop record; no creation path ships here) | `public.shop` — schema only; rows come from back-office shop management |
| FR-020 (own record: identity, email, roles, shop, status; ≤1 shop; idempotent) | `public.shop_staff` + reconcile transaction |
| FR-021 (role AND status AND shop scope) | the authorization query above |
| FR-022 (forward-only workflow, customer-operational area) | one Goose migration in `db/migrations/` |
| FR-006a (roles reconciled from IdP; status + shop platform-owned) | reconcile steps 2–3; `status`/`shop_id` never written from a token |
| SC-011 (no duplicates, incl. concurrent first contact) | `UNIQUE (cognito_sub)` + `ON CONFLICT` in one transaction |
| SC-012 (disabled refused despite valid token) | `ss.status = 'active'` term |
| SC-005a (unassigned / inactive shop refused) | `JOIN public.shop` + `st.is_active` |

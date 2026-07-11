# Data Model — 009 Back-Office Shop Management (Phase 1)

Schemas: **`public`** (customer-operational — shop + shop staff/roles, extended from 007) and
**`admin`** (back-office accounts + audit — new `audit_log`). Raw SQL, no ORM (Principle VI).
All changes arrive through **one new forward-only Goose migration** that runs after 007's
`..._shop_staff_rbac.sql`. `public.shop` ships empty, so data backfill is a no-op in practice.

Entity relationships (the deep multi-entity scope from the spec):

```
admin.staff (005) ──actor──> admin.audit_log ──target──> public.shop / public.shop_staff
                                                              │
public.shop 1 ──────────< N public.shop_staff N >──────── M  public.shop_role
   (a shop has many staff)      (a staff → exactly one shop)   via public.shop_staff_role
```

- **one shop → many shop users**; **one shop user → exactly one shop** (hard invariant, `shop_staff.shop_id` single FK).
- **shop user → many roles** (m:n via `shop_staff_role`), reconciled from `cognito:groups` by the shop service.
- every mutation writes one **`admin.audit_log`** row (actor = back-office `sub`; target = shop or shop_staff).
- every **shop user** is mirrored by exactly one **shop-pool Cognito account** (subject = `cognito_sub`), kept consistent by the provisioning operation (R4).

---

## 1. `public.shop` — extended (was 007-minimal)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK, `gen_random_uuid()` | stable identity (unchanged) |
| `code` | `text` NOT NULL UNIQUE | operator-facing handle; **immutable after create** (FR-004/A9) |
| `name` | `text` NOT NULL | editable |
| **`status`** | `text` NOT NULL DEFAULT `'active'` CHECK IN (`'active'`,`'suspended'`,`'disabled'`) | **replaces `is_active`** (R2) |
| **`contact_phone`** | `text` NULL | optional administrative contact (Q3) |
| **`notes`** | `text` NULL | optional free-text (Q3) |
| `created_at` / `updated_at` | `timestamptz` NOT NULL `now()` | unchanged |

**Migration**: `ALTER TABLE public.shop ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK (...)`;
backfill `UPDATE ... SET status = CASE WHEN is_active THEN 'active' ELSE 'disabled' END`; `DROP COLUMN
is_active`; `ADD COLUMN contact_phone text`; `ADD COLUMN notes text`. **No** operational attributes
(address/hours/capacity/zones/inventory) — deferred (FR-017/FR-023/SC-015).

**Lifecycle** (`status`): `active ⇄ suspended`, `active ⇄ disabled`, `suspended ⇄ disabled`,
`{suspended,disabled} → active` (re-activate). Only `active` serves operators (the 007 gate).

**Delete**: hard `DELETE` allowed only when **no `shop_staff` row references the shop** (FK
`ON DELETE RESTRICT` is the backstop; the service checks first and returns `problem(409)` with
disable-instead guidance). Operated shops are disabled, not deleted (FR-006/A6).

---

## 2. `public.shop_staff` — reused (007), now provisioned by back-office

Unchanged columns (007): `id uuid PK`, `cognito_sub text UNIQUE NOT NULL`, `email text NULL`,
`name text NULL`, `status text CHECK IN ('active','disabled') DEFAULT 'active'`,
`shop_id uuid REFERENCES public.shop(id) ON DELETE RESTRICT` (NULL = unassigned), `created_at`,
`updated_at`, `last_seen_at`.

**What this slice changes**: rows are now **created by back-office provisioning** (R4) with `shop_id`
and `status` set (platform-owned) and keyed on the Cognito `sub` — so 007's JIT `GET /shop/v1/me`
upsert (keyed on `cognito_sub`, `COALESCE` email, `status`/`shop_id` untouched) reconciles against the
pre-existing row rather than creating an unassigned duplicate (FR-012/SC-009). No column change.

**Validation / invariants**:
- One-user-one-shop: `shop_id` is a single FK; provisioning **refuses an email already bound to any
  `shop_staff`** (checked before writes) — SC-003.
- `email` is unique in the shop pool (Cognito enforces username=email); the platform stores it but
  never overwrites a provisioned email with NULL (007 `COALESCE`).
- Disabling a user sets `status='disabled'` (authoritative for the gate) **and** disables the Cognito
  account (R5/Q1).

---

## 3. `public.shop_role` / `public.shop_staff_role` — reused (007), no schema change

`shop_role(key CHECK IN ('shop_manager','shop_staff'), description)` seeded by 007.
`shop_staff_role(staff_id → shop_staff ON DELETE CASCADE, role_key → shop_role, granted_at, PK(staff_id,role_key))`.

**This slice writes them**: provisioning grants the chosen role; role-change updates them — **and must
also update the Cognito group** (the *origin* the shop service reconciles from), or the next
`GET /shop/v1/me` reverts the DB (R5).

---

## 4. `admin.audit_log` — NEW (general back-office audit)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK `gen_random_uuid()` | |
| `actor_sub` | `text` NOT NULL | the back-office `sub` that performed the action |
| `action` | `text` NOT NULL | e.g. `shop.create`, `shop.status_change`, `shop.delete`, `shop_user.provision`, `shop_user.role_change`, `shop_user.status_change`, `shop.update` |
| `target_type` | `text` NOT NULL | `shop` \| `shop_staff` |
| `target_id` | `uuid` NULL | the shop or shop_staff id (NULL if the target was refused before creation) |
| `detail` | `jsonb` NOT NULL DEFAULT `'{}'` | before/after where applicable; **no PII** beyond what governance allows (no raw token; email only if policy permits — default: omit email, store code/role/status) |
| `created_at` | `timestamptz` NOT NULL `now()` | |

Index: `(target_type, target_id, created_at DESC)` for the history view; `(actor_sub, created_at DESC)`
for actor audit. Written inside the same transaction as the mutation it records (FR-016/SC-010).

---

## 5. Shared DTOs (`@effy/shared-types` `shop.ts`) — additions

Back-office management DTOs (wire) + domain types (screens never see DTOs — Principle VI). New:
- `ShopLifecycleStatus = 'active' | 'suspended' | 'disabled'`.
- `ShopListItemDTO { id, code, name, status, userCount }` → domain `ShopListItem`.
- `ShopDetailDTO { id, code, name, status, contactPhone|null, notes|null, createdAt, updatedAt, users: ShopUserDTO[] }` → domain `ShopDetail`.
- `ShopUserDTO { id, subject, email|null, name|null, roles: ShopRole[], status: ShopStaffStatus, lastSeenAt|null }` → domain `ShopUser`.
- `CreateShopRequest { code, name, contactPhone?, notes?, primaryContact: { name, email } }`.
- `UpdateShopRequest { name?, contactPhone?|null, notes?|null }` (no `code`).
- `ChangeShopStatusRequest { status: ShopLifecycleStatus }`.
- `CreateShopUserRequest { name, email, role: ShopRole }`.
- `UpdateShopUserRequest { role?: ShopRole, status?: ShopStaffStatus }`.
- `AuditEntryDTO { id, actorSub, action, targetType, targetId|null, detail, createdAt }` → domain `AuditEntry` (the viewable shop/user history, FR-016/SC-010; read from `admin.audit_log`, §4).
- **Changed**: `ShopSummaryDTO`/`ShopSummary` field `isActive: boolean` → `status: ShopLifecycleStatus`
  (R2) — consumed by `apps/shop-web` and the 007 shop service response.

Paginated list envelope: `PagedDTO<T> { items: T[], total: number, page: number, pageSize: number }`
(or a keyset cursor — plan-time detail); reused for `GET /admin/v1/shops`.

---

## 6. State & ownership summary (authorization inputs)

The 007 manager gate decides `served ⇔ shop_staff.status='active' AND shop.status='active' AND
shop_staff_role contains 'shop_manager'` (after R2's predicate change). This slice is what makes each
term settable as product data:

| Term | Owner | Set by this slice via |
|---|---|---|
| role (`shop_manager`) | origin: Cognito group; mirror: `shop_staff_role` | provision / role-change (both Cognito + DB) |
| user `status` | platform (`public.shop_staff.status`) | disable/enable user (+ Cognito enable/disable) |
| shop scope (`shop.status='active'`) | platform (`public.shop.status`) | shop status change; shop must exist (create) |

This unblocks 007 **SC-005b** (served at active shop; refused when suspended/disabled) and **SC-012**
(disabled user refused) against product-created data (spec SC-007/SC-008).

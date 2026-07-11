# Contract — Shop-Management API (`/admin/v1/shops...`)

**Service**: `apis/edge-api/admin` (back-office pool), new `shops/` slice.
**Gateway**: shared HTTP API (004). **Authorizer**: `back-office` JWT
(`/effy/<env>/edge/authorizer/back-office_id`) on every route below.
**Errors**: RFC 9457 `application/problem+json` via `@effy/edge-shared` `problem(...)` — uniform,
never disclosing which authorization term failed. **DTOs**: `@effy/shared-types` `shop.ts`
(data-model §5). All bodies JSON. All authorization decided from the `admin.staff` record (R6).

Authz legend: **Read** = active back-office staff (any role incl. `csa`). **Mutate** = active staff
with role ∈ {`admin`,`manager`} (A1/FR-014). Unauthorized → `403` uniform. Unauthenticated (no `sub`)
→ `401`. Backend/identity-provider failure → `503` (fail-closed). Validation → `400` with
`FieldError[]`. Conflict (unique/invariant) → `409`.

---

## Reads

### `GET /admin/v1/shops` — list (paginated, filterable, searchable) · Read
Query params: `page` (1-based, default 1), `pageSize` (default 20, max 100), `status`
(`active|suspended|disabled`, optional filter), `q` (optional, matches `code` or `name`, `ILIKE`).
Server-side paging/search/filter (A12). → `200` `PagedDTO<ShopListItemDTO>` (`{id,code,name,status,userCount}`).

### `GET /admin/v1/shops/{shopId}` — detail + roster · Read
→ `200` `ShopDetailDTO` (shop fields + `users: ShopUserDTO[]`). Unknown id → `404`.

### `GET /admin/v1/shops/{shopId}/audit` — shop history · Read
→ `200` `PagedDTO<AuditEntryDTO>` (from `admin.audit_log` filtered by target; `AuditEntryDTO` per data-model §5). Backs the viewable history required by FR-016/SC-010; the detail screen renders it as a history section.

---

## Shop mutations · Mutate

### `POST /admin/v1/shops` — create shop + provision primary manager
Body `CreateShopRequest` `{ code, name, contactPhone?, notes?, primaryContact:{ name, email } }`.
Behaviour (R4, one coherent operation):
1. `409` if `code` exists, or if `primaryContact.email` already belongs to any `shop_staff` (one-shop invariant).
2. `AdminCreateUser`(no password, SUPPRESS, email_verified) in **shop** pool → `sub`; `AdminAddUserToGroup('shop_manager')`. Idempotent on `UsernameExistsException`.
3. Txn: INSERT `public.shop` (`status='active'`) + upsert `public.shop_staff`(by `cognito_sub`, `shop_id`, `status='active'`) + grant `shop_staff_role('shop_manager')` + `admin.audit_log('shop.create')`.
→ `201` `ShopDetailDTO`. Partial failure → `503`; safe to retry (idempotent, converges) — SC-002.

### `PATCH /admin/v1/shops/{shopId}` — edit details
Body `UpdateShopRequest` `{ name?, contactPhone?, notes? }` (**no `code`** — immutable, A9).
→ `200` `ShopDetailDTO`. Empty/invalid `name` → `400`. Unknown id → `404`. Writes `admin.audit_log('shop.update')`.

### `POST /admin/v1/shops/{shopId}/status` — lifecycle transition
Body `ChangeShopStatusRequest` `{ status }`. Valid transitions only (data-model §1); invalid → `400`.
Touches `public.shop.status` **only** — no Cognito (R5/Q1). → `200` `ShopDetailDTO`. Audit `shop.status_change` (from/to). Effect: suspend/disable → operators refused by the 007 gate on next attempt (SC-005/SC-007).

### `DELETE /admin/v1/shops/{shopId}` — remove (guarded)
Only if the shop has **no `shop_staff`** (and no operational history). Has dependents → `409` with
disable-instead guidance (FR-006/A6). Requires explicit confirmation (client-side). → `204`. Audit `shop.delete`.

---

## Shop-user (roster) mutations · Mutate

### `POST /admin/v1/shops/{shopId}/users` — add a user
Body `CreateShopUserRequest` `{ name, email, role }` (`role ∈ {shop_manager, shop_staff}`).
Behaviour = R4 steps 2–3 minus shop insert. `409` if `email` already a shop user (any shop). Unknown shop → `404`.
→ `201` `ShopUserDTO`. Audit `shop_user.provision`.

### `PATCH /admin/v1/shops/{shopId}/users/{userId}` — change role and/or status
Body `UpdateShopUserRequest` `{ role?, status? }`.
- `role` change: `AddUserToGroup`/`RemoveUserFromGroup` (Cognito origin) **and** update `shop_staff_role` (R5). Audit `shop_user.role_change`.
- `status='disabled'`: `shop_staff.status='disabled'` **and** `AdminDisableUser` (Q1). `status='active'`: reverse. Audit `shop_user.status_change`.
→ `200` `ShopUserDTO`. Unknown ids → `404`. No shop reassignment (A8) — `shopId` in the path must match the user's shop, else `409`.

---

## Cross-cutting

- **No `code` change** path exists (immutability enforced server-side, A9).
- **Uniform 403**: role/status failures return an identical body — no disclosure of which term failed (parity with 007's gate contract).
- **Idempotency/consistency**: every provisioning/mutation is retry-safe; a re-run converges (R4); no orphaned Cognito account, no ownerless/duplicate record (SC-002).
- **Telemetry**: handlers log actor `sub` + shop id only (no email/name/token). Client emits the R9 PostHog events.
- **Versioning**: `/admin/v1/...`; a breaking change is `/v2` per the platform interface-versioning policy.

## Downstream contract change (007, same slice)
- `apis/edge-api/shop` manager gate predicate: `AND st.is_active` → `AND st.status = 'active'`; `/shop/v1/me` `shop` summary field `isActive` → `status` (R2). Updated with its tests in this slice.

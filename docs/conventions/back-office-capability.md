# Convention — a back-office capability that spans the console + cold-path

Written from 009-shop-management, the first back-office capability with real CRUD + identity
provisioning. Follow this shape when adding another (catalog admin, driver admin, …).

## The three-layer slice, per surface

**Cold-path backend** (`apis/edge-api/admin/src/<domain>/`, back-office pool authorizer):
- `types.ts` — domain types + a `DomainError` (kind → HTTP status). No wire/HTTP concern.
- `repository.ts` — raw parameterized SQL via `@effy/edge-shared` `query`/`withTransaction`, explicit
  row → domain mapping. **No ORM.** Every mutation writes its `admin.audit_log` row inside the same
  transaction.
- `authz.ts` — authorization from the **`admin.staff` platform record** (never the token claim):
  a read gate (any active staff) and a mutate gate (active AND role ∈ {admin, manager}).
- `service.ts` — validation + orchestration; wires repository/cognito by explicit import (no DI).
- `functions/*.ts` — thin handlers: `preamble` → `guard` → parse → service → map domain→DTO → `json`.
  Errors map through one `mapShopError`-style helper; the uniform 403/401/404/409/400/503 contract.
- `handler-support.ts` — the `guard` (401/403/503) + the domain→DTO mappers, shared across handlers.

**Console** (`apps/back-office/src/features/<domain>/`):
- `repo.ts` (calls the shared `api` client, DTO→domain) → `queries.ts` (`queryOptions` + mutation
  hooks that invalidate) → screens/dialogs. **Server state lives only in the TanStack Query cache**
  — never hand-cached in component state (constitution VI).
- Forms use **TanStack Form** (`@tanstack/react-form`), not react-hook-form.
- Mutating controls are hidden for roles the backend would refuse (least-privilege UX **over** the
  authoritative backend gate — never instead of it).

**Shared** (`packages/`): DTOs in `@effy/shared-types` (the single wire contract both sides import);
UI primitives in `@effy/design-system/ui`; console chrome in `@effy/web-kit/console`. A concern the
second consumer needs is **generalized in the package**, never forked into the app (Principle II).

## Identity provisioning stays consistent across Cognito ↔ the platform record

When a capability provisions an identity (here: shop users in the **shop** pool), follow the 006
two-consistent-writes pattern:

1. **Cognito first** — `AdminCreateUser` (no password, `SUPPRESS`, `email_verified`) + group, which
   yields the stable `sub`. Idempotent on `UsernameExistsException` (recover the sub via
   `AdminGetUser`, re-enable if disabled).
2. **Then the DB** in one transaction, the record **keyed on that `sub`** — so a JIT `me` upsert on
   the operator's first sign-in reconciles against the pre-existing row rather than duplicating it.
3. **Recovery is re-run** — every step is idempotent, so a partial failure is repaired by repeating
   the request; no orphaned account, no ownerless/duplicate record.

Rules that fall out of the shop service's role reconcile: a **role change must touch the Cognito
group** (the origin the shop service reconciles from) *and* the DB; **status is platform-owned** and
authoritative — disabling a *user* also disables the account (defense in depth), while suspending a
*shop* touches only `public.shop.status` and lets the gate refuse.

The provisioning IAM is least-privilege: the back-office service holds Cognito Admin actions scoped
to the **shop pool ARN only**. This is an authorized server-side provisioning write, not cross-pool
authentication — the routes stay behind the back-office authorizer (constitution Principle IV).

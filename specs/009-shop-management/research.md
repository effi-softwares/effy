# Research — 009 Back-Office Shop Management (Phase 0)

All decisions below are grounded in the shipped code (004 cold-path, 005 back-office console + shared
web foundation, 006 first-admin Cognito provisioning, 007 shop tables + gate). Each records the
Decision, Rationale, and Alternatives considered. The three questions the spec's checklist flagged
for the Constitution Check are R1–R3.

---

## R1 — Service placement: extend `apis/edge-api/admin` (do NOT add a sibling, do NOT use `edge-api/shop`)

**Decision**: Add a new **`shops/` domain slice inside the existing `apis/edge-api/admin` service**
(the back-office-pool cold-path service, 004/005). New routes live under **`/admin/v1/shops...`**,
each gated by the **back-office** JWT authorizer (`/effy/<env>/edge/authorizer/back-office_id`) — the
exact wiring the service's existing `/admin/v1/*` routes use.

**Rationale**:
- The callers are **back-office staff** authenticated for the **back-office pool**. `apis/edge-api/admin`
  is *the* back-office-pool service; its `serverless.yml` already references the `back-office_id`
  authorizer, connects to the same PostgreSQL instance (both `admin` and `public` schemas are reachable
  from one connection), and carries the DB-secret IAM + VPC + Secrets-extension layer this feature needs.
- `apis/edge-api/shop` is scoped to the **shop** pool authorizer and serves *shop operators* reading
  their own shop. A back-office-caller capability must not attach there — it would either accept the
  wrong pool's tokens or need a second authorizer on one service (both wrong).
- Adding a service would duplicate the entire `serverless.yml` (VPC, secrets, DB env, alarms) for no
  isolation benefit; A3's "adding a service = a new `apis/edge-api/<name>/`" is for a *new audience/pool*,
  not a new capability for an existing one.

**Alternatives considered**: (a) new `apis/edge-api/shop-admin` sibling — rejected: same pool as
`admin`, pure duplication. (b) put it in `apis/edge-api/shop` — rejected: wrong authorizer/pool. (c) hot
path (`core-api`) — rejected: Principle III (this is low-frequency admin CRUD; the user explicitly said
"no need to have them in core-api").

---

## R2 — Reconcile 007's boolean shop-active gate to the 3-value lifecycle status

**Decision**: Migrate `public.shop.is_active boolean` → **`status text NOT NULL DEFAULT 'active' CHECK
(status IN ('active','suspended','disabled'))`**, backfilling `true→'active'`, `false→'disabled'`, then
dropping `is_active`. Update the **shop service (007)** and its tests **in lockstep** — this slice owns
that cross-slice edit (Principle I: fix the shared reality, don't work around it).

The shop manager gate serves an operator **only when their shop is `active`**; both `suspended` and
`disabled` shops refuse (spec A5/FR-013). Exactly three production sites change (per code map):
1. `apis/edge-api/shop/src/staff/repository.ts` gate predicate: `AND st.is_active` → **`AND st.status = 'active'`**.
2. Same file, read projection: `st.is_active AS shop_is_active` → **`st.status AS shop_status`**;
   `StaffRow.shop_is_active: boolean|null` → `shop_status: string|null`; `mapRow` builds the shop summary
   from `status`.
3. `@effy/shared-types` `shop.ts`: `ShopSummaryDTO`/`ShopSummary` field `isActive: boolean` →
   **`status: ShopLifecycleStatus`** (new union `'active'|'suspended'|'disabled'`). `apps/shop-web` reads
   only that the shop is assigned; it is updated to read `status`.
4. `apis/edge-api/shop/src/staff/lifecycle.test.ts` — the test that hard-codes `shop_is_active = true`
   is updated to `shop_status = 'active'` and its assertion to `status: 'active'`.

**Rationale**: `public.shop` ships **empty** (007 shipped no creation path), so the data backfill is a
no-op in practice, but the column + code change is real and must not regress 007's green suite. Keeping
one authoritative `status` column (not an added boolean beside `is_active`) keeps the gate a single
predicate and the model honest.

**Alternatives considered**: (a) add `status` alongside `is_active` and keep both in sync — rejected:
two sources of truth for "is this shop serving." (b) keep `is_active` and add a separate `suspended`
flag — rejected: encodes a 3-value state as two booleans with an illegal fourth combination. (c) leave
007 untouched and gate on a view — rejected: hides the change and violates Principle I.

---

## R3 — Cross-pool **provisioning** vs Principle IV (Auth Isolation)

**Decision**: The back-office service (back-office authorizer) performs **server-side Cognito Admin API
writes against the shop pool** (`AdminCreateUser` / `AdminAddUserToGroup` / `AdminRemoveUserFromGroup` /
`AdminDisableUser` / `AdminEnableUser` / `AdminGetUser`). This is **compliant** with Principle IV and is
recorded as a design note, **not** a violation.

**Rationale**: Principle IV governs **token acceptance** — "a token issued for one pool MUST NOT be
accepted by a surface or service scoped to another," and "no auth proxy." This feature:
- Never accepts a shop token on a back-office route (routes keep the `back-office` authorizer).
- Never presents a back-office token to a shop-scoped service (no brokering/forwarding).
- Uses IAM-authorized **administrative** SDK calls to the shop **user pool** — the same act 006 performs
  against the admin pool from the Go CLI (`AdminCreateUser` no-password, `SUPPRESS` invite,
  `email_verified`, then `AdminAddUserToGroup`). Provisioning identities admin-side is exactly how the
  platform creates privileged, no-self-signup accounts.

IAM is least-privilege: the Cognito actions are scoped to the **shop pool ARN** (from
`/effy/<env>/auth/shop/user_pool_arn`), nothing else. The shop pool id is injected as an env var
(`SHOP_USER_POOL_ID`) resolved from `/effy/<env>/auth/shop/user_pool_id` at deploy time — the same
"Terraform writes SSM → deploy injects env" shape 006 used (`BACK_OFFICE_POOL_ID`).

**Alternatives considered**: (a) a separate provisioning Lambda in the shop service — rejected: still a
back-office-authorized action; splitting it across services fractures the transaction with the platform
record. (b) publish an event and let a shop-side worker provision — rejected: adds async complexity and
an eventual-consistency window to a synchronous operator action; no event backbone is built yet. (c) a
break-glass CLI like 006 — rejected: this is a recurring product operation, not a one-time bootstrap.

---

## R4 — The consistent provisioning operation (Cognito ↔ platform record)

**Decision**: Follow 006's **Cognito-first, then DB** ordering, made idempotent and recoverable.

- **Create shop + primary manager** (`POST /admin/v1/shops`):
  1. Validate (unique code; email not already a shop user — the one-shop invariant, checked before any
     write). Reject early with `problem(409, ...)` on either.
  2. `AdminCreateUser` (no password, `SUPPRESS`, `email_verified=true`, `name`) in the shop pool →
     obtain `sub`. On `UsernameExistsException`, `AdminGetUser` to recover `sub` + re-enable if disabled
     (break-glass parity with 006). `AdminAddUserToGroup('shop_manager')`.
  3. In **one DB transaction** (`withTransaction`): `INSERT INTO public.shop (...) ON CONFLICT (code) DO
     UPDATE ... RETURNING id`; upsert `public.shop_staff` **keyed on `cognito_sub`** with the returned
     `sub`, `email`, `name`, `status='active'`, `shop_id`; grant `public.shop_staff_role('shop_manager')`
     `ON CONFLICT DO NOTHING`; write an `admin.audit_log` row.
- **Add user** (`POST /admin/v1/shops/{id}/users`): steps 2–3 minus the shop insert; role chosen
  (`shop_manager`|`shop_staff`).
- **Recovery**: a partial failure (Cognito succeeded, DB failed) is repaired by **re-running** the same
  request — every step is idempotent (`UsernameExistsException` path; `ON CONFLICT` upserts). No
  ownerless shop can exist (the shop row is created in the same transaction as its owner); no orphaned
  identity account survives a re-run (it is reused by `sub`). This is the exact consistency model 006
  documents.

**FR-012 continuity**: because `public.shop_staff` is written **keyed on the `sub`** at provisioning
time, the operator's first `GET /shop/v1/me` (007's JIT upsert, also keyed on `cognito_sub` with
`COALESCE(EXCLUDED.email, …)` and `status`/`shop_id` untouched) **matches the pre-existing row** —
refreshing `last_seen_at` and reconciling roles, never creating an unassigned duplicate.

**Rationale**: reuses a proven pattern; keeps the platform record and identity provider convergent
under retry without a distributed transaction.

**Alternatives considered**: DB-first then Cognito — rejected: the `sub` (the DB join key) only exists
after `AdminCreateUser`, and a DB row written before the account risks an ownerless record if Cognito
fails.

---

## R5 — Mutation semantics: what each action touches (identity provider vs platform record)

Grounded in the spec's clarification (Q1/A13):

| Action | Cognito (shop pool) | Platform record (`public`) | Audit |
|---|---|---|---|
| Create shop + manager | `AdminCreateUser` + `AddUserToGroup('shop_manager')` | INSERT shop + shop_staff + shop_staff_role | ✅ |
| Add user | `AdminCreateUser` + `AddUserToGroup(role)` | INSERT shop_staff + shop_staff_role | ✅ |
| Change user role | `AddUserToGroup`/`RemoveUserFromGroup` (origin) | UPDATE shop_staff_role | ✅ |
| **Disable user** | **`AdminDisableUser`** | `shop_staff.status='disabled'` | ✅ |
| **Re-enable user** | **`AdminEnableUser`** | `shop_staff.status='active'` | ✅ |
| Suspend/disable **shop** | **none** | `public.shop.status` | ✅ |
| Re-activate shop | none | `public.shop.status='active'` | ✅ |
| Edit shop | none | UPDATE shop name/contact_phone/notes | ✅ |
| Delete shop (dependent-free) | none | DELETE public.shop | ✅ |

Two rules that fall out of 007's reconcile behaviour:
- **Role change must touch Cognito groups**, because the shop service reconciles `shop_staff_role` **from
  the `cognito:groups` claim** on every `GET /shop/v1/me`. Updating only the DB would be reverted on the
  operator's next visit. So role change writes Cognito (the *origin*) **and** the DB (for immediate
  back-office visibility); the two stay convergent.
- **Shop/user status stays platform-owned** and is never written from a token; the shop gate reads it
  authoritatively. Disabling a *user* additionally disables the Cognito account (defense in depth, Q1);
  suspending/disabling a *shop* does **not** touch accounts (the gate's `status='active'` shop term
  refuses).

---

## R6 — Back-office authorization (who may call what)

**Decision**: Two predicates in the `shops` slice, both decided from the **`admin.staff` platform
record** (mirroring 005's `authorizeAdmin`):
- **Read** (`GET` list/detail/roster): `isActiveStaff(sub)` = `admin.staff.status='active'` (any role,
  incl. `csa`).
- **Mutate** (`POST`/`PATCH`/`DELETE`): `isActiveShopManager(sub)` = active **and** role ∈
  {`admin`,`manager`} (spec A1/FR-014). Fail-closed; uniform `forbidden` (403) that discloses nothing.

**Rationale**: reuses 005's record-authoritative gate shape exactly; `csa` gets read-only, management
tier gets mutations. Front-end hides mutating controls for `csa`/role-less as least-privilege UX over
the authoritative backend gate (never instead of it).

**Alternatives considered**: gate on `cognito:groups` — rejected: 005 established the DB record is
authoritative; a claim can be stale/over-broad.

---

## R7 — Audit trail home

**Decision**: Add a general **`admin.audit_log`** table (`id`, `actor_sub`, `action`, `target_type`,
`target_id`, `detail jsonb`, `created_at`). This slice writes shop-management actions to it; a shop's /
user's history view reads from it filtered by `target_type`/`target_id`.

**Rationale**: `ARCHITECTURE.md` designates the `admin` schema as "back-office accounts **+ audit log**"
— a general audit table is its intended home, and shop-management is a back-office action. One general
table avoids a per-feature audit sprawl.

**Alternatives considered**: a shop-specific `public.shop_audit` — rejected: audit of *back-office
actor* activity belongs in the `admin` schema, and a general log serves future back-office features. No
audit at all / logs-only — rejected: FR-016 requires a viewable, queryable history.

---

## R8 — Frontend reuse surface and the minimal additions it forces

**Decision**: Build a new **`apps/back-office/src/features/shops/`** slice (repo/queries/model/screens),
copying the `staff-identity` slice pattern; reuse `ConsoleShell`, the session guard, the query client,
`ErrorState`, and the authed `api` client unchanged. Three shared-package additions are required and
land **in the packages** (Principle II), not in the app:

1. **`@effy/api-client`**: add public **`post`/`patch`/`delete`** methods (today only `get` is public;
   a private `request` already supports a JSON body). One-line delegations.
2. **`@effy/design-system/ui`**: add shadcn primitives the CRUD console needs and the design-system
   doesn't ship yet — **`table`, `dialog`, `alert-dialog`, `select`, `badge`**, and a small **`form`**
   helper — generated into `packages/design-system/src/ui/` and registered in `ui/index.ts` (Radix +
   `class-variance-authority` are already deps). Plus a thin generic **`DataTable`** built on the
   already-installed `@tanstack/react-table`, placed in `@effy/web-kit/console` (shared console chrome
   reusable by future list-heavy consoles).
3. **`@effy/shared-types`** `shop.ts`: add the back-office management DTOs (list item, detail, create/
   update shop, shop user, create/update user) + the `ShopLifecycleStatus` union, and change
   `ShopSummary.isActive` → `status` (R2).

**Rationale**: matches the 007 finding that reusable concerns live in packages; the design-system
genuinely lacked list/CRUD primitives (it shipped 13 read/chrome primitives only), so adding them is
generalization, not forking. New shop capability is added to the back-office surface only; **no shop
audience parity register change** is required (shop management is a back-office capability, not a
shop-audience one), though this slice's backend unblocks the *verification* of existing shop-web
capabilities.

**Alternatives considered**: build table/dialog/form ad hoc inside the app — rejected: Principle II
(shared UI belongs in the design system); shop-web will need the same primitives.

---

## R9 — Telemetry (Principle VII)

**Decision**: Emit PostHog product events through the shared `@effy/web-kit` telemetry for each
mutation — `shop_created`, `shop_updated`, `shop_status_changed`, `shop_deleted`,
`shop_user_provisioned`, `shop_user_role_changed`, `shop_user_status_changed` — carrying **no PII**
(subject id only; never email, code, or token). Web runtime errors already route to PostHog. Backend
handlers use the shared pino logger, logging the actor `sub` and shop id only — never email/name/token
(the shop service already treats email as PII). No new metrics/alerts beyond the per-function
CloudWatch alarms the `serverless.yml` pattern already defines.

**Rationale**: Principle VII requires a user-facing flow to declare its events; back-office events must
be distinguishable and PII-free.

---

## Resolved unknowns

- **DB access**: `@effy/edge-shared` `query`/`withTransaction` (raw SQL, one pooled connection, secrets
  via the Lambda extension). No ORM (Principle VI).
- **New runtime dependency**: `@aws-sdk/client-cognito-identity-provider` added to the admin service
  (permitted — a library within the cold-path standard, not a locked-tech swap).
- **Migration ordering**: this slice's migration is a new forward-only Goose file that runs **after**
  007's `..._shop_staff_rbac.sql` (it alters those tables); the operator applies migrations in order.
- **Scale**: hundreds of shops / low thousands of users → server-side pagination + search/filter in the
  list repository (SQL `LIMIT/OFFSET` or keyset + `ILIKE`/status filter). No client-side full-list load.

# Phase 1 Data Model — 005 Back-Office Web Foundation

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Date**: 2026-07-08

This surface owns **no persistent storage**. "Data model" here = the client **domain models**
(mapped from wire DTOs in each feature's `repo.ts`, never leaked to screens — Principle VI), the
**auth state machine**, and the **config** contract. Wire shapes come from `docs/api/` (the
cross-backend SSOT) and are typed once in `packages/shared-types`.

## 1. Identity & Roles (domain)

Derived from the Amplify session's **access token** (`fetchAuthSession`), not invented client-side.

| Field | Type | Source | Notes |
|---|---|---|---|
| `subject` | `string` | `accessToken.payload.sub` | The only PII permitted in telemetry/logs. |
| `email` | `string` | sign-in input / `id` token if needed | For the greeting; not sent to the backend. |
| `roles` | `BackOfficeRole[]` | `accessToken.payload['cognito:groups']` | May be **absent** → `[]` (role-less). |

```
type BackOfficeRole = 'admin' | 'manager' | 'csa'   // administrator / manager / customer-service
```

- **Validation**: `cognito:groups` may be absent (role-less) or contain unknown strings — filter
  to the known `BackOfficeRole` set defensively (mirrors edge-api's defensive `groups` parse).
- **Uniqueness/identity**: `subject` is the stable account id.
- Role-less (`roles.length === 0`) = admitted to the shell, denied everything privileged (US2/US3).

## 2. Session state machine (the US1 core)

A discriminated union — the unidirectional client state Principle VI wants, expressed as the
value of the **session query** (server-cache-backed), *not* a client store.

```
type SessionState =
  | { status: 'checking' }                                   // initial / refreshing
  | { status: 'signed-out' }                                 // no valid session
  | { status: 'otp-pending'; email: string }                 // signIn issued, awaiting code
  | { status: 'signed-in'; identity: Identity }              // identity.roles carries RBAC
  | { status: 'error'; message: string }                     // uniform, non-technical
```

**Transitions** (each is a mutation or a query settle; no ad-hoc component state):

| From | Event | To |
|---|---|---|
| `checking` | session valid | `signed-in` |
| `checking` | no session | `signed-out` |
| `signed-out` | `signIn(email)` ok → `CONFIRM_SIGN_IN_WITH_EMAIL_CODE` | `otp-pending` |
| `otp-pending` | `confirmSignIn(code)` → `DONE` | `signed-in` |
| `otp-pending` | wrong/expired code | `otp-pending` (+ field error) or `error` |
| `signed-in` | token expiry on a protected call | `checking` → (`signed-in` after refresh \| `signed-out`) |
| any | `signOut()` | `signed-out` |
| any | unrecoverable Amplify error | `error` |

- **Persistence**: Amplify owns token storage + auto-refresh (`fetchAuthSession`; `forceRefresh`
  on demand). The app does **not** persist tokens itself.
- **Guard usage**: protected `beforeLoad` requires `signed-in`; `otp-pending` keeps the user on
  the verify step; `signed-out` redirects to sign-in preserving `next` (FR-004).

## 3. Wire DTOs → domain (mapped in `staff-identity/repo.ts`)

Both come from `edge-api`; typed in `packages/shared-types`.

**Staff-identity read** — `GET /v1/back-office/me` (NEW, FR-005/019) — records + returns the
platform's own staff record (not a token echo):
```
StaffRecordDTO = { subject: string; email: string; roles: string[]; status: 'active'|'disabled'; lastSeenAt: string }
  → StaffRecord = { subject: string; email: string; roles: BackOfficeRole[]; status: 'active'|'disabled' }
```

**Admin-only ping** — `GET /v1/back-office/admin/ping` (NEW, FR-018/020) — authorizes from the DB
record (status active AND role admin), not the token claim:
```
BackOfficeAdminPingDTO = { audience: 'back-office'; scope: 'admin'; subject: string; message: string }
  → AdminPingResult    = { subject: string }         // 200 only reachable by an active admin
```
- Non-admin (`manager`/`csa`), role-less, **or disabled** callers receive **not** a DTO but the
  shared **problem+json** `forbidden` (403) — mapped by `api-client` to a `DomainError` the
  screen renders as the access-denied state (SC-004/SC-012).

## 4. Error contract (domain) — mapped in `packages/api-client`

Mirrors `docs/api/error-envelope.md` (RFC 9457); typed in `shared-types/problem.ts`.

```
ProblemJSON = { type: string; title: string; status: number; detail?: string; instance?: string; ... }
DomainError = { kind: 'unauthenticated'|'forbidden'|'not-found'|'unsupported-version'|'unavailable'|'unknown';
                status: number; title: string; detail?: string }
```
- Mapping rule: `type`/`status` → `kind`; the console **never** shows raw `detail`/stack to the
  user — only human-readable states keyed off `kind` (FR-008). 401 on a protected call →
  session refresh or redirect (not an error toast); 403 → access-denied state; network/5xx/cold
  start → degraded state + retry (FR-009).

## 5. Config (non-secret, build-time) — see [contracts/config.contract.md](./contracts/config.contract.md)

| `VITE_*` key | Meaning | Source |
|---|---|---|
| `VITE_COGNITO_USER_POOL_ID` | admin pool id (region encoded in prefix) | 001 SSM `/effy/dev/auth/back-office/user_pool_id` |
| `VITE_COGNITO_CLIENT_ID` | admin **public** app-client id (no secret) | 001 SSM `/effy/dev/auth/back-office/app_client_id` |
| `VITE_API_BASE_URL` | edge-api HTTP API base URL | 004 deploy output |
| `VITE_POSTHOG_KEY` / `VITE_POSTHOG_HOST` | analytics project key + host (non-secret, optional) | PostHog project |

- **None are secrets** (public client, public API, public analytics key). A **missing required**
  value (`fail-fast` in `lib/amplify.ts`) aborts boot naming the key (FR-014); no value is ever
  committed (`.env.example` carries names only).

## 6. Platform storage — back-office staff & RBAC (`admin` schema, NEW)

The platform's own system of record (FR-019–022). Raw SQL, no ORM; introduced via the 003
forward-only migration (`db/migrations/<ts>_back_office_staff_rbac.sql`) — the first real tables
beyond the baseline shell and the first `db-up`. Normalized RBAC (research F1).

```sql
-- admin.staff — one row per back-office staff member, keyed to the verified subject
admin.staff(
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cognito_sub  text NOT NULL UNIQUE,                 -- verified 'sub' — the JIT join key
  email        text NOT NULL,                        -- account data; NEVER logged/telemetried
  status       text NOT NULL DEFAULT 'active'
               CHECK (status IN ('active','disabled')),   -- platform-owned authz gate
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz
)
-- admin.role — lookup, seeded with the three back-office roles (idempotent seed in the migration)
admin.role(
  key         text PRIMARY KEY CHECK (key IN ('admin','manager','csa')),
  description text
)
-- admin.staff_role — role assignments (many-to-many)
admin.staff_role(
  staff_id   uuid NOT NULL REFERENCES admin.staff(id) ON DELETE CASCADE,
  role_key   text NOT NULL REFERENCES admin.role(key),
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (staff_id, role_key)
)
```

**Operations (in `staff/repository.ts` + `staff/service.ts`):**
- **JIT upsert** (on `GET /me`): `INSERT INTO admin.staff (...) VALUES (...) ON CONFLICT
  (cognito_sub) DO UPDATE SET email=EXCLUDED.email, last_seen_at=now(), updated_at=now()` — the
  idempotency guarantee under concurrent first contact (research F2). Then reconcile
  `admin.staff_role` from the token groups (delete-absent + insert-present) in the same txn.
- **Authorize** (admin gate): `status='active'` AND EXISTS a `staff_role` with `role_key='admin'`
  — read from the DB, not the token (FR-020). A `disabled` row → denied despite a valid token.
- **Roles seeded from Cognito** this slice (`cognito:groups`); status is platform-owned.
  DB-authoritative role *management* is a later slice.

## 7. Entity relationships (conceptual)

```
Amplify session ──(access token)──▶ Identity{subject,roles}
                                         │
                        ┌────────────────┴───────────────┐
                        ▼                                 ▼
                  SessionState                      role-aware nav
              (session query; guards)          (interface layer of US3)
                        │
                        ▼
              api-client (Bearer access token) ──▶ edge-api ──▶ admin.staff / staff_role (DB)
                        │                              ├─ /v1/back-office/me          → StaffRecord (JIT upsert + return)
                        ▼                              └─ /v1/back-office/admin/ping   → AdminPingResult | forbidden
                  DomainError (problem+json)                (authz reads DB: status active AND role admin)
```

No **product** entities exist in this slice — by design (FR-017). The staff/RBAC tables are
platform **account/audit** data (`admin` schema). The first *product* data model arrives with the
first real back-office feature slice, on top of this foundation.

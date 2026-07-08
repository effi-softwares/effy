# Implementation Plan: First Admin Bootstrap (Operator Break-Glass)

**Branch**: `006-first-admin-bootstrap` | **Date**: 2026-07-08 | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md), binding [operator-directives.md](./operator-directives.md),
[research.md](./research.md) (Phase 0), constitution **v1.4.0**, [ARCHITECTURE.md](../../ARCHITECTURE.md).

## Summary

An **operator-run Go CLI** (+ a Makefile target) that establishes the **first back-office
super-administrator** out-of-band — no API, no UI. It performs the two writes the platform's access
control depends on, keeping them consistent (spec FR-006):

1. **Identity provider** — creates the user in the **back-office** Cognito pool (001) as a
   **passwordless, CONFIRMED** account (`AdminCreateUser` with **no password**, `MessageAction=SUPPRESS`,
   `email_verified=true`, `name`), then `AdminAddUserToGroup` → the **`admin`** group. A no-password
   create lands the user in `CONFIRMED` (not `FORCE_CHANGE_PASSWORD`) so they can **EMAIL_OTP sign
   in immediately** — no `AdminSetUserPassword` (research F1/F2).
2. **Platform record** — upserts `admin.staff` (keyed on the returned **`sub`**, with email + name +
   `status='active'`) and `admin.staff_role` (`admin`), via the same DB access the migration
   workflow uses (DSN composed at invocation, never a file). So the admin is **authorized
   immediately** (the 005 DB-backed gate) and auditable.

Lives in the **core-api Go module** — it already has `aws-sdk-go-v2/service/cognitoidentityprovider`
+ `config` (wired in 004, unused until now) and pgx/v5. Adds one small forward migration (a `name`
column on `admin.staff`). **Idempotent / break-glass**: re-running reconciles both systems.

## Technical Context

**Language/Version**: Go **1.26** (the `apis/core-api` module; no new module).

**Primary Dependencies** (all already in `apis/core-api/go.mod` — nothing new):
`aws-sdk-go-v2/config` v1.32.27 · `aws-sdk-go-v2/service/cognitoidentityprovider` v1.63.0 ·
`pgx/v5` · `zap` (structured CLI logging) · stdlib `flag` (or the existing `caarlos0/env`).

**Storage**: PostgreSQL 16 (002 dev DB) — `admin.staff` + `admin.staff_role` (005 schema) plus a
new **`admin.staff.name text`** column (003 forward migration). Raw SQL via pgx (no ORM). DSN
composed at invocation from the 002 SSM contract + Secrets Manager; **never on disk, never echoed**.

**Testing**: `go test` — unit tests for the `sub`-attribute extraction + the upsert SQL mapping
(table-driven, Cognito behind an interface with a fake). The full live run (real Cognito + DB →
sign-in) is the **operator quickstart** pass, not CI.

**Target Platform**: an operator's machine with the platform's `ef` AWS profile + SSM/Secrets/DB
access — the same access `make db-*` and `make edge-deploy` require.

**Project Type**: an **operator CLI** in the core-api module + a Makefile target + one migration.
Not a service, not a request path.

**Performance Goals**: n/a — a one-shot operator command (SC-001: under 5 minutes end to end).

**Constraints**: no public/network surface (no route, no screen); **no password** ever set on the
passwordless pool; the DB record's `cognito_sub` MUST equal the token's `sub` (the 005 join key —
read `sub` from the create response); secrets never echoed/logged; idempotent re-run; operator-run.

**Scale/Scope**: one CLI command (create/reconcile one super-admin), one migration, one make
target, tests. No ongoing admin/staff management (a later back-office feature — spec FR-010).

## Constitution Check

*GATE: PASS (no deviations).*

| Principle | Verdict | Evidence |
|---|---|---|
| **I. Spec-driven** | PASS | spec.md (tech-free) → this plan (cites constitution + research) → tasks next. The one real unknown (passwordless AdminCreateUser status) resolved in research, not guessed. |
| **II. Monorepo & shared contracts** | PASS | Reuses the `apis/core-api` module (its AWS SDK + pgx + config/logger) — no new module, no copy-paste. The `admin` group name + role + the `admin.staff` shape are the **005 schema** (single source); the CLI writes them, never redefines them. |
| **III. Dual-path discipline** | N/A (not a request path) | An **operator CLI**, not a customer/ops request-serving endpoint — the hot/cold path-assignment rule doesn't apply. It lives in the core-api module only to reuse the already-wired Cognito SDK; it exposes no route. |
| **IV. Auth isolation** | PASS (reinforced) | Creates the user **only** in the back-office pool + the `admin` group; touches no other pool. This IS the admin-provisioning mechanism the model requires (no self-signup for privileged audiences). No auth proxy, no token brokering. |
| **V. Design system** | N/A | No UI (by design — FR-001). |
| **VI. Layered architecture & explicit wiring** | PASS | `cmd/create-first-admin/main.go` (flag/env parse → wire) → `internal/adminbootstrap/service.go` (orchestrate) → `cognito.go` (adapter behind an interface) + `repo.go` (raw-SQL upsert). No DI framework; explicit top-down wiring. |
| **VII. Observability & telemetry** | PASS — declaration below | |

**Telemetry declaration (Principle VII)**: the CLI emits **structured logs** (zap) of what it did —
`created` vs `already-exists`, the `sub` (the only identity detail beyond the operator's own input
echo — **no** email/name spilled into logs), the group + DB rows touched. **No secret** (DSN,
tokens) is ever logged or printed. No metrics surface (a one-shot CLI); no product analytics. The
audit trail of the grant lives in `admin.staff` (`created_at`) — spec FR-008.

## Project Structure

### Documentation (this feature)
```text
specs/006-first-admin-bootstrap/
├── spec.md · operator-directives.md · plan.md
├── research.md          # Phase 0 — the passwordless AdminCreateUser sequence (F1–F5)
├── data-model.md        # Phase 1 — the name migration, staff/role upsert, Cognito↔DB sub join, CLI input
├── quickstart.md        # Phase 1 — operator run + verify + re-run/break-glass
├── contracts/
│   ├── cli-command.contract.md    # flags, behavior, exit codes, idempotency
│   └── makefile-target.contract.md# the make target + how it composes DSN + pool id
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)
```text
apis/core-api/
├── cmd/create-first-admin/
│   └── main.go               # parse --email/--name + env (DB_DSN, BACK_OFFICE_POOL_ID, AWS_REGION);
│                             #   wire aws config + cognito client + pgx; call service; structured result
└── internal/adminbootstrap/
    ├── cognito.go            # AdminCreateUser (no password, SUPPRESS, email_verified, name) → {sub, username};
    │                         #   idempotent: UsernameExistsException → AdminGetUser → AdminEnableUser if disabled;
    │                         #   AdminAddUserToGroup(admin). Behind a small interface for testing.
    ├── repo.go               # pgx: upsert admin.staff (cognito_sub, email, name, status='active') ON CONFLICT
    │                         #   + admin.staff_role (staff_id, 'admin') ON CONFLICT — one tx
    ├── service.go            # orchestrate: cognito FIRST (obtain sub) → repo upsert keyed on sub → result
    └── *_test.go             # sub extraction, upsert mapping, idempotent branch (fake cognito + local pg)

db/migrations/<ts>_staff_name.sql   # ALTER TABLE admin.staff ADD COLUMN name text; (forward-only, 003 workflow)

Makefile                     # + create-first-admin (🧑‍💻 OPERATOR): composes DB_DSN (db-dsn.sh) +
                             #   BACK_OFFICE_POOL_ID (SSM /effy/<env>/auth/back-office/user_pool_id) at
                             #   invocation, injects as env, runs `go run ./cmd/create-first-admin --email … --name …`
```

**Structure Decision**: the CLI lives in the **core-api Go module** (`apis/core-api/cmd/` +
`internal/adminbootstrap/`) to reuse its already-wired Cognito SDK + pgx + config/logger — no new
module or deps. It is an auxiliary command, not a hot-path endpoint. The migration follows the 003
workflow; the make target follows the 001/003 operator convention (`AWS_PROFILE=ef`, `ENV=`, DSN at
invocation).

## The one non-obvious mechanic — two systems, kept consistent (spec FR-006)

There is **no transaction across Cognito and the DB**, so consistency is achieved by **ordering +
idempotent reconciliation**:
1. **Cognito first** — `AdminCreateUser` (no password → `CONFIRMED`) returns the stable **`sub`** in
   `User.Attributes` (research F3). `AdminAddUserToGroup(admin)`. Pool is `username_attributes=[email]`,
   so pass `Username=email`; Cognito generates a UUID username (= `sub`); use the returned username
   for the add-to-group call, and read `sub` from the attributes (research F5).
2. **DB second** — upsert `admin.staff` keyed on that exact `sub` (so it matches the token's `sub`
   claim — the 005 gate's join key) + `admin.staff_role('admin')`, in one pgx transaction.
3. **If step 2 fails** after step 1 → partial state (Cognito user exists, no DB record → the person
   could sign in but the DB gate wouldn't authorize). **Recovery = re-run**: `AdminCreateUser` →
   `UsernameExistsException` → `AdminGetUser` (fetch `sub`, status, enabled) → `AdminEnableUser` if
   disabled → `AdminAddUserToGroup` (no-op if member) → DB upsert. Both systems converge (research
   F4). The CLI reports which systems it created vs found-existing.

This is why the tool is **idempotent by design** (FR-004) — it is also the consistency mechanism and
the break-glass path.

## Complexity Tracking

> No constitution deviations. Two items recorded for transparency.

| Item | Note |
|---|---|
| **No cross-system transaction (Cognito + DB)** | Inherent — you can't wrap an AWS API call and a DB write in one transaction. Mitigated by Cognito-first ordering + idempotent re-run reconciliation (mechanic above); a partial failure is fully recoverable by re-running. Documented, not a defect. |
| **`AdminSetUserPassword` deliberately NOT used** | Research F2: a no-password user is already `CONFIRMED` and can EMAIL_OTP; setting a password would create an unwanted credential on a passwordless pool. The only legitimate use (rescuing a user wrongly created *with* a temp password) is out of scope. |

## Phase 1 artifacts

Generated alongside this plan: [research.md](./research.md) · [data-model.md](./data-model.md) ·
[contracts/](./contracts/) (cli-command, makefile-target) · [quickstart.md](./quickstart.md).
Agent context (CLAUDE.md managed block) updated to point here. `/speckit-tasks` derives the tasks.

---

## Amendment D — Account teardown (delete) — 2026-07-08

Adds the destructive counterpart to `create-first-admin`: an operator command/script that
**completely deletes** an admin account (spec US4 / FR-011–016). Same home, same reuse, **zero new
deps, no new migration** — it leans on the existing `admin.staff_role … ON DELETE CASCADE` FK, so
one `DELETE FROM admin.staff` removes the account *and* its role grants.

### Summary

`make delete-admin EMAIL=… ENV=dev` → `apis/core-api/cmd/delete-admin` reusing
`internal/adminbootstrap`. It removes the account from **both** systems, keeps them consistent, is
idempotent, confirmation-gated, and refuses to delete the **last active admin** without an override.

### Technical Context (delta)

- **No new dependencies / no new migration.** `AdminDeleteUser` + `AdminGetUser` are already in the
  imported `cognitoidentityprovider`; the DB side is one `DELETE` (cascade does the rest).
- **New**: `apis/core-api/cmd/delete-admin/main.go` + a `Delete` path in `internal/adminbootstrap`
  (`cognito.go` gains `DeleteAdmin`, `repo.go` gains `DeleteByCognitoSub`/`DeleteByEmail` +
  `CountActiveAdmins`, `service.go` gains `Delete`). A `delete-admin` Makefile target (confirm-gated,
  `FORCE=1` to override the last-admin guard).

### Constitution re-check — still **PASS**

| Principle | Verdict | Note |
|---|---|---|
| I. Spec-driven | PASS | US4/FR-011–016 → this amendment. Delete semantics resolved in research **Part G**. |
| II. Monorepo & shared contracts | PASS | Reuses `internal/adminbootstrap` + the 005 schema (incl. the cascade FK) — no copy, no new schema. |
| III. Dual-path | N/A | Operator CLI, not a request path (as with create). |
| IV. Auth isolation | PASS (reinforced) | Deletes **only** from the back-office pool + its own record; touches no other pool; no new surface. |
| V. Design system | N/A | No UI. |
| VI. Layered & explicit wiring | PASS | `cmd/delete-admin` → `service.Delete` → cognito adapter + repo. |
| VII. Observability | PASS | Structured log of what was removed (email/sub, which systems); **no secrets**. The log is the audit trace for a hard delete (FR-016). |

### The delete mechanic — two hard removals, kept consistent (FR-015)

No cross-system transaction (same as create) → consistency via ordering + idempotent reconciliation:
1. **Resolve** — `AdminGetUser(email)` → the immutable `sub` + the real `username`. If
   `UserNotFoundException`, the Cognito account is already gone (proceed to clean any DB residue).
2. **Guard (FR-014)** — `CountActiveAdmins()`; if the target is an active admin **and** the count is
   1 (it's the last one), **refuse** unless `FORCE=1`, naming the lock-out risk.
3. **Delete identity** — `AdminDeleteUser(username)` (group memberships vanish with the user).
   `UserNotFoundException` → treat as already-gone (idempotent — FR-013).
4. **Delete record** — `DELETE FROM admin.staff WHERE cognito_sub = $sub` (role rows cascade). If the
   `sub` was unresolved (Cognito already gone), fall back to `… WHERE email = $email` to clear
   residue. `0 rows` is a clean "already removed", not an error.
5. **Report** — `{email, sub, cognito: deleted|not-found, staff: deleted|not-found}`.
- **Ordering**: identity **before** record (mirrors create's identity-first symmetry); either residue
  (`Cognito gone / row present`, or `row gone / Cognito present`) is fully reconciled by a re-run,
  since step 1 tolerates a missing user and step 4 always runs + tolerates 0 rows.

### Complexity Tracking (delta)

| Item | Note |
|---|---|
| **Last-admin guard is a count-then-act race in theory** | Two concurrent deletes could both see count=2. Not a real risk here: single operator, run serially, dev. The guard is a safety rail against *accidental* total lockout, not a concurrency control. Bootstrap remains the ultimate recovery. Documented. |
| **Hard delete erases the in-table audit** | Accepted (spec assumption): the structured deletion log is the trace; a durable audit table is future work. |

### Phase 1 artifacts (delta)

Delete design lands in: research **Part G**, data-model **§7 (teardown)**, a new
`contracts/cli-delete-command.contract.md` + a `delete-admin` section appended to
`contracts/makefile-target.contract.md`, and a **Delete** section in quickstart. `/speckit-tasks`
appends a delete phase (the create tasks T001–T017 are unchanged/already done).

# Contract — `create-first-admin` CLI

**Feature**: 006 · **Binary**: `apis/core-api/cmd/create-first-admin` · **Run via**: the
`create-first-admin` make target (never directly by end users) · **Status**: to build.

The operator command that establishes (or reconciles) the first back-office super-admin. No network
surface; reads config from **env** (injected by the make target), never argv secrets.

## Inputs

| Source | Name | Meaning |
|---|---|---|
| flag | `--email` | the new admin's work email (required; validated) |
| flag | `--name` | the new admin's display name (required; non-empty) |
| env | `DB_DSN` | libpq/pgx DSN (composed at invocation; never printed) |
| env | `BACK_OFFICE_POOL_ID` | the back-office Cognito pool id (from SSM) |
| env | `AWS_REGION` | region for the Cognito client |
| env | `EFFY_ENV` | environment label (for the result/log; e.g. `dev`) |

Invalid/missing `--email` (malformed) or `--name` (empty) → **exit non-zero with a clear message,
zero side effects** (validated before any Cognito/DB call — FR-005).

## Behavior (research F2–F5; data-model §3–4)

1. **Cognito** (back-office pool): `AdminCreateUser{ Username: email, MessageAction: SUPPRESS,
   UserAttributes: [email, email_verified=true, name] }` — **no** `TemporaryPassword` → `CONFIRMED`,
   no invite email. Read `sub` (from `User.Attributes`) + `username` (`User.Username`, the UUID).
   Then `AdminAddUserToGroup(username, "admin")`.
   - **Already exists** (`UsernameExistsException`): `AdminGetUser` → read `sub`/status/enabled →
     `AdminEnableUser` if disabled → `AdminAddUserToGroup` (idempotent). (break-glass — FR-004)
2. **DB** (one pgx tx): upsert `admin.staff (cognito_sub=sub, email, name, status='active')` +
   `admin.staff_role('admin')` — both `ON CONFLICT` idempotent (data-model §4).
3. Print + log a structured result (data-model §5): `cognito: created|already-exists`,
   `staff: created|updated`, `sub`. **No** secret/DSN/password/token in output or logs (FR-009).

## Ordering & consistency (FR-006)

Cognito **first** (to obtain the stable `sub`), DB **second** (keyed on that `sub`). No cross-system
transaction exists; a failure after step 1 leaves a recoverable partial state that a **re-run**
reconciles (plan mechanic). The command is safe to re-run any number of times.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | success — the account exists and is a super-admin in both systems (created or reconciled) |
| non-0 | validation failure, or a Cognito/DB error — with a clear message; partial state (if any) is recoverable by re-running |

## Scope

Creates/reconciles the **one** bootstrap super-admin (`admin` group + role). It does **not** list,
update, demote, or delete admins/staff — that is a later back-office capability (FR-010).

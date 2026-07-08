# Operator Directives — 006 First Admin Bootstrap (plan-phase input)

> Per constitution Principle I, `spec.md` stays free of implementation detail. The delivery
> mechanism and the systems this tool touches — the operator's own words — are recorded here as
> binding input to `/speckit-plan`.

## Verbatim directive (this session)

> "we need a way to create the first admin user who has the super admin permission (all the
> permission). to do that we can not have api, or ui element. we need some sort of **make command
> or cli tool** for create the first admin by giving only the initial data (email, name etc..)"

## Decoded (plan-phase)

- **Delivery**: a **Makefile target** (operator entry point, per 001/003 convention:
  `AWS_PROFILE=ef`, `ENV=` selector, interactive-safe) wrapping a small **CLI**. Language/runtime is
  a plan decision — candidates: a Go command under `apis/core-api` (reuses the AWS SDK v2 +
  Cognito Identity Provider client already wired there per 004) or a small Node script reusing the
  edge `admin` service's DB layer. It takes flags/env for `--email`, `--name`, `ENV`; no secrets on
  argv.
- **Two writes, kept consistent (spec FR-006)**:
  1. **Identity provider** — create the user in the **back-office** Cognito pool (001):
     `AdminCreateUser` (email as username/attribute, `email_verified`, **no password / suppress
     invite** since sign-in is EMAIL_OTP), then `AdminAddUserToGroup` → the **`admin`** group.
  2. **Platform record** — upsert `admin.staff` (status `active`, the account's `cognito_sub`,
     email, name) + `admin.staff_role` (`admin`), via the same DB access the migration workflow
     uses (DSN composed at invocation from the 002 SSM contract + Secrets Manager — never a file,
     never echoed). This mirrors the 005 staff schema so the account is authorized immediately +
     auditable.
- **Idempotency**: `AdminCreateUser` on an existing user → treat "already exists" as success and
  ensure group membership + the DB record/status (break-glass restore). DB upsert `ON CONFLICT`.
- **The `cognito_sub`**: obtain it from the create/get-user result so the `admin.staff.cognito_sub`
  matches what the JWT will carry (the 005 join key) — the record must line up with the token, or
  the DB-backed admin gate won't authorize the person.
- **Where it lives**: a new operator tool + Makefile target (e.g. `make create-first-admin
  EMAIL=… NAME=… ENV=dev`); no new service route, no console screen. Depends on 001 (pool), the
  005 `admin.staff`/`role`/`staff_role` schema, and operator AWS/DB access.

## Amendment (2026-07-08) — complete account teardown (delete)

> "modify 006 spec so that we also have script and a command to **completely delete an admin
> account**!" — the destructive counterpart to `create-first-admin`.

- **Delivery**: a second Makefile target + CLI in the same home (`apis/core-api`), e.g.
  `make delete-admin EMAIL=… ENV=dev` → `apis/core-api/cmd/delete-admin` reusing
  `internal/adminbootstrap` (add a `Delete`/teardown path alongside `EnsureAdmin`). Same env
  composition as create (DSN + `BACK_OFFICE_POOL_ID` at invocation, never echoed).
- **Two hard deletes, kept consistent (spec FR-015)**:
  1. **Identity provider** — `AdminDeleteUser` in the back-office pool (look the user up by email;
     for `username_attributes=[email]` pass the email — Cognito resolves it). `UserNotFoundException`
     → treat as already-gone (idempotent — FR-013).
  2. **Platform record** — `DELETE FROM admin.staff WHERE cognito_sub = $1` (or by email if the sub
     isn't known on the delete path); `admin.staff_role` rows cascade via the existing
     `ON DELETE CASCADE` FK (005 schema). Reconcile residue if only one system still has the account.
- **Ordering** (mirror create's consistency reasoning): remove the DB record first *or* Cognito
  first is a `/plan` decision — but the idempotent re-run must converge either way. Likely resolve
  the `sub` (AdminGetUser by email) before deleting so the DB row can be keyed precisely.
- **Last-admin guard (FR-014)**: before deleting, count active `admin`-role staff; if this is the
  last one, **refuse** unless a `FORCE=1`/`--force` override is passed. Clear message naming the
  lock-out risk.
- **Confirmation (FR-012)**: the make target prompts `[y/N]` (like `db-up`/`edge-deploy`) before the
  destructive action; irreversible.
- **Trace (FR-016)**: structured log of what was removed (email/sub, which systems), no secrets.

## Research mandates (reference during `/plan`)

- AWS Cognito **AdminCreateUser** for passwordless (EMAIL_OTP) pools: how to create an
  admin-provisioned user without a password and **without sending the default invite email**
  (`MessageAction=SUPPRESS`), with `email` + `email_verified=true`; then `AdminAddUserToGroup`.
- Confirm the **`sub`** returned by AdminCreateUser is the stable subject the access token will
  carry (the `admin.staff.cognito_sub` join key from 005).

# Quickstart — 006 First Admin Bootstrap

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Date**: 2026-07-08

Operator runbook. 🧑‍💻 = touches live cloud (Cognito + DB) — operator-run per the mode of work.

## Prerequisites
1. `apis/core-api` builds (`make core-lint` green); repo bootstrapped.
2. **🧑‍💻** the `name`-column migration applied: `make db-up ENV=dev` (verify `make db-status`).
3. **🧑‍💻** operator on the 002 DB allowlist; the 001 back-office pool live; `ef` AWS profile.

## Run — create the first super-admin (US1)
```bash
make create-first-admin EMAIL=jane@effy.test NAME="Jane Doe" ENV=dev
```
Expected: a structured result — `cognito: created`, `staff: created`, `role: admin`, a `sub`; **no**
secret/DSN/password in the output. (SC-001: under 5 minutes.)

## Verify (US1 / SC-002 / SC-006)
1. **Both systems agree** (SC-006): the Cognito back-office pool has a `CONFIRMED` user with that
   email in the `admin` group; `admin.staff` has a row with the **same `cognito_sub`**, `name`,
   `status='active'`, and an `admin.staff_role('admin')`.
   ```bash
   # Cognito (read-only):
   AWS_PROFILE=ef aws cognito-idp admin-get-user --user-pool-id <back-office-pool-id> \
     --username jane@effy.test --region ap-southeast-2 --query 'UserStatus'   # → CONFIRMED
   ```
2. **Sign in (the real proof)**: open the back-office console (`make bo-dev`), sign in as
   `jane@effy.test` via the emailed one-time code (no password), and confirm **every** admin-gated
   area is reachable — incl. the admin-only proving area (005) → served, not 403. (SC-002.)

## Re-run / break-glass (US2 / SC-003)
```bash
make create-first-admin EMAIL=jane@effy.test NAME="Jane Doe" ENV=dev   # again
```
Expected: `cognito: already-exists`, `staff: updated`; **exactly one** account/record (no
duplicate); still an active super-admin. If the account had been disabled (platform status), the
re-run restores it to `active` (break-glass). (SC-003.)

## Guardrails (US2 / US3 / SC-004 / SC-005)
- **Bad input** refused with no side effects: `make create-first-admin EMAIL=notanemail NAME="X"` →
  clear error, nothing created. Empty `NAME` likewise.
- **No public surface** (SC-004): confirm there is no API route and no console screen for creating
  the first admin — it exists **only** as this command.
- **Hygiene** (SC-005): `grep -ri "password\|secret\|BEGIN .*PRIVATE" apis/core-api/cmd apis/core-api/internal/adminbootstrap`
  → no literal secret; the command output/logs carry `sub` only, never the DSN/password.

## Tests (developer)
`make core-test` — `internal/adminbootstrap` unit tests: `sub` extraction from a fake
`AdminCreateUser` response, the upsert SQL mapping, and the already-exists reconcile branch (fake
Cognito + local Postgres).

## Delete — complete account teardown (US4, amendment)

Destructive — removes the account from **both** systems. 🧑‍💻 operator-run, confirmation-gated.

```bash
make delete-admin EMAIL=jane@effy.test ENV=dev          # prompts [y/N] — irreversible
```
Expected result: `cognito: deleted`, `staff: deleted`, a `sub`; no secrets in output.

**Verify (SC-007)**: the Cognito back-office pool no longer has that user
(`admin-get-user … → UserNotFoundException`); `admin.staff` has no row for that `sub` (and its
`admin.staff_role` rows are gone via cascade); the person can no longer sign in.

**Idempotent (SC-008)**: re-run for the same email → `cognito: not-found`, `staff: not-found`, clean
exit. Simulate a partial deletion (remove only the Cognito user, or only the DB row) → a re-run
removes the residue; **no** half-deleted state remains.

**Last-admin guard (SC-009)**: with only one active admin left, `make delete-admin EMAIL=<that admin>`
→ **refused**, naming the lock-out risk. `FORCE=1` overrides:
```bash
make delete-admin EMAIL=jane@effy.test ENV=dev FORCE=1
```

**Re-create after delete**: `make create-first-admin EMAIL=jane@effy.test NAME="Jane" ENV=dev` →
a fresh account (new `sub`, new record), proving no stale linkage.

## Done / sign-off
Done when: the migration is applied; `make create-first-admin` establishes an admin who signs in and
reaches every admin area (SC-002); a re-run produces no duplicates (SC-003); both systems agree
(SC-006); no public surface (SC-004) and no secret leakage (SC-005). Not done at "it compiles".

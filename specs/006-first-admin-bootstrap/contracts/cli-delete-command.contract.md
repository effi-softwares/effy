# Contract — `delete-admin` CLI (amendment 2026-07-08)

**Feature**: 006 (US4) · **Binary**: `apis/core-api/cmd/delete-admin` · **Run via**: the
`delete-admin` make target · **Status**: to build.

The destructive counterpart to `create-first-admin` — **completely removes** a back-office admin
account from both systems. Confirmation-gated, idempotent, last-admin guarded. No network surface.

## Inputs

| Source | Name | Meaning |
|---|---|---|
| flag | `--email` | the account to delete (required; validated) |
| flag | `--force` | override the last-admin guard (from `FORCE=1`) |
| env | `DB_DSN` | pgx DSN (composed at invocation; never printed) |
| env | `BACK_OFFICE_POOL_ID` | back-office Cognito pool id (SSM) |
| env | `AWS_REGION` / `EFFY_ENV` | region / env label |

Invalid/missing `--email` → exit non-zero, **no side effects**.

## Behavior (research G1–G4; data-model §7)

1. **Resolve** — `AdminGetUser(email)` → `sub` + `username`. `UserNotFoundException` → Cognito
   already gone (continue to clean DB residue).
2. **Last-admin guard (FR-014)** — `CountActiveAdmins()`; if target is an active admin **and**
   count == 1 → **refuse** (clear message naming the lock-out risk) unless `--force`.
3. **Delete identity** — `AdminDeleteUser(username)`; `UserNotFoundException` → already-gone.
4. **Delete record** — `DELETE FROM admin.staff WHERE cognito_sub = $sub` (role rows cascade);
   fallback `WHERE email = $email` if `sub` unresolved. `0` rows = "already removed".
5. Print + log a structured result: `cognito: deleted|not-found`, `staff: deleted|not-found`, `sub`.
   **No** secret/DSN in output or logs (FR-016 — this log is the audit trace for a hard delete).

## Consistency (FR-015)

No cross-system transaction; identity-first ordering + idempotent re-run reconciles any residue.
Safe to re-run any number of times.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | success — the account is gone from both systems (or was already gone) |
| non-0 | validation failure, **last-admin guard triggered** (without `--force`), or a Cognito/DB error — clear message; any residue is recoverable by re-running |

## Scope

Deletes **one** named account. It does not list/bulk-delete/demote — those are a later back-office
capability (FR-010). Irreversible: requires confirmation (via the make target — FR-012).

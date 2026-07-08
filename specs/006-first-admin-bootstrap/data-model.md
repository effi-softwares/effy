# Phase 1 Data Model — 006 First Admin Bootstrap

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Date**: 2026-07-08

The CLI reads minimal input and writes two systems (Cognito + the `admin` schema), joined on `sub`.

## 1. CLI input (operator-supplied)

| Field | Rule | Used for |
|---|---|---|
| `email` | required; well-formed email (FR-005) | Cognito `Username` + `email` attribute; `admin.staff.email` |
| `name`  | required; non-empty (FR-005) | Cognito `name` attribute; `admin.staff.name` |
| `ENV`   | via the make target (`dev` default) | which environment's pool + DB |

No secrets on the command line — DSN + pool id are composed into **env** by the make target
(contracts/makefile-target).

## 2. Schema change (003 forward migration)

`db/migrations/<ts>_staff_name.sql`:
```sql
-- +goose Up
ALTER TABLE admin.staff ADD COLUMN name text;   -- nullable: existing JIT rows (005) have no name;
                                                 -- the bootstrap sets it. No default needed.
-- +goose Down
ALTER TABLE admin.staff DROP COLUMN name;        -- dev-iteration only (003 forward-only in higher envs)
```
Everything else in `admin.staff` / `admin.role` / `admin.staff_role` is the **005 schema, unchanged**
(id uuid, `cognito_sub` unique, email, status active/disabled, timestamps; roles seeded admin/manager/csa).

## 3. The Cognito ↔ DB join (the critical invariant)

```
Cognito back-office pool                     admin schema (platform record)
─────────────────────────                    ──────────────────────────────
AdminCreateUser(email,name,no-password)      admin.staff
  → CONFIRMED, email_verified                  cognito_sub = <sub from Cognito>   ← MUST match
  → sub  (immutable; = access-token sub)       email       = <email>
  → username (UUID = sub)                       name        = <name>
AdminAddUserToGroup(username, "admin")         status      = 'active'
                                              admin.staff_role(staff_id, 'admin')
```
**Invariant (FR-006)**: `admin.staff.cognito_sub` == the `sub` Cognito assigned == the `sub` the
access token will carry. Read `sub` from the `AdminCreateUser` response and key the DB row on it. If
these ever diverge, the person signs in but the 005 DB-backed admin gate refuses them.

## 4. DB writes (one pgx transaction — `internal/adminbootstrap/repo.go`)

```sql
-- upsert the staff row (idempotent on the unique cognito_sub); ensure active + name/email current
INSERT INTO admin.staff (cognito_sub, email, name, status)
     VALUES ($1, $2, $3, 'active')
ON CONFLICT (cognito_sub)
  DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name,
                status = 'active', updated_at = now()
  RETURNING id;

-- grant the admin role (idempotent)
INSERT INTO admin.staff_role (staff_id, role_key) VALUES ($1, 'admin')
ON CONFLICT DO NOTHING;
```
- Re-run safety: `ON CONFLICT` makes both writes idempotent; a disabled super-admin is restored to
  `status='active'` (break-glass — FR-004 / spec edge case).

## 5. Result (structured, logged + printed — no secrets)

```
{ email, sub, cognito: "created" | "already-exists", group: "admin", staff: "created" | "updated", role: "admin" }
```
Logs carry `sub` only as the identity detail; **no** password/DSN/token ever printed (FR-009).

## 6. Entities → storage

- **Back-Office Super-Admin** → a Cognito user (back-office pool, `admin` group) + an `admin.staff`
  row (`status='active'`) + an `admin.staff_role('admin')` row.
- **First-Admin Bootstrap** → the operator command run; its audit trace is `admin.staff.created_at`
  (FR-008).
- **Initial Admin Data** → the `email` + `name` inputs.

No product (`public`) tables are touched — this is `admin`-schema account data only.

## 7. Account teardown — delete (amendment 2026-07-08)

**No schema change.** Delete leans on the existing `ON DELETE CASCADE` FK (§2 / research G2).

**Input**: `email` (required, validated) + `ENV` + optional `FORCE` (override the last-admin guard).

**Flow** (`internal/adminbootstrap` `Delete`; research G1–G4; plan Amendment D):
```
1. resolve   AdminGetUser(email) → sub, username        (UserNotFoundException → cognito already gone)
2. guard     CountActiveAdmins() == 1 && target is it   → refuse unless FORCE=1        (FR-014)
3. cognito   AdminDeleteUser(username)                   (UserNotFoundException → skip; groups vanish)
4. record    DELETE FROM admin.staff WHERE cognito_sub = $sub   -- cascade removes staff_role
             ( fallback WHERE email = $email if sub unresolved; 0 rows = "already removed" )
5. result    { email, sub, cognito: "deleted"|"not-found", staff: "deleted"|"not-found" }
```

**Guard query** (research G3):
```sql
SELECT count(DISTINCT s.id)
  FROM admin.staff s JOIN admin.staff_role r ON r.staff_id = s.id
 WHERE r.role_key = 'admin' AND s.status = 'active';
```

**Consistency invariant (FR-015)**: after a successful run the account is absent from **both**
systems. A partial failure leaves recoverable residue (row without user, or user without row) that a
**re-run** removes — step 1 tolerates a missing user, step 4 always runs and tolerates 0 rows.

**Result logging**: `sub` + which systems were removed; no email/secret in logs (the deletion trace
— FR-016). No `public` tables touched.

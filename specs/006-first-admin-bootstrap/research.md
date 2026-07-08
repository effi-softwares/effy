# Phase 0 Research — 006 First Admin Bootstrap

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Date**: 2026-07-08

One internet research pass (AWS Cognito docs + SDK Go v2 + re:Post), plus in-repo verification of
the 001 pool config. Decisions cited **F#** in plan.md.

## Part F — Creating a passwordless, immediately-usable admin in Cognito

**F1 — `FORCE_CHANGE_PASSWORD` would wedge the user; avoid it by creating NO password.** That status
only occurs when the user **has a password**; the user then must complete a `NEW_PASSWORD_REQUIRED`
challenge (a password flow) on first sign-in. The 001 back-office app client enables **only**
`ALLOW_USER_AUTH` + `ALLOW_REFRESH_TOKEN_AUTH` (no password flows), so such a user would be stuck.
Fix: create the user **without a password** — AWS: *"When you create users without passwords, they
immediately go into a `CONFIRMED` state,"* and a `CONFIRMED` user with a verified email can EMAIL_OTP
sign in. (docs: how-to-create-user-accounts → "Create users without passwords".)

**F2 — Sequence: TWO admin calls; `AdminSetUserPassword` NOT used.** For a passwordless pool
`AdminCreateUser` makes `TemporaryPassword` optional and instructs you to omit it (*"To create a
user with no password, omit this parameter."*). So:
1. `AdminCreateUser{ UserPoolId, Username: <email>, MessageAction: SUPPRESS, UserAttributes: [
   email, email_verified="true", name ] }` — **no `TemporaryPassword`** → user is `CONFIRMED`, no
   invite email. (Passwordless users must have values for any pool-**required** attributes; `name`
   is a standard optional attribute — fine to set.)
2. `AdminAddUserToGroup{ UserPoolId, Username: <username from step 1>, GroupName: "admin" }`.
- **Decision: skip `AdminSetUserPassword`.** It's an admin op that *would* work regardless of the
  client's auth flows and *would* move a `FORCE_CHANGE_PASSWORD` user to `CONFIRMED` — but a
  no-password user is *already* `CONFIRMED`, and calling it would plant an **unwanted password** on a
  passwordless-only pool. Reserve it solely for rescuing a user wrongly created *with* a temp
  password (out of scope). (docs: AdminCreateUser, AdminSetUserPassword API refs.)

**F3 — Read `sub` from the create response** (`User.Attributes`, name `"sub"`) — no follow-up
`AdminGetUser` needed on the create path. `sub` is **immutable within the pool** and **equals the
`sub` claim** the access token carries (AWS: *"the `sub` attribute has a fixed value"*; *"the only
consistent indicator of your user's identity"*). This is the DB join key — `admin.staff.cognito_sub`
MUST equal it, or the 005 DB-backed admin gate won't recognize the person.

**F4 — Idempotent / break-glass re-run.** `AdminCreateUser` raises **`UsernameExistsException`** if
the user exists (type-assert the SDK error, don't string-match). Re-run branch:
`AdminGetUser` (read `sub`, `UserStatus`, `Enabled`) → `AdminEnableUser` if `Enabled==false` →
`AdminAddUserToGroup` (a **no-op** when already a member — returns 200; docs are silent so treat as
safe-to-call, or `AdminListGroupsForUser` first defensively) → DB upsert. Both systems converge.

**F5 — Username vs email (in-repo: `username_attributes = ["email"]`, verified in
`infra/modules/cognito-user-pool/main.tf`).** Pass **`Username = email`** on create; Cognito
auto-populates the `email` attribute and **generates an opaque UUID as the real `username`, equal to
`sub`**. Use the **returned `User.Username`** (the UUID) for `AdminAddUserToGroup`/`AdminGetUser`;
read `sub` from the `sub` attribute; **key the DB off `sub`**, never the email. EMAIL_OTP sign-in by
email works because the `email` attribute is set + verified.

**Definitive sequence (SDK Go v2, `service/cognitoidentityprovider`):**
```
AdminCreateUser{ Username: email, MessageAction: SUPPRESS,
                 UserAttributes: [email, email_verified=true, name] }   // no TemporaryPassword → CONFIRMED
  → sub := resp.User.Attributes["sub"];  username := *resp.User.Username
AdminAddUserToGroup{ Username: username, GroupName: "admin" }
// re-run: AdminCreateUser → UsernameExistsException → AdminGetUser → AdminEnableUser? → AdminAddUserToGroup
```

**Sources**: docs.aws.amazon.com Cognito — AdminCreateUser, AdminSetUserPassword, AdminAddUserToGroup
API refs; developerguide how-to-create-user-accounts (create users without passwords),
user-pool-settings-attributes (sub / username_attributes / aliases), using-the-access-token;
re:Post cognito-passwordless-authentication.

## Part G — Completely deleting an admin (amendment 2026-07-08)

**G1 — Cognito hard delete.** `AdminDeleteUser{ UserPoolId, Username }` permanently deletes the user
(their group memberships disappear with them — no separate remove-from-group needed). For the
`username_attributes=["email"]` pool the **email works as the `Username`** in admin lookups/deletes
(F5); the robust path is `AdminGetUser(email)` first to resolve the immutable `sub` + the real
`username`, then `AdminDeleteUser(username)`. **Idempotency**: a missing user raises
`UserNotFoundException` (type-assert the SDK error) → treat as already-gone, not an error (FR-013).

**G2 — DB hard delete via the existing cascade.** `admin.staff_role.staff_id REFERENCES
admin.staff(id) **ON DELETE CASCADE**` (verified in the 005 migration) — so `DELETE FROM admin.staff
WHERE cognito_sub = $1` removes the account **and** all its role grants in one statement. Key on the
resolved `sub` (unique); fall back to `WHERE email = $1` only to clear residue when the Cognito user
was already gone. `0` rows affected = "already removed" (clean, not an error). **No new migration.**

**G3 — Last-admin guard.** Count active admins:
`SELECT count(DISTINCT s.id) FROM admin.staff s JOIN admin.staff_role r ON r.staff_id = s.id
WHERE r.role_key = 'admin' AND s.status = 'active';` — if the target is an active admin and the count
is `1`, refuse unless `FORCE=1` (FR-014). A count-then-act race is irrelevant here (single operator,
serial, dev); the guard is an accident rail, not a concurrency control.

**G4 — No cross-system transaction.** As with create, consistency is ordering + idempotent re-run
(plan Amendment D mechanic): resolve → guard → delete Cognito → delete DB; any partial residue is
reconciled by re-running. **Sources**: AWS Cognito AdminDeleteUser / AdminGetUser API refs.

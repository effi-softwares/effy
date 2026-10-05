# Operator tools (`@effy/edge-ops`)

Three commands an operator runs **by hand, from a workstation, through `make`**. They are **not a
service**: there is no `serverless.yml`, nothing here is deployed, and nothing calls them.

| Command | What it does |
|---|---|
| `make create-first-admin EMAIL=… NAME="…" ENV=dev` | Bootstrap (or recover) a back-office super-admin |
| `make delete-admin EMAIL=… ENV=dev [FORCE=1]` | Completely remove a back-office admin — irreversible, asks first |
| `make load-localities ENV=dev [CSVREL=path]` | Load the AU suburb / postcode reference data — idempotent |

Until feature 070 these were Go programs inside the retired `core-api` backend. Their behaviour,
arguments, output and confirm prompts are unchanged; only the language moved.

⚠ **The email is always an argument you type.** No tool here defaults an address from the
environment, the git user or anything else the machine exposes.

⚠ **They act on LIVE systems** (the identity provider and the environment's database), with the
operator's own credentials. Claude writes them and never runs them.

Tests: `pnpm --filter @effy/edge-ops test` (add `CONTAINER_TESTS=1` for the real-schema suite).

---

# `create-first-admin` — bootstrap the first back-office super-admin

An **operator-only** command that creates the **first** back-office administrator (all permissions)
out-of-band. There is deliberately **no API and no UI** for this: the back-office console needs an
admin to sign in, and the platform forbids self-signup for privileged audiences — so the very first
admin must be minted from the command line. (Spec: [`specs/006-first-admin-bootstrap`](../../../specs/006-first-admin-bootstrap/).)

Use it once to make the console usable — and again any time as an **emergency break-glass** if you
ever end up locked out.

---

## What it does

Two writes, kept consistent:

1. **Cognito** (back-office pool) — creates a **passwordless, confirmed** user (`email`, `name`,
   `email_verified`, no invite email, **no password**) and adds them to the **`admin`** group. A
   no-password user is immediately usable via email one-time-code sign-in.
2. **Platform record** — upserts an **active** `admin.staff` row + an `admin.staff_role('admin')`
   grant, keyed on the user's Cognito `sub`. This is what the console's admin gate authorizes
   against.

It is **idempotent**: running it again for the same email does not duplicate anything — it
recognizes the existing account, re-asserts the admin role, and restores it to active if it had been
disabled.

---

## Prerequisites (one-time)

- You can run the platform's operator commands (the `ef` AWS profile; the same access as
  `make db-*` / `make edge-deploy`), and your IP is on the dev DB allowlist.
- The back-office Cognito pool (001) and the dev DB (002) are live.
- The `admin.staff.name` migration is applied:
  ```bash
  make db-up ENV=dev        # applies db/migrations/*_staff_name.sql
  make db-status ENV=dev    # confirm it shows applied
  ```
  > `db-up` refuses if migration files are uncommitted (the 003 commit-guard). Commit the slice
  > first, or pass `FORCE=1` while iterating privately.

---

## Usage

```bash
make create-first-admin EMAIL=you@effy.test NAME="Your Name" ENV=dev
```

- `EMAIL` — the admin's work email (they sign in with it). Required, validated.
- `NAME` — the admin's display name. Required. **Quote it** if it contains spaces.
- `ENV` — environment (defaults to `dev`).

The make target composes the DB connection string and the pool id at invocation (from SSM +
Secrets Manager) and passes them as environment — **no secrets on the command line, nothing echoed.**

### Expected output (success)

```json
{
  "email": "you@effy.test",
  "sub": "a1b2c3d4-....",
  "cognito": "created",
  "group": "admin",
  "staff": "created",
  "role": "admin"
}
```
`cognito`/`staff` read `already-exists`/`updated` on a re-run. Exit code `0` on success, non-zero
on any error (with a clear message; a partial failure is recoverable by re-running).

---

## Verify it worked

1. **Sign in** — start the console (`make bo-dev`), enter the email, submit the one-time code from
   your inbox (no password), and confirm you can reach **every** admin area (including the
   admin-only screen — it should render, not show "access denied").
2. **Spot-check the record** (optional):
   ```bash
   AWS_PROFILE=ef aws cognito-idp admin-get-user \
     --user-pool-id "$(AWS_PROFILE=ef aws ssm get-parameter --name /effy/dev/auth/back-office/user_pool_id --query Parameter.Value --output text)" \
     --username you@effy.test --region ap-southeast-2 --query 'UserStatus'   # → "CONFIRMED"
   ```
   And in the DB, `admin.staff` has your row (`status = 'active'`) with an `admin.staff_role`.

---

## Re-run / break-glass

Safe to run any number of times:

- **Re-run same email** → `cognito: already-exists`, `staff: updated`; still exactly one account.
- **Locked out?** If the account was disabled (e.g. `UPDATE admin.staff SET status='disabled' …`),
  re-running restores it to `active` and re-asserts the `admin` role and Cognito group — your
  break-glass recovery.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `invalid email …` / `name is required` | Input validation — nothing was created. Fix the flags and re-run. |
| `missing required env: BACK_OFFICE_POOL_ID, DB_DSN, AWS_REGION` | You ran the script directly. Use `make create-first-admin` — it composes these for you. |
| `db-up BLOCKED: uncommitted changes` | Commit the migration (003 commit-guard), or `FORCE=1` for private iteration. |
| `cannot read back-office pool id from SSM` | The 001 pool isn't provisioned for `ENV`, or your `ef` profile can't read SSM. |
| DB connection refused / timeout | Your IP isn't on the dev DB allowlist (002), or the DB is stopped (`make dev-start`). |
| Signed in but "access denied" on admin screens | The `admin.staff.cognito_sub` must equal the token `sub`. Re-run the command (it reconciles); confirm the migration is applied. |

---

## Notes

- **No password is ever set** — the pool is passwordless (email OTP). Creating the user without a
  password is what lets them sign in immediately; setting one would be counter-productive.
- **Scope**: this tool only bootstraps the first/break-glass super-admin. Creating and managing
  *additional* admins and staff is a future back-office feature, not this command.
- **Audit**: every grant is on the record — `admin.staff.created_at`. The result is printed to you
  and logged nowhere; it contains your own input and no secret.

---

# `delete-admin` — remove a back-office admin completely

```bash
make delete-admin EMAIL=you@effy.test ENV=dev
```

Asks for confirmation, then deletes the user from the back-office pool **and** their `admin.staff`
record (role grants go with it). Safe to re-run: whatever is already gone reports `not-found`.

⚠ It **refuses to delete the last active administrator** — that would leave nobody able to sign in
to the back office. `FORCE=1` overrides, for tearing an environment down.

# `load-localities` — the address reference data

```bash
make load-localities ENV=dev                       # db/reference/au-localities.csv
make load-localities ENV=dev CSVREL=path/to.csv    # another file, relative to the repo root
```

Upserts on (name, state, postcode), so a second run changes nothing. A row the table refuses — an
unknown state, a postcode that is not four digits — **fails the load and names the row**: the file
is the source of truth, and silently skipping a row would hide a corrupt one.

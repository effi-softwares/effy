# Quickstart: Run & Validate the Migration Workflow

Operator guide (you run every `db-up`/`db-down` — Claude never does). Proves the slice:
status → apply the baseline → idempotency → atomic-failure demo → dev down/up loop →
credential hygiene. Total time well under SC-001's 5 minutes once prerequisites exist.

## Prerequisites

- 002 applied and reachable: your IP is in `db_allowed_cidrs` (`make plan ENV=dev` clean).
- Tools: `brew install goose` (v3+), AWS CLI v2 with the `ef` profile. (`psql` optional,
  for eyeballing.)

## Step 1 — Status before anything (read-only)

```sh
make db-status ENV=dev
```

**Expected**: connects, shows the baseline migration as **Pending**. (First contact with
the DB — if it hangs/fails, your IP is not on the 002 allowlist.)

## Step 2 — Apply the baseline (US1 / SC-006)

```sh
make db-up ENV=dev        # shows env + endpoint, asks y/N — type y
```

**Expected**: the `<timestamp>_baseline_admin_schema` migration applies; goose prints OK.
Verify both truths (SC-003):

```sh
make db-status ENV=dev    # baseline now “Applied At: …”
# optional, via psql using the 002 contract-connect recipe (002 quickstart Step 4):
#   \dn        → the admin schema exists
#   select * from goose_db_version;   → one row for the baseline
```

## Step 3 — Idempotency (SC-002)

```sh
make db-up ENV=dev        # confirm again
```

**Expected**: "no migrations to run" — zero work, exit 0.

## Step 4 — Atomic failure demo (FR-008 / SC-005)

```sh
make db-new name=failure_demo
# Edit the new file: Up = CREATE TABLE public.failure_demo(id int); INVALID SQL HERE;
make db-up ENV=dev FORCE=1        # FORCE: the file is deliberately uncommitted
```

**Expected**: goose reports the SQL error; then verify **nothing** half-applied:
`make db-status ENV=dev` shows the demo migration still pending, and
`public.failure_demo` does **not** exist (the transaction rolled back — byte-for-byte
unchanged schema). Then delete the demo file (it was never applied, never committed):

```sh
rm db/migrations/*_failure_demo.sql
```

## Step 5 — The dev iteration loop (US3 / db-down)

```sh
make db-down ENV=dev      # steps back exactly ONE (the baseline); confirm
make db-status ENV=dev    # baseline pending again; admin schema gone
make db-up   ENV=dev      # re-apply; back to Step 2 state
```

Also verify the guard: `make db-down ENV=qa` → refused (dev-only, forward-only law).

## Step 6 — Credential hygiene (SC-004)

```sh
git grep -iE 'password|GOOSE_DBSTRING' -- ':!specs' ':!*.md'   # no credential material in code
ls ~/.pgpass 2>/dev/null                                        # nothing written
```

Also confirm no DSN/password appeared in any command output above (recipes are silent by
design — the DSN lives only inside the goose process env).

## Authoring reference

Day-to-day flow (full guide: `db/README.md`):

```sh
make db-new name=create_products_table   # scaffold, edit SQL, commit
make db-status ENV=dev                   # review pending
make db-up ENV=dev                       # operator applies
```

Law of the land: committed before applied; applied ⇒ immutable; broken ⇒ fix **forward**;
`db-down` is only for iterating on your own latest unshipped migration in dev.

---

### Not covered here (later slices)

- Higher-env migration gates (no down at all, CI-run applies) — at promotion.
- App-scoped DB roles / least-privilege migration credential — first consumer slice.
- Checksum detection of committed-after-apply edits — promotion hardening (research D7).

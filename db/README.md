# db — schema migrations (Goose)

The platform's **single source of schema truth**, shared by both future backends (Go hot
path, Node cold path). Raw SQL only, **forward-only**, applied with
[Goose](https://github.com/pressly/goose) through the root Makefile. Feature docs:
[specs/003-db-migrations](../specs/003-db-migrations/spec.md) · format law:
[migration-format.contract.md](../specs/003-db-migrations/contracts/migration-format.contract.md).

## Commands (from the repo root)

```sh
make db-new name=create_products_table   # scaffold db/migrations/<timestamp>_<name>.sql
make db-status ENV=dev                   # applied vs pending (read-only)
make db-up     ENV=dev                   # 🧑‍💻 operator: apply all pending (confirm prompt)
make db-down   ENV=dev                   # 🧑‍💻 operator: step back ONE — dev-only
```

Connection details are composed **at invocation** from the platform contract
(SSM `/effy/<env>/db/*` + the Secrets Manager master secret) by
`infra/scripts/db-dsn.sh` — there is nothing to configure locally and nothing secret ever
touches disk or output. Prerequisites: `brew install goose`, AWS CLI with the `ef`
profile, and your IP on the dev DB allowlist (`db_allowed_cidrs`, see
[infra/envs/README.md](../infra/envs/README.md)).

## Authoring a migration

1. `make db-new name=<snake_case_title>` — never hand-name files; the timestamp prefix is
   the ordering.
2. Write the `-- +goose Up` section: **one logical change**, PostgreSQL 16 SQL, schema-
   qualified names (`public.…` / `admin.…`) once product tables exist. State the owning
   feature slice in a leading comment.
3. Write the `-- +goose Down` section: the **exact reversal** when cheaply reversible
   (`CREATE …` → `DROP …`). When reversal would lose data, write a loud no-op instead:
   `SELECT 1; -- irreversible: fix forward (<slice>)` — `db-down` must never destroy data
   silently.
4. **Commit before applying.** `db-up` refuses uncommitted migration changes (`FORCE=1`
   exists only for privately iterating on your own latest, unshipped migration).
5. `make db-status ENV=dev` to review pending → the **operator** runs `make db-up ENV=dev`.

Each migration runs in its own transaction (goose default): if it fails, nothing
half-applies and the ledger stays unmarked — fix and go forward. A migration that cannot
run in a transaction (`CREATE INDEX CONCURRENTLY`, …) must carry
`-- +goose NO TRANSACTION` and gets extra review scrutiny.

## The law (short version)

- **Applied ⇒ immutable.** Once a migration has run beyond your own iteration loop, its
  file is frozen. Fixes are NEW migrations.
- **Forward-only.** `db-down` is a single-step, dev-only convenience for polishing your
  latest unshipped migration. It is not rollback; higher envs will not even have it.
- **The ledger (`public.goose_db_version`) is never hand-edited.**
- **No secrets, ever** — not in migrations, not in this directory.

## Operator runbook

| Situation | Do |
|---|---|
| Apply pending | `make db-up ENV=dev` → review env+host in the prompt → `y` |
| Check state | `make db-status ENV=dev` (matches `select * from goose_db_version;`) |
| A migration failed | Nothing was applied (transaction). If it never shipped: fix the file (your iteration loop) and re-run. If it shipped: author a NEW corrective migration. |
| Connection hangs/fails | Your IP is not on the dev allowlist (002), or dev isn't provisioned — see the fast-fail message. |
| Recreate dev from scratch | `make destroy ENV=dev` + `make apply ENV=dev` (002), then `make db-up ENV=dev` replays the full history. |

Validation walkthrough for this slice:
[specs/003-db-migrations/quickstart.md](../specs/003-db-migrations/quickstart.md).

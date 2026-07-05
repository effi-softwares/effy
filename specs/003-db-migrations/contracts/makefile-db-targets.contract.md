# Contract: Root Makefile — `db-*` command surface

Extends the 001 Makefile contract with the database migration targets. Same laws: every
target wraps `AWS_PROFILE=ef`; mutating targets are **operator-run** with interactive
confirmation; `ENV` defaults to `dev`.

## Invocation

```
make db-new    name=<snake_case_title>     # scaffold a migration (local, no AWS)
make db-status ENV=<env>                   # applied vs pending (read-only)
make db-up     ENV=<env>                   # 🧑‍💻 apply all pending (confirm prompt)
make db-down   ENV=<env>                   # 🧑‍💻 step back ONE (dev-only, confirm prompt)
```

## Behaviour

| Target | Expands to (conceptually) | Guards & properties |
|---|---|---|
| `db-new` | `goose -dir db/migrations create $(name) sql` | fails without `name=`; timestamp filename; Up/Down annotations scaffolded |
| `db-status` | `GOOSE_DBSTRING=$$(db-dsn.sh $(ENV)) goose status` | read-only; missing `/effy/<env>/db/*` params ⇒ fast, named failure (env guard) |
| `db-up` | `… goose up` | (1) aborts if tracked files under `db/migrations/` have uncommitted changes (`FORCE=1` overrides, for private dev iteration); (2) prints env + endpoint, requires `y` |
| `db-down` | `… goose down` | **refuses unless `ENV=dev`** (forward-only law); exactly one step; prints env + endpoint, requires `y` |

## Credential handling (SC-004)

- DSN composed by `infra/scripts/db-dsn.sh <env>` at invocation: SSM
  `/effy/<env>/db/{endpoint,port,name,master_username}` + Secrets Manager password (ARN
  from `/effy/<env>/db/master_secret_arn`), libpq keyword format, `sslmode=require`.
- Enters goose via the `GOOSE_DBSTRING` **process environment variable** only — never
  argv, never echoed (`@`-prefixed recipes), never written to any file.
- No caching: every invocation re-reads the contract (rotation-safe by construction).

## Guarantees

- **Forward-only, structurally**: the only rewind is `db-down` — single-step and
  physically scoped to dev. No reset/mass-rollback target exists.
- **Idempotent apply**: `db-up` with nothing pending exits 0 reporting no work (SC-002).
- **Human-in-the-loop**: `db-up`/`db-down` are operator-run and prompt before touching the
  database (FR-007), mirroring terraform's interactive approval.
- **Env scoping needs no maintenance**: an unprovisioned env has no `/effy/<env>/db/*`
  contract, so its targets fail fast by construction (research D9).

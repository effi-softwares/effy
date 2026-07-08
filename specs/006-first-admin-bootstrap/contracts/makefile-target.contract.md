# Contract — `create-first-admin` Makefile target

**Feature**: 006 · **Target**: `create-first-admin` · **Convention**: 001/003 operator targets
(`AWS_PROFILE=ef` wrapper, `ENV=` selector, secrets composed at invocation — never a file, never
echoed). 🧑‍💻 **OPERATOR** (mutates Cognito + the DB).

## Usage
```bash
make create-first-admin EMAIL=jane@effy.test NAME="Jane Doe" ENV=dev
```

## What it does (composition at invocation)
- Requires `EMAIL` + `NAME` (errors with usage if missing).
- Composes **`DB_DSN`** via `infra/scripts/db-dsn.sh $(ENV)` (the 003 pattern — SSM `/effy/<env>/db/*`
  + Secrets Manager, libpq form) → process env only.
- Fetches **`BACK_OFFICE_POOL_ID`** from SSM `/effy/<env>/auth/back-office/user_pool_id`
  (the 001 contract) via the `AUTH_PARAM_CMD` helper.
- Runs the CLI with those as env + the flags:
  ```
  EFFY_ENV=$(ENV) DB_DSN="$$DSN" BACK_OFFICE_POOL_ID="$$POOL_ID" AWS_REGION=$(AWS_REGION) \
    AWS_PROFILE=$(AWS_PROFILE) go run ./cmd/create-first-admin --email "$(EMAIL)" --name "$(NAME)"
  ```
  (run from `apis/core-api`; `go run` builds+runs — no separate build step needed for an operator tool).

## Invariants
- **Secrets never on argv / never echoed**: `DB_DSN` (which contains the DB password) enters only as
  process env, exactly as `make db-*`/`core-run` do; the make recipe does not print it. `EMAIL`/`NAME`
  are non-secret operator inputs.
- **Prerequisites**: the `name`-column migration applied (`make db-up ENV=dev`), the operator on the
  002 DB allowlist, and the 001 back-office pool live. Same access as `make db-*`.
- **Per-env**: `ENV` selects the pool + DB; the target names the env in its output; it never acts on
  a different environment than asked.
- **Add to `.PHONY`** alongside the other operator targets.

## `delete-admin` target (amendment 2026-07-08)

```bash
make delete-admin EMAIL=jane@effy.test ENV=dev          # confirm-gated
make delete-admin EMAIL=jane@effy.test ENV=dev FORCE=1  # also override the last-admin guard
```
- Requires `EMAIL` (errors with usage if missing). Composes `DB_DSN` + `BACK_OFFICE_POOL_ID` exactly
  as `create-first-admin` does (secrets as env, never echoed).
- **Confirmation (FR-012)**: prompts `[y/N]` before the destructive action (like `db-up`/`edge-deploy`);
  irreversible.
- Passes `--force` when `FORCE=1` (overrides the last-admin guard — FR-014).
- Runs `go run ./cmd/delete-admin --email "$(EMAIL)" $(if $(FORCE),--force,)` from `apis/core-api`.
- Add `delete-admin` to `.PHONY`.


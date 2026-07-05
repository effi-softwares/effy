# Operator Directives (plan-phase input)

**Source**: user input to `/speckit-specify`, 2026-07-05. **Binding technical directives**
for the plan phase of `003-db-migrations`. Kept out of [spec.md](./spec.md) per the
zero-tech discipline (constitution Principle I); `/speckit-plan` MUST honor them (or return
here if one proves impossible).

## Verbatim mandate

> set up Goose for database migrations — the migration tooling and workflow for the dev
> database we just provisioned: repo structure for migration files, how migrations are
> authored (raw SQL, forward-only per the constitution), how they run against the dev DB
> using the connection contract from SSM, and the operator workflow for applying them. we
> need to also have update make file to goose commands to get the db url from ssm and do
> goose up and down and status commands

## Decoded, itemized

| # | Directive | Concrete meaning |
|---|---|---|
| 1 | **Goose** | `pressly/goose` CLI (constitution-locked migration tool). Plan pins the install path (brew) + version stance. |
| 2 | Repo structure for migration files | Plan decides the canonical home (e.g. `db/migrations/` at repo root) + naming scheme (goose sequential vs timestamp — pick one and encode in the authoring guide, mindful of the concurrent-authoring edge case). |
| 3 | Raw SQL, forward-only | `.sql` migrations only (`-- +goose Up` / `-- +goose Down` annotations); **no Go migrations**. Constitution: forward-only — down sections are a dev-iteration convenience, never a recovery path (see #6). |
| 4 | Run against dev via the SSM contract | DSN composed at invocation from `/effy/dev/db/{endpoint,port,name,master_username}` (SSM) + password fetched from Secrets Manager via `/effy/dev/db/master_secret_arn`. `sslmode=require` always (002 forces TLS). Nothing cached to disk. |
| 5 | **Makefile** goose targets | Root Makefile (001) gains env-parameterized DB targets — `db-status`, `db-up`, `db-down` (naming: plan may prefix `db-` to avoid colliding with terraform targets; that satisfies "goose up and down and status"). Every target wraps `AWS_PROFILE=ef`, resolves the DSN inline (process env only, never echoed, never written), and `db-up`/`db-down` are 🧑‍💻 operator-run per the mode of work. |
| 6 | "down" vs forward-only | Resolution recorded in the spec (US3/FR-004): `db-down` exists as a **single-step, dev-only iteration convenience** (perfecting the latest unshipped migration). Shipped mistakes are fixed by a NEW forward migration. Higher envs never run down (promotion may hard-block the target). |

## Constitution/platform constraints that also apply

- **PostgreSQL 16** target (002's `effy-dev-db`); **Goose** is the locked migration tool;
  **raw SQL** locked (no ORM, no query builders).
- **Mode of work**: Claude authors migration files, Makefile targets, and docs; the
  **operator runs** every `db-up`/`db-down` (DB migrations are explicitly listed as
  operator-run in CLAUDE.md).
- **Secrets discipline (002 contract)**: the password exists only in Secrets Manager; SSM
  carries the ARN pointer. The Makefile fetches at invocation; `PGPASSWORD`-style transient
  process env is acceptable, files/echoes are not.
- **Prerequisite**: operator's IP on the 002 allowlist (`db_allowed_cidrs`); `goose` +
  `aws` CLI installed (documented in the runbook).
- **Proving migration (FR-011)**: keep it platform-owned and minimal — e.g. a `platform`
  schema-versioning marker or comment-only baseline — NOT future feature tables. Two
  schemas (`public` + `admin`) exist as a CLAUDE.md-documented vision; whether the proving
  migration creates the `admin` schema shell is a plan decision to record.

# Research & Decisions: Database Schema Migration Workflow

Phase 0 output. Binding inputs: constitution locked standards (PostgreSQL 16, **Goose**,
raw SQL, **forward-only**), the [operator-directives.md](./operator-directives.md) mandate,
and the live 002 database + contract. Format: **Decision → Rationale → Alternatives**.

---

## D1 — Tool: pressly/goose v3 CLI via Homebrew, SQL migrations only

**Decision**: `goose` v3 CLI (`brew install goose`), configured entirely through
environment variables set by the Makefile: `GOOSE_DRIVER=postgres`,
`GOOSE_DBSTRING=<composed at invocation>`, `GOOSE_MIGRATION_DIR=db/migrations`.
Migrations are **`.sql` files only** — no Go-function migrations, ever.

**Rationale**: Goose is the constitution-locked tool; the CLI (vs embedding goose as a Go
library) keeps this slice free of backend code and works for a solo operator today. Env-var
configuration keeps every invocation greppable in one place (the Makefile) and keeps the
DSN out of argv (visible in `ps` output — a small but free hygiene win). SQL-only honors
"raw SQL, no abstraction" and keeps migrations reviewable as plain text (spec FR-002).

**Alternatives considered**:
- **golang-migrate / Atlas / Flyway** — *Rejected.* Goose is locked by the constitution;
  swapping requires an amendment and nothing here motivates one.
- **Goose as a library in a future Go tool** — *Deferred.* The hot-path slice may embed
  goose for CI later; the CLI workflow stays valid alongside it (same ledger).
- **Vendoring a pinned goose binary** — *Rejected for now.* Brew + a documented minimum
  version (v3.x) is enough at this stage; revisit if version drift ever bites.

## D2 — Home: top-level `db/` directory

**Decision**: `db/migrations/*.sql` + `db/README.md` at the repository root.

**Rationale**: the schema is **platform ground** shared by both future backends (hot path
pgx, cold path Lambdas) — CLAUDE.md's platform shape lists "DB migrations" as its own
element beside the two backends. Homing it under either backend would misstate ownership
and invite per-service schema drift (Principle II). Top-level `db/` is also the shortest
path for the authoring guide's "where do I put it?" answer (SC-007).

**Alternatives considered**:
- **`services/api/migrations/`** — *Rejected.* Couples shared schema to the hot path.
- **`infra/`** — *Rejected.* Infra provisions the database *server*; schema evolution is a
  different lifecycle with a different cadence and owner.

## D3 — Naming: goose timestamp format, created via `make db-new`

**Decision**: timestamp-prefixed filenames (`YYYYMMDDHHMMSS_snake_case_title.sql`), i.e.
goose's `goose create <name> sql` default. A `make db-new name=<snake_case_title>` target
wraps creation so files always land in `db/migrations/` with the annotations scaffolded.
Goose runs in default **strict order** (no `-allow-missing`).

**Rationale**: timestamps make concurrent authoring collisions near-impossible while strict
mode still surfaces genuine out-of-order landings at apply time (the spec's
concurrent-authoring edge case: visible at review/apply, never silently reordered). The
`db-new` wrapper is what makes SC-007 ("correct on first attempt") realistic.

**Alternatives considered**:
- **Sequential numbering (`goose create -s`)** — *Rejected.* Reads nicely but collides the
  moment two changes are authored in parallel branches; renumbering applied files would
  violate immutability (FR-009).

## D4 — Up/Down policy: Down is a dev-iteration section, not a recovery path

**Decision**: every migration contains `-- +goose Up` and `-- +goose Down` sections. The
Down section MUST exactly reverse the Up **when cheaply reversible** (DDL like
`CREATE SCHEMA` → `DROP SCHEMA`); when reversal is unsafe or lossy, Down MUST be a loud
no-op (`SELECT 1; -- irreversible: fix forward`) so `db-down` never destroys data silently.
The binding platform rule stays **forward-only**: `db-down` exists solely to iterate on the
latest **unshipped** migration in dev.

**Rationale**: this is the spec's US3/FR-004 resolution made mechanical. It gives the
developer the tight author→apply→adjust→reapply loop the user asked for ("goose up and
down") without ever making rollback a recovery strategy the platform relies on
(constitution: "no down migrations relied on").

**Alternatives considered**:
- **No Down sections at all** — *Rejected.* Kills the dev iteration loop; devs would
  hand-delete objects instead, which is worse discipline.
- **Mandatory full reversibility** — *Rejected.* Impossible for lossy changes; invites
  fake "reversals" that drop data.

## D5 — DSN composition: `infra/scripts/db-dsn.sh` from the 002 contract, libpq keyword format

**Decision**: a helper script `infra/scripts/db-dsn.sh <env>` that:
1. reads `/effy/<env>/db/{endpoint,port,name,master_username}` from SSM;
2. reads the password from Secrets Manager via the ARN in
   `/effy/<env>/db/master_secret_arn`;
3. prints a **libpq keyword-format** connection string to stdout:
   `host=… port=… dbname=… user=… password=… sslmode=require`.

The Makefile captures it (`GOOSE_DBSTRING="$$(…)"`) into the process environment of the
goose invocation only. Recipe lines are `@`-prefixed; the DSN is never echoed, written to a
file, or passed as an argv token.

**Rationale**: spec FR-005/SC-004 verbatim. **Keyword format over URL**: RDS-managed
passwords may contain characters (`#?&:%`) that corrupt a URL DSN unless URL-encoded;
keyword format needs no encoding for the character set RDS generates (it excludes quotes,
backslashes, `/`, `@`, spaces), eliminating an entire class of "works until rotation"
bugs. `sslmode=require` matches 002's forced-TLS posture.

**Alternatives considered**:
- **`postgresql://` URL DSN** — *Rejected.* Password URL-encoding footgun (above).
- **Writing a `.pgpass`/env file** — *Rejected outright.* Violates SC-004 (credential
  material on disk).
- **Inline AWS calls in the Makefile recipe** — *Rejected.* Unreadable, untestable;
  a script beside 001's `preflight.sh` is the established guardrail pattern.

## D6 — Command surface: `db-status` / `db-up` / `db-down` / `db-new` in the root Makefile

**Decision**: four ENV-parameterized targets (default `ENV=dev`), every one wrapping
`AWS_PROFILE=ef` (001 discipline). Mutating targets (`db-up`, `db-down`) print the target
env + database endpoint and require an interactive `y` confirmation. **`db-down` refuses to
run unless `ENV=dev`** (hard Makefile guard) and steps back exactly **one** migration
(`goose down`, never `reset`). `db-new` and `db-status` are non-mutating (`db-new` is
purely local; `db-status` is a read).

**Rationale**: satisfies the directive ("makefile … goose up and down and status … db url
from ssm") while making the forward-only boundary structural instead of aspirational: the
one place a rewind exists is single-step and physically scoped to dev. Confirmation +
endpoint display mirrors terraform's interactive approval (FR-007, platform mode of work).

**Alternatives considered**:
- **Bare target names (`up`/`down`/`status`)** — *Rejected.* Collide conceptually with the
  terraform surface in the same Makefile; `db-` prefix keeps `make help` unambiguous.
- **A `db-reset` convenience** — *Rejected.* Mass rollback is exactly what forward-only
  forbids; dev recreation goes through `make destroy/apply` (002) instead.

## D7 — Immutability guard: working-tree check before apply

**Decision**: `db-up` runs a pre-apply guard: if any **tracked** file under
`db/migrations/` has uncommitted modifications (`git status --porcelain db/migrations`),
the apply aborts with a "migrations must be committed before applying" error
(override: `FORCE=1` for deliberate local iteration). The authoring guide states the law:
a migration applied beyond your own iteration loop is immutable; changes ship as new
migrations.

**Rationale**: FR-009 wants post-apply edits *surfaced, not silently accepted*. Goose v3
does not checksum applied files, so the honest, zero-infrastructure guard is git: the
working-tree check catches live edits at the moment they matter (apply time) and forces
every applied migration to exist in git history. **Recorded limitation**: an edit that is
*committed* after its file was applied is not machine-caught in this slice — it is left to
review discipline now, and a checksum/CI comparison can arrive with the promotion slice.

**Alternatives considered**:
- **Checksum ledger bolted beside goose** — *Rejected for now.* Real machinery for a
  solo-dev slice; the residual risk is documented instead of half-solved.
- **No guard, docs only** — *Rejected.* FR-009 demands the workflow surface it.

## D8 — Proving migration: the `admin` schema shell

**Decision**: the first migration is
`db/migrations/<timestamp>_baseline_admin_schema.sql`:
Up = `CREATE SCHEMA IF NOT EXISTS admin;` (+ a `COMMENT ON SCHEMA`), Down =
`DROP SCHEMA IF EXISTS admin;` (safe while empty — and it stays empty in this slice).

**Rationale**: FR-011 wants the loop proven without prematurely shipping feature schema.
The `admin` schema shell is the one object that is genuinely **platform-owned** today —
CLAUDE.md fixes the two-schema model (`public` operational + `admin` back-office) — so it
is real (not a `SELECT 1` theater), minimal, feature-neutral, and cleanly reversible for
the dev down/up demo.

**Alternatives considered**:
- **No-op baseline (`SELECT 1`)** — *Rejected.* Proves less (no DDL, no visible object)
  and wastes the version-1 slot.
- **First product tables (catalog etc.)** — *Rejected.* Explicitly out of scope (spec
  assumption); tables belong to their feature slices.

## D9 — Wrong-environment protection: inherited + structural

**Decision**: environment scoping rides the 002 contract itself — `db-dsn.sh <env>` reads
`/effy/<env>/db/*`, and those parameters **only exist for provisioned envs** (dev today);
targeting qa fails fast with a missing-parameter error naming the path. Plus: `AWS_PROFILE=ef`
on every target, endpoint shown in the confirmation prompt, `db-down` dev-only.

**Rationale**: the safest guard is the one that needs no maintenance — an env that doesn't
exist can't be reached because its contract doesn't exist. Matches the spec's
wrong-environment edge case with zero new state.

## D10 — Prerequisites & docs

**Decision**: `db/README.md` carries both the authoring guide (naming, annotations,
Up/Down policy, immutability law, review expectations) and the operator runbook
(prereqs: `brew install goose`, AWS CLI, allowlist membership per 002; then
status → up → verify loop, failure handling, the SC-005 atomicity demo). Root
`infra/README.md` gains one pointer line. PostgreSQL runs each `.sql` migration inside a
transaction by default under goose, which is what makes the SC-005 "byte-for-byte
unchanged on failure" guarantee real for ordinary DDL (documented, with the known
exceptions — e.g. `CREATE INDEX CONCURRENTLY` needs `-- +goose NO TRANSACTION` and its own
care; out of scope until a migration needs it).

---

## Open items intentionally deferred (not blockers)

- **Committed-after-apply edit detection** (D7 limitation) — checksum/CI comparison at the
  promotion slice.
- **Higher-env workflow gates** (no down target at all, change review, CI-run migrations)
  — with qa/staging/prod promotion.
- **App-scoped DB roles + least-privilege migration credential** — the master credential is
  the operator tool today; per-app users arrive with the first consumer slice.
- **Embedding goose in Go for CI** — possible later; same ledger, no rework.

---

### Sources

- [pressly/goose](https://github.com/pressly/goose) — SQL migration annotations, env-var
  config (`GOOSE_DRIVER`/`GOOSE_DBSTRING`/`GOOSE_MIGRATION_DIR`), strict ordering,
  timestamp vs `-s` sequential naming, transaction-per-migration default,
  `NO TRANSACTION` escape hatch.
- [libpq connection strings](https://www.postgresql.org/docs/16/libpq-connect.html#LIBPQ-CONNSTRING)
  — keyword/value format vs URI; quoting rules.
- [AWS Secrets Manager — RDS managed master passwords](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-secrets-manager.html)
  — secret JSON shape (`username`/`password`), excluded character set.
- 002 artifacts — [ssm-parameters.contract.md](../002-dev-database/contracts/ssm-parameters.contract.md)
  (the `/effy/<env>/db/*` contract this slice consumes).

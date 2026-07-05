# Data Model: Database Schema Migration Workflow

The "entities" here are repository artifacts, one database table, and a command surface.
Maps the spec's Key Entities (Migration File, Migration Ledger, Workflow Commands,
Connection Contract Values, Forward-Only Policy) onto concrete shapes.

---

## E1 — Migration File (`db/migrations/<timestamp>_<snake_case_title>.sql`)

| Field | Value / Rule |
|---|---|
| name | `YYYYMMDDHHMMSS_snake_case_title.sql` (goose timestamp format, via `make db-new`) |
| format | SQL only; `-- +goose Up` section + `-- +goose Down` section (D4 policy) |
| Down policy | exact reversal when cheaply reversible; loud no-op (`SELECT 1; -- irreversible: fix forward`) when lossy |
| ordering | strict goose order (no `-allow-missing`); collisions surface at apply, never silently reorder |
| immutability | committed before apply (D7 guard); once applied beyond the author's loop → immutable, changes ship as NEW migrations (FR-009) |

**State transitions**: `authored (db-new) → committed → applied (ledger row) [→ dev-only: stepped-back → re-applied]`.

## E2 — Migration Ledger (`goose_db_version` table, in the target database)

| Field | Value / Rule |
|---|---|
| location | `public.goose_db_version` in `effy-dev-db` (created by goose on first run) |
| content | one row per applied migration (version id, is_applied, timestamp) |
| authority | THE truth for `db-status` (SC-003); never hand-edited |

## E3 — Workflow Commands (root Makefile)

| Target | Mutates? | Guards |
|---|---|---|
| `make db-new name=…` | no (local file) | name required; lands in `db/migrations/` with annotations scaffolded |
| `make db-status ENV=…` | no | contract-existence = env guard (D9) |
| `make db-up ENV=…` | **yes — 🧑‍💻 operator** | uncommitted-migrations guard (D7, `FORCE=1` override) + endpoint confirmation prompt |
| `make db-down ENV=…` | **yes — 🧑‍💻 operator** | **hard-blocked unless `ENV=dev`**; exactly one step; endpoint confirmation prompt |

All wrap `AWS_PROFILE=ef`; DSN enters via process env (`GOOSE_DBSTRING`) only, never argv,
never echoed (full surface: [contracts/makefile-db-targets.contract.md](./contracts/makefile-db-targets.contract.md)).

## E4 — Connection Contract Values (consumed, not created)

`infra/scripts/db-dsn.sh <env>` composes, at invocation:

| Source | Key | Becomes |
|---|---|---|
| SSM | `/effy/<env>/db/endpoint` | `host=` |
| SSM | `/effy/<env>/db/port` | `port=` |
| SSM | `/effy/<env>/db/name` | `dbname=` |
| SSM | `/effy/<env>/db/master_username` | `user=` |
| Secrets Manager (ARN from `/effy/<env>/db/master_secret_arn`) | secret JSON `.password` | `password=` |
| fixed | — | `sslmode=require` (002 forced TLS) |

**Rules**: this slice adds **zero** new contract keys; libpq keyword format (no URL
encoding); output only ever captured by command substitution.

## E5 — Forward-Only Policy (encoded, not aspirational)

| Mechanism | Where |
|---|---|
| `db-down` = single step, dev-only hard block | Makefile (D6) |
| Down sections = iteration tool, loud no-op when lossy | authoring guide + file format (D4) |
| shipped mistakes → new forward migration | `db/README.md` law + review discipline |
| no `db-reset` / mass rollback exists | command surface (D6) |

## E6 — Proving Migration (FR-011)

`<timestamp>_baseline_admin_schema.sql`: Up = `CREATE SCHEMA IF NOT EXISTS admin` +
schema comment; Down = `DROP SCHEMA IF EXISTS admin` (safe while empty). Platform-owned
(CLAUDE.md two-schema model); no tables.

---

## Entity → requirement traceability

| Entity | Satisfies |
|---|---|
| E1 Migration File | FR-001, FR-002, FR-009 |
| E2 Ledger | FR-003 (+ SC-002/SC-003) |
| E3 Commands | FR-004, FR-006, FR-007 |
| E4 DSN composition | FR-005 (+ SC-004) |
| E5 Policy encoding | FR-004, FR-009 (+ constitution forward-only) |
| E6 Proving migration | FR-011 (+ SC-005/SC-006 demos) |
| `db/README.md` | FR-010 (+ SC-007) |
| goose transaction-per-migration | FR-008 (+ SC-005) |

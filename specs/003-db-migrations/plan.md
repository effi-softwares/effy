# Implementation Plan: Database Schema Migration Workflow

**Branch**: `main` (spec dir `003-db-migrations`) | **Date**: 2026-07-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-db-migrations/spec.md` + binding
[operator-directives.md](./operator-directives.md).

## Summary

Stand up the platform's schema-migration workflow with **Goose** (constitution-locked):
a top-level **`db/migrations/`** home for **SQL-only, timestamp-named** migration files, a
**`db/README.md`** authoring guide + runbook, and four env-parameterized **Makefile
targets** — `db-status`, `db-up`, `db-down`, `db-new`. Connection details are composed **at
invocation** by a helper script from the 002 contract (`/effy/<env>/db/*` SSM params + the
Secrets Manager master secret), in libpq **keyword format** with `sslmode=require`, held
only in transient process env — never on disk, never echoed. **Forward-only discipline** is
encoded structurally: `db-down` steps back exactly one migration and is **hard-blocked for
any env but dev** (the dev-iteration convenience the spec allows); shipped mistakes are
fixed by new forward migrations. The proving migration creates the **`admin` schema shell**
(platform-owned per CLAUDE.md's two-schema model — real tables arrive with their feature
slices). Claude authors everything; **the operator runs every `db-up`/`db-down`**
(CLAUDE.md lists DB migrations as operator-run).

**Technical approach** (decisions detailed in [research.md](./research.md)): goose CLI via
Homebrew, driver/dir/DSN passed via `GOOSE_*` environment variables from the Makefile, a
`db-dsn.sh` helper under `infra/scripts/`, a working-tree edit guard before apply, and a
confirmation prompt showing env + endpoint before any mutation.

## Technical Context

**Language/Version**: SQL (PostgreSQL 16 dialect) migration files; Bash helper scripts;
GNU Make targets. Tool: **pressly/goose v3** CLI (locked standard), installed via Homebrew.

**Primary Dependencies**: goose CLI, AWS CLI v2 (SSM + Secrets Manager reads), the live
002 dev database and its contract. No Go module, no ORM, no generated formats.

**Storage**: target = `effy-dev-db` (PostgreSQL 16, dev). Goose's ledger table
`goose_db_version` lives in the target database itself (spec's Migration Ledger).

**Testing**: the quickstart validation loop — status/up idempotency, deliberate-failure
atomicity demo, down/up dev iteration, credential-hygiene grep. No test framework (matches
001/002 precedent for tooling slices).

**Target Platform**: dev environment (`ap-southeast-1`), operator's machine (must be on
the 002 allowlist). Env-parameterized like every platform command (`ENV=dev` default).

**Project Type**: developer/operator tooling + repository structure. Not an application
surface — no hot/cold path code.

**Performance Goals**: N/A — human-invoked CLI workflow. SC-001's < 5-minute
clone-to-apply is a docs/simplicity requirement, not a perf one.

**Constraints**: forward-only policy (constitution) with dev-only single-step down; no
credential material on disk/in repo/in output (SC-004); operator runs all mutations
(FR-007); consumes ONLY the 002 contract for connection info (FR-005); migrations
immutable once shipped (FR-009).

**Scale/Scope**: 1 migrations directory + 1 proving migration + 1 authoring guide +
1 DSN helper script + 4 Makefile targets + quickstart. No product schema.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|---|---|---|
| **I. Spec-Driven Development** | spec committed; plan cites constitution; gaps return to artifacts | ✅ spec + operator-directives committed; the down-vs-forward-only tension was resolved in the spec (US3/FR-004), not silently in code. |
| **II. Monorepo + Shared Contracts** | single-sourced contracts | ✅ Consumes the 002 SSM/Secrets contract as the ONLY connection source; migrations live once at `db/` and serve both future backends — no per-service schema copies. |
| **III. Dual-Path Backend** | plan declares its path(s) | ✅ **N/A — neither path.** Schema is shared platform ground both paths build on; no backend code ships here. Recorded, not skipped. |
| **IV. Auth Isolation** | four pools, passwordless, no proxy | ✅ **No auth surface.** The DB master credential is operator tooling (fetched at invocation from Secrets Manager), unrelated to Cognito pools. |
| **V. Native-Feel Design** | design-system usage | ✅ **N/A** — no UI. |
| **VI. Layered Architecture & Explicit Wiring** | conform to ARCHITECTURE.md | ✅ Raw SQL, no ORM (locked); `db/` is the single schema source of truth both backends' repositories build on; wiring is greppable (Makefile + one helper script — no hidden config). |
| **VII. Observability & Telemetry** | telemetry for user-facing flows | ✅ No user-facing flow. Operational visibility = `db-status` + the in-database ledger (SC-003). |

**Technology Standards (Locked)**: PostgreSQL 16 ✅; **Goose** ✅ (the locked migration
tool); **forward-only** ✅ — down sections exist only for the dev-iteration convenience and
are never relied on for recovery ("no down migrations relied on"), encoded as a hard
Makefile block outside dev. No locked technology swapped.

**Result: PASS — no violations. Complexity Tracking is empty.**

*Post-design re-check (after Phase 1): still PASS — no new violations introduced.*

## Project Structure

### Documentation (this feature)

```text
specs/003-db-migrations/
├── spec.md                  # WHAT/WHY (zero tech)
├── operator-directives.md   # binding directives (plan-phase input)
├── plan.md                  # This file
├── research.md              # Phase 0 — decisions & rationale
├── data-model.md            # Phase 1 — entity/tooling shapes
├── quickstart.md            # Phase 1 — operator run/validate guide
├── contracts/
│   ├── makefile-db-targets.contract.md   # db-status/up/down/new command surface
│   └── migration-format.contract.md      # file naming, annotations, immutability law
└── tasks.md                 # Phase 2 (/speckit-tasks — NOT here)
```

### Source Code (repository root)

```text
db/                              # NEW — platform-owned schema home (serves BOTH backends)
├── migrations/
│   └── <timestamp>_baseline_admin_schema.sql   # proving migration: admin schema shell
└── README.md                    # authoring guide + operator runbook (FR-010)

infra/scripts/
└── db-dsn.sh                    # NEW — composes the libpq DSN from SSM + Secrets Manager
                                 #   at invocation; prints to stdout for command capture

Makefile                         # MODIFIED — + db-status / db-up / db-down / db-new
                                 #   (ENV-parameterized, AWS_PROFILE=ef, confirmation on
                                 #    mutation, db-down hard-blocked unless ENV=dev)
```

**Structure Decision**: migrations live at top-level **`db/`**, not under either backend —
the schema is platform ground shared by the hot path (pgx) and cold path (Lambdas), and
parking it in one service would misstate ownership (Principle II). The DSN helper joins
the existing guardrail scripts in `infra/scripts/` (001's `preflight.sh` precedent). The
root Makefile stays the single operator entry point (001 contract) — DB targets get a
`db-` prefix so the terraform surface stays unambiguous.

## Complexity Tracking

> No constitution violations. No entries required.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _(none)_  | —          | —                                   |

---

description: "Task list for Database Schema Migration Workflow"
---

# Tasks: Database Schema Migration Workflow

**Input**: Design documents from `/specs/003-db-migrations/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md),
[operator-directives.md](./operator-directives.md) (binding mandate),
[research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/),
[quickstart.md](./quickstart.md)

**Tests**: No test framework. "Tests" for this tooling slice are the Claude-run static/
read-only checks (scaffolding, guards, hygiene greps, read-only `db-status`) and the
operator-run quickstart validations (apply, idempotency, atomic failure, down/up loop).

**Organization**: Tasks grouped by user story (US1 author+apply loop / US2 contract-wired
zero-config / US3 forward-only discipline).

**⚠️ Mode of work (CLAUDE.md)**: Claude authors everything and runs read-only checks
(`db-status`, guard-refusal probes, greps). The **operator runs every `db-up`/`db-down`**
— DB migrations are explicitly operator-run; tasks marked **🧑‍💻 OPERATOR** hand off exact
commands.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no incomplete-task dependency)
- **[Story]**: US1 / US2 / US3 (Setup / Foundational / Polish have no label)
- Paths are repo-root-relative.

---

## Phase 1: Setup

**Purpose**: Tooling + preconditions; nothing authored yet.

- [X] T001 Preflight: install/verify `goose` v3 (`brew install goose`; `goose --version`), verify AWS CLI + `ef` profile, and confirm the 002 contract exists (`AWS_PROFILE=ef aws ssm get-parameters-by-path --path /effy/dev/db --region ap-southeast-2` → 5 params). Note (not a blocker for authoring): live DB checks need the operator's IP on the 002 allowlist
- [X] T002 Create the `db/` tree: `db/migrations/` directory (files arrive in US1)

**Checkpoint**: goose runnable; contract confirmed; home exists.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The DSN plumbing and command surface every story depends on.

- [X] T003 Author `infra/scripts/db-dsn.sh` (+ `chmod +x`): `db-dsn.sh <env>` reads `/effy/<env>/db/{endpoint,port,name,master_username}` from SSM and the password from Secrets Manager via `/effy/<env>/db/master_secret_arn`, prints a libpq **keyword-format** DSN with `sslmode=require` to stdout; fails fast with the missing parameter path named when the env has no contract; `set -euo pipefail`; never echoes inputs (per research.md D5/D9, [contracts/makefile-db-targets.contract.md](./contracts/makefile-db-targets.contract.md))
- [X] T004 Author the four `db-*` targets in the root `Makefile` per [contracts/makefile-db-targets.contract.md](./contracts/makefile-db-targets.contract.md): `db-new` (requires `name=`, wraps `goose -dir db/migrations create $(name) sql`, no AWS); `db-status` (read-only; `GOOSE_DRIVER=postgres GOOSE_MIGRATION_DIR=db/migrations GOOSE_DBSTRING="$$(bash infra/scripts/db-dsn.sh $(ENV))" goose status`); `db-up` (uncommitted-migrations guard via `git status --porcelain db/migrations` with `FORCE=1` override → env+endpoint confirmation prompt → `goose up`); `db-down` (**hard-refuse unless `ENV=dev`** → confirmation → `goose down`, exactly one step). All recipes `@`-silenced, `AWS_PROFILE=ef` wrapped, DSN only in process env; update the `.PHONY` line and `##` help strings

**Checkpoint**: command surface exists; nothing has touched the database.

---

## Phase 3: User Story 1 — Author and apply a versioned migration (Priority: P1) 🎯 MVP

**Goal**: the full loop — a committed, ordered SQL migration applied exactly once to dev,
tracked in the ledger, idempotent on re-run.

**Independent Test**: baseline migration applies via one confirmed `make db-up ENV=dev`;
ledger + `admin` schema verify; second `db-up` reports zero work (quickstart Steps 1–3).

### Implementation for User Story 1

- [X] T005 [P] [US1] Author `db/README.md`: authoring guide (naming via `make db-new`, Up/Down annotations, Down policy incl. loud no-op for lossy changes, one logical change per file, `NO TRANSACTION` caveat, immutability law) + operator runbook (prereqs, status → up → verify loop, failure handling, forward-only recovery) per [contracts/migration-format.contract.md](./contracts/migration-format.contract.md) (FR-010, SC-007)
- [X] T006 [P] [US1] Author the proving migration `db/migrations/<timestamp>_baseline_admin_schema.sql` (timestamp = authoring time, goose format): Up = `CREATE SCHEMA IF NOT EXISTS admin;` + `COMMENT ON SCHEMA admin IS '...back-office accounts + audit (slice 003 baseline)...'`; Down = `DROP SCHEMA IF EXISTS admin;` per research.md D8 — NO tables (FR-011)
- [ ] T007 [US1] Claude checks (read-only): `make db-new name=scratch_check` scaffolds a correctly named+annotated file in `db/migrations/` (inspect, then delete it); `make db-status ENV=dev` connects via the contract and lists the baseline as Pending (proves T003/T004 wiring live end-to-end without mutating)
- [ ] T008 [US1] 🧑‍💻 OPERATOR: quickstart Steps 1–3 — `make db-up ENV=dev` (confirm → baseline applies), verify `make db-status ENV=dev` shows Applied + (optional) psql `\dn` shows `admin` and `goose_db_version` has one row; run `make db-up ENV=dev` again → "no migrations to run". Acceptance: SC-002, SC-006 (+ SC-003 first half)

**Checkpoint**: the migration loop is real — MVP.

---

## Phase 4: User Story 2 — One-command workflow wired to the platform contract (Priority: P2)

**Goal**: zero manual configuration, zero credential residue, status = ledger truth.

**Independent Test**: commands work with no local DB config anywhere; hygiene greps come
back empty; status matches a direct ledger read; unprovisioned env fails fast and clear.

### Implementation for User Story 2

- [X] T009 [P] [US2] Claude audit (read-only): (a) `infra/scripts/db-dsn.sh` reads ONLY the SSM/Secrets contract — no dotfiles, no env fallbacks, nothing written to disk; (b) Makefile recipes `@`-silenced and DSN never in argv/echo; (c) `git grep -iE 'password|dbstring' -- ':!specs' ':!*.md'` finds no credential material; (d) `make db-status ENV=qa` fails fast naming `/effy/qa/db/...` as missing (the D9 env guard demonstrated). Any failure goes back to T003/T004 (SC-004 static half)
- [ ] T010 [US2] 🧑‍💻 OPERATOR (after T008): quickstart Step 6 — fresh shell with no DB-related env vars: `make db-status ENV=dev` works (zero-config, SC-001 spirit); crosscheck status against `select * from goose_db_version;` via psql — 100% agreement (SC-003); confirm no DSN/password appeared in any output and `~/.pgpass` doesn't exist (SC-004 live half)

**Checkpoint**: the workflow is contract-driven and hygienic, provably.

---

## Phase 5: User Story 3 — Forward-only discipline with a safe dev loop (Priority: P3)

**Goal**: the guards hold — down is single-step dev-only, uncommitted edits are surfaced,
failures are atomic, recovery is always forward.

**Independent Test**: `db-down ENV=qa` refused at the Makefile layer; uncommitted-file
guard aborts `db-up`; a deliberately failing migration leaves schema + ledger untouched;
down/up single-step loop works in dev (quickstart Steps 4–5).

### Implementation for User Story 3

- [X] T011 [P] [US3] Claude guard verification (no DB mutation): (a) `make db-down ENV=qa` → refused by the Makefile BEFORE any AWS call, with the forward-only message; (b) create an uncommitted scratch file in `db/migrations/`, run `make db-up ENV=dev` → aborts at the commit guard before any prompt (then delete the scratch file); (c) confirm no reset/mass-rollback target exists in the Makefile (`grep -c 'goose.*reset' Makefile` → 0)
- [ ] T012 [US3] 🧑‍💻 OPERATOR (after T008): quickstart Steps 4–5 — atomic failure demo (`make db-new name=failure_demo`, add invalid SQL, `make db-up ENV=dev FORCE=1` → error; verify schema unchanged + ledger unmarked; `rm` the demo file) validating SC-005; then the dev iteration loop: `make db-down ENV=dev` (one step) → status shows baseline pending → `make db-up ENV=dev` re-applies

**Checkpoint**: discipline is enforced by machinery where possible, documented where not.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T013 [P] Cross-link the workflow: add a "Database migrations" pointer section to `infra/README.md` (the Makefile hosts both surfaces; link `db/README.md` + the 002 allowlist prerequisite), and verify `db/README.md` links back to the 002 contract docs
- [X] T014 Final gate: `make help` lists the four `db-*` targets with descriptions; `make lint` still exits 0 (terraform surface untouched); `terraform fmt -check -recursive infra` clean
- [ ] T015 🧑‍💻 OPERATOR: full [quickstart.md](./quickstart.md) end-to-end sign-off against SC-001…SC-007 (SC-001 stopwatch on a fresh shell; SC-007 is certified the first time a real feature migration is authored using only `db/README.md` — note the deferral if not exercised now)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (P1)** → **Foundational (P2)** → all stories. T003+T004 block every DB command.
- **US1**: T005/T006 need only T002; T007 needs T003+T004+T006; T008 needs T007.
- **US2**: T009 (static) needs T003+T004; T010 (live) needs T008 applied.
- **US3**: T011 (guards) needs T004 (+T006 for the scratch-file test); T012 needs T008.
- **Polish**: T013 anytime after T005; T014 after T004; T015 last.

### User Story Dependencies

- **US1**: independent backbone; its operator apply (T008) unblocks US2/US3 live halves.
- **US2**: static half independent after Foundational; live half depends on US1's apply.
- **US3**: guard half independent after Foundational; live half depends on US1's apply.

### Parallel Opportunities

- T005 + T006 (different files) in parallel.
- T009 + T011 + T013 (read-only audits / docs, disjoint scopes) in parallel post-Foundational.
- One operator sitting covers T008 → T010 → T012 → T015 in order.

---

## Parallel Example: post-Foundational audits

```bash
Task: "T009 zero-config + credential-hygiene audit vs makefile-db-targets contract"
Task: "T011 guard verification: db-down env block, uncommitted guard, no reset target"
Task: "T013 cross-link db/README.md ↔ infra/README.md"
```

---

## Implementation Strategy

### MVP First (US1 only)

1. Phase 1–2: goose + `db/` + DSN script + Makefile targets.
2. Phase 3: guide + baseline migration; Claude proves wiring read-only; 🧑‍💻 operator
   applies and verifies idempotency.
3. **STOP & VALIDATE**: the platform has a working, ledger-tracked migration loop — MVP.

### Incremental Delivery

1. US1 → the loop works → **MVP demo** (admin schema exists in dev).
2. US2 → zero-config + hygiene proven → trust demo.
3. US3 → guards + atomicity + dev iteration loop → discipline demo.
4. Polish → cross-links, final gate, sign-off.

---

## Notes

- 🧑‍💻 **OPERATOR** tasks: T008, T010, T012, T015 — one sitting, in that order.
- Claude MAY run `db-status` (read-only) and guard-refusal probes; Claude NEVER runs
  `db-up`/`db-down` (CLAUDE.md lists DB migrations as operator-run).
- The baseline migration's timestamp is fixed at authoring time (T006) — committed before
  the operator ever applies (the T004 guard enforces exactly this discipline from day one).
- Every acceptance maps to a spec Success Criterion (SC references inline).
- Commit after each task or logical group.

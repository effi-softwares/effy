# Feature Specification: Database Schema Migration Workflow

**Feature Branch**: `003-db-migrations`

**Created**: 2026-07-05

**Status**: Draft

**Input**: User description: "as the next spec let's set up Goose for database migrations — the migration tooling and workflow for the dev database we just provisioned: repo structure for migration files, how migrations are authored (raw SQL, forward-only per the constitution), how they run against the dev DB using the connection contract from SSM, and the operator workflow for applying them. we need to also have update make file to goose commands to get the db url from ssm and do goose up and down and status commands"

> Technology-specific directives from the description are recorded verbatim in
> [operator-directives.md](./operator-directives.md) as **plan-phase input** — this spec
> stays free of implementation detail per constitution Principle I.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Author and apply a schema change as a versioned migration (Priority: P1)

A developer expresses a database schema change as a new, ordered migration file in the
repository — written directly in the database's own language, no abstraction layer. The
operator then applies all pending migrations to the development database with a single
command. The database itself records exactly which migrations have run, so re-running the
command applies only what is new and is otherwise a clean no-op.

**Why this priority**: This is the entire point of the feature — schema evolution as
reviewable, ordered, repository-owned changes. Every future data-bearing slice (catalog,
orders, users) depends on this loop existing and being trustworthy.

**Independent Test**: Author one migration, apply it, verify the schema object exists and
the database's migration ledger records it; run apply again and observe "nothing to do".

**Acceptance Scenarios**:

1. **Given** a new migration file in the repository, **When** the operator runs the apply
   command against dev, **Then** the change is applied and the database's ledger records
   that this migration ran, exactly once.
2. **Given** all migrations already applied, **When** the operator runs apply again,
   **Then** nothing changes and the command reports there was nothing to do.
3. **Given** several pending migrations, **When** apply runs, **Then** they are applied in
   their defined order, each recorded individually.

---

### User Story 2 - One-command workflow wired to the platform contract (Priority: P2)

The apply/status commands need zero manual configuration: they discover the development
database's location and credentials from the platform's established configuration contract
at the moment they run. Nobody hand-assembles a connection string, nothing secret is typed,
stored in the repository, or left on disk. A status command shows, at any time, exactly
which migrations have been applied and which are pending.

**Why this priority**: The contract-driven workflow is what makes migrations safe and
repeatable for a solo operator — but it only matters once US1's loop exists.

**Independent Test**: On a machine with platform access but no hand-configured database
settings, run status and apply successfully; then search the repository and shell artifacts
for any credential material and find none.

**Acceptance Scenarios**:

1. **Given** a machine with platform access, **When** the operator runs the status command,
   **Then** it reports applied vs. pending migrations accurately with no manual connection
   setup.
2. **Given** the same machine, **When** any migration command runs, **Then** credentials
   are fetched fresh from the platform's secret store at invocation time and never written
   to disk, committed, or echoed into output.
3. **Given** a machine whose network is not on the database's allowlist, **When** a command
   runs, **Then** it fails with a clear connectivity message — not a hang or a confusing
   stack trace.

---

### User Story 3 - Forward-only discipline with a safe development loop (Priority: P3)

The platform's schema history only ever moves forward: recovering from a bad change means
shipping a new corrective migration, never rewinding history. At the same time, a developer
iterating on the **latest, not-yet-shared** migration in the development environment can
step it back as a convenience while perfecting it. Applied migration files are immutable —
editing one after it has run anywhere is a defect, and the workflow makes that visible.

**Why this priority**: Discipline is what keeps four environments' schema histories
identical and trustworthy. It shapes habits from day one but only binds once US1/US2 exist.

**Independent Test**: Attempt the undo convenience in dev (works, single step, loudly
labeled dev-only); verify documentation states roll-forward as the only recovery strategy;
modify an applied migration file and observe the workflow detecting/flagging it.

**Acceptance Scenarios**:

1. **Given** the latest migration applied only to dev, **When** the developer uses the
   step-back convenience while iterating, **Then** exactly one step is undone, and the
   operation is clearly framed as a dev-iteration tool, not a recovery mechanism.
2. **Given** a migration that has shipped (applied beyond the author's iteration loop),
   **When** something about it is wrong, **Then** the documented and tooling-encouraged
   remedy is a new forward migration.
3. **Given** an already-applied migration file that someone has since edited, **When** the
   workflow next runs, **Then** the alteration is surfaced rather than silently accepted.

---

### Edge Cases

- **A migration fails partway** → the database is left consistent (the failed change does
  not half-apply); the ledger does not record it as done; the remedy is fix the file (if
  never applied anywhere else) or add a corrective forward migration.
- **Two developers author migrations concurrently** → the ordering scheme must make
  collisions visible/resolvable at review time rather than corrupting apply order.
- **Command run with no pending migrations / an empty migrations directory** → clean
  "nothing to do" and accurate status, never an error.
- **Database unreachable** (allowlist missing the operator's network, database asleep or
  deleted) → fast, clear failure explaining the likely cause (the platform's dev database
  access rules), no credential leakage in the error.
- **Wrong-environment protection** → commands are explicitly environment-scoped, consistent
  with the platform's existing environment model; only dev exists to target today.
- **The undo convenience invoked on shipped history** → discouraged structurally
  (single-step only, dev-only framing, documentation); the forward-only policy is the
  binding rule.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every database schema change MUST be expressed as a versioned, ordered
  migration file committed to the repository — no console or ad-hoc schema changes.
- **FR-002**: Migrations MUST be written directly in the database's own language with no
  abstraction layer or generated intermediate format (constitution: raw SQL, no ORM).
- **FR-003**: The database itself MUST track which migrations have been applied; apply MUST
  run only pending migrations, in order, each exactly once; a re-run with nothing pending
  MUST be a clean no-op.
- **FR-004**: The workflow MUST offer single commands for: applying pending migrations,
  showing applied-vs-pending status, and — as a development-iteration convenience only —
  stepping back the most recent migration. The platform policy remains **forward-only**:
  recovery from shipped mistakes is always a new corrective migration (constitution:
  forward-only, no down migrations relied on).
- **FR-005**: Commands MUST resolve the database's location from the platform's
  configuration contract and fetch the credential from the platform's secret store at
  invocation time; credential material MUST never be committed, written to disk, or echoed
  to output.
- **FR-006**: The workflow MUST be environment-scoped consistently with the platform's
  environment model (dev today), runnable from the repository root with the platform's
  standard access profile discipline.
- **FR-007**: The **operator** runs every command that mutates the database (apply /
  step-back), mirroring the platform's human-in-the-loop rule for infrastructure changes.
- **FR-008**: A migration that fails MUST leave the database consistent — the failed change
  fully absent, the ledger unmarked — so the situation is always "fix and go forward".
- **FR-009**: Once a migration has been applied beyond the author's private iteration loop,
  its file is immutable; post-apply edits MUST be surfaced by the workflow rather than
  silently accepted. Changes ship as new migrations.
- **FR-010**: The feature MUST include an authoring guide (naming, ordering, review
  expectations) and an operator runbook (apply, status, verify, failure handling).
- **FR-011**: The slice MUST include one first migration that proves the loop end-to-end in
  dev without prematurely defining any future feature's schema (a minimal platform-owned
  baseline object only).

### Key Entities

- **Migration File**: an ordered, versioned, repository-committed unit of schema change;
  immutable once applied beyond the author's iteration loop.
- **Migration Ledger**: the database's own record of which migrations have been applied,
  and the source of truth for status.
- **Workflow Commands**: apply-pending, status, and the guarded dev-only step-back.
- **Connection Contract Values**: the development database's location/credentials contract
  established by feature 002 — the only source the commands use.
- **Forward-Only Policy**: the binding rule that shipped history is never rewound; encoded
  in documentation and tooling posture.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From a fresh repository clone on a machine with platform access, the operator
  reaches a successful status + apply against dev in **under 5 minutes** (tool prerequisite
  installation documented and included).
- **SC-002**: Running apply twice in a row: the second run reports **zero** work performed.
- **SC-003**: The status command matches the database ledger's truth **100%** of the time
  (verified by inspecting the ledger directly alongside it).
- **SC-004**: **Zero** credential material appears in the repository, in generated files,
  or in command output across the entire workflow.
- **SC-005**: A deliberately failing migration leaves the schema **byte-for-byte
  unchanged** (no partial objects) and the ledger unmarked, demonstrated in dev.
- **SC-006**: The first proving migration is applied in dev and visible in the ledger.
- **SC-007**: A developer new to the project authors a correctly named, correctly ordered
  migration on their **first attempt** using only the authoring guide.

## Assumptions

- **Development environment only for now**; the same workflow extends to higher
  environments at promotion, where gates get stricter (review, no step-back at all).
- **The operator's network is on the development database's allowlist** (feature 002) — a
  documented prerequisite, not something this feature manages.
- **The 002 connection contract is the sole source of connection information**; this
  feature adds no new ways to locate or authenticate to the database.
- **No real product schema ships here** — only the minimal proving migration (FR-011);
  actual tables arrive with their owning feature slices (catalog, orders, …).
- **Single-developer cadence today**: the concurrent-authoring edge case is handled by
  ordering/review convention now, not by heavier coordination machinery.
- **The step-back convenience is scoped to dev by convention and framing** in this slice;
  hard environment-level blocking of it can arrive with higher-environment promotion.

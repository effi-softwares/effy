# Contract: Migration file format & lifecycle law

The rules every migration file obeys. Breaking one is a defect, not a style issue.
Enforced by: `make db-new` scaffolding, the `db-up` working-tree guard, goose strict
ordering, and review discipline (full authoring guide: `db/README.md`).

## Naming & location

```
db/migrations/YYYYMMDDHHMMSS_snake_case_title.sql
```

- Created ONLY via `make db-new name=snake_case_title` (goose timestamp format).
- Never renamed, renumbered, or moved once committed.

## File shape

```sql
-- +goose Up
-- what & why, one line, referencing the owning feature slice
CREATE ...;

-- +goose Down
-- exact reversal — OR a loud no-op when reversal would be lossy:
-- SELECT 1; -- irreversible: fix forward (00X-slice)
DROP ...;
```

- **SQL only** (PostgreSQL 16 dialect). No Go migrations, no generated files.
- One logical change per migration; each runs in a transaction (goose default) — that is
  what makes failure atomic (FR-008/SC-005). A migration that genuinely cannot run
  transactionally (`CREATE INDEX CONCURRENTLY`, …) must carry `-- +goose NO TRANSACTION`
  and gets extra review scrutiny.
- Schema qualification explicit (`public.` / `admin.`) once product tables arrive.

## Lifecycle law

1. **Committed before applied** — `db-up` refuses uncommitted migration edits
   (`FORCE=1` exists solely for private dev iteration on your own latest migration).
2. **Applied beyond your iteration loop ⇒ immutable.** Fixes ship as NEW migrations.
   (Known limitation, recorded in research D7: a committed-after-apply edit is caught by
   review, not machinery, in this slice.)
3. **Down is not recovery.** It exists to iterate on the latest unshipped migration in
   dev. Shipped history only moves forward (constitution: forward-only).
4. **The ledger (`goose_db_version`) is never hand-edited.**

## The proving migration (this slice's only migration)

`<timestamp>_baseline_admin_schema.sql` — Up: `CREATE SCHEMA IF NOT EXISTS admin;` +
`COMMENT ON SCHEMA admin …`; Down: `DROP SCHEMA IF EXISTS admin;`. Establishes the
CLAUDE.md two-schema model's `admin` shell; **no tables** — those belong to future
feature slices.

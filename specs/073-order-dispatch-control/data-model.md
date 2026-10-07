# Data Model: Simple Order Status & Driver Assignment in Orders (073)

One additive migration `db/migrations/<ts>_assignment_note.sql`. Safe before any deploy.

## Changed: `public.round_package` — two nullable columns

| Column | Type | Meaning |
|---|---|---|
| `assigned_by_sub` | text NULL | the person who assigned it; NULL = the planner |
| `assigned_note` | text NULL | one line on how it got here, written once at assignment |

No new table. `driver_round.locked_by_sub` stays in the schema, unused by code from 073 (comment
updated); a later migration drops it.

## Derived, never stored: package status

Nine values — `preparing`, `ready`, `with_driver`, `at_hub`, `out_for_delivery`, `with_carrier`,
`delivered`, `problem`, `cancelled` — plus, for staff, `driverName` and, for `problem`, `detail`.
Derivation table: [research.md](research.md) R1. Pinned by a table-driven unit test.

## Rules

| Rule | Enforced by |
|---|---|
| Collected goods never move | assign/unassign act only on `assigned` rows at unfinished stops on rounds not under way for delivery |
| "Cannot" conditions refuse | the route, via the shared `reasonSeverity` |
| A person's assignment is never moved by the planner | planner never moves assigned work (072) |
| Shop sees no driver name | shop DTO carries status and word only; isolation contract test |

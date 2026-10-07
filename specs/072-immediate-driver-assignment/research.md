# Research: Immediate Driver Work Assignment (072)

Everything here was read from the code as it stands on 2026-10-07, not from 063/069's documents.
Where the two disagree, the code is what is recorded.

## What exists today (the starting point)

| Fact | Where |
|---|---|
| The planner runs every 5 minutes | `apis/edge-api/fleet/serverless.yml` → `planWavesScheduled` |
| Collection is planned only while `run − lead ≤ now ≤ run` | `runsDueForPlanning`, `shared/src/lib/collection-deadline.ts` |
| Delivery is planned only once `now ≥ windowStart − lead` | `isDue`, `fleet/src/planner/windows.ts` |
| Every pass that assigns anything inserts a **new** `driver_round` per driver | `commitWave`, `fleet/src/planner/repository.ts` |
| Capacity and stop count are judged over **this pass's** packages only | `Running` in `fleet/src/planner/assign.ts` |
| The driver's app is given **one** round — delivery before collection, oldest first | `CURRENT_ROUND`, `driver/src/work/sql.ts` |
| No driver action checks any time | `collectStop`, `hubCheckin`, `reportIssue`, `setDropStatus`, proof routes |
| Unassigned reasons are rows **per wave**; the reader takes the latest collection wave | `assignment_exclusion`, `UNASSIGNED_WORK` |
| The dispatcher's reassign check hard-codes no refrigeration, an 8-hour deadline, 12 min/stop and the first zone only | `reassign`, `fleet/src/dispatch/service.ts` |
| Collection runs can be created and deleted, not edited | `admin/src/functions/delivery-collection-run*` |
| `planning_lead_min` has no editing screen | no reference outside the planner |

### ⚠ F1 — going off duty returns nothing to the pool

063 FR-035 requires it, tasks T105 and T125 are ticked, and **no code does it**. `goOffDuty` ends the
duty session and nothing else; comments in `fleet/src/duty/repository.ts` and `drivers/sql.ts` say
"there is no sweep now". Today the gap is narrow because rounds exist for 45 minutes. With early
assignment it is the difference between working and not: a driver given tomorrow's run at 18:00 goes
home and keeps it.

### ⚠ F2 — the "assigned nothing" alarm would fire all night

`DispatchWaveAssignedNothing` is emitted when a pass considers packages and assigns none
(`infra/envs/dev/dispatch.tf`). Under continuous assignment, one package readied at 20:00 with no
driver on duty is that condition on every pass until morning.

## Decisions

### R1 — Remove the gate, keep the tick

**Decision**: every pass gathers and assigns. `runsDueForPlanning`, `nextPlanningTime`, `isDue` and
`plannedAt` are deleted, with the `no_run_due` and `window_not_due` skip outcomes.

**Rationale**: the gate *is* the behaviour being removed. The gather queries, the eligibility rule
and `pickByLoad` are untouched.

**Alternatives**: a longer lead — still a window, still hides work; rejected by the operator.

### R2 — Which run a collection package belongs to

**Decision**: one new function beside `collectionDeadline`: `nextRunInstant(runs, now)` — the earliest
active run instant strictly after `now`, looking at today and tomorrow. It is the round's
`deadline_at`. No active run → nothing is planned (unchanged).

**Rationale**: FR-011/FR-012. Built from `instantAtLocalTime`, so the DST fixtures already cover it;
`nextPlanningTime` did the same two-day scan and is the shape to copy.

**Consequence**: a package readied two minutes before a run targets that run, fails
`cannot_meet_deadline` for everyone, and rolls to the next run on the first pass after the run time.
That is the spec's stated edge case and needs no code.

### R3 — A round's opening time is derived, never stored

**Decision**: `opens_at` is computed, in one SQL function created by the migration:

```
round_opens_at(kind, deadline_at, window_start_at) =
  collection → deadline_at − planning_lead_min
  delivery   → window_start_at − planning_lead_min   (NULL when the round has no window)
```

NULL means open. `driver_round` gains one nullable column, `window_start_at`.

**Rationale**: FR-014 and the "lead is changed" edge case. A stored opening time is a second copy of
a fact and goes stale the moment the setting changes; this repo has shipped that defect repeatedly.
For a collection round the run instant already *is* `deadline_at`, so nothing new is stored at all.
A SQL function because three readers need it — the driver's reads, the driver's gate, the dispatch
view — across two services, and two TypeScript copies would diverge.

**Alternatives**: store `opens_at` and rewrite it on every pass — a reconcile job for something a
subtraction answers. A TypeScript helper in `@effy/edge-shared` — forces every read to fetch the
setting separately and cannot be used in `ORDER BY`.

### R4 — One round per driver per run: find, then create

**Decision**: a round's *bucket* is `(driver_id, kind, deadline_at, window_start_at)`. When the
planner places a package it adds to the driver's existing round in that bucket if one is `planned`
and not locked; otherwise it creates one. The planner's per-driver running totals are **seeded** from
that existing round (its weight and its stops), so capacity and the deadline are judged over the
whole round and not just this pass.

Each pass runs in one transaction holding `pg_try_advisory_xact_lock`; a pass that cannot take it
does nothing. `round_package_open_uq` remains the guarantee that a package is in one round.

**Rationale**: FR-015–FR-017. No unique index on the bucket, deliberately: a dispatcher may reassign
a round to a driver who already holds one for the same run, and an index would turn that into a
refused save. The advisory lock makes find-then-create safe without it.

**Rounds already under way** keep 063's rule unchanged — a collection package joins only an
outstanding stop for its own shop (`OPEN_STOP_FOR_SHOP`), and nothing joins a delivery round that has
left the hub. Otherwise the package is placed normally, which may start a further round for that run
(FR-015's stated exception).

**Not told per addition**: `changed_note` is written only for a round `in_progress` (FR-018). A
`planned` round just shows its contents.

### R5 — Feasibility starts when the round opens

**Decision**: `eligibilityReasons` takes a `startAt` (default `now`). The planner passes
`max(now, opens_at)`. Finish estimate = `startAt + stops × allowance`, compared to the deadline and to
the driver's stated shift end as today.

**Rationale**: FR-005/FR-006. Without it a round planned at 09:00 for a 14:00 run would be allowed
25 stops (5 h ÷ 12 min) although it can only be worked from 13:15. With it the limit stays what it is
today — three stops at the default settings, which is a property of the 45-minute lead and not of
this feature (see Open note 1).

### R6 — The lock is enforced in the driver service, at one function

**Decision**: `assertRoundOpen(tx, roundId)` in `driver/src/work/`, called inside the transaction of
every route that progresses a round: collect, report issue, hub check-in, drop status, proof presign,
proof submit, drop fail. It reads `round_opens_at(...)` and `now()` from the database and throws
`RoundNotOpenError` → **409** `{ "error": "round_not_open", "opensAt": "<instant>" }`.

A guard test in the style of `route-inventory.guard.test.ts` lists the driver service's mutating
routes and fails naming any whose service function does not call it.

**Rationale**: FR-023/FR-024, SC-004. The database's clock, not the Lambda's or the phone's. One
function, because seven call sites each writing the comparison is seven chances to get it wrong.

### R7 — What the driver's app is given

**Decision** (additive to the wire contract; Kotlin regenerated by `driver-contract:gen`):

- `GET /driver/v1/today` chooses the *current* round as: in progress first; then open rounds by
  deadline; then not-yet-open rounds by opening time. It adds `opensAt` (null = open) for that round
  and `upcoming[]` — the driver's other unfinished rounds, each with kind, `opensAt`, `deadlineAt`,
  stop count and package count.
- The collection-run and delivery-run reads add `opensAt` and `deadlineAt`.

**Rationale**: FR-020, FR-027. Today's "delivery before collection, oldest first" would put a 5–7 pm
delivery round, not yet open, in front of an open collection round.

### R8 — Unlocking on the phone without a timer that reads

**Decision**: the app holds `opensAt` and a clock that re-judges `now ≥ opensAt` every 30 seconds,
exactly as `WindowLine.kt` re-judges "Due now" / "Late". It re-reads nothing. The server remains the
authority: a tap that arrives early gets the 409 and the app shows the time.

**Rationale**: FR-026 with FR-035. `check-no-refresh-timers.sh` flags a loop that waits *and*
re-reads; a clock that re-words loaded data is the allowed case 071 FR-011 names.

### R9 — Unassigned work is one standing fact per package

**Decision**: `assignment_exclusion` stops being per-wave. It gains `kind` (`collection` /
`delivery`); a pass compares the reasons it computed with what is stored for that kind and rewrites
them only if they differ. `UNASSIGNED_WORK` drops its "latest wave" lookup and gains hub-side
(delivery) packages, with a `stage` field.

`dispatch_wave` rows are written only by a pass that assigned or released something.

**Rationale**: FR-029, SC-007. Today a package nobody can take would write a wave row and a set of
exclusion rows 288 times a day. "Write only on change" also means back-office is told (`dispatch`)
only when something it shows changed.

**Migration safety**: `wave_id` becomes nullable rather than dropped and the new uniqueness is a
partial index `WHERE kind IS NOT NULL`, so the fleet service deployed *before* this feature keeps
working between `make db-up` and its own deploy.

### R10 — Returning work the driver cannot do (F1)

**Decision**: the first step of every pass. For each driver who is not on duty or not active, and
each of their rounds that is not locked:

- `planned` → its `assigned` packages are removed and the round is cancelled;
- `in_progress` **collection** → `assigned` packages at stops not yet done are removed (still at the
  shop); anything `picked_up` stays;
- `in_progress` **delivery** → untouched (the goods are in the van).

Audited with the existing `driver.work_released` action. The same step cancels a `planned`, unlocked
collection round whose `deadline_at` is no longer an active run instant (a run was deleted — FR-014).
Released packages are reconsidered later in the same pass.

**Rationale**: FR-034, FR-014. In the pass rather than in the two duty-end routes (the driver's own,
and fleet's) so there is one implementation and it also covers a driver stood down or offboarded.
Worst case five minutes late.

**Locked rounds are left alone**, including their times. A dispatcher who locked a round owns it.

### R11 — The dispatcher's reassign asks the real question

**Decision**: `reassign` builds its `WorkUnit` from the round — every zone on it, its real
refrigeration needs, its real `deadline_at`, `startAt = max(now, opens_at)` and the configured
per-stop allowance.

**Rationale**: FR-031, SC-008. It has to change anyway to pass `startAt`; leaving the hard-coded
values beside it would keep a path by which a person puts chilled goods in a van that cannot carry
them.

### R12 — Alarms (F2)

**Decision**: stop emitting `DispatchWaveAssignedNothing`. Emit `DispatchUnassignedPastOpening` — the
number of unassigned packages whose round would already be open — once per pass, and alarm on it
being above zero for three passes. `DispatchPackagesUnassigned` becomes a per-pass gauge.

**Rationale**: "ready, the run has opened, and nobody has it" is the failure. "Ready at 20:00 for
tomorrow with nobody on duty" is not.

### R13 — Deploy order is the reverse of 063's

`make db-up` → `driver` → driver app → `fleet` → back-office.

The gate and the multi-round read must be live **before** the engine starts assigning early;
otherwise drivers can act on work hours ahead, and the old single-round read shows the wrong round.
The driver service deployed first is harmless: every round the old engine creates is already open.

## Open notes for the operator (not blocking)

1. **Three stops per collection round.** With a 45-minute lead and 12 minutes per stop, a fourth
   stop fails the deadline gate. That is true today and stays true. Raising `planning_lead_min` now
   costs nothing in visibility — drivers see the work regardless — so it can be set to what a round
   really takes. It is a database value with no screen.
2. **Overnight.** Work readied after the last driver goes off duty sits unassigned until someone
   clocks on. The first driver on duty in the morning gets all of it.

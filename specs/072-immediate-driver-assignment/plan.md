# Implementation Plan: Immediate Driver Work Assignment

**Branch**: `dev` (feature directory `072-immediate-driver-assignment`) | **Date**: 2026-10-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/072-immediate-driver-assignment/spec.md`

## Summary

The planner already runs every five minutes; it only *assigns* inside a 45-minute window before a
collection run or a delivery window. This feature removes that window. Every pass assigns whatever a
driver can take, the driver sees it at once, and the platform refuses any action on a round until it
opens.

Six findings shape the plan:

1. **The gate is three functions.** `runsDueForPlanning`, `isDue` and their "not due" outcomes are
   deleted. The gather queries, the eligibility rule and the balancing rule do not change (R1).
2. **A round's opening time is derived, never stored** — one SQL function over the round's deadline,
   its window start and the configured lead. A changed setting moves every round with no rewrite
   (R3).
3. **Rounds accumulate.** A pass adds to the driver's not-yet-begun round for that run or window
   instead of creating one, and judges capacity and the deadline over the whole round (R4, R5).
4. **The lock is one function in the driver service**, called by all seven routes that progress a
   round, in the same transaction as the write. A guard test holds the list (R6).
5. **⚠ Going off duty returns nothing to the pool today.** 063 required it and ticked the task; no
   code does it. Early assignment cannot ship without it, so the pass's first step is to return work
   from drivers who cannot do it (research F1, R10).
6. **Deploy order reverses 063's**: `driver` before `fleet`, so the lock exists before work is
   assigned early (R13).

## Technical Context

**Language/Version**: TypeScript on Node 22 (Lambda, arm64); Kotlin 2.4.0 / Compose Multiplatform
1.11.1 (driver app); React 19 + TypeScript (back-office); SQL (PostgreSQL 16, Goose).

**Primary Dependencies**: none added. Backend: `pg`, the existing `@effy/edge-shared`. App: existing
Ktor client and `mobile-kit` live client. Back-office: existing TanStack Query + `web-kit` live
provider.

**Storage**: PostgreSQL. One additive migration — one column, one SQL function, two indexes, and
`assignment_exclusion` changed from per-wave to standing rows ([data-model.md](data-model.md)).

**Testing**: Vitest unit tests for the pure planner (`assign.test.ts`) and the shared rule; container
tests against the real migrations (the 063 pattern, `planner.container.test.ts`) — sixteen listed in
[quickstart.md](quickstart.md); a guard test over the driver service's mutating routes; the
cross-language DST fixtures extended for `nextRunInstant`; Kotlin `commonTest` for the lock state;
back-office model tests.

**Target Platform**: the `fleet` and `driver` Lambda services behind the existing gateway; the driver
app on Android and iOS; the back-office SPA.

**Project Type**: monorepo — one backend, one mobile app and one web app touched.

**Performance Goals**: ready-to-assigned within one pass, ≤ 5 minutes (SC-001, SC-002). A pass
completes well inside the schedule interval at the stated scale.

**Constraints**: no location, distance or routing (FR-008); assigned work never moves on its own
(FR-009); the lock is enforced by the platform (FR-024); a locked round is never altered (FR-019);
no screen reads on a timer (FR-035); no always-on compute; the operator runs every migration, deploy
and apply.

**Scale/Scope**: fewer than ten drivers, one hub. 1 migration; 2 services (`fleet` planner +
dispatch, `driver` reads + 7 gated routes); 1 shared-library change; 3 contract types extended; the
driver app's today, collection, hub and delivery screens; 1 back-office screen; 1 Terraform file.

### Unknowns

None open. All resolved in [research.md](research.md): gate removal (R1), run membership (R2),
opening time (R3), accumulation (R4), feasibility (R5), the lock (R6), the driver's read (R7),
unlocking without a reading timer (R8), standing reasons (R9), returning work (R10), reassign (R11),
alarms (R12), deploy order (R13).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Checked against constitution **v3.1.0**.

| Principle | Verdict | Notes |
|---|---|---|
| I. Spec-driven | ✅ | Spec carries no technology. Planning found two gaps and went **back** to the spec for both: FR-015/FR-016/SC-005 narrowed to "not yet begun" (R4), and the off-duty rule recorded as required rather than inherited (F1). 063 and 069 are marked superseded on the two points this replaces. |
| II. Monorepo, shared contracts | ✅ | Wire changes in `@effy/shared-types` only; Kotlin regenerated, `driver-contract:check` kept green. The eligibility rule and run arithmetic stay in `@effy/edge-shared`. |
| III. Single serverless backend | ✅ | No new service, route or compute. The engine stays in `fleet`, the driver's reads and lock in `driver`. Same scheduled function, same rate. |
| IV. Auth isolation | ✅ | No change. Ownership is still checked before the lock, so "not yours" and "does not exist" stay identical. |
| V. Design | ✅ | Existing tokens only. Upcoming rounds are list rows, not cards. A locked control is disabled **and** says when it opens — never colour alone. `--accent2` is not used: an opening time is not time pressure. |
| VI. Layered architecture | ✅ | Planner stays pure (`assign.ts`); repository decides what is true. The lock is a service-layer call inside the write's transaction. The opening time has one definition (a SQL function) rather than one per service. App: `opensAt` is domain state; the ViewModel exposes it; the clock re-words and reads nothing. |
| VII. Observability | ✅ | `dispatch.pass` log line; `DispatchUnassignedPastOpening` replaces `DispatchWaveAssignedNothing`, which would otherwise alarm every night (F2). No PII; driver ids only in logs already carrying them. |
| Real-world identifiers | ✅ | None introduced. The alarm uses the existing alerts topic. |
| Locked standards | ✅ | Raw SQL, Goose, no ORM; no new dependency. |

**Gate result**: passes, no amendment. Re-checked after design: unchanged.

## Project Structure

### Documentation (this feature)

```text
specs/072-immediate-driver-assignment/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/routes.md
├── checklists/requirements.md
└── tasks.md                 # /speckit-tasks
```

### Source Code (repository root)

```text
db/migrations/<ts>_immediate_driver_assignment.sql      # NEW

apis/edge-api/
├── shared/src/lib/
│   ├── collection-deadline.ts     # + nextRunInstant; − runsDueForPlanning, nextPlanningTime, wavePlanningTime
│   └── driver-eligibility.ts      # + startAt
├── fleet/src/
│   ├── planner/
│   │   ├── service.ts             # runPass: lock → release → collection → delivery → reasons
│   │   ├── assign.ts              # seeded running totals; bucket; startAt
│   │   ├── repository.ts          # find-or-create round; standing exclusions; all on one tx
│   │   ├── release.ts             # NEW — return work from drivers who cannot do it (R10)
│   │   ├── sql.ts                 # + open planned rounds per driver; gather unchanged
│   │   └── windows.ts             # − isDue, plannedAt
│   ├── dispatch/{service,sql}.ts  # opensAt; day read; standing reasons + hub stage; real reassign check
│   └── functions/plan-waves-scheduled.ts   # dispatch.pass log + metrics
└── driver/src/
    ├── work/
    │   ├── open.ts                # NEW — assertRoundOpen, RoundNotOpenError
    │   ├── open.guard.test.ts     # NEW — every progressing route calls it
    │   ├── sql.ts, repository.ts, service.ts   # multi-round today; opensAt on run reads
    │   ├── complete.ts, delivery.ts            # call the gate
    └── proof/service.ts, repository.ts         # call the gate
    └── functions/*-post.ts        # map RoundNotOpenError → 409

packages/shared-types/src/{driver,dispatch}.ts          # opensAt, deadlineAt, upcoming, stage, targetAt
packages/shared-types/contract-driver/                  # regenerated

apps/driver-mobile/shared/src/commonMain/…/features/
├── today/{domain,data,presentation}/       # opensAt, upcoming list, locked hero
├── collection/{domain,data,presentation}/  # locked collect / issue / hub check-in
└── delivery/{domain,data,presentation}/    # locked start / arrive / proof / fail
                                            # one shared OpensLine + rememberIsOpen (WindowLine's pattern)

apps/back-office/src/features/dispatch/
├── DispatchDayScreen.tsx, RoundDetailScreen.tsx   # "Opens h:mm" / "Open"; stage on unassigned
└── model.ts, repo.ts

infra/envs/dev/dispatch.tf                  # alarm swap

specs/063-driver-work-assignment/spec.md    # FR-001/FR-002 marked superseded by 072
specs/069-delivery-slots-dates/…            # the wait-at-hub rule marked superseded by 072
CLAUDE.md, FEATURE-HISTORY.md, docs/audiences/driver-capabilities.md
```

**Structure Decision**: the existing layout, changed in place. Two new backend files (`release.ts`,
`open.ts`), one migration, no new package, service or screen.

### Build order

Ordered so each phase is safe to deploy on its own, which is **not** the spec's priority order: the
lock (US2) must be live before early assignment (US1).

| Phase | Delivers | Spec |
|---|---|---|
| 0 | Migration; 063/069 marked superseded | — |
| 1 | Shared rule: `startAt`, `nextRunInstant`, DST fixtures | FR-005, FR-011 |
| 2 | Driver service: the lock + guard, multi-round `today`, `opensAt` on reads; contract regenerated | US2 |
| 3 | Driver app: early view, locked controls, self-unlock, upcoming list | US2 |
| 4 | Engine: release step, gate removal, accumulation, run membership | US1, US3 |
| 5 | Standing reasons; dispatch reads; reassign check; back-office screen | US4 |
| 6 | Metrics and alarm; documents; sign-off | — |

Phases 2–3 change nothing a driver can see until phase 4 is deployed: every round the current engine
creates is already open.

## Complexity Tracking

No constitution violation to justify.

Two things are larger than "remove a check" and are recorded here so they are not mistaken for scope
creep:

| Addition | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| A release step for off-duty drivers (R10) | Without it, work assigned in the evening stays overnight with a driver who has gone home, invisible to everyone. | Leaving it for a later feature — today's 45-minute window hides the gap; this feature removes the window. |
| Correcting the reassign check (R11) | It must change to respect the opening time, and beside that change it would keep hard-coded "no refrigeration, 8 hours" while the spec requires every refusal to hold on unopened rounds (SC-008). | Passing `startAt` only — leaves a dispatcher able to do what the engine refuses. |

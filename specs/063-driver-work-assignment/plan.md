# Implementation Plan: Driver Work Assignment & Wave Planning

**Branch**: `driver-managment-and-delivery` | **Date**: 2026-09-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/063-driver-work-assignment/spec.md`

## Summary

Nothing on the platform assigns work to any driver. 061 built the fleet and 062 built clearances; the
piece between them — deciding **which driver does which work, when** — was torn down and never rebuilt.

This slice builds it as a **wave planner**: ahead of each configured collection run, gather every ready
package, apply hard eligibility gates, balance by load, and push a round to a driver. Then hub check-in,
then same-day delivery rounds. Plus a dispatcher console that supervises the engine and overrides it.

**Cold path throughout** (research R3): a scheduled planner and two audiences' CRUD, no customer traffic.
**No new service** (R4, measured): dispatch goes in `edge-api/fleet` (23 handlers), driver reads in
`edge-api/driver` (6). Ordering, deadline and eligibility rules are promoted to `@effy/edge-shared`
because two surfaces must agree on all three (R5).

## Technical Context

**Language/Version**: TypeScript 5.9 / Node 22 (cold path) · Go 1.2x (contract-test counterpart only) ·
React 19 + TypeScript (back-office) · Kotlin 2.4.0 (driver app — consumes generated DTOs; no new screens)

**Primary Dependencies**: Serverless Framework v3 · `pg` (raw SQL, no ORM) · `@effy/edge-shared` ·
`@effy/shared-types` · TanStack Router/Query/Table (back-office) · Ktor (driver app, existing)

**Storage**: PostgreSQL 16, `public` schema, Goose forward-only. Six new tables; **purely additive** —
no column dropped, nothing rewritten.

**Testing**: Vitest (unit + testcontainers against real PostgreSQL) · `go test` for the cutoff
counterpart · React Testing Library (console)

**Target Platform**: AWS Lambda behind the shared HTTP API (`ap-southeast-2`) · Amplify-hosted console ·
existing iOS/Android driver app

**Project Type**: Web service (cold path) + back-office console + an existing mobile client

**Performance Goals**: A wave plans in seconds, not minutes, for one metro and <10 drivers. No
latency-sensitive path exists in this feature.

**Constraints**: One hub. Fewer than 10 drivers. **No location, distance or travel-time data anywhere**
(D20/D22). Capacity enforceable by weight only (R8). Deadlines judged in `Australia/Melbourne`
wall-clock, correct across both DST transitions.

**Scale/Scope**: ~11 new `fleet` handlers, **~15 new `driver` handlers**, 1 scheduled planner, 1
migration, 1 console feature area, 3 promotions to `@effy/edge-shared`, no new mobile screens.

⚠ **AMENDED 2026-09-21 — the driver-facing half was understated by a factor of five.** This plan said
"~3 new `driver` handlers" and "the driver app gains no screen and consumes a restored route". Reading
the app rather than the design docs found that **it calls 21 routes and the backend serves 6**: the
teardown removed the work model *and* its whole API surface, while the client code and the `driver.ts`
contract stayed intact, with all five HTTP repositories wired into ViewModels. Sixteen routes are 404.

Two decisions were taken with the operator (see contracts/routes.md):
1. **Restore the full read surface in the existing 049 contract**, including history and activity — the
   049 *wire contract* stays, the 049 *table shape* stays dead, and the new round/stop/package model
   presents itself in the contract's vocabulary. No Kotlin change for reads.
2. **Simplify the write shapes** (`collect`, `issue`, `hub/checkin`, `drops/{id}/status`) to the new
   model's. ⚠ This DOES change `driver.ts`, regenerate the Kotlin DTOs and require updating those
   repositories and their ViewModels — a cost stated and accepted. `changeId` idempotency survives the
   simplification, because 027's retry-safety rule is not part of what was being simplified.

## Constitution Check

*GATE: passed before Phase 0; re-checked after Phase 1 — see below.*

| Principle | Status | How |
|---|---|---|
| **I. Spec-Driven** | ✅ | spec → plan → tasks → implement. The spec carries zero technology; the two operator decisions were taken at spec time and written as FR-014/FR-004a, not settled here. |
| **II. Monorepo & Shared Contracts** | ✅ | DTOs in `packages/shared-types`, generated to Kotlin. **Three rules promoted to `@effy/edge-shared`** — the sort key, the deadline, the eligibility gates — each because a second consumer exists *in this slice* (R5). |
| **III. Dual-Path** | ✅ | **Cold path throughout**, justified in R3: scheduled batch + two audiences' CRUD, zero customer-facing traffic. No exception needed. |
| **IV. Auth Isolation** | ✅ | Back-office authorizer for dispatch, driver authorizer for driver reads — per-route, as the gateway already does. No new pool, no cross-pool call. Dispatch is deliberately **not** in `edge-api/driver` (R4). |
| **V. Design** | ✅ | Console reuses `ConsoleShell` and design-system primitives; no new token, `tokens:check` must pass **unchanged**. ⚠ The dispatcher view is a **sectioned list + table**, not metric cards — see Complexity Tracking for the one judgement call. |
| **VI. Layered Architecture** | ✅ | handler → service → repository, raw SQL, no ORM, no DI framework. Driver app gains no screen and no ViewModel — it consumes a restored route. |
| **VII. Observability** | ✅ | Structured logs per wave; `dispatch_wave` counters are the audit record (FR-006). A metric + alarm on **waves that assigned nothing while work was ready** — the failure that is otherwise silent. ⚠ Emitted as its own record, **not** as a dimension on an existing metric (059's finding: a dimensioned metric is a different metric in CloudWatch, and the alarm goes blind). |

**No violations requiring justification.** One judgement call recorded below.

## Project Structure

### Documentation (this feature)

```text
specs/063-driver-work-assignment/
├── plan.md              # This file
├── spec.md              # /speckit-specify output
├── research.md          # Phase 0 — 11 findings, incl. the flagged cutoff decision
├── data-model.md        # Phase 1 — 6 new tables, what is read-only, what is derived
├── quickstart.md        # Phase 1 — 18 container proofs, 19 walks, 12 negative proofs
├── contracts/routes.md  # Phase 1 — 14 routes, 3 shared promotions, wire shapes
└── checklists/requirements.md
```

### Source Code (repository root)

```text
db/migrations/
└── <ts>_driver_work_assignment.sql        # additive: 6 tables, 1 partial unique index

apis/edge-api/shared/src/lib/
├── round-ordering.ts                      # the sort key — ONE implementation (R5)
├── collection-deadline.ts                 # run_time − buffer, pinned to Go (R2)
└── driver-eligibility.ts                  # the hard gates — planner AND reassign (FR-034)

apis/edge-api/fleet/src/
├── dispatch/          # repository · service · sql  (console reads + overrides)
├── planner/           # the wave: gather → gate → balance → assign
└── functions/         # 11 handlers + planWaves (scheduled)

apis/edge-api/driver/src/
├── work/              # today · stop completion · hub check-in
└── functions/         # 3 handlers

packages/shared-types/src/
└── dispatch.ts                            # DTOs → generated Kotlin

apps/back-office/src/features/dispatch/
├── DispatchDayScreen.tsx · RoundDetailScreen.tsx
├── repo.ts · queries.ts · model.ts · access.ts
└── components/        # UnassignedPanel · RoundTable · ReassignDialog · LockControl · ReorderControl
```

**Structure Decision**: No new service. `edge-api/fleet` carries dispatch (same audience, same domain,
23/500-ish headroom); `edge-api/driver` carries the driver's reads. Measured in R4 — 053, 054 and 056
each hit the CloudFormation ceiling, so the count is checked rather than assumed.

## Complexity Tracking

| Judgement | Why | Simpler alternative rejected because |
|---|---|---|
| **A deliberate Go↔TS duplicate of the deadline arithmetic** | The planner is TypeScript; `SameDayCutoff` is Go. Principle II's shared-package mechanism does not span runtimes. | Calling `core-api` for the deadline makes wave planning depend on the hot path being up, and **a missed wave is silent** — no error, no alarm, just packages that do not move. Pinned instead by a cross-language contract test with DST fixtures (R2), the shape 028 used to close 027's biggest carry-forward. |
| **Two orderings on a round** — derived sort key, plus a dispatcher's manual `seq` | FR-031 requires a dispatcher to reorder; FR-018 requires a deterministic default. Both must exist. | Storing only `seq` means the default order is written at plan time and never re-derives as work completes; storing only the sort key means a dispatcher cannot reorder at all. Mitigated by stating the precedence **once** in `@effy/edge-shared` so both surfaces resolve it identically (R5). |
| **The dispatcher day view uses a summary strip** | Principle V forbids metric cards at the top of pages. | The strip is **not cards**: it is a single row of counts (assigned / unassigned / late) rendered as inline figures in a sectioned page, and it exists because FR-028 and SC-008 require attention-needing work to be findable without reading healthy work. Prefer tables and sectioned lists everywhere else; if the strip cannot be built without card containers, it is dropped and the unassigned section moves to the top instead. |

## Phase 2 — what `/speckit-tasks` will order

US1 (planner + collection rounds + driver read) is the MVP and must land first; US2 (hub check-in) and
US3 (delivery rounds) depend on it in that order; US4 (dispatcher) supervises what the others produce.

⚠ **Two things must be built before US1's service code, not after**: the migration's partial unique
index (it *is* FR-005, not a safeguard around it), and the three `@effy/edge-shared` promotions — because
a rule written first in `fleet` and copied to `driver` later is exactly the divergence R5 exists to stop.

## Constitution Check — re-evaluated after Phase 1 design

Re-run against the actual data model, contracts and quickstart rather than the intent.

| Principle | Post-design | Change from the pre-Phase-0 check |
|---|---|---|
| **I. Spec-Driven** | ✅ | Design surfaced nothing the spec got wrong. R7 refined FR-014 ("fewest packages" = *assigned today*, not *outstanding*) — recorded in research and covered by C10/NP7, not silently assumed in code. |
| **II. Monorepo & Shared Contracts** | ✅ | Three promotions confirmed by the contract list: `orderRoundStops`, `collectionDeadline`, `eligibilityReasons` — each has **two named callers in this slice**, so none is speculative sharing. NP8 fails the build if the ordering rule is re-implemented locally. |
| **III. Dual-Path** | ✅ | Unchanged. Reconfirmed by R10: real-time driver updates would have needed a long-running process, which only the hot path has — so that capability is **deferred**, rather than dragging driver traffic onto `core-api`. |
| **IV. Auth Isolation** | ✅ | Strengthened. FR-038 is now a contract rule: a driver route answers another driver's round **identically to a non-existent one**, or it becomes an id oracle (052). Proven by C17/NP11. |
| **V. Design** | ⚠ ✅ | One judgement call, recorded in Complexity Tracking: the day view's summary strip. It is inline figures in a sectioned page, **not** card containers — and the plan commits to dropping it if it cannot be built without them. No new token; `tokens:check` must pass **unchanged**, which is the mechanical proof. |
| **VI. Layered Architecture** | ✅ | handler → service → repository holds across all 14 routes and the planner. ⚠ One deliberate inversion: **assignment exclusivity lives in a partial unique index, not the service** (R6) — that is Principle VI's "repository with raw SQL" taken seriously, not a bypass of it. A check-then-write in the service would be the violation. |
| **VII. Observability** | ✅ | `dispatch_wave` is both the audit record and the metric source. The alarm targets the *silent* failure — a wave that assigned nothing while work was ready — and is emitted as its own record, not as a dimension (059). |

**Result: no violations.** The three Complexity Tracking entries are judgement calls with stated
alternatives, not principle breaches.

⚠ **The one thing this design accepts and should be re-read before implementation**: the Go↔TypeScript
deadline duplicate. 054 spent an entire slice deleting a rule written in 14 places, and this plan
knowingly writes one in two. It is accepted because the runtimes cannot share code, the alternative
couples wave planning to the hot path's availability, and the divergence is caught mechanically by a
contract test over byte-identical fixtures including both DST transitions (R2, C18, NP5/NP6). If that
test is ever weakened, this decision is no longer justified.

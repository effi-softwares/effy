# Implementation Plan: Fleet Foundations — Driver, Vehicle & Shop Location Management

**Branch**: `061-fleet-foundations` | **Date**: 2026-09-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/061-fleet-foundations/spec.md`

**Programme context**: slice A of four. Research deliverable
[docs/logistics-engine-architecture.md](../../docs/logistics-engine-architecture.md); 348 catalogued
requirements in [docs/research/logistics/](../../docs/research/logistics/); decisions D1–D24.

---

## Summary

Make Effy able to **describe its fleet accurately**, so that the slice after this one can decide who does
what work. Three new capabilities and one removal:

1. **Vehicles become a first-class entity** with their own register — identity, carrying capability
   (including chilled/frozen, because Effy sells groceries), compliance dates and a retirement lifecycle.
   One table serves both Effy-owned and driver-owned vehicles, distinguished by a fact rather than by two
   features.
2. **A vehicle is held by a driver for a period** — issued with an odometer reading, returned with
   another. At most one open holding per vehicle and per driver, **enforced by two partial unique indexes
   rather than by a service**, because the requirement is a concurrency claim.
3. **The driver record gains a licence class**, the duty period gains an optional expected finish time,
   and every fulfillment shop gains a street address.
4. **The platform loses its ability to record a driver's location** — verified dead surface (no caller, no
   permission on either platform, no reader), removed rather than left dormant.

**Approach**: one forward-only migration; a new vehicle domain in the existing `edge-fleet` cold-path
service; field-only extensions to `edge-admin`'s shop routes and `edge-driver`'s duty route; a vehicle
register and detail screen in the back-office console on the shared design system.

**Assigns no work.** No task, round, dispatch or routing concept appears anywhere (FR-037).

---

## Technical Context

**Language/Version**: TypeScript 5.x on **Node 22** (cold-path Lambdas); React 19 + TypeScript
(back-office); Kotlin 2.4.0 / Compose Multiplatform 1.11.1 (driver app, duty flow only).

**Primary Dependencies**: Serverless Framework v3 (frozen), `pg` via `@effy/edge-shared`,
`@effy/shared-types`, `@effy/design-system`, `@effy/web-kit`, `@effy/api-client`, TanStack
Router/Query/Form, Ktor 3.5.1 (driver app).

**Storage**: PostgreSQL 16, **raw SQL, no ORM**, Goose migrations. One new migration.

**Testing**: Vitest (unit + container-backed via testcontainers, `CONTAINER_TESTS=1`); Testing Library
for the console; Kotlin host tests for the driver app.

**Target Platform**: AWS Lambda (ARM64) behind the shared HTTP API in `ap-southeast-2`; Amplify-hosted
SPA; Android + iOS.

**Project Type**: Web service (cold path) + web console + a small mobile change.

**Performance Goals**: back-office CRUD — no specific latency target beyond the console feeling
responsive. The register is a bounded list (under 10 vehicles in phase 1) and needs no pagination
strategy beyond the existing cursor pattern.

**Constraints**: no money in any driver-domain payload (049 FR-013) · no coordinates anywhere (D20/D21) ·
no customer-facing surface · `tokens:check` must pass **unchanged** · `edge-fleet` 12 → 19 functions,
well inside the CloudFormation budget that forced its creation.

**Scale/Scope**: fewer than 10 drivers, fewer than 10 vehicles, one hub, one metropolitan area. ⚠ **This
number is a design input, not a disclaimer** — it is the reason this plan contains no solver, no roster,
no telematics and no pagination beyond what already exists.

---

## Constitution Check

*GATE: passed before Phase 0; re-evaluated after Phase 1 design — see the bottom of this section.*

| Principle | Assessment | Verdict |
|---|---|---|
| **I. Spec-Driven Development** | `spec.md` written first, zero tech, 40 FRs / 11 SCs / 7 user stories, 0 clarification markers. `plan.md` cites it throughout. | ✅ |
| **II. Monorepo & Shared Contracts** | DTOs extend `@effy/shared-types/src/driver.ts`; the console consumes `@effy/design-system/ui` and `@effy/web-kit/console`; no primitive is re-declared per surface. The blocked-reason vocabulary extends `edge-fleet`'s existing `BLOCKED_REASONS` fragment rather than adding a second predicate. | ✅ |
| **III. Dual-Path Discipline** | **Cold path, all of it.** Back-office CRUD is exactly what the cold path is for. **No exception claimed.** `core-api` is untouched. | ✅ |
| **IV. Auth Isolation** | Every `/fleet/v1/*` route carries the **back-office** authorizer; shop fields ride existing `/admin/v1/*` back-office routes; the duty change rides the existing **driver**-pool route. No token crosses a pool. `config.contract.test.ts` asserts this exhaustively over the real `serverless.yml`. | ✅ |
| **V. Design & Layout** | Console screens use existing primitives and tokens. **No new colour, no new radius** — `tokens:check` must pass unchanged. Layout is a sectioned page with detail rows and a table; **no metric cards** (explicitly no "3 vehicles / 2 compliant" tiles). | ✅ |
| **VI. Layered Architecture** | Three-layer slice per domain: handler → service → repository, raw SQL, rows mapped explicitly and not leaked. No DI framework. Console keeps server state in TanStack Query only. | ✅ |
| **VII. Observability** | Structured logs on every mutation; audit rows via 056's `recordAudit`. ⚠ **No new alarm** — see the note below. | ✅ |
| **Real-World Identifiers** | No operator-unsupplied identifier. Seeds use real suburbs and postcodes (public geographic facts identifying nobody) with **fictional street lines and fictional plates**. No email, phone, domain or account id introduced. | ✅ |

**Telemetry note (VII)**: this feature adds **no CloudWatch alarm**, deliberately. 056's own contract
test asserts the service alarms on a *half-provisioned driver* — a state an operator cannot repair — and
**not** on workload. Nothing here is a comparable irreparable state: a vehicle that fails to save is an
error the operator sees and retries. Alarming on fleet CRUD would train people to ignore a topic that
also carries "sending reputation is about to be suspended".

### Post-Phase-1 re-evaluation
Re-checked after `data-model.md` and the contract were written. **No principle became violated by the
design**, and one was strengthened: deriving compliance and blocked-reasons on read rather than storing
them (data-model §7) keeps Principle VI's "one definition per concept" intact where a cached flag would
have created a second, stale answer.

**Complexity Tracking is empty — no deviations to justify.**

---

## Project Structure

### Documentation (this feature)

```text
specs/061-fleet-foundations/
├── plan.md                                   # this file
├── spec.md                                   # WHAT/WHY, zero tech
├── research.md                               # Phase 0 — R1…R11
├── data-model.md                             # Phase 1 — the migration, table by table
├── quickstart.md                             # Phase 1 — run, prove, walk, break
├── contracts/
│   └── fleet-vehicles.contract.md            # Phase 1 — routes, payloads, refusals
├── checklists/
│   └── requirements.md                       # spec quality gate, 16/16
└── tasks.md                                  # Phase 2 — /speckit-tasks, NOT created here
```

### Source code

```text
db/
├── migrations/<ts>_fleet_foundations.sql     # NEW — the single migration
└── seeds/061_fleet_dev.sql                   # NEW — fictional shops + every vehicle type

apis/edge-api/fleet/                          # the vehicle domain lands here (12 → 19 functions)
├── serverless.yml                            # + 7 routes, back-office authorizer each
└── src/
    ├── vehicles/                             # NEW — repository.ts · service.ts · sql.ts · tests
    ├── holdings/                             # NEW — issue / return, the concurrency-critical half
    ├── functions/                            # NEW — 7 thin handlers
    ├── drivers/{repository,service,sql}.ts   # EXTEND — licenceClass, currentVehicle, 2 blocked reasons
    ├── readiness/                            # EXTEND — vehicle-derived reasons
    ├── schema.container.test.ts              # EXTEND — C1…C10 against real PostgreSQL
    └── shared/config.contract.test.ts        # EXTEND — authorizer coverage over the new routes

apis/edge-api/admin/src/shops/                # EXTEND — address fields on existing routes only
apis/edge-api/driver/                         # duty gains expectedEndAt; location route REMOVED
packages/shared-types/src/driver.ts           # EXTEND — vehicle DTOs (back-office only)

apps/back-office/src/features/
├── vehicles/                                 # NEW — register, detail, create, edit, retire, hold/return
└── drivers/                                  # EXTEND — licence class, current vehicle, readiness reasons

apps/driver-mobile/…/features/driver/         # duty: optional expected finish time
```

**Structure Decision**: the vehicle domain is a **new three-layer slice inside the existing `edge-fleet`
service**, not a new service. `edge-fleet` exists because 056 measured `edge-admin` at 434/500
CloudFormation resources and moved the driver routes out; vehicles are the same audience, the same
authorizer and the same domain, and are read together with drivers on nearly every screen. A separate
service would mean two deployables joining each other's tables. Shop address and the duty field are
**field-only extensions to routes that already exist**, which is why they cost zero new functions in the
two services under resource pressure.

---

## Phases

**Phase 0 — Research**: [research.md](research.md). R1 path · R2 service · R3 shop-address home ·
R4 DB-enforced uniqueness · R5 odometer CHECK · R6 location-removal verification · R7 licence class ·
R8 blocked reasons · R9 seeds and the identifier rule · R10 container testing · R11 what not to touch.
**All resolved. No `NEEDS CLARIFICATION` remains.**

**Phase 1 — Design & Contracts**: [data-model.md](data-model.md),
[contracts/fleet-vehicles.contract.md](contracts/fleet-vehicles.contract.md),
[quickstart.md](quickstart.md). Agent context updated.

**Phase 2 — Tasks**: `/speckit-tasks`. Not produced by this command.

---

## Risks carried into implementation

| # | Risk | Mitigation |
|---|---|---|
| K1 | **`DriverBlockedReason` is a live enum being widened.** 053, 056 and 057 each shipped a defect through exactly this. | Audit every reader before writing: `edge-fleet`, the console's `BLOCKED_LABEL` (a `Record<>` — a missing key renders **nothing**), fixtures. NP12 proves it. |
| K2 | **Docker down ⇒ the concurrency proofs never run.** 059 shipped 40 container tests that had never executed; 058's found three defects afterwards. | §2b of the quickstart; the sign-off must state Docker's status rather than report a green suite. |
| K3 | **Dropping `driver.vehicle_*` is destructive and irreversible in data.** | Called out in the migration header; Down restores shape only; dev rows are fixtures. |
| K4 | **A shop address leaking to a customer surface** would break hidden fulfilment — a platform invariant. | A source guard, plus NP9. |
| K5 | **`expectedEndAt` defaulting to a shift length** would make a guess look like a fact where it decides workload. | FR-033; NP11 — one of the two negative proofs that otherwise leave a green suite. |
| K6 | **Removing a route and then restoring it by resemblance.** 049's sweep needed a "schedules nothing" guard for the same reason. | A negative route guard in `edge-driver`'s contract test; NP8. |
| K7 | **Nobody looks at the screens.** 039 shipped four live defects with a fully green suite. | §5's twenty walks, W18 flagged as the most important. |

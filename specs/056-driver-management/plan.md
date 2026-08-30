# Implementation Plan: Back-Office Driver Management

**Branch**: `056-driver-management` | **Date**: 2026-08-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/056-driver-management/spec.md`

## Summary

Give back-office the driver console 049 deferred: a searchable register, a full profile of record, a
three-state employment lifecycle with audited transitions, live duty visibility, and — the highest-value
half — **a reader for the delivery exceptions the driver app has been writing to nobody since 049**.

**Technical approach**: one new cold-path service `apis/edge-api/fleet` behind the existing back-office
authorizer (the admin stack is measurably full — [research R1](./research.md#r1)), into which the five
existing `edge-api/admin/src/drivers` routes are **relocated** so there is one implementation; one
forward-only migration that **alters three tables and creates none**; and one back-office console feature
slice. The driver mobile app is not touched.

## Technical Context

**Language/Version**: TypeScript on Node 22 (cold path); React 19 + TypeScript (console); SQL for the
migration. No Go, no Kotlin — [research R13](./research.md#r13) verified `apps/driver-mobile` has no
generated contracts and no drift guard.

**Primary Dependencies**: Serverless Framework v3 on the shared HTTP API; `@effy/edge-shared` (query,
withTransaction, problem, presignRead, RequestScope); `@aws-sdk/client-cognito-identity-provider`;
`@effy/shared-types`; `@effy/api-client`; `@effy/design-system/ui`; `@effy/web-kit/console`; TanStack
Router/Query/Table.

**Storage**: PostgreSQL 16, raw SQL, no ORM. One Goose migration `<ts>_driver_management.sql`.

**Testing**: Vitest for the service and the console; container-backed repository tests against real
PostgreSQL for the paging, status-widening and stranded-work predicates; a `config.contract.test.ts`
reading the real `serverless.yml` ([research R11](./research.md#r11)).

**Target Platform**: AWS Lambda arm64 (`ap-southeast-2`) behind the shared HTTP API; the back-office SPA
on Amplify Hosting (`back-office.dev.effyshopping.com`, 048).

**Project Type**: Web application — cold-path service + existing console SPA.

**Performance Goals**: register list p95 < 500 ms at 500 drivers; every screen's first meaningful read
in one round trip.

**Constraints**: `effy-edge-admin` is at 434/500 CloudFormation resources with `versionFunctions: false`
already spent — this feature **cannot** go there. No currency on any screen (FR-049). No driver PII in
any log, metric or analytics payload (FR-050).

**Scale/Scope**: hundreds of drivers; ~18 routes; 2 console screens plus 3 panels; 3 altered tables.

## Constitution Check

*GATE: passed before Phase 0; re-evaluated after Phase 1 — see below.*

| Principle | Verdict | How |
|---|---|---|
| **I — Spec-Driven** | ✅ | spec → plan → tasks → implement. This plan cites the constitution and stays within locked standards. Two spec-level facts were corrected during research and belong to the spec, not to code: the status widening is safe because all six readers are positive, and the exception tables genuinely have no reader. |
| **II — Monorepo & shared contracts** | ✅ | DTOs expand the existing `AdminDriver*` family in `packages/shared-types/src/driver.ts` — not duplicated per surface. `presignRead` is reused from `@effy/edge-shared` rather than re-implemented ([R4](./research.md#r4)). The assignment-candidate predicate is **extracted to one shared constant** so the console and the sweep cannot drift ([R6](./research.md#r6)). The five existing driver routes are **moved, not forked**. |
| **III — Dual-path** | ✅ **Cold path, unambiguously.** Low-frequency internal operator CRUD for a handful of staff — the doctrine's exact description. There is no customer traffic in this feature and no latency-sensitive read. Placing it on the hot path would put back-office CRUD on the Go service that serves the storefront, which Principle III forbids without justification, and there is none. |
| **IV — Auth isolation** | ✅ | One audience, one authorizer: the **existing** back-office JWT authorizer, per-pool with a pinned issuer. No new pool. No token is forwarded or brokered — the service holds a scoped Cognito **Admin** grant on the **driver pool ARN only**, which is an authorized server-side provisioning write, not cross-pool authentication (the 006/009/049 pattern, research R3 of 049). The **platform record is authoritative**: `admin.staff` decides the operator's access, `public.driver` decides the driver's. ⚠ Deliberately **not** placed in `edge-api/driver`, where a mis-wired route would hand a driver the ability to edit driver records ([R1](./research.md#r1)). |
| **V — Design** | ✅ | Monochrome ramp only; no third hue. **No cards and no metric cards** — the register is a table, the profile a sectioned page of detail rows, duty/exceptions/history are lists; the outstanding-exception count is a labelled figure in a section header, not a tile ([R15](./research.md#r15)). Status is carried by weight and wording, not colour — the correction 041 made when it removed `amber` as a "warning" hue. Light/dark from the shared tokens. **No exception claimed.** |
| **VI — Layered architecture** | ✅ | Three-layer slice per domain: thin handler → service → repository, raw parameterized SQL, explicit wiring, no DI framework. Console uses TanStack Query as the server-state source of truth with no hand-caching in component state. |
| **VII — Observability** | ✅ | Declared in [R16](./research.md#r16): four product events, three metric log lines, **one** alarm (`fleet.driver_provision_failed` — the half-created driver an operator cannot fix from the console). Deliberately no alarm on outstanding exceptions: that is workload, and alarming on workload teaches operators to ignore alarms. No PII in any of it; metric labels stay low-cardinality (no driver id as a label). |
| **Real-World Identifiers** | ✅ | This feature introduces **none**. Driver contact details are operator-entered per-record data, not platform configuration. No new mailbox, endpoint, domain or account id. |

**Result: PASS, with no exception claimed.** Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/056-driver-management/
├── plan.md              # This file
├── spec.md
├── research.md          # Phase 0 — R1..R17 + carried risks
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── fleet-api.contract.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 — /speckit-tasks, NOT created here
```

### Source Code (repository root)

```text
db/migrations/
└── <ts>_driver_management.sql            # NEW — alters 3 tables, creates none

apis/edge-api/fleet/                      # NEW cold-path service (effy-edge-fleet)
├── serverless.yml                        # ~18 routes, back-office authorizer, scoped driver-pool IAM
├── src/
│   ├── functions/                        # thin handlers, one per route
│   ├── shared/
│   │   ├── authz.ts                      # isActiveStaff / canManageDrivers (moved from admin)
│   │   ├── handler-support.ts            # guard() + problem mapping
│   │   ├── audit.ts                      # admin.audit_log writer, PII-free detail
│   │   └── config.ts                     # thresholds; config.contract.test.ts pins serverless.yml
│   ├── drivers/                          # register, profile, create, update, status
│   │   ├── cognito.ts                    # MOVED from admin; create no longer re-enables
│   │   ├── repository.ts  service.ts
│   ├── duty/                             # on-duty, overdue sessions, unassigned work
│   ├── stranded/                         # derived detection + release
│   ├── exceptions/                       # failures + collection issues, resolve
│   ├── history/                          # runs, run detail, proof presign, period summary
│   └── readiness/                        # blocked drivers, zone coverage, expiries
└── (jest/vitest config, .gitignore)      # ⚠ .gitignore is mandatory — 052 found edge-notifications
                                          #   had none and committed 1.7 MB incl. resolved secret ARNs

apis/edge-api/admin/
├── serverless.yml                        # 5 driver routes REMOVED (~25 CF resources reclaimed)
└── src/drivers/                          # DELETED (moved to fleet)

apis/edge-api/driver/src/driver/repository.ts   # status union widened to 3 values

packages/shared-types/src/driver.ts       # AdminDriver* family expanded

apps/back-office/src/
├── routes/drivers.tsx                    # /drivers and /drivers/$driverId under appRoute
├── components/layout/nav.ts              # Drivers entry, no requiredRole
└── features/drivers/
    ├── DriversListScreen.tsx  DriverDetailScreen.tsx
    ├── components/            # profile sections, duty panel, exceptions list, history, readiness
    ├── queries.ts  repo.ts  model.ts
    ├── access.ts              # in-screen role gating, mirrors the backend gate
    └── errorText.ts           # ⚠ maps the api-client's PLAIN-OBJECT throw, not `instanceof Error`
```

**Structure Decision**: a new cold-path service plus a console feature slice, mirroring 053
(`edge-api/orders` + `features/orders`) — the closest and most recent analogue, and the shape the
console screens are copied from. No new shared package: nothing here is cross-surface.

## Phase 0 — Research

Complete: [research.md](./research.md). Seventeen decisions, each settled by reading code. The
load-bearing ones:

- **R1** — a new service, on a **measured** limit (77 handlers / 76 routes in the admin stack).
- **R2** — the status widening is safe because all six readers test `= 'active'`; the 055 lesson about
  naming terminal states positively, applied deliberately.
- **R3** — stranded work is **derived, never stored** (027's counted-not-stored rule, third application).
- **R6** — the "waiting for a driver" count reuses the sweep's own predicate, extracted and pinned.
- **R9** — the cursor is minted from the column that is ordered on, and **the paging test goes through
  the service**, because 053's did not and passed with the defect in place.
- **R13** — no Kotlin is generated; verified, not assumed.

No NEEDS CLARIFICATION remains.

## Phase 1 — Design & Contracts

Complete: [data-model.md](./data-model.md) · [contracts/fleet-api.contract.md](./contracts/fleet-api.contract.md)
· [quickstart.md](./quickstart.md).

Three behaviour changes worth naming here, because each **replaces** something that exists today:

1. **Create refuses a duplicate work email** (FR-014). Today it upserts on conflict and re-enables a
   disabled Cognito account — so "adding a new driver" can silently edit and reactivate a stood-down
   person. The `citext UNIQUE` index that makes the refusal a database guarantee already exists.
2. **A field can be cleared** (FR-010). Today `COALESCE($n, col)` makes "clear" indistinguishable from
   "leave alone", so a zone can never be un-assigned. The write must distinguish *absent* from *null*.
3. **Every mutation is audited** (FR-024). Driver management is currently the only privileged
   back-office domain writing no `admin.audit_log` row.

### Post-design Constitution re-check

Re-evaluated against the concrete design above: **PASS, unchanged.** No principle became strained by
the design. Two points worth recording:

- **Principle V, no-card rule**: the two places a card is the obvious temptation — the outstanding
  exception count and the readiness view — are both specified as section headers and lists. No
  justification is recorded because **no exception is taken**.
- **Principle IV**: the service holds a Cognito Admin grant on the driver pool. Re-checked against the
  isolation clause: this is a provisioning write by an authenticated back-office operator, the same
  grant `edge-api/admin` carries today and 006/009 established. No token is forwarded; no pool's token
  is accepted by another pool's surface.

## Complexity Tracking

Empty — no constitutional deviation is taken.

## Risks carried into implementation

1. **The half-provisioned driver.** Create writes to two systems and cannot be atomic. Mitigated by
   Cognito-first + idempotent upsert (a retry converges), `fleet.driver_provision_failed`, and an
   `accountState` field so the profile **shows** the discrepancy rather than rendering a half-working
   driver as normal.
2. **Suspension is immediate for access, eventual for work.** The screen must say so. Implying a
   suspended driver is cleared of work when they are not is the exact failure this feature exists to
   prevent.
3. **The migration touches a live enum.** Run `edge-api/driver`'s container suite against a real
   database **before and after**, and record both results — 054 found two Go packages red at clean HEAD
   for unrelated reasons, and an unrecorded baseline makes a real regression look pre-existing.
4. **⚠ Nobody has looked at any of this.** 039 shipped four live defects with a fully green suite,
   because layout, contrast and hierarchy are not properties a DOM assertion can see. A person opening
   these screens is a required step, not polish.

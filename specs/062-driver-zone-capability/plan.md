# Implementation Plan: Driver Zone Capability & Coverage

**Branch**: `062-driver-zone-capability` | **Date**: 2026-09-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/062-driver-zone-capability/spec.md`

**Programme context**: slice B of four. Research deliverable
[docs/logistics-engine-architecture.md](../../docs/logistics-engine-architecture.md); decisions
D1–D24 in [docs/research/logistics/](../../docs/research/logistics/). Builds on
[061-fleet-foundations](../061-fleet-foundations/spec.md).

---

## Summary

Make Effy able to say **who is eligible for what work, where** — so the slice after this one can decide
who actually does it.

1. **A clearance is one row**: a driver, a function (collect / deliver), a method (standard /
   same-day), and a zone. Any combination is grantable independently.
2. **"Every zone" is a NULL zone, not a list.** That is the whole of FR-011 — a driver cleared for
   everywhere must cover a zone created next month, and an enumeration would be quietly wrong the
   first time one is added, with nothing failing and nobody told.
3. **Coverage is derived on read**, per *kind of work*, and distinguishes *nobody is cleared* from
   *everybody cleared is unavailable* — different problems, different remedies.
4. **`driver.delivery_zone_id` is removed.** One zone when a driver covers several, and read by
   nothing.

**Approach**: one forward-only migration; a new capability domain in the existing `edge-fleet` service;
a clearance editor and a coverage view in the back-office console. **Assigns no work** (FR-026) and
**does not change how zones are defined** (FR-027).

---

## Technical Context

**Language/Version**: TypeScript 5.x on **Node 22** (cold-path Lambdas); React 19 + TypeScript
(back-office).

**Primary Dependencies**: Serverless Framework v3 (frozen), `pg` via `@effy/edge-shared`,
`@effy/shared-types`, `@effy/design-system`, `@effy/web-kit`, `@effy/api-client`, TanStack
Router/Query.

**Storage**: PostgreSQL 16, **raw SQL, no ORM**, Goose migrations. One new migration.
⚠ **PostgreSQL 16 specifically matters here** — `NULLS NOT DISTINCT` (added in 15) is what makes the
"every zone" grant idempotent in one index instead of two partial ones.

**Testing**: Vitest (unit + container-backed via testcontainers, `CONTAINER_TESTS=1`); Testing Library
for the console.

**Target Platform**: AWS Lambda (ARM64) behind the shared HTTP API in `ap-southeast-2`; Amplify-hosted
SPA.

**Project Type**: Web service (cold path) + web console. **No mobile change** — a driver does not grant
their own clearances.

**Performance Goals**: back-office CRUD. The coverage query is bounded by (active zones × 4) at fewer
than ten zones and ten drivers; no pagination strategy beyond the existing cursor pattern is needed.

**Constraints**: no money, no PII and no geography in any payload · no customer-facing surface ·
`tokens:check` must pass **unchanged** · `edge-fleet` 19 → 23 functions, well inside the
CloudFormation budget that forced its creation.

**Scale/Scope**: fewer than 10 drivers, roughly 9 zones, one hub. ⚠ **A design input, not a
disclaimer** — it is why coverage is computed in one statement on every read rather than cached, and
why no matching index beyond the two FK indexes is proposed.

---

## Constitution Check

*GATE: passed before Phase 0; re-evaluated after Phase 1 design — see the bottom of this section.*

| Principle | Assessment | Verdict |
|---|---|---|
| **I. Spec-Driven Development** | `spec.md` written first, zero tech, 30 FRs / 11 SCs / 5 user stories, 0 clarification markers. | ✅ |
| **II. Monorepo & Shared Contracts** | DTOs extend `@effy/shared-types/src/driver.ts`; console consumes `@effy/design-system/ui` and `@effy/web-kit/console`. ⚠ **The availability rule is READ from `edge-fleet`'s existing `BLOCKED_REASONS` fragment, never re-derived** — that is what makes FR-020 hold by construction. | ✅ |
| **III. Dual-Path Discipline** | **Cold path, all of it.** Back-office CRUD is exactly what the cold path is for. **No exception claimed.** `core-api` untouched. | ✅ |
| **IV. Auth Isolation** | Every `/fleet/v1/*` route carries the **back-office** authorizer; `config.contract.test.ts` asserts this exhaustively over the real `serverless.yml`. No token crosses a pool. | ✅ |
| **V. Design & Layout** | Existing primitives and tokens. **No new colour, no new radius** — `tokens:check` unchanged. Coverage is a **list of problems**, not a matrix with a status column, and **no metric cards** (Principle V, no exception claimed). | ✅ |
| **VI. Layered Architecture** | Three-layer slice: handler → service → repository, raw SQL, rows mapped explicitly. No DI framework. Server state in TanStack Query only. | ✅ |
| **VII. Observability** | Structured logs on every grant and revoke; audit rows via 056's `recordAudit`. **No new alarm** — a failed grant is an error the operator sees and retries, not an irreparable state. Alarming on it would train people to ignore a topic that also carries "sending reputation is about to be suspended". | ✅ |
| **Real-World Identifiers** | None introduced. Seeds name no real person, business or address; zones and drivers already exist. | ✅ |

### Post-Phase-1 re-evaluation
Re-checked after `data-model.md` and the contract. **No principle became violated**, and Principle II
was strengthened: reading `BLOCKED_REASONS` rather than re-deriving availability means the coverage
view and the readiness view cannot drift, which is FR-020 satisfied structurally rather than by
discipline.

**Complexity Tracking is empty — no deviations to justify.**

---

## Project Structure

### Documentation (this feature)

```text
specs/062-driver-zone-capability/
├── plan.md                                   # this file
├── spec.md                                   # WHAT/WHY, zero tech
├── research.md                               # Phase 0 — R1…R8
├── data-model.md                             # Phase 1 — the migration and the two queries
├── quickstart.md                             # Phase 1 — run, prove, walk, break
├── contracts/
│   └── fleet-capability.contract.md          # Phase 1 — routes, payloads, refusals
├── checklists/
│   └── requirements.md                       # spec quality gate, 16/16
└── tasks.md                                  # Phase 2 — /speckit-tasks, NOT created here
```

### Source code

```text
db/
├── migrations/<ts>_driver_zone_capability.sql   # NEW — the single migration
└── seeds/062_capability_dev.sql                 # NEW — three clearance profiles + an uncovered zone

apis/edge-api/fleet/                             # 19 → 23 functions
├── serverless.yml                               # + 4 routes, back-office authorizer each
└── src/
    ├── capabilities/                            # NEW — repository · service · sql · tests
    ├── coverage/                                # NEW — the derived gap view
    ├── functions/                               # NEW — 4 thin handlers
    ├── drivers/{repository,service,sql}.ts      # EXTEND — capabilities on the profile, summary on
    │                                            #   the list; `no_zone` → `no_capabilities`
    ├── readiness/                               # EXTEND — the replaced blocked reason
    ├── schema.container.test.ts                 # EXTEND — C1…C14 against real PostgreSQL
    └── shared/config.contract.test.ts           # EXTEND — authorizer coverage over the new routes

packages/shared-types/src/driver.ts              # EXTEND — capability DTOs; enum NARROWED

apps/back-office/src/features/
├── drivers/                                     # EXTEND — clearance editor, register summary
└── coverage/                                    # NEW — the gap view (or extend readiness; see below)
```

**Structure Decision**: a **new three-layer slice inside the existing `edge-fleet` service**, exactly
as 061 did for vehicles. Clearances are the same audience, the same authorizer and the same domain as
drivers, and are read together with them on every screen that shows either. A separate service would
mean two deployables joining each other's tables.

⚠ **The coverage view extends 056's readiness screen rather than becoming a second screen** (FR-020).
Two screens answering "can this driver work?" would eventually disagree, and the first time they did,
an operator would have no way to tell which was right.

---

## Phases

**Phase 0 — Research**: [research.md](research.md). R1 path and service · R2 the matrix and the
`NULLS NOT DISTINCT` trap · **R3 `sameday_eligible` changes what "uncovered" means** · R4 coverage
derived in one statement · R5 retiring `delivery_zone_id` · R6 concurrency · R7 container testing ·
R8 what not to touch. **All resolved. No `NEEDS CLARIFICATION` remains.**

**Phase 1 — Design & Contracts**: [data-model.md](data-model.md),
[contracts/fleet-capability.contract.md](contracts/fleet-capability.contract.md),
[quickstart.md](quickstart.md). Agent context updated.

**Phase 2 — Tasks**: `/speckit-tasks`. Not produced by this command.

---

## Risks carried into implementation

| # | Risk | Mitigation |
|---|---|---|
| K1 | ⚠ **Omitting `OR zone_id IS NULL` from the match.** It compiles, and passes every test written against zone-specific grants — while silently excluding every "everywhere" driver from every zone. **FR-011's absence is invisible.** | C3 proves it by creating a zone afterwards; **NP2** proves the test catches it. W6 is the most important walk. |
| K2 | **`NULLS NOT DISTINCT` not actually holding.** A uniqueness rule that silently does not hold is 059's nullable `subject_key` — green suite, broken feature. | C2 inserts the duplicate and asserts refusal; NP1 removes the clause and confirms C2 fails. |
| K3 | ⚠ **Same-day gaps in standard-only zones.** Permanent, unfixable rows in the one view whose purpose is to be actionable — and an operator who cannot clear a gap learns to ignore the screen. | R3; C12 and NP5. |
| K4 | **Coverage re-deriving "available".** Two definitions of one rule drift, and the two screens contradict each other. | Read `BLOCKED_REASONS`; C13 and NP6. |
| K5 | **Enum narrowing.** Removing `no_zone` is the mirror of 061's widening and **not symmetrical** — the compiler flags over-specified `Record<>`s, but stored data and fixtures carrying it must be found by hand. | R5's three-step audit before the migration is written. |
| K6 | **Disabling a zone deleting clearances.** Disable is reversible; deleting the grant would mean re-granting by hand to restore cover, and nothing would say why it was lost. | Cascade on DELETE only; filter disabled zones at read. C8 and NP3. |
| K7 | **Nobody looks at the screens.** 039 shipped four live defects with a fully green suite. | §5's nineteen walks, W6 flagged as the most important. |

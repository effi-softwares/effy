# Implementation Plan: Return Failed Parcels to the Hub

**Branch**: `dev` (feature directory `088-failed-parcel-return`) | **Date**: 2026-10-16 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/088-failed-parcel-return/spec.md` (driver backlog A4).

## Summary

A parcel from a failed drop stays in the driver's custody until it is returned to the hub, the round
finishes only then, and a returned parcel waits for staff to choose its next step. Decisions
([research.md](research.md)):

1. **"To return" is derived**; a return is a new `round_package` state `returned` plus one
   `parcel_return` row per action (R1).
2. **Custody gets its delivery half** - and two live defects (custody and the exceptions list both
   reading `picked_up`, which no delivery package is) are fixed by the same change (R2).
3. **Round completion** gains "nothing to return" (R3), in A1's one place.
4. **The driver wire is additive**: `toReturn` on Today and the run; no new item kind (R4).
5. **One writer, two routes**: `recordParcelReturn` in `@effy/edge-shared/delivery`; driver route
   (shared gateway) and staff route (staff gateway) (R5).
6. **Held for staff**: the gather skips a returned parcel with an open failure; the staff delivery
   tools resolve it as they act (R6). Rounds with parcels to return cannot be moved (R10).

## Technical Context

**Language/Version**: TypeScript / Node 22 Lambdas; React 19 (back-office); Kotlin 2.4 / CMP 1.11 (driver app).
**Primary Dependencies**: none added.
**Storage**: PostgreSQL 16 - one migration ([data-model.md](data-model.md)).
**Testing**: Vitest units + container tests (shared, driver, fleet), guards, back-office component tests,
driver-mobile host tests ([quickstart.md](quickstart.md) P1–P12).
**Target Platform**: AWS Lambda behind the shared and staff HTTP gateways; Android + iOS driver app;
back-office web.
**Project Type**: monorepo - backend services + mobile app + web console.
**Performance Goals**: the return is one transaction over a round's packages (tens of rows).
**Constraints**: installed driver builds must keep decoding Today (no new enum value); offline-capable
return (the app's existing queue); no app-update mechanism.
**Scale/Scope**: one hub; failed drops are a small share of drops.

## Constitution Check

| Principle | Verdict | Notes |
|---|---|---|
| I. Spec-driven | ✅ | Spec carries no technology; FR-010 decided and recorded under Clarifications. |
| II. Shared contracts | ✅ | `driver.ts` / `dispatch.ts` in `@effy/shared-types`; `contract-driver` regenerated. |
| III. One backend; gateways | ✅ | No new service. Shared gateway +1 route (`driver`), staff +1 (`fleet`); capacity test run. |
| III. One implementation | ✅ | One return writer (`recordParcelReturn`); one custody definition (shared); one completion rule; one status function. |
| IV. Auth isolation | ✅ | Driver route scoped to the caller's rounds; staff route behind the back-office authorizer. |
| V. Design | ✅ | Driver: a hero + one swipe, existing components. Back-office: a column and an action in the existing exceptions table, two counts in the dispatch day header - no cards. |
| VI. Layering | ✅ | SQL in repositories; status stays a pure function; app: repository → use case → ViewModel. |
| VII. Observability | ✅ | EMF `ParcelsReturned` (count, by `recorded_by`); existing logs per route. |
| Live updates (071) | ✅ | Both routes announce after commit; `change-map.guard.test.ts` updated. |
| Operator runs live changes | ✅ | Migration and deploys handed over. |

Post-design re-check: no violation.

## Project Structure

### Documentation (this feature)

```text
specs/088-failed-parcel-return/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md
├── contracts/driver-return.md · contracts/fleet-return.md
└── checklists/requirements.md
```

### Source Code

```text
db/migrations/2026101614xxxx_parcel_return.sql                              NEW
packages/shared-types/src/{driver,dispatch}.ts ; contract-driver regenerated
apis/edge-api/shared/src/lib/custody.ts                                     delivery half (R2)
apis/edge-api/shared/src/delivery/parcel-return.ts (+ container test)       NEW - recordParcelReturn, TO_RETURN fragment
apis/edge-api/shared/src/delivery/override.ts                               refusal words; resolve open failures (R6)
apis/edge-api/shared/src/status/{sql,status}.ts (+ test)                    `returned` fact (R7)
apis/edge-api/driver/src/proof/{sql,repository}.ts                          completion rule (R3)
apis/edge-api/driver/src/work/{service,delivery,sql}.ts                     toReturn on Today and the run
apis/edge-api/driver/src/functions/driver-delivery-return-v1-post.ts        NEW ; serverless.yml route
apis/edge-api/fleet/src/planner/sql.ts                                      gather hold (R6)
apis/edge-api/fleet/src/dispatch/{service,sql}.ts                           move refusal (R10); day counts
apis/edge-api/fleet/src/exceptions/sql.ts                                   location from custody (R2)
apis/edge-api/fleet/src/functions/dispatch-return-v1-post.ts                NEW ; serverless.yml route
apps/back-office/src/features/{exceptions,dispatch}                         "Record return"; counts
apps/driver-mobile/shared/src/commonMain/.../features/{today,delivery}      "Return to hub" step
```

**Structure Decision**: existing services and apps only; the one cross-service rule (the return) lives
in `@effy/edge-shared/delivery` beside `consignment.ts`.

## Deploy order (operator)

Migration → `notifications` (unchanged) → `fleet` and `driver` (both read the new state) → back-office →
the driver app. The old app keeps working: it ignores `toReturn`, and staff can record its returns.

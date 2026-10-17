# Implementation Plan: Driver Work in One Order, and Trips That Join Up

**Branch**: `dev` (feature directory `093-driver-work-sequence`) | **Date**: 2026-10-17 | **Spec**: [spec.md](spec.md)

## Summary

The platform enforces the physical order of a driver's work:
- shops before the hub check-in;
- loading before any drop;
- hub check-in, and returning failed parcels, before the next load;
- deliveries finished before collecting again.

Each gate is enforced as one rule called by every route, in the same way 072 did the time gate. A
collect settles only what the driver was shown. The planner prefers the driver who collected a parcel for
delivering it, so a driver's day runs as one trip. Packages missing at loading or check-in become held
packages with a dispatcher decision. Dispatch sees one worded stage per run, plus overdue alerts. A
daily vehicle check feeds eligibility.

Decisions: [research.md](research.md) R1–R11. Data: [data-model.md](data-model.md). Contracts:
[contracts/api.md](contracts/api.md).

## Technical Context

**Language/Version**: TypeScript (edge-api `driver`, `fleet`, `shared`; `shared-types`; back-office React 19); Kotlin 2.4 / CMP (driver app).
**Primary Dependencies**: none new.
**Storage**: PostgreSQL 16. One goose migration: three tables and two settings columns.
**Testing**: vitest unit and container tests (driver, fleet, shared), back-office vitest, KMP host tests, guard scripts.
**Target Platform**: AWS Lambda (shared and staff gateways), Android/iOS, the web console.
**Constraints**: no compatibility with installed driver builds (operator, 2026-10-17). Every write stays idempotent on `changeId`. No refresh timers (071).
**Scale/Scope**: +1 shared-gateway route (driver), +3 staff-gateway routes (fleet). Both gateways are at 54%.

## Constitution Check

| Principle | Verdict | Notes |
|---|---|---|
| I. Spec-driven | ✅ | Spec 093, with three operator decisions recorded. |
| II. Shared contracts | ✅ | DTOs and stage words in `@effy/shared-types`. The held and stage SQL fragments are in `@effy/edge-shared`, used by both services. Kotlin contract regenerated. |
| III. One backend | ✅ | Routes are added to the existing `driver` and `fleet` services. No new compute. Gateways stated (R11). |
| IV. Auth isolation | ✅ | Driver routes use the driver pool; fleet routes use the staff gateway's back-office authorizer. |
| V. Design / no cards | ✅ | Back-office additions are table sections on Exceptions and columns on Dispatch. Driver screens use the existing kit. |
| VI. Layering | ✅ | handler → service → repository. The planner preference sits in the pure `planWave`. |
| VII. Observability | ✅ | Refusals counted per type (EMF, via the existing helper). Analytics events: `vehicle_check_submitted`, `package_declared_missing`. |
| Hidden fulfilment | ✅ | A shop name appears only where the driver already sees it (collection stops) and in back-office. Nothing new reaches the customer or the shop. |

Post-design re-check: ✅ (no violations; no complexity table).

## Project Structure

```text
db/migrations/20261017100000_driver_work_sequence.sql                       NEW
packages/shared-types/src/{driver.ts,delivery-admin.ts,run-stage.ts(NEW),index.ts}
packages/shared-types/contract-driver/*                                      regenerated
apis/edge-api/shared/src/delivery/{held.ts(NEW),round-stage.ts(NEW)}         HELD_SQL, ROUND_STAGE_FACTS
apis/edge-api/shared/src/lib/driver-eligibility.ts                           vehicle_check_due, vehicle_unsafe
apis/edge-api/driver/src/work/{sequence.ts(NEW),complete.ts,delivery.ts,load.ts,service.ts,repository.ts}
apis/edge-api/driver/src/proof/repository.ts                                 run_not_loaded gate
apis/edge-api/driver/src/vehicle/{service.ts,repository.ts}(NEW) ; functions/driver-vehicle-check-v1-post.ts(NEW)
apis/edge-api/driver/src/functions/*                                         SequenceError → 409
apis/edge-api/fleet/src/planner/{sql.ts,assign.ts,types.ts,repository.ts,service.ts}   collectedBy, HELD_SQL, overdue announce
apis/edge-api/fleet/src/exceptions/*, dispatch/*, deliverydays/*, drivers/sql.ts       held/overdue/vehicle checks, stage, waiver, thresholds
apis/edge-api/fleet/src/functions/{waive-sequence,held-resolve,vehicle-check-clear}.ts(NEW)
apps/back-office/src/features/{exceptions,dispatch,delivery}/*
apps/driver-mobile/shared/src/commonMain/kotlin/.../features/{today,collection,delivery,account,onboarding}/*
apps/driver-mobile/shared/src/commonMain/kotlin/.../features/vehiclecheck/*  NEW
```

## Implementation notes

- **Gate order inside a write**: ownership (404) → `assertRoundOpen` (409 `round_not_open`) → the retry
  answer (a step already done answers as done) → sequence gates → the write. A retry of a step that was
  done must not be refused by a gate that became true later. For example, a load retried after the
  driver collected again still answers "loaded".
- **Offline queue**: the app's replay sends queued writes in order. A replayed write that comes back with
  a sequence 409 is surfaced as "not recorded" with the server's sentence (C1's not-recorded banner),
  never dropped.
- **Planner pass**: `HELD_SQL` is added to both gathers. Overdue crossings use `[now − interval, now)`
  with the pass's interval, announcing `dispatch` once per crossing.
- **App**: the check-in, load and drop controls are driven by `stage`, `loadStep` and `loaded` from the
  server. Delivery screens no longer derive "staged" themselves for gating. The vehicle check is shown
  between "Go on duty" and Today when `me.vehicleCheck.state == "due"`.

## Deploy order

Migration → `driver` + `fleet` (in either order; each reads only its own new columns, and both read the
migration's tables) → back-office → driver app.

# Implementation Plan: Driver Operations Realignment

**Branch**: `dev` (feature directory `082-driver-operations-realignment`) | **Date**: 2026-10-09 | **Spec**: [spec.md](spec.md)

## Summary

Driver work follows the new delivery model. The delivery gather stops asking "is it same-day?" and asks
079's one definition "does Effy deliver it?", then plans each window's round **on the window's day**. A
parcel is collected on the **latest run that makes its window**. Permissions lose the method dimension.
Hub check-in shows **Effy delivery (by day and window)** and **Courier**; drivers and dispatch never
read "same-day" or "standard". Dispatch gets a day selector. Eighth slice of the delivery model v2
programme (epic E8) — ⚠ the last thing 078's switch waits for.

Decisions ([research.md](research.md)):

1. **Effy's to deliver = `package_delivered_by`** (R1), everywhere a method was tested.
2. **Rounds are planned on their day** (R2): one predicate in the gather; `round_opens_at` unchanged.
3. **Collect on the latest run that makes the window** (R3): a pure function beside `nextRunInstant`.
4. **No migration** (R4): nothing reads `driver_zone_capability.method` any more; the column goes at E9.
5. **The driver wire is additive** (R5): `effyGroups`; the task-kind value and old counts stay until E9,
   so the previous app keeps working.
6. **One new staff route** for dispatch's day view (R6). Staff gateway 155 → 156.

## Technical Context

**Language/Version**: TypeScript / Node 22 Lambdas; React 19 (back-office); Kotlin 2.4 / CMP (driver app).
**Primary Dependencies**: none added.
**Storage**: no migration ([data-model.md](data-model.md)).
**Testing**: Vitest units + container tests (shared, fleet, driver, orders), guards, back-office component
tests, driver-mobile host tests ([quickstart.md](quickstart.md) P1–P13).
**Target Platform**: `fleet`, `orders` (staff gateway); `driver` (shared); back-office; driver-mobile.
Customer and supplier surfaces unchanged.
**Performance Goals**: the pass gains one predicate and one pure function per parcel; no new query per
parcel.
**Constraints**: previous driver-app version keeps working; no polling; no cards; customers keep
"Same-day"/"Standard"; suppliers keep "Effy driver"/"Courier".
**Scale/Scope**: staff gateway 155 → 156 of 300.

## Constitution Check

| Principle | Verdict | Notes |
|---|---|---|
| I. Spec-driven | ✅ | Spec carries no technology. |
| II. Shared contracts | ✅ | `dispatch.ts`, `driver.ts`, `fleet` capability types in `@effy/shared-types`; `contract-driver` regenerated. |
| III. One backend; gateways | ✅ | No new service; +1 route on `fleet` (staff). |
| III. One implementation | ✅ | Who delivers: `package_delivered_by`. Opening: `round_opens_at`. Run choice: one pure function. Clearance: `eligibilityReasons`. |
| IV. Auth isolation | ✅ | New read = any active staff; capability edits stay admin/manager. |
| V. Design | ✅ | Day tabs + a table per window; no cards. |
| VI. Layering | ✅ | Pure functions in shared; SQL in repositories. |
| VII. Observability | ✅ | Existing `UnassignedPastOpening` covers later-day windows once planned; new EMF `ParcelsCollectLate`. |
| Live updates | ✅ | No new mutating route; existing announcements cover the pass and assignments. |
| Operator runs live changes | ✅ | Deploys handed over; no migration, no `apply`. |

Post-design re-check: no violation.

## Project Structure

```text
packages/shared-types/src/{dispatch,driver,fleet*}.ts ; contract-driver regenerated
apis/edge-api/shared/src/lib/collection-deadline.ts (+ test)     # collectionRunFor
apis/edge-api/shared/src/lib/driver-eligibility.ts (+ test)      # no method; ungrouped rule
apis/edge-api/shared/src/lib/driver-coverage.ts
apis/edge-api/fleet/src/planner/{sql,repository,service,types,assign}.ts (+ planner.container.test.ts)
apis/edge-api/fleet/src/{capabilities,coverage,drivers,dispatch,assignments}/*
apis/edge-api/fleet/src/dispatch/windows.{service,repository}.ts + functions/dispatch-windows-v1-get.ts   NEW
apis/edge-api/fleet/src/driver-method.guard.test.ts               NEW
apis/edge-api/driver/src/work/{complete,service,delivery,repository,sql}.ts ; functions/driver-hub-checkin-v1-post.ts
apis/edge-api/orders/src/orders/{repository,assignments}.ts
apps/back-office/src/features/{dispatch,drivers,orders (Assignments day selector)}
apps/driver-mobile/shared/src/commonMain/.../features/{collection,today,delivery,map,history}, core/nav
scripts/check-driver-delivery-words.sh                            NEW
docs/logistics-engine-architecture.md, docs/driver-app-design-brief.md, docs/order-console-guide.md
```

## Build order

1. Shared types + regenerate the driver contract. 2. `collectionRunFor` (P1). 3. Eligibility without the
method (P5). 4. Planner: delivery gather + on-its-day (P2, P3, P11), collection run choice (P4).
5. Capabilities, coverage, drivers, dispatch reads without the method (P6); guard (P12).
6. Assign refusal (P10); dispatch windows route (P9). 7. Orders: needs a driver (P8). 8. Driver service:
check-in groups (P7). 9. Back-office. 10. Driver app (P13) + words script. 11. Docs.

## Risks

| Risk | Limit |
|---|---|
| A later-day parcel delivered early | One predicate; P2 broken once |
| A parcel collected too late for its window | Same rule as checkout's `judgeWindow`; P1/P4; `collectLate` shown |
| A driver loses a permission | No rows change; P6 |
| The previous driver app breaks | Wire is additive; enum value kept; V7 |
| An ungrouped postcode goes to a driver far away | The operator's stated rule; the stricter one is a one-line change |
| Cold goods held overnight unnoticed | `coldOvernight` on the day view |
| Old words survive on a screen | Script in the build |

## Complexity Tracking

| Trade-off | Why | Rejected |
|---|---|---|
| The method column is left in place, unread | No rewrite of grants, no deploy gap | Dropping it now: old code errors between migrate and deploy; E9 drops it with the rest |
| `same_day_delivery` stays on the driver wire | The previous app's enum would not parse a new value | Renaming now with an alias: two values to carry through every reader until E9 anyway |

# Interface Contracts — 063

Two audiences, two authorizers, **no new service** (research R4). Shapes live in
`packages/shared-types` (Principle II) and reach the driver app through the existing Kotlin generator.

---

## `edge-api/fleet` — back-office authorizer (+11 handlers, 23 → 34)

Dispatch is the same domain and the same audience as drivers, vehicles and readiness, which `fleet`
already owns.

| Method | Path | Purpose | FR |
|---|---|---|---|
| GET | `/fleet/v1/dispatch/day` | The day's work: every round, holder, state | FR-027 |
| GET | `/fleet/v1/dispatch/unassigned` | Work nobody could take, **with the reason** | FR-015, FR-028 |
| GET | `/fleet/v1/dispatch/rounds/{id}` | One round: stops, packages, order | FR-027 |
| POST | `/fleet/v1/dispatch/rounds/{id}/reassign` | Move to another driver | FR-029, FR-034 |
| POST | `/fleet/v1/dispatch/rounds/{id}/unassign` | Return to the pool | FR-030 |
| POST | `/fleet/v1/dispatch/rounds/{id}/reorder` | Set stop order | FR-031 |
| POST | `/fleet/v1/dispatch/rounds/{id}/lock` | Mark as a person's decision | FR-032 |
| DELETE | `/fleet/v1/dispatch/rounds/{id}/lock` | Release it | FR-032 |
| POST | `/fleet/v1/dispatch/packages/{id}/move` | Move one package between rounds | FR-029 |
| GET | `/fleet/v1/dispatch/waves` | Wave history — what ran, what it decided | FR-006 |
| POST | `/fleet/v1/dispatch/plan` | Run a planning pass now | FR-005 |

**Authorization**: read = any active staff incl. `csa`; **mutate = `admin`/`manager`**, matching 053's
reasoning — reassigning physical work is an assertion about the world, not a lookup.

⚠ **`POST …/reassign` REFUSES an ineligible driver and names the condition** (FR-034). A dispatcher may
override a *preference*; they may not override unlicensed, stood-down, or no-suitable-vehicle. The
refusal names which one — a uniform "not allowed" would send the operator hunting.

---

## `edge-api/driver` — driver authorizer (+15 handlers, 6 → 21)

⚠ **AMENDED 2026-09-21, AND THE FIRST DRAFT OF THIS SECTION WAS WRONG.** It listed three handlers and
invented two shapes. The truth, found by reading the app rather than the design docs:

**The driver app already calls 21 routes and the backend serves 6.** The teardown removed the work
model *and* its entire API surface, while the app's client code and the `driver.ts` contract stayed
fully intact — all five HTTP repositories are wired into ViewModels, not dormant. Sixteen routes are
404 today.

Two specific errors, both caught by T058's own instruction to match what the app already sends:

| First draft said | Reality |
|---|---|
| `DriverTodayDTO` (new) | **`TodayDTO` already exists** — `{ phase, activeRunId, active, upNext[], remainingCount }` |
| `POST /driver/v1/rounds/{id}/checkin` | app calls **`POST /driver/v1/hub/checkin`** with `{ runId, changeId }` |

### The storage/contract split

The 049 **wire contract stays**; the 049 **table shape stays dead**. The new model presents itself in
the contract's vocabulary:

| New model | Contract vocabulary |
|---|---|
| `driver_round (kind='collection')` | collection run |
| `round_stop (kind='shop_pickup')` | collection stop |
| `driver_round (kind='delivery')` | delivery run |
| `round_stop (kind='customer_drop')` | delivery drop |
| `round_package` | collection package / drop package |

### Reads — keep the 049 shape exactly (no Kotlin change)

| Method | Path | Serves |
|---|---|---|
| GET | `/driver/v1/today` | `TodayDTO` — FR-017, FR-036 |
| GET | `/driver/v1/collection/runs/{runId}` | `DriverCollectionRunDTO` |
| GET | `/driver/v1/collection/runs/{runId}/stops/{stopId}` | `CollectionStopDTO` |
| GET | `/driver/v1/delivery/runs/{runId}` | `DeliveryRunDTO` |
| GET | `/driver/v1/delivery/drops/{dropId}` | `DeliveryDropDTO` |
| GET | `/driver/v1/history` | `HistoryDTO` |
| GET | `/driver/v1/history/{kind}/{id}` | `HistoryDetailDTO` |
| GET | `/driver/v1/activity` | `ActivityItem[]` |
| POST | `/driver/v1/activity/read` | `ActivityReadRequest` |

### Writes — simplified to the new model's shape (operator decision, 2026-09-21)

⚠ These **do** change `driver.ts`, regenerate the Kotlin DTOs, and require updating the affected
repositories, mappers and ViewModels. That cost was stated and accepted.

| Method | Path | Serves |
|---|---|---|
| POST | `/driver/v1/collection/runs/{runId}/stops/{stopId}/collect` | per-package outcome — FR-026 |
| POST | `/driver/v1/collection/runs/{runId}/stops/{stopId}/issue` | a stop that could not be completed |
| POST | `/driver/v1/hub/checkin` | `HubCheckinResponse` — FR-022, FR-023 |
| POST | `/driver/v1/delivery/drops/{dropId}/status` | drop outcome |

⚠ **`changeId` SURVIVES THE SIMPLIFICATION.** Simplifying a request shape is not licence to drop
retry-safety: 027 established changeId-per-shopper-action because a write that arrives without its
response reaching us must not apply twice, and a double-applied collect is invisible. Every write above
carries one.

### Slice D, still deferred

`POST …/proof`, `POST …/proof/presign`, `POST …/drops/{id}/fail` — the three custody mechanisms (D16).

⚠ Every driver route is scoped to the authenticated driver's own work (FR-038). A run or stop id
belonging to another driver answers exactly as a non-existent one does — otherwise the route is an
oracle for which ids are real (052's byte-identical refusals).

---

## `@effy/edge-shared` — promoted, because two services need it

| Export | Why shared |
|---|---|
| `orderRoundStops(...)` | **The sort key** (D20). Dispatcher and driver MUST show one order. Research R5 — if they diverge, a dispatcher's reorder silently never reaches the driver and *nothing fails*. |
| `collectionDeadline(runTime, bufferMin, onDate)` | The wave trigger (R2). Pinned to Go's `SameDayCutoff` by a cross-language contract test with DST fixtures. |
| `eligibilityReasons(driver, work)` | The hard gates (FR-009/010). The planner applies them; `reassign` re-applies them to refuse a dispatcher (FR-034). **Two callers, one rule** — or a dispatcher can do what the planner would not. |

---

## Wire shapes → `packages/shared-types/src/dispatch.ts`

`DriverTodayDTO` · `RoundDTO` · `StopDTO` · `RoundPackageDTO` · `UnassignedWorkDTO` ·
`ExclusionReasonDTO` · `WaveSummaryDTO`

⚠ **Integer fields use `WireInt`**, not bare `number`. 027's R13: Kotlin serialises a bare number as
`Double`, the wire carries `1.0`, and Go refuses it into an `int`. 054 hit the same thing again and the
drift guard could not catch it — only reading the generated Kotlin back does.

⚠ **Money and weight**: no money crosses these contracts at all (a driver is not told an order's value).
Weight is grams as `WireInt`.

---

## Scheduled

| Function | Schedule | Notes |
|---|---|---|
| `planWaves` | `rate(5 minutes)` | ⚠ Wakes often, **plans rarely** — it checks whether any run has reached `run_time − buffer − lead`. The cadence is not the wave; the schedule is. A 5-minute tick that usually does nothing is cheap and keeps the trigger off a single fragile cron expression per run. |

⚠ **The planner is idempotent by constraint, not by timing** (R6). Overlapping invocations must be safe,
because a retry after a timeout is indistinguishable from a second tick.

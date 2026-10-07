# Contracts: Immediate Driver Work Assignment (072)

No route is added or removed. Every change is additive to a response, plus one new refusal.
Types live in `packages/shared-types/src/{driver,dispatch}.ts`; the driver app's Kotlin is
regenerated (`pnpm --filter @effy/shared-types driver-contract:gen`).

All instants are ISO 8601 UTC, as the existing window fields are. `opensAt: null` means **open**.

## Driver service (`apis/edge-api/driver`)

### `GET /driver/v1/today` — `TodayDTO`

| Field | Change |
|---|---|
| `opensAt` | **New**, `string \| null`. When the current round opens. |
| `deadlineAt` | **New**, `string \| null`. The current round's deadline; null when idle. |
| `upcoming` | **New**, `UpcomingRound[]`. The driver's other unfinished rounds, soonest first. |

```ts
interface UpcomingRound {
  runId: string;
  kind: "collection" | "same_day_delivery";
  opensAt: string | null;
  deadlineAt: string;
  stopCount: WireInt;
  packageCount: WireInt;
}
```

**Which round is current** (was: delivery first, then oldest):
1. a round in progress;
2. otherwise the open round with the earliest deadline;
3. otherwise the not-yet-open round that opens soonest.

`phase`, `active`, `upNext`, `remainingCount` describe the current round as before. `idle` only when
the driver holds no unfinished round at all.

### `GET /driver/v1/collection/runs/{runId}` and `GET /driver/v1/delivery/runs/{runId}`

Add `opensAt: string | null` and `deadlineAt: string`. Readable at any time, open or not.

### The refusal — every route that progresses a round

| Route | |
|---|---|
| `POST /driver/v1/collection/runs/{runId}/stops/{stopId}/collect` | |
| `POST /driver/v1/collection/runs/{runId}/stops/{stopId}/issue` | |
| `POST /driver/v1/hub/checkin` | |
| `POST /driver/v1/delivery/drops/{dropId}/status` | |
| `POST /driver/v1/delivery/drops/{dropId}/proof/presign` | |
| `POST /driver/v1/delivery/drops/{dropId}/proof` | |
| `POST /driver/v1/delivery/drops/{dropId}/fail` | |

(Paths as declared in `driver/serverless.yml`; the guard test reads them from there.)

Before the round opens, each answers:

```
409 Conflict
{ "error": "round_not_open", "opensAt": "2026-10-08T02:15:00.000Z" }
```

- Judged against the database's clock in the same transaction as the write.
- Nothing is written. A retry after `opensAt` succeeds.
- Ownership is checked first: a round that is not the caller's still answers 404, identically to one
  that does not exist.
- A request already idempotently complete (a stop already `done`) keeps answering as it does today.

## Fleet service (`apis/edge-api/fleet`)

### `GET /fleet/v1/dispatch/day` — `DispatchDayDTO`

| Field | Change |
|---|---|
| `rounds[].round.opensAt` | **New**, `string \| null`. |
| `rounds[]` | Now every unfinished round, plus rounds finished today (was: rounds *created* today — which would hide a round assigned yesterday evening). |
| `unassigned[].stage` | **New**, `"collection" \| "delivery"`. Hub-side packages nobody can deliver are now listed. |
| `unassigned[].targetAt` | **New**, `string`. The run or window the package is waiting for. |
| `unassigned[].reasons` | Unchanged shape. Now the current standing reasons, not the latest wave's. |
| `waves[]` | Unchanged shape. Only passes that assigned or released something. |

### `GET /fleet/v1/dispatch/rounds/{id}`

Adds `opensAt: string | null` and `deadlineAt: string`.

### `POST /fleet/v1/dispatch/rounds/{id}/reassign`

Request and responses unchanged. The `ineligible` refusal can now name `no_refrigeration`,
`cannot_meet_deadline` and `not_cleared` for a zone other than the round's first — conditions the
current check cannot see (research R11).

`unassign`, `reorder`, `lock`, `unlock`: unchanged, and valid on a round that has not opened.

### Scheduled pass — `planWavesScheduled`

Same schedule (`rate(5 minutes)`). Per pass, in one transaction under an advisory lock:

1. return work held by drivers who cannot do it, and cancel unbegun rounds for a deleted run;
2. assign collection work to the next run;
3. assign hub-side same-day work, per window;
4. rewrite standing unassigned reasons where they changed.

After commit: `announceDispatch(driverIds)` — only if step 1–4 changed something.

Log lines: `dispatch.pass` (assigned, released, unassigned by kind) replaces `dispatch.wave_planned`
/ `dispatch.wave_skipped`. Metrics: `DispatchPackagesAssigned`, `DispatchPackagesUnassigned`,
`DispatchUnassignedPastOpening` (new), `DriverPackagesHeldHours` (unchanged).
`DispatchWaveAssignedNothing` is no longer emitted.

## Live updates

No new kind. `work` to each driver whose rounds changed; `dispatch` to ops. Opening is **not**
announced — nothing changed on the server; the app's own clock crosses `opensAt` (research R8).

## Shared rule (`@effy/edge-shared`)

```ts
eligibilityReasons({ driver, work, now, perStopAllowanceMin, startAt? })
nextRunInstant(runs, now): Date | null
```

`startAt` defaults to `now`, so every existing caller and test is unaffected until it passes one.

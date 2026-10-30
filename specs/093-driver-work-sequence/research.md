# Research: 093 Driver Work in One Order

Industry background: [research-07](../../docs/research/logistics/research-07-driver-task-sequencing.md).
These are the design decisions.

## R1 - The gates live in the driver service, next to the time gate

**Decision**: Each gate is one function in `apis/edge-api/driver/src/work/sequence.ts`, called inside the
write's own transaction, after the ownership check and the time gate, in the same way as `assertRoundOpen`
(072). Each raises a `SequenceError(code, sentence, issues)`, which one helper turns into a 409 problem.
The codes are `stops_outstanding`, `run_not_loaded`, `finish_collection_first`, `return_parcels_first`
and `finish_deliveries_first`. `sequence.guard.test.ts` reads the service's routes and fails on any drop,
load, collect or check-in route that does not call its gate.

**Rationale**: 072 proved the shape: one rule, every route, and a guard test that names the route that
forgot. A gate the app enforces alone is a courtesy, as `open.ts` says.

**Alternatives**: A database trigger. Rejected, because it can't produce the sentence or the issues, and
the codebase keeps rules in TypeScript with raw SQL.

## R2 - "Loaded" is a drop state that already exists

**Decision**: A drop is loaded when its `round_stop.status` is past `pending`. Loading (`loadRun`) becomes
the only writer of `out_for_delivery`. `out_for_delivery` is removed from `DropStatusRequest.to`, and
`setDropStatus`, proof and failure refuse a `pending` drop with `run_not_loaded`. No new column is
needed.

**Rationale**: `IN_TRANSIT_SQL` already defines custody as "started drop", so loading already moves the
parcel into the driver's custody. Nobody uses the app, so the per-drop start can go (operator,
2026-10-17).

## R3 - The cross-run gates come from the one custody definition

**Decision**: Loading is refused when the driver holds custody of a collection parcel that has not been
checked in, or of a parcel to return (`CUSTODY_BY_DRIVER`, with the collection half or `TO_RETURN_SQL`).
Collecting is refused when the driver holds a parcel in transit (`IN_TRANSIT_SQL`). A waiver row
(`round_sequence_waiver`, keyed by round) lifts both gates for that round.

**Rationale**: "What is this driver holding" is already defined once in `@effy/edge-shared/custody`.
A second definition would drift from it, which is the 064/088 lesson.

## R4 - Collect settles only what the request names (US2)

**Decision**: In `collectStop`, once `packages` is required, every `assigned` row the request does not name
stays `assigned`. The stop is marked done only when no `assigned` row is left. The response gains
`remaining` (a count). `CollectRequest.packages` becomes required (non-empty).

**Rationale**: "Absent means collected" was kept only for older builds (063), and none exist now.

## R5 - Combined trips are a preference in the pure planner

**Decision**: The delivery gather already joins the collection round (`dr`), so it now returns
`dr.driver_id AS collected_by`. `PlannablePackage.collectedBy` is added. In `planWave` for delivery,
the order is:
1. A round already visiting this order's stop takes the package (unchanged).
2. Otherwise, if the collector is among the eligible targets, the collector takes it, with the note
   "Auto-assigned - collected it, continuing to delivery".
3. Otherwise the fewest-packages rule decides (unchanged).

Eligibility (clearance, vehicle, capacity, deadline, on duty) is unchanged, so a collector who cannot
take the package simply isn't eligible. A delivery round under way is never a target, because
`roundVisiting` already skips it, so FR-015 is already met. It is pinned in a unit test.

**Rationale**: The rule is pure and table-tested (`assign.test.ts`). Assignment stays explainable in
words (063 FR-014a).

**Alternatives**: One "trip" round spanning collection and delivery. Rejected: every reader, guard and
the custody definition assume one kind per round, and the hub check-in is the natural seam between the
two. The trip is the sequence of rounds, held together by R3's gates and by R5's preference.

**Timing (FR-016)**: The delivery round appears at the next planning pass (≤ 5 minutes) and is pushed
over the existing `run_assigned` notification and the live update. The delivery round can't open before
its window start less the lead time anyway, so the wait costs nothing.

## R6 - Held packages: one table, and row deletion for a load declaration

**Decision**: A new `public.package_hold` table records shop_fulfillment, step (`load` | `checkin`),
reason, note, driver, round, change_id, created_at, and a resolution (`found` | `lost`, staff sub, time).
There is at most one open hold per package, enforced by a partial unique index.
- **Load declaration**: the package's delivery `round_package` row is deleted (073's unassign does the
  same). A drop left with no rows is deleted with it, so it disappears from the run. The hold row is the
  record.
- **Check-in declaration**: the collection row stays `picked_up`, which keeps history true, and the hold
  row says it never arrived.
- **Both gathers** (collection and delivery) exclude a package with a hold that is open or `lost`.
  "Found" resolves the hold, and the next pass plans the package again.

**Rationale**: No new `round_package.state`. Every reader that filters states keeps working, and the
custody definition stays exact (a deleted delivery row isn't in transit; a held check-in row isn't in
custody, because `hub_checkin` exists).

## R7 - Run stage is derived by one pure function in shared-types

**Decision**: `runStage(facts)` and `RUN_STAGE_WORDS` live in `@effy/shared-types/run-stage.ts`. One SQL
fragment, `ROUND_STAGE_FACTS` in `@effy/edge-shared`, gives the counts. The driver service puts `stage`
and `stageLabel` on Today and the run reads. The fleet service puts them on dispatch day and round
detail. Back-office imports the words. The app shows the server's label.

| Kind | Stage | When |
|---|---|---|
| collection | `to_collect` | no shop settled |
| collection | `collecting` | some shops settled, label "Collecting n of m" |
| collection | `to_hub` | every shop settled, no check-in |
| collection | `checked_in` | check-in exists |
| delivery | `to_load` | any drop still `pending` |
| delivery | `out` | loaded, drops open, label "Out n of m" |
| delivery | `returning` | no drop open, parcels to return |
| delivery | `closed` | round completed or cancelled |

## R8 - Overdue exceptions are derived on read, and announced by the planner pass

**Decision**: `delivery_settings` gains `load_overdue_min` (default 20) and `checkin_overdue_min`
(default 30), edited on the existing Delivery days PUT. The exceptions read gains `overdue[]`:
- delivery rounds in `to_load` whose `round_opens_at + load_overdue_min < now()`;
- collection rounds in `to_hub` whose last stop `completed_at + checkin_overdue_min < now()`.

The 5-minute planner pass announces `dispatch` when a round crossed its threshold since the previous pass
(a stateless window check), so back-office re-reads.

**Rationale**: This is counted, not stored (027). An alarm fed by a read is silent when nobody looks, which
is why 064's custody alarm rides the planner.

## R9 - Out of order is derived

**Decision**: A run is out of order when the order of `round_stop.completed_at` differs from the displayed
order. That is the same precedence the driver sees (`ordered` in the driver service and the dispatch
reorder). It is shown on round detail as "Worked out of order". Nothing is stored.

## R10 - Vehicle check: one row per driver, vehicle and local day; two new eligibility reasons

**Decision**: A new `public.vehicle_check` table: driver, vehicle, local_date (Melbourne), answers jsonb
(six items: `ok` | `minor` | `unsafe` + note), `unsafe` boolean, change_id unique, cleared_by_sub,
cleared_at, clear_note. It is unique on (driver, vehicle, local_date).

`ExclusionReason` gains `vehicle_check_due` (an open holding and no check today) and `vehicle_unsafe`
(today's check is unsafe and not cleared). Both are loaded into the candidate and into `BLOCKED_REASONS`
(readiness). `/driver/v1/me` gains `vehicleCheck: {state: "due" | "ok" | "unsafe", vehicleLabel}`. New
routes: driver `POST /driver/v1/vehicle-check`, fleet `POST /fleet/v1/vehicle-checks/{checkId}/clear`.
Checks are listed in the exceptions read (`vehicleChecks[]`, today's checks with any minor or unsafe
answer).

**Rationale**: It uses the existing eligibility machinery, so "no work" has a reason in words for free
(FR-026). Notes only, no photos (spec assumption).

## R11 - New routes (gateway headroom 54% / 54%)

- driver (shared gateway): `POST /driver/v1/vehicle-check` (+1)
- fleet (staff gateway): `POST /fleet/v1/dispatch/rounds/{id}/waive-sequence`,
  `POST /fleet/v1/held-packages/{holdId}/resolve`, `POST /fleet/v1/vehicle-checks/{checkId}/clear` (+3)

The reads are folded into the existing exceptions, dispatch and me reads.

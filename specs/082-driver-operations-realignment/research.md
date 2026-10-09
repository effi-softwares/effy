# Research: Driver Operations Realignment (082)

Read off the code on `dev` (after 081). No external research needed.

## R1 — What is Effy's to deliver: the one definition, not the method

**Decision**: `GATHER_DELIVERY` (and dispatch's `UNASSIGNED_WORK`, the orders "needs a driver" filter and
`assignments.ts`) stop testing `delivery_method = 'same_day'` and ask
`public.package_delivered_by(o.delivery_type, method, opd.slot_id) = 'effy'` through `deliveredBySql`
(079). That already answers for every order ever placed: same-day or sold a window = Effy.
**Rationale**: since 078 a later-day Effy parcel is `standard` WITH a window; the method test is the one
thing keeping 078's switch off. `delivery-type.guard.test.ts` already forbids deciding from `slot_id`.

## R2 — Delivery rounds are planned on the window's day

**Decision**: the delivery gather adds `opd.window_start IS NULL OR opd.window_start < $endOfLocalToday`
(`endOfLocalDay(now)`, passed as a parameter). A later-day parcel is at the hub, unassigned, with no
round, until its day; from the first pass of that day it is planned exactly as today's windows are
(072: assigned at once, the round opens at `round_opens_at`).
**Rationale**: 072 assigns work to drivers ON DUTY NOW and releases an off-duty driver's unstarted work
every pass. Planning Thursday's round on Tuesday would hand it to Tuesday's shift and take it back at
clock-off, every day. `round_opens_at` stays the one opening definition; nothing stores a date.
**Alternatives**: a per-day duty roster to pre-assign — a new concept, out of scope.

## R3 — Which collection run: the latest that makes the window

**Decision**: pure function `collectionRunFor(windowStart, runs, turnaroundMin, calendar)` in
`@effy/edge-shared` (`lib/collection-deadline.ts`, beside `nextRunInstant`): the latest run instant `R`
with `R + turnaroundMin ≤ windowStart`, searching the window's day then earlier delivery days (skipping
non-delivery weekdays and dates — 069's calendar), at most 7 days back. `planCollection` keeps targeting
the NEXT run (`nextRunInstant`) and takes a parcel only when `collectionRunFor(parcel) ≤ nextRun` — so a
parcel is first offered on its intended run and on every later one if it was missed (FR-009).
Parcels with no window (courier via the hub, pre-069 orders) → the next run, as today.
The same rule `judgeWindow` uses for today (`run + turnaround ≤ start`), so checkout and the planner agree.
**"Assign to…" by hand** (`$1` path) bypasses the rule: a person may collect early (spec edge case).
**At risk**: `intendedRun < nextRun` and still uncollected → `collectLate` on the dispatch reads.
**Alternatives**: collect as soon as ready (the operator may choose it — one comparison to remove).

## R4 — Permissions: stop reading the method; NO data migration

**Decision**: every reader ignores `driver_zone_capability.method`:
`CANDIDATE_DRIVERS` aggregates `DISTINCT (function, zone_id)`; `eligibilityReasons.isCleared` drops the
method test; capability SQL (`fleet/src/capabilities/sql.ts`, `coverage/repository.ts`, `drivers/sql.ts`,
`dispatch/*`) drops it. The editor writes ONE row per (function, area) with the fixed, unread value
`'standard'` and deletes every row for that (function, area) on removal.
**Rationale**: any old grant for a function and area becomes that function for that area — FR-015 —
with no rows rewritten, no deploy-order gap (old code keeps working on unchanged rows until it is
replaced), and nothing to roll back. The column and its unique index are dropped at E9 with the other
method columns (backlog E8-T05 corrected).
**Ungrouped postcodes (FR-016)**: `isCleared` — work with `zoneId === null` is cleared by ANY clearance for
the function (was: only `zoneId === null` clearances). Collection is judged the same way, against the
delivery address's group, as today.
**Guard**: `driver-method.guard.test.ts` fails a reader of `c.method` / `cap.method` and a
`'same_day'`/`'standard'` literal in fleet's planner, dispatch, capabilities and coverage code.

## R5 — Hub check-in: two groups, additive on the wire

**Decision**: `HubCheckinResponse` gains `effyGroups: [{ date, windowStart, windowEnd, label, count }]`
(label written by the server with `formatArrival`, as 072 does for moments — the driver app has no
timezone database) and `effyCount`; `courierCount` (080) stays. `sameDayCount` / `standardCount` stay,
deprecated, until E9 — the previous app version reads them.
**The task kind stays `same_day_delivery` on the wire.** It is an identifier the app never shows, and the
previous app's generated enum would fail to parse a new value (FR-013). Screens say "Delivery". Renamed
at E9 with the contract clean-up (backlog E8-T07 corrected).

## R6 — Dispatch: a day's windows; "needs a driver" on any day

**Decision**: one new staff route `GET /fleet/v1/dispatch/windows?date=YYYY-MM-DD` — the days on sale
(`effyDays`, 078's calendar) and, for the chosen day, each window with its Effy parcels: where each is
(`packageStatus`, 073's nine words), `collectLate`, `coldOvernight` (chilled/frozen and checked in on a
day before its window's), and the round's driver or "planned on the day". Back-office → Orders →
Assignments gains the day selector.
**"Needs a driver"** (orders list filter + `assignments.ts`): an Effy parcel (R1) at the hub with no open
assignment whose round HAS OPENED — `public.round_opens_at('delivery', deadline, window_start) <= now()`
for a window, immediately for a windowless legacy parcel. A parcel waiting for a later day is not listed.
**"Assign to…" for delivery before the parcel's day** → refused `not_yet` ("its round is planned on its
day"), in `fleet/src/assignments/service.ts` `prepare`.

## R7 — The words

Drivers and dispatch read **Effy delivery / Delivery / Collection / Courier**. A new
`scripts/check-driver-delivery-words.sh` (the shape of 079's shop script) fails "same-day"/"standard"
in user-visible strings of `apps/driver-mobile` and of back-office `features/dispatch`,
`features/drivers` and the Assignments components. Customer and supplier surfaces are untouched.

## R8 — Where it attaches

`fleet` (staff gateway): +1 route → staff 155 → 156 of 300. `driver` (shared): no new route.
`orders` (staff): no new route. **No migration.** No new service.

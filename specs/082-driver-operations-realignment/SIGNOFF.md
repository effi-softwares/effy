# Sign-off notes: 082 — Driver Operations Realignment

✅ **SIGNED OFF by the operator (2026-10-09) — deployed to dev** (`fleet`, `driver`, `orders`; operator-reported). ⚠ Walks V1–V7 not recorded; the deviations and the known gap below stand as built. The model switch stays NULL until E9.

**Status (2026-10-09)**: **built, checked by machine and deployed to dev (operator-reported). Not walked.**
Every check below ran on local containers and test runners. 29/29 tasks ticked, with
the gaps listed under "Not done". **No migration.**

⚠ This is the last thing 078's model switch waited for. The switch itself is still E9's to turn on.

## What changed

- **Effy's parcels are found by who delivers them, not by a method.** The delivery gather, dispatch's
  unassigned list, the driver-readiness count and the orders "needs a driver" filter all ask 079's one
  definition (`package_delivered_by … = 'effy'`). Until now they tested `delivery_method = 'same_day'`,
  so a window sold for a later day (stored `standard` with a window since 078) got **no delivery round**.
- **A delivery round is planned on its window's day.** One predicate in the gather
  (`window_start <= end of local today`). A later-day parcel waits at the hub on no round; "Assign to…"
  for a delivery before its day is refused (`not_yet`). `round_opens_at` is unchanged.
- **A parcel is collected on the latest run that makes its window** — `collectionRunFor` (shared,
  beside `nextRunInstant`), the same test checkout's `judgeWindow` uses. Missed its run → offered on the
  next, counted (`DispatchParcelsCollectLate`) and shown as "Late for its run". Courier parcels via the
  hub and parcels sold no window still go on the next run; supplier pickups never.
- **Permissions are (function, area).** Nothing reads `driver_zone_capability.method`; rows written
  under either old value count; a grant adds a row only when none exists for that function and area; a
  revoke removes every row behind it. A postcode in **no group** is cleared by any clearance for the
  function. Back-office shows **Collects** / **Delivers**, each *Everywhere* or named areas.
- **Hub check-in shows two groups**: `effyGroups` (by day and window, label written by the server,
  `dueToday` says load-now vs shelve) and `courierCount`. Each collection parcel carries `deliveredBy` and
  `windowLabel`. The driver app says "Effy delivery" / "Delivery run" / "Courier".
- **Dispatch day view**: `GET /fleet/v1/dispatch/windows?date=` (staff gateway 155 → 156) and a
  "Delivery windows" section on Assignments — any day on sale, each window's parcels and status, "Late for
  its run", "Needs cold storage", and its round's driver or "Planned on the day".
- **Words**: `scripts/check-driver-delivery-words.sh` (Makefile `driver-words-guard`, and the web CI
  workflow) fails "same-day"/"standard" on a driver or dispatch screen.

## Proofs

| # | Proves | Broken once? |
|---|---|---|
| P1 | `collectionRunFor` (latest run, previous delivery day, non-delivery days, DST) | ✅ turnaround dropped → failed |
| P2 | later-day parcel on no round before its day; on its window's round on the day | ✅ day predicate removed → failed |
| P3 | a `standard` parcel with a window is planned; a carrier's/courier's never | ✅ method test restored → failed |
| P4 | collection: not before its run; on it; late after; courier via hub next run; supplier never | ✅ filter removed → failed |
| P5 | clearance ignores the method; ungrouped postcode → single-group driver | ✅ (unit) every-zone-only rule restored → failed |
| P6 | old rows of either method are one clearance; grant adds none; revoke removes all | — |
| P7 | check-in groups by day and window; old counts still present | ✅ grouped by method → failed |
| P8 | needs a driver only once the round has opened, any day | ✅ opened test dropped → failed |
| P9 | dispatch day view: days, parcels, late, cold, round only on the day | — |
| P10 | "Assign to…" a later day's delivery → `not_yet` | — (fails with P3's break) |
| P11 | an order stored as moved back to Effy for a later day gets its round that day | — (fails with P2's break) |
| P12 | guard: no method read in fleet; words script | ✅ planted reader → failed; planted strings (TS and Kotlin) → failed |
| P13 | driver app: groups, today vs shelved, who takes a parcel | — |

## What ran (with `CONTAINER_TESTS=1`)

edge-api: shared 892, fleet 306, driver 178, orders 123, commerce 328, admin 251, customer 221, storefront
180, notifications 71, shop 484/485 (the known `recipientsForShop` failure, open since 079). shared-types
104; back-office 365; shop-web 453; customer-web 664; design-system guards; driver-mobile host tests (17
suites, compiled). `pnpm -r typecheck` clean; scripts: driver words, shop words, no-refresh-timers,
no-emerald, no-jade.

## Deviations from the backlog / tasks (mine — for the operator to confirm)

1. **No migration** (backlog E8-T05 planned one). The method column is left in place, unread; E9 drops it.
2. **The task kind stays `same_day_delivery` on the driver wire** (E8-T07 planned a rename). The previous
   app's generated enum would not parse a new value. Screens say "Delivery". E9 renames it.
3. **"Every zone" still appears in the driver's own account line** (`coverageLabel`, shared with fleet):
   not a delivery word, and renaming it touches the driver app's account tests. Back-office says
   "Everywhere".
4. **Dispatch's unassigned list no longer shows a ready parcel that is not yet due on a run**, and no
   longer lists a parcel a courier collects from the supplier (it never was driver work — 080 excluded it
   from the gather but not from this list).
5. **`dueToday`** was added to each check-in group so the app can say "Loaded" vs "Shelved" without
   comparing dates.
6. Product calls settled by default (spec Assumptions): collect on the LATEST run; chilled/frozen may
   wait at the hub overnight, flagged; an ungrouped postcode goes to any delivering driver.

## Not done / known gaps

- **The orders list's "needs a driver" still lists a parcel READY at its supplier that is not yet due on a
  run** (e.g. ready Tuesday for Thursday's window). The run rule is TypeScript (`collectionRunFor`) and the
  filter is SQL with paging; a second SQL copy of the rule was not written. Dispatch's list is right.
- P11 simulates what `moveToEffy` stores rather than calling it (081 proves what it stores).
- No walk. iOS not compiled here (Android host tests only).
- The planner alarm `DispatchUnassignedPastOpening` now also covers later-day windows on their day; no new
  alarm was added for `DispatchParcelsCollectLate` (counted, shown on the day view).

## Operator steps (dev)

```
make edge-deploy SERVICE=fleet ENV=dev     # +1 staff route (dispatch/windows); planner, permissions
make edge-deploy SERVICE=driver ENV=dev    # hub check-in groups; additive wire
make edge-deploy SERVICE=orders ENV=dev    # needs a driver
```
No migration, no `make apply`. Then the back-office build (on push) and a **driver app release** — the
previous build keeps working against the new server (additive wire), with the old words until updated.

⚠ **Leave the model switch NULL.** With 082 deployed, the driver side no longer blocks it; turning it on
is E9.

## Walks still to do

V1–V7 in [quickstart.md](quickstart.md), in dev with the model switch on for the walk, then back to NULL.

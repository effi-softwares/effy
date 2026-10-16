# Research: Return Failed Parcels to the Hub (088)

What the code does today, and the decisions this plan takes. Every "today" below was read from the
tree on 2026-10-16.

## What happens to a failed parcel today

- `recordFailure` (`apis/edge-api/driver/src/proof/repository.ts`) writes a
  `delivery_attempt_failure` row and sets the stop `skipped`. The delivery `round_package` stays
  `assigned`; `shop_fulfillment` stays `collected`. Since driver backlog A1 (2026-10-16) the round is
  closed when its last drop is settled — including by a failure.
- `packageStatus` (`shared/src/status/status.ts`) reads an unresolved failure as **Problem —
  "Delivery attempt failed — …"** for ever: nothing resolves it except back-office's exception
  "Resolve" (`fleet/src/exceptions`).
- The planner cannot plan it again: the delivery gather excludes any package with an `assigned`
  delivery row (`GATHER_DELIVERY`, partial unique index) — so a failed parcel is stuck on its round.
- ⚠ **Two live defects, the same shape as EFY-GNYQ58.** Both custody readers assume delivery packages
  are `picked_up`; the planner only ever writes `assigned` on a delivery round:
  - `CUSTODY_BY_DRIVER` (`shared/src/lib/custody.ts`) never lists a delivery parcel — so the
    go-off-duty "you are still holding packages" check (`driver/src/driver/service.ts`) never fires
    for one, and dispatch's custody view never shows one.
  - `LIST_EXCEPTIONS` (`fleet/src/exceptions/sql.ts`) computes `package_location` from `picked_up`,
    so every failed parcel reads **at hub** while it is in a van.
- Staff tools (`moveToCourier` / `moveToEffy` / `changeEffyWindow`, `shared/src/delivery/override.ts`)
  refuse an order with a delivery row `assigned` on an `in_progress` round ("out for delivery"). A
  failed, unreturned parcel matches that — which is the right refusal (it is in a van) with the wrong
  words.

## Decisions

### R1 — A parcel "to return" is a fact already stored; a return is one new state and one new row

**Decision**: "to return" = a delivery `round_package` still `assigned` whose stop is `skipped` (the
failure). The return sets it to a new state **`returned`** (with `settled_at`) and writes one
`parcel_return` row per return action (who, when, which round, how many). No column on the failure
changes (FR-013).

**Rationale**: the custody rule ("derived on read, never stored", 064) already describes the van; it
was only wrong about the state. A `returned` state frees the partial unique index, so the parcel can be
planned again once staff decide — the same mechanism every settled state uses. The return row is the
audit (FR-012/013) and the idempotency anchor (`change_id` unique).

**Alternatives**: reuse the unused `failed` state — rejected: it reads as "the attempt failed", which
is the stop's fact, not the parcel's location; and a later proof on the same drop selects `assigned`
packages, which must keep working until the parcel is returned. A `returned_at` column on
`round_package` — rejected: no "who", and two writers (driver, staff) need attribution.

### R2 — Custody includes delivery parcels: in transit, or failed and not returned

**Decision**: `CUSTODY_BY_DRIVER` gains the delivery half: a delivery `round_package` `assigned` whose
stop is `out_for_delivery` / `en_route` / `arrived` / `skipped`, with no arrival. `LIST_EXCEPTIONS`
derives `package_location` from the same definition (one fragment, two readers).

**Rationale**: FR-001/FR-007/FR-009 are all "who is holding it"; the platform has one answer for that
and it must include the parcels this feature is about. A `pending` (staged) drop is not counted: there
is no "load the van" step yet (backlog H8 adds it), so a staged parcel may still be on a hub shelf.

### R3 — A delivery round is finished when no drop is open AND nothing is to return

**Decision**: `COMPLETE_ROUND_IF_FINISHED` (A1) adds "and no `assigned` package on a `skipped` stop".
The return action calls the same completion. Collection rounds are untouched.

**Rationale**: FR-002/SC-003. One completion rule, now with its second condition, in the one place A1
put it.

### R4 — The return step reaches the driver as a NEW OPTIONAL FIELD, never a new item kind

**Decision**: `TodayDTO.toReturn` and `DeliveryRunDTO.toReturn` — `{ runId, count, orders[] } | null`.
`active` stays `null` when the only work left on the current round is the return. The driver app shows
a "Return to hub" hero from `toReturn`.

**Rationale**: installed driver apps decode `TodayItemRef.kind` as a closed enum; a new value
(`hub_return`) would fail to decode the WHOLE Today response on every installed build, and there is no
app-update mechanism (083's compatibility rule). An unknown field is ignored by every build
(`ignoreUnknownKeys`). An old build sees the round as it sees an empty round today, and staff can
record the return for it (Story 4).

**Alternatives**: a `hub_return` `round_stop` — rejected for the decode break above, and because a
stop with no shop and no order is what `hub_checkin` already is for collection, with its own CHECK.

### R5 — One driver route, one staff route

**Decision**:
- `POST /driver/v1/delivery/runs/{runId}/return` (`driver`, shared gateway) — returns every
  to-return parcel on the round; `changeId` idempotent; refused before the round opens (072 rule
  unchanged); answers `{ returned, roundComplete }`. Queued offline by the app like other writes.
- `POST /fleet/v1/dispatch/rounds/{roundId}/return` (`fleet`, staff gateway) — the same write on a
  driver's behalf (Story 4), mutate (admin / manager); audited `dispatch.parcels_returned`.

Both call ONE writer, `recordParcelReturn` in `@effy/edge-shared/delivery` (two services, one rule —
Principle III's one-implementation rule; `consignment.ts` is the precedent).

Gateways: shared +1, staff +1. `gateway-capacity.contract.test.ts` is run in the tasks.

### R6 — A returned parcel is held for staff; their delivery tools release it

**Decision** (spec FR-010, operator default):
- The delivery gather excludes a package with an **unresolved failure** (the hold).
- `changeEffyWindow`, `moveToEffy` and `moveToCourier` resolve the order's open failures in their own
  transaction (the parcel has a next step); cancellation needs nothing — a withdrawn package is never
  gathered. The exception list's existing "Resolve" stays for "nothing to do".
- Those tools' refusal for a failed, unreturned parcel gets its own words: "A parcel of this order is
  still with the driver after a failed delivery. Record its return first."

**Rationale**: the hold must not depend on a person remembering a second click; resolving where the
decision is taken makes the decision and the release one act.

### R7 — Status words: unchanged vocabulary, new detail

**Decision**: `PackageFacts` gains `returned` (latest delivery row is `returned`).
- failed, not returned → **Problem**, "Delivery attempt failed — {reason}", driver named (as today);
- returned, failure unresolved → **At hub**, detail "Returned after a failed delivery — needs a next
  step";
- returned, resolved → **At hub** (then the new round's own words).

The shop sees the same words without the driver (`forShop`), as today. The customer's stage is
unchanged (FR-014).

### R8 — Live updates

A return changes a parcel's status for back-office (dispatch, orders), the shops whose parcels came
back, and — for a staff return — the driver's own work. Both routes announce after commit:
`DISPATCH`, `ops/orders`, each shop, and (staff route) `driver/work`. `change-map.guard.test.ts`
gets the two routes.

### R9 — Signing out / going off duty with parcels to return

The go-off-duty route already refuses with `HoldingPackagesError` until acknowledged (064 FR-018); R2
makes it fire for delivery parcels. The app's sign-out confirmation names the count from `toReturn`
(FR-007).

### R10 — A round with parcels to return cannot be moved; the planner never releases them

**Decision**: dispatch `reassign` / `unassign` refuse a delivery round that has parcels to return
("Record the return first") — so "who has it" is always the round's driver, and the spec's edge case
(a round moved after a failure) cannot strand a parcel on the wrong driver. The planner's
`releaseUnworkable` already skips in-progress delivery rounds (`release.ts`), and R3 keeps such a round
`in_progress` until the return, so a driver going off duty never has a failed parcel released from
under them.

**Alternatives**: attribute to-return parcels to the failure's `driver_id` across a reassignment —
rejected: two definitions of "the driver who has it", and a return route that has to accept a round
that is no longer the caller's.

# Research: Simple Order Status & Driver Assignment in Orders (073)

Read from the code and live dev data on 2026-10-07, after 072 was deployed. Revised the same day on
operator direction: **simpler is better.**

## F1 — the status defect (checked against live dev data)

The records are right: EFY-TPDRKR / 2760EN / 63Y4CN are `collected`, their `round_package` is
`picked_up`, their collection round `completed`, and a `hub_checkin` exists. What is wrong is every
screen's reading of them:

| Surface | Reads | Shows when just collected | After hub check-in |
|---|---|---|---|
| back-office `packagePositionFor` | shop status + method | "At hub" (standard) / "Out for delivery" (same-day) | unchanged |
| shop-web (3 label maps) | shop status | "Collected" | unchanged, forever |
| hub check-in announce | — | — | tells ops only; shop console never told |

`shop_fulfillment.status` deliberately stops at `collected` (063 R9); nothing ever derived the later
steps from the dispatch rows.

## Decisions

### R1 — One status, derived, nine words

**Decision**: `packageStatus(facts)` in `@effy/edge-shared/status` (pure) plus one SQL fragment that
reads the facts for many packages in one round trip. Words in `@effy/shared-types` (`STATUS_WORD`).
No new stored status.

Facts → status (the furthest fact wins):

| Status | When |
|---|---|
| Cancelled | shop status `withdrawn` |
| Problem | `unfulfillable`; or collection `not_available` and still ready; or a failed attempt after the last proof |
| Delivered | `delivered`, or a `package_arrival` |
| With carrier | a `carrier_handoff` |
| Out for delivery | its delivery stop is `out_for_delivery` / `en_route` / `arrived` |
| At hub | its collection round has a `hub_checkin` |
| With driver | collection `round_package` is `picked_up` |
| Ready | `ready_for_pickup` |
| Preparing | `pending` / `received` / `picking` |

"Problem" carries one line (`Not collected at the shop` · `Delivery attempt failed — <reason>` ·
`Shop can't supply`). "With driver" / "Out for delivery" carry the driver's name for staff only.

**Rejected**: new `shop_fulfillment` statuses — dispatch facts in the shop's table, two writers per
fact; a 14-position journey — too many words for what people need to know.

### R2 — Who reads it

`orders` (back-office list + detail), `shop` (console list + detail, no driver names), `driver`
(history rows). One definition, three readers. Back-office's `packagePositionFor` and shop-web's three
label maps are deleted.

### R3 — Live

Hub check-in announces to each shop whose packages arrived, plus ops `orders` and `dispatch`. Drop
started / failed / delivered also announce ops `orders` (delivered already announces shops). Customer
announcements unchanged.

### R4 — "How assigned" is one stored line, on the assignment itself

**Decision**: two nullable columns on `round_package`: `assigned_by_sub` (null = the planner) and
`assigned_note` (one line, written once). The planner writes e.g. "Auto-assigned — fewest packages
today (2)" or "Auto-assigned — already collecting at this shop"; a person's action writes
"Assigned by Ann" (name resolved on read) plus the concern they accepted, if any.

**Rejected**: an event table with candidate snapshots and a history timeline — the operator asked for
simple; one line answers "how did this get here?".

### R5 — Two manual actions: Assign to… and Unassign

- **Assign to…** works on an unassigned package and on an assigned, not-yet-collected one (that is
  how a package is "moved"). It removes the open assignment if any and places the package with the
  planner's own placement code, extracted from `commitWave` as `placePackage` — one way of putting a
  package on a round.
- **Unassign** removes an uncollected assignment; the next pass may reassign it.
- Collected goods (`picked_up`, or a delivery round under way) never move.
- Every manual action takes the planner's advisory lock (a person waits a moment rather than racing a
  pass), locks the fulfillment row, and compares `expectedAssignmentId` (current `round_package.id` or
  null). Mismatch → 409 with the latest.

### R6 — Fine / concern / cannot

The driver list calls the shared `eligibilityReasons` against the round the package would join, and
sorts each reason into:

| Bucket | Reasons | Effect |
|---|---|---|
| cannot | `not_employable`, `not_on_duty`, `licence_expired`, `no_vehicle`, `no_refrigeration`, `over_capacity` | not pickable; refused by the platform |
| concern | `not_cleared`, `cannot_meet_deadline` | pickable after confirm (`acceptConcerns: true`) |

One mapping, in `@effy/edge-shared` (`reasonSeverity`), used by the list and the route.

### R7 — Remove what is no longer needed

- **Round lock**: since 072 the planner never moves assigned work, so the lock only blocked additions
  to a round — a concept people had to learn for little gain. Lock/unlock routes, `LockControl` and
  the planner's lock checks are removed; the column stays, unused, until a later clean-up migration
  (dropping it now would break the running fleet build between migration and deploy).
- **Planning-passes list** on screen: removed. The log line and metrics stay.
- The word "wave" leaves the UI; it is "auto-assign".

### R8 — UI

- `/orders` gets tabs: **Orders · Assignments · Handover**. `/dispatch*` redirects. Dispatch leaves
  the nav.
- **Order list**: Status column (pill + word) and Driver column; filter "Needs a driver".
- **Order detail**: each package row shows status, and under it "Collect: Ada · opens 1:15 pm" /
  "Deliver: Ben · 5–7 pm" with the one-line how-assigned, and an **Assign to…** / **Unassign** menu.
- **Assign to…**: a side sheet with a search box; drivers grouped Fine / Concern / Can't take it,
  each with today's package count and a few words. Picking a "Concern" asks once.
- **Assignments tab**: "Needs a driver" list (each with Assign to…), then a table: driver, collecting,
  delivering, round opens, due. A driver row links to their round.
- Every action ends with a toast (design-system `sonner`) in one line; every refusal is one line.
- No cards, no metric tiles; pills always carry words.

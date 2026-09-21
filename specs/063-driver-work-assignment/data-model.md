# Data Model — Driver Work Assignment & Wave Planning (063)

One forward-only migration. Raw SQL, Goose, no ORM (Principle VI).

⚠ **This is informed by the torn-down model, not a restoration of it** (D16). Where a shape is
deliberately different from what 049 had, it says so.

---

## Existing tables this feature READS and does not own

| Table | Read for | ⚠ |
|---|---|---|
| `public.shop_fulfillment` | the package: `status`, `delivery_method`, shop, order | **`delivery_method` is read, never written** (FR-023). NULL ⇒ `standard` (R9). |
| `public.driver` | employment status, licence expiry | 061 |
| `public.driver_duty_session` | on duty, `expected_end_at` | open session = `ended_at IS NULL` |
| `public.driver_zone_capability` | clearance: function × method × zone | 062. ⚠ `zone_id IS NULL` = **every zone** |
| `public.vehicle_holding` → `public.vehicle` | held vehicle, `payload_kg`, refrigeration | 061. One open holding per driver |
| `public.shop` | address for the collection stop | 061 added the address; **no coordinates** (D21) |
| `public.delivery_zone` | destination zone, `status` | 047 |
| `public.delivery_collection_run`, `public.delivery_settings` | run times, `sameday_prep_buffer_min` | 047. The wave trigger (R1) |
| `public.customer_address` | the delivery stop's destination | ⚠ column is `city`, **not** `suburb` — 056 lost a container test to this |
| `public.order_item` → `public.product` | `weight_grams` for the capacity gate | 047 |

---

## New tables

### `public.dispatch_wave`
One planning pass. Exists so a wave's decisions are explainable after the fact (FR-006).

| Column | Notes |
|---|---|
| `id` | uuid pk |
| `run_id` | → `delivery_collection_run`, nullable (a manual pass has no run) |
| `kind` | `collection` \| `delivery` |
| `planned_for` | timestamptz — the deadline this wave serves |
| `started_at`, `finished_at` | timestamptz |
| `trigger` | `schedule` \| `manual` — who caused it |
| `triggered_by_sub` | nullable; set for `manual` |
| `packages_considered`, `packages_assigned`, `packages_unassigned` | int counters |

### `public.driver_round`
A body of work given to one driver in one go.

| Column | Notes |
|---|---|
| `id` | uuid pk |
| `wave_id` | → `dispatch_wave` — which pass created it |
| `driver_id` | → `driver` |
| `kind` | `collection` \| `delivery` |
| `status` | `planned` → `in_progress` → `completed`, plus `cancelled` |
| `deadline_at` | timestamptz — collection deadline, or end of the delivery window |
| `locked_by_sub`, `locked_at` | ⚠ **non-null = a person decided this** (FR-032). A planning pass MUST leave it alone |
| `created_at`, `updated_at` | `updated_at` is the concurrency token |

⚠ **`updated_at` comparisons must carry microseconds.** `toISOString()` truncates to milliseconds and
PostgreSQL stores microseconds, so a naive optimistic-lock check never matches its own row and **every
save fails claiming somebody else changed it**. 056 lost this to a container test; it is written here so
063 does not re-find it.

### `public.round_stop`
One place the driver goes. Collection stops name a shop; delivery stops name a destination address.

| Column | Notes |
|---|---|
| `id` | uuid pk |
| `round_id` | → `driver_round` ON DELETE CASCADE |
| `seq` | int — position in the round |
| `kind` | `shop_pickup` \| `customer_drop` \| `hub_checkin` |
| `shop_id` | nullable → `shop` (collection stops) |
| `customer_address_id` | nullable → `customer_address` (delivery stops) |
| `zone_id` | nullable → `delivery_zone` — what the sort groups on |
| `status` | `pending` → `arrived` → `done`, plus `skipped` |
| `completed_at` | timestamptz nullable |

⚠ `seq` is **maintained**, not authoritative for display order. The sort key (R5) derives order from
status → time → zone → shop; `seq` records a **dispatcher's manual reorder** (FR-031) so it can beat the
derived order. Two orderings, one of which only sometimes applies, is a known trap — so the rule is
stated once in `@effy/edge-shared` and both surfaces call it.

### `public.round_package`
Which packages are collected or delivered at which stop. The join that makes a stop actionable.

| Column | Notes |
|---|---|
| `id` | uuid pk |
| `stop_id` | → `round_stop` ON DELETE CASCADE |
| `shop_fulfillment_id` | → `shop_fulfillment` |
| `state` | `assigned` → `picked_up` \| `not_available` (collection); → `delivered` \| `failed` (delivery) |

**⚠ `CREATE UNIQUE INDEX round_package_open_uq ON round_package (shop_fulfillment_id) WHERE state = 'assigned'`**

That partial index **is** FR-005 and half of SC-004. One package can be in one open assignment, full
stop — enforced by the database, not by a service that checked first (R6). 061 used the same shape for
vehicle holdings; 054 proved the principle under two concurrent payments.

⚠ It is deliberately **partial**: once a package is `picked_up` or `not_available` it must be
re-assignable in a later wave, and a total unique index would forbid that forever — the same asymmetry
052 needed for receipt resends.

### `public.hub_checkin`
The record that collected packages arrived (FR-022).

| Column | Notes |
|---|---|
| `id` | uuid pk |
| `round_id` | → `driver_round` |
| `driver_id` | → `driver` |
| `checked_in_at` | timestamptz |
| `packages_expected`, `packages_arrived` | int — the discrepancy is the point (FR-026) |

⚠ `UNIQUE (round_id)` — a round is checked in once. A retry must be recognised as a retry.

### `public.assignment_exclusion`
Why a driver was not eligible (FR-015). **The thing that makes an unassigned package explainable.**

| Column | Notes |
|---|---|
| `wave_id` | → `dispatch_wave` |
| `shop_fulfillment_id` | → `shop_fulfillment` |
| `driver_id` | nullable — NULL means "no candidate at all" |
| `reason` | `not_on_duty` \| `not_employable` \| `licence_expired` \| `no_vehicle` \| `not_cleared` \| `no_refrigeration` \| `over_capacity` \| `cannot_meet_deadline` |

⚠ **Written per wave, never accumulated.** A reason from last Tuesday's wave is not a fact about today.
Rows for a wave are replaced when that wave re-runs.

⚠ **This is the table 056 says must exist.** Its finding was that the driver app had been recording
exceptions *for a reader that did not exist* — `delivery_failure` and `collection_task_issue` were
written and never read. This table has its reader built in the same slice (FR-028); if the dispatcher
view is cut, **this table must be cut with it.**

---

## Derived, never stored

Following 027's counted-not-stored rule, applied three times since (055, 056, 062):

- **A driver's current load** (FR-014) — counted from `round_package`, never a column on `driver`. A
  counter and its rows can disagree, and then nobody knows which is true.
- **Whether a round is late** — compared against `deadline_at` on read.
- **Eligibility** — evaluated per wave. A driver is not "an eligible driver"; they are eligible *for
  this work, now*.
- **The collection deadline** — `run_time − prep_buffer`, computed (R2), never a stored copy that can
  drift from the schedule an operator edits.

---

## What is NOT here, and why

| Not built | Reason |
|---|---|
| Any coordinate, distance or travel-time column | D20/D22. Nothing would read them. |
| `driver_run` / `collection_task` / `delivery_task` (049's shapes) | Torn down deliberately. This model is stop-and-package, not task-per-type. |
| Proof, signature, photo, scan | Slice D (D16 — three custody events, three mechanisms). |
| An offer / accept / decline state | D13 — push-assign. There is no state for a driver's consent because there is no consent step. |
| A `status` on `shop_fulfillment` for "assigned" | The shop's lifecycle is the shop's (020/R9). Assignment is our table's business. |

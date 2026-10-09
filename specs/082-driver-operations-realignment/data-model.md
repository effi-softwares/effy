# Data Model: Driver Operations Realignment (082)

**No migration.** Everything is derived from what 063–081 already store.

## Read differently

| Fact | Was | Now |
|---|---|---|
| Effy delivers this parcel | `shop_fulfillment.delivery_method = 'same_day'` | `public.package_delivered_by(order.delivery_type, method, slot_id) = 'effy'` (079's one definition) |
| A parcel may join a delivery round | at the hub | at the hub AND its window's day has come (`window_start < end of local today`, or no window) |
| A parcel may join the next collection run | ready | ready AND `collectionRunFor(window) ≤ next run` (no window → always) |
| A driver is cleared | a row with (function, method, area) | a row with (function, area), any method; an ungrouped postcode → any row for the function |
| Needs a driver (delivery) | same-day, at hub, unassigned | Effy's, at hub, unassigned, its round has opened |

## `public.driver_zone_capability` — unchanged rows, one column unread

`method` is no longer read by anything. New grants are written with `'standard'` (one row per function
and area); removing a grant deletes every row for that function and area. The column, its CHECK and the
unique index's method term are dropped at E9.

## Derived, never stored

- **Intended collection run** — `collectionRunFor(windowStart, runs, turnaroundMin, calendar)`.
- **`collectLate`** — ready at the supplier, uncollected, intended run already gone.
- **`coldOvernight`** — holds chilled/frozen items, checked in at the hub on a local date before its
  window's date.
- **A window's round** — `driver_round` with `(kind='delivery', deadline_at, window_start_at)`, created on
  its day by the pass, as today.

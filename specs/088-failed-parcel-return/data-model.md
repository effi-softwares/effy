# Data Model: Return Failed Parcels to the Hub (088)

One migration, `db/migrations/2026101614xxxx_parcel_return.sql`. Additive except the CHECK widening.

## `round_package.state` - one new value

`CHECK (state IN ('assigned', 'picked_up', 'not_available', 'delivered', 'failed', 'returned'))`

| From | To | Written by | When |
|---|---|---|---|
| `assigned` (delivery, stop `skipped`) | `returned` | `recordParcelReturn` | driver or staff records the return |

`settled_at = now()` on the transition. The partial unique index (`state = 'assigned'`) no longer
covers the row, so the package can be gathered again once its failure is resolved (research R6).

## `parcel_return` - NEW (one row per return action)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `round_id` | uuid NOT NULL → `driver_round` | the delivery round the parcels failed on |
| `driver_id` | uuid NOT NULL → `driver` | who had them (the round's driver at failure time) |
| `recorded_by` | text NOT NULL CHECK IN (`driver`, `staff`) | |
| `recorded_by_sub` | text NOT NULL | the driver's or staff member's auth subject |
| `package_count` | int NOT NULL CHECK > 0 | |
| `returned_at` | timestamptz NOT NULL DEFAULT now() | |
| `change_id` | uuid NOT NULL UNIQUE | idempotency (FR-005) |

`round_package.return_id uuid NULL → parcel_return` - which return released this parcel (FR-013:
"which parcels"). Set together with `state = 'returned'`.

## Derived (never stored)

- **To return** (custody, delivery half): `round_package` on a `delivery` round, `state = 'assigned'`,
  stop `status = 'skipped'`, no `package_arrival`.
- **In transit** (custody, delivery half): as above with stop `out_for_delivery | en_route | arrived`.
- **Held for staff**: latest delivery row `returned` AND an unresolved `delivery_attempt_failure` on
  its stop.
- **Round finished** (delivery): no stop open AND nothing to return.

## Unchanged

`delivery_attempt_failure` (reason, note, failed_at, resolved_at) - written as today; `resolved_at` is
now also set by the staff delivery tools (research R6). `shop_fulfillment.status` stays `collected`.

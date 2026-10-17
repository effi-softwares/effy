# Data Model: 093

One migration: `db/migrations/20261017100000_driver_work_sequence.sql`.

## public.package_hold (new)

| Column | Type | Notes |
|---|---|---|
| id | uuid PK default gen_random_uuid() | |
| shop_fulfillment_id | uuid NOT NULL → shop_fulfillment | the package |
| step | text NOT NULL CHECK IN ('load','checkin') | where it was declared |
| reason | text NOT NULL CHECK IN ('not_at_hub','damaged','wrong_temperature','not_in_van','other') | `not_in_van` is check-in only |
| note | text NULL | required when reason = 'other' (CHECK) |
| driver_id | uuid NOT NULL → driver | who declared it |
| round_id | uuid NOT NULL → driver_round | the run |
| change_id | text NOT NULL | the request's changeId; UNIQUE (change_id, shop_fulfillment_id) makes a retry a retry |
| created_at | timestamptz NOT NULL default now() | |
| resolution | text NULL CHECK IN ('found','lost') | NULL = open |
| resolved_by_sub | text NULL | staff Cognito sub |
| resolved_at | timestamptz NULL | CHECK (resolution IS NULL) = (resolved_at IS NULL) |

The partial unique index `(shop_fulfillment_id) WHERE resolution IS NULL` allows one open hold per
package.

"Held out of planning" means `EXISTS hold WHERE resolution IS NULL OR resolution = 'lost'`. It is one SQL
fragment, `HELD_SQL(sfAlias)`, in `@effy/edge-shared`, and both gathers use it.

## public.round_sequence_waiver (new)

| Column | Type | Notes |
|---|---|---|
| round_id | uuid PK → driver_round | one waiver per round |
| reason | text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 500) | |
| staff_sub | text NOT NULL | |
| created_at | timestamptz NOT NULL default now() | |

## public.vehicle_check (new)

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| driver_id | uuid NOT NULL → driver | |
| vehicle_id | uuid NOT NULL → vehicle | the vehicle of the driver's open holding |
| local_date | date NOT NULL | Melbourne day |
| answers | jsonb NOT NULL | `{tyres, lights, brakes, mirrors, cold_storage, body}` each `{answer: ok\|minor\|unsafe, note?}` |
| unsafe | boolean NOT NULL | any answer unsafe |
| minor | boolean NOT NULL | any answer minor |
| change_id | text NOT NULL UNIQUE | |
| created_at | timestamptz NOT NULL default now() | |
| cleared_by_sub / cleared_at / clear_note | NULL | a dispatcher clearing an unsafe check |

It is UNIQUE (driver_id, vehicle_id, local_date). A second submit on the same day answers with the first.

## public.delivery_settings (altered)

- `load_overdue_min int NOT NULL DEFAULT 20 CHECK (BETWEEN 5 AND 240)`
- `checkin_overdue_min int NOT NULL DEFAULT 30 CHECK (BETWEEN 5 AND 240)`

## Existing state, re-read (no change)

- **Drop**: `round_stop.status`: `pending` (staged, not loaded) → `out_for_delivery` (loaded; written only
  by load) → `en_route` → `arrived` → `done` | `skipped`.
- **Package on a collection stop**: `assigned` → `picked_up` | `not_available`. An unnamed package stays
  `assigned` (R4).
- **Package on a delivery stop**: `assigned` → `delivered` | `failed` → `returned`. A row declared at load
  is deleted, with a hold row recording it (R6).

## Derived: run stage

See research R7. The facts per round are: kind, status, shop stops total / settled, check-in exists, drops
total / pending / open / done, parcels to return.

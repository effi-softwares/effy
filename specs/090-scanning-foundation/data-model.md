# Data Model: Package Scanning — Foundations (090)

Migration `db/migrations/20261016160000_package_handover.sql`.

## `public.package_handover` — NEW, append-only

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `shop_fulfillment_id` | uuid NOT NULL → `shop_fulfillment` | the package |
| `round_id` | uuid NOT NULL → `driver_round` | the round the hand-over happened on |
| `driver_id` | uuid NOT NULL → `driver` | |
| `step` | text CHECK IN (`collect`,`checkin`,`load`,`deliver`,`return`) | |
| `handover_method` | text CHECK IN (`scan`,`typed`,`manual`) | not `method`: a dropped column's name (083), tracked by the schema-drift guard |
| `change_id` | uuid NOT NULL | the hand-over's own changeId |
| `recorded_at` | timestamptz DEFAULT now() | |

UNIQUE (`change_id`, `shop_fulfillment_id`). Index on `shop_fulfillment_id`. No UPDATE or DELETE by any
service (the shopper role gets no grant).

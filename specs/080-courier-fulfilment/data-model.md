# Data Model: Courier Fulfilment (080)

One forward-only, additive migration: `db/migrations/<ts>_courier_fulfilment.sql`. Nothing dropped.

## New: `public.courier_service`

| Column | Type | Rule |
|---|---|---|
| `id` | uuid PK | |
| `courier_name` | text NOT NULL | 2–60 chars — entered by the operator, never seeded |
| `service_name` | text NOT NULL | 2–60 chars; UNIQUE (courier_name, service_name) |
| `estimate_text` | text NOT NULL | 3–60 chars, one line; completes "Usually arrives in …" |
| `max_business_days` | int NOT NULL | 1–30; for "overdue with courier" (never shown) |
| `pickup_weekdays` | int[] NOT NULL | ISO 1–7, non-empty |
| `pickup_cutoff` | time NOT NULL | Melbourne wall clock |
| `collects_from_supplier` | boolean NOT NULL DEFAULT false | |
| `status` | text NOT NULL | `active` \| `retired` |
| `is_default` | boolean NOT NULL DEFAULT false | partial UNIQUE where `is_default`; CHECK default ⇒ active |
| `updated_by`, `created_at`, `updated_at` | | |

## Changed: `public.delivery_settings`

| Column | Type | Default | Meaning |
|---|---|---|---|
| `courier_collection_default` | text NOT NULL | `'hub'` | `hub` \| `supplier` for new courier orders |

`courier_estimate_text` (079): no longer read; dropped at E9.

## Changed: `public."order"`

| Column | Type | Rule |
|---|---|---|
| `courier_service_id` | uuid NULL → `courier_service` | the default service at checkout; set iff `delivery_type = 'courier'` (new orders) |
| `courier_collection` | text NULL | `hub` \| `supplier`; set iff `delivery_type = 'courier'` |

## New: `public.order_courier_collection_change` (append-only)
`order_id`, `from_mode`, `to_mode`, `actor_sub` NOT NULL, `note`, `created_at`. REVOKE UPDATE, DELETE
from `effy_shopper`.

## New: `public.courier_consignment`

| Column | Type | Rule |
|---|---|---|
| `id` | uuid PK | |
| `shop_fulfillment_id` | uuid NOT NULL | partial UNIQUE where `state <> 'cancelled'` — one live per package |
| `courier_service_id` | uuid NOT NULL | |
| `collection` | text NOT NULL | `hub` \| `supplier` (as it was when booked/handed over) |
| `reference` | text NULL | |
| `tracking_url` | text NULL | `https://` only |
| `label_key` | text NULL | under `courier-label/` in the media bucket |
| `pickup_date` | date NULL | supplier pickups |
| `pickup_from`, `pickup_to` | time NULL | both or neither |
| `state` | text NOT NULL | `booked`, `handed_over`, `in_transit`, `delivered`, `failed`, `lost`, `damaged`, `returned`, `cancelled` — the latest event's, kept for reads |
| `created_by`, `created_at`, `updated_at` | | |

## New: `public.courier_consignment_event` (append-only)
`consignment_id`, `kind` (`booked`, `handed_over`, `in_transit`, `delivered`, `failed`, `lost`,
`damaged`, `returned`, `resolved`, `cancelled`), `actor_kind` (`staff` \| `shop`), `actor_sub`, `note`
(≤ 500), `created_at`. REVOKE UPDATE, DELETE from `effy_shopper`. ⚠ One writer (shared
`consignment.ts`); guard.

## New function: `public.courier_parcel_collection(p_delivery_type text, p_mode text) RETURNS text`
`'supplier'` iff a courier order in supplier mode, else `'hub'`. The planner's exclusion and the hub
list both call it (R4).

## Changed derivation: `PACKAGE_STATUS_FACTS`
Adds `courier_problem` — the latest `failed|lost|damaged|returned` event of the live consignment with no
later `resolved` or `delivered`. `packageStatus`: after "delivered", a courier problem → Problem
("With the courier — lost").

## State: a consignment

```
booked ──handed_over──► in_transit ──► delivered
   │          │              │
   └─cancelled│              ├─► failed | lost | damaged | returned ──resolved──► (back to the step before)
              └──────────────┘
```
`handed_over` writes `carrier_handoff`; `delivered` writes `package_arrival` (`staff_recorded`). A
consignment cannot be cancelled after `handed_over`.

## Validation
- Book: active service; supplier mode needs `collects_from_supplier`; pickup date not in the past.
- Mode change: refused once any package has a handoff or a `picked_up` collection row.
- Retire: refused for the default service.

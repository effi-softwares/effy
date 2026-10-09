# Data Model: Back-Office Courier Override & Compensation (081)

One forward-only, additive migration: `db/migrations/<ts>_courier_override.sql`. Nothing dropped.

## New: `public.delivery_override` (append-only)

One row per staff move, 1:1 with the `order_delivery_type_change` row it accompanies.

| Column | Type | Rule |
|---|---|---|
| `id` | uuid PK | |
| `change_id` | uuid NOT NULL UNIQUE → `order_delivery_type_change` | the move itself: from, to, actor, reason (`note`), when |
| `order_id` | uuid NOT NULL → `order` | denormalised for the order page |
| `to_type` | text NOT NULL | `effy` \| `courier` (copied for one-table reads and the CHECKs below) |
| `slot_id`, `delivery_date`, `window_start`, `window_end` | NULL | the window **released** (to courier) or **taken** (to Effy) |
| `courier_service_id` | uuid NULL → `courier_service` | to courier: the service given |
| `collection` | text NULL | `hub` \| `supplier`; to courier |
| `paid_delivery_cents` | int NOT NULL | `order.delivery_fee_amount` at the move |
| `courier_fee_cents` | int NULL | to courier: the active courier plan's fee for this basket |
| `difference_cents` | int NULL | `max(0, paid − courier)` |
| `compensation` | text NOT NULL | `points_difference` \| `free_delivery_points` \| `free_delivery_refund` \| `refund_difference` \| `none` — `none` only when `to_type='effy'` or chosen |
| `amount_cents` | int NOT NULL ≥ 0 | what was given |
| `points` | int NULL | for the two points kinds |
| `points_entry_id` | uuid NULL → `points_entry` | |
| `refund_id` | uuid NULL → `refund` | |
| `compensation_note` | text NULL ≤ 500 | required when `compensation='none'` and `to_type='courier'` |
| `actor_sub` | text NOT NULL | |
| `created_at` | timestamptz | |

CHECKs: `to_type='effy'` ⇒ `compensation='none' AND amount_cents=0`; points kinds ⇒ `refund_id IS NULL`;
refund kinds ⇒ `points_entry_id IS NULL`. `REVOKE UPDATE, DELETE … FROM effy_shopper` (and no UPDATE path
in code — a guard test).

## Changed: `public.refund`

- `kind` CHECK += `delivery`; `reason` CHECK += `courier_override`. Not added to `OPERATOR_REASONS`.

## Changed: `public.delivery_settings`

| Column | Type | Default | Meaning |
|---|---|---|---|
| — | — | — | none. The alarm threshold is a Terraform variable, not a business setting. |

## Unchanged, written through their one writers

| Table | Writer | 081 writes |
|---|---|---|
| `order_delivery_type_change`, `order.delivery_type/_reason/courier_estimate` | `recordDeliveryType` | reason `staff_change`, note = the staff reason |
| `order.courier_service_id`, `order.courier_collection`, `courier_consignment` (cancel) | `consignment.ts` `setCourierRouting` (new) | set on to-courier; cleared + bookings cancelled on to-Effy |
| `points_entry` | `points.credit` (+ `quiet`) | `auto_credit` / `courier_override_compensation` |
| `refund` | `refunds` `recordIn` (new) + `submitRecorded` (new) | kind `delivery` |
| `round_package`, `round_stop`, `driver_round` | `driver-work.ts` `removeAssignment` (moved from fleet) | delivery work; collection work when supplier pickup |
| `delivery_slot_booking` | release / upsert (R6) | |
| `order_package_delivery`, `shop_fulfillment.delivery_method` | override.ts (the package rewrite, R5) | |
| `notification_request` | override.ts | `order_delivery_changed` push + email |

## State

```
effy ──moveToCourier(compensation)──► courier ──moveToEffy(window)──► effy …
         guards: paid, typed, nothing          guards: nothing handed over,
         delivered/handed over/out for          postcode on Effy's list,
         delivery, courier priced + service     window open with room
```

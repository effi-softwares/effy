# Data Model: Delivery Time Slots & Standard Delivery Date

One forward-only Goose migration, `<ts>_delivery_slots_dates.sql`. Everything is additive: three
new tables, four columns on `delivery_settings`, three on `order_package_delivery`. No existing row
is rewritten (FR-049).

## New: `public.delivery_slot`

A daily same-day delivery window the back-office defines (FR-036).

| Column | Type | Rule |
|---|---|---|
| `id` | uuid PK | |
| `start_time` | `time` | Melbourne wall-clock, like `delivery_collection_run.run_time` |
| `end_time` | `time` | `CHECK (end_time > start_time)` |
| `cutoff_time` | `time` | `CHECK (cutoff_time <= start_time)` |
| `capacity` | int | `CHECK (capacity >= 1)` |
| `status` | text | `active` \| `disabled`, default `active` |
| `updated_by` | text | staff subject |
| `created_at`, `updated_at` | timestamptz | |

- `UNIQUE (start_time, end_time)`: two identical windows are one slot.
- Never deleted, only disabled, so a booking's reference always resolves (R12).
- The three CHECKs are FR-037 in the database; the service repeats them to give a named refusal.

## New: `public.delivery_slot_booking`

One order's place in one slot on one day (FR-008).

| Column | Type | Rule |
|---|---|---|
| `id` | uuid PK | |
| `slot_id` | uuid FK → `delivery_slot` | `ON DELETE RESTRICT` |
| `delivery_date` | date | the Melbourne date of the window |
| `order_id` | uuid FK → `"order"` | `ON DELETE CASCADE`, **`UNIQUE`** |
| `state` | text | `held` \| `confirmed` \| `released` |
| `held_until` | timestamptz | set while `held` |
| `window_start`, `window_end` | timestamptz | the slot as sold, as instants (R5, R12) |
| `over_capacity` | boolean | default false; true only for a late payer (R3) |
| `created_at`, `updated_at` | timestamptz | |

- `UNIQUE (order_id)` is "one order never holds two places": a re-run intent moves the row.
- Index `(slot_id, delivery_date)` for the count.
- **A booking counts** when `state = 'confirmed'` or (`state = 'held'` and `held_until > now()`).
  That predicate is written once, in a SQL constant in `platform/delivery`, and the fleet console's
  "booked today" read uses a view built from the same expression
  (`public.delivery_slot_load`: `slot_id, delivery_date, booked`), so the console and checkout
  cannot count differently.

### State transitions

```text
(none) ──intent, slot open──▶ held ──payment succeeded──▶ confirmed ──order cancelled──▶ released
                               │  ▲                          ▲
                               │  └─ intent again (refresh / move to another slot)
                               ├──hold lapses unpaid──▶ stops counting (row stays `held`)
                               └──intent again with standard only──▶ row deleted
held (lapsed) ──payment succeeded, slot has room──▶ confirmed
held (lapsed) ──payment succeeded, slot full or closed──▶ confirmed, over_capacity = true
```

## New: `public.delivery_non_delivery_date`

| Column | Type | Rule |
|---|---|---|
| `day` | date PK | |
| `label` | text NULL | e.g. "Melbourne Cup Day" |
| `created_by` | text | staff subject |
| `created_at` | timestamptz | |

## Changed: `public.delivery_settings` (singleton)

| Column | Type | Default | Meaning |
|---|---|---|---|
| `slot_hold_min` | int `> 0` | 10 | how long a place is held from the intent call (FR-009a) |
| `sameday_hub_turnaround_min` | int `>= 0` | 60 | collection run time → ready to leave the hub (R5). ⚠ A stated assumption, not a measurement |
| `standard_lookahead_days` | int `1..30` | 7 | how many deliverable days are offered (FR-041) |
| `standard_no_delivery_weekdays` | smallint[] | `{}` | ISO weekdays 1–7 with no delivery (FR-042). `CHECK` it is a subset of 1..7 and not all seven |
| `carrier_lead_days` | int `>= 0` | 1 | hub handover → delivered (R6) |

## Changed: `public.order_package_delivery`

| Column | Type | Meaning |
|---|---|---|
| `slot_id` | uuid NULL FK → `delivery_slot` | same-day packages only |
| `window_start`, `window_end` | timestamptz NULL | same-day packages only; the window as sold |

- `CHECK`: the three are all null or all set, and set only when `method = 'same_day'`.
- `promised_from` / `promised_to` are **now written** (R1): both the Melbourne delivery date for
  same-day, both the chosen day for standard. No type change.
- Rewritten on every intent, like the rest of this table (delete + reinsert).

## Changed behaviour, no schema change

- **`shop_fulfillment.promised_ready_at`** is no longer set from `promised_to` at finalize (R2).
  It stays null and the shop's ready-by keeps its uniform derivation.
- **`driver_round.deadline_at`** for a delivery round becomes the window's end; end of local day
  remains for packages with no window (R10).
- **`refunds.CancelOrder`** releases the order's booking in its own transaction (R13).

## Derived, never stored

| Fact | Derivation | Where |
|---|---|---|
| Slot is open | R5's `OpenSlots` | `core-api/platform/delivery` |
| Available standard days | R6's `AvailableDays` | `core-api/platform/delivery` |
| Handover due day | `promised_to − carrier_lead_days` | `edge-api/orders` |
| At risk | past the due day with no `carrier_handoff`, or handed over after it | `edge-api/orders` |
| Due / late on a drop | `now` against `window_start` / `window_end` | driver app, dispatcher console (R11) |
| Delivered on time | `package_arrival.arrived_at ≤ window_end` | `edge-api/orders` |

## Wire shapes (see [contracts/delivery-slots-dates.md](contracts/delivery-slots-dates.md))

`DeliveryQuoteDTO`, `CreateCheckoutIntentRequest`/`Response`, `ArrivalEstimateDTO`,
`DeliveryDropDTO`, the back-office order package, and the new slot, delivery-day and handover
DTOs. No shop identity, slot id or capacity figure reaches a customer DTO beyond the opaque
`slotId` the customer sends back (FR-050).

## Down migration

Drops the three tables, the view and the added columns. Lossy for bookings and chosen windows;
dev single-step rollback only, as with every migration on this platform.

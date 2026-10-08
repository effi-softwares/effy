# Data Model: Effy Delivery Windows

**Feature**: 078 · One forward-only, additive migration: `db/migrations/<ts>_effy_delivery_windows.sql`.
Nothing is dropped; the running services keep working between migrate and deploy.

## Changed: `public.delivery_settings` (singleton, id = 1)

| Column | Type | Default | Rule | Meaning |
|---|---|---|---|---|
| `delivery_model_v2_from` | `timestamptz` | `NULL` | — | **The switch** (R1). NULL = the new model is off. From this instant every new checkout uses Effy windows. Read only through `public.delivery_model_v2_at(at)`. No route writes it in 078 (E9 adds the setter + readiness check). |
| `effy_lookahead_days` | `int NOT NULL` | `3` | `CHECK (effy_lookahead_days BETWEEN 1 AND 14)` | How many **delivery days after today** a customer may choose (FR-002). Non-delivery days do not count. |

Reused unchanged (renamed by E9): `standard_no_delivery_weekdays` (ISO 1–7, never all seven),
`slot_hold_min` (hold length), `sameday_hub_turnaround_min` and `sameday_prep_buffer_min` (today's
collection test). Legacy-only until the cutover: `standard_lookahead_days`, `carrier_lead_days`.

## New function: `public.delivery_model_v2_at(at timestamptz) RETURNS boolean`

`STABLE`. `SELECT delivery_model_v2_from IS NOT NULL AND at >= delivery_model_v2_from FROM
delivery_settings WHERE id = 1` — `false` when the row is missing. ⚠ The one definition of "is the new
model on"; a guard test fails any other reader of the column (P14). Granted to `effy_shopper` and the
service roles that already read `delivery_settings`.

## Changed: `public.order_package_delivery`

`order_package_delivery_window_ck` is replaced:

```
-- before (069): a window only on a same-day package
(slot_id IS NULL AND window_start IS NULL AND window_end IS NULL)
OR (slot_id IS NOT NULL AND window_start IS NOT NULL AND window_end IS NOT NULL AND method = 'same_day')
-- after (078): a window on either method, still all-or-nothing
(slot_id IS NULL AND window_start IS NULL AND window_end IS NULL)
OR (slot_id IS NOT NULL AND window_start IS NOT NULL AND window_end IS NOT NULL)
```

Column comment on `method` gains: *"From 078: `same_day` = a window today, `standard` = a later day.
A `standard` package WITH a window is delivered by Effy; WITHOUT one it is a carrier package (pre-v2).
E5's `order.delivery_type` makes this explicit."* (R6)

Down migration restores the old CHECK only if no `standard` row has a window (otherwise it raises —
never silently deletes a sold window).

## Unchanged, read differently

| Object | 078 reads it… |
|---|---|
| `delivery_slot` | the same windows on every delivery day (FR-004); `capacity NULL` = no limit |
| `delivery_slot_booking` | one row per order, `delivery_date` any offered day; held → confirmed / released; `over_capacity` for the late payer |
| `delivery_slot_load` (view) | per `(slot_id, delivery_date)` for **every** offered day (F1). Still the one definition of "a booking counts" |
| `delivery_non_delivery_date` | skipped by the Effy day calendar as well as the legacy picker |
| `delivery_fee_plan` + `delivery_slot_premium` | 077; priced per window per day via `priceEffyOrder` |

## Domain shapes (TypeScript, `shared/src/delivery/windows.ts`)

```text
EffyDay      { date: yyyy-mm-dd, isToday, windows: EffyWindow[], closedReason: null | "not_delivery_day" | "closed" | "full" }
EffyWindow   { slotId, date, start: Date, end: Date, cutoff: Date (effective: own cutoff or last collection, today only) }   — a full window is absent, never flagged
WindowVerdict  "open" | "cutoff" | "full" | "uncollectable"     (uncollectable only ever for today)
EffyWindowsQuote { days: EffyDay[], fees: Map<"slotId|date", PricedFee>, unavailable: null | "no_windows" | "none_defined" }
```

## Validation rules (from the spec)

- A window is offered on day D iff it is active, D is a delivery day in the offered range, now ≤ its
  cutoff on D, it has room on D (`capacity NULL` or `booked < capacity`), and — **only when D is
  today** — a makeable collection run reaches the hub ≥ turnaround before its start (FR-005/006).
- Today is always the first day returned; if it is a non-delivery day it carries `not_delivery_day`
  and no windows, and does not count toward the look-ahead (FR-003).
- An intent's `deliveryWindow` must name a window that is open on that date at intent time (FR-017);
  otherwise `slot_unavailable` (window gone/closed/full) or `date_unavailable` (day no longer offered).
- `effy_lookahead_days` 1–14 (field error otherwise).

## State: a window booking (unchanged from 069, now on any date)

```
(intent) ──held(held_until)──► (payment ok, hold live) ──► confirmed
                     │                 (payment ok, hold lapsed, room) ──► confirmed
                     │                 (payment ok, hold lapsed, no room) ──► confirmed + over_capacity  ⚠ staff told
                     ├──(hold lapses unpaid)──► stops counting (row stays `held`, never swept)
(confirmed) ──(order cancelled before delivery)──► released
```

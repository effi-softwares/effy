# Data Model: Flexible Standard Delivery (085)

One migration. Three added columns and one index; **no new table**, no backfill.

## Changes

### `public.delivery_slot` — a window may be the day's "Any time" window

| Column | Type | Notes |
|---|---|---|
| `any_time` | `boolean NOT NULL DEFAULT false` | True for THE window that sells a day with no time. Its start/end are the hours untimed deliveries go out; its cutoff and capacity mean what they mean on any window — capacity is the day's limit for untimed orders (FR-020). |

- `CREATE UNIQUE INDEX delivery_slot_any_time_uq ON public.delivery_slot ((true)) WHERE any_time` and
  `CHECK (NOT any_time OR status = 'active')` — **exactly one, always on**.
- ⚠ **THE MIGRATION CREATES IT**: start = earliest active window's start, end = latest end, cutoff = the
  earliest cutoff (09:00 / 21:00 / 09:00 where no window exists), no limit. No API sets the flag.
- Existing rows: `false`. Nothing else about a slot changes.

### `public."order"` — what the customer was sold

| Column | Type | Notes |
|---|---|---|
| `delivery_promise` | `text` CHECK in (`window`, `day`, `asap`) | NULL on every order placed before 085 and on courier orders. NULL on an Effy order reads as `window`. |
| `asap_estimate` | `text` | The estimate sentence the order was sold. Set exactly when `delivery_promise = 'asap'`. |

- CHECK: `(delivery_promise = 'asap') = (asap_estimate IS NOT NULL)`.
- CHECK: `delivery_promise IS NULL OR delivery_type = 'effy'` — a courier order has no promise of this kind.
- **Writers**: checkout (once, with `delivery_type`), and `override.ts` (`moveToEffy`, `moveToCourier`
  → NULL, `changeEffyWindow`). No other writer; `delivery-type.guard.test.ts` is extended to say so.
- ⚠ Never backfilled: an old order's promise is not invented (the 079 rule for `delivery_type`).

### `public.delivery_settings` — the ASAP estimate

| Column | Type | Notes |
|---|---|---|
| `asap_estimate` | `text NOT NULL DEFAULT 'usually within 2–3 days'` | What an "as soon as possible" customer is told. Reworded by staff, never empty. 1–80 characters. |

## Unchanged, deliberately

- `order_package_delivery` — an untimed parcel is `method = 'standard'` (or `same_day` when an ASAP
  order lands today), with `slot_id`, `window_start`, `window_end` and the promised day, exactly like a
  windowed parcel. `order_package_delivery_window_ck` is not touched.
- `delivery_slot_booking` — one place per order, in the Any-time window.
- `delivery_slot_premium` — never has a row for an Any-time window (enforced in the admin service).
- `driver_round`, `round_stop`, `public.round_opens_at`, `public.package_delivered_by`.
- `delivery_override` — `changeEffyWindow` appends a row of the existing shape.

## Reading rules

| Question | Answer |
|---|---|
| Was this order sold a time? | `COALESCE(delivery_promise, 'window') = 'window'` |
| What does the customer read? | `deliverySummary` (shared-types) from `delivery_promise`, the package's day/window and `asap_estimate`. |
| Is this parcel untimed for drivers/dispatch? | `delivery_slot.any_time` via `opd.slot_id` — a label only. |
| Who delivers? | Unchanged: `public.package_delivered_by`. |

## Down migration

Dev-only single step: refuses while any order has `delivery_promise IN ('day','asap')` (the 078 rule —
never strip what a customer was sold); otherwise deletes the Any time window and drops the columns,
the constraint and the index.

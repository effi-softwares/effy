# Data Model: Immediate Driver Work Assignment (072)

One additive migration: `db/migrations/<ts>_immediate_driver_assignment.sql`. No table is created
and none is dropped. It is safe to apply before any service is deployed (research R9, R13).

## Changes

### `public.driver_round` — one column

| Column | Type | Meaning |
|---|---|---|
| `window_start_at` | `timestamptz NULL` | **New.** The start of the delivery window this round serves. NULL for a collection round and for a delivery round with no window. |

- `deadline_at` keeps its meaning: the collection run's instant, or the delivery window's end (end of
  day for a windowless or already-missed window).
- A round's **bucket** is `(driver_id, kind, deadline_at, window_start_at)`. No unique constraint
  (research R4).
- New index `driver_round_bucket_idx (driver_id, kind, deadline_at) WHERE status = 'planned'`.
- `wave_id` stays `NOT NULL`: a round is still created by a recorded pass.
- No status is added. "Not yet open" is not a state; it is `now() < round_opens_at(...)`.

### `public.round_opens_at(kind, deadline_at, window_start_at)` — new SQL function

`STABLE`, returns `timestamptz`, reads `delivery_settings.planning_lead_min`:

| Round | Result |
|---|---|
| collection | `deadline_at − lead` |
| delivery with a window | `window_start_at − lead` |
| delivery without a window | `NULL` |

**NULL or a past instant means open.** This is the only definition of the opening time; no service
computes it another way.

### `public.assignment_exclusion` — from per-wave log to standing fact

| Column | Change |
|---|---|
| `kind` | **New**, `text NULL CHECK (kind IN ('collection','delivery'))`. Rows written by this feature always set it. |
| `wave_id` | Becomes **nullable**. No longer written. |
| `updated_at` | **New**, `timestamptz NOT NULL DEFAULT now()`. |

- New partial unique index on `(shop_fulfillment_id, kind, driver_id, reason) NULLS NOT DISTINCT
  WHERE kind IS NOT NULL`.
- Existing rows (all per-wave, `kind IS NULL`) are deleted by the migration; they describe passes
  that are over.
- Lifecycle: a package's rows for a kind exist exactly while it is unassigned for that kind. A pass
  rewrites them only when the computed set differs from the stored one, and removes them when the
  package is assigned or is no longer waiting.

### `public.dispatch_wave` — unchanged shape, fewer rows

A row is written only by a pass that assigned or released at least one package. `planned_for` holds
the instant the pass ran. Comment updated.

### `public.delivery_settings.planning_lead_min` — unchanged column, new meaning

Was: how long before a run planning begins. Now: how long before a run (or a window's start) the work
**opens**. Comment updated; default stays 45.

## Unchanged, and relied on

- `round_package_open_uq` — a package is in at most one open round.
- `round_stop`, `round_package`, `hub_checkin` — no change.
- `round_package.created_at` joined to its round's `driver_id` is the record of when a package was
  assigned and to whom (FR-030). `driver.work_released` audit rows record a release.

## Rules the data must satisfy

| Rule | Enforced by |
|---|---|
| A package is in one round | `round_package_open_uq` (existing) |
| One not-yet-begun round per driver per bucket, engine-made | find-then-create under the pass's advisory lock; container test |
| No progressing write before opening | `assertRoundOpen` in the same transaction as the write; guard test over every mutating driver route |
| A locked round is not touched by a pass | planner skips `locked_by_sub IS NOT NULL` for adds, releases and cancels; container test |
| Collected goods are never released | release step removes only `state = 'assigned'` rows, and nothing on a delivery round in progress |
| One row per package per reason | partial unique index above |

## Down migration

Drops the function, the two indexes, `driver_round.window_start_at`, `assignment_exclusion.kind` and
`updated_at`. It does **not** restore `wave_id NOT NULL` (rows without one may exist); it deletes
those rows first and then restores the constraint.

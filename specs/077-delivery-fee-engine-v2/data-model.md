# Data Model: Delivery Fee Engine v2

**Feature**: 077. **Two** forward-only migrations: `…_delivery_fee_engine_v2.sql` (additive; safe
under the running services) and `…_drop_delivery_rings.sql` (applied after the deploy). Reasons in
[research.md](research.md).

## `public.delivery_fee_plan` — evolved in place (R1, R9)

| Column | Change | Notes |
|---|---|---|
| `kind` | **new** `text NOT NULL DEFAULT 'effy' CHECK (kind IN ('effy','courier'))` | |
| `base_amount` | **new** `numeric(12,2) NOT NULL DEFAULT 0 CHECK (>= 0)` | Effy: the base. Courier: the flat per-order amount. |
| `free_over_amount` | **new** `numeric(12,2) NULL CHECK (> 0)` | NULL = no free delivery (the default, and the courier default — Q3) |
| `small_order_under_amount` | **new** `numeric(12,2) NULL CHECK (> 0)` | |
| `small_order_fee_amount` | **new** `numeric(12,2) NULL CHECK (> 0)` | |
| `today_premium_amount` | **new** `numeric(12,2) NOT NULL DEFAULT 0 CHECK (>= 0)` | added when the chosen window is today (R5) |
| `rounding_step`, `floor_amount`, `cap_amount` | unchanged | |
| `same_day_factor`, `standard_factor` | **DEFAULT 1; no longer read or written** | dropped at E9 |
| `name`, `is_active`, `created_by`, `activated_by`, `activated_at` | unchanged | |
| `updated_by`, `updated_at` | **new** | a draft can now be edited |

Constraints added:
- `small_order_pair_ck` — both small-order columns set, or neither.
- `small_below_free_ck` — `small_order_under_amount < free_over_amount` when both are set.
- `small_fee_step_ck` — `mod(small_order_fee_amount, rounding_step) = 0`.
- `today_premium_step_ck` — `mod(today_premium_amount, rounding_step) = 0`.
- `courier_shape_ck` — a courier plan has no small-order fee and no today premium.

Index: `delivery_fee_plan_one_active_uq` is rebuilt as `UNIQUE (kind) WHERE is_active` — one active
plan **per kind**.

State is derived (R11): `draft` = `activated_at IS NULL`; `active` = `is_active`; `retired` = the rest.
An activated plan is immutable — held by the admin service (`pricing.repository.ts` refuses under the
plan's row lock; nothing deletes a plan). ⚠ A database trigger was built for this and WITHDRAWN during
implementation: the platform allows triggers only to mark analytics buckets and never to raise inside
another writer's transaction (`shop/src/db/triggers.guard.test.ts`, 058 R6).

## `public.delivery_distance_band` — new (R2)

| Column | Type |
|---|---|
| `id` | `uuid PK` |
| `plan_id` | `uuid NOT NULL → delivery_fee_plan ON DELETE CASCADE` |
| `upper_km` | `numeric(7,2) NULL CHECK (upper_km > 0)` — NULL = "and beyond" |
| `add_amount` | `numeric(12,2) NOT NULL CHECK (>= 0)` |

`UNIQUE (plan_id, upper_km)`; `UNIQUE (plan_id) WHERE upper_km IS NULL` — at most one open band.
Shopper role: `SELECT`.

## `public.delivery_weight_band` — unchanged (R2)

The heaviest band is open-ended, by the engine's rule. Shopper role already reads it.

## `public.delivery_slot_premium` — new (R5)

| Column | Type |
|---|---|
| `plan_id` | `uuid NOT NULL → delivery_fee_plan ON DELETE CASCADE` |
| `slot_id` | `uuid NOT NULL → delivery_slot ON DELETE CASCADE` |
| `add_amount` | `numeric(12,2) NOT NULL CHECK (> 0)` |

`PRIMARY KEY (plan_id, slot_id)`. Shopper role: `SELECT`. A slot that is later disabled keeps its row;
it simply never applies, and the plan screen marks it (`premium_on_disabled_slot`, not blocking). A
deleted slot takes its premium rows with it.

## `public."order"`

| Column | Change | Notes |
|---|---|---|
| `delivery_fee_amount` | meaning widened | the delivery **total**, small-order fee included (R7) |
| `delivery_fee_breakdown` | **new** `jsonb NULL` | written at the intent call; NULL on orders placed before 077 |
| `delivery_quote` | shape changes | the captured order-level fee options (see contracts) |

`delivery_fee_breakdown`:
```json
{
  "v": 1, "kind": "effy",
  "plan": { "id": "…", "name": "Spring 2026" },
  "inputs": { "km": 12.4, "grams": 6200, "basketCents": 5400, "slotId": "…", "windowIsToday": true },
  "parts": { "baseCents": 300, "distanceCents": 200, "distanceBandUpperKm": 20,
             "weightCents": 100, "weightBandUpperGrams": 10000, "premiumCents": 200,
             "rawCents": 800, "roundedCents": 800, "clamp": null,
             "deliveryCents": 800, "freeApplied": false, "smallOrderCents": 0, "totalCents": 800 },
  "lines": [ { "kind": "delivery", "amount": "6.00" }, { "kind": "window_surcharge", "amount": "2.00" } ]
}
```
⚠ `plan`, `inputs` and `parts` never leave the staff gateway. A customer response carries `lines`.

## `public.order_package_delivery`, `public.shop_fulfillment`

`delivery_fee_amount` → **nullable, written NULL** from 077 on (R4). Dropped at E9. Existing rows keep
their values.

## Functions

| Function | Returns | Rule |
|---|---|---|
| `public.delivery_plan_gaps(p_plan uuid)` | `TABLE(code text, blocking boolean, detail jsonb)` | R12 — one row per gap; `floor_is_zero` and `premium_on_disabled_slot` do not block |
| `public.delivery_plan_is_complete(p_plan uuid)` | `boolean` | no blocking row |
| `public.delivery_plan_activate(p_plan uuid, p_actor text, p_confirm_zero_floor boolean)` | the plan row | R11 — lock, check, deactivate then activate in one transaction; raises `plan_not_found`, `plan_already_active`, `plan_retired`, `plan_incomplete`, `zero_floor_unconfirmed` |

Reading the active plan stays in the shared library (`plan.ts`): one query for the plan, one for each
band table, one for premiums. No SQL function computes a fee — the engine does (R3).

## Migration 1 — data steps, in order (R10)

1. Add columns, tables, constraints, functions, grants, comments. **Raise** if the active plan's
   `standard_factor <> 1` (R10).
2. For **every** plan: `kind='effy'`, `base_amount=0`; one `delivery_distance_band` row per
   `delivery_ring_price` row, `upper_km = ring.suggest_upper_km` (NULL for the open-ended ring),
   `add_amount = price_amount`. Rows for disabled rings are skipped and counted in a NOTICE.
3. Active plan: `today_premium_amount = EFFY_TODAY_PREMIUM`. **Raises** if the variable is unset, not
   a non-negative amount, or not a multiple of the plan's step.
4. **Raises** if `delivery_plan_is_complete(active plan)` is false, printing `delivery_plan_gaps`.
5. `order_package_delivery.delivery_fee_amount`: DROP NOT NULL (`shop_fulfillment`'s is already nullable).
6. One `admin.audit_log` row: `pricing.migrate_077`, with the bands created and the premium set.

Down: drops what step 1 added (dev single-step only; lossy for plans created since).

## Migration 2 — after the deploy

Drops `delivery_ring_price`, `delivery_ring`, `coverage_ring_for_km`, and
`delivery_zone.ring_id / suggested_ring_id / ring_is_overridden / hub_distance_km`. It first **raises**
if `delivery_fee_plan.kind` does not exist or the active Effy plan is not complete (migration 1 did
not run, or pricing is broken) — never on a courier plan or a half-built draft, which legitimately
have no distance bands.

## Audit — `admin.audit_log`, `target_type = 'pricing'`

| `action` | `detail` |
|---|---|
| `pricing.plan.create` | kind, name, every value |
| `pricing.plan.update` | before → after (drafts only) |
| `pricing.plan.activate` | plan, the plan it retired, `confirmZeroFloor` |
| `pricing.migrate_077` | bands created per plan, premium set |

## Derived, never stored

| Fact | From |
|---|---|
| A plan's state | `is_active`, `activated_at` |
| A plan's gaps | `delivery_plan_gaps` |
| A basket's fee | the engine, from the active plan at the moment of asking |
| A placed order's fee | **stored** — `delivery_fee_amount` and `delivery_fee_breakdown`; never recomputed (FR-036) |
| The customer's lines | `feeLines(breakdown)` — stored with the breakdown so a receipt never needs a plan |

## Left in place, frozen

`same_day_factor`, `standard_factor`, the two per-package fee columns (E9) · the same-day bridge
`delivery_zone.sameday_eligible`, `shop_sameday_exception` (E5) · group-keyed driver clearances (E8).

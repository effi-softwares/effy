# Research: Cutover to the New Delivery Model (083)

Read off the code on `dev` (after 082). No external research needed.

## R1 — Two stages, two migrations, two deploys

**Stage 1 (the switch)**: additive — a readiness definition, the setter, the Go-live page, the old-order
count, a 5-minute sweep and two alarms. Ships now.
**Stage 2 (removal)**: deletes the old checkout path and old-only settings, drops old-only columns, and
rewrites the docs. Its migration **refuses** while an old-kind order is open (R7).
Tasks are split the same way so stage 1 can be deployed and walked while stage 2 waits.

## R2 — Readiness: one TypeScript definition in the shared library

**Decision**: `@effy/edge-shared/delivery/readiness.ts` `goLiveReadiness(q, now)` →
`{ items: [{ key, required, ready, detail, fixAt }], ready: boolean }`. The Go-live read, the setter and
the sweep all call it (FR-004).

| key | required | ready when |
|---|---|---|
| `coverage` | yes | ≥ 1 row in `delivery_zone_postcode` |
| `hub` | yes | `delivery_settings.hub_latitude/longitude` set |
| `effy_plan` | yes | an active Effy plan (`loadActivePlan`) AND `effyFee` prices the nearest and farthest listed postcode at the lightest and heaviest weight band without `UnpricedDistanceError` / `UnpricedWeightError` |
| `windows` | yes | ≥ 1 active `delivery_slot` |
| `collection_runs` | yes | ≥ 1 active `delivery_collection_run` |
| `courier` | yes | `courier_offered = false`, OR an active courier plan AND an active default `courier_service` (the two things `courier_delivery_state` calls ready, without the model term) |
| `drivers` | advisory | ≥ 1 active driver with a delivery clearance and ≥ 1 with a collection clearance |
| `out_of_area` | advisory | courier is on (else: "addresses outside Effy's area will be refused") |

**Rationale**: every input already has a loader in the shared library; a SQL function would re-implement
the fee engine's "can this be priced". **Alternatives**: `courier_delivery_state` alone — it answers for
courier only, and includes the model switch itself.

## R3 — The switch: one setter, the existing column, the existing reader

**Decision**: `PUT /admin/v1/delivery/go-live/switch` `{ at: ISO | "now" | null, reason?, expected }` on the
`admin` service (staff gateway). Admin role only (`admin.staff` record). Writes
`delivery_settings.delivery_model_v2_from` and an `admin.audit_log` row in one transaction
(`delivery.model_switch_set` | `_changed` | `_cancelled` | `_turned_off`), then `announce` ops `delivery`.
- Setting or changing: refused `409 not_ready` with the failing items unless `goLiveReadiness().ready`.
- `null` while the moment is in the future = cancel (no reason needed). `null` after it has passed = turn
  back off: requires `reason`, refused `409 removed` once stage 2 is applied (R7 leaves a marker).
- `expected` = the value the page showed; a mismatch is `409 changed` (two admins).
- A past instant is stored as `now()`.
`public.delivery_model_v2_at` and `deliveryModelV2At` are untouched; `windows.guard.test.ts` gains the
setter as the ONE writer of the column.
**Who and when** are read from the latest audit row — no new columns.

## R4 — A scheduled moment that is no longer ready

**Decision**: a 5-minute scheduled function in `admin` (`delivery-model-switch-sweep`): while the moment
is in the future, evaluate readiness; emit `DeliveryModelSwitchReady` (1/0). If not ready and the moment
is within the next 10 minutes, set the column to NULL, audit `delivery.model_switch_blocked` with the
failing items, emit `DeliveryModelSwitchBlocked`. After the moment has passed it never reverts anything.
Alarms: `DeliveryModelSwitchBlocked ≥ 1`; the sweep's own failure (background-functions pattern).
**Rationale**: the reader is a one-line SQL function on the checkout's path; making it evaluate readiness
would put the fee engine in every quote. **Alternative**: check only at set time — a plan deactivated the
night before would switch on a checkout that cannot price (FR-008).

## R5 — Old-kind orders: the definition and the count

**Old-kind** = `order.delivery_type IS NULL` (079 never backfilled). **Open** = `status = 'paid'` AND at
least one portion not `withdrawn`/`unfulfillable` has no `package_arrival`, AND the order is not fully
refunded (055's counted refunds < paid). One SQL fragment `LEGACY_OPEN_ORDER_SQL(o)` in
`@effy/edge-shared/delivery/legacy.ts`, used by: the Go-live read (count + when the last one closed), the
orders list's existing `delivery=legacy` filter gaining `open=true`, the sweep's metric
`LegacyOrdersOpen`, and stage 2's migration guard (as plain SQL, restated in the migration with a comment
naming the fragment).
Alarm: `LegacyOrdersOpen ≥ 1` continuously for `var.legacy_orders_alert_days` (7) after the switch —
implemented as the sweep emitting `LegacyOrdersOpenPastDue` = count once `now − switch > N days`.

## R6 — Across the moment

Already true, and proved here rather than built: the quote is the one reader of the switch; the intent
re-quotes and refuses a delivery type or total the client did not show (409 `delivery_type_changed`,
`delivery_fee_changed`, the 069/078 choice refusals). An unpaid order from before the moment is re-captured
at the next intent call (`captureDelivery` rewrites type and packages). Container test P6 walks it.
**Customer app**: a build older than 078 cannot draw `effyWindows` and its 069 fields are refused once the
model is on. Releasing the current build is a runbook step BEFORE the switch; nothing detects it.

## R7 — Stage 2: what goes, what stays

**Goes**
- Shared: `delivery/sameday.ts` `sameDayForShops` + the same-day bridge in `zone.ts`; `standard-days.ts`
  `availableDays` (keep `nonDeliveryDates`, moved to `windows.ts`); the 069 half of `quote.ts`
  (`quoteLegacy`, `compatibilityFees`, per-package `feeAmount`); `judgeSlot`/`openSlots`.
- Commerce: `resolveDeliveryChoice`, the intent's `deliveryMethod` / `sameDaySlotId` / `standardDate`
  inputs (ignored if sent), the "N of your M deliveries" sentence.
- Orders: the 069 "day − carrier lead" due date (`promise.ts`) — courier parcels use the service's pickup.
- Admin + back-office: settings `standard_lookahead_days`, `carrier_lead_days`; the "Same-day" tab becomes
  "Collection runs", "Time slots" becomes "Delivery windows"; group `sameday_eligible` control (already
  hidden) and its API field.
- Customer web + mobile: the 069 method/slot/day pickers and their view-models; the checkout draws only
  `effyWindows` / the courier block.
- Columns (migration 2): `delivery_zone.sameday_eligible`, `ring_id`, `ring_is_overridden`,
  `hub_distance_km`; `shop_sameday_*` tables if present; `delivery_fee_plan.same_day_factor` /
  `standard_factor`; `delivery_settings.standard_lookahead_days`, `carrier_lead_days`,
  `courier_estimate_text`; `driver_zone_capability.method` (+ new unique index on driver, function, zone);
  `order_package_delivery.delivery_fee_amount`, `shop_fulfillment.delivery_fee_amount`;
  `driver_round.locked_by_sub` / `locked_at`. Each drop is preceded by a reader audit (the guard scripts
  already forbid most).
- The marker: `delivery_settings.legacy_model_removed_at timestamptz` set by migration 2 — what makes
  "turn back off" refuse, and what the quote reads to stop consulting the switch (model is always on).

**Stays — and why**
- `shop_fulfillment.delivery_method` / `order_package_delivery.method`: for an Effy order it is the
  customer's word (same-day = today's window, standard = a later day); for an old order it is how
  `package_delivered_by` answers. Not legacy. (Backlog E9-T09 corrected.)
- Table names `delivery_zone` / `delivery_zone_postcode`: a rename touches every reader for no behaviour
  (backlog "rename the two tables" declined; the comments say what they are).
- Driver wire `same_day_delivery`, `sameDayCount`, `standardCount`, `CollectionPackage.method`; shop wire
  `deliveryMethod`: kept as compatibility values so installed apps keep working (spec FR-022). Marked
  `@deprecated — compatibility`, excluded from the guard by name.
- Customer words "Same-day delivery" / "Standard delivery" (078 decision).

**Guard**: `scripts/check-no-legacy-delivery.sh` fails on `sameDayForShops|compatibilityFees|
resolveDeliveryChoice|standardDate|standard_date|sameDaySlotId|carrier_lead|standard_lookahead|
sameday_eligible|same_day_factor` outside `db/migrations`, `docs/archive`, `specs/` and this script.

## R8 — Docs

`CLAUDE.md` "Driver logistics model" rewritten for the new model (the ⚠ BEING REPLACED banner and the
047/069 bullets go; 072/073/076–082 bullets stay, tightened). Constitution: checked — no principle names
same-day/standard (re-verify in the task). `docs/archive/delivery-model-v1.md`,
`docs/runbooks/delivery-model-v2-cutover.md`, 047/069 spec headers marked superseded, guides updated.

## R9 — Where it attaches

`admin` (staff gateway): +2 routes (`GET /admin/v1/delivery/go-live`, `PUT …/go-live/switch`) and one
scheduled function → staff 156 → 158 of 300. Stage 2 adds none and removes none (settings fields only).

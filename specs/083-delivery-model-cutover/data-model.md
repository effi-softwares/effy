# Data Model: Cutover to the New Delivery Model (083)

## Stage 1 — `db/migrations/<ts>_delivery_model_cutover.sql` (additive)

| Change | Why |
|---|---|
| `delivery_settings.legacy_orders_alert_days int NOT NULL DEFAULT 7 CHECK (1–60)` | when lingering old orders alert (spec assumption) |
| COMMENT on `delivery_model_v2_from`: its ONE writer is the go-live setter | |

No table. The switch is the existing `delivery_settings.delivery_model_v2_from`; who/when/why is
`admin.audit_log` (`target_type = 'delivery_model'`, actions `delivery.model_switch_set`, `_changed`,
`_cancelled`, `_turned_off`, `_blocked`).

### Derived, never stored
- **Readiness** — `goLiveReadiness(q, now)` (research R2).
- **Old-kind open orders** — `LEGACY_OPEN_ORDER_SQL` (research R5); "when the last one closed" = the
  latest `package_arrival` / cancellation / settling refund among old-kind orders, shown only at zero.

### Switch states
```
off (NULL) ──set──► scheduled (future) ──time──► on (past)
     ▲                 │  ▲ change               │
     └──── cancel ─────┘  └── blocked by sweep   └── turn back off (reason) ──► off     [until stage 2]
```

## Stage 2 — `db/migrations/<ts>_retire_delivery_model_v1.sql`

**Refuses** (RAISE) if any old-kind order is open, or if `delivery_model_v2_from` is NULL or in the future.

| Change | |
|---|---|
| ADD `delivery_settings.legacy_model_removed_at timestamptz` = `now()` | the marker: turn-back refuses; the quote stops asking |
| `public.delivery_model_v2_at` → `true` when the marker is set | one definition still |
| DROP `delivery_zone.sameday_eligible`, `ring_id`, `ring_is_overridden`, `hub_distance_km` | 076/077 bridges |
| DROP `shop_sameday_exception` (+ `_declaration`, `_area` if present) | 076 bridge |
| DROP `delivery_fee_plan.same_day_factor`, `standard_factor` | 077 |
| DROP `delivery_settings.standard_lookahead_days`, `carrier_lead_days`, `courier_estimate_text` | 069, 079 |
| DROP `driver_zone_capability.method`; dedupe to one row per (driver, function, zone); new UNIQUE (driver_id, function, zone_id) NULLS NOT DISTINCT | 082 |
| DROP `order_package_delivery.delivery_fee_amount`, `shop_fulfillment.delivery_fee_amount` | 077 |
| DROP `driver_round.locked_by_sub`, `locked_at` (+ CHECK) | 073 |
| Recreate functions that named a dropped column (`coverage_for_postcode` no longer reads the same-day flag) | |

Kept: `delivery_method` / `method` columns; table names; every order, package, round and history row.
Down: not provided beyond the marker (a dropped column's data is gone) — the migration says so.

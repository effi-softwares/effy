# Data Model: Effy Delivery Coverage

**Feature**: 076-effy-delivery-coverage. One forward-only migration. Tables are **evolved in place**
(research R1); names change at the cutover (E9).

## `public.delivery_zone_postcode` — the list of postcodes Effy delivers to

| Column | Change | Notes |
|---|---|---|
| `postcode` | existing, UNIQUE | the guarantee of FR-004 |
| `zone_id` | **now nullable; FK → `ON DELETE SET NULL`** (was NOT NULL, CASCADE) | the optional group (FR-013/015) |
| `distance_km` | **new** `numeric(7,2) NOT NULL CHECK (distance_km >= 0 AND distance_km <= 5000)` | FR-007 |
| `distance_source` | **new** `text NOT NULL CHECK (IN ('computed','manual'))` | FR-010 |
| `distance_review` | **new** `boolean NOT NULL DEFAULT false` | set on manual rows when the hub moves (FR-012); cleared when staff save the distance |
| `added_by` | **new** `text NOT NULL` | staff sub; `'migration:076'` for backfilled rows |
| `updated_at` | **new** `timestamptz NOT NULL DEFAULT now()` | |

Backfill, in order: `computed` from `coverage_computed_distance_km(postcode)` where it is not NULL;
otherwise `manual` from the zone's `hub_distance_km` with `distance_review = true`; otherwise the
migration **raises** naming the postcodes — a listed postcode with no distance is not allowed to exist,
and a guessed one is worse (constitution: fail loudly).

Rows whose zone is `disabled` are deleted first (research R4) and named in one `admin.audit_log` row.

## `public.delivery_zone` — a coverage group

| Column | Change | Notes |
|---|---|---|
| `name`, `code` | existing | the group's name; `code` generated from the name as today |
| `status` | existing | `disabled` = a removed group. **No longer decides coverage.** |
| `ring_id` | **now nullable** | frozen fee tier for pre-076 groups; NULL for new ones (research R5) |
| `sameday_eligible` | default **true** | frozen flag for pre-076 groups (research R5) |
| `hub_distance_km`, `suggested_ring_id`, `ring_is_overridden` | unchanged, **no longer written** | dropped at E9 |

Comments on both tables are rewritten: what they now mean, and that the names are historical.

## `public.delivery_settings` (singleton)

| Column | Change |
|---|---|
| `courier_offered` | **new** `boolean NOT NULL DEFAULT false` (FR-016) |

## `public.courier_excluded_postcode` — new

| Column | Type |
|---|---|
| `postcode` | `text PRIMARY KEY CHECK (postcode ~ '^[0-9]{4}$')` |
| `reason` | `text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 200)` |
| `added_by` | `text NOT NULL` |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` |

Shopper role: `SELECT` only (the coverage function reads it during checkout).

## Functions

| Function | Returns | Rule |
|---|---|---|
| `public.haversine_km(lat1, lon1, lat2, lon2)` | `numeric` | great-circle distance, km. `IMMUTABLE`. |
| `public.coverage_computed_distance_km(p_postcode text)` | `numeric(7,2)` or NULL | hub → the postcode's primary place (has coordinates, highest `address_count`, then name). `STABLE`. |
| `public.coverage_ring_for_km(p_km numeric)` | `uuid` or NULL | the active tier with the smallest `suggest_upper_km >= p_km`, else the open-ended tier, else the furthest. Bridge until E3. |
| **`public.coverage_for_postcode(p_postcode text)`** | `(kind, reason, distance_km, group_id, group_name)` | **the only place coverage is decided** — see below. `STABLE`. |

```
coverage_for_postcode(p):
  on the list                                   → effy    / listed            (+ distance, group)
  no locality row has this postcode             → none    / unknown_postcode
  courier_offered is false                      → none    / courier_off
  p in courier_excluded_postcode                → none    / courier_excluded
  otherwise                                     → courier / courier_offered
```

`EXECUTE` granted to the shopper role.

## Derived, never stored

| Fact | From |
|---|---|
| An address's coverage | `coverage_for_postcode(address postcode)` at the moment of asking (FR-021) |
| Places a postcode covers | `locality WHERE postcode = …` |
| Drivers who can deliver to a group / to ungrouped postcodes | `driver_zone_capability` (research R6) |
| Which postcodes a hub move changed | the `UPDATE … RETURNING` in the settings transaction |

## Audit

`admin.audit_log` (existing), one row per change, `target_type = 'coverage'`:

| `action` | `detail` |
|---|---|
| `coverage.postcode.add` / `.remove` | postcode, group, distance, source |
| `coverage.postcode.distance` | from → to, source from → to |
| `coverage.postcode.group` | postcodes, from → to |
| `coverage.group.create` / `.rename` / `.remove` | name(s); for remove, the postcodes ungrouped |
| `coverage.courier.switch` | from → to |
| `coverage.courier.exclude` / `.include` | postcode, reason |
| `coverage.hub_recompute` | counts changed, unchanged, flagged |

## Left in place, frozen (dropped by the epic named)

`delivery_ring`, `delivery_ring_price` (E3) · `shop_sameday_exception`, `delivery_zone.sameday_eligible`
(E5/E9) · `driver_zone_capability.zone_id` semantics (E8) · the table names themselves (E9).

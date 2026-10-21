# Data Model: Delivery Today, Postcode by Postcode (097)

One migration. No new table.

## `public.delivery_zone_postcode` (the list, 047/076) — one new column

| Column | Type | Rule |
|---|---|---|
| `today_offered` | `boolean NOT NULL DEFAULT true` | Whether a window TODAY may be sold to an address in this postcode. `true` for every row at release (FR-002). Written only by the admin coverage repository (add, and the bulk change). |

`COMMENT ON COLUMN` states: per postcode, never per group; read only through
`public.coverage_for_postcode`; switching it off never touches a held or confirmed place.

Lifecycle: created `true` (or as chosen in Add places) → toggled by staff any number of times →
deleted with the row when the postcode is removed. Not remembered across a remove/re-add.

## `public.coverage_for_postcode(p_postcode text, p_at timestamptz DEFAULT now())` — one new result column

```
RETURNS TABLE (kind text, reason text, distance_km numeric, group_id uuid, group_name text,
               today_offered boolean)
```

- Listed (`kind = 'effy'`): the row's `today_offered`.
- Not listed (`courier` / `none`): `true` — meaningless there, and never read for those kinds
  except by re-timing an already-Effy order (research R5).

Replaced by `DROP FUNCTION` + `CREATE FUNCTION` (result columns change). The body is 079's with the
extra column; the `COMMENT ON FUNCTION` gains one sentence. The Down migration restores 079's
definition and drops the column.

## `admin.audit_log` — new action, no schema change

| action | target_type | detail |
|---|---|---|
| `coverage.postcode.today` | `coverage` | `{ "before": { "3220": true, "3030": true }, "after": false }` — one row per change request, only postcodes whose value actually changed |
| `coverage.postcode.add` (existing) | `coverage` | `after` gains `todayOffered` |

## TypeScript shapes

### `Coverage` (`shared/src/delivery/coverage.ts`)
`+ todayOffered: boolean`

### `effyDays` (`shared/src/delivery/windows.ts`)
```
effyDays(now, lookahead, noWeekdays, noDates, todayOffered): EffyCalendarDay[]
```
All five parameters required. `todayOffered === false` → the returned list has no `isToday` day;
the `lookahead` later delivery days are unchanged.

### Staff contract (`packages/shared-types/src/delivery-admin.ts`)

| Type | Change |
|---|---|
| `CoveragePostcodeDTO` | `+ todayOffered: boolean` |
| `CoverageListDTO.counts` | `+ todayNotOffered: number` |
| `AddCoveragePostcodesRequest` | `+ todayOffered?: boolean` (absent = `true`) |
| `PatchCoveragePostcodesRequest` | `+ todayOffered?: boolean` |
| `CoverageCheckDTO` | `+ todayOffered: boolean \| null` (null when not listed) |

Back-office `CoverageFilters`: `+ today?: "offered" \| "not_offered"`, `+ minKm?: string`.

### Customer contract — unchanged

`EffyWindowsDTO` is unchanged in shape. For an address with Delivery today not offered, `days`
simply has no entry with `section: "same_day"`. No new field, no new `closedReason` value.

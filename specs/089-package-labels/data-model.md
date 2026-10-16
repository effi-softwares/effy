# Data Model: Package Labels (089)

One migration, `db/migrations/20261016150000_package_code.sql`.

## `public.new_package_code()` — NEW function

`RETURNS text`, VOLATILE. Loops: 6 characters drawn uniformly from `23456789ABCDEFGHJKMNPQRSTVWXYZ`
(via `gen_random_bytes`), returns the first not present in `shop_fulfillment.package_code`.

## `shop_fulfillment.package_code` — NEW column

| Property | Value |
|---|---|
| Type | `text NOT NULL` |
| Default | `public.new_package_code()` |
| Constraint | `UNIQUE`; `CHECK (package_code ~ '^[2-9A-HJKMNP-TV-Z]{6}$')` |
| Backfill | every existing row, in the migration, before NOT NULL |

Never updated by any writer (FR-003). Never reused: rows are never deleted for a cancelled order, and
the UNIQUE index covers every row ever written.

## Derived for the label (not stored)

| Field | From |
|---|---|
| `position`, `packageCount` | `row_number()` / `count(*)` over the order's `shop_fulfillment` rows by `created_at, id` |
| `suburb` | `order.delivery_address ->> 'city'` |
| `cold` | products' `storage` attribute over the package's order items: any `frozen` → frozen, else any `chilled` → chilled, else null |
| delivers | `deliveredBy` (already on the shop detail) |

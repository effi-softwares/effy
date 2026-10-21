# Data model — 096

There is one goose migration: `db/migrations/20261023090000_parcels_scanning_documents.sql`. It uses raw SQL
and no ORM, and it is reversible apart from the backfills.

## New tables

### `public.package_parcel` — one physical bag or box (R1–R4)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `shop_fulfillment_id` | uuid NOT NULL → `shop_fulfillment` | the package |
| `parcel_code` | text NOT NULL UNIQUE, CHECK `^[2-9A-HJKMNP-TV-Z]{6}$` | parcel 1 = the package's `package_code` (R1). One code space (R2). |
| `seq` | int NOT NULL | assigned once and stable after the first print (R4) |
| `zone` | text NOT NULL CHECK in (`ambient`,`chilled`,`frozen`) | |
| `voided_at` / `voided_by_staff_id` / `voided_by_sub` | timestamptz / uuid / text NULL | void by the shop or by staff |
| `declared` | boolean NOT NULL DEFAULT false | true once the shop has declared bags (R4's ready gate) |
| `pack_scanned_at` / `pack_scanned_by_staff_id` | NULL | FR-020 |
| `created_at` | timestamptz NOT NULL DEFAULT now() | |

- Partial unique index: `(shop_fulfillment_id, seq) WHERE voided_at IS NULL`.
- An insert trigger on `shop_fulfillment` creates parcel 1 (`seq 1`, the coldest line zone, or `ambient`).
- The backfill does the same for every existing package.
- `new_package_code()` is replaced so it checks both tables. `new_parcel_code()` calls it.
- **Derived, never stored**:
  - "live" means `voided_at IS NULL`;
  - "n of N" is `seq` of N = count(live). `seq` stays contiguous because, once printed, only the last
    parcel may be voided and a re-declaration renumbers all (research R4). Parcel 1 is never voided;
  - "printed" means at least one `label_print` row.

### `public.label_print` — every print and reprint (FR-015)

`id`, `parcel_id` → `package_parcel`, `shop_staff_id`, `layout` (`a6` | `a4x4` | `roll62`), `path`
(`browser` | `zpl`), `printed_at`.

This table is append-only.

### `public.label_read` — every read attempt (R7, FR-060)

| Column | Notes |
|---|---|
| `id` uuid PK, `client_read_id` uuid UNIQUE | an offline replay records once |
| `actor_kind` | `driver` \| `shop_staff` \| `admin_staff`, with `driver_id` / `shop_staff_id` / `admin_sub` and a CHECK that the matching one is set |
| `surface` | `driver_app` \| `shop_web` \| `back_office` |
| `step` | `pack` \| `collect` \| `checkin` \| `load` \| `deliver` \| `return` \| `lookup` (hub staff check in under `checkin`, told apart by `actor_kind`) |
| `raw` | text ≤ 64 characters, the value read |
| `read_method` | `scan` \| `typed` (not `method`: a dropped name the schema-drift guard tracks) |
| `client_outcome`, `server_outcome` | `accepted` \| `already_counted` \| `belongs_elsewhere` \| `not_on_this_work` \| `voided` \| `cancelled` \| `not_a_label` \| `not_found` |
| `parcel_id` NULL, `round_id` NULL | |
| `device_id` text NULL, `app_version` text NULL | |
| `device_at` timestamptz NULL, `received_at` timestamptz NOT NULL DEFAULT now() | |
| `corrects_read_id` uuid NULL → `label_read` | a correction is a new row |

Indexes: `(received_at)`, `(parcel_id)`, `(server_outcome) WHERE server_outcome <> 'accepted'`.

Append-only: the application roles are granted INSERT and SELECT only.

### `public.tax_document` — invoices and adjustment notes (R15)

| Column | Notes |
|---|---|
| `id`, `kind` (`invoice` \| `adjustment`) | |
| `order_id` → `order`, `refund_id` NULL → refund | |
| `number` text UNIQUE | `EFY-INV-` / `EFY-ADJ-` + `lpad(nextval('tax_document_number_seq'), 6, '0')` |
| `issued_at`, `snapshot` jsonb NOT NULL, `issuer` jsonb NOT NULL | the snapshot is exactly what the PDF prints |

Constraints:
- UNIQUE `(order_id) WHERE kind = 'invoice'`;
- UNIQUE `(refund_id) WHERE kind = 'adjustment'`.

No UPDATE grant: an issued document is never altered.

### `public.business_tax` — singleton (R18)

The columns are `legal_name`, `abn` (CHECK 11 digits), `fee_treatment` (`taxable` \| `gst_free`),
`invoices_enabled` (DEFAULT false), `updated_by_sub` and `updated_at`.

- There is **no seeded value** (Real-World Identifiers).
- `invoices_enabled` is guarded in the service: it needs every field set and zero unclassified live products.

### `public.product_gst_change` — history (FR-090)

The columns are `id`, `product_id`, `from_status`, `to_status`, `actor_kind` (`shop_staff` \| `admin_staff`),
the actor id, `via` (`review` \| `direct` \| `bulk`) and `changed_at`.

### `public.order_business_identity` — optional per order (FR-085)

The columns are `order_id` PK, `business_name`, `abn` (checksum-validated in the service) and `created_at`.
Only the tax invoice reads it.

## Changed tables

| Table | Change |
|---|---|
| `shop_fulfillment` | none (`package_code` stays) |
| `package_handover` (090) | + `parcel_id` (backfilled to parcel 1, then NOT NULL), `actor_kind`, `shop_staff_id`, `admin_sub`, `device_at`. `driver_id` and `round_id` become NULL-able, with a CHECK per actor. The `step` set grows by `pack`, `courier_handover` and `shop_pickup` (hub staff use `checkin`, told apart by `actor_kind`). The UNIQUE constraint becomes `(change_id, parcel_id)` (R5). |
| `package_hold` (093) | + `parcel_id` NULL (NULL = the whole package). The `step` set grows by `collect`, `deliver` and `return`. The UNIQUE constraint becomes `(change_id, shop_fulfillment_id, parcel_id)` with NULLS NOT DISTINCT. `heldSql` reads `parcel_id IS NULL` only (R6). |
| `hub_checkin` (063) | + `closed_by` (`driver` \| `admin_staff`) and `closed_by_sub` (R8). |
| `shop` | + `pack_scan_required boolean NOT NULL DEFAULT false` (FR-022), written only by `PUT /fleet/v1/shops/{id}/pack-scanning` (admin or manager; research R19). |
| `product` | + `gst_status text NULL CHECK in (taxable, gst_free)` |
| `order_item` | + `gst_status text NULL` (captured at checkout; NULL for orders before 096) |

## State and derivations

**Parcel custody** is derived, never stored. It is the latest `package_handover.step` for the parcel:

- none → at shop
- `pack` → packed (at shop)
- `collect` → with driver
- `courier_handover` or `shop_pickup` → with courier
- `checkin` (driver or hub staff) → at hub
- `load` → out for delivery
- `deliver` → delivered
- `return` → returned to hub
- open parcel hold → missing

**What a step expects** is `expectedParcels(step, scope)`. These are the live parcels of the step's packages
with:
- no open hold;
- no `package_handover` row at this step;
- (for load and deliver) a hand-over at the step before.

**Package status words (073)** are unchanged. A package with an open parcel hold shows "Problem" to staff,
using the existing word. The shop and the customer see nothing about it.

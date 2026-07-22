# Data Model: Delivery Zones & Pricing (021)

**Date**: 2026-07-21 · **Feeds**: [plan.md](./plan.md) · **Decisions**: [research.md](./research.md)

One forward-only Goose migration: `db/migrations/<ts>_delivery_zones_pricing.sql`. PostgreSQL 16, raw
SQL, `text ... CHECK` enums (no native enums, no triggers), an index on every FK, `COMMENT ON`
everything — the 009/020 house style. All operational objects in `public`; audit reuses `admin.audit_log`.

---

## Change summary

| Object | Change | Why |
|---|---|---|
| `public.delivery_zone` | **NEW** | R2 — a named serviced area |
| `public.delivery_zone_postcode` | **NEW** | R2 — postcode → zone (both origin & destination) |
| `public.delivery_offering` | **NEW** | R2 — the rate table, keyed (origin zone → dest zone, method) |
| `public.shop` | **ALTER** — add `postcode` | R4 — shops gain a location (they have none) |
| `public.order_package_delivery` | **NEW** | R3 — the captured per-package quote, pending → finalize |
| `public."order"` | **ALTER** — add `delivery_quote_expires_at` | R7 — quote validity window |
| `public.shop_fulfillment` | **ALTER** — add delivery columns | R11 — real per-portion delivery, read by 020 |
| `pricing.DeliveryFeeCents` (Go const) | **DELETED** | R6 — the flat fee is gone |
| `admin.audit_log` | **reused** (new action/target values) | R9 — no new audit table |

---

## 1. `public.delivery_zone` — NEW

```sql
CREATE TABLE public.delivery_zone (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code       text NOT NULL UNIQUE,              -- operator handle, e.g. 'MEL-METRO'
    name       text NOT NULL,                     -- e.g. 'Melbourne Metro'
    status     text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
```
A named serviced area. `disabled` = not offered as an origin or destination for new quotes (historical
orders untouched, FR-016). Never exposed to customers.

## 2. `public.delivery_zone_postcode` — NEW

```sql
CREATE TABLE public.delivery_zone_postcode (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_id    uuid NOT NULL REFERENCES public.delivery_zone (id) ON DELETE CASCADE,
    postcode   text NOT NULL UNIQUE,              -- a postcode belongs to AT MOST one zone
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX delivery_zone_postcode_zone_idx ON public.delivery_zone_postcode (zone_id);
```
The `UNIQUE (postcode)` is the load-bearing rule: one postcode → at most one zone. **Both** a shop's
origin postcode (R4) and a customer's destination `postal_code` resolve through this table. A postcode in
no row = no zone = undeliverable (FR-017).

## 3. `public.delivery_offering` — NEW (the rate table)

```sql
CREATE TABLE public.delivery_offering (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    origin_zone_id       uuid NOT NULL REFERENCES public.delivery_zone (id) ON DELETE RESTRICT,
    destination_zone_id  uuid NOT NULL REFERENCES public.delivery_zone (id) ON DELETE RESTRICT,
    method               text NOT NULL CHECK (method IN ('same_day', 'scheduled', 'standard')),
    price_amount         numeric(12, 2) NOT NULL CHECK (price_amount >= 0),
    -- Window/lead time. min==max==0 for same_day (today). scheduled/standard span days.
    lead_days_min        int NOT NULL DEFAULT 0 CHECK (lead_days_min >= 0),
    lead_days_max        int NOT NULL DEFAULT 0 CHECK (lead_days_max >= lead_days_min),
    same_day_cutoff      time,                     -- only meaningful for method='same_day'; NULL otherwise
    status               text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    UNIQUE (origin_zone_id, destination_zone_id, method)
);
CREATE INDEX delivery_offering_origin_idx ON public.delivery_offering (origin_zone_id);
CREATE INDEX delivery_offering_dest_idx   ON public.delivery_offering (destination_zone_id);
CREATE INDEX delivery_offering_lookup_idx ON public.delivery_offering (origin_zone_id, destination_zone_id);
```

| Field | Notes |
|---|---|
| `(origin_zone_id, destination_zone_id, method)` | The rate key (R2). UNIQUE so one price per leg-method. |
| `method` | `same_day` \| `scheduled` (customer picks a date) \| `standard` (derived window). |
| `lead_days_min/max` | The promised window. `0/0` = same-day. `2/3` = "in 2–3 days". Drives `promised_ready_at`. |
| `same_day_cutoff` | Per-offering time-of-day; after it, `same_day` is withdrawn from a quote (FR edge case). |

**Serviceability of a package** = an `active` offering exists for
(shop's origin zone → customer's destination zone). Same-day availability follows from a `same_day` row
for that pair, not from shop identity — the R2 premise made data.

## 4. `public.shop` — ALTER

```sql
ALTER TABLE public.shop ADD COLUMN postcode text;   -- origin location; NULL = no origin zone = undeliverable
COMMENT ON COLUMN public.shop.postcode IS
    'Origin location (021). Resolves to an origin delivery_zone via delivery_zone_postcode. NULL = the shop has no location set yet → its packages are undeliverable (FR-017). Never exposed to customers (FR-019).';
```
Nullable by design — a shop without a set location is a safe "undeliverable" state, not an error. Matches
the `postal_code` naming already used by `customer_address`.

## 5. `public.order_package_delivery` — NEW (the captured quote, R3)

The per-package delivery selection, written at **intent** time, consumed at **finalize**. This is the
pending holder that exists because `shop_fulfillment` does not yet (R3).

```sql
CREATE TABLE public.order_package_delivery (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id              uuid NOT NULL REFERENCES public."order" (id) ON DELETE CASCADE,
    shop_id               uuid NOT NULL REFERENCES public.shop (id) ON DELETE RESTRICT,
    service_level         text NOT NULL,                 -- the customer-facing label of the chosen method
    method                text NOT NULL CHECK (method IN ('same_day', 'scheduled', 'standard')),
    delivery_fee_amount   numeric(12, 2) NOT NULL CHECK (delivery_fee_amount >= 0),
    promised_ready_at     timestamptz NOT NULL,          -- computed from placed-at-quote + lead window / chosen date
    scheduled_date        date,                          -- set only when method='scheduled'
    created_at            timestamptz NOT NULL DEFAULT now(),
    UNIQUE (order_id, shop_id)
);
CREATE INDEX order_package_delivery_order_idx ON public.order_package_delivery (order_id);
```
**Lifecycle** (mirrors `order_item`): deleted + reinserted on every intent call (`UpsertPendingOrder`), so
the captured quote always reflects the latest selection. At finalize, its rows populate the new
`shop_fulfillment` delivery columns (§7) and are then historical. `order.delivery_fee_amount` = SUM of
these `delivery_fee_amount` at intent time.

## 6. `public."order"` — ALTER

```sql
ALTER TABLE public."order" ADD COLUMN delivery_quote_expires_at timestamptz;
COMMENT ON COLUMN public."order".delivery_quote_expires_at IS
    'The captured quote validity window (021, R7). Intent honors captured per-package fees while now() < this; on expiry the customer re-quotes. NULL for pre-021 orders.';
```
`order.delivery_fee_amount` (existing) keeps its name and semantics but its **value** is now the summed
per-package fee (R6) — no schema change to that column.

## 7. `public.shop_fulfillment` — ALTER (real per-portion delivery, R11)

```sql
ALTER TABLE public.shop_fulfillment
    ADD COLUMN delivery_service_level text,
    ADD COLUMN delivery_method        text CHECK (delivery_method IN ('same_day','scheduled','standard')),
    ADD COLUMN delivery_fee_amount    numeric(12, 2) CHECK (delivery_fee_amount >= 0),
    ADD COLUMN promised_ready_at      timestamptz;
```
Populated at **finalize** from `order_package_delivery` (in 019's `FinalizeSucceeded` transaction). All
nullable so pre-021 fulfilment rows remain valid.

- `promised_ready_at` — the real per-portion ready-by that **020's queue ordering seam** reads (R11),
  replacing 020's uniform `promiseFor(placedAt)` derivation when present.
- `delivery_service_level` — shown to the shop operator (FR-021a).
- `delivery_fee_amount` — recorded, **never shown to the shop** (FR-021a walls off the payment amount);
  present for the customer receipt breakdown and the future refunds/payout slices.

---

## The extended finalize transaction (R3, FR-012a)

019's `FinalizeSucceeded` is one transaction (paid-transition + fan-out + outbox + payment + empty cart).
021 extends **step 2** (the fan-out) so `shop_fulfillment` is populated *with* its delivery columns from
the holder, inside the same tx:

```sql
-- 021-extended fan-out: one shop_fulfillment per shop, carrying its captured delivery selection.
INSERT INTO public.shop_fulfillment
    (order_id, shop_id, item_count, subtotal_amount,
     delivery_service_level, delivery_method, delivery_fee_amount, promised_ready_at)
SELECT oi.order_id, oi.shop_id, SUM(oi.quantity)::int, SUM(oi.line_subtotal_amount),
       opd.service_level, opd.method, opd.delivery_fee_amount, opd.promised_ready_at
FROM public.order_item oi
JOIN public.order_package_delivery opd
     ON opd.order_id = oi.order_id AND opd.shop_id = oi.shop_id
WHERE oi.order_id = $1
GROUP BY oi.order_id, oi.shop_id, opd.service_level, opd.method, opd.delivery_fee_amount, opd.promised_ready_at
ON CONFLICT (order_id, shop_id) DO NOTHING;
```
Atomic by construction — the transaction boundary already exists (FR-012a). If any package lacks a holder
row (should be impossible — intent writes one per shop), the JOIN drops it and the fan-out count would
mismatch, which the finalizer must treat as an error and roll back (a paid order must never lose a
package). The `order.placed` outbox payload gains per-package `deliveryFee` + `window`.

---

## Zone resolution (the quote computation, hot path)

```sql
-- destination zone from the order's / address's postcode
SELECT zone_id FROM public.delivery_zone_postcode WHERE postcode = $destPostcode;   -- NULL → whole order undeliverable
-- per shop: origin zone from the shop's postcode
SELECT z.zone_id FROM public.shop s JOIN public.delivery_zone_postcode z ON z.postcode = s.postcode WHERE s.id = $shopId;
-- offerings for the leg
SELECT method, price_amount, lead_days_min, lead_days_max, same_day_cutoff
FROM public.delivery_offering
WHERE origin_zone_id = $origin AND destination_zone_id = $dest AND status = 'active';
```
A package with no origin zone, no destination zone, or no active offering for the pair = undeliverable
(FR-017) → auto-set-aside (R8).

---

## Validation rules (traceable to FRs)

| Rule | Source |
|---|---|
| One postcode → at most one zone | R2 · `UNIQUE (postcode)` |
| One rate per (origin, destination, method) | R2 · `UNIQUE` |
| Fee computed server-side, never client input | FR-007/008 · quote reads offerings; client never supplies price |
| Captured quote honored within window; else re-quote | FR-011/011a · `delivery_quote_expires_at` |
| Order total = Σ per-package fees | FR-009/023 · `order.delivery_fee_amount = SUM(order_package_delivery.fee)` |
| Atomic multi-package finalize | FR-012a · one tx; JOIN mismatch → rollback |
| Undeliverable package auto-excluded, explicit confirm | R8 · intent validates exclusions vs serviceability |
| Shop sees level + ready-by, not fee | FR-021a · queue/detail select delivery_service_level + promised_ready_at, never delivery_fee_amount |
| Shop location never exposed | FR-019 · shop.postcode never in a customer projection |
| Management changes audited | FR-018 · `admin.audit_log` action `delivery_zone.*` / `delivery_offering.*` / `shop.location_set` |

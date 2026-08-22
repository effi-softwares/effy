# Data Model: Delivery Zones & Shipping-Fee Engine (047)

**One forward-only migration**: `<ts>_delivery_shipping_engine.sql`.

House style (007/009/019/021/027/029/030/031/032): everything operational in `public`; raw SQL; `text`
CHECK enums (no native PG enums, no triggers); an index on every FK; `numeric(12,2)` for money;
`COMMENT ON` everything; audit reuses `admin.audit_log`. Money math is integer-cents-safe. All fee
figures are **GST-inclusive**.

Legend: **NEW** = new table; **ALTER** = column change to an existing table.

| Object | Change | Serves |
|---|---|---|
| `public.locality` | **NEW** (+loader) | FR-006/007/012 (place record) |
| `public.delivery_ring` | **NEW** | FR-014/015/017 (distance tiers) |
| `public.delivery_zone` | **NEW** | FR-001/005/014/037 (served areas + ring + same-day flag) |
| `public.delivery_zone_postcode` | **NEW** | FR-001/009 (postcode → one zone) |
| `public.delivery_settings` | **NEW** (singleton) | FR-015/017/039 (hub + prep buffer) |
| `public.delivery_collection_run` | **NEW** | FR-039/040 (collection runs) |
| `public.delivery_fee_plan` | **NEW** | FR-022/024/026/027/047/048 (plan header + factors + rounding/floor/cap) |
| `public.delivery_ring_price` | **NEW** | FR-020 (distance slab value per ring) |
| `public.delivery_weight_band` | **NEW** | FR-021/028 (weight slabs) |
| `public.shop_sameday_exception` | **NEW** | FR-043/044 (per-shop same-day override) |
| `public.product` | **ALTER** +weight_grams, +weight_is_assumed | FR-053/054/055 |
| `public."order"` | **ALTER** +delivery capture | FR-036 |
| `public.order_package_delivery` | **NEW** | FR-030/036 (captured per-package quote) |
| `public.shop_fulfillment` | **ALTER** +delivery columns | 020 queue reads |

---

## 1. Place record — `public.locality` (NEW, loader-populated)

```sql
CREATE TABLE public.locality (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name          text NOT NULL,
    state         text NOT NULL CHECK (state IN ('ACT','NSW','NT','QLD','SA','TAS','VIC','WA')),
    postcode      text NOT NULL CHECK (postcode ~ '^[0-9]{4}$'),
    latitude      numeric(9, 6),        -- nullable: G-NAF locality point is not universal
    longitude     numeric(9, 6),
    address_count int NOT NULL DEFAULT 0 CHECK (address_count >= 0),
    CONSTRAINT locality_triple_uq UNIQUE (name, state, postcode)   -- the natural key (030 R2a)
);
CREATE INDEX locality_postcode_idx     ON public.locality (postcode);
CREATE INDEX locality_name_prefix_idx  ON public.locality (lower(name) text_pattern_ops);  -- typeahead
```

- ⚠ **The triple is the key**, not `(name,state)` (a locality spans postcodes) and not `postcode` (a
  postcode covers localities). This is the fact FR-007 states to the shopper.
- ⚠ **`text_pattern_ops`** is load-bearing (030 R5): a plain B-tree does not serve `lower(name) LIKE
  'richmo%'` under a non-C collation, and the typeahead would sequentially scan ~15k rows per keystroke
  with nothing in the test suite noticing.
- `numeric(9,6)` (exact, not `double precision`) so a re-load is byte-identical (030 idempotence).
- Rows by the idempotent `cmd/load-localities` (upsert on the triple), never by migration.

---

## 2. Distance rings — `public.delivery_ring` (NEW, standing config)

```sql
CREATE TABLE public.delivery_ring (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code            text NOT NULL UNIQUE,                 -- e.g. INNER, MIDDLE, OUTER, EXTENDED
    name            text NOT NULL,
    ordinal         int  NOT NULL UNIQUE CHECK (ordinal > 0),  -- distance order (1 = nearest hub)
    suggest_upper_km numeric(7,2) CHECK (suggest_upper_km > 0), -- NULL on the top (open-ended) ring
    status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
    updated_by      text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX delivery_ring_open_top_uq ON public.delivery_ring ((suggest_upper_km IS NULL))
    WHERE suggest_upper_km IS NULL;   -- exactly one open-ended (furthest) ring
```

- **`ordinal`** is the distance order — the only meaning of "far vs near" the quote needs. `suggest_upper_km`
  is used **only** to auto-suggest a zone's ring (R4); the quote never reads it.
- The single `suggest_upper_km IS NULL` row is the furthest ring; a zone beyond every bounded ring
  suggests to it. Rings are **standing config** — priced by the plan, not owned by it.

---

## 3. Zones & serviceability

```sql
CREATE TABLE public.delivery_zone (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code               text NOT NULL UNIQUE,     -- operator handle, e.g. MEL-INNER-NORTH
    name               text NOT NULL,
    ring_id            uuid NOT NULL REFERENCES public.delivery_ring (id) ON DELETE RESTRICT,
    ring_is_overridden boolean NOT NULL DEFAULT false,   -- true = admin overrode the suggestion (FR-016)
    suggested_ring_id  uuid REFERENCES public.delivery_ring (id) ON DELETE SET NULL,  -- what R4 proposed
    hub_distance_km    numeric(7,2),             -- the computed representative distance (internal only)
    sameday_eligible   boolean NOT NULL DEFAULT false,   -- FR-037 platform baseline (all shops)
    status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
    updated_by         text NOT NULL,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX delivery_zone_ring_idx ON public.delivery_zone (ring_id);

CREATE TABLE public.delivery_zone_postcode (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_id    uuid NOT NULL REFERENCES public.delivery_zone (id) ON DELETE CASCADE,
    postcode   text NOT NULL UNIQUE CHECK (postcode ~ '^[0-9]{4}$'),   -- ⚠ a postcode is in AT MOST one zone
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX delivery_zone_postcode_zone_idx ON public.delivery_zone_postcode (zone_id);
```

- ⚠ **`UNIQUE (postcode)` is the serviceability guarantee** (FR-001/009). Serviced ⇔ the postcode has a
  row here whose zone is `active`. A postcode in no row = not served (FR-002). One predicate; one refusal.
- **`hub_distance_km` / `sameday_eligible` never reach a customer DTO** (FR-018/FR-033). `distance` is
  internal; the shopper's read is a single `serviced` boolean.
- ⚠ **No FK from `delivery_zone_postcode.postcode` to `locality`** (031): a postcode may legitimately have
  no locality row (a PO-box code) — the admin is warned and confirms (FR-010); an FK would refuse exactly
  the rows the health surface must report.

---

## 4. Hub, buffer & the collection schedule (same-day timing)

```sql
CREATE TABLE public.delivery_settings (            -- singleton
    id                        int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    hub_latitude              numeric(9,6) NOT NULL,     -- Effy operating hub (ring suggestion origin)
    hub_longitude             numeric(9,6) NOT NULL,
    sameday_prep_buffer_min   int NOT NULL DEFAULT 60 CHECK (sameday_prep_buffer_min >= 0),
    updated_by                text NOT NULL,
    updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.delivery_collection_run (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_time   time NOT NULL,                     -- ⚠ wall-clock, Australia/Melbourne (FR-041)
    label      text,
    status     text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
    updated_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT delivery_collection_run_time_uq UNIQUE (run_time)
);
```

- **Same-day is offered iff** ∃ an `active` run today with `now_melbourne ≤ run_time − prep_buffer`
  (R6). One run ⇒ a single daily cutoff; several ⇒ availability extends run-by-run (the hybrid).
- ⚠ `time` carries no zone **by design** — a collection time is a fact about Effy's working day; it is
  compared in `Australia/Melbourne`, never UTC/device (the 032 daylight-saving trap).
- **The cutoff is derived, never stored** — there is no `sameday_cutoff` column, so it can never drift
  from the actual collection schedule.

---

## 5. Fee plans — many, one active (the pricing SSOT)

```sql
CREATE TABLE public.delivery_fee_plan (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name              text NOT NULL UNIQUE,
    is_active         boolean NOT NULL DEFAULT false,
    rounding_step     numeric(12,2) NOT NULL DEFAULT 0.50 CHECK (rounding_step > 0),
    floor_amount      numeric(12,2) NOT NULL CHECK (floor_amount >= 0),
    cap_amount        numeric(12,2) NOT NULL CHECK (cap_amount > 0),
    same_day_factor   numeric(6,3)  NOT NULL CHECK (same_day_factor > 0),
    standard_factor   numeric(6,3)  NOT NULL CHECK (standard_factor > 0),
    created_by        text NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    activated_by      text,
    activated_at      timestamptz,
    -- ⚠ a ≥ b (FR-022), by CHECK
    CONSTRAINT delivery_fee_plan_factor_ck  CHECK (same_day_factor >= standard_factor),
    -- ⚠ cap and floor are multiples of the step, so every fee lands on the grid (SC-005), incl. a capped one
    CONSTRAINT delivery_fee_plan_cap_step_ck   CHECK (mod(cap_amount,   rounding_step) = 0),
    CONSTRAINT delivery_fee_plan_floor_step_ck CHECK (mod(floor_amount, rounding_step) = 0),
    CONSTRAINT delivery_fee_plan_cap_floor_ck  CHECK (cap_amount >= floor_amount)
);
-- ⚠ EXACTLY ONE active plan (FR-048), enforced in the database, not a service
CREATE UNIQUE INDEX delivery_fee_plan_one_active_uq ON public.delivery_fee_plan (is_active)
    WHERE is_active = true;

CREATE TABLE public.delivery_ring_price (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id      uuid NOT NULL REFERENCES public.delivery_fee_plan (id) ON DELETE CASCADE,
    ring_id      uuid NOT NULL REFERENCES public.delivery_ring (id) ON DELETE RESTRICT,
    price_amount numeric(12,2) NOT NULL CHECK (price_amount >= 0),   -- the distance slab value
    CONSTRAINT delivery_ring_price_uq UNIQUE (plan_id, ring_id)
);
CREATE INDEX delivery_ring_price_plan_idx ON public.delivery_ring_price (plan_id);

CREATE TABLE public.delivery_weight_band (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id     uuid NOT NULL REFERENCES public.delivery_fee_plan (id) ON DELETE CASCADE,
    upper_grams int NOT NULL CHECK (upper_grams > 0),                -- upper-bound band
    add_amount  numeric(12,2) NOT NULL CHECK (add_amount >= 0),      -- the weight slab value
    CONSTRAINT delivery_weight_band_uq UNIQUE (plan_id, upper_grams)
);
CREATE INDEX delivery_weight_band_plan_idx ON public.delivery_weight_band (plan_id, upper_grams);
```

- **Fee** = `clamp( roundUp( factor × (ring_price + weight_add), step ), floor, cap )` (R3).
- **Upper-bound weight bands**, matched by *smallest `upper_grams ≥ package_grams`*; a package heavier than
  the top band takes the **top band** (a pure-engine rule — the schema cannot express "and beyond", and a
  `99999` sentinel would put a magic number in operator data). Storing only the upper bound makes a **gap
  unrepresentable** (FR-028).
- ⚠ **Activation gate (FR-051), a service rule, not a CHECK** (it spans rows): a plan may be activated only
  if **every `active` ring has a `delivery_ring_price`** and **at least one weight band** exists. A hole
  would let a served zone answer "no price" — the anti-pattern the rebuild exists to kill. Refused with the
  gap named.
- **`is_active` partial-unique** makes two active plans **unrepresentable** — the FR-048 guarantee in the
  DB, surviving a concurrent activate.

---

## 6. Same-day exceptions — `public.shop_sameday_exception` (NEW, back-office only)

```sql
CREATE TABLE public.shop_sameday_exception (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id    uuid NOT NULL REFERENCES public.shop (id) ON DELETE CASCADE,
    zone_id    uuid NOT NULL REFERENCES public.delivery_zone (id) ON DELETE CASCADE,
    mode       text NOT NULL CHECK (mode IN ('on','off')),   -- on = force-enable, off = force-disable
    updated_by text NOT NULL,                                -- ⚠ back-office admin only (FR-045/046)
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT shop_sameday_exception_uq UNIQUE (shop_id, zone_id)   -- one exception per pair
);
CREATE INDEX shop_sameday_exception_shop_idx ON public.shop_sameday_exception (shop_id);
CREATE INDEX shop_sameday_exception_zone_idx ON public.shop_sameday_exception (zone_id);
```

- **Effective rule**: `sameday_offered(shop,zone) = exception ? mode='on' : zone.sameday_eligible` (R5).
  Whole 032 propose/approve lifecycle **deleted** — no `pending`/`approved`/`revoked`/`superseded`, no
  in-force uniques, no distance-in-approval screen.
- ⚠ **`updated_by` is NOT NULL** — attribution is required (FR-046) and "nobody knows who" must not be
  representable. There is no shop-facing write path to this table (FR-045).

---

## 7. Product weight (ALTER)

```sql
ALTER TABLE public.product
    ADD COLUMN weight_grams      int     NOT NULL DEFAULT 500 CHECK (weight_grams > 0),  -- ⚠ >0 not >=0
    ADD COLUMN weight_is_assumed boolean NOT NULL DEFAULT true;

-- Backfill measured weights from the existing catalogue attribute (016 EAV). ⚠ Assert the row count.
UPDATE public.product p
   SET weight_grams = v.value_number::int, weight_is_assumed = false
  FROM public.product_attribute_value v
  JOIN public.attribute_definition d ON d.id = v.attribute_definition_id
 WHERE v.product_id = p.id AND d.key = 'net_weight' AND v.value_number > 0;
```

- ⚠ **`> 0`**: a zero-weight product is free-delivery-by-arithmetic (FR-053). Default 500 g + `assumed =
  true` is the only honest backfill (FR-037-equivalent); rows with a real `net_weight` become `assumed =
  false`. ⚠ **If the measured-row count is 0 or all rows, stop** — the attribute key/column is wrong and
  the migration silently updated nothing (032 R-note). `net_weight` (the catalogue "500 g pack" fact) is
  left in place; the new column is the logistics fact and may legitimately differ (packaging weighs).

---

## 8. Per-order delivery capture (ALTER + NEW)

```sql
ALTER TABLE public."order"
    ADD COLUMN delivery_fee_amount        numeric(12,2) CHECK (delivery_fee_amount >= 0),  -- SUM of packages
    ADD COLUMN delivery_quote             jsonb,           -- what the shopper was shown (FR-036)
    ADD COLUMN delivery_quote_expires_at  timestamptz;     -- intent honours captured fees while now() < this

CREATE TABLE public.order_package_delivery (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id            uuid NOT NULL REFERENCES public."order" (id) ON DELETE CASCADE,
    shop_id             uuid NOT NULL REFERENCES public.shop (id) ON DELETE RESTRICT,
    method              text NOT NULL CHECK (method IN ('same_day','standard')),
    delivery_fee_amount numeric(12,2) NOT NULL CHECK (delivery_fee_amount >= 0),
    promised_from       date,        -- delivery window (same_day: today; standard: +N working days)
    promised_to         date,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT order_package_delivery_uq UNIQUE (order_id, shop_id)
);
CREATE INDEX order_package_delivery_order_idx ON public.order_package_delivery (order_id);

ALTER TABLE public.shop_fulfillment
    ADD COLUMN delivery_method     text CHECK (delivery_method IN ('same_day','standard')),
    ADD COLUMN delivery_fee_amount numeric(12,2) CHECK (delivery_fee_amount >= 0),  -- never shown to the shop
    ADD COLUMN promised_ready_at   timestamptz;   -- 020 queue orders by this when present
```

- Lifecycle mirrors `order_item` (delete+reinsert per intent call; copied into `shop_fulfillment` inside
  the 019 finalize transaction). The **client never sends a fee** — intent validates against
  `order.delivery_quote` and uses **its** captured fee (FR-036/R11).
- Two methods only (`same_day`,`standard`) — the withdrawn `scheduled` is not reintroduced.

---

## Read paths

**Public serviceability** (hot, cacheable): `postcode → EXISTS(delivery_zone_postcode JOIN delivery_zone
active)`. One boolean. Shared as a SQL const with the quote (FR-004).

**Locality typeahead** (hot, cacheable): `lower(name) LIKE $1||'%'` (or `postcode = $1`), `LIMIT 8`,
ordered `name,state,postcode`; never ordered by serviceability (030 R5).

**Quote** (hot, transactional) — one wave-parallel block (R13), then the pure engine:
1. active plan + its `delivery_ring_price` + `delivery_weight_band`;
2. destination `postcode → delivery_zone` (ring_id, sameday_eligible, active?);
3. `shop_sameday_exception` for the fulfilling shops × that zone;
4. cart lines' `product.weight_grams` (already joined for pricing);
5. `delivery_collection_run` (active) + `delivery_settings.sameday_prep_buffer_min` for the cutoff.
The customer response carries **no distance, no ring name, no shop identity** — per-package `{method, fee}`
and a window only.

---

## Invariants worth restating

1. **Serviced ⇔ postcode in one active zone.** One predicate, one refusal. *(FR-001/002; R9)*
2. **A served zone always prices** — the engine is total over served zones; activation refuses gaps. *(FR-029/051)*
3. **A postcode is in at most one zone**, by `UNIQUE`. *(FR-009)*
4. **Exactly one active fee plan**, by partial-unique. *(FR-048)*
5. **a ≥ b**, by CHECK on the plan. *(FR-022)*
6. **cap & floor are multiples of the step**, by CHECK — every fee lands on the grid, incl. a capped one. *(SC-005)*
7. **Weight past the last band takes the last band**, a pure-engine rule — never no fee, never a sentinel row. *(FR-028)*
8. **No product is weightless** (`>0`); measured vs assumed is explicit. *(FR-053/055)*
9. **The same-day cutoff is derived from the collection schedule**, never stored — it cannot drift. *(R6)*
10. **Same-day = zone flag ± per-shop exception**, back-office only, no workflow. *(FR-043/045)*
11. **No distance, ring name, or shop identity in any customer DTO.** *(FR-018/033; SC-007)*
12. **A quoted order keeps its fee** — captured in `order.delivery_quote`; the client never sends a fee. *(FR-036)*
13. **Shop location is not used** — the fee is destination-ring based (R2). *(SC-017)*

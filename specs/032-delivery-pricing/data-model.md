# Data Model: Delivery Pricing & Same-Day Coverage (032)

**One forward-only migration**: `<ts>_delivery_pricing.sql`.

House style (007/009/019/027/028/029/030/031): `text` CHECK enums, no native PG enums, no triggers,
`COMMENT ON` everything, `numeric(12,2)` for money.

---

## Overview

| Object | Change | Serves |
|---|---|---|
| `public.locality` | **+2 columns** — latitude, longitude | FR-035 |
| `public.postcode_centroid` | **NEW** | FR-039, FR-038 |
| `public.product` | **+2 columns** — weight, assumed flag | FR-036, FR-037 |
| `public.delivery_pricing_rule` | **NEW** | FR-001..FR-007, FR-012 |
| `public.delivery_price_band` | **NEW** | FR-004, FR-011 |
| `public.shop_sameday_declaration` | **NEW** | FR-014..FR-021 |
| `public.shop_sameday_area` | **NEW** | FR-015, FR-016 |
| `public.delivery_offering` | **rows removed** (same-day only) | R3 |
| `admin.audit_log` | reused, unchanged | FR-013, FR-026 |

---

## 1. Places gain a location (FR-035)

```sql
ALTER TABLE public.locality
    ADD COLUMN latitude  numeric(9, 6),
    ADD COLUMN longitude numeric(9, 6);
```

⚠ **Nullable, deliberately.** G-NAF's `LOCALITY_POINT` does not cover every locality row; a `NOT NULL`
here would make the loader fail on real data and tempt someone to invent a coordinate. A locality with
no point simply does not contribute to its postcode's centroid.

`numeric(9,6)` — six decimal places is ~0.1 m, far finer than a locality centroid deserves, and exact
rather than `double precision` so a re-load produces byte-identical rows (030's idempotence property).

### `public.postcode_centroid` — the distance basis (FR-039)

```sql
CREATE TABLE public.postcode_centroid (
    postcode      text PRIMARY KEY CHECK (postcode ~ '^[0-9]{4}$'),
    latitude      numeric(9, 6) NOT NULL,
    longitude     numeric(9, 6) NOT NULL,
    locality_count int NOT NULL CHECK (locality_count > 0),
    computed_at   timestamptz NOT NULL DEFAULT now()
);
```

⚠ **A derived table, not a view.** A view would recompute a mean over ~15,400 rows on **every quote**,
inside the checkout path where 029 measured a 135 ms round trip. It is written by the loader in the same
transaction as the localities, so it cannot drift.

⚠ **`locality_count` is not decoration.** It is the honesty column: **0872 spans NT, SA and WA**, and its
count reveals a centroid computed over places thousands of kilometres apart. FR-039 requires the basis be
stated; this is where an operator can see it.

⚠ **A postcode absent from this table has no distance.** It is **not** distance zero — the pricing core
must receive "unknown" and apply the furthest band (R5). Modelling that as a missing row rather than a
`0.0` is the whole point: 021's `delivery_fee_amount` defaulting quietly is the defect class this avoids.

---

## 2. Products gain a weight (FR-036/FR-037)

```sql
ALTER TABLE public.product
    ADD COLUMN weight_grams      int NOT NULL DEFAULT 500 CHECK (weight_grams > 0),
    ADD COLUMN weight_is_assumed boolean NOT NULL DEFAULT true;
```

⚠ **`> 0`, not `>= 0`.** A zero-weight product is free-delivery-by-arithmetic wearing a different hat —
the FR-011 defect class applied to the other axis.

⚠ **`DEFAULT 500` with `weight_is_assumed = true` is the only honest backfill.** Every existing row gets
a stated assumption. Rows with a real `net_weight` attribute are then corrected in the same migration:

```sql
UPDATE public.product p
SET weight_grams = v.value_number::int, weight_is_assumed = false
FROM public.product_attribute_value v
JOIN public.attribute_definition d ON d.id = v.attribute_definition_id
WHERE v.product_id = p.id AND d.key = 'net_weight' AND v.value_number > 0;
```

⚠ **The column is `value_number` and the key column is `key`** — 016's EAV uses `value_text /
value_number / value_boolean / value_options` against `attribute_definition.key`. Naming either wrong
produces a migration that **runs clean and updates nothing**, leaving all 38 products assumed while the
migration reports success. This is why the row count below is an assertion, not a note.

Expected: **14 of 38** rows become `weight_is_assumed = false`. ⚠ **If that number comes back as 38 or
as 0, stop** — the attribute code or the column name is wrong, and a silent 0 would leave every product
assumed while looking successful.

⚠ **`net_weight` stays where it is.** It is a *catalog* fact a shopper reads ("500 g pack"); the new
column is a *logistics* fact. They agree today by backfill and may legitimately diverge (packaging
weighs something). Deleting the attribute would remove information from the product page.

---

## 3. Pricing rules (FR-001..FR-007, FR-012)

```sql
CREATE TABLE public.delivery_pricing_rule (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    method         text NOT NULL CHECK (method IN ('same_day', 'scheduled', 'standard')),
    base_amount    numeric(12, 2) NOT NULL CHECK (base_amount >= 0),
    rounding_step  numeric(12, 2) NOT NULL DEFAULT 0.50 CHECK (rounding_step > 0),
    max_amount     numeric(12, 2) NOT NULL CHECK (max_amount > 0),
    status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    updated_by     text NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT delivery_pricing_rule_method_uq UNIQUE (method),
    -- ⚠ A cap that is not a multiple of the rounding step produces an UNROUNDED fee at exactly the
    -- moment the cap binds — min(45.33, roundUp(...)) = 45.33 — silently breaking SC-003 only on the
    -- most expensive orders, where it is least likely to be noticed.
    CONSTRAINT delivery_pricing_rule_cap_rounded_ck CHECK (mod(max_amount, rounding_step) = 0)
);
```

**One rule per method** (FR-007) — same-day may cost more than standard at the same distance and weight.

⚠ **`max_amount` is `NOT NULL`.** A nullable ceiling means "unbounded" is expressible by omission, and
FR-012 exists because bands add: a heavy basket to a remote postcode otherwise produces a number nobody
chose. Making it required forces the decision.

⚠ **`updated_by` is `NOT NULL`** — FR-013/SC-014 require attribution, and a nullable column makes
"nobody knows who" a representable state.

### `public.delivery_price_band`

```sql
CREATE TABLE public.delivery_price_band (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id      uuid NOT NULL REFERENCES public.delivery_pricing_rule (id) ON DELETE CASCADE,
    dimension    text NOT NULL CHECK (dimension IN ('distance', 'weight')),
    upper_bound  numeric(10, 2) NOT NULL CHECK (upper_bound > 0),  -- km, or kg
    add_amount   numeric(12, 2) NOT NULL CHECK (add_amount >= 0),
    CONSTRAINT delivery_price_band_uq UNIQUE (rule_id, dimension, upper_bound)
);
CREATE INDEX delivery_price_band_rule_idx ON public.delivery_price_band (rule_id, dimension, upper_bound);
```

**Upper-bound bands, matched by "smallest `upper_bound >= value`"** — so `[0,5) → 5`, `[5,15) → 15`.
⚠ Storing both bounds would allow a gap between two rows to be *representable*, and FR-011 exists
precisely because a gap must never mean "no fee".

⚠ **A value above every band takes the last band, not nothing** (R5). That is a rule of the pure pricing
core, not of the schema — the schema cannot express "and beyond", and pretending otherwise with a
sentinel row (`upper_bound = 99999`) would put a magic number in operator-editable data.

⚠ **`dimension` in one table rather than two.** Two tables would double the CRUD, the DTOs and the
console for two structurally identical shapes.

**Fee**: `min(max_amount, roundUp(base + distanceBand + weightBand, rounding_step))`.

---

## 4. Same-day declarations (FR-014..FR-021)

```sql
CREATE TABLE public.shop_sameday_declaration (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id       uuid NOT NULL REFERENCES public.shop (id) ON DELETE CASCADE,
    offers_sameday boolean NOT NULL DEFAULT false,
    cutoff_time   time,
    status        text NOT NULL CHECK (status IN ('pending', 'approved', 'declined', 'revoked', 'superseded')),
    submitted_by  text NOT NULL,
    submitted_at  timestamptz NOT NULL DEFAULT now(),
    decided_by    text,
    decided_at    timestamptz,
    decision_note text,
    supersedes_id uuid REFERENCES public.shop_sameday_declaration (id) ON DELETE SET NULL
);
CREATE INDEX shop_sameday_declaration_shop_idx ON public.shop_sameday_declaration (shop_id, status);
```

⚠ **Append-only versions, not a mutable row.** This is the single most important shape in the feature.
FR-018 requires an approved declaration to **stay in force while a change is pending**; a status column
on one row cannot hold both, so an edit would silently revoke a live approval — a shop changing a cutoff
would stop its own same-day service and nothing would report it.

**Two partial uniques enforce it:**

```sql
CREATE UNIQUE INDEX shop_sameday_one_in_force_uq ON public.shop_sameday_declaration (shop_id)
    WHERE status = 'approved';
CREATE UNIQUE INDEX shop_sameday_one_pending_uq ON public.shop_sameday_declaration (shop_id)
    WHERE status = 'pending';
```

⚠ **These are the FR-017/FR-018 guarantee, in the database rather than in a service.** Two in-force
declarations for one shop would make "is this area approved?" ambiguous, and no application check
survives a concurrent submit.

**States**: `pending` → `approved` | `declined`; `approved` → `revoked` (FR-025) **or** `superseded`.

⚠ **`revoked` and `superseded` are different facts and must not share a value.** An admin withdrawing a
shop's same-day service and a shop's own newer declaration being approved both end an approval — but a
shop reading its history needs to tell "they took this away from us" from "our update went live". This
document argues two paragraphs above that fusing two meanings into one value costs weeks; an earlier
draft then did exactly that by routing both through `revoked`.

⚠ **`superseded` is set by the platform, `revoked` by a person.** That is also why `revoked` requires a
`decision_note` at the service layer and `superseded` does not — there is no human to explain.

⚠ **`decided_by` is nullable only while `pending`.** Enforced:

```sql
CONSTRAINT shop_sameday_decided_ck CHECK (
    (status = 'pending'  AND decided_by IS NULL AND decided_at IS NULL)
 OR (status <> 'pending' AND decided_by IS NOT NULL AND decided_at IS NOT NULL))
```

⚠ **A same-day declaration must carry a cutoff** (FR-030). Without this, `offers_sameday = true` with
`cutoff_time = NULL` makes the withdrawal rule undecidable — the quote would have to choose between
"never withdraw" and "never offer", and both are wrong:

```sql
CONSTRAINT shop_sameday_cutoff_ck CHECK (
    (offers_sameday = true  AND cutoff_time IS NOT NULL)
 OR (offers_sameday = false AND cutoff_time IS NULL))
```

⚠ **`time` carries no timezone, and that is a decision, not an oversight.** A cutoff is a wall-clock
fact about a shop's working day — "we stop packing at 2pm" — not an instant. It is evaluated in
**`Australia/Melbourne`**, the platform's operating timezone, and **never** against the shopper's device
clock or UTC. ⚠ The comparison site must convert explicitly; `time.Now()` on a UTC container would put
the cutoff 10 or 11 hours wrong depending on daylight saving, and the error would appear only in the
evening and only in summer.

This makes an undecided-but-decided row **unrepresentable** — the same technique 028 used to make an
advertised-but-untitled promotion impossible. SC-014 then holds by construction.

⚠ **FR-020 (a shop with no location cannot declare) is NOT a CHECK.** It depends on
`public.shop.postcode` on another row; a CHECK cannot see it and a trigger is against house style. It is
a service-layer refusal with a **distinguishable** error, and it must be tested — see contracts.

### `public.shop_sameday_area`

```sql
CREATE TABLE public.shop_sameday_area (
    declaration_id uuid NOT NULL REFERENCES public.shop_sameday_declaration (id) ON DELETE CASCADE,
    postcode       text NOT NULL CHECK (postcode ~ '^[0-9]{4}$'),
    PRIMARY KEY (declaration_id, postcode)
);
```

⚠ **Keyed on postcode, not locality id** — because serviceability is postcode-decided **everywhere**
(031 R2). A shop picks *"Alfredton"* by name (FR-016) and the platform records **3350**, which is all
twenty Ballarat localities. That is 031's disclosure obligation recurring on a second surface: the shop
console must say so, or a shop will believe it made a narrow commitment.

⚠ **No FK to `locality`.** A postcode is not a locality, and a postcode can legitimately have no locality
row (031's 3001 case). An FK would refuse the very rows the health surface exists to report.

---

## 5. What is removed

```sql
DELETE FROM public.delivery_offering WHERE method = 'same_day';

ALTER TABLE public.delivery_offering
    DROP COLUMN price_amount,
    DROP COLUMN same_day_cutoff;
```

⚠ **Dead rows AND dead columns.** `delivery_offering` survives — `standard` and `scheduled` still need a
window, a lead time and an on/off per leg, and none of that is derivable from distance bands. What does
not survive is anything the rules now own:

- **the same-day rows** — the old eligibility predicate this feature replaces (FR-029);
- **`price_amount`** — ⚠ leaving it would give the platform **two live sources for a standard-delivery
  fee**, with nothing choosing between them. That is the defect class this whole feature exists to
  remove, reintroduced by the feature removing it. Dropped rather than deprecated, so it **cannot** be
  read by a query someone writes next year;
- **`same_day_cutoff`** — the cutoff moves onto the shop's declaration, where it belongs: it describes
  the shop's working day, not a zone pair.

⚠ **Dropping `price_amount` loses no history.** `order_package_delivery.delivery_fee_amount` records
what each order was actually quoted (FR-010); the grid held configuration, not records.

⚠ **Irreversible in the Down direction, and the Down comment must say so plainly** — the deleted rows
and dropped values cannot be reconstructed.

⚠ **This leaves 031's read-only rate grid showing no rates.** It must be relabelled to what it now
displays — service windows — or removed. A screen called "Rates" that lists none is how the next reader
concludes the feature half-landed.

---

## Read paths

**Quoting (hot, per checkout call)** — one query per shape, not per package:

1. shop → `postcode` → `postcode_centroid` (origin points, all shops in the cart)
2. destination `postcode` → `postcode_centroid` (one point)
3. `shop_sameday_declaration` + `shop_sameday_area` `WHERE status='approved'` (approved pairs)
4. `delivery_pricing_rule` + `delivery_price_band` (all rules — three rows and their bands)
5. cart lines → `product.weight_grams` (already joined for pricing)

⚠ **Wave-parallel like 029's Home fix**, not eight serial round trips. 029 measured 8 serial queries at
1.08 s of pure latency against Sydney RDS and 503'd the storefront; the same mistake in checkout would be
worse.

**The customer response gains no field.** ⚠ FR-034: distance is computed, used, and discarded — it never
enters a DTO a shopper can receive. R7 records why that matters and how 021 got it wrong in the mirror
direction.

---

## Invariants worth restating

1. A postcode with no centroid is **furthest band**, never zero distance. *(FR-038)*
2. A product with no real weight is **assumed and flagged**, never weightless. *(FR-037)*
3. A distance or weight past the last band takes the **last band**, never no fee. *(FR-011)*
4. At most **one approved** and at most **one pending** declaration per shop. *(FR-018)*
5. A decided declaration **names its decider**, by CHECK. *(FR-026/SC-014)*
6. A same-day declaration **has a cutoff**, by CHECK. *(FR-030)*
7. A cap is a **multiple of the rounding step**, by CHECK. *(SC-003)*
8. `revoked` (a person acted) and `superseded` (a newer version was approved) are **distinct**. *(FR-025)*
9. No table here is reachable from any customer-facing read. *(FR-033)*
10. ⚠ There is **exactly one** source for a delivery fee — the rules. `delivery_offering.price_amount`
    is dropped, not deprecated. *(R3a)*

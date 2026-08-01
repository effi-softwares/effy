-- +goose Up
-- 032-delivery-pricing — Delivery Pricing & Same-Day Coverage.
--
-- Two concerns this migration keeps deliberately apart (research R3):
--   PRICE is the platform's, derived from banded distance + banded weight. No shop can set it.
--   SAME-DAY ELIGIBILITY is per SHOP: the shop declares, an admin approves.
--
-- ⚠ 031 collapsed the origin dimension, arguing a shopper cannot perceive which shop serves them.
-- That is true for PRICE and false for ELIGIBILITY — whether same-day is physically possible depends
-- entirely on which shop holds the goods. The live proof: zone REGIONAL let same-day to Ballarat be
-- enabled because a shop in Bendigo shares the zone, 98 km away, essentially as far as Melbourne.
--
-- ⚠ THIS MIGRATION DELIBERATELY DOES NOT REMOVE THE OLD SAME-DAY ROWS. See section 5.
--
-- House style (007/009/019/027/028/029/030/031): text CHECK enums, no native PG enums, no triggers,
-- COMMENT ON everything, numeric(12,2) for money.

-- ── 1. Places gain a location (FR-035) ────────────────────────────────────────────────────────
--
-- ⚠ The coordinates were ALWAYS in the G-NAF download 030 used; that derivation read three columns
-- and discarded the rest. 031's research then asserted "the platform has no routing or distance
-- capability" and built a zone-membership proxy on that premise. The premise was false.

ALTER TABLE public.locality
    ADD COLUMN latitude  numeric(9, 6),
    ADD COLUMN longitude numeric(9, 6);

COMMENT ON COLUMN public.locality.latitude IS 'Locality point from G-NAF LOCALITY_POINT (032). NULLABLE BY DESIGN: G-NAF does not carry a point for every locality, and NOT NULL here would make the loader fail on real data and tempt someone to invent a coordinate. A locality with no point simply does not contribute to its postcode centroid. numeric(9,6) is exact (not float) so a re-load is byte-identical — 030''s idempotence property.';
COMMENT ON COLUMN public.locality.longitude IS 'See latitude. ⚠ G-NAF lists LONGITUDE FIRST in LOCALITY_POINT_psv.psv; every Australian longitude (96..168) is a plausible-looking number that is not a latitude, so a positional read produces a swapped pair that looks entirely reasonable. Columns are addressed by name and the loader bounds-checks latitude, which is the discriminating axis (nothing here sits above -8).';

CREATE TABLE public.postcode_centroid (
    postcode       text PRIMARY KEY CHECK (postcode ~ '^[0-9]{4}$'),
    latitude       numeric(9, 6) NOT NULL,
    longitude      numeric(9, 6) NOT NULL,
    locality_count int NOT NULL CHECK (locality_count > 0),
    computed_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.postcode_centroid IS 'One representative point per postcode (032) — the basis for every distance the platform computes. DERIVED, not a view: a view would recompute a mean over ~15,400 rows on EVERY QUOTE, inside the checkout path where a Sydney RDS round trip costs ~135ms (029 measured 8 serial queries at 1.08s and 503''d the storefront). Written by cmd/load-localities in the same transaction as public.locality, so the two cannot drift. ⚠ A POSTCODE ABSENT FROM THIS TABLE HAS NO DISTANCE — it is NOT distance zero. The pricing core must receive "unknown" and apply the FURTHEST band (FR-038); modelling that as a missing row rather than a 0.0 is the whole point.';
COMMENT ON COLUMN public.postcode_centroid.locality_count IS 'How many localities were averaged. ⚠ THE HONESTY COLUMN, not decoration: postcode 0872 spans NT, SA and WA, so its centroid is a point in the desert hundreds of kilometres from most of what it covers. FR-039 requires the distance basis to be STATED rather than assumed; this is where an operator can see that a centroid is meaningless for a given postcode. A remote-area postcode is not a same-day candidate under any model.';

-- ── 2. Products gain a weight (FR-036/FR-037/FR-037a) ─────────────────────────────────────────
--
-- ⚠ This half is CATALOG work, not delivery work, and it is the largest hidden cost in the slice.
-- Weight is currently an EAV attribute (attribute_definition.key = 'net_weight', unit 'g') required
-- only for the packaged_grocery category. Pricing from that attribute would treat every product
-- without one as WEIGHTLESS — the FR-011 defect class, where a missing value quietly means free.

ALTER TABLE public.product
    ADD COLUMN weight_grams      int     NOT NULL DEFAULT 500 CHECK (weight_grams > 0),
    ADD COLUMN weight_is_assumed boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.product.weight_grams IS 'Shipping weight in grams (032). ⚠ CHECK IS > 0, NOT >= 0: a zero-weight product is free-delivery-by-arithmetic, the same defect as a missing pricing band meaning no fee. The 500g default is a STATED ASSUMPTION, flagged by weight_is_assumed — never a measurement. This is a LOGISTICS fact and is deliberately separate from the net_weight catalog attribute a shopper reads on the product page ("500 g pack"); they agree by backfill today and may legitimately diverge, because packaging weighs something.';
COMMENT ON COLUMN public.product.weight_is_assumed IS 'TRUE = nobody has recorded a real weight; the default is in use. FALSE = an operator measured it. ⚠ WITHOUT THIS FLAG, "500 g" means BOTH "we weighed it" AND "nobody has said", and no one can tell which products still need attention — the exact ambiguity 031''s decision record exists to remove, on a different axis. Set to false only by the act of recording a weight (FR-036a); never accepted from a client.';

-- ⚠ Backfill from the EXISTING attribute. The column names are load-bearing: 016's EAV uses
-- `attribute_definition.key` (NOT `code`) and `product_attribute_value.value_number` (NOT
-- `value_numeric`). Either wrong name produces a migration that RUNS CLEAN AND UPDATES NOTHING,
-- leaving every product assumed while the migration reports success.
--
-- ⚠ Verify after applying (quickstart §1):
--     SELECT weight_is_assumed, count(*) FROM public.product GROUP BY 1;
-- `false | 0`  => the join matched nothing (wrong column name) — every product silently assumed.
-- `false | N`  where N = every product => the WHERE clause is not filtering.
UPDATE public.product p
SET weight_grams      = GREATEST(1, round(v.value_number)::int),
    weight_is_assumed = false
FROM public.product_attribute_value v
JOIN public.attribute_definition d ON d.id = v.attribute_definition_id
WHERE v.product_id = p.id
  AND d.key = 'net_weight'
  AND v.value_number IS NOT NULL
  AND v.value_number > 0;

-- ── 3. Pricing rules (FR-001..FR-007, FR-012, FR-013) ─────────────────────────────────────────

CREATE TABLE public.delivery_pricing_rule (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    method        text NOT NULL CHECK (method IN ('same_day', 'scheduled', 'standard')),
    base_amount   numeric(12, 2) NOT NULL CHECK (base_amount >= 0),
    rounding_step numeric(12, 2) NOT NULL DEFAULT 0.50 CHECK (rounding_step > 0),
    max_amount    numeric(12, 2) NOT NULL CHECK (max_amount > 0),
    status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    updated_by    text NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT delivery_pricing_rule_method_uq UNIQUE (method),
    -- ⚠ A cap that is not a multiple of the rounding step produces an UNROUNDED fee at exactly the
    -- moment the cap binds: min(45.33, roundUp(...)) = 45.33. It would break SC-003 only on the most
    -- expensive orders — where it is least likely to be noticed.
    CONSTRAINT delivery_pricing_rule_cap_rounded_ck CHECK (mod(max_amount, rounding_step) = 0)
);

COMMENT ON TABLE public.delivery_pricing_rule IS 'How one delivery method is priced (032). Exactly one rule per method — same-day may legitimately cost more than standard at the same distance and weight (FR-007). ⚠ Replaces delivery_offering.price_amount as the SINGLE source of a delivery fee; two sources for one answer is the defect class this feature exists to remove.';
COMMENT ON COLUMN public.delivery_pricing_rule.rounding_step IS 'Every computed fee is rounded UP to a multiple of this. ⚠ UPWARD, NEVER NEAREST (FR-005): rounding to nearest means the platform silently absorbs the difference on roughly half of all orders — a revenue decision disguised as a formatting choice.';
COMMENT ON COLUMN public.delivery_pricing_rule.max_amount IS 'The ceiling (FR-012). ⚠ NOT NULL: a nullable cap makes "unbounded" expressible by omission, and bands ADD — a heavy basket to a remote postcode otherwise produces a number nobody chose. Required so the decision is made rather than defaulted.';
COMMENT ON COLUMN public.delivery_pricing_rule.updated_by IS 'Who last changed this. ⚠ NOT NULL — FR-013/SC-014 require attribution, and a nullable column makes "nobody knows who changed the price of delivery" a representable state.';

CREATE TABLE public.delivery_price_band (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id     uuid NOT NULL REFERENCES public.delivery_pricing_rule (id) ON DELETE CASCADE,
    dimension   text NOT NULL CHECK (dimension IN ('distance', 'weight')),
    upper_bound numeric(10, 2) NOT NULL CHECK (upper_bound > 0),
    add_amount  numeric(12, 2) NOT NULL CHECK (add_amount >= 0),
    CONSTRAINT delivery_price_band_uq UNIQUE (rule_id, dimension, upper_bound)
);

COMMENT ON TABLE public.delivery_price_band IS 'One band of a pricing rule (032). BANDS, not a continuous formula (FR-004), for two independent reasons: a shopper moving one street further must not see a different fee; and a band spanning many kilometres covers many possible origins, which is what stops a distance-derived fee resolving to a single shop (FR-033a). ⚠ Band width is therefore a PRIVACY parameter, not only a pricing one.';
COMMENT ON COLUMN public.delivery_price_band.upper_bound IS 'Kilometres (dimension=distance) or kilograms (dimension=weight). Matched by "smallest upper_bound >= value". ⚠ UPPER BOUND ONLY: storing both bounds would make a GAP between two rows representable, and FR-011 exists precisely because a gap must never mean "no fee". A value above every band takes the LAST band — a rule of the pricing core, not of this schema, because a sentinel row (upper_bound = 99999) would put a magic number into operator-editable data.';
COMMENT ON COLUMN public.delivery_price_band.dimension IS 'Which axis this band measures. One table with a discriminator rather than two tables: two structurally identical shapes would mean double the CRUD, the DTOs and the console.';

CREATE INDEX delivery_price_band_rule_idx ON public.delivery_price_band (rule_id, dimension, upper_bound);

-- ── 4. Same-day declarations (FR-014..FR-021, FR-025..FR-027, FR-030) ─────────────────────────

CREATE TABLE public.shop_sameday_declaration (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id        uuid NOT NULL REFERENCES public.shop (id) ON DELETE CASCADE,
    offers_sameday boolean NOT NULL DEFAULT false,
    cutoff_time    time,
    status         text NOT NULL CHECK (status IN ('pending', 'approved', 'declined', 'revoked', 'superseded')),
    submitted_by   text NOT NULL,
    submitted_at   timestamptz NOT NULL DEFAULT now(),
    decided_by     text,
    decided_at     timestamptz,
    decision_note  text,
    supersedes_id  uuid REFERENCES public.shop_sameday_declaration (id) ON DELETE SET NULL,

    -- ⚠ An undecided-but-decided row is UNREPRESENTABLE, so SC-014 holds by construction. Same
    -- technique 028 used to make an advertised-but-untitled promotion impossible.
    CONSTRAINT shop_sameday_decided_ck CHECK (
        (status =  'pending' AND decided_by IS NULL     AND decided_at IS NULL)
     OR (status <> 'pending' AND decided_by IS NOT NULL AND decided_at IS NOT NULL)),

    -- ⚠ "Same-day, no cutoff" is a promise nobody can keep, and it makes FR-030's withdrawal rule
    -- UNDECIDABLE — the quote would have to choose between "never withdraw" and "never offer", and
    -- both are wrong.
    CONSTRAINT shop_sameday_cutoff_ck CHECK (
        (offers_sameday = true  AND cutoff_time IS NOT NULL)
     OR (offers_sameday = false AND cutoff_time IS NULL))
);

COMMENT ON TABLE public.shop_sameday_declaration IS 'A shop''s statement of whether it offers same-day and to which areas (032). APPEND-ONLY VERSIONS, not a mutable row — this is the single most important shape in the feature. FR-018 requires an approved declaration to STAY IN FORCE while a change is pending; a status column on one row cannot hold both, so an edit would silently revoke a live approval and a shop changing its cutoff would stop its own same-day service with nothing reporting it.';
COMMENT ON COLUMN public.shop_sameday_declaration.status IS 'pending -> approved | declined; approved -> revoked (an admin withdrew it) or superseded (this shop''s newer declaration was approved). ⚠ revoked AND superseded ARE DIFFERENT FACTS AND MUST NOT SHARE A VALUE: a shop reading its history needs to tell "they took this away from us" from "our update went live". superseded is set by the platform and carries no note; revoked is set by a person and requires one.';
COMMENT ON COLUMN public.shop_sameday_declaration.cutoff_time IS 'Wall-clock cutoff in Australia/Melbourne — the platform''s operating timezone. ⚠ NOT the shopper''s device clock and NOT UTC: `time` carries no zone, and evaluating this against a UTC container clock puts the cutoff 10 or 11 hours wrong depending on daylight saving, with the fault appearing only in the evening and only in summer.';
COMMENT ON COLUMN public.shop_sameday_declaration.supersedes_id IS 'The declaration this one replaced when it was approved. Makes the version chain readable without inferring it from timestamps.';

-- ⚠ THESE TWO INDEXES ARE THE FR-017/FR-018 GUARANTEE, IN THE DATABASE RATHER THAN IN A SERVICE.
-- Two in-force declarations for one shop would make "is this area approved?" ambiguous, and no
-- application-level check survives a concurrent submit.
CREATE UNIQUE INDEX shop_sameday_one_in_force_uq ON public.shop_sameday_declaration (shop_id)
    WHERE status = 'approved';
CREATE UNIQUE INDEX shop_sameday_one_pending_uq ON public.shop_sameday_declaration (shop_id)
    WHERE status = 'pending';

CREATE INDEX shop_sameday_declaration_shop_idx ON public.shop_sameday_declaration (shop_id, status);

CREATE TABLE public.shop_sameday_area (
    declaration_id uuid NOT NULL REFERENCES public.shop_sameday_declaration (id) ON DELETE CASCADE,
    postcode       text NOT NULL CHECK (postcode ~ '^[0-9]{4}$'),
    PRIMARY KEY (declaration_id, postcode)
);

COMMENT ON TABLE public.shop_sameday_area IS 'One area a shop will serve same-day (032). ⚠ KEYED ON POSTCODE, NOT LOCALITY ID, because serviceability is postcode-decided EVERYWHERE on this platform (031 R2). A shop picks "Alfredton" by name (FR-016) and the platform records 3350 — which is all TWENTY Ballarat localities. That is 031''s disclosure obligation recurring on a second surface: the shop console must say so before confirming, or a shop believes it made a narrow commitment when it made a broad one. ⚠ NO FK TO public.locality: a postcode is not a locality, and a postcode can legitimately have no locality row (031''s live 3001 case, Melbourne''s PO-box code) — an FK would refuse exactly the rows a health surface exists to report.';

-- ── 5. What this migration deliberately does NOT do ───────────────────────────────────────────
--
-- ⚠ IT DOES NOT DELETE delivery_offering's same_day ROWS, AND DOES NOT DROP price_amount.
--
-- Both removals belong to this feature and both are real (research R3a): all three methods are priced
-- by the rules above, and leaving price_amount would give standard delivery two live fee sources with
-- nothing choosing between them. But doing it HERE would withdraw same-day from EVERY SHOPPER for the
-- whole of US1, US2 and US3 — between the delete and the new eligibility predicate landing, the old
-- rule has nothing to read and the new one does not exist yet.
--
-- ⚠ Every test would still pass while that was true.
--
-- The removal is a SECOND migration, applied after the replacement predicate ships. See
-- specs/032-delivery-pricing/tasks.md T094 and research.md R3a.

-- +goose Down
-- ⚠ Down drops the coordinate columns and every 032 table. The locality coordinates are recoverable
-- (re-run `make derive-localities` + `make load-localities`); the pricing rules, the declarations and
-- the approval history are NOT — they are operator decisions, not derived data.
--
-- ⚠ product.weight_grams is also dropped, taking every MEASURED weight with it. Those were entered by
-- hand and cannot be reconstructed from the net_weight attribute, which covers barely a third of the
-- catalogue and means something different.
DROP TABLE IF EXISTS public.shop_sameday_area;
DROP TABLE IF EXISTS public.shop_sameday_declaration;
DROP TABLE IF EXISTS public.delivery_price_band;
DROP TABLE IF EXISTS public.delivery_pricing_rule;
DROP TABLE IF EXISTS public.postcode_centroid;
ALTER TABLE public.product  DROP COLUMN IF EXISTS weight_is_assumed;
ALTER TABLE public.product  DROP COLUMN IF EXISTS weight_grams;
ALTER TABLE public.locality DROP COLUMN IF EXISTS longitude;
ALTER TABLE public.locality DROP COLUMN IF EXISTS latitude;

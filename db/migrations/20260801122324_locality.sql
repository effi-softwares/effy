-- +goose Up
-- 030-delivery-location-suburb: Australian localities, so a shopper can name where they live.
--
-- Feature 025 gave the storefront its up-front "do we deliver to you?" answer, but the only way in was
-- a 4-digit postcode the shopper had to already know. A shopper new to the area, renting, or who
-- simply thinks in suburb names could not answer at all — for that person the store's first
-- interaction was a dead end. This table is what lets them type "Richmond" instead.
--
-- ⚠ COVERS ALL OF AUSTRALIA, NOT ONLY WHERE EFFY DELIVERS (FR-002). A table limited to served areas
-- would be smaller, faster, and would silently collapse "we have never heard of that place" into "we
-- do not deliver there" — the exact conflation the whole delivery-location capability exists to
-- prevent. FR-012 and SC-004 are unenforceable if this rule is ever relaxed.
--
-- ⚠ NO FOREIGN KEY to delivery_zone_postcode, in either direction, deliberately. The two tables share
-- the postcode as a VALUE, not as a relationship: this one holds every postcode that EXISTS, that one
-- holds the postcodes Effy SERVES. A constraint one way breaks FR-002; the other way makes opening a
-- new delivery zone depend on this reference data being current. They meet in exactly one place — the
-- SC-002 coverage test.
--
-- House style (007/009/019/027/028/029): text CHECK enums, no native PG enums, no triggers,
-- COMMENT ON everything. See specs/030-delivery-location-suburb/data-model.md.

CREATE TABLE public.locality (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text NOT NULL,
    state      text NOT NULL CHECK (state IN ('ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA')),
    postcode   text NOT NULL CHECK (postcode ~ '^[0-9]{4}$'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT locality_triple_uq UNIQUE (name, state, postcode)
);

COMMENT ON TABLE public.locality IS 'Australian localities (030). name+state+postcode is the only identifying key: a name recurs across states, a locality spans postcodes, a postcode covers localities. Covers ALL of Australia, NOT only served areas (FR-002) — a served-only table would make "unrecognised place" and "we do not deliver there" indistinguishable, which is the conflation the delivery-location capability exists to prevent. Reference data: loaded by cmd/load-localities, never written by a shopper.';
COMMENT ON COLUMN public.locality.name IS 'The locality name as a shopper would say it, e.g. ''Richmond''. Stored in canonical mixed case and matched case-insensitively — lowercasing it here would mean reconstructing capitalisation at read time, which gets ''McKinnon'' wrong.';
COMMENT ON COLUMN public.locality.state IS 'One of the eight AU states/territories. CHECK-constrained rather than free text: two localities of the same name are distinguished ONLY by state (FR-008), so a typo here would make a place unreachable and no test would notice.';
COMMENT ON COLUMN public.locality.postcode IS 'Exactly four digits — the same canonical form delivery.NormalizePostcode produces, so the SC-002 coverage join against delivery_zone_postcode is a plain equality. ⚠ NT postcodes begin 08xx: any pipeline that treats this as a number turns 0800 into 800 and makes the whole Territory unreachable.';

-- ⚠ text_pattern_ops IS LOAD-BEARING. The lookup is `lower(name) LIKE $1 || '%'`. Under a non-C
-- collation a plain B-tree on name does NOT serve that predicate, and Postgres sequentially scans
-- ~18k rows on every keystroke. The feature would still be correct, every test would still pass, and
-- nothing would report it. See specs/030-delivery-location-suburb/research.md R5.
CREATE INDEX locality_name_prefix_idx ON public.locality (lower(name) text_pattern_ops);
CREATE INDEX locality_postcode_idx ON public.locality (postcode);

-- +goose Down
DROP TABLE IF EXISTS public.locality;

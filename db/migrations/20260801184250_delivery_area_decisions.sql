-- +goose Up
-- 031-delivery-areas: make "deliberately not served" a fact instead of an absence.
--
-- ⚠ THE PROBLEM THIS SOLVES, IN ONE SENTENCE: an area had three possible states and only two were
-- representable.
--
--     configured               →  one or more active delivery_offering rows        ✅ representable
--     deliberately not served  →  AN ABSENT ROW                                    ❌
--     nobody has decided yet   →  AN ABSENT ROW                                    ❌
--
-- delivery_offering's own comment states the rule: "Absence of an active row for a package leg-method
-- = that method (or the package) is undeliverable." One absence, two meanings — and no way to tell
-- which one you are looking at.
--
-- ⚠ THIS IS NOT THEORETICAL. At the time of writing, zone REGIONAL contains 3350 (Ballarat) and 3550
-- (Bendigo) and has ZERO active inbound offerings. So `GET /v1/storefront/serviceability?postcode=3350`
-- answers {"serviced":true} while checkout can quote nothing — the storefront promising a delivery the
-- platform cannot perform. That is 025's FR-014b ("serviceability MUST be decided by the same rules
-- that decide it at checkout, so the two answers can never disagree") violated in DATA rather than in
-- code: every Go test passes and the configuration undoes the rule.
--
-- Nobody can look at that state and say whether REGIONAL was deliberately unpriced or simply never
-- finished. This table is what makes that question answerable.
--
-- ⚠ YOU CANNOT INDEX THE ABSENCE OF A ROW, which is why FR-025 ("an area with no service level MUST be
-- flagged as unconfigured") is unbuildable until the third state is a fact.
--
-- House style (007/009/019/027/028/029/030): text CHECK enums, no native PG enums, no triggers,
-- COMMENT ON everything. See specs/031-delivery-areas/data-model.md.

CREATE TABLE public.delivery_area_decision (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_id    uuid NOT NULL REFERENCES public.delivery_zone (id) ON DELETE CASCADE,
    postcode   text NOT NULL CHECK (postcode ~ '^[0-9]{4}$'),
    -- ⚠ TWO VALUES, NOT THREE. `unconfigured` is deliberately absent: it IS the absence of a row, and
    -- giving it a value would create two ways to say one thing — after which they would disagree.
    decision   text NOT NULL CHECK (decision IN ('served', 'not_served')),
    note       text,
    decided_by text NOT NULL,
    decided_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT delivery_area_decision_uq UNIQUE (zone_id, postcode)
);

COMMENT ON TABLE public.delivery_area_decision IS 'A human decision about one delivery area (031). Exists to make THREE states distinguishable where there were two: decision=served, decision=not_served, and NO ROW = nobody has decided yet. Before this, an unserved area and an unconfigured one were both "no delivery_offering row", which is how REGIONAL came to serve Ballarat and Bendigo with no offerings — the storefront promising delivery that checkout could not quote. ⚠ unconfigured is NOT a value: it is the absence of a row.';
COMMENT ON COLUMN public.delivery_area_decision.postcode IS 'The area. An area IS a postcode (031 research R2) because delivery.ZoneForPostcode — shared by the storefront answer and checkout — resolves postcodes. It is CHOSEN by locality name in the console, which is why the interface must disclose every other place the postcode covers (FR-006).';
COMMENT ON COLUMN public.delivery_area_decision.decision IS 'served | not_served. ⚠ not_served is recorded in the SAME transaction that removes the postcode from its zone (FR-011a) — recording alone changes nothing, because serviceability is decided by zone membership, and a decision written beside it would leave the storefront still answering "we deliver here" for an area explicitly marked unserved.';
COMMENT ON COLUMN public.delivery_area_decision.decided_by IS 'The deciding admin''s Cognito sub — NOT an email and NOT a display name. The console joins admin.staff for the name SC-013 requires. Stated because 005 shipped a defect of exactly this shape (claim("username") ?? sub, putting UUIDs into admin.staff.email).';
COMMENT ON COLUMN public.delivery_area_decision.note IS 'Why. Optional, because forcing prose produces "n/a" — but it is the difference between a decision someone can revisit and a fact nobody dares touch.';

-- ⚠ NO FOREIGN KEY to delivery_zone_postcode, deliberately. A decision must OUTLIVE the membership it
-- decided about: marking an area not-served removes its postcode from the zone (FR-011a), and the
-- record has to survive that or the console could not say who decided it and why (FR-011b), nor
-- surface the history when someone re-adds the area (FR-011c). A FK would delete exactly the row that
-- carries the answer. Orphaned decisions surface in the health check rather than being swept.

CREATE INDEX delivery_area_decision_zone_idx ON public.delivery_area_decision (zone_id);
CREATE INDEX delivery_area_decision_postcode_idx ON public.delivery_area_decision (postcode);

-- +goose Down
DROP TABLE IF EXISTS public.delivery_area_decision;

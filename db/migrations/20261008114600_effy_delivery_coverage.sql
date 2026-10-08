-- +goose Up
-- 076-effy-delivery-coverage — one list of postcodes Effy delivers to, and one answer per address.
--
-- ⚠ THE TABLES ARE EVOLVED IN PLACE, NOT COPIED (specs/076-effy-delivery-coverage/research.md R1).
-- `delivery_zone_postcode` already holds each postcode at most once: it IS the list. `delivery_zone`
-- becomes the optional GROUP a postcode sits in. A second, copied list would be a second answer to
-- "does Effy deliver here?", and the live checkout, fee and driver planner still read these tables
-- until later features (E3, E5, E8) replace them — staff would add a suburb to one list while
-- checkout obeyed the other. The names are historical and change at the cutover (E9).
--
-- ⚠ NOTHING HERE MAY CHANGE WHO IS SERVED OR WHAT ANYONE PAYS. Every postcode in an active zone
-- stays, in its zone, on its fee tier. `coverage.container.test.ts` P1 and P7 hold that.

-- ── 1. Distance, worked out in the database ──────────────────────────────────────────────────────

-- +goose StatementBegin
CREATE FUNCTION public.haversine_km(lat1 numeric, lon1 numeric, lat2 numeric, lon2 numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT (6371 * 2 * asin(least(1, sqrt(
        power(sin(radians((lat2 - lat1)::float8) / 2), 2)
        + cos(radians(lat1::float8)) * cos(radians(lat2::float8))
          * power(sin(radians((lon2 - lon1)::float8) / 2), 2)
    ))))::numeric;
$$;
-- +goose StatementEnd
COMMENT ON FUNCTION public.haversine_km(numeric, numeric, numeric, numeric) IS 'Straight-line (great-circle) distance in kilometres between two points (076). ⚠ THE FORMULA LIVES HERE ONLY: until 076 it was TypeScript in the admin service, which meant a hub move had to loop over rows in application code to recalculate. Never the distance a van drives — a ranking of how far a place is, nothing more.';

-- +goose StatementBegin
CREATE FUNCTION public.coverage_computed_distance_km(p_postcode text)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
    SELECT round(public.haversine_km(s.hub_latitude, s.hub_longitude, l.latitude, l.longitude), 2)
      FROM public.delivery_settings s
      CROSS JOIN LATERAL (
          SELECT latitude, longitude
            FROM public.locality
           WHERE postcode = p_postcode AND latitude IS NOT NULL AND longitude IS NOT NULL
           ORDER BY address_count DESC, name
           LIMIT 1
      ) l
     WHERE s.id = 1;
$$;
-- +goose StatementEnd
COMMENT ON FUNCTION public.coverage_computed_distance_km(text) IS 'The distance from Effy''s hub to a postcode, in km (076 FR-008). A postcode covers several places; its PRIMARY place stands for it — the one with a known location and the most addresses. ⚠ NULL when no place in the postcode has a location (a post-office-box postcode, a new estate) or the hub is not set: the caller must then be given a distance by a person. It never guesses.';

-- ── 2. The list ──────────────────────────────────────────────────────────────────────────────────

-- Postcodes in a DISABLED zone are not served today (every reader filters on the zone being active),
-- so they do not belong on a list whose meaning is "Effy delivers here". They are removed, said out
-- loud, and recorded — not carried across as if someone had chosen them.
-- +goose StatementBegin
DO $$
DECLARE
    v_gone text[];
BEGIN
    SELECT array_agg(zp.postcode ORDER BY zp.postcode)
      INTO v_gone
      FROM public.delivery_zone_postcode zp
      JOIN public.delivery_zone z ON z.id = zp.zone_id
     WHERE z.status <> 'active';

    IF v_gone IS NOT NULL THEN
        RAISE NOTICE '076: removing % postcode(s) that belong to a DISABLED zone and so are not served today: %',
            array_length(v_gone, 1), array_to_string(v_gone, ', ');
        INSERT INTO admin.audit_log (actor_sub, action, target_type, detail)
        VALUES ('migration:076', 'coverage.postcode.remove', 'coverage',
                jsonb_build_object('postcodes', to_jsonb(v_gone),
                                   'why', 'their zone was disabled, so they were not served before 076'));
        DELETE FROM public.delivery_zone_postcode zp
         USING public.delivery_zone z
         WHERE z.id = zp.zone_id AND z.status <> 'active';
    END IF;
END
$$;
-- +goose StatementEnd

-- ⚠ ON DELETE CASCADE → SET NULL. Until now, deleting a zone deleted every postcode in it: removing
-- a label took Effy's delivery away from a suburb. A group is a label (FR-015).
-- +goose StatementBegin
DO $$
DECLARE
    v_fk text;
BEGIN
    SELECT conname INTO v_fk
      FROM pg_constraint
     WHERE conrelid = 'public.delivery_zone_postcode'::regclass
       AND contype = 'f'
       AND confrelid = 'public.delivery_zone'::regclass;
    IF v_fk IS NULL THEN
        RAISE EXCEPTION '076: delivery_zone_postcode has no foreign key to delivery_zone - the schema is not what this migration expects';
    END IF;
    EXECUTE format('ALTER TABLE public.delivery_zone_postcode DROP CONSTRAINT %I', v_fk);
END
$$;
-- +goose StatementEnd

ALTER TABLE public.delivery_zone_postcode
    ALTER COLUMN zone_id DROP NOT NULL,
    ADD CONSTRAINT delivery_zone_postcode_zone_id_fkey
        FOREIGN KEY (zone_id) REFERENCES public.delivery_zone (id) ON DELETE SET NULL,
    ADD COLUMN distance_km     numeric(7, 2),
    ADD COLUMN distance_source text,
    ADD COLUMN distance_review boolean NOT NULL DEFAULT false,
    ADD COLUMN added_by        text,
    ADD COLUMN updated_at      timestamptz NOT NULL DEFAULT now();

-- Backfill. Worked out where the place has a location …
UPDATE public.delivery_zone_postcode zp
   SET distance_km = d.km, distance_source = 'computed'
  FROM (SELECT postcode, public.coverage_computed_distance_km(postcode) AS km
          FROM public.delivery_zone_postcode) d
 WHERE d.postcode = zp.postcode AND d.km IS NOT NULL;

-- … otherwise the distance someone already recorded for its zone, flagged for a person to check.
UPDATE public.delivery_zone_postcode zp
   SET distance_km = z.hub_distance_km, distance_source = 'manual', distance_review = true
  FROM public.delivery_zone z
 WHERE z.id = zp.zone_id AND zp.distance_km IS NULL AND z.hub_distance_km IS NOT NULL;

UPDATE public.delivery_zone_postcode SET added_by = 'migration:076';

-- ⚠ AND OTHERWISE IT STOPS. A listed postcode with no distance may not exist (FR-007), and a guessed
-- one is worse than a migration that fails: the next feature prices delivery on this number.
-- +goose StatementBegin
DO $$
DECLARE
    v_missing text[];
    v_manual  text[];
BEGIN
    SELECT array_agg(postcode ORDER BY postcode) INTO v_missing
      FROM public.delivery_zone_postcode WHERE distance_km IS NULL;
    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION '076: % listed postcode(s) have no distance and none can be worked out: %. Either load coordinates for a place in each (public.locality.latitude/longitude) and check the hub is set (public.delivery_settings), or set public.delivery_zone.hub_distance_km for their zone, then run the migration again. Nothing was changed.',
            array_length(v_missing, 1), array_to_string(v_missing, ', ');
    END IF;

    SELECT array_agg(postcode ORDER BY postcode) INTO v_manual
      FROM public.delivery_zone_postcode WHERE distance_source = 'manual';
    IF v_manual IS NOT NULL THEN
        RAISE NOTICE '076: % postcode(s) took their ZONE''s recorded distance because no place in them has a location - flagged for review in back-office: %',
            array_length(v_manual, 1), array_to_string(v_manual, ', ');
    END IF;
END
$$;
-- +goose StatementEnd

ALTER TABLE public.delivery_zone_postcode
    ALTER COLUMN distance_km     SET NOT NULL,
    ALTER COLUMN distance_source SET NOT NULL,
    ALTER COLUMN added_by        SET NOT NULL,
    ADD CONSTRAINT delivery_zone_postcode_distance_ck CHECK (distance_km >= 0 AND distance_km <= 5000),
    ADD CONSTRAINT delivery_zone_postcode_source_ck   CHECK (distance_source IN ('computed', 'manual'));

COMMENT ON TABLE public.delivery_zone_postcode IS '⚠ THE LIST OF POSTCODES EFFY DELIVERS TO with its own drivers (076). Being on it is the ONLY thing that makes an address "Delivered by Effy" - decided by public.coverage_for_postcode and nowhere else. One row per postcode (UNIQUE). The table NAME is historical (047 zones) and changes at the delivery-model cutover (E9): since 076 a zone is only an optional group.';
COMMENT ON COLUMN public.delivery_zone_postcode.zone_id IS 'The optional GROUP this postcode is filed under (076), or NULL. A group never changes what a customer is told, offered or charged. ON DELETE SET NULL: removing a group never removes a postcode. ⚠ Until the driver-operations feature (E8), drivers are cleared for work per group - an ungrouped postcode can only be delivered by a driver cleared for everywhere.';
COMMENT ON COLUMN public.delivery_zone_postcode.distance_km IS 'Straight-line km from Effy''s hub (076 FR-007). NOT NULL: a listed postcode always has one. Never shown to a customer.';
COMMENT ON COLUMN public.delivery_zone_postcode.distance_source IS 'computed = worked out by public.coverage_computed_distance_km and recalculated when the hub moves; manual = entered by a person and never recalculated (FR-010/FR-012).';
COMMENT ON COLUMN public.delivery_zone_postcode.distance_review IS 'A hand-entered distance someone should look at again - set when the hub moves, or by the 076 backfill. Cleared when a person saves the distance.';
COMMENT ON COLUMN public.delivery_zone_postcode.added_by IS 'The staff member who listed it; ''migration:076'' for postcodes served before 076.';

-- ── 3. A zone is now a group ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.delivery_zone
    ALTER COLUMN ring_id DROP NOT NULL,
    ALTER COLUMN sameday_eligible SET DEFAULT true;

COMMENT ON TABLE public.delivery_zone IS 'A COVERAGE GROUP since 076: a name staff file listed postcodes under ("Inner Melbourne"). Organisational - it does not decide coverage, and status = ''disabled'' now means only "a removed group", kept because delivery history and driver clearances refer to it. The table NAME is historical (047) and changes at the cutover (E9). ⚠ Three columns are FROZEN bridges that keep the live checkout selling until later features replace it: ring_id (fee tier, E3), sameday_eligible (E5), and the zone-keyed driver clearance (E8).';
COMMENT ON COLUMN public.delivery_zone.ring_id IS '076 - FROZEN, removed by the fee engine (E3). The fee tier of a group that existed before 076, so nobody''s fee moved when tiers left the console. NULL for groups created since: their postcodes are tiered by distance (public.coverage_ring_for_km). Nothing writes it any more.';
COMMENT ON COLUMN public.delivery_zone.sameday_eligible IS '076 - FROZEN, removed by the checkout feature (E5). The same-day flag of a group that existed before 076. New groups are true: under the new model Effy delivers same day to everything on its list.';
COMMENT ON COLUMN public.delivery_zone.hub_distance_km IS '076 - no longer written (distance is per postcode: delivery_zone_postcode.distance_km). Dropped at the cutover (E9).';
COMMENT ON COLUMN public.delivery_zone.suggested_ring_id IS '076 - no longer written; ring suggestion left the console. Dropped at the cutover (E9).';
COMMENT ON COLUMN public.delivery_zone.ring_is_overridden IS '076 - no longer written. Dropped at the cutover (E9).';
COMMENT ON TABLE public.delivery_ring IS '076 - FROZEN, removed by the fee engine (E3). The distance tiers the LIVE fee is still priced on. Tiers can no longer be created; a postcode listed since 076 takes the tier its distance falls in (public.coverage_ring_for_km).';
COMMENT ON TABLE public.shop_sameday_exception IS '076 - FROZEN, removed by the checkout feature (E5). Per-shop same-day exceptions as they stood when their controls were removed. ⚠ They never decide coverage: what a shop fulfils does not change whether Effy delivers (FR-024).';

-- ── 4. Courier reach ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.delivery_settings
    ADD COLUMN courier_offered boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.delivery_settings.courier_offered IS 'Is courier delivery offered at all (076 FR-016)? While true, every known postcode that is not on Effy''s list and not excluded is "Courier delivery". ⚠ false until a courier order can actually be placed (E5): the admin service refuses to turn it on before then, because every address in the country would be promised something checkout cannot sell.';

CREATE TABLE public.courier_excluded_postcode (
    postcode   text PRIMARY KEY CHECK (postcode ~ '^[0-9]{4}$'),
    reason     text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 200),
    added_by   text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.courier_excluded_postcode IS 'Postcodes where courier delivery is NOT offered (076 FR-018). Courier reach is "everywhere in the country except these". ⚠ Says nothing about Effy''s own delivery: a postcode on Effy''s list AND here is still "Delivered by Effy".';
COMMENT ON COLUMN public.courier_excluded_postcode.reason IS 'Why, in staff''s words ("No chilled courier service"). Shown to staff only - never to a customer (FR-023).';

-- ── 5. The bridge that tiers a postcode by its distance (until E3) ───────────────────────────────

-- +goose StatementBegin
CREATE FUNCTION public.coverage_ring_for_km(p_km numeric)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
    SELECT id FROM (
        -- the tier whose band the distance falls in …
        (SELECT id, 1 AS pref, suggest_upper_km AS ord
           FROM public.delivery_ring
          WHERE status = 'active' AND suggest_upper_km IS NOT NULL AND suggest_upper_km >= p_km
          ORDER BY suggest_upper_km ASC LIMIT 1)
        UNION ALL
        -- … else the open-ended (furthest) tier …
        (SELECT id, 2, NULL::numeric
           FROM public.delivery_ring
          WHERE status = 'active' AND suggest_upper_km IS NULL
          LIMIT 1)
        UNION ALL
        -- … else the furthest bounded one.
        (SELECT id, 3, -suggest_upper_km
           FROM public.delivery_ring
          WHERE status = 'active' AND suggest_upper_km IS NOT NULL
          ORDER BY suggest_upper_km DESC LIMIT 1)
    ) t
    ORDER BY pref
    LIMIT 1;
$$;
-- +goose StatementEnd
COMMENT ON FUNCTION public.coverage_ring_for_km(numeric) IS '076 - A BRIDGE, removed by the fee engine (E3). The live fee is priced per distance tier, and tiers left the console in 076; a postcode listed since then (or in a group created since) takes the tier its distance falls in. The same rule the console used to SUGGEST a tier (047 FR-015), now applied. NULL only when no active tier exists.';

-- ── 6. THE answer ────────────────────────────────────────────────────────────────────────────────

-- +goose StatementBegin
CREATE FUNCTION public.coverage_for_postcode(p_postcode text)
RETURNS TABLE (kind text, reason text, distance_km numeric, group_id uuid, group_name text)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    -- On Effy's list: Delivered by Effy. Nothing else is consulted - not the group's status, not a
    -- courier exclusion, not a shop.
    RETURN QUERY
        SELECT 'effy'::text, 'listed'::text, zp.distance_km, z.id, z.name
          FROM public.delivery_zone_postcode zp
          LEFT JOIN public.delivery_zone z ON z.id = zp.zone_id AND z.status = 'active'
         WHERE zp.postcode = p_postcode;
    IF FOUND THEN
        RETURN;
    END IF;

    -- A courier cannot be booked to a place the country's place data does not know.
    IF NOT EXISTS (SELECT 1 FROM public.locality l WHERE l.postcode = p_postcode) THEN
        RETURN QUERY SELECT 'none'::text, 'unknown_postcode'::text, NULL::numeric, NULL::uuid, NULL::text;
        RETURN;
    END IF;

    IF NOT COALESCE((SELECT s.courier_offered FROM public.delivery_settings s WHERE s.id = 1), false) THEN
        RETURN QUERY SELECT 'none'::text, 'courier_off'::text, NULL::numeric, NULL::uuid, NULL::text;
        RETURN;
    END IF;

    IF EXISTS (SELECT 1 FROM public.courier_excluded_postcode x WHERE x.postcode = p_postcode) THEN
        RETURN QUERY SELECT 'none'::text, 'courier_excluded'::text, NULL::numeric, NULL::uuid, NULL::text;
        RETURN;
    END IF;

    RETURN QUERY SELECT 'courier'::text, 'courier_offered'::text, NULL::numeric, NULL::uuid, NULL::text;
END
$$;
-- +goose StatementEnd
COMMENT ON FUNCTION public.coverage_for_postcode(text) IS '⚠ THE ONLY PLACE COVERAGE IS DECIDED (076 FR-020). For a postcode: kind = effy | courier | none, with the reason staff are shown (listed | courier_offered | courier_off | courier_excluded | unknown_postcode). Always exactly one row. Worked out when asked and NEVER stored against an address (FR-021) - same discipline as public.round_opens_at and public.points_usable. The address book, the storefront check, the checkout quote and the staff checker all read this; a second implementation is how two screens come to disagree. It reads no shop table, by design (FR-024).';

-- ── 7. The shopper role ──────────────────────────────────────────────────────────────────────────
-- Checkout runs as effy_shopper and calls the functions above. 070's default privileges hand a new
-- table full DML; the exclusions list is staff-maintained, so the shopper keeps read only.
REVOKE INSERT, UPDATE, DELETE ON public.courier_excluded_postcode FROM effy_shopper;

-- +goose Down
-- Dev only. Forward-only everywhere else (constitution: Database).
DROP FUNCTION IF EXISTS public.coverage_for_postcode(text);
DROP FUNCTION IF EXISTS public.coverage_ring_for_km(numeric);
DROP TABLE IF EXISTS public.courier_excluded_postcode;
ALTER TABLE public.delivery_settings DROP COLUMN IF EXISTS courier_offered;
ALTER TABLE public.delivery_zone ALTER COLUMN sameday_eligible SET DEFAULT false;
ALTER TABLE public.delivery_zone_postcode
    DROP CONSTRAINT IF EXISTS delivery_zone_postcode_distance_ck,
    DROP CONSTRAINT IF EXISTS delivery_zone_postcode_source_ck,
    DROP COLUMN IF EXISTS distance_km,
    DROP COLUMN IF EXISTS distance_source,
    DROP COLUMN IF EXISTS distance_review,
    DROP COLUMN IF EXISTS added_by,
    DROP COLUMN IF EXISTS updated_at;
DROP FUNCTION IF EXISTS public.coverage_computed_distance_km(text);
DROP FUNCTION IF EXISTS public.haversine_km(numeric, numeric, numeric, numeric);

-- +goose Up
-- 097 — delivery TODAY, postcode by postcode.
--
-- A postcode on Effy's list is Delivered by Effy. Until now every listed postcode was offered the
-- same windows today; a town an hour from the hub was sold a same-day window exactly like a suburb
-- next to it, and the only lever was taking the town off the list. This gives the smaller lever:
-- Effy delivers here, but not today.
--
-- ⚠ ADDITIVE, AND IT CHANGES NOTHING ON ITS OWN. Every listed postcode starts with today offered,
-- so no customer is offered anything different until staff switch one off. The services running
-- when this is applied read the coverage function by column name and keep working; the new column
-- is simply not read by them yet.
--
-- ⚠ PER POSTCODE, NEVER PER GROUP. A group is a label staff file postcodes under and decides
-- nothing a customer sees, is offered or pays (076). See specs/097-same-day-by-postcode/research.md.

ALTER TABLE public.delivery_zone_postcode
    ADD COLUMN today_offered boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.delivery_zone_postcode.today_offered IS 'Whether a window TODAY may be sold to an address in this postcode (097). Default true. Where false, the Effy calendar for the address does not contain today: no Same-day section, "as soon as possible" lands on a later day, and back-office cannot move or re-time an order into today. ⚠ Per postcode, never per group. ⚠ Read only through public.coverage_for_postcode. ⚠ Switching it off never touches a place already held or an order already placed. Not remembered when the postcode is removed from the list.';

-- The coverage answer carries it, so nothing reads the list's table to find it out. The result
-- columns change, so the function is dropped and created (CREATE OR REPLACE cannot change them).
DROP FUNCTION public.coverage_for_postcode(text, timestamptz);
-- +goose StatementBegin
CREATE FUNCTION public.coverage_for_postcode(p_postcode text, p_at timestamptz DEFAULT now())
RETURNS TABLE (kind text, reason text, distance_km numeric, group_id uuid, group_name text, today_offered boolean)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_reason text;
BEGIN
    -- On Effy's list: Delivered by Effy. Nothing else is consulted - not the group's status, not a
    -- courier exclusion, not a shop.
    RETURN QUERY
        SELECT 'effy'::text, 'listed'::text, zp.distance_km, z.id, z.name, zp.today_offered
          FROM public.delivery_zone_postcode zp
          LEFT JOIN public.delivery_zone z ON z.id = zp.zone_id AND z.status = 'active'
         WHERE zp.postcode = p_postcode;
    IF FOUND THEN
        RETURN;
    END IF;

    -- Not listed: today_offered means nothing here, and is true so that it restricts nothing.
    v_reason := public.courier_reaches_postcode(p_postcode, p_at);
    RETURN QUERY SELECT CASE WHEN v_reason = 'courier_offered' THEN 'courier' ELSE 'none' END,
                        v_reason, NULL::numeric, NULL::uuid, NULL::text, true;
END
$$;
-- +goose StatementEnd
COMMENT ON FUNCTION public.coverage_for_postcode(text, timestamptz) IS '⚠ THE ONLY PLACE COVERAGE IS DECIDED (076 FR-020). For a postcode at an instant: kind = effy | courier | none, with the reason staff are shown (listed, or public.courier_reaches_postcode''s). Always exactly one row. ⚠ Since 079 "courier" means a courier order CAN BE PLACED there now - the new delivery model is on, courier delivery is on, a courier fee table is active and an estimate is set - so the address book and the checkout cannot disagree, and courier delivery can be armed before the cutover without promising anything. Worked out when asked and NEVER stored against an address (FR-021). It reads no shop table, by design (FR-024). ⚠ Since 097 it also says whether a window TODAY may be sold there (today_offered: the listed row''s value; true when not listed, where it restricts nothing).';

-- +goose Down
-- Dev-only single-step reversal: 079's function, and the column gone.
DROP FUNCTION public.coverage_for_postcode(text, timestamptz);
-- +goose StatementBegin
CREATE FUNCTION public.coverage_for_postcode(p_postcode text, p_at timestamptz DEFAULT now())
RETURNS TABLE (kind text, reason text, distance_km numeric, group_id uuid, group_name text)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_reason text;
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

    v_reason := public.courier_reaches_postcode(p_postcode, p_at);
    RETURN QUERY SELECT CASE WHEN v_reason = 'courier_offered' THEN 'courier' ELSE 'none' END,
                        v_reason, NULL::numeric, NULL::uuid, NULL::text;
END
$$;
-- +goose StatementEnd
COMMENT ON FUNCTION public.coverage_for_postcode(text, timestamptz) IS '⚠ THE ONLY PLACE COVERAGE IS DECIDED (076 FR-020). For a postcode at an instant: kind = effy | courier | none, with the reason staff are shown (listed, or public.courier_reaches_postcode''s). Always exactly one row. ⚠ Since 079 "courier" means a courier order CAN BE PLACED there now - the new delivery model is on, courier delivery is on, a courier fee table is active and an estimate is set - so the address book and the checkout cannot disagree, and courier delivery can be armed before the cutover without promising anything. Worked out when asked and NEVER stored against an address (FR-021). It reads no shop table, by design (FR-024).';

ALTER TABLE public.delivery_zone_postcode DROP COLUMN today_offered;

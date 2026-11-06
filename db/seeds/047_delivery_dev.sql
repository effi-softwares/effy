-- Delivery dev seed: a realistic Melbourne launch setup. DEV ONLY, run with `make seed-delivery ENV=dev`.
-- Every number here is explained in docs/runbooks/melbourne-delivery-setup.md - change both together.
--
-- Sets up, all on Effy's clock (Australia/Melbourne, wall-clock times):
--   1. the hub (Fishermans Bend, Port Melbourne) and the delivery settings;
--   2. seven groups and 86 real Melbourne postcodes, each with its distance from the hub; delivery TODAY is
--      offered only within 15 km of the hub;
--   3. six two-hour delivery windows 09:00-21:00, no order limits, plus the built-in "Any time" window;
--   4. six collection runs, one an hour before each window;
--   5. the Effy fee plan and a courier fee table (courier delivery stays OFF);
--   6. the days Effy does not deliver (Christmas Day, Good Friday, Anzac Day);
--   7. the order minimum.
--
-- Not seeded, on purpose: a courier service (a real courier's name and terms are the operator's to enter),
-- the business's legal name and ABN, drivers (Cognito accounts, made in back-office), vehicles
-- (db/seeds/061_fleet_dev.sql).
--
-- Requires: the localities loaded (`make load-localities ... REPLACE=1`) - a postcode's distance is worked out
-- from them, and the seed stops rather than guess one. Refuses to run while any order exists: windows and
-- plans are replaced, and orders point at windows.
--
-- Re-runnable: groups and windows keep their ids (driver clearances and fee surcharges stay attached); the
-- postcode list, fee plans, runs and closed days are replaced.

\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public."order") THEN
        RAISE EXCEPTION 'seed-delivery: orders exist. This seed replaces windows and fee plans, which orders point at. Run make reset-dev-data first.';
    END IF;
    IF (SELECT count(*) FROM public.locality WHERE state = 'VIC') < 3000 THEN
        RAISE EXCEPTION 'seed-delivery: the Victorian localities are not loaded. Run make load-localities ENV=dev CSVREL=db/reference/au-localities-full.csv REPLACE=1 first.';
    END IF;
END
$$;

-- ── 1. Hub and settings ─────────────────────────────────────────────────────────────────────────────
-- Hub: Fishermans Bend, Port Melbourne - the inner-city industrial strip between the CBD and the West Gate
-- Freeway, 4 km from the CBD, with CityLink and the West Gate both a few minutes away.
INSERT INTO public.delivery_settings (
    id, hub_latitude, hub_longitude,
    sameday_prep_buffer_min, sameday_hub_turnaround_min, planning_lead_min, per_stop_allowance_min, slot_hold_min,
    standard_no_delivery_weekdays, effy_lookahead_days, asap_estimate,
    courier_offered, courier_when_no_windows, courier_collection_default,
    load_overdue_min, checkin_overdue_min, vehicle_check_required, updated_by)
VALUES (
    1, -37.826000, 144.925000,
    90,          -- a shop has 90 minutes from ordering closing to the collection run
    60,          -- 60 minutes at the hub: check in, sort, load the vans
    45,          -- a driver's round opens 45 minutes before its run / window
    10,          -- 10 minutes per drop when planning a round (suburban streets, apartment buzzers)
    10,          -- a window place is held 10 minutes while the customer pays
    '{}',        -- delivers seven days a week
    6,           -- today plus the next 6 delivery days: one week to choose from
    'usually today or tomorrow',
    false, false, 'hub',
    20, 30, false,
    'seed:delivery')
ON CONFLICT (id) DO UPDATE SET
    hub_latitude = EXCLUDED.hub_latitude, hub_longitude = EXCLUDED.hub_longitude,
    sameday_prep_buffer_min = EXCLUDED.sameday_prep_buffer_min,
    sameday_hub_turnaround_min = EXCLUDED.sameday_hub_turnaround_min,
    planning_lead_min = EXCLUDED.planning_lead_min, per_stop_allowance_min = EXCLUDED.per_stop_allowance_min,
    slot_hold_min = EXCLUDED.slot_hold_min,
    standard_no_delivery_weekdays = EXCLUDED.standard_no_delivery_weekdays,
    effy_lookahead_days = EXCLUDED.effy_lookahead_days, asap_estimate = EXCLUDED.asap_estimate,
    courier_offered = EXCLUDED.courier_offered, courier_when_no_windows = EXCLUDED.courier_when_no_windows,
    courier_collection_default = EXCLUDED.courier_collection_default,
    load_overdue_min = EXCLUDED.load_overdue_min, checkin_overdue_min = EXCLUDED.checkin_overdue_min,
    vehicle_check_required = EXCLUDED.vehicle_check_required,
    updated_by = EXCLUDED.updated_by, updated_at = now();

-- ── 2. Groups and the postcode list ─────────────────────────────────────────────────────────────────
-- A group files postcodes and scopes driver clearances; it decides nothing about coverage or windows.
INSERT INTO public.delivery_zone (id, code, name, status, updated_by) VALUES
    ('22222222-0000-0000-0000-000000000001', 'MEL-CITY',  'City & Port Phillip',       'active', 'seed:delivery'),
    ('22222222-0000-0000-0000-000000000002', 'MEL-NORTH', 'Inner North',               'active', 'seed:delivery'),
    ('22222222-0000-0000-0000-000000000003', 'MEL-EAST',  'Inner East',                'active', 'seed:delivery'),
    ('22222222-0000-0000-0000-000000000004', 'MEL-SE',    'South-East',                'active', 'seed:delivery'),
    ('22222222-0000-0000-0000-000000000005', 'MEL-BAY',   'Bayside',                   'active', 'seed:delivery'),
    ('22222222-0000-0000-0000-000000000006', 'MEL-WEST',  'Inner West',                'active', 'seed:delivery'),
    ('22222222-0000-0000-0000-000000000007', 'MEL-OUTER', 'Middle ring (no same-day)', 'active', 'seed:delivery')
ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name, status = EXCLUDED.status,
    updated_by = EXCLUDED.updated_by, updated_at = now();

DELETE FROM public.delivery_zone_postcode;
DELETE FROM public.delivery_zone WHERE id::text NOT LIKE '22222222-0000-0000-0000-00000000000_';

CREATE TEMP TABLE seed_postcode (zone_no int, postcode text) ON COMMIT DROP;
INSERT INTO seed_postcode (zone_no, postcode) VALUES
    -- 1 City & Port Phillip
    (1,'3000'),(1,'3002'),(1,'3003'),(1,'3004'),(1,'3006'),(1,'3008'),(1,'3031'),(1,'3051'),(1,'3052'),(1,'3053'),
    (1,'3205'),(1,'3206'),(1,'3207'),
    -- 2 Inner North
    (2,'3054'),(2,'3055'),(2,'3056'),(2,'3057'),(2,'3058'),(2,'3065'),(2,'3066'),(2,'3067'),(2,'3068'),(2,'3070'),
    (2,'3071'),(2,'3072'),(2,'3078'),(2,'3044'),
    -- 3 Inner East
    (3,'3121'),(3,'3122'),(3,'3123'),(3,'3101'),(3,'3103'),(3,'3104'),(3,'3124'),(3,'3126'),(3,'3127'),(3,'3079'),
    (3,'3105'),(3,'3081'),
    -- 4 South-East
    (4,'3141'),(4,'3142'),(4,'3143'),(4,'3144'),(4,'3145'),(4,'3146'),(4,'3147'),(4,'3148'),(4,'3125'),(4,'3161'),
    (4,'3162'),(4,'3163'),(4,'3181'),(4,'3183'),
    -- 5 Bayside
    (5,'3182'),(5,'3184'),(5,'3185'),(5,'3186'),(5,'3187'),(5,'3188'),(5,'3204'),(5,'3165'),(5,'3189'),(5,'3190'),
    (5,'3191'),
    -- 6 Inner West
    (6,'3011'),(6,'3012'),(6,'3013'),(6,'3015'),(6,'3016'),(6,'3018'),(6,'3019'),(6,'3020'),(6,'3025'),(6,'3032'),
    (6,'3039'),(6,'3040'),(6,'3041'),(6,'3042'),
    -- 7 Middle ring (all beyond 15 km: next-day and later only)
    (7,'3108'),(7,'3128'),(7,'3129'),(7,'3149'),(7,'3166'),(7,'3167'),(7,'3168'),(7,'3083');

DO $$
DECLARE
    unknown text;
BEGIN
    SELECT string_agg(postcode, ', ' ORDER BY postcode) INTO unknown
      FROM seed_postcode WHERE public.coverage_computed_distance_km(postcode) IS NULL;
    IF unknown IS NOT NULL THEN
        RAISE EXCEPTION 'seed-delivery: no locality with a map point for postcode(s) %. Load the full locality file first.', unknown;
    END IF;
END
$$;

-- The distance is the platform's own: straight-line from the hub to the postcode's main locality.
-- Delivery TODAY is offered within 15 km (about 25 minutes' drive); farther postcodes get the next days only.
INSERT INTO public.delivery_zone_postcode (zone_id, postcode, distance_km, distance_source, distance_review, today_offered, added_by)
SELECT ('22222222-0000-0000-0000-00000000000' || s.zone_no)::uuid, s.postcode,
       d.km, 'computed', false, d.km <= 15.00, 'seed:delivery'
  FROM seed_postcode s
 CROSS JOIN LATERAL (SELECT public.coverage_computed_distance_km(s.postcode) AS km) d;

-- ── 3. Delivery windows ─────────────────────────────────────────────────────────────────────────────
-- Six two-hour windows. Each window's cutoff is 2 h 30 min before it starts: its collection run is an hour
-- before the start (hub turnaround) and the shop needs 90 minutes before that. No window has an order limit
-- (capacity NULL): a window never fills, so it closes only at its cutoff. Set a limit in back-office later if
-- the vans can't keep up.
INSERT INTO public.delivery_slot (id, start_time, end_time, cutoff_time, capacity, status, updated_by) VALUES
    ('44444444-0000-0000-0000-000000000009', '09:00', '11:00', '06:30', NULL, 'active', 'seed:delivery'),
    ('44444444-0000-0000-0000-000000000011', '11:00', '13:00', '08:30', NULL, 'active', 'seed:delivery'),
    ('44444444-0000-0000-0000-000000000013', '13:00', '15:00', '10:30', NULL, 'active', 'seed:delivery'),
    ('44444444-0000-0000-0000-000000000015', '15:00', '17:00', '12:30', NULL, 'active', 'seed:delivery'),
    ('44444444-0000-0000-0000-000000000017', '17:00', '19:00', '14:30', NULL, 'active', 'seed:delivery'),
    ('44444444-0000-0000-0000-000000000019', '19:00', '21:00', '16:30', NULL, 'active', 'seed:delivery')
ON CONFLICT (id) DO UPDATE SET start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time,
    cutoff_time = EXCLUDED.cutoff_time, capacity = EXCLUDED.capacity, status = EXCLUDED.status,
    updated_by = EXCLUDED.updated_by, updated_at = now();

DELETE FROM public.delivery_slot WHERE NOT any_time AND id::text NOT LIKE '44444444-0000-0000-0000-0000000000__';

-- "Any time" (its migration made it; only its hours and limit are edited): a day with no time, delivered
-- 09:00-21:00 on any round that day, with no limit. Its cutoff matches the first window's, since the first run serves it.
UPDATE public.delivery_slot
   SET start_time = '09:00', end_time = '21:00', cutoff_time = '06:30', capacity = NULL,
       updated_by = 'seed:delivery', updated_at = now()
 WHERE any_time;

-- ── 4. Collection runs (shops → hub) ────────────────────────────────────────────────────────────────
-- One run an hour before each window: what the run brings in is sorted at the hub and goes out in that window.
DELETE FROM public.delivery_collection_run;
INSERT INTO public.delivery_collection_run (run_time, label, status, updated_by) VALUES
    ('08:00', 'Early run',      'active', 'seed:delivery'),
    ('10:00', 'Morning run',    'active', 'seed:delivery'),
    ('12:00', 'Midday run',     'active', 'seed:delivery'),
    ('14:00', 'Afternoon run',  'active', 'seed:delivery'),
    ('16:00', 'Late afternoon run', 'active', 'seed:delivery'),
    ('18:00', 'Evening run',    'active', 'seed:delivery');

-- ── 5. Fee plans ────────────────────────────────────────────────────────────────────────────────────
DELETE FROM public.delivery_fee_plan;  -- cascades bands and window surcharges

-- Effy: base $6 + distance + weight + window, rounded up to 50c, between $6 and $25. Free from $150.
-- Under $50 adds a $5 small-order fee. A window today costs $3 more. Effy sells groceries AND household,
-- electronics and general goods (a Walmart-style range), so the weight bands go to 100 kg and the cap leaves room
-- for heavy baskets (drinks, pet food, cat litter, small appliances).
INSERT INTO public.delivery_fee_plan
    (id, kind, name, base_amount, today_premium_amount, rounding_step, floor_amount, cap_amount,
     free_over_amount, small_order_under_amount, small_order_fee_amount, created_by, updated_by)
VALUES
    ('33333333-0000-0000-0000-000000000001', 'effy', 'Melbourne launch 2026', 6.00, 3.00, 0.50, 6.00, 25.00,
     150.00, 50.00, 5.00, 'seed:delivery', 'seed:delivery');

-- Straight-line km from the hub (roads are about 1.3 times longer). 6 km keeps the whole City group, the CBD
-- included (5.22 km), in the first band.
INSERT INTO public.delivery_distance_band (plan_id, upper_km, add_amount) VALUES
    ('33333333-0000-0000-0000-000000000001',  6.00, 0.00),
    ('33333333-0000-0000-0000-000000000001', 10.00, 1.00),
    ('33333333-0000-0000-0000-000000000001', 15.00, 2.00),
    ('33333333-0000-0000-0000-000000000001', 20.00, 3.50),
    ('33333333-0000-0000-0000-000000000001', 30.00, 5.00),
    ('33333333-0000-0000-0000-000000000001',  NULL, 8.00);

-- The whole basket's weight; the heaviest band also prices anything above it.
INSERT INTO public.delivery_weight_band (plan_id, upper_grams, add_amount) VALUES
    ('33333333-0000-0000-0000-000000000001',  10000,  0.00),   -- a top-up shop, a gadget, a few household items
    ('33333333-0000-0000-0000-000000000001',  20000,  1.50),   -- a weekly shop for 1-2 people
    ('33333333-0000-0000-0000-000000000001',  30000,  3.00),   -- a family weekly shop
    ('33333333-0000-0000-0000-000000000001',  45000,  5.00),   -- drinks cases, a microwave, an air fryer
    ('33333333-0000-0000-0000-000000000001',  70000,  8.00),   -- bulk pet food, cat litter, a large TV
    ('33333333-0000-0000-0000-000000000001', 100000, 12.00);   -- the heaviest band, also above 100 kg

-- The dinner-time windows cost a little more, to spread the evening rush.
INSERT INTO public.delivery_slot_premium (plan_id, slot_id, add_amount) VALUES
    ('33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000017', 2.00),
    ('33333333-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000019', 1.00);

DO $$ BEGIN PERFORM public.delivery_plan_activate('33333333-0000-0000-0000-000000000001', 'seed:delivery', false); END $$;

-- Courier: a flat $10 + weight, rounded up to 50c, between $10 and $40, free from $99 (Kmart charges $10 metro,
-- Big W $8 metro / $10 regional and free over $99 regional; parcels over 30 kg cost carriers more). Active, but courier
-- delivery is OFF and no courier service exists, so nothing sells it until back-office adds one.
INSERT INTO public.delivery_fee_plan
    (id, kind, name, base_amount, rounding_step, floor_amount, cap_amount, free_over_amount, created_by, updated_by)
VALUES
    ('33333333-0000-0000-0000-000000000002', 'courier', 'Australia-wide courier 2026', 10.00, 0.50, 10.00, 40.00,
     99.00, 'seed:delivery', 'seed:delivery');

INSERT INTO public.delivery_weight_band (plan_id, upper_grams, add_amount) VALUES
    ('33333333-0000-0000-0000-000000000002',  3000,  0.00),
    ('33333333-0000-0000-0000-000000000002',  5000,  3.00),
    ('33333333-0000-0000-0000-000000000002', 10000,  6.00),
    ('33333333-0000-0000-0000-000000000002', 20000, 12.00),
    ('33333333-0000-0000-0000-000000000002', 30000, 18.00),
    ('33333333-0000-0000-0000-000000000002', 50000, 28.00);

DO $$ BEGIN PERFORM public.delivery_plan_activate('33333333-0000-0000-0000-000000000002', 'seed:delivery', false); END $$;

-- ── 6. Days Effy does not deliver ───────────────────────────────────────────────────────────────────
-- Victoria's restricted trading days: shops are closed on Christmas Day and Good Friday, and until 1 pm on
-- Anzac Day (Effy takes the whole day off).
DELETE FROM public.delivery_non_delivery_date;
INSERT INTO public.delivery_non_delivery_date (day, label, created_by) VALUES
    ('2026-12-25', 'Christmas Day',  'seed:delivery'),
    ('2027-03-26', 'Good Friday',    'seed:delivery'),
    ('2027-04-25', 'Anzac Day',      'seed:delivery'),
    ('2027-12-25', 'Christmas Day',  'seed:delivery');

-- ── 7. Order minimum ────────────────────────────────────────────────────────────────────────────────
-- $20 of goods to check out at all (a convenience range: a charger, batteries, a few essentials); $20-$50 pays
-- the small-order fee, so a small order still covers its drop.
UPDATE public.order_policy SET minimum_subtotal_amount = 20.00, updated_by = 'seed:delivery', updated_at = now();

-- ── Summary ─────────────────────────────────────────────────────────────────────────────────────────
SELECT z.name AS "group", count(*) AS postcodes, min(p.distance_km) AS min_km, max(p.distance_km) AS max_km,
       count(*) FILTER (WHERE p.today_offered) AS today_offered
  FROM public.delivery_zone_postcode p JOIN public.delivery_zone z ON z.id = p.zone_id
 GROUP BY z.name ORDER BY min(p.distance_km);

COMMIT;

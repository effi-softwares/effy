-- Delivery — realistic dev seed (Melbourne-first), for the one delivery model (083). Idempotent:
-- clears the delivery CONFIG and re-inserts. ⚠ Touches ONLY delivery configuration — never
-- public.locality, never orders.
--
-- What it sets up — exactly what the go-live checklist (back-office: Delivery, Go-live) asks for:
--   • Effy's postcode list, in a few named groups, each postcode with its distance from the hub;
--   • one active Effy fee plan: ONE fee per order — base + distance band + weight band + what the
--     window adds, rounded up, clamped. A window TODAY costs a fixed amount more ($3.00 here — a dev
--     value; the real amount is the operator's);
--   • the hub and the shop prep buffer;
--   • collection runs, and delivery windows a customer can choose today or on the next delivery days.
--
-- ⚠ NO COURIER SERVICE IS SEEDED, and courier delivery is left off: a courier's name, timeframe and
-- pickup days are real-world facts the operator enters (Delivery, Coverage, Courier delivery). An
-- address off the list is refused at checkout until they do.
--
-- ⚠ Groups use postcodes present in the loaded sample locality set (17 rows). Load the full
--   G-NAF-derived CSV and re-run to widen coverage.

BEGIN;

-- ── 1. Clear existing delivery config (FK-safe order) ───────────────────────────────────────────────
-- ⚠ Since 076 removing a group UNGROUPS its postcodes rather than deleting them, so the list is
-- cleared on its own first — without this a second run of this seed fails on a duplicate postcode.
DELETE FROM public.delivery_zone_postcode;
DELETE FROM public.delivery_zone;
DELETE FROM public.delivery_fee_plan;        -- cascades its bands and window premiums
DELETE FROM public.delivery_collection_run;

-- ── 2. (077: there are no distance tiers any more — a postcode is priced from its own distance.) ───

-- ── 3. Coverage groups (real Melbourne/VIC areas) + their postcodes ─────────────────────────────────
-- A group organises the list and scopes driver clearances. It decides nothing about coverage or
-- about which windows are offered: every listed postcode is offered the same windows.
INSERT INTO public.delivery_zone (id, code, name, status, updated_by) VALUES
  ('22222222-0000-0000-0000-000000000001', 'MEL-CBD',      'Melbourne CBD',         'active', 'seed:047'),
  ('22222222-0000-0000-0000-000000000002', 'MEL-INNER-E',  'Inner East',            'active', 'seed:047'),
  ('22222222-0000-0000-0000-000000000003', 'MEL-INNER-S',  'Inner South (bayside)', 'active', 'seed:047'),
  ('22222222-0000-0000-0000-000000000004', 'MEL-INNER-W',  'Inner West',            'active', 'seed:047'),
  ('22222222-0000-0000-0000-000000000005', 'MEL-MIDDLE-W', 'Middle West',           'active', 'seed:047'),
  ('22222222-0000-0000-0000-000000000006', 'MEL-OUTER-W',  'Outer West (Wyndham)',  'active', 'seed:047'),
  ('22222222-0000-0000-0000-000000000007', 'GEELONG',      'Geelong',               'active', 'seed:047'),
  ('22222222-0000-0000-0000-000000000008', 'BALLARAT',     'Ballarat',              'active', 'seed:047'),
  ('22222222-0000-0000-0000-000000000009', 'BENDIGO',      'Bendigo',               'active', 'seed:047');

-- ⚠ 076 — a listed postcode always has a distance. Worked out from the place's location where one is
-- known (load the localities first); otherwise this dev seed falls back to a round 10 km, marked as
-- hand-entered and flagged for review. A real environment never guesses — the console demands a
-- distance from a person.
INSERT INTO public.delivery_zone_postcode (zone_id, postcode, distance_km, distance_source, distance_review, added_by)
SELECT v.zone_id::uuid, v.postcode,
       COALESCE(public.coverage_computed_distance_km(v.postcode), 10.00),
       CASE WHEN public.coverage_computed_distance_km(v.postcode) IS NULL THEN 'manual' ELSE 'computed' END,
       public.coverage_computed_distance_km(v.postcode) IS NULL,
       'seed:047'
FROM (VALUES
  ('22222222-0000-0000-0000-000000000001', '3000'),  -- Melbourne
  ('22222222-0000-0000-0000-000000000001', '3006'),  -- Southbank
  ('22222222-0000-0000-0000-000000000001', '3008'),  -- Docklands
  ('22222222-0000-0000-0000-000000000002', '3121'),  -- Richmond
  ('22222222-0000-0000-0000-000000000002', '3141'),  -- South Yarra
  ('22222222-0000-0000-0000-000000000003', '3182'),  -- St Kilda
  ('22222222-0000-0000-0000-000000000004', '3011'),  -- Footscray
  ('22222222-0000-0000-0000-000000000005', '3033'),  -- Keilor East
  ('22222222-0000-0000-0000-000000000006', '3030'),  -- Werribee
  ('22222222-0000-0000-0000-000000000007', '3220'),  -- Geelong
  ('22222222-0000-0000-0000-000000000008', '3350'),  -- Ballarat Central
  ('22222222-0000-0000-0000-000000000008', '3355'),  -- Wendouree
  ('22222222-0000-0000-0000-000000000009', '3550')
) AS v (zone_id, postcode);  -- Bendigo

-- ── 4. The active fee plan (077) ───────────────────────────────────────────────────────────────────
-- One fee per order: clamp( roundUp( base + distance band + weight band + window premium, 0.50 ),
-- 4.00, 40.00 ). Built as a DRAFT and then made active through the one function that may.
INSERT INTO public.delivery_fee_plan
  (id, kind, name, base_amount, today_premium_amount, rounding_step, floor_amount, cap_amount, created_by)
VALUES
  ('33333333-0000-0000-0000-000000000001', 'effy', 'Melbourne Launch 2026', 0.00, 3.00, 0.50, 4.00, 40.00, 'seed:047');

-- distance bands from the hub; the last has no upper limit
INSERT INTO public.delivery_distance_band (plan_id, upper_km, add_amount) VALUES
  ('33333333-0000-0000-0000-000000000001', 10.00,  5.00),
  ('33333333-0000-0000-0000-000000000001', 25.00,  7.00),
  ('33333333-0000-0000-0000-000000000001', 50.00, 10.00),
  ('33333333-0000-0000-0000-000000000001', NULL,  15.00);

-- weight slabs (grocery basket weights); top slab is open-ended.
INSERT INTO public.delivery_weight_band (plan_id, upper_grams, add_amount) VALUES
  ('33333333-0000-0000-0000-000000000001',  5000, 0.00),   -- ≤ 5 kg  (a light basket)
  ('33333333-0000-0000-0000-000000000001', 10000, 2.00),   -- ≤ 10 kg (a typical weekly shop)
  ('33333333-0000-0000-0000-000000000001', 20000, 4.50),   -- ≤ 20 kg (a big shop)
  ('33333333-0000-0000-0000-000000000001', 40000, 8.00);   -- ≤ 40 kg (open-ended top: heavier takes this)

SELECT public.delivery_plan_activate('33333333-0000-0000-0000-000000000001', 'seed:047', false);

-- ── 5. Hub + shop prep buffer (settings singleton) ──────────────────────────────────────────────────
-- Hub = Melbourne CBD. Prep buffer 120 min: a shop needs ~2h to pick + pack before a collection run.
INSERT INTO public.delivery_settings (id, hub_latitude, hub_longitude, sameday_prep_buffer_min, updated_by)
VALUES (1, -37.813600, 144.963100, 120, 'seed:047')
ON CONFLICT (id) DO UPDATE
  SET hub_latitude = EXCLUDED.hub_latitude, hub_longitude = EXCLUDED.hub_longitude,
      sameday_prep_buffer_min = EXCLUDED.sameday_prep_buffer_min, updated_by = EXCLUDED.updated_by,
      updated_at = now();

-- ── 6. Collection runs (drivers collect from shops; Australia/Melbourne wall clock) ────────────────
-- Three runs. With the 120-minute buffer, an order can still make today's 12:00 run until 10:00, the
-- 16:00 run until 14:00 and the 21:00 run until 19:00.
INSERT INTO public.delivery_collection_run (run_time, label, status, updated_by) VALUES
  ('12:00', 'Midday run',    'active', 'seed:047'),
  ('16:00', 'Afternoon run', 'active', 'seed:047'),
  ('21:00', 'Evening run',   'active', 'seed:047');

-- ── 7. Delivery windows (what a customer chooses: today, or one of the next delivery days) ─────────
-- A window TODAY is offered while its cutoff has not passed, it has room, and a run can still be made
-- that reaches the hub before it starts (the hub turnaround is 60 minutes by default). So today the
-- afternoon window rides the 12:00 run and the evening window the 16:00 run; on a later day both are
-- always collectable. ⚠ Added only when no window exists: placed orders reference a window, so this
-- seed never deletes one.
INSERT INTO public.delivery_slot (start_time, end_time, cutoff_time, capacity, status, updated_by)
SELECT v.start_time::time, v.end_time::time, v.cutoff_time::time, v.capacity, 'active', 'seed:047'
  FROM (VALUES
    ('14:00', '17:00', '10:00', 20),   -- afternoon
    ('18:00', '21:00', '14:00', 20)    -- evening
  ) AS v (start_time, end_time, cutoff_time, capacity)
 WHERE NOT EXISTS (SELECT 1 FROM public.delivery_slot);

COMMIT;

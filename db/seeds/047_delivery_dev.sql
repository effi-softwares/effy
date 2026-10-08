-- 047 delivery — realistic dev seed (Melbourne-first). Idempotent: clears the delivery CONFIG and
-- re-inserts. ⚠ Touches ONLY delivery configuration — never public.locality, never orders.
--
-- Values are grounded in AU metro grocery/courier norms (research 2026-08):
--   • Distance bands from the CBD hub: ≤10 km, ≤25 km, ≤50 km, then everything beyond (regional VIC).
--   • Grocery metro delivery sits ~$5–$15. Same-day costs a FIXED amount more than a later day (077 —
--     it replaced the old 1.6× multiplier); this DEV seed uses $3.00. ⚠ A dev value only: the real
--     amount is the operator's, asked for by the 077 migration (EFFY_TODAY_PREMIUM).
--   • Weight adds in slabs; a typical grocery basket is ≤10 kg, big shops 10–20 kg.
--   • Same-day only near the hub (inner/middle); regional is standard-only (can't reach 65–130 km today).
--
-- ⚠ Zones use postcodes present in the loaded sample locality set (17 rows). Load the full G-NAF-derived
--   CSV and re-run to widen coverage.

BEGIN;

-- ── 1. Clear existing delivery config (FK-safe order) ───────────────────────────────────────────────
DELETE FROM public.shop_sameday_exception;
-- ⚠ Since 076 removing a group UNGROUPS its postcodes rather than deleting them, so the list is
-- cleared on its own first — without this a second run of this seed fails on a duplicate postcode.
DELETE FROM public.delivery_zone_postcode;
DELETE FROM public.delivery_zone;            -- cascades shop_sameday_exception
DELETE FROM public.delivery_fee_plan;        -- cascades its bands and window premiums
DELETE FROM public.delivery_collection_run;

-- ── 2. (077: there are no distance tiers any more — a postcode is priced from its own distance.) ───

-- ── 3. Coverage groups (real Melbourne/VIC areas) + their postcodes ─────────────────────────────────
-- same-day eligible: inner + middle only (realistic — driver runs can reach these same day).
INSERT INTO public.delivery_zone (id, code, name, sameday_eligible, status, updated_by) VALUES
  ('22222222-0000-0000-0000-000000000001', 'MEL-CBD',      'Melbourne CBD',         true,  'active', 'seed:047'),
  ('22222222-0000-0000-0000-000000000002', 'MEL-INNER-E',  'Inner East',            true,  'active', 'seed:047'),
  ('22222222-0000-0000-0000-000000000003', 'MEL-INNER-S',  'Inner South (bayside)', true,  'active', 'seed:047'),
  ('22222222-0000-0000-0000-000000000004', 'MEL-INNER-W',  'Inner West',            true,  'active', 'seed:047'),
  ('22222222-0000-0000-0000-000000000005', 'MEL-MIDDLE-W', 'Middle West',           true,  'active', 'seed:047'),
  ('22222222-0000-0000-0000-000000000006', 'MEL-OUTER-W',  'Outer West (Wyndham)',  false, 'active', 'seed:047'),
  ('22222222-0000-0000-0000-000000000007', 'GEELONG',      'Geelong',               false, 'active', 'seed:047'),
  ('22222222-0000-0000-0000-000000000008', 'BALLARAT',     'Ballarat',              false, 'active', 'seed:047'),
  ('22222222-0000-0000-0000-000000000009', 'BENDIGO',      'Bendigo',               false, 'active', 'seed:047');

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

-- ── 5. Hub + same-day prep buffer (settings singleton) ─────────────────────────────────────────────
-- Hub = Melbourne CBD. Prep buffer 120 min: a shop needs ~2h to pick + pack before a collection run.
INSERT INTO public.delivery_settings (id, hub_latitude, hub_longitude, sameday_prep_buffer_min, updated_by)
VALUES (1, -37.813600, 144.963100, 120, 'seed:047')
ON CONFLICT (id) DO UPDATE
  SET hub_latitude = EXCLUDED.hub_latitude, hub_longitude = EXCLUDED.hub_longitude,
      sameday_prep_buffer_min = EXCLUDED.sameday_prep_buffer_min, updated_by = EXCLUDED.updated_by,
      updated_at = now();

-- ── 6. Collection runs (drivers collect from shops; Australia/Melbourne wall clock) ────────────────
-- Three runs: with the 120-min buffer, the cutoffs are 10:00, 14:00 and 19:00. Same-day is offered while
-- the latest still-makeable cutoff is in the future — i.e. up to 19:00 (via the evening run). ⚠ The
-- evening run keeps same-day testable into the evening; drop it for a stricter afternoon-only cutoff.
INSERT INTO public.delivery_collection_run (run_time, label, status, updated_by) VALUES
  ('12:00', 'Midday run',    'active', 'seed:047'),
  ('16:00', 'Afternoon run', 'active', 'seed:047'),
  ('21:00', 'Evening run',   'active', 'seed:047');

COMMIT;

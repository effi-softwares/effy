-- 047 delivery — realistic dev seed (Melbourne-first). Idempotent: clears the delivery CONFIG and
-- re-inserts. ⚠ Touches ONLY delivery configuration — never public.locality, never orders.
--
-- Values are grounded in AU metro grocery/courier norms (research 2026-08):
--   • Melbourne rings from the CBD: inner ≤10 km, middle ≤25 km, outer ≤50 km, extended = regional VIC.
--   • Grocery metro delivery sits ~$5–$15; same-day is a premium ~1.5–1.8× standard (couriers quote
--     same-day 20–30%+ over standard; a grocery premium runs higher). We use 1.6×.
--   • Weight adds in slabs; a typical grocery basket is ≤10 kg, big shops 10–20 kg.
--   • Same-day only near the hub (inner/middle); regional is standard-only (can't reach 65–130 km today).
--
-- ⚠ Zones use postcodes present in the loaded sample locality set (17 rows). Load the full G-NAF-derived
--   CSV and re-run to widen coverage.

BEGIN;

-- ── 1. Clear existing delivery config (FK-safe order) ───────────────────────────────────────────────
DELETE FROM public.shop_sameday_exception;
DELETE FROM public.delivery_zone;            -- cascades delivery_zone_postcode + shop_sameday_exception
DELETE FROM public.delivery_fee_plan;        -- cascades delivery_ring_price + delivery_weight_band
DELETE FROM public.delivery_collection_run;
DELETE FROM public.delivery_ring;

-- ── 2. Distance rings (nearest → furthest; EXTENDED is open-ended) ──────────────────────────────────
INSERT INTO public.delivery_ring (id, code, name, ordinal, suggest_upper_km, status, updated_by) VALUES
  ('11111111-0000-0000-0000-000000000001', 'INNER',    'Inner Melbourne',   1, 10.00, 'active', 'seed:047'),
  ('11111111-0000-0000-0000-000000000002', 'MIDDLE',   'Middle Melbourne',  2, 25.00, 'active', 'seed:047'),
  ('11111111-0000-0000-0000-000000000003', 'OUTER',    'Outer Melbourne',   3, 50.00, 'active', 'seed:047'),
  ('11111111-0000-0000-0000-000000000004', 'EXTENDED', 'Regional Victoria', 4, NULL,  'active', 'seed:047');

-- ── 3. Zones (real Melbourne/VIC areas) + their postcodes ──────────────────────────────────────────
-- same-day eligible: inner + middle only (realistic — driver runs can reach these same day).
INSERT INTO public.delivery_zone (id, code, name, ring_id, sameday_eligible, status, updated_by) VALUES
  ('22222222-0000-0000-0000-000000000001', 'MEL-CBD',      'Melbourne CBD',        '11111111-0000-0000-0000-000000000001', true,  'active', 'seed:047'),
  ('22222222-0000-0000-0000-000000000002', 'MEL-INNER-E',  'Inner East',           '11111111-0000-0000-0000-000000000001', true,  'active', 'seed:047'),
  ('22222222-0000-0000-0000-000000000003', 'MEL-INNER-S',  'Inner South (bayside)','11111111-0000-0000-0000-000000000001', true,  'active', 'seed:047'),
  ('22222222-0000-0000-0000-000000000004', 'MEL-INNER-W',  'Inner West',           '11111111-0000-0000-0000-000000000001', true,  'active', 'seed:047'),
  ('22222222-0000-0000-0000-000000000005', 'MEL-MIDDLE-W', 'Middle West',          '11111111-0000-0000-0000-000000000002', true,  'active', 'seed:047'),
  ('22222222-0000-0000-0000-000000000006', 'MEL-OUTER-W',  'Outer West (Wyndham)', '11111111-0000-0000-0000-000000000003', false, 'active', 'seed:047'),
  ('22222222-0000-0000-0000-000000000007', 'GEELONG',      'Geelong',              '11111111-0000-0000-0000-000000000004', false, 'active', 'seed:047'),
  ('22222222-0000-0000-0000-000000000008', 'BALLARAT',     'Ballarat',             '11111111-0000-0000-0000-000000000004', false, 'active', 'seed:047'),
  ('22222222-0000-0000-0000-000000000009', 'BENDIGO',      'Bendigo',              '11111111-0000-0000-0000-000000000004', false, 'active', 'seed:047');

INSERT INTO public.delivery_zone_postcode (zone_id, postcode) VALUES
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
  ('22222222-0000-0000-0000-000000000009', '3550');  -- Bendigo

-- ── 4. The active shipping-fee plan ────────────────────────────────────────────────────────────────
-- fee = clamp( roundUp( factor × (ring_price + weight_add), 0.50 ), floor 4.00, cap 40.00 ).
INSERT INTO public.delivery_fee_plan
  (id, name, is_active, rounding_step, floor_amount, cap_amount, same_day_factor, standard_factor, created_by, activated_by, activated_at)
VALUES
  ('33333333-0000-0000-0000-000000000001', 'Melbourne Launch 2026', true, 0.50, 4.00, 40.00, 1.600, 1.000, 'seed:047', 'seed:047', now());

-- ring price = the standard base for that distance tier
INSERT INTO public.delivery_ring_price (plan_id, ring_id, price_amount) VALUES
  ('33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 5.00),   -- INNER
  ('33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002', 7.00),   -- MIDDLE
  ('33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000003', 10.00),  -- OUTER
  ('33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000004', 15.00);  -- EXTENDED

-- weight slabs (grocery basket weights) — add on top of the ring price; top slab is open-ended.
INSERT INTO public.delivery_weight_band (plan_id, upper_grams, add_amount) VALUES
  ('33333333-0000-0000-0000-000000000001',  5000, 0.00),   -- ≤ 5 kg  (a light basket)
  ('33333333-0000-0000-0000-000000000001', 10000, 2.00),   -- ≤ 10 kg (a typical weekly shop)
  ('33333333-0000-0000-0000-000000000001', 20000, 4.50),   -- ≤ 20 kg (a big shop)
  ('33333333-0000-0000-0000-000000000001', 40000, 8.00);   -- ≤ 40 kg (open-ended top: heavier takes this)

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

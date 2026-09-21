-- 061 fleet foundations — dev seed. Idempotent: clears 061's OWN data and re-inserts.
-- ⚠ Touches ONLY vehicles, vehicle holdings and shop ADDRESSES. Never drivers, never orders, never
--   delivery configuration (047 owns that).
--
-- ═══ THE FICTIONAL-DATA RULE, APPLIED PRECISELY ═══════════════════════════════════════════════════
-- The constitution governs values that REACH, NAME or BILL a person or organisation outside this
-- repository. That rule is applied here field by field rather than as a blanket:
--
--   • SUBURB and POSTCODE are REAL, and deliberately so. They are public geographic facts that
--     identify nobody, and slice C matches `shop.postcode` against `delivery_zone_postcode` — so a
--     made-up postcode would make every zone lookup miss and the seed would prove nothing. Every
--     postcode below is one 047's own seed already zones (db/seeds/047_delivery_dev.sql).
--   • STREET LINES ARE FICTIONAL. A real street number on a real street is somebody's home, and no
--     part of this platform needs one to be exercised.
--   • REGISTRATION PLATES ARE FICTIONAL. `EFY-###` is not a Victorian plate format; a plausible one
--     could belong to a real vehicle.
--   • NO BUSINESS IS NAMED. The shops are Effy's own internal nodes and already exist by code.
--
-- Vehicle mix is grounded in what a small Melbourne grocery fleet actually runs: mostly light vans,
-- one refrigerated van for chilled and frozen, a ute for bulk, and one driver-owned car — so the
-- ownership split, the refrigeration split and every body type are all walkable.

BEGIN;

-- ── 1. Clear 061's own data (FK-safe: holdings reference vehicles) ───────────────────────────────
DELETE FROM public.vehicle_holding;
DELETE FROM public.vehicle;

-- ── 2. Shop addresses ────────────────────────────────────────────────────────────────────────────
--
-- ⚠ ADDRESSED BY POSITION, NOT BY CODE, AND THAT IS DELIBERATE. The dev shops were created by hand
-- through the console, so their `code` values are operator-chosen and this file does not know them.
-- Guessing a code would make these UPDATEs match nothing and SILENTLY DO NOTHING — the seed would
-- report success, the walker would find no addresses, and nothing would say why. That is the
-- inferring-an-identifier trap the constitution names, in its quietest form.
--
-- So: take the two oldest ACTIVE shops that have no address yet, in a deterministic order. Works
-- whatever the codes are, is idempotent, and never overwrites an address an operator typed.
WITH target AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS n
    FROM public.shop
   WHERE status = 'active' AND address_line1 IS NULL
)
UPDATE public.shop s SET
  address_line1 = v.line1,
  suburb        = v.suburb,
  postcode      = v.postcode,
  state         = 'VIC'
FROM target t
JOIN (VALUES
  -- ⚠ Real suburb and postcode (public facts, identifying nobody) so slice C's postcode → zone
  -- lookup actually resolves; both are zoned by db/seeds/047_delivery_dev.sql. Fictional street line,
  -- because a real street number is somebody's home.
  (1, 'Unit 4, 100 Example Street',  'Richmond',  '3121'),
  (2, 'Unit 12, 250 Sample Road',    'Footscray', '3011')
) AS v(n, line1, suburb, postcode) ON v.n = t.n
WHERE s.id = t.id;

-- ⚠ A THIRD SHOP, IF ONE EXISTS, KEEPS A NULL ADDRESS ON PURPOSE. FR-030 says a missing address must
-- be VISIBLE rather than filled, and a walker needs at least one addressless shop to see that it is.

-- ── 3. The vehicle fleet ─────────────────────────────────────────────────────────────────────────
INSERT INTO public.vehicle
  (id, registration_plate, make, model, year, body_type, fuel_type, ownership,
   payload_kg, load_volume_litres, crate_capacity, can_carry_chilled, can_carry_frozen,
   registration_expires_on, insurance_policy_reference, insurance_expires_on, roadworthy_expires_on,
   odometer_km, status, status_reason, notes)
VALUES
  -- The workhorses: plain vans, compliant, available.
  ('33333333-0000-0000-0000-000000000001', 'EFY-001', 'Toyota', 'HiAce', 2023, 'van', 'diesel', 'effy_owned',
   1200, 6200, 40, false, false,
   (CURRENT_DATE + 210), 'POL-FICTIONAL-001', (CURRENT_DATE + 180), (CURRENT_DATE + 300),
   48120, 'active', NULL, NULL),

  ('33333333-0000-0000-0000-000000000002', 'EFY-002', 'Ford', 'Transit Custom', 2022, 'van', 'diesel', 'effy_owned',
   1000, 5900, 36, false, false,
   (CURRENT_DATE + 95), 'POL-FICTIONAL-002', (CURRENT_DATE + 260), (CURRENT_DATE + 140),
   72430, 'active', NULL, NULL),

  -- ⚠ The refrigerated van — the reason `can_carry_chilled` / `can_carry_frozen` exist at all.
  -- Effy sells groceries, so this is a capability the fleet is selected on, not a detail.
  ('33333333-0000-0000-0000-000000000003', 'EFY-003', 'Mercedes-Benz', 'Sprinter', 2024, 'van', 'diesel', 'effy_owned',
   1400, 9000, 52, true, true,
   (CURRENT_DATE + 320), 'POL-FICTIONAL-003', (CURRENT_DATE + 320), (CURRENT_DATE + 250),
   15980, 'active', NULL, 'Dual-zone refrigeration. The only vehicle that can take frozen.'),

  -- Chilled only, to prove the two capabilities are independent.
  ('33333333-0000-0000-0000-000000000004', 'EFY-004', 'Renault', 'Kangoo', 2021, 'van', 'electric', 'effy_owned',
   650, 3500, 20, true, false,
   (CURRENT_DATE + 60), 'POL-FICTIONAL-004', (CURRENT_DATE + 60), (CURRENT_DATE + 45),
   33210, 'active', NULL, 'Chilled compartment only — no freezer.'),

  -- ⚠ NON-COMPLIANT ON PURPOSE: registration lapsed a month ago. The register must show this without
  -- anybody opening the record, and it must NAME the registration rather than say "non-compliant".
  ('33333333-0000-0000-0000-000000000005', 'EFY-005', 'Isuzu', 'NLR', 2019, 'truck_light', 'diesel', 'effy_owned',
   2500, 14000, 80, false, false,
   (CURRENT_DATE - 30), 'POL-FICTIONAL-005', (CURRENT_DATE + 120), (CURRENT_DATE + 90),
   184600, 'active', NULL, 'Registration lapsed — do not issue until renewed.'),

  -- Bulk runs; every body type should exist so the filters are walkable.
  -- ⚠ load_volume_litres is NULL, NOT 0. A tray ute has no ENCLOSED load space at all, and the
  -- schema's CHECK (> 0) is right to refuse zero: "not applicable" and "a volume of nothing" are
  -- different facts, and storing 0 would let a capacity filter treat it as a measured value.
  ('33333333-0000-0000-0000-000000000006', 'EFY-006', 'Toyota', 'HiLux', 2022, 'ute', 'diesel', 'effy_owned',
   1000, NULL, 12, false, false,
   (CURRENT_DATE + 150), 'POL-FICTIONAL-006', (CURRENT_DATE + 150), (CURRENT_DATE + 200),
   91050, 'active', NULL, 'Tray only — no enclosed load space.'),

  -- ⚠ DRIVER-OWNED, and managed IDENTICALLY to an Effy-owned vehicle. One table, one set of
  -- behaviours, distinguished by a fact about the vehicle rather than by a second feature (FR-005).
  ('33333333-0000-0000-0000-000000000007', 'EFY-007', 'Hyundai', 'i30', 2020, 'car', 'petrol', 'driver_owned',
   400, 1200, 8, false, false,
   (CURRENT_DATE + 240), 'POL-FICTIONAL-007', (CURRENT_DATE + 240), (CURRENT_DATE + 180),
   127800, 'active', NULL, 'Owned by the driver; used for small same-day runs.'),

  -- ⚠ OFF THE ROAD, not retired. Temporary: it comes back. The two must stay distinguishable, or
  -- "where did the van go?" becomes unanswerable.
  ('33333333-0000-0000-0000-000000000008', 'EFY-008', 'Ford', 'Transit', 2018, 'van', 'diesel', 'effy_owned',
   1100, 6000, 38, false, false,
   (CURRENT_DATE + 100), 'POL-FICTIONAL-008', (CURRENT_DATE + 100), (CURRENT_DATE + 20),
   210500, 'off_road', 'In the workshop — clutch replacement, back next week.', NULL),

  -- ⚠ RETIRED. Its record and history survive; it can never be issued again.
  ('33333333-0000-0000-0000-000000000009', 'EFY-009', 'Mitsubishi', 'Express', 2014, 'van', 'petrol', 'effy_owned',
   900, 5000, 30, false, false,
   (CURRENT_DATE - 400), 'POL-FICTIONAL-009', (CURRENT_DATE - 400), (CURRENT_DATE - 380),
   402900, 'retired', 'Sold at auction after 11 years.', NULL),

  -- The last body type, so every filter option has at least one row behind it.
  ('33333333-0000-0000-0000-00000000000a', 'EFY-010', 'Honda', 'CB125', 2023, 'motorcycle', 'petrol', 'effy_owned',
   30, 60, 1, false, false,
   (CURRENT_DATE + 280), 'POL-FICTIONAL-010', (CURRENT_DATE + 280), (CURRENT_DATE + 260),
   8400, 'active', NULL, 'Documents and very small parcels only.');

-- ── 4. No holdings are seeded, deliberately ──────────────────────────────────────────────────────
-- ⚠ Issuing a vehicle is the thing a walker is supposed to DO (quickstart W4–W8), and pre-seeding a
-- holding would rob them of the step that proves FR-012/FR-013 refuse a second one. It would also
-- couple this seed to whichever driver rows happen to exist, which no seed here should assume.

COMMIT;

-- 062 driver zone capability — dev seed. Idempotent: clears 062's OWN data and re-inserts.
-- ⚠ Touches ONLY driver clearances. Never drivers themselves, never zones, never vehicles.
--
-- ═══ WHAT A WALKER MUST BE ABLE TO SEE ═══════════════════════════════════════════════════════════
-- The quickstart's §5 walk needs all of these to exist at once, and none of them can be reasoned
-- about from an empty table:
--
--   · a driver cleared for EVERYTHING, EVERYWHERE — so "every zone" is visible as a fact rather than
--     as an enumeration, and so W6 (create a zone, watch them cover it) has a subject;
--   · a driver cleared NARROWLY — one function, one method, one zone — so the register can be seen
--     to distinguish breadth;
--   · a driver cleared for NOTHING — an ordinary state for a new starter, and the one FR-015 says
--     must read as a stated fact rather than as blank space;
--   · at least one ZONE NOBODY CAN SERVE, so the coverage view has a real gap to report (FR-030).
--
-- ⚠ NO REAL-WORLD IDENTIFIERS ARE INTRODUCED. Clearances name no person, business or address — they
-- reference drivers and zones that already exist. Drivers are matched by NAME ORDER rather than by a
-- hard-coded id or email, because dev drivers were provisioned by hand and this file does not know
-- their ids. Guessing one would make the insert match nothing and SILENTLY DO NOTHING.

BEGIN;

-- ── 1. Clear 062's own data ──────────────────────────────────────────────────────────────────────
DELETE FROM public.driver_zone_capability;

-- ── 2. Three clearance profiles, assigned by position ────────────────────────────────────────────
-- Takes active drivers in a deterministic order. Works whatever their ids are, and re-running is a
-- no-op because step 1 clears first.
WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS n
    FROM public.driver
   WHERE status = 'active'
),
-- Driver 1: DELIVERY, EVERYWHERE. ⚠ Two rows, each with zone_id NULL — the "every zone" fact.
--
-- ⚠ DELIVERY ONLY, AND THAT IS WHAT MAKES FR-030 TRUE BY CONSTRUCTION. If this driver were cleared
-- for everything, an every-zone grant would cover every zone for every kind of work and the coverage
-- view could NEVER report `no_driver_cleared` — the walker would have to stand somebody down to see
-- the state the screen exists for. Clearing them for delivery only leaves COLLECTION uncovered
-- everywhere, so both gap reasons are visible the moment the seed loads.
everywhere AS (
  INSERT INTO public.driver_zone_capability (driver_id, function, method, zone_id, granted_by_sub)
  SELECT r.id, 'delivery', m.method, NULL, 'seed:062'
    FROM ranked r
    CROSS JOIN (VALUES ('standard'), ('same_day')) AS m(method)
   WHERE r.n = 1
  RETURNING 1
),
-- Driver 2: NARROW. Same-day delivery, in exactly one zone — the closest active zone by name, so the
-- seed does not depend on which zones happen to exist.
narrow AS (
  INSERT INTO public.driver_zone_capability (driver_id, function, method, zone_id, granted_by_sub)
  SELECT r.id, 'delivery', 'same_day', z.id, 'seed:062'
    FROM ranked r
    CROSS JOIN LATERAL (
      SELECT id FROM public.delivery_zone
       WHERE status = 'active' AND sameday_eligible
       ORDER BY name LIMIT 1
    ) z
   WHERE r.n = 2
  RETURNING 1
)
-- Driver 3 and beyond: cleared for NOTHING. ⚠ Deliberately no rows — a walker needs to see that an
-- uncleared driver reads as "Nothing yet" and is blocked with `no_capabilities`, not as blank space.
SELECT 1;

-- ── 3. Both coverage reasons are visible on load (FR-030) ────────────────────────────────────────
-- ⚠ GUARANTEED BY CONSTRUCTION, not by hoping:
--
--   · COLLECTION is uncovered in every zone, because nobody above is cleared to collect. The
--     coverage view reports `no_driver_cleared` — an administrative gap, fixed by granting somebody
--     a clearance. This is W10.
--   · DELIVERY is covered on paper by driver 1, but 061's seed hands nobody a vehicle, so that
--     driver is blocked (`no_vehicle`) and the view reports `all_cleared_unavailable` — a rostering
--     problem, fixed elsewhere. This is W11.
--
-- Two reasons, two remedies, both on screen without the walker having to arrange anything.

COMMIT;

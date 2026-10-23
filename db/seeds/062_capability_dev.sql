-- Driver clearance dev seed. Idempotent: Clears and re-inserts driver clearances only (never drivers, zones
-- or vehicles). It needs drivers to exist, and sets up at once:
--   · a driver cleared for everything, everywhere (so "every zone" shows as a fact, and a new zone is covered);
--   · a driver cleared narrowly (one function, one zone);
--   · a driver cleared for nothing (a new starter's ordinary state);
--   · a zone nobody can serve, so the coverage view has a real gap.
--
-- Drivers are matched by name order, not by id or email: They are provisioned by hand, and a guessed
-- identifier would match nothing and silently do nothing.

BEGIN;

-- ── 1. Clear its own data ──────────────────────────────────────────────────────────────────────
DELETE FROM public.driver_zone_capability;

-- ── 2. Three clearance profiles, assigned by position ────────────────────────────────────────────
-- Takes active drivers in a deterministic order. Works whatever their ids are, and re-running is a
-- no-op because step 1 clears first.
WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS n
    FROM public.driver
   WHERE status = 'active'
),
-- Driver 1: Delivery, everywhere. One row with zone_id NULL — the "every zone" fact. (A clearance
-- is a function and an area; the method column went with 083.)
--
-- Delivery only, and that is what makes the spec true by construction. If this driver were cleared
-- for everything, an every-zone grant would cover every zone for every kind of work and the coverage
-- view could NEVER report `no_driver_cleared` — the walker would have to stand somebody down to see
-- the state the screen exists for. Clearing them for delivery only leaves COLLECTION uncovered
-- everywhere, so both gap reasons are visible the moment the seed loads.
everywhere AS (
  INSERT INTO public.driver_zone_capability (driver_id, function, zone_id, granted_by_sub)
  SELECT r.id, 'delivery', NULL, 'seed:062'
    FROM ranked r
   WHERE r.n = 1
  ON CONFLICT DO NOTHING
  RETURNING 1
),
-- Driver 2: NARROW. Delivery, in exactly one group — the first active group by name, so the seed
-- does not depend on which groups happen to exist.
narrow AS (
  INSERT INTO public.driver_zone_capability (driver_id, function, zone_id, granted_by_sub)
  SELECT r.id, 'delivery', z.id, 'seed:062'
    FROM ranked r
    CROSS JOIN LATERAL (
      SELECT id FROM public.delivery_zone
       WHERE status = 'active'
       ORDER BY name LIMIT 1
    ) z
   WHERE r.n = 2
  ON CONFLICT DO NOTHING
  RETURNING 1
)
-- Driver 3 and beyond: Cleared for NOTHING. Deliberately no rows — a walker needs to see that an
-- uncleared driver reads as "Nothing yet" and is blocked with `no_capabilities`, not as blank space.
SELECT 1;

-- ── 3. Both coverage reasons are visible on load ────────────────────────────────────────
-- Guaranteed by construction, not by hoping:
--
--   · COLLECTION is uncovered in every zone, because nobody above is cleared to collect. The
--     coverage view reports `no_driver_cleared` — an administrative gap, fixed by granting somebody
--     a clearance.
--   · DELIVERY is covered on paper by driver 1, but the fleet seed hands nobody a vehicle, so that
--     driver is blocked (`no_vehicle`) and the view reports `all_cleared_unavailable` — a rostering
--     problem, fixed elsewhere.
--
-- Two reasons, two remedies, both on screen without the walker having to arrange anything.

COMMIT;

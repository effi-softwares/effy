-- 077 pre-flight — READ-ONLY. Run it BEFORE the first 077 migration (quickstart, operator step 1).
--
-- The new fee prices every postcode from ITS OWN distance from the hub. Until now a postcode was
-- priced on its zone's tier — one tier for the whole zone, sometimes picked by hand. Wherever those
-- two disagree, the fee moves at release. This shows every such postcode, so the change is something
-- you decided and not something you found out.
--
--   Result 1 — the active plan's multipliers. `standard_factor` MUST be 1: the migration refuses to
--              run otherwise, because copying tier prices would then change EVERY fee.
--   Result 2 — one row per postcode whose fee tier will change, with the delivery fee for a 1 kg
--              basket on a later day, before and after.
--              NO ROWS = nobody's standard fee moves.
--
-- It changes nothing and can be run as often as you like. It cannot be run after the tier tables
-- are dropped (the second 077 migration) — by then there is no "before" to compare.

SELECT name                      AS active_plan,
       standard_factor,
       same_day_factor,
       CASE WHEN standard_factor = 1
            THEN 'ok — tier prices carry across unchanged'
            ELSE 'STOP — the migration will refuse: standard_factor is not 1'
       END                       AS verdict
  FROM public.delivery_fee_plan
 WHERE is_active;

WITH plan AS (
    SELECT id, rounding_step, floor_amount, cap_amount, standard_factor
      FROM public.delivery_fee_plan
     WHERE is_active
),
-- What a 1 kg basket adds: the smallest weight band that holds it, else the heaviest.
weight AS (
    SELECT COALESCE(
               (SELECT b.add_amount FROM public.delivery_weight_band b, plan p
                 WHERE b.plan_id = p.id AND b.upper_grams >= 1000 ORDER BY b.upper_grams LIMIT 1),
               (SELECT b.add_amount FROM public.delivery_weight_band b, plan p
                 WHERE b.plan_id = p.id ORDER BY b.upper_grams DESC LIMIT 1),
               0) AS add_amount
),
listed AS (
    SELECT zp.postcode,
           z.name                                                          AS group_name,
           zp.distance_km,
           zp.distance_source,
           -- the tier it is priced on TODAY (the 076 bridge)
           COALESCE(z.ring_id, public.coverage_ring_for_km(zp.distance_km)) AS tier_today,
           -- the tier its own distance falls in — what the new distance bands price
           public.coverage_ring_for_km(zp.distance_km)                      AS tier_by_distance
      FROM public.delivery_zone_postcode zp
      LEFT JOIN public.delivery_zone z ON z.id = zp.zone_id AND z.status = 'active'
),
priced AS (
    SELECT l.*,
           rt.name AS tier_today_name,
           rd.name AS tier_by_distance_name,
           pt.price_amount AS price_today,
           pd.price_amount AS price_by_distance
      FROM listed l
      CROSS JOIN plan p
      LEFT JOIN public.delivery_ring rt ON rt.id = l.tier_today
      LEFT JOIN public.delivery_ring rd ON rd.id = l.tier_by_distance
      LEFT JOIN public.delivery_ring_price pt ON pt.plan_id = p.id AND pt.ring_id = l.tier_today
      LEFT JOIN public.delivery_ring_price pd ON pd.plan_id = p.id AND pd.ring_id = l.tier_by_distance
)
SELECT pr.postcode,
       pr.group_name                    AS "group",
       pr.distance_km,
       pr.distance_source,
       pr.tier_today_name               AS tier_today,
       pr.tier_by_distance_name         AS tier_after,
       least(greatest(ceil(p.standard_factor * (pr.price_today + w.add_amount) / p.rounding_step) * p.rounding_step,
                      p.floor_amount), p.cap_amount)::numeric(12, 2) AS fee_1kg_today,
       least(greatest(ceil((pr.price_by_distance + w.add_amount) / p.rounding_step) * p.rounding_step,
                      p.floor_amount), p.cap_amount)::numeric(12, 2) AS fee_1kg_after
  FROM priced pr
  CROSS JOIN plan p
  CROSS JOIN weight w
 WHERE pr.tier_today IS DISTINCT FROM pr.tier_by_distance
 ORDER BY pr.postcode;

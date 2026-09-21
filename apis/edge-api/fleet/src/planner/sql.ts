// The wave planner's reads (063). Raw parameterised SQL, no ORM, no query builder (Principle VI).
//
// ⚠ NO COORDINATE, DISTANCE OR TRAVEL-TIME COLUMN IS SELECTED ANYWHERE IN THIS FILE, and none exists
// to select (D20/D22). A shop has an ADDRESS so a driver knows where to drive; nothing computes how
// far it is.

/**
 * Packages a wave may pick up: ready, not already in an open assignment, and — for a delivery wave —
 * already checked in at the hub.
 *
 * ⚠ `ready_for_pickup` IS THE SHOP'S TERMINAL STATE (020). A package enters a wave there and nowhere
 * else; the planner never writes any other `shop_fulfillment` status, because the shop's lifecycle
 * belongs to the shop.
 *
 * ⚠ `delivery_method IS NULL` IS TREATED AS `standard` (research R9). A pre-047 package was never
 * sold as same-day, so defaulting it the other way would promise a shopper something nobody offered.
 *
 * ⚠ The `NOT EXISTS` is a read-side filter and is NOT what makes assignment exclusive — the partial
 * unique index `round_package_open_uq` is (FR-005). Two passes can both pass this check and only one
 * can win the insert. A check-then-write has never been a guarantee (039, 052, 054).
 */
export const GATHER_COLLECTION = `
  SELECT sf.id                                   AS package_id,
         o.order_number                          AS order_number,
         sf.shop_id                              AS shop_id,
         s.name                                  AS shop_name,
         s.address_line1, s.address_line2, s.suburb, s.postcode, s.state,
         COALESCE(sf.delivery_method, 'standard') AS method,
         z.id                                    AS zone_id,
         z.name                                  AS zone_name,
         sf.state_changed_at                     AS ready_since,
         COALESCE(SUM(oi.quantity * p.weight_grams), 0)::bigint AS weight_grams,
         COUNT(oi.id)::bigint                    AS item_count,
         bool_or(ad.key = 'storage' AND pav.value_text = 'chilled') AS requires_chilled,
         bool_or(ad.key = 'storage' AND pav.value_text = 'frozen')  AS requires_frozen
    FROM public.shop_fulfillment sf
    JOIN public."order"        o  ON o.id = sf.order_id
    JOIN public.shop           s  ON s.id = sf.shop_id
    LEFT JOIN public.order_item oi ON oi.order_id = sf.order_id AND oi.shop_id = sf.shop_id
    LEFT JOIN public.product    p  ON p.id = oi.product_id
    LEFT JOIN public.product_attribute_value pav ON pav.product_id = p.id
    LEFT JOIN public.attribute_definition    ad  ON ad.id = pav.attribute_definition_id AND ad.key = 'storage'
    LEFT JOIN public.delivery_zone_postcode zp ON zp.postcode = (o.delivery_address ->> 'postalCode')
    LEFT JOIN public.delivery_zone          z  ON z.id = zp.zone_id AND z.status = 'active'
   WHERE sf.status = 'ready_for_pickup'
     AND NOT EXISTS (
           SELECT 1
             FROM public.round_package rp
            WHERE rp.shop_fulfillment_id = sf.id AND rp.state = 'assigned'
         )
   GROUP BY sf.id, o.order_number, sf.shop_id, s.name, s.address_line1, s.address_line2,
            s.suburb, s.postcode, s.state, sf.delivery_method, z.id, z.name, sf.state_changed_at
   ORDER BY sf.state_changed_at ASC
`;

/**
 * Same-day packages that have ARRIVED at the hub and are not already out for delivery.
 *
 * ⚠ THE HUB CHECK-IN IS THE PRECONDITION, not a `shop_fulfillment` status (research R9, and 053's
 * reasoning for `carrier_handoff`): a package on the hub floor and one in a driver's van are the same
 * fact to a shopper, so the status would exist only to be mapped. The check-in row's EXISTENCE is the
 * fact.
 *
 * ⚠ STANDARD PACKAGES ARE STRUCTURALLY ABSENT (FR-024), not filtered out downstream. A standard
 * package's driver-side work ends at check-in and it must enter no delivery round; making it
 * unselectable here is stronger than remembering to exclude it later.
 *
 * ⚠ FIVE COLUMN NAMES IN THE FIRST DRAFT OF THIS FILE DID NOT EXIST, and every one of them
 * typechecked perfectly. Found only by running the queries against real PostgreSQL:
 *
 *   · `product.requires_chilled` / `requires_frozen`  → refrigeration is the `storage` PRODUCT
 *     ATTRIBUTE (`single_select`: ambient/chilled/frozen), not a column — and its value lives in
 *     `product_attribute_value.value_text`, not a column called `value`
 *   · `order.delivery_address_id`                     → `delivery_address` is a jsonb SNAPSHOT
 *   · `customer_address.postcode`                     → the column is `postal_code`, and `city` not
 *                                                       `suburb` (056 lost a container test here)
 *   · `delivery_collection_run.is_active`             → the column is `status`
 *   · `delivery_zone.postcode`                        → the mapping is `delivery_zone_postcode`
 *
 * 056 recorded two of these exact shapes (`order.reference` → `order_number`,
 * `customer_address.suburb` → `city`). A wrong column name is invisible to `tsc` and to every mocked
 * unit test, and fails the first time a real operator opens the screen.
 */
export const GATHER_DELIVERY = `
  SELECT sf.id                       AS package_id,
         o.order_number              AS order_number,
         sf.shop_id                  AS shop_id,
         s.name                      AS shop_name,
         o.id                        AS order_id,
         o.delivery_address ->> 'recipientName' AS recipient_name,
         o.delivery_address ->> 'line1'         AS address_line1,
         o.delivery_address ->> 'line2'         AS address_line2,
         o.delivery_address ->> 'city'          AS suburb,
         o.delivery_address ->> 'postalCode'    AS postcode,
         o.delivery_address ->> 'region'        AS state,
         'same_day'::text            AS method,
         z.id                        AS zone_id,
         z.name                      AS zone_name,
         hc.checked_in_at            AS ready_since,
         COALESCE(SUM(oi.quantity * p.weight_grams), 0)::bigint AS weight_grams,
         COUNT(oi.id)::bigint        AS item_count,
         bool_or(ad.key = 'storage' AND pav.value_text = 'chilled') AS requires_chilled,
         bool_or(ad.key = 'storage' AND pav.value_text = 'frozen')  AS requires_frozen
    FROM public.round_package rp
    JOIN public.round_stop     rs ON rs.id = rp.stop_id
    JOIN public.driver_round   dr ON dr.id = rs.round_id AND dr.kind = 'collection'
    JOIN public.hub_checkin    hc ON hc.round_id = dr.id
    JOIN public.shop_fulfillment sf ON sf.id = rp.shop_fulfillment_id
    JOIN public."order"        o  ON o.id = sf.order_id
    JOIN public.shop           s  ON s.id = sf.shop_id
    LEFT JOIN public.order_item oi ON oi.order_id = sf.order_id AND oi.shop_id = sf.shop_id
    LEFT JOIN public.product    p  ON p.id = oi.product_id
    LEFT JOIN public.product_attribute_value pav ON pav.product_id = p.id
    LEFT JOIN public.attribute_definition    ad  ON ad.id = pav.attribute_definition_id AND ad.key = 'storage'
    LEFT JOIN public.delivery_zone_postcode zp ON zp.postcode = (o.delivery_address ->> 'postalCode')
    LEFT JOIN public.delivery_zone          z  ON z.id = zp.zone_id AND z.status = 'active'
   WHERE rp.state = 'picked_up'
     AND sf.delivery_method = 'same_day'
     AND NOT EXISTS (
           SELECT 1
             FROM public.round_package open_rp
            WHERE open_rp.shop_fulfillment_id = sf.id AND open_rp.state = 'assigned'
         )
   GROUP BY sf.id, o.order_number, sf.shop_id, s.name, o.id, o.delivery_address,
            z.id, z.name, hc.checked_in_at
   ORDER BY hc.checked_in_at ASC
`;

/**
 * On-duty drivers with everything an eligibility decision needs, in ONE round trip.
 *
 * ⚠ ONE QUERY, NOT N+1. 029 found `GET /v1/storefront/home` intermittently 503-ing because it issued
 * eight serial queries against a Sydney database at ~135 ms each; 027 hit the same wall on the cart
 * write path. Clearances and the held vehicle are aggregated here rather than fetched per driver.
 *
 * ⚠ `packages_assigned_today` IS COUNTED, NEVER STORED (027's counted-not-stored rule, its fourth
 * application) — and it counts packages ASSIGNED TODAY, not packages currently outstanding
 * (research R7). Counting outstanding work hands the most work to whoever finishes fastest.
 *
 * ⚠ `c.zone_id IS NULL` MEANS EVERY ZONE, including zones created after the clearance was granted
 * (062 FR-011). It is carried through as NULL rather than expanded into today's zone list, because an
 * expansion is correct when written and quietly wrong the first time a zone is added.
 */
export const CANDIDATE_DRIVERS = `
  SELECT d.id                    AS driver_id,
         d.name                  AS driver_name,
         d.status                AS status,
         d.licence_expires_on    AS licence_expires_on,
         ds.expected_end_at      AS expected_end_at,
         (ds.id IS NOT NULL)     AS on_duty,
         v.id                    AS vehicle_id,
         v.payload_kg            AS payload_kg,
         COALESCE(v.can_carry_chilled, false) AS can_carry_chilled,
         COALESCE(v.can_carry_frozen,  false) AS can_carry_frozen,
         COALESCE(
           (SELECT json_agg(json_build_object('function', c.function, 'method', c.method, 'zoneId', c.zone_id))
              FROM public.driver_zone_capability c
              LEFT JOIN public.delivery_zone cz ON cz.id = c.zone_id
             WHERE c.driver_id = d.id
               AND (c.zone_id IS NULL OR cz.status = 'active')),
           '[]'::json
         )                       AS clearances,
         COALESCE(
           (SELECT count(*)
              FROM public.round_package rp
              JOIN public.round_stop   rs ON rs.id = rp.stop_id
              JOIN public.driver_round dr ON dr.id = rs.round_id
             WHERE dr.driver_id = d.id
               AND rp.created_at >= date_trunc('day', now() AT TIME ZONE 'Australia/Melbourne')
                                    AT TIME ZONE 'Australia/Melbourne'),
           0
         )::bigint               AS packages_assigned_today
    FROM public.driver d
    LEFT JOIN public.driver_duty_session ds ON ds.driver_id = d.id AND ds.ended_at IS NULL
    LEFT JOIN public.vehicle_holding    vh ON vh.driver_id = d.id AND vh.ended_at IS NULL
    LEFT JOIN public.vehicle             v ON v.id = vh.vehicle_id
   WHERE d.status <> 'offboarded'
   ORDER BY d.id
`;

/** The active collection schedule — the wave trigger's only input (research R1). */
export const COLLECTION_SCHEDULE = `
  SELECT EXTRACT(HOUR   FROM r.run_time)::int AS hour,
         EXTRACT(MINUTE FROM r.run_time)::int AS minute
    FROM public.delivery_collection_run r
   WHERE r.status = 'active'
   ORDER BY r.run_time
`;

/** Planner configuration. ⚠ Values, never literals (research R11). */
export const PLANNER_SETTINGS = `
  SELECT sameday_prep_buffer_min, planning_lead_min, per_stop_allowance_min
    FROM public.delivery_settings
   WHERE id = 1
`;

/**
 * A round already under way that this shop's stop is still outstanding on — the FR-004a target.
 *
 * ⚠ A LATE PACKAGE JOINS ONLY WHERE THE WORK IS STILL TO DO. If the driver has already been to that
 * shop, adding the package would put it on a round that will never return there, and it would look
 * assigned while nobody is going to collect it — worse than waiting for the next wave.
 */
export const OPEN_STOP_FOR_SHOP = `
  SELECT rs.id AS stop_id, dr.id AS round_id, dr.driver_id, dr.deadline_at, dr.locked_by_sub
    FROM public.round_stop   rs
    JOIN public.driver_round dr ON dr.id = rs.round_id
   WHERE dr.kind = 'collection'
     AND dr.status IN ('planned', 'in_progress')
     AND rs.kind = 'shop_pickup'
     AND rs.shop_id = $1
     AND rs.status IN ('pending', 'arrived')
   ORDER BY dr.created_at ASC
   LIMIT 1
`;

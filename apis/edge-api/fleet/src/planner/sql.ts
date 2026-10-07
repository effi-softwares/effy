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
         COALESCE(bool_or(st.chilled), false) AS requires_chilled,
         COALESCE(bool_or(st.frozen),  false) AS requires_frozen
    FROM public.shop_fulfillment sf
    JOIN public."order"        o  ON o.id = sf.order_id
    JOIN public.shop           s  ON s.id = sf.shop_id
    LEFT JOIN public.order_item oi ON oi.order_id = sf.order_id AND oi.shop_id = sf.shop_id
    LEFT JOIN public.product    p  ON p.id = oi.product_id
    -- ⚠ 072 — ONE ROW PER ORDER LINE, WHATEVER THE PRODUCT'S ATTRIBUTES. This used to join every
    -- attribute value a product has and then test which one was 'storage'; a product with five
    -- attribute values therefore contributed its weight FIVE TIMES to the SUM above, and the capacity
    -- gate judged a van against a multiple of what it was carrying. Unseen while the fixtures had no
    -- order lines at all. The lateral yields exactly one row per line.
    LEFT JOIN LATERAL (
      SELECT bool_or(pav.value_text = 'chilled') AS chilled,
             bool_or(pav.value_text = 'frozen')  AS frozen
        FROM public.product_attribute_value pav
        JOIN public.attribute_definition ad ON ad.id = pav.attribute_definition_id AND ad.key = 'storage'
       WHERE pav.product_id = p.id
    ) st ON TRUE
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
         -- 069 — the window the customer was sold. NULL for an order placed before 069. ⚠ Read as
         -- stored INSTANTS: checkout turned the slot's wall-clock times into these once, and nothing
         -- here rebuilds one (research R5) — which is why this needed no Go↔TypeScript duplicate.
         opd.window_start            AS window_start,
         opd.window_end              AS window_end,
         COALESCE(SUM(oi.quantity * p.weight_grams), 0)::bigint AS weight_grams,
         COUNT(oi.id)::bigint        AS item_count,
         COALESCE(bool_or(st.chilled), false) AS requires_chilled,
         COALESCE(bool_or(st.frozen),  false) AS requires_frozen
    FROM public.round_package rp
    JOIN public.round_stop     rs ON rs.id = rp.stop_id
    JOIN public.driver_round   dr ON dr.id = rs.round_id AND dr.kind = 'collection'
    JOIN public.hub_checkin    hc ON hc.round_id = dr.id
    JOIN public.shop_fulfillment sf ON sf.id = rp.shop_fulfillment_id
    JOIN public."order"        o  ON o.id = sf.order_id
    JOIN public.shop           s  ON s.id = sf.shop_id
    LEFT JOIN public.order_package_delivery opd ON opd.order_id = sf.order_id AND opd.shop_id = sf.shop_id
    LEFT JOIN public.order_item oi ON oi.order_id = sf.order_id AND oi.shop_id = sf.shop_id
    LEFT JOIN public.product    p  ON p.id = oi.product_id
    -- ⚠ 072 — ONE ROW PER ORDER LINE, WHATEVER THE PRODUCT'S ATTRIBUTES. This used to join every
    -- attribute value a product has and then test which one was 'storage'; a product with five
    -- attribute values therefore contributed its weight FIVE TIMES to the SUM above, and the capacity
    -- gate judged a van against a multiple of what it was carrying. Unseen while the fixtures had no
    -- order lines at all. The lateral yields exactly one row per line.
    LEFT JOIN LATERAL (
      SELECT bool_or(pav.value_text = 'chilled') AS chilled,
             bool_or(pav.value_text = 'frozen')  AS frozen
        FROM public.product_attribute_value pav
        JOIN public.attribute_definition ad ON ad.id = pav.attribute_definition_id AND ad.key = 'storage'
       WHERE pav.product_id = p.id
    ) st ON TRUE
    LEFT JOIN public.delivery_zone_postcode zp ON zp.postcode = (o.delivery_address ->> 'postalCode')
    LEFT JOIN public.delivery_zone          z  ON z.id = zp.zone_id AND z.status = 'active'
   WHERE rp.state = 'picked_up'
     AND sf.delivery_method = 'same_day'
     -- ⚠ 072 — STILL TO BE DELIVERED. Without this a package that HAS been delivered matches again:
     -- its collection row is 'picked_up' for ever and its delivery row is 'delivered', not 'assigned',
     -- so the NOT EXISTS below passes and the next pass puts it on a new delivery round. Proof moves
     -- the fulfillment 'collected' -> 'delivered' (064), which is the fact this reads.
     AND sf.status = 'collected'
     AND NOT EXISTS (
           SELECT 1
             FROM public.round_package open_rp
            WHERE open_rp.shop_fulfillment_id = sf.id AND open_rp.state = 'assigned'
         )
   GROUP BY sf.id, o.order_number, sf.shop_id, s.name, o.id, o.delivery_address,
            z.id, z.name, hc.checked_in_at, opd.window_start, opd.window_end
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
 * The unlocked rounds that already exist for one run or one delivery window (072) — one row per
 * stop, oldest round first.
 *
 * ⚠ THE BUCKET IS (kind, deadline_at, window_start_at). For a collection round `deadline_at` IS the
 * run's instant, so no run reference is stored or needed. `IS NOT DISTINCT FROM` because a windowless
 * delivery round has NULL there and must still match itself.
 *
 * ⚠ LOCKED ROUNDS ARE STRUCTURALLY ABSENT (FR-019). The planner cannot add to a round it is never
 * shown — stronger than loading it and remembering to skip it.
 *
 * ⚠ THE WEIGHT EXPRESSION IS THE GATHER'S, VERBATIM. A round's weight must be the sum of what the
 * gather said each package weighed, or the capacity gate compares two different quantities.
 *
 * ⚠ A LATE PACKAGE JOINS ONLY WHERE THE WORK IS STILL TO DO (063). `outstanding` names the FINISHED
 * states, not the open ones (2026-09-30), so a future in-progress stop state stays joinable without
 * anyone remembering to add it here.
 */
export const BUCKET_ROUNDS = `
  SELECT dr.id          AS round_id,
         dr.driver_id   AS driver_id,
         dr.status      AS status,
         rs.id          AS stop_id,
         rs.kind        AS stop_kind,
         rs.shop_id     AS shop_id,
         rs.order_id    AS order_id,
         (rs.status NOT IN ('done', 'skipped')) AS outstanding,
         COALESCE((
           SELECT SUM(oi.quantity * p.weight_grams)
             FROM public.round_package rp
             JOIN public.shop_fulfillment sf ON sf.id = rp.shop_fulfillment_id
             JOIN public.order_item oi ON oi.order_id = sf.order_id AND oi.shop_id = sf.shop_id
             JOIN public.product    p  ON p.id = oi.product_id
            WHERE rp.stop_id = rs.id AND rp.state IN ('assigned', 'picked_up')
         ), 0)::bigint  AS stop_weight_grams
    FROM public.driver_round dr
    LEFT JOIN public.round_stop rs ON rs.round_id = dr.id
   WHERE dr.kind = $1
     AND dr.deadline_at = $2
     AND dr.window_start_at IS NOT DISTINCT FROM $3
     AND dr.status IN ('planned', 'in_progress')
     AND dr.locked_by_sub IS NULL
   ORDER BY dr.created_at ASC, dr.id ASC, rs.id ASC
`;

/** When a round for this run or window opens — the database's one definition (072, research R3). */
export const ROUND_OPENS_AT = `
  SELECT public.round_opens_at($1::text, $2::timestamptz, $3::timestamptz) AS opens_at
`;

/**
 * ⚠ ONE PASS AT A TIME (072, research R4). Find-then-create a driver's round is a check-then-write,
 * and a check-then-write has never been a guarantee (039, 052, 054). A transaction-scoped advisory
 * lock makes the whole pass exclusive without a unique index on the bucket — which would refuse a
 * dispatcher moving a round to a driver who already holds one for the same run.
 */
export const TRY_PASS_LOCK = `SELECT pg_try_advisory_xact_lock(72063001) AS locked`;

// ── Returning work nobody can do (072, research R10) ──────────────────────────────────────────────

/**
 * Unlocked, unfinished rounds held by a driver who cannot work them: no open duty session, or not
 * active. ⚠ 063 FR-035 required this and nothing implemented it; with rounds assigned hours ahead it
 * is the difference between a driver going home and a driver going home with tomorrow's run.
 */
export const UNWORKABLE_ROUNDS = `
  SELECT dr.id, dr.driver_id, dr.kind, dr.status
    FROM public.driver_round dr
    JOIN public.driver d ON d.id = dr.driver_id
   WHERE dr.status IN ('planned', 'in_progress')
     AND dr.locked_by_sub IS NULL
     AND (d.status <> 'active'
          OR NOT EXISTS (SELECT 1 FROM public.driver_duty_session ds
                          WHERE ds.driver_id = d.id AND ds.ended_at IS NULL))
   ORDER BY dr.created_at
`;

/** Not-yet-begun, unlocked collection rounds — checked against the schedule as it now stands. */
export const PLANNED_COLLECTION_ROUNDS = `
  SELECT dr.id, dr.driver_id, dr.deadline_at
    FROM public.driver_round dr
   WHERE dr.kind = 'collection' AND dr.status = 'planned' AND dr.locked_by_sub IS NULL
`;

/**
 * Take back what has NOT been collected.
 *
 * ⚠ ONLY `assigned` ROWS, AND ONLY AT STOPS STILL TO BE MADE (FR-034). A `picked_up` package is
 * physically in a van and no query can know otherwise — 056's stranded-work finding. Releasing it
 * would tell the planner to send a second driver for goods somebody already has.
 */
export const RELEASE_ASSIGNED = `
  DELETE FROM public.round_package rp
   USING public.round_stop rs
   WHERE rs.id = rp.stop_id
     AND rs.round_id = $1
     AND rp.state = 'assigned'
     AND rs.status NOT IN ('done', 'skipped')
  RETURNING rp.shop_fulfillment_id
`;

// ── Standing reasons (072, research R9) ───────────────────────────────────────────────────────────

export const STANDING_EXCLUSIONS = `
  SELECT shop_fulfillment_id, driver_id, reason
    FROM public.assignment_exclusion
   WHERE kind = $1
`;


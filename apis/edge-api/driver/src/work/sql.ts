// The driver's own work (063). Raw parameterised SQL; every query is scoped to the authenticated
// driver (FR-038).
//
// ⚠ THE STORAGE MODEL AND THE WIRE CONTRACT ARE DIFFERENT SHAPES, ON PURPOSE. 049's tables
// (driver_run / collection_task / delivery_task) were torn down; its WIRE CONTRACT was not, because
// the app is built against it and 060 gave that app 45 screens. So the new round/stop/package model
// presents itself in the contract's vocabulary:
//
//     driver_round (kind='collection')  → collection run
//     round_stop   (kind='shop_pickup') → collection stop
//     driver_round (kind='delivery')    → delivery run
//     round_stop   (kind='customer_drop') → delivery drop
//     round_package                      → collection package / drop package
//
// ⚠ NO COORDINATE IS SELECTED ANYWHERE, and none exists to select (D20/D22).

/** The driver's current round, whatever kind. ⚠ Scoped to `$1` — their own subject's driver id. */
export const CURRENT_ROUND = `
  SELECT dr.id, dr.kind, dr.status, dr.deadline_at, dr.changed_note
    FROM public.driver_round dr
   WHERE dr.driver_id = $1
     AND dr.status IN ('planned', 'in_progress')
   ORDER BY dr.kind = 'delivery' DESC, dr.created_at ASC
   LIMIT 1
`;

/**
 * Every stop on a round, with its packages.
 *
 * ⚠ ORDERING IS NOT DONE HERE. The rows come back by `seq` and creation, and the SHARED rule
 * (`orderRoundStops` in @effy/edge-shared) decides what the driver sees — because the dispatcher
 * console must show the same order, and two implementations of one ordering diverge silently
 * (research R5). NP8 breaks this deliberately to prove it.
 */
export const ROUND_STOPS = `
  SELECT rs.id            AS stop_id,
         rs.seq           AS seq,
         rs.kind          AS stop_kind,
         rs.status        AS stop_status,
         rs.completed_at  AS completed_at,
         rs.zone_id       AS zone_id,
         z.name           AS zone_name,
         s.id             AS shop_id,
         s.name           AS shop_name,
         s.code           AS shop_code,
         s.address_line1, s.address_line2, s.suburb, s.postcode, s.state,
         o.id             AS order_id,
         o.order_number   AS order_number,
         o.delivery_address ->> 'city'       AS destination_suburb,
         o.delivery_address ->> 'line1'      AS destination_line1,
         o.delivery_address ->> 'line2'      AS destination_line2,
         o.delivery_address ->> 'postalCode' AS destination_postcode,
         o.delivery_address ->> 'region'     AS destination_state
    FROM public.round_stop rs
    JOIN public.driver_round dr ON dr.id = rs.round_id
    LEFT JOIN public.shop           s ON s.id = rs.shop_id
    LEFT JOIN public."order"        o ON o.id = rs.order_id
    LEFT JOIN public.delivery_zone  z ON z.id = rs.zone_id
   WHERE rs.round_id = $1
     AND dr.driver_id = $2
   ORDER BY rs.seq NULLS LAST, rs.id
`;

/** Packages at each stop of a round, with the order they belong to and their method. */
export const ROUND_PACKAGES = `
  SELECT rp.id                                  AS round_package_id,
         rp.stop_id                             AS stop_id,
         rp.state                               AS state,
         sf.id                                  AS package_id,
         o.order_number                         AS order_number,
         COALESCE(sf.delivery_method, 'standard') AS method,
         o.delivery_address ->> 'city'          AS destination_suburb
    FROM public.round_package rp
    JOIN public.round_stop       rs ON rs.id = rp.stop_id
    JOIN public.driver_round     dr ON dr.id = rs.round_id
    JOIN public.shop_fulfillment sf ON sf.id = rp.shop_fulfillment_id
    JOIN public."order"          o  ON o.id = sf.order_id
   WHERE rs.round_id = $1
     AND dr.driver_id = $2
   ORDER BY rp.created_at
`;

/** Line items in one package — the driver's manifest for a pickup. */
export const PACKAGE_ITEMS = `
  SELECT oi.product_name AS name, oi.quantity AS qty
    FROM public.order_item oi
    JOIN public.shop_fulfillment sf ON sf.order_id = oi.order_id AND sf.shop_id = oi.shop_id
   WHERE sf.id = ANY($1::uuid[])
   ORDER BY oi.product_name
`;

/** Rounds this driver finished today — the history strip on the home screen. */
export const COMPLETED_TODAY = `
  SELECT dr.id, dr.kind, dr.status, dr.deadline_at, dr.changed_note
    FROM public.driver_round dr
   WHERE dr.driver_id = $1
     AND dr.status = 'completed'
     AND dr.updated_at >= date_trunc('day', now() AT TIME ZONE 'Australia/Melbourne')
                           AT TIME ZONE 'Australia/Melbourne'
   ORDER BY dr.updated_at DESC
`;

/**
 * ⚠ OWNERSHIP, AS ITS OWN QUERY. A round or stop belonging to another driver must answer exactly as
 * a non-existent one does (FR-038) — otherwise the route is an oracle for which ids are real. 052
 * made "not yours" and "no such thing" byte-identical for the same reason.
 */
export const OWNS_ROUND = `
  SELECT 1 FROM public.driver_round WHERE id = $1 AND driver_id = $2
`;

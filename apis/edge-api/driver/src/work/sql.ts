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

/**
 * Line items of the given packages — the driver's manifest (065).
 *
 * ⚠ KEYED BY PACKAGE. This used to return bare name/quantity rows with nothing saying which package
 * a row belonged to, and the stop read then handed every package every row.
 *
 * ⚠ `storage_class` IS READ FROM THE ORDER LINE, NOT THE PRODUCT. It is a snapshot taken at
 * placement; joining `product_attribute_value` here would let a shop's later edit rewrite what a
 * driver is told about goods already packed (FR-009).
 *
 * ⚠ `gathered_qty` IS NULL WHEN THERE IS NO PICK ROW, and that is a different fact from zero —
 * see `toLine` in ./manifest.ts.
 *
 * ⚠ NO MONEY COLUMN IS SELECTED, and none may be: `order_item` is a receipt line with a price on
 * it, and the driver never sees currency (FR-020).
 */
export const PACKAGE_ITEMS = `
  SELECT sf.id                 AS package_id,
         oi.product_name       AS name,
         oi.quantity           AS ordered_qty,
         oi.storage_class      AS storage_class,
         fi.gathered_quantity  AS gathered_qty
    FROM public.shop_fulfillment sf
    JOIN public.order_item oi ON oi.order_id = sf.order_id AND oi.shop_id = sf.shop_id
    LEFT JOIN public.fulfillment_item fi
           ON fi.order_item_id = oi.id AND fi.shop_fulfillment_id = sf.id
   WHERE sf.id = ANY($1::uuid[])
   ORDER BY sf.id, oi.product_name, oi.id
`;

/**
 * The packages at ONE stop, scoped to the driver — the drop's own read (065).
 *
 * ⚠ ORDERED BY CREATION so the app's "Package 1 of 2" is stable between two reads of one drop. The
 * position is the ONLY label a drop's package gets: it is one shop's portion, and naming it any
 * other way would name the shop.
 */
export const STOP_PACKAGES = `
  SELECT rp.shop_fulfillment_id AS package_id
    FROM public.round_package rp
    JOIN public.round_stop   rs ON rs.id = rp.stop_id
    JOIN public.driver_round dr ON dr.id = rs.round_id
   WHERE rp.stop_id = $1
     AND dr.driver_id = $2
   ORDER BY rp.created_at, rp.id
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

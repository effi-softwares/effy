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

import { deliveredBySql } from "@effy/edge-shared/delivery";

/**
 * Every unfinished round the driver holds, the CURRENT one first (072).
 *
 * ⚠ THIS RETURNED ONE ROW UNTIL 072 — "delivery before collection, oldest first, LIMIT 1" — because
 * a round only existed for the last 45 minutes before it was due and a driver held one at a time.
 * Work is now assigned the moment a driver can take it, so a driver holds this afternoon's
 * collection round, this evening's delivery rounds and possibly tomorrow morning's, all at once. The
 * old ordering would have put a 5–7 pm delivery round that cannot be started in front of a
 * collection round that can.
 *
 * The order IS the rule for "what do I do next" (FR-027):
 *   1. a round already under way;
 *   2. then rounds that are OPEN, earliest deadline first;
 *   3. then rounds not yet open, soonest to open first.
 *
 * ⚠ `opens_at` IS NULL FOR A ROUND THAT IS OPEN — including one whose opening instant has passed.
 * "Is it open" is decided HERE, against the database's clock, so a phone whose clock is wrong cannot
 * show an open round as locked. What reaches the app is either nothing, or a moment in the future.
 *
 * ⚠ The hub is not counted as a stop: `stop_count` is shops, or drops — what a driver would say if
 * asked how many places they are going.
 */
export const OPEN_ROUNDS = `
  SELECT r.id, r.kind, r.status, r.deadline_at, r.changed_note,
         CASE WHEN r.opens > now() THEN r.opens END AS opens_at,
         (SELECT count(*) FROM public.round_stop rs
           WHERE rs.round_id = r.id AND rs.kind <> 'hub_checkin')::int AS stop_count,
         (SELECT count(*) FROM public.round_package rp
            JOIN public.round_stop rs ON rs.id = rp.stop_id
           WHERE rs.round_id = r.id)::int                            AS package_count
    FROM (
      SELECT dr.*, public.round_opens_at(dr.kind, dr.deadline_at, dr.window_start_at) AS opens
        FROM public.driver_round dr
       WHERE dr.driver_id = $1
         AND dr.status IN ('planned', 'in_progress')
    ) r
   ORDER BY (r.status = 'in_progress') DESC,
            COALESCE(r.opens <= now(), true) DESC,
            CASE WHEN COALESCE(r.opens <= now(), true) THEN r.deadline_at ELSE r.opens END ASC,
            r.created_at ASC,
            r.id ASC
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
         o.delivery_address ->> 'region'     AS destination_state,
         w.window_start   AS window_start,
         w.window_end     AS window_end
    FROM public.round_stop rs
    JOIN public.driver_round dr ON dr.id = rs.round_id
    -- 069 — the window the customer was sold. An order's same-day packages share ONE slot, so MIN is
    -- that slot and not a choice between several. NULL for a pickup, the hub, and any order placed
    -- before 069; a standard package has no window and is never on a delivery round.
    LEFT JOIN LATERAL (
      SELECT min(opd.window_start) AS window_start, min(opd.window_end) AS window_end
        FROM public.order_package_delivery opd
       WHERE opd.order_id = rs.order_id AND opd.window_start IS NOT NULL
    ) w ON TRUE
    LEFT JOIN public.shop           s ON s.id = rs.shop_id
    LEFT JOIN public."order"        o ON o.id = rs.order_id
    LEFT JOIN public.delivery_zone  z ON z.id = rs.zone_id
   WHERE rs.round_id = $1
     AND dr.driver_id = $2
   ORDER BY rs.seq NULLS LAST, rs.id
`;

/**
 * Packages at each stop of a round, with the order they belong to.
 *
 * ⚠ 082 — `delivered_by` and the window are what the driver is TOLD ("Effy delivery, Thu 4–6 pm" /
 * "Courier"); `method` is still selected only because driver builds that predate them read it (E9).
 */
export const ROUND_PACKAGES = `
  SELECT rp.id                                  AS round_package_id,
         rp.stop_id                             AS stop_id,
         rp.state                               AS state,
         sf.id                                  AS package_id,
         o.order_number                         AS order_number,
         COALESCE(sf.delivery_method, 'standard') AS method,
         ${deliveredBySql("o", "COALESCE(opd.method, sf.delivery_method)", "opd.slot_id")} AS delivered_by,
         opd.window_start                       AS window_start,
         opd.window_end                         AS window_end,
         o.delivery_address ->> 'city'          AS destination_suburb
    FROM public.round_package rp
    JOIN public.round_stop       rs ON rs.id = rp.stop_id
    JOIN public.driver_round     dr ON dr.id = rs.round_id
    JOIN public.shop_fulfillment sf ON sf.id = rp.shop_fulfillment_id
    JOIN public."order"          o  ON o.id = sf.order_id
    LEFT JOIN public.order_package_delivery opd ON opd.order_id = sf.order_id AND opd.shop_id = sf.shop_id
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
 * One of the driver's rounds, with when it opens and when it is due (072) — and nothing at all when
 * the round is not theirs.
 *
 * ⚠ THIS IS ALSO THE OWNERSHIP CHECK (it replaced `OWNS_ROUND`). A round or stop belonging to
 * another driver must answer exactly as a non-existent one does (FR-038) — otherwise the route is an
 * oracle for which ids are real. 052 made "not yours" and "no such thing" byte-identical for the
 * same reason. No row here is the caller's "not found", whichever of the two it was.
 *
 * `opens_at` follows OPEN_ROUNDS: null once the round is open.
 */
export const ROUND_TIMES = `
  SELECT dr.deadline_at,
         CASE WHEN public.round_opens_at(dr.kind, dr.deadline_at, dr.window_start_at) > now()
              THEN public.round_opens_at(dr.kind, dr.deadline_at, dr.window_start_at) END AS opens_at
    FROM public.driver_round dr
   WHERE dr.id = $1 AND dr.driver_id = $2
`;

/** The same, found from one of the round's stops — the drop screen knows only its drop (072). */
export const STOP_ROUND_TIMES = `
  SELECT dr.deadline_at,
         CASE WHEN public.round_opens_at(dr.kind, dr.deadline_at, dr.window_start_at) > now()
              THEN public.round_opens_at(dr.kind, dr.deadline_at, dr.window_start_at) END AS opens_at
    FROM public.round_stop   rs
    JOIN public.driver_round dr ON dr.id = rs.round_id
   WHERE rs.id = $1 AND dr.driver_id = $2
`;

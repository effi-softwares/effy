// Built around what needs attention, not what is fine: the common case is automatic, the exception visible.

import { COURIER_COLLECTION_SQL } from "@effy/edge-shared/delivery";
import { ROUND_STAGE_COLUMNS, ROUND_STAGE_LATERAL, TO_RETURN_SQL } from "@effy/edge-shared/delivery";

/** A dispatcher's waiver of the cross-run gate, and who gave it. */
const WAIVER = `
  LEFT JOIN public.round_sequence_waiver wv ON wv.round_id = dr.id
  LEFT JOIN admin.staff wst ON wst.cognito_sub = wv.staff_sub`;
const WAIVER_COLUMNS = `wv.reason AS waiver_reason, wv.created_at AS waiver_at,
         COALESCE(NULLIF(btrim(wst.name), ''), wst.email::text) AS waiver_staff`;

/** Who takes a parcel to the customer, over these queries' aliases. */

export const DAY_ROUNDS = `
  SELECT dr.id, dr.kind, dr.status, dr.deadline_at, dr.changed_note,
         dr.updated_at,
         -- When the round opens to its driver. ⚠ The database's ONE definition; the driver
         -- service's action gate calls the same function, so this screen cannot disagree with it.
         public.round_opens_at(dr.kind, dr.deadline_at, dr.window_start_at) AS opens_at,
         d.id   AS driver_id,
         d.name AS driver_name,
         (SELECT count(*) FROM public.round_stop rs
           WHERE rs.round_id = dr.id AND rs.status NOT IN ('done','skipped'))::text AS stops_remaining,  -- ⚠ finished states named, not open ones (2026-09-30): a started drop still counts as remaining
         (SELECT count(*) FROM public.round_package rp
            JOIN public.round_stop rs2 ON rs2.id = rp.stop_id
           WHERE rs2.round_id = dr.id AND rp.state = 'assigned')::text AS packages_remaining,
         -- Where the run is, by the one shared definition the driver's app reads too.
         ${ROUND_STAGE_COLUMNS},
         ${WAIVER_COLUMNS}
    FROM public.driver_round dr
    JOIN public.driver d ON d.id = dr.driver_id
    ${ROUND_STAGE_LATERAL}
    ${WAIVER}
   -- ⚠ EVERY UNFINISHED ROUND, plus what was finished or created today. This read "created
   -- today", which was the same thing while a round existed for 45 minutes. A round is now assigned
   -- the evening before its run, and "created today" would hide it on the morning it is due.
   WHERE dr.status IN ('planned', 'in_progress')
      OR dr.created_at >= date_trunc('day', now() AT TIME ZONE 'Australia/Melbourne')
                            AT TIME ZONE 'Australia/Melbourne'
      OR dr.updated_at >= date_trunc('day', now() AT TIME ZONE 'Australia/Melbourne')
                            AT TIME ZONE 'Australia/Melbourne'
   ORDER BY dr.status NOT IN ('completed', 'cancelled') DESC, dr.deadline_at ASC
`;

/**
 * Work nobody can take, with the reason, at a shop or at the hub. Reasons are standing facts joined by
 * `kind` (`standing-reasons.guard.test.ts`), so a hub package never shows its old shop-side reasons.
 * The hub half uses the delivery gather's where verbatim (Effy delivers it, its day has come); a parcel
 * waiting for a later day is not listed. The shop half carries `delivered_by` and `window_start` so the
 * service can judge due and late; supplier-pickup courier parcels never appear. `driver_id IS NULL`
 * means no candidate at all (a staffing decision), unlike a list of failed conditions.
 */
export const UNASSIGNED_WORK = `
  SELECT sf.id                                   AS package_id,
         o.order_number                          AS order_number,
         s.name                                  AS shop_name,
         z.name                                  AS zone_name,
         o.delivery_type                         AS delivered_by,
         opd.window_start                        AS window_start,
         sf.state_changed_at                     AS ready_since,
         'collection'::text                      AS stage,
         NULL::timestamptz                       AS window_end,
         COALESCE(
           array_agg(DISTINCT ae.reason) FILTER (WHERE ae.reason IS NOT NULL),
           ARRAY[]::text[]
         )                                       AS reasons,
         COALESCE(bool_or(ae.driver_id IS NULL AND ae.id IS NOT NULL), false) AS no_candidate
    FROM public.shop_fulfillment sf
    JOIN public."order" o ON o.id = sf.order_id
    JOIN public.shop    s ON s.id = sf.shop_id
    LEFT JOIN public.order_package_delivery opd ON opd.order_id = sf.order_id AND opd.shop_id = sf.shop_id
    LEFT JOIN public.delivery_zone_postcode zp ON zp.postcode = (o.delivery_address ->> 'postalCode')
    LEFT JOIN public.delivery_zone          z  ON z.id = zp.zone_id
    LEFT JOIN public.assignment_exclusion   ae ON ae.shop_fulfillment_id = sf.id
                                              AND ae.kind = 'collection'
   WHERE sf.status = 'ready_for_pickup'
     AND ${COURIER_COLLECTION_SQL("o")} <> 'supplier'
     AND NOT EXISTS (
           SELECT 1 FROM public.round_package rp
            WHERE rp.shop_fulfillment_id = sf.id AND rp.state = 'assigned'
         )
   GROUP BY sf.id, o.order_number, o.delivery_type, s.name, z.name, sf.delivery_method, opd.method, opd.slot_id,
            opd.window_start, sf.state_changed_at

  UNION ALL

  SELECT sf.id                                   AS package_id,
         o.order_number                          AS order_number,
         s.name                                  AS shop_name,
         z.name                                  AS zone_name,
         'effy'::text                            AS delivered_by,
         opd.window_start                        AS window_start,
         hc.checked_in_at                        AS ready_since,
         'delivery'::text                        AS stage,
         opd.window_end                          AS window_end,
         COALESCE(
           array_agg(DISTINCT ae.reason) FILTER (WHERE ae.reason IS NOT NULL),
           ARRAY[]::text[]
         )                                       AS reasons,
         COALESCE(bool_or(ae.driver_id IS NULL AND ae.id IS NOT NULL), false) AS no_candidate
    FROM public.round_package rp
    JOIN public.round_stop     rs ON rs.id = rp.stop_id
    JOIN public.driver_round   dr ON dr.id = rs.round_id AND dr.kind = 'collection'
    JOIN public.hub_checkin    hc ON hc.round_id = dr.id
    JOIN public.shop_fulfillment sf ON sf.id = rp.shop_fulfillment_id
    JOIN public."order" o ON o.id = sf.order_id
    JOIN public.shop    s ON s.id = sf.shop_id
    LEFT JOIN public.order_package_delivery opd ON opd.order_id = sf.order_id AND opd.shop_id = sf.shop_id
    LEFT JOIN public.delivery_zone_postcode zp ON zp.postcode = (o.delivery_address ->> 'postalCode')
    LEFT JOIN public.delivery_zone          z  ON z.id = zp.zone_id
    LEFT JOIN public.assignment_exclusion   ae ON ae.shop_fulfillment_id = sf.id
                                              AND ae.kind = 'delivery'
   WHERE rp.state = 'picked_up'
     AND o.delivery_type = 'effy'
     AND (opd.window_start IS NULL OR opd.window_start <= $1::timestamptz)
     AND sf.status = 'collected'
     AND NOT EXISTS (
           SELECT 1 FROM public.round_package open_rp
            WHERE open_rp.shop_fulfillment_id = sf.id AND open_rp.state = 'assigned'
         )
   GROUP BY sf.id, o.order_number, s.name, z.name, hc.checked_in_at, opd.window_start, opd.window_end

   ORDER BY ready_since ASC
`;

/** With the concurrency token at microsecond precision (`to_char(...US)`): `toISOString` truncates to ms and would never match. */
export const ROUND_FOR_UPDATE = `
  SELECT dr.id, dr.driver_id, dr.kind, dr.status, dr.deadline_at,
         public.round_opens_at(dr.kind, dr.deadline_at, dr.window_start_at) AS opens_at,
         to_char(dr.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at
    FROM public.driver_round dr
   WHERE dr.id = $1
   FOR UPDATE
`;

export const ROUND_STAGE_AND_WAIVER = `
  SELECT dr.kind, dr.status, ${ROUND_STAGE_COLUMNS}, ${WAIVER_COLUMNS}
    FROM public.driver_round dr
    ${ROUND_STAGE_LATERAL}
    ${WAIVER}
   WHERE dr.id = $1
`;

export const ROUND_DETAIL_STOPS = `
  SELECT rs.id AS stop_id, rs.seq, rs.kind, rs.status, rs.zone_id, rs.shop_id, rs.completed_at,
         z.name AS zone_name,
         s.name AS shop_name,
         o.order_number,
         o.delivery_address ->> 'city' AS destination_suburb,
         w.window_start, w.window_end,
         -- How this stop's hand-overs ON THIS ROUND were done.
         ho.scan AS handovers_scan, ho.typed AS handovers_typed, ho.manual AS handovers_manual
    FROM public.round_stop rs
    LEFT JOIN public.shop           s ON s.id = rs.shop_id
    LEFT JOIN public."order"        o ON o.id = rs.order_id
    LEFT JOIN public.delivery_zone  z ON z.id = rs.zone_id
    -- The customer's delivery window, the same read the driver service makes. NULL for a
    -- pickup and the hub.
    LEFT JOIN LATERAL (
      SELECT min(opd.window_start) AS window_start, min(opd.window_end) AS window_end
        FROM public.order_package_delivery opd
       WHERE opd.order_id = rs.order_id AND opd.window_start IS NOT NULL
    ) w ON TRUE
    LEFT JOIN LATERAL (
      SELECT count(*) FILTER (WHERE ph.handover_method = 'scan')::int   AS scan,
             count(*) FILTER (WHERE ph.handover_method = 'typed')::int  AS typed,
             count(*) FILTER (WHERE ph.handover_method = 'manual')::int AS manual
        FROM public.package_handover ph
       WHERE ph.round_id = rs.round_id
         AND ph.shop_fulfillment_id IN (SELECT rp.shop_fulfillment_id FROM public.round_package rp WHERE rp.stop_id = rs.id)
    ) ho ON TRUE
   WHERE rs.round_id = $1
   ORDER BY rs.seq NULLS LAST, rs.id
`;

/**
 * What a round asks of the driver taking it over: one row per distinct area, each with the whole
 * round's outstanding weight, stops and refrigeration (only packages `assigned` or `picked_up`).
 */
export const ROUND_WORK = `
  WITH pkg AS (
    SELECT rs.id AS stop_id,
           rs.zone_id,
           COALESCE(SUM(oi.quantity * pv.weight_grams), 0)::bigint AS weight_grams,
           COALESCE(bool_or(st.chilled), false) AS chilled,
           COALESCE(bool_or(st.frozen),  false) AS frozen
      FROM public.round_stop rs
      JOIN public.round_package   rp ON rp.stop_id = rs.id AND rp.state IN ('assigned', 'picked_up')
      JOIN public.shop_fulfillment sf ON sf.id = rp.shop_fulfillment_id
      LEFT JOIN public.order_item  oi ON oi.order_id = sf.order_id AND oi.shop_id = sf.shop_id
      LEFT JOIN public.product     p  ON p.id = oi.product_id
      LEFT JOIN public.product_variant pv ON pv.id = oi.variant_id  -- weight is the VARIANT's
      LEFT JOIN LATERAL (
        SELECT bool_or(pav.value_text = 'chilled') AS chilled,
               bool_or(pav.value_text = 'frozen')  AS frozen
          FROM public.product_attribute_value pav
          JOIN public.attribute_definition ad ON ad.id = pav.attribute_definition_id AND ad.key = 'storage'
         WHERE pav.product_id = p.id
      ) st ON TRUE
     WHERE rs.round_id = $1
     GROUP BY rs.id, rs.zone_id, sf.id
  )
  SELECT pkg.zone_id,
         (SELECT COALESCE(SUM(weight_grams), 0) FROM pkg)::bigint AS weight_grams,
         (SELECT COALESCE(bool_or(chilled), false) FROM pkg)       AS requires_chilled,
         (SELECT COALESCE(bool_or(frozen),  false) FROM pkg)       AS requires_frozen,
         (SELECT count(*) FROM public.round_stop rs
           WHERE rs.round_id = $1 AND rs.kind <> 'hub_checkin'
             AND rs.status NOT IN ('done', 'skipped'))::int        AS stops
    FROM pkg
   GROUP BY pkg.zone_id
`;

/** Failed parcels still in a van, or back at the hub awaiting a person's next step. Counted, never stored. */
export const FAILED_PARCEL_COUNTS = `
  SELECT
    (SELECT count(*) FROM public.round_package rp
       JOIN public.round_stop   rs ON rs.id = rp.stop_id
       JOIN public.driver_round dr ON dr.id = rs.round_id
      WHERE ${TO_RETURN_SQL})::int AS with_drivers,
    (SELECT count(*) FROM public.round_package rp
       JOIN public.round_stop rs ON rs.id = rp.stop_id
      WHERE rp.state = 'returned'
        AND EXISTS (SELECT 1 FROM public.delivery_attempt_failure f
                     WHERE f.stop_id = rs.id AND f.resolved_at IS NULL))::int AS returned_awaiting_decision
`;

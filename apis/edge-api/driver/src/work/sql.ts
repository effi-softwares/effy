// Every query is scoped to the authenticated driver. The round/stop/package model is presented in the
// wire contract's vocabulary:
//
//  driver_round (kind='collection') → collection run
//  round_stop (kind='shop_pickup') → collection stop
//  driver_round (kind='delivery') → delivery run
//  round_stop (kind='customer_drop') → delivery drop
//  round_package → collection package / drop package
//
// No coordinate is selected anywhere.

/**
 * Every unfinished round the driver holds, in "what next" order: under way, then open by earliest
 * deadline, then soonest to open. `opens_at` is null once open, by the database's clock. `stop_count`
 * counts shops or drops, not the hub.
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

/** Ordered by `seq` and creation only; the shared `orderRoundStops` decides what the driver sees. */
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
         o.delivery_handover                 AS handover,
         w.window_start   AS window_start,
         w.window_end     AS window_end,
         COALESCE(w.any_time, false) AS any_time
    FROM public.round_stop rs
    JOIN public.driver_round dr ON dr.id = rs.round_id
    -- The window the customer was sold. An order's packages share ONE slot, so MIN is that slot and
    -- not a choice between several. NULL for a pickup and the hub; a courier package is never on a
    -- delivery round.
    LEFT JOIN LATERAL (
      SELECT min(opd.window_start) AS window_start, min(opd.window_end) AS window_end,
             -- Sold a day with no time: the driver is told "Any time", not the hours.
             bool_or(ds.any_time) AS any_time
        FROM public.order_package_delivery opd
        LEFT JOIN public.delivery_slot ds ON ds.id = opd.slot_id
       WHERE opd.order_id = rs.order_id AND opd.window_start IS NOT NULL
    ) w ON TRUE
    LEFT JOIN public.shop           s ON s.id = rs.shop_id
    LEFT JOIN public."order"        o ON o.id = rs.order_id
    LEFT JOIN public.delivery_zone  z ON z.id = rs.zone_id
   WHERE rs.round_id = $1
     AND dr.driver_id = $2
   ORDER BY rs.seq NULLS LAST, rs.id
`;

/** With the order, and what the driver is told: `delivered_by` and the window. */
export const ROUND_PACKAGES = `
  SELECT rp.id                                  AS round_package_id,
         rp.stop_id                             AS stop_id,
         rp.state                               AS state,
         sf.id                                  AS package_id,
         sf.package_code                        AS package_code,
         o.order_number                         AS order_number,
         o.delivery_type AS delivered_by,
         opd.window_start                       AS window_start,
         opd.window_end                         AS window_end,
         COALESCE((SELECT ds.any_time FROM public.delivery_slot ds WHERE ds.id = opd.slot_id), false) AS any_time,
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
 * Keyed by package. `storage_class` is the order line's snapshot, never the live product.
 * `gathered_qty` null (no pick row) differs from zero. No money column, ever.
 */
export const PACKAGE_ITEMS = `
  SELECT sf.id                 AS package_id,
         -- The line as sold, with its variant ("Basmati Rice — 1 kg"): one string, so an
         -- installed driver app shows it without knowing variants exist.
         CASE WHEN oi.variant_label IS NULL THEN oi.product_name ELSE oi.product_name || ' — ' || oi.variant_label END AS name,
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

/** Ordered by creation, so "Package 1 of 2" is stable; position is the only label (a name would name the shop). */
export const STOP_PACKAGES = `
  SELECT rp.shop_fulfillment_id AS package_id
    FROM public.round_package rp
    JOIN public.round_stop   rs ON rs.id = rp.stop_id
    JOIN public.driver_round dr ON dr.id = rs.round_id
   WHERE rp.stop_id = $1
     AND dr.driver_id = $2
   ORDER BY rp.created_at, rp.id
`;

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
 * One of the driver's rounds with its opening and due times; nothing when it is not theirs. This is
 * the ownership check: no row is the caller's "not found" either way. `opens_at` is null once open.
 */
export const ROUND_TIMES = `
  SELECT dr.deadline_at,
         CASE WHEN public.round_opens_at(dr.kind, dr.deadline_at, dr.window_start_at) > now()
              THEN public.round_opens_at(dr.kind, dr.deadline_at, dr.window_start_at) END AS opens_at
    FROM public.driver_round dr
   WHERE dr.id = $1 AND dr.driver_id = $2
`;

/** From one of the round's stops. */
export const STOP_ROUND_TIMES = `
  SELECT dr.deadline_at,
         CASE WHEN public.round_opens_at(dr.kind, dr.deadline_at, dr.window_start_at) > now()
              THEN public.round_opens_at(dr.kind, dr.deadline_at, dr.window_start_at) END AS opens_at
    FROM public.round_stop   rs
    JOIN public.driver_round dr ON dr.id = rs.round_id
   WHERE rs.id = $1 AND dr.driver_id = $2
`;

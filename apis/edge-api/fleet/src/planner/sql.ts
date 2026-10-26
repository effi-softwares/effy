// No coordinate, distance or travel-time column exists or is selected: a shop has an address, nothing computes distance.

import { COURIER_COLLECTION_SQL, heldSql, vehicleCheckStateSql } from "@effy/edge-shared/delivery";

/** Who takes a parcel to the customer, over the gathers' aliases. */

/**
 * Packages a wave may pick up: ready (`ready_for_pickup`, the shop's terminal state) and not in an
 * open assignment. No method: `delivered_by` says whose it is, and `window_start` when it should
 * travel. The not exists is a read filter; `round_package_open_uq` makes assignment exclusive.
 */
export const GATHER_COLLECTION = `
  SELECT sf.id                                   AS package_id,
         o.order_number                          AS order_number,
         sf.shop_id                              AS shop_id,
         s.name                                  AS shop_name,
         s.address_line1, s.address_line2, s.suburb, s.postcode, s.state,
         o.delivery_type                         AS delivered_by,
         opd.window_start                        AS window_start,
         opd.window_end                          AS window_end,
         z.id                                    AS zone_id,
         z.name                                  AS zone_name,
         sf.state_changed_at                     AS ready_since,
         COALESCE(SUM(oi.quantity * pv.weight_grams), 0)::bigint AS weight_grams,
         COUNT(oi.id)::bigint                    AS item_count,
         COALESCE(bool_or(oi.storage_class = 'chilled'), false) AS requires_chilled,
         COALESCE(bool_or(oi.storage_class = 'frozen'),  false) AS requires_frozen
    FROM public.shop_fulfillment sf
    JOIN public."order"        o  ON o.id = sf.order_id
    JOIN public.shop           s  ON s.id = sf.shop_id
    LEFT JOIN public.order_package_delivery opd ON opd.order_id = sf.order_id AND opd.shop_id = sf.shop_id
    LEFT JOIN public.order_item oi ON oi.order_id = sf.order_id AND oi.shop_id = sf.shop_id
    LEFT JOIN public.product_variant pv ON pv.id = oi.variant_id  -- weight is the VARIANT's
    LEFT JOIN public.delivery_zone_postcode zp ON zp.postcode = (o.delivery_address ->> 'postalCode')
    LEFT JOIN public.delivery_zone          z  ON z.id = zp.zone_id AND z.status = 'active'
   WHERE sf.status = 'ready_for_pickup'
     -- A package a driver declared missing waits for a dispatcher's decision.
     AND NOT ${heldSql("sf.id")}
     -- ⚠ A COURIER COLLECTS IT FROM THE SUPPLIER: no Effy driver goes for it, ever — not in a
     -- pass and not when staff ask "who can take this one?". Asked through the ONE fragment, so the
     -- planner and the shop console cannot disagree about which parcels are the supplier's to hand over.
     AND ${COURIER_COLLECTION_SQL("o")} <> 'supplier'
     -- $1, when given, asks about ONE package and includes it even while it is assigned (the
     -- driver list for "Assign to…" is asked about a package somebody already has). NULL = the pass.
     AND ($1::uuid IS NULL OR sf.id = $1::uuid)
     AND ($1::uuid IS NOT NULL OR NOT EXISTS (
           SELECT 1
             FROM public.round_package rp
            WHERE rp.shop_fulfillment_id = sf.id AND rp.state = 'assigned'
         ))
   GROUP BY sf.id, o.order_number, o.delivery_type, sf.shop_id, s.name, s.address_line1, s.address_line2,
            s.suburb, s.postcode, s.state, sf.delivery_method, opd.method, opd.slot_id,
            opd.window_start, opd.window_end, z.id, z.name, sf.state_changed_at
   ORDER BY sf.state_changed_at ASC
`;

/**
 * Parcels Effy delivers (by delivery type, never the method) that have been checked in at the hub
 * (the check-in row's existence is the fact), whose day has come ($2 = the end of the local day), and
 * that are not out for delivery. Refrigeration is each order line's storage as sold
 * (`order_item.storage_class`); the address is the order's jsonb snapshot.
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
         z.id                        AS zone_id,
         z.name                      AS zone_name,
         hc.checked_in_at            AS ready_since,
         -- Who brought it to the hub: preferred for taking it on to the customer (one trip).
         (array_agg(dr.driver_id ORDER BY hc.checked_in_at DESC))[1] AS collected_by,
         -- The window the customer was sold. ⚠ Read as stored INSTANTS: checkout turned the slot's
         -- wall-clock times into these once, and nothing here rebuilds one.
         opd.window_start            AS window_start,
         opd.window_end              AS window_end,
         COALESCE(SUM(oi.quantity * pv.weight_grams), 0)::bigint AS weight_grams,
         COUNT(oi.id)::bigint        AS item_count,
         COALESCE(bool_or(oi.storage_class = 'chilled'), false) AS requires_chilled,
         COALESCE(bool_or(oi.storage_class = 'frozen'),  false) AS requires_frozen
    FROM public.round_package rp
    JOIN public.round_stop     rs ON rs.id = rp.stop_id
    JOIN public.driver_round   dr ON dr.id = rs.round_id AND dr.kind = 'collection'
    JOIN public.hub_checkin    hc ON hc.round_id = dr.id
    JOIN public.shop_fulfillment sf ON sf.id = rp.shop_fulfillment_id
    JOIN public."order"        o  ON o.id = sf.order_id
    JOIN public.shop           s  ON s.id = sf.shop_id
    LEFT JOIN public.order_package_delivery opd ON opd.order_id = sf.order_id AND opd.shop_id = sf.shop_id
    LEFT JOIN public.order_item oi ON oi.order_id = sf.order_id AND oi.shop_id = sf.shop_id
    LEFT JOIN public.product_variant pv ON pv.id = oi.variant_id  -- weight is the VARIANT's
    LEFT JOIN public.delivery_zone_postcode zp ON zp.postcode = (o.delivery_address ->> 'postalCode')
    LEFT JOIN public.delivery_zone          z  ON z.id = zp.zone_id AND z.status = 'active'
   WHERE rp.state = 'picked_up'
     AND o.delivery_type = 'effy'
     AND (opd.window_start IS NULL OR opd.window_start <= $2::timestamptz)
     -- Declared missing at loading or check-in: held for a dispatcher, never re-planned by itself.
     AND NOT ${heldSql("sf.id")}
     -- ⚠ STILL TO BE DELIVERED. Without this a package that HAS been delivered matches again:
     -- its collection row is 'picked_up' for ever and its delivery row is 'delivered', not 'assigned',
     -- so the NOT EXISTS below passes and the next pass puts it on a new delivery round. Proof moves
     -- the fulfillment 'collected' -> 'delivered', which is the fact this reads.
     AND sf.status = 'collected'
     -- See GATHER_COLLECTION: $1 asks about one package, assigned or not.
     AND ($1::uuid IS NULL OR sf.id = $1::uuid)
     AND ($1::uuid IS NOT NULL OR NOT EXISTS (
           SELECT 1
             FROM public.round_package open_rp
            WHERE open_rp.shop_fulfillment_id = sf.id AND open_rp.state = 'assigned'
         ))
     -- ⚠ HELD FOR A PERSON. A parcel returned to the hub after a failed delivery waits until a
     -- staff member chooses its next step (a new window, courier, or cancel and refund); choosing one
     -- resolves the failure and releases it here. Never re-offered by itself: the reason
     -- it failed — a wrong address, a refusal — usually needs a person to look at it.
     AND NOT EXISTS (
           SELECT 1
             FROM public.round_package held
             JOIN public.delivery_attempt_failure f ON f.stop_id = held.stop_id AND f.resolved_at IS NULL
            WHERE held.shop_fulfillment_id = sf.id AND held.state = 'returned'
         )
   GROUP BY sf.id, o.order_number, sf.shop_id, s.name, o.id, o.delivery_address,
            z.id, z.name, hc.checked_in_at, opd.window_start, opd.window_end
   ORDER BY hc.checked_in_at ASC
`;

/**
 * On-duty drivers with everything eligibility needs, in one round trip. `packages_assigned_today` is
 * counted, not stored, and counts today's assignments (not outstanding work). `c.zone_id IS NULL`
 * means every zone, including later ones, and stays null rather than expanding.
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
           -- ⚠ (function, area) ONLY. The method column is unread: a driver cleared under either
           -- old method for a function and area is cleared for that function there. DISTINCT, because
           -- a driver cleared under both holds two rows for one clearance.
           (SELECT json_agg(json_build_object('function', g.function, 'zoneId', g.zone_id))
              FROM (SELECT DISTINCT c.function, c.zone_id
                      FROM public.driver_zone_capability c
                      LEFT JOIN public.delivery_zone cz ON cz.id = c.zone_id
                     WHERE c.driver_id = d.id
                       AND (c.zone_id IS NULL OR cz.status = 'active')) g),
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
         )::bigint               AS packages_assigned_today,
         -- Today's check of the vehicle they hold.
         ${vehicleCheckStateSql("d", "v")} AS vehicle_check
    FROM public.driver d
    LEFT JOIN public.driver_duty_session ds ON ds.driver_id = d.id AND ds.ended_at IS NULL
    LEFT JOIN public.vehicle_holding    vh ON vh.driver_id = d.id AND vh.ended_at IS NULL
    LEFT JOIN public.vehicle             v ON v.id = vh.vehicle_id
   WHERE d.status <> 'offboarded'
   ORDER BY d.id
`;

/** The wave trigger's only input. */
export const COLLECTION_SCHEDULE = `
  SELECT EXTRACT(HOUR   FROM r.run_time)::int AS hour,
         EXTRACT(MINUTE FROM r.run_time)::int AS minute
    FROM public.delivery_collection_run r
   WHERE r.status = 'active'
   ORDER BY r.run_time
`;

/** Values, never literals. */
export const PLANNER_SETTINGS = `
  SELECT sameday_prep_buffer_min, planning_lead_min, per_stop_allowance_min,
         sameday_hub_turnaround_min, standard_no_delivery_weekdays
    FROM public.delivery_settings
   WHERE id = 1
`;

/**
 * The rounds for one run or window, one row per stop, oldest first. The bucket is (kind, deadline_at,
 * window_start_at), matched with `IS NOT DISTINCT FROM`. The weight expression is the gather's,
 * verbatim. `outstanding` names the finished states, so any new in-progress state stays joinable.
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
           SELECT SUM(oi.quantity * pv.weight_grams)
             FROM public.round_package rp
             JOIN public.shop_fulfillment sf ON sf.id = rp.shop_fulfillment_id
             JOIN public.order_item oi ON oi.order_id = sf.order_id AND oi.shop_id = sf.shop_id
             JOIN public.product    p  ON p.id = oi.product_id
             JOIN public.product_variant pv ON pv.id = oi.variant_id  -- weight is the VARIANT's
            WHERE rp.stop_id = rs.id AND rp.state IN ('assigned', 'picked_up')
         ), 0)::bigint  AS stop_weight_grams
    FROM public.driver_round dr
    LEFT JOIN public.round_stop rs ON rs.round_id = dr.id
   WHERE dr.kind = $1
     AND dr.deadline_at = $2
     AND dr.window_start_at IS NOT DISTINCT FROM $3
     AND dr.status IN ('planned', 'in_progress')
   ORDER BY dr.created_at ASC, dr.id ASC, rs.id ASC
`;

/** The database's one definition. */
export const ROUND_OPENS_AT = `
  SELECT public.round_opens_at($1::text, $2::timestamptz, $3::timestamptz) AS opens_at
`;

/** One pass at a time: a transaction-scoped advisory lock, not a unique index (dispatchers may double up a driver). */
export const TRY_PASS_LOCK = `SELECT pg_try_advisory_xact_lock(72063001) AS locked`;

/** Unfinished rounds held by a driver with no open duty session, or not active. */
export const UNWORKABLE_ROUNDS = `
  SELECT dr.id, dr.driver_id, dr.kind, dr.status
    FROM public.driver_round dr
    JOIN public.driver d ON d.id = dr.driver_id
   WHERE dr.status IN ('planned', 'in_progress')
     AND (d.status <> 'active'
          OR NOT EXISTS (SELECT 1 FROM public.driver_duty_session ds
                          WHERE ds.driver_id = d.id AND ds.ended_at IS NULL))
   ORDER BY dr.created_at
`;

/** Checked against the schedule as it now stands. */
export const PLANNED_COLLECTION_ROUNDS = `
  SELECT dr.id, dr.driver_id, dr.deadline_at
    FROM public.driver_round dr
   WHERE dr.kind = 'collection' AND dr.status = 'planned'
`;

/** Only `assigned` rows at stops still to make: a `picked_up` package is in a van. */
export const RELEASE_ASSIGNED = `
  DELETE FROM public.round_package rp
   USING public.round_stop rs
   WHERE rs.id = rp.stop_id
     AND rs.round_id = $1
     AND rp.state = 'assigned'
     AND rs.status NOT IN ('done', 'skipped')
  RETURNING rp.shop_fulfillment_id
`;

export const STANDING_EXCLUSIONS = `
  SELECT shop_fulfillment_id, driver_id, reason
    FROM public.assignment_exclusion
   WHERE kind = $1
`;


// The dispatcher's reads and overrides (063, US4). Raw parameterised SQL (Principle VI).
//
// ⚠ THE SCREEN IS BUILT AROUND WHAT NEEDS ATTENTION, NOT AROUND WHAT IS FINE (D15, FR-028/SC-008).
// Bringg's own phrase is "manage by exception", and Shipday puts the threshold at 30–50 orders/day
// before automation is even needed — Effy sits below where an SMB vendor says an engine is required.
// The engine earns its place by making the common case automatic and the EXCEPTIONAL case visible.

/** Every round today, with who holds it and how much is left. */
export const DAY_ROUNDS = `
  SELECT dr.id, dr.kind, dr.status, dr.deadline_at, dr.changed_note,
         dr.locked_by_sub, dr.locked_at, dr.updated_at,
         -- 072 — when the round opens to its driver. ⚠ The database's ONE definition; the driver
         -- service's action gate calls the same function, so this screen cannot disagree with it.
         public.round_opens_at(dr.kind, dr.deadline_at, dr.window_start_at) AS opens_at,
         d.id   AS driver_id,
         d.name AS driver_name,
         (SELECT count(*) FROM public.round_stop rs
           WHERE rs.round_id = dr.id AND rs.status NOT IN ('done','skipped'))::text AS stops_remaining,  -- ⚠ finished states named, not open ones (2026-09-30): a started drop still counts as remaining
         (SELECT count(*) FROM public.round_package rp
            JOIN public.round_stop rs2 ON rs2.id = rp.stop_id
           WHERE rs2.round_id = dr.id AND rp.state = 'assigned')::text AS packages_remaining
    FROM public.driver_round dr
    JOIN public.driver d ON d.id = dr.driver_id
   -- ⚠ 072 — EVERY UNFINISHED ROUND, plus what was finished or created today. This read "created
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
 * Work nobody can take, with the reason (FR-015, FR-028) — at a shop, or at the hub.
 *
 * ⚠ 072 — THE REASONS ARE STANDING FACTS, JOINED BY `kind`. Until 072 they were rows per planning
 * wave and this query resolved "the latest collection wave" to find them — and got it wrong once
 * (an unscoped latest wave was almost always the DELIVERY wave, so 14 packages rendered with no
 * explanation while the reasons sat against the previous wave id). There is no wave to resolve now:
 * a package's rows for a kind exist exactly while it is unassigned for that kind.
 *
 * ⚠ THE JOIN MUST NAME THE KIND. A package is unassigned for collection first and, hours later,
 * possibly for delivery; a join on the package alone would show a hub-side package its old
 * shop-side reasons. `standing-reasons.guard.test.ts` holds this.
 *
 * ⚠ HUB-SIDE PACKAGES ARE LISTED TOO (072). A same-day package checked in at the hub that nobody is
 * cleared to deliver was invisible on this screen; it is the more urgent of the two, because a
 * customer has been sold a window for it. Its WHERE clause is the delivery gather's, verbatim.
 *
 * ⚠ A row with `driver_id IS NULL` means NO CANDIDATE AT ALL, which the console must present
 * differently: "nobody is cleared for this" is a staffing decision, "everyone who is cleared failed a
 * condition" is a fixable list.
 */
export const UNASSIGNED_WORK = `
  SELECT sf.id                                   AS package_id,
         o.order_number                          AS order_number,
         s.name                                  AS shop_name,
         z.name                                  AS zone_name,
         COALESCE(sf.delivery_method, 'standard') AS method,
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
    LEFT JOIN public.delivery_zone_postcode zp ON zp.postcode = (o.delivery_address ->> 'postalCode')
    LEFT JOIN public.delivery_zone          z  ON z.id = zp.zone_id
    LEFT JOIN public.assignment_exclusion   ae ON ae.shop_fulfillment_id = sf.id
                                              AND ae.kind = 'collection'
   WHERE sf.status = 'ready_for_pickup'
     AND NOT EXISTS (
           SELECT 1 FROM public.round_package rp
            WHERE rp.shop_fulfillment_id = sf.id AND rp.state = 'assigned'
         )
   GROUP BY sf.id, o.order_number, s.name, z.name, sf.delivery_method, sf.state_changed_at

  UNION ALL

  SELECT sf.id                                   AS package_id,
         o.order_number                          AS order_number,
         s.name                                  AS shop_name,
         z.name                                  AS zone_name,
         'same_day'::text                        AS method,
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
     AND sf.delivery_method = 'same_day'
     AND sf.status = 'collected'
     AND NOT EXISTS (
           SELECT 1 FROM public.round_package open_rp
            WHERE open_rp.shop_fulfillment_id = sf.id AND open_rp.state = 'assigned'
         )
   GROUP BY sf.id, o.order_number, s.name, z.name, hc.checked_in_at, opd.window_end

   ORDER BY ready_since ASC
`;

/**
 * Recent planning passes that CHANGED something — what ran and what it decided (FR-006).
 * ⚠ Since 072 a pass that assigned nothing writes no row, so this is a list of decisions, not ticks.
 */
export const RECENT_WAVES = `
  SELECT id, kind, planned_for, trigger, started_at, finished_at,
         packages_considered::text AS packages_considered,
         packages_assigned::text   AS packages_assigned,
         packages_unassigned::text AS packages_unassigned
    FROM public.dispatch_wave
   ORDER BY started_at DESC
   LIMIT 20
`;

/**
 * ⚠ Read WITH the concurrency token, and it must carry MICROSECONDS.
 *
 * `toISOString()` truncates to milliseconds while PostgreSQL stores microseconds, so comparing a
 * round-tripped JavaScript timestamp against `updated_at` never matches its own row — and EVERY save
 * fails claiming somebody else changed it. 056 lost this to a container test and it is written here
 * so 063 does not re-find it. `to_char(...US)` is what keeps the precision on the wire.
 */
export const ROUND_FOR_UPDATE = `
  SELECT dr.id, dr.driver_id, dr.kind, dr.status, dr.locked_by_sub, dr.deadline_at,
         public.round_opens_at(dr.kind, dr.deadline_at, dr.window_start_at) AS opens_at,
         to_char(dr.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at
    FROM public.driver_round dr
   WHERE dr.id = $1
   FOR UPDATE
`;

/** One round's stops, for the detail screen and for reordering. */
export const ROUND_DETAIL_STOPS = `
  SELECT rs.id AS stop_id, rs.seq, rs.kind, rs.status, rs.zone_id, rs.shop_id,
         z.name AS zone_name,
         s.name AS shop_name,
         o.order_number,
         o.delivery_address ->> 'city' AS destination_suburb,
         w.window_start, w.window_end
    FROM public.round_stop rs
    LEFT JOIN public.shop           s ON s.id = rs.shop_id
    LEFT JOIN public."order"        o ON o.id = rs.order_id
    LEFT JOIN public.delivery_zone  z ON z.id = rs.zone_id
    -- 069 — the customer's delivery window, the same read the driver service makes. NULL for a
    -- pickup, the hub, and any order placed before 069.
    LEFT JOIN LATERAL (
      SELECT min(opd.window_start) AS window_start, min(opd.window_end) AS window_end
        FROM public.order_package_delivery opd
       WHERE opd.order_id = rs.order_id AND opd.window_start IS NOT NULL
    ) w ON TRUE
   WHERE rs.round_id = $1
   ORDER BY rs.seq NULLS LAST, rs.id
`;

// ⚠ `CUSTODY_BY_DRIVER` MOVED TO `@effy/edge-shared` (064). Two services ask "who is holding this?":
// this one, for the dispatcher's custody view, and `edge-api/driver`, which must state what a driver
// holds before their shift can end (FR-018). They are separate Lambda stacks and neither can import
// the other's `src/`, so the rule lives in the package they both depend on (Principle II).
export { CUSTODY_BY_DRIVER } from "@effy/edge-shared";

/**
 * What a round would ask of the driver taking it over (072, research R11) — one row per distinct
 * (method, zone) on it, each carrying the WHOLE round's weight, outstanding stops and refrigeration.
 *
 * ⚠ THIS REPLACED FOUR HARD-CODED ANSWERS. Until 072 the reassign check asked the shared rule about
 * a round that needed no refrigeration, had eight hours to finish, sat in its first zone only and
 * took twelve minutes a stop — whatever the round actually was. A dispatcher could therefore put a
 * chilled round in a van that cannot carry chilled, which the planner would never do. Same rule,
 * and now the same facts.
 *
 * ⚠ Only what is still to be carried counts: packages `assigned` or `picked_up`, and stops not yet
 * finished. The storage read is the gather's lateral, so a line is never counted twice.
 */
export const ROUND_WORK = `
  WITH pkg AS (
    SELECT rs.id AS stop_id,
           rs.zone_id,
           COALESCE(sf.delivery_method, 'standard') AS method,
           COALESCE(SUM(oi.quantity * p.weight_grams), 0)::bigint AS weight_grams,
           COALESCE(bool_or(st.chilled), false) AS chilled,
           COALESCE(bool_or(st.frozen),  false) AS frozen
      FROM public.round_stop rs
      JOIN public.round_package   rp ON rp.stop_id = rs.id AND rp.state IN ('assigned', 'picked_up')
      JOIN public.shop_fulfillment sf ON sf.id = rp.shop_fulfillment_id
      LEFT JOIN public.order_item  oi ON oi.order_id = sf.order_id AND oi.shop_id = sf.shop_id
      LEFT JOIN public.product     p  ON p.id = oi.product_id
      LEFT JOIN LATERAL (
        SELECT bool_or(pav.value_text = 'chilled') AS chilled,
               bool_or(pav.value_text = 'frozen')  AS frozen
          FROM public.product_attribute_value pav
          JOIN public.attribute_definition ad ON ad.id = pav.attribute_definition_id AND ad.key = 'storage'
         WHERE pav.product_id = p.id
      ) st ON TRUE
     WHERE rs.round_id = $1
     GROUP BY rs.id, rs.zone_id, sf.id, sf.delivery_method
  )
  SELECT pkg.method,
         pkg.zone_id,
         (SELECT COALESCE(SUM(weight_grams), 0) FROM pkg)::bigint AS weight_grams,
         (SELECT COALESCE(bool_or(chilled), false) FROM pkg)       AS requires_chilled,
         (SELECT COALESCE(bool_or(frozen),  false) FROM pkg)       AS requires_frozen,
         (SELECT count(*) FROM public.round_stop rs
           WHERE rs.round_id = $1 AND rs.kind <> 'hub_checkin'
             AND rs.status NOT IN ('done', 'skipped'))::int        AS stops
    FROM pkg
   GROUP BY pkg.method, pkg.zone_id
`;

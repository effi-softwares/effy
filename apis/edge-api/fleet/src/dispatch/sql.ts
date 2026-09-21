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
         d.id   AS driver_id,
         d.name AS driver_name,
         (SELECT count(*) FROM public.round_stop rs
           WHERE rs.round_id = dr.id AND rs.status IN ('pending','arrived'))::text AS stops_remaining,
         (SELECT count(*) FROM public.round_package rp
            JOIN public.round_stop rs2 ON rs2.id = rp.stop_id
           WHERE rs2.round_id = dr.id AND rp.state = 'assigned')::text AS packages_remaining
    FROM public.driver_round dr
    JOIN public.driver d ON d.id = dr.driver_id
   WHERE dr.created_at >= date_trunc('day', now() AT TIME ZONE 'Australia/Melbourne')
                            AT TIME ZONE 'Australia/Melbourne'
   ORDER BY dr.status <> 'completed' DESC, dr.deadline_at ASC
`;

/**
 * Work nobody could take, with the reason (FR-015, FR-028).
 *
 * ⚠ ONLY THE LATEST WAVE'S REASONS. An exclusion from last Tuesday describes a world that no longer
 * exists — the driver whose licence had lapsed may have renewed it. Showing stale reasons would make
 * the dispatcher chase problems that are already solved.
 *
 * ⚠ A row with `driver_id IS NULL` means NO CANDIDATE AT ALL, which the console must present
 * differently: "nobody is cleared for this" is a staffing decision, "everyone who is cleared failed a
 * condition" is a fixable list.
 */
export const UNASSIGNED_WORK = `
  WITH latest AS (
    SELECT id FROM public.dispatch_wave ORDER BY started_at DESC LIMIT 1
  )
  SELECT sf.id                                   AS package_id,
         o.order_number                          AS order_number,
         s.name                                  AS shop_name,
         z.name                                  AS zone_name,
         COALESCE(sf.delivery_method, 'standard') AS method,
         sf.state_changed_at                     AS ready_since,
         COALESCE(
           array_agg(DISTINCT ae.reason) FILTER (WHERE ae.reason IS NOT NULL),
           ARRAY[]::text[]
         )                                       AS reasons,
         bool_or(ae.driver_id IS NULL)           AS no_candidate
    FROM public.shop_fulfillment sf
    JOIN public."order" o ON o.id = sf.order_id
    JOIN public.shop    s ON s.id = sf.shop_id
    LEFT JOIN public.delivery_zone_postcode zp ON zp.postcode = (o.delivery_address ->> 'postalCode')
    LEFT JOIN public.delivery_zone          z  ON z.id = zp.zone_id
    LEFT JOIN public.assignment_exclusion   ae ON ae.shop_fulfillment_id = sf.id
                                              AND ae.wave_id = (SELECT id FROM latest)
   WHERE sf.status = 'ready_for_pickup'
     AND NOT EXISTS (
           SELECT 1 FROM public.round_package rp
            WHERE rp.shop_fulfillment_id = sf.id AND rp.state = 'assigned'
         )
   GROUP BY sf.id, o.order_number, s.name, z.name, sf.delivery_method, sf.state_changed_at
   ORDER BY sf.state_changed_at ASC
`;

/** Recent planning passes — what ran and what it decided (FR-006). */
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
  SELECT dr.id, dr.driver_id, dr.kind, dr.status, dr.locked_by_sub,
         to_char(dr.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at
    FROM public.driver_round dr
   WHERE dr.id = $1
   FOR UPDATE
`;

/** One round's stops, for the detail screen and for reordering. */
export const ROUND_DETAIL_STOPS = `
  SELECT rs.id AS stop_id, rs.seq, rs.kind, rs.status, rs.zone_id,
         z.name AS zone_name,
         s.name AS shop_name,
         o.order_number,
         o.delivery_address ->> 'city' AS destination_suburb
    FROM public.round_stop rs
    LEFT JOIN public.shop           s ON s.id = rs.shop_id
    LEFT JOIN public."order"        o ON o.id = rs.order_id
    LEFT JOIN public.delivery_zone  z ON z.id = rs.zone_id
   WHERE rs.round_id = $1
   ORDER BY rs.seq NULLS LAST, rs.id
`;

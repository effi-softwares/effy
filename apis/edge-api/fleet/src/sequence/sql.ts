// Held packages, overdue steps and vehicle checks; all derived on read except the three stored facts.

import { ROUND_STAGE_COLUMNS, ROUND_STAGE_LATERAL } from "@effy/edge-shared/delivery";

/** Oldest first. */
export const HELD_PACKAGES = `
  SELECT ph.id AS hold_id, ph.shop_fulfillment_id AS package_id, o.order_number, s.name AS shop_name,
         d.name AS driver_name, ph.round_id, ph.step, ph.reason, ph.note, ph.created_at,
         -- A hold on ONE bag names it; a hold on the whole package has no bag.
         pp.parcel_code, pp.seq AS parcel_seq, pp.zone AS parcel_zone,
         (SELECT count(*) FROM public.package_parcel l
           WHERE l.shop_fulfillment_id = ph.shop_fulfillment_id AND l.voided_at IS NULL)::int AS parcel_of
    FROM public.package_hold ph
    LEFT JOIN public.package_parcel pp ON pp.id = ph.parcel_id
    JOIN public.shop_fulfillment sf ON sf.id = ph.shop_fulfillment_id
    JOIN public."order" o ON o.id = sf.order_id
    JOIN public.shop s ON s.id = sf.shop_id
    JOIN public.driver d ON d.id = ph.driver_id
   WHERE ph.resolution IS NULL
   ORDER BY ph.created_at
`;

const SETTINGS = `(SELECT COALESCE((SELECT load_overdue_min FROM public.delivery_settings WHERE id = 1), 20) AS load_min,
                          COALESCE((SELECT checkin_overdue_min FROM public.delivery_settings WHERE id = 1), 30) AS checkin_min) cfg`;

/**
 * When each unfinished round's next step became due and its overdue threshold. Delivery: due at its
 * opening (or when planned, with no window), overdue `load_min` after, while a drop is unloaded.
 * Collection: due when its last shop settled, overdue `checkin_min` after, until checked in.
 */
const DUE = `
  SELECT dr.id AS round_id, dr.kind, dr.status, d.name AS driver_name, ${ROUND_STAGE_COLUMNS},
         CASE WHEN dr.kind = 'delivery'
              THEN COALESCE(public.round_opens_at(dr.kind, dr.deadline_at, dr.window_start_at), dr.created_at)
              ELSE (SELECT max(rs.completed_at) FROM public.round_stop rs WHERE rs.round_id = dr.id AND rs.kind = 'shop_pickup')
         END AS due_at,
         CASE WHEN dr.kind = 'delivery' THEN cfg.load_min ELSE cfg.checkin_min END AS threshold_min
    FROM public.driver_round dr
    JOIN public.driver d ON d.id = dr.driver_id
    ${ROUND_STAGE_LATERAL}
    CROSS JOIN ${SETTINGS}
   WHERE dr.status IN ('planned', 'in_progress')
     AND (
           (dr.kind = 'delivery' AND stage_facts.drops_pending > 0)
        OR (dr.kind = 'collection' AND stage_facts.shops_total > 0
            AND stage_facts.shops_settled = stage_facts.shops_total AND NOT stage_facts.checked_in)
         )
`;

export const OVERDUE_RUNS = `
  SELECT * FROM (${DUE}) due
   WHERE due.due_at IS NOT NULL AND due.due_at + make_interval(mins => due.threshold_min) <= now()
   ORDER BY due.due_at
`;

/** In [$1, now): what the planner pass announces. */
export const OVERDUE_CROSSED_SINCE = `
  SELECT count(*)::int AS n FROM (${DUE}) due
   WHERE due.due_at IS NOT NULL
     AND due.due_at + make_interval(mins => due.threshold_min) >= $1::timestamptz
     AND due.due_at + make_interval(mins => due.threshold_min) < now()
`;

/** Today's (Melbourne) checks that found anything, newest first. */
export const VEHICLE_CHECKS_TODAY = `
  SELECT vc.id AS check_id, d.name AS driver_name,
         concat_ws(' ', v.make, v.model) || ' · ' || v.registration_plate AS vehicle_label,
         vc.answers, vc.unsafe, vc.created_at, vc.cleared_at, vc.clear_note
    FROM public.vehicle_check vc
    JOIN public.driver d ON d.id = vc.driver_id
    JOIN public.vehicle v ON v.id = vc.vehicle_id
   WHERE vc.local_date = (now() AT TIME ZONE 'Australia/Melbourne')::date
     AND (vc.unsafe OR vc.minor)
   ORDER BY vc.unsafe DESC, vc.created_at DESC
`;

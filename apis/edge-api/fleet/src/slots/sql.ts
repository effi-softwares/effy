/** Melbourne's calendar date now. */
export const MEL_TODAY = `(now() AT TIME ZONE 'Australia/Melbourne')::date`;

/** `booked` comes only from `public.delivery_slot_load`, the one definition of "a booking counts" that checkout reads too. */
export const LIST_SLOTS = `
  SELECT s.id,
         to_char(s.start_time,  'HH24:MI') AS start_time,
         to_char(s.end_time,    'HH24:MI') AS end_time,
         to_char(s.cutoff_time, 'HH24:MI') AS cutoff_time,
         s.capacity,
         s.any_time,
         s.status,
         s.updated_at,
         COALESCE(l.booked, 0)        AS booked_today,
         COALESCE(l.over_capacity, 0) AS over_capacity_today
    FROM public.delivery_slot s
    LEFT JOIN public.delivery_slot_load l
           ON l.slot_id = s.id AND l.delivery_date = ${MEL_TODAY}
`;

/** On each of the given days, from the same view. */
export const SLOT_LOAD_ON_DAYS = `
  SELECT l.slot_id,
         l.delivery_date::text AS delivery_date,
         l.booked,
         l.over_capacity
    FROM public.delivery_slot_load l
   WHERE l.delivery_date = ANY($1::date[])
`;

/** The look-ahead and closed weekdays. */
export const CALENDAR_SETTINGS = `
  SELECT effy_lookahead_days, standard_no_delivery_weekdays::int[] AS no_weekdays
    FROM public.delivery_settings WHERE id = 1
`;

/** Closed dates from today (Melbourne) on. */
export const CLOSED_DATES = `
  SELECT day::text AS day FROM public.delivery_non_delivery_date WHERE day >= ${MEL_TODAY}
`;

export const INSERT_SLOT = `
  INSERT INTO public.delivery_slot (start_time, end_time, cutoff_time, capacity, updated_by)
  VALUES ($1::time, $2::time, $3::time, $4, $5)
  RETURNING id
`;

export const SLOT_FOR_UPDATE = `
  SELECT to_char(start_time,  'HH24:MI') AS start_time,
         to_char(end_time,    'HH24:MI') AS end_time,
         to_char(cutoff_time, 'HH24:MI') AS cutoff_time,
         capacity,
         any_time,
         status
    FROM public.delivery_slot
   WHERE id = $1
     FOR UPDATE
`;

/** Touches `delivery_slot` only: a placed order reads its window from its own snapshot. */
export const UPDATE_SLOT = `
  UPDATE public.delivery_slot
     SET start_time = $2::time, end_time = $3::time, cutoff_time = $4::time,
         capacity = $5, status = $6, updated_by = $7, updated_at = now()
   WHERE id = $1
`;

// SQL for same-day delivery slots (069). Raw and parameterized; no ORM (Principle VI).

/** Melbourne's calendar date right now. Slots are wall-clock facts about Effy's working day. */
export const MEL_TODAY = `(now() AT TIME ZONE 'Australia/Melbourne')::date`;

/**
 * Every slot with today's load.
 *
 * ⚠ `booked` COMES FROM `public.delivery_slot_load` AND NOWHERE ELSE. That view is the one
 * definition of "a booking counts" — confirmed, or held and not lapsed — and checkout (Go) reads the
 * same view. A WHERE clause written here would be a second definition, and the console would then
 * show "2 of 3" for a slot checkout considers full.
 */
export const LIST_SLOTS = `
  SELECT s.id,
         to_char(s.start_time,  'HH24:MI') AS start_time,
         to_char(s.end_time,    'HH24:MI') AS end_time,
         to_char(s.cutoff_time, 'HH24:MI') AS cutoff_time,
         s.capacity,
         s.status,
         s.updated_at,
         COALESCE(l.booked, 0)        AS booked_today,
         COALESCE(l.over_capacity, 0) AS over_capacity_today
    FROM public.delivery_slot s
    LEFT JOIN public.delivery_slot_load l
           ON l.slot_id = s.id AND l.delivery_date = ${MEL_TODAY}
`;

/**
 * 078 — how full every slot is on each of the given days (today and the Effy delivery days after it).
 *
 * ⚠ THE SAME VIEW, for the same reason as above: one definition of "a booking counts".
 */
export const SLOT_LOAD_ON_DAYS = `
  SELECT l.slot_id,
         l.delivery_date::text AS delivery_date,
         l.booked,
         l.over_capacity
    FROM public.delivery_slot_load l
   WHERE l.delivery_date = ANY($1::date[])
`;

/** 078 — what the Effy delivery calendar is drawn from: the look-ahead and the closed weekdays. */
export const CALENDAR_SETTINGS = `
  SELECT effy_lookahead_days, standard_no_delivery_weekdays::int[] AS no_weekdays
    FROM public.delivery_settings WHERE id = 1
`;

/** 078 — individually closed dates from today (Melbourne) on. */
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
         status
    FROM public.delivery_slot
   WHERE id = $1
     FOR UPDATE
`;

/** ⚠ Touches `delivery_slot` ONLY. A placed order reads its window from its own snapshot (FR-026). */
export const UPDATE_SLOT = `
  UPDATE public.delivery_slot
     SET start_time = $2::time, end_time = $3::time, cutoff_time = $4::time,
         capacity = $5, status = $6, updated_by = $7, updated_at = now()
   WHERE id = $1
`;

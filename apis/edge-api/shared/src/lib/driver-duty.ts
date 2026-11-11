/**
 * A driver is on duty while they have an open duty session (`ended_at IS NULL`); a partial unique index allows one per
 * driver. One copy, read by fleet's driver lists and the message audiences (112). Expects the driver aliased `d`.
 */
export const ON_DUTY_EXISTS = `EXISTS (
  SELECT 1 FROM public.driver_duty_session s
   WHERE s.driver_id = d.id AND s.ended_at IS NULL
)`;

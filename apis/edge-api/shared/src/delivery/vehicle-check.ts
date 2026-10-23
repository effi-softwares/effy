// One definition of "may this driver's vehicle take work today?", for the planner, readiness and /me.

/** `none` | `ok` | `due` | `unsafe` for driver `d` and held vehicle `v`; `ok` whenever the check is off. */
export function vehicleCheckStateSql(d = "d", v = "v"): string {
  const today = `(now() AT TIME ZONE 'Australia/Melbourne')::date`;
  return `CASE
    WHEN ${v}.id IS NULL THEN 'none'
    WHEN NOT COALESCE((SELECT vehicle_check_required FROM public.delivery_settings WHERE id = 1), false) THEN 'ok'
    WHEN NOT EXISTS (SELECT 1 FROM public.vehicle_check vc
                      WHERE vc.driver_id = ${d}.id AND vc.vehicle_id = ${v}.id AND vc.local_date = ${today}) THEN 'due'
    WHEN EXISTS (SELECT 1 FROM public.vehicle_check vc
                  WHERE vc.driver_id = ${d}.id AND vc.vehicle_id = ${v}.id AND vc.local_date = ${today}
                    AND vc.unsafe AND vc.cleared_at IS NULL) THEN 'unsafe'
    ELSE 'ok'
  END`;
}

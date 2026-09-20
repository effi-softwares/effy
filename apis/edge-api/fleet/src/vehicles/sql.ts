// Shared SQL fragments for the vehicle domain (061). Raw parameterized SQL, no ORM, no query builder
// (constitution Principle VI).
//
// These live in one file because the register, the detail read and the readiness view all need the
// same definition of "is this vehicle compliant". Three implementations of that rule would eventually
// disagree, and an operator would be told a van is roadworthy on one screen and not on another.

/**
 * Which compliance items have lapsed, as a `text[]`. An empty array means compliant.
 *
 * ⚠ DERIVED ON READ, NEVER STORED — and this is not a style preference. Compliance is a function of
 * TODAY. A vehicle that was compliant when its row was written is not compliant tomorrow, and nothing
 * would update a stored flag: it would go stale silently at midnight and report a van as roadworthy
 * on the morning its registration lapsed. This is 027's counted-not-stored rule, fourth application.
 *
 * ⚠ AN ENUMERATED CAUSE, NOT A BOOLEAN — the same reasoning `BLOCKED_REASONS` records for drivers.
 * "Not compliant" without "which item" is not actionable, and the remedy differs: renew a
 * registration, renew a policy, book a roadworthy inspection.
 *
 * ⚠ A NULL expiry date is NOT a lapse. Nobody has supplied the date yet, which is an ordinary state
 * for a vehicle being entered; treating unknown as expired would flood the register with false alarms
 * on the day it is first populated, and operators would learn to ignore the column.
 *
 * Judged in Australia/Melbourne, like every other date on this platform (047's timezone rule).
 */
export const COMPLIANCE_ISSUES = `(
  ARRAY_REMOVE(ARRAY[
    CASE WHEN v.registration_expires_on IS NOT NULL
          AND v.registration_expires_on < (now() AT TIME ZONE 'Australia/Melbourne')::date
         THEN 'registration_expired' END,
    CASE WHEN v.insurance_expires_on IS NOT NULL
          AND v.insurance_expires_on < (now() AT TIME ZONE 'Australia/Melbourne')::date
         THEN 'insurance_expired' END,
    CASE WHEN v.roadworthy_expires_on IS NOT NULL
          AND v.roadworthy_expires_on < (now() AT TIME ZONE 'Australia/Melbourne')::date
         THEN 'roadworthy_expired' END
  ], NULL)
)`;

/**
 * The driver currently holding a vehicle, if any.
 *
 * ⚠ THE OPEN HOLDING ROW IS THE ONLY SOURCE OF TRUTH. There is deliberately no
 * `vehicle.current_driver_id` and no `driver.current_vehicle_id` — a stored pointer and the holding
 * rows can disagree, and then nobody knows which is true (033/052/053's recurring defect).
 */
export const CURRENT_HOLDING_JOIN = `
  LEFT JOIN public.vehicle_holding vh ON vh.vehicle_id = v.id AND vh.ended_at IS NULL
  LEFT JOIN public.driver          hd ON hd.id = vh.driver_id`;

/** The only status a vehicle can be issued in. ⚠ `off_road` is refused too — the van is in a
 *  workshop — but with its own message, so the two refusals stay distinguishable. */
export const ISSUABLE_STATUS = "active";

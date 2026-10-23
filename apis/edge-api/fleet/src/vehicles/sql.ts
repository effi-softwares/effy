// One definition of "is this vehicle compliant" for the register, detail and readiness views.

/**
 * Lapsed compliance items as a `text[]`; empty means compliant. Derived on read (compliance changes at
 * midnight), enumerated (each has its own remedy), and a null expiry is not a lapse. Melbourne time.
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

/** The open holding row is the only source of truth; there is no stored current-driver pointer. */
export const CURRENT_HOLDING_JOIN = `
  LEFT JOIN public.vehicle_holding vh ON vh.vehicle_id = v.id AND vh.ended_at IS NULL
  LEFT JOIN public.driver          hd ON hd.id = vh.driver_id`;

/** `off_road` is refused too, with its own message. */
export const ISSUABLE_STATUS = "active";

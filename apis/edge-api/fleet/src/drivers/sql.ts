// One definition of "can this driver receive work", shared by every repository that asks.

/** An open duty session (`ended_at IS NULL`); a partial unique index allows one per driver. */
export const ON_DUTY_EXISTS = `EXISTS (
  SELECT 1 FROM public.driver_duty_session s
   WHERE s.driver_id = d.id AND s.ended_at IS NULL
)`;

/**
 * Why this driver cannot be given work, as a text[]; empty means ready. Enumerated, because each
 * cause has a different remedy. Vehicle-registration expiry is flagged elsewhere but does not block.
 */
export const BLOCKED_REASONS = `(
  ARRAY_REMOVE(ARRAY[
    CASE WHEN d.status = 'suspended'  THEN 'suspended'  END,
    CASE WHEN d.status = 'offboarded' THEN 'offboarded' END,
    -- A driver cleared for NOTHING is blocked; the remedy is a clearance.
    -- ⚠ Disabled zones are excluded, so a driver whose only clearances name zones the platform has
    -- stopped serving is correctly reported as cleared for nothing.
    CASE WHEN NOT EXISTS (
           SELECT 1
             FROM public.driver_zone_capability bc
             LEFT JOIN public.delivery_zone bz ON bz.id = bc.zone_id
            WHERE bc.driver_id = d.id
              AND (bc.zone_id IS NULL OR bz.status = 'active')
         ) THEN 'no_capabilities' END,
    CASE WHEN d.licence_expires_on IS NOT NULL
          AND d.licence_expires_on < (now() AT TIME ZONE 'Australia/Melbourne')::date
         THEN 'licence_expired' END,
    -- ⚠ EVERY APPLICABLE REASON IS EMITTED, NOT THE FIRST ONE FOUND. A driver can be
    -- suspended AND holding a van with lapsed rego; sending an operator to fix only one of those
    -- wastes the trip. ARRAY_REMOVE keeps the array dense without collapsing the causes.
    CASE WHEN NOT EXISTS (
           SELECT 1 FROM public.vehicle_holding bvh
            WHERE bvh.driver_id = d.id AND bvh.ended_at IS NULL
         ) THEN 'no_vehicle' END,
    -- ⚠ The reason names the VEHICLE's problem, not the driver's. The remedy is to renew a
    -- registration or book an inspection - not to do anything to the person.
    CASE WHEN EXISTS (
           SELECT 1
             FROM public.vehicle_holding bvh
             JOIN public.vehicle bv ON bv.id = bvh.vehicle_id
            WHERE bvh.driver_id = d.id AND bvh.ended_at IS NULL
              AND (
                (bv.registration_expires_on IS NOT NULL
                   AND bv.registration_expires_on < (now() AT TIME ZONE 'Australia/Melbourne')::date)
                OR (bv.insurance_expires_on IS NOT NULL
                   AND bv.insurance_expires_on < (now() AT TIME ZONE 'Australia/Melbourne')::date)
                OR (bv.roadworthy_expires_on IS NOT NULL
                   AND bv.roadworthy_expires_on < (now() AT TIME ZONE 'Australia/Melbourne')::date)
                OR bv.status <> 'active'
              )
         ) THEN 'vehicle_non_compliant' END
    -- ⚠ licence_class_insufficient IS NOT EMITTED YET, AND THAT IS A DECISION, NOT AN OMISSION.
    -- Every Effy vehicle is a light vehicle, so a current Australian Class C covers all of them and
    -- the rule would have exactly zero true cases. Research verified the thresholds: Chain of
    -- Responsibility begins above 4.5t GVM and heavy-vehicle fatigue law above 12t, neither of which
    -- reaches these vans. The CLASS is recorded (driver.licence_class) so the day a heavier vehicle
    -- is bought, this becomes a predicate over data that already exists rather than a schema change
    -- under time pressure. Emitting a reason that can never fire would teach operators to ignore it.
  ], NULL)
)`;

/** Ready at a shop and not collected. */
export const READY_TO_COLLECT = `
  SELECT sf.id
    FROM public.shop_fulfillment sf
   WHERE sf.status = 'ready_for_pickup'`;

/** An Effy parcel collected and not yet delivered (by delivery type, never the method). */
export const READY_TO_DELIVER = `
  SELECT sf.id
    FROM public.shop_fulfillment sf
    JOIN public."order" o ON o.id = sf.order_id
    LEFT JOIN public.order_package_delivery opd
      ON opd.order_id = sf.order_id AND opd.shop_id = sf.shop_id
   WHERE sf.status = 'collected'
     AND o.delivery_type = 'effy'`;

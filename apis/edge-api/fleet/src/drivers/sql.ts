// Shared SQL fragments for the fleet service (056). Raw parameterized SQL, no ORM, no query builder
// (constitution Principle VI).
//
// These live in one file because more than one repository needs the same definition of "can this
// driver receive work". Two implementations of that rule would eventually disagree, and the register
// would tell an operator a driver is fine while whatever assigns work passes over them.

/**
 * Is the driver on duty right now? An open duty session (`ended_at IS NULL`) is what "on duty" means
 * on this platform — a partial unique index guarantees at most one per driver.
 */
export const ON_DUTY_EXISTS = `EXISTS (
  SELECT 1 FROM public.driver_duty_session s
   WHERE s.driver_id = d.id AND s.ended_at IS NULL
)`;

/**
 * Why this driver cannot be given work, as a text[] (FR-044). Empty array = ready.
 *
 * ⚠ AN ENUMERATED CAUSE, NOT A BOOLEAN. "Cannot receive work" without "why" is not actionable, and
 * the remedy differs per cause: assign a zone, restore them, or renew a licence. A driver with no
 * zone is INERT FOR ASSIGNMENT TODAY and nothing anywhere says so — SC-009 is that this becomes
 * visible on the register, before an order is affected, rather than by an order failing to move.
 *
 * ⚠ Vehicle-registration expiry is deliberately NOT a blocking cause. A driver may change vehicle;
 * it is flagged in the readiness view but does not make the person unable to work.
 */
export const BLOCKED_REASONS = `(
  ARRAY_REMOVE(ARRAY[
    CASE WHEN d.status = 'suspended'  THEN 'suspended'  END,
    CASE WHEN d.status = 'offboarded' THEN 'offboarded' END,
    CASE WHEN d.delivery_zone_id IS NULL THEN 'no_zone' END,
    CASE WHEN d.licence_expires_on IS NOT NULL
          AND d.licence_expires_on < (now() AT TIME ZONE 'Australia/Melbourne')::date
         THEN 'licence_expired' END,
    -- ── 061 ──────────────────────────────────────────────────────────────────────────────────────
    -- ⚠ EVERY APPLICABLE REASON IS EMITTED, NOT THE FIRST ONE FOUND (FR-026). A driver can be
    -- suspended AND holding a van with lapsed rego; sending an operator to fix only one of those
    -- wastes the trip. ARRAY_REMOVE keeps the array dense without collapsing the causes.
    CASE WHEN NOT EXISTS (
           SELECT 1 FROM public.vehicle_holding bvh
            WHERE bvh.driver_id = d.id AND bvh.ended_at IS NULL
         ) THEN 'no_vehicle' END,
    -- ⚠ The reason names the VEHICLE's problem, not the driver's. The remedy is to renew a
    -- registration or book an inspection — not to do anything to the person.
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

/**
 * A package the platform has finished preparing and nobody has come for.
 *
 * ⚠ THIS PREDICATE'S MEANING CHANGED WHEN THE WORK MODEL WAS DROPPED, and the change is the honest
 * one. It used to read "ready_for_pickup AND no collection_task claims it", because it was a copy of
 * the 049 sweep's own candidate query, pinned by a parity test so the duty screen could not disagree
 * with what the sweep actually saw. There is no sweep now and nothing claims anything, so the second
 * term would match every row and the count is simply the backlog.
 *
 * ⚠ AND THE COUNT IS MORE LOAD-BEARING THAN IT WAS, not less. Until the dispatch slice lands, NOTHING
 * moves a package from `ready_for_pickup` — so this number only goes up, and this screen is the one
 * place at Effy where that is visible. It is supposed to look alarming.
 */
export const READY_TO_COLLECT = `
  SELECT sf.id
    FROM public.shop_fulfillment sf
   WHERE sf.status = 'ready_for_pickup'`;

/**
 * A same-day package that has been collected and not yet delivered. The mirror of READY_TO_COLLECT
 * for the second half of a shift, and it lost the same `NOT EXISTS` term for the same reason.
 */
export const READY_TO_DELIVER = `
  SELECT sf.id
    FROM public.shop_fulfillment sf
    JOIN public.order_package_delivery opd
      ON opd.order_id = sf.order_id AND opd.shop_id = sf.shop_id AND opd.method = 'same_day'
   WHERE sf.status = 'collected'`;

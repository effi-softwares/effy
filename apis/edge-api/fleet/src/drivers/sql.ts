// Shared SQL fragments for the fleet service (056). Raw parameterized SQL, no ORM, no query builder
// (constitution Principle VI).
//
// These live in one file because more than one repository needs the same definition of "can this
// driver receive work". Two implementations of that rule would eventually disagree, and the screen
// would tell an operator a driver is fine while the assignment sweep skips them.

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
         THEN 'licence_expired' END
  ], NULL)
)`;

/**
 * A package that is ready to collect and that no collection task has claimed.
 *
 * ⚠ THIS IS THE ASSIGNMENT SWEEP'S OWN CANDIDATE PREDICATE, copied here deliberately and pinned by a
 * test that asserts the two agree (`assignment-parity.test.ts`). The source is
 * apis/edge-api/driver/src/assignment/repository.ts (assignCollectionWork). If the console derived
 * "unassigned" its own way it would eventually disagree with what the sweep actually sees, and the
 * duty screen would be confidently wrong about the one question it exists to answer.
 */
export const READY_TO_COLLECT = `
  SELECT sf.id
    FROM public.shop_fulfillment sf
   WHERE sf.status = 'ready_for_pickup'
     AND NOT EXISTS (
       SELECT 1 FROM public.collection_task ct WHERE ct.shop_fulfillment_id = sf.id
     )`;

/**
 * A same-day package checked in at the hub that no delivery drop has claimed. The mirror of
 * READY_TO_COLLECT for the second half of the run, and the same parity rule applies.
 */
export const READY_TO_DELIVER = `
  SELECT sf.id
    FROM public.shop_fulfillment sf
    JOIN public.order_package_delivery opd
      ON opd.order_id = sf.order_id AND opd.shop_id = sf.shop_id AND opd.method = 'same_day'
   WHERE sf.status = 'collected'
     AND NOT EXISTS (
       SELECT 1 FROM public.delivery_task_package dtp WHERE dtp.shop_fulfillment_id = sf.id
     )`;

/**
 * Work claimed by a driver the automatic sweep will NOT reclaim (FR-021, data-model §5a).
 *
 * ⚠ `releaseIneligibleWork` releases only work NOT YET PHYSICALLY STARTED — `assigned`/`en_route`
 * collection tasks and `staged` drops — and its comment says why: "In-progress steps are NEVER
 * yanked." That is CORRECT. The packages are in a van, and deleting the task would make the platform
 * forget goods that exist.
 *
 * The gap is that nothing tells a human it happened. `collection_task_package_uq
 * UNIQUE(shop_fulfillment_id)` keeps those packages claimed and the sweep's `NOT EXISTS` skips them,
 * so they are unreachable by any automatic path — permanently, silently. These two predicates are
 * the reader that makes the state visible.
 */
export const STRANDED_COLLECTION_STATUSES = ["collected", "short"] as const;
export const STRANDED_DELIVERY_STATUSES = ["out_for_delivery", "en_route", "arrived"] as const;

/** A driver is ineligible when the record is not active, or they have no open duty session.
 *  ⚠ Written as `d.status <> 'active'` rather than naming the non-active states, because HERE the
 *  positive form is the dangerous one: a new employment status must count as ineligible by default. */
export const DRIVER_INELIGIBLE = `(
  d.status <> 'active'
  OR NOT EXISTS (
    SELECT 1 FROM public.driver_duty_session s
     WHERE s.driver_id = d.id AND s.ended_at IS NULL
  )
)`;

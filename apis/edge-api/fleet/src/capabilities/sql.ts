// Shared SQL fragments for driver clearances (062). Raw parameterized SQL, no ORM (Principle VI).

/**
 * ⚠⚠ IS THIS DRIVER CLEARED FOR THIS (area, function)? THE `OR … IS NULL` IS THE WHOLE OF
 * FR-011, AND IT IS THE MOST DANGEROUS LINE IN THIS FEATURE TO GET WRONG.
 *
 * `zone_id IS NULL` is an "every zone" grant. Omitting the clause:
 *   · compiles;
 *   · passes every test written against zone-specific grants;
 *   · and silently excludes EVERY "everywhere" driver from EVERY zone.
 *
 * Nothing fails, nothing logs, and the only symptom is work quietly not being offered to people who
 * are cleared for it. That is why C3 proves the behaviour by CREATING a zone mid-test rather than by
 * asserting the clause exists, and why NP2 removes it and confirms C3 goes red.
 *
 * 082 — a clearance is (function, area); the method column is no longer read by anything.
 *
 * Parameters: $1 driver, $2 function, $3 zone.
 */
export const IS_CLEARED_FOR = `EXISTS (
  SELECT 1 FROM public.driver_zone_capability c
   WHERE c.driver_id = $1
     AND c.function  = $2
     AND (c.zone_id = $3 OR c.zone_id IS NULL)
)`;

/**
 * Drivers cleared for a given (area, function), as a correlated fragment over `dz` (the zone)
 * and the aliases `cap`/`capd`. Used by the coverage query.
 *
 * ⚠ Same `OR … IS NULL` rule, same reason. An every-zone driver covers every zone, and a coverage
 * view that forgot this would report gaps that do not exist — sending operators to grant clearances
 * people already hold.
 */
export const CLEARED_DRIVERS_FOR_ZONE = `
  SELECT capd.id AS driver_id
    FROM public.driver_zone_capability cap
    JOIN public.driver capd ON capd.id = cap.driver_id
   WHERE cap.function = needed.function
     AND (cap.zone_id = needed.zone_id OR cap.zone_id IS NULL)`;

export const CAPABILITY_FUNCTIONS = ["collection", "delivery"] as const;
/**
 * ⚠ 082 — THE VALUE WRITTEN INTO THE UNREAD `method` COLUMN OF A NEW GRANT. The column is NOT NULL and
 * part of the unique index until E9 drops it; nothing reads it, and every existing row — whichever of
 * the two old values it holds — counts as its (function, area). One fixed value for new rows keeps
 * "grant twice" idempotent.
 */
export const UNREAD_METHOD = "standard";

// Shared SQL fragments for driver clearances (062). Raw parameterized SQL, no ORM (Principle VI).

/**
 * ⚠⚠ IS THIS DRIVER CLEARED FOR THIS (zone, function, method)? THE `OR … IS NULL` IS THE WHOLE OF
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
 * Parameters: $1 driver, $2 function, $3 method, $4 zone.
 */
export const IS_CLEARED_FOR = `EXISTS (
  SELECT 1 FROM public.driver_zone_capability c
   WHERE c.driver_id = $1
     AND c.function  = $2
     AND c.method    = $3
     AND (c.zone_id = $4 OR c.zone_id IS NULL)
)`;

/**
 * Drivers cleared for a given (zone, function, method), as a correlated fragment over `dz` (the zone)
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
     AND cap.method   = needed.method
     AND (cap.zone_id = needed.zone_id OR cap.zone_id IS NULL)`;

export const CAPABILITY_FUNCTIONS = ["collection", "delivery"] as const;
export const CAPABILITY_METHODS = ["standard", "same_day"] as const;

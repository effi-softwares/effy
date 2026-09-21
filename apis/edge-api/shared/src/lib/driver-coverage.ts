// "What does this driver cover?" — ONE definition, shared by every service that asks (062, promoted
// from edge-api/fleet when the driver app became its second reader).
//
// ⚠ WHY THIS IS SHARED RATHER THAN RETYPED. Two services answer this question for two audiences:
// back-office reads it to staff a zone, and the driver app renders it on the driver's own account
// screen. If they disagree, a driver is told they cover something the dispatcher does not believe
// they cover — and neither surface fails, because a SELECT that returns the wrong string returns
// successfully. 054's "availability written in 14 places" lesson, applied at two.
//
// ⚠ THIS IS THE SOURCE OF `DriverMeDTO.zone`, AND IT REPLACED A COLUMN WITHOUT CHANGING THE SHAPE.
// Until 062 that field was `driver.delivery_zone_id` — a single assigned zone that no assignment
// code ever read. It now derives from real clearances, so the driver app tells the truth with no
// Kotlin changed and no generated contract regenerated: the same move 061 made for `DriverVehicle`.

/** The shape the aggregate produces. `n` is text because `count(*)` is a bigint over the wire. */
export interface DriverCoverageAggregate {
  every: boolean | null;
  names: string[] | null;
  n: string;
}

/**
 * The aggregate behind the label, as a SQL fragment so each caller keeps control of its own round
 * trips — back-office asks about one driver directly, the driver app gets it inside the record read
 * it was already making.
 *
 * `driverIdExpr` is the expression naming the driver: a placeholder (`$1`) for a standalone query,
 * or a correlated column (`d.id`) inside a LATERAL join.
 *
 * ⚠ A DISABLED ZONE IS NOT COVERAGE. A clearance for a zone that has since been disabled matches no
 * work, so counting it would overstate what the driver covers. An every-zone grant survives that
 * filter by construction — it has no zone row to disable.
 */
export function coverageAggregateSql(driverIdExpr: string): string {
  return `SELECT bool_or(c.zone_id IS NULL)                     AS every,
                 array_remove(array_agg(DISTINCT z.name), NULL) AS names,
                 count(*)::text                                 AS n
            FROM public.driver_zone_capability c
            LEFT JOIN public.delivery_zone z ON z.id = c.zone_id
           WHERE c.driver_id = ${driverIdExpr}
             AND (c.zone_id IS NULL OR z.status = 'active')`;
}

/**
 * One line describing what a driver covers. Null when they are cleared for nothing, which both
 * surfaces already render as "cannot be given work" rather than as an empty string.
 *
 * ⚠ "Every zone" WINS OVER A COUNT. A driver holding an every-zone clearance plus two named ones
 * covers every zone, and saying "3 zones" would understate it — and would go stale the moment a
 * fourth zone is created, which is precisely what the every-zone grant exists to survive.
 */
export function coverageLabel(row: DriverCoverageAggregate | undefined): string | null {
  if (!row || Number(row.n) === 0) return null;
  if (row.every) return "Every zone";
  const names = row.names ?? [];
  if (names.length === 0) return null;
  if (names.length === 1) return names[0]!;
  return `${names.length} zones`;
}

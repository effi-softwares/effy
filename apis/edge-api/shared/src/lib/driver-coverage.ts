// "What does this driver cover?": one definition for back-office (staffing a zone) and the driver app
// (`DriverMeDTO.zone`), derived from clearances.

/** `n` is text because `count(*)` is a bigint over the wire. */
export interface DriverCoverageAggregate {
  every: boolean | null;
  names: string[] | null;
  n: string;
}

/**
 * The aggregate as a SQL fragment, so each caller keeps its own round trips. `driverIdExpr` is `$1` or a
 * correlated column (`d.id`). A disabled zone's clearance is not coverage; every-zone grants survive.
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

/** Null when cleared for nothing. "Every zone" wins over a count. */
export function coverageLabel(row: DriverCoverageAggregate | undefined): string | null {
  if (!row || Number(row.n) === 0) return null;
  if (row.every) return "Every zone";
  const names = row.names ?? [];
  if (names.length === 0) return null;
  if (names.length === 1) return names[0]!;
  return `${names.length} zones`;
}

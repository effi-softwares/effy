// Derived on read, never stored: coverage depends on today's people, zones and clearances.

import { query } from "@effy/edge-shared";
import type { CoverageGap } from "@effy/shared-types";

import { BLOCKED_REASONS } from "../drivers/sql";

interface GapRow {
  zone_id: string;
  zone_name: string;
  function: string;
  cleared: string;
  available: string;
}

/**
 * Every (area, function) that cannot be served, with the reason; a covered combination emits no row.
 * The availability rule comes from `drivers/sql.ts`, so this and the readiness view always agree.
 */
export async function coverageGaps(): Promise<CoverageGap[]> {
  const res = await query<GapRow>(
    `WITH needed AS (
       SELECT z.id AS zone_id, z.name AS zone_name, f.function
         FROM public.delivery_zone z
         CROSS JOIN (VALUES ('collection'), ('delivery')) AS f(function)
        WHERE z.status = 'active'
     ),
     tallied AS (
       SELECT needed.zone_id,
              needed.zone_name,
              needed.function,
              -- ⚠ DISTINCT: a driver can match through more than one clearance.
              count(DISTINCT d.id)                                                    AS cleared,
              count(DISTINCT d.id) FILTER (WHERE cardinality(${BLOCKED_REASONS}) = 0) AS available
         FROM needed
         LEFT JOIN public.driver_zone_capability cap
                ON cap.function = needed.function
               -- ⚠ THE "EVERY ZONE" CLAUSE. Omitting it compiles, passes every zone-specific test,
               -- and reports gaps that do not exist - sending operators to grant clearances people
               -- already hold.
               AND (cap.zone_id = needed.zone_id OR cap.zone_id IS NULL)
         LEFT JOIN public.driver d ON d.id = cap.driver_id
        GROUP BY needed.zone_id, needed.zone_name, needed.function
     )
     SELECT zone_id, zone_name, function, cleared::text, available::text
       FROM tallied
      WHERE available = 0
      ORDER BY zone_name, function`,
  );

  return res.rows.map((r) => ({
    zoneId: r.zone_id,
    zoneName: r.zone_name,
    function: r.function as CoverageGap["function"],
    // Two reasons: nobody cleared (grant a clearance) and everybody cleared unavailable (a rostering problem).
    reason: Number(r.cleared) === 0 ? "no_driver_cleared" : "all_cleared_unavailable",
    clearedDriverCount: Number(r.cleared),
  }));
}

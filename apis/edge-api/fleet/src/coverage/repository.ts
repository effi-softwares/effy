// Coverage — which zones cannot be served, and why (062). Raw parameterized SQL, no ORM.
//
// ⚠ DERIVED ON READ, NEVER STORED. Coverage is a function of TODAY: who is employed, who is blocked,
// which zones are active, who is cleared. A stored flag would go stale silently — 027's
// counted-not-stored rule, fifth application on this platform.

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
 * Every (area, function) that cannot be served, with the reason.
 *
 * ⚠ 082 — ONE ROW PER AREA AND FUNCTION. Until 082 this enumerated a delivery METHOD as well, and
 * took care to list same-day only where it was sold (a permanent, unfixable row teaches an operator
 * to ignore the screen). A clearance no longer has a method: a driver who may deliver in an area
 * delivers whatever Effy delivers there, so the question is simply whether anyone can collect for,
 * and deliver in, each area.
 *
 * ⚠ THE AVAILABILITY RULE IS READ FROM `drivers/sql.ts`, NOT RE-DERIVED. FR-020 requires that this
 * view and the work-readiness view never disagree about whether a driver can work. Two copies of that
 * rule would drift the first time either changed, and an operator would have no way to tell which
 * screen was right. Importing the fragment makes agreement STRUCTURAL rather than a matter of
 * discipline — the shape 058 used to keep a shop's Needs-attention figure pinned to one query.
 *
 * ⚠ A COVERED COMBINATION EMITS NO ROW (FR-019). The response is a list of problems, not a matrix.
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
              -- ⚠ DISTINCT: a driver cleared before 082 may hold two rows for one area and function.
              count(DISTINCT d.id)                                                    AS cleared,
              count(DISTINCT d.id) FILTER (WHERE cardinality(${BLOCKED_REASONS}) = 0) AS available
         FROM needed
         LEFT JOIN public.driver_zone_capability cap
                ON cap.function = needed.function
               -- ⚠ THE "EVERY ZONE" CLAUSE. Omitting it compiles, passes every zone-specific test,
               -- and reports gaps that do not exist — sending operators to grant clearances people
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
    // ⚠ TWO REASONS, NOT ONE. "Nobody is cleared" is an administrative gap — grant somebody a
    // clearance. "Everybody cleared is unavailable" is a rostering problem — the fix is in the
    // readiness view. Collapsing them tells an operator nothing about what to do next.
    reason: Number(r.cleared) === 0 ? "no_driver_cleared" : "all_cleared_unavailable",
    clearedDriverCount: Number(r.cleared),
  }));
}

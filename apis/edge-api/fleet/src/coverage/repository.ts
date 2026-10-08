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
  method: string;
  cleared: string;
  available: string;
}

/**
 * Every (zone, function, method) that cannot be served, with the reason.
 *
 * ⚠⚠ THE `needed` CTE IS NOT A CROSS JOIN, AND THAT IS THE POINT.
 *
 * `delivery_zone.sameday_eligible` (047) says whether same-day is SOLD in a zone at all — outer and
 * regional zones are standard-only by design. Enumerating same-day everywhere would put permanent,
 * UNFIXABLE rows in the one view whose entire purpose is to be actionable ("nobody is cleared for
 * same-day in Ballarat" — nor should they be, it is not offered there). An operator who cannot clear
 * a gap learns to ignore the screen that shows it, which is 058's "alarming on workload teaches
 * operators to ignore alarms" in another costume.
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
       -- Standard is offered in every active zone.
       SELECT z.id AS zone_id, z.name AS zone_name, f.function, 'standard'::text AS method
         FROM public.delivery_zone z
         CROSS JOIN (VALUES ('collection'), ('delivery')) AS f(function)
        WHERE z.status = 'active'
       UNION ALL
       -- ⚠ Same-day ONLY where the platform actually sells it.
       SELECT z.id, z.name, f.function, 'same_day'::text
         FROM public.delivery_zone z
         CROSS JOIN (VALUES ('collection'), ('delivery')) AS f(function)
        WHERE z.status = 'active' AND z.sameday_eligible
     ),
     tallied AS (
       SELECT needed.zone_id,
              needed.zone_name,
              needed.function,
              needed.method,
              count(d.id)                                                    AS cleared,
              count(d.id) FILTER (WHERE cardinality(${BLOCKED_REASONS}) = 0) AS available
         FROM needed
         LEFT JOIN public.driver_zone_capability cap
                ON cap.function = needed.function
               AND cap.method   = needed.method
               -- ⚠ THE "EVERY ZONE" CLAUSE. Omitting it compiles, passes every zone-specific test,
               -- and reports gaps that do not exist — sending operators to grant clearances people
               -- already hold.
               AND (cap.zone_id = needed.zone_id OR cap.zone_id IS NULL)
         LEFT JOIN public.driver d ON d.id = cap.driver_id
        GROUP BY needed.zone_id, needed.zone_name, needed.function, needed.method
     )
     SELECT zone_id, zone_name, function, method, cleared::text, available::text
       FROM tallied
      WHERE available = 0
      ORDER BY zone_name, function, method`,
  );

  return res.rows.map((r) => ({
    zoneId: r.zone_id,
    zoneName: r.zone_name,
    function: r.function as CoverageGap["function"],
    method: r.method as CoverageGap["method"],
    // ⚠ TWO REASONS, NOT ONE. "Nobody is cleared" is an administrative gap — grant somebody a
    // clearance. "Everybody cleared is unavailable" is a rostering problem — the fix is in the
    // readiness view. Collapsing them tells an operator nothing about what to do next.
    reason: Number(r.cleared) === 0 ? "no_driver_cleared" : "all_cleared_unavailable",
    clearedDriverCount: Number(r.cleared),
  }));
}

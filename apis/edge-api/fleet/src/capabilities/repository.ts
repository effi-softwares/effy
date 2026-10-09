// Repository for driver clearances (062): raw parameterized SQL, no ORM (Principle VI).
//
// ⚠ 082 — A CLEARANCE IS (function, area). Rows written before 082 carry one of two methods and a
// driver may hold both for the same function and area; every read here collapses them to ONE entry,
// a grant adds a row only when none exists for that (function, area), and a revoke removes them all.
// No row was rewritten: nobody lost a clearance, and the column goes at E9.
//
// ⚠ A GRANT IS IDEMPOTENT AND A REVOKE IS IDEMPOTENT, BY DESIGN (FR-005/FR-006). Two operators
// granting the same clearance at the same moment must BOTH succeed — the outcome is correct either
// way, and an error there would be a refusal with nothing to fix. `ON CONFLICT DO NOTHING` against
// `driver_zone_capability_uq` is what makes that true, including for the NULL "every zone" row, which
// a plain UNIQUE would NOT deduplicate.
//
// ⚠ THERE IS DELIBERATELY NO OPTIMISTIC-CONCURRENCY TOKEN HERE, unlike 061's vehicle edit. That
// replaces scalar fields where last-writer-wins loses information; this adds and removes independent
// rows, where there is nothing to overwrite. Same codebase, opposite answer, because the operations
// are not the same shape.

import {
  coverageAggregateSql,
  coverageLabel,
  type DriverCoverageAggregate,
  query,
} from "@effy/edge-shared";
import type { DriverCapability, DriverCapabilitySummary } from "@effy/shared-types";

import { UNREAD_METHOD } from "./sql";

interface CapabilityRow {
  id: string;
  function: string;
  zone_id: string | null;
  zone_name: string | null;
  created_at: Date;
}

function toCapability(r: CapabilityRow): DriverCapability {
  return {
    id: r.id,
    function: r.function as DriverCapability["function"],
    zoneId: r.zone_id,
    // ⚠ NULL for an every-zone grant, never a server-supplied "All zones" string. The label is
    // presentation; a second place naming the concept is a second place it can drift.
    zoneName: r.zone_name,
    grantedAt: r.created_at.toISOString(),
  };
}

/**
 * Every clearance a driver holds.
 *
 * ⚠ DISABLED ZONES ARE FILTERED HERE, NOT DELETED AT WRITE TIME. Disabling a zone is reversible; if
 * the grant were removed, re-enabling the zone would silently leave it uncovered until somebody
 * noticed and re-granted by hand. Every-zone grants are unaffected — they name no zone.
 */
export async function listForDriver(driverId: string): Promise<DriverCapability[]> {
  const res = await query<CapabilityRow>(
    // One entry per (function, area) — the oldest row stands for it.
    `SELECT * FROM (
       SELECT DISTINCT ON (c.function, c.zone_id) c.id, c.function, c.zone_id, z.name AS zone_name, c.created_at
         FROM public.driver_zone_capability c
         LEFT JOIN public.delivery_zone z ON z.id = c.zone_id
        WHERE c.driver_id = $1
          AND (c.zone_id IS NULL OR z.status = 'active')
        ORDER BY c.function, c.zone_id, c.created_at, c.id
     ) one
      ORDER BY one.function, (one.zone_id IS NULL) DESC, one.zone_name NULLS FIRST`,
    [driverId],
  );
  return res.rows.map(toCapability);
}

/** Grant. ⚠ Idempotent: returns the existing row's id when the clearance is already held (FR-005). */
export async function grant(
  driverId: string,
  fn: string,
  zoneId: string | null,
  grantedBySub: string,
): Promise<string> {
  // ⚠ `zone_id IS NOT DISTINCT FROM $3` rather than `= $3`, because `NULL = NULL` is NULL in SQL and
  // the every-zone row would never be found. Held under EITHER old method counts as held (082).
  const held = () =>
    query<{ id: string }>(
      `SELECT id FROM public.driver_zone_capability
        WHERE driver_id = $1 AND function = $2 AND zone_id IS NOT DISTINCT FROM $3
        ORDER BY created_at, id LIMIT 1`,
      [driverId, fn, zoneId],
    );
  const existing = await held();
  if (existing.rows[0]) return existing.rows[0].id;

  const res = await query<{ id: string }>(
    `INSERT INTO public.driver_zone_capability (driver_id, function, method, zone_id, granted_by_sub)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [driverId, fn, UNREAD_METHOD, zoneId, grantedBySub],
  );
  if (res.rows[0]) return res.rows[0].id;
  // Two operators at the same moment: the other's row is there now.
  return (await held()).rows[0]!.id;
}

/** Revoke by id. ⚠ Returns false when it was not there — a no-op, not a failure (FR-006). */
export async function revoke(driverId: string, capabilityId: string): Promise<boolean> {
  const res = await query<{ id: string }>(
    // ⚠ EVERY ROW FOR THAT (function, area), not only the one named: a driver cleared under both old
    // methods holds two rows for one clearance, and removing one would leave them cleared (082).
    `DELETE FROM public.driver_zone_capability c
      USING public.driver_zone_capability named
      WHERE named.id = $1 AND named.driver_id = $2
        AND c.driver_id = named.driver_id AND c.function = named.function
        AND c.zone_id IS NOT DISTINCT FROM named.zone_id
      RETURNING c.id`,
    [capabilityId, driverId],
  );
  return (res.rowCount ?? 0) > 0;
}

/** Breadth of clearance for the register (FR-014). ⚠ A summary, never the full set. */
export async function summariseForDrivers(
  driverIds: string[],
): Promise<Map<string, DriverCapabilitySummary>> {
  const out = new Map<string, DriverCapabilitySummary>();
  for (const id of driverIds) {
    out.set(id, { total: 0, coversEveryZone: false, functions: [] });
  }
  if (driverIds.length === 0) return out;

  const res = await query<{
    driver_id: string;
    total: string;
    covers_every_zone: boolean;
    functions: string[];
  }>(
    `SELECT c.driver_id,
            count(DISTINCT (c.function, c.zone_id))::text AS total,
            bool_or(c.zone_id IS NULL)                 AS covers_every_zone,
            array_agg(DISTINCT c.function)             AS functions
       FROM public.driver_zone_capability c
       LEFT JOIN public.delivery_zone z ON z.id = c.zone_id
      WHERE c.driver_id = ANY($1::uuid[])
        AND (c.zone_id IS NULL OR z.status = 'active')
      GROUP BY c.driver_id`,
    [driverIds],
  );
  for (const r of res.rows) {
    out.set(r.driver_id, {
      total: Number(r.total),
      coversEveryZone: r.covers_every_zone,
      functions: (r.functions ?? []) as DriverCapabilitySummary["functions"],
    });
  }
  return out;
}

/**
 * One line describing what a driver covers, for their OWN account screen in the driver app.
 *
 * ⚠ THE RULE ITSELF LIVES IN `@effy/edge-shared` (062). The driver service answers the same question
 * for the driver themselves, and two copies of a label expression drift silently — a SELECT that
 * returns the wrong string still returns successfully.
 */
export async function coverageLabelForDriver(driverId: string): Promise<string | null> {
  const res = await query<DriverCoverageAggregate>(coverageAggregateSql("$1"), [driverId]);
  return coverageLabel(res.rows[0]);
}

/** Look up a zone for validation. ⚠ Carries `status` so a DISABLED zone can be refused at grant time
 *  with a message naming it, rather than accepted and silently never matched. */
export async function findZone(zoneId: string): Promise<{ id: string; name: string; status: string } | null> {
  const res = await query<{ id: string; name: string; status: string }>(
    `SELECT id, name, status FROM public.delivery_zone WHERE id = $1`,
    [zoneId],
  );
  return res.rows[0] ?? null;
}

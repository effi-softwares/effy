// Repository for driver clearances (062): raw parameterized SQL, no ORM (Principle VI).
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

import { query } from "@effy/edge-shared";
import type { DriverCapability, DriverCapabilitySummary } from "@effy/shared-types";

interface CapabilityRow {
  id: string;
  function: string;
  method: string;
  zone_id: string | null;
  zone_name: string | null;
  created_at: Date;
}

function toCapability(r: CapabilityRow): DriverCapability {
  return {
    id: r.id,
    function: r.function as DriverCapability["function"],
    method: r.method as DriverCapability["method"],
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
    `SELECT c.id, c.function, c.method, c.zone_id, z.name AS zone_name, c.created_at
       FROM public.driver_zone_capability c
       LEFT JOIN public.delivery_zone z ON z.id = c.zone_id
      WHERE c.driver_id = $1
        AND (c.zone_id IS NULL OR z.status = 'active')
      ORDER BY c.function, c.method, (c.zone_id IS NULL) DESC, z.name NULLS FIRST`,
    [driverId],
  );
  return res.rows.map(toCapability);
}

/** Grant. ⚠ Idempotent: returns the existing row's id when the clearance is already held (FR-005). */
export async function grant(
  driverId: string,
  fn: string,
  method: string,
  zoneId: string | null,
  grantedBySub: string,
): Promise<string> {
  const res = await query<{ id: string }>(
    `INSERT INTO public.driver_zone_capability (driver_id, function, method, zone_id, granted_by_sub)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [driverId, fn, method, zoneId, grantedBySub],
  );
  if (res.rows[0]) return res.rows[0].id;

  // Already held. ⚠ `zone_id IS NOT DISTINCT FROM $4` rather than `= $4`, because `NULL = NULL` is
  // NULL in SQL and the every-zone row would never be found.
  const existing = await query<{ id: string }>(
    `SELECT id FROM public.driver_zone_capability
      WHERE driver_id = $1 AND function = $2 AND method = $3 AND zone_id IS NOT DISTINCT FROM $4`,
    [driverId, fn, method, zoneId],
  );
  return existing.rows[0]!.id;
}

/** Revoke by id. ⚠ Returns false when it was not there — a no-op, not a failure (FR-006). */
export async function revoke(driverId: string, capabilityId: string): Promise<boolean> {
  const res = await query<{ id: string }>(
    `DELETE FROM public.driver_zone_capability
      WHERE id = $1 AND driver_id = $2
      RETURNING id`,
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
            count(*)::text                             AS total,
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
 * ⚠ THIS REPLACES THE SOURCE OF `DriverMeDTO.zone` WITHOUT CHANGING ITS SHAPE. The field used to be a
 * single assigned zone that no assignment code ever read; it now reflects real clearances, so the
 * driver app tells the truth with no Kotlin changed — the same move 061 made for `DriverVehicle`.
 *
 * Null when the driver is cleared for nothing, which the app already renders as unavailable.
 */
export async function coverageLabelForDriver(driverId: string): Promise<string | null> {
  const res = await query<{ every: boolean; names: string[]; n: string }>(
    `SELECT bool_or(c.zone_id IS NULL)                                  AS every,
            array_remove(array_agg(DISTINCT z.name), NULL)              AS names,
            count(*)::text                                              AS n
       FROM public.driver_zone_capability c
       LEFT JOIN public.delivery_zone z ON z.id = c.zone_id
      WHERE c.driver_id = $1
        AND (c.zone_id IS NULL OR z.status = 'active')`,
    [driverId],
  );
  const r = res.rows[0];
  if (!r || Number(r.n) === 0) return null;
  if (r.every) return "Every zone";
  const names = r.names ?? [];
  if (names.length === 0) return null;
  if (names.length === 1) return names[0]!;
  return `${names.length} zones`;
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

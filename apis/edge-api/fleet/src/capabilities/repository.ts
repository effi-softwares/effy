// A clearance is (function, area), one row each (`driver_zone_capability_uq`). Grant and revoke are
// idempotent: two operators doing the same thing both succeed (`ON CONFLICT DO NOTHING`, which also
// deduplicates the null every-zone row). No concurrency token: rows are added and removed, never overwritten.

import {
  query,
} from "@effy/edge-shared";
import type { DriverCapability, DriverCapabilitySummary } from "@effy/shared-types";

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
    // Null for every zone; the label is presentation.
    zoneName: r.zone_name,
    grantedAt: r.created_at.toISOString(),
  };
}

/** Disabled zones are filtered here, not deleted: re-enabling a zone restores its cover. */
export async function listForDriver(driverId: string): Promise<DriverCapability[]> {
  const res = await query<CapabilityRow>(
    `SELECT c.id, c.function, c.zone_id, z.name AS zone_name, c.created_at
       FROM public.driver_zone_capability c
       LEFT JOIN public.delivery_zone z ON z.id = c.zone_id
      WHERE c.driver_id = $1
        AND (c.zone_id IS NULL OR z.status = 'active')
      ORDER BY c.function, (c.zone_id IS NULL) DESC, z.name NULLS FIRST`,
    [driverId],
  );
  return res.rows.map(toCapability);
}

/** Returns the existing row's id when already held. */
export async function grant(
  driverId: string,
  fn: string,
  zoneId: string | null,
  grantedBySub: string,
): Promise<string> {
  const res = await query<{ id: string }>(
    `INSERT INTO public.driver_zone_capability (driver_id, function, zone_id, granted_by_sub)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [driverId, fn, zoneId, grantedBySub],
  );
  if (res.rows[0]) return res.rows[0].id;
  // Already held, or another operator's row landed at once. `IS NOT DISTINCT FROM`, so the null row is found.
  const held = await query<{ id: string }>(
    `SELECT id FROM public.driver_zone_capability
      WHERE driver_id = $1 AND function = $2 AND zone_id IS NOT DISTINCT FROM $3`,
    [driverId, fn, zoneId],
  );
  return held.rows[0]!.id;
}

/** false when it was not there: a no-op. */
export async function revoke(driverId: string, capabilityId: string): Promise<boolean> {
  const res = await query<{ id: string }>(
    `DELETE FROM public.driver_zone_capability WHERE id = $1 AND driver_id = $2 RETURNING id`,
    [capabilityId, driverId],
  );
  return (res.rowCount ?? 0) > 0;
}

/** A summary for the register, never the full set. */
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

/** Carries `status`, so a disabled zone is refused at grant time by name. */
export async function findZone(zoneId: string): Promise<{ id: string; name: string; status: string } | null> {
  const res = await query<{ id: string; name: string; status: string }>(
    `SELECT id, name, status FROM public.delivery_zone WHERE id = $1`,
    [zoneId],
  );
  return res.rows[0] ?? null;
}

// The gaps, found before an order is affected.
import { query } from "@effy/edge-shared";
import type {
  BlockedDriver,
  DriverBlockedReason,
  ExpiringCredential,
  ZoneCoverage,
} from "@effy/shared-types";

import { expiryWarningDays } from "../shared/config";
import { BLOCKED_REASONS } from "../drivers/sql";

/** With the enumerated reasons. */
export async function blockedDrivers(): Promise<BlockedDriver[]> {
  const res = await query<{ id: string; name: string; blocked: string[] }>(
    `SELECT d.id, d.name, ${BLOCKED_REASONS} AS blocked
       FROM public.driver d
      WHERE d.status <> 'offboarded'
        AND cardinality(${BLOCKED_REASONS}) > 0
      ORDER BY d.name ASC`,
  );
  return res.rows.map((r) => ({
    driverId: r.id,
    driverName: r.name,
    reasons: (r.blocked ?? []) as DriverBlockedReason[],
  }));
}

/** Every zone with its count, not only empty ones: one driver left is the gap about to happen. */
export async function zoneCoverage(): Promise<ZoneCoverage[]> {
  // Counted from clearances, distinct per person (collection and delivery in one zone is one driver).
  const CLEARED = `
    SELECT count(DISTINCT d.id)
      FROM public.driver_zone_capability c
      JOIN public.driver d ON d.id = c.driver_id
     WHERE (c.zone_id = z.id OR c.zone_id IS NULL) AND d.status = 'active'`;
  const res = await query<{ id: string; name: string; n: string }>(
    `SELECT z.id, z.name, (${CLEARED})::text AS n
       FROM public.delivery_zone z
      WHERE z.status = 'active'
      ORDER BY (${CLEARED}) ASC, z.name ASC`,
  );
  return res.rows.map((r) => ({ zoneId: r.id, zoneName: r.name, activeDrivers: Number(r.n) }));
}

/** Passed, or inside the warning window. */
export async function expiringCredentials(): Promise<ExpiringCredential[]> {
  const res = await query<{
    id: string;
    name: string;
    kind: ExpiringCredential["kind"];
    expires_on: Date;
    expired: boolean;
  }>(
    `WITH horizon AS (
       SELECT (now() AT TIME ZONE 'Australia/Melbourne')::date AS today,
              (now() AT TIME ZONE 'Australia/Melbourne')::date + make_interval(days => $1::int) AS limit_date
     )
     SELECT d.id, d.name, 'licence'::text AS kind, d.licence_expires_on AS expires_on,
            (d.licence_expires_on < h.today) AS expired
       FROM public.driver d CROSS JOIN horizon h
      WHERE d.status <> 'offboarded'
        AND d.licence_expires_on IS NOT NULL
        AND d.licence_expires_on <= h.limit_date
      UNION ALL
     -- ⚠ a registration expiry is a fact about a VEHICLE, read through the driver's OPEN holding, so
     -- the warning names the person who will actually be stopped at the roadside.
     SELECT d.id, d.name, 'vehicle_registration'::text, v.registration_expires_on,
            (v.registration_expires_on < h.today)
       FROM public.driver d
       JOIN public.vehicle_holding vh ON vh.driver_id = d.id AND vh.ended_at IS NULL
       JOIN public.vehicle v          ON v.id = vh.vehicle_id
       CROSS JOIN horizon h
      WHERE d.status <> 'offboarded'
        AND v.registration_expires_on IS NOT NULL
        AND v.registration_expires_on <= h.limit_date
      ORDER BY expires_on ASC`,
    [expiryWarningDays()],
  );
  return res.rows.map((r) => ({
    driverId: r.id,
    driverName: r.name,
    kind: r.kind,
    expiresOn: `${r.expires_on.getFullYear()}-${String(r.expires_on.getMonth() + 1).padStart(2, "0")}-${String(r.expires_on.getDate()).padStart(2, "0")}`,
    expired: r.expired,
  }));
}

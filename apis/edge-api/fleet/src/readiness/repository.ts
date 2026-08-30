// Fleet readiness (056 US6): find the gaps before an order is affected, not afterwards.
//
// ⚠ SC-009 IS THE POINT OF THIS FILE. A driver with no delivery zone is INERT FOR ASSIGNMENT today —
// `assignCollectionWork` will never pick them — and nothing anywhere says so. The symptom is an order
// that does not move, hours later, in a place nobody is looking. Here it is a row on a list.
import { query } from "@effy/edge-shared";
import type {
  BlockedDriver,
  DriverBlockedReason,
  ExpiringCredential,
  ZoneCoverage,
} from "@effy/shared-types";

import { expiryWarningDays } from "../shared/config";
import { BLOCKED_REASONS } from "../drivers/sql";

/** Drivers who cannot receive work, with the enumerated reason(s) why (FR-044). */
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

/**
 * Zones with no active driver assigned (FR-045).
 *
 * ⚠ Every zone is listed with its count, not only the empty ones — a zone that dropped from three
 * drivers to one is the gap that is about to happen, and it is invisible if the query only returns
 * zeroes. The screen orders by count so the empty ones sit at the top.
 */
export async function zoneCoverage(): Promise<ZoneCoverage[]> {
  const res = await query<{ id: string; name: string; n: string }>(
    `SELECT z.id, z.name,
            (SELECT count(*) FROM public.driver d
              WHERE d.delivery_zone_id = z.id AND d.status = 'active')::text AS n
       FROM public.delivery_zone z
      ORDER BY (SELECT count(*) FROM public.driver d
                 WHERE d.delivery_zone_id = z.id AND d.status = 'active') ASC, z.name ASC`,
  );
  return res.rows.map((r) => ({ zoneId: r.id, zoneName: r.name, activeDrivers: Number(r.n) }));
}

/** Licence and registration expiries that have passed or fall inside the warning window (FR-046). */
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
     SELECT d.id, d.name, 'vehicle_registration'::text, d.vehicle_registration_expires_on,
            (d.vehicle_registration_expires_on < h.today)
       FROM public.driver d CROSS JOIN horizon h
      WHERE d.status <> 'offboarded'
        AND d.vehicle_registration_expires_on IS NOT NULL
        AND d.vehicle_registration_expires_on <= h.limit_date
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

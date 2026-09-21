// Who is holding what, right now (064, US4 — FR-014 / FR-018).
//
// ⚠ EVERYTHING HERE IS DERIVED. There is no custody table and there will not be one: the round rows
// already state the fact completely (research R7), and a second store for one fact is how 063 came to
// have an FK that was "wrong in principle".

import { query } from "@effy/edge-shared";
import type { CustodyDTO, CustodyPackageDTO } from "@effy/shared-types";

import { CUSTODY_BY_DRIVER } from "./sql";

interface CustodyRow {
  driver_id: string;
  driver_name: string;
  package_id: string;
  order_number: string;
  shop_name: string;
  round_kind: "collection" | "delivery";
  held_since: Date | string | null;
}

/**
 * Packages in drivers' hands, grouped by driver.
 *
 * @param driverId narrow to one driver — what the duty-end check asks (FR-018). Omit for everyone.
 */
export async function readCustody(driverId: string | null = null): Promise<CustodyDTO[]> {
  const res = await query<CustodyRow>(CUSTODY_BY_DRIVER, [driverId]);

  const byDriver = new Map<string, CustodyDTO>();
  for (const r of res.rows) {
    let entry = byDriver.get(r.driver_id);
    if (!entry) {
      entry = { driverId: r.driver_id, driverName: r.driver_name, packages: [], packageCount: 0 };
      byDriver.set(r.driver_id, entry);
    }
    const pkg: CustodyPackageDTO = {
      packageId: r.package_id,
      orderNumber: r.order_number,
      shopName: r.shop_name,
      // ⚠ `settled_at` is when the driver took it. Null only for rows written before it was recorded;
      // the epoch would be a lie, so the field carries the empty string and the console says "unknown"
      // rather than claiming 1970.
      heldSince: r.held_since ? new Date(r.held_since).toISOString() : "",
      roundKind: r.round_kind,
    };
    entry.packages.push(pkg);
    entry.packageCount = entry.packages.length;
  }

  return [...byDriver.values()];
}

/**
 * What this driver is holding — the answer FR-018 needs before a shift can end.
 *
 * ⚠ IT RETURNS THE ITEMS, NOT A BOOLEAN. 056's lesson exactly: standing a driver down while they hold
 * goods strands those goods permanently and invisibly, and the operator was shown "the itemised held
 * work before confirming" precisely because a count cannot be acted on. A driver being told "you have
 * 3 packages" can go and find them; "you cannot go off duty" cannot be answered.
 */
export async function custodyForDriver(driverId: string): Promise<CustodyDTO | null> {
  const all = await readCustody(driverId);
  return all[0] ?? null;
}

/**
 * The longest unbroken custody right now, in hours — the `DriverPackagesHeldHours` alarm's input.
 *
 * ⚠ IT IS EMITTED FROM THE SCHEDULED PLANNER, NOT FROM THE CUSTODY READ. An on-demand read only
 * happens when a dispatcher opens a screen, so an alarm fed by it would be silent exactly when
 * nobody is looking — which is the situation it exists to catch. The planner already wakes every few
 * minutes and already emits EMF, so the measurement rides along with something that runs whether or
 * not anyone is watching.
 *
 * Returns 0 when no package is held, which is the healthy state and not an absence.
 */
export async function maxCustodyHours(): Promise<number> {
  const res = await query<{ hours: string | null }>(
    `SELECT COALESCE(MAX(EXTRACT(EPOCH FROM (now() - rp.settled_at)) / 3600), 0) AS hours
       FROM public.round_package rp
       JOIN public.round_stop   rs ON rs.id = rp.stop_id
       JOIN public.driver_round dr ON dr.id = rs.round_id
      WHERE rp.state = 'picked_up'
        AND rp.settled_at IS NOT NULL
        AND NOT (dr.kind = 'collection'
                 AND EXISTS (SELECT 1 FROM public.hub_checkin hc WHERE hc.round_id = dr.id))
        AND NOT EXISTS (
              SELECT 1 FROM public.package_arrival pa
               WHERE pa.shop_fulfillment_id = rp.shop_fulfillment_id
            )`,
  );
  return Number(res.rows[0]?.hours ?? 0);
}

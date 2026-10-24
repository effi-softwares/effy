// Reads for the collection facts a shop is told (099): this shop's pickups on collection rounds. The
// packages' runs come from `@effy/edge-shared/delivery` (`shopPackageRuns`). Raw SQL.
import { query, type Queryable } from "@effy/edge-shared";

import type { StopFacts } from "./rule";

/** This shop's pickups on collection rounds from the last twelve hours on. */
const STOPS = `
SELECT dr.deadline_at AS run_at,
       rs.status AS stop_status,
       public.round_opens_at('collection', dr.deadline_at, NULL) AS opens_at,
       EXISTS (SELECT 1 FROM public.driver_duty_session ds
                WHERE ds.driver_id = dr.driver_id AND ds.ended_at IS NULL) AS driver_on_duty
  FROM public.round_stop rs
  JOIN public.driver_round dr ON dr.id = rs.round_id
 WHERE rs.kind = 'shop_pickup'
   AND rs.shop_id = $1::uuid
   AND dr.kind = 'collection'
   AND dr.status <> 'cancelled'
   AND dr.deadline_at >= $2::timestamptz - interval '12 hours'
 ORDER BY dr.deadline_at
`;

export async function loadStops(shopId: string, now: Date, db: Queryable = { query }): Promise<StopFacts[]> {
  const res = await db.query<{ run_at: Date; stop_status: string; opens_at: Date | null; driver_on_duty: boolean }>(STOPS, [shopId, now]);
  return res.rows.map((r) => ({
    runAt: r.run_at,
    stopStatus: r.stop_status,
    opensAt: r.opens_at,
    driverOnDuty: r.driver_on_duty,
  }));
}

export async function shopTimezone(shopId: string, db: Queryable = { query }): Promise<string> {
  const res = await db.query<{ timezone: string }>(`SELECT timezone FROM public.shop WHERE id = $1::uuid`, [shopId]);
  return res.rows[0]?.timezone ?? "Australia/Melbourne";
}

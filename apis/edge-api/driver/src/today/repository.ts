// Repository for the phase-aware "Today" home (049). Raw SQL, no ORM. Scoped to the driver's own id.
//
// Returns the driver's current active run (collection takes precedence over same-day delivery when
// both somehow exist, since a shift runs collection → hub → delivery) and a remaining-stop count.
// The per-stop/drop detail reads live in the collection/delivery slices (US1/US2); this only powers
// the home phase indicator + the counts-only summary (FR-021).

import { query } from "@effy/edge-shared";

export interface ActiveRunRow {
  run_id: string;
  type: "collection" | "same_day_delivery";
  status: string;
}

const SELECT_ACTIVE_RUN = `
  SELECT id AS run_id, type, status
    FROM public.driver_run
   WHERE driver_id = $1
     AND status IN ('assigned', 'active')
   ORDER BY (type = 'collection') DESC, assigned_at ASC
   LIMIT 1
`;

export async function findActiveRun(driverId: string): Promise<ActiveRunRow | null> {
  const result = await query<ActiveRunRow>(SELECT_ACTIVE_RUN, [driverId]);
  return result.rows[0] ?? null;
}

/** Count not-yet-terminal stops in a collection run. */
export async function countRemainingCollectionStops(runId: string): Promise<number> {
  const result = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM public.collection_task
      WHERE run_id = $1 AND status IN ('assigned', 'en_route')`,
    [runId],
  );
  return Number(result.rows[0]?.n ?? "0");
}

/** Count not-yet-terminal drops in a same-day delivery run. */
export async function countRemainingDrops(runId: string): Promise<number> {
  const result = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM public.delivery_task
      WHERE run_id = $1 AND status IN ('staged', 'out_for_delivery', 'en_route', 'arrived')`,
    [runId],
  );
  return Number(result.rows[0]?.n ?? "0");
}

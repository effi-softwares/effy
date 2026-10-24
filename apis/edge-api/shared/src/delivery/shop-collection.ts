// Which Effy collection run will take each of a shop's packages (099) — the fleet planner's own rule
// (`dueRun`, `nextRunInstant`), read here so the shop service is told only RUN TIMES. The window a
// package travels for is read in this file and never leaves it: a shop is not told the customer's
// delivery day or window (`shop/src/fulfillments/no-delivery-window.guard.test.ts`).
import { dueRun, nextRunInstant, type CollectionRun, type RunCalendar } from "../lib/collection-deadline";
import { pooled, type Queryable } from "../lib/db";

import { COURIER_COLLECTION_SQL } from "./consignment";
import { heldSql } from "./held";
import { nonDeliveryDates } from "./slots";

/** The planner's schedule and settings — the same rows `fleet/src/planner` reads. */
const SCHEDULE = `
SELECT EXTRACT(HOUR FROM r.run_time)::int AS hour, EXTRACT(MINUTE FROM r.run_time)::int AS minute
  FROM public.delivery_collection_run r
 WHERE r.status = 'active'
 ORDER BY r.run_time
`;

const SETTINGS = `
SELECT sameday_hub_turnaround_min, standard_no_delivery_weekdays
  FROM public.delivery_settings
 WHERE id = 1
`;

/**
 * A shop's packages an Effy driver will collect: still at the shop, not held for a dispatcher, and not
 * a courier's own pickup from the supplier. `$2` narrows to some packages (NULL = all).
 */
const PACKAGES = `
SELECT sf.id::text AS id,
       sf.status,
       o.delivery_type AS delivered_by,
       opd.window_start,
       (SELECT dr.deadline_at
          FROM public.round_package rp
          JOIN public.round_stop rs ON rs.id = rp.stop_id
          JOIN public.driver_round dr ON dr.id = rs.round_id
         WHERE rp.shop_fulfillment_id = sf.id
           AND rp.state = 'assigned'
           AND dr.kind = 'collection'
           AND dr.status <> 'cancelled'
         LIMIT 1) AS assigned_run_at
  FROM public.shop_fulfillment sf
  JOIN public."order" o ON o.id = sf.order_id
  LEFT JOIN public.order_package_delivery opd ON opd.order_id = sf.order_id AND opd.shop_id = sf.shop_id
 WHERE sf.shop_id = $1::uuid
   AND sf.status IN ('pending', 'received', 'picking', 'ready_for_pickup')
   AND o.delivery_type IS NOT NULL
   AND ${COURIER_COLLECTION_SQL("o")} <> 'supplier'
   AND NOT ${heldSql("sf.id")}
   AND ($2::uuid[] IS NULL OR sf.id = ANY($2::uuid[]))
`;

export interface CollectionSchedule {
  runs: readonly CollectionRun[];
  hubTurnaroundMin: number;
  calendar: RunCalendar;
}

/** The facts the run rule needs about one package. The window is a server-side input only. */
export interface PackageRunFacts {
  deliveredBy: "effy" | "courier";
  windowStart: Date | null;
  /** The collection round it is already assigned to, if any. */
  assignedRunAt: Date | null;
}

/**
 * The run expected to collect a package: the round it is assigned to, else the planner's rule — the
 * next run, or the later run a windowed Effy parcel waits for. Null when no runs are set up.
 */
export function runForPackage(p: PackageRunFacts, schedule: CollectionSchedule, now: Date): Date | null {
  if (p.assignedRunAt) return p.assignedRunAt;
  const next = nextRunInstant(schedule.runs, now);
  if (next === null) return null;
  const due = dueRun(p, schedule.runs, { hubTurnaroundMin: schedule.hubTurnaroundMin }, schedule.calendar);
  // A due run already passed travels on the next one, as the planner does.
  return due !== null && due.getTime() > next.getTime() ? due : next;
}

/** One of the shop's packages and the run expected to collect it — no window, no day promise. */
export interface ShopPackageRun {
  id: string;
  status: string;
  runAt: Date | null;
}

export interface ShopPackageRuns {
  /** Whether any collection run is set up at all. */
  hasRuns: boolean;
  /** The next scheduled run after `now`. */
  nextRun: Date | null;
  packages: ShopPackageRun[];
}

export async function loadCollectionSchedule(now: Date, db: Queryable = pooled): Promise<CollectionSchedule> {
  const runs = await db.query<{ hour: number; minute: number }>(SCHEDULE);
  const settings = await db.query<{ sameday_hub_turnaround_min: number | null; standard_no_delivery_weekdays: number[] | null }>(SETTINGS);
  const s = settings.rows[0];
  const from = new Date(now.getTime() - 8 * 86_400_000).toISOString().slice(0, 10);
  return {
    runs: runs.rows.map((r) => ({ hour: r.hour, minute: r.minute })),
    hubTurnaroundMin: s?.sameday_hub_turnaround_min ?? 60,
    calendar: { noWeekdays: s?.standard_no_delivery_weekdays ?? [], noDates: await nonDeliveryDates(db, from) },
  };
}

/** The run for each of a shop's packages an Effy driver will collect (`ids` narrows; null = all). */
export async function shopPackageRuns(
  shopId: string,
  ids: readonly string[] | null,
  now: Date,
  db: Queryable = pooled,
): Promise<ShopPackageRuns> {
  const schedule = await loadCollectionSchedule(now, db);
  const res = await db.query<{
    id: string;
    status: string;
    delivered_by: "effy" | "courier";
    window_start: Date | null;
    assigned_run_at: Date | null;
  }>(PACKAGES, [shopId, ids === null ? null : [...ids]]);
  return {
    hasRuns: schedule.runs.length > 0,
    nextRun: nextRunInstant(schedule.runs, now),
    packages: res.rows.map((r) => ({
      id: r.id,
      status: r.status,
      runAt: runForPackage(
        { deliveredBy: r.delivered_by, windowStart: r.window_start, assignedRunAt: r.assigned_run_at },
        schedule,
        now,
      ),
    })),
  };
}

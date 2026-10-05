import { collectionDeadline, localDateParts, type CollectionRun } from "../lib/collection-deadline";
import type { Queryable } from "../lib/db";

export type { CollectionRun };

/** The Melbourne calendar date at an instant, as yyyy-mm-dd. */
export function melbourneDate(at: Date): string {
  const { year, month, day } = localDateParts(at);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * The LATEST still-makeable same-day cutoff instant for `now`, given the active collection runs
 * and the shop prep buffer. A run is makeable when now ≤ run_time − buffer. With one run this is a
 * single daily cutoff; with several, availability extends run-by-run through the day. `null` when
 * no run today can still be made (same-day is simply not offered).
 *
 * ⚠ Judged in Melbourne, never in UTC or the shopper's device clock (047 FR-041).
 */
export function sameDayCutoff(now: Date, runs: readonly CollectionRun[], bufferMin: number): Date | null {
  let best: Date | null = null;
  for (const run of runs) {
    const cutoff = new Date(collectionDeadline(run, now).getTime() - bufferMin * 60_000);
    if (now.getTime() > cutoff.getTime()) continue; // this run's cutoff has passed
    if (!best || cutoff.getTime() > best.getTime()) best = cutoff;
  }
  return best;
}

/**
 * The active collection runs and the prep buffer. A zone and a plan can exist before the schedule
 * does, so a missing settings row is buffer 0 rather than an error; the runs decide availability.
 */
export async function sameDaySchedule(q: Queryable): Promise<{ runs: CollectionRun[]; bufferMin: number }> {
  const settings = await q.query<{ sameday_prep_buffer_min: number }>(
    `SELECT sameday_prep_buffer_min FROM public.delivery_settings WHERE id = 1`,
  );
  const runs = await q.query<{ hour: number; minute: number }>(`
		SELECT EXTRACT(HOUR FROM run_time)::int AS hour, EXTRACT(MINUTE FROM run_time)::int AS minute
		-- availability-exempt: public.delivery_collection_run — a schedule's lifecycle.
		FROM public.delivery_collection_run WHERE status = 'active' ORDER BY run_time`);
  return {
    runs: runs.rows.map((r) => ({ hour: r.hour, minute: r.minute })),
    bufferMin: settings.rows[0]?.sameday_prep_buffer_min ?? 0,
  };
}

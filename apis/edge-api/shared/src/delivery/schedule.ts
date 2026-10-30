import { localDateParts, type CollectionRun } from "../lib/collection-deadline";
import type { Queryable } from "../lib/db";

export type { CollectionRun };

/** yyyy-mm-dd. */
export function melbourneDate(at: Date): string {
  const { year, month, day } = localDateParts(at);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** A missing settings row is buffer 0, not an error. */
export async function collectionSchedule(q: Queryable): Promise<{ runs: CollectionRun[]; bufferMin: number }> {
  const settings = await q.query<{ sameday_prep_buffer_min: number }>(
    `SELECT sameday_prep_buffer_min FROM public.delivery_settings WHERE id = 1`,
  );
  const runs = await q.query<{ hour: number; minute: number }>(`
		SELECT EXTRACT(HOUR FROM run_time)::int AS hour, EXTRACT(MINUTE FROM run_time)::int AS minute
		-- availability-exempt: public.delivery_collection_run - a schedule's lifecycle.
		FROM public.delivery_collection_run WHERE status = 'active' ORDER BY run_time`);
  return {
    runs: runs.rows.map((r) => ({ hour: r.hour, minute: r.minute })),
    bufferMin: settings.rows[0]?.sameday_prep_buffer_min ?? 0,
  };
}

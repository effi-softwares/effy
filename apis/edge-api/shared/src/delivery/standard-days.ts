import { localDateParts } from "../lib/collection-deadline";
import type { Queryable } from "../lib/db";
import { sameDayCutoff, type CollectionRun } from "./sameday";

/**
 * Bounds the search for deliverable days. The settings forbid excluding all seven weekdays (a
 * CHECK), so a deliverable day always exists within a week; this guards the loop against a long
 * run of individually excluded dates rather than against never terminating.
 */
const MAX_DAY_SCAN = 60;
const DAY_MS = 24 * 3600_000;

/**
 * The days a standard delivery can arrive, earliest first (069 research R6).
 *
 *   - The HUB DAY is today while a collection run can still be made, otherwise tomorrow.
 *   - The EARLIEST delivery day is the hub day plus the carrier's lead time.
 *   - From there, `lookahead` DELIVERABLE days are offered. A non-delivery day is skipped and does
 *     not count toward the look-ahead (FR-016): "seven days" means seven days the customer can
 *     choose.
 *
 * Pure: no clock, no database. Days are yyyy-mm-dd Melbourne dates; `noWeekdays` are ISO
 * (1 = Monday … 7 = Sunday).
 */
export function availableDays(
  now: Date,
  runs: readonly CollectionRun[],
  bufferMin: number,
  leadDays: number,
  lookahead: number,
  noWeekdays: readonly number[] = [],
  noDates: ReadonlySet<string> = new Set(),
): string[] {
  const { year, month, day } = localDateParts(now);
  // ⚠ Calendar arithmetic at NOON UTC, never at Melbourne midnight: on the day the clocks change a
  // local midnight plus 24 hours is not the next midnight, and the list would repeat or skip a day.
  let cursor = Date.UTC(year, month - 1, day, 12);

  if (sameDayCutoff(now, runs, bufferMin) === null) cursor += DAY_MS;
  cursor += leadDays * DAY_MS;

  const blocked = new Set(noWeekdays);
  const out: string[] = [];
  for (let scanned = 0; scanned < MAX_DAY_SCAN && out.length < lookahead; scanned += 1) {
    const d = new Date(cursor);
    const iso = d.toISOString().slice(0, 10);
    if (!blocked.has(isoWeekday(d)) && !noDates.has(iso)) out.push(iso);
    cursor += DAY_MS;
  }
  return out;
}

/** Sunday = 0 → ISO's Monday = 1 … Sunday = 7. */
function isoWeekday(d: Date): number {
  return d.getUTCDay() === 0 ? 7 : d.getUTCDay();
}

/** The individually excluded dates from `from` (yyyy-mm-dd) onward. */
export async function nonDeliveryDates(q: Queryable, from: string): Promise<Set<string>> {
  const rows = await q.query<{ day: string }>(
    `SELECT day::text AS day FROM public.delivery_non_delivery_date WHERE day >= $1::date`,
    [from],
  );
  return new Set(rows.rows.map((r) => r.day));
}

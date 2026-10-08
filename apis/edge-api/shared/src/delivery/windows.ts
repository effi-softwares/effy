import { localDateParts } from "../lib/collection-deadline";
import type { CollectionRun } from "./sameday";
import { judgeWindow, type OpenSlot, type Slot } from "./slots";

/**
 * The Effy delivery calendar (078): today plus the next delivery days, and the windows open on each.
 *
 * ⚠ THE WINDOW RULE IS NOT HERE. `judgeWindow` in `slots.ts` decides whether one window is open on
 * one day; this file only lays that rule out across days. Pure: no clock, no database.
 */

/** Bounds the day scan — see `standard-days.ts`: a deliverable day always exists within a week. */
const MAX_DAY_SCAN = 60;
const DAY_MS = 24 * 3600_000;

/** One day of the calendar. */
export interface EffyCalendarDay {
  /** yyyy-mm-dd, Melbourne. */
  date: string;
  isToday: boolean;
  /** Only ever true for today: a later non-delivery day is skipped, never listed. */
  nonDelivery: boolean;
}

/**
 * Today, then the next `lookahead` DELIVERY days (FR-002/FR-003).
 *
 *   - Today is always first — even when Effy does not deliver today, so the customer can be told so.
 *   - A non-delivery weekday or date after today is skipped and does NOT count: "three days" means
 *     three days a customer can choose.
 *
 * `noWeekdays` are ISO (1 = Monday … 7 = Sunday); `noDates` are yyyy-mm-dd.
 */
export function effyDays(
  now: Date,
  lookahead: number,
  noWeekdays: readonly number[] = [],
  noDates: ReadonlySet<string> = new Set(),
): EffyCalendarDay[] {
  const { year, month, day } = localDateParts(now);
  // ⚠ Calendar arithmetic at NOON UTC, never at Melbourne midnight: on the day the clocks change a
  // local midnight plus 24 hours is not the next midnight, and the list would repeat or skip a day.
  let cursor = Date.UTC(year, month - 1, day, 12);
  const blocked = new Set(noWeekdays);
  const excluded = (at: number): boolean => {
    const d = new Date(at);
    return blocked.has(isoWeekday(d)) || noDates.has(d.toISOString().slice(0, 10));
  };

  const out: EffyCalendarDay[] = [{ date: new Date(cursor).toISOString().slice(0, 10), isToday: true, nonDelivery: excluded(cursor) }];
  for (let scanned = 0; scanned < MAX_DAY_SCAN && out.length < lookahead + 1; scanned += 1) {
    cursor += DAY_MS;
    if (!excluded(cursor)) out.push({ date: new Date(cursor).toISOString().slice(0, 10), isToday: false, nonDelivery: false });
  }
  return out;
}

/** Sunday = 0 → ISO's Monday = 1 … Sunday = 7. */
function isoWeekday(d: Date): number {
  return d.getUTCDay() === 0 ? 7 : d.getUTCDay();
}

/**
 * Why a day has nothing to choose:
 *   not_delivery_day  Effy does not deliver that day (only ever said of today);
 *   full              at least one window would be open but for its limit;
 *   closed            every window has passed its cutoff or can no longer be collected for.
 */
export type EffyDayClosedReason = "not_delivery_day" | "closed" | "full";

/** One day and the windows a customer may choose on it, earliest first. */
export interface EffyDay extends EffyCalendarDay {
  windows: OpenSlot[];
  /** Null exactly when `windows` is not empty. */
  closedReason: EffyDayClosedReason | null;
}

/**
 * The windows open on each day. `loadByDate` is date → slot → places taken
 * (`slotLoadByDate`, less the customer's own live holds).
 */
export function openWindows(
  now: Date,
  days: readonly EffyCalendarDay[],
  slots: readonly Slot[],
  loadByDate: ReadonlyMap<string, ReadonlyMap<string, number>>,
  runs: readonly CollectionRun[],
  bufferMin: number,
  turnaroundMin: number,
): EffyDay[] {
  return days.map((d): EffyDay => {
    if (d.nonDelivery) return { ...d, windows: [], closedReason: "not_delivery_day" };
    const load = loadByDate.get(d.date);
    const windows: OpenSlot[] = [];
    let anyFull = false;
    for (const s of slots) {
      const j = judgeWindow(now, d.date, s, load?.get(s.id) ?? 0, runs, bufferMin, turnaroundMin);
      if (j.verdict === "open") windows.push(j.slot);
      else if (j.verdict === "full") anyFull = true;
    }
    windows.sort((a, b) => a.start.getTime() - b.start.getTime() || a.end.getTime() - b.end.getTime());
    return { ...d, windows, closedReason: windows.length > 0 ? null : anyFull ? "full" : "closed" };
  });
}

/**
 * Why NO day has a window: the business has switched none on (`none_defined` — an alarm), or every
 * one is closed or taken (`no_windows`). Null when at least one window can be chosen.
 */
export function windowsUnavailable(days: readonly EffyDay[], slots: readonly Slot[]): "no_windows" | "none_defined" | null {
  if (slots.length === 0) return "none_defined";
  return days.some((d) => d.windows.length > 0) ? null : "no_windows";
}

/** The key a window's fee is filed under: a window is a slot ON A DAY. */
export const windowKey = (slotId: string, date: string): string => `${slotId}|${date}`;

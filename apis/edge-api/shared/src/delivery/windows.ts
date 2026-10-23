import { localDateParts } from "../lib/collection-deadline";
import type { CollectionRun } from "./schedule";
import { judgeWindow, type OpenSlot, type Slot } from "./slots";

/** The Effy delivery calendar: today plus the next delivery days and the windows open on each. The window rule itself is `judgeWindow`. Pure. */

/** Bounds the day scan; a check forbids excluding all seven weekdays, so a delivery day exists within a week. */
const MAX_DAY_SCAN = 60;
const DAY_MS = 24 * 3600_000;

export interface EffyCalendarDay {
  /** yyyy-mm-dd, Melbourne. */
  date: string;
  isToday: boolean;
  /** Only ever true for today: a later non-delivery day is skipped. */
  nonDelivery: boolean;
}

/**
 * Today, then the next `lookahead` delivery days. Today comes first even when Effy does not deliver
 * today, unless `todayOffered` is false (the postcode's setting): then today is absent, never listed
 * as closed, which is the whole of that rule for everything that sells or moves an Effy window. Later
 * non-delivery days are skipped and not counted. `noWeekdays` ISO (1 = Monday … 7 = Sunday), `noDates`
 * yyyy-mm-dd. Every argument is required.
 */
export function effyDays(
  now: Date,
  lookahead: number,
  noWeekdays: readonly number[],
  noDates: ReadonlySet<string>,
  todayOffered: boolean,
): EffyCalendarDay[] {
  const { year, month, day } = localDateParts(now);
  // Arithmetic at noon UTC: on a DST day local midnight + 24 h is not the next midnight.
  let cursor = Date.UTC(year, month - 1, day, 12);
  const blocked = new Set(noWeekdays);
  const excluded = (at: number): boolean => {
    const d = new Date(at);
    return blocked.has(isoWeekday(d)) || noDates.has(d.toISOString().slice(0, 10));
  };

  const out: EffyCalendarDay[] = todayOffered
    ? [{ date: new Date(cursor).toISOString().slice(0, 10), isToday: true, nonDelivery: excluded(cursor) }]
    : [];
  const wanted = lookahead + out.length;
  for (let scanned = 0; scanned < MAX_DAY_SCAN && out.length < wanted; scanned += 1) {
    cursor += DAY_MS;
    if (!excluded(cursor)) out.push({ date: new Date(cursor).toISOString().slice(0, 10), isToday: false, nonDelivery: false });
  }
  return out;
}

/** Sunday = 0 → ISO Monday = 1 … Sunday = 7. */
function isoWeekday(d: Date): number {
  return d.getUTCDay() === 0 ? 7 : d.getUTCDay();
}

/**
 * Why a day has nothing to choose: not_delivery_day (only said of today); full (a window would be open
 * but for its limit); closed (every window past its cutoff or uncollectable).
 */
export type EffyDayClosedReason = "not_delivery_day" | "closed" | "full";

/** Earliest first. */
export interface EffyDay extends EffyCalendarDay {
  windows: OpenSlot[];
  /** Null exactly when `windows` is not empty. */
  closedReason: EffyDayClosedReason | null;
  /** The "Any time" window when open this day, else null. Never in `windows`; set for today too (asap may land there), never sent. */
  anyTime: OpenSlot | null;
}

/** `loadByDate` is date → slot → places taken (`slotLoadByDate` less the customer's own live holds). */
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
    if (d.nonDelivery) return { ...d, windows: [], closedReason: "not_delivery_day", anyTime: null };
    const load = loadByDate.get(d.date);
    const windows: OpenSlot[] = [];
    let anyTime: OpenSlot | null = null;
    let anyFull = false;
    for (const s of slots) {
      const j = judgeWindow(now, d.date, s, load?.get(s.id) ?? 0, runs, bufferMin, turnaroundMin);
      if (s.anyTime) {
        if (j.verdict === "open") anyTime = j.slot;
        continue;
      }
      if (j.verdict === "open") windows.push(j.slot);
      else if (j.verdict === "full") anyFull = true;
    }
    windows.sort((a, b) => a.start.getTime() - b.start.getTime() || a.end.getTime() - b.end.getTime());
    return { ...d, windows, closedReason: windows.length > 0 ? null : anyFull ? "full" : "closed", anyTime };
  });
}

/** `none_defined` (an alarm) or `no_windows`; null when a window can be chosen. */
export function windowsUnavailable(days: readonly EffyDay[], slots: readonly Slot[]): "no_windows" | "none_defined" | null {
  if (days.some((d) => d.windows.length > 0 || d.anyTime !== null)) return null;
  // `none_defined` means no timed window: Any time always exists.
  return slots.some((s) => !s.anyTime) ? "no_windows" : "none_defined";
}

/** A window is a slot on a day. */
export const windowKey = (slotId: string, date: string): string => `${slotId}|${date}`;

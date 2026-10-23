// Wall-clock time in the operating zone: the one file that does zone arithmetic (the order cutoff and
// the window rules build their instants here too). On the day DST ends 02:30 happens twice; on the day
// it starts 02:30 does not exist.

/** Collection runs are wall-clock facts about Effy's working day. */
export const OPERATING_TZ = "Australia/Melbourne";

export interface CollectionRun {
  hour: number;
  minute: number;
}

/** In minutes, from the runtime's zone database (full ICU on Lambda), never a hardcoded +10/+11. */
export function zoneOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: OPERATING_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);

  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  // The wall clock there, expressed as if it were UTC.
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return Math.round((asUTC - at.getTime()) / 60_000);
}

function readsAs(at: Date, year: number, month: number, day: number, hour: number, minute: number): boolean {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: OPERATING_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return (
    get("year") === year &&
    get("month") === month &&
    get("day") === day &&
    get("hour") % 24 === hour % 24 &&
    get("minute") === minute
  );
}

/**
 * The instant a wall-clock time occurs on a local date. An ambiguous or skipped time resolves to the
 * earlier instant (a deadline may be strict, never loose): on dst's end the first 02:30, on its start
 * the instant just before the gap.
 */
export function instantAtLocalTime(year: number, month: number, day: number, hour: number, minute: number): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  // The two offsets in force around this time; a day either side catches one transition, never two.
  const offsets = [
    zoneOffsetMinutes(new Date(naive - 24 * 3600_000)),
    zoneOffsetMinutes(new Date(naive + 24 * 3600_000)),
  ];

  const candidates = [...new Set(offsets)]
    .map((o) => naive - o * 60_000)
    .sort((a, b) => a - b);

  // Normally one candidate reads back as the requested time; two when ambiguous, none when skipped. Earliest wins.
  const valid = candidates.filter((c) => readsAs(new Date(c), year, month, day, hour, minute));
  return new Date((valid.length > 0 ? valid : candidates)[0]!);
}

export function localDateParts(at: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: OPERATING_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/**
 * When collection for `run` must be complete: the run time itself. The prep buffer is time a shop gets
 * after ordering closes (`lastOrderCutoff` = run − buffer), not time off the end of collection.
 * `collection-deadline.contract.test.ts` pins `cutoff == deadline − buffer`.
 */
export function collectionDeadline(run: CollectionRun, onDate: Date): Date {
  const { year, month, day } = localDateParts(onDate);
  return instantAtLocalTime(year, month, day, run.hour, run.minute);
}

/**
 * The run a package readied at `now` belongs to: the earliest run strictly after `now`, today or
 * tomorrow; null with no runs. When the driver may act is `public.round_opens_at`, not this.
 */
export function nextRunInstant(runs: readonly CollectionRun[], now: Date): Date | null {
  // Tomorrow is the next local date, not now + 24 h: a 23-hour day would skip tomorrow's schedule.
  const { year, month, day } = localDateParts(now);
  const candidates = [0, 1]
    .flatMap((offset) => runs.map((r) => instantAtLocalTime(year, month, day + offset, r.hour, r.minute)))
    .filter((d) => d.getTime() > now.getTime())
    .sort((x, y) => x.getTime() - y.getTime());
  return candidates[0] ?? null;
}

/** The delivery calendar. */
export interface RunCalendar {
  /** ISO weekdays (1 = Monday … 7 = Sunday) with no deliveries. */
  noWeekdays?: readonly number[];
  /** yyyy-mm-dd local dates with no deliveries. */
  noDates?: ReadonlySet<string>;
}

/**
 * The run a parcel sold a window travels on: the latest that still reaches the hub in time
 * (`run + turnaroundMin ≤ windowStart`, the same test as `judgeWindow`), on the window's day or the
 * nearest earlier delivery day, so chilled goods stay at the supplier as long as they can. Null when no
 * run in `maxDaysBack` days makes it: the caller then uses the next run. Arithmetic on local dates.
 */
export function collectionRunFor(
  windowStart: Date,
  runs: readonly CollectionRun[],
  turnaroundMin: number,
  calendar: RunCalendar = {},
  maxDaysBack = 7,
): Date | null {
  if (runs.length === 0) return null;
  const { year, month, day } = localDateParts(windowStart);
  const blocked = new Set(calendar.noWeekdays ?? []);
  const latestBy = windowStart.getTime() - turnaroundMin * 60_000;

  for (let back = 0; back <= maxDaysBack; back += 1) {
    // Noon UTC of the local date: safe for date and weekday on any DST day.
    const noon = new Date(Date.UTC(year, month - 1, day - back, 12));
    const isoDate = noon.toISOString().slice(0, 10);
    const weekday = noon.getUTCDay() === 0 ? 7 : noon.getUTCDay();
    // The window's own day is a delivery day (it was sold); earlier days must be too.
    if (back > 0 && (blocked.has(weekday) || calendar.noDates?.has(isoDate))) continue;

    let best: Date | null = null;
    for (const r of runs) {
      const at = instantAtLocalTime(year, month, day - back, r.hour, r.minute);
      if (at.getTime() <= latestBy && (best === null || at.getTime() > best.getTime())) best = at;
    }
    if (best !== null) return best;
  }
  return null;
}

/** 23:59:59 in the operating zone. Lives here because `midnight − 11 h` is wrong half the year. */
export function endOfLocalDay(at: Date): Date {
  const { year, month, day } = localDateParts(at);
  return new Date(instantAtLocalTime(year, month, day + 1, 0, 0).getTime() - 1000);
}

/** RFC 3339 in the operating zone (`2026-08-24T17:00:00+10:00`), so a shopper sees Effy's working day on any device. */
export function operatingStamp(at: Date): string {
  const offset = zoneOffsetMinutes(at);
  const local = new Date(at.getTime() + offset * 60_000).toISOString().slice(0, 19);
  const sign = offset < 0 ? "-" : "+";
  const abs = Math.abs(offset);
  return `${local}${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

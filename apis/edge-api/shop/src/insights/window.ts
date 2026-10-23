// Ranges, comparison windows and bucketing: pure calendar arithmetic over the shop's own zone, tested
// against real zone rules. The rollups are keyed by the UTC instant a local hour began
// (`shop_local_hour`), and these functions must agree with it, or a bucket reads as zero.

import type { ComparisonBasis, InsightsRange } from "@effy/shared-types";

/** Half-open [from, to). */
export interface Window {
  from: Date;
  to: Date;
}

export type Grain = "hour" | "day" | "week";

export interface RangePlan {
  range: InsightsRange;
  window: Window;
  comparison: Window;
  basis: ComparisonBasis;
  grain: Grain;
}

/** In minutes, computed per instant: Melbourne is +10 half the year and +11 the other half. */
export function offsetMinutes(at: Date, timeZone: string): number {
  // `en-CA` gives ISO-ordered parts that parse unambiguously.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  // The wall clock there, expressed as if it were UTC.
  const asUTC = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return Math.round((asUTC - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

export function localParts(at: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
} {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  });
  const parts = fmt.formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    weekday: Math.max(0, weekdays.indexOf(get("weekday"))),
  };
}

/** Two passes: across a DST boundary the first guess uses the wrong offset, so it is applied once more. */
export function instantOfLocal(
  timeZone: string,
  y: number,
  m: number,
  d: number,
  hour = 0,
  minute = 0,
): Date {
  const naive = Date.UTC(y, m - 1, d, hour, minute);
  const firstGuess = new Date(naive - offsetMinutes(new Date(naive), timeZone) * 60_000);
  const corrected = new Date(naive - offsetMinutes(firstGuess, timeZone) * 60_000);
  return corrected;
}

export function startOfLocalDay(at: Date, timeZone: string): Date {
  const p = localParts(at, timeZone);
  return instantOfLocal(timeZone, p.year, p.month, p.day);
}

/** By calendar day, never 24 hours (DST days are not 24 h). */
export function addLocalDays(at: Date, timeZone: string, days: number): Date {
  const p = localParts(at, timeZone);
  const shifted = new Date(Date.UTC(p.year, p.month - 1, p.day + days));
  return instantOfLocal(
    timeZone,
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
  );
}

/** Monday-start (ISO 8601 and Australian convention). */
export function startOfLocalWeek(at: Date, timeZone: string): Date {
  const p = localParts(at, timeZone);
  const backToMonday = (p.weekday + 6) % 7;
  return addLocalDays(startOfLocalDay(at, timeZone), timeZone, -backToMonday);
}

/**
 * Today compares with the same weekday last week, truncated to the same time of day: a morning against
 * a whole day would read as a collapse every morning, and Monday against Monday keeps the weekly rhythm.
 */
export function planFor(range: InsightsRange, now: Date, timeZone: string): RangePlan {
  const todayStart = startOfLocalDay(now, timeZone);

  if (range === "today") {
    const elapsedMs = now.getTime() - todayStart.getTime();
    const lastWeekSameDay = addLocalDays(todayStart, timeZone, -7);
    return {
      range,
      window: { from: todayStart, to: now },
      comparison: {
        from: lastWeekSameDay,
        to: new Date(lastWeekSameDay.getTime() + elapsedMs),
      },
      basis: "same_weekday_last_week",
      grain: "hour",
    };
  }

  const days = range === "7d" ? 7 : 30;
  // Whole local days, ending with today (still running).
  const from = addLocalDays(todayStart, timeZone, -(days - 1));
  const previousFrom = addLocalDays(from, timeZone, -days);
  return {
    range,
    window: { from, to: now },
    comparison: { from: previousFrom, to: from },
    basis: days === 7 ? "previous_7_days" : "previous_30_days",
    grain: days === 7 ? "day" : "week",
  };
}

export interface Bucket {
  start: Date;
  /** Exclusive end, which explains a partial week's shorter bar. */
  end: Date;
  label: string;
  partial: boolean;
}

/** Hours are walked on the clock, not added as fixed ms: DST days have 25 and 23 hours. */
export function bucketsFor(plan: RangePlan, timeZone: string): Bucket[] {
  const out: Bucket[] = [];

  if (plan.grain === "hour") {
    let cursor = plan.window.from;
    // Trim the quiet early hours when the shop is shut.
    for (let guard = 0; guard < 30 && cursor < plan.window.to; guard++) {
      const next = nextLocalHour(cursor, timeZone);
      const p = localParts(cursor, timeZone);
      out.push({
        start: cursor,
        end: next,
        label: String(p.hour).padStart(2, "0"),
        partial: next > plan.window.to,
      });
      cursor = next;
    }
    return out;
  }

  if (plan.grain === "day") {
    let cursor = plan.window.from;
    for (let guard = 0; guard < 40 && cursor < plan.window.to; guard++) {
      const next = addLocalDays(cursor, timeZone, 1);
      const p = localParts(cursor, timeZone);
      const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][p.weekday]!;
      out.push({
        start: cursor,
        end: next,
        label: `${weekday} ${p.day}`,
        partial: next > plan.window.to,
      });
      cursor = next;
    }
    return out;
  }

  // The ISO weeks the window touches; the first and last are usually partial.
  let cursor = startOfLocalWeek(plan.window.from, timeZone);
  for (let guard = 0; guard < 8 && cursor < plan.window.to; guard++) {
    const next = addLocalDays(cursor, timeZone, 7);
    const start = cursor < plan.window.from ? plan.window.from : cursor;
    out.push({
      start,
      end: next,
      label: `W${isoWeek(cursor, timeZone)}`,
      partial: cursor < plan.window.from || next > plan.window.to,
    });
    cursor = next;
  }
  return out;
}

/**
 * One hour later: a DST shift moves the label, not the spacing. A 30-minute DST zone (Lord Howe) would
 * be half an hour out; no shop is in one, and the SQL side handles it regardless.
 */
export function nextLocalHour(at: Date, _timeZone: string): Date {
  return new Date(at.getTime() + 3_600_000);
}

/** In the shop's own zone. */
export function isoWeek(at: Date, timeZone: string): number {
  const p = localParts(at, timeZone);
  const date = new Date(Date.UTC(p.year, p.month - 1, p.day));
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  return 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
}

/** "26 August – 1 September" / "14 September". */
export function windowLabel(plan: RangePlan, timeZone: string): string {
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "long", timeZone }).format(d);
  if (plan.range === "today") return fmt(plan.window.from);
  // The window's last full day, not the exclusive end.
  const lastDay = addLocalDays(plan.window.to, timeZone, 0);
  return `${fmt(plan.window.from)} – ${fmt(lastDay)}`;
}

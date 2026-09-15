// Ranges, comparison windows and bucketing — pure functions over a shop's own clock (058, US3).
//
// ⚠ NO DATABASE, NO I/O, AND THAT IS WHY IT IS ITS OWN FILE. Everything here is arithmetic about
// calendars, and calendar arithmetic is where this feature can most easily be wrong in a way nobody
// notices: an hour that goes missing in October, a week that starts on Sunday, a "today" that means
// UTC's today for a shop in Melbourne. Each of those produces a number that looks completely
// plausible. Pure functions mean they can be tested exhaustively, against real zone rules, without a
// container.
//
// ⚠ EVERY BOUNDARY IS THE SHOP'S, NOT THE SERVER'S. The rollups are keyed by the UTC instant a local
// hour began (see the migration's `shop_local_hour`), and these functions do the same arithmetic in
// TypeScript. The two MUST agree — a bucket the reader cannot address is a bucket that reads as zero.

import type { ComparisonBasis, InsightsRange } from "@effy/shared-types";

/** A half-open window [from, to). */
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

/**
 * The offset a zone was at, at a given instant, in minutes.
 *
 * ⚠ COMPUTED PER INSTANT, never per zone. Melbourne is +10 for half the year and +11 for the other
 * half; a single "the shop is +10" constant is wrong for six months of every year, and wrong by one
 * hour at exactly the moments people look at yesterday's figures.
 */
export function offsetMinutes(at: Date, timeZone: string): number {
  // `en-CA` gives ISO-ordered parts, which parse unambiguously.
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
  // What the wall clock reads there, expressed as if it were UTC.
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

/** The local wall-clock fields at an instant. */
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

/**
 * The instant at which a local wall-clock time occurs in a zone.
 *
 * ⚠ TWO PASSES, BECAUSE ONE IS WRONG ACROSS A DST BOUNDARY. The first guess uses the offset at the
 * approximate instant; if that instant turns out to sit on the other side of a transition, the
 * offset it was computed with is the wrong one, so it is recomputed and applied once more. This is
 * the standard fix, and without it "midnight local" lands an hour out twice a year — on exactly the
 * two days an operator is most likely to check.
 */
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

/**
 * The UTC instant at which the local hour containing `at` began — the rollup's bucket key.
 *
 * ⚠ IT EXISTS TO MIRROR THE DATABASE, and is deliberately not used for bucketing anything here: the
 * chart walks whole hours from the window's start (`bucketsFor`), and the rollup rows are keyed by
 * the SQL function. What this gives is a cross-check — `window.test.ts` asserts it produces exactly
 * the instants `public.shop_local_hour` does, so a divergence between the reader's idea of an hour
 * and the writer's is caught HERE rather than as a screen full of zeros that nothing explains.
 *
 * ⚠ IT SUBTRACTS THE ELAPSED PART OF THE HOUR FROM THE INSTANT, rather than rebuilding the instant
 * from the wall-clock fields. Rebuilding is ambiguous on the day daylight saving ends: 02:30 happens
 * twice, both read "02:30", and asking "when does local 02:00 begin?" has two answers — so the first
 * of the two hours would be silently attributed to the second. The first draft did exactly that, and
 * the 25-bucket test caught it skipping an hour of a real trading day. Anchoring on the instant has
 * no ambiguity to resolve.
 */
export function localHourStart(at: Date, timeZone: string): Date {
  const p = localParts(at, timeZone);
  const elapsed =
    p.minute * 60_000 + at.getUTCSeconds() * 1_000 + at.getUTCMilliseconds();
  return new Date(at.getTime() - elapsed);
}

/** Local midnight that starts the day containing `at`. */
export function startOfLocalDay(at: Date, timeZone: string): Date {
  const p = localParts(at, timeZone);
  return instantOfLocal(timeZone, p.year, p.month, p.day);
}

/** Local midnight `days` later, by CALENDAR day — never by adding 24 hours (DST days are not 24 h). */
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

/** Monday-start week containing `at` (ISO 8601, and the Australian convention). */
export function startOfLocalWeek(at: Date, timeZone: string): Date {
  const p = localParts(at, timeZone);
  const backToMonday = (p.weekday + 6) % 7;
  return addLocalDays(startOfLocalDay(at, timeZone), timeZone, -backToMonday);
}

/**
 * The window a range covers, and what it is compared against.
 *
 * ⚠ TODAY COMPARES WITH THE SAME WEEKDAY LAST WEEK, TRUNCATED TO THE SAME TIME OF DAY. A morning
 * measured against a whole day reads as a collapse every single morning — the comparison would be
 * useless precisely when people look at it most. A Monday against a Monday also survives the weekly
 * rhythm every grocery shop has; "yesterday" would not.
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
  // Whole local days, ending with today (which is still running).
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
  /** Exclusive end — what makes a partial week's shorter bar explainable. */
  end: Date;
  label: string;
  partial: boolean;
}

/**
 * The buckets a chart draws.
 *
 * ⚠ HOURS ARE ENUMERATED BY WALKING THE CLOCK, NOT BY ADDING 3,600,000 ms. On the day daylight
 * saving ends, the local 02:00 hour happens twice — two distinct instants, both labelled "02" — and
 * on the day it begins, one local hour never happens at all. Adding fixed milliseconds produces 24
 * buckets on both days: one of them silently merging two real hours, the other inventing an hour
 * that did not exist. Walking hour by hour gives 25 and 23, which is the truth.
 */
export function bucketsFor(plan: RangePlan, timeZone: string): Bucket[] {
  const out: Bucket[] = [];

  if (plan.grain === "hour") {
    let cursor = plan.window.from;
    // Trim the quiet early hours: a bar chart that opens with six empty bars wastes half its width
    // on the hours a grocery shop is shut.
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

  // Weeks: the ISO weeks the window touches. The first and last are usually partial, and say so.
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
 * The instant the NEXT local hour begins.
 *
 * ⚠ IT IS SIMPLY ONE HOUR LATER, and that is correct rather than lazy. A daylight-saving transition
 * moves the LABEL, not the spacing: local hour boundaries are 3,600 seconds of real time apart on
 * both sides of a one-hour shift. That is what makes a 25-hour day produce 25 buckets (02 appearing
 * twice) and a 23-hour day produce 23 (03 never appearing) without any special case at all.
 *
 * ⚠ Known limit: a zone whose DST shift is 30 minutes (Lord Howe Island) would put boundaries half
 * an hour out. No Effy shop is in one, the SQL side handles it correctly regardless, and inventing
 * machinery for it here would be untested code guarding a case that cannot occur.
 */
export function nextLocalHour(at: Date, _timeZone: string): Date {
  return new Date(at.getTime() + 3_600_000);
}

/** ISO 8601 week number, in the shop's own zone. */
export function isoWeek(at: Date, timeZone: string): number {
  const p = localParts(at, timeZone);
  const date = new Date(Date.UTC(p.year, p.month - 1, p.day));
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day + 3); // the Thursday of this ISO week
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  return 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
}

/** "26 August – 1 September" / "14 September" — the subtitle's exact window. */
export function windowLabel(plan: RangePlan, timeZone: string): string {
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "long", timeZone }).format(d);
  if (plan.range === "today") return fmt(plan.window.from);
  // The window's last full day, not the exclusive end — "26 August – 2 September" for a window that
  // ends at midnight on the 2nd would name a day the figures do not include.
  const lastDay = addLocalDays(plan.window.to, timeZone, 0);
  return `${fmt(plan.window.from)} – ${fmt(lastDay)}`;
}

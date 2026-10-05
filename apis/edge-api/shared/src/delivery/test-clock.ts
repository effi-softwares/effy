// Test helpers only: build and read Melbourne wall-clock instants.
import { instantAtLocalTime, OPERATING_TZ } from "../lib/collection-deadline";

/** h:m on 24 Aug 2026 in Melbourne — the fixture day the delivery table tests share. */
export const at = (hour: number, minute: number): Date => instantAtLocalTime(2026, 8, 24, hour, minute);

export const melbourne = (y: number, m: number, d: number, hour: number, minute = 0): Date =>
  instantAtLocalTime(y, m, d, hour, minute);

export function wallClock(d: Date): { hour: number; minute: number; offsetMinutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: OPERATING_TZ, hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return { hour: get("hour") % 24, minute: get("minute"), offsetMinutes: Math.round((asUTC - d.getTime()) / 60_000) };
}

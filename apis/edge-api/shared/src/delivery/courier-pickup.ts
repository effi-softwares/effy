import { localDateParts } from "../lib/collection-deadline";
import { clockOnDate, type Clock } from "./slots";

/**
 * When a courier parcel is next collected by its courier service (080 R5) — the moment it is "due
 * out" from the hub, and after which it is late.
 *
 * Pure: the caller passes the moment the parcel is (or will be) ready, and the service's pickup
 * weekdays and cutoff. The answer is the service's cutoff on the first pickup day on or after that
 * moment's Melbourne day whose cutoff has not passed.
 *
 * ⚠ The instant is made by `clockOnDate`, the one place a wall clock becomes an instant (078's
 * guard). Days are stepped at NOON UTC, like `effyDays`, so a daylight-saving change day is neither
 * repeated nor skipped.
 */
const DAY_MS = 24 * 3600_000;

export function nextCourierPickup(from: Date, weekdays: readonly number[], cutoff: Clock): Date {
  if (weekdays.length === 0) throw new Error("nextCourierPickup: a courier service collects on at least one weekday");
  const days = new Set(weekdays);
  const { year, month, day } = localDateParts(from);
  let cursor = Date.UTC(year, month - 1, day, 12);
  // Eight days covers every weekday once, plus "today, but the cutoff has passed".
  for (let i = 0; i < 8; i += 1, cursor += DAY_MS) {
    const d = new Date(cursor);
    if (!days.has(d.getUTCDay() === 0 ? 7 : d.getUTCDay())) continue;
    const at = clockOnDate(cutoff, d.toISOString().slice(0, 10));
    if (at.getTime() >= from.getTime()) return at;
  }
  throw new Error("nextCourierPickup: no pickup within a week");
}

/** "14:00" or "14:00:00" (as PostgreSQL returns a `time`) → a clock. */
export function parseClock(text: string): Clock {
  const [h, m] = text.split(":").map(Number);
  return { hour: h ?? 0, minute: m ?? 0 };
}

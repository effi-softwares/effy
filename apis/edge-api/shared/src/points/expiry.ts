/**
 * When a credited lot of points stops counting (074, research R2).
 *
 * Points credited on 8 Oct 2026 with a 12-month period are usable THROUGH 8 Oct 2027 and stop at
 * 00:00 Australia/Melbourne on 9 Oct 2027 — "expires 8 Oct 2027" means what a customer reads it to mean.
 *
 * ⚠ BUILT FROM `instantAtLocalTime` / `localDateParts`, the platform's one home of operating-zone
 * arithmetic, whose DST fixtures already exist. A month-end credit lands on the target month's last
 * day (31 Jan + 1 month → 28/29 Feb), never spilling into the month after.
 */
import { instantAtLocalTime, localDateParts } from "../lib/collection-deadline";

/** The Melbourne calendar date a lot is last usable, as yyyy-mm-dd. */
export function lastUsableDate(creditedAt: Date, expiryMonths: number): string {
  const { year, month, day } = localDateParts(creditedAt);
  const target = month - 1 + expiryMonths; // zero-based month index, may run past December
  const y = year + Math.floor(target / 12);
  const m = (target % 12) + 1;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const d = Math.min(day, daysInMonth);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** The instant a lot credited at `creditedAt` stops counting: 00:00 Melbourne the day after its last usable date. */
export function expiresAtFor(creditedAt: Date, expiryMonths: number): Date {
  const [y, m, d] = lastUsableDate(creditedAt, expiryMonths).split("-").map(Number) as [number, number, number];
  return instantAtLocalTime(y, m, d + 1, 0, 0);
}

/** The Melbourne date an `expires_at` instant is last usable on — what the customer is told. */
export function lastUsableDateOf(expiresAt: Date): string {
  const { year, month, day } = localDateParts(new Date(expiresAt.getTime() - 1000));
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

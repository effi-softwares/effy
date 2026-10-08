/**
 * The delivery window — what a same-day customer was sold, and how every surface says it (069).
 *
 * Contract: `specs/069-delivery-slots-dates/contracts/delivery-slots-dates.md`.
 *
 * ⚠ ONE WORDING, IN ONE PLACE. The confirmation page, the order page and the emailed receipt all call
 * `formatArrival`; the two Kotlin apps carry a twin pinned to `delivery-window.fixtures.json`. 052
 * deleted a second implementation of one rule (`summarizeFulfillment`) for exactly the reason this
 * exists: two surfaces that each render SOMETHING never fail when they disagree.
 *
 * ⚠ NOTHING HERE USES `Intl` TO PRODUCE TEXT. ICU's output for "5 pm" differs between runtimes (a
 * narrow no-break space on some, "p.m." on others), and a fixture shared with Kotlin cannot depend on
 * which ICU a Lambda shipped with. `Intl` is used only to read the Melbourne wall clock.
 */

/** The platform's operating timezone. A delivery happens in Melbourne, wherever the device is (FR-029). */
export const DELIVERY_TZ = "Australia/Melbourne";

/** A same-day delivery window, as two instants. */
export interface DeliveryWindow {
  /** ISO-8601 instant. */
  startAt: string;
  /** ISO-8601 instant. */
  endAt: string;
}

/** Where a drop stands against its window right now. */
export type DeliveryWindowState = "upcoming" | "due" | "late";

/**
 * Upcoming until the window opens, due while it is open, late once it has closed (FR-032).
 *
 * ⚠ Derived where it is SHOWN, never stored and never sent: it changes while a screen is open.
 * The window's end is inclusive — a drop completed on the stroke of the end is on time.
 */
export function windowStateAt(now: Date, window: DeliveryWindow): DeliveryWindowState {
  const t = now.getTime();
  if (t < new Date(window.startAt).getTime()) return "upcoming";
  if (t <= new Date(window.endAt).getTime()) return "due";
  return "late";
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

interface WallClock {
  isoDate: string;
  hour: number;
  minute: number;
}

/** What the Melbourne wall clock reads at an instant. */
function melbourne(at: Date): WallClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: DELIVERY_TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    isoDate: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
  };
}

/** The Melbourne date (yyyy-mm-dd) at an instant. */
export function melbourneDate(at: Date): string {
  return melbourne(at).isoDate;
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "Thu 8 Oct" — a calendar date has no timezone, so this is pure arithmetic on the ISO string. */
export function formatDeliveryDay(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "Today" / "Tomorrow" where it applies, otherwise the date. */
function relativeDay(isoDate: string, now: Date): string {
  const today = melbourneDate(now);
  if (isoDate === today) return "Today";
  if (isoDate === addDays(today, 1)) return "Tomorrow";
  return formatDeliveryDay(isoDate);
}

/** "5 pm", "5:30 pm", "12 pm" (noon), "12 am" (midnight). */
function clock(hour: number, minute: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const suffix = hour < 12 ? "am" : "pm";
  return minute === 0 ? `${h12} ${suffix}` : `${h12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

/** "5 pm – 7 pm", in Melbourne time. */
/**
 * A moment in words, in Melbourne time, relative to today (072): "1:15 pm" when it is today,
 * "tomorrow 11:15 am", otherwise "Thu 9 Oct 11:15 am".
 *
 * ⚠ WRITTEN BY THE SERVER FOR THE DRIVER APP, which never formats a time itself — it has no timezone
 * database, and a second wording is how two screens end up disagreeing about one instant (see
 * `DeliveryWindow.kt`). The console may call it directly.
 */
export function formatMoment(at: Date | string, now: Date): string {
  const instant = at instanceof Date ? at : new Date(at);
  const m = melbourne(instant);
  const time = clock(m.hour, m.minute);
  const today = melbourneDate(now);
  if (m.isoDate === today) return time;
  if (m.isoDate === addDays(today, 1)) return `tomorrow ${time}`;
  return `${formatDeliveryDay(m.isoDate)} ${time}`;
}

export function formatDeliveryWindow(window: DeliveryWindow): string {
  const s = melbourne(new Date(window.startAt));
  const e = melbourne(new Date(window.endAt));
  return `${clock(s.hour, s.minute)} – ${clock(e.hour, e.minute)}`;
}

/** The fields `formatArrival` reads — the customer's `ArrivalEstimateDTO` satisfies it. */
export interface ArrivalPromise {
  promisedFrom: string | null;
  promisedTo: string | null;
  windowStart?: string | null;
  windowEnd?: string | null;
}

/** What is said when the platform has made no promise. Every order placed before 069 reads this. */
export const ARRIVAL_UNCONFIRMED = "We'll confirm your delivery date";

/**
 * One entry per DISTINCT promise (078).
 *
 * An order's delivery is recorded per package, and under the new delivery model every package of an
 * order carries the same window. Said once per package, one delivery reads as several — and the
 * number of lines is the number of suppliers, which a customer is never told. Identical promises
 * are one promise; different ones (an order sold before the new model, split across today and a
 * later day) stay apart. Order is kept.
 */
export function distinctArrivals<T extends ArrivalPromise & { method?: string | null }>(arrivals: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const a of arrivals) {
    const key = [a.method ?? "", a.promisedFrom ?? "", a.promisedTo ?? "", a.windowStart ?? "", a.windowEnd ?? ""].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

/**
 * The arrival, in the plainest words the DATA supports.
 *
 *   window, today        → "Today, 5 pm – 7 pm"
 *   window, another day  → "Thu 8 Oct, 5 pm – 7 pm"
 *   no window, one day   → "Today" / "Tomorrow" / "Thu 8 Oct"
 *   no window, a range   → "Thu 8 Oct – Sat 10 Oct"
 *   no dates             → "We'll confirm your delivery date"
 *
 * ⚠ When there is no promise this SAYS SO rather than inventing one. A fabricated date on a receipt
 * is a false fact on the one document a customer treats as a record (052 research R4).
 */
export function formatArrival(a: ArrivalPromise, now: Date): string {
  if (a.windowStart && a.windowEnd) {
    const window = { startAt: a.windowStart, endAt: a.windowEnd };
    const day = relativeDay(melbourneDate(new Date(a.windowStart)), now);
    return `${day}, ${formatDeliveryWindow(window)}`;
  }

  if (!a.promisedFrom && !a.promisedTo) return ARRIVAL_UNCONFIRMED;
  const from = a.promisedFrom ?? a.promisedTo!;
  const to = a.promisedTo ?? a.promisedFrom!;
  if (from === to) return relativeDay(from, now);
  return `${formatDeliveryDay(from)} – ${formatDeliveryDay(to)}`;
}

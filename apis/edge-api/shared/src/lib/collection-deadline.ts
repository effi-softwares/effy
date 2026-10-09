// Wall-clock time in the platform's operating zone — the ONE file that does zone arithmetic.
//
// It began (063) as the wave planner's "when must collection for a run be complete?". Since 070 the
// checkout question (`delivery/sameday.ts`), the slot rules (`delivery/slots.ts`) and the
// standard-day rule (`delivery/standard-days.ts`) build their instants HERE too, from
// `instantAtLocalTime`. There is one implementation.
//
// ⚠ DST IS NOT A DETAIL HERE. 058 found TWO real calendar bugs that only DST tests caught, including
// one that silently skipped an entire trading hour — both from rebuilding an instant out of wall-clock
// fields, which is exactly what this does. On the day DST ends 02:30 happens twice; on the day it
// starts 02:30 does not exist.

/** The platform's operating timezone. Collection runs are wall-clock facts about Effy's working day. */
export const OPERATING_TZ = "Australia/Melbourne";

/** One daily collection run, as a wall-clock time of day. */
export interface CollectionRun {
  hour: number;
  minute: number;
}

/**
 * The UTC offset, in minutes, that `OPERATING_TZ` is at for a given instant.
 *
 * ⚠ Derived from the runtime's own zone database rather than a hardcoded +10/+11, because the whole
 * point is to be right on the two days a year the offset changes. Node ships full ICU on the Lambda
 * runtimes this package targets.
 */
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
  // What the wall clock reads there, expressed as if it were UTC.
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return Math.round((asUTC - at.getTime()) / 60_000);
}

/** Does `at` read as exactly this wall-clock time in the operating zone? */
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
 * The instant at which a given wall-clock time occurs in `OPERATING_TZ` on a given local date.
 *
 * ⚠ ONE RULE COVERS BOTH DST TRANSITIONS: **when a wall-clock time is ambiguous or does not exist,
 * resolve to the EARLIER instant.** A deadline may be strict; it must never be accidentally loose.
 *
 *   · On the day DST ends, 02:30 happens twice — once before the clocks go back and once after. The
 *     earlier of the two is chosen, so the deadline cannot silently gain an hour.
 *   · On the day DST starts, 02:30 never happens at all. The instant just before the gap is chosen,
 *     for the same reason.
 *
 * ⚠ THE ALTERNATIVE IS THE BUG 058 SHIPPED. Rebuilding an instant from wall-clock fields is where
 * both of that slice's real calendar defects lived, one of which silently skipped an entire trading
 * hour. A deadline that slips an hour lets a package miss the van while the system believes it has
 * time — and nothing anywhere reports it.
 */
export function instantAtLocalTime(year: number, month: number, day: number, hour: number, minute: number): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  // The two offsets that can be in force around this local time. They differ only across a
  // transition, and a day either side is far enough to catch one without catching two.
  const offsets = [
    zoneOffsetMinutes(new Date(naive - 24 * 3600_000)),
    zoneOffsetMinutes(new Date(naive + 24 * 3600_000)),
  ];

  const candidates = [...new Set(offsets)]
    .map((o) => naive - o * 60_000)
    .sort((a, b) => a - b);

  // Normally exactly one candidate reads back as the requested wall time. Two do when the time is
  // ambiguous; none do when it was skipped. Earliest wins in every case.
  const valid = candidates.filter((c) => readsAs(new Date(c), year, month, day, hour, minute));
  return new Date((valid.length > 0 ? valid : candidates)[0]!);
}

/** The local calendar date, in `OPERATING_TZ`, for an instant. */
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
 * When collection for `run` must be complete, on the local date containing `onDate`: **the run time
 * itself.**
 *
 * ⚠⚠ CORRECTED 2026-09-30 — THIS USED TO RETURN `run_time − prep_buffer`, AND THAT WAS WRONG.
 *
 * 063's research R1 reasoned "given the 14:00 run and a 60-minute buffer, everything for that run must
 * be collected by 13:00" — reading the prep buffer as time taken off the END of the collection window.
 * It is the opposite. The buffer is the time a SHOP gets to pick and pack AFTER ordering closes:
 * checkout offers same-day while `now ≤ run_time − prep_buffer` (`sameDayCutoff`, unchanged), and
 * the driver collects AT the run time. 063's own spec always said so — FR-002: "early enough that an
 * assigned driver can complete the round before the **run time**". The code implemented the research,
 * not the spec.
 *
 * The consequences were real and completely silent:
 *   · the collection deadline and the checkout cutoff were the SAME INSTANT, so the shop had ZERO prep
 *     time — a shopper could buy same-day at 20:59 for a package that had to be collected by 21:00;
 *   · after the day's last window such an order could only be collected TOMORROW — a broken same-day
 *     promise with no error anywhere;
 *   · the configured run time played no part in anything. Drivers were sent up to two hours early.
 *
 * ⚠ The cross-language contract did not catch it because it pinned `cutoff == deadline` — the bug
 * itself. It now pins `cutoff == deadline − buffer`, which is the relationship that actually ties the
 * two halves together: a shop always gets exactly the configured buffer between ordering closing and
 * the driver arriving. See `collection-deadline.contract.test.ts`.
 */
export function collectionDeadline(run: CollectionRun, onDate: Date): Date {
  const { year, month, day } = localDateParts(onDate);
  return instantAtLocalTime(year, month, day, run.hour, run.minute);
}

/**
 * The collection run a package made ready at `now` belongs to: the earliest run instant strictly
 * after `now`, today or tomorrow — or null when no run is configured (072).
 *
 * ⚠ THIS REPLACED A PLANNING WINDOW. Until 072 the planner asked "is a run within its lead time?"
 * (`runsDueForPlanning`) and assigned nothing outside that window, so a package a shop finished at
 * 09:00 for a 14:00 run had nobody's name on it until 13:15. The question is now only "which run is
 * this for?", asked on every pass; WHEN the driver may act is the round's opening time, which the
 * database derives (`public.round_opens_at`) and this file deliberately does not.
 *
 * ⚠ STRICTLY AFTER. A run whose time is exactly now has gone: nothing assigned at that instant can
 * be collected by it. A package readied a minute before a run still targets that run, fails every
 * driver's deadline gate, and moves to the next run on the first pass after the run time.
 *
 * Looks at today's runs and tomorrow's, because after the day's last run the next one is tomorrow
 * morning's. Built from `instantAtLocalTime`, so both DST transitions are already handled.
 */
export function nextRunInstant(runs: readonly CollectionRun[], now: Date): Date | null {
  // ⚠ TOMORROW IS THE NEXT LOCAL DATE, NOT NOW + 24 HOURS. The day the clocks go forward is 23
  // hours long, so 23:30 plus 24 hours lands on the day AFTER tomorrow and the whole of tomorrow's
  // schedule is skipped. The function this replaced (`nextPlanningTime`) did exactly that; the DST
  // fixture in next-run-instant.test.ts is what found it.
  const { year, month, day } = localDateParts(now);
  const candidates = [0, 1]
    .flatMap((offset) => runs.map((r) => instantAtLocalTime(year, month, day + offset, r.hour, r.minute)))
    .filter((d) => d.getTime() > now.getTime())
    .sort((x, y) => x.getTime() - y.getTime());
  return candidates[0] ?? null;
}

/** The days a collection may be planned on — 069's delivery calendar. */
export interface RunCalendar {
  /** ISO weekdays (1 = Monday … 7 = Sunday) with no deliveries. */
  noWeekdays?: readonly number[];
  /** yyyy-mm-dd local dates with no deliveries. */
  noDates?: ReadonlySet<string>;
}

/**
 * The collection run a parcel sold a WINDOW should travel on (082): the LATEST run that still reaches
 * the hub in time — `run + turnaroundMin ≤ windowStart` — on the window's own day, or failing that on
 * the nearest earlier delivery day. Null when no run in the last `maxDaysBack` days makes it (no runs
 * configured, or a window sooner than any run can serve): the caller then treats the parcel as due on
 * the next run, which is what happened before this rule existed.
 *
 * ⚠ LATEST, NOT EARLIEST. Chilled and frozen goods stay at the supplier as long as they can, and the
 * hub holds as little as possible. A window before its own day's first workable run is collected the
 * delivery day before and waits at the hub overnight.
 *
 * ⚠ THE SAME TEST CHECKOUT USES for a window today (`judgeWindow`: a run reaches the hub in time when
 * `run + turnaround ≤ start`). The planner and the checkout cannot disagree about whether a run makes
 * a window.
 *
 * ⚠ Calendar arithmetic on LOCAL DATES (`instantAtLocalTime` normalises day overflow), never on
 * "minus 24 hours": the day the clocks change is 23 or 25 hours long.
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
    // Noon UTC of the local calendar date: safe for reading the date and weekday on any DST day.
    const noon = new Date(Date.UTC(year, month - 1, day - back, 12));
    const isoDate = noon.toISOString().slice(0, 10);
    const weekday = noon.getUTCDay() === 0 ? 7 : noon.getUTCDay();
    // The window's own day is a delivery day by construction (it was sold); earlier days must be too.
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

/**
 * The last instant of the local day containing `at` — 23:59:59 in the operating zone.
 *
 * ⚠ IT LIVES HERE, NOT WHEREVER IT IS NEEDED. The first draft of the planner computed this inline as
 * `midnight − 11 hours`, which is right for half the year and an hour wrong for the other half. Zone
 * arithmetic belongs in the one file that does zone arithmetic, where the DST fixtures already point.
 *
 * Used as a same-day delivery deadline: the platform's delivery promise is DATE-granular (052 R4 —
 * there is no delivery time window and none can be derived), so the end of the day is not an invented
 * deadline but the last moment the promise made at checkout can still be kept.
 */
export function endOfLocalDay(at: Date): Date {
  const { year, month, day } = localDateParts(at);
  return new Date(instantAtLocalTime(year, month, day + 1, 0, 0).getTime() - 1000);
}

/**
 * An instant as an RFC 3339 timestamp IN THE OPERATING ZONE — `2026-08-24T17:00:00+10:00`.
 *
 * Delivery windows, cut-offs and hold expiries are sent to clients this way so that a shopper is
 * shown Effy's working day, whatever zone their device is set to: the offset travels with the time.
 */
export function operatingStamp(at: Date): string {
  const offset = zoneOffsetMinutes(at);
  const local = new Date(at.getTime() + offset * 60_000).toISOString().slice(0, 19);
  const sign = offset < 0 ? "-" : "+";
  const abs = Math.abs(offset);
  return `${local}${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

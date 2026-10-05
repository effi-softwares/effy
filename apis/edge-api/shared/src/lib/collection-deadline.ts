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
 * When the wave for `run` should be planned — `planning_lead` before the run, far enough ahead that an
 * assigned driver can finish before it (FR-002).
 *
 * With the default settings (120-minute prep buffer, 45-minute lead) a 14:00 run closes same-day
 * ordering at 12:00, is planned from 13:15, and must be collected by 14:00 — so a shop has 75 minutes
 * to pick before the first planning pass, and later passes still pick up anything readied after that.
 */
export function wavePlanningTime(run: CollectionRun, leadMin: number, onDate: Date): Date {
  return new Date(collectionDeadline(run, onDate).getTime() - leadMin * 60_000);
}

/**
 * The runs whose wave is due to be planned at `now`.
 *
 * ⚠ The scheduled tick is NOT the wave (contracts/routes.md). The function wakes every few minutes and
 * plans only when a run has actually reached its planning time; the collection schedule decides when
 * work is created, not the cron expression. Every tick inside the window plans again, which is how a
 * package readied late still reaches the run (FR-004a).
 */
export function runsDueForPlanning(
  runs: readonly CollectionRun[],
  leadMin: number,
  now: Date,
): CollectionRun[] {
  return runs.filter((r) => {
    const planAt = wavePlanningTime(r, leadMin, now);
    const deadline = collectionDeadline(r, now);
    // Due once the planning moment has arrived, and still worth planning until the run itself.
    return now.getTime() >= planAt.getTime() && now.getTime() <= deadline.getTime();
  });
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
 * The next moment a collection wave will be planned, at or after `now` — or null when no run is
 * configured.
 *
 * ⚠ THIS EXISTS BECAUSE ITS ABSENCE MADE A WORKING SYSTEM LOOK BROKEN. `runDuePlanning` loops over
 * the due runs, so when none are due the loop body never executes and collection emits NO LOG LINE
 * AT ALL — every tick showed only the delivery outcome. Fourteen packages sat `ready_for_pickup`
 * overnight and nothing in CloudWatch, the console or the driver app said why, because "not yet" and
 * "nothing happened" are the same silence. The planner now reports the skip AND names this instant,
 * so the answer to "why is nobody coming?" is in the log rather than derivable only by hand.
 *
 * Looks at today's runs and tomorrow's, because at 23:30 the next window is tomorrow morning's.
 */
export function nextPlanningTime(
  runs: readonly CollectionRun[],
  leadMin: number,
  now: Date,
): Date | null {
  const tomorrow = new Date(now.getTime() + 24 * 3600_000);
  const candidates = [...runs.map((r) => wavePlanningTime(r, leadMin, now)),
                      ...runs.map((r) => wavePlanningTime(r, leadMin, tomorrow))]
    .filter((d) => d.getTime() >= now.getTime())
    .sort((a, b) => a.getTime() - b.getTime());
  return candidates[0] ?? null;
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

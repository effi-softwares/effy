// When collection must be finished for a given run — ONE definition (063).
//
// ⚠⚠ THIS IS A DELIBERATE DUPLICATE OF GO, AND THE DUPLICATION IS THE DECISION.
// `apis/core-api/internal/platform/delivery/sameday.go` answers the checkout question — "can this
// shopper still get same-day?" — with `now <= run_time - prep_buffer`. This file answers the planner's
// question over the same schedule: "when must collection for that run be complete?". Same arithmetic,
// opposite direction.
//
// The rule could not be shared: `@effy/edge-shared` is TypeScript and `SameDayCutoff` is Go, and
// Principle II's shared-package mechanism does not span runtimes. Three options were weighed
// (research R2):
//
//   · the planner asks core-api          — REJECTED: wave planning would depend on the hot path being
//                                          up, and a missed wave is SILENT. No error a shopper sees,
//                                          no alarm, just packages that do not move. 053 recorded the
//                                          same shape when an unconfigured FCM halted a whole drain.
//   · move the rule to a shared package  — IMPOSSIBLE across Go and TypeScript.
//   · a duplicate pinned by a contract test — CHOSEN.
//
// ⚠ 054 SPENT A WHOLE SLICE DELETING A RULE WRITTEN IN 14 PLACES, and this writes one in two on
// purpose. It is justified ONLY while `collection-deadline.contract.test.ts` and its Go counterpart
// share byte-identical fixtures. If that test is ever weakened, this decision is no longer justified.
//
// ⚠ DST IS NOT A DETAIL HERE. 058 found TWO real calendar bugs that only DST tests caught, including
// one that silently skipped an entire trading hour — both from rebuilding an instant out of wall-clock
// fields, which is exactly what this does. On the day DST ends 02:30 happens twice; on the day it
// starts 02:30 does not exist.

/** The platform's operating timezone. Collection runs are wall-clock facts about Effy's working day. */
export const OPERATING_TZ = "Australia/Melbourne";

/** One daily collection run, as a wall-clock time of day. Mirrors Go's `delivery.CollectionRun`. */
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
function zoneOffsetMinutes(at: Date): number {
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
function instantAtLocalTime(year: number, month: number, day: number, hour: number, minute: number): Date {
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
 * When collection for `run` must be complete, on the local date containing `onDate`.
 *
 * `run_time − prep_buffer` — the same boundary `SameDayCutoff` compares `now` against at checkout.
 */
export function collectionDeadline(run: CollectionRun, bufferMin: number, onDate: Date): Date {
  const { year, month, day } = localDateParts(onDate);
  const runAt = instantAtLocalTime(year, month, day, run.hour, run.minute);
  return new Date(runAt.getTime() - bufferMin * 60_000);
}

/**
 * When the wave for `run` should be planned — far enough ahead that an assigned driver can finish
 * before the deadline (FR-002).
 */
export function wavePlanningTime(run: CollectionRun, bufferMin: number, leadMin: number, onDate: Date): Date {
  return new Date(collectionDeadline(run, bufferMin, onDate).getTime() - leadMin * 60_000);
}

/**
 * The runs whose wave is due to be planned at `now` and has not been planned yet.
 *
 * ⚠ The scheduled tick is NOT the wave (contracts/routes.md). The function wakes every few minutes and
 * plans only when a run has actually reached its planning time; the collection schedule decides when
 * work is created, not the cron expression.
 */
export function runsDueForPlanning(
  runs: readonly CollectionRun[],
  bufferMin: number,
  leadMin: number,
  now: Date,
): CollectionRun[] {
  return runs.filter((r) => {
    const planAt = wavePlanningTime(r, bufferMin, leadMin, now);
    const deadline = collectionDeadline(r, bufferMin, now);
    // Due once the planning moment has arrived, and still worth planning until the deadline itself.
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

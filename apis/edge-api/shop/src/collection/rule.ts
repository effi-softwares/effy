// The collection facts a shop is told (099), as pure functions. Each package's run comes from
// `@effy/edge-shared/delivery` (`shopPackageRuns`, the planner's own rule); this file never sees a
// window or a delivery day — only run times.
import type { ShopPackageRun } from "@effy/edge-shared/delivery";
import type { CollectionDriver } from "@effy/shared-types";

/** This shop's pickup on one collection round. */
export interface StopFacts {
  runAt: Date;
  stopStatus: string;
  opensAt: Date | null;
  driverOnDuty: boolean;
}

/**
 * Where the run's driver is, for this shop: no round yet; a driver given it; on the way (the round is
 * open and the driver on duty); or collected from this shop. Never a name or a position.
 */
export function driverState(stop: StopFacts | undefined, now: Date): CollectionDriver {
  if (!stop) return "none";
  if (stop.stopStatus === "done") return "collected";
  if (stop.driverOnDuty && (stop.opensAt === null || stop.opensAt.getTime() <= now.getTime())) return "on_the_way";
  return "assigned";
}

/** 0 today, 1 tomorrow… in the shop's own timezone. */
export function dayOffset(at: Date, now: Date, timezone: string): number {
  const day = (d: Date) => {
    const s = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    return Date.parse(`${s}T00:00:00Z`);
  };
  return Math.round((day(at) - day(now)) / 86_400_000);
}

const sameInstant = (a: Date, b: Date) => a.getTime() === b.getTime();

export interface NextCollection {
  runAt: Date;
  stop: StopFacts | undefined;
  due: { ready: number; picking: number; started: number };
}

/** Today's runs still to come from this shop, each with its orders so far. A stop already collected is over. */
export function runsAhead(
  runs: readonly Date[],
  packages: readonly ShopPackageRun[],
  stops: readonly StopFacts[],
  now: Date,
): { runAt: Date; orders: number }[] {
  return runs
    .filter((run) => run.getTime() > now.getTime())
    .filter((run) => stops.find((s) => sameInstant(s.runAt, run))?.stopStatus !== "done")
    .sort((a, b) => a.getTime() - b.getTime())
    .map((runAt) => ({ runAt, orders: packages.filter((p) => p.runAt && sameInstant(p.runAt, runAt)).length }));
}

/**
 * The shop's next collection: the earliest run not yet collected from this shop that has one of its
 * packages due on it (or a driver still on the way to it). With nothing due, the next scheduled run.
 */
export function nextCollection(
  packages: readonly ShopPackageRun[],
  stops: readonly StopFacts[],
  nextRun: Date | null,
): NextCollection | null {
  const open = (run: Date) => {
    const stop = stops.find((s) => sameInstant(s.runAt, run));
    return !stop || stop.stopStatus !== "done";
  };
  const candidates = [
    ...packages.flatMap((p) => (p.runAt ? [p.runAt] : [])),
    ...stops.filter((s) => s.stopStatus !== "done" && s.stopStatus !== "skipped").map((s) => s.runAt),
  ].filter(open);
  candidates.sort((a, b) => a.getTime() - b.getTime());
  const runAt = candidates[0] ?? nextRun;
  if (!runAt) return null;
  const due = { ready: 0, picking: 0, started: 0 };
  for (const p of packages) {
    if (!p.runAt || !sameInstant(p.runAt, runAt)) continue;
    if (p.status === "ready_for_pickup") due.ready += 1;
    else due.picking += 1;
    if (p.status === "picking") due.started += 1;
  }
  return { runAt, stop: stops.find((s) => sameInstant(s.runAt, runAt)), due };
}

/** What a run already collected from this shop took, and what its driver found not ready. */
export interface RunTaken {
  runAt: Date;
  collected: number;
  missed: number;
  collectedAt: Date | null;
  firstPaidAt: Date | null;
}

export interface TodayRun {
  runAt: Date;
  driver: CollectionDriver;
  collectedAt: Date | null;
  firstPaidAt: Date | null;
  collected: number;
  ready: number;
  picking: number;
  waiting: number;
  missed: number;
}

/**
 * Every collection run today, earliest first: the scheduled ones, and any other run a package or a stop names today.
 * A package still at the shop counts on the run expected to take it, by how far it is; what a run already took counts
 * as collected, and what its driver found not ready as missed (those also count again on the run they go on now).
 */
export function todayRuns(input: {
  scheduled: readonly Date[];
  packages: readonly ShopPackageRun[];
  stops: readonly StopFacts[];
  taken: readonly RunTaken[];
  now: Date;
  timezone: string;
}): TodayRun[] {
  const isToday = (d: Date) => dayOffset(d, input.now, input.timezone) === 0;
  const instants = new Map<number, Date>();
  for (const d of [
    ...input.scheduled,
    ...input.taken.map((t) => t.runAt),
    ...input.stops.filter((s) => s.stopStatus !== "skipped").map((s) => s.runAt),
    ...input.packages.flatMap((p) => (p.runAt ? [p.runAt] : [])),
  ]) {
    if (isToday(d)) instants.set(d.getTime(), d);
  }
  return [...instants.values()]
    .sort((a, b) => a.getTime() - b.getTime())
    .map((runAt) => {
      const on = input.packages.filter((p) => p.runAt && sameInstant(p.runAt, runAt));
      const taken = input.taken.find((t) => sameInstant(t.runAt, runAt));
      const paid = [...on.map((p) => p.paidAt), ...(taken?.firstPaidAt ? [taken.firstPaidAt] : [])];
      const firstPaidAt = paid.length ? new Date(Math.min(...paid.map((d) => d.getTime()))) : null;
      return {
        runAt,
        driver: driverState(input.stops.find((s) => sameInstant(s.runAt, runAt)), input.now),
        collectedAt: taken?.collectedAt ?? null,
        firstPaidAt,
        collected: taken?.collected ?? 0,
        ready: on.filter((p) => p.status === "ready_for_pickup").length,
        picking: on.filter((p) => p.status === "picking").length,
        waiting: on.filter((p) => p.status !== "ready_for_pickup" && p.status !== "picking").length,
        missed: taken?.missed ?? 0,
      };
    });
}

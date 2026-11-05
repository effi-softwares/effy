// What the shop console is told about Effy's collection runs (099): Today's "Next collection" and the
// run each package is expected on. Read only; the planner decides, this only tells.
import { query } from "@effy/edge-shared";
import { collectionDeadline } from "@effy/edge-shared";
import { loadCollectionSchedule, shopPackageRuns } from "@effy/edge-shared/delivery";
import type { ShopNextCollectionDTO, ShopOrderCollectionDTO } from "@effy/shared-types";

import { readRunsDone } from "../today/board";
import { loadStops, shopTimezone } from "./repository";
import { dayOffset, driverState, nextCollection, runsAhead, todayRuns, type TodayRun } from "./rule";

/** Today's panel; null when no collection runs are set up. */
export async function nextCollectionFor(shopId: string, now = new Date()): Promise<ShopNextCollectionDTO | null> {
  const [runs, stops, timezone] = await Promise.all([shopPackageRuns(shopId, null, now, { query }), loadStops(shopId, now), shopTimezone(shopId)]);
  if (!runs.hasRuns) return null;
  const next = nextCollection(runs.packages, stops, runs.nextRun);
  if (!next) return null;
  return {
    runAt: next.runAt.toISOString(),
    dayOffset: dayOffset(next.runAt, now, timezone),
    driver: driverState(next.stop, now),
    opensAt: next.stop?.opensAt ? next.stop.opensAt.toISOString() : null,
    driverOnDuty: next.stop?.driverOnDuty ?? false,
    due: next.due,
  };
}

/** Today's runs still to come, for Today's timeline. */
export async function runsAheadFor(shopId: string, now = new Date()): Promise<{ runAt: Date; orders: number }[]> {
  const [schedule, runs, stops] = await Promise.all([
    loadCollectionSchedule(now, { query }),
    shopPackageRuns(shopId, null, now, { query }),
    loadStops(shopId, now),
  ]);
  return runsAhead(schedule.runs.map((r) => collectionDeadline(r, now)), runs.packages, stops, now);
}

/**
 * The run expected to collect each given package. Packages a courier collects from the shop, or that
 * have left it, are absent from the map — their screens show the courier's own pickup or nothing.
 */
export async function collectionsFor(
  shopId: string,
  ids: readonly string[],
  now = new Date(),
): Promise<Map<string, ShopOrderCollectionDTO>> {
  const out = new Map<string, ShopOrderCollectionDTO>();
  if (ids.length === 0) return out;
  const [runs, stops, timezone] = await Promise.all([shopPackageRuns(shopId, ids, now, { query }), loadStops(shopId, now), shopTimezone(shopId)]);
  for (const p of runs.packages) {
    const runAt = p.runAt;
    if (!runAt) continue;
    const stop = stops.find((s) => s.runAt.getTime() === runAt.getTime());
    out.set(p.id, { runAt: runAt.toISOString(), dayOffset: dayOffset(runAt, now, timezone), driver: driverState(stop, now) });
  }
  return out;
}

/** Every collection run today with this shop's orders on it, and the run each package still here goes on. */
export async function runsTodayFor(shopId: string, now = new Date()): Promise<{ runs: TodayRun[]; packageRuns: Map<string, Date | null> }> {
  const [schedule, packages, stops, taken, timezone] = await Promise.all([
    loadCollectionSchedule(now, { query }),
    shopPackageRuns(shopId, null, now, { query }),
    loadStops(shopId, now),
    readRunsDone(shopId),
    shopTimezone(shopId),
  ]);
  return {
    runs: todayRuns({
      scheduled: schedule.runs.map((r) => collectionDeadline(r, now)),
      packages: packages.packages,
      stops,
      taken,
      now,
      timezone,
    }),
    packageRuns: new Map(packages.packages.map((p) => [p.id, p.runAt])),
  };
}

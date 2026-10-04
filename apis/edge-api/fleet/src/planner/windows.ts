// Delivery windows and the wave planner (069, research R10).
//
// Until 069 a same-day package was "due today" and nothing finer: the delivery wave planned whatever
// had reached the hub, with the end of the local day as its only deadline. A customer is now sold a
// WINDOW, so the planner has two more things to respect — it must not send a van out hours early, and
// the round's deadline is the window's end.

import type { PlannablePackage } from "./types";

export interface WindowGroup {
  /** Null for packages with no window: orders placed before 069. They keep the old behaviour. */
  windowStart: Date | null;
  windowEnd: Date | null;
  packages: PlannablePackage[];
}

/** Packages grouped by the window they were sold, earliest window first, the windowless last. */
export function groupByWindow(packages: readonly PlannablePackage[]): WindowGroup[] {
  const groups = new Map<string, WindowGroup>();
  for (const p of packages) {
    const windowed = p.windowStart !== null && p.windowEnd !== null;
    const key = windowed ? `${p.windowStart!.getTime()}-${p.windowEnd!.getTime()}` : "none";
    let g = groups.get(key);
    if (!g) {
      g = { windowStart: windowed ? p.windowStart : null, windowEnd: windowed ? p.windowEnd : null, packages: [] };
      groups.set(key, g);
    }
    g.packages.push(p);
  }
  const rank = (g: WindowGroup) => (g.windowStart ? g.windowStart.getTime() : Number.POSITIVE_INFINITY);
  // ⚠ Not round ordering — that rule lives in @effy/edge-shared and this file never orders stops.
  // This decides only which WAVE is planned first, so the earliest window gets first call on drivers.
  return [...groups.values()].sort((a, b) => rank(a) - rank(b) || (a.windowEnd?.getTime() ?? 0) - (b.windowEnd?.getTime() ?? 0));
}

/**
 * Whether a window's packages should be planned yet.
 *
 * A window is planned `leadMin` before it opens — the same lead a collection wave is planned ahead
 * of its run. Before that the packages wait at the hub: a driver sent at 2 pm with a 5–7 pm delivery
 * either waits outside the customer's door or delivers three hours before anyone is home.
 *
 * A group with no window is always due (the pre-069 behaviour).
 */
export function isDue(group: WindowGroup, now: Date, leadMin: number): boolean {
  if (!group.windowStart) return true;
  return now.getTime() >= group.windowStart.getTime() - leadMin * 60_000;
}

/** When a window's packages will be planned. Null for a group with no window. */
export function plannedAt(group: WindowGroup, leadMin: number): Date | null {
  return group.windowStart ? new Date(group.windowStart.getTime() - leadMin * 60_000) : null;
}

/**
 * The deadline a round for this group works to.
 *
 * The window's end — until it has passed. ⚠ AFTER THAT, THE END OF THE DAY, NOT THE WINDOW. A
 * deadline in the past makes every driver fail the feasibility gate, and the package would then sit
 * at the hub being re-planned and re-refused until midnight. A late delivery is still a delivery
 * (FR-034); the lateness is recorded against the window, not hidden by never dispatching it.
 */
export function deadlineFor(group: WindowGroup, now: Date, endOfDay: Date): Date {
  if (!group.windowEnd) return endOfDay;
  return group.windowEnd.getTime() > now.getTime() ? group.windowEnd : endOfDay;
}

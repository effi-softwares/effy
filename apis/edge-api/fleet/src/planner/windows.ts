// Delivery windows and the wave planner (069, research R10).
//
// Until 069 a same-day package was "due today" and nothing finer: the delivery wave planned whatever
// had reached the hub, with the end of the local day as its only deadline. A customer is now sold a
// WINDOW, so the round's deadline is the window's end.
//
// ⚠ 072 REMOVED `isDue` AND `plannedAt` FROM THIS FILE. 069 kept a window's packages unassigned at
// the hub until the lead time before the window, so that no van went out hours early. The packages
// are now assigned at once; the ROUND is what waits — its opening time is `public.round_opens_at`,
// and the driver service refuses any action on it before then.

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

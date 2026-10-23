// A round's deadline is its window's end. Packages are assigned at once; the round waits for its
// opening time (`public.round_opens_at`).

import type { PlannablePackage } from "./types";

export interface WindowGroup {
  /** Null for packages with no window. */
  windowStart: Date | null;
  windowEnd: Date | null;
  packages: PlannablePackage[];
}

/** Earliest window first, windowless last. */
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
  // Decides which wave is planned first, never stop order (that is @effy/edge-shared's).
  return [...groups.values()].sort((a, b) => rank(a) - rank(b) || (a.windowEnd?.getTime() ?? 0) - (b.windowEnd?.getTime() ?? 0));
}

/** The window's end until it has passed, then the end of the day: a late delivery is still a delivery. */
export function deadlineFor(group: WindowGroup, now: Date, endOfDay: Date): Date {
  if (!group.windowEnd) return endOfDay;
  return group.windowEnd.getTime() > now.getTime() ? group.windowEnd : endOfDay;
}

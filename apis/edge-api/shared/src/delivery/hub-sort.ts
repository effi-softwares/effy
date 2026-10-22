// Where a package goes at the hub (090) — what the hub scan shows for each package, with no signal.
//
// ⚠ THE SAME DECISION AND THE SAME WORDS AS THE HUB CHECK-IN GROUPS (082, `complete.ts`): who delivers is
// `package_delivered_by`; an Effy parcel for a window today goes out now, one for a later day waits on a
// shelf; a courier parcel goes to the courier bay. The app never formats a day.

import { anyTimeDayLabel, formatArrival, melbourneDate, type HubSortKind } from "@effy/shared-types";

export interface HubSortFacts {
  deliveredBy: "effy" | "courier";
  windowStart: Date | null;
  windowEnd: Date | null;
  /** 085 — sold a day with no time ("Any time"). */
  anyTime?: boolean;
}

export function hubSortOf(f: HubSortFacts, at: Date): { kind: HubSortKind; label: string } {
  if (f.deliveredBy === "courier") return { kind: "courier_bay", label: "COURIER BAY" };
  if (!f.windowStart || !f.windowEnd) return { kind: "load_now", label: "LOAD NOW" };
  const day = melbourneDate(f.windowStart);
  const words = f.anyTime
    ? anyTimeDayLabel(day, at)
    : formatArrival(
        { promisedFrom: null, promisedTo: null, windowStart: f.windowStart.toISOString(), windowEnd: f.windowEnd.toISOString() },
        at,
      );
  return day <= melbourneDate(at)
    ? { kind: "load_now", label: `LOAD NOW · ${words}` }
    : { kind: "shelve", label: `SHELVE · ${words}` };
}

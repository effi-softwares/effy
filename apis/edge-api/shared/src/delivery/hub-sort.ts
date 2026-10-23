// Where a package goes at the hub, in the hub check-in groups' words: an Effy parcel for today goes out,
// one for a later day waits on a shelf, a courier parcel goes to the courier bay.

import { anyTimeDayLabel, formatArrival, melbourneDate, type HubSortKind } from "@effy/shared-types";

export interface HubSortFacts {
  deliveredBy: "effy" | "courier";
  windowStart: Date | null;
  windowEnd: Date | null;
  /** Sold a day with no time ("Any time"). */
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
